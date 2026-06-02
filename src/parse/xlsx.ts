/**
 * 엑셀(.xlsx/.xls) 파싱 레이어 — SheetJS 래퍼.
 *
 * 워크북의 한 시트를 표준 ParsedTable 로 변환한다. 모든 셀은 '표시 형식'
 * 문자열(raw:false)로 가져와 CSV 와 동일하게 문자열로 다룬다(숫자/날짜 포함).
 */

import * as XLSX from "xlsx";
import type { Cell, ParsedTable } from "../types.js";

export interface ParseXlsxOptions {
  /** 첫 행을 헤더로(기본 true). */
  hasHeader?: boolean;
  /** 읽을 시트명(미지정 시 첫 시트). */
  sheet?: string;
}

function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

/** ArrayBuffer/Uint8Array(엑셀 바이트)를 ParsedTable 로 변환. */
export function parseXlsx(
  data: ArrayBuffer | Uint8Array,
  opts: ParseXlsxOptions = {},
): ParsedTable {
  const hasHeader = opts.hasHeader ?? true;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: "array" });

  const sheetName = opts.sheet ?? wb.SheetNames[0];
  const sheet = sheetName === undefined ? undefined : wb.Sheets[sheetName];
  if (sheet === undefined) {
    return { headers: [], rows: [], rowCount: 0, columnCount: 0 };
  }

  // 표시 형식 문자열로 행렬 추출(숫자/날짜도 보이는 그대로).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  const raw: string[][] = aoa.map((row) =>
    (Array.isArray(row) ? row : [row]).map(toStr),
  );

  if (raw.length === 0) {
    return { headers: [], rows: [], rowCount: 0, columnCount: 0 };
  }

  let headers: string[];
  let bodyRows: string[][];
  if (hasHeader) {
    headers = (raw[0] as string[]).map((h, i) =>
      h.trim() === "" ? `col${i}` : h,
    );
    bodyRows = raw.slice(1);
  } else {
    const width = Math.max(...raw.map((r) => r.length));
    headers = Array.from({ length: width }, (_, i) => `col${i}`);
    bodyRows = raw;
  }

  const width = headers.length;
  const rows: Cell[][] = bodyRows.map((r) => {
    const out: Cell[] = new Array<Cell>(width);
    for (let i = 0; i < width; i++) out[i] = r[i] ?? "";
    return out;
  });

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: width,
    meta: { delimiter: undefined, parseErrors: [] },
  };
}

/** 파일명이 엑셀 확장자인지. */
export function isXlsxFilename(name: string): boolean {
  return /\.(xlsx|xls|xlsm)$/i.test(name);
}
