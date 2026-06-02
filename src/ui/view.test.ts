import { describe, expect, it } from "vitest";
import { cleanAndReport } from "../clean/report.js";
import { analyzeTable } from "../engine.js";
import { parseCsv, tableFromRows } from "../parse/csv.js";
import { cleanHtml, escapeHtml, issuesHtml, resultsHtml, summaryHtml } from "./view.js";
import { SAMPLE_CSV, SAMPLE_ENGINE_OPTIONS } from "./sample.js";

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
