// The client: fetching with timeouts and retries, choosing a release, and
// reading each published file by name.
import { sha256 } from "./digest.ts";
import { countyState } from "./states.ts";
import { PRODUCTION_URL } from "./urls.ts";
import { ApiError, FormatError } from "./errors.ts";
import { checkLabels, checkWeeks, parseFile } from "./parse.ts";
import {
  countyCode,
  placeCode,
  placeKind,
  releaseId,
  speciesKey,
  stateCode,
  zipCode,
} from "./paths.ts";
import type {
  AttributionFile,
  BackyardFile,
  BoundariesFile,
  CitiesFile,
  CatalogueEntry,
  CatalogueFile,
  CountyResultFile,
  CurrentFile,
  GroupsFile,
  ManifestEntry,
  ManifestFile,
  MethodsFile,
  NotesFile,
  PlaceBoundariesFile,
  PlaceKind,
  PlaceLabelsFile,
  PlaceResultFile,
  PlacesFile,
  PostalFile,
  PublishedFile,
  RegionFile,
  ReleasesFile,
  SearchFile,
  SearchName,
  SlugsFile,
  SourcesFile,
  SpeciesFile,
  StateResultFile,
  TermsFile,
} from "./types.ts";

/** How a client reads the published data. Every option has a default. */
export interface ClientOptions {
  /** Where the files are served. Defaults to {@link PRODUCTION_URL}. */
  readonly baseUrl?: string;
  /** Read this release, such as `2026-10-19`, instead of the current one. */
  readonly release?: string;
  /** Check each release file against its SHA-256 in the manifest. Defaults to `false`. */
  readonly verify?: boolean;
  /** Milliseconds before one attempt is abandoned. Defaults to 10 000. */
  readonly timeoutMs?: number;
  /** Extra attempts after a network error or a 429 or 5xx response. Defaults to 2. */
  readonly retries?: number;
  /** Cancels every request this client makes. */
  readonly signal?: AbortSignal;
  /** The fetch implementation. Defaults to the global one. */
  readonly fetch?: typeof fetch;
}

/** One county a ZIP code falls in, from {@link Release.zipCounties}. */
export interface ZipCounty {
  /** The county's 5-digit Census code, such as `39049`. */
  readonly area: string;
  /** The county's state code, such as `us-oh`; `null` when its Census code is unknown. */
  readonly state: string | null;
  /** The share of the ZIP code's land in the county, from 0 to 1. */
  readonly share: number;
}

/** Options for {@link Client.release}. */
export interface ReleaseOptions {
  /**
   * Read `current.json` again and return the release it names now. A
   * `Release` already returned keeps reading its own files. No effect on a
   * pinned release.
   */
  readonly refresh?: boolean;
}

/**
 * The fields a file split into shards divides between them, by kind. Lists
 * are joined in shard order and maps are merged; every other field is the
 * same in each shard. Other kinds are never split.
 */
const SPLIT: Readonly<Record<string, readonly string[]>> = {
  catalogue: ["species"],
  search: ["names"],
  species: ["areas", "ranges"],
  slugs: ["species", "redirects"],
  groups: ["groups"],
  region: ["areas"],
  attribution: ["datasets", "record_links"],
  backyard: ["species"],
  sources: ["sources"],
  boundaries: ["features"],
  places: ["places"],
  "place-boundaries": ["features"],
  "place-labels": ["species"],
  cities: ["cities"],
  postal: ["zips"],
  releases: ["releases"],
  notes: ["corrections", "key_changes"],
};

/**
 * Reads `<name>.json`, or when it is not published and its kind can be split,
 * its shards `<name>/0.json`, `<name>/1.json` and so on, joined into one file.
 *
 * @param path The file's path.
 * @param kind The file's kind, which says whether and how it is split.
 * @param read Reads one file, or `null` when it does not exist.
 * @returns The file, or `null` when neither it nor any shard exists.
 */
async function readSplit<File extends PublishedFile<string, unknown>>(
  path: string,
  kind: File["kind"],
  read: (path: string) => Promise<File | null>,
): Promise<File | null> {
  const whole = await read(path);
  const fields = SPLIT[kind];
  if (whole || !fields) return whole;
  const shards: File[] = [];
  for (;;) {
    const shard = await read(
      `${path.slice(0, -".json".length)}/${String(shards.length)}.json`,
    );
    if (!shard) break;
    shards.push(shard);
  }
  const [first] = shards;
  if (!first) return null;
  const data = { ...(first.data as Record<string, unknown>) };
  for (const field of fields) {
    const parts = shards.map(
      (shard) => (shard.data as Record<string, unknown>)[field],
    );
    if (parts.every(Array.isArray)) data[field] = parts.flat();
    else if (parts.every((part) => part !== null))
      data[field] = Object.assign({}, ...parts) as unknown;
  }
  return { ...first, data };
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads published OpenPhenology data. Create one with {@link createClient}.
 *
 * @example
 * const client = createClient();
 * const release = await client.release();
 * const result = await release.countyResult("us-oh", "39049", speciesKey);
 */
export class Client {
  readonly #base: URL;
  readonly #options: ClientOptions;
  #release: Promise<Release> | undefined;
  #opened: Release | undefined;

  /**
   * @param options How to read the data. Every option has a default.
   */
  constructor(options: ClientOptions = {}) {
    this.#base = new URL(options.baseUrl ?? PRODUCTION_URL);
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/";
    this.#options = options;
  }

  /**
   * The release this client reads: the pinned one, or the current one read once
   * from `current.json`, so every later read comes from the same release.
   *
   * @param options Pass `{ refresh: true }` to read `current.json` again.
   * @returns The release. Later calls return the same one until a refresh
   *   finds a new current release.
   * @throws {ApiError} Rejects when `current.json` cannot be read, or when a
   *   pinned release is not published or has been withdrawn (status 404).
   * @throws {FormatError} Rejects when `current.json` is malformed.
   * @throws {RangeError} Rejects when the release ID is malformed.
   */
  release(options: ReleaseOptions = {}): Promise<Release> {
    if (options.refresh === true && this.#options.release === undefined)
      this.#release = undefined;
    this.#release ??= this.#openRelease().then(
      (release) => (this.#opened = release),
      (error: unknown) => {
        this.#release = undefined;
        throw error;
      },
    );
    return this.#release;
  }

  /**
   * Opens the pinned or current release.
   *
   * @returns The release.
   * @throws {ApiError} When a pinned release has no `methods.json`.
   */
  async #openRelease(): Promise<Release> {
    const pinned = this.#options.release;
    if (pinned !== undefined) {
      const release = new Release(this, releaseId(pinned));
      // Every release has methods.json, and a withdrawn release's files are deleted.
      if (!(await release.methods())) throw release.unavailable("methods.json");
      return release;
    }
    const current = await this.current();
    const id = releaseId(current.data.release);
    // An unchanged release keeps the files it has already read.
    return this.#opened?.id === id ? this.#opened : new Release(this, id);
  }

  /**
   * Which release is current and when it was published, from `current.json`.
   * Read fresh each time; {@link Client.release} opens that release.
   *
   * @returns The file.
   * @throws {ApiError} Rejects when it cannot be read or does not exist.
   * @throws {FormatError} Rejects when it is malformed.
   */
  async current(): Promise<CurrentFile> {
    return parseFile<CurrentFile>(
      "current.json",
      await this.getJson("current.json"),
      "current",
    );
  }

  /**
   * Every release and its status, from `releases.json`.
   *
   * @returns The file, joined from its shards when it is split.
   * @throws {ApiError} Rejects when it cannot be read or does not exist.
   * @throws {FormatError} Rejects when it is malformed.
   */
  async releases(): Promise<ReleasesFile> {
    const file = await readSplit<ReleasesFile>(
      "releases.json",
      "releases",
      async (path) => {
        const bytes = await this.getBytes(path);
        return bytes === undefined
          ? null
          : parseFile<ReleasesFile>(path, decode(path, bytes), "releases");
      },
    );
    if (!file) throw this.notFound("releases.json");
    return file;
  }

  /**
   * The licence, how to cite OpenPhenology and credit its sources, and the
   * contact address, from `terms.json`.
   *
   * @returns The file.
   * @throws {ApiError} Rejects when it cannot be read or does not exist.
   * @throws {FormatError} Rejects when it is malformed.
   */
  async terms(): Promise<TermsFile> {
    return parseFile<TermsFile>(
      "terms.json",
      await this.getJson("terms.json"),
      "terms",
    );
  }

  /**
   * Whether release files are checked against the manifest.
   *
   * @returns The `verify` option.
   */
  get verify(): boolean {
    return this.#options.verify ?? false;
  }

  /**
   * Fetches a file's bytes, with the client's timeout and retries.
   *
   * @param path The file's path from the API root.
   * @returns The bytes, or `undefined` when the file does not exist (404).
   * @throws {ApiError} Rejects after a network error, a timeout or an
   *   unexpected status, once retries are used up or the signal is aborted.
   * @internal
   */
  async getBytes(path: string): Promise<ArrayBuffer | undefined> {
    const url = new URL(path, this.#base).href;
    const doFetch = this.#options.fetch ?? fetch;
    const retries = this.#options.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(this.#options.timeoutMs ?? 10_000);
      const signal = this.#options.signal
        ? AbortSignal.any([this.#options.signal, timeout])
        : timeout;
      let response: Response;
      try {
        response = await doFetch(url, { signal });
      } catch (error) {
        if (this.#options.signal?.aborted === true || attempt >= retries) {
          const code = this.#options.signal?.aborted
            ? "aborted"
            : (error as { name?: unknown } | null)?.name === "TimeoutError"
              ? "timeout"
              : "network";
          throw new ApiError(code, `Request failed: ${url}`, url, undefined, {
            cause: error,
          });
        }
        await wait(250 * 2 ** attempt);
        continue;
      }
      if (response.ok) return response.arrayBuffer();
      if (response.status === 404) return undefined;
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < retries
      ) {
        await wait(250 * 2 ** attempt);
        continue;
      }
      throw new ApiError(
        "status",
        `HTTP ${String(response.status)}: ${url}`,
        url,
        response.status,
      );
    }
  }

  /**
   * Fetches and parses a JSON file.
   *
   * @param path The file's path from the API root.
   * @returns The parsed JSON.
   * @throws {ApiError} Rejects when the file cannot be read or does not exist.
   * @throws {FormatError} Rejects when it is not valid JSON.
   * @internal
   */
  async getJson(path: string): Promise<unknown> {
    const bytes = await this.getBytes(path);
    if (bytes === undefined) throw this.notFound(path);
    return decode(path, bytes);
  }

  /**
   * The error for a file that does not exist.
   *
   * @param path The file's path from the API root.
   * @param code `not-found`, or `release-unavailable` for a release.
   * @param message The error message.
   * @returns An `ApiError` with status 404.
   * @internal
   */
  notFound(
    path: string,
    code: "not-found" | "release-unavailable" = "not-found",
    message = `Not found: ${path}`,
  ): ApiError {
    return new ApiError(code, message, new URL(path, this.#base).href, 404);
  }
}

/**
 * Parses a file's bytes as JSON.
 *
 * @param path The file's path, for errors.
 * @param bytes The bytes.
 * @returns The parsed JSON.
 * @throws {FormatError} When the bytes are not valid JSON.
 */
function decode(path: string, bytes: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new FormatError("not-json", `${path}: not valid JSON`, path);
  }
}

/**
 * One release, from {@link Client.release}. Its files never change, so each
 * is fetched at most once.
 *
 * Places are named by code: `us-oh` for a state, a 5-digit Census code such
 * as `39049` for a county, and `huc8-`, `eco-`, `park-` or `parks-` codes for
 * watersheds, ecoregions, parks and metro park systems. Species are named by
 * their key, from {@link Release.catalogue}, {@link Release.speciesBySlug} or
 * {@link Release.searchNames}.
 *
 * - A malformed code is a `RangeError`, before any request is made, so a
 *   code can never change the path requested.
 * - A file that is not published is `null`, or an empty list.
 * - A failed request is an `ApiError`, and a malformed file a `FormatError`.
 */
export class Release {
  /** The release ID, its date: for example `2026-10-19`. */
  readonly id: string;
  readonly #client: Client;
  readonly #files = new Map<string, Promise<unknown>>();
  /** The joined manifest, read once; a failure is not kept. */
  #manifest: Promise<ManifestFile> | undefined;

  /**
   * @param client The client that reads its files.
   * @param id The release ID.
   * @internal
   */
  constructor(client: Client, id: string) {
    this.#client = client;
    this.id = id;
  }

  /**
   * The release manifest: every file, with its SHA-256, size and format, and
   * the release's counts.
   *
   * @returns The manifest.
   * @throws {ApiError} Rejects when the release is not available (status 404)
   *   or the request fails.
   */
  manifest(): Promise<ManifestFile> {
    if (!this.#manifest) {
      const manifest = this.#joinManifest();
      this.#manifest = manifest;
      manifest.catch(() => {
        if (this.#manifest === manifest) this.#manifest = undefined;
      });
    }
    return this.#manifest;
  }

  /**
   * Reads the manifest and, from `manifest/2.0`, its other parts,
   * `manifest/1.json` to `manifest/<parts - 1>.json`, joining their `files`.
   *
   * @returns The whole manifest.
   * @throws {ApiError} When the release is not available.
   * @throws {FormatError} When a part is missing or malformed.
   */
  async #joinManifest(): Promise<ManifestFile> {
    const value = await this.#read("manifest.json", false);
    if (value === undefined) throw this.unavailable("manifest.json");
    const first = parseFile<ManifestFile>("manifest.json", value, "manifest");
    const parts = first.data.parts ?? 1;
    if (!Number.isInteger(parts) || parts < 1) {
      throw new FormatError(
        "malformed",
        "manifest.json: parts must be a whole number from 1",
        "manifest.json",
      );
    }
    if (parts === 1) return first;
    const rest = await Promise.all(
      Array.from({ length: parts - 1 }, async (_, i) => {
        const path = `manifest/${String(i + 1)}.json`;
        const part = await this.#read(path, false);
        if (part === undefined) {
          throw new FormatError(
            "malformed",
            `${path}: missing part ${String(i + 2)} of ${String(parts)}`,
            path,
          );
        }
        return parseFile<ManifestFile>(path, part, "manifest").data.files;
      }),
    );
    return {
      ...first,
      data: { ...first.data, files: [...first.data.files, ...rest.flat()] },
    };
  }

  /**
   * The error for a release that is not published, or has been withdrawn.
   *
   * @param path The missing file's path inside the release.
   * @returns An `ApiError` with status 404.
   * @internal
   */
  unavailable(path: string): ApiError {
    return this.#client.notFound(
      `releases/${this.id}/${path}`,
      "release-unavailable",
      `Release ${this.id} is not available`,
    );
  }

  /**
   * What changed since the previous release: results added, changed and
   * removed, species key changes, corrections and format changes.
   *
   * @returns The notes, or `null` when not published.
   */
  notes(): Promise<NotesFile | null> {
    return this.#file<NotesFile>("notes.json", "notes");
  }

  /**
   * Every species with a result or a mapped range, by scientific name.
   *
   * @returns The species, from the catalogue or all its shards; empty when
   *   not published.
   */
  async catalogue(): Promise<CatalogueEntry[]> {
    const file = await this.#file<CatalogueFile>("catalogue.json", "catalogue");
    return [...(file?.data.species ?? [])];
  }

  /**
   * One species: its names, classification, and every area where it has a
   * result or is within its mapped range.
   *
   * @param key The species key.
   * @returns The species, or `null` when not published.
   * @throws {RangeError} When the key is malformed.
   */
  species(key: string): Promise<SpeciesFile | null> {
    return this.#file<SpeciesFile>(
      `species/${speciesKey(key)}.json`,
      "species",
    );
  }

  /**
   * The species key for a page slug, following a redirect from an old slug.
   *
   * @param slug The slug, such as `northern-cardinal`.
   * @returns The species key, or `null` when the slug is unknown.
   */
  async speciesBySlug(slug: string): Promise<string | null> {
    const file = await this.#file<SlugsFile>("slugs.json", "slugs");
    if (!file) return null;
    const { species, redirects } = file.data;
    return species[slug] ?? species[redirects[slug] ?? ""] ?? null;
  }

  /**
   * The browse groups, such as birds or flowering plants, in display order.
   *
   * @returns The groups, or `null` when not published.
   */
  groups(): Promise<GroupsFile | null> {
    return this.#file<GroupsFile>("groups.json", "groups");
  }

  /**
   * Every searchable name, for search on the device.
   *
   * @returns `[name, kind, speciesKey]` triples, from the search index or all
   *   its shards; empty when not published.
   */
  async searchNames(): Promise<SearchName[]> {
    const file = await this.#file<SearchFile>("search/index.json", "search");
    return [...(file?.data.names ?? [])];
  }

  /**
   * A state and its counties: their names, slugs, species with a result,
   * species whose mapped range covers them, and weekly effort.
   *
   * @param state The state code, such as `us-oh`.
   * @returns The region, or `null` when not published.
   * @throws {RangeError} When the state code is malformed.
   */
  async region(state: string): Promise<RegionFile | null> {
    const path = `regions/${stateCode(state)}.json`;
    const file = await this.#file<RegionFile>(path, "region");
    file?.data.areas.forEach((area, i) => {
      checkWeeks(path, `areas[${String(i)}].effort`, area.effort);
    });
    return file;
  }

  /**
   * A species' weekly result for a whole state.
   *
   * @param state The state code, such as `us-oh`.
   * @param species The species key.
   * @returns The result, or `null` when none is published. A result withheld
   *   for protection or for too little evidence is not published.
   * @throws {RangeError} When a code is malformed.
   */
  stateResult(state: string, species: string): Promise<StateResultFile | null> {
    const path = `results/${stateCode(state)}/${speciesKey(species)}.json`;
    return this.#result<StateResultFile>(path, "state-weekly");
  }

  /**
   * A species' weekly result for one county.
   *
   * @param state The state code, such as `us-oh`.
   * @param county The county's 5-digit Census code, such as `39049`.
   * @param species The species key.
   * @returns The result, or `null` when none is published. A result withheld
   *   for protection or for too little evidence is not published.
   * @throws {RangeError} When a code is malformed.
   * @example
   * const result = await release.countyResult("us-oh", "39049", speciesKey);
   * if (result) console.log(result.data.season); // [early, middle, late] weeks
   */
  countyResult(
    state: string,
    county: string,
    species: string,
  ): Promise<CountyResultFile | null> {
    const path = `results/${stateCode(state)}/${countyCode(county)}/${speciesKey(species)}.json`;
    return this.#result<CountyResultFile>(path, "county-weekly");
  }

  /**
   * A species' weekly result for a watershed, ecoregion, park or metro park
   * system. A place that runs into a state not covered yet has results from
   * its covered part only.
   *
   * @param area The place's area code, such as `huc8-04100011`, `eco-342`,
   *   `park-hocking-hills-state-park` or `parks-cleveland-metroparks`.
   * @param species The species key.
   * @returns The result, or `null` when none is published. A sensitive
   *   species never has a place result.
   * @throws {RangeError} When a code is malformed.
   */
  placeResult(area: string, species: string): Promise<PlaceResultFile | null> {
    const path = `results/places/${placeCode(area)}/${speciesKey(species)}.json`;
    return this.#result<PlaceResultFile>(path, "place-weekly");
  }

  /**
   * The sources behind a result: datasets, GBIF download DOIs, and links to
   * the records (`null` for a sensitive species).
   *
   * @param state The state code, such as `us-oh`.
   * @param species The species key.
   * @param county The county's 5-digit Census code, for a county result.
   * @returns The attribution, or `null` when not published.
   * @throws {RangeError} When a code is malformed.
   */
  attribution(
    state: string,
    species: string,
    county?: string,
  ): Promise<AttributionFile | null> {
    const area =
      county === undefined
        ? stateCode(state)
        : `${stateCode(state)}/${countyCode(county)}`;
    return this.#file<AttributionFile>(
      `attribution/${area}/${speciesKey(species)}.json`,
      "attribution",
    );
  }

  /**
   * The sources behind a place result: datasets, GBIF download DOIs and
   * links to the records.
   *
   * @param area The place's area code, such as `huc8-04100011`.
   * @param species The species key.
   * @returns The attribution, or `null` when not published.
   * @throws {RangeError} When a code is malformed.
   */
  placeAttribution(
    area: string,
    species: string,
  ): Promise<AttributionFile | null> {
    return this.#file<AttributionFile>(
      `attribution/places/${placeCode(area)}/${speciesKey(species)}.json`,
      "attribution",
    );
  }

  /**
   * A county's Backyard labels: for each species, one letter per week saying
   * how it is reported there at that time of year.
   *
   * @param state The state code, such as `us-oh`.
   * @param county The county's 5-digit Census code, such as `39049`.
   * @returns The labels, or `null` when not published.
   * @throws {RangeError} When a code is malformed.
   */
  backyard(state: string, county: string): Promise<BackyardFile | null> {
    return this.#labels<BackyardFile>(
      `backyard/${stateCode(state)}/${countyCode(county)}.json`,
      "backyard",
    );
  }

  /**
   * A place's labels: for each species with a result there, one letter per
   * week, read from the place's own result (`c`, `s` or `r`).
   *
   * @param area The place's area code, such as `parks-cleveland-metroparks`.
   * @returns The labels, or `null` when not published.
   * @throws {RangeError} When the code is malformed.
   */
  placeLabels(area: string): Promise<PlaceLabelsFile | null> {
    return this.#labels<PlaceLabelsFile>(
      `labels/${placeCode(area)}.json`,
      "place-labels",
    );
  }

  /**
   * How results are made: the method, its thresholds and versions, and the
   * note on what results do not show.
   *
   * @returns The methods, or `null` when not published.
   */
  methods(): Promise<MethodsFile | null> {
    return this.#file<MethodsFile>("methods.json", "methods");
  }

  /**
   * Each source the release uses, its licence and how to credit it.
   *
   * @returns The sources, or `null` when not published.
   */
  sources(): Promise<SourcesFile | null> {
    return this.#file<SourcesFile>("sources.json", "sources");
  }

  /**
   * County outlines for a state's map, as GeoJSON. Simplified for display
   * only; not for placing records.
   *
   * @param state The state code, such as `us-oh`.
   * @returns The outlines, or `null` when not published.
   * @throws {RangeError} When the state code is malformed.
   */
  boundaries(state: string): Promise<BoundariesFile | null> {
    return this.#file<BoundariesFile>(
      `places/${stateCode(state)}/boundaries.json`,
      "boundaries",
    );
  }

  /**
   * A state's cities, villages and census-designated places, each with the
   * county it leads with and its other counties (ODR-2026-040). Match a
   * typed place name on the device; never send it anywhere.
   *
   * @param state The state code, such as `us-oh`.
   * @returns The places, or `null` when not published.
   * @throws {RangeError} When the state code is malformed.
   */
  cities(state: string): Promise<CitiesFile | null> {
    return this.#file<CitiesFile>(
      `places/${stateCode(state)}/cities.json`,
      "cities",
    );
  }

  /**
   * Every watershed, every ecoregion, or every national and state park and
   * metro park system with results, each with its species with a result
   * (ODR-2026-043, ODR-2026-044).
   *
   * @param kind `watersheds`, `ecoregions` or `parks`.
   * @returns The places, or `null` when not published.
   * @throws {RangeError} When the kind is not one of them.
   */
  async places(kind: PlaceKind): Promise<PlacesFile | null> {
    const path = `places/${placeKind(kind)}.json`;
    const file = await this.#file<PlacesFile>(path, "places");
    file?.data.places.forEach((place, i) => {
      checkWeeks(path, `places[${String(i)}].effort`, place.effort);
    });
    return file;
  }

  /**
   * Watershed or ecoregion outlines, or park middles as points, for maps, as
   * GeoJSON. Simplified for display only.
   *
   * @param kind `watersheds`, `ecoregions` or `parks`.
   * @returns The features, or `null` when not published.
   * @throws {RangeError} When the kind is not one of them.
   */
  placeBoundaries(kind: PlaceKind): Promise<PlaceBoundariesFile | null> {
    return this.#file<PlaceBoundariesFile>(
      `places/${placeKind(kind)}/boundaries.json`,
      "place-boundaries",
    );
  }

  /**
   * Every ZIP code that starts with a 3-digit prefix, with its counties and
   * their shares of its land; for lists such as ZIP code suggestions. To look
   * up one ZIP code, use {@link Release.zipCounties}.
   *
   * @param prefix The first three digits, such as `432`.
   * @returns The ZIP codes, or `null` when none is published for the prefix.
   * @throws {RangeError} When the prefix is not three digits.
   */
  postal(prefix: string): Promise<PostalFile | null> {
    if (!/^\d{3}$/.test(prefix))
      throw new RangeError(`Invalid ZIP prefix: ${JSON.stringify(prefix)}`);
    return this.#file<PostalFile>(`postal/us/${prefix}.json`, "postal");
  }

  /**
   * The counties a US ZIP code falls in, largest share of its land first.
   * Only the file for its first three digits is requested.
   *
   * @param zip A 5-digit ZIP code.
   * @returns Each county's code, its state code and its share of the ZIP
   *   code's land; empty when the ZIP code has no Census area.
   * @throws {RangeError} When the ZIP code is malformed.
   * @example
   * const [first] = await release.zipCounties("43215");
   * if (first?.state) await release.backyard(first.state, first.area);
   */
  async zipCounties(zip: string): Promise<ZipCounty[]> {
    const code = zipCode(zip);
    const file = await this.postal(code.slice(0, 3));
    return (file?.data.zips[code] ?? []).map(([area, share]) => ({
      area,
      state: countyState(area),
      share,
    }));
  }

  /**
   * Reads a Backyard or place labels file and checks its effort and labels.
   *
   * @param path The file's path inside the release.
   * @param kind `backyard` or `place-labels`.
   * @returns The file, or `null` when not published.
   */
  async #labels<File extends BackyardFile | PlaceLabelsFile>(
    path: string,
    kind: File["kind"],
  ): Promise<File | null> {
    const file = await this.#file<File>(path, kind);
    if (file) {
      checkWeeks(path, "effort", file.data.effort);
      file.data.species.forEach((species, i) => {
        checkLabels(path, `species[${String(i)}].labels`, species.labels);
      });
    }
    return file;
  }

  /**
   * Reads a result and checks its weekly lists.
   *
   * @param path The file's path inside the release.
   * @param kind `state-weekly`, `county-weekly` or `place-weekly`.
   * @returns The result, or `null` when not published.
   */
  async #result<
    File extends CountyResultFile | StateResultFile | PlaceResultFile,
  >(path: string, kind: File["kind"]): Promise<File | null> {
    const file = await this.#file<File>(path, kind);
    if (file) {
      for (const [name, list] of [
        ["weekly.records", file.data.weekly.records],
        ["weekly.years", file.data.weekly.years],
        ["effort", file.data.effort],
      ] as const) {
        checkWeeks(path, name, list);
      }
    }
    return file;
  }

  /**
   * A release file, joined from its shards when it is split.
   *
   * @param path The file's path inside the release.
   * @param kind The file's kind.
   * @returns The file, or `null` when not published.
   */
  #file<File extends PublishedFile<string, unknown>>(
    path: string,
    kind: File["kind"],
  ): Promise<File | null> {
    return readSplit<File>(path, kind, async (part) => {
      const value = await this.#read(part, this.#client.verify);
      return value === undefined ? null : parseFile<File>(part, value, kind);
    });
  }

  /**
   * Reads a release file once; later calls share the same result. A failure
   * is not kept.
   *
   * @param path The file's path inside the release.
   * @param verify Whether to check it against the manifest.
   * @returns The parsed JSON, or `undefined` when it does not exist.
   */
  #read(path: string, verify: boolean): Promise<unknown> {
    let file = this.#files.get(path);
    if (!file) {
      file = this.#load(path, verify);
      this.#files.set(path, file);
      file.catch(() => this.#files.delete(path));
    }
    return file;
  }

  /**
   * Fetches, checks and parses a release file.
   *
   * @param path The file's path inside the release.
   * @param verify Whether to check it against the manifest.
   * @returns The parsed JSON, or `undefined` when it does not exist.
   * @throws {FormatError} When its SHA-256 does not match the manifest.
   */
  async #load(path: string, verify: boolean): Promise<unknown> {
    let entry: ManifestEntry | undefined;
    if (verify) {
      entry = (await this.manifest()).data.files.find(
        (file) => file.path === path,
      );
      // The manifest lists every file, so an unlisted file does not exist.
      if (!entry) return undefined;
    }
    const bytes = await this.#client.getBytes(`releases/${this.id}/${path}`);
    if (bytes === undefined) return undefined;
    if (entry && (await sha256(bytes)) !== entry.sha256) {
      throw new FormatError(
        "checksum",
        `${path}: SHA-256 does not match the manifest`,
        path,
      );
    }
    return decode(path, bytes);
  }
}

/**
 * Creates a client for the published data.
 *
 * @param options How to read the data. Every option has a default.
 * @returns A new client. Each client keeps its own cache of release files.
 * @example
 * import { createClient } from "@openphenology/api";
 *
 * const release = await createClient().release();
 */
export function createClient(options?: ClientOptions): Client {
  return new Client(options);
}
