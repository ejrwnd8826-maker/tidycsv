import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCsv, tableFromRows } from "../parse/csv.js";
import { cleanAndReport, renderReport } from "./report.js";

function loadExample(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../examples/${name}`, import.meta.url)),
    "utf8",
  );
}

describe("cleanAndReport — before/after", () => {
  const table = parseCsv(loadExample("messy-orders.csv"));
  const report = cleanAndReport(table, {
    engine: {
      integrity: {
        sumChecks: [{ components: ["subtotal", "tax"], total: "total" }],
        referentialChecks: [
          {
            column: "status",
            references: { values: ["paid", "pending", "shipped", "cancelled"] },
          },
        ],
      },
    },
  });

  it("정제 후 이슈 수가 줄어든다", () => {
    expect(report.after.summary.totalIssues).toBeLessThan(
      report.before.summary.totalIssues,
    );
  });

  it("중복·공백 이슈는 정제 후 사라진다", () => {
    const afterTypes = new Set(report.after.issues.map((i) => i.type));
    expect(afterTypes.has("exact_duplicate_row")).toBe(false);
    expect(afterTypes.has("whitespace_format")).toBe(false);
  });

  it("정합성 위반(합계·참조)은 자동 수정되지 않고 남는다", () => {
    const afterTypes = new Set(report.after.issues.map((i) => i.type));
    expect(afterTypes.has("sum_mismatch")).toBe(true);
    expect(afterTypes.has("referential_violation")).toBe(true);
  });

  it("행 수가 8 → 7 로 준다", () => {
    expect(report.before.table.rowCount).toBe(8);
    expect(report.after.table.rowCount).toBe(7);
  });
});

describe("renderReport — 마크다운", () => {
  it("주요 섹션을 포함한다", () => {
    const table = parseCsv(loadExample("messy-orders.csv"));
    const report = cleanAndReport(table, {
      engine: {
        integrity: {
          sumChecks: [{ components: ["subtotal", "tax"], total: "total" }],
        },
      },
    });
    const md = renderReport(report);
    expect(md).toContain("# 정제 리포트");
    expect(md).toContain("## 요약");
    expect(md).toContain("## 자동 수정 내역");
    expect(md).toContain("## 수동 검토 필요");
  });

  it("셀 값의 파이프 문자를 이스케이프해 표가 깨지지 않는다", () => {
    const table = tableFromRows(["a"], [[" x|y "], [" x|y "]]);
    const report = cleanAndReport(table);
    const md = renderReport(report);
    expect(md).toContain("x\\|y"); // 파이프가 \\| 로 이스케이프됨
  });
});
