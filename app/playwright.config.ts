import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts",
  testMatch: "screenshots.ts",
  timeout: 300_000,
  use: {
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
