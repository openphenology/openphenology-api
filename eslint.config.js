import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["coverage", "dist"] },
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
  { files: ["eslint.config.js"], ...tseslint.configs.disableTypeChecked },
);
