/**
 * tidycsv 코어 엔진 — 공유 타입 계약(contract).
 *
 * 모든 검출기(detector)는 이 파일의 타입에만 의존한다.
 * 원시 CSV 셀은 항상 문자열로 다루고, 숫자/날짜 해석은 util 레이어가 담당한다.
 */

// ─────────────────────────────────────────────────────────────
// 1. 파싱된 테이블
// ─────────────────────────────────────────────────────────────

/** CSV 원본 셀. 파싱 단계에서는 항상 문자열로 유지한다. */
export type Cell = string;

/** Papa Parse 래퍼가 만들어 내는, 검출기가 소비하는 표준 표 형태. */
export interface ParsedTable {
  /** 헤더(컬럼명) 목록. */
  headers: string[];
  /** 데이터 행 목록. rows[r][c] 는 headers[c] 컬럼의 값. (헤더 행 제외) */
  rows: Cell[][];
  /** 데이터 행 수 (헤더 제외). */
  rowCount: number;
  /** 컬럼 수. */
  columnCount: number;
  /** 파싱 메타데이터. */
  meta?: {
    delimiter?: string;
    /** 파싱 중 Papa Parse가 보고한 에러 메시지. */
    parseErrors?: string[];
  };
}

// ─────────────────────────────────────────────────────────────
// 2. 컬럼 프로파일 (타입 추론 결과)
// ─────────────────────────────────────────────────────────────

/** 셀/컬럼에 추론된 데이터 타입. */
export type ColumnType =
  | "integer"
  | "decimal"
  | "date"
  | "boolean"
  | "string"
  | "empty";

/** 숫자형 컬럼의 기술통계. 이상치 검출 등에 사용. */
export interface NumericStats {
  /** 숫자로 파싱된 셀 수. */
  count: number;
  min: number;
  max: number;
  mean: number;
  /** 표본 표준편차(n-1). count<2 면 0. */
  stdev: number;
  sum: number;
  q1: number;
  median: number;
  q3: number;
  /** 사분위 범위 = q3 - q1. */
  iqr: number;
}

/** 한 컬럼에 대한 추론·통계 프로파일. */
export interface ColumnProfile {
  /** 컬럼 인덱스(0-based). */
  index: number;
  /** 컬럼명. */
  name: string;
  /** 대표 추론 타입(다수결). */
  type: ColumnType;
  /** 대표 타입 비율 0..1 (typeCounts[type] / nonEmptyCount). */
  typeConfidence: number;
  /** 전체 셀 수 (= table.rowCount). */
  totalCount: number;
  /** 빈 셀 수. */
  emptyCount: number;
  /** 비어있지 않은 셀 수. */
  nonEmptyCount: number;
  /** 고유값 수(빈 값 제외, 트림 기준). */
  distinctCount: number;
  /** 셀별 추론 타입 분포. */
  typeCounts: Record<ColumnType, number>;
  /** 숫자형(integer/decimal)일 때의 통계. */
  numeric?: NumericStats;
  /** 날짜형일 때 감지된 포맷 라벨 목록(여러 개면 혼용). */
  dateFormats?: string[];
}

// ─────────────────────────────────────────────────────────────
// 3. 이슈(검출 결과)
// ─────────────────────────────────────────────────────────────

/** 심각도. error=정합성 위반/확실한 오류, warning=의심, info=참고. */
export type Severity = "error" | "warning" | "info";

/** 이슈 대분류. 각 검출기가 하나의 카테고리를 담당한다. */
export type IssueCategory = "duplicate" | "format" | "outlier" | "integrity";

/**
 * 단일 검출 결과.
 *
 * message 는 기본 영어 문구(국제 GitHub 자산 대상). UI 단계에서
 * type + data 를 이용해 한국어 등으로 현지화할 수 있다.
 * 행 인덱스(rows)는 모두 0-based 데이터 행 기준(헤더 제외).
 */
export interface Issue {
  category: IssueCategory;
  /** 안정적인 이슈 코드. 예: "exact_duplicate_row", "inconsistent_date_format". */
  type: string;
  severity: Severity;
  /** 사람이 읽는 기본 메시지(영어). */
  message: string;
  /** 영향받은 데이터 행 인덱스(0-based, 헤더 제외). */
  rows?: number[];
  /** 영향받은 컬럼 인덱스(0-based). */
  column?: number;
  /** 영향받은 컬럼명. */
  columnName?: string;
  /** 구조화된 상세(expected/actual/format 등). 현지화·자동정리에 사용. */
  data?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// 4. 엔진 옵션
// ─────────────────────────────────────────────────────────────

/** 중복 검출 옵션. */
export interface DuplicateOptions {
  /** 기본 true. */
  enabled?: boolean;
  /** 비교에서 제외할 컬럼명(예: 자동증가 id). */
  ignoreColumns?: string[];
  /** 대소문자 무시(기본 true). */
  caseInsensitive?: boolean;
  /** 앞뒤 공백 무시(기본 true). */
  trimWhitespace?: boolean;
  /** 유사(근사) 중복 설정. */
  near?: {
    /** 기본 true. */
    enabled?: boolean;
    /** 유사도 임계값 0..1 (기본 0.9). 이 값 이상이면 유사 중복. */
    threshold?: number;
    /** 유사도 비교 대상 컬럼(미지정 시 전체 컬럼). */
    keyColumns?: string[];
  };
}

/** 포맷 정규화/일관성 검출 옵션. */
export interface FormatOptions {
  /** 기본 true. */
  enabled?: boolean;
}

/** 이상치/오류 검출 옵션. */
export interface OutlierOptions {
  /** 기본 true. */
  enabled?: boolean;
  /** z-score 임계값(기본 3). |z| 초과 시 통계적 이상치. */
  zScoreThreshold?: number;
  /** IQR 배수(기본 1.5). q1-k*iqr ~ q3+k*iqr 벗어나면 이상치. */
  iqrMultiplier?: number;
  /** 컬럼별 허용 범위(명시적 비즈니스 규칙). */
  ranges?: Array<{ column: string; min?: number; max?: number }>;
  /** 빈 값 플래그(기본 true). */
  flagEmpty?: boolean;
  /** 컬럼 대표 타입과 불일치하는 셀 플래그(기본 true). */
  flagTypeMismatch?: boolean;
}

/** 합계 검증 규칙: components 합 == total (행 단위). */
export interface SumCheck {
  /** 합산할 구성요소 컬럼명들. */
  components: string[];
  /** 합계가 들어있어야 할 컬럼명. */
  total: string;
  /** 절대 허용 오차(기본 0.01, 부동소수/반올림 흡수). */
  tolerance?: number;
  /** 리포트용 라벨. */
  label?: string;
}

/** 잔액 검증 규칙: 누적 잔액 = 직전 잔액 + 증감액. */
export interface BalanceCheck {
  /** 증감액 컬럼(입금 +, 출금 -). */
  amount: string;
  /** 잔액(누적) 컬럼. */
  balance: string;
  /** 시작 잔액. 미지정 시 첫 행에서 (balance[0]-amount[0])로 역산. */
  opening?: number;
  /** 절대 허용 오차(기본 0.01). */
  tolerance?: number;
  /** 리포트용 라벨. */
  label?: string;
}

/** 참조 무결성 규칙: column 값이 참조 집합에 존재해야 함. */
export interface ReferentialCheck {
  /** 검사 대상 컬럼명. */
  column: string;
  /** 참조 집합: 같은 파일의 다른 컬럼, 또는 명시적 값 목록. */
  references: { column: string } | { values: string[] };
  /** 빈 값 허용(기본 true). */
  allowEmpty?: boolean;
  /** 리포트용 라벨. */
  label?: string;
}

/** 정합성 검증 옵션(엔진의 핵심 강점). */
export interface IntegrityOptions {
  /** 기본 true. */
  enabled?: boolean;
  /** 합계 검증 규칙들. */
  sumChecks?: SumCheck[];
  /** 잔액 검증 규칙들. */
  balanceChecks?: BalanceCheck[];
  /** 참조 무결성 규칙들. */
  referentialChecks?: ReferentialCheck[];
  /** a+b≈c 형태 합계 관계 자동 탐지(기본 false). */
  discoverSumRelationships?: boolean;
}

/** 사용자가 넘기는 엔진 옵션(모두 선택). */
export interface EngineOptions {
  duplicates?: DuplicateOptions;
  format?: FormatOptions;
  outliers?: OutlierOptions;
  integrity?: IntegrityOptions;
}

/** 기본값이 모두 채워진 옵션. 검출기는 이 형태를 받는다. */
export interface ResolvedEngineOptions {
  duplicates: Required<Omit<DuplicateOptions, "ignoreColumns" | "near">> & {
    ignoreColumns: string[];
    near: { enabled: boolean; threshold: number; keyColumns: string[] };
  };
  format: { enabled: boolean };
  outliers: Required<Omit<OutlierOptions, "ranges">> & {
    ranges: Array<{ column: string; min?: number; max?: number }>;
  };
  integrity: {
    enabled: boolean;
    sumChecks: SumCheck[];
    balanceChecks: BalanceCheck[];
    referentialChecks: ReferentialCheck[];
    discoverSumRelationships: boolean;
  };
}

// ─────────────────────────────────────────────────────────────
// 5. 검출기 인터페이스
// ─────────────────────────────────────────────────────────────

/** 검출기에 주입되는 컨텍스트. */
export interface DetectorContext {
  table: ParsedTable;
  /** 사전 계산된 컬럼 프로파일(table.headers 와 평행). */
  columns: ColumnProfile[];
  /** 기본값이 채워진 옵션. */
  options: ResolvedEngineOptions;
}

/** 모든 검출기의 공통 시그니처. 순수 함수(부수효과 없음). */
export type Detector = (ctx: DetectorContext) => Issue[];

// ─────────────────────────────────────────────────────────────
// 6. 분석 리포트
// ─────────────────────────────────────────────────────────────

/** 리포트 요약 통계. */
export interface ReportSummary {
  totalIssues: number;
  byCategory: Record<IssueCategory, number>;
  bySeverity: Record<Severity, number>;
}

/** 엔진 최종 산출물. */
export interface AnalysisReport {
  table: {
    rowCount: number;
    columnCount: number;
    headers: string[];
  };
  columns: ColumnProfile[];
  issues: Issue[];
  summary: ReportSummary;
}
