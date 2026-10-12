// A made-up release served by a fake fetch. Species, places and counts are invented.
const provenance = {
  sources: [{ name: "Example source", licence: "CC-BY-4.0" }],
  gbif_download_dois: ["10.0000/example"],
  method_version: "test-1",
  taxonomy_version: "test-taxonomy",
  boundary_version: "test-boundaries",
  code_version: "0.0.0",
  run_id: "run-1",
};

const weeks = (value: number): number[] =>
  Array.from({ length: 53 }, () => value);

export const RELEASE = "2026-01-05";

const result = (kind: string, format: string, area: string) => ({
  id: `${RELEASE}/${area}/EX1`,
  kind,
  format,
  provenance,
  data: {
    area,
    species_key: "EX1",
    included_records: 120,
    contributing_years: 4,
    thresholds: { min_records: 30, min_years: 3 },
    weekly: { records: weeks(2), years: weeks(1) },
    season: { early: 14, middle: 22, late: 35 },
    effort: weeks(40),
    limits:
      "These results show when people recorded a species, not when or where it occurs.",
  },
});

export const releaseFiles: Record<string, unknown> = {
  "species/0.json": {
    id: `${RELEASE}/species/0`,
    kind: "species",
    format: "species/1.0",
    provenance,
    data: {
      species: [
        {
          species_key: "EX1",
          scientific_name: "Exemplum primum",
          rank: "species",
          states: ["us-zz"],
        },
      ],
    },
  },
  "species/1.json": {
    id: `${RELEASE}/species/1`,
    kind: "species",
    format: "species/1.0",
    provenance,
    data: {
      species: [
        {
          species_key: "EX2",
          scientific_name: "Exemplum alterum",
          rank: "species",
          states: ["us-zz"],
        },
      ],
    },
  },
  "regions/us-zz.json": {
    id: `${RELEASE}/regions/us-zz`,
    kind: "region",
    format: "region/1.0",
    provenance,
    data: {
      state: "us-zz",
      areas: [{ area: "99001", species_keys: ["EX1"], effort: weeks(40) }],
    },
  },
  "results/us-zz/EX1.json": result("state-weekly", "state-weekly/1.0", "us-zz"),
  "results/us-zz/99001/EX1.json": result(
    "county-weekly",
    "county-weekly/1.0",
    "99001",
  ),
};

const encoder = new TextEncoder();

async function sha256(text: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(text)),
  );
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface FakeServer {
  readonly fetch: typeof fetch;
  readonly requests: string[];
  /** Replace a file's body as served, without changing the manifest. */
  readonly tamper: (path: string, body: string) => void;
  /** Answer the next requests for a path with these statuses first. */
  readonly failNext: (path: string, ...statuses: number[]) => void;
}

/** Serves the made-up release at https://example.test/. */
export async function fakeServer(): Promise<FakeServer> {
  const bodies = new Map<string, string>();
  const entries = [];
  for (const [path, file] of Object.entries(releaseFiles)) {
    const body = JSON.stringify(file);
    bodies.set(`releases/${RELEASE}/${path}`, body);
    entries.push({
      path,
      sha256: await sha256(body),
      format: (file as { format: string }).format,
      bytes: body.length,
    });
  }
  bodies.set(
    `releases/${RELEASE}/manifest.json`,
    JSON.stringify({
      id: `${RELEASE}/manifest`,
      kind: "manifest",
      format: "manifest/1.0",
      provenance,
      data: { release: RELEASE, files: entries, counts: { results: 2 } },
    }),
  );
  bodies.set(
    "current.json",
    JSON.stringify({
      id: "current",
      kind: "current",
      format: "current/1.0",
      provenance,
      data: { release: RELEASE },
    }),
  );

  const requests: string[] = [];
  const failures = new Map<string, number[]>();
  const fakeFetch = (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.slice(1);
    requests.push(path);
    const status = failures.get(path)?.shift();
    if (status !== undefined)
      return Promise.resolve(new Response("", { status }));
    const body = bodies.get(path);
    return Promise.resolve(
      body === undefined
        ? new Response("", { status: 404 })
        : new Response(body),
    );
  };
  return {
    fetch: fakeFetch,
    requests,
    tamper: (path, body) => bodies.set(path, body),
    failNext: (path, ...statuses) => failures.set(path, statuses),
  };
}
