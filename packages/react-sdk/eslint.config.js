const base = require("@reflag/eslint-config");
const reactPlugin = require("eslint-plugin-react");
const hooksPlugin = require("eslint-plugin-react-hooks");

module.exports = [
  ...base,
  { ignores: ["dist/", "dev/"] },
  {
    files: ["**/*.ts", "**/*.tsx"],

    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,

      "react/jsx-key": [
        "error",
        {
          checkFragmentShorthand: true,
        },
      ],
      "react/self-closing-comp": ["error"],
      "react/prefer-es6-class": ["error"],
      "react/prefer-stateless-function": ["warn"],
      "react/no-did-mount-set-state": ["error"],
      "react/no-did-update-set-state": ["error"],
      "react/jsx-filename-extension": [
        "warn",
        {
          extensions: [".mdx", ".jsx", ".tsx"],
        },
      ],
      "react/react-in-jsx-scope": ["off"],
      "react/jsx-sort-props": [
        "error",
        {
          callbacksLast: true,
          shorthandFirst: false,
          shorthandLast: true,
          ignoreCase: true,
          noSortAlphabetically: false,
          reservedFirst: true,
        },
      ],
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": hooksPlugin,
    },
  },
];
