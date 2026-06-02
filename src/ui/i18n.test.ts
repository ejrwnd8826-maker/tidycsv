import { describe, expect, it } from "vitest";
import type { Issue } from "../types.js";
import { getLocale, localizeIssueMessage, setLocale, t } from "./i18n.js";

describe("t() — 사전 조회 + 치환", () => {
  it("ko/en 라벨", () => {
    setLocale("ko");
    expect(getLocale()).toBe("ko");
    expect(t("summary.total")).toBe("총 이슈");
    expect(t("file.label", { name: "a.csv", rows: 10 })).toBe("a.csv — 10행");
    setLocale("en");
    expect(t("summary.total")).toBe("Total issues");
    expect(t("file.label", { name: "a.csv", rows: 10 })).toBe("a.csv — 10 rows");
  });

  it("미정의 키는 키 자체 반환", () => {
    setLocale("ko");
    expect(t("no.such.key")).toBe("no.such.key");
  });
});

describe("localizeIssueMessage", () => {
  const sum: Issue = {
    category: "integrity",
    type: "sum_mismatch",
    severity: "error",
    message: "sum of [a, b] does not equal 'c' in 1 row(s)",
    rows: [4],
    data: { components: ["a", "b"], total: "c" },
  };

  it("en 은 엔진의 영어 메시지를 그대로", () => {
    setLocale("en");
    expect(localizeIssueMessage(sum)).toBe(sum.message);
  });

  it("ko 는 type+data 로 한국어 재구성", () => {
    setLocale("ko");
    const m = localizeIssueMessage(sum);
    expect(m).toContain("합계 불일치");
    expect(m).toContain("a + b");
    expect(m).toContain("c");
  });

  it("ko 미정의 타입은 영어 원문 유지", () => {
    setLocale("ko");
    const i: Issue = {
      category: "integrity",
      type: "integrity_unknown_column",
      severity: "error",
      message: "column 'x' not found",
    };
    expect(localizeIssueMessage(i)).toBe("column 'x' not found");
  });

  it("ko: 컬럼 기반 메시지", () => {
    setLocale("ko");
    const i: Issue = {
      category: "outlier",
      type: "missing_value",
      severity: "warning",
      message: 'Column "total" has 1 missing value(s).',
      rows: [6],
      columnName: "total",
    };
    expect(localizeIssueMessage(i)).toBe('컬럼 "total"에 빈 값 1개');
  });
});
