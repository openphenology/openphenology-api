// Runs the whole Postman collection with Newman against the made-up release
// in test/fixture.ts, served on localhost with this package's schemas in its
// schemas/ folder, so the check never touches the network. Fails when any
// test fails or any request is not sent, and when a broken file passes.
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { RELEASE, fakeServer } from "../test/fixture.ts";

interface Summary {
  readonly run: {
    readonly stats: { readonly testScripts: { readonly total: number } };
    readonly failures: readonly {
      readonly error: { readonly test?: string };
    }[];
  };
}
interface Newman {
  run(
    options: Record<string, unknown>,
    done: (error: Error | null, summary: Summary) => void,
  ): void;
}
const newman = createRequire(import.meta.url)("newman") as Newman;

const collection = JSON.parse(
  readFileSync("postman/openphenology.postman_collection.json", "utf8"),
) as { item: { item: unknown[] }[] };
const requests = collection.item.reduce(
  (n, folder) => n + folder.item.length,
  0,
);

const fixture = await fakeServer();
for (const name of readdirSync("schemas"))
  if (name.endsWith(".json"))
    fixture.tamper(
      `releases/${RELEASE}/schemas/${name}`,
      readFileSync(`schemas/${name}`, "utf8"),
    );

/** Serves these files on localhost and runs the whole collection against them. */
async function run(files: ReadonlyMap<string, string>): Promise<Summary> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const body = files.get(path.slice(1));
    response.writeHead(body === undefined ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end(body ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    // The made-up release's state, county and a ZIP code it lists; the run
    // fills in the release and species itself.
    return await new Promise<Summary>((resolve, reject) => {
      newman.run(
        {
          collection,
          envVar: [
            { key: "baseUrl", value: `http://127.0.0.1:${String(port)}` },
            { key: "state", value: "us-zz" },
            { key: "county", value: "99001" },
            { key: "zip", value: "99901" },
            { key: "placeKind", value: "parks" },
            { key: "place", value: "parks-example-metro-parks" },
          ],
          reporters: files === fixture.files ? ["cli"] : [],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });
  } finally {
    server.close();
  }
}

const summary = await run(fixture.files);
const ran = summary.run.stats.testScripts.total;
const failures = summary.run.failures.length;
if (failures > 0 || ran < requests) {
  console.error(
    `Newman: ${String(failures)} failed, ${String(ran)} of ${String(requests)} requests tested`,
  );
  process.exit(1);
}

// The same run with one name in the search index given a kind its schema
// does not allow, which only the converted prefixItems rule catches.
const SEARCH = `releases/${RELEASE}/search/index.json`;
const broken = new Map(fixture.files);
broken.set(
  SEARCH,
  (fixture.files.get(SEARCH) ?? "").replace('"scientific"', '"nickname"'),
);
const caught = (await run(broken)).run.failures.map((f) => f.error.test);
if (caught.length !== 1 || caught[0] !== "Matches schemas/search-1.json") {
  console.error(
    `Newman: a broken search index was not caught by its schema alone (failed: ${JSON.stringify(caught)})`,
  );
  process.exit(1);
}
console.log(
  `Newman: all ${String(requests)} requests passed their tests, and a broken file failed its schema`,
);
