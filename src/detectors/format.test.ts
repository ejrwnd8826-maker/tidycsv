import { describe, expect, it } from "vitest";
import { buildColumnProfiles } from "../infer/columns.js";
import { resolveOptions } from "../options.js";
import { tableFromRows } from "../parse/csv.js";
import type { DetectorContext, EngineOptions, Issue } from "../types.js";
import { detectFormatIssues } from "./format.js";

/** 테스트용 DetectorContext 헬퍼. */
function makeCtx(
  headers: string[],
  rows: string[][],
  opts?: EngineOptions,
): DetectorContext {
  const table = tableFromRows(headers, rows);
  return {
    table,
    columns: buildColumnProfiles(table),
    options: resolveOptions(opts),
  };
}

/** 특정 type 의 이슈만 추린다. */
function byType(issues: Issue[], type: string): Issue[] {
  return issues.filter((i) => i.type === type);
}

// 비가시/특수문자는 소스에 리터럴로 넣지 않고 코드로 생성한다.
const NBSP = String.fromCharCode(0x00a0); // U+00A0 NBSP
const FULLWIDTH_SPACE = String.fromCharCode(0x3000); // U+3000 전각공백
const UNIT_SEP = String.fromCharCode(31); // C0 제어문자(0x1F)

describe("detectFormatIssues — 기본/옵션", () => {
  it("깨끗한 컬럼은 이슈를 만들지 않는다", () => {
    const ctx = makeCtx(
      ["id", "name", "amount", "date"],
      [
        ["1", "alpha", "100", "2024-01-01"],
        ["2", "beta", "200", "2024-01-02"],
        ["3", "gamma", "300", "2024-01-03"],
      ],
    );
    expect(detectFormatIssues(ctx)).toEqual([]);
  });

  it("format.enabled=false 면 빈 배열을 반환한다", () => {
    const ctx = makeCtx(
      ["name"],
      [["  spaced  "], ["double  space"]],
      { format: { enabled: false } },
    );
    expect(detectFormatIssues(ctx)).toEqual([]);
  });

  it("모든 이슈의 category 는 항상 format 이다", () => {
    const ctx = makeCtx(
      ["d", "amt"],
      [
        ["2024-01-01", "$100"],
        ["02/03/2024", "200"],
      ],
    );
    const issues = detectFormatIssues(ctx);
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) expect(i.category).toBe("format");
  });
});

describe("detectFormatIssues — 공백/제어문자(whitespace_format)", () => {
  it("앞뒤 공백·이중 공백을 감지한다", () => {
    const ctx = makeCtx(
      ["name"],
      [
        ["clean"],
        ["  leading"],
        ["trailing  "],
        ["double  space"],
      ],
    );
    const ws = byType(detectFormatIssues(ctx), "whitespace_format");
    expect(ws).toHaveLength(1);
    const issue = ws[0] as Issue;
    expect(issue.severity).toBe("warning");
    expect(issue.column).toBe(0);
    expect(issue.columnName).toBe("name");
    // clean(행0) 제외, 행 1·2·3
    expect(issue.rows).toEqual([1, 2, 3]);
    expect(issue.data?.count).toBe(3);
  });

  it("NBSP·전각공백·제어문자를 감지한다", () => {
    const ctx = makeCtx(
      ["name"],
      [
        [`a${NBSP}b`],
        [`c${FULLWIDTH_SPACE}d`],
        [`e${UNIT_SEP}f`],
        ["normal"],
      ],
    );
    const ws = byType(detectFormatIssues(ctx), "whitespace_format");
    expect(ws).toHaveLength(1);
    expect((ws[0] as Issue).rows).toEqual([0, 1, 2]);
  });

  it("빈 셀은 공백 이슈에서 제외한다", () => {
    const ctx = makeCtx(
      ["name"],
      [[""], ["   "], ["ok"]],
    );
    // "   " 는 isBlank=true 이므로 제외된다.
    const ws = byType(detectFormatIssues(ctx), "whitespace_format");
    expect(ws).toHaveLength(0);
  });

  it("examples 는 최대 50개로 제한한다", () => {
    const rows: string[][] = [];
    for (let i = 0; i < 60; i++) rows.push([`  v${i}  `]);
    const ctx = makeCtx(["name"], rows);
    const ws = byType(detectFormatIssues(ctx), "whitespace_format")[0] as Issue;
    expect(ws.rows).toHaveLength(60);
    expect(ws.data?.count).toBe(60);
    const examples = ws.data?.examples as unknown[];
    expect(examples).toHaveLength(50);
  });
});

describe("detectFormatIssues — 날짜 포맷 혼용(inconsistent_date_format)", () => {
  it("YYYY-MM-DD 와 DD/MM/YYYY 혼용을 감지한다", () => {
    const ctx = makeCtx(
      ["d"],
      [
        ["2024-01-15"],
        ["15/01/2024"],
        ["2024-02-20"],
      ],
    );
    const idf = byType(detectFormatIssues(ctx), "inconsistent_date_format");
    expect(idf).toHaveLength(1);
    const issue = idf[0] as Issue;
    expect(issue.severity).toBe("warning");
    const formats = issue.data?.formats as string[];
    expect(formats).toContain("YYYY-MM-DD");
    expect(formats).toContain("DD/MM/YYYY");
    // 날짜로 인식된 행 전부
    expect(issue.rows).toEqual([0, 1, 2]);
    const counts = issue.data?.counts as Record<string, number>;
    expect(counts["YYYY-MM-DD"]).toBe(2);
    expect(counts["DD/MM/YYYY"]).toBe(1);
  });

  it("같은 포맷만 있으면 혼용 이슈가 없다", () => {
    const ctx = makeCtx(
      ["d"],
      [["2024-01-15"], ["2024-02-20"], ["2024-03-25"]],
    );
    const idf = byType(detectFormatIssues(ctx), "inconsistent_date_format");
    expect(idf).toHaveLength(0);
  });

  it("날짜로 인식되는 셀이 컬럼 대표타입이 아니어도(문자열 컬럼) 검사한다", () => {
    // 문자열이 다수라 컬럼 type 은 string 이지만, 날짜 셀 2개 이상이면 혼용 검사 수행
    const ctx = makeCtx(
      ["note"],
      [
        ["hello"],
        ["world"],
        ["foo"],
        ["2024-01-15"],
        ["15/01/2024"],
      ],
    );
    const col = ctx.columns[0] as { type: string };
    expect(col.type).toBe("string");
    const idf = byType(detectFormatIssues(ctx), "inconsistent_date_format");
    expect(idf).toHaveLength(1);
    expect((idf[0] as Issue).rows).toEqual([3, 4]);
  });

  it("날짜 셀이 1개뿐이면 혼용 검사를 하지 않는다", () => {
    const ctx = makeCtx(
      ["note"],
      [["hello"], ["2024-01-15"], ["world"]],
    );
    const idf = byType(detectFormatIssues(ctx), "inconsistent_date_format");
    expect(idf).toHaveLength(0);
  });
});

describe("detectFormatIssues — 월/일 순서 충돌(ambiguous_date_order)", () => {
  it("day-first 강제 셀과 month-first 강제 셀이 섞이면 error 이슈", () => {
    // 25/02/2024 -> 첫째 25>12 -> day-first 강제
    // 02/25/2024 -> 둘째 25>12 -> month-first 강제
    const ctx = makeCtx(
      ["d"],
      [
        ["25/02/2024"],
        ["02/25/2024"],
        ["01/06/2024"],
      ],
    );
    const ado = byType(detectFormatIssues(ctx), "ambiguous_date_order");
    expect(ado).toHaveLength(1);
    const issue = ado[0] as Issue;
    expect(issue.severity).toBe("error");
    expect(issue.rows).toEqual([0, 1]);
    const examples = issue.data?.examples as Array<{ order: string }>;
    expect(examples).toHaveLength(2);
    expect(examples.map((e) => e.order).sort()).toEqual([
      "day-first",
      "month-first",
    ]);
  });

  it("모든 셀이 일관되게 day-first 강제면 순서 충돌 없음", () => {
    // 둘 다 첫째>12 -> 모두 day-first. 충돌 아님.
    const ctx = makeCtx(
      ["d"],
      [["25/02/2024"], ["31/01/2024"]],
    );
    const ado = byType(detectFormatIssues(ctx), "ambiguous_date_order");
    expect(ado).toHaveLength(0);
  });

  it("연-선행(YYYY-MM-DD)은 순서가 명확하므로 충돌 검사 대상 아님", () => {
    const ctx = makeCtx(
      ["d"],
      [["2024-01-25"], ["2024-12-31"]],
    );
    const ado = byType(detectFormatIssues(ctx), "ambiguous_date_order");
    expect(ado).toHaveLength(0);
  });
});

describe("detectFormatIssues — 숫자 포맷 혼용(inconsistent_number_format)", () => {
  it("통화기호 혼용을 감지한다(info)", () => {
    const ctx = makeCtx(
      ["amount"],
      [["$100"], ["200"], ["$300"]],
    );
    const col = ctx.columns[0] as { type: string };
    expect(["integer", "decimal"]).toContain(col.type);
    const inf = byType(detectFormatIssues(ctx), "inconsistent_number_format");
    expect(inf).toHaveLength(1);
    const issue = inf[0] as Issue;
    expect(issue.severity).toBe("info");
    expect(issue.data?.withCurrency).toBe(2);
    expect(issue.data?.withoutCurrency).toBe(1);
    expect(issue.data?.variants).toContain("currency-symbol");
  });

  it("천단위 구분자 혼용을 감지한다", () => {
    const ctx = makeCtx(
      ["amount"],
      [["1,000"], ["2000"], ["3,500"]],
    );
    const inf = byType(detectFormatIssues(ctx), "inconsistent_number_format");
    expect(inf).toHaveLength(1);
    const issue = inf[0] as Issue;
    expect(issue.data?.withGrouping).toBe(2);
    expect(issue.data?.withoutGrouping).toBe(1);
    expect(issue.data?.variants).toContain("thousands-separator");
  });

  it("일관된 숫자 포맷이면 이슈 없음", () => {
    const ctx = makeCtx(
      ["amount"],
      [["100"], ["200"], ["300"]],
    );
    const inf = byType(detectFormatIssues(ctx), "inconsistent_number_format");
    expect(inf).toHaveLength(0);
  });

  it("숫자 컬럼이 아니면 숫자 포맷 검사를 하지 않는다", () => {
    // 문자열 컬럼: 통화기호가 섞여 있어도 숫자 포맷 검사 대상 아님
    const ctx = makeCtx(
      ["label"],
      [["$alpha"], ["beta"], ["gamma"]],
    );
    const inf = byType(detectFormatIssues(ctx), "inconsistent_number_format");
    expect(inf).toHaveLength(0);
  });

  it("통화기호와 천단위가 동시에 섞이면 variants 에 둘 다 들어간다", () => {
    const ctx = makeCtx(
      ["amount"],
      [["$1,000"], ["2000"], ["500"]],
    );
    const inf = byType(detectFormatIssues(ctx), "inconsistent_number_format")[0] as Issue;
    const variants = inf.data?.variants as string[];
    expect(variants).toContain("currency-symbol");
    expect(variants).toContain("thousands-separator");
  });
});

describe("detectFormatIssues — 통합", () => {
  it("한 컬럼에서 공백+날짜혼용이 동시에 잡힐 수 있다", () => {
    const ctx = makeCtx(
      ["d"],
      [
        ["2024-01-15"],
        ["  15/01/2024  "], // 공백 + 다른 날짜 포맷
        ["2024-02-20"],
      ],
    );
    const issues = detectFormatIssues(ctx);
    expect(byType(issues, "whitespace_format")).toHaveLength(1);
    expect(byType(issues, "inconsistent_date_format")).toHaveLength(1);
  });
});
