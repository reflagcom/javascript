const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
const outFile = path.join(distDir, "index.native.js");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const contents = `"use strict";\nmodule.exports = require("./reflag-browser-sdk.umd.js");\n`;
fs.writeFileSync(outFile, contents);

console.log("Wrote", outFile);
