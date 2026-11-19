import { transferableAbortController } from "node:util";

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import React, { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import {
  ReflagClient,
  type FlagValue,
  type RawFlag,
} from "@reflag/browser-sdk";

import type { BootstrappedFlags, ReflagProps } from "../src";
import {
  ReflagBootstrappedProvider,
  ReflagClientProvider,
  ReflagProvider,
  useClient,
  useFlag,
  useFlagSuspense,
  useIsLoading,
  useOnEvent,
  useOptInFlags,
  useRequestFeedback,
  useSendFeedback,
  useSetOptIn,
  useTrack,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
} from "../src";

globalThis.AbortController = transferableAbortController()
  .constructor as typeof AbortController;
const selected = (value: FlagValue, variantKey = "true"): RawFlag => ({
  value,
  resolved: true,
  sourceVersionId: "version-1",
  variantKey,
  matchedRuleId: "default",
  ruleResults: [{ ruleId: "default", matched: true }],
  errors: [],
});
const response = {
  success: true,
  protocolVersion: 2,
  flagStateVersion: 1,
  remoteContextUsed: false,
  flags: {
    release: selected(true),
    settings: selected({ model: "quality" }, "quality"),
  },
};
const state = (): BootstrappedFlags => ({
  protocolVersion: 2,
  context: { user: { id: "alice" } },
  flags: { release: selected(true) },
  flagStateVersion: 1,
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let index = 0;
const clients = new Set<ReflagClient>();
function create(bootstrappedState = state()) {
  const client = new ReflagClient({
    publishableKey: `external-${index++}`,
    bootstrappedState,
    enableTracking: false,
    toolbar: false,
    feedback: { enableAutoFeedback: false },
  });
  clients.add(client);
  return client;
}
function clientProvider(client: ReflagClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <ReflagClientProvider client={client} initialLoading={false}>
      {children}
    </ReflagClientProvider>
  );
}
function provider(props: Partial<ReflagProps> = {}) {
  const publishableKey = `provider-${index++}`;
  return ({ children }: { children: React.ReactNode }) => (
    <ReflagProvider
      publishableKey={publishableKey}
      context={{ user: { id: "alice" } }}
      toolbar={false}
      feedback={{ enableAutoFeedback: false }}
      enableLiveFlagUpdates={false}
      enableTracking={false}
      {...props}
    >
      {children}
    </ReflagProvider>
  );
}
const server = setupServer(
  http.get(/\/flags\/evaluated$/, () => HttpResponse.json(response)),
  http.post(/\/bulk$/, () => HttpResponse.json({ success: true })),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  localStorage.clear();
  // Prevent Preact toolbar renders from outliving the jsdom test environment.
  vi.spyOn(ReflagClient.prototype, "showToolbarToggle").mockImplementation(
    () => undefined,
  );
});
afterEach(async () => {
  server.resetHandlers();
  vi.restoreAllMocks();
  await Promise.all([...clients].map((client) => client.stop()));
  clients.clear();
});
afterAll(() => server.close());

describe("direct-value hooks", () => {
  test("returns Boolean false while initializing, then direct values without wrappers", async () => {
    const pending = gate();
    server.use(
      http.get(/\/flags\/evaluated$/, async () => {
        await pending.promise;
        return HttpResponse.json(response);
      }),
    );
    const { result } = renderHook(
      () => ({
        enabled: useFlag("release"),
        settings: useFlag("settings", { model: "default" }),
        loading: useIsLoading(),
      }),
      { wrapper: provider() },
    );
    expect(result.current).toEqual({
      enabled: false,
      settings: { model: "default" },
      loading: true,
    });
    pending.resolve();
    await waitFor(() =>
      expect(result.current).toEqual({
        enabled: true,
        settings: { model: "quality" },
        loading: false,
      }),
    );
  });

  describe.each<[string, typeof useFlag]>([
    ["useFlag", useFlag],
    ["useFlagSuspense", useFlagSuspense],
  ])("%s result identity", (_name, useReadFlag) => {
    test.each<[string, FlagValue, FlagValue]>([
      ["object", { items: ["first"] }, { items: ["second"] }],
      ["array", [{ name: "first" }], [{ name: "second" }]],
    ])(
      "keeps %s values stable until their contents change",
      (_type, firstValue, nextValue) => {
        const initial = state();
        initial.flags.settings = selected(firstValue, "settings");
        const client = create(initial);
        const effect = vi.fn();
        const { result, rerender } = renderHook(
          () => {
            const value = useReadFlag("settings", null);
            const [, redraw] = useState(0);
            useEffect(() => {
              effect(value);
              // Bound the broken behavior so this regression fails rather than hangs.
              if (effect.mock.calls.length < 5)
                redraw((revision) => revision + 1);
            }, [value]);
            return value;
          },
          { wrapper: clientProvider(client) },
        );
        const first = result.current;
        expect(first).toEqual(firstValue);
        expect(effect).toHaveBeenCalledOnce();
        rerender();
        expect(result.current).toBe(first);
        act(() =>
          client.updateFlags(
            {
              ...initial.flags,
              release: selected(false, "false"),
            },
            true,
            2,
          ),
        );
        expect(result.current).toBe(first);
        expect(effect).toHaveBeenCalledOnce();
        act(() =>
          client.updateFlags(
            {
              ...initial.flags,
              settings: selected(nextValue, "settings"),
            },
            true,
            3,
          ),
        );
        const next = result.current;
        expect(next).toEqual(nextValue);
        expect(next).not.toBe(first);
        expect(effect).toHaveBeenCalledTimes(2);
        rerender();
        expect(result.current).toBe(next);
      },
    );

    test("stabilizes inline defaults and responds to default, key and client changes", () => {
      let client = create();
      const { result, rerender } = renderHook(
        ({ key, fallback }) => useReadFlag(key, { items: [fallback] }),
        {
          initialProps: { key: "missing", fallback: "first" },
          wrapper: ({ children }) => (
            <ReflagClientProvider client={client} initialLoading={false}>
              {children}
            </ReflagClientProvider>
          ),
        },
      );
      const first = result.current;
      rerender({ key: "missing", fallback: "first" });
      expect(result.current).toBe(first);
      rerender({ key: "missing", fallback: "second" });
      const second = result.current;
      expect(second).toEqual({ items: ["second"] });
      expect(second).not.toBe(first);
      rerender({ key: "other", fallback: "second" });
      const other = result.current;
      expect(other).toEqual(second);
      expect(other).not.toBe(second);
      client = create();
      rerender({ key: "other", fallback: "second" });
      expect(result.current).toEqual(other);
      expect(result.current).not.toBe(other);
    });

    test("preserves read checks and owns each hook's returned value", () => {
      const value = { items: ["first"] };
      const initial = state();
      initial.flags.settings = selected(value, "first");
      const client = new ReflagClient({
        publishableKey: `identity-checks-${index++}`,
        bootstrappedState: initial,
        toolbar: false,
        feedback: { enableAutoFeedback: false },
      });
      clients.add(client);
      const check = vi.fn();
      client.on("check", check);
      const read = vi.spyOn(client, "getFlag");
      const { result, rerender } = renderHook(
        () => [useReadFlag("settings", null), useReadFlag("settings", null)],
        { wrapper: clientProvider(client) },
      );
      const first = result.current[0];
      expect(result.current[1]).not.toBe(first);
      const reads = read.mock.calls.length;
      rerender();
      expect(result.current[0]).toBe(first);
      expect(read.mock.calls.length).toBeGreaterThan(reads);
      expect(check).toHaveBeenCalledOnce();
      act(() =>
        client.updateFlags(
          {
            ...initial.flags,
            settings: {
              ...selected(value, "second"),
              sourceVersionId: "version-2",
            },
          },
          true,
          2,
        ),
      );
      expect(result.current[0]).toBe(first);
      expect(check).toHaveBeenCalledTimes(2);
      expect(check.mock.calls[1][0]).toMatchObject({
        key: "settings",
        evalResult: "second",
        sourceVersionId: "version-2",
        flagStateVersion: 2,
      });
      (first as { items: string[] }).items.push("mutated");
      expect(result.current[1]).toEqual(value);
      expect(client.getFlag("settings", null)).toEqual(value);
      rerender();
      expect(result.current[0]).toEqual(value);
      expect(result.current[0]).not.toBe(first);
    });
  });

  test("tracks ignored hook reads immediately and rerenders on new evaluated state", async () => {
    const client = new ReflagClient({
      publishableKey: "checks",
      bootstrappedState: state(),
      toolbar: false,
      feedback: { enableAutoFeedback: false },
    });
    clients.add(client);
    const check = vi.fn();
    client.on("check", check);
    const { result } = renderHook(() => useFlag("release"), {
      wrapper: clientProvider(client),
    });
    expect(result.current).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toMatchObject({
      action: "check",
      key: "release",
      evalResult: "true",
      sourceVersionId: "version-1",
    });
    act(() =>
      client.updateFlags(
        {
          release: selected(false, "false"),
        },
        true,
        2,
      ),
    );
    expect(result.current).toBe(false);
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("uses current keys and positional defaults when props change", () => {
    const client = create();
    const { result, rerender } = renderHook(
      ({ key, fallback }) => useFlag(key, fallback),
      {
        initialProps: { key: "release", fallback: true },
        wrapper: clientProvider(client),
      },
    );
    expect(result.current).toBe(true);
    rerender({ key: "missing", fallback: false });
    expect(result.current).toBe(false);
    rerender({ key: "missing", fallback: true });
    expect(result.current).toBe(true);
  });

  test("does not miss a flag update between render and subscription", () => {
    const client = create();
    function UpdateBeforeSubscription() {
      useLayoutEffect(() => {
        client.updateFlags(
          {
            release: selected(false, "false"),
          },
          true,
          2,
        );
      }, []);
      return null;
    }
    function Flag() {
      return <span>{String(useFlag("release"))}</span>;
    }
    const view = render(
      <ReflagClientProvider client={client} initialLoading={false}>
        <UpdateBeforeSubscription />
        <Flag />
      </ReflagClientProvider>,
    );
    expect(view.container.textContent).toBe("false");
  });

  test("useFlag never interprets a positional payload as loading options or inherits opt-in Suspense", async () => {
    const { result } = renderHook(
      () => useFlag("missing", { suspense: true, model: "fallback" }),
      { wrapper: provider({ suspense: true }) },
    );
    expect(result.current).toEqual({ suspense: true, model: "fallback" });
    await waitFor(() => expect(result.current.model).toBe("fallback"));
  });

  test("useFlagSuspense waits for initialization, then a missing flag returns its default", async () => {
    const pending = gate();
    server.use(
      http.get(/\/flags\/evaluated$/, async () => {
        await pending.promise;
        return HttpResponse.json(response);
      }),
    );
    function Flag() {
      return <span>{useFlagSuspense("missing", "fallback")}</span>;
    }
    const Wrapper = provider({ initialLoading: false });
    const view = render(
      <Wrapper>
        <Suspense fallback={<span>Loading</span>}>
          <Flag />
        </Suspense>
      </Wrapper>,
    );
    expect(view.container.textContent).toBe("Loading");
    pending.resolve();
    await waitFor(() => expect(view.container.textContent).toBe("fallback"));
  });

  test("on-demand initialization failure releases Suspense instead of hanging", async () => {
    const client = create();
    vi.spyOn(client, "getConfig").mockReturnValue({
      ...client.getConfig(),
      bootstrapped: false,
    });
    vi.spyOn(client, "initialize").mockRejectedValue(
      new Error("initialization failed"),
    );
    function Flag() {
      return <span>{String(useFlagSuspense("missing"))}</span>;
    }
    const view = render(
      <ReflagClientProvider client={client}>
        <Suspense fallback="Loading">
          <Flag />
        </Suspense>
      </ReflagClientProvider>,
    );
    await waitFor(() => expect(view.container.textContent).toBe("false"));
  });

  test("bootstrapped direct values render during SSR and refresh from newer bootstrap props", async () => {
    function Flag() {
      return <span>{String(useFlag("release"))}</span>;
    }
    const key = `bootstrap-${index++}`;
    const initial = state();
    const tree = (flags: BootstrappedFlags) => (
      <ReflagBootstrappedProvider
        publishableKey={key}
        flags={flags}
        enableTracking={false}
        enableLiveFlagUpdates={false}
        toolbar={false}
      >
        <Flag />
      </ReflagBootstrappedProvider>
    );
    expect(renderToString(tree(initial))).toContain("true");
    const view = render(tree(initial));
    expect(view.container.textContent).toBe("true");
    view.rerender(
      tree({
        ...initial,
        flagStateVersion: 2,
        flags: {
          release: selected(false, "false"),
        },
      }),
    );
    await waitFor(() => expect(view.container.textContent).toBe("false"));
    view.rerender(tree(initial));
    expect(view.container.textContent).toBe("false");
  });
});

describe("provider and independent hooks", () => {
  test("deduplicates client initialization for the same key", async () => {
    const initialize = vi.spyOn(ReflagClient.prototype, "initialize");
    const Wrapper = provider();
    const view = render(
      <Wrapper>
        <span>one</span>
      </Wrapper>,
    );
    view.rerender(
      <Wrapper>
        <span>two</span>
      </Wrapper>,
    );
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
  });

  test("forwards logger and runtime configuration and enables live updates by default", async () => {
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const { result } = renderHook(() => useClient(), {
      wrapper: provider({
        logger,
        debug: true,
        enableLiveFlagUpdates: true,
        sdkVersion: "react-sdk/custom",
      }),
    });
    await waitFor(() => expect(result.current.getState()).toBe("initialized"));
    expect(result.current.logger).toBe(logger);
    expect((result.current as any).enableLiveFlagUpdates).toBe(true);
    expect((result.current as any).sdkVersion).toBe("react-sdk/custom");
  });

  test("keeps imperative context updates across equal provider-prop rerenders", async () => {
    const context = {
      user: { id: "alice", roles: ["reader"] },
      other: { nested: { value: 1 } },
    };
    const key = `contexts-${index++}`;
    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <ReflagProvider
          publishableKey={key}
          context={{
            user: { ...context.user, roles: [...context.user.roles] },
            other: { nested: { value: 1 } },
          }}
          enableTracking={false}
          enableLiveFlagUpdates={false}
          toolbar={false}
        >
          {children}
        </ReflagProvider>
      );
    }
    const { result, rerender } = renderHook(
      () => ({ client: useClient(), updateUser: useUpdateUser() }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(result.current.client.getState()).toBe("initialized"),
    );
    await act(() => result.current.updateUser({ role: "admin" }));
    rerender();
    expect(result.current.client.getContext().user?.role).toBe("admin");
  });

  test("reflects context loading without temporarily exposing the previous user's value", async () => {
    const pending = gate();
    server.use(
      http.get(/\/flags\/evaluated$/, async ({ request }) => {
        if (
          new URL(request.url).searchParams.get("contextJson")?.includes("bob")
        ) {
          await pending.promise;
          return HttpResponse.json({
            ...response,
            flags: { release: selected(false, "false") },
          });
        }
        return HttpResponse.json(response);
      }),
    );
    const { result } = renderHook(
      () => ({
        client: useClient(),
        enabled: useFlag("release"),
        loading: useIsLoading(),
      }),
      { wrapper: provider() },
    );
    await waitFor(() => expect(result.current.enabled).toBe(true));
    let updating!: Promise<void>;
    act(() => {
      updating = result.current.client.setContext({ user: { id: "bob" } });
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(true);
    await act(async () => {
      pending.resolve();
      await updating;
    });
    expect(result.current.loading).toBe(false);
  });

  test("tracking, feedback, context and opt-in hooks remain separate client operations", async () => {
    const client = create();
    const track = vi.spyOn(client, "track").mockResolvedValue(undefined);
    const requestFeedback = vi
      .spyOn(client, "requestFeedback")
      .mockReturnValue(undefined);
    const feedback = vi.spyOn(client, "feedback").mockResolvedValue(undefined);
    const user = vi.spyOn(client, "updateUser").mockResolvedValue(undefined);
    const company = vi
      .spyOn(client, "updateCompany")
      .mockResolvedValue(undefined);
    const other = vi
      .spyOn(client, "updateOtherContext")
      .mockResolvedValue(undefined);
    const optIn = vi.spyOn(client, "setOptIn").mockResolvedValue(undefined);
    const { result } = renderHook(
      () => ({
        track: useTrack(),
        requestFeedback: useRequestFeedback(),
        feedback: useSendFeedback(),
        user: useUpdateUser(),
        company: useUpdateCompany(),
        other: useUpdateOtherContext(),
        optIn: useSetOptIn(),
      }),
      { wrapper: clientProvider(client) },
    );
    await result.current.track("Started", { button: "cta" });
    result.current.requestFeedback({ flagKey: "release", title: "Feedback" });
    await result.current.feedback({ flagKey: "release", score: 5 });
    await result.current.user({ role: "admin" });
    await result.current.company({ plan: "premium" });
    await result.current.other({ region: "eu" });
    await result.current.optIn("release", { optedIn: true, scope: "company" });
    expect(track).toHaveBeenCalledWith("Started", { button: "cta" });
    expect(requestFeedback).toHaveBeenCalledWith({
      flagKey: "release",
      title: "Feedback",
    });
    expect(feedback).toHaveBeenCalledWith({ flagKey: "release", score: 5 });
    expect(user).toHaveBeenCalledWith({ role: "admin" });
    expect(company).toHaveBeenCalledWith({ plan: "premium" });
    expect(other).toHaveBeenCalledWith({ region: "eu" });
    expect(optIn).toHaveBeenCalledWith("release", {
      optedIn: true,
      scope: "company",
    });
  });

  test("event subscriptions clean up on unmount and support an external client", () => {
    const client = create();
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useOnEvent("flagsUpdated", handler, client),
    );
    act(() => client.setFlagOverride("release", false));
    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
    client.setFlagOverride("release", true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("requires a provider", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(() => renderHook(() => useFlag("release"))).toThrow(
      "ReflagProvider is missing",
    );
    error.mockRestore();
  });
});

describe("opt-in hooks", () => {
  test("reports initial metadata loading for regular providers and retains the v2 value", async () => {
    const pending = gate();
    server.use(
      http.get(/\/flags\/evaluated$/, async () => {
        await pending.promise;
        return HttpResponse.json({
          ...response,
          flags: {
            release: {
              ...selected(true),
              optInEnabled: true,
              optIn: {
                name: "Try",
                description: null,
                userOptedIn: true,
                companyOptedIn: false,
                isOptedIn: true,
              },
            },
          },
        });
      }),
    );
    const { result } = renderHook(() => useOptInFlags(), {
      wrapper: provider(),
    });
    expect(result.current.isLoading).toBe(true);
    pending.resolve();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flags[0]).toMatchObject({
      key: "release",
      isEnabled: true,
      userOptedIn: true,
    });
  });

  test("updates opt-in membership while an override keeps the value unchanged", async () => {
    const optIn = {
      name: "Try",
      description: null,
      userOptedIn: false,
      companyOptedIn: false,
      isOptedIn: false,
    };
    const initial = state();
    initial.flags.release.optInEnabled = true;
    initial.flags.release.optIn = optIn;
    const client = create(initial);
    client.setFlagOverride("release", false);
    await client.initialize();
    server.use(
      http.post(/\/flags\/opt-in$/, () =>
        HttpResponse.json({ success: true, flagStateVersion: 2 }),
      ),
      http.get(/\/flags\/evaluated$/, () =>
        HttpResponse.json({
          ...response,
          flagStateVersion: 2,
          flags: {
            release: {
              ...selected(true),
              optInEnabled: true,
              optIn: { ...optIn, userOptedIn: true, isOptedIn: true },
            },
          },
        }),
      ),
    );
    const { result } = renderHook(
      () => ({
        value: useFlag("release"),
        optIn: useOptInFlags(),
        setOptIn: useSetOptIn(),
      }),
      {
        wrapper: ({ children }) => (
          <ReflagClientProvider client={client}>
            {children}
          </ReflagClientProvider>
        ),
      },
    );
    expect(result.current.optIn.flags[0].userOptedIn).toBe(false);
    await act(async () => {
      expect(
        (await result.current.setOptIn("release", { optedIn: true }))?.ok,
      ).toBe(true);
    });
    await waitFor(() =>
      expect(result.current.optIn.flags[0].userOptedIn).toBe(true),
    );
    expect(result.current.value).toBe(false);
    expect(result.current.optIn.flags[0].isEnabled).toBe(false);
  });

  test("preserves opt-in Suspense and releases it after metadata failure", async () => {
    const pending = gate();
    server.use(
      http.get(/\/flags\/evaluated$/, async () => {
        await pending.promise;
        return HttpResponse.json({}, { status: 503 });
      }),
    );
    function Flags() {
      const { flags } = useOptInFlags();
      return <span>{flags.length} flags</span>;
    }
    const view = render(
      <ReflagBootstrappedProvider
        publishableKey={`opt-in-${index++}`}
        flags={state()}
        enableTracking={false}
        enableLiveFlagUpdates={false}
        toolbar={false}
        suspense
      >
        <Suspense fallback="Metadata loading">
          <Flags />
        </Suspense>
      </ReflagBootstrappedProvider>,
    );
    expect(view.container.textContent).toBe("Metadata loading");
    pending.resolve();
    await waitFor(() => expect(view.container.textContent).toBe("0 flags"));
  });

  test("allows a single opt-in hook to opt out of provider Suspense", async () => {
    const pending = gate();
    server.use(
      http.get(/\/flags\/evaluated$/, async () => {
        await pending.promise;
        return HttpResponse.json({ ...response, flags: {} });
      }),
    );
    const { result } = renderHook(() => useOptInFlags({ suspense: false }), {
      wrapper: provider({ suspense: true }),
    });
    expect(result.current.isLoading).toBe(true);
    pending.resolve();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
