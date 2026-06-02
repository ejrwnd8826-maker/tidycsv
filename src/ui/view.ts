/**
 * UI 렌더링 — 순수 함수(부수효과 없음, DOM 의존 없음).
 *
 * 리포트 데이터를 HTML 문자열로 변환한다. 모든 사용자 데이터(CSV 셀)는
 * escapeHtml 로 이스케이프해 표 구조 깨짐·HTML 주입을 방지한다.
 * 모든 라벨은 i18n(t)로, 이슈 메시지는 localizeIssueMessage 로 현 로케일 반영.
 */

import type {
  AnalysisReport,
  BalanceCheck,
  Issue,
  IssueCategory,
  ReferentialCheck,
  SumCheck,
} from "../types.js";
import { localizeIssueMessage, t } from "./i18n.js";

/** UI 에서 편집하는 정합성 규칙 묶음. */
export interface IntegrityRuleSet {
  sumChecks: SumCheck[];
  balanceChecks: BalanceCheck[];
  referentialChecks: ReferentialCheck[];
}

/** HTML 특수문자 이스케이프. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function catLabel(c: IssueCategory): string {
  return t(`cat.${c}`);
}

/** 영향 행 인덱스를 "N개 (행 0, 2, 4…)" 형태로. */
function formatRows(rows: number[] | undefined): string {
  if (!rows || rows.length === 0) return "-";
  const sample = rows.slice(0, 5).join(", ");
  const more = rows.length > 5 ? "…" : "";
  return t("rows.count", { n: rows.length, sample, more });
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
    ${t("summary.analyzed", { rows: report.table.rowCount.toLocaleString(), cols: report.table.columnCount })}
  </div>
  <div class="cards">
    <div class="card card-total"><span class="num">${s.totalIssues}</span><span class="lbl">${t("summary.total")}</span></div>
    <div class="card card-error"><span class="num">${sev.error}</span><span class="lbl">error</span></div>
    <div class="card card-warning"><span class="num">${sev.warning}</span><span class="lbl">warning</span></div>
    <div class="card card-info"><span class="num">${sev.info}</span><span class="lbl">info</span></div>
  </div>
  <div class="cat-line">
    ${t("summary.catline", { dup: cat.duplicate, fmt: cat.format, out: cat.outlier, integ: cat.integrity })}
  </div>
</section>`;
}

/** 이슈 한 건을 표 행으로. */
function issueRow(i: Issue): string {
  return `<tr>
  <td>${severityBadge(i.severity)}</td>
  <td>${escapeHtml(catLabel(i.category))}</td>
  <td><code>${escapeHtml(i.type)}</code></td>
  <td>${escapeHtml(i.columnName ?? "-")}</td>
  <td>${formatRows(i.rows)}</td>
  <td>${escapeHtml(localizeIssueMessage(i))}</td>
</tr>`;
}

/** 검출 이슈 목록 테이블. */
export function issuesHtml(report: AnalysisReport): string {
  if (report.issues.length === 0) {
    return `<section class="issues"><p class="empty">${t("issues.none")}</p></section>`;
  }
  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const sorted = [...report.issues].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  return `
<section class="issues">
  <h2>${t("issues.title", { n: report.issues.length })}</h2>
  <table>
    <thead><tr><th>${t("issues.th.severity")}</th><th>${t("issues.th.category")}</th><th>${t("issues.th.type")}</th><th>${t("issues.th.column")}</th><th>${t("issues.th.rows")}</th><th>${t("issues.th.message")}</th></tr></thead>
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

function code(s: string): string {
  return `<code>${escapeHtml(s)}</code>`;
}

/** 현재 등록된 규칙 목록(삭제 버튼 포함). */
function currentRulesHtml(rules: IntegrityRuleSet): string {
  const del = (kind: string, i: number): string =>
    `<button class="btn-del" data-act="del" data-kind="${kind}" data-idx="${i}">${t("rules.del")}</button>`;
  const items: string[] = [];
  rules.sumChecks.forEach((r, i) => {
    items.push(
      `<li>${t("rules.li.sum", { components: r.components.map(escapeHtml).join(" + "), total: code(r.total) })} ${del("sum", i)}</li>`,
    );
  });
  rules.balanceChecks.forEach((r, i) => {
    items.push(
      `<li>${t("rules.li.bal", { balance: code(r.balance), amount: code(r.amount) })} ${del("balance", i)}</li>`,
    );
  });
  rules.referentialChecks.forEach((r, i) => {
    const text =
      "column" in r.references
        ? t("rules.li.ref.col", { column: code(r.column), ref: code(r.references.column) })
        : t("rules.li.ref.val", { column: code(r.column), ref: r.references.values.map(escapeHtml).join(", ") });
    items.push(`<li>${text} ${del("ref", i)}</li>`);
  });
  if (items.length === 0) {
    return `<p class="empty">${t("rules.none")}</p>`;
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
  <h2>${t("rules.title")} <span class="hint">${t("rules.hint")}</span></h2>
  <div class="rule-forms">
    <div class="rule-form">
      <strong>${t("rules.sum")}</strong>
      <label>${t("rules.sum.components")}</label>
      <select multiple size="4" data-f="sum-components">${opt}</select>
      <label>${t("rules.sum.total")}</label>
      <select data-f="sum-total">${opt}</select>
      <button class="btn" data-act="add-sum">${t("rules.sum.add")}</button>
    </div>
    <div class="rule-form">
      <strong>${t("rules.bal")}</strong>
      <label>${t("rules.bal.amount")}</label>
      <select data-f="bal-amount">${opt}</select>
      <label>${t("rules.bal.balance")}</label>
      <select data-f="bal-balance">${opt}</select>
      <button class="btn" data-act="add-balance">${t("rules.bal.add")}</button>
    </div>
    <div class="rule-form">
      <strong>${t("rules.ref")}</strong>
      <label>${t("rules.ref.column")}</label>
      <select data-f="ref-column">${opt}</select>
      <label>${t("rules.ref.refcol")}</label>
      <select data-f="ref-refcol"><option value="">${t("rules.ref.useValues")}</option>${opt}</select>
      <label>${t("rules.ref.values")}</label>
      <input type="text" data-f="ref-values" placeholder="paid, pending, shipped" />
      <button class="btn" data-act="add-ref">${t("rules.ref.add")}</button>
    </div>
  </div>
  <h3>${t("rules.current")}</h3>
  ${currentRulesHtml(rules)}
</section>`;
}

/** 정제 before/after 섹션. */
export function cleanHtml(report: import("../clean/report.js").CleanReport): string {
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
  <td>${escapeHtml(localizeIssueMessage(i))}</td>
</tr>`,
    )
    .join("\n");

  const changesBlock =
    clean.cellChanges.length === 0
      ? `<p class="empty">${t("clean.fixed.none")}</p>`
      : `<table>
    <thead><tr><th>${t("clean.th.row")}</th><th>${t("clean.th.column")}</th><th>before</th><th>after</th><th>${t("clean.th.fixer")}</th></tr></thead>
    <tbody>${changeRows}</tbody>
  </table>
  ${clean.cellChanges.length > 100 ? `<p class="note">${t("clean.more", { n: clean.cellChanges.length - 100 })}</p>` : ""}`;

  const manualBlock =
    manual.length === 0
      ? `<p class="empty">${t("clean.manual.none")}</p>`
      : `<table>
    <thead><tr><th>${t("issues.th.severity")}</th><th>${t("issues.th.type")}</th><th>${t("issues.th.column")}</th><th>${t("issues.th.message")}</th></tr></thead>
    <tbody>${manualRows}</tbody>
  </table>`;

  return `
<section class="clean-report">
  <h2>${t("clean.title")}</h2>
  <div class="clean-summary">
    <div>${t("clean.rows", { before: before.table.rowCount, after: after.table.rowCount, removed: clean.summary.rowsRemoved })}</div>
    <div>${t("clean.cells", { n: clean.summary.cellsChanged, ws: bf.whitespace, num: bf.number_format, date: bf.date_format })}</div>
    <div>${t("clean.issues", { before: before.summary.totalIssues, after: after.summary.totalIssues, resolved: before.summary.totalIssues - after.summary.totalIssues })}</div>
  </div>

  <h3>${t("clean.fixed.title")} <span class="hint">${t("clean.fixed.hint")}</span></h3>
  ${changesBlock}

  <h3>${t("clean.manual.title")} <span class="hint">${t("clean.manual.hint")}</span></h3>
  ${manualBlock}
</section>`;
}
