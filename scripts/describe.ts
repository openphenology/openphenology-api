// Copies each field's doc comment in src/types.ts into the matching property
// of its JSON Schema, so the types stay the one place the fields are
// described. Used by scripts/schemas.ts.
import ts from "typescript";

type Schema = Readonly<Record<string, unknown>>;

/** Each file kind's field docs, by path such as `data.areas[].season`. */
function fieldDocs(): Map<string, Map<string, string>> {
  const program = ts.createProgram(["src/types.ts"], {
    strict: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile("src/types.ts");
  if (!source) throw new Error("src/types.ts not found");

  const visit = (type: ts.Type, path: string, docs: Map<string, string>) => {
    for (const prop of checker.getPropertiesOfType(type)) {
      const at = path ? `${path}.${prop.name}` : prop.name;
      const doc = ts.displayPartsToString(
        prop.getDocumentationComment(checker),
      );
      if (doc) docs.set(at, doc);
      let inner = checker.getNonNullableType(checker.getTypeOfSymbol(prop));
      let innerPath = at;
      if (checker.isArrayType(inner)) {
        inner = checker.getTypeArguments(inner as ts.TypeReference)[0] ?? inner;
        innerPath = `${at}[]`;
      }
      if (checker.isTupleType(inner)) continue;
      if (inner.getFlags() & ts.TypeFlags.Object) visit(inner, innerPath, docs);
    }
  };

  const kinds = new Map<string, Map<string, string>>();
  for (const statement of source.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;
    const type = checker.getTypeAtLocation(statement.name);
    const kind = type.getProperty("kind");
    if (!kind) continue;
    const literal = checker.getTypeOfSymbol(kind);
    if (!literal.isStringLiteral()) continue;
    const docs = new Map<string, string>();
    visit(type, "", docs);
    kinds.set(literal.value, docs);
  }
  return kinds;
}

const DOCS = fieldDocs();

/**
 * A copy of a kind's schema with every property described from its type.
 * Throws when a property has no doc comment, so none is ever left out.
 */
export function describe(kind: string, schema: Schema): Schema {
  const docs = DOCS.get(kind);
  if (!docs) throw new Error(`no type for kind ${kind}`);
  const missing: string[] = [];

  const walk = (node: Schema, path: string): Schema => {
    const out: Record<string, unknown> = { ...node };
    if (node.properties) {
      out.properties = Object.fromEntries(
        Object.entries(node.properties as Record<string, Schema>).map(
          ([name, sub]) => {
            const at = path ? `${path}.${name}` : name;
            const doc = docs.get(at);
            if (!doc) missing.push(at);
            return [name, { description: doc, ...walk(sub, at) }];
          },
        ),
      );
    }
    if (node.items && typeof node.items === "object")
      out.items = walk(node.items as Schema, `${path}[]`);
    if (Array.isArray(node.anyOf))
      out.anyOf = (node.anyOf as Schema[]).map((branch) => walk(branch, path));
    return out;
  };

  const described = walk(schema, "");
  if (missing.length > 0)
    throw new Error(`${kind}: no doc comment for ${missing.join(", ")}`);
  return described;
}
