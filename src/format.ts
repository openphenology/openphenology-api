/**
 * The data rules' helpers without the reader: weeks, Backyard labels, a
 * county's state and where the data is served. Import
 * `@openphenology/api/format` where a page needs only these, so the reader is
 * not loaded with it; the main entry exports them too.
 *
 * @module
 */
export { countyState } from "./states.ts";
export { PRODUCTION_URL, STAGING_URL } from "./urls.ts";
export { WEEKS } from "./types.ts";
export { BACKYARD_LABELS, backyardLabel, weekOf } from "./weeks.ts";
