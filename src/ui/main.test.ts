// @vitest-environment jsdom
/**
 * UI 스모크 테스트(jsdom).
 *
 * 실제 index.html 의 마크업을 로드하고 main.ts 를 import 해, "예제 불러오기 →
 * 분석 결과 렌더 → 정제 → before/after 렌더 → 다운로드 버튼 노출" 전 흐름이
 * 동작하는지 확인한다. id 불일치·이벤트 연결 누락 같은 배선 버그를 잡는다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("UI 스모크 (jsdom)", () => {
  beforeAll(async () => {
    // jsdom 환경에선 import.meta.url 이 file:// 가 아니므로 cwd(프로젝트 루트) 기준.
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const body = (html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "").replace(
      /<script[\s\S]*?<\/script>/g,
      "",
    );
    document.body.innerHTML = body;
    // jsdom 미구현 메서드 stub
    Element.prototype.scrollIntoView = () => {};
    // main.ts 는 import 시 DOM 에 이벤트를 연결한다(위에서 body 준비 후 import).
    await import("./main.js");
  });

  it("예제 불러오기 → 분석 → 정제 → 다운로드 흐름이 동작한다", () => {
    const byId = (id: string): HTMLElement => {
      const node = document.getElementById(id);
      if (node === null) throw new Error(`#${id} 없음`);
      return node;
    };

    // 1) 예제 불러오기 클릭 → 분석 결과 렌더
    (byId("sample-btn") as HTMLButtonElement).click();
    const results = byId("results");
    expect(results.innerHTML).toContain("총 이슈");
    expect(results.innerHTML).toContain("sum_mismatch"); // 정합성 위반 검출
    expect(results.innerHTML).toContain("badge-error");
    expect((byId("clean-actions") as HTMLDivElement).hidden).toBe(false);

    // 2) 정제하기 클릭 → before/after 렌더 + 다운로드 버튼 노출
    (byId("clean-btn") as HTMLButtonElement).click();
    const cleanResults = byId("clean-results");
    expect(cleanResults.innerHTML).toContain("정제 결과");
    expect(cleanResults.innerHTML).toContain("자동 수정 내역");
    expect(cleanResults.innerHTML).toContain("Alice"); // 공백 정리된 값
    expect((byId("download-btn") as HTMLButtonElement).hidden).toBe(false);
  });
});
