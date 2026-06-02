import { describe, expect, it } from "vitest";
import { buildColumnProfiles } from "../infer/columns.js";
import { resolveOptions } from "../options.js";
import { tableFromRows } from "../parse/csv.js";
import type { DetectorContext, EngineOptions } from "../types.js";
import { detectIntegrity } from "./integrity.js";

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

// 비가시/특수문자 생성 헬퍼 (소스에 리터럴 금지).
const NBSP = String.fromCharCode(0x00a0);

describe("detectIntegrity — enabled 플래그", () => {
  it("enabled=false 면 어떤 규칙이 있어도 [] 를 반환한다", () => {
    const ctx = makeCtx(
      ["a", "b", "total"],
      [
        ["1", "2", "3"],
        ["10", "20", "999"], // 명백한 불일치
      ],
      {
        integrity: {
          enabled: false,
          sumChecks: [{ components: ["a", "b"], total: "total" }],
        },
      },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("규칙이 하나도 없으면 [] 를 반환한다", () => {
    const ctx = makeCtx(["a", "b"], [["1", "2"]]);
    expect(detectIntegrity(ctx)).toEqual([]);
  });
});

describe("detectIntegrity — 합계 검증(sumChecks)", () => {
  it("모든 행이 합계와 일치하면 이슈가 없다", () => {
    const ctx = makeCtx(
      ["qty", "tax", "total"],
      [
        ["100", "10", "110"],
        ["50", "5", "55"],
        ["0", "0", "0"],
      ],
      { integrity: { sumChecks: [{ components: ["qty", "tax"], total: "total" }] } },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("합계 불일치 행을 하나의 sum_mismatch 이슈로 묶는다", () => {
    const ctx = makeCtx(
      ["qty", "tax", "total"],
      [
        ["100", "10", "110"], // ok
        ["50", "5", "60"], // 위반: expected 55
        ["1", "1", "9"], // 위반: expected 2
      ],
      {
        integrity: {
          sumChecks: [{ components: ["qty", "tax"], total: "total", label: "Invoice total" }],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.category).toBe("integrity");
    expect(issue.type).toBe("sum_mismatch");
    expect(issue.severity).toBe("error");
    expect(issue.rows).toEqual([1, 2]);
    expect(issue.data?.label).toBe("Invoice total");
    expect(issue.data?.tolerance).toBe(0.01);
    const examples = issue.data?.examples as Array<{
      row: number;
      expected: number;
      actual: number;
      diff: number;
    }>;
    expect(examples[0]).toMatchObject({ row: 1, expected: 55, actual: 60 });
  });

  it("total 셀이 비었거나 파싱 불가하면 그 행을 스킵한다", () => {
    const ctx = makeCtx(
      ["a", "b", "total"],
      [
        ["1", "2", ""], // total 빈칸 -> 스킵
        ["1", "2", "n/a"], // total 파싱 불가 -> 스킵
        ["1", "2", "3"], // ok
      ],
      { integrity: { sumChecks: [{ components: ["a", "b"], total: "total" }] } },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("component 빈 셀은 0, 파싱 실패 셀도 0 취급하고 anyParseFailure 를 표시한다", () => {
    const ctx = makeCtx(
      ["a", "b", "total"],
      [
        ["", "5", "5"], // 빈칸=0 -> 0+5=5 ok
        ["junk", "5", "5"], // 파싱실패=0 -> 0+5=5 ok, 단 실패 기록
      ],
      { integrity: { sumChecks: [{ components: ["a", "b"], total: "total" }] } },
    );
    // 둘 다 합계상 일치하므로 이슈 없음.
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("미존재 컬럼이 있으면 integrity_unknown_column 으로 규칙을 스킵한다", () => {
    const ctx = makeCtx(
      ["a", "total"],
      [["1", "999"]],
      {
        integrity: {
          sumChecks: [{ components: ["a", "missing"], total: "total", label: "L" }],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.type).toBe("integrity_unknown_column");
    expect(issue.severity).toBe("error");
    expect(issue.data?.missing).toEqual(["missing"]);
    // 규칙이 스킵되었으므로 sum_mismatch 는 방출되지 않는다.
    expect(issues.some((i) => i.type === "sum_mismatch")).toBe(false);
  });

  it("부동소수 오차(0.1+0.2)는 기본 tolerance 로 흡수된다", () => {
    const ctx = makeCtx(
      ["a", "b", "total"],
      [["0.1", "0.2", "0.3"]], // 0.1+0.2 = 0.30000000000000004
      { integrity: { sumChecks: [{ components: ["a", "b"], total: "total" }] } },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("tolerance 를 좁히면 미세 차이도 위반으로 잡는다", () => {
    const ctx = makeCtx(
      ["a", "b", "total"],
      [["10", "10", "20.005"]], // diff 0.005
      {
        integrity: {
          sumChecks: [
            { components: ["a", "b"], total: "total", tolerance: 0.001 },
          ],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("sum_mismatch");
    expect(issues[0]!.rows).toEqual([0]);
  });

  it("통화기호·천단위 구분자가 있어도 parseNumber 로 합계를 검증한다", () => {
    const ctx = makeCtx(
      ["price", "fee", "total"],
      [["$1,000.00", "$50.00", "$1,050.00"]],
      { integrity: { sumChecks: [{ components: ["price", "fee"], total: "total" }] } },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });
});

describe("detectIntegrity — 잔액 검증(balanceChecks)", () => {
  it("opening 지정 시 정상 잔액 흐름은 이슈가 없다", () => {
    const ctx = makeCtx(
      ["amount", "balance"],
      [
        ["100", "1100"], // 1000 + 100
        ["-50", "1050"], // 1100 - 50
        ["200", "1250"], // 1050 + 200
      ],
      {
        integrity: {
          balanceChecks: [{ amount: "amount", balance: "balance", opening: 1000 }],
        },
      },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("opening 미지정 시 첫 행에서 역산하여 검증한다", () => {
    const ctx = makeCtx(
      ["amount", "balance"],
      [
        ["100", "1100"], // opening = 1100-100 = 1000; expected 1100 ok
        ["50", "1150"], // 1100+50 ok
      ],
      {
        integrity: {
          balanceChecks: [{ amount: "amount", balance: "balance" }],
        },
      },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("한 지점에서 잔액이 끊기면 그 행만 위반으로 잡고 전파하지 않는다", () => {
    const ctx = makeCtx(
      ["amount", "balance"],
      [
        ["100", "1100"], // ok (opening 1000)
        ["100", "1500"], // 위반: expected 1200, actual 1500
        ["100", "1600"], // 1500+100 = 1600 ok (prev 가 실제값 1500 으로 갱신됨)
      ],
      {
        integrity: {
          balanceChecks: [{ amount: "amount", balance: "balance", opening: 1000 }],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.type).toBe("balance_mismatch");
    expect(issue.severity).toBe("error");
    expect(issue.rows).toEqual([1]); // 한 지점만
    const examples = issue.data?.examples as NumericExampleLike[];
    expect(examples[0]).toMatchObject({ row: 1, expected: 1200, actual: 1500 });
  });

  it("파싱 실패 행은 스킵하되 prev 를 유지한다", () => {
    const ctx = makeCtx(
      ["amount", "balance"],
      [
        ["100", "1100"], // ok (opening 1000)
        ["x", "garbage"], // 파싱실패 -> 스킵, prev=1100 유지
        ["100", "1200"], // 1100+100 = 1200 ok
      ],
      {
        integrity: {
          balanceChecks: [{ amount: "amount", balance: "balance", opening: 1000 }],
        },
      },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("미존재 잔액 컬럼은 integrity_unknown_column 으로 스킵한다", () => {
    const ctx = makeCtx(
      ["amount"],
      [["100"]],
      {
        integrity: {
          balanceChecks: [{ amount: "amount", balance: "nope", label: "Ledger" }],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("integrity_unknown_column");
    expect(issues[0]!.data?.missing).toEqual(["nope"]);
  });
});

describe("detectIntegrity — 참조 무결성(referentialChecks)", () => {
  it("참조 컬럼의 값 집합에 모두 존재하면 이슈가 없다", () => {
    const ctx = makeCtx(
      ["order_id", "customer", "valid_customer"],
      [
        ["1", "alice", "alice"],
        ["2", "bob", "bob"],
        ["3", "alice", "carol"],
      ],
      {
        integrity: {
          referentialChecks: [
            { column: "customer", references: { column: "valid_customer" } },
          ],
        },
      },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("참조 집합에 없는 orphan 값을 위반으로 잡는다", () => {
    const ctx = makeCtx(
      ["customer", "valid_customer"],
      [
        ["alice", "alice"],
        ["zzz", "bob"], // orphan: zzz 는 valid_customer 집합에 없음
        ["carol", "carol"],
      ],
      {
        integrity: {
          referentialChecks: [
            {
              column: "customer",
              references: { column: "valid_customer" },
              label: "Customer FK",
            },
          ],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.type).toBe("referential_violation");
    expect(issue.severity).toBe("error");
    expect(issue.rows).toEqual([1]);
    expect(issue.columnName).toBe("customer");
    const examples = issue.data?.examples as Array<{ row: number; value: string }>;
    expect(examples[0]).toEqual({ row: 1, value: "zzz" });
  });

  it("values 목록을 참조 집합으로 사용할 수 있다", () => {
    const ctx = makeCtx(
      ["status"],
      [["active"], ["pending"], ["bogus"]],
      {
        integrity: {
          referentialChecks: [
            {
              column: "status",
              references: { values: ["active", "pending", "closed"] },
            },
          ],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("referential_violation");
    expect(issues[0]!.rows).toEqual([2]);
  });

  it("allowEmpty 기본(true)이면 빈 값을 위반으로 보지 않는다", () => {
    const ctx = makeCtx(
      ["status"],
      [["active"], [""], ["  "]],
      {
        integrity: {
          referentialChecks: [
            { column: "status", references: { values: ["active"] } },
          ],
        },
      },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("allowEmpty=false 면 빈 값도 위반으로 잡는다", () => {
    const ctx = makeCtx(
      ["status"],
      [["active"], [""], ["active"]],
      {
        integrity: {
          referentialChecks: [
            {
              column: "status",
              references: { values: ["active"] },
              allowEmpty: false,
            },
          ],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("referential_violation");
    expect(issues[0]!.rows).toEqual([1]);
  });

  it("NBSP 만 든 셀도 빈 값으로 간주해 allowEmpty 기본에서 스킵한다", () => {
    const ctx = makeCtx(
      ["status"],
      [["active"], [NBSP]],
      {
        integrity: {
          referentialChecks: [
            { column: "status", references: { values: ["active"] } },
          ],
        },
      },
    );
    // NBSP 는 trim 으로 제거되어 빈 값 -> allowEmpty 기본 true -> 스킵.
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("참조 컬럼이 없으면 integrity_unknown_column 으로 스킵한다", () => {
    const ctx = makeCtx(
      ["customer"],
      [["alice"]],
      {
        integrity: {
          referentialChecks: [
            { column: "customer", references: { column: "ghost" } },
          ],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("integrity_unknown_column");
    expect(issues[0]!.data?.missing).toEqual(["ghost"]);
  });
});

describe("detectIntegrity — 합계 관계 자동탐지(discoverSumRelationships)", () => {
  it("col_i + col_j ≈ col_k 관계를 발견한다", () => {
    const ctx = makeCtx(
      ["qty", "tax", "total"],
      [
        ["10", "1", "11"],
        ["20", "2", "22"],
        ["30", "3", "33"],
        ["40", "4", "44"],
      ],
      { integrity: { discoverSumRelationships: true } },
    );
    const issues = detectIntegrity(ctx);
    const found = issues.filter((i) => i.type === "discovered_sum_relationship");
    expect(found).toHaveLength(1);
    const issue = found[0]!;
    expect(issue.severity).toBe("info");
    expect(issue.data?.total).toBe("total");
    expect(issue.data?.components).toEqual(["qty", "tax"]);
    expect(issue.data?.matchRatio).toBe(1);
  });

  it("95% 미만 일치 관계는 발견하지 않는다", () => {
    // total 이 5행 중 3행만 합과 일치 (3/5 = 0.6 < 0.95)
    const ctx = makeCtx(
      ["a", "b", "total"],
      [
        ["1", "1", "2"],
        ["2", "2", "4"],
        ["3", "3", "6"],
        ["4", "4", "100"],
        ["5", "5", "200"],
      ],
      { integrity: { discoverSumRelationships: true } },
    );
    const issues = detectIntegrity(ctx);
    expect(issues.some((i) => i.type === "discovered_sum_relationship")).toBe(
      false,
    );
  });

  it("discoverSumRelationships=false(기본)면 자동탐지를 하지 않는다", () => {
    const ctx = makeCtx(
      ["a", "b", "total"],
      [
        ["1", "1", "2"],
        ["2", "2", "4"],
      ],
      { integrity: {} },
    );
    expect(detectIntegrity(ctx)).toEqual([]);
  });

  it("같은 관계를 중복 방출하지 않는다", () => {
    const ctx = makeCtx(
      ["x", "y", "z"],
      [
        ["1", "2", "3"],
        ["4", "5", "9"],
        ["10", "20", "30"],
      ],
      { integrity: { discoverSumRelationships: true } },
    );
    const issues = detectIntegrity(ctx);
    const found = issues.filter((i) => i.type === "discovered_sum_relationship");
    // z = x + y 관계 하나만 (x = z - y 같은 역관계 중복 없음)
    expect(found).toHaveLength(1);
    expect(found[0]!.data?.total).toBe("z");
  });
});

describe("detectIntegrity — 복합 시나리오", () => {
  it("여러 종류의 규칙 위반을 동시에 방출한다", () => {
    const ctx = makeCtx(
      ["amount", "balance", "qty", "tax", "total", "status"],
      [
        ["100", "1100", "10", "1", "99", "active"], // sum 위반(expected 11), balance ok
        ["100", "1200", "20", "2", "22", "bogus"], // ref 위반(bogus)
      ],
      {
        integrity: {
          sumChecks: [{ components: ["qty", "tax"], total: "total" }],
          balanceChecks: [
            { amount: "amount", balance: "balance", opening: 1000 },
          ],
          referentialChecks: [
            { column: "status", references: { values: ["active"] } },
          ],
        },
      },
    );
    const issues = detectIntegrity(ctx);
    const types = issues.map((i) => i.type).sort();
    expect(types).toEqual(["referential_violation", "sum_mismatch"]);
    expect(issues.every((i) => i.category === "integrity")).toBe(true);
  });
});

// examples 항목 구조(잔액/합계 공용) 테스트 헬퍼 타입.
interface NumericExampleLike {
  row: number;
  expected: number;
  actual: number;
  diff: number;
}
