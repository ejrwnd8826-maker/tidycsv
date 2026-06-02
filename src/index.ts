/**
 * tidycsv 코어 엔진 — 공개 API 배럴.
 *
 * 외부(향후 UI 레이어 포함)에서는 이 모듈만 import 한다.
 */

// 메인 엔진
export { analyzeTable, analyzeCsv } from "./engine.js";

// 파싱
export { parseCsv, tableFromRows, toCsv } from "./parse/csv.js";
export type { ParseCsvOptions } from "./parse/csv.js";
export { parseXlsx, isXlsxFilename } from "./parse/xlsx.js";
export type { ParseXlsxOptions } from "./parse/xlsx.js";

// 정제(clean)
export { cleanTable } from "./clean/clean.js";
export { resolveCleanOptions } from "./clean/options.js";
export { cleanAndReport, renderReport } from "./clean/report.js";
export type {
  CleanOptions,
  ResolvedCleanOptions,
  CleanResult,
  CellChange,
  RowRemoval,
  FixerName,
  DateTarget,
} from "./clean/types.js";
export type { CleanReport, CleanReportOptions } from "./clean/report.js";

// 프로파일링
export {
  buildColumnProfiles,
  profileColumn,
  inferCellType,
  computeNumericStats,
} from "./infer/columns.js";

// 옵션 리졸버
export { resolveOptions } from "./options.js";

// 개별 검출기(고급 사용)
export { detectDuplicates } from "./detectors/duplicates.js";
export { detectFormatIssues } from "./detectors/format.js";
export { detectOutliers } from "./detectors/outliers.js";
export { detectIntegrity } from "./detectors/integrity.js";

// 유틸(필요 시)
export {
  parseNumber,
  parseBoolean,
  isBlank,
  normalizeWhitespace,
} from "./util/coerce.js";
export { analyzeDate } from "./util/datetime.js";

// 타입
export type {
  Cell,
  ParsedTable,
  ColumnType,
  NumericStats,
  ColumnProfile,
  Severity,
  IssueCategory,
  Issue,
  EngineOptions,
  ResolvedEngineOptions,
  DuplicateOptions,
  FormatOptions,
  OutlierOptions,
  IntegrityOptions,
  SumCheck,
  BalanceCheck,
  ReferentialCheck,
  DetectorContext,
  Detector,
  ReportSummary,
  AnalysisReport,
} from "./types.js";
