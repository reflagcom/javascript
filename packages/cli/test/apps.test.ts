import { input, select } from "@inquirer/prompts";
import { beforeEach, expect, it, vi } from "vitest";

import { authStore } from "../stores/auth.js";
import { configStore } from "../stores/config.js";
import { authRequest } from "../utils/auth.js";

vi.mock("../utils/auth.js", () => ({ authRequest: vi.fn() }));
vi.mock("@inquirer/prompts", () => ({ input: vi.fn(), select: vi.fn() }));
vi.mock("../stores/auth.js", () => ({ authStore: { getToken: vi.fn() } }));
vi.mock("../stores/config.js", () => ({
  configStore: {
    getConfig: vi.fn(),
    getConfigPath: vi.fn(),
    setConfig: vi.fn(),
    saveConfigFile: vi.fn(),
  },
}));

const orgs = [
  {
    id: "org-1",
    name: "First",
    featureKeyFormat: "kebabCaseLower",
    apps: [app("app-1")],
  },
  {
    id: "org-2",
    name: "Second",
    featureKeyFormat: "camelCase",
    apps: [app("app-2"), app("app-3")],
  },
  {
    id: "org-3",
    name: "Third",
    featureKeyFormat: "kebabCaseLower",
    apps: [app("app-4")],
  },
];

function app(id: string) {
  return {
    id,
    name: "App",
    demo: false,
    environments: [
      { id: `${id}-prod`, name: "Production", isProduction: true },
    ],
  };
}

const request = vi.mocked(authRequest);
const choose = vi.mocked(select);
let orgId: string | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  orgId = undefined;
  vi.mocked(authStore.getToken).mockReturnValue({
    token: "token",
    isApiKey: false,
  });
  vi.mocked(configStore.getConfig).mockImplementation((key) =>
    key === "orgId" ? orgId : "https://example.com",
  );
  request.mockResolvedValue({ data: orgs });
});

it("discovers apps across memberships and resolves an existing app ID without an org pin", async () => {
  const { getApp, listApps } = await import("../services/apps.js");

  expect(
    (await listApps()).map(({ name, id, org }) => [name, id, org.name]),
  ).toEqual([
    ["App", "app-1", "First"],
    ["App", "app-2", "Second"],
    ["App", "app-3", "Second"],
    ["App", "app-4", "Third"],
  ]);
  await expect(getApp("app-2")).resolves.toMatchObject({
    org: { id: "org-2", featureKeyFormat: "camelCase" },
    environments: [{ id: "app-2-prod" }],
  });
  expect(request).toHaveBeenCalledExactlyOnceWith("/orgs");
});

it("filters both app discovery and explicit app IDs to the selected org", async () => {
  orgId = "org-2";
  const { getApp, listApps } = await import("../services/apps.js");

  expect((await listApps()).map(({ id }) => id)).toEqual(["app-2", "app-3"]);
  await expect(getApp("app-1")).rejects.toThrow("in organization 'org-2'");
});

it("rejects an unknown or inaccessible org without falling back", async () => {
  orgId = "unavailable-org";
  const { listApps } = await import("../services/apps.js");
  await expect(listApps()).rejects.toThrow(
    "Organization 'unavailable-org' was not found or is not accessible",
  );
  expect(request).toHaveBeenCalledExactlyOnceWith("/orgs");
});

it("keeps API keys bound to their original app and organization", async () => {
  vi.mocked(authStore.getToken).mockReturnValue({
    token: "token",
    isApiKey: true,
  });
  request.mockResolvedValue({ org: { ...orgs[1], apps: [orgs[1].apps[1]] } });
  const { getApp, listApps } = await import("../services/apps.js");

  expect((await listApps()).map(({ id }) => id)).toEqual(["app-3"]);
  await expect(getApp("app-2")).rejects.toThrow(
    "App 'app-2' was not found or is not accessible",
  );
  orgId = "org-1";
  await expect(listApps()).rejects.toThrow(
    "Organization 'org-1' was not found or is not accessible",
  );
  expect(request).toHaveBeenCalledExactlyOnceWith("/bootstrap");
});

function mockConfigCreation() {
  vi.mocked(configStore.saveConfigFile).mockImplementation(async () => {
    vi.mocked(configStore.getConfigPath).mockReturnValue("reflag.config.json");
  });
  vi.mocked(input).mockResolvedValue("gen/flags.d.ts");
}

it("prompts for an org and then shows only its apps during init", async () => {
  mockConfigCreation();
  choose
    .mockResolvedValueOnce(orgs[1])
    .mockResolvedValueOnce("app-3")
    .mockResolvedValueOnce("react");
  const { initAction } = await import("../commands/init.js");

  await initAction();

  expect(choose).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      message: "Select an organization",
      choices: orgs.map((org) => ({
        name: `${org.name} (${org.id})`,
        value: org,
      })),
    }),
  );
  expect(choose).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      message: "Select an app in Second",
      choices: [
        { name: "App (app-2)", value: "app-2" },
        { name: "App (app-3)", value: "app-3" },
      ],
    }),
  );
  expect(configStore.setConfig).toHaveBeenCalledWith({
    appId: "app-3",
    typesOutput: [{ path: "gen/flags.d.ts", format: "react" }],
  });
});

it.each([false, true])(
  "skips the org prompt in a one-org scope (pinned: %s)",
  async (pinned) => {
    mockConfigCreation();
    if (pinned) orgId = "org-2";
    else request.mockResolvedValue({ data: [orgs[1]] });
    choose.mockResolvedValueOnce("app-2").mockResolvedValueOnce("react");
    const { initAction } = await import("../commands/init.js");

    await initAction();

    expect(choose).toHaveBeenCalledTimes(2);
    expect(choose).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: "Select an app in Second" }),
    );
  },
);

it("accepts an explicit app ID at init without either picker", async () => {
  mockConfigCreation();
  choose.mockResolvedValueOnce("react");
  const { initAction } = await import("../commands/init.js");

  await initAction({ appId: "app-4" });

  expect(choose).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: "What is the output format?",
    }),
  );
  expect(configStore.setConfig).toHaveBeenCalledWith(
    expect.objectContaining({ appId: "app-4" }),
  );
});
