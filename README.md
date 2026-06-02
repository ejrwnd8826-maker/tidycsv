# tidycsv

> 지저분한 CSV/엑셀을 넣으면 **중복·포맷 오류·이상치·정합성 불일치**를 잡아내 리포트하고 정리해 주는, **브라우저 로컬·결정론적(무 LLM)** 데이터 정제·검증 도구.

데이터는 서버로 나가지 않고 전부 브라우저(또는 Node) 안에서 처리됩니다. 규칙 기반 결정론적 엔진이라 같은 입력은 항상 같은 결과를 냅니다.

🔗 **[라이브 데모](https://ejrwnd8826-maker.github.io/tidycsv/)** · **[GitHub](https://github.com/ejrwnd8826-maker/tidycsv)**

> **상태:** ✅ 1~4주차 완료 — 코어 엔진(4종 검출) + 자동 정제·리포트 + 웹 UI + **GitHub Pages 라이브 배포**. [지금 바로 써보기 →](https://ejrwnd8826-maker.github.io/tidycsv/)

---

## 바로 써보기 (웹 앱)

```bash
npm install
npm run dev      # 로컬 개발 서버
npm run build    # 정적 빌드 → dist/ (GitHub Pages 배포용)
npm run preview  # 빌드 결과 미리보기
```

브라우저에서 **CSV·엑셀(.xlsx)을 끌어다 놓거나 "예제 데이터 불러오기"** → 검출 결과(요약·이슈 표) 확인 → (선택) **정합성 규칙 추가**(합계·잔액·참조를 내 컬럼에 맞게 UI에서 지정) → **"자동 정제하기"** → before/after 리포트 → **정제된 CSV 다운로드**. 모든 처리는 브라우저 안에서만 일어나고 파일은 어디로도 전송되지 않습니다.

> 엑셀 파서(SheetJS)는 **엑셀 파일을 올릴 때만 지연 로드**되어, CSV 사용자는 경량 번들(gzip ~19KB)만 받습니다.

---

## 왜 만들었나

회계·정산·마이그레이션처럼 **데이터 정합성이 중요한 작업**에서, "합계가 안 맞는다 / 잔액이 안 맞는다 / 참조가 깨졌다 / 날짜 포맷이 섞였다" 같은 문제를 사람이 눈으로 잡기는 어렵습니다. tidycsv 는 이런 **정합성 검증을 코드로 결정론적으로** 수행하는 엔진입니다.

LLM 을 쓰지 않으므로 **재현 가능**하고, 브라우저에서 돌아가므로 **민감한 데이터가 외부로 나가지 않습니다.**

---

## 검출 항목

| 카테고리 | 검출 내용 | 대표 이슈 코드 |
|---|---|---|
| **중복(duplicate)** | 정확 중복 행, 유사(근사) 중복 행 | `exact_duplicate_row`, `near_duplicate_row` |
| **포맷(format)** | 공백/제어문자 혼입, 날짜 포맷 혼용, 월/일 순서 모호, 숫자/통화 포맷 혼용 | `whitespace_format`, `inconsistent_date_format`, `ambiguous_date_order`, `inconsistent_number_format` |
| **이상치(outlier)** | 결측치, 타입 불일치, 범위 위반, 통계적 이상치(IQR·z-score) | `missing_value`, `type_mismatch`, `range_violation`, `statistical_outlier` |
| **정합성(integrity)** ⭐ | 합계 검증, 잔액(누적) 검증, 참조 무결성, 합계 관계 자동탐지 | `sum_mismatch`, `balance_mismatch`, `referential_violation`, `discovered_sum_relationship` |

⭐ 정합성 검증이 이 엔진의 핵심입니다.

---

## 사용법

```ts
import { analyzeCsv } from "tidycsv";

const csv = `order_id,subtotal,tax,total
1001,1000,100,1100
1004,1000,100,1200`;

const report = analyzeCsv(csv, {
  integrity: {
    sumChecks: [{ components: ["subtotal", "tax"], total: "total" }],
  },
});

console.log(report.summary);
// { totalIssues: 1, byCategory: { integrity: 1, ... }, bySeverity: { error: 1, ... } }

for (const issue of report.issues) {
  console.log(`[${issue.severity}] ${issue.type}: ${issue.message}`, issue.rows);
}
```

이미 파싱된 표가 있으면 `analyzeTable(table, options)` 를 직접 호출할 수도 있습니다.

### 정합성 검증 옵션

```ts
analyzeCsv(csv, {
  integrity: {
    // 합계: subtotal + tax == total
    sumChecks: [{ components: ["subtotal", "tax"], total: "total", tolerance: 0.01 }],
    // 잔액: balance[i] == balance[i-1] + amount[i]
    balanceChecks: [{ amount: "amount", balance: "balance" }],
    // 참조 무결성: status 는 허용 집합에 있어야 함
    referentialChecks: [
      { column: "status", references: { values: ["paid", "pending", "shipped", "cancelled"] } },
    ],
    // a + b ≈ c 형태 합계 관계 자동 탐지
    discoverSumRelationships: true,
  },
});
```

중복·포맷·이상치 검출은 옵션 없이도 자동 동작하며, 임계값(유사도·z-score·IQR 배수 등)은 옵션으로 조정합니다.

---

## 데모 — `examples/messy-orders.csv`

8행짜리 지저분한 주문 데이터([`examples/messy-orders.csv`](examples/messy-orders.csv))를 합계·참조 규칙과 함께 분석하면, 4개 카테고리에서 **12건의 이슈**를 잡아냅니다.

```
요약: 총 12건 (error 2 · warning 4 · info 6)
     중복 1 · 포맷 4 · 이상치 5 · 정합성 2
```

| 카테고리 | 이슈 | 심각도 | 위치 | 내용 |
|---|---|---|---|---|
| duplicate | `exact_duplicate_row` | warning | 행 0, 2 | 완전히 동일한 주문이 2번 |
| format | `whitespace_format` | warning | `customer` 행 3 | `" Alice "` 앞뒤 공백 |
| format | `inconsistent_date_format` | warning | `order_date` | 날짜 포맷 3종 혼용 (`YYYY-MM-DD`, `DD/MM/YYYY`, `YYYY/MM/DD`) |
| format | `inconsistent_number_format` | info | `unit_price`, `subtotal` | 천단위 구분자 혼용 (`1,200` ↔ `1000`) |
| outlier | `missing_value` | warning | `total` 행 6 | 빈 값 |
| outlier | `statistical_outlier` | info | `qty`, `subtotal`, `tax`, `total` | IQR 기준 이상치 |
| integrity ⭐ | `sum_mismatch` | **error** | 행 4 | `subtotal + tax`(1100) ≠ `total`(1200) |
| integrity ⭐ | `referential_violation` | **error** | `status` 행 7 | `'unknown'` 은 허용 상태값이 아님 |

잔액(누적) 검증은 [`examples/bank-statement.csv`](examples/bank-statement.csv)에서 한 지점의 잔액 끊김(`2995 - 800 ≠ 2200`)을 정확히 `balance_mismatch` 로 잡아냅니다.

---

## 자동 정제 + before/after 리포트

검출에서 그치지 않고, **안전한 것만 자동으로 정리**합니다.

```ts
import { cleanAndReport, renderReport, cleanTable, toCsv } from "tidycsv";

const report = cleanAndReport(table, { engine: { /* 정합성 규칙 */ } });
console.log(renderReport(report));   // 마크다운 before/after 리포트
const cleanedCsv = toCsv(report.clean.table); // 정제된 CSV 다운로드용
```

정제 철학은 **보수적**입니다:

| 처리 | 대상 | 자동? |
|---|---|---|
| 공백 정규화 (앞뒤·이중·전각·NBSP·제어문자) | 모든 컬럼 | ✅ 자동 |
| 숫자 포맷 통일 (통화·천단위 제거, `1.234,56`→`1234.56`) | 숫자 컬럼 | ✅ 자동 |
| 날짜 포맷 통일 (→ ISO) | 날짜 컬럼, **모호하지 않은 것만** | ✅ 자동 |
| 정확 중복 행 제거 (첫 행 유지, 정규화 후 판정) | 전체 행 | ✅ 자동 |
| 결측치·이상치·**정합성 위반(합계·잔액·참조)** | — | ❌ **검출만** (사람이 판단) |

> 금융성 데이터를 임의로 "고치는" 것은 위험하므로, 정합성 위반은 절대 자동 변경하지 않고 리포트의 "수동 검토" 항목으로 남깁니다. 모호한 날짜(`05/06/2024`처럼 월/일 순서를 단정할 수 없는 값)도 변환하지 않습니다.

`examples/messy-orders.csv` 정제 결과(실제 출력):

```
## 요약
- 행: 8 → 7 (중복 1건 제거)
- 자동 수정 셀: 4건 (공백 1 · 숫자 2 · 날짜 1)
- 검출 이슈: 12건 → 8건 (해결 4건)

## 자동 수정 내역
| 행 | 컬럼 | before | after | 종류 |
| 3 | customer | ` Alice ` | `Alice` | whitespace |
| 1 | unit_price | `1,200` | `1200` | number_format |
| 1 | subtotal | `1,200` | `1200` | number_format |
| 5 | order_date | `2024/01/09` | `2024-01-09` | date_format |

## 수동 검토 필요 (자동 수정 대상 아님)
| sum_mismatch | error | total 합계 불일치 |
| referential_violation | error | status='unknown' |
| missing_value | warning | total 빈 값 |
| statistical_outlier | info | qty/subtotal/tax/total |
```

남은 8건은 사람이 판단해야 할 **진짜 데이터 문제**(합계 오류·참조 위반·결측·이상치)만 추려진 것입니다.

---

## 아키텍처

```
src/
├── types.ts            # 공유 타입 계약(모든 검출기가 의존)
├── options.ts          # 옵션 기본값 리졸버
├── engine.ts           # 오케스트레이터: 파싱 → 프로파일 → 4종 검출 → 리포트
├── index.ts            # 공개 API 배럴
├── parse/
│   ├── csv.ts          # Papa Parse 래퍼 → 표준 ParsedTable
│   └── xlsx.ts         # SheetJS 래퍼(.xlsx → ParsedTable, 지연 로드)
├── infer/
│   └── columns.ts      # 컬럼 타입 추론 + 기술통계 프로파일링
├── util/
│   ├── coerce.ts       # 숫자/불리언/공백 강제변환·정규화
│   └── datetime.ts     # 날짜 포맷 분석(shape·모호성·재포맷)
├── detectors/
│   ├── duplicates.ts   # 중복
│   ├── format.ts       # 포맷 일관성
│   ├── outliers.ts     # 이상치/오류
│   └── integrity.ts    # 정합성 ⭐
├── clean/
│   ├── fixers.ts       # 공백·숫자·날짜·중복 fixer (순수 함수)
│   ├── clean.ts        # 정제 오케스트레이터(적용 순서·불변성)
│   └── report.ts       # before/after 리포트 빌더·마크다운 렌더
└── ui/
    ├── view.ts         # 순수 HTML 렌더(이스케이프 포함, 테스트 가능)
    ├── main.ts         # DOM 연결: 업로드·분석·정제·다운로드
    └── styles.css      # 스타일
index.html              # Vite 진입점 (브라우저 로컬 처리)
```

설계 원칙:
- **검출기·fixer는 순수 함수** — 부수효과 없음, 테스트 용이. 검출기는 `(ctx) => Issue[]`.
- **모든 셀은 문자열로 유지**하고, 숫자/날짜 해석은 util 레이어에 집중.
- **이슈는 컬럼/규칙 단위로 집계**해 `rows: number[]` 로 묶음(셀마다 폭발 방지).
- **정제는 보수적**: 안전·무손실 변환만 자동, 정합성 위반은 검출만. 원본 테이블 불변.

---

## 개발

```bash
npm install
npm test          # vitest 단위 테스트 (214개)
npm run test:cov  # 커버리지
npm run typecheck # tsc --noEmit
npm run build     # 타입체크 + 정적 빌드(dist/)
```

요구사항: Node 18+ (개발은 Node 24 LTS).

**테스트:** 214개 통과(코어 엔진·정제·엑셀 파싱·UI 스모크) · 함수 커버리지 100% · 의존성 취약점 0건.

---

## 파싱·해석 한계 (정직하게)

- 숫자 파싱: 영미식(`1,234.56`)과 유럽식(`1.234,56`)을 휴리스틱으로 구분합니다. 콤마 하나만 있는 `1,234` 같은 경우 천단위로 간주하며, 모호한 케이스의 규칙은 위 코드 주석에 명시돼 있습니다.
- 날짜 포맷: 연-후행 `12/05/2024` 형태는 월/일 순서를 단정할 수 없어 하나의 shape 로 묶고, 값으로 순서가 강제되는 경우(예: `25/03` ↔ `03/25`)만 충돌로 보고합니다. 달력상 불가능한 날짜(`2024-02-30`, 비윤년 `2023-02-29` 등)는 날짜로 인식하지 않습니다.
- 정제 시 공백 정규화는 셀 내부의 줄바꿈·탭도 공백 1칸으로 합칩니다(따옴표로 감싼 멀티라인 셀 주의). 모든 변경은 before/after 로 리포트에 기록되므로 확인 가능합니다.

---

## 로드맵

- [x] **1주차** — 코어 정합성 엔진 (CSV 파싱 + 4종 검출 + 단위 테스트)
- [x] **2주차** — 자동 정리(정제) + before/after 리포트 생성
- [x] **3주차** — UI(드래그앤드롭 업로드·결과 표시·다운로드) + 로컬 처리 마감
- [x] **4주차** — GitHub 공개·라이브 배포(GitHub Pages, Actions 자동배포)
  - 남은 선택 항목: 데모 GIF 녹화, 후원 버튼(GitHub Sponsors/Buy me a coffee)

## 라이선스

MIT
