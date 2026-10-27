/**
 * One search (ODR-2026-070 as amended by ODR-2026-071): the function behind
 * {@link Release.search}, in its own entry point so the reader stays small.
 * `release.search()` loads it when first called; import
 * `@openphenology/api/search` only to load it ahead of time.
 *
 * It ports the site's search exactly: ranking by name (apps#54), the
 * Advanced search of ODR-2026-049 as amended by ODR-2026-062, and the shared
 * filter and sort (ODR-2026-037): group, stage and status, each option with
 * the species it would leave. It only reads published files, through the
 * release's reader, and never sends typed text anywhere.
 *
 * @module
 */
import type { Release } from "./client.ts";
import { countyCode, placeCode, stateCode } from "./paths.ts";
import { countyState } from "./states.ts";
import type {
  CatalogueEntry,
  Park,
  Place,
  PlaceLevel,
  SearchName,
  SeasonWeeks,
  StageSeasons,
} from "./types.ts";
import { weekOf } from "./weeks.ts";

/**
 * How Advanced results are ordered (ODR-2026-062): `name`, A–Z by name;
 * `season`, the soonest middle of season first; `records`, the most records
 * first, which say where and when people looked, never how common a species
 * is; `group`, A–Z by group name, then by name.
 */
export type SearchSort = "name" | "season" | "records" | "group";

/**
 * A stage (ODR-2026-032, ODR-2026-037): `in-flower` and `in-fruit` for a
 * plant, `adults` and `larvae` for an insect. A species is kept only with a
 * season at that stage there, and with dates only when that season overlaps
 * them.
 */
export type SearchStage = "in-flower" | "in-fruit" | "adults" | "larvae";

/**
 * A status from US-RIIS (`data/status.md`): `introduced` keeps every listed
 * species, as invasive ones are introduced too; `invasive` keeps only those
 * listed as invasive. Not being listed never means native.
 */
export type SearchStatus = "introduced" | "invasive";

/** What to search for, from {@link Release.search}. Every input is optional, and they combine. */
export interface SearchInput {
  /**
   * Species and places whose names match it. With a place, dates or a group,
   * only the species in that search whose names contain it. Text that is a
   * ZIP code matches nothing and is never repeated back.
   */
  readonly text?: string;
  /**
   * Where to search: `anywhere`, every published area, or a place's code: a
   * state such as `us-oh`, a county's 5-digit Census code such as `39049`,
   * or a park's or metro park system's `park-` or `parks-` code.
   */
  readonly place?: string;
  /** The first day, `MM-DD`, with no year. Give both dates or neither. */
  readonly from?: string;
  /** The last day, `MM-DD`, with no year; it may come before `from`, running over the year end. */
  readonly to?: string;
  /** Only species in this browse group, by its key from `groups.json`, such as `birds`. */
  readonly group?: string;
  /** Only species reported at this stage there. */
  readonly stage?: SearchStage;
  /** Only species with this status where they are listed. */
  readonly status?: SearchStatus;
  /**
   * The order of Advanced results; `season` by default. Anywhere has no
   * record counts, so `records` there falls back to `season`.
   */
  readonly sort?: SearchSort;
  /**
   * The week `season` sorts from, 1 to 53. Defaults to {@link weekOf} today;
   * the site passes its own "this week".
   */
  readonly week?: number;
  /**
   * At most this many species, and of each kind of place. Defaults to 50
   * species found by name, every Advanced species and every matching place.
   */
  readonly limit?: number;
}

/** A species {@link Release.search} found. */
export interface SearchSpecies {
  /** The species key. */
  readonly key: string;
  /** The species' catalogue entry. */
  readonly entry: CatalogueEntry;
  /** Its browse group's name, or `Other`. */
  readonly groupName: string;
  /** By name: the name that matched and its kind; otherwise `null`. */
  readonly matched: readonly [name: string, kind: SearchName[1]] | null;
  /**
   * By name: "Formerly …" when a former name matched, "Also called …" when
   * another name did; otherwise `null`.
   */
  readonly note: string | null;
  /** Advanced: the area its season is from (a state, county or place code); otherwise `null`. */
  readonly area: string | null;
  /** Advanced: its early, middle and late weeks there; otherwise `null`. */
  readonly season: readonly [number, number, number] | null;
  /** Advanced: its records counted there, or `null`, as for a state, which the catalogue gives none. */
  readonly records: number | null;
  /** Advanced: its records there each week, weeks 1 to 53, or `null`, as for a state. */
  readonly weekly: readonly number[] | null;
  /**
   * Advanced: `introduced` or `invasive` where it is listed there; `null`
   * when it is not listed, which never means native, and by name.
   */
  readonly status: SearchStatus | null;
  /** Advanced with a stage: its season at that stage there; otherwise `null`. */
  readonly stageSeason: readonly [number, number, number] | null;
  /**
   * Advanced with a stage: how the stage is worded, as ODR-2026-032 sets
   * out, such as `Reported in flower`, or `Reported as a caterpillar` for a
   * butterfly or moth; otherwise `null`.
   */
  readonly stageLabel: string | null;
  /**
   * Anywhere: each covered state's result, in state order, as a species
   * covered in several states is listed once. Its other fields are the
   * state's that comes first in the sort. Otherwise `null`.
   */
  readonly seasons: readonly SearchStateSeason[] | null;
}

/** A species' result in one state, for Anywhere. */
export interface SearchStateSeason {
  /** The state code. */
  readonly state: string;
  /** Its early, middle and late weeks there, or `null`. */
  readonly season: readonly [number, number, number] | null;
  /** With a stage: its season at that stage there; otherwise `null`. */
  readonly stageSeason: readonly [number, number, number] | null;
  /** Its status there, or `null`, which never means native. */
  readonly status: SearchStatus | null;
  /** Its records there, or `null`, which the catalogue gives none for a state. */
  readonly records: number | null;
  /** Its weekly records there, or `null`, as for a state. */
  readonly weekly: readonly number[] | null;
}

/**
 * The group, stage and status options of the shared filter (ODR-2026-037),
 * each with how many species it would leave. A kind is empty when it would
 * not split the list. The site shows the filter only on a list of more than
 * 20 species.
 */
export interface SearchOptions {
  /** By name. */
  readonly groups: readonly {
    /** The group's key, for `group`; `null` for Other, which no input chooses. */
    readonly group: string | null;
    /** Its name, such as `Birds`, or `Other`. */
    readonly name: string;
    /** The species it would leave. */
    readonly count: number;
  }[];
  /** In flower, in fruit, as an adult, as a larva, in that order. */
  readonly stages: readonly {
    /** The stage, for `stage`. */
    readonly stage: SearchStage;
    /** Its words, such as `Reported in flower`. */
    readonly label: string;
    /** The species it would leave, its season at that stage fitting the dates. */
    readonly count: number;
  }[];
  /** Introduced, then invasive. */
  readonly statuses: readonly {
    /** The status, for `status`. */
    readonly status: SearchStatus;
    /** Its words: `Introduced` or `Invasive`. */
    readonly label: string;
    /** The species it would leave. */
    readonly count: number;
  }[];
}

/** What kind of place {@link Release.search} found. */
export type SearchPlaceKind = "city" | "state" | "county" | PlaceLevel;

/** A place whose name matched, from {@link Release.search}. */
export interface SearchPlace {
  /** What it is. */
  readonly kind: SearchPlaceKind;
  /** Its code; for a city, the code of the county it leads with. */
  readonly area: string;
  /** Its name, such as `Ohio`, `Franklin County` or `Dublin`. */
  readonly name: string;
  /** Its page slug; `null` for a city. */
  readonly slug: string | null;
  /** The state a state, county or city is in; `null` for other places. */
  readonly state: string | null;
  /** Species with a result there; `null` for a city. */
  readonly species: number | null;
  /** A park's or system's type; otherwise `null`. */
  readonly type: Park["type"] | null;
  /** A watershed's HUC8 or an ecoregion's `ECO_ID`; otherwise `null`. */
  readonly code: string | number | null;
  /** A city's counties, the one it leads with first; otherwise empty. */
  readonly counties: readonly {
    /** The county's 5-digit Census code. */
    readonly area: string;
    /** Its name, such as `Franklin County`. */
    readonly name: string;
  }[];
}

/** What an Advanced search found, besides its species. */
export interface SearchAdvanced {
  /** The place searched: `anywhere` or its code. */
  readonly place: string;
  /** Whether the place's species list is published; `false` reads as unknown, never as none. */
  readonly published: boolean;
  /** The sort applied. */
  readonly sort: SearchSort;
  /** The sorts the place offers: every one, but `records`, for Anywhere. */
  readonly sorts: readonly SearchSort[];
  /** Species whose season there overlaps the dates, or with a season, without dates. */
  readonly inSeason: number;
  /** Species with a result there but no season. */
  readonly noSeason: number;
  /** Species left after the group, stage, status and text, before `limit`. */
  readonly shown: number;
  /** What each group, stage and status option would leave. */
  readonly options: SearchOptions;
}

/** What {@link Release.search} found. Typed text is never repeated in it. */
export interface SearchResult {
  /** `true` when the text is a ZIP code: nothing is matched, and ZIP lookup stays separate. */
  readonly zip: boolean;
  /** The species: by name, best match first; or the Advanced results in their sort. */
  readonly species: SearchSpecies[];
  /**
   * By name only: the places whose names match, by kind: cities, then the
   * states and counties, parks and metro park systems, and watersheds and
   * ecoregions, each best match first.
   */
  readonly places: SearchPlace[];
  /** An Advanced search's details, or `null` for a search by name. */
  readonly advanced: SearchAdvanced | null;
}

type Season = readonly [number, number, number];

const SORTS: readonly SearchSort[] = ["name", "season", "records", "group"];

/** Each stage's published name and words (ODR-2026-032), in order. */
const STAGES: Readonly<
  Record<SearchStage, readonly [keyof StageSeasons, string]>
> = {
  "in-flower": ["flowering", "in flower"],
  "in-fruit": ["fruiting", "in fruit"],
  adults: ["adult", "as an adult"],
  larvae: ["larva", "as a larva"],
};

const STATUSES: readonly SearchStatus[] = ["introduced", "invasive"];

/**
 * How a stage is worded: "Reported as a caterpillar" for a larva of a
 * butterfly or moth (ODR-2026-032), as the site says it.
 *
 * @param stage The stage.
 * @param group The group's name, or `null`.
 * @returns The words.
 */
const stageLabel = (stage: SearchStage, group: string | null): string =>
  stage === "larvae" && /butterfl|moth/i.test(group ?? "")
    ? "Reported as a caterpillar"
    : `Reported ${STAGES[stage][1]}`;

/** Days in each month of a common year; 29 February is read as 28. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const NOTHING: SearchResult = {
  zip: false,
  species: [],
  places: [],
  advanced: null,
};

/**
 * Season weeks as a season, or `null` when withheld or absent.
 *
 * @param weeks Early, middle and late weeks, or empty.
 * @returns The season, or `null`.
 */
const asSeason = (weeks: SeasonWeeks | undefined): Season | null =>
  weeks?.length === 3 ? weeks : null;

/**
 * Whether a week lies within a season's early-to-late span; a season kept
 * together over the year end wraps from week 53 to week 1.
 *
 * @param week The week.
 * @param season The season.
 * @returns `true` within it.
 */
const inSeason = (week: number, season: Season): boolean =>
  season[0] <= season[2]
    ? week >= season[0] && week <= season[2]
    : week >= season[0] || week <= season[2];

/**
 * How well a name matches typed text, best first: exact, starts with it, a
 * word starts with it, contains it.
 *
 * @param name The name.
 * @param query The text.
 * @returns The tier, from 0, or `null` when it does not match.
 */
function matchTier(name: string, query: string): number | null {
  const n = name.toLowerCase();
  const q = query.trim().toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return null;
}

/**
 * The entries that match, one per key (its best-matching name), by tier and
 * then by display name; never by popularity or record counts.
 *
 * @param entries The entries.
 * @param query The text.
 * @param name An entry's name to match.
 * @param key An entry's key; one entry is kept per key.
 * @param label An entry's display name, for order within a tier.
 * @returns The matching entries, best first.
 */
function ranked<T>(
  entries: Iterable<T>,
  query: string,
  name: (entry: T) => string,
  key: (entry: T) => unknown,
  label: (entry: T) => string = name,
): T[] {
  const best = new Map<unknown, { entry: T; tier: number }>();
  for (const entry of entries) {
    const tier = matchTier(name(entry), query);
    if (tier === null) continue;
    const k = key(entry);
    const held = best.get(k);
    if (held === undefined || tier < held.tier) best.set(k, { entry, tier });
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        a.tier - b.tier || label(a.entry).localeCompare(label(b.entry), "en"),
    )
    .map(({ entry }) => entry);
}

/**
 * Text as the site's Advanced name box compares it: no accents, lower case,
 * words only.
 *
 * @param text The text.
 * @returns The folded text.
 */
const folded = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * A day from `MM-DD` as its published week, 1 to 53.
 *
 * @param name `from` or `to`, for the error.
 * @param value The day.
 * @returns The week it falls in.
 * @throws {RangeError} When it is not a day of the year.
 */
function weekOfDay(name: string, value: string): number {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  const month = Number(match?.[1]);
  const day = Number(match?.[2]);
  const last = MONTH_DAYS[month - 1] ?? 0;
  if (!match || day < 1 || day > (month === 2 ? 29 : last))
    throw new RangeError(`Invalid ${name}: ${JSON.stringify(value)}`);
  let start = 1;
  for (let m = 0; m < month - 1; m++) start += MONTH_DAYS[m] ?? 0;
  return Math.min(53, Math.floor((start + Math.min(day, last) - 2) / 7) + 1);
}

/**
 * The weeks a range covers, in order, wrapping over the year end.
 *
 * @param from The first day's week.
 * @param to The last day's week.
 * @returns The weeks.
 */
const rangeWeeks = (from: number, to: number): number[] =>
  Array.from(
    { length: ((to - from + 53) % 53) + 1 },
    (_, i) => ((from - 1 + i) % 53) + 1,
  );

/** One species in a place's list, before it is filtered and sorted. */
interface Row {
  readonly entry: CatalogueEntry;
  readonly area: string;
  readonly season: Season | null;
  readonly records: number | null;
  readonly weekly: readonly number[] | null;
  /** Its stage seasons there; a park's labels carry none. */
  readonly stages: StageSeasons | undefined;
  readonly status: SearchStatus | null;
}

/**
 * A species' status in any of some states (`data/status.md`), as the site
 * reads it from the catalogue.
 *
 * @param entry The species.
 * @param states The states.
 * @returns `invasive`, `introduced` or `null`.
 */
const statusIn = (
  entry: CatalogueEntry,
  states: readonly string[],
): SearchStatus | null =>
  states.some((s) => entry.invasive_in?.includes(s))
    ? "invasive"
    : states.some((s) => entry.introduced_in?.includes(s))
      ? "introduced"
      : null;

/**
 * A row's season at a stage: `null` without one, or withheld.
 *
 * @param row The row.
 * @param stage The stage.
 * @returns The season, or `null`.
 */
const stageOf = (row: Row, stage: SearchStage): Season | null =>
  asSeason(row.stages?.[STAGES[stage][0]]);

/** The shared filter in force, with a group by its name. */
interface Filter {
  readonly group: string | null;
  readonly stage: SearchStage | null;
  readonly status: SearchStatus | null;
}

/**
 * The species in the release, each with its catalogue entry, the covered
 * states, and each group's name.
 *
 * @param release The release.
 * @returns What every search reads first.
 */
async function basics(release: Release) {
  const [catalogue, groups] = await Promise.all([
    release.catalogue(),
    release.groups(),
  ]);
  const names = new Map(
    (groups?.data.groups ?? []).map((g) => [g.group, g.name]),
  );
  return {
    catalogue,
    names,
    byKey: new Map(catalogue.map((c) => [c.species_key, c])),
    states: [...new Set(catalogue.flatMap((c) => c.states))].sort(),
    groupName: (entry: CatalogueEntry) =>
      names.get(entry.group ?? "") ?? "Other",
  };
}

type Basics = Awaited<ReturnType<typeof basics>>;

/**
 * A state's species with a result, from the catalogue: seasons, but no
 * weekly records or record counts, which the catalogue does not carry.
 *
 * @param basics The catalogue.
 * @param state The state code.
 * @returns The species.
 */
const stateRows = (basics: Basics, state: string): Row[] =>
  basics.catalogue.flatMap((entry) =>
    entry.slug === null || !entry.states.includes(state)
      ? []
      : [
          {
            entry,
            area: state,
            season: asSeason(entry.seasons?.[state]),
            records: null,
            weekly: null,
            stages: entry.stage_seasons?.[state],
            status: statusIn(entry, [state]),
          },
        ],
  );

/**
 * A place's species with a result, as its published file gives them: a
 * state's from the catalogue, a county's from its Nearby file (only species
 * with a county result) and a park's or system's from its labels file.
 *
 * @param release The release.
 * @param basics The catalogue.
 * @param place `anywhere` or the place's code.
 * @returns The species, or `null` when the place's file is not published.
 * @throws {RangeError} When the code is malformed or not a place search
 *   offers.
 */
async function placeRows(
  release: Release,
  basics: Basics,
  place: string,
): Promise<Row[] | null> {
  // Anywhere covers every published area: each covered state's results.
  if (place === "anywhere")
    return basics.states.flatMap((state) => stateRows(basics, state));
  if (/^\d+$/.test(place)) {
    const state = countyState(countyCode(place));
    if (state === null)
      throw new RangeError(`Unknown county: ${JSON.stringify(place)}`);
    const nearby = await release.nearby(state, place);
    return nearby === null
      ? null
      : nearby.data.species.flatMap((item) => {
          const entry = basics.byKey.get(item.species_key);
          return entry?.slug == null ||
            item.records === null ||
            item.weekly === null
            ? []
            : [
                {
                  entry,
                  area: place,
                  season: asSeason(item.season),
                  records: item.records,
                  weekly: item.weekly,
                  stages: item.stages,
                  status: statusIn(entry, [state]),
                },
              ];
        });
  }
  if (!place.startsWith("park")) {
    stateCode(place);
    return basics.states.includes(place) ? stateRows(basics, place) : null;
  }
  placeCode(place);
  const [parks, labels] = await Promise.all([
    release.places("parks"),
    release.placeLabels(place),
  ]);
  // Only parks and systems with a page are offered (ODR-2026-043).
  const park = parks?.data.places.find(
    (p) => p.area === place && p.park?.has_page === true,
  );
  if (!park || !labels) return null;
  return labels.data.species.flatMap((item) => {
    const entry = basics.byKey.get(item.species_key);
    // A species sensitive in the park's state never has a park result; one
    // whose catalogue does not say is left out too.
    return entry?.slug == null ||
      entry.sensitive_in?.some((s) => park.states.includes(s)) !== false
      ? []
      : [
          {
            entry,
            area: place,
            season: asSeason(item.season),
            records: item.records,
            weekly: item.weekly,
            // Park labels carry no stages.
            stages: undefined,
            status: statusIn(entry, park.states),
          },
        ];
  });
}

/**
 * Searches a release. Call it as {@link Release.search}, which loads this
 * entry point when first needed.
 *
 * @param release The release to search.
 * @param input What to search for.
 * @returns What was found.
 * @throws {RangeError} Rejects when an input is malformed, only one date is
 *   given, or the place is not one search offers.
 * @throws {ApiError} Rejects when a file cannot be read.
 * @throws {FormatError} Rejects when a file is malformed.
 */
export async function search(
  release: Release,
  input: SearchInput = {},
): Promise<SearchResult> {
  const text = (input.text ?? "").trim().slice(0, 100);
  if (/^\d{5}$/.test(text)) return { ...NOTHING, zip: true };
  const {
    place: chosen,
    from,
    to,
    group,
    stage = null,
    status = null,
    sort = "season",
    limit,
  } = input;
  if ((from === undefined) !== (to === undefined))
    throw new RangeError("Give both dates, from and to, or neither");
  const range =
    from === undefined || to === undefined
      ? null
      : rangeWeeks(weekOfDay("from", from), weekOfDay("to", to));
  if (!SORTS.includes(sort))
    throw new RangeError(`Invalid sort: ${JSON.stringify(sort)}`);
  if (stage !== null && !Object.hasOwn(STAGES, stage))
    throw new RangeError(`Invalid stage: ${JSON.stringify(stage)}`);
  if (status !== null && !STATUSES.includes(status))
    throw new RangeError(`Invalid status: ${JSON.stringify(status)}`);
  const week = input.week ?? weekOf(new Date());
  if (!Number.isInteger(week) || week < 1 || week > 53)
    throw new RangeError(`Invalid week: ${String(week)}`);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
    throw new RangeError(`Invalid limit: ${String(limit)}`);
  // Watersheds and ecoregions are not offered (ODR-2026-049, Places).
  if (chosen !== undefined && /^(huc8|eco)-/.test(chosen))
    throw new RangeError(`Not a place search offers: ${chosen}`);
  const advanced =
    chosen !== undefined ||
    range !== null ||
    group !== undefined ||
    stage !== null ||
    status !== null;
  if (!advanced && text === "") return NOTHING;

  const [base, names] = await Promise.all([
    basics(release),
    advanced ? null : release.searchNames(),
  ]);
  if (names) return byName(release, base, names, text, limit);

  const place = chosen ?? "anywhere";
  const rows = await placeRows(release, base, place);
  const all = rows ?? [];
  const sorts =
    place === "anywhere" ? SORTS.filter((s) => s !== "records") : SORTS;
  // Anywhere offers no Most records: the default order instead.
  const used = sorts.includes(sort) ? sort : "season";
  // With no dates, every species with a season; with dates, those whose
  // season (the stage's, with a stage chosen) overlaps them.
  const fits = (season: Season | null) =>
    season !== null &&
    (range === null || range.some((w) => inSeason(w, season)));
  const inRange = all.filter((r) => fits(r.season));
  // Under Anywhere a species has a row in each covered state; it is counted
  // and listed once, kept when any state's row is.
  const key = (r: Row) => r.entry.species_key;
  const count = (list: readonly Row[]) => new Set(list.map(key)).size;
  const wanted = folded(text);
  const commonName = (r: Row) => r.entry.common_name ?? r.entry.scientific_name;
  // The shared filter (ODR-2026-037), as the site's Advanced search applies
  // it: a group by its name, a stage, a status and the name box.
  const passes = (r: Row, f: Filter) =>
    (f.group === null || base.groupName(r.entry) === f.group) &&
    (f.stage === null || stageOf(r, f.stage) !== null) &&
    // Invasive species are introduced too.
    (f.status === null ||
      (f.status === "invasive"
        ? r.status === "invasive"
        : r.status !== null)) &&
    (wanted === "" ||
      folded(commonName(r)).includes(wanted) ||
      folded(r.entry.scientific_name).includes(wanted));
  // A stage keeps only species whose weeks at that stage fit the dates.
  const kept = (f: Filter) =>
    inRange.filter(
      (r) => passes(r, f) && (f.stage === null || fits(stageOf(r, f.stage))),
    );
  const filter: Filter = {
    group: group === undefined ? null : (base.names.get(group) ?? ""),
    stage,
    status,
  };
  const byCommon = (a: Row, b: Row) =>
    commonName(a).localeCompare(commonName(b));
  const toMiddle = (r: Row) => {
    const season = stage === null ? r.season : stageOf(r, stage);
    return season === null ? Infinity : (season[1] - week + 53) % 53;
  };
  const seen = new Set<string>();
  const shown = kept(filter)
    .sort(
      used === "name"
        ? byCommon
        : used === "records"
          ? (a, b) => (b.records ?? 0) - (a.records ?? 0) || byCommon(a, b)
          : used === "group"
            ? (a, b) =>
                base
                  .groupName(a.entry)
                  .localeCompare(base.groupName(b.entry)) || byCommon(a, b)
            : (a, b) => toMiddle(a) - toMiddle(b) || byCommon(a, b),
    )
    .filter((r) => !seen.has(key(r)) && seen.add(key(r)));

  // Each option counted against the other filters in force, and a kind left
  // out when it would not split the list, as the shared filter shows them.
  const total = count(inRange);
  const splits = (has: (r: Row) => boolean) => {
    const n = count(inRange.filter(has));
    return n > 0 && n < total;
  };
  const leaves = (f: Partial<Filter>) =>
    count(inRange.filter((r) => passes(r, { ...filter, ...f })));
  const groupNames = [
    ...new Set(inRange.map((r) => base.groupName(r.entry))),
  ].sort((a, b) => a.localeCompare(b));
  const keys = new Map([...base.names].map(([k, n]) => [n, k]));
  const options: SearchOptions = {
    groups:
      groupNames.length > 1
        ? groupNames.map((name) => ({
            group: keys.get(name) ?? null,
            name,
            count: leaves({ group: name }),
          }))
        : [],
    stages: (Object.keys(STAGES) as SearchStage[])
      .filter((st) => splits((r) => stageOf(r, st) !== null))
      .map((st) => ({
        stage: st,
        label: stageLabel(st, filter.group),
        count: count(kept({ ...filter, stage: st })),
      })),
    statuses: STATUSES.filter((st) =>
      splits((r) => (st === "invasive" ? r.status === st : r.status !== null)),
    ).map((st) => ({
      status: st,
      label: st === "invasive" ? "Invasive" : "Introduced",
      count: leaves({ status: st }),
    })),
  };
  const perState = (r: Row): SearchStateSeason => ({
    state: r.area,
    season: r.season,
    stageSeason: stage && stageOf(r, stage),
    status: r.status,
    records: r.records,
    weekly: r.weekly,
  });
  const seasoned = new Set(all.filter((r) => r.season !== null).map(key));
  const states = new Map<string, Row[]>();
  for (const r of place === "anywhere" ? all : [])
    states.set(key(r), [...(states.get(key(r)) ?? []), r]);
  return {
    ...NOTHING,
    species: shown.slice(0, limit).map((r) => ({
      key: key(r),
      entry: r.entry,
      groupName: base.groupName(r.entry),
      matched: null,
      note: null,
      area: r.area,
      season: r.season,
      records: r.records,
      weekly: r.weekly,
      status: r.status,
      stageSeason: stage && stageOf(r, stage),
      stageLabel: stage && stageLabel(stage, base.groupName(r.entry)),
      seasons: states.get(key(r))?.map(perState) ?? null,
    })),
    advanced: {
      place,
      published: rows !== null,
      sort: used,
      sorts,
      inSeason: total,
      // Species with a result there but no season in any covered state.
      noSeason: count(all.filter((r) => !seasoned.has(key(r)))),
      shown: shown.length,
      options,
    },
  };
}

/**
 * Text alone: the site's "By name" results and suggestions. Species by any
 * of their names, then places by kind.
 *
 * @param release The release.
 * @param base The catalogue.
 * @param names Every searchable name.
 * @param text The text, trimmed.
 * @param limit At most this many of each list.
 * @returns What was found.
 */
async function byName(
  release: Release,
  base: Basics,
  names: readonly SearchName[],
  text: string,
  limit: number | undefined,
): Promise<SearchResult> {
  // Each species' display name: its common name, else its scientific name.
  const labels = new Map<string, string>();
  for (const kind of ["common", "scientific"])
    for (const [name, k, key] of names)
      if (k === kind && !labels.has(key)) labels.set(key, name);
  const species = ranked(
    names,
    text,
    ([name]) => name,
    ([, , key]) => key,
    ([name, , key]) => labels.get(key) ?? name,
  ).flatMap(([name, kind, key]): SearchSpecies[] => {
    const entry = base.byKey.get(key);
    return entry === undefined
      ? []
      : [
          {
            key,
            entry,
            groupName: base.groupName(entry),
            matched: [name, kind],
            // Say which name matched when it isn't the species' own.
            note:
              kind === "synonym"
                ? `Formerly ${name}`
                : kind === "other-name"
                  ? `Also called ${name}`
                  : null,
            area: null,
            season: null,
            records: null,
            weekly: null,
            status: null,
            stageSeason: null,
            stageLabel: null,
            seasons: null,
          },
        ];
  });

  const [regions, cities, parks, watersheds, ecoregions] = await Promise.all([
    Promise.all(base.states.map((s) => release.region(s))),
    Promise.all(base.states.map((s) => release.cities(s))),
    release.places("parks"),
    release.places("watersheds"),
    release.places("ecoregions"),
  ]);
  const place = (
    kind: SearchPlaceKind,
    area: string,
    name: string,
    more: Partial<SearchPlace>,
  ): SearchPlace => ({
    kind,
    area,
    name,
    slug: null,
    state: null,
    species: null,
    type: null,
    code: null,
    counties: [],
    ...more,
  });

  // Each state, then its counties, by the name pages show.
  const areas = regions.flatMap((region, i) => {
    const state = base.states[i] ?? "";
    return (region?.data.areas ?? []).map((a) =>
      a.level === "state"
        ? place("state", a.area, a.full_name ?? a.name, {
            slug: a.slug,
            state,
            // Species with a state result, as Explore counts them.
            species: base.catalogue.filter((c) => c.states.includes(state))
              .length,
          })
        : place(
            "county",
            a.area,
            a.full_name ??
              (a.name.endsWith(" County") ? a.name : `${a.name} County`),
            { slug: a.slug, state, species: a.species_keys.length },
          ),
    );
  });
  const county = new Map(
    areas.flatMap((a) => (a.kind === "county" ? [[a.area, a]] : [])),
  );
  // Ranked together, as the site lists them.
  const states = ranked(
    areas,
    text,
    (a) => a.name,
    (a) => a,
  );

  // Cities named exactly first, then those starting with the text, as the
  // site suggests them: at most 6, each with its known counties.
  const typed = text.toLowerCase();
  const allCities =
    typed.length < 2
      ? []
      : cities.flatMap((file, i) =>
          (file?.data.cities ?? []).flatMap((c) => {
            const lead = county.get(c.area);
            return lead === undefined
              ? []
              : [
                  place("city", c.area, c.name, {
                    state: base.states[i] ?? null,
                    counties: [c.area, ...c.also_in].flatMap((a) => {
                      const known = county.get(a);
                      return known ? [{ area: a, name: known.name }] : [];
                    }),
                  }),
                ];
          }),
        );
  const lower = (c: SearchPlace) => c.name.toLowerCase();
  const cityMatches = [
    ...allCities.filter((c) => lower(c) === typed),
    ...allCities.filter(
      (c) => lower(c) !== typed && lower(c).startsWith(typed),
    ),
  ].slice(0, 6);

  const fromPlaces = (p: Place) =>
    place(p.level, p.area, p.name, {
      slug: p.slug,
      species: p.species_keys.length,
      type: p.park?.type ?? null,
      code: p.code,
    });
  // Parks and systems with a page (ODR-2026-043).
  const parkMatches = ranked(
    (parks?.data.places ?? []).filter((p) => p.park?.has_page === true),
    text,
    (p) => p.name,
    (p) => p.area,
  ).map(fromPlaces);
  // Watersheds and ecoregions together (ODR-2026-044).
  const areaMatches = ranked(
    [
      ...(watersheds?.data.places ?? []).filter((p) => p.level === "watershed"),
      ...(ecoregions?.data.places ?? []).filter((p) => p.level === "ecoregion"),
    ],
    text,
    (p) => p.name,
    (p) => p.area,
  ).map(fromPlaces);

  // At most `limit` of each kind; states and counties keep their joint order.
  // Parks with systems, and watersheds with ecoregions, count as one kind.
  const left = new Map<string, number>();
  const most = (list: SearchPlace[]) =>
    list.filter((p) => {
      const kind =
        p.kind === "park-system"
          ? "park"
          : p.kind === "ecoregion"
            ? "watershed"
            : p.kind;
      const n = left.get(kind) ?? limit ?? Infinity;
      left.set(kind, n - 1);
      return n > 0;
    });
  return {
    ...NOTHING,
    species: species.slice(0, limit ?? 50),
    places: [
      ...most(cityMatches),
      ...most(states),
      ...most(parkMatches),
      ...most(areaMatches),
    ],
  };
}
