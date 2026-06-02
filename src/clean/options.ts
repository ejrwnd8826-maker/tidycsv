/** 정제 옵션 기본값 리졸버. */

import type { CleanOptions, ResolvedCleanOptions } from "./types.js";

export function resolveCleanOptions(
  opts: CleanOptions = {},
): ResolvedCleanOptions {
  return {
    whitespace: opts.whitespace ?? true,
    numberFormat: opts.numberFormat ?? true,
    dateFormat: opts.dateFormat ?? true,
    dateTarget: opts.dateTarget ?? "YYYY-MM-DD",
    removeDuplicates: opts.removeDuplicates ?? true,
  };
}
