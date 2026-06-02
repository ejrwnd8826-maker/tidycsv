import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCsv, tableFromRows, toCsv } from "../parse/csv.js";
import { cleanTable } from "./clean.js";

function loadExample(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../examples/${name}`, import.meta.url)),
    "utf8",
  );
}

describe("cleanTable — 적용 순서·불변성", () => {
  it("정규화 후 동일해진 행을 중복 제거한다(순서 검증)", () => {
    const table = tableFromRows(
      ["id", "name"],
      [
        ["1", "Alice"],
        ["2", "Bob"],
        ["1", " Alice "], // 공백 정리 후 행 0 과 동일 → 제거되어야
      ],
    );
    const result = cleanTable(table);
    expect(result.table.rowCount).toBe(2);
    expect(result.removedRows.map((r) => r.row)).toEqual([2]);
    expect(result.removedRows[0]!.keptRow).toBe(0);
    // 공백 정리 변경이 기록됐는지
    expect(
      result.cellChanges.some(
        (c) => c.fixer === "whitespace" && c.row === 2 && c.after === "Alice",
      ),
    ).toBe(true);
  });

  it("원본 테이블을 변경하지 않는다(불변)", () => {
    const table = tableFromRows(["a"], [[" x "], [" x "]]);
    cleanTable(table);
    expect(table.rows[0]).toEqual([" x "]);
    expect(table.rowCount).toBe(2);
  });

  it("옵션으로 개별 fixer 를 끌 수 있다", () => {
    const table = tableFromRows(["a"], [[" x "], [" x "]]);
    const result = cleanTable(table, {
      whitespace: false,
      removeDuplicates: false,
    });
    expect(result.cellChanges).toEqual([]);
    expect(result.removedRows).toEqual([]);
    expect(result.table.rowCount).toBe(2);
  });
});

describe("cleanTable — messy-orders.csv 통합", () => {
  const table = parseCsv(loadExample("messy-orders.csv"));
  const result = cleanTable(table);

  it("정확 중복 행(행 2)을 제거한다", () => {
    expect(table.rowCount).toBe(8);
    expect(result.table.rowCount).toBe(7);
    expect(result.removedRows.map((r) => r.row)).toEqual([2]);
  });

  it("customer 의 공백을 정리한다", () => {
    expect(
      result.cellChanges.some(
        (c) => c.fixer === "whitespace" && c.columnName === "customer",
      ),
    ).toBe(true);
  });

  it("숫자 컬럼의 천단위 콤마를 제거한다('1,200' → '1200')", () => {
    expect(
      result.cellChanges.some(
        (c) => c.fixer === "number_format" && c.after === "1200",
      ),
    ).toBe(true);
  });

  it("정제 결과를 CSV 로 직렬화하면 다시 파싱 가능하다", () => {
    const csv = toCsv(result.table);
    const reparsed = parseCsv(csv);
    expect(reparsed.headers).toEqual(result.table.headers);
    expect(reparsed.rowCount).toBe(result.table.rowCount);
  });
});
