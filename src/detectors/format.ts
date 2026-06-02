/**
 * 포맷(format) 일관성 검출기.
 *
 * 컬럼 단위로 다음 세 가지 비일관성을 잡는다.
 *  1) 공백/제어문자 혼입(whitespace_format)
 *  2) 날짜 포맷 혼용(inconsistent_date_format) 및 월/일 순서 충돌(ambiguous_date_order)
 *  3) 숫자 포맷 혼용(inconsistent_number_format: 통화기호·천단위 구분자 섞임)
 *
 * 모든 검출기는 순수 함수다. 셀마다 Issue 를 만들지 않고,
 * 컬럼·규칙 단위로 묶어 rows 배열에 영향 행을 모은다.
 */

import type { ColumnProfile, DetectorContext, Issue } from "../types.js";
import { CURRENCY_SYMBOLS, columnValues, isBlank, needsWhitespaceTrim } from "../util/coerce.js";
import { analyzeDate } from "../util/datetime.js";

/** data.examples 배열의 최대 길이. */
const MAX_EXAMPLES = 50;

/** 한 셀이 인식 통화기호를 포함하는가. */
function hasCurrencySymbol(raw: string): boolean {
  for (const ch of raw) {
    if (CURRENCY_SYMBOLS.includes(ch)) return true;
  }
  return false;
}

/** 한 셀이 천단위 구분자(콤마)를 포함하는가. */
function hasGroupingSeparator(raw: string): boolean {
  return raw.includes(",");
}

/**
 * 공백/제어문자 검사.
 * 비어있지 않은 셀 중 needsWhitespaceTrim 이 true 인 행을 모은다.
 */
function detectWhitespace(values: string[], profile: ColumnProfile): Issue | null {
  const rows: number[] = [];
  const examples: Array<{ row: number; value: string }> = [];

  for (let r = 0; r < values.length; r++) {
    const cell = values[r] ?? "";
    if (isBlank(cell)) continue;
    if (!needsWhitespaceTrim(cell)) continue;
    rows.push(r);
    if (examples.length < MAX_EXAMPLES) examples.push({ row: r, value: cell });
  }

  if (rows.length === 0) return null;

  return {
    category: "format",
    type: "whitespace_format",
    severity: "warning",
    message: `Column "${profile.name}" has ${rows.length} cell(s) with leading/trailing, doubled, or unusual whitespace/control characters that should be trimmed.`,
    column: profile.index,
    columnName: profile.name,
    rows,
    data: { count: rows.length, examples },
  };
}

/**
 * 날짜 포맷 검사. 두 가지 Issue 를 만들 수 있다.
 *  - inconsistent_date_format: 서로 다른 shape 가 2개 이상
 *  - ambiguous_date_order: 연-후행 날짜에서 한 셀은 day-first, 다른 셀은 month-first 강제
 *
 * 컬럼 type 이 date 가 아니어도, 날짜로 인식되는 셀이 2개 이상이면 수행한다.
 */
function detectDate(values: string[], profile: ColumnProfile): Issue[] {
  const issues: Issue[] = [];

  // 날짜로 인식된 셀만 모은다.
  const dateRows: number[] = [];
  const shapeCounts: Record<string, number> = {};
  const shapeExamples: Array<{ row: number; value: string; shape: string }> = [];

  // 월/일 순서 강제 셀 추적(연-후행 한정).
  let dayFirstCase: { row: number; value: string } | null = null;
  let monthFirstCase: { row: number; value: string } | null = null;

  for (let r = 0; r < values.length; r++) {
    const cell = values[r] ?? "";
    if (isBlank(cell)) continue;
    const a = analyzeDate(cell);
    if (!a.ok || a.shape === undefined) continue;

    dateRows.push(r);
    shapeCounts[a.shape] = (shapeCounts[a.shape] ?? 0) + 1;
    if (shapeExamples.length < MAX_EXAMPLES) {
      shapeExamples.push({ row: r, value: cell, shape: a.shape });
    }

    // 연-후행(yearFirst=false) 날짜만 월/일 순서가 모호하다.
    if (a.yearFirst === false) {
      if (a.forcesDayFirst && dayFirstCase === null) {
        dayFirstCase = { row: r, value: cell };
      }
      if (a.forcesMonthFirst && monthFirstCase === null) {
        monthFirstCase = { row: r, value: cell };
      }
    }
  }

  // 날짜로 인식된 셀이 2개 미만이면 검사 의미 없음.
  if (dateRows.length < 2) return issues;

  const formats = Object.keys(shapeCounts);

  // 1) 포맷 혼용
  if (formats.length >= 2) {
    issues.push({
      category: "format",
      type: "inconsistent_date_format",
      severity: "warning",
      message: `Column "${profile.name}" mixes ${formats.length} date formats (${formats.join(", ")}); a single consistent format is recommended.`,
      column: profile.index,
      columnName: profile.name,
      rows: dateRows,
      data: {
        formats,
        counts: shapeCounts,
        examples: shapeExamples,
      },
    });
  }

  // 2) 월/일 순서 확정 충돌: 한 셀은 day-first, 다른 셀은 month-first 강제
  if (dayFirstCase !== null && monthFirstCase !== null) {
    issues.push({
      category: "format",
      type: "ambiguous_date_order",
      severity: "error",
      message: `Column "${profile.name}" has conflicting day/month order: "${dayFirstCase.value}" forces day-first while "${monthFirstCase.value}" forces month-first.`,
      column: profile.index,
      columnName: profile.name,
      rows: [dayFirstCase.row, monthFirstCase.row],
      data: {
        examples: [
          { row: dayFirstCase.row, value: dayFirstCase.value, order: "day-first" },
          { row: monthFirstCase.row, value: monthFirstCase.value, order: "month-first" },
        ],
      },
    });
  }

  return issues;
}

/**
 * 숫자 포맷 검사.
 * 컬럼 type 이 integer/decimal 일 때만 수행.
 * 통화기호 유무가 섞이거나 천단위 구분자 유무가 섞이면 Issue.
 */
function detectNumber(values: string[], profile: ColumnProfile): Issue | null {
  if (profile.type !== "integer" && profile.type !== "decimal") return null;

  let withCurrency = 0;
  let withoutCurrency = 0;
  let withGrouping = 0;
  let withoutGrouping = 0;
  const rows: number[] = [];
  const examples: Array<{ row: number; value: string }> = [];

  for (let r = 0; r < values.length; r++) {
    const cell = values[r] ?? "";
    if (isBlank(cell)) continue;

    const currency = hasCurrencySymbol(cell);
    const grouping = hasGroupingSeparator(cell);
    if (currency) withCurrency += 1;
    else withoutCurrency += 1;
    if (grouping) withGrouping += 1;
    else withoutGrouping += 1;

    rows.push(r);
    if (examples.length < MAX_EXAMPLES) examples.push({ row: r, value: cell });
  }

  const currencyMixed = withCurrency > 0 && withoutCurrency > 0;
  const groupingMixed = withGrouping > 0 && withoutGrouping > 0;
  if (!currencyMixed && !groupingMixed) return null;

  // 어떤 종류가 섞였는지 설명 문구로 정리.
  const variants: string[] = [];
  if (currencyMixed) variants.push("currency-symbol");
  if (groupingMixed) variants.push("thousands-separator");

  return {
    category: "format",
    type: "inconsistent_number_format",
    severity: "info",
    message: `Column "${profile.name}" mixes number formatting (${variants.join(", ")}); values should use a uniform representation.`,
    column: profile.index,
    columnName: profile.name,
    rows,
    data: {
      variants,
      withCurrency,
      withoutCurrency,
      withGrouping,
      withoutGrouping,
      examples,
    },
  };
}

/**
 * 포맷 일관성 검출기.
 * format.enabled 가 false 면 빈 배열을 반환한다.
 */
export function detectFormatIssues(ctx: DetectorContext): Issue[] {
  if (!ctx.options.format.enabled) return [];

  const issues: Issue[] = [];

  for (const profile of ctx.columns) {
    const values = columnValues(ctx.table, profile.index);

    const ws = detectWhitespace(values, profile);
    if (ws !== null) issues.push(ws);

    issues.push(...detectDate(values, profile));

    const num = detectNumber(values, profile);
    if (num !== null) issues.push(num);
  }

  return issues;
}
