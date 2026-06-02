/**
 * 달력 유효성 회귀 테스트.
 *
 * 적대적 리뷰에서 발견된 진짜 버그: validDay 가 월 무관 1~31 을 허용해
 * 2024-02-30, 2023-02-29(비윤년), 4/31 같은 '존재하지 않는 날짜'를
 * 유효 날짜로 인식하고 정규화까지 하던 문제. 월별 일수·윤년 검증으로 수정함.
 */

import { describe, expect, it } from "vitest";
import { analyzeDate, reformatDate } from "./datetime.js";

describe("analyzeDate — 달력상 불가능한 날짜 거부", () => {
  it("존재하지 않는 날짜를 거부한다", () => {
    expect(analyzeDate("2024-02-30").ok).toBe(false);
    expect(analyzeDate("2024-04-31").ok).toBe(false);
    expect(analyzeDate("2024-00-10").ok).toBe(false);
    expect(analyzeDate("31/04/2024").ok).toBe(false); // 4월 31일 없음
    expect(analyzeDate("Feb 30, 2024").ok).toBe(false);
  });

  it("윤년 2월 29일을 정확히 구분한다", () => {
    expect(analyzeDate("2024-02-29").ok).toBe(true); // 2024 윤년
    expect(analyzeDate("2023-02-29").ok).toBe(false); // 2023 비윤년
    expect(analyzeDate("2000-02-29").ok).toBe(true); // 400 배수 → 윤년
    expect(analyzeDate("1900-02-29").ok).toBe(false); // 100 배수, 400 아님 → 비윤년
  });

  it("연도 범위 밖(0000)은 거부", () => {
    expect(analyzeDate("0000-01-01").ok).toBe(false);
  });

  it("존재하지 않는 날짜는 정규화하지 않는다", () => {
    expect(reformatDate("02/30/2024")).toBeNull();
    expect(reformatDate("2023-02-29")).toBeNull();
  });

  it("정상 날짜는 그대로 인식·정규화한다", () => {
    expect(analyzeDate("2024-04-30").ok).toBe(true);
    expect(reformatDate("30/04/2024")).toBe("2024-04-30");
  });

  it("헛값 시간(25:99)은 시간으로 보지 않아 날짜 인식이 실패한다", () => {
    expect(analyzeDate("2024-01-15 25:99").ok).toBe(false);
    expect(analyzeDate("2024-01-15 13:45").ok).toBe(true); // 정상 시간은 OK
  });
});
