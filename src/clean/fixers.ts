/**
 * 정제 fixer 모음.
 *
 * 각 fixer 는 순수 함수: 현재 작업 행(읽기 전용)을 받아 '변경안'만 반환한다.
 * 실제 적용·행 인덱스 관리는 오케스트레이터(clean.ts)가 한다.
 * 모든 변경안의 row 는 '원본 테이블 기준' 데이터 행 인덱스(0-based)다.
 *
 * 안전 원칙: 결측치·이상치·정합성 위반은 절대 건드리지 않는다(검출 전용).
 * 모호한 날짜·파싱 불가 숫자도 변환하지 않는다(원본 유지).
 */

import type { ColumnProfile } from "../types.js";
import { isBlank, needsWhitespaceTrim, normalizeWhitespace, numericString } from "../util/coerce.js";
import { reformatDate } from "../util/datetime.js";
import type { DateTarget } from "../util/datetime.js";
import type { CellChange, RowRemoval } from "./types.js";

/** 작업 행(읽기 전용). */
export type WorkRows = ReadonlyArray<ReadonlyArray<string>>;

const NUMERIC_COL = new Set(["integer", "decimal"]);

function cellOf(rows: WorkRows, r: number, c: number): string {
  const row = rows[r];
  if (row === undefined) return "";
  const v = row[c];
  return v === undefined ? "" : v;
}

/** 1) 공백 정규화: 앞뒤/이중/비표준 공백·제어문자를 정리(모든 컬럼). */
export function fixWhitespace(
  rows: WorkRows,
  columns: ColumnProfile[],
): CellChange[] {
  const changes: CellChange[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < columns.length; c++) {
      const before = cellOf(rows, r, c);
      if (isBlank(before)) continue;
      if (!needsWhitespaceTrim(before)) continue;
      const after = normalizeWhitespace(before);
      if (after !== before) {
        changes.push({
          row: r,
          column: c,
          columnName: columns[c]?.name ?? `col${c}`,
          before,
          after,
          fixer: "whitespace",
        });
      }
    }
  }
  return changes;
}

/** 2) 숫자 포맷 통일: 숫자형 컬럼에서 통화·천단위 제거, 소수점 정규화. */
export function fixNumberFormat(
  rows: WorkRows,
  columns: ColumnProfile[],
): CellChange[] {
  const changes: CellChange[] = [];
  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];
    if (!col || !NUMERIC_COL.has(col.type)) continue;
    for (let r = 0; r < rows.length; r++) {
      const before = cellOf(rows, r, c);
      if (isBlank(before)) continue;
      const after = numericString(before);
      // 파싱 불가(숫자 아님) 셀은 건드리지 않는다.
      if (after === null || after === before) continue;
      changes.push({
        row: r,
        column: c,
        columnName: col.name,
        before,
        after,
        fixer: "number_format",
      });
    }
  }
  return changes;
}

/** 3) 날짜 포맷 통일: 날짜형 컬럼에서 모호하지 않은 날짜만 목표 포맷으로. */
export function fixDateFormat(
  rows: WorkRows,
  columns: ColumnProfile[],
  target: DateTarget,
): CellChange[] {
  const changes: CellChange[] = [];
  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];
    if (!col || col.type !== "date") continue;
    for (let r = 0; r < rows.length; r++) {
      const before = cellOf(rows, r, c);
      if (isBlank(before)) continue;
      const after = reformatDate(before, target);
      // 모호/시간포함/비날짜 → null → 변환 안 함.
      if (after === null || after === before) continue;
      changes.push({
        row: r,
        column: c,
        columnName: col.name,
        before,
        after,
        fixer: "date_format",
      });
    }
  }
  return changes;
}

/**
 * 4) 정확 중복 행 제거: 정규화된(앞 단계 적용 후) 행이 완전히 동일하면
 * 첫 occurrence 만 남기고 나머지를 제거 대상으로 표시.
 */
export function fixDuplicates(rows: WorkRows): RowRemoval[] {
  const removals: RowRemoval[] = [];
  const firstSeen = new Map<string, number>();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    // 충돌 없는 키: 셀에 임의 제어문자가 들어와도 안전(구분자 join 회피).
    const key = JSON.stringify(row);
    const seen = firstSeen.get(key);
    if (seen === undefined) {
      firstSeen.set(key, r);
    } else {
      removals.push({
        row: r,
        keptRow: seen,
        reason: `exact duplicate of row ${seen}`,
        fixer: "duplicate",
      });
    }
  }
  return removals;
}
