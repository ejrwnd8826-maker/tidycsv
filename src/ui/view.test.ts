import { describe, expect, it } from "vitest";
import { cleanAndReport } from "../clean/report.js";
import { analyzeTable } from "../engine.js";
import { parseCsv, tableFromRows } from "../parse/csv.js";
import {
  cleanHtml,
  escapeHtml,
  issuesHtml,
  resultsHtml,
  rulesPanelHtml,
  summaryHtml,
} from "./view.js";
import type { IntegrityRuleSet } from "./view.js";
import { SAMPLE_CSV, SAMPLE_ENGINE_OPTIONS } from "./sample.js";

const noRules: IntegrityRuleSet = {
  sumChecks: [],
  balanceChecks: [],
  referentialChecks: [],
};

describe("escapeHtml", () => {
  it("HTML 특수문자를 이스케이프한다", () => {
    expect(escapeHtml('<b>"x" & \'y\'</b>')).toBe(
      "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;",
    );
  });
});

describe("summaryHtml / issuesHtml", () => {
  const report = analyzeTable(parseCsv(SAMPLE_CSV), SAMPLE_ENGINE_OPTIONS);

  it("요약에 카운트가 들어간다", () => {
    const html = summaryHtml(report);
    expect(html).toContain(String(report.summary.totalIssues));
    expect(html).toContain("정합성");
  });

  it("이슈 테이블에 심각도 배지·유형이 들어간다", () => {
    const html = issuesHtml(report);
    expect(html).toContain("badge-error");
    expect(html).toContain("sum_mismatch");
    expect(html).toContain("<table");
  });

  it("이슈가 없으면 안내 문구", () => {
    const clean = analyzeTable(tableFromRows(["a"], [["1"], ["2"]]));
    expect(issuesHtml(clean)).toContain("이슈가 없습니다");
  });
});

describe("XSS 방지", () => {
  it("악성 셀 값을 그대로 출력하지 않는다", () => {
    // 컬럼 값에 스크립트 태그를 넣어도 이스케이프되어야 함
    const table = tableFromRows(
      ["name", "name"],
      [
        ["<script>alert(1)</script>", "x"],
        [" <img> ", "x"],
      ],
    );
    const report = analyzeTable(table);
    const html = resultsHtml(report);
    expect(html).not.toContain("<script>alert(1)</script>");
    // 헤더 중복 등으로 이슈가 생기며, 메시지/컬럼명은 이스케이프된다.
    expect(html).not.toMatch(/<img>/);
  });
});

describe("rulesPanelHtml", () => {
  it("컬럼 옵션과 추가 폼을 렌더한다", () => {
    const html = rulesPanelHtml(["a", "b", "total"], noRules);
    expect(html).toContain("정합성 규칙 추가");
    expect(html).toContain('data-act="add-sum"');
    expect(html).toContain('data-act="add-balance"');
    expect(html).toContain('data-act="add-ref"');
    expect(html).toContain('value="total"');
    expect(html).toContain("규칙이 없습니다");
  });

  it("현재 규칙을 삭제 버튼과 함께 보여준다", () => {
    const rules: IntegrityRuleSet = {
      sumChecks: [{ components: ["a", "b"], total: "total" }],
      balanceChecks: [],
      referentialChecks: [
        { column: "status", references: { values: ["paid"] } },
      ],
    };
    const html = rulesPanelHtml(["a", "b", "total", "status"], rules);
    expect(html).toContain('data-act="del"');
    expect(html).toContain('data-kind="sum"');
    expect(html).toContain("a + b");
    expect(html).toContain('data-kind="ref"');
  });

  it("헤더의 HTML을 이스케이프한다", () => {
    const html = rulesPanelHtml(["<x>"], noRules);
    expect(html).not.toContain("<x>");
    expect(html).toContain("&lt;x&gt;");
  });

  it("컬럼이 없으면 빈 문자열", () => {
    expect(rulesPanelHtml([], noRules)).toBe("");
  });
});

describe("cleanHtml", () => {
  it("before/after 요약과 수동 검토 섹션을 포함한다", () => {
    const report = cleanAndReport(parseCsv(SAMPLE_CSV), {
      engine: SAMPLE_ENGINE_OPTIONS,
    });
    const html = cleanHtml(report);
    expect(html).toContain("정제 결과");
    expect(html).toContain("자동 수정 내역");
    expect(html).toContain("수동 검토 필요");
    expect(html).toContain("sum_mismatch"); // 정합성 위반은 수동 검토로 남음
    expect(html).toContain("Alice"); // 공백 정리된 값
  });
});
