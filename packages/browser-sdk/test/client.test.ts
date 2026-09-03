import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReflagClient } from "../src/client";
import { FlagsClient } from "../src/flag/flags";
import { HttpClient } from "../src/httpClient";
import { deferred } from "./deferred";
import { flagsResult } from "./mocks/handlers";
import { server } from "./mocks/server";

function optInFlags(userOptedIn: boolean, targetingVersion = 1) {
  return {
    optInFlag: {
      key: "optInFlag",
      isEnabled: userOptedIn,
      targetingVersion,
      optInEnabled: true,
      optIn: {
        userOptedIn,
        companyOptedIn: false,
        isOptedIn: userOptedIn,
        name: "Opt-in flag",
        description: null,
      },
    },
  };
}

function optInEvaluationResponse(
  flagStateVersion: number,
  userOptedIn: boolean,
) {
  return HttpResponse.json({
    success: true,
    flagStateVersion,
    features: optInFlags(userOptedIn, flagStateVersion),
  });
}

describe("ReflagClient", () => {
  let client: ReflagClient;
  const httpClientPost = vi.spyOn(HttpClient.prototype as any, "post");
  const httpClientGet = vi.spyOn(HttpClient.prototype as any, "get");

  const flagClientSetContext = vi.spyOn(FlagsClient.prototype, "setContext");

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    client = new ReflagClient({
      publishableKey: "test-key",
      user: { id: "user1" },
      company: { id: "company1" },
      trackingQueue: {
        flushDelayMs: 0,
      },
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await client.stop();
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  describe("updateUser", () => {
    it("should update the user context", async () => {
      // and send new user data and trigger flag update
      const updatedUser = { name: "New User" };

      await client.updateUser(updatedUser);

      expect(client["context"].user).toEqual({ id: "user1", ...updatedUser });
      await vi.waitFor(() =>
        expect(httpClientPost).toHaveBeenCalledWith({
          path: "/bulk",
          keepalive: true,
          body: [
            {
              type: "user",
              userId: "user1",
              attributes: { name: updatedUser.name },
            },
          ],
        }),
      );
      expect(flagClientSetContext).toHaveBeenCalledWith(client["context"]);
    });

    it("does not warn about a missing company when updating a user-only context", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-user-only",
        user: { id: "user1" },
      });
      const warnSpy = vi.spyOn(client.logger, "warn");

      await client.updateUser({ name: "Updated User" });

      expect(warnSpy).not.toHaveBeenCalledWith(
        "No company Id provided in context, company will be ignored",
      );
    });

    it("starts flushing the user update before refetching flags without waiting for it", async () => {
      const requests: string[] = [];
      let bulkResolved = false;
      let resolveBulk: ((response: HttpResponse) => void) | undefined;
      const bulkResponse = new Promise<HttpResponse>((resolve) => {
        resolveBulk = (response) => {
          bulkResolved = true;
          resolve(response);
        };
      });

      server.use(
        http.post("https://front.reflag.com/bulk", async ({ request }) => {
          requests.push("bulk");
          const data = await request.json();
          const userEvent = Array.isArray(data)
            ? data.find((event) => event?.type === "user")
            : undefined;
          expect(userEvent?.attributes?.siteCentricOptIn).toBe("true");

          return bulkResponse;
        }),
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            requests.push("flags");
            const url = new URL(request.url);
            expect(
              JSON.parse(url.searchParams.get("contextJson") ?? "{}").user
                .siteCentricOptIn,
            ).toBe("true");

            return HttpResponse.json({
              success: true,
              features: {
                SITE_CENTRIC: {
                  key: "SITE_CENTRIC",
                  isEnabled: true,
                  targetingVersion: 1,
                },
              },
            });
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-user-update-before-flags",
        user: { id: "user1" },
        bootstrappedFlags: {
          SITE_CENTRIC: {
            key: "SITE_CENTRIC",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
        trackingQueue: {
          flushDelayMs: 2_000,
        },
      });
      await client.initialize();

      const updatePromise = client.updateUser({ siteCentricOptIn: "true" });

      try {
        await vi.waitFor(() => expect(requests).toEqual(["bulk", "flags"]));

        let updateResolved = false;
        void updatePromise.then(() => {
          updateResolved = true;
        });
        await vi.waitFor(() => expect(updateResolved).toBe(true));
        expect(bulkResolved).toBe(false);
      } finally {
        resolveBulk?.(HttpResponse.json({ success: true }));
        await updatePromise;
      }
    });
  });

  describe("updateCompany", () => {
    it("should update the company context", async () => {
      // send new company data and trigger flag update
      const updatedCompany = { name: "New Company" };

      await client.updateCompany(updatedCompany);

      expect(client["context"].company).toEqual({
        id: "company1",
        ...updatedCompany,
      });
      await vi.waitFor(() =>
        expect(httpClientPost).toHaveBeenCalledWith({
          path: "/bulk",
          keepalive: true,
          body: [
            {
              type: "company",
              userId: "user1",
              companyId: "company1",
              attributes: { name: updatedCompany.name },
            },
          ],
        }),
      );
      expect(flagClientSetContext).toHaveBeenCalledWith(client["context"]);
    });

    it("starts flushing the company update before refetching flags", async () => {
      const requests: string[] = [];
      let resolveCompanyPlan: ((plan: unknown) => void) | undefined;
      const companyPlan = new Promise<unknown>((resolve) => {
        resolveCompanyPlan = resolve;
      });

      server.use(
        http.post("https://front.reflag.com/bulk", async ({ request }) => {
          requests.push("bulk");
          const data = await request.json();
          const companyEvent = Array.isArray(data)
            ? data.find((event) => event?.type === "company")
            : undefined;
          resolveCompanyPlan?.(companyEvent?.attributes?.plan);

          return HttpResponse.json({ success: true });
        }),
        http.get("https://front.reflag.com/features/evaluated", () => {
          requests.push("flags");
          return HttpResponse.json({
            success: true,
            features: {},
          });
        }),
      );

      client = new ReflagClient({
        publishableKey: "test-key-company-update-before-flags",
        user: { id: "user1" },
        company: { id: "company1" },
        bootstrappedFlags: {},
        trackingQueue: {
          flushDelayMs: 2_000,
        },
      });
      await client.initialize();

      await client.updateCompany({ plan: "enterprise" });

      expect(requests).toEqual(["bulk", "flags"]);
      await expect(companyPlan).resolves.toBe("enterprise");
    });
  });

  describe("getFlag", () => {
    it("takes overrides into account", async () => {
      await client.initialize();
      expect(flagsResult["flagA"].isEnabled).toBe(true);
      expect(client.getFlag("flagA").isEnabled).toBe(true);
      client.getFlag("flagA").setIsEnabledOverride(false);
      expect(client.getFlag("flagA").isEnabled).toBe(false);
    });
  });

  describe("opt-in", () => {
    it("lists opt-in-enabled flags for the current context", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-opt-in-list",
        user: { id: "user1" },
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
            optInEnabled: true,
            optIn: {
              userOptedIn: false,
              companyOptedIn: true,
              isOptedIn: true,
              name: "Opt-in flag",
              description: "Try it early",
            },
          },
          notOptInFlag: {
            key: "notOptInFlag",
            isEnabled: true,
            targetingVersion: 2,
            optInEnabled: false,
            optIn: null,
          },
          hardOffFlag: {
            key: "hardOffFlag",
            isEnabled: false,
            targetingVersion: 3,
            optInEnabled: true,
            optIn: null,
          },
        },
      });
      await client.initialize();

      expect(client.getOptInFlags()).toEqual([
        {
          key: "optInFlag",
          name: "Opt-in flag",
          description: "Try it early",
          isEnabled: false,
          userOptedIn: false,
          companyOptedIn: true,
          isOptedIn: true,
        },
      ]);
    });

    it("refreshes missing opt-in metadata on demand after bootstrapping", async () => {
      server.use(
        http.get("https://front.reflag.com/features/evaluated", () =>
          optInEvaluationResponse(2, false),
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-bootstrap-opt-in-metadata",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
      });

      await client.initialize();
      expect(httpClientGet).not.toHaveBeenCalled();

      expect(client.getOptInFlags()).toEqual([]);
      await vi.waitFor(() => {
        expect(client.getOptInFlags()).toEqual([
          {
            key: "optInFlag",
            name: "Opt-in flag",
            description: null,
            isEnabled: false,
            userOptedIn: false,
            companyOptedIn: false,
            isOptedIn: false,
          },
        ]);
      });
      expect(httpClientGet).toHaveBeenCalledTimes(1);
    });

    it("reports opt-in flags as loading during the initial flag fetch", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-initial-opt-in-loading",
        user: { id: "user1" },
        enableTracking: false,
      });

      expect(client.getIsLoadingOptInFlags()).toBe(true);
      await client.initialize();
      expect(client.getIsLoadingOptInFlags()).toBe(false);
    });

    it("reports complete bootstrapped opt-in metadata as ready immediately", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-complete-bootstrap-opt-in-metadata",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: optInFlags(false),
      });

      expect(client.getIsLoadingOptInFlags()).toBe(false);
      await client.initialize();
      expect(client.getIsLoadingOptInFlags()).toBe(false);
      expect(httpClientGet).not.toHaveBeenCalled();
    });

    it("reports missing bootstrapped opt-in metadata as loading until refresh succeeds", async () => {
      const response = deferred<HttpResponse>();
      server.use(
        http.get(
          "https://front.reflag.com/features/evaluated",
          () => response.promise,
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-loading-bootstrap-opt-in-metadata",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
      });
      const loadingUpdated = vi.fn();
      client.on("optInFlagsLoadingUpdated", loadingUpdated);

      await client.initialize();
      expect(client.getIsLoadingOptInFlags()).toBe(true);
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(1));

      response.resolve(optInEvaluationResponse(2, false));

      await vi.waitFor(() => {
        expect(client.getIsLoadingOptInFlags()).toBe(false);
      });
      expect(client.getOptInFlags()).toHaveLength(1);
      expect(loadingUpdated).toHaveBeenCalledWith(true);
      expect(loadingUpdated).toHaveBeenLastCalledWith(false);
    });

    it("stops loading opt-in flags when the metadata refresh fails", async () => {
      server.use(
        http.get("https://front.reflag.com/features/evaluated", () =>
          HttpResponse.json({ success: false }, { status: 500 }),
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-failed-bootstrap-opt-in-metadata",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
      });

      await client.initialize();
      expect(client.getIsLoadingOptInFlags()).toBe(true);

      await vi.waitFor(() => {
        expect(client.getIsLoadingOptInFlags()).toBe(false);
      });
      expect(httpClientGet).toHaveBeenCalledTimes(1);
      expect(client.getOptInFlags()).toEqual([]);
    });

    it("keeps opt-in loading tied to the newest context fetch", async () => {
      const previousContextResponse = deferred<HttpResponse>();
      const currentContextResponse = deferred<HttpResponse>();
      const previousContextSettled = vi.fn();

      server.use(
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            const contextJson = new URL(request.url).searchParams.get(
              "contextJson",
            );
            const userId = contextJson
              ? JSON.parse(contextJson).user?.id
              : undefined;
            if (userId === "user1") {
              return previousContextResponse.promise.then((response) => {
                previousContextSettled();
                return response;
              });
            }
            return currentContextResponse.promise;
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-opt-in-loading-context-race",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
      });
      await client.initialize();

      expect(client.getIsLoadingOptInFlags()).toBe(true);
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(1));

      const contextUpdate = client.setContext({ user: { id: "user2" } });
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(2));

      previousContextResponse.resolve(optInEvaluationResponse(2, false));
      await vi.waitFor(() => expect(previousContextSettled).toHaveBeenCalled());
      expect(client.getIsLoadingOptInFlags()).toBe(true);

      currentContextResponse.resolve(optInEvaluationResponse(3, true));
      await contextUpdate;

      expect(client.getIsLoadingOptInFlags()).toBe(false);
      expect(client.getContext().user?.id).toBe("user2");
      expect(client.getOptInFlags()[0]).toMatchObject({
        userOptedIn: true,
      });
    });

    it("uses newly applied bootstrapped metadata and ignores a stale refresh", async () => {
      const staleResponse = deferred<HttpResponse>();
      const staleResponseSettled = vi.fn();
      server.use(
        http.get("https://front.reflag.com/features/evaluated", () =>
          staleResponse.promise.then((response) => {
            staleResponseSettled();
            return response;
          }),
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-applied-bootstrap-opt-in-metadata",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
      });
      await client.initialize();

      expect(client.getIsLoadingOptInFlags()).toBe(true);
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(1));

      client.applyBootstrappedState({
        context: { user: { id: "user2" } },
        flags: optInFlags(true, 3),
        flagStateVersion: 3,
      });

      expect(client.getIsLoadingOptInFlags()).toBe(false);
      expect(client.getOptInFlags()[0]).toMatchObject({
        userOptedIn: true,
      });

      staleResponse.resolve(optInEvaluationResponse(2, false));
      await vi.waitFor(() => expect(staleResponseSettled).toHaveBeenCalled());
      await vi.waitFor(() =>
        expect(client["flagsClient"]["optInMetadataRefresh"]).toBeUndefined(),
      );

      expect(client.getIsLoadingOptInFlags()).toBe(false);
      expect(client.getOptInFlags()[0]).toMatchObject({
        userOptedIn: true,
      });
    });

    it("does not leave missing opt-in metadata loading while offline", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-offline-bootstrap-opt-in-metadata",
        user: { id: "user1" },
        enableTracking: false,
        offline: true,
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
          },
        },
      });

      expect(client.getIsLoadingOptInFlags()).toBe(true);
      await client.initialize();
      expect(client.getIsLoadingOptInFlags()).toBe(false);
      expect(httpClientGet).not.toHaveBeenCalled();
    });

    it("waits for the bootstrapped flag state version when refreshing opt-in metadata", async () => {
      let requestedWaitForVersion: string | null = null;
      server.use(
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            requestedWaitForVersion = new URL(request.url).searchParams.get(
              "waitForVersion",
            );

            return optInEvaluationResponse(
              requestedWaitForVersion === "2" ? 2 : 1,
              false,
            );
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-versioned-bootstrap-opt-in-metadata",
        enableTracking: false,
        bootstrappedState: {
          context: { user: { id: "user1" } },
          flags: {
            optInFlag: {
              key: "optInFlag",
              isEnabled: false,
              targetingVersion: 1,
            },
          },
          flagStateVersion: 2,
        },
      });

      await client.initialize();
      expect(client.getOptInFlags()).toEqual([]);

      await vi.waitFor(() => {
        expect(client.getOptInFlags()).toHaveLength(1);
      });
      expect(requestedWaitForVersion).toBe("2");
    });

    it("posts opt-in requests and refreshes flags at the returned state version", async () => {
      const flagsUpdated = vi.fn();
      const requests: string[] = [];

      server.use(
        http.post(
          "https://front.reflag.com/flags/opt-in",
          async ({ request }) => {
            requests.push("set-opt-in");
            expect(await request.json()).toMatchObject({
              key: "optInFlag",
              optedIn: true,
              scope: "user",
              context: {
                user: { id: "user1" },
                company: { id: "company1" },
              },
            });

            return HttpResponse.json({ success: true, flagStateVersion: 7 });
          },
        ),
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            requests.push("flags");
            const url = new URL(request.url);
            expect(url.searchParams.get("waitForVersion")).toBe("7");

            return HttpResponse.json({
              success: true,
              flagStateVersion: 7,
              features: {
                optInFlag: {
                  key: "optInFlag",
                  isEnabled: true,
                  targetingVersion: 2,
                  optInEnabled: true,
                  optIn: {
                    userOptedIn: true,
                    companyOptedIn: false,
                    isOptedIn: true,
                    name: "Opt-in flag",
                    description: "Try it early",
                  },
                },
              },
            });
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-opt-in",
        user: { id: "user1" },
        company: { id: "company1" },
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
            optInEnabled: true,
            optIn: {
              userOptedIn: false,
              companyOptedIn: false,
              isOptedIn: false,
              name: "Opt-in flag",
              description: "Try it early",
            },
          },
        },
      });
      client.on("flagsUpdated", flagsUpdated);
      await client.initialize();
      flagsUpdated.mockClear();

      const response = await client.setOptIn("optInFlag", { optedIn: true });

      expect(response?.ok).toBe(true);
      await expect(response!.json()).resolves.toEqual({
        success: true,
        flagStateVersion: 7,
      });
      expect(requests).toEqual(["set-opt-in", "flags"]);
      expect(client.getOptInFlags()).toEqual([
        {
          key: "optInFlag",
          name: "Opt-in flag",
          description: "Try it early",
          isEnabled: true,
          userOptedIn: true,
          companyOptedIn: false,
          isOptedIn: true,
        },
      ]);
      expect(flagsUpdated).toHaveBeenCalledTimes(1);
    });

    it("cancels opt-in and refreshes flags at the returned state version", async () => {
      const requests: string[] = [];

      server.use(
        http.post(
          "https://front.reflag.com/flags/opt-in",
          async ({ request }) => {
            requests.push("cancel-opt-in");
            expect(await request.json()).toMatchObject({
              key: "optInFlag",
              optedIn: false,
              scope: "user",
              context: {
                user: { id: "user1" },
                company: { id: "company1" },
              },
            });

            return HttpResponse.json({ success: true, flagStateVersion: 8 });
          },
        ),
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            requests.push("flags");
            expect(
              new URL(request.url).searchParams.get("waitForVersion"),
            ).toBe("8");

            return HttpResponse.json({
              success: true,
              flagStateVersion: 8,
              features: {
                optInFlag: {
                  key: "optInFlag",
                  isEnabled: false,
                  targetingVersion: 3,
                  optInEnabled: true,
                  optIn: {
                    userOptedIn: false,
                    companyOptedIn: false,
                    isOptedIn: false,
                    name: "Opt-in flag",
                    description: "Try it early",
                  },
                },
              },
            });
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-cancel-opt-in",
        user: { id: "user1" },
        company: { id: "company1" },
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: true,
            targetingVersion: 2,
            optInEnabled: true,
            optIn: {
              userOptedIn: true,
              companyOptedIn: false,
              isOptedIn: true,
              name: "Opt-in flag",
              description: "Try it early",
            },
          },
        },
      });
      await client.initialize();

      const response = await client.setOptIn("optInFlag", { optedIn: false });

      expect(response?.ok).toBe(true);
      expect(requests).toEqual(["cancel-opt-in", "flags"]);
      expect(client.getOptInFlags()[0]).toMatchObject({
        key: "optInFlag",
        isEnabled: false,
        userOptedIn: false,
        isOptedIn: false,
      });
    });

    it("keeps the newest state when concurrent opt-in refreshes resolve out of order", async () => {
      const olderRefresh = deferred<HttpResponse>();
      const newerRefresh = deferred<HttpResponse>();

      server.use(
        http.post(
          "https://front.reflag.com/flags/opt-in",
          async ({ request }) => {
            const body = (await request.json()) as { optedIn: boolean };
            return HttpResponse.json({
              success: true,
              flagStateVersion: body.optedIn ? 7 : 8,
            });
          },
        ),
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            const version = new URL(request.url).searchParams.get(
              "waitForVersion",
            );
            return version === "7"
              ? olderRefresh.promise
              : newerRefresh.promise;
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-concurrent-opt-in",
        user: { id: "user1" },
        bootstrappedFlags: optInFlags(false),
      });
      await client.initialize();

      const optInPromise = client.setOptIn("optInFlag", { optedIn: true });
      const optInExpectation = expect(optInPromise).rejects.toThrow(
        "the updated user membership was not reflected in the SDK",
      );
      const cancelPromise = client.setOptIn("optInFlag", { optedIn: false });
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(2));

      newerRefresh.resolve(optInEvaluationResponse(8, false));
      await cancelPromise;
      olderRefresh.resolve(optInEvaluationResponse(7, true));
      await optInExpectation;

      expect(client.getOptInFlags()[0]).toMatchObject({
        isEnabled: false,
        userOptedIn: false,
        isOptedIn: false,
      });
      expect(client["flagsClient"].getFlagStateVersion()).toBe(8);
    });

    it("does not apply opt-in flags fetched for a previous context", async () => {
      const previousContextRefresh = deferred<HttpResponse>();
      const currentContextRefresh = deferred<HttpResponse>();

      server.use(
        http.post("https://front.reflag.com/flags/opt-in", () =>
          HttpResponse.json({ success: true, flagStateVersion: 7 }),
        ),
        http.get(
          "https://front.reflag.com/features/evaluated",
          ({ request }) => {
            const contextJson = new URL(request.url).searchParams.get(
              "contextJson",
            );
            const userId = contextJson
              ? JSON.parse(contextJson).user?.id
              : undefined;
            return userId === "user1"
              ? previousContextRefresh.promise
              : currentContextRefresh.promise;
          },
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-opt-in-context-change",
        user: { id: "user1" },
        enableTracking: false,
        bootstrappedFlags: optInFlags(false),
      });
      await client.initialize();

      const optInPromise = client.setOptIn("optInFlag", { optedIn: true });
      const optInExpectation = expect(optInPromise).rejects.toThrow(
        "user context changed before the updated state could be confirmed",
      );
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(1));

      const contextUpdate = client.setContext({ user: { id: "user2" } });
      await vi.waitFor(() => expect(httpClientGet).toHaveBeenCalledTimes(2));
      currentContextRefresh.resolve(optInEvaluationResponse(8, false));
      await contextUpdate;
      previousContextRefresh.resolve(optInEvaluationResponse(7, true));
      await optInExpectation;

      expect(client.getContext().user?.id).toBe("user2");
      expect(client.getOptInFlags()[0]).toMatchObject({
        isEnabled: false,
        userOptedIn: false,
        isOptedIn: false,
      });
      expect(client["flagsClient"].getFlagStateVersion()).toBe(8);
    });

    it("rejects when the refreshed SDK state does not confirm the membership change", async () => {
      server.use(
        http.post("https://front.reflag.com/flags/opt-in", () =>
          HttpResponse.json({ success: true, flagStateVersion: 9 }),
        ),
        http.get("https://front.reflag.com/features/evaluated", () =>
          HttpResponse.json({
            success: true,
            flagStateVersion: 9,
            features: {
              optInFlag: {
                key: "optInFlag",
                isEnabled: false,
                targetingVersion: 1,
                optInEnabled: true,
                optIn: {
                  userOptedIn: false,
                  companyOptedIn: false,
                  isOptedIn: false,
                  name: "Opt-in flag",
                  description: null,
                },
              },
            },
          }),
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-unconfirmed-opt-in",
        user: { id: "user1" },
        bootstrappedFlags: {
          optInFlag: {
            key: "optInFlag",
            isEnabled: false,
            targetingVersion: 1,
            optInEnabled: true,
            optIn: {
              userOptedIn: false,
              companyOptedIn: false,
              isOptedIn: false,
              name: "Opt-in flag",
              description: null,
            },
          },
        },
      });
      await client.initialize();

      await expect(
        client.setOptIn("optInFlag", { optedIn: true }),
      ).rejects.toThrow(
        "the updated user membership was not reflected in the SDK",
      );
    });

    it("validates the default user identity before changing opt-in", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-opt-in-no-user",
        company: { id: "company1" },
        bootstrappedFlags: {},
      });
      await client.initialize();

      const response = await client.setOptIn("optInFlag", { optedIn: true });

      expect(response).toBeUndefined();
      const optInCalls = vi
        .mocked(httpClientPost)
        .mock.calls.filter(
          ([request]) =>
            (request as { path?: string }).path === "/flags/opt-in",
        );
      expect(optInCalls).toHaveLength(0);
    });

    it("serializes context ids as strings", async () => {
      server.use(
        http.post(
          "https://front.reflag.com/flags/opt-in",
          async ({ request }) => {
            expect(await request.json()).toMatchObject({
              key: "optInFlag",
              optedIn: true,
              scope: "company",
              context: {
                user: { id: "123" },
                company: { id: "456" },
              },
            });
            return HttpResponse.json({ success: true, flagStateVersion: 10 });
          },
        ),
        http.get("https://front.reflag.com/features/evaluated", () =>
          HttpResponse.json({
            success: true,
            flagStateVersion: 10,
            features: {
              optInFlag: {
                key: "optInFlag",
                isEnabled: true,
                targetingVersion: 1,
                optInEnabled: true,
                optIn: {
                  userOptedIn: false,
                  companyOptedIn: true,
                  isOptedIn: true,
                  name: "Opt-in flag",
                  description: null,
                },
              },
            },
          }),
        ),
      );

      client = new ReflagClient({
        publishableKey: "test-key-opt-in-number-ids",
        user: { id: 123 },
        company: { id: 456 },
        bootstrappedFlags: {},
      });
      await client.initialize();

      const response = await client.setOptIn("optInFlag", {
        optedIn: true,
        scope: "company",
      });

      expect(response?.ok).toBe(true);
    });
  });

  describe("track", () => {
    it("sends events directly and returns the delivery response", async () => {
      const response = await client.track("test-event", { a: 1 });

      expect(response?.ok).toBe(true);
      expect(httpClientPost).toHaveBeenCalledWith({
        path: "/event",
        body: {
          userId: "user1",
          companyId: "company1",
          event: "test-event",
          attributes: { a: 1 },
        },
      });

      const bulkCalls = vi
        .mocked(httpClientPost)
        .mock.calls.filter(
          ([request]) => (request as { path?: string }).path === "/bulk",
        );
      expect(bulkCalls).toHaveLength(0);
    });
  });

  describe("hooks integration", () => {
    it("on adds hooks appropriately, off removes them", async () => {
      const trackHook = vi.fn();
      const userHook = vi.fn();
      const companyHook = vi.fn();
      const checkHook = vi.fn();
      const flagsUpdated = vi.fn();

      client.on("track", trackHook);
      client.on("user", userHook);
      client.on("company", companyHook);
      client.on("check", checkHook);
      client.on("flagsUpdated", flagsUpdated);

      await client.track("test-event");
      expect(trackHook).toHaveBeenCalledWith({
        eventName: "test-event",
        attributes: undefined,
        user: client["context"].user,
        company: client["context"].company,
      });

      await client["user"]();
      expect(userHook).toHaveBeenCalledWith(client["context"].user);

      await client["company"]();
      expect(companyHook).toHaveBeenCalledWith(client["context"].company);

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").isEnabled;
      expect(checkHook).toHaveBeenCalled();

      checkHook.mockReset();

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").config;
      expect(checkHook).toHaveBeenCalled();

      expect(flagsUpdated).not.toHaveBeenCalled();
      await client.updateOtherContext({ key: "value" });
      expect(flagsUpdated).toHaveBeenCalled();

      // Remove hooks
      client.off("track", trackHook);
      client.off("user", userHook);
      client.off("company", companyHook);
      client.off("check", checkHook);
      client.off("flagsUpdated", flagsUpdated);

      // Reset mocks
      trackHook.mockReset();
      userHook.mockReset();
      companyHook.mockReset();
      checkHook.mockReset();
      flagsUpdated.mockReset();

      // Trigger events again
      await client.track("test-event");
      await client["user"]();
      await client["company"]();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").isEnabled;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").config;
      await client.updateOtherContext({ key: "value" });

      // Ensure hooks are not called
      expect(trackHook).not.toHaveBeenCalled();
      expect(userHook).not.toHaveBeenCalled();
      expect(companyHook).not.toHaveBeenCalled();
      expect(checkHook).not.toHaveBeenCalled();
      expect(flagsUpdated).not.toHaveBeenCalled();
    });

    it("sets state to initializing while refetching flags after initialization", async () => {
      await client.initialize();

      let resolveFetch: (() => void) | undefined;
      const setContextPromise = new Promise<boolean>((resolve) => {
        resolveFetch = () => resolve(true);
      });
      const setContext = vi
        .spyOn(FlagsClient.prototype, "setContext")
        .mockImplementation(async () => {
          return setContextPromise;
        });

      const stateUpdated = vi.fn();
      client.on("stateUpdated", stateUpdated);

      const updatePromise = client.updateOtherContext({ workspaceId: "ws-1" });

      expect(client.getState()).toBe("initializing");
      expect(stateUpdated).toHaveBeenCalledWith("initializing");
      expect(setContext).toHaveBeenCalledWith(client["context"]);

      resolveFetch?.();
      await updatePromise;

      expect(client.getState()).toBe("initialized");
      expect(stateUpdated).toHaveBeenLastCalledWith("initialized");
    });

    it("keeps loading tied to the latest context update", async () => {
      await client.initialize();

      let resolveFirstFetch: (() => void) | undefined;
      let resolveSecondFetch: (() => void) | undefined;
      const firstFetch = new Promise<boolean>((resolve) => {
        resolveFirstFetch = () => resolve(false);
      });
      const secondFetch = new Promise<boolean>((resolve) => {
        resolveSecondFetch = () => resolve(true);
      });

      vi.spyOn(FlagsClient.prototype, "setContext")
        .mockImplementationOnce(async () => firstFetch)
        .mockImplementationOnce(async () => secondFetch);

      const firstUpdate = client.updateOtherContext({ workspaceId: "ws-1" });
      const secondUpdate = client.updateOtherContext({ workspaceId: "ws-2" });

      expect(client.getState()).toBe("initializing");

      resolveSecondFetch?.();
      await secondUpdate;

      expect(client.getState()).toBe("initialized");

      resolveFirstFetch?.();
      await firstUpdate;

      expect(client.getState()).toBe("initialized");
    });

    it("finishes loading when bootstrapped state supersedes a context fetch", async () => {
      await client.initialize();

      const contextFetch = deferred<boolean>();
      vi.spyOn(client["flagsClient"], "setContext").mockReturnValue(
        contextFetch.promise,
      );

      const contextUpdate = client.setContext({
        user: { id: "user2" },
        company: { id: "company2" },
      });
      expect(client.getState()).toBe("initializing");

      client.applyBootstrappedState({
        context: {
          user: { id: "user3" },
          company: { id: "company3" },
        },
        flags: {},
        flagStateVersion: 3,
      });
      expect(client.getState()).toBe("initialized");

      contextFetch.resolve(false);
      await contextUpdate;
      expect(client.getState()).toBe("initialized");
    });
  });

  describe("setContext warnings", () => {
    it("does not warn about missing ids when updating anonymous other context", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-anon",
      });
      const warnSpy = vi.spyOn(client.logger, "warn");

      await client.updateOtherContext({ workspaceId: "ws-1" });

      expect(warnSpy).not.toHaveBeenCalledWith(
        "No user Id provided in context, user will be ignored",
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        "No company Id provided in context, company will be ignored",
      );
    });

    it("still warns when setContext replaces context without user or company ids", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-set-context",
      });
      const warnSpy = vi.spyOn(client.logger, "warn");

      await client.setContext({ other: { workspaceId: "ws-1" } });

      expect(warnSpy).toHaveBeenCalledWith(
        "No user Id provided in context, user will be ignored",
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "No company Id provided in context, company will be ignored",
      );
    });
  });

  describe("stop", () => {
    it("flushes the bulk queue on beforeunload and removes the listener on stop", async () => {
      const bulkQueue = client["bulkQueue"];
      expect(bulkQueue).toBeDefined();

      const flushSpy = vi.spyOn(bulkQueue!, "flush").mockResolvedValue();
      window.dispatchEvent(new Event("beforeunload"));
      expect(flushSpy).toHaveBeenCalledTimes(1);

      await client.stop();

      window.dispatchEvent(new Event("beforeunload"));
      expect(flushSpy).toHaveBeenCalledTimes(2);
    });

    it("throws if queued bulk events remain after final flush attempt", async () => {
      const bulkQueue = client["bulkQueue"];
      expect(bulkQueue).toBeDefined();

      vi.spyOn(bulkQueue!, "flush")
        .mockResolvedValueOnce()
        .mockResolvedValueOnce();
      vi.spyOn(bulkQueue!, "size")
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      await expect(client.stop()).rejects.toThrow(
        "failed to flush all queued bulk events during stop (1 remaining)",
      );
    });
  });

  describe("offline mode", () => {
    it("should not make HTTP calls when offline", async () => {
      client = new ReflagClient({
        publishableKey: "test-key",
        user: { id: "user1" },
        company: { id: "company1" },
        offline: true,
        feedback: { enableAutoFeedback: true },
      });

      await client.initialize();
      await client.track("offline-event");
      await client.feedback({ flagKey: "flagA", score: 5 });
      await client.updateUser({ name: "New User" });
      await client.updateCompany({ name: "New Company" });
      await client.stop();

      expect(httpClientPost).not.toHaveBeenCalled();
      expect(httpClientGet).not.toHaveBeenCalled();
    });
  });

  describe("bootstrap parameter", () => {
    const flagsClientInitialize = vi.spyOn(FlagsClient.prototype, "initialize");

    beforeEach(() => {
      flagsClientInitialize.mockClear();
    });

    it("should use pre-fetched flags and skip initialization when flags are provided", async () => {
      const preFetchedFlags = {
        testFlag: {
          key: "testFlag",
          isEnabled: true,
          targetingVersion: 1,
        },
      };

      // Create a spy to monitor maybeFetchFlags which should not be called if already initialized
      const maybeFetchFlags = vi.spyOn(
        FlagsClient.prototype as any,
        "maybeFetchFlags",
      );

      client = new ReflagClient({
        publishableKey: "test-key",
        user: { id: "user1" },
        company: { id: "company1" },
        bootstrappedFlags: preFetchedFlags,
        feedback: { enableAutoFeedback: false }, // Disable to avoid HTTP calls
      });

      // FlagsClient should be bootstrapped but not initialized in constructor when flags are provided
      expect(client["flagsClient"]["bootstrapped"]).toBe(true);
      expect(client["flagsClient"]["initialized"]).toBe(false);
      expect(client.getFlags()).toEqual({
        testFlag: {
          key: "testFlag",
          isEnabled: true,
          targetingVersion: 1,
          isEnabledOverride: null,
        },
      });

      maybeFetchFlags.mockClear();

      await client.initialize();

      // After initialize, flagsClient should be properly initialized
      expect(client["flagsClient"]["initialized"]).toBe(true);

      // No fetch is needed until opt-in data is requested.
      expect(maybeFetchFlags).not.toHaveBeenCalled();
      expect(httpClientGet).not.toHaveBeenCalled();
    });

    it("ignores same-context bootstrapped state with an older flagStateVersion", () => {
      client = new ReflagClient({
        publishableKey: "test-key-bootstrap-versioned",
        enableTracking: false,
        feedback: { enableAutoFeedback: false },
        bootstrappedState: {
          context: {
            user: { id: "user1" },
            company: { id: "company1" },
          },
          flags: {
            testFlag: {
              key: "testFlag",
              isEnabled: true,
              targetingVersion: 7,
            },
          },
          flagStateVersion: 7,
        },
      });

      client.updateFlags(
        {
          testFlag: {
            key: "testFlag",
            isEnabled: false,
            targetingVersion: 8,
          },
        },
        true,
        8,
      );

      client.applyBootstrappedState({
        context: {
          user: { id: "user1" },
          company: { id: "company1" },
        },
        flags: {
          testFlag: {
            key: "testFlag",
            isEnabled: true,
            targetingVersion: 7,
          },
        },
        flagStateVersion: 7,
      });

      expect(client.getFlags()).toEqual({
        testFlag: {
          key: "testFlag",
          isEnabled: false,
          targetingVersion: 8,
          isEnabledOverride: null,
        },
      });
      expect(client["flagsClient"].getFlagStateVersion()).toBe(8);
    });

    it("ignores same-context unversioned bootstrapped state when current state is versioned", () => {
      client = new ReflagClient({
        publishableKey: "test-key-bootstrap-unversioned",
        enableTracking: false,
        feedback: { enableAutoFeedback: false },
        bootstrappedState: {
          context: {
            user: { id: "user1" },
            company: { id: "company1" },
          },
          flags: {
            testFlag: {
              key: "testFlag",
              isEnabled: true,
              targetingVersion: 7,
            },
          },
          flagStateVersion: 7,
        },
      });

      client.updateFlags(
        {
          testFlag: {
            key: "testFlag",
            isEnabled: false,
            targetingVersion: 8,
          },
        },
        true,
        8,
      );

      client.applyBootstrappedState({
        context: {
          user: { id: "user1" },
          company: { id: "company1" },
        },
        flags: {
          testFlag: {
            key: "testFlag",
            isEnabled: true,
            targetingVersion: 6,
          },
        },
      });

      expect(client.getFlags()).toEqual({
        testFlag: {
          key: "testFlag",
          isEnabled: false,
          targetingVersion: 8,
          isEnabledOverride: null,
        },
      });
      expect(client["flagsClient"].getFlagStateVersion()).toBe(8);
    });

    it("still applies bootstrapped state when the context changes", () => {
      client = new ReflagClient({
        publishableKey: "test-key-bootstrap-context-change",
        enableTracking: false,
        feedback: { enableAutoFeedback: false },
        bootstrappedState: {
          context: {
            user: { id: "user1" },
            company: { id: "company1" },
          },
          flags: {
            testFlag: {
              key: "testFlag",
              isEnabled: false,
              targetingVersion: 8,
            },
          },
          flagStateVersion: 8,
        },
      });

      client.applyBootstrappedState({
        context: {
          user: { id: "user2" },
          company: { id: "company2" },
        },
        flags: {
          testFlag: {
            key: "testFlag",
            isEnabled: true,
            targetingVersion: 1,
          },
        },
      });

      expect(client.getContext()).toEqual({
        user: { id: "user2" },
        company: { id: "company2" },
        other: {},
      });
      expect(client.getFlags()).toEqual({
        testFlag: {
          key: "testFlag",
          isEnabled: true,
          targetingVersion: 1,
          isEnabledOverride: null,
        },
      });
      expect(client["flagsClient"].getFlagStateVersion()).toBeUndefined();
    });

    it("reconciles a context-changing bootstrapped state when a newer version was already seen", async () => {
      client = new ReflagClient({
        publishableKey: "test-key-bootstrap-context-reconcile",
        enableTracking: false,
        enableLiveFlagUpdates: true,
        feedback: { enableAutoFeedback: false },
        bootstrappedState: {
          context: {
            user: { id: "user1" },
            company: { id: "company1" },
          },
          flags: {
            testFlag: {
              key: "testFlag",
              isEnabled: false,
              targetingVersion: 8,
            },
          },
          flagStateVersion: 8,
        },
      });
      client["latestFlagStateVersionSeen"] = 9;

      const refreshFlags = vi
        .spyOn(client["flagsClient"], "refreshFlags")
        .mockResolvedValue(undefined);

      client.applyBootstrappedState({
        context: {
          user: { id: "user2" },
          company: { id: "company2" },
        },
        flags: {
          testFlag: {
            key: "testFlag",
            isEnabled: true,
            targetingVersion: 1,
          },
        },
        flagStateVersion: 7,
      });

      await vi.waitFor(() => {
        expect(refreshFlags).toHaveBeenCalledWith(9);
      });
    });
  });
});
