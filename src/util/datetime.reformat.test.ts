import { describe, expect, it } from "vitest";
import { analyzeDate, reformatDate } from "./datetime.js";

describe("analyzeDate — 연/월/일 구성요소(모호하지 않을 때만)", () => {
  it("연-선행은 항상 구성요소를 채운다", () => {
    const a = analyzeDate("2024-03-07");
    expect([a.year, a.month, a.day]).toEqual([2024, 3, 7]);
  });
  it("연-후행 강제(첫째>12)는 일-우선으로 확정", () => {
    const a = analyzeDate("25/03/2024");
    expect([a.year, a.month, a.day]).toEqual([2024, 3, 25]);
  });
  it("연-후행 강제(둘째>12)는 월-우선으로 확정", () => {
    const a = analyzeDate("03/25/2024");
    expect([a.year, a.month, a.day]).toEqual([2024, 3, 25]);
  });
  it("모호한 연-후행(둘 다 12 이하)은 구성요소를 안 채운다", () => {
    const a = analyzeDate("05/06/2024");
    expect(a.ok).toBe(true);
    expect(a.year).toBeUndefined();
    expect(a.month).toBeUndefined();
    expect(a.day).toBeUndefined();
  });
  it("월 이름형도 구성요소를 채운다", () => {
    expect([analyzeDate("Jan 5, 2024").month, analyzeDate("Jan 5, 2024").day]).toEqual([1, 5]);
    expect(analyzeDate("5 Mar 2024").month).toBe(3);
  });
});

describe("reformatDate — 안전할 때만 변환", () => {
  it("연-선행을 ISO 로", () => {
    expect(reformatDate("2024/3/7")).toBe("2024-03-07");
    expect(reformatDate("2024.03.07")).toBe("2024-03-07");
  });
  it("강제된 연-후행을 ISO 로", () => {
    expect(reformatDate("25/03/2024")).toBe("2024-03-25");
    expect(reformatDate("03/25/2024")).toBe("2024-03-25");
  });
  it("목표 포맷 슬래시 지원", () => {
    expect(reformatDate("2024-03-07", "YYYY/MM/DD")).toBe("2024/03/07");
  });
  it("모호한 날짜는 변환하지 않는다(null)", () => {
    expect(reformatDate("05/06/2024")).toBeNull();
  });
  it("시간 포함은 변환하지 않는다(손실 방지)", () => {
    expect(reformatDate("2024-03-07 13:45")).toBeNull();
  });
  it("날짜가 아니면 null", () => {
    expect(reformatDate("hello")).toBeNull();
  });
});
