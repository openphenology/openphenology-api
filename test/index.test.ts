import { expect, test } from "vitest";
import { name } from "../src/index.ts";

test("exports the package name", () => {
  expect(name).toBe("openphenology-api");
});
