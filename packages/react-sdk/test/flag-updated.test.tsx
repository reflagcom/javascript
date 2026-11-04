import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import React from "react";
import { flushSync } from "react-dom";
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

import { RawFlags, ReflagClient } from "@reflag/browser-sdk";

import {
  ReflagBootstrappedProvider,
  ReflagClientProvider,
  useFlag,
  useOnEvent,
} from "../src";

const server = setupServer(
  http.post(/\/features\/events$/, () => HttpResponse.json({ success: true })),
);
const clients: ReflagClient[] = [];

function initialFlags(): RawFlags {
  return {
    abc: {
      key: "abc",
      isEnabled: true,
      targetingVersion: 1,
      config: {
        key: "default",
        payload: { nested: { limit: 10 } },
        version: 1,
      },
    },
    def: { key: "def", isEnabled: false, targetingVersion: 1 },
  };
}

async function newClient(flags = initialFlags(), initialize = true) {
  const client = new ReflagClient({
    publishableKey: "test-key-react-flag-values",
    user: { id: "user1" },
    bootstrappedFlags: flags,
    enableTracking: false,
    enableLiveFlagUpdates: false,
    toolbar: false,
    feedback: { enableAutoFeedback: false },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  clients.push(client);
  if (initialize) await client.initialize();
  return client;
}

function wrapperFor(client: ReflagClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <ReflagClientProvider client={client} initialLoading={false}>
      {children}
    </ReflagClientProvider>
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
});

describe("useFlag value subscriptions", () => {
  test("ignores metadata-only updates but later reads use current check metadata", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const renderSpy = vi.fn();
    const checks = vi.fn();
    const flagsUpdated = vi.fn();
    client.on("check", checks);
    client.on("flagsUpdated", flagsUpdated);
    const { result, unmount } = renderHook(
      () => {
        renderSpy();
        return useFlag("abc");
      },
      { wrapper: wrapperFor(client) },
    );

    expect(checks).not.toHaveBeenCalled();
    expect(result.current.isEnabled).toBe(true);
    const config = result.current.config;
    checks.mockClear();
    const previousResult = result.current;
    const evaluationErrors = [
      { code: "MISSING_CONTEXT_FIELD", field: "plan", message: "Missing plan" },
    ];

    act(() =>
      client.updateFlags({
        ...flags,
        abc: {
          ...flags.abc,
          targetingVersion: 2,
          ruleEvaluationResults: [false, true],
          evaluationErrors,
          config: {
            ...flags.abc.config!,
            payload: { nested: { limit: 10 } },
            version: 2,
            evaluationErrors,
          },
        },
      }),
    );

    expect(flagsUpdated).toHaveBeenCalledOnce();
    expect(renderSpy).toHaveBeenCalledOnce();
    expect(result.current).toBe(previousResult);
    expect(checks).not.toHaveBeenCalled();
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.config).toBe(config);
    expect(checks).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check-is-enabled",
        version: 2,
        ruleEvaluationResults: [false, true],
        evaluationErrors,
      }),
    );
    expect(checks).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check-config",
        version: 2,
        evaluationErrors,
      }),
    );
    unmount();
  });

  test.each(["default", "variant"])(
    "keeps values and check telemetry consistent during a pending transition (%s config key)",
    async (configKey) => {
      const flags = initialFlags();
      const client = await newClient(flags);
      const checks = vi.fn();
      client.on("check", checks);
      let readValues: () => void = () => undefined;
      const { result, unmount } = renderHook(
        () => {
          const [shouldRead, setShouldRead] = React.useState(false);
          readValues = () => setShouldRead(true);
          const flag = useFlag("abc");
          return shouldRead
            ? { isEnabled: flag.isEnabled, config: flag.config }
            : undefined;
        },
        { wrapper: wrapperFor(client) },
      );
      const updated = {
        ...flags,
        abc: {
          ...flags.abc,
          isEnabled: false,
          targetingVersion: 2,
          config: {
            key: configKey,
            payload: { nested: { limit: 20 } },
            version: 2,
          },
        },
      };
      let synchronousValues: typeof result.current;

      act(() => {
        React.startTransition(() => client.updateFlags(updated));
        flushSync(readValues);
        synchronousValues = result.current;
      });

      expect(synchronousValues).toEqual({
        isEnabled: true,
        config: { key: "default", payload: { nested: { limit: 10 } } },
      });
      expect(result.current).toEqual({
        isEnabled: false,
        config: { key: configKey, payload: { nested: { limit: 20 } } },
      });
      expect(
        checks.mock.calls.map(([event]) => ({
          action: event.action,
          version: event.version,
          value: event.value,
        })),
      ).toEqual([
        { action: "check-is-enabled", version: 1, value: true },
        {
          action: "check-config",
          version: 1,
          value: { key: "default", payload: { nested: { limit: 10 } } },
        },
        { action: "check-is-enabled", version: 2, value: false },
        {
          action: "check-config",
          version: 2,
          value: { key: configKey, payload: { nested: { limit: 20 } } },
        },
      ]);
      unmount();
    },
  );

  test("retained snapshots keep their values and check metadata after an update", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const checks = vi.fn();
    client.on("check", checks);
    const { result, unmount } = renderHook(() => useFlag("abc"), {
      wrapper: wrapperFor(client),
    });
    const previous = result.current;

    act(() =>
      client.updateFlags({
        ...flags,
        abc: {
          ...flags.abc,
          isEnabled: false,
          targetingVersion: 2,
          config: {
            key: "variant",
            payload: { nested: { limit: 20 } },
            version: 2,
          },
        },
      }),
    );

    expect(previous.isEnabled).toBe(true);
    expect(previous.config).toEqual({
      key: "default",
      payload: { nested: { limit: 10 } },
    });
    expect(checks).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check-is-enabled",
        version: 1,
        value: true,
      }),
    );
    expect(checks).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check-config",
        version: 1,
        value: previous.config,
      }),
    );
    checks.mockClear();

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.config).toEqual({
      key: "variant",
      payload: { nested: { limit: 20 } },
    });
    expect(checks).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check-is-enabled",
        version: 2,
        value: false,
      }),
    );
    expect(checks).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check-config",
        version: 2,
        value: result.current.config,
      }),
    );
    unmount();
  });

  test("only rerenders subscribers of the changed flag", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const renderA = vi.fn();
    const renderB = vi.fn();
    const a = renderHook(
      () => {
        renderA();
        return useFlag("abc");
      },
      { wrapper: wrapperFor(client) },
    );
    const b = renderHook(
      () => {
        renderB();
        return useFlag("def");
      },
      { wrapper: wrapperFor(client) },
    );

    const updated = { ...flags, abc: { ...flags.abc, isEnabled: false } };
    act(() => client.updateFlags(updated));
    expect(a.result.current.isEnabled).toBe(false);
    expect(renderA).toHaveBeenCalledTimes(2);
    expect(renderB).toHaveBeenCalledOnce();

    act(() =>
      client.updateFlags({
        ...updated,
        def: { ...flags.def, isEnabled: true },
      }),
    );
    expect(b.result.current.isEnabled).toBe(true);
    expect(renderA).toHaveBeenCalledTimes(2);
    expect(renderB).toHaveBeenCalledTimes(2);
    a.unmount();
    b.unmount();
  });

  test("rerenders for nested payload, variant key, and config presence changes", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const renderSpy = vi.fn();
    const { result, unmount } = renderHook(
      () => {
        renderSpy();
        return useFlag("abc");
      },
      { wrapper: wrapperFor(client) },
    );
    let updated: RawFlags = {
      ...flags,
      abc: {
        ...flags.abc,
        config: {
          key: "default",
          payload: { nested: { limit: 20 } },
          version: 2,
        },
      },
    };
    act(() => client.updateFlags(updated));
    expect(result.current.config.payload).toEqual({ nested: { limit: 20 } });
    expect(renderSpy).toHaveBeenCalledTimes(2);
    const config = result.current.config;

    updated = {
      ...updated,
      abc: {
        ...updated.abc,
        config: {
          key: "default",
          payload: { nested: { limit: 20 } },
          version: 3,
        },
      },
    };
    act(() => client.updateFlags(updated));
    expect(result.current.config).toBe(config);
    expect(renderSpy).toHaveBeenCalledTimes(2);

    updated = {
      ...updated,
      abc: {
        ...updated.abc,
        config: { ...updated.abc.config!, key: "variant" },
      },
    };
    act(() => client.updateFlags(updated));
    expect(result.current.config.key).toBe("variant");
    expect(renderSpy).toHaveBeenCalledTimes(3);

    updated = { ...updated, abc: { ...updated.abc, config: undefined } };
    act(() => client.updateFlags(updated));
    expect(result.current.config).toEqual({
      key: undefined,
      payload: undefined,
    });
    expect(renderSpy).toHaveBeenCalledTimes(4);

    act(() => client.updateFlags(flags));
    expect(result.current.config.payload).toEqual({ nested: { limit: 10 } });
    expect(renderSpy).toHaveBeenCalledTimes(5);
    unmount();
  });

  test("ignores effective-value-preserving override and remote changes", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const renderSpy = vi.fn();
    const { result, unmount } = renderHook(
      () => {
        renderSpy();
        return useFlag("abc");
      },
      { wrapper: wrapperFor(client) },
    );

    act(() => client.getFlag("abc").setIsEnabledOverride(true));
    expect(renderSpy).toHaveBeenCalledOnce();
    act(() => client.getFlag("abc").setIsEnabledOverride(false));
    expect(result.current.isEnabled).toBe(false);
    expect(renderSpy).toHaveBeenCalledTimes(2);

    act(() =>
      client.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
    );
    act(() => client.getFlag("abc").setIsEnabledOverride(null));
    expect(renderSpy).toHaveBeenCalledTimes(2);
    act(() => client.updateFlags(flags));
    expect(result.current.isEnabled).toBe(true);
    expect(renderSpy).toHaveBeenCalledTimes(3);
    unmount();
  });

  test("handles flag removal and addition", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const { result, unmount } = renderHook(() => useFlag("abc"), {
      wrapper: wrapperFor(client),
    });

    act(() => client.updateFlags({ def: flags.def }));
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.config).toEqual({
      key: undefined,
      payload: undefined,
    });
    act(() => client.updateFlags(flags));
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.config.key).toBe("default");
    unmount();
  });

  test("resubscribes when the flag key changes", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const renderSpy = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ flagKey }) => {
        renderSpy();
        return useFlag(flagKey);
      },
      { initialProps: { flagKey: "abc" }, wrapper: wrapperFor(client) },
    );

    rerender({ flagKey: "def" });
    expect(result.current.key).toBe("def");
    expect(result.current.isEnabled).toBe(false);
    renderSpy.mockClear();
    act(() =>
      client.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
    );
    expect(renderSpy).not.toHaveBeenCalled();
    act(() =>
      client.updateFlags({ ...flags, def: { ...flags.def, isEnabled: true } }),
    );
    expect(result.current.isEnabled).toBe(true);
    expect(renderSpy).toHaveBeenCalledOnce();
    unmount();
  });

  test("resubscribes when the client changes", async () => {
    const flags = initialFlags();
    const first = await newClient(flags);
    const second = await newClient({
      ...flags,
      abc: { ...flags.abc, isEnabled: false },
    });
    let currentClient = first;
    const renderSpy = vi.fn();
    const { result, rerender, unmount } = renderHook(
      () => {
        renderSpy();
        return useFlag("abc");
      },
      {
        wrapper: ({ children }) => (
          <ReflagClientProvider client={currentClient} initialLoading={false}>
            {children}
          </ReflagClientProvider>
        ),
      },
    );

    currentClient = second;
    rerender();
    expect(result.current.isEnabled).toBe(false);
    renderSpy.mockClear();
    act(() =>
      first.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
    );
    expect(renderSpy).not.toHaveBeenCalled();
    act(() => second.updateFlags(flags));
    expect(result.current.isEnabled).toBe(true);
    expect(renderSpy).toHaveBeenCalledOnce();
    unmount();
  });

  test("keeps its subscription across value updates and parent rerenders", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const subscribe = vi.spyOn(client, "on");
    const renderSpy = vi.fn();
    const { result, rerender, unmount } = renderHook(
      () => {
        renderSpy();
        return useFlag("abc");
      },
      { wrapper: wrapperFor(client) },
    );

    rerender();
    act(() =>
      client.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
    );
    act(() => client.updateFlags(flags));

    expect(result.current.isEnabled).toBe(true);
    expect(
      subscribe.mock.calls.filter(([event]) => event === "flagUpdated"),
    ).toHaveLength(1);

    unmount();
    renderSpy.mockClear();
    act(() =>
      client.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
    );
    expect(renderSpy).not.toHaveBeenCalled();
  });

  test("catches an update between rendering and subscribing", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const { result, unmount } = renderHook(
      () => {
        React.useLayoutEffect(() => {
          client.updateFlags({
            ...flags,
            abc: { ...flags.abc, isEnabled: false },
          });
        }, []);
        const flag = useFlag("abc");
        return { isEnabled: flag.isEnabled };
      },
      { wrapper: wrapperFor(client) },
    );

    expect(result.current.isEnabled).toBe(false);
    unmount();
  });

  test("preserves loading and value updates when context changes", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const updated = {
      ...flags,
      abc: { ...flags.abc, isEnabled: false, targetingVersion: 2 },
    };
    server.use(
      http.get(/\/features\/evaluated$/, () =>
        HttpResponse.json({ success: true, features: updated }),
      ),
    );
    const valuesUpdated = vi.fn();
    client.on("flagUpdated", valuesUpdated);
    const { result, unmount } = renderHook(() => useFlag("abc"), {
      wrapper: wrapperFor(client),
    });

    await act(() => client.setContext({ user: { id: "user2" } }));
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(valuesUpdated).toHaveBeenCalledOnce();
    valuesUpdated.mockClear();

    await act(() => client.setContext({ user: { id: "user3" } }));
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(client.getContext().user?.id).toBe("user3");
    expect(client.getFlags().abc.targetingVersion).toBe(2);
    expect(valuesUpdated).not.toHaveBeenCalled();
    unmount();
  });

  test("does not emit checks while comparing or updating snapshots", async () => {
    const flags = initialFlags();
    const client = await newClient(flags);
    const checks = vi.fn();
    client.on("check", checks);
    const { unmount } = renderHook(() => useFlag("abc"), {
      wrapper: wrapperFor(client),
    });

    act(() =>
      client.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
    );

    expect(checks).not.toHaveBeenCalled();
    unmount();
  });
});

test("bootstrapped initialization publishes values without rerendering unchanged useFlag consumers", async () => {
  const client = await newClient(initialFlags(), false);
  const listener = vi.fn();
  const checks = vi.fn();
  const renders = vi.fn();
  client.on("check", checks);
  const { result, unmount } = renderHook(
    () => {
      renders();
      useOnEvent("flagUpdated", listener, client);
      return useFlag("abc");
    },
    { wrapper: wrapperFor(client) },
  );
  const previous = result.current;

  await act(() => client.initialize());

  expect(listener.mock.calls.map(([event]) => event.key)).toEqual([
    "abc",
    "def",
  ]);
  expect(result.current).toBe(previous);
  expect(renders).toHaveBeenCalledOnce();
  expect(checks).not.toHaveBeenCalled();
  unmount();
});

test("ReflagBootstrappedProvider delivers initial flagUpdated events to child subscriptions", async () => {
  const listener = vi.fn();
  const { unmount } = renderHook(() => useOnEvent("flagUpdated", listener), {
    wrapper: ({ children }) => (
      <ReflagBootstrappedProvider
        publishableKey="test-key-bootstrap-initial-events"
        flags={{
          flags: initialFlags(),
          context: { user: { id: "user1" } },
          flagStateVersion: 1,
        }}
        enableTracking={false}
        enableLiveFlagUpdates={false}
        feedback={{ enableAutoFeedback: false }}
        toolbar={false}
      >
        {children}
      </ReflagBootstrappedProvider>
    ),
  });

  await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

  expect(listener.mock.calls.map(([event]) => event.key)).toEqual([
    "abc",
    "def",
  ]);
  unmount();
});

test("useOnEvent supports value-only subscriptions and unmount cleanup", async () => {
  const flags = initialFlags();
  const client = await newClient(flags);
  const listener = vi.fn();
  const { unmount } = renderHook(() =>
    useOnEvent("flagUpdated", listener, client),
  );

  act(() =>
    client.updateFlags({
      ...flags,
      abc: { ...flags.abc, targetingVersion: 2 },
    }),
  );
  expect(listener).not.toHaveBeenCalled();
  act(() =>
    client.updateFlags({ ...flags, abc: { ...flags.abc, isEnabled: false } }),
  );
  expect(listener).toHaveBeenCalledWith({
    key: "abc",
    flag: client.getFlags().abc,
  });
  unmount();
  act(() => client.updateFlags(flags));
  expect(listener).toHaveBeenCalledOnce();
});
