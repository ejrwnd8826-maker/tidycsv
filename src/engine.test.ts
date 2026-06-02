import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeCsv } from "./engine.js";
import type { Issue } from "./types.js";

/** examples/ 폴더의 샘플 CSV 로드. */
function loadExample(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../examples/${name}`, import.meta.url)),
    "utf8",
  );
}

const has = (issues: Issue[], type: string): boolean =>
  issues.some((i) => i.type === type);
const byType = (issues: Issue[], type: string): Issue[] =>
  issues.filter((i) => i.type === type);

describe("analyzeCsv - messy-orders.csv (4종 검출 종합)", () => {
  const csv = loadExample("messy-orders.csv");
  const report = analyzeCsv(csv, {
    integrity: {
      sumChecks: [{ components: ["subtotal", "tax"], total: "total" }],
      referentialChecks: [
        {
          column: "status",
          references: { values: ["paid", "pending", "shipped", "cancelled"] },
        },
      ],
    },
  });
  const issues = report.issues;

  it("테이블을 올바르게 파싱한다", () => {
    expect(report.table.columnCount).toBe(9);
    expect(report.table.rowCount).toBe(8);
    expect(report.columns).toHaveLength(9);
  });

  it("정확 중복 행(1001 두 번)을 잡는다", () => {
    const dups = byType(issues, "exact_duplicate_row");
    expect(dups.length).toBeGreaterThanOrEqual(1);
    const rows = dups.flatMap((d) => d.rows ?? []);
    expect(rows).toContain(0);
    expect(rows).toContain(2);
  });

  it("날짜 포맷 혼용을 잡는다", () => {
    expect(has(issues, "inconsistent_date_format")).toBe(true);
  });

  it("공백 혼입(' Alice ')을 잡는다", () => {
    const ws = byType(issues, "whitespace_format");
    expect(ws.length).toBeGreaterThanOrEqual(1);
    expect(ws.some((i) => i.columnName === "customer")).toBe(true);
  });

  it("숫자/통화 포맷 혼용을 잡는다", () => {
    expect(has(issues, "inconsistent_number_format")).toBe(true);
  });

  it("합계 불일치(1004: 1000+100≠1200)를 잡는다", () => {
    const sums = byType(issues, "sum_mismatch");
    expect(sums.length).toBe(1);
    expect(sums[0]!.rows).toContain(4);
    expect(sums[0]!.severity).toBe("error");
  });

  it("참조 무결성 위반(status='unknown')을 잡는다", () => {
    const refs = byType(issues, "referential_violation");
    expect(refs.length).toBe(1);
    expect(refs[0]!.rows).toContain(7);
  });

  it("결측치(total 빈 값)를 잡는다", () => {
    const miss = byType(issues, "missing_value");
    expect(miss.some((i) => i.columnName === "total")).toBe(true);
  });

  it("4개 카테고리가 모두 리포트에 나타난다", () => {
    expect(report.summary.byCategory.duplicate).toBeGreaterThanOrEqual(1);
    expect(report.summary.byCategory.format).toBeGreaterThanOrEqual(1);
    expect(report.summary.byCategory.outlier).toBeGreaterThanOrEqual(1);
    expect(report.summary.byCategory.integrity).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalIssues).toBe(issues.length);
  });
});

describe("analyzeCsv - bank-statement.csv (잔액 검증)", () => {
  const csv = loadExample("bank-statement.csv");
  const report = analyzeCsv(csv, {
    integrity: {
      balanceChecks: [{ amount: "amount", balance: "balance" }],
    },
  });

  it("잔액 불일치(row 3: 2995-800≠2200)를 정확히 한 지점에서 잡는다", () => {
    const bal = byType(report.issues, "balance_mismatch");
    expect(bal.length).toBe(1);
    expect(bal[0]!.rows).toEqual([3]);
    expect(bal[0]!.severity).toBe("error");
  });
});

describe("analyzeCsv - 합계 관계 자동탐지", () => {
  it("subtotal+tax=total 관계를 자동으로 발견한다", () => {
    // 합이 항상 맞는 데이터(자동탐지 검증용)
    const csv = [
      "a,b,c",
      "10,5,15",
      "20,3,23",
      "100,50,150",
      "7,8,15",
    ].join("\n");
    const report = analyzeCsv(csv, {
      integrity: { discoverSumRelationships: true },
    });
    expect(has(report.issues, "discovered_sum_relationship")).toBe(true);
  });
});
