/**
 * UI 렌더링 — 순수 함수(부수효과 없음, DOM 의존 없음).
 *
 * 리포트 데이터를 HTML 문자열로 변환한다. 모든 사용자 데이터(CSV 셀)는
 * escapeHtml 로 이스케이프해 표 구조 깨짐·HTML 주입을 방지한다.
 * DOM 조작은 main.ts 가 담당하고, 여기서는 문자열만 만든다(테스트 용이).
 */

import type { CleanReport } from "../clean/report.js";
import type {
  AnalysisReport,
  BalanceCheck,
  Issue,
  IssueCategory,
  ReferentialCheck,
  SumCheck,
} from "../types.js";

/** UI 에서 편집하는 정합성 규칙 묶음. */
export interface IntegrityRuleSet {
  sumChecks: SumCheck[];
  balanceChecks: BalanceCheck[];
  referentialChecks: ReferentialCheck[];
}

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  duplicate: "중복",
  format: "포맷",
  outlier: "이상치",
  integrity: "정합성",
};

/** HTML 특수문자 이스케이프. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 영향 행 인덱스를 "N개 (예: 0, 2, 4…)" 형태로. */
function formatRows(rows: number[] | undefined): string {
  if (!rows || rows.length === 0) return "-";
  const sample = rows.slice(0, 5).join(", ");
  const more = rows.length > 5 ? "…" : "";
  return `${rows.length}개 (행 ${sample}${more})`;
}

function severityBadge(sev: string): string {
  return `<span class="badge badge-${escapeHtml(sev)}">${escapeHtml(sev)}</span>`;
}

/** 분석 요약(파일 정보 + 카운트 카드). */
export function summaryHtml(report: AnalysisReport): string {
  const s = report.summary;
  const cat = s.byCategory;
  const sev = s.bySeverity;
  return `
<section class="summary">
  <div class="file-info">
    <strong>${report.table.rowCount.toLocaleString()}</strong>행 ·
    <strong>${report.table.columnCount}</strong>열 분석 완료
  </div>
  <div class="cards">
    <div class="card card-total"><span class="num">${s.totalIssues}</span><span class="lbl">총 이슈</span></div>
    <div class="card card-error"><span class="num">${sev.error}</span><span class="lbl">error</span></div>
    <div class="card card-warning"><span class="num">${sev.warning}</span><span class="lbl">warning</span></div>
    <div class="card card-info"><span class="num">${sev.info}</span><span class="lbl">info</span></div>
  </div>
  <div class="cat-line">
    중복 ${cat.duplicate} · 포맷 ${cat.format} · 이상치 ${cat.outlier} · <strong>정합성 ${cat.integrity}</strong>
  </div>
</section>`;
}

/** 이슈 한 건을 표 행으로. */
function issueRow(i: Issue): string {
  return `<tr>
  <td>${severityBadge(i.severity)}</td>
  <td>${escapeHtml(CATEGORY_LABEL[i.category])}</td>
  <td><code>${escapeHtml(i.type)}</code></td>
  <td>${escapeHtml(i.columnName ?? "-")}</td>
  <td>${formatRows(i.rows)}</td>
  <td>${escapeHtml(i.message)}</td>
</tr>`;
}

/** 검출 이슈 목록 테이블. */
export function issuesHtml(report: AnalysisReport): string {
  if (report.issues.length === 0) {
    return `<section class="issues"><p class="empty">✅ 검출된 이슈가 없습니다.</p></section>`;
  }
  // 심각도 순(error→warning→info)으로 정렬.
  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const sorted = [...report.issues].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  return `
<section class="issues">
  <h2>검출 이슈 (${report.issues.length})</h2>
  <table>
    <thead><tr><th>심각도</th><th>카테고리</th><th>유형</th><th>컬럼</th><th>영향 행</th><th>내용</th></tr></thead>
    <tbody>
      ${sorted.map(issueRow).join("\n")}
    </tbody>
  </table>
</section>`;
}

/** 분석 결과 전체(요약 + 이슈). */
export function resultsHtml(report: AnalysisReport): string {
  return summaryHtml(report) + issuesHtml(report);
}

// ── 정합성 규칙 패널 ──────────────────────────────────────────

function options(headers: string[]): string {
  return headers
    .map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`)
    .join("");
}

/** 현재 등록된 규칙 목록(삭제 버튼 포함). */
function currentRulesHtml(rules: IntegrityRuleSet): string {
  const items: string[] = [];
  rules.sumChecks.forEach((r, i) => {
    items.push(
      `<li>합계: <code>${r.components.map(escapeHtml).join(" + ")}</code> = <code>${escapeHtml(r.total)}</code> <button class="btn-del" data-act="del" data-kind="sum" data-idx="${i}">삭제</button></li>`,
    );
  });
  rules.balanceChecks.forEach((r, i) => {
    items.push(
      `<li>잔액: <code>${escapeHtml(r.balance)}</code> = 직전 + <code>${escapeHtml(r.amount)}</code> <button class="btn-del" data-act="del" data-kind="balance" data-idx="${i}">삭제</button></li>`,
    );
  });
  rules.referentialChecks.forEach((r, i) => {
    const ref =
      "column" in r.references
        ? `컬럼 <code>${escapeHtml(r.references.column)}</code>`
        : `값 [${r.references.values.map(escapeHtml).join(", ")}]`;
    items.push(
      `<li>참조: <code>${escapeHtml(r.column)}</code> ∈ ${ref} <button class="btn-del" data-act="del" data-kind="ref" data-idx="${i}">삭제</button></li>`,
    );
  });
  if (items.length === 0) {
    return `<p class="empty">아직 규칙이 없습니다. 위에서 컬럼을 골라 추가하세요.</p>`;
  }
  return `<ul class="rule-list">${items.join("")}</ul>`;
}

/** 정합성 규칙 추가 패널(헤더 컬럼 기반 폼 + 현재 규칙 목록). */
export function rulesPanelHtml(
  headers: string[],
  rules: IntegrityRuleSet,
): string {
  if (headers.length === 0) return "";
  const opt = options(headers);
  return `
<section class="rules-panel">
  <h2>정합성 규칙 추가 <span class="hint">(합계·잔액·참조 — 내 데이터에 맞게 지정)</span></h2>
  <div class="rule-forms">
    <div class="rule-form">
      <strong>합계 검증</strong>
      <label>구성요소 (Ctrl+클릭 다중 선택)</label>
      <select multiple size="4" data-f="sum-components">${opt}</select>
      <label>합계 컬럼</label>
      <select data-f="sum-total">${opt}</select>
      <button class="btn" data-act="add-sum">+ 합계 규칙</button>
    </div>
    <div class="rule-form">
      <strong>잔액 검증</strong>
      <label>증감액</label>
      <select data-f="bal-amount">${opt}</select>
      <label>잔액(누적)</label>
      <select data-f="bal-balance">${opt}</select>
      <button class="btn" data-act="add-balance">+ 잔액 규칙</button>
    </div>
    <div class="rule-form">
      <strong>참조 무결성</strong>
      <label>검사 컬럼</label>
      <select data-f="ref-column">${opt}</select>
      <label>참조 컬럼</label>
      <select data-f="ref-refcol"><option value="">(허용값 직접입력)</option>${opt}</select>
      <label>또는 허용값(쉼표 구분)</label>
      <input type="text" data-f="ref-values" placeholder="paid, pending, shipped" />
      <button class="btn" data-act="add-ref">+ 참조 규칙</button>
    </div>
  </div>
  <h3>현재 규칙</h3>
  ${currentRulesHtml(rules)}
</section>`;
}

/** 정제 before/after 섹션. */
export function cleanHtml(report: CleanReport): string {
  const { before, clean, after } = report;
  const bf = clean.summary.byFixer;

  const changeRows = clean.cellChanges
    .slice(0, 100)
    .map(
      (c) => `<tr>
  <td>${c.row}</td>
  <td>${escapeHtml(c.columnName)}</td>
  <td><code class="before">${escapeHtml(c.before)}</code></td>
  <td><code class="after">${escapeHtml(c.after)}</code></td>
  <td>${escapeHtml(c.fixer)}</td>
</tr>`,
    )
    .join("\n");

  const manual = after.issues.filter(
    (i) => i.category === "integrity" || i.category === "outlier",
  );
  const manualRows = manual
    .map(
      (i) => `<tr>
  <td>${severityBadge(i.severity)}</td>
  <td><code>${escapeHtml(i.type)}</code></td>
  <td>${escapeHtml(i.columnName ?? "-")}</td>
  <td>${escapeHtml(i.message)}</td>
</tr>`,
    )
    .join("\n");

  const changesBlock =
    clean.cellChanges.length === 0
      ? `<p class="empty">자동 수정할 셀이 없습니다.</p>`
      : `<table>
    <thead><tr><th>행</th><th>컬럼</th><th>before</th><th>after</th><th>종류</th></tr></thead>
    <tbody>${changeRows}</tbody>
  </table>
  ${clean.cellChanges.length > 100 ? `<p class="note">…외 ${clean.cellChanges.length - 100}건</p>` : ""}`;

  const manualBlock =
    manual.length === 0
      ? `<p class="empty">수동 검토가 필요한 이슈가 없습니다.</p>`
      : `<table>
    <thead><tr><th>심각도</th><th>유형</th><th>컬럼</th><th>내용</th></tr></thead>
    <tbody>${manualRows}</tbody>
  </table>`;

  return `
<section class="clean-report">
  <h2>정제 결과 (before / after)</h2>
  <div class="clean-summary">
    <div>행: <strong>${before.table.rowCount}</strong> → <strong>${after.table.rowCount}</strong> (중복 ${clean.summary.rowsRemoved}건 제거)</div>
    <div>자동 수정 셀: <strong>${clean.summary.cellsChanged}</strong>건 (공백 ${bf.whitespace} · 숫자 ${bf.number_format} · 날짜 ${bf.date_format})</div>
    <div>검출 이슈: <strong>${before.summary.totalIssues}</strong> → <strong>${after.summary.totalIssues}</strong> (해결 ${before.summary.totalIssues - after.summary.totalIssues}건)</div>
  </div>

  <h3>자동 수정 내역 <span class="hint">(행 번호는 원본 CSV 기준)</span></h3>
  ${changesBlock}

  <h3>수동 검토 필요 <span class="hint">(정합성·이상치 — 자동 수정 대상 아님)</span></h3>
  ${manualBlock}
</section>`;
}
