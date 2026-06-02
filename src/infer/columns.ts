/**
 * 컬럼 타입 추론 + 프로파일링.
 *
 * 각 컬럼의 셀들을 훑어 대표 타입·통계·날짜 포맷을 계산한다.
 * 검출기들은 이 ColumnProfile 을 입력으로 받아 동작한다.
 */

import type {
  ColumnProfile,
  ColumnType,
  NumericStats,
  ParsedTable,
} from "../types.js";
import {
  columnValues,
  isBlank,
  looksBooleanText,
  looksInteger,
  looksNumeric,
  parseNumber,
} from "../util/coerce.js";
import { analyzeDate } from "../util/datetime.js";

const NUMERIC_TYPES: ReadonlySet<ColumnType> = new Set(["integer", "decimal"]);

/** 단일 셀의 타입 추론. 우선순위: empty > integer > decimal > boolean > date > string. */
export function inferCellType(raw: string): ColumnType {
  if (isBlank(raw)) return "empty";
  if (looksInteger(raw)) return "integer";
  if (looksNumeric(raw)) return "decimal";
  // 1/0 은 위에서 정수로 처리되므로, 여기서는 true/false/yes/no 등만 boolean.
  if (looksBooleanText(raw)) return "boolean";
  if (analyzeDate(raw).ok) return "date";
  return "string";
}

/** 빈 타입 카운트 레코드. */
function emptyTypeCounts(): Record<ColumnType, number> {
  return {
    integer: 0,
    decimal: 0,
    date: 0,
    boolean: 0,
    string: 0,
    empty: 0,
  };
}

/** 정렬된 숫자 배열에서 백분위수(선형 보간, type-7). */
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0] as number;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo] as number;
  const hiVal = sorted[hi] as number;
  if (lo === hi) return loVal;
  return loVal + (hiVal - loVal) * (idx - lo);
}

/** 숫자 배열의 기술통계 계산. */
export function computeNumericStats(values: number[]): NumericStats {
  const count = values.length;
  if (count === 0) {
    return {
      count: 0,
      min: Number.NaN,
      max: Number.NaN,
      mean: Number.NaN,
      stdev: 0,
      sum: 0,
      q1: Number.NaN,
      median: Number.NaN,
      q3: Number.NaN,
      iqr: Number.NaN,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const variance =
    count > 1
      ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (count - 1)
      : 0;
  const q1 = percentile(sorted, 0.25);
  const median = percentile(sorted, 0.5);
  const q3 = percentile(sorted, 0.75);
  return {
    count,
    min: sorted[0] as number,
    max: sorted[count - 1] as number,
    mean,
    stdev: Math.sqrt(variance),
    sum,
    q1,
    median,
    q3,
    iqr: q3 - q1,
  };
}

/** 한 컬럼을 프로파일링. */
export function profileColumn(
  table: ParsedTable,
  index: number,
): ColumnProfile {
  const name = table.headers[index] ?? `col${index}`;
  const values = columnValues(table, index);
  const typeCounts = emptyTypeCounts();
  const distinct = new Set<string>();
  const numbers: number[] = [];
  const dateShapes = new Set<string>();

  for (const raw of values) {
    const t = inferCellType(raw);
    typeCounts[t] += 1;
    if (t !== "empty") {
      distinct.add(raw.trim());
    }
    if (NUMERIC_TYPES.has(t)) {
      const n = parseNumber(raw);
      if (n !== null) numbers.push(n);
    }
    if (t === "date") {
      const a = analyzeDate(raw);
      if (a.ok && a.shape) dateShapes.add(a.shape);
    }
  }

  const totalCount = values.length;
  const emptyCount = typeCounts.empty;
  const nonEmptyCount = totalCount - emptyCount;

  // 대표 타입: 비어있지 않은 셀 중 최다 타입. 전부 비면 "empty".
  // (forEach 클로저 안 할당은 TS 제어흐름이 추적 못 하므로 일반 for 루프 사용)
  let type: ColumnType = "empty";
  if (nonEmptyCount > 0) {
    const candidates: ColumnType[] = [
      "integer",
      "decimal",
      "date",
      "boolean",
      "string",
    ];
    let best = -1;
    for (const t of candidates) {
      if (typeCounts[t] > best) {
        best = typeCounts[t];
        type = t;
      }
    }
  }

  const typeConfidence =
    nonEmptyCount === 0 ? 0 : (typeCounts[type] ?? 0) / nonEmptyCount;

  const profile: ColumnProfile = {
    index,
    name,
    type,
    typeConfidence,
    totalCount,
    emptyCount,
    nonEmptyCount,
    distinctCount: distinct.size,
    typeCounts,
  };

  if (NUMERIC_TYPES.has(type) && numbers.length > 0) {
    profile.numeric = computeNumericStats(numbers);
  }
  if (type === "date" && dateShapes.size > 0) {
    profile.dateFormats = [...dateShapes];
  }

  return profile;
}

/** 테이블 전체 컬럼 프로파일. headers 와 평행. */
export function buildColumnProfiles(table: ParsedTable): ColumnProfile[] {
  const profiles: ColumnProfile[] = [];
  for (let i = 0; i < table.columnCount; i++) {
    profiles.push(profileColumn(table, i));
  }
  return profiles;
}
