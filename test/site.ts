// The site's Advanced search, for the randomized comparison in
// test/search-site.test.ts. Copied from openphenology/apps at d9927cf (main,
// 2026-10-27) so the comparison runs without the site's repository:
//
// - ui/shared/year.ts: Season, inSeason;
// - ui/format/season.ts: WEEKS, MONTH_START;
// - ui/format/dateRange.ts: MONTH_DAYS, weekOfDay, rangeWeeks, overlaps;
// - ui/format/listFilter.ts: the shared filter, from its types to
//   filterOptions, and STAGE_LABEL;
// - app/data/pages.ts: asSeason, STAGE_OF, stagesOf, statusOf, and
//   parkRows' rule for sensitive species;
// - app/data/advancedSearch.ts: speciesAtPlace, which builds each list;
// - ui/pages/AdvancedSearch.tsx: what the page computes from a list;
// - ui/shared/FilterBar.tsx and ui/pages/SpeciesListPage.tsx: the
//   caterpillar wording.
//
// The code is unchanged except where a comment starting "Here:" says so:
// imports and React are left out, the state is a parameter, and a county's
// list reads the Nearby file, which has the backyard file's fields the list
// uses. Update it with the site.
import type {
  CatalogueEntry,
  NearbyFile,
  PlaceLabelsFile,
  StageSeasons,
} from "../src/index.ts";

// ui/shared/year.ts
export type Season = readonly [number, number, number];

export const inSeason = (week: number, season: Season | null): boolean =>
  season !== null &&
  (season[0] <= season[2]
    ? week >= season[0] && week <= season[2]
    : week >= season[0] || week <= season[2]);

// ui/format/season.ts
const WEEKS = 53;
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

// ui/format/dateRange.ts
export interface DayOfYear {
  /** 1 to 12. */
  readonly month: number;
  readonly day: number;
}

export interface DateRange {
  readonly from: DayOfYear;
  readonly to: DayOfYear;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function weekOfDay({ month, day }: DayOfYear): number {
  const days = MONTH_DAYS[month - 1] ?? 31;
  const dayOfYear = (MONTH_START[month - 1] ?? 1) + Math.min(day, days) - 1;
  return Math.min(WEEKS, Math.floor((dayOfYear - 1) / 7) + 1);
}

function rangeWeeks(range: DateRange): number[] {
  const first = weekOfDay(range.from);
  const last = weekOfDay(range.to);
  const count = ((last - first + WEEKS) % WEEKS) + 1;
  return Array.from({ length: count }, (_, i) => ((first - 1 + i) % WEEKS) + 1);
}

const overlaps = (season: Season | null, range: DateRange): boolean =>
  season !== null && rangeWeeks(range).some((w) => inSeason(w, season));

// ui/format/listFilter.ts
export type FilterStage = "in-flower" | "in-fruit" | "adults" | "larvae";
export type FilterTiming = "this-week" | "next-4-weeks";
export type FilterStatus = "introduced" | "invasive";
export type FilterSort = "name" | "season" | "records" | "group";

const AHEAD = 4;

export const STAGES: readonly FilterStage[] = [
  "in-flower",
  "in-fruit",
  "adults",
  "larvae",
];
const TIMINGS: readonly FilterTiming[] = ["this-week", "next-4-weeks"];
const STATUSES: readonly FilterStatus[] = ["introduced", "invasive"];

export interface FilterableSpecies {
  readonly slug: string;
  readonly commonName: string;
  readonly scientificName: string;
  readonly group: string;
  readonly season: Season | null;
  readonly weekly?: readonly number[] | null | undefined;
  readonly records?: number | null | undefined;
  readonly stages?: Partial<Record<FilterStage, Season | null>> | undefined;
  readonly status?: FilterStatus | null | undefined;
}

export interface ListFilter {
  readonly group: string | null;
  readonly stage: FilterStage | null;
  readonly timing: FilterTiming | null;
  readonly status: FilterStatus | null;
  readonly name: string;
  readonly sort: FilterSort;
}

export const NO_FILTER: ListFilter = {
  group: null,
  stage: null,
  timing: null,
  status: null,
  name: "",
  sort: "season",
};

function seasonFor(s: FilterableSpecies, stage: FilterStage | null) {
  return stage === null ? s.season : (s.stages?.[stage] ?? null);
}

function timingMatches(
  season: Season | null,
  timing: FilterTiming,
  week: number,
): boolean {
  if (timing === "this-week") return inSeason(week, season);
  for (let ahead = 1; ahead <= AHEAD; ahead += 1)
    if (inSeason(((week - 1 + ahead) % 53) + 1, season)) return true;
  return false;
}

const folded = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function nameMatches(s: FilterableSpecies, name: string): boolean {
  const wanted = folded(name);
  if (wanted === "") return true;
  return (
    folded(s.commonName).includes(wanted) ||
    folded(s.scientificName).includes(wanted)
  );
}

function passes(s: FilterableSpecies, f: ListFilter, week: number): boolean {
  if (f.group !== null && s.group !== f.group) return false;
  if (f.stage !== null && s.stages?.[f.stage] == null) return false;
  if (
    f.timing !== null &&
    !timingMatches(seasonFor(s, f.stage), f.timing, week)
  )
    return false;
  if (f.status === "invasive" && s.status !== "invasive") return false;
  if (f.status === "introduced" && s.status == null) return false;
  return nameMatches(s, f.name);
}

const BY_NAME = (a: FilterableSpecies, b: FilterableSpecies) =>
  a.commonName.localeCompare(b.commonName);

const weeksToMiddle = (season: Season | null, week: number): number =>
  season === null ? Infinity : (season[1] - week + 53) % 53;

function applyFilter<T extends FilterableSpecies>(
  list: readonly T[],
  f: ListFilter,
  week: number,
): T[] {
  const kept = list.filter((s) => passes(s, f, week));
  if (f.sort === "name") return kept.sort(BY_NAME);
  if (f.sort === "records")
    return kept.sort(
      (a, b) => (b.records ?? 0) - (a.records ?? 0) || BY_NAME(a, b),
    );
  if (f.sort === "group")
    return kept.sort((a, b) => a.group.localeCompare(b.group) || BY_NAME(a, b));
  return kept.sort(
    (a, b) =>
      weeksToMiddle(seasonFor(a, f.stage), week) -
        weeksToMiddle(seasonFor(b, f.stage), week) || BY_NAME(a, b),
  );
}

export interface FilterOption<V extends string> {
  readonly value: V;
  readonly count: number;
}

export interface FilterOptions {
  readonly groups: readonly FilterOption<string>[];
  readonly stages: readonly FilterOption<FilterStage>[];
  readonly timings: readonly FilterOption<FilterTiming>[];
  readonly statuses: readonly FilterOption<FilterStatus>[];
  readonly shown: number;
}

function filterOptions(
  list: readonly FilterableSpecies[],
  f: ListFilter,
  week: number,
): FilterOptions {
  const splits = (has: (s: FilterableSpecies) => boolean): boolean => {
    const n = list.filter(has).length;
    return n > 0 && n < list.length;
  };
  const count = (key: keyof ListFilter, value: string): number =>
    list.filter((s) => passes(s, { ...f, [key]: value }, week)).length;

  const groupNames = [...new Set(list.map((s) => s.group))].sort((a, b) =>
    a.localeCompare(b),
  );
  const groups =
    groupNames.length > 1
      ? groupNames.map((value) => ({ value, count: count("group", value) }))
      : [];
  const stages = STAGES.filter((st) =>
    splits((s) => s.stages?.[st] != null),
  ).map((value) => ({ value, count: count("stage", value) }));
  const timings = list.some((s) => s.season !== null)
    ? TIMINGS.map((value) => ({ value, count: count("timing", value) }))
    : [];
  const statuses = STATUSES.filter((st) =>
    splits((s) =>
      st === "invasive" ? s.status === "invasive" : s.status != null,
    ),
  ).map((value) => ({ value, count: count("status", value) }));
  return {
    groups,
    stages,
    timings,
    statuses,
    shown: list.filter((s) => passes(s, f, week)).length,
  };
}

export const STAGE_LABEL: Readonly<Record<FilterStage, string>> = {
  "in-flower": "Reported in flower",
  "in-fruit": "Reported in fruit",
  adults: "Reported as an adult",
  larvae: "Reported as a larva",
};

// ui/shared/FilterBar.tsx, its stage words; GroupPage passes `caterpillars`
// for a butterfly or moth group.
export const stageWords = (value: FilterStage, caterpillars: boolean) =>
  value === "larvae" && caterpillars
    ? "Reported as a caterpillar"
    : STAGE_LABEL[value];

// ui/pages/SpeciesListPage.tsx, a row's words.
export const rowWords = (stage: FilterStage, group: string) =>
  stage === "larvae" && /butterfl|moth/i.test(group)
    ? "Reported as a caterpillar"
    : STAGE_LABEL[stage];

// app/data/pages.ts
const asSeason = (weeks: readonly number[]): Season | null =>
  weeks.length === 3 ? [weeks[0] ?? 0, weeks[1] ?? 0, weeks[2] ?? 0] : null;

const STAGE_OF: readonly (readonly [keyof StageSeasons, FilterStage])[] = [
  ["flowering", "in-flower"],
  ["fruiting", "in-fruit"],
  ["adult", "adults"],
  ["larva", "larvae"],
];

function stagesOf(
  stages: StageSeasons | undefined,
): Partial<Record<FilterStage, Season | null>> | undefined {
  if (stages === undefined) return undefined;
  const out: Partial<Record<FilterStage, Season | null>> = {};
  for (const [published, stage] of STAGE_OF) {
    const weeks = stages[published];
    if (weeks !== undefined) out[stage] = asSeason(weeks);
  }
  return out;
}

// Here: the state is a parameter, as it is for every list below.
const statusOf = (entry: CatalogueEntry, STATE: string): FilterStatus | null =>
  entry.invasive_in?.includes(STATE) === true
    ? "invasive"
    : entry.introduced_in?.includes(STATE) === true
      ? "introduced"
      : null;

// app/data/advancedSearch.ts, speciesAtPlace, with pages.ts listed() and
// parkRows() reduced to the fields the search uses.
export interface ListPageSpecies extends FilterableSpecies {
  readonly key: string;
}

export function speciesAtPlace(
  catalogue: readonly CatalogueEntry[],
  names: Map<string, string>,
  STATE: string,
  place:
    | { readonly kind: "state" }
    | { readonly kind: "county"; readonly file: NearbyFile }
    | { readonly kind: "park"; readonly file: PlaceLabelsFile },
): ListPageSpecies[] {
  const byKey = new Map(catalogue.map((c) => [c.species_key, c]));
  const listed = (entry: CatalogueEntry) => {
    const weeks = entry.seasons?.[STATE];
    return {
      key: entry.species_key,
      slug: entry.slug ?? entry.species_key,
      commonName: entry.common_name ?? entry.scientific_name,
      scientificName: entry.scientific_name,
      group: names.get(entry.group ?? "") ?? "Other",
      season: weeks === undefined ? null : asSeason(weeks),
      stages: stagesOf(entry.stage_seasons?.[STATE]),
      status: statusOf(entry, STATE),
    };
  };
  if (place.kind === "state")
    return catalogue.flatMap((entry) => {
      if (entry.slug === null || !entry.states.includes(STATE)) return [];
      return [listed(entry)];
    });
  if (place.kind === "county")
    return place.file.data.species.flatMap((item) => {
      const entry = byKey.get(item.species_key);
      if (entry?.slug == null || item.records == null || item.weekly == null)
        return [];
      return [
        {
          ...listed(entry),
          weekly: item.weekly,
          season: asSeason(item.season),
          records: item.records,
          stages: stagesOf(item.stages),
        },
      ];
    });
  return place.file.data.species.flatMap((item) => {
    const entry = byKey.get(item.species_key);
    if (entry?.slug == null) return [];
    if (entry.sensitive_in?.includes(STATE) !== false) return [];
    return [
      {
        ...listed(entry),
        weekly: item.weekly,
        season: asSeason(item.season),
        records: item.records,
        stages: undefined,
      },
    ];
  });
}

// ui/pages/AdvancedSearch.tsx, what the page computes from a list. Here:
// `filtered` stands for needsFilter(inRange.length), so a test can apply
// the filter to a list of any length, as release.search() does.
export function advancedSearch(
  list: readonly ListPageSpecies[],
  range: DateRange | null,
  search: { readonly filter: ListFilter },
  thisWeek: number,
  filtered: boolean,
) {
  const fits = (season: Season | null) =>
    range === null ? season !== null : overlaps(season, range);
  const inRange = list.filter((s) => fits(s.season));
  const noSeason = list.filter((s) => s.season === null).length;
  const filter: ListFilter = filtered
    ? search.filter
    : { ...NO_FILTER, sort: search.filter.sort };
  const seasonOf = (s: ListPageSpecies) =>
    filter.stage === null ? s.season : (s.stages?.[filter.stage] ?? null);
  const shown = applyFilter(inRange, filter, thisWeek).filter((s) =>
    fits(seasonOf(s)),
  );
  const withStage = (stage: FilterStage) =>
    applyFilter(inRange, { ...filter, stage }, thisWeek).filter((s) =>
      fits(s.stages?.[stage] ?? null),
    ).length;
  const counted = filterOptions(inRange, filter, thisWeek);
  const options = {
    ...counted,
    stages: counted.stages.map((o) => ({ ...o, count: withStage(o.value) })),
    timings: [],
    shown: shown.length,
  };
  return { inRange, noSeason, shown, options, seasonOf };
}
