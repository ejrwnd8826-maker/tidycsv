/**
 * ambiguous_date_order 회귀 테스트.
 *
 * 적대적 코드리뷰에서 월/일 순서 강제 판정 로직이 의심받았으나, 재검증 결과
 * `forcesMonthFirst = (둘째 성분 > 12)` 가 정확함을 확인했다(둘째가 12 초과면
 * 월이 될 수 없으므로 월-우선(MM/DD)으로 확정). 이 검증된 동작을 못박아
 * 향후 회귀를 방지한다.
 */

import { describe, expect, it } from "vitest";
import { buildColumnProfiles } from "../infer/columns.js";
import { resolveOptions } from "../options.js";
import { tableFromRows } from "../parse/csv.js";
import type { DetectorContext, Issue } from "../types.js";
import { detectFormatIssues } from "./format.js";

function makeCtx(headers: string[], rows: string[][]): DetectorContext {
  const table = tableFromRows(headers, rows);
  return {
    table,
    columns: buildColumnProfiles(table),
    options: resolveOptions(),
  };
}

const has = (issues: Issue[], type: string): boolean =>
  issues.some((i) => i.type === type);

describe("ambiguous_date_order — 검증된 동작 고정", () => {
  it("MM/DD 와 DD/MM 가 같은 컬럼에 섞이면 충돌로 잡는다", () => {
    // 02/25/2024 = Feb 25 (월-우선 강제, 둘째 25>12)
    // 25/02/2024 = 25 Feb (일-우선 강제, 첫째 25>12)
    // 둘은 같은 날짜를 서로 다른 순서로 적은 진짜 충돌이다.
    const ctx = makeCtx(["d"], [["02/25/2024"], ["25/02/2024"]]);
    const issues = detectFormatIssues(ctx);
    expect(has(issues, "ambiguous_date_order")).toBe(true);
    const conflict = issues.find((i) => i.type === "ambiguous_date_order")!;
    expect(conflict.severity).toBe("error");
    expect(conflict.rows).toEqual([1, 0]); // day-first(row1) + month-first(row0)
  });

  it("월-우선 셀만 있고 일-우선 셀이 없으면 충돌이 아니다(자가 오탐 방지)", () => {
    // 02/25/2024 는 월-우선만 강제. 2024-01-01 은 연-선행이라 순서 모호 없음.
    // 한쪽 강제만 있으므로 ambiguous_date_order 는 나오면 안 된다.
    const ctx = makeCtx(["d"], [["02/25/2024"], ["2024-01-01"]]);
    const issues = detectFormatIssues(ctx);
    expect(has(issues, "ambiguous_date_order")).toBe(false);
    // 단, 서로 다른 포맷이므로 inconsistent_date_format 은 나와야 한다.
    expect(has(issues, "inconsistent_date_format")).toBe(true);
  });

  it("순서가 모호하지 않은 동일 포맷 컬럼은 아무 이슈도 없다", () => {
    // 모두 일-우선으로만 해석 가능(첫째 13~28 > 12) → 충돌도 혼용도 없음.
    const ctx = makeCtx(
      ["d"],
      [["13/01/2024"], ["20/02/2024"], ["28/03/2024"]],
    );
    const issues = detectFormatIssues(ctx);
    expect(has(issues, "ambiguous_date_order")).toBe(false);
    expect(has(issues, "inconsistent_date_format")).toBe(false);
  });
});
