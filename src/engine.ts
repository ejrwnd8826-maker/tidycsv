/**
 * tidycsv 코어 엔진 — 오케스트레이터.
 *
 * 파싱된 테이블에 4개 검출기(중복·포맷·이상치·정합성)를 순서대로 적용해
 * 단일 AnalysisReport 로 합친다. 결정론적이며 부수효과가 없다.
 */

import { detectDuplicates } from "./detectors/duplicates.js";
import { detectFormatIssues } from "./detectors/format.js";
import { detectIntegrity } from "./detectors/integrity.js";
import { detectOutliers } from "./detectors/outliers.js";
import { buildColumnProfiles } from "./infer/columns.js";
import { resolveOptions } from "./options.js";
import { parseCsv } from "./parse/csv.js";
import type { ParseCsvOptions } from "./parse/csv.js";
import type {
  AnalysisReport,
  Detector,
  DetectorContext,
  EngineOptions,
  Issue,
  IssueCategory,
  ReportSummary,
  Severity,
  ParsedTable,
} from "./types.js";

/** 적용 순서대로의 검출기 목록. */
const DETECTORS: ReadonlyArray<Detector> = [
  detectDuplicates,
  detectFormatIssues,
  detectOutliers,
  detectIntegrity,
];

/** 이슈 목록으로부터 요약 통계 계산. */
function summarize(issues: Issue[]): ReportSummary {
  const byCategory: Record<IssueCategory, number> = {
    duplicate: 0,
    format: 0,
    outlier: 0,
    integrity: 0,
  };
  const bySeverity: Record<Severity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };
  for (const issue of issues) {
    byCategory[issue.category] += 1;
    bySeverity[issue.severity] += 1;
  }
  return { totalIssues: issues.length, byCategory, bySeverity };
}

/**
 * 파싱된 테이블을 분석해 리포트 생성.
 */
export function analyzeTable(
  table: ParsedTable,
  options?: EngineOptions,
): AnalysisReport {
  const resolved = resolveOptions(options);
  const columns = buildColumnProfiles(table);
  const ctx: DetectorContext = { table, columns, options: resolved };

  const issues: Issue[] = [];
  for (const detector of DETECTORS) {
    issues.push(...detector(ctx));
  }

  return {
    table: {
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      headers: [...table.headers],
    },
    columns,
    issues,
    summary: summarize(issues),
  };
}

/**
 * CSV 텍스트를 바로 분석(파싱 + 분석).
 */
export function analyzeCsv(
  text: string,
  options?: EngineOptions,
  parseOptions?: ParseCsvOptions,
): AnalysisReport {
  const table = parseCsv(text, parseOptions);
  return analyzeTable(table, options);
}
