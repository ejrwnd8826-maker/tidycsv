import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { isXlsxFilename, parseXlsx } from "./xlsx.js";

/** 메모리상 .xlsx 바이트 생성. */
function makeWorkbook(aoa: unknown[][], sheetName = "Sheet1"): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

describe("parseXlsx", () => {
  it("헤더 + 데이터 행을 파싱한다", () => {
    const buf = makeWorkbook([
      ["name", "amount"],
      ["Alice", 1000],
      ["Bob", 2500],
    ]);
    const t = parseXlsx(buf);
    expect(t.headers).toEqual(["name", "amount"]);
    expect(t.rowCount).toBe(2);
    expect(t.columnCount).toBe(2);
    expect(t.rows[0]).toEqual(["Alice", "1000"]);
    expect(t.rows[1]).toEqual(["Bob", "2500"]);
  });

  it("모든 셀을 문자열로 변환한다(숫자 포함)", () => {
    const buf = makeWorkbook([["n"], [42], [3.5]]);
    const t = parseXlsx(buf);
    expect(t.rows[0]?.[0]).toBe("42");
    expect(t.rows[1]?.[0]).toBe("3.5");
    expect(typeof t.rows[0]?.[0]).toBe("string");
  });

  it("짧은 행을 헤더 폭에 맞춰 패딩한다", () => {
    const buf = makeWorkbook([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
    const t = parseXlsx(buf);
    expect(t.rows[0]).toEqual(["1", "2", ""]);
  });

  it("hasHeader=false 면 colN 헤더 생성", () => {
    const buf = makeWorkbook([
      ["1", "2"],
      ["3", "4"],
    ]);
    const t = parseXlsx(buf, { hasHeader: false });
    expect(t.headers).toEqual(["col0", "col1"]);
    expect(t.rowCount).toBe(2);
  });
});

describe("isXlsxFilename", () => {
  it("엑셀 확장자를 구분한다", () => {
    expect(isXlsxFilename("data.xlsx")).toBe(true);
    expect(isXlsxFilename("DATA.XLS")).toBe(true);
    expect(isXlsxFilename("report.csv")).toBe(false);
    expect(isXlsxFilename("noext")).toBe(false);
  });
});
