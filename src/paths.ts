// Checks for the codes that go into file paths, so a caller's input can never
// point a request at another path.
const RELEASE = /^\d{4}-\d{2}-\d{2}$/;
const STATE = /^[a-z]{2}-[a-z0-9]{1,3}$/;
const COUNTY = /^\d{5}$/;
const SPECIES = /^[A-Za-z0-9._-]+$/;
const ZIP = /^\d{5}$/;

/**
 * Checks a code before it is used in a path, so it cannot change the path.
 *
 * @param kind What the code is, for the error message.
 * @param value The code.
 * @param pattern The shape it must have.
 * @returns The code, unchanged.
 * @throws {RangeError} When the code does not have that shape.
 */
function check(kind: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value))
    throw new RangeError(`Invalid ${kind}: ${JSON.stringify(value)}`);
  return value;
}

/**
 * Checks a release ID, such as `2026-10-19`.
 *
 * @param value The code.
 * @returns The code, unchanged.
 * @throws {RangeError} When it is malformed.
 */
export const releaseId = (value: string): string =>
  check("release", value, RELEASE);
/**
 * Checks a state code, such as `us-oh`.
 *
 * @param value The code.
 * @returns The code, unchanged.
 * @throws {RangeError} When it is malformed.
 */
export const stateCode = (value: string): string =>
  check("state", value, STATE);
/**
 * Checks a county's 5-digit Census code, such as `39049`.
 *
 * @param value The code.
 * @returns The code, unchanged.
 * @throws {RangeError} When it is malformed.
 */
export const countyCode = (value: string): string =>
  check("county", value, COUNTY);
/**
 * Checks a species key.
 *
 * @param value The code.
 * @returns The code, unchanged.
 * @throws {RangeError} When it is malformed.
 */
export const speciesKey = (value: string): string =>
  check("species key", value, SPECIES);
/**
 * Checks a 5-digit US ZIP code.
 *
 * @param value The code.
 * @returns The code, unchanged.
 * @throws {RangeError} When it is malformed.
 */
export const zipCode = (value: string): string => check("ZIP code", value, ZIP);
