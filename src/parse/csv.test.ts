import { describe, expect, it } from "vitest";
import { parseCsv, tableFromRows } from "./csv.js";

describe("parseCsv", () => {
  it("헤더 + 데이터 행을 파싱한다", () => {
    const t = parseCsv("name,age\nAlice,30\nBob,25");
    expect(t.headers).toEqual(["name", "age"]);
    expect(t.rowCount).toBe(2);
    expect(t.columnCount).toBe(2);
    expect(t.rows[0]).toEqual(["Alice", "30"]);
    expect(t.rows[1]).toEqual(["Bob", "25"]);
  });

  it("빈 줄을 건너뛴다", () => {
    const t = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(t.rowCount).toBe(2);
  });

  it("행 길이가 헤더보다 짧으면 빈 문자열로 패딩한다", () => {
    const t = parseCsv("a,b,c\n1,2");
    expect(t.rows[0]).toEqual(["1", "2", ""]);
  });

  it("따옴표 안 콤마를 보존한다", () => {
    const t = parseCsv('name,note\nAlice,"hello, world"');
    expect(t.rows[0]).toEqual(["Alice", "hello, world"]);
  });

  it("모든 셀을 문자열로 유지한다(자동 형변환 안 함)", () => {
    const t = parseCsv("n\n007");
    expect(t.rows[0]?.[0]).toBe("007");
  });

  it("hasHeader=false 면 col0,col1 헤더를 만든다", () => {
    const t = parseCsv("1,2\n3,4", { hasHeader: false });
    expect(t.headers).toEqual(["col0", "col1"]);
    expect(t.rowCount).toBe(2);
  });

  it("빈 헤더 셀은 colN 으로 대체한다", () => {
    const t = parseCsv("name,,city\nA,B,C");
    expect(t.headers).toEqual(["name", "col1", "city"]);
  });
});

describe("tableFromRows", () => {
  it("배열로부터 테이블을 만든다", () => {
    const t = tableFromRows(["x", "y"], [["1", "2"], ["3"]]);
    expect(t.columnCount).toBe(2);
    expect(t.rowCount).toBe(2);
    expect(t.rows[1]).toEqual(["3", ""]);
  });
});
