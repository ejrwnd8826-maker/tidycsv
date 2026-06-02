import { describe, expect, it } from "vitest";
import { analyzeDate, looksDate } from "./datetime.js";

describe("analyzeDate - 연 선행", () => {
  it("ISO YYYY-MM-DD 를 인식한다", () => {
    const a = analyzeDate("2024-01-15");
    expect(a.ok).toBe(true);
    expect(a.shape).toBe("YYYY-MM-DD");
    expect(a.yearFirst).toBe(true);
    expect(a.separator).toBe("-");
  });
  it("YYYY/MM/DD, YYYY.MM.DD 도 인식한다", () => {
    expect(analyzeDate("2024/01/15").shape).toBe("YYYY/MM/DD");
    expect(analyzeDate("2024.01.15").shape).toBe("YYYY.MM.DD");
  });
  it("시간 부분을 분리한다", () => {
    const a = analyzeDate("2024-01-15 13:45:00");
    expect(a.ok).toBe(true);
    expect(a.hasTime).toBe(true);
    expect(a.shape).toBe("YYYY-MM-DD");
  });
  it("잘못된 월/일은 거부한다", () => {
    expect(analyzeDate("2024-13-01").ok).toBe(false);
    expect(analyzeDate("2024-02-40").ok).toBe(false);
  });
});

describe("analyzeDate - 연 후행(모호성)", () => {
  it("DD/MM/YYYY shape 로 묶는다", () => {
    const a = analyzeDate("05/12/2024");
    expect(a.ok).toBe(true);
    expect(a.shape).toBe("DD/MM/YYYY");
    expect(a.yearFirst).toBe(false);
    expect(a.forcesDayFirst).toBe(false);
    expect(a.forcesMonthFirst).toBe(false);
  });
  it("첫째>12 이면 일 우선이 강제된다", () => {
    const a = analyzeDate("25/03/2024");
    expect(a.ok).toBe(true);
    expect(a.forcesDayFirst).toBe(true);
    expect(a.forcesMonthFirst).toBe(false);
  });
  it("둘째>12 이면 월 우선이 강제된다", () => {
    const a = analyzeDate("03/25/2024");
    expect(a.ok).toBe(true);
    expect(a.forcesDayFirst).toBe(false);
    expect(a.forcesMonthFirst).toBe(true);
  });
  it("둘 다 12 초과면 무효", () => {
    expect(analyzeDate("25/25/2024").ok).toBe(false);
  });
});

describe("analyzeDate - 월 이름", () => {
  it("Mon DD, YYYY 를 인식한다", () => {
    expect(analyzeDate("Jan 5, 2024").shape).toBe("MMM DD, YYYY");
    expect(analyzeDate("January 5 2024").shape).toBe("MMM DD, YYYY");
  });
  it("DD Mon YYYY 를 인식한다", () => {
    expect(analyzeDate("5 Jan 2024").shape).toBe("DD MMM YYYY");
  });
});

describe("looksDate", () => {
  it("날짜/비날짜를 구분한다", () => {
    expect(looksDate("2024-01-15")).toBe(true);
    expect(looksDate("hello")).toBe(false);
    expect(looksDate("")).toBe(false);
    expect(looksDate("12345")).toBe(false);
  });
});
