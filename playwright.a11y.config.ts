import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const setupProject = baseConfig.projects?.find((project) => project.name === "setup");
const desktopProject = baseConfig.projects?.find((project) => project.name === "desktop-chromium");

if (!setupProject || !desktopProject) {
  throw new Error("Playwright a11y config requires the setup and desktop-chromium projects.");
}

export default defineConfig({
  ...baseConfig,
  outputDir: "test-results-a11y",
  reporter: [
    ["list", { printSteps: true }],
    ["html", { outputFolder: "playwright-report-a11y" }],
    ["json", { outputFile: "test-results-a11y.json" }],
  ],
  projects: [
    setupProject,
    {
      ...desktopProject,
      name: "a11y-chromium",
      testMatch: /scenarios\/accessibility\.test\.ts/,
      testIgnore: [],
      dependencies: ["setup"],
    },
  ],
});
