const base = require("@reflag/eslint-config");
const path = require("path");

module.exports = [
  ...base,
  { ignores: ["dist/", "dev/expo/.expo/"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: [path.join(__dirname, "tsconfig.eslint.json")],
      },
    },
    rules: {
      "import/no-unresolved": "off",
    },
  },
];
