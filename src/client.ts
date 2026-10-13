import { sha256 } from "./digest.ts";
import { ApiError, FormatError } from "./errors.ts";
import { checkLabels, checkWeeks, parseFile } from "./parse.ts";
import {
  countyCode,
  releaseId,
  speciesKey,
  stateCode,
  zipCode,
} from "./paths.ts";
import type {
  AttributionFile,
  BackyardFile,
  BoundariesFile,
  CatalogueEntry,
  CatalogueFile,
  CountyResultFile,
  CurrentFile,
  GroupsFile,
  ManifestEntry,
  ManifestFile,
  MethodsFile,
  NotesFile,
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

export const PRODUCTION_URL = "https://api.openphenology.com/";
export const STAGING_URL = "https://api-staging.openphenology.com/";

export interface ClientOptions {
  /** Where the files are served. Defaults to production. */
  readonly baseUrl?: string;
  /** Read this release instead of the current one. */
  readonly release?: string;
  /** Check each release file against its SHA-256 in the manifest. */
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
  postal: ["zips"],
  releases: ["releases"],
  notes: ["corrections", "key_changes"],
};

/**
 * Reads `<name>.json`, or when it is not published and its kind can be split,
 * its shards `<name>/0.json`, `<name>/1.json` and so on, joined into one file.
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

/** Reads published OpenPhenology data. */
export class Client {
  readonly #base: URL;
  readonly #options: ClientOptions;
  #release: Promise<Release> | undefined;
  #opened: Release | undefined;

  constructor(options: ClientOptions = {}) {
    this.#base = new URL(options.baseUrl ?? PRODUCTION_URL);
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/";
    this.#options = options;
  }

  /**
   * The release this client reads: the pinned one, or the current one read once
   * from `current.json`, so every later read comes from the same release.
   *
   * @param options.refresh Read `current.json` again and return the release it
   *   names now. A `Release` already returned keeps reading its own files. No
   *   effect on a pinned release.
   */
  release(options: { readonly refresh?: boolean } = {}): Promise<Release> {
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

  async #openRelease(): Promise<Release> {
    const pinned = this.#options.release;
    if (pinned !== undefined) {
      const release = new Release(this, releaseId(pinned));
      // Every release has methods.json, and a withdrawn release's files are deleted.
      if (!(await release.methods())) throw release.unavailable("methods.json");
      return release;
    }
    const current = parseFile<CurrentFile>(
      "current.json",
      await this.getJson("current.json"),
      "current",
    );
    const id = releaseId(current.data.release);
    // An unchanged release keeps the files it has already read.
    return this.#opened?.id === id ? this.#opened : new Release(this, id);
  }

  /** Every release and its status, from `releases.json`. */
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

  /** The licence, how to cite and credit, and the contact, from `terms.json`. */
  async terms(): Promise<TermsFile> {
    return parseFile<TermsFile>(
      "terms.json",
      await this.getJson("terms.json"),
      "terms",
    );
  }

  get verify(): boolean {
    return this.#options.verify ?? false;
  }

  /** Fetches a file's bytes, or `undefined` when it does not exist. */
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
          throw new ApiError(`Request failed: ${url}`, url, undefined, {
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
        `HTTP ${String(response.status)}: ${url}`,
        url,
        response.status,
      );
    }
  }

  /** Fetches and parses a JSON file, throwing when it does not exist. */
  async getJson(path: string): Promise<unknown> {
    const bytes = await this.getBytes(path);
    if (bytes === undefined) throw this.notFound(path);
    return decode(path, bytes);
  }

  /** The error for a file that does not exist. @internal */
  notFound(path: string, message = `Not found: ${path}`): ApiError {
    return new ApiError(message, new URL(path, this.#base).href, 404);
  }
}

function decode(path: string, bytes: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new FormatError(`${path}: not valid JSON`, path);
  }
}

/** One release. Its files never change, so each is fetched at most once. */
export class Release {
  readonly id: string;
  readonly #client: Client;
  readonly #files = new Map<string, Promise<unknown>>();

  constructor(client: Client, id: string) {
    this.#client = client;
    this.id = id;
  }

  /** The release manifest: every file, with its SHA-256, counts and format versions. */
  manifest(): Promise<ManifestFile> {
    return this.#read("manifest.json", false).then((value) => {
      if (value === undefined) throw this.unavailable("manifest.json");
      return parseFile<ManifestFile>("manifest.json", value, "manifest");
    });
  }

  /** The error for a release that is not published, or has been withdrawn. @internal */
  unavailable(path: string): ApiError {
    return this.#client.notFound(
      `releases/${this.id}/${path}`,
      `Release ${this.id} is not available`,
    );
  }

  /** What changed since the previous release. */
  notes(): Promise<NotesFile | null> {
    return this.#file<NotesFile>("notes.json", "notes");
  }

  /** Every species with a result or a mapped range, from the catalogue or all its shards. */
  async catalogue(): Promise<CatalogueEntry[]> {
    const file = await this.#file<CatalogueFile>("catalogue.json", "catalogue");
    return [...(file?.data.species ?? [])];
  }

  /** One species: names, classification, and every area with a result or mapped range. */
  species(key: string): Promise<SpeciesFile | null> {
    return this.#file<SpeciesFile>(
      `species/${speciesKey(key)}.json`,
      "species",
    );
  }

  /** The species key for a page slug, following a redirect; `null` when unknown. */
  async speciesBySlug(slug: string): Promise<string | null> {
    const file = await this.#file<SlugsFile>("slugs.json", "slugs");
    if (!file) return null;
    const { species, redirects } = file.data;
    return species[slug] ?? species[redirects[slug] ?? ""] ?? null;
  }

  /** The browse groups, in display order. */
  groups(): Promise<GroupsFile | null> {
    return this.#file<GroupsFile>("groups.json", "groups");
  }

  /** Every searchable name, from the search index or all its shards. */
  async searchNames(): Promise<SearchName[]> {
    const file = await this.#file<SearchFile>("search/index.json", "search");
    return [...(file?.data.names ?? [])];
  }

  /** A state, its counties, their species and effort. */
  async region(state: string): Promise<RegionFile | null> {
    const path = `regions/${stateCode(state)}.json`;
    const file = await this.#file<RegionFile>(path, "region");
    file?.data.areas.forEach((area, i) => {
      checkWeeks(path, `areas[${String(i)}].effort`, area.effort);
    });
    return file;
  }

  /** A species' result for a whole state, or `null` when none is published. */
  stateResult(state: string, species: string): Promise<StateResultFile | null> {
    const path = `results/${stateCode(state)}/${speciesKey(species)}.json`;
    return this.#result<StateResultFile>(path, "state-weekly");
  }

  /** A species' result for one county, or `null` when none is published. */
  countyResult(
    state: string,
    county: string,
    species: string,
  ): Promise<CountyResultFile | null> {
    const path = `results/${stateCode(state)}/${countyCode(county)}/${speciesKey(species)}.json`;
    return this.#result<CountyResultFile>(path, "county-weekly");
  }

  /** The sources behind a result: datasets, GBIF download DOIs and record links. */
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

  /** A county's Backyard labels for every week. */
  async backyard(state: string, county: string): Promise<BackyardFile | null> {
    const path = `backyard/${stateCode(state)}/${countyCode(county)}.json`;
    const file = await this.#file<BackyardFile>(path, "backyard");
    if (file) {
      checkWeeks(path, "effort", file.data.effort);
      file.data.species.forEach((species, i) => {
        checkLabels(path, `species[${String(i)}].labels`, species.labels);
      });
    }
    return file;
  }

  /** How results are made: the method and its numbers. */
  methods(): Promise<MethodsFile | null> {
    return this.#file<MethodsFile>("methods.json", "methods");
  }

  /** Each source, its licence and how to credit it. */
  sources(): Promise<SourcesFile | null> {
    return this.#file<SourcesFile>("sources.json", "sources");
  }

  /** County outlines for a state's map. For display only. */
  boundaries(state: string): Promise<BoundariesFile | null> {
    return this.#file<BoundariesFile>(
      `places/${stateCode(state)}/boundaries.json`,
      "boundaries",
    );
  }

  /**
   * The counties a US ZIP code falls in, largest share of its land first.
   * Empty when the ZIP code has no Census area. Only the file for its first
   * three digits is requested.
   */
  async zipCounties(zip: string): Promise<{ area: string; share: number }[]> {
    const code = zipCode(zip);
    const file = await this.#file<PostalFile>(
      `postal/us/${code.slice(0, 3)}.json`,
      "postal",
    );
    return (file?.data.zips[code] ?? []).map(([area, share]) => ({
      area,
      share,
    }));
  }

  async #result<File extends CountyResultFile | StateResultFile>(
    path: string,
    kind: File["kind"],
  ): Promise<File | null> {
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

  /** A release file, joined from its shards when it is split. */
  #file<File extends PublishedFile<string, unknown>>(
    path: string,
    kind: File["kind"],
  ): Promise<File | null> {
    return readSplit<File>(path, kind, async (part) => {
      const value = await this.#read(part, this.#client.verify);
      return value === undefined ? null : parseFile<File>(part, value, kind);
    });
  }

  /** Reads a release file once; later calls share the same result. */
  #read(path: string, verify: boolean): Promise<unknown> {
    let file = this.#files.get(path);
    if (!file) {
      file = this.#load(path, verify);
      this.#files.set(path, file);
      file.catch(() => this.#files.delete(path));
    }
    return file;
  }

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
        `${path}: SHA-256 does not match the manifest`,
        path,
      );
    }
    return decode(path, bytes);
  }
}

/** Creates a client for the published data. */
export function createClient(options?: ClientOptions): Client {
  return new Client(options);
}
