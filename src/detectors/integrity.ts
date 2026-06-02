/**
 * 정합성(integrity) 검출기 — tidycsv 코어 엔진의 핵심 강점.
 *
 * 행 단위 산술 관계(합계·잔액)와 참조 무결성(orphan), 그리고 옵션에 따라
 * 숫자 컬럼 간 a+b≈c 합계 관계 자동 탐지까지 결정론적으로 검증한다.
 * 순수 함수이며 부수효과가 없다. Issue.message 는 영어, 주석은 한국어.
 */

import type {
  BalanceCheck,
  DetectorContext,
  Issue,
  ReferentialCheck,
  SumCheck,
} from "../types.js";
import {
  cellAt,
  columnIndex,
  columnValues,
  isBlank,
  parseNumber,
} from "../util/coerce.js";

/** 미지정 시 적용하는 기본 절대 허용오차(부동소수/반올림 흡수). */
const DEFAULT_TOLERANCE = 0.01;
/** data.examples 배열 최대 길이. */
const MAX_EXAMPLES = 50;
/** 자동탐지에서 조합 폭발을 막기 위한 숫자 컬럼 수 상한. */
const DISCOVER_MAX_COLUMNS = 12;
/** 자동탐지에서 발견으로 인정하는 최소 일치 비율. */
const DISCOVER_MIN_RATIO = 0.95;

/** 합계/잔액 example 한 건. */
interface NumericExample {
  row: number;
  expected: number;
  actual: number;
  diff: number;
}

/** unknown_column 이슈를 만든다(어떤 컬럼이 없는지 message 에 남김). */
function unknownColumn(
  missing: string[],
  label: string | undefined,
  detail: Record<string, unknown>,
): Issue {
  const cols = missing.join(", ");
  const labelPart = label ? `${label}: ` : "";
  return {
    category: "integrity",
    type: "integrity_unknown_column",
    severity: "error",
    message: `${labelPart}referenced column(s) not found: ${cols}`,
    data: { label, missing, ...detail },
  };
}

// ============================================================
// 1) 합계 검증
// ============================================================

/** 단일 sumCheck 규칙을 평가해 0~1개 이슈를 반환. */
function evalSumCheck(ctx: DetectorContext, rule: SumCheck): Issue[] {
  const { table } = ctx;
  const tolerance = rule.tolerance ?? DEFAULT_TOLERANCE;

  // 컬럼명 -> 인덱스 해석. 미존재 컬럼이 하나라도 있으면 규칙 스킵.
  const missing: string[] = [];
  const componentIdx: number[] = [];
  for (const name of rule.components) {
    const idx = columnIndex(table, name);
    if (idx === -1) missing.push(name);
    else componentIdx.push(idx);
  }
  const totalIdx = columnIndex(table, rule.total);
  if (totalIdx === -1) missing.push(rule.total);

  if (missing.length > 0) {
    return [
      unknownColumn(missing, rule.label, {
        components: rule.components,
        total: rule.total,
      }),
    ];
  }

  const violationRows: number[] = [];
  const examples: NumericExample[] = [];
  let anyParseFailure = false;

  for (let r = 0; r < table.rowCount; r++) {
    // total 셀이 비었거나 파싱 실패면 행 스킵.
    const totalRaw = cellAt(table, r, totalIdx);
    if (isBlank(totalRaw)) continue;
    const actual = parseNumber(totalRaw);
    if (actual === null) continue;

    // components: 빈 셀=0, 파싱 실패=0 취급(단 실패 사실 기록).
    let expected = 0;
    for (const ci of componentIdx) {
      const raw = cellAt(table, r, ci);
      if (isBlank(raw)) continue;
      const n = parseNumber(raw);
      if (n === null) {
        anyParseFailure = true;
        continue;
      }
      expected += n;
    }

    const diff = expected - actual;
    if (Math.abs(diff) > tolerance) {
      violationRows.push(r);
      if (examples.length < MAX_EXAMPLES) {
        examples.push({ row: r, expected, actual, diff });
      }
    }
  }

  if (violationRows.length === 0) return [];

  return [
    {
      category: "integrity",
      type: "sum_mismatch",
      severity: "error",
      message: `${rule.label ? `${rule.label}: ` : ""}sum of [${rule.components.join(
        ", ",
      )}] does not equal '${rule.total}' in ${violationRows.length} row(s)`,
      rows: violationRows,
      data: {
        label: rule.label,
        components: rule.components,
        total: rule.total,
        tolerance,
        anyParseFailure,
        examples,
      },
    },
  ];
}

// ============================================================
// 2) 잔액 검증
// ============================================================

/** 단일 balanceCheck 규칙을 평가해 0~1개 이슈를 반환. */
function evalBalanceCheck(ctx: DetectorContext, rule: BalanceCheck): Issue[] {
  const { table } = ctx;
  const tolerance = rule.tolerance ?? DEFAULT_TOLERANCE;

  const amountIdx = columnIndex(table, rule.amount);
  const balanceIdx = columnIndex(table, rule.balance);
  const missing: string[] = [];
  if (amountIdx === -1) missing.push(rule.amount);
  if (balanceIdx === -1) missing.push(rule.balance);
  if (missing.length > 0) {
    return [
      unknownColumn(missing, rule.label, {
        amount: rule.amount,
        balance: rule.balance,
      }),
    ];
  }

  // 시작 잔액(prev) 결정.
  // opening 지정 시 prev=opening, 아니면 prev = balance[0] - amount[0].
  let prev: number | null;
  if (rule.opening !== undefined) {
    prev = rule.opening;
  } else {
    const firstBalance = parseNumber(cellAt(table, 0, balanceIdx));
    const firstAmount = parseNumber(cellAt(table, 0, amountIdx));
    prev =
      firstBalance === null || firstAmount === null
        ? null
        : firstBalance - firstAmount;
  }

  const violationRows: number[] = [];
  const examples: NumericExample[] = [];

  for (let r = 0; r < table.rowCount; r++) {
    const amount = parseNumber(cellAt(table, r, amountIdx));
    const balance = parseNumber(cellAt(table, r, balanceIdx));

    // 파싱 실패 행은 스킵하되 prev 유지.
    if (amount === null || balance === null) continue;

    // prev 가 아직 없으면(첫 행 역산 실패 등) 검증 없이 현재 잔액으로 시드.
    if (prev === null) {
      prev = balance;
      continue;
    }

    const expected = prev + amount;
    const diff = expected - balance;
    if (Math.abs(diff) > tolerance) {
      violationRows.push(r);
      if (examples.length < MAX_EXAMPLES) {
        examples.push({ row: r, expected, actual: balance, diff });
      }
    }

    // 오류 전파 방지: 실제 잔액으로 prev 갱신(첫 끊김 지점만 탐지).
    prev = balance;
  }

  if (violationRows.length === 0) return [];

  return [
    {
      category: "integrity",
      type: "balance_mismatch",
      severity: "error",
      message: `${rule.label ? `${rule.label}: ` : ""}running balance '${rule.balance}' does not match prior balance + '${rule.amount}' in ${violationRows.length} row(s)`,
      rows: violationRows,
      data: {
        label: rule.label,
        amount: rule.amount,
        balance: rule.balance,
        tolerance,
        examples,
      },
    },
  ];
}

// ============================================================
// 3) 참조 무결성
// ============================================================

/** 단일 referentialCheck 규칙을 평가해 0~1개 이슈를 반환. */
function evalReferentialCheck(
  ctx: DetectorContext,
  rule: ReferentialCheck,
): Issue[] {
  const { table } = ctx;
  const allowEmpty = rule.allowEmpty ?? true;

  const targetIdx = columnIndex(table, rule.column);
  const missing: string[] = [];
  if (targetIdx === -1) missing.push(rule.column);

  // 참조 집합 구성.
  let allowed: Set<string>;
  if ("column" in rule.references) {
    const refName = rule.references.column;
    const refIdx = columnIndex(table, refName);
    if (refIdx === -1) {
      missing.push(refName);
      allowed = new Set();
    } else {
      // trim 후 비어있지 않은 값만 참조 집합에 포함.
      allowed = new Set(
        columnValues(table, refIdx)
          .map((v) => v.trim())
          .filter((v) => v !== ""),
      );
    }
  } else {
    allowed = new Set(rule.references.values.map((v) => v.trim()));
  }

  if (missing.length > 0) {
    return [
      unknownColumn(missing, rule.label, { column: rule.column }),
    ];
  }

  const violationRows: number[] = [];
  const examples: Array<{ row: number; value: string }> = [];

  for (let r = 0; r < table.rowCount; r++) {
    const value = cellAt(table, r, targetIdx).trim();
    if (isBlank(value)) {
      if (allowEmpty) continue;
      // 빈 값 비허용 -> 위반.
      violationRows.push(r);
      if (examples.length < MAX_EXAMPLES) examples.push({ row: r, value });
      continue;
    }
    if (!allowed.has(value)) {
      violationRows.push(r);
      if (examples.length < MAX_EXAMPLES) examples.push({ row: r, value });
    }
  }

  if (violationRows.length === 0) return [];

  return [
    {
      category: "integrity",
      type: "referential_violation",
      severity: "error",
      message: `${rule.label ? `${rule.label}: ` : ""}column '${rule.column}' has ${violationRows.length} value(s) not present in the reference set`,
      rows: violationRows,
      column: targetIdx,
      columnName: rule.column,
      data: {
        label: rule.label,
        column: rule.column,
        examples,
      },
    },
  ];
}

// ============================================================
// 4) 합계 관계 자동탐지 (col_i + col_j ≈ col_k)
// ============================================================

/** 숫자 컬럼들에서 a+b≈c 관계를 탐색해 info 이슈를 반환. */
function discoverSumRelationships(ctx: DetectorContext): Issue[] {
  const { table, columns } = ctx;

  // integer/decimal 컬럼만 대상.
  const numericCols = columns.filter(
    (c) => c.type === "integer" || c.type === "decimal",
  );

  if (numericCols.length < 3) return [];

  // 컬럼 수가 많으면 조합 폭발 방지를 위해 건너뛰고 사유를 info 로 남긴다.
  if (numericCols.length > DISCOVER_MAX_COLUMNS) {
    return [
      {
        category: "integrity",
        type: "discovered_sum_relationship",
        severity: "info",
        message: `Skipped sum-relationship discovery: ${numericCols.length} numeric columns exceed the limit of ${DISCOVER_MAX_COLUMNS}`,
        data: {
          skipped: true,
          numericColumnCount: numericCols.length,
          limit: DISCOVER_MAX_COLUMNS,
        },
      },
    ];
  }

  // 각 대상 컬럼의 파싱값 캐시(행별 number|null).
  const parsed = new Map<number, Array<number | null>>();
  for (const col of numericCols) {
    parsed.set(
      col.index,
      columnValues(table, col.index).map((v) => parseNumber(v)),
    );
  }

  const issues: Issue[] = [];
  // 중복 방지: 정렬된 components + total 키.
  const seen = new Set<string>();

  for (const colK of numericCols) {
    const kVals = parsed.get(colK.index);
    if (kVals === undefined) continue;

    // 순서 없는 쌍 {i, j} 를 선택(i<j 인덱스 위치 기준), 둘 다 k 와 달라야 함.
    for (let a = 0; a < numericCols.length; a++) {
      const colI = numericCols[a];
      if (colI === undefined || colI.index === colK.index) continue;
      const iVals = parsed.get(colI.index);
      if (iVals === undefined) continue;

      for (let b = a + 1; b < numericCols.length; b++) {
        const colJ = numericCols[b];
        if (colJ === undefined || colJ.index === colK.index) continue;
        const jVals = parsed.get(colJ.index);
        if (jVals === undefined) continue;

        // 중복 방지 키(components 정렬 + total).
        const compNames = [colI.name, colJ.name].sort();
        const key = `${compNames[0]}+${compNames[1]}=${colK.name}`;
        if (seen.has(key)) continue;

        // 유효 행(셋 다 parseNumber 성공)에서 일치율 계산.
        let valid = 0;
        let matched = 0;
        const tolerance = DEFAULT_TOLERANCE;
        for (let r = 0; r < table.rowCount; r++) {
          const ai = iVals[r];
          const bj = jVals[r];
          const ck = kVals[r];
          if (
            ai === null ||
            ai === undefined ||
            bj === null ||
            bj === undefined ||
            ck === null ||
            ck === undefined
          ) {
            continue;
          }
          valid += 1;
          if (Math.abs(ai + bj - ck) <= tolerance) matched += 1;
        }

        // 유효 행이 없으면 의미 없는 관계로 간주.
        if (valid === 0) continue;
        const matchRatio = matched / valid;
        if (matchRatio < DISCOVER_MIN_RATIO) continue;

        seen.add(key);
        issues.push({
          category: "integrity",
          type: "discovered_sum_relationship",
          severity: "info",
          message: `Column '${colK.name}' appears to equal '${colI.name}' + '${colJ.name}'`,
          data: {
            components: [colI.name, colJ.name],
            total: colK.name,
            matchRatio,
          },
        });
      }
    }
  }

  return issues;
}

// ============================================================
// 진입점
// ============================================================

/** 정합성 검출기. category 는 항상 "integrity". */
export function detectIntegrity(ctx: DetectorContext): Issue[] {
  const opts = ctx.options.integrity;
  if (!opts.enabled) return [];

  const issues: Issue[] = [];

  for (const rule of opts.sumChecks) {
    issues.push(...evalSumCheck(ctx, rule));
  }
  for (const rule of opts.balanceChecks) {
    issues.push(...evalBalanceCheck(ctx, rule));
  }
  for (const rule of opts.referentialChecks) {
    issues.push(...evalReferentialCheck(ctx, rule));
  }
  if (opts.discoverSumRelationships) {
    issues.push(...discoverSumRelationships(ctx));
  }

  return issues;
}
