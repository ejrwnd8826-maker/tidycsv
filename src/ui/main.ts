/**
 * UI 진입점 — DOM 연결.
 *
 * 업로드(CSV/엑셀) → 분석 → 결과 표시 → 정합성 규칙 추가 → 재분석 →
 * 정제 → 다운로드. 전부 브라우저 로컬(서버 없음).
 * 순수 렌더는 view.ts, 데이터 처리는 코어 엔진(../index.js)에 위임한다.
 */

import "./styles.css";
import { cleanAndReport } from "../clean/report.js";
import { analyzeTable } from "../engine.js";
import { parseCsv, toCsv } from "../parse/csv.js";
import type { EngineOptions, ParsedTable } from "../types.js";
import { SAMPLE_CSV, SAMPLE_ENGINE_OPTIONS, SAMPLE_NAME } from "./sample.js";
import type { IntegrityRuleSet } from "./view.js";
import { cleanHtml, resultsHtml, rulesPanelHtml } from "./view.js";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`요소를 찾을 수 없음: #${id}`);
  return node as T;
}

const dropzone = el<HTMLDivElement>("dropzone");
const fileInput = el<HTMLInputElement>("file-input");
const sampleBtn = el<HTMLButtonElement>("sample-btn");
const rulesEl = el<HTMLDivElement>("rules");
const resultsEl = el<HTMLDivElement>("results");
const cleanActions = el<HTMLDivElement>("clean-actions");
const cleanBtn = el<HTMLButtonElement>("clean-btn");
const cleanResults = el<HTMLDivElement>("clean-results");
const downloadBtn = el<HTMLButtonElement>("download-btn");
const fileLabel = el<HTMLSpanElement>("file-label");

let currentTable: ParsedTable | null = null;
let currentName = "data.csv";
let cleanedCsv = "";
let currentRules: IntegrityRuleSet = {
  sumChecks: [],
  balanceChecks: [],
  referentialChecks: [],
};

/** 현재 규칙 + 합계관계 자동탐지로 엔진 옵션 구성. */
function buildOptions(): EngineOptions {
  return {
    integrity: {
      sumChecks: currentRules.sumChecks,
      balanceChecks: currentRules.balanceChecks,
      referentialChecks: currentRules.referentialChecks,
      discoverSumRelationships: true,
    },
  };
}

/** 현재 테이블·규칙으로 재분석하고 결과·규칙 패널을 갱신. */
function reanalyze(): void {
  if (currentTable === null) return;
  const report = analyzeTable(currentTable, buildOptions());
  resultsEl.innerHTML = resultsHtml(report);
  rulesEl.innerHTML = rulesPanelHtml(currentTable.headers, currentRules);
  cleanActions.hidden = false;
  cleanResults.innerHTML = "";
  downloadBtn.hidden = true;
}

/** 테이블을 적재하고 분석 시작. */
function loadTable(
  table: ParsedTable,
  name: string,
  rules: IntegrityRuleSet,
): void {
  currentTable = table;
  currentName = name;
  currentRules = rules;
  fileLabel.textContent = `${name} — ${table.rowCount.toLocaleString()}행`;
  reanalyze();
  rulesEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** 현재 테이블을 정제하고 before/after 렌더 + 다운로드 준비. */
function runClean(): void {
  if (currentTable === null) return;
  const report = cleanAndReport(currentTable, { engine: buildOptions() });
  cleanResults.innerHTML = cleanHtml(report);
  cleanedCsv = toCsv(report.clean.table);
  downloadBtn.hidden = false;
}

/** 빈 규칙 묶음. */
function emptyRules(): IntegrityRuleSet {
  return { sumChecks: [], balanceChecks: [], referentialChecks: [] };
}

/** 엑셀 확장자 판별. */
function isXlsxName(name: string): boolean {
  return /\.(xlsx|xls|xlsm)$/i.test(name);
}

function showError(msg: string): void {
  resultsEl.innerHTML = `<p class="error-msg">${msg}</p>`;
}

/** 파일을 읽어 분석(확장자로 CSV/엑셀 분기. 엑셀 파서는 지연 로딩). */
function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onerror = () => showError("파일을 읽지 못했습니다.");

  if (isXlsxName(file.name)) {
    reader.onload = async () => {
      try {
        const buf = reader.result;
        if (!(buf instanceof ArrayBuffer)) return;
        // xlsx 파서(SheetJS)는 엑셀 업로드 시에만 동적 로드 → 초기 번들 경량화.
        const { parseXlsx } = await import("../parse/xlsx.js");
        loadTable(parseXlsx(buf), file.name, emptyRules());
      } catch (err) {
        showError(
          `엑셀 분석 실패: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        loadTable(parseCsv(text), file.name, emptyRules());
      } catch (err) {
        showError(
          `분석 실패: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };
    reader.readAsText(file);
  }
}

// ── 규칙 패널 이벤트 (위임) ───────────────────────────────────

function selVal(f: string): string {
  const node = rulesEl.querySelector<HTMLSelectElement | HTMLInputElement>(
    `[data-f="${f}"]`,
  );
  return node ? node.value : "";
}

function multiVals(f: string): string[] {
  const node = rulesEl.querySelector<HTMLSelectElement>(`[data-f="${f}"]`);
  if (node === null) return [];
  return Array.from(node.selectedOptions).map((o) => o.value);
}

rulesEl.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const act = target.dataset["act"];
  if (act === undefined) return;

  if (act === "add-sum") {
    const components = multiVals("sum-components");
    const total = selVal("sum-total");
    if (components.length > 0 && total !== "") {
      currentRules.sumChecks.push({ components, total });
      reanalyze();
    }
  } else if (act === "add-balance") {
    const amount = selVal("bal-amount");
    const balance = selVal("bal-balance");
    if (amount !== "" && balance !== "" && amount !== balance) {
      currentRules.balanceChecks.push({ amount, balance });
      reanalyze();
    }
  } else if (act === "add-ref") {
    const column = selVal("ref-column");
    const refcol = selVal("ref-refcol");
    const valuesText = selVal("ref-values").trim();
    if (column === "") return;
    if (valuesText !== "") {
      const values = valuesText
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "");
      if (values.length > 0) {
        currentRules.referentialChecks.push({ column, references: { values } });
        reanalyze();
      }
    } else if (refcol !== "") {
      currentRules.referentialChecks.push({
        column,
        references: { column: refcol },
      });
      reanalyze();
    }
  } else if (act === "del") {
    const kind = target.dataset["kind"];
    const idx = Number(target.dataset["idx"]);
    if (Number.isNaN(idx)) return;
    if (kind === "sum") currentRules.sumChecks.splice(idx, 1);
    else if (kind === "balance") currentRules.balanceChecks.splice(idx, 1);
    else if (kind === "ref") currentRules.referentialChecks.splice(idx, 1);
    reanalyze();
  }
});

// ── 업로드·실행 이벤트 ────────────────────────────────────────

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

sampleBtn.addEventListener("click", () => {
  const integrity = SAMPLE_ENGINE_OPTIONS.integrity;
  loadTable(parseCsv(SAMPLE_CSV), SAMPLE_NAME, {
    sumChecks: [...integrity.sumChecks],
    balanceChecks: [],
    referentialChecks: [...integrity.referentialChecks],
  });
});

cleanBtn.addEventListener("click", runClean);

downloadBtn.addEventListener("click", () => {
  const blob = new Blob([cleanedCsv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentName.replace(/\.(csv|xlsx|xls|xlsm)$/i, "") + ".cleaned.csv";
  a.click();
  URL.revokeObjectURL(url);
});
