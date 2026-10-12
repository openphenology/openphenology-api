import { FormatError } from "./errors.ts";
import { WEEKS, type PublishedFile } from "./types.ts";

/** Format major versions this package reads. */
const SUPPORTED_MAJOR = 1;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(path: string, message: string): never {
  throw new FormatError(`${path}: ${message}`, path);
}

/** Checks the shared wrapper, the kind and the format's major version. */
export function parseFile<File extends PublishedFile<string, unknown>>(
  path: string,
  value: unknown,
  kind: File["kind"],
): File {
  if (!isObject(value)) fail(path, "not a JSON object");
  if (value.kind !== kind) fail(path, `expected kind ${kind}`);
  if (typeof value.id !== "string") fail(path, "missing id");
  if (!isObject(value.provenance)) fail(path, "missing provenance");
  if (!isObject(value.data)) fail(path, "missing data");
  const format =
    typeof value.format === "string"
      ? /^[a-z-]+\/(\d+)\.\d+$/.exec(value.format)
      : null;
  if (!format) fail(path, "missing or malformed format");
  if (Number(format[1]) !== SUPPORTED_MAJOR) {
    fail(
      path,
      `format ${String(value.format)} is not supported by this version of openphenology-api`,
    );
  }
  return value as File;
}

/** Checks that a weekly list has one number per week. */
export function checkWeeks(path: string, name: string, list: unknown): void {
  if (
    !Array.isArray(list) ||
    list.length !== WEEKS ||
    !list.every((n) => typeof n === "number")
  ) {
    fail(path, `${name} must be ${String(WEEKS)} numbers`);
  }
}
