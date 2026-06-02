/**
 * UI 다국어(i18n) — 한국어/영어. 한 코드베이스 이중언어(별도 버전 없음).
 *
 * - 언어 자동감지(localStorage > navigator > 기본 ko) + 토글 + localStorage 저장
 * - t(key, params): 사전 조회 + {param} 치환
 * - localizeIssueMessage(issue): 엔진의 영어 메시지를 현 로케일로 변환
 *   (en 은 엔진 메시지 그대로, ko 는 type+data 로 한국어 재구성)
 */

import type { Issue } from "../types.js";

export type Locale = "ko" | "en";

const STORAGE_KEY = "tidycsv_locale";

// 기본 ko (노드 단위테스트는 초기화 호출 안 하므로 ko 라벨 유지).
let current: Locale = "ko";

export function detectLocale(): Locale {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "ko" || stored === "en") return stored;
    }
  } catch {
    /* localStorage 접근 불가 시 무시 */
  }
  const nav =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "";
  return nav.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale): void {
  current = l;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* 무시 */
  }
}

/** 브라우저 기동 시 호출(자동 감지 적용). */
export function initLocale(): void {
  current = detectLocale();
}

type Dict = Record<string, string>;

const KO: Dict = {
  // 공통 카테고리
  "cat.duplicate": "중복",
  "cat.format": "포맷",
  "cat.outlier": "이상치",
  "cat.integrity": "정합성",
  // 헤더/소개 (index.html)
  "site.tagline": "지저분한 CSV를 넣으면 <strong>중복·포맷오류·이상치·정합성 불일치</strong>를 잡아 정리하고 리포트합니다.",
  "site.privacy": "🔒 올린 파일은 내 컴퓨터에서만 처리돼요 · AI 없이 · 언제 돌려도 같은 결과",
  "dz.text": "CSV·엑셀(.xlsx) 파일을 끌어다 놓거나 <u>클릭해 선택</u>",
  "dz.or": "또는",
  "btn.sample": "예제 데이터 불러오기",
  "btn.clean": "🧹 자동 정제하기",
  "btn.download": "⬇ 정제된 CSV 다운로드",
  "footer.text": "tidycsv · 오픈소스 데이터 정합성 도구 ·",
  // 요약
  "summary.analyzed": "{rows}행 · {cols}열 분석 완료",
  "summary.total": "총 이슈",
  "summary.catline": "중복 {dup} · 포맷 {fmt} · 이상치 {out} · <strong>정합성 {integ}</strong>",
  // 이슈 표
  "issues.none": "✅ 검출된 이슈가 없습니다.",
  "issues.title": "검출 이슈 ({n})",
  "issues.th.severity": "심각도",
  "issues.th.category": "카테고리",
  "issues.th.type": "유형",
  "issues.th.column": "컬럼",
  "issues.th.rows": "영향 행",
  "issues.th.message": "내용",
  "rows.count": "{n}개 (행 {sample}{more})",
  // 정제 리포트
  "clean.title": "정제 결과 (before / after)",
  "clean.rows": "행: <strong>{before}</strong> → <strong>{after}</strong> (중복 {removed}건 제거)",
  "clean.cells": "자동 수정 셀: <strong>{n}</strong>건 (공백 {ws} · 숫자 {num} · 날짜 {date})",
  "clean.issues": "검출 이슈: <strong>{before}</strong> → <strong>{after}</strong> (해결 {resolved}건)",
  "clean.fixed.title": "자동 수정 내역",
  "clean.fixed.hint": "(행 번호는 원본 CSV 기준)",
  "clean.fixed.none": "자동 수정할 셀이 없습니다.",
  "clean.th.row": "행",
  "clean.th.column": "컬럼",
  "clean.th.fixer": "종류",
  "clean.more": "…외 {n}건",
  "clean.manual.title": "수동 검토 필요",
  "clean.manual.hint": "(정합성·이상치 — 자동 수정 대상 아님)",
  "clean.manual.none": "수동 검토가 필요한 이슈가 없습니다.",
  // 규칙 패널
  "rules.title": "정합성 규칙 추가",
  "rules.hint": "(합계·잔액·참조 — 내 데이터에 맞게 지정)",
  "rules.sum": "합계 검증",
  "rules.sum.components": "구성요소 (Ctrl+클릭 다중 선택)",
  "rules.sum.total": "합계 컬럼",
  "rules.sum.add": "+ 합계 규칙",
  "rules.bal": "잔액 검증",
  "rules.bal.amount": "증감액",
  "rules.bal.balance": "잔액(누적)",
  "rules.bal.add": "+ 잔액 규칙",
  "rules.ref": "참조 무결성",
  "rules.ref.column": "검사 컬럼",
  "rules.ref.refcol": "참조 컬럼",
  "rules.ref.useValues": "(허용값 직접입력)",
  "rules.ref.values": "또는 허용값(쉼표 구분)",
  "rules.ref.add": "+ 참조 규칙",
  "rules.current": "현재 규칙",
  "rules.none": "아직 규칙이 없습니다. 위에서 컬럼을 골라 추가하세요.",
  "rules.del": "삭제",
  "rules.li.sum": "합계: {components} = {total}",
  "rules.li.bal": "잔액: {balance} = 직전 + {amount}",
  "rules.li.ref.col": "참조: {column} ∈ 컬럼 {ref}",
  "rules.li.ref.val": "참조: {column} ∈ 값 [{ref}]",
  // main.ts 동적
  "file.label": "{name} — {rows}행",
  "err.analyze": "분석 실패: {msg}",
  "err.xlsx": "엑셀 분석 실패: {msg}",
  "err.read": "파일을 읽지 못했습니다.",
};

const EN: Dict = {
  "cat.duplicate": "Duplicate",
  "cat.format": "Format",
  "cat.outlier": "Outlier",
  "cat.integrity": "Integrity",
  "site.tagline": "Drop a messy CSV and tidycsv finds <strong>duplicates, format errors, outliers, and integrity mismatches</strong>, then cleans and reports.",
  "site.privacy": "🔒 Your file never leaves your browser · No AI · Same result every time",
  "dz.text": "Drag & drop a CSV / Excel (.xlsx) file, or <u>click to choose</u>",
  "dz.or": "or",
  "btn.sample": "Load sample data",
  "btn.clean": "🧹 Auto-clean",
  "btn.download": "⬇ Download cleaned CSV",
  "footer.text": "tidycsv · open-source data integrity tool ·",
  "summary.analyzed": "{rows} rows · {cols} cols analyzed",
  "summary.total": "Total issues",
  "summary.catline": "Duplicate {dup} · Format {fmt} · Outlier {out} · <strong>Integrity {integ}</strong>",
  "issues.none": "✅ No issues found.",
  "issues.title": "Issues ({n})",
  "issues.th.severity": "Severity",
  "issues.th.category": "Category",
  "issues.th.type": "Type",
  "issues.th.column": "Column",
  "issues.th.rows": "Rows",
  "issues.th.message": "Message",
  "rows.count": "{n} (rows {sample}{more})",
  "clean.title": "Cleaning result (before / after)",
  "clean.rows": "Rows: <strong>{before}</strong> → <strong>{after}</strong> ({removed} duplicates removed)",
  "clean.cells": "Cells fixed: <strong>{n}</strong> (whitespace {ws} · number {num} · date {date})",
  "clean.issues": "Issues: <strong>{before}</strong> → <strong>{after}</strong> ({resolved} resolved)",
  "clean.fixed.title": "Auto-fixed cells",
  "clean.fixed.hint": "(row numbers are original CSV rows)",
  "clean.fixed.none": "No cells to fix.",
  "clean.th.row": "Row",
  "clean.th.column": "Column",
  "clean.th.fixer": "Fixer",
  "clean.more": "…and {n} more",
  "clean.manual.title": "Manual review needed",
  "clean.manual.hint": "(integrity · outlier — not auto-fixed)",
  "clean.manual.none": "No issues need manual review.",
  "rules.title": "Add integrity rules",
  "rules.hint": "(sum · balance · reference — define for your data)",
  "rules.sum": "Sum check",
  "rules.sum.components": "Components (Ctrl+click to multi-select)",
  "rules.sum.total": "Total column",
  "rules.sum.add": "+ Sum rule",
  "rules.bal": "Balance check",
  "rules.bal.amount": "Amount",
  "rules.bal.balance": "Balance (running)",
  "rules.bal.add": "+ Balance rule",
  "rules.ref": "Referential",
  "rules.ref.column": "Column to check",
  "rules.ref.refcol": "Reference column",
  "rules.ref.useValues": "(use allowed values)",
  "rules.ref.values": "or allowed values (comma-separated)",
  "rules.ref.add": "+ Reference rule",
  "rules.current": "Current rules",
  "rules.none": "No rules yet. Pick columns above to add one.",
  "rules.del": "Delete",
  "rules.li.sum": "Sum: {components} = {total}",
  "rules.li.bal": "Balance: {balance} = prev + {amount}",
  "rules.li.ref.col": "Reference: {column} ∈ column {ref}",
  "rules.li.ref.val": "Reference: {column} ∈ values [{ref}]",
  "file.label": "{name} — {rows} rows",
  "err.analyze": "Analysis failed: {msg}",
  "err.xlsx": "Excel parse failed: {msg}",
  "err.read": "Could not read the file.",
};

const DICTS: Record<Locale, Dict> = { ko: KO, en: EN };

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current];
  let s = dict[key] ?? EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * 이슈 메시지를 현 로케일로. en 은 엔진의 영어 메시지 그대로,
 * ko 는 type + data 로 한국어 재구성(데이터 필드는 방어적으로 접근).
 */
export function localizeIssueMessage(issue: Issue): string {
  if (current === "en") return issue.message;
  const n = issue.rows?.length ?? 0;
  const col = issue.columnName ?? "";
  const d: Record<string, unknown> = issue.data ?? {};
  switch (issue.type) {
    case "exact_duplicate_row":
      return `완전히 동일한 행 ${n}개(중복)`;
    case "near_duplicate_row":
      return `유사 중복 행 (유사도 ${String(d["similarity"] ?? "?")})`;
    case "near_duplicate_skipped":
      return "행이 많아 유사 중복 검사를 건너뜀";
    case "whitespace_format":
      return `컬럼 "${col}"에 공백/제어문자 정리가 필요한 셀 ${n}개`;
    case "inconsistent_date_format": {
      const formats = asArray(d["formats"]);
      const list = formats.length > 0 ? ` (${formats.join(", ")})` : "";
      return `컬럼 "${col}"에 날짜 포맷이 ${formats.length || "여러"}종 섞여 있음${list}`;
    }
    case "ambiguous_date_order":
      return `컬럼 "${col}"에 월/일 순서가 충돌하는 날짜가 있음`;
    case "inconsistent_number_format":
      return `컬럼 "${col}"에 숫자 표기(통화·천단위)가 혼용됨`;
    case "missing_value":
      return `컬럼 "${col}"에 빈 값 ${n}개`;
    case "empty_column":
      return `컬럼 "${col}"이(가) 전부 비어 있음`;
    case "type_mismatch": {
      const exp = d["expectedType"];
      return `컬럼 "${col}"에 타입 불일치 셀 ${n}개${exp ? ` (예상: ${String(exp)})` : ""}`;
    }
    case "range_violation":
      return `컬럼 "${col}"에 허용 범위를 벗어난 값 ${n}개`;
    case "statistical_outlier":
      return `컬럼 "${col}"에 통계적 이상치 ${n}개`;
    case "sum_mismatch": {
      const c = asArray(d["components"]).join(" + ") || "구성요소";
      return `합계 불일치 ${n}개 행 (${c} ≠ ${String(d["total"] ?? "합계")})`;
    }
    case "balance_mismatch":
      return `잔액 불일치 ${n}개 행 (${String(d["balance"] ?? "잔액")})`;
    case "referential_violation":
      return `컬럼 "${col}"에 허용되지 않은(참조에 없는) 값 ${n}개`;
    case "discovered_sum_relationship": {
      const c = asArray(d["components"]).join(" + ") || "두 컬럼";
      return `합계 관계 자동발견: ${String(d["total"] ?? "?")} = ${c}`;
    }
    default:
      // integrity_unknown_column 등은 영어 원문 유지
      return issue.message;
  }
}
