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
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      obsidianmd,
    },
    rules: {
      // Obsidian UI rules
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Obsidian", "Lofi"],
          acronyms: ["UI", "OK", "MP3"],
          enforceCamelCaseLower: false,
          allowAutoFix: true,
          mode: "strict",
        },
      ],

      // Obsidian settings tab rules
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",

      // Obsidian code quality rules
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-view-references-in-plugin": "error",

      // Obsidian command rules
      "obsidianmd/commands/no-command-in-command-id": "error",
      "obsidianmd/commands/no-command-in-command-name": "error",
      "obsidianmd/commands/no-plugin-id-in-command-id": "error",
      "obsidianmd/commands/no-plugin-name-in-command-name": "error",

      // Obsidian best practices
      "obsidianmd/no-tfile-tfolder-cast": "error",
      "obsidianmd/prefer-file-manager-trash-file": "warn",
      "obsidianmd/vault/iterate": "warn",
    },
  },
];
