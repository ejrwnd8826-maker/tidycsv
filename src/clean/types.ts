/**
 * 정제(clean) 레이어 — 타입 계약.
 *
 * 설계 철학: **보수적 정제**. 안전하고 무손실에 가까운 변환만 자동 수행한다.
 *  - 자동 수정: 공백 정규화, 숫자/날짜 포맷 통일, 정확 중복 행 제거
 *  - 절대 자동 변경 안 함: 결측치·이상치·정합성 위반(합계·잔액·참조)
 *    → 이들은 검출(detect)만 하고 사람이 판단한다. 금융성 데이터 임의 수정은 위험.
 */

import type { ParsedTable } from "../types.js";
import type { DateTarget } from "../util/datetime.js";

export type { DateTarget };

/** 어떤 fixer 가 셀을 바꿨는지 식별. */
export type FixerName =
  | "whitespace"
  | "number_format"
  | "date_format"
  | "duplicate";

/** 단일 셀 변경 기록(before/after). */
export interface CellChange {
  /** 원본 테이블 기준 데이터 행 인덱스(0-based). */
  row: number;
  column: number;
  columnName: string;
  before: string;
  after: string;
  fixer: FixerName;
}

/** 행 제거 기록. */
export interface RowRemoval {
  /** 제거된 원본 행 인덱스(0-based). */
  row: number;
  /** 유지된 대표 행 인덱스(중복 제거 시 첫 occurrence). */
  keptRow: number;
  reason: string;
  fixer: FixerName;
}

/** 사용자가 넘기는 정제 옵션(모두 선택). */
export interface CleanOptions {
  /** 공백 정규화(앞뒤/이중/비표준 공백·제어문자). 기본 true. */
  whitespace?: boolean;
  /** 숫자 포맷 통일(통화·천단위 제거, 소수점 정규화). 기본 true. */
  numberFormat?: boolean;
  /** 날짜 포맷 통일. 기본 true. 모호한(월/일 순서 충돌) 컬럼은 건너뜀. */
  dateFormat?: boolean;
  /** 날짜 목표 포맷. 기본 "YYYY-MM-DD". */
  dateTarget?: DateTarget;
  /** 정확 중복 행 제거(첫 occurrence 유지). 기본 true. */
  removeDuplicates?: boolean;
}

/** 기본값이 채워진 정제 옵션. */
export interface ResolvedCleanOptions {
  whitespace: boolean;
  numberFormat: boolean;
  dateFormat: boolean;
  dateTarget: DateTarget;
  removeDuplicates: boolean;
}

/** 정제 결과. */
export interface CleanResult {
  /** 정제된 테이블(새 객체, 원본 불변). */
  table: ParsedTable;
  /** 셀 변경 목록. */
  cellChanges: CellChange[];
  /** 제거된 행 목록. */
  removedRows: RowRemoval[];
  /** 요약. */
  summary: {
    cellsChanged: number;
    rowsRemoved: number;
    /** fixer 별 변경 셀 수(+중복은 제거 행 수). */
    byFixer: Record<FixerName, number>;
  };
}
