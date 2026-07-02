import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      ...tseslint.configs.recommended[0].rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-readonly": "off"
    }
  },
  {
    files: ["**/*.test.ts", "**/*.integration.test.ts", "**/*.e2e.test.ts"],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      ...tseslint.configs.recommended[0].rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-readonly": "off"
    }
  },
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "node_modules/**",
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
  }
];
