import { describe, expect, it } from "vitest";
import { buildColumnProfiles } from "../infer/columns.js";
import { resolveOptions } from "../options.js";
import { tableFromRows } from "../parse/csv.js";
import type { DetectorContext, EngineOptions, Issue } from "../types.js";
import { detectDuplicates } from "./duplicates.js";

/** 테스트용 DetectorContext 헬퍼. */
function makeCtx(
  headers: string[],
  rows: string[][],
  opts?: EngineOptions,
): DetectorContext {
  const table = tableFromRows(headers, rows);
  return {
    table,
    columns: buildColumnProfiles(table),
    options: resolveOptions(opts),
  };
}

/** 특정 type 의 이슈만 추린다. */
function ofType(issues: Issue[], type: string): Issue[] {
  return issues.filter((i) => i.type === type);
}

// 비가시/특수문자 헬퍼 (소스에 리터럴로 넣지 않는다)
const NBSP = String.fromCharCode(0x00a0);
const FULL_SPACE = String.fromCharCode(0x3000);

describe("detectDuplicates — exact(정확 중복)", () => {
  it("동일한 두 행을 정확 중복 그룹 하나로 묶는다", () => {
    const ctx = makeCtx(
      ["name", "city"],
      [
        ["Alice", "Seoul"],
        ["Bob", "Busan"],
        ["Alice", "Seoul"],
      ],
    );
    const issues = ofType(detectDuplicates(ctx), "exact_duplicate_row");
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.category).toBe("duplicate");
    expect(issue.severity).toBe("warning");
    expect(issue.rows).toEqual([0, 2]);
    expect(issue.data).toMatchObject({
      count: 2,
      keepRow: 0,
      duplicateRows: [2],
    });
  });

  it("3개 이상 중복은 count·keepRow·duplicateRows 가 정확하다", () => {
    const ctx = makeCtx(
      ["name"],
      [["X"], ["X"], ["Y"], ["X"]],
    );
    const issues = ofType(detectDuplicates(ctx), "exact_duplicate_row");
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.rows).toEqual([0, 1, 3]);
    expect(issue.message).toBe("Found 3 exact duplicate rows");
    expect(issue.data).toMatchObject({
      count: 3,
      keepRow: 0,
      duplicateRows: [1, 3],
    });
  });

  it("서로 다른 두 중복 그룹은 두 개의 이슈로 방출한다", () => {
    const ctx = makeCtx(
      ["v"],
      [["a"], ["b"], ["a"], ["b"], ["c"]],
      { duplicates: { near: { enabled: false } } },
    );
    const issues = ofType(detectDuplicates(ctx), "exact_duplicate_row");
    expect(issues).toHaveLength(2);
    expect(issues[0]!.rows).toEqual([0, 2]);
    expect(issues[1]!.rows).toEqual([1, 3]);
  });

  it("중복이 전혀 없으면 정확 중복 이슈를 내지 않는다", () => {
    const ctx = makeCtx(
      ["v"],
      [["1"], ["2"], ["3"]],
      { duplicates: { near: { enabled: false } } },
    );
    expect(ofType(detectDuplicates(ctx), "exact_duplicate_row")).toHaveLength(0);
  });
});

describe("detectDuplicates — ignoreColumns", () => {
  it("id 컬럼을 무시하면 나머지가 같은 행이 중복으로 잡힌다", () => {
    const ctx = makeCtx(
      ["id", "name", "city"],
      [
        ["1", "Alice", "Seoul"],
        ["2", "Alice", "Seoul"],
      ],
      { duplicates: { ignoreColumns: ["id"], near: { enabled: false } } },
    );
    const issues = ofType(detectDuplicates(ctx), "exact_duplicate_row");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rows).toEqual([0, 1]);
  });

  it("id 를 무시하지 않으면(기본) 같은 행이 아니라 중복이 아니다", () => {
    const ctx = makeCtx(
      ["id", "name"],
      [
        ["1", "Alice"],
        ["2", "Alice"],
      ],
      { duplicates: { near: { enabled: false } } },
    );
    expect(ofType(detectDuplicates(ctx), "exact_duplicate_row")).toHaveLength(0);
  });
});

describe("detectDuplicates — 정규화(대소문자/공백)", () => {
  it("caseInsensitive 기본값으로 대소문자만 다른 행은 중복이다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Alice"], ["ALICE"]],
      { duplicates: { near: { enabled: false } } },
    );
    expect(ofType(detectDuplicates(ctx), "exact_duplicate_row")).toHaveLength(1);
  });

  it("caseInsensitive=false 면 대소문자가 다르면 중복이 아니다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Alice"], ["ALICE"]],
      { duplicates: { caseInsensitive: false, near: { enabled: false } } },
    );
    expect(ofType(detectDuplicates(ctx), "exact_duplicate_row")).toHaveLength(0);
  });

  it("trimWhitespace 기본값으로 NBSP·전각공백·이중 공백 차이는 중복으로 본다", () => {
    const ctx = makeCtx(
      ["name"],
      [
        ["New York"],
        [`New${NBSP}York`],
        [`New${FULL_SPACE}York`],
        ["New  York"],
      ],
      { duplicates: { near: { enabled: false } } },
    );
    const issues = ofType(detectDuplicates(ctx), "exact_duplicate_row");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rows).toEqual([0, 1, 2, 3]);
  });

  it("trimWhitespace=false 면 앞뒤 공백 차이가 중복을 깬다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Alice"], [" Alice "]],
      {
        duplicates: {
          trimWhitespace: false,
          near: { enabled: false },
        },
      },
    );
    expect(ofType(detectDuplicates(ctx), "exact_duplicate_row")).toHaveLength(0);
  });
});

describe("detectDuplicates — near(유사 중복)", () => {
  it("임계값 이상으로 유사한 비-정확-중복 쌍을 방출한다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Jonathan Smith"], ["Jonathon Smith"]],
      { duplicates: { near: { enabled: true, threshold: 0.8 } } },
    );
    const issues = ofType(detectDuplicates(ctx), "near_duplicate_row");
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.severity).toBe("info");
    expect(issue.rows).toEqual([0, 1]);
    expect(typeof issue.data!["similarity"]).toBe("number");
    expect(issue.data!["similarity"] as number).toBeGreaterThanOrEqual(0.8);
  });

  it("유사도가 임계값 미만이면 near 이슈를 내지 않는다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Apple"], ["Orange"]],
      { duplicates: { near: { enabled: true, threshold: 0.9 } } },
    );
    expect(ofType(detectDuplicates(ctx), "near_duplicate_row")).toHaveLength(0);
  });

  it("near.enabled=false 면 near 이슈가 전혀 없다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Jonathan Smith"], ["Jonathon Smith"]],
      { duplicates: { near: { enabled: false, threshold: 0.5 } } },
    );
    const issues = detectDuplicates(ctx);
    expect(ofType(issues, "near_duplicate_row")).toHaveLength(0);
    expect(ofType(issues, "near_duplicate_skipped")).toHaveLength(0);
  });

  it("정확 중복 쌍은 near 에서 제외된다", () => {
    // 두 행이 완전히 동일 -> exact 만 잡히고 near 는 없어야 함.
    const ctx = makeCtx(
      ["name"],
      [["Alice Cooper"], ["Alice Cooper"]],
      { duplicates: { near: { enabled: true, threshold: 0.5 } } },
    );
    const issues = detectDuplicates(ctx);
    expect(ofType(issues, "exact_duplicate_row")).toHaveLength(1);
    expect(ofType(issues, "near_duplicate_row")).toHaveLength(0);
  });

  it("near.keyColumns 로 비교 컬럼을 제한한다", () => {
    // name 만 비교 -> 두 행이 near. note 컬럼은 무시.
    const ctx = makeCtx(
      ["name", "note"],
      [
        ["Jonathan Smith", "totally different note A"],
        ["Jonathon Smith", "completely other text B"],
      ],
      {
        duplicates: {
          near: { enabled: true, threshold: 0.8, keyColumns: ["name"] },
        },
      },
    );
    const issues = ofType(detectDuplicates(ctx), "near_duplicate_row");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rows).toEqual([0, 1]);
  });

  it("similarity 는 소수 3자리로 반올림된다", () => {
    const ctx = makeCtx(
      ["name"],
      [["abcde"], ["abcdef"]],
      { duplicates: { near: { enabled: true, threshold: 0.1 } } },
    );
    const issues = ofType(detectDuplicates(ctx), "near_duplicate_row");
    expect(issues).toHaveLength(1);
    const sim = issues[0]!.data!["similarity"] as number;
    // 소수 3자리 이하만 가져야 함
    expect(Math.round(sim * 1000) / 1000).toBe(sim);
  });
});

describe("detectDuplicates — enabled / 성능 가드", () => {
  it("enabled=false 면 빈 배열을 반환한다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Alice"], ["Alice"]],
      { duplicates: { enabled: false } },
    );
    expect(detectDuplicates(ctx)).toEqual([]);
  });

  it("행 수가 2000 을 초과하면 near 를 건너뛰고 skipped 이슈를 낸다", () => {
    // 2001 개의 고유 행 (정확 중복 없음, near 비교 대상이 매우 큼)
    const rows: string[][] = [];
    for (let i = 0; i < 2001; i++) rows.push([`row-${i}`]);
    const ctx = makeCtx(["name"], rows, {
      duplicates: { near: { enabled: true, threshold: 0.5 } },
    });
    const issues = detectDuplicates(ctx);
    const skipped = ofType(issues, "near_duplicate_skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.severity).toBe("info");
    expect(skipped[0]!.rows).toBeUndefined();
    // 실제 near 쌍 이슈는 없어야 함
    expect(ofType(issues, "near_duplicate_row")).toHaveLength(0);
  });

  it("정확히 2000 행이면 near 를 건너뛰지 않는다(경계)", () => {
    const rows: string[][] = [];
    for (let i = 0; i < 2000; i++) rows.push([`u-${i}`]);
    const ctx = makeCtx(["name"], rows, {
      duplicates: { near: { enabled: true, threshold: 0.99 } },
    });
    const issues = detectDuplicates(ctx);
    expect(ofType(issues, "near_duplicate_skipped")).toHaveLength(0);
  });
});

describe("detectDuplicates — 종합", () => {
  it("exact 와 near 가 함께 존재할 수 있다", () => {
    const ctx = makeCtx(
      ["name"],
      [
        ["Catherine"], // 0
        ["Catherine"], // 1 (0 과 정확 중복)
        ["Katherine"], // 2 (0/1 과 유사)
      ],
      { duplicates: { near: { enabled: true, threshold: 0.6 } } },
    );
    const issues = detectDuplicates(ctx);
    const exact = ofType(issues, "exact_duplicate_row");
    const near = ofType(issues, "near_duplicate_row");
    expect(exact).toHaveLength(1);
    expect(exact[0]!.rows).toEqual([0, 1]);
    // 2 는 0·1 과 유사하므로 near 쌍이 잡혀야 함 (0-2, 1-2)
    expect(near.length).toBeGreaterThanOrEqual(1);
    for (const n of near) {
      expect(n.rows).toContain(2);
    }
  });

  it("모든 이슈의 category 는 'duplicate' 다", () => {
    const ctx = makeCtx(
      ["name"],
      [["Jonathan"], ["Jonathan"], ["Jonathon"]],
      { duplicates: { near: { enabled: true, threshold: 0.5 } } },
    );
    const issues = detectDuplicates(ctx);
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(i.category).toBe("duplicate");
    }
  });
});
