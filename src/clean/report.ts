/**
 * before/after 정제 리포트.
 *
 * 정제 전 분석 → 정제 → 정제 후 재분석을 묶어, "무엇을 자동 고쳤고
 * 무엇이 수동 검토로 남았는지"를 한눈에 보여준다.
 */

import { analyzeTable } from "../engine.js";
import type { AnalysisReport, EngineOptions, ParsedTable } from "../types.js";
import { cleanTable } from "./clean.js";
import type { CleanOptions, CleanResult } from "./types.js";

/** 자동 정제로는 해결하지 않고 '검출만' 하는(수동 검토 대상) 이슈 카테고리. */
const MANUAL_REVIEW_CATEGORIES = new Set(["integrity", "outlier"]);

export interface CleanReport {
  before: AnalysisReport;
  clean: CleanResult;
  after: AnalysisReport;
}

export interface CleanReportOptions {
  clean?: CleanOptions;
  engine?: EngineOptions;
}

/**
 * 분석 → 정제 → 재분석을 수행해 before/after 리포트를 만든다.
 */
export function cleanAndReport(
  table: ParsedTable,
  options: CleanReportOptions = {},
): CleanReport {
  const before = analyzeTable(table, options.engine);
  const clean = cleanTable(table, options.clean);
  const after = analyzeTable(clean.table, options.engine);
  return { before, clean, after };
}

function truncate(s: string, max = 24): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** 마크다운 표 셀용: 파이프·개행을 이스케이프해 표 구조가 깨지지 않게 한다. */
function mdCell(s: string, max = 24): string {
  return truncate(s, max).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/**
 * CleanReport 를 사람이 읽는 마크다운으로 렌더링.
 */
export function renderReport(report: CleanReport, maxRows = 30): string {
  const { before, clean, after } = report;
  const bf = clean.summary.byFixer;
  const lines: string[] = [];

  lines.push("# 정제 리포트\n");

  // 요약
  lines.push("## 요약");
  lines.push(
    `- 행: ${before.table.rowCount} → ${after.table.rowCount} ` +
      `(중복 ${clean.summary.rowsRemoved}건 제거)`,
  );
  lines.push(
    `- 자동 수정 셀: ${clean.summary.cellsChanged}건 ` +
      `(공백 ${bf.whitespace} · 숫자 ${bf.number_format} · 날짜 ${bf.date_format})`,
  );
  lines.push(
    `- 검출 이슈: ${before.summary.totalIssues}건 → ${after.summary.totalIssues}건 ` +
      `(해결 ${before.summary.totalIssues - after.summary.totalIssues}건)\n`,
  );

  // 자동 수정 내역
  if (clean.cellChanges.length > 0) {
    lines.push("## 자동 수정 내역");
    lines.push("> 행 번호는 원본 CSV 기준(0-based).");
    lines.push("");
    lines.push("| 행 | 컬럼 | before | after | 종류 |");
    lines.push("|---|---|---|---|---|");
    for (const c of clean.cellChanges.slice(0, maxRows)) {
      lines.push(
        `| ${c.row} | ${mdCell(c.columnName)} | \`${mdCell(c.before)}\` | \`${mdCell(c.after)}\` | ${c.fixer} |`,
      );
    }
    if (clean.cellChanges.length > maxRows) {
      lines.push(`| … | | | | 외 ${clean.cellChanges.length - maxRows}건 |`);
    }
    lines.push("");
  }

  // 제거된 중복 행
  if (clean.removedRows.length > 0) {
    lines.push("## 제거된 중복 행");
    for (const r of clean.removedRows.slice(0, maxRows)) {
      lines.push(`- 행 ${r.row} (행 ${r.keptRow} 와 동일 → 제거)`);
    }
    if (clean.removedRows.length > maxRows) {
      lines.push(`- … 외 ${clean.removedRows.length - maxRows}건`);
    }
    lines.push("");
  }

  // 수동 검토 필요(자동 수정 안 한 정합성·이상치)
  const manual = after.issues.filter((i) =>
    MANUAL_REVIEW_CATEGORIES.has(i.category),
  );
  if (manual.length > 0) {
    lines.push("## 수동 검토 필요 (자동 수정 대상 아님)");
    lines.push("| 종류 | 심각도 | 컬럼 | 내용 |");
    lines.push("|---|---|---|---|");
    for (const i of manual.slice(0, maxRows)) {
      lines.push(
        `| ${i.type} | ${i.severity} | ${mdCell(i.columnName ?? "-")} | ${mdCell(i.message, 60)} |`,
      );
    }
    if (manual.length > maxRows) {
      lines.push(`| … | | | 외 ${manual.length - maxRows}건 |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
