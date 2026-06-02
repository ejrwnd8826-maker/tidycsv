/**
 * 정제(clean) 오케스트레이터.
 *
 * fixer 들을 정해진 순서로 적용한다:
 *   1) 공백 정규화 → 2) 숫자 포맷 → 3) 날짜 포맷 → 4) 정확 중복 제거
 * 중복 제거를 '맨 마지막'에 두는 이유: 앞 단계 정규화 후에야
 * (" Alice" vs "Alice" 처럼) 동일해진 행들이 올바르게 합쳐진다.
 *
 * 원본 테이블은 변경하지 않고 새 ParsedTable 을 반환한다.
 */

import { buildColumnProfiles } from "../infer/columns.js";
import type { ParsedTable } from "../types.js";
import {
  fixDateFormat,
  fixDuplicates,
  fixNumberFormat,
  fixWhitespace,
} from "./fixers.js";
import { resolveCleanOptions } from "./options.js";
import type { CellChange, CleanOptions, CleanResult, FixerName, RowRemoval } from "./types.js";

export function cleanTable(
  table: ParsedTable,
  options?: CleanOptions,
): CleanResult {
  const opts = resolveCleanOptions(options);
  const columns = buildColumnProfiles(table);

  // 작업용 깊은 복사(원본 불변).
  const work: string[][] = table.rows.map((r) => [...r]);
  const cellChanges: CellChange[] = [];

  /** 셀 변경안을 작업 행에 적용하고 기록. */
  const applyCellChanges = (changes: CellChange[]): void => {
    for (const change of changes) {
      const row = work[change.row];
      if (row !== undefined) row[change.column] = change.after;
      cellChanges.push(change);
    }
  };

  if (opts.whitespace) applyCellChanges(fixWhitespace(work, columns));
  if (opts.numberFormat) applyCellChanges(fixNumberFormat(work, columns));
  if (opts.dateFormat) {
    applyCellChanges(fixDateFormat(work, columns, opts.dateTarget));
  }

  const removedRows: RowRemoval[] = opts.removeDuplicates
    ? fixDuplicates(work)
    : [];
  const removedSet = new Set(removedRows.map((r) => r.row));
  const finalRows = work.filter((_, i) => !removedSet.has(i));

  const cleanedTable: ParsedTable = {
    headers: [...table.headers],
    rows: finalRows,
    rowCount: finalRows.length,
    columnCount: table.columnCount,
  };

  const byFixer: Record<FixerName, number> = {
    whitespace: 0,
    number_format: 0,
    date_format: 0,
    duplicate: removedRows.length,
  };
  for (const change of cellChanges) {
    byFixer[change.fixer] += 1;
  }

  return {
    table: cleanedTable,
    cellChanges,
    removedRows,
    summary: {
      cellsChanged: cellChanges.length,
      rowsRemoved: removedRows.length,
      byFixer,
    },
  };
}
