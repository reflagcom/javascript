import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFlag, listFlags, listFlagValues } from "../services/flags.js";
import { authRequest } from "../utils/auth.js";

vi.mock("../utils/auth.js", () => ({ authRequest: vi.fn() }));
const request = vi.mocked(authRequest);
const enabled = {
  id: "enabled-id",
  key: "enabled",
  name: "Enabled",
  flagType: "boolean",
};
const settings = {
  id: "settings-id",
  key: "settings",
  name: "Settings",
  flagType: "multivariate",
};
function list(data: unknown[] = [enabled, settings]) {
  return {
    data,
    totalCount: data.length,
    pageIndex: 0,
    pageSize: data.length,
    sortBy: "key",
    sortOrder: "asc",
  };
}
function version(
  variants: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    flagId: "settings-id",
    flagType: "multivariate",
    versions: [
      {
        environment: { id: "production" },
        currentVersion: true,
        variants,
        ...overrides,
      },
    ],
  };
}

beforeEach(() => request.mockReset());

describe("v2 flag services", () => {
  it("lists both Boolean and multivariate flags from the canonical management API", async () => {
    request.mockResolvedValueOnce(list());
    expect((await listFlags("app", { envId: "production" })).data).toEqual([
      enabled,
      settings,
    ]);
    expect(request).toHaveBeenCalledWith("/apps/app/flags", {
      params: { envId: "production", sortBy: "key", sortOrder: "asc" },
    });
  });

  it("fetches current direct values only for multivariate flags in the selected environment", async () => {
    const values = {
      object: { model: "quality" },
      null: null,
      false: false,
      zero: 0,
      empty: "",
      array: [],
    };
    request
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(version(values));
    const result = await listFlagValues("app", "production");
    expect(result).toEqual([
      { key: "enabled", flagType: "boolean" },
      {
        key: "settings",
        flagType: "multivariate",
        values: Object.values(values),
      },
    ]);
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/apps/app/flags/settings-id/targeting",
      { params: { envId: "production" } },
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("preserves a missing current version as unknown multivariate data, not Boolean", async () => {
    request.mockResolvedValueOnce(list([settings])).mockResolvedValueOnce({
      flagId: "settings-id",
      flagType: "multivariate",
      versions: [],
    });
    expect(await listFlagValues("app", "production")).toEqual([
      { key: "settings", flagType: "multivariate", values: [] },
    ]);
  });

  it.each([
    version({ current: 3 }, { environment: { id: "staging" } }),
    version({ old: 3 }, { currentVersion: false }),
    { ...version({ current: 3 }), flagId: "another-flag" },
    {
      ...version({ current: 3 }),
      versions: [
        ...version({ current: 3 }).versions,
        ...version({ other: 4 }).versions,
      ],
    },
  ])(
    "rejects unexpected flag/environment/version identities",
    async (response) => {
      request
        .mockResolvedValueOnce(list([settings]))
        .mockResolvedValueOnce(response);
      await expect(listFlagValues("app", "production")).rejects.toThrow(
        "Unexpected current-version response",
      );
    },
  );

  it("rejects incomplete lists rather than silently generating a partial registry", async () => {
    request.mockResolvedValueOnce({ ...list(), totalCount: 3 });
    await expect(listFlagValues("app", "production")).rejects.toThrow(
      "incomplete flag list",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("propagates fetch failures without fabricating a Boolean schema", async () => {
    request
      .mockResolvedValueOnce(list([settings]))
      .mockRejectedValueOnce(new Error("Service unavailable"));
    await expect(listFlagValues("app", "production")).rejects.toThrow(
      "Service unavailable",
    );
  });

  it("rejects legacy remote-config variant wrappers", async () => {
    request.mockResolvedValueOnce(list([settings])).mockResolvedValueOnce({
      flagId: "settings-id",
      flagType: "multivariate",
      versions: [
        {
          environment: { id: "production" },
          currentVersion: true,
          variants: [{ variant: { payload: { model: "quality" } } }],
        },
      ],
    });
    await expect(listFlagValues("app", "production")).rejects.toThrow();
  });

  it("creates Boolean flags through the v2 management endpoint", async () => {
    request.mockResolvedValueOnce({ flag: enabled });
    expect(
      await createFlag("app", { key: "enabled", name: "Enabled" }),
    ).toEqual(enabled);
    expect(request).toHaveBeenCalledWith("/apps/app/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({
      source: "event",
      flagType: "boolean",
      key: "enabled",
      name: "Enabled",
    });
  });
});
