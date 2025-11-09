// eslint.config.js
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  // Ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "main.js"],
  },

  // Base configuration
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      obsidianmd,
    },
    rules: {
      // Obsidian-specific rules
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Obsidian", "Lofi"],
          acronyms: ["UI", "OK", "MP3"],
          enforceCamelCaseLower: false,
          allowAutoFix: true,
        },
      ],
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/no-sample-code": "error",
    },
  },
];
