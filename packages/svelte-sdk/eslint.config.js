import eslint from "@reflag/eslint-config/base.js";
import sveltePlugin from "eslint-plugin-svelte";

export default [
  ...eslint,
  ...sveltePlugin.configs["flat/recommended"],
  {
    languageOptions: {
      parserOptions: {
        parser: "@typescript-eslint/parser",
        extraFileExtensions: [".svelte"],
        svelteFeatures: {
          experimentalGenerics: true,
        },
      },
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: "@typescript-eslint/parser",
      },
    },
  },
];