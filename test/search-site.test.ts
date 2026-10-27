// release.search() against the site's own Advanced search code (test/site.ts),
// on made-up releases drawn at random from a fixed seed: the same species in
// the same order, the same counts and the same option counts, for every
// place kind, dates, group, stage, status, text and sort.
import { describe, expect, test } from "vitest";
import {
  createClient,
  type CatalogueEntry,
  type NearbyFile,
  type PlaceLabelsFile,
  type SearchInput,
  type SearchSort,
} from "../src/index.ts";
import { fakeServer, wrap } from "./fixture.ts";
import {
  NO_FILTER,
  STAGES,
  advancedSearch,
  rowWords,
  speciesAtPlace,
  stageWords,
  type DayOfYear,
  type FilterStatus,
} from "./site.ts";

const STATE = "us-oh";
const COUNTY = "39001";
const PARK = "park-made-up-state-park";
const GROUPS = [
  ["birds", "Birds"],
  ["plants", "Flowering plants"],
  ["butterflies", "Butterflies and moths"],
] as const;
/** The groups a search can choose: Other too, the species with no listed group. */
const CHOICES = [...GROUPS, ["other", "Other"]] as const;
const WORDS = ["oak", "aster", "robin", "moth", "fern", "Élan", "sedge"];

/** A small seeded generator (mulberry32), so a failure can be replayed. */
function random(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(list: readonly T[]): T => list[int(list.length)] as T;
  const chance = (p: number) => next() < p;
  // A season, sometimes over the year end, sometimes withheld.
  const season = (): number[] => {
    if (chance(0.12)) return [];
    const early = int(53) + 1;
    const late = ((early - 1 + int(20)) % 53) + 1;
    const middle = ((early - 1 + int(((late - early + 53) % 53) + 1)) % 53) + 1;
    return [early, middle, late];
  };
  return { int, pick, chance, season };
}

function madeUp(seed: number) {
  const r = random(seed);
  const n = 22 + r.int(40);
  const catalogue = Array.from({ length: n }, (_, i): CatalogueEntry => {
    const key = `K${String(i).padStart(4, "0")}`;
    const group = r.chance(0.1)
      ? null
      : r.chance(0.05)
        ? "unlisted"
        : r.pick(GROUPS)[0];
    const stages = Object.fromEntries(
      (["flowering", "fruiting", "adult", "larva"] as const).flatMap((s) =>
        r.chance(0.35) ? [[s, r.season()]] : [],
      ),
    );
    const introduced = r.chance(0.3);
    return {
      species_key: key,
      scientific_name: `${r.pick(WORDS)}ia ${r.pick(WORDS)}us ${String(i)}`,
      common_name: r.chance(0.15)
        ? null
        : `${r.pick(WORDS)} ${r.pick(["plantain", "warbler", "skipper"])}`,
      rank: "species",
      kingdom: null,
      phylum: null,
      class: null,
      order: null,
      family: null,
      genus: null,
      group,
      slug: r.chance(0.05) ? null : key.toLowerCase(),
      states: [STATE],
      seasons: { [STATE]: r.season() as [] },
      sensitive_in: r.chance(0.1) ? [STATE] : [],
      introduced_in: introduced ? [STATE] : [],
      invasive_in: introduced && r.chance(0.4) ? [STATE] : [],
      stage_seasons: r.chance(0.8) ? { [STATE]: stages } : {},
    };
  });
  const some = () => catalogue.filter(() => r.chance(0.7));
  const nearby = {
    area: COUNTY,
    method: "test-1",
    evidence_through: "2025-12-31",
    effort: Array.from({ length: 53 }, () => 1),
    species: some().map((c) => {
      const records = r.chance(0.15) ? null : 1 + r.int(200);
      return {
        species_key: c.species_key,
        group: c.group,
        labels: "s".repeat(53),
        range: null,
        records,
        weekly: records === null ? null : Array.from({ length: 53 }, () => 1),
        season: records === null ? [] : r.season(),
        season_withheld: null,
        windows: null,
        conditions: null,
        stages: Object.fromEntries(
          (["flowering", "fruiting", "adult", "larva"] as const).flatMap((s) =>
            r.chance(0.3) ? [[s, r.season()]] : [],
          ),
        ),
      };
    }),
  };
  const labels = {
    area: PARK,
    method: "test-1",
    evidence_through: "2025-12-31",
    effort: Array.from({ length: 53 }, () => 1),
    species: some().map((c) => ({
      species_key: c.species_key,
      group: c.group,
      labels: "s".repeat(53),
      records: 1 + r.int(50),
      weekly: Array.from({ length: 53 }, () => 1),
      season: r.season(),
      season_withheld: null,
    })),
  };
  const park = {
    area: PARK,
    level: "park",
    name: "Made-up State Park",
    slug: "made-up-state-park",
    code: null,
    states: [STATE],
    continues_into: [],
    counties: [COUNTY],
    species_keys: [],
    effort: Array.from({ length: 53 }, () => 1),
    best_weeks: null,
    park: {
      type: "state",
      has_page: true,
      agency: "Made-up agency",
      acres: null,
      official_url: null,
      parks: [],
    },
  };
  const files: Record<string, unknown> = {
    "catalogue.json": wrap("catalogue.json", "catalogue", {
      species: catalogue,
    }),
    "groups.json": wrap("groups.json", "groups", {
      groups: GROUPS.map(([group, name]) => ({
        group,
        name,
        taxa: [],
        species: 1,
      })),
    }),
    [`nearby/${STATE}/${COUNTY}.json`]: wrap(
      `nearby/${STATE}/${COUNTY}.json`,
      "nearby",
      nearby,
    ),
    "places/parks.json": wrap("places/parks.json", "places", {
      kind: "parks",
      places: [park],
    }),
    [`labels/${PARK}.json`]: wrap(
      `labels/${PARK}.json`,
      "place-labels",
      labels,
    ),
  };
  return {
    r,
    files,
    catalogue,
    nearby: { data: nearby } as unknown as NearbyFile,
    labels: { data: labels } as unknown as PlaceLabelsFile,
  };
}

const names = new Map<string, string>(GROUPS);
const pad = (n: number) => String(n).padStart(2, "0");

describe("against the site's Advanced search", () => {
  test.each(Array.from({ length: 24 }, (_, i) => i + 1))(
    "made-up release %i",
    async (seed) => {
      const made = madeUp(seed);
      const { r } = made;
      const server = await fakeServer(made.files);
      const client = createClient({
        baseUrl: "https://example.test/",
        fetch: server.fetch,
      });
      const release = await client.release();
      for (let run = 0; run < 30; run++) {
        const kind = r.pick(["anywhere", "state", "county", "park"] as const);
        const place =
          kind === "anywhere"
            ? "anywhere"
            : kind === "state"
              ? STATE
              : kind === "county"
                ? COUNTY
                : PARK;
        const day = (): DayOfYear => {
          const month = r.int(12) + 1;
          return { month, day: r.int(28) + 1 };
        };
        const range = r.chance(0.5) ? { from: day(), to: day() } : null;
        const group = r.chance(0.4) ? r.pick(CHOICES) : null;
        const stage = r.chance(0.4) ? r.pick(STAGES) : null;
        const status: FilterStatus | null = r.chance(0.3)
          ? r.pick(["introduced", "invasive"] as const)
          : null;
        const text = r.chance(0.3) ? r.pick(WORDS).slice(0, 2 + r.int(3)) : "";
        const sorts: readonly SearchSort[] =
          kind === "anywhere"
            ? ["name", "season", "group"]
            : ["name", "season", "records", "group"];
        const sort = r.pick(sorts);
        const week = r.int(53) + 1;
        const input: SearchInput = {
          place,
          sort,
          week,
          ...(range === null
            ? {}
            : {
                from: `${pad(range.from.month)}-${pad(range.from.day)}`,
                to: `${pad(range.to.month)}-${pad(range.to.day)}`,
              }),
          ...(group === null ? {} : { group: group[0] }),
          ...(stage === null ? {} : { stage }),
          ...(status === null ? {} : { status }),
          ...(text === "" ? {} : { text }),
        };
        const list = speciesAtPlace(
          made.catalogue,
          names,
          STATE,
          kind === "county"
            ? { kind, file: made.nearby }
            : kind === "park"
              ? { kind, file: made.labels }
              : { kind: "state" },
        );
        const site = advancedSearch(
          list,
          range,
          {
            filter: {
              ...NO_FILTER,
              group: group?.[1] ?? null,
              stage,
              status,
              name: text,
              sort,
            },
          },
          week,
          true,
        );
        const found = await release.search(input);
        const why = JSON.stringify({ seed, run, input });
        expect(
          found.species.map((s) => [
            s.key,
            s.season,
            s.records,
            s.status,
            s.stageSeason,
            s.stageLabel,
          ]),
          why,
        ).toEqual(
          site.shown.map((s) => [
            s.key,
            s.season,
            s.records ?? null,
            s.status ?? null,
            stage === null ? null : site.seasonOf(s),
            stage === null ? null : rowWords(stage, s.group),
          ]),
        );
        expect(found.advanced, why).toMatchObject({
          inSeason: site.inRange.length,
          noSeason: site.noSeason,
          shown: site.shown.length,
          options: {
            groups: site.options.groups.map((o) => ({
              group: CHOICES.find(([, n]) => n === o.value)?.[0],
              name: o.value,
              count: o.count,
            })),
            stages: site.options.stages.map((o) => ({
              stage: o.value,
              label: stageWords(
                o.value,
                /butterfl|moth/i.test(group?.[1] ?? ""),
              ),
              count: o.count,
            })),
            statuses: site.options.statuses.map((o) => ({
              status: o.value,
              count: o.count,
            })),
          },
        });
        // Ohio is the only covered state, so Anywhere gives each row once.
        if (kind === "anywhere")
          for (const s of found.species)
            expect(
              s.seasons?.map((x) => x.state),
              why,
            ).toEqual([STATE]);
      }
    },
  );
});
