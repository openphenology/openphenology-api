// What each tool reads and answers. Every answer carries the release it came
// from, the note on what results do not show, and how to cite and credit the
// data, so an assistant passes them on with the facts.
import {
  backyardLabel,
  BACKYARD_LABELS,
  countyState,
  recordLinks,
  weekOf,
  type BackyardLabel,
  type Client,
  type Release,
  type SeasonWeeks,
  type TermsFile,
  type Withheld,
} from "@openphenology/api";

/** Said when a release has no `methods.json` to give its own note. */
const LIMITS =
  "These results show when people recorded a species, not when or where it occurs.";

/** Why season weeks are withheld, word for word from the data rules (`seasonal.md`). */
const WITHHELD: Readonly<Record<Withheld, string>> = {
  "year-round": "There is no bounded season to describe",
  "two-seasons": "One early-middle-late window would put the middle in the gap",
  "one-year": "One year's activity would stand in for all of them",
  precision: "The weeks are too uncertain to show",
};

/** What a missing result means, as the data rules (`published.md`) say it. */
const NO_RESULT =
  "A result withheld by the data rules is not published. It looks exactly like a result that does not exist.";

/** How long a server keeps a release before checking for a newer one. */
const REFRESH_MS = 60 * 60 * 1000;

/** The most species `find_species` returns. */
const MATCHES = 10;

/** The most record links `get_records` returns. */
const LINKS = 20;

/** Where every record's link is, for a reader that needs them all. */
const ALL_LINKS =
  "Every record's link is in the result's attribution file; `recordLinks()` and `recordsCsv()` in `@openphenology/api` read them all.";

/** The cite, credit and licence every answer carries. */
export interface Credit {
  /** The licence, such as `CC-BY-NC-4.0`. */
  readonly licence: string;
  /** Where the licence is published. */
  readonly licence_url: string;
  /** How to cite OpenPhenology. */
  readonly cite: string;
  /** How to credit the sources. */
  readonly credit: string;
}

/** What every answer carries besides its facts. */
export interface Answer {
  /** The release the facts come from. */
  readonly release: string;
  /** What the results do not show. */
  readonly limits: string;
  /** How to cite and credit the data. */
  readonly terms: Credit;
}

/** One week, as a number and the day it starts. */
export interface Week {
  /** The week, from 1 to 53. */
  readonly week: number;
  /** The day it starts in a year that is not a leap year, such as `2 April`. */
  readonly starts: string;
}

/**
 * The week a number names, with the day it starts.
 *
 * @param week The week, from 1 to 53.
 * @returns The week and the day it starts, counted in a year that is not a
 *   leap year; in a leap year, weeks from March start a day earlier.
 */
export function describeWeek(week: number): Week {
  const start = new Date(Date.UTC(2025, 0, 1 + 7 * (week - 1)));
  const starts = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return { week, starts };
}

/**
 * A result's season weeks, or why they are withheld.
 *
 * @param season Early, middle and late weeks, or empty.
 * @param withheld Why they are empty, or `null`.
 * @returns The three weeks, each with the day it starts, or the reason.
 */
function describeSeason(season: SeasonWeeks, withheld: Withheld | null) {
  if (season.length === 0)
    return {
      season: null,
      withheld,
      why: withheld ? WITHHELD[withheld] : null,
    };
  const [early, middle, late] = season;
  return {
    season: {
      early: describeWeek(early),
      middle: describeWeek(middle),
      late: describeWeek(late),
    },
    withheld: null,
    why: null,
  };
}

/**
 * Reads the data for the tools, keeping a release for an hour and the terms
 * for as long as the release.
 */
export class Reader {
  readonly #client: Client;
  readonly #now: () => Date;
  #checked = 0;
  #terms: { release: string; credit: Promise<Credit> } | undefined;

  /**
   * @param client The client to read data with.
   * @param now The clock, for this week's labels and the hourly check.
   */
  constructor(client: Client, now: () => Date = () => new Date()) {
    this.#client = client;
    this.#now = now;
  }

  /**
   * The release to answer from, checking at most hourly for a newer one.
   *
   * @returns The release.
   * @throws {ApiError} Rejects when `current.json` cannot be read.
   * @throws {FormatError} Rejects when `current.json` is malformed.
   */
  release(): Promise<Release> {
    const now = this.#now().getTime();
    const refresh = now - this.#checked >= REFRESH_MS;
    if (refresh) this.#checked = now;
    return this.#client.release({ refresh });
  }

  /**
   * Wraps facts with the release, the limits and the terms.
   *
   * @param release The release the facts come from.
   * @param facts The facts.
   * @param limits The result's own note, when there is a result.
   * @returns The facts, then what every answer carries.
   * @throws {ApiError} Rejects when `terms.json` cannot be read.
   * @throws {FormatError} Rejects when `terms.json` is malformed.
   */
  async answer<Facts extends object>(
    release: Release,
    facts: Facts,
    limits?: string,
  ): Promise<Facts & Answer> {
    if (this.#terms?.release !== release.id) {
      const terms = {
        release: release.id,
        credit: this.#client.terms().then(credit),
      };
      // A failed read is tried again on the next answer.
      terms.credit.catch(() => {
        if (this.#terms === terms) this.#terms = undefined;
      });
      this.#terms = terms;
    }
    const [terms, note] = await Promise.all([
      this.#terms.credit,
      limits ?? release.methods().then((file) => file?.data.limits ?? LIMITS),
    ]);
    return { ...facts, release: release.id, limits: note, terms };
  }

  /**
   * The species whose names contain the text, exact matches first.
   *
   * @param text Part of a scientific, common or other name.
   * @returns Up to 10 species, each with its key, names and the name matched.
   * @throws {ApiError} Rejects when the search index cannot be read.
   */
  async findSpecies(text: string) {
    const release = await this.release();
    const names = await release.searchNames();
    const wanted = text.trim().toLowerCase();
    const found = new Map<string, { name: string; kind: string }>();
    const ranked = names
      .filter(([name]) => name.toLowerCase().includes(wanted))
      .sort(
        ([a], [b]) =>
          Number(b.toLowerCase() === wanted) -
          Number(a.toLowerCase() === wanted),
      );
    for (const [name, kind, key] of ranked) {
      if (found.size === MATCHES) break;
      if (!found.has(key)) found.set(key, { name, kind });
    }
    const species = [...found].map(([key, matched]) => ({
      species_key: key,
      ...namesOf(names, key),
      matched,
    }));
    return this.answer(release, { query: text, species });
  }

  /**
   * The counties a ZIP code falls in, with their names.
   *
   * @param zip A 5-digit ZIP code.
   * @returns Each county, largest share of the ZIP code's land first.
   * @throws {RangeError} When the ZIP code is malformed.
   * @throws {ApiError} Rejects when a file cannot be read.
   */
  async findCounty(zip: string) {
    const release = await this.release();
    const counties = await release.zipCounties(zip);
    const named = await Promise.all(
      counties.map(async ({ area, state, share }) => {
        const region = state ? await release.region(state) : null;
        const name =
          region?.data.areas.find((place) => place.area === area)?.name ?? null;
        return { county: area, state, name, share };
      }),
    );
    return this.answer(release, { counties: named });
  }

  /**
   * Every ZIP code that starts with a 3-digit prefix, with its counties, so
   * the assistant can pick the user's own: the hosted server never receives
   * a whole ZIP code.
   *
   * @param prefix The first three digits of a ZIP code.
   * @returns Each ZIP code and its counties, largest share of its land first;
   *   empty when none is published for the prefix.
   * @throws {RangeError} When the prefix is not three digits.
   * @throws {ApiError} Rejects when a file cannot be read.
   */
  async findCountiesByPrefix(prefix: string) {
    const release = await this.release();
    const file = await release.postal(prefix);
    const zips = Object.entries(file?.data.zips ?? {});
    const states = new Set(
      zips.flatMap(([, counties]) =>
        counties.map(([area]) => countyState(area) ?? ""),
      ),
    );
    states.delete("");
    const regions = await Promise.all(
      [...states].map((s) => release.region(s)),
    );
    const names = new Map(
      regions.flatMap((region) =>
        (region?.data.areas ?? []).map((place) => [place.area, place.name]),
      ),
    );
    return this.answer(release, {
      prefix,
      zips: zips.map(([zip, counties]) => ({
        zip,
        counties: counties.map(([area, share]) => ({
          county: area,
          state: countyState(area),
          name: names.get(area) ?? null,
          share,
        })),
      })),
    });
  }

  /**
   * A species' season in a state or one of its counties.
   *
   * @param species The species key.
   * @param state The state code; found from the county when left out.
   * @param county The county's 5-digit Census code, for a county's season.
   * @returns The season weeks, or why they are withheld, with the counts
   *   behind them; `result` is `null` when none is published.
   * @throws {RangeError} When a code is malformed, or neither a state nor a
   *   county with a known state is given.
   * @throws {ApiError} Rejects when a file cannot be read.
   */
  async season(species: string, state?: string, county?: string) {
    const area = state ?? (county ? countyState(county) : null);
    if (!area)
      throw new RangeError(
        county
          ? `Give the state of county ${county}`
          : "Give a state, a county, or both",
      );
    const release = await this.release();
    const [file, names] = await Promise.all([
      county
        ? release.countyResult(area, county, species)
        : release.stateResult(area, species),
      release.searchNames(),
    ]);
    const place = { state: area, county: county ?? null };
    const named = { species_key: species, ...namesOf(names, species) };
    if (!file)
      return this.answer(release, {
        ...named,
        ...place,
        result: null,
        note: NO_RESULT,
      });
    const { data } = file;
    return this.answer(
      release,
      {
        ...named,
        ...place,
        result: {
          records: data.included_records,
          years: data.contributing_years,
          ...describeSeason(data.season, data.season_withheld),
          gbif_download_dois: file.provenance.gbif_download_dois,
        },
      },
      data.limits,
    );
  }

  /**
   * The records behind a species' result in a state or county: how many,
   * the datasets they came from, and the first links to them (ODR-2026-052).
   * A sensitive species has no links, only its datasets.
   *
   * @param species The species key.
   * @param state The state code; found from the county when left out.
   * @param county The county's 5-digit Census code, for a county result.
   * @returns The records' count, datasets, GBIF download DOIs and links.
   * @throws {RangeError} When a code is malformed or no state is known.
   * @throws {ApiError} Rejects when a file cannot be read.
   */
  async records(species: string, state?: string, county?: string) {
    const area = state ?? (county ? countyState(county) : null);
    if (!area)
      throw new RangeError(
        county
          ? `Give the state of county ${county}`
          : "Give a state, a county, or both",
      );
    const release = await this.release();
    const file = await release.attribution(area, species, county);
    const place = { species_key: species, state: area, county: county ?? null };
    if (!file)
      return this.answer(release, { ...place, records: null, note: NO_RESULT });
    const links = recordLinks(file);
    const { data } = file;
    return this.answer(release, {
      ...place,
      records: data.datasets.reduce((n, d) => n + d.records, 0),
      datasets: data.datasets.map((d) => ({
        title: d.title,
        publisher: d.publisher,
        records: d.records,
        url: d.url,
      })),
      gbif_download_dois: data.gbif_download_dois,
      links: links?.slice(0, LINKS) ?? null,
      note:
        links === null
          ? "This species is sensitive, so links to its records are not published; its datasets and GBIF downloads credit them."
          : links.length > LINKS
            ? `The first ${String(LINKS)} of ${String(links.length)} links. ${ALL_LINKS}`
            : ALL_LINKS,
    });
  }

  /**
   * How each species is reported in a county in one week, from its Backyard
   * labels; species without enough evidence that week are left out.
   *
   * @param county The county's 5-digit Census code.
   * @param state The state code; found from the county when left out.
   * @param date The day, `YYYY-MM-DD`; today when left out.
   * @param group Only species in this browse group, such as `birds`.
   * @returns The week, and the species under each label.
   * @throws {RangeError} When a code or the date is malformed, or the
   *   county's state is unknown and not given.
   * @throws {ApiError} Rejects when a file cannot be read.
   */
  async thisWeek(
    county: string,
    state?: string,
    date?: string,
    group?: string,
  ) {
    const area = state ?? countyState(county);
    if (!area) throw new RangeError(`Give the state of county ${county}`);
    const day = date ? new Date(`${date}T00:00:00Z`) : this.#now();
    if (Number.isNaN(day.getTime()))
      throw new RangeError(`Invalid date: ${JSON.stringify(date)}`);
    const week = weekOf(day);
    const release = await this.release();
    const [file, names] = await Promise.all([
      release.backyard(area, county),
      release.searchNames(),
    ]);
    const labels: Partial<Record<BackyardLabel, object[]>> = {};
    for (const species of file?.data.species ?? []) {
      if (group !== undefined && species.group !== group) continue;
      const label = backyardLabel(species.labels, week);
      if (label === "n") continue;
      (labels[label] ??= []).push({
        species_key: species.species_key,
        ...namesOf(names, species.species_key),
        group: species.group,
        // A range label is shown with the range's seasons and source.
        ...(label === "m" ? { range: species.range } : {}),
      });
    }
    return this.answer(release, {
      state: area,
      county,
      ...describeWeek(week),
      evidence_through: file?.data.evidence_through ?? null,
      published: file !== null,
      labels: Object.entries(labels).map(([label, species]) => ({
        label,
        means: BACKYARD_LABELS[label as BackyardLabel],
        species,
      })),
    });
  }

  /**
   * The licence, how to cite and credit the data, and the contact address.
   *
   * @returns The terms, word for word from `terms.json`.
   * @throws {ApiError} Rejects when `terms.json` cannot be read.
   */
  async terms() {
    const release = await this.release();
    const { data } = await this.#client.terms();
    return this.answer(release, {
      scope: data.scope ?? null,
      warranty: data.warranty,
      contact: data.contact,
    });
  }
}

/**
 * The cite, credit and licence from `terms.json`.
 *
 * @param file The terms.
 * @returns What every answer carries.
 */
function credit(file: TermsFile): Credit {
  const { licence, licence_url, cite, credit } = file.data;
  return { licence, licence_url, cite, credit };
}

/**
 * A species' scientific and first common name, from the search index.
 *
 * @param names Every searchable name.
 * @param key The species key.
 * @returns Its names, each `null` when the index has none.
 */
function namesOf(
  names: readonly (readonly [string, string, string])[],
  key: string,
) {
  const of = (kind: string) =>
    names.find(([, k, species]) => species === key && k === kind)?.[0] ?? null;
  return { scientific_name: of("scientific"), common_name: of("common") };
}
