/**
 * UI 진입점 — DOM 연결.
 *
 * 업로드 → 분석 → 결과 표시 → 정제 → 다운로드. 전부 브라우저 로컬(서버 없음).
 * 순수 렌더는 view.ts, 데이터 처리는 코어 엔진(../index.js)에 위임한다.
 */

import "./styles.css";
import { analyzeTable } from "../engine.js";
import { cleanAndReport } from "../clean/report.js";
import { parseCsv, toCsv } from "../parse/csv.js";
import type { EngineOptions, ParsedTable } from "../types.js";
import { SAMPLE_CSV, SAMPLE_ENGINE_OPTIONS, SAMPLE_NAME } from "./sample.js";
import { cleanHtml, resultsHtml } from "./view.js";

/** id 로 요소를 가져오되 없으면 예외. */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`요소를 찾을 수 없음: #${id}`);
  return node as T;
}

const dropzone = el<HTMLDivElement>("dropzone");
const fileInput = el<HTMLInputElement>("file-input");
const sampleBtn = el<HTMLButtonElement>("sample-btn");
const resultsEl = el<HTMLDivElement>("results");
const cleanActions = el<HTMLDivElement>("clean-actions");
const cleanBtn = el<HTMLButtonElement>("clean-btn");
const cleanResults = el<HTMLDivElement>("clean-results");
const downloadBtn = el<HTMLButtonElement>("download-btn");
const fileLabel = el<HTMLSpanElement>("file-label");

let currentTable: ParsedTable | null = null;
let currentOptions: EngineOptions = {};
let currentName = "data.csv";
let cleanedCsv = "";

/** CSV 텍스트를 분석하고 결과를 렌더. */
function analyzeAndRender(
  csvText: string,
  name: string,
  options: EngineOptions,
): void {
  try {
    const table = parseCsv(csvText);
    currentTable = table;
    currentOptions = options;
    currentName = name;

    const report = analyzeTable(table, options);
    resultsEl.innerHTML = resultsHtml(report);
    fileLabel.textContent = `${name} — ${table.rowCount.toLocaleString()}행`;

    // 정제 단계 초기화
    cleanActions.hidden = false;
    cleanResults.innerHTML = "";
    downloadBtn.hidden = true;
    cleanResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    resultsEl.innerHTML = `<p class="error-msg">분석 실패: ${
      err instanceof Error ? err.message : String(err)
    }</p>`;
  }
}

/** 현재 테이블을 정제하고 before/after 렌더 + 다운로드 준비. */
function runClean(): void {
  if (currentTable === null) return;
  const report = cleanAndReport(currentTable, { engine: currentOptions });
  cleanResults.innerHTML = cleanHtml(report);
  cleanedCsv = toCsv(report.clean.table);
  downloadBtn.hidden = false;
}

/** 파일에서 텍스트를 읽어 분석(업로드는 합계관계 자동탐지 활성). */
function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    analyzeAndRender(text, file.name, {
      integrity: { discoverSumRelationships: true },
    });
  };
  reader.onerror = () => {
    resultsEl.innerHTML = `<p class="error-msg">파일을 읽지 못했습니다.</p>`;
  };
  reader.readAsText(file);
}

// ── 이벤트 연결 ───────────────────────────────────────────────

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
  analyzeAndRender(SAMPLE_CSV, SAMPLE_NAME, SAMPLE_ENGINE_OPTIONS);
});

cleanBtn.addEventListener("click", runClean);

downloadBtn.addEventListener("click", () => {
  const blob = new Blob([cleanedCsv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentName.replace(/\.csv$/i, "") + ".cleaned.csv";
  a.click();
  URL.revokeObjectURL(url);
});
