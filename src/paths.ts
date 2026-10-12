const RELEASE = /^\d{4}-\d{2}-\d{2}$/;
const STATE = /^[a-z]{2}-[a-z0-9]{1,3}$/;
const COUNTY = /^\d{5}$/;
const SPECIES = /^[A-Za-z0-9._-]+$/;

function check(kind: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value))
    throw new RangeError(`Invalid ${kind}: ${JSON.stringify(value)}`);
  return value;
}

export const releaseId = (value: string): string =>
  check("release", value, RELEASE);
export const stateCode = (value: string): string =>
  check("state", value, STATE);
export const countyCode = (value: string): string =>
  check("county", value, COUNTY);
export const speciesKey = (value: string): string =>
  check("species key", value, SPECIES);
