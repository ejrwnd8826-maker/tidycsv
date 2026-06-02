[한국어](README.md) | **English**

# tidycsv

> Drop a messy CSV/Excel file and tidycsv finds **duplicates, format errors, outliers, and integrity mismatches**, then cleans and reports — **100% in your browser, deterministic, no LLM.**

Your data never leaves the browser (no server). The rule-based engine is deterministic — the same input always yields the same result.

🔗 **[Live demo](https://duke-yoon.github.io/tidycsv/)** · **[GitHub](https://github.com/duke-yoon/tidycsv)**

> **Status:** ✅ Core engine + auto-cleaning + before/after report + web UI (bilingual KO/EN) + live on GitHub Pages.

---

## Why

For accounting / reconciliation / migration work, problems like "the totals don't add up", "the running balance broke", "a referenced value is missing", or "date formats are mixed" are hard to catch by eye. tidycsv performs these **integrity checks deterministically in code** — reproducible, and private (data stays local).

---

## What it detects

| Category | Checks | Issue codes |
|---|---|---|
| **Duplicate** | exact & near-duplicate rows | `exact_duplicate_row`, `near_duplicate_row` |
| **Format** | whitespace/control chars, mixed date formats, ambiguous day/month order, mixed number/currency formats | `whitespace_format`, `inconsistent_date_format`, `ambiguous_date_order`, `inconsistent_number_format` |
| **Outlier** | missing values, type mismatch, range violation, statistical outliers (IQR / z-score) | `missing_value`, `type_mismatch`, `range_violation`, `statistical_outlier` |
| **Integrity** ⭐ | sum checks, running-balance checks, referential integrity, auto-discovered sum relationships | `sum_mismatch`, `balance_mismatch`, `referential_violation`, `discovered_sum_relationship` |

⭐ Integrity checking is the heart of the engine.

---

## Use it (web app)

```bash
npm install
npm run dev      # local dev server
npm run build    # static build → dist/ (for GitHub Pages)
npm run preview  # preview the build
```

In the browser: **drop a CSV/Excel (.xlsx) file or "Load sample data"** → review the detected issues → (optional) **add integrity rules** (sum/balance/reference, mapped to your columns) → **Auto-clean** → before/after report → **download the cleaned CSV**. Everything runs in the browser; files are never uploaded. The UI auto-detects Korean/English and has a 🌐 toggle.

### Library usage

```ts
import { analyzeCsv } from "tidycsv";

const report = analyzeCsv(csv, {
  integrity: {
    sumChecks: [{ components: ["subtotal", "tax"], total: "total" }],
    balanceChecks: [{ amount: "amount", balance: "balance" }],
    referentialChecks: [
      { column: "status", references: { values: ["paid", "pending", "shipped"] } },
    ],
    discoverSumRelationships: true,
  },
});
console.log(report.summary);
```

Duplicate/format/outlier detection runs with no config; thresholds are tunable via options.

---

## Conservative auto-cleaning

Beyond detection, tidycsv **auto-fixes only what is safe**:

| Fix | Target | Auto? |
|---|---|---|
| Whitespace normalization (trim, collapse, NBSP/full-width/control) | all columns | ✅ |
| Number format (strip currency/thousands, `1.234,56`→`1234.56`) | numeric columns | ✅ |
| Date format → ISO | date columns, **unambiguous only** | ✅ |
| Exact duplicate row removal (keep first, after normalization) | all rows | ✅ |
| Missing values, outliers, **integrity violations (sum/balance/reference)** | — | ❌ **detect only** (human decides) |

> "Fixing" financial data automatically is dangerous, so integrity violations are never auto-changed — they stay in the report's "manual review" section. Ambiguous dates (e.g. `05/06/2024`, where month/day order can't be determined) are left untouched.

---

## Architecture

```
src/
├── types.ts            # shared type contract (all detectors depend on it)
├── engine.ts           # orchestrator: parse → profile → 4 detectors → report
├── parse/{csv,xlsx}.ts # Papa Parse / SheetJS wrappers → ParsedTable
├── infer/columns.ts    # column type inference + descriptive stats
├── util/{coerce,datetime}.ts  # number/boolean/whitespace + date analysis
├── detectors/{duplicates,format,outliers,integrity}.ts  # pure (ctx) => Issue[]
├── clean/{fixers,clean,report}.ts  # conservative auto-clean + before/after
└── ui/{view,main,i18n,styles}      # vanilla TS + Vite, bilingual
```

Design principles:
- **Detectors & fixers are pure functions** — no side effects, easy to test.
- **Cells stay strings**; number/date interpretation lives in the util layer.
- **Issues aggregate per column/rule** into `rows: number[]` (no per-cell explosion).
- **Cleaning is conservative**: only safe/lossless transforms auto-run; integrity violations are detect-only; the original table is never mutated.

---

## Development

```bash
npm test          # vitest unit tests
npm run typecheck # tsc --noEmit
npm run build     # typecheck + static build
```

Requirements: Node 18+ (developed on Node 24 LTS). Function coverage 100%, 0 dependency vulnerabilities.

## License

MIT
