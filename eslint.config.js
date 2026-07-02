import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  ...globals.node
};

const typescriptRules = {
  ...tseslint.configs.recommended[0].rules,
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/consistent-type-imports": "off",
  "@typescript-eslint/explicit-function-return-type": "off",
  "@typescript-eslint/no-floating-promises": "off",
  "@typescript-eslint/prefer-readonly": "off"
};

export default [
  {
    ignores: [
      ".git/**",
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.cache/**",
      "**/.turbo/**",
      "**/.vite/**",
      "episodes/**/output/**",
      "episodes/**/state/**",
      "episodes/**/generated-assets/**",
      "episodes/**/audio/**",
      "episodes/**/video/**",
      "episodes/**/images/**",
      "episodes/**/transcripts/**",
      "episodes/**/logs/**",
      "audio/**",
      "video/**",
      "images/**",
      "transcripts/**",
      "logs/**",
      "docs.bak/**",
      "vitest.*.ts",
      "tools/whisper.cpp/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: nodeGlobals
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      globals: nodeGlobals
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: typescriptRules
  }
];
