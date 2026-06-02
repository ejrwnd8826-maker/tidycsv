/**
 * 중복(duplicate) 검출기.
 *
 * 정규화된 행 키를 기준으로 정확 중복(exact)을 그룹 단위로 묶고,
 * 옵션에 따라 문자 bigram 기반 Sorensen-Dice 유사도로 유사 중복(near)도 찾는다.
 * 순수 함수이며 부수효과가 없다.
 */

import type { DetectorContext, Issue } from "../types.js";
import { columnValues, normalizeWhitespace } from "../util/coerce.js";

/** 충돌 위험이 없는 키 구분자(SOH, U+0001). 일반 셀 값에는 등장하지 않는다. */
const KEY_SEP = String.fromCharCode(1);

/** data.examples 배열 최대 길이. */
const MAX_EXAMPLES = 50;

/** near 비교 성능 가드: 데이터 행이 이 값을 초과하면 유사 중복을 건너뛴다. */
const NEAR_ROW_LIMIT = 2000;

/**
 * 단일 셀 값을 옵션에 맞게 정규화한다.
 * trimWhitespace 면 공백 정리, caseInsensitive 면 소문자화.
 */
function normalizeCell(
  raw: string,
  trimWhitespace: boolean,
  caseInsensitive: boolean,
): string {
  let s = raw;
  if (trimWhitespace) s = normalizeWhitespace(s);
  if (caseInsensitive) s = s.toLowerCase();
  return s;
}

/**
 * 문자 bigram 기반 Sorensen-Dice 유사도(0..1).
 * 길이 1 이하 등 bigram 을 만들 수 없는 경우는 동일/비동일로 보정한다.
 */
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  // a 의 bigram 빈도 맵 구성
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }

  // b 의 bigram 을 훑으며 교집합 수 계산
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const cnt = bigrams.get(g) ?? 0;
    if (cnt > 0) {
      bigrams.set(g, cnt - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

/** 소수 3자리로 반올림. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 중복 검출기 진입점.
 * category 는 항상 "duplicate".
 */
export function detectDuplicates(ctx: DetectorContext): Issue[] {
  const { table, options } = ctx;
  const dup = options.duplicates;
  if (!dup.enabled) return [];

  const issues: Issue[] = [];

  // ── 비교 대상 컬럼 선정: 전체 컬럼에서 ignoreColumns(컬럼명) 제외 ──
  const ignore = new Set(dup.ignoreColumns);
  const exactCols: number[] = [];
  for (let c = 0; c < table.headers.length; c++) {
    const name = table.headers[c] ?? "";
    if (!ignore.has(name)) exactCols.push(c);
  }

  // 행별 셀 값을 미리 캐시(컬럼 단위 조회 비용 절감).
  const cellMatrix: string[][] = exactCols.map((c) => columnValues(table, c));

  /** 주어진 컬럼 인덱스 목록으로 한 행의 정규화 키를 만든다. */
  const rowKey = (cols: number[], cache: Map<number, string[]>, row: number): string => {
    const parts: string[] = [];
    for (const c of cols) {
      let vals = cache.get(c);
      if (vals === undefined) {
        vals = columnValues(table, c);
        cache.set(c, vals);
      }
      const raw = vals[row] ?? "";
      parts.push(normalizeCell(raw, dup.trimWhitespace, dup.caseInsensitive));
    }
    return parts.join(KEY_SEP);
  };

  // 컬럼 값 캐시(rowKey/near 공용).
  const colCache = new Map<number, string[]>();
  exactCols.forEach((c, i) => {
    const vals = cellMatrix[i];
    if (vals !== undefined) colCache.set(c, vals);
  });

  // ── 1) 정확 중복(exact): 정규화 키로 행 그룹핑 ──
  const exactGroups = new Map<string, number[]>();
  for (let r = 0; r < table.rowCount; r++) {
    const key = rowKey(exactCols, colCache, r);
    const arr = exactGroups.get(key);
    if (arr === undefined) exactGroups.set(key, [r]);
    else arr.push(r);
  }

  // 정확 중복에 속한 행 -> 그룹 대표 행 매핑(near 제외 판정에 사용).
  const exactGroupOf = new Map<number, number>();

  for (const rowsInGroup of exactGroups.values()) {
    if (rowsInGroup.length < 2) continue;
    const keepRow = rowsInGroup[0] as number;
    const duplicateRows = rowsInGroup.slice(1);
    for (const r of rowsInGroup) exactGroupOf.set(r, keepRow);

    issues.push({
      category: "duplicate",
      type: "exact_duplicate_row",
      severity: "warning",
      message: `Found ${rowsInGroup.length} exact duplicate rows`,
      rows: [...rowsInGroup],
      data: {
        count: rowsInGroup.length,
        keepRow,
        duplicateRows,
      },
    });
  }

  // ── 2) 유사 중복(near) ──
  if (dup.near.enabled) {
    // 성능 가드: 너무 큰 표는 O(n^2) 비교를 건너뛴다.
    if (table.rowCount > NEAR_ROW_LIMIT) {
      issues.push({
        category: "duplicate",
        type: "near_duplicate_skipped",
        severity: "info",
        message: `Skipped near-duplicate detection: ${table.rowCount} rows exceeds limit of ${NEAR_ROW_LIMIT}`,
        data: { rowCount: table.rowCount, limit: NEAR_ROW_LIMIT },
      });
      return issues;
    }

    // near 비교 컬럼: keyColumns 가 있으면 그 컬럼(존재하는 것만), 없으면 exactCols.
    let nearCols: number[];
    if (dup.near.keyColumns.length > 0) {
      const keySet = new Set(dup.near.keyColumns);
      nearCols = [];
      for (let c = 0; c < table.headers.length; c++) {
        const name = table.headers[c] ?? "";
        if (keySet.has(name)) nearCols.push(c);
      }
    } else {
      nearCols = exactCols;
    }

    // 각 행을 near 비교용 단일 문자열로 직렬화(공백 정리 + 소문자, 옵션 무관 고정).
    const nearStrings: string[] = [];
    for (let r = 0; r < table.rowCount; r++) {
      const parts: string[] = [];
      for (const c of nearCols) {
        let vals = colCache.get(c);
        if (vals === undefined) {
          vals = columnValues(table, c);
          colCache.set(c, vals);
        }
        const raw = vals[r] ?? "";
        parts.push(normalizeWhitespace(raw).toLowerCase());
      }
      nearStrings.push(parts.join(" "));
    }

    const threshold = dup.near.threshold;
    for (let i = 0; i < table.rowCount; i++) {
      for (let j = i + 1; j < table.rowCount; j++) {
        // 정확 중복으로 같은 그룹에 속한 쌍은 near 에서 제외.
        // (둘 다 undefined 인 경우는 어느 그룹에도 없으므로 제외 대상이 아님)
        const gi = exactGroupOf.get(i);
        const gj = exactGroupOf.get(j);
        if (gi !== undefined && gj !== undefined && gi === gj) continue;

        const a = nearStrings[i] ?? "";
        const b = nearStrings[j] ?? "";
        const sim = diceSimilarity(a, b);
        // 완전히 동일하면(=1) 정확 중복으로 이미 잡혔거나 near 의미가 없으므로 제외.
        if (sim >= threshold && sim < 1) {
          issues.push({
            category: "duplicate",
            type: "near_duplicate_row",
            severity: "info",
            message: `Rows ${i} and ${j} are near-duplicates (similarity ${round3(sim)})`,
            rows: [i, j],
            data: { similarity: round3(sim) },
          });
        }
      }
    }
  }

  // examples 류 배열 길이 제한(현재 data 구조에는 examples 가 없지만 계약 준수용 가드).
  for (const issue of issues) {
    const ex = issue.data?.["examples"];
    if (Array.isArray(ex) && ex.length > MAX_EXAMPLES) {
      issue.data = { ...issue.data, examples: ex.slice(0, MAX_EXAMPLES) };
    }
  }

  return issues;
}
