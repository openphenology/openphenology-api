import { sha256 } from "./digest.ts";
import { ApiError, FormatError } from "./errors.ts";
import { checkWeeks, parseFile } from "./parse.ts";
import { countyCode, releaseId, speciesKey, stateCode } from "./paths.ts";
import type {
  CountyResultFile,
  CurrentFile,
  ManifestEntry,
  ManifestFile,
  PublishedFile,
  RegionFile,
  Species,
  SpeciesFile,
  StateResultFile,
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

const SHARD = /^species(\/\d+)?\.json$/;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Reads published OpenPhenology data. */
export class Client {
  readonly #base: URL;
  readonly #options: ClientOptions;
  #release: Promise<Release> | undefined;

  constructor(options: ClientOptions = {}) {
    this.#base = new URL(options.baseUrl ?? PRODUCTION_URL);
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/";
    this.#options = options;
  }

  /**
   * The release this client reads: the pinned one, or the current one read once
   * from `current.json`, so every later read comes from the same release.
   */
  release(): Promise<Release> {
    this.#release ??= this.#openRelease().catch((error: unknown) => {
      this.#release = undefined;
      throw error;
    });
    return this.#release;
  }

  async #openRelease(): Promise<Release> {
    const pinned = this.#options.release;
    if (pinned !== undefined) return new Release(this, releaseId(pinned));
    const current = parseFile<CurrentFile>(
      "current.json",
      await this.getJson("current.json"),
      "current",
    );
    return new Release(this, releaseId(current.data.release));
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
    if (bytes === undefined)
      throw new ApiError(
        `Not found: ${path}`,
        new URL(path, this.#base).href,
        404,
      );
    return decode(path, bytes);
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
      if (value === undefined)
        throw new FormatError(
          `${this.id}: release has no manifest`,
          "manifest.json",
        );
      return parseFile<ManifestFile>("manifest.json", value, "manifest");
    });
  }

  /** Every species with published results, from all catalogue shards. */
  async species(): Promise<Species[]> {
    const manifest = await this.manifest();
    const shards = manifest.data.files
      .map((entry) => entry.path)
      .filter((path) => SHARD.test(path));
    const files = await Promise.all(
      shards.map((path) => this.#file<SpeciesFile>(path, "species")),
    );
    return files.flatMap((file) => (file ? [...file.data.species] : []));
  }

  /** A state's summary: species with results by area, and effort. */
  region(state: string): Promise<RegionFile | null> {
    return this.#file<RegionFile>(`regions/${stateCode(state)}.json`, "region");
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

  async #file<File extends PublishedFile<string, unknown>>(
    path: string,
    kind: File["kind"],
  ): Promise<File | null> {
    const value = await this.#read(path, this.#client.verify);
    return value === undefined ? null : parseFile<File>(path, value, kind);
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
