const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const { createRequire } = require("node:module");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const from = (name) => createRequire(require.resolve(name));

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dependency-compat-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("glob overrides retain async, sync, ignore and abort APIs", async (t) => {
  const directory = await temporaryDirectory(t);
  await fs.mkdir(path.join(directory, "nested"));
  await fs.writeFile(path.join(directory, "entry.ts"), "");
  await fs.writeFile(path.join(directory, "nested", "ignored.ts"), "");
  const { glob, globSync } = from("@expo/config")("glob");
  const options = { cwd: directory, ignore: ["nested/**"] };
  assert.deepEqual(await glob("**/*.ts", options), ["entry.ts"]);
  assert.deepEqual(globSync("**/*.ts", options), ["entry.ts"]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    glob("**/*", { cwd: directory, signal: controller.signal }),
    {
      name: "AbortError",
    },
  );
});

test("minimatch overrides retain the named function and compiled matcher APIs", () => {
  for (const parent of ["lerna", "nx", "typedoc", "@microsoft/api-extractor"]) {
    const { minimatch, Minimatch } = from(parent)("minimatch");
    assert.equal(minimatch("src/example.ts", "**/*.{js,ts}"), true, parent);
    assert.equal(minimatch("src/.hidden.ts", "**/*.ts"), false, parent);
    assert.equal(
      new Minimatch("**/*.TS", { nocase: true }).match("src/example.ts"),
      true,
      parent,
    );
  }
});

test("TypeDoc directory discovery supports the current minimatch API", async (t) => {
  const directory = await temporaryDirectory(t);
  await fs.mkdir(path.join(directory, "nested", "node_modules"), {
    recursive: true,
  });
  const expected = path.join(directory, "nested", "entry.ts");
  await fs.writeFile(expected, "");
  await fs.writeFile(
    path.join(directory, "nested", "node_modules", "ignored.ts"),
    "",
  );
  const utility = path.join(
    path.dirname(require.resolve("typedoc")),
    "lib/utils/fs.js",
  );
  const { glob } = await import(pathToFileURL(utility).href);
  assert.deepEqual(glob(`${directory}/**/*.ts`, directory), [expected]);
});

test("RN CLI uses the private merge implementation and preserves array replacement", () => {
  const cliRequire = from("@react-native-community/cli-config");
  assert.equal(
    cliRequire("deepmerge"),
    require("../tools/deepmerge/index.cjs"),
  );
  const { default: merge } = cliRequire("./merge.js");
  assert.deepEqual(
    merge(
      { platforms: ["ios"], config: { enabled: true } },
      { platforms: ["android"], config: { count: 2 } },
    ),
    { platforms: ["android"], config: { enabled: true, count: 2 } },
  );
});

test("Expo config modifications use the private merge implementation", async (t) => {
  const directory = await temporaryDirectory(t);
  await fs.writeFile(
    path.join(directory, "package.json"),
    '{"name":"config-fixture","version":"1.0.0"}',
  );
  await fs.writeFile(
    path.join(directory, "app.json"),
    JSON.stringify({
      expo: {
        name: "Fixture",
        slug: "fixture",
        sdkVersion: "54.0.0",
        extra: { first: 1 },
      },
    }),
  );
  const expoRequire = from("@expo/config");
  assert.equal(
    expoRequire("deepmerge"),
    require("../tools/deepmerge/index.cjs"),
  );
  const { modifyConfigAsync } = require("@expo/config");
  await modifyConfigAsync(directory, { extra: { second: 2 } });
  const config = JSON.parse(
    await fs.readFile(path.join(directory, "app.json"), "utf8"),
  );
  assert.deepEqual(config.expo.extra, { first: 1, second: 2 });
});

test("updated native CLI XML parser reads the checked-in Android manifest", async () => {
  const { XMLParser } = from("@react-native-community/cli-config-android")(
    "fast-xml-parser",
  );
  const xml = await fs.readFile(
    path.join(
      __dirname,
      "../packages/react-native-sdk/dev/bare-rn/android/app/src/main/AndroidManifest.xml",
    ),
    "utf8",
  );
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  assert.equal(
    parsed.manifest["@_xmlns:android"],
    "http://schemas.android.com/apk/res/android",
  );
  assert.ok(parsed.manifest.application);
});

test("xcode retains UUID generation and project parse/write compatibility", async (t) => {
  const xcode = require("xcode");
  const directory = await temporaryDirectory(t);
  const original = path.join(
    __dirname,
    "../packages/react-native-sdk/dev/bare-rn/ios/ReflagBareRnSmoke.xcodeproj/project.pbxproj",
  );
  const project = xcode.project(original);
  project.parseSync();
  const ids = new Set(Array.from({ length: 50 }, () => project.generateUuid()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
  const output = path.join(directory, "project.pbxproj");
  await fs.writeFile(output, project.writeSync());
  const roundTrip = xcode.project(output);
  roundTrip.parseSync();
  assert.deepEqual(roundTrip.hash.project, project.hash.project);
});

test("FTP listing parser handles files, links and adversarial owner/group input", () => {
  const ftpRequire = from("get-uri");
  const parserPath = ftpRequire.resolve("basic-ftp/dist/parseListUnix.js");
  const { parseLine } = ftpRequire("basic-ftp/dist/parseListUnix.js");
  const file = parseLine("-rw-r--r-- 1 user group 42 Jan 01 2026 example.txt");
  assert.equal(file.name, "example.txt");
  assert.equal(file.size, 42);
  assert.equal(file.isFile, true);
  const link = parseLine(
    "lrwxrwxrwx 1 user group 4 Jan 01 2026 shortcut -> example.txt",
  );
  assert.equal(link.isSymbolicLink, true);
  assert.equal(link.link, "example.txt");
  // An isolated process makes this a hard timeout even if a regex blocks its event loop.
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    const { parseLine } = require(${JSON.stringify(parserPath)});
    assert.equal(parseLine('-rw-r--r-- 1 ' + 'owner '.repeat(20000) + '!'), undefined);
  `,
    ],
    { encoding: "utf8", timeout: 3000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

// Offline FTP fixture exercises the real get-uri -> basic-ftp access/download
// integration and LIST data connection, not just parser exports.
async function ftpFixture(t) {
  const sockets = new Set();
  const dataServers = new Set();
  const contents = "dependency compatibility fixture\n";
  const downloadClosed = Promise.withResolvers();
  const server = net.createServer((control) => {
    let downloaded = false;
    sockets.add(control);
    control.on("close", () => {
      sockets.delete(control);
      if (downloaded) downloadClosed.resolve();
    });
    control.setEncoding("utf8");
    control.write("220 Fixture ready\r\n");
    let buffer = "";
    let dataConnection;
    let commands = Promise.resolve();
    async function command(line) {
      const name = line.split(" ")[0];
      if (name === "USER") control.write("230 Logged in\r\n");
      else if (["TYPE", "OPTS", "CWD"].includes(name))
        control.write("200 OK\r\n");
      else if (name === "MDTM") control.write("213 20260101000000\r\n");
      else if (name === "EPSV") {
        const dataServer = net.createServer();
        dataServers.add(dataServer);
        dataConnection = once(dataServer, "connection").then(([socket]) => {
          sockets.add(socket);
          socket.on("close", () => sockets.delete(socket));
          return socket;
        });
        dataServer.listen(0, "127.0.0.1");
        await once(dataServer, "listening");
        control.write(
          `229 Entering Extended Passive Mode (|||${dataServer.address().port}|)\r\n`,
        );
      } else if (["LIST", "RETR"].includes(name)) {
        if (name === "RETR") downloaded = true;
        control.write("150 Opening data connection\r\n");
        const socket = await dataConnection;
        socket.end(
          name === "LIST"
            ? "-rw-r--r-- 1 user group 33 Jan 01 2026 example.txt\r\n"
            : contents,
        );
        await once(socket, "close");
        control.write("226 Transfer complete\r\n");
      } else if (name === "QUIT") control.end("221 Goodbye\r\n");
      else control.write("502 Unsupported command\r\n");
    }
    control.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        commands = commands.then(() => command(line));
      }
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      [server, ...dataServers].map(
        (item) => new Promise((resolve) => item.close(resolve)),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    port: server.address().port,
    contents,
    downloadClosed: downloadClosed.promise,
  };
}

test(
  "basic-ftp and get-uri can list and retrieve from a local FTP server",
  { timeout: 10000 },
  async (t) => {
    const { port, contents, downloadClosed } = await ftpFixture(t);
    const { Client } = from("get-uri")("basic-ftp");
    const client = new Client(3000);
    t.after(() => client.close());
    await client.access({ host: "127.0.0.1", port });
    const listing = await client.list();
    assert.equal(listing[0].name, "example.txt");
    client.close();
    const { getUri } = require("get-uri");
    const stream = await getUri(new URL(`ftp://127.0.0.1:${port}/example.txt`));
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), contents);
    await downloadClosed;
  },
);
