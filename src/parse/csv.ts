/**
 * CSV 파싱 레이어 — Papa Parse 래퍼.
 *
 * 지저분한 CSV 텍스트를 검출기가 소비하는 표준 ParsedTable 로 변환한다.
 * 모든 셀은 문자열로 유지하며(자동 형변환 안 함), 행 길이를 헤더에 맞춰 정규화한다.
 */

import Papa from "papaparse";
import type { Cell, ParsedTable } from "../types.js";

/** CSV 파싱 옵션. */
export interface ParseCsvOptions {
  /** 첫 행을 헤더로 사용(기본 true). false 면 col0, col1 … 자동 생성. */
  hasHeader?: boolean;
  /** 구분자 강제 지정(미지정 시 Papa Parse 자동 감지). */
  delimiter?: string;
}

/** 헤더 길이에 맞춰 행을 패딩/절단한다. */
function normalizeRow(row: string[], width: number): Cell[] {
  const out: Cell[] = new Array<Cell>(width);
  for (let i = 0; i < width; i++) {
    const v = row[i];
    out[i] = v === undefined || v === null ? "" : String(v);
  }
  return out;
}

/** ParsedTable 을 CSV 문자열로 직렬화(정제 결과 다운로드용). */
export function toCsv(table: ParsedTable): string {
  return Papa.unparse(
    {
      fields: table.headers,
      data: table.rows.map((r) => [...r]),
    },
    { newline: "\n" },
  );
}

/** 문자열 2차원 배열로부터 직접 ParsedTable 생성(프로그램/테스트용). */
export function tableFromRows(headers: string[], rows: string[][]): ParsedTable {
  const width = headers.length;
  const normRows = rows.map((r) => normalizeRow(r, width));
  return {
    headers: [...headers],
    rows: normRows,
    rowCount: normRows.length,
    columnCount: width,
  };
}

/**
 * CSV 텍스트를 파싱해 ParsedTable 로 변환.
 */
export function parseCsv(text: string, opts: ParseCsvOptions = {}): ParsedTable {
  const hasHeader = opts.hasHeader ?? true;

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    delimiter: opts.delimiter ?? "",
  });

  const raw: string[][] = (result.data as unknown[][]).map((row) =>
    (Array.isArray(row) ? row : [row]).map((c) =>
      c === undefined || c === null ? "" : String(c),
    ),
  );

  const parseErrors = result.errors.map(
    (e) => `${e.type}: ${e.message}${e.row != null ? ` (row ${e.row})` : ""}`,
  );
  const delimiter = result.meta?.delimiter;

  if (raw.length === 0) {
    return {
      headers: [],
      rows: [],
      rowCount: 0,
      columnCount: 0,
      meta: { delimiter, parseErrors },
    };
  }

  let headers: string[];
  let bodyRows: string[][];

  if (hasHeader) {
    headers = (raw[0] as string[]).map((h, i) => (h.trim() === "" ? `col${i}` : h));
    bodyRows = raw.slice(1);
  } else {
    // 헤더 없음: 최대 열 수만큼 col0, col1 … 생성
    const width = Math.max(...raw.map((r) => r.length));
    headers = Array.from({ length: width }, (_, i) => `col${i}`);
    bodyRows = raw;
  }

  const width = headers.length;
  const rows = bodyRows.map((r) => normalizeRow(r, width));

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: width,
    meta: { delimiter, parseErrors },
  };
}
