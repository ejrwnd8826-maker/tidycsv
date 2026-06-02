/**
 * 강제변환·정규화 유틸리티.
 *
 * 포맷/이상치/정합성 검출기가 모두 공유하는 저수준 헬퍼.
 * "지저분한 문자열 -> 깔끔한 값" 변환 규칙을 한 곳에 모은다.
 */

import type { ParsedTable } from "../types.js";

// ============================================================
// 안전 접근자 (tsconfig noUncheckedIndexedAccess 대응)
// ============================================================

/** 범위를 벗어나면 빈 문자열을 돌려주는 안전한 셀 접근. */
export function cellAt(table: ParsedTable, row: number, col: number): string {
  const r = table.rows[row];
  if (r === undefined) return "";
  const c = r[col];
  return c === undefined ? "" : c;
}

/** 컬럼명 -> 인덱스. 없으면 -1. */
export function columnIndex(table: ParsedTable, name: string): number {
  return table.headers.indexOf(name);
}

/** 특정 컬럼의 모든 셀을 배열로. */
export function columnValues(table: ParsedTable, col: number): string[] {
  return table.rows.map((r) => {
    const c = r[col];
    return c === undefined ? "" : c;
  });
}

// ============================================================
// 공백·빈 값
// ============================================================

/** null/undefined/공백만 있는 문자열이면 true. */
export function isBlank(raw: string | null | undefined): boolean {
  return raw == null || raw.trim() === "";
}

/**
 * 내부 연속 공백을 1칸으로, 앞뒤 공백 제거.
 * JS \s 는 전각공백(U+3000)·NBSP(U+00A0) 등 유니코드 공백을 포함하므로
 * 한 번에 정규화된다.
 */
export function normalizeWhitespace(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * 비출력/제어 문자 포함 여부.
 * 탭(9)·개행(10)·복귀(13)는 정상으로 보고, 그 외 C0 제어문자(0~31)와
 * DEL(127)이 있으면 true. (문자코드 스캔으로 소스에 제어문자를 넣지 않는다)
 */
export function hasControlChars(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** 비표준 공백(NBSP U+00A0 / 전각공백 U+3000) 포함 여부. */
export function hasUnusualSpace(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 0x00a0 || code === 0x3000) return true;
  }
  return false;
}

/** 앞뒤 공백·이중 공백·비표준 공백·제어문자가 있어 정규화가 필요한지. */
export function needsWhitespaceTrim(raw: string): boolean {
  if (raw !== raw.trim()) return true;
  if (hasUnusualSpace(raw)) return true;
  if (/\s{2,}/.test(raw)) return true;
  if (hasControlChars(raw)) return true;
  return false;
}

// ============================================================
// 숫자 파싱
// ============================================================

/** 인식 가능한 통화기호 집합(정규화 시 제거). */
export const CURRENCY_SYMBOLS = "$₩€£¥¢₹₽元";

/**
 * 지저분한 숫자 문자열을 '정규화된 숫자 문자열'로 변환. 실패 시 null.
 * float 라운드트립을 거치지 않으므로 정밀도 손실이 없다(정제/canonical 출력용).
 *
 * 처리하는 것:
 *  - 통화기호($ KRW EUR GBP JPY ...), 공백, 퍼센트 기호
 *  - 천단위 구분자(영미식 1,234.56 / 유럽식 1.234,56)
 *  - 회계식 음수 표기 (1,234) -> -1234
 *  - 선행 +/- 부호
 *
 * 모호한 경우(콤마 하나만 있는 등)는 휴리스틱으로 결정하며,
 * 한계는 README 에 명시한다.
 *
 * 예: "$1,234.50" -> "1234.50", "(99)" -> "-99", "1.234,56" -> "1234.56"
 */
export function numericString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;

  let negative = false;
  // 회계식 괄호 음수: (1,234) -> -1234
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  // 선행 부호
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  // 통화기호·공백·퍼센트 제거
  const stripRe = new RegExp(`[\\s%${CURRENCY_SYMBOLS}]`, "g");
  s = s.replace(stripRe, "");
  if (s === "") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // 마지막에 오는 구분자를 소수점으로 간주
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // 유럽식: '.' 천단위, ',' 소수
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // 영미식: ',' 천단위, '.' 소수
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    const first = parts[0] ?? "";
    const groupsOk =
      parts.length > 1 &&
      parts.slice(1).every((p) => p.length === 3) &&
      first.length >= 1 &&
      first.length <= 3;
    const second = parts[1] ?? "";
    if (groupsOk) {
      // 천단위 구분자
      s = s.replace(/,/g, "");
    } else if (parts.length === 2 && second.length !== 3) {
      // 유럽식 소수 콤마로 간주 (예: 12,5)
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  }
  // dot 만 있거나 구분자 없음 -> 그대로

  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  // 선행 소수점 정규화(".5" -> "0.5")
  if (s.startsWith(".")) s = "0" + s;
  if (!negative) return s;
  // -0 / -0.0 방지
  if (/^0(\.0+)?$/.test(s)) return s;
  return "-" + s;
}

/**
 * 지저분한 숫자 문자열을 number 로 파싱. 실패 시 null.
 * 내부적으로 numericString() 으로 정리한 뒤 Number() 변환한다.
 */
export function parseNumber(raw: string | null | undefined): number | null {
  const s = numericString(raw);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** parseNumber 가 성공하면 true(숫자로 해석 가능). */
export function looksNumeric(raw: string): boolean {
  return parseNumber(raw) !== null;
}

/** 정수(소수부 없음)로 파싱되는가. */
export function looksInteger(raw: string): boolean {
  const n = parseNumber(raw);
  return n !== null && Number.isInteger(n);
}

// ============================================================
// 불리언 파싱
// ============================================================

const TRUE_TOKENS = new Set(["true", "yes", "y", "1", "t"]);
const FALSE_TOKENS = new Set(["false", "no", "n", "0", "f"]);
// 1/0 은 정수로도 해석되므로, 셀 타입 추론에서 boolean 판정에는 제외한다.
const TRUE_TEXT_TOKENS = new Set(["true", "yes", "y", "t"]);
const FALSE_TEXT_TOKENS = new Set(["false", "no", "n", "f"]);

/** 불리언으로 해석(1/0 포함). 실패 시 null. */
export function parseBoolean(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;
  if (TRUE_TOKENS.has(s)) return true;
  if (FALSE_TOKENS.has(s)) return false;
  return null;
}

export function looksBoolean(raw: string): boolean {
  return parseBoolean(raw) !== null;
}

/** 숫자 1/0 을 제외한 '텍스트' 불리언 토큰인지(타입 추론용). */
export function looksBooleanText(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return TRUE_TEXT_TOKENS.has(s) || FALSE_TEXT_TOKENS.has(s);
}
