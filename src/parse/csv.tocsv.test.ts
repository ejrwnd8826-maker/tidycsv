import { describe, expect, it } from "vitest";
import { parseCsv, tableFromRows, toCsv } from "./csv.js";

describe("toCsv", () => {
  it("헤더와 행을 CSV 로 직렬화한다", () => {
    const t = tableFromRows(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(toCsv(t)).toBe("a,b\n1,2\n3,4");
  });

  it("콤마·따옴표가 든 셀을 올바르게 인용한다(round-trip)", () => {
    const t = tableFromRows(
      ["name", "note"],
      [["Alice", "hello, world"], ["Bob", 'say "hi"']],
    );
    const csv = toCsv(t);
    const reparsed = parseCsv(csv);
    expect(reparsed.rows[0]).toEqual(["Alice", "hello, world"]);
    expect(reparsed.rows[1]).toEqual(["Bob", 'say "hi"']);
  });

  it("빈 테이블(헤더만)도 안전하게 처리한다", () => {
    const t = tableFromRows(["x"], []);
    const csv = toCsv(t);
    expect(csv.trim()).toBe("x");
    const reparsed = parseCsv(csv);
    expect(reparsed.headers).toEqual(["x"]);
    expect(reparsed.rowCount).toBe(0);
  });
});
