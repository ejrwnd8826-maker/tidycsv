import { describe, expect, it } from "vitest";
import { numericString } from "./coerce.js";

describe("numericString — 정규화된 숫자 문자열(정밀도 무손실)", () => {
  it("통화·천단위·퍼센트를 제거해 깔끔한 문자열로", () => {
    expect(numericString("$1,234.50")).toBe("1234.50");
    expect(numericString("1,000")).toBe("1000");
    expect(numericString(" 50% ")).toBe("50");
  });
  it("유럽식을 영미식 문자열로 정규화", () => {
    expect(numericString("1.234,56")).toBe("1234.56");
    expect(numericString("12,5")).toBe("12.5");
  });
  it("회계식 괄호 음수(앞뒤 공백 포함도 정상 — trim 선행)", () => {
    expect(numericString("(1,234)")).toBe("-1234");
    expect(numericString("( 1,234 ) ")).toBe("-1234");
    expect(numericString(" ($99) ")).toBe("-99");
  });
  it("선행 소수점 정규화", () => {
    expect(numericString(".5")).toBe("0.5");
  });
  it("-0 을 0 으로", () => {
    expect(numericString("(0)")).toBe("0");
    expect(numericString("-0.00")).toBe("0.00");
  });
  it("트레일링 0 등 원본 정밀도 보존(float 라운드트립 없음)", () => {
    expect(numericString("1000.50")).toBe("1000.50");
    expect(numericString("0.10")).toBe("0.10");
  });
  it("숫자가 아니면 null", () => {
    expect(numericString("abc")).toBeNull();
    expect(numericString("")).toBeNull();
    expect(numericString(null)).toBeNull();
  });
});
