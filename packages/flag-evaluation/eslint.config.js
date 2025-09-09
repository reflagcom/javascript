const base = require("@reflag/eslint-config");

module.exports = [...base, { ignores: ["dist/"] }];
