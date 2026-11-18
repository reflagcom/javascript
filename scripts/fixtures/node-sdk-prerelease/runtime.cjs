const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { createRequire } = require("node:module");
const { ReflagClient } = require("@reflag/node-sdk");

const version = process.argv[2];
const sdkRequire = createRequire(require.resolve("@reflag/node-sdk"));
assert.equal(require("@reflag/node-sdk/package.json").version, version);
assert.equal(
  sdkRequire("@reflag/flag-evaluation/package.json").version,
  "2.0.0",
);
for (const key of Object.keys(process.env))
  if (key.startsWith("REFLAG_")) delete process.env[key];

function flag(key, value) {
  return {
    key,
    sourceVersionId: `version:${key}`,
    variants: { selected: value },
    rules: [
      {
        id: `rule:${key}`,
        filter: { type: "constant", value: true },
        result: { type: "variant", variantKey: "selected" },
      },
    ],
  };
}
const events = [];
const requests = [];
const noop = () => undefined;
const server = createServer(async (request, response) => {
  try {
    requests.push({
      path: request.url,
      version: request.headers["reflag-sdk-version"],
    });
    response.setHeader("content-type", "application/json");
    if (request.url === "/flags") {
      response.end(
        JSON.stringify({
          success: true,
          protocolVersion: 2,
          flagStateVersion: 42,
          segments: [],
          flags: [
            flag("enabled", true),
            flag("settings", { model: "quality", limits: { maxItems: 0 } }),
            flag("false", false),
            flag("zero", 0),
            flag("empty", ""),
            flag("nullable", null),
          ],
        }),
      );
    } else if (request.url === "/bulk") {
      let body = "";
      for await (const chunk of request) body += chunk;
      events.push(...JSON.parse(body));
      response.end(JSON.stringify({ success: true }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ success: false }));
    }
  } catch (error) {
    response.statusCode = 500;
    response.end(JSON.stringify({ success: false }));
    console.error(error);
  }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new ReflagClient({
    secretKey: "prereleaseFixtureSecretMoreThan22Chars",
    apiBaseUrl: `http://127.0.0.1:${server.address().port}/`,
    offline: false,
    flagsSyncMode: "in-request",
    flagsFetchRetries: 0,
    batchOptions: { flushOnExit: false, intervalMs: 1000000 },
    logger: { debug: noop, info: noop, warn: noop, error: noop },
  });
  try {
    await client.initialize();
    assert.equal(client.getFlag({}, "enabled"), true);
    const settings = client.getFlag({}, "settings", {
      model: "quick",
      limits: { maxItems: 10 },
    });
    assert.deepEqual(settings, { model: "quality", limits: { maxItems: 0 } });
    settings.limits.maxItems = 99;
    assert.equal(
      client.getFlag({}, "settings", {
        model: "quick",
        limits: { maxItems: 10 },
      }).limits.maxItems,
      0,
    );
    assert.equal(client.getFlag({}, "settings"), false);
    assert.equal(client.getFlag({}, "false", true), false);
    assert.equal(client.getFlag({}, "zero", 99), 0);
    assert.equal(client.getFlag({}, "empty", "fallback"), "");
    assert.equal(client.getFlag({}, "nullable", null), null);
    assert.equal(client.getFlag({}, "missing"), false);
    await client.flush();
    const checksBeforeBootstrap = events.length;
    assert.equal(client.getFlagsForBootstrap({}).protocolVersion, 2);
    await client.flush();
    assert.equal(events.length, checksBeforeBootstrap);
    assert.ok(
      requests.some(
        (request) =>
          request.path === "/flags" &&
          request.version === `node-sdk/${version}`,
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.action === "check" &&
          event.key === "enabled" &&
          event.sourceVersionId === "version:enabled" &&
          event.evalResult === "selected",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.action === "check" &&
          event.key === "missing" &&
          !Object.hasOwn(event, "evalResult"),
      ),
    );
    console.log(
      `Installed ${version}: direct values, defaults, copies, v2 transport, root checks and version header passed`,
    );
  } finally {
    client.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
