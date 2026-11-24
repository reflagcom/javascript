import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "reflag-generated-types-"));
const require = createRequire(join(root, "package.json"));
const ts = require("typescript");
const { genTypes } = await import(join(root, "packages/cli/dist/utils/gen.js"));
const fixtures = [
  { key: "enabled", flagType: "boolean" },
  {
    key: "settings",
    flagType: "multivariate",
    values: [
      {
        model: "quick",
        prompt: { tone: "concise" },
        methods: ["standard"],
        maxTokens: 512,
      },
      {
        model: "quality",
        prompt: { tone: "detailed" },
        methods: [],
        maxTokens: 0,
      },
    ],
  },
  { key: "days", flagType: "multivariate", values: [0, 3] },
  { key: "label", flagType: "multivariate", values: ["", "Express"] },
  { key: "methods", flagType: "multivariate", values: [[], ["standard"]] },
  {
    key: "nullable",
    flagType: "multivariate",
    values: [null, { tokens: 128 }],
  },
  { key: "draft", flagType: "multivariate", values: [] },
  { key: "empty", flagType: "multivariate", values: [{}] },
];
const paths = {};
for (const sdk of ["node", "react", "vue", "browser"]) {
  const dir = join(root, `packages/${sdk}-sdk`);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  paths[`@reflag/${sdk}-sdk`] = [join(dir, pkg.types)];
}
const results = [];
for (const format of ["node", "react", "vue"]) {
  const dir = join(temporary, format);
  mkdirSync(dir, { recursive: true });
  const gen = join(dir, "flags.d.ts");
  writeFileSync(gen, genTypes(fixtures, format));
  const call = (args) =>
    `${format === "node" ? "bound.getFlag" : "useFlag"}(${args})`;
  const setup =
    format === "node"
      ? `import { ReflagClient, type FlagValue } from '@reflag/node-sdk';
 declare const client:ReflagClient;const bound=client.bindClient({});`
      : `import { useFlag, type FlagValue ${format === "react" ? ", useFlagSuspense" : ""} } from '@reflag/${format}-sdk';`;
  const value = format === "vue" ? ".value" : "";
  const contents = `${setup}
 interface Prompt {tone:string;}
 interface Settings {model:string;prompt:Prompt;methods:string[];maxTokens:number;}
 const fallback:Settings={model:'quick',prompt:{tone:'concise'},methods:['standard'],maxTokens:512};
 const result=${call('"settings",fallback')};
 result${value}.model='quality';result${value}.prompt.tone='detailed';result${value}.methods.push('express');
 const frozen=${call('"settings",{model:"quick",prompt:{tone:"concise"},methods:["standard"],maxTokens:512} as const')};
 frozen${value}.model='quality';frozen${value}.methods.push('express');
 const bare:boolean=${call('"settings"')}${value};
 const explicitUndefined:boolean=${call('"settings",undefined')}${value};
 const raw:FlagValue=${call('"settings",null')}${value};
 const nullable:FlagValue=${call('"nullable",null')}${value};
 const days:number=${call('"days",0')}${value};
 const methods:string[]=${call('"methods",[] as string[]')}${value};
 const draft=${call('"draft",{model:"quick"}')};
 const empty=${call('"empty",{model:"quick"}')};
 // @ts-expect-error unknown keys reject
 ${call('"missing",false')};
 // @ts-expect-error wrong top-level category rejects, even with a numeric flag elsewhere
 ${call('"settings",3')};
 // @ts-expect-error incomplete defaults reject
 ${call('"settings",{model:"quick"}')};
 // @ts-expect-error wrong nested properties reject
 ${call('"settings",{...fallback,prompt:{tone:3}}')};
 // @ts-expect-error array elements reject
 ${call('"methods",[123]')};
 // @ts-expect-error scalar category rejects
 ${call('"label",123')};
 // @ts-expect-error old wrappers reject
 result${value}.config.payload;
 ${
   format === "node"
     ? `
 const remote:Promise<Settings>=client.getFlagRemote('settings',fallback);
 const boundRemote:Promise<Settings>=bound.getFlagRemote('settings',fallback);
 // @ts-expect-error root reads check schemas
 client.getFlag({},'settings',123);
 // @ts-expect-error remote reads check schemas
 client.getFlagRemote('settings',123);
 `
     : format === "react"
       ? `
 const ready:Settings=useFlagSuspense('settings',fallback);
 // @ts-expect-error Suspense reads check schemas
 useFlagSuspense('settings',123);
 `
       : ""
 }
 `;
  const consumer = join(dir, "consumer.mts");
  writeFileSync(consumer, contents);
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.ReactJSX,
    baseUrl: root,
    paths,
  };
  const program = ts.createProgram([gen, consumer], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  results.push({
    format,
    diagnostics: diagnostics.map((d) => ({
      code: d.code,
      file: d.file?.fileName,
      line:
        d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
          : undefined,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    })),
  });
}
rmSync(temporary, { recursive: true, force: true });
for (const result of results) {
  if (result.diagnostics.length) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(
      `${result.format}: generated declarations and registered-default checks passed`,
    );
  }
}
