/**
 * 엔진 옵션 기본값 리졸버.
 *
 * 사용자가 일부만 지정한 EngineOptions 를, 모든 필드가 채워진
 * ResolvedEngineOptions 로 변환한다. 검출기는 항상 채워진 형태를 받는다.
 */

import type { EngineOptions, ResolvedEngineOptions } from "./types.js";

export function resolveOptions(opts: EngineOptions = {}): ResolvedEngineOptions {
  const dup = opts.duplicates ?? {};
  const near = dup.near ?? {};
  const out = opts.outliers ?? {};
  const integ = opts.integrity ?? {};

  return {
    duplicates: {
      enabled: dup.enabled ?? true,
      caseInsensitive: dup.caseInsensitive ?? true,
      trimWhitespace: dup.trimWhitespace ?? true,
      ignoreColumns: dup.ignoreColumns ?? [],
      near: {
        enabled: near.enabled ?? true,
        threshold: near.threshold ?? 0.9,
        keyColumns: near.keyColumns ?? [],
      },
    },
    format: {
      enabled: opts.format?.enabled ?? true,
    },
    outliers: {
      enabled: out.enabled ?? true,
      zScoreThreshold: out.zScoreThreshold ?? 3,
      iqrMultiplier: out.iqrMultiplier ?? 1.5,
      flagEmpty: out.flagEmpty ?? true,
      flagTypeMismatch: out.flagTypeMismatch ?? true,
      ranges: out.ranges ?? [],
    },
    integrity: {
      enabled: integ.enabled ?? true,
      sumChecks: integ.sumChecks ?? [],
      balanceChecks: integ.balanceChecks ?? [],
      referentialChecks: integ.referentialChecks ?? [],
      discoverSumRelationships: integ.discoverSumRelationships ?? false,
    },
  };
}
