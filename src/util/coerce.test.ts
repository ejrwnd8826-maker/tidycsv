import { describe, expect, it } from "vitest";
import {
  hasControlChars,
  hasUnusualSpace,
  isBlank,
  looksBoolean,
  looksBooleanText,
  looksInteger,
  looksNumeric,
  needsWhitespaceTrim,
  normalizeWhitespace,
  parseBoolean,
  parseNumber,
} from "./coerce.js";

// 특수 문자는 소스에 리터럴로 넣지 않고 코드포인트로 생성한다(결정성 확보).
const NBSP = String.fromCharCode(0x00a0); // non-breaking space
const FULLWIDTH = String.fromCharCode(0x3000); // 전각 공백
const NULLCHAR = String.fromCharCode(0); // 제어문자(NUL)
const WON = String.fromCharCode(0x20a9); // 원화 기호

describe("isBlank", () => {
  it("빈 문자열·공백·null·undefined 를 빈 값으로 본다", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("a")).toBe(false);
    expect(isBlank("0")).toBe(false);
  });
});

describe("normalizeWhitespace", () => {
  it("앞뒤·연속 공백을 정리한다", () => {
    expect(normalizeWhitespace("  hello   world  ")).toBe("hello world");
  });
  it("NBSP·전각공백도 정규화한다", () => {
    expect(normalizeWhitespace(`a${NBSP}b`)).toBe("a b");
    expect(normalizeWhitespace(`a${FULLWIDTH}b`)).toBe("a b");
  });
});

describe("hasControlChars / hasUnusualSpace / needsWhitespaceTrim", () => {
  it("제어문자를 감지한다(탭·개행 제외)", () => {
    expect(hasControlChars(`a${NULLCHAR}b`)).toBe(true);
    expect(hasControlChars("a\tb")).toBe(false);
    expect(hasControlChars("a\nb")).toBe(false);
    expect(hasControlChars("normal")).toBe(false);
  });
  it("비표준 공백을 감지한다", () => {
    expect(hasUnusualSpace(`a${NBSP}b`)).toBe(true);
    expect(hasUnusualSpace(`a${FULLWIDTH}b`)).toBe(true);
    expect(hasUnusualSpace("a b")).toBe(false);
  });
  it("정규화 필요 여부를 종합 판정한다", () => {
    expect(needsWhitespaceTrim(" x")).toBe(true);
    expect(needsWhitespaceTrim("x ")).toBe(true);
    expect(needsWhitespaceTrim("a  b")).toBe(true);
    expect(needsWhitespaceTrim(`a${NBSP}b`)).toBe(true);
    expect(needsWhitespaceTrim("clean value")).toBe(false);
  });
});

describe("parseNumber", () => {
  it("기본 정수·소수를 파싱한다", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("3.14")).toBe(3.14);
    expect(parseNumber("-7")).toBe(-7);
    expect(parseNumber("+8")).toBe(8);
    expect(parseNumber(".5")).toBe(0.5);
  });
  it("천단위 콤마(영미식)를 처리한다", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("1,234,567")).toBe(1234567);
    expect(parseNumber("1,234.56")).toBe(1234.56);
  });
  it("유럽식(점=천단위, 콤마=소수)을 처리한다", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1.234.567,89")).toBe(1234567.89);
  });
  it("콤마 단독 소수(유럽식)를 휴리스틱 처리한다", () => {
    expect(parseNumber("12,5")).toBe(12.5);
  });
  it("통화기호·공백·퍼센트를 제거한다", () => {
    expect(parseNumber("$1,000")).toBe(1000);
    expect(parseNumber(`${WON}12,345`)).toBe(12345);
    expect(parseNumber(" 50% ")).toBe(50);
  });
  it("회계식 괄호 음수를 처리한다", () => {
    expect(parseNumber("(1,234)")).toBe(-1234);
    expect(parseNumber("(99)")).toBe(-99);
  });
  it("숫자가 아니면 null", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("12abc")).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe("looksInteger / looksNumeric", () => {
  it("정수/실수를 구분한다", () => {
    expect(looksInteger("100")).toBe(true);
    expect(looksInteger("1,000")).toBe(true);
    expect(looksInteger("1.5")).toBe(false);
    expect(looksNumeric("1.5")).toBe(true);
    expect(looksNumeric("xyz")).toBe(false);
  });
});

describe("parseBoolean / looksBooleanText", () => {
  it("불리언 토큰을 해석한다", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("No")).toBe(false);
    expect(parseBoolean("Y")).toBe(true);
    expect(parseBoolean("1")).toBe(true);
    expect(parseBoolean("0")).toBe(false);
    expect(parseBoolean("maybe")).toBeNull();
  });
  it("looksBooleanText 는 1/0 을 불리언으로 보지 않는다", () => {
    expect(looksBooleanText("true")).toBe(true);
    expect(looksBooleanText("no")).toBe(true);
    expect(looksBooleanText("1")).toBe(false);
    expect(looksBooleanText("0")).toBe(false);
    expect(looksBoolean("1")).toBe(true);
  });
});
