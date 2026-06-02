import { describe, expect, it } from "vitest";
import { buildColumnProfiles } from "../infer/columns.js";
import { tableFromRows } from "../parse/csv.js";
import type { ColumnProfile } from "../types.js";
import {
  fixDateFormat,
  fixDuplicates,
  fixNumberFormat,
  fixWhitespace,
} from "./fixers.js";

const NBSP = String.fromCharCode(0x00a0);

function build(
  headers: string[],
  rows: string[][],
): { rows: string[][]; columns: ColumnProfile[] } {
  const table = tableFromRows(headers, rows);
  return { rows: table.rows, columns: buildColumnProfiles(table) };
}

describe("fixWhitespace", () => {
  it("앞뒤·이중·비표준 공백을 정규화한다", () => {
    const { rows, columns } = build(
      ["name"],
      [[" Alice "], ["Bob"], [`a${NBSP}b`], ["a  b"]],
    );
    const changes = fixWhitespace(rows, columns);
    const byRow = new Map(changes.map((c) => [c.row, c.after]));
    expect(byRow.get(0)).toBe("Alice");
    expect(byRow.get(2)).toBe("a b");
    expect(byRow.get(3)).toBe("a b");
    expect(byRow.has(1)).toBe(false); // "Bob" 변경 없음
    expect(changes.every((c) => c.fixer === "whitespace")).toBe(true);
  });

  it("깨끗한 값은 변경하지 않는다", () => {
    const { rows, columns } = build(["c"], [["clean"], ["value"]]);
    expect(fixWhitespace(rows, columns)).toEqual([]);
  });
});

describe("fixNumberFormat", () => {
  it("숫자형 컬럼의 통화·천단위를 정규화한다", () => {
    const { rows, columns } = build(
      ["amount", "label"],
      [
        ["$1,200", "$1,200"],
        ["1000", "keep"],
        ["1.234,56", "x"],
      ],
    );
    const changes = fixNumberFormat(rows, columns);
    // label 컬럼(문자형)은 건드리지 않는다.
    expect(changes.every((c) => c.columnName === "amount")).toBe(true);
    const byRow = new Map(changes.map((c) => [c.row, c.after]));
    expect(byRow.get(0)).toBe("1200");
    expect(byRow.get(2)).toBe("1234.56");
    expect(byRow.has(1)).toBe(false); // "1000" 이미 정규형
  });

  it("숫자 컬럼 내 파싱 불가 셀은 건드리지 않는다", () => {
    // 대부분 숫자라 컬럼 타입은 integer 지만 'N/A' 는 파싱 불가
    const { rows, columns } = build(
      ["amount"],
      [["100"], ["200"], ["N/A"], ["300"]],
    );
    const changes = fixNumberFormat(rows, columns);
    expect(changes).toEqual([]); // 100/200/300 정규형, N/A 무시
  });
});

describe("fixDateFormat", () => {
  it("날짜형 컬럼을 ISO 로 정규화한다(모호하지 않은 것만)", () => {
    const { rows, columns } = build(
      ["d"],
      [["2024/03/07"], ["13/02/2024"]],
    );
    const changes = fixDateFormat(rows, columns, "YYYY-MM-DD");
    const byRow = new Map(changes.map((c) => [c.row, c.after]));
    expect(byRow.get(0)).toBe("2024-03-07");
    expect(byRow.get(1)).toBe("2024-02-13"); // 13>12 → 일-우선 확정
  });

  it("모호한 날짜는 변환하지 않는다", () => {
    const { rows, columns } = build(["d"], [["05/06/2024"], ["07/08/2024"]]);
    expect(fixDateFormat(rows, columns, "YYYY-MM-DD")).toEqual([]);
  });
});

describe("fixDuplicates", () => {
  it("완전히 동일한 행을 첫 occurrence 만 남기고 표시한다", () => {
    const { rows } = build(
      ["a", "b"],
      [
        ["1", "x"],
        ["2", "y"],
        ["1", "x"],
        ["1", "x"],
      ],
    );
    const removals = fixDuplicates(rows);
    expect(removals.map((r) => r.row)).toEqual([2, 3]);
    expect(removals.every((r) => r.keptRow === 0)).toBe(true);
  });

  it("중복이 없으면 빈 배열", () => {
    const { rows } = build(["a"], [["1"], ["2"], ["3"]]);
    expect(fixDuplicates(rows)).toEqual([]);
  });

  it("셀에 제어문자(SOH)가 있어도 키 충돌로 잘못 병합하지 않는다", () => {
    const SOH = String.fromCharCode(1);
    // ["x","y"] 와 ["xy",""] 는 서로 다른 행 → 병합되면 안 됨
    const { rows } = build(
      ["a", "b"],
      [
        ["x", "y"],
        [`x${SOH}y`, ""],
      ],
    );
    expect(fixDuplicates(rows)).toEqual([]);
  });
});
