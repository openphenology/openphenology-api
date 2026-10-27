// Light checks on each file before it is used: the shared wrapper, the
// format's major version, and the lists that must hold 53 weeks. The full
// JSON Schemas live in schemas/.
import { FormatError, type FormatErrorCode } from "./errors.ts";
import { WEEKS, type PublishedFile } from "./types.ts";

/**
 * Format major versions this package reads, by kind: 1, and for `manifest`
 * also 2, which may be split into parts (data rules 1.30), and for
 * `attribution` also 2, compact record links (data rules 1.76).
 *
 * @param kind The file's kind.
 * @returns The major versions read.
 */
const supported = (kind: string): readonly number[] =>
  kind === "manifest" || kind === "attribution" ? [1, 2] : [1];

type Json = Record<string, unknown>;

/**
 * Whether a value is a plain JSON object, not an array or `null`.
 *
 * @param value Parsed JSON.
 * @returns `true` for an object.
 */
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Stops reading a file that does not match its format.
 *
 * @param path The file's path.
 * @param message What is wrong.
 * @param code What is wrong, as a stable code.
 * @throws {FormatError} Always.
 */
function fail(
  path: string,
  message: string,
  code: FormatErrorCode = "malformed",
): never {
  throw new FormatError(code, `${path}: ${message}`, path);
}

/**
 * Checks the shared wrapper, the kind and the format's major version.
 *
 * @param path The file's path, for errors.
 * @param value The parsed JSON.
 * @param kind The kind the file must be.
 * @returns The file, typed as its format.
 * @throws {FormatError} When the wrapper is incomplete, the kind differs or
 *   the major version is not one this package reads.
 */
export function parseFile<File extends PublishedFile<string, unknown>>(
  path: string,
  value: unknown,
  kind: File["kind"],
): File {
  if (!isObject(value)) fail(path, "not a JSON object");
  if (value.kind !== kind) fail(path, `expected kind ${kind}`, "wrong-kind");
  if (typeof value.id !== "string") fail(path, "missing id");
  if (!isObject(value.provenance)) fail(path, "missing provenance");
  if (!isObject(value.data)) fail(path, "missing data");
  const format =
    typeof value.format === "string"
      ? /^[a-z-]+\/(\d+)\.\d+$/.exec(value.format)
      : null;
  if (!format) fail(path, "missing or malformed format");
  if (!supported(kind).includes(Number(format[1]))) {
    fail(
      path,
      `format ${String(value.format)} is not supported by this version of @openphenology/api`,
      "unsupported-version",
    );
  }
  return value as File;
}

/**
 * Checks that a weekly list has one number per week.
 *
 * @param path The file's path, for errors.
 * @param name The field, for errors.
 * @param list The list.
 * @throws {FormatError} When it is not 53 numbers.
 */
export function checkWeeks(path: string, name: string, list: unknown): void {
  if (
    !Array.isArray(list) ||
    list.length !== WEEKS ||
    !list.every((n) => typeof n === "number")
  ) {
    fail(path, `${name} must be ${String(WEEKS)} numbers`);
  }
}

/**
 * Checks that Nearby labels are one letter per week: `c`, `s`, `r`, `m` or `n`.
 *
 * @param path The file's path, for errors.
 * @param name The field, for errors.
 * @param labels The labels.
 * @throws {FormatError} When they are not 53 of those letters.
 */
export function checkLabels(path: string, name: string, labels: unknown): void {
  if (typeof labels !== "string" || !/^[csrmn]{53}$/.test(labels)) {
    fail(path, `${name} must be ${String(WEEKS)} Nearby labels`);
  }
}
