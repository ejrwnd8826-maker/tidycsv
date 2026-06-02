/**
 * 날짜 분석 유틸리티.
 *
 * "이 셀이 날짜인가?", "어떤 포맷인가?", "월/일 순서가 모호한가?"를 판정한다.
 * 포맷 일관성 검출기가 한 컬럼 안의 날짜 포맷 혼용을 잡는 데 사용한다.
 *
 * 형태(shape) 라벨은 일관성 비교용이다. 같은 컬럼의 모든 날짜가 같은 shape 면
 * 일관된 것으로 본다. 연-후행(예: 12/05/2024) 형태는 월/일 순서를 단정할 수
 * 없으므로 하나의 shape("DD/MM/YYYY")로 묶고, 값으로 순서가 강제되는 경우
 * (첫째>12 또는 둘째>12)는 별도 플래그로 노출한다.
 */

/** 날짜 분석 결과. */
export interface DateAnalysis {
  /** 날짜로 해석 가능한가. */
  ok: boolean;
  /** 일관성 비교용 포맷 라벨(예: "YYYY-MM-DD"). */
  shape?: string;
  /** 연도가 맨 앞인가. */
  yearFirst?: boolean;
  /** 구분자("-" "/" "." 또는 month-name 형태는 "name"). */
  separator?: string;
  /** 첫 컴포넌트가 12 초과 → 일(day) 우선이 강제됨(연-후행 한정). */
  forcesDayFirst?: boolean;
  /** 둘째 컴포넌트가 12 초과 → 월 우선이 강제됨(연-후행 한정). */
  forcesMonthFirst?: boolean;
  /** 시간 부분(HH:MM[:SS]) 포함 여부. */
  hasTime?: boolean;
  /** 모호하지 않게 확정될 때만 채워지는 연/월/일(정규화용). */
  year?: number;
  month?: number;
  day?: number;
}

/** 날짜 정규화 목표 포맷. */
export type DateTarget = "YYYY-MM-DD" | "YYYY/MM/DD";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const FAIL: DateAnalysis = { ok: false };

function validMonth(m: number): boolean {
  return m >= 1 && m <= 12;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * 달력상 실재하는 날짜인지 검증(월별 일수·윤년 고려).
 * 예: 2024-02-30(없음)·2023-02-29(비윤년)·2024-04-31(없음) → false.
 */
function validDateComponents(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999) return false;
  if (!validMonth(month)) return false;
  if (day < 1) return false;
  let max = DAYS_IN_MONTH[month - 1] as number;
  if (month === 2 && isLeapYear(year)) max = 29;
  return day <= max;
}

/**
 * 시간 꼬리표(" 13:45[:30]", "T13:45")를 분리.
 * 시(0~23)·분(0~59)·초(0~59) 범위를 검증해 "25:99" 같은 헛값은 시간으로 보지 않는다.
 */
function splitTime(s: string): { date: string; hasTime: boolean } {
  const m = s.match(
    /^(.*?)[ T](([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[AaPp][Mm])?)$/,
  );
  if (m && m[1]) return { date: m[1].trim(), hasTime: true };
  return { date: s, hasTime: false };
}

/**
 * 문자열을 날짜로 분석. 실패 시 { ok:false }.
 */
export function analyzeDate(raw: string | null | undefined): DateAnalysis {
  if (raw == null) return FAIL;
  const trimmed = raw.trim();
  if (trimmed === "") return FAIL;

  const { date, hasTime } = splitTime(trimmed);

  // 1) 숫자형: 연-선행 (YYYY{sep}MM{sep}DD)
  const yf = date.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/);
  if (yf) {
    const sep = yf[2] as string;
    const year = Number(yf[1]);
    const month = Number(yf[3]);
    const day = Number(yf[4]);
    if (!validDateComponents(year, month, day)) return FAIL;
    return {
      ok: true,
      shape: `YYYY${sep}MM${sep}DD`,
      yearFirst: true,
      separator: sep,
      hasTime,
      year,
      month,
      day,
    };
  }

  // 2) 숫자형: 연-후행 (XX{sep}XX{sep}YYYY) — 월/일 순서 모호
  const yl = date.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/);
  if (yl) {
    const sep = yl[2] as string;
    const a = Number(yl[1]); // 첫째
    const b = Number(yl[3]); // 둘째
    const forcesDayFirst = a > 12; // 첫째가 12 초과면 일 우선 확정
    const forcesMonthFirst = b > 12; // 둘째가 12 초과면 월 우선 확정
    if (forcesDayFirst && forcesMonthFirst) return FAIL; // 둘 다 >12 면 불가
    const year = Number(yl[4]);
    // 달력상 유효한 해석(월별 일수·윤년 포함). 일-우선: 월=b,일=a / 월-우선: 월=a,일=b.
    const dayFirstValid = validDateComponents(year, b, a);
    const monthFirstValid = validDateComponents(year, a, b);
    if (!dayFirstValid && !monthFirstValid) return FAIL;
    // 모호하지 않게 한 해석만 가능할 때만 연/월/일 확정(정규화 안전).
    let comps: { month: number; day: number } | null = null;
    if (dayFirstValid && !monthFirstValid) comps = { day: a, month: b };
    else if (monthFirstValid && !dayFirstValid) comps = { month: a, day: b };
    const base: DateAnalysis = {
      ok: true,
      shape: `DD${sep}MM${sep}YYYY`,
      yearFirst: false,
      separator: sep,
      forcesDayFirst,
      forcesMonthFirst,
      hasTime,
    };
    if (comps) {
      base.year = year;
      base.month = comps.month;
      base.day = comps.day;
    }
    return base;
  }

  // 3) 월 이름형: "Jan 5, 2024" / "January 5 2024" / "5 Jan 2024"
  const tokens = date.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 3) {
    const lower = tokens.map((t) => t.toLowerCase());
    // 패턴 A: Mon DD YYYY
    const t0 = lower[0] as string;
    const t1 = lower[1] as string;
    const t2 = lower[2] as string;
    if (t0 in MONTHS && /^\d{1,2}$/.test(t1) && /^\d{4}$/.test(t2)) {
      const day = Number(t1);
      const month = MONTHS[t0] as number;
      const year = Number(t2);
      if (validDateComponents(year, month, day)) {
        return {
          ok: true,
          shape: "MMM DD, YYYY",
          separator: "name",
          hasTime,
          year,
          month,
          day,
        };
      }
    }
    // 패턴 B: DD Mon YYYY
    if (/^\d{1,2}$/.test(t0) && t1 in MONTHS && /^\d{4}$/.test(t2)) {
      const day = Number(t0);
      const month = MONTHS[t1] as number;
      const year = Number(t2);
      if (validDateComponents(year, month, day)) {
        return {
          ok: true,
          shape: "DD MMM YYYY",
          separator: "name",
          hasTime,
          year,
          month,
          day,
        };
      }
    }
  }

  return FAIL;
}

/** 날짜로 해석 가능하면 true(타입 추론용). */
export function looksDate(raw: string): boolean {
  return analyzeDate(raw).ok;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 날짜 문자열을 목표 포맷으로 재포맷. 정규화가 '안전하지 않으면' null.
 *
 * null 을 돌려주는(= 변환하지 않는) 경우:
 *  - 날짜로 인식되지 않음
 *  - 월/일 순서가 모호해 연/월/일이 확정되지 않음(예: "05/06/2024")
 *  - 시간 부분 포함(HH:MM) — 재포맷 시 시간 손실 위험이 있어 건드리지 않음
 */
export function reformatDate(
  raw: string,
  target: DateTarget = "YYYY-MM-DD",
): string | null {
  const a = analyzeDate(raw);
  if (!a.ok || a.hasTime) return null;
  if (a.year === undefined || a.month === undefined || a.day === undefined) {
    return null;
  }
  const sep = target === "YYYY/MM/DD" ? "/" : "-";
  return `${a.year}${sep}${pad2(a.month)}${sep}${pad2(a.day)}`;
}
