import { describe, expect, it } from "vitest";
import { tableFromRows } from "../parse/csv.js";
import { buildColumnProfiles } from "../infer/columns.js";
import { resolveOptions } from "../options.js";
import type { DetectorContext, EngineOptions, Issue } from "../types.js";
import { detectOutliers } from "./outliers.js";

/** 테스트용 DetectorContext 생성 헬퍼. */
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

/** 특정 type 의 이슈를 추출. */
function byType(issues: Issue[], type: string): Issue[] {
  return issues.filter((i) => i.type === type);
}

describe("detectOutliers — 옵션 게이트", () => {
  it("enabled=false 면 빈 배열을 반환한다", () => {
    const ctx = makeCtx(
      ["age"],
      [["10"], ["20"], ["30"], ["40"]],
      { outliers: { enabled: false } },
    );
    expect(detectOutliers(ctx)).toEqual([]);
  });

  it("모든 이슈는 category 가 outlier 다", () => {
    const ctx = makeCtx(
      ["age"],
      [["10"], ["20"], [""], ["abc"]],
    );
    const issues = detectOutliers(ctx);
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(i.category).toBe("outlier");
    }
  });
});

describe("detectOutliers — 결측치", () => {
  it("일부만 비면 missing_value(warning) 를 방출한다", () => {
    const ctx = makeCtx(
      ["name"],
      [["alice"], [""], ["bob"], [""]],
    );
    const missing = byType(detectOutliers(ctx), "missing_value");
    expect(missing).toHaveLength(1);
    const issue = missing[0]!;
    expect(issue.severity).toBe("warning");
    expect(issue.rows).toEqual([1, 3]);
    expect(issue.data?.count).toBe(2);
    expect(issue.columnName).toBe("name");
  });

  it("컬럼 전체가 비면 empty_column(info) 를 방출한다", () => {
    const ctx = makeCtx(
      ["filled", "blank"],
      [["a", ""], ["b", "   "], ["c", ""]],
    );
    const issues = detectOutliers(ctx);
    const emptyCol = byType(issues, "empty_column");
    expect(emptyCol).toHaveLength(1);
    expect(emptyCol[0]!.severity).toBe("info");
    expect(emptyCol[0]!.columnName).toBe("blank");
    // 전부 빈 컬럼은 missing_value 가 아니라 empty_column 으로만.
    expect(byType(issues, "missing_value")).toHaveLength(0);
  });

  it("flagEmpty=false 면 결측치를 검사하지 않는다", () => {
    const ctx = makeCtx(
      ["name"],
      [["alice"], [""], ["bob"]],
      { outliers: { flagEmpty: false } },
    );
    const issues = detectOutliers(ctx);
    expect(byType(issues, "missing_value")).toHaveLength(0);
    expect(byType(issues, "empty_column")).toHaveLength(0);
  });

  it("빈 셀이 없으면 결측 이슈가 없다", () => {
    const ctx = makeCtx(
      ["name"],
      [["alice"], ["bob"], ["carol"]],
    );
    expect(byType(detectOutliers(ctx), "missing_value")).toHaveLength(0);
  });
});

describe("detectOutliers — 타입 불일치", () => {
  it("숫자 컬럼에 섞인 문자 셀을 type_mismatch 로 잡는다", () => {
    // 강한 integer 컬럼(4/5 = 0.8 >= 0.7)에 문자 1개 혼입.
    const ctx = makeCtx(
      ["amount"],
      [["10"], ["20"], ["oops"], ["30"], ["40"]],
    );
    const mm = byType(detectOutliers(ctx), "type_mismatch");
    expect(mm).toHaveLength(1);
    const issue = mm[0]!;
    expect(issue.severity).toBe("warning");
    expect(issue.rows).toEqual([2]);
    expect(issue.data?.expectedType).toBe("integer");
    const examples = issue.data?.examples as Array<{
      row: number;
      value: string;
      found: string;
    }>;
    expect(examples[0]).toEqual({ row: 2, value: "oops", found: "string" });
  });

  it("integer 와 decimal 은 서로 호환되어 불일치가 아니다", () => {
    // 정수가 다수라 컬럼 타입은 integer, decimal 셀은 호환 처리.
    const ctx = makeCtx(
      ["amount"],
      [["10"], ["20"], ["30"], ["3.14"]],
    );
    expect(byType(detectOutliers(ctx), "type_mismatch")).toHaveLength(0);
  });

  it("약한 타입(신뢰도 < 0.7) 컬럼은 타입 불일치를 검사하지 않는다", () => {
    // string 다수라 컬럼 타입이 string → 강한 타입 아님.
    const ctx = makeCtx(
      ["mixed"],
      [["foo"], ["bar"], ["baz"], ["42"]],
    );
    expect(byType(detectOutliers(ctx), "type_mismatch")).toHaveLength(0);
  });

  it("flagTypeMismatch=false 면 타입 불일치를 검사하지 않는다", () => {
    const ctx = makeCtx(
      ["amount"],
      [["10"], ["20"], ["oops"], ["30"], ["40"]],
      { outliers: { flagTypeMismatch: false } },
    );
    expect(byType(detectOutliers(ctx), "type_mismatch")).toHaveLength(0);
  });

  it("date 컬럼에 비-날짜 셀을 type_mismatch 로 잡는다", () => {
    const ctx = makeCtx(
      ["d"],
      [["2024-01-01"], ["2024-02-01"], ["2024-03-01"], ["notadate"]],
    );
    const mm = byType(detectOutliers(ctx), "type_mismatch");
    expect(mm).toHaveLength(1);
    expect(mm[0]!.data?.expectedType).toBe("date");
    expect(mm[0]!.rows).toEqual([3]);
  });
});

describe("detectOutliers — 범위 위반", () => {
  it("min/max 를 벗어난 셀을 range_violation(error) 로 잡는다", () => {
    const ctx = makeCtx(
      ["score"],
      [["50"], ["-5"], ["80"], ["150"], ["100"]],
      { outliers: { ranges: [{ column: "score", min: 0, max: 100 }] } },
    );
    const rv = byType(detectOutliers(ctx), "range_violation");
    expect(rv).toHaveLength(1);
    const issue = rv[0]!;
    expect(issue.severity).toBe("error");
    expect(issue.rows).toEqual([1, 3]); // -5(미만), 150(초과)
    expect(issue.data?.min).toBe(0);
    expect(issue.data?.max).toBe(100);
    const examples = issue.data?.examples as Array<{
      row: number;
      value: number;
    }>;
    expect(examples).toEqual([
      { row: 1, value: -5 },
      { row: 3, value: 150 },
    ]);
  });

  it("존재하지 않는 컬럼 규칙은 무시한다", () => {
    const ctx = makeCtx(
      ["score"],
      [["50"], ["80"]],
      { outliers: { ranges: [{ column: "missing", min: 0 }] } },
    );
    expect(byType(detectOutliers(ctx), "range_violation")).toHaveLength(0);
  });

  it("min 만 지정하면 하한만 검사한다", () => {
    const ctx = makeCtx(
      ["score"],
      [["50"], ["-1"], ["999"]],
      { outliers: { ranges: [{ column: "score", min: 0 }] } },
    );
    const rv = byType(detectOutliers(ctx), "range_violation");
    expect(rv).toHaveLength(1);
    expect(rv[0]!.rows).toEqual([1]); // 999 는 상한 없으므로 통과
  });

  it("통화기호가 붙은 셀도 parseNumber 로 해석해 범위 검사한다", () => {
    // 소스에 통화기호를 리터럴로 넣지 않고 fromCharCode 로 생성($=0x24).
    const dollar = String.fromCharCode(0x24);
    const ctx = makeCtx(
      ["price"],
      [[`${dollar}1,500`], [`${dollar}50`]],
      { outliers: { ranges: [{ column: "price", max: 1000 }] } },
    );
    const rv = byType(detectOutliers(ctx), "range_violation");
    expect(rv).toHaveLength(1);
    expect(rv[0]!.rows).toEqual([0]); // 1500 > 1000
    const examples = rv[0]!.data?.examples as Array<{
      row: number;
      value: number;
    }>;
    expect(examples[0]).toEqual({ row: 0, value: 1500 });
  });
});

describe("detectOutliers — 통계적 이상치", () => {
  it("IQR 로 극단값을 statistical_outlier(info) 로 잡는다", () => {
    // 평범한 값들 + 명백한 극단값 1000.
    const rows = [
      ["10"],
      ["11"],
      ["12"],
      ["13"],
      ["14"],
      ["15"],
      ["1000"],
    ];
    const ctx = makeCtx(["v"], rows);
    const so = byType(detectOutliers(ctx), "statistical_outlier");
    expect(so).toHaveLength(1);
    const issue = so[0]!;
    expect(issue.severity).toBe("info");
    expect(issue.rows).toEqual([6]); // 1000 이 마지막 행
    expect(["iqr", "both"]).toContain(issue.data?.method);
    const bounds = issue.data?.bounds as { lower: number; upper: number };
    expect(bounds.upper).toBeLessThan(1000);
  });

  it("z-score 단독으로 이상치를 잡는다(IQR 비활성 경계)", () => {
    // IQR 이 0이 되도록 값 대부분을 동일하게 두고, 한 값만 멀리 둔다.
    // q1=q3=5 → iqr=0 → IQR 미사용, stdev>0 → z-score 만 작동.
    const rows = [
      ["5"],
      ["5"],
      ["5"],
      ["5"],
      ["5"],
      ["5"],
      ["5"],
      ["5"],
      ["5"],
      ["100"],
    ];
    const ctx = makeCtx(["v"], rows, { outliers: { zScoreThreshold: 2 } });
    const so = byType(detectOutliers(ctx), "statistical_outlier");
    expect(so).toHaveLength(1);
    expect(so[0]!.data?.method).toBe("zscore");
    expect(so[0]!.rows).toEqual([9]);
  });

  it("상수 컬럼(iqr=0, stdev=0)은 이상치를 0개 방출한다", () => {
    const ctx = makeCtx(
      ["v"],
      [["7"], ["7"], ["7"], ["7"], ["7"]],
    );
    expect(byType(detectOutliers(ctx), "statistical_outlier")).toHaveLength(0);
  });

  it("count<4 면 통계적 이상치를 검사하지 않는다", () => {
    const ctx = makeCtx(["v"], [["1"], ["2"], ["100"]]);
    expect(byType(detectOutliers(ctx), "statistical_outlier")).toHaveLength(0);
  });

  it("숫자 컬럼이 아니면 통계적 이상치를 검사하지 않는다", () => {
    const ctx = makeCtx(
      ["name"],
      [["alice"], ["bob"], ["carol"], ["dave"]],
    );
    expect(byType(detectOutliers(ctx), "statistical_outlier")).toHaveLength(0);
  });

  it("정상 분포에서는 이상치를 방출하지 않는다", () => {
    const rows = [
      ["10"],
      ["11"],
      ["12"],
      ["13"],
      ["14"],
      ["15"],
      ["16"],
    ];
    const ctx = makeCtx(["v"], rows);
    expect(byType(detectOutliers(ctx), "statistical_outlier")).toHaveLength(0);
  });

  it("examples 는 최대 50개로 제한된다", () => {
    // 정상값 200개(0..19 반복, 다수) + 극단값 55개(전체의 약 21.6%, 소수) → 이상치 55개.
    // 극단값이 25% 미만이어야 q3 가 정상 범위에 남아 IQR 로 이상치가 잡힌다
    // (과반이 극단값이면 그게 '정상'이 되어 통계적으로 이상치가 아님 — 올바른 동작).
    const rows: string[][] = [];
    for (let i = 0; i < 200; i++) rows.push([String(i % 20)]);
    for (let i = 0; i < 55; i++) rows.push(["100000"]);
    const ctx = makeCtx(["v"], rows);
    const so = byType(detectOutliers(ctx), "statistical_outlier");
    expect(so).toHaveLength(1);
    const examples = so[0]!.data?.examples as unknown[];
    expect(examples.length).toBeLessThanOrEqual(50);
    // rows 자체는 50개 제한 없이 전부 포함.
    expect(so[0]!.rows!.length).toBe(55);
  });
});
