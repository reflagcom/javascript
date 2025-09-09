const base = require("@reflag/eslint-config");
const preactConfig = require("eslint-config-preact");

const compatPlugin = require("eslint-plugin-compat");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

module.exports = [
  ...base,
  {
    // Preact projects
    files: ["**/*.tsx"],

    settings: {
      react: {
        // We only care about marking h() as being a used variable.
        pragma: "h",
        // We use "react 16.0" to avoid pushing folks to UNSAFE_ methods.
        version: "16.0",
      },
    },
    plugins: {
      compat: compatPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...preactConfig.rules,
      // Ignore React attributes that are not valid in Preact.
      // Alternatively, we could use the preact/compat alias or turn off the rule.
      "react/no-unknown-property": ["off"],
      "no-unused-vars": ["off"],
      "react/no-danger": ["off"],
    },
  },
  { ignores: ["dist/", "example/"] },
];
