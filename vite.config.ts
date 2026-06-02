import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages 하위 경로에서도 동작하도록 상대 경로 base.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    // 코어 엔진·정제는 순수 로직이라 node 환경(UI 테스트는 파일 상단 주석으로 jsdom 지정).
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/ui/main.ts"],
    },
  },
});
