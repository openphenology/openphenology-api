import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["coverage", "dist", "docs", ".readme", "scripts/*.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The package runs in Node.js and browsers, so it uses only APIs both have.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["node:*"], message: "Use web-standard APIs." }],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...[
          "window",
          "document",
          "localStorage",
          "navigator",
          "process",
          "Buffer",
          "require",
          "__dirname",
        ].map((name) => ({ name, message: "Not available in every runtime." })),
      ],
    },
  },
  {
    // Every export is documented, and its tags match what it takes and does.
    files: ["src/**/*.ts"],
    ...jsdoc.configs["flat/recommended-typescript-error"],
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ClassDeclaration: true,
            FunctionDeclaration: true,
            MethodDefinition: true,
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSPropertySignature",
            "ExportNamedDeclaration > VariableDeclaration",
          ],
        },
      ],
      "jsdoc/require-throws": "error",
      "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
      "jsdoc/check-tag-names": [
        "error",
        { definedTags: ["internal", "packageDocumentation", "document"] },
      ],
    },
  },
  { files: ["eslint.config.js"], ...tseslint.configs.disableTypeChecked },
);
