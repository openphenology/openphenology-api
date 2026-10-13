// The test every request in the Postman collection runs, in Postman's script
// sandbox. scripts/postman.ts puts it after each request's `KIND`, `SPLIT`
// and `saved(file)`, which saves values for later requests. It checks that
// the file loads, is the expected kind and major format version, and matches
// its JSON Schema, which it reads from the release's schemas/ folder. A file
// split into shards is checked through its first shard.

const MAJOR = 1;

/**
 * Postman's validator reads JSON Schema draft-07, and these schemas are
 * 2020-12. The only 2020-12 keyword they use is `prefixItems`, which becomes
 * draft-07's tuple form: `items` as a list, and `additionalItems` for what
 * `items` said about the rest.
 */
function draft07(node) {
  if (Array.isArray(node)) return node.map(draft07);
  if (node === null || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node))
    if (key !== "$schema" && key !== "prefixItems") out[key] = draft07(value);
  if ("prefixItems" in node) {
    out.items = draft07(node.prefixItems);
    out.additionalItems = "items" in node ? draft07(node.items) : true;
  }
  return out;
}

function check(file, url) {
  saved(file);
  pm.test(`${KIND}/${String(MAJOR)}: ${url}`, () => {
    pm.expect(file.kind, "kind").to.equal(KIND);
    pm.expect(file.format, "format").to.match(
      new RegExp(`^${KIND}/${String(MAJOR)}\\.\\d+$`),
    );
  });
  const schema = `${pm.variables.get("baseUrl")}/releases/${pm.variables.get("release")}/schemas/${KIND}-${String(MAJOR)}.json`;
  pm.sendRequest(schema, (error, response) => {
    pm.test(`Matches schemas/${KIND}-${String(MAJOR)}.json`, () => {
      pm.expect(error, "schema request").to.equal(null);
      pm.expect(response.code, "schema status").to.equal(200);
      const Ajv = require("ajv");
      const validate = new Ajv({ allErrors: true }).compile(
        draft07(response.json()),
      );
      pm.expect(
        validate(file),
        JSON.stringify(validate.errors, null, 2),
      ).to.equal(true);
    });
  });
}

const url = pm.request.url.toString();
if (pm.response.code === 200) {
  check(pm.response.json(), url);
} else if (pm.response.code === 404 && SPLIT) {
  // Not published whole: it may be split into <name>/0.json, <name>/1.json…
  const shard = url.replace(/\.json$/, "/0.json");
  pm.sendRequest(shard, (error, response) => {
    pm.test("Published whole or as shards", () => {
      pm.expect(error, "shard request").to.equal(null);
      pm.expect(response.code, "not published in this release").to.equal(200);
    });
    if (error === null && response.code === 200) check(response.json(), shard);
  });
} else {
  pm.test("Loads", () => {
    pm.expect(pm.response.code, "not published in this release").to.equal(200);
  });
}
