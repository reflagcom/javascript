const jsPlugin = require("@eslint/js");
const importsPlugin = require("eslint-plugin-import");
const unusedImportsPlugin = require("eslint-plugin-unused-imports");
const sortImportsPlugin = require("eslint-plugin-simple-import-sort");
const { builtinModules } = require("module");
const globals = require("globals");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettierConfig = require("eslint-config-prettier");
const vuePlugin = require("eslint-plugin-vue");

module.exports = [
  {
    // Blacklisted Folders, including **/node_modules/ and .git/
    ignores: ["build/", "**/gen"],
  },
  {
    // All files
    files: [
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "**/*.jsx",
      "**/*.ts",
      "**/*.tsx",
      "**/*.vue",
    ],
    plugins: {
      import: importsPlugin,
      "unused-imports": unusedImportsPlugin,
      "simple-import-sort": sortImportsPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        // Eslint doesn't supply ecmaVersion in `parser.js` `context.parserOptions`
        // This is required to avoid ecmaVersion < 2015 error or 'import' / 'export' error
        sourceType: "module",
        ecmaVersion: "latest",
        ecmaFeatures: {
          modules: true,
          impliedStrict: true,
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/parsers": {
        // Workaround until import supports flat config
        // https://github.com/import-js/eslint-plugin-import/issues/2556
        espree: [".js", ".cjs", ".mjs", ".jsx"],
      },
    },
    rules: {
      ...jsPlugin.configs.recommended.rules,
      ...importsPlugin.configs.recommended.rules,

      // Imports
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "unused-imports/no-unused-imports": ["warn"],
      "import/first": ["warn"],
      "import/newline-after-import": ["warn"],
      "import/no-named-as-default": ["off"],
      "simple-import-sort/exports": ["warn"],
      "simple-import-sort/imports": [
        "warn",
        {
          groups: [
            // Side effect imports.
            ["^\\u0000"],
            // Node.js builtins, react, and third-party packages.
            [
              `^(${builtinModules.join("|")})(/|$)`,
              "^react",
              "^(?!@reflag)@?\\w",
            ],
            // Shared reflag packages.
            ["^@reflag/(.*)$"],
            // Path aliased root, parent imports, and just `..`.
            ["^@/", "^\\.\\.(?!/?$)", "^\\.\\./?$"],
            // Relative imports, same-folder imports, and just `.`.
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
            // Style imports.
            ["^.+\\.s?css$"],
          ],
        },
      ],
    },
  },
  {
    // TypeScript files
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      vue: vuePlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
    },
    settings: {
      ...importsPlugin.configs.typescript.settings,
      "import/resolver": {
        ...importsPlugin.configs.typescript.settings["import/resolver"],
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      ...importsPlugin.configs.typescript.rules,
      ...tsPlugin.configs["eslint-recommended"].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,

      // Typescript Specific
      "@typescript-eslint/no-unused-vars": ["off"], // handled by unused-imports
      "@typescript-eslint/explicit-module-boundary-types": ["off"],
      "@typescript-eslint/no-floating-promises": ["error"],
      "@typescript-eslint/switch-exhaustiveness-check": ["warn"],
      "@typescript-eslint/no-non-null-assertion": ["off"],
      "@typescript-eslint/no-empty-function": ["warn"],
      "@typescript-eslint/no-explicit-any": ["off"],
      "@typescript-eslint/no-use-before-define": ["off"],
      "@typescript-eslint/no-shadow": ["warn"],
    },
  },

  {
    files: ["**/*.tsx"],
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    // Prettier Overrides
    files: [
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "**/*.jsx",
      "**/*.ts",
      "**/*.tsx",
      "**/*.vue",
    ],
    rules: {
      ...prettierConfig.rules,
    },
  },
];
