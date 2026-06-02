/**
 * 이상치/오류(outlier) 검출기.
 *
 * 컬럼 단위로 다음을 검사한다.
 *  1) 결측치(빈 셀)  — flagEmpty
 *  2) 타입 불일치    — flagTypeMismatch (강한 타입 컬럼에서 어긋난 셀)
 *  3) 범위 위반      — ranges (명시적 min/max 비즈니스 규칙)
 *  4) 통계적 이상치  — IQR / z-score
 *
 * 순수 함수이며 부수효과가 없다. 이슈는 컬럼/규칙 단위로 집계한다.
 */

import type {
  ColumnProfile,
  ColumnType,
  DetectorContext,
  Issue,
} from "../types.js";
import {
  columnIndex,
  columnValues,
  isBlank,
  parseNumber,
} from "../util/coerce.js";
import { inferCellType } from "../infer/columns.js";

/** data.examples 배열의 최대 길이. */
const MAX_EXAMPLES = 50;

/** 강한 타입 판정 기준(신뢰도). */
const STRONG_TYPE_CONFIDENCE = 0.7;

/** 타입 불일치 검사 대상이 되는 강한 타입들. */
const STRONG_TYPES: ReadonlySet<ColumnType> = new Set([
  "integer",
  "decimal",
  "date",
  "boolean",
]);

/** 숫자 계열(서로 호환되는) 타입. */
const NUMERIC_TYPES: ReadonlySet<ColumnType> = new Set(["integer", "decimal"]);

/**
 * 두 타입이 호환되는지 판정.
 * integer/decimal 은 서로 호환(숫자 계열)이고, 그 외에는 정확히 일치해야 한다.
 */
function isTypeCompatible(expected: ColumnType, found: ColumnType): boolean {
  if (expected === found) return true;
  if (NUMERIC_TYPES.has(expected) && NUMERIC_TYPES.has(found)) return true;
  return false;
}

/**
 * 이상치/오류 검출기.
 * category 는 항상 "outlier".
 */
export function detectOutliers(ctx: DetectorContext): Issue[] {
  const opt = ctx.options.outliers;
  if (!opt.enabled) return [];

  const issues: Issue[] = [];
  const { table, columns } = ctx;

  for (const col of columns) {
    if (opt.flagEmpty) {
      collectEmpty(table, col, issues);
    }
    if (opt.flagTypeMismatch) {
      collectTypeMismatch(table, col, issues);
    }
    collectStatisticalOutliers(table, col, opt.zScoreThreshold, opt.iqrMultiplier, issues);
  }

  // 범위 위반: 명시적 규칙 단위로 처리.
  for (const rule of opt.ranges) {
    collectRangeViolation(table, rule, issues);
  }

  return issues;
}

// ============================================================
// 1) 결측치
// ============================================================

/** 컬럼별 빈 셀 수집. 전부 비면 empty_column, 일부면 missing_value. */
function collectEmpty(
  table: DetectorContext["table"],
  col: ColumnProfile,
  out: Issue[],
): void {
  const values = columnValues(table, col.index);
  const total = values.length;
  if (total === 0) return;

  const blankRows: number[] = [];
  for (let r = 0; r < total; r++) {
    if (isBlank(values[r] ?? "")) blankRows.push(r);
  }
  if (blankRows.length === 0) return;

  if (blankRows.length === total) {
    // 컬럼 전체가 비어 있음.
    out.push({
      category: "outlier",
      type: "empty_column",
      severity: "info",
      message: `Column "${col.name}" is entirely empty.`,
      column: col.index,
      columnName: col.name,
      rows: blankRows,
      data: { count: blankRows.length },
    });
    return;
  }

  // 일부만 비어 있음.
  out.push({
    category: "outlier",
    type: "missing_value",
    severity: "warning",
    message: `Column "${col.name}" has ${blankRows.length} missing value(s).`,
    column: col.index,
    columnName: col.name,
    rows: blankRows,
    data: {
      count: blankRows.length,
      examples: blankRows.slice(0, MAX_EXAMPLES),
    },
  });
}

// ============================================================
// 2) 타입 불일치
// ============================================================

/** 강한 타입 컬럼에서 호환되지 않는 셀 수집. */
function collectTypeMismatch(
  table: DetectorContext["table"],
  col: ColumnProfile,
  out: Issue[],
): void {
  // 강한 타입(신뢰도 >= 0.7 이고 integer/decimal/date/boolean)만 대상.
  if (col.typeConfidence < STRONG_TYPE_CONFIDENCE) return;
  if (!STRONG_TYPES.has(col.type)) return;

  const values = columnValues(table, col.index);
  const rows: number[] = [];
  const examples: Array<{ row: number; value: string; found: ColumnType }> = [];

  for (let r = 0; r < values.length; r++) {
    const raw = values[r] ?? "";
    if (isBlank(raw)) continue; // 비어있지 않은 셀만 검사.
    const found = inferCellType(raw);
    if (!isTypeCompatible(col.type, found)) {
      rows.push(r);
      if (examples.length < MAX_EXAMPLES) {
        examples.push({ row: r, value: raw, found });
      }
    }
  }

  if (rows.length === 0) return;

  out.push({
    category: "outlier",
    type: "type_mismatch",
    severity: "warning",
    message: `Column "${col.name}" has ${rows.length} value(s) that do not match its ${col.type} type.`,
    column: col.index,
    columnName: col.name,
    rows,
    data: { expectedType: col.type, examples },
  });
}

// ============================================================
// 3) 범위 위반
// ============================================================

/** 단일 범위 규칙 처리. 컬럼이 없으면 무시. */
function collectRangeViolation(
  table: DetectorContext["table"],
  rule: { column: string; min?: number; max?: number },
  out: Issue[],
): void {
  const idx = columnIndex(table, rule.column);
  if (idx === -1) return; // 없는 컬럼은 무시.

  const values = columnValues(table, idx);
  const rows: number[] = [];
  const examples: Array<{ row: number; value: number }> = [];

  for (let r = 0; r < values.length; r++) {
    const raw = values[r] ?? "";
    const n = parseNumber(raw);
    if (n === null) continue; // 숫자로 해석되는 셀만 검사.
    const belowMin = rule.min !== undefined && n < rule.min;
    const aboveMax = rule.max !== undefined && n > rule.max;
    if (belowMin || aboveMax) {
      rows.push(r);
      if (examples.length < MAX_EXAMPLES) {
        examples.push({ row: r, value: n });
      }
    }
  }

  if (rows.length === 0) return;

  out.push({
    category: "outlier",
    type: "range_violation",
    severity: "error",
    message: `Column "${rule.column}" has ${rows.length} value(s) outside the allowed range.`,
    column: idx,
    columnName: rule.column,
    rows,
    data: { min: rule.min, max: rule.max, examples },
  });
}

// ============================================================
// 4) 통계적 이상치 (IQR / z-score)
// ============================================================

/** 숫자형 컬럼에서 IQR/z-score 이상치 수집. */
function collectStatisticalOutliers(
  table: DetectorContext["table"],
  col: ColumnProfile,
  zScoreThreshold: number,
  iqrMultiplier: number,
  out: Issue[],
): void {
  // integer/decimal 이고 통계가 있으며 count>=4 일 때만.
  if (!NUMERIC_TYPES.has(col.type)) return;
  const stats = col.numeric;
  if (stats === undefined) return;
  if (stats.count < 4) return;

  const { q1, q3, iqr, mean, stdev } = stats;
  const useIqr = iqr > 0;
  const useZ = stdev > 0;

  // 상수 컬럼(iqr=0 이고 stdev=0)은 건너뛴다.
  if (!useIqr && !useZ) return;

  const lowerIqr = q1 - iqrMultiplier * iqr;
  const upperIqr = q3 + iqrMultiplier * iqr;

  const rows: number[] = [];
  const examples: Array<{ row: number; value: number }> = [];
  let hitIqr = false;
  let hitZ = false;

  const values = columnValues(table, col.index);
  for (let r = 0; r < values.length; r++) {
    const n = parseNumber(values[r] ?? "");
    if (n === null) continue; // 숫자로 해석되는 셀만.

    const flaggedIqr = useIqr && (n < lowerIqr || n > upperIqr);
    const flaggedZ = useZ && Math.abs((n - mean) / stdev) > zScoreThreshold;
    if (flaggedIqr || flaggedZ) {
      // 행당 1회만 수집(중복 없이).
      rows.push(r);
      if (flaggedIqr) hitIqr = true;
      if (flaggedZ) hitZ = true;
      if (examples.length < MAX_EXAMPLES) {
        examples.push({ row: r, value: n });
      }
    }
  }

  if (rows.length === 0) return;

  // 어떤 방법이 발동했는지 결정.
  const method: "iqr" | "zscore" | "both" =
    hitIqr && hitZ ? "both" : hitIqr ? "iqr" : "zscore";

  // bounds: z-score 만 발동한 경우 IQR 경계가 의미 없을 수 있으나,
  // 명세상 IQR 경계를 보고한다(IQR 미사용 시 NaN 회피 위해 상/하한 계산).
  const bounds = useIqr
    ? { lower: lowerIqr, upper: upperIqr }
    : {
        lower: mean - zScoreThreshold * stdev,
        upper: mean + zScoreThreshold * stdev,
      };

  out.push({
    category: "outlier",
    type: "statistical_outlier",
    severity: "info",
    message: `Column "${col.name}" has ${rows.length} statistical outlier(s) (${method}).`,
    column: col.index,
    columnName: col.name,
    rows,
    data: { method, bounds, examples },
  });
}
