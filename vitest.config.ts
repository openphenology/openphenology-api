import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const include = ["test/**/*.test.ts"];
const chromiumPath = process.env.CHROMIUM_PATH;

export default defineConfig({
  test: {
    // V8 coverage works only in Node.js and Chromium, so it is measured in Node.js.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
    projects: [
      { test: { name: "node", include } },
      {
        test: {
          name: "browser",
          include,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              // Lets a machine with a preinstalled Chromium use it.
              launchOptions: chromiumPath
                ? { executablePath: chromiumPath }
                : {},
            }),
            // Chromium, Firefox and WebKit stand in for Chrome and Edge, Firefox and Safari.
            instances: [
              { browser: "chromium" },
              { browser: "firefox" },
              { browser: "webkit" },
            ],
          },
        },
      },
    ],
  },
});
