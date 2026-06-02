import { describe, expect, it } from "vitest";
import { tableFromRows } from "../parse/csv.js";
import {
  buildColumnProfiles,
  computeNumericStats,
  inferCellType,
  profileColumn,
} from "./columns.js";

describe("inferCellType", () => {
  it("기본 타입을 추론한다", () => {
    expect(inferCellType("")).toBe("empty");
    expect(inferCellType("   ")).toBe("empty");
    expect(inferCellType("42")).toBe("integer");
    expect(inferCellType("1,000")).toBe("integer");
    expect(inferCellType("3.14")).toBe("decimal");
    expect(inferCellType("true")).toBe("boolean");
    expect(inferCellType("2024-01-15")).toBe("date");
    expect(inferCellType("hello")).toBe("string");
  });
  it("1/0 은 boolean 이 아니라 integer", () => {
    expect(inferCellType("1")).toBe("integer");
    expect(inferCellType("0")).toBe("integer");
  });
});

describe("computeNumericStats", () => {
  it("기술통계를 계산한다", () => {
    const s = computeNumericStats([1, 2, 3, 4, 5]);
    expect(s.count).toBe(5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.sum).toBe(15);
    expect(s.q1).toBe(2);
    expect(s.q3).toBe(4);
    expect(s.iqr).toBe(2);
    expect(s.stdev).toBeCloseTo(1.5811, 3);
  });
  it("빈 배열은 NaN/0 으로 안전 처리한다", () => {
    const s = computeNumericStats([]);
    expect(s.count).toBe(0);
    expect(s.stdev).toBe(0);
  });
});

describe("profileColumn / buildColumnProfiles", () => {
  const table = tableFromRows(
    ["id", "amount", "date", "active", "note"],
    [
      ["1", "1,000", "2024-01-01", "true", "alpha"],
      ["2", "2,500", "2024-01-02", "false", "beta"],
      ["3", "3.5", "2024-01-03", "yes", ""],
      ["4", "", "2024-01-04", "no", "alpha"],
    ],
  );

  it("숫자 컬럼을 추론하고 통계를 채운다", () => {
    const p = profileColumn(table, 1);
    expect(["integer", "decimal"]).toContain(p.type);
    expect(p.numeric).toBeDefined();
    expect(p.numeric?.count).toBe(3);
    expect(p.emptyCount).toBe(1);
  });

  it("날짜 컬럼의 포맷을 수집한다", () => {
    const p = profileColumn(table, 2);
    expect(p.type).toBe("date");
    expect(p.dateFormats).toEqual(["YYYY-MM-DD"]);
  });

  it("불리언 컬럼을 추론한다", () => {
    const p = profileColumn(table, 3);
    expect(p.type).toBe("boolean");
    expect(p.typeConfidence).toBe(1);
  });

  it("고유값 수를 센다", () => {
    const p = profileColumn(table, 4); // note: alpha,beta,alpha + 빈값
    expect(p.distinctCount).toBe(2);
    expect(p.emptyCount).toBe(1);
  });

  it("전체 프로파일 길이는 컬럼 수와 같다", () => {
    const profiles = buildColumnProfiles(table);
    expect(profiles).toHaveLength(5);
    expect(profiles.map((p) => p.name)).toEqual([
      "id",
      "amount",
      "date",
      "active",
      "note",
    ]);
  });
});
