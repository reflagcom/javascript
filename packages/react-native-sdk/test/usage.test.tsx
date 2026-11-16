import React, { act, Suspense } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ReflagClient as NodeClient } from "@reflag/node-sdk";
import * as ReactSDK from "@reflag/react-sdk";

import { version } from "../package.json";
import {
  ReflagBootstrappedProvider,
  ReflagProvider,
  useClient,
  useFlag,
  useFlagSuspense,
  useIsLoading,
  useOptInFlags,
  useSendFeedback,
  useSetOptIn,
  useTrack,
  type BootstrappedFlags,
  type FlagValue,
  type ReflagProps,
  type StorageAdapter,
} from "../src";

const native = vi.hoisted(() => ({
  stored: new Map<string, string>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  sources: [] as {
    url: string;
    options: { pollingInterval: number };
    listeners: Map<string, (event: { data: string }) => void>;
    close: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: native.getItem,
    setItem: native.setItem,
    removeItem: native.removeItem,
  },
}));
vi.mock("react-native-sse", () => ({
  default: class {
    listeners = new Map<string, (event: { data: string }) => void>();
    close = vi.fn();
    constructor(
      public url: string,
      public options: { pollingInterval: number },
    ) {
      native.sources.push(this);
    }
    addEventListener(
      type: string,
      listener: (event: { data: string }) => void,
    ) {
      this.listeners.set(type, listener);
    }
  },
}));

const selected = (value: FlagValue) => ({
  value,
  resolved: true,
  sourceVersionId: "source-1",
  variantKey: "selected",
  matchedRuleId: "default",
  ruleResults: [{ ruleId: "default", matched: true }],
  errors: [],
});
const evaluated = (enabled = true, flagStateVersion = 1) => ({
  success: true,
  protocolVersion: 2,
  flagStateVersion,
  remoteContextUsed: false,
  flags: {
    release: selected(enabled),
    settings: selected({ model: "quality", limits: [2, 5] }),
    nullable: selected(null),
  },
});
const bootstrap = (
  enabled = true,
  flagStateVersion = 1,
): BootstrappedFlags => ({
  protocolVersion: 2,
  flagStateVersion,
  context: { user: { id: "native-user" } },
  flags: evaluated(enabled).flags,
});
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const clients = new Set<ReturnType<typeof useClient>>();
const views: ReactTestRenderer[] = [];
const fetchMock = vi.fn<typeof fetch>();
let nextKey = 0;
let props: ReflagProps;

function CaptureClient() {
  clients.add(useClient());
  return null;
}
async function mount(children: React.JSX.Element) {
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(children);
  });
  views.push(view);
  return view;
}
async function settle(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assertion();
  });
}
async function refreshFromSSE(flagStateVersion: number) {
  await act(async () => {
    native.sources.at(-1)!.listeners.get("message")!({
      data: JSON.stringify({
        name: "flags-updated",
        data: { flagStateVersion },
      }),
    });
  });
}
function latestClient() {
  return [...clients].at(-1)!;
}

beforeEach(() => {
  native.stored.clear();
  native.sources.length = 0;
  vi.clearAllMocks();
  native.getItem.mockImplementation(
    async (key: string) => native.stored.get(key) ?? null,
  );
  native.setItem.mockImplementation(async (key: string, value: string) => {
    native.stored.set(key, value);
  });
  native.removeItem.mockImplementation(async (key: string) => {
    native.stored.delete(key);
  });
  fetchMock.mockReset().mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/flags/evaluated") return Response.json(evaluated());
    if (url.pathname === "/bulk") return Response.json({ success: true });
    throw new Error(`Unexpected HTTP request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  props = {
    publishableKey: `native-test-${nextKey++}`,
    context: { user: { id: "native-user" } },
    enableTracking: false,
    enableLiveFlagUpdates: false,
    logger,
  };
});
afterEach(async () => {
  await act(async () => {
    for (const view of views) view.unmount();
  });
  views.length = 0;
  await Promise.all([...clients].map((client) => client.stop()));
  clients.clear();
});

describe("React Native v2", () => {
  test.each([false, true])(
    "supplies Native defaults without enabling web UI, bootstrapped: %s",
    (bootstrapped) => {
      const element = bootstrapped
        ? ReflagBootstrappedProvider({ ...props, flags: bootstrap() })
        : ReflagProvider(props);
      expect(element.props.toolbar).toBe(false);
      expect(element.props.feedback.enableAutoFeedback).toBe(false);
      expect(element.props.storage.getItem).toBe(native.getItem);
      expect(element.props.sdkVersion).toBe(`react-native-sdk/${version}`);
      expect(element.props.eventSourceFactory).toEqual(expect.any(Function));
      expect(element.props.enableLiveFlagUpdates).toBe(false);
      const defaults = bootstrapped
        ? ReflagBootstrappedProvider({
            publishableKey: "synthetic",
            flags: bootstrap(),
          })
        : ReflagProvider({ publishableKey: "synthetic" });
      expect(defaults.props.enableLiveFlagUpdates).toBe(true);
    },
  );

  test("shares the v2 hooks rather than restoring v1 wrappers", () => {
    expect(useFlag).toBe(ReactSDK.useFlag);
    expect(useFlagSuspense).toBe(ReactSDK.useFlagSuspense);
    expect(useOptInFlags).toBe(ReactSDK.useOptInFlags);
    expect(useSetOptIn).toBe(ReactSDK.useSetOptIn);
    expect(useTrack).toBe(ReactSDK.useTrack);
  });

  test("returns Boolean/direct JSON values while loading and after a native fetch without DOM globals", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async () => {
      await pending;
      return Response.json(evaluated());
    });
    let result: unknown;
    function Read() {
      result = {
        enabled: useFlag("release"),
        settings: useFlag("settings", { model: "fallback", limits: [0] }),
        loading: useIsLoading(),
      };
      return null;
    }
    await mount(
      <ReflagProvider {...props}>
        <CaptureClient />
        <Read />
      </ReflagProvider>,
    );
    expect(typeof document).toBe("undefined");
    expect(typeof localStorage).toBe("undefined");
    expect(typeof EventSource).toBe("undefined");
    expect(result).toEqual({
      enabled: false,
      settings: { model: "fallback", limits: [0] },
      loading: true,
    });
    release();
    await settle(() =>
      expect(result).toEqual({
        enabled: true,
        settings: { model: "quality", limits: [2, 5] },
        loading: false,
      }),
    );
    expect(native.getItem).toHaveBeenCalled();
    expect(native.setItem).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/flags/evaluated");
    expect(new URL(String(url)).searchParams.get("reflag-sdk-version")).toBe(
      `react-native-sdk/${version}`,
    );
  });

  test("useFlag does not suspend or interpret a JSON default as hook options", async () => {
    let result: unknown;
    function Read() {
      result = useFlag("missing", { suspense: true, model: "fallback" });
      return null;
    }
    await mount(
      <ReflagBootstrappedProvider {...props} flags={bootstrap()} suspense>
        <CaptureClient />
        <Read />
      </ReflagBootstrappedProvider>,
    );
    expect(result).toEqual({ suspense: true, model: "fallback" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("useFlagSuspense waits for initialization and settles missing reads to their default", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async () => {
      await pending;
      return Response.json(evaluated());
    });
    function Read() {
      return (
        <>
          {String(useFlagSuspense("release"))}:
          {String(useFlagSuspense("missing", true))}
        </>
      );
    }
    const view = await mount(
      <ReflagProvider {...props}>
        <CaptureClient />
        <Suspense fallback="loading">
          <Read />
        </Suspense>
      </ReflagProvider>,
    );
    expect(view.toJSON()).toBe("loading");
    release();
    await settle(() => expect(view.toJSON()).toEqual(["true", ":", "true"]));
  });

  test("accepts a real Node v2 bootstrap envelope, preserves root-check identity and isolates JSON reads", async () => {
    const values = {
      release: true,
      disabled: false,
      settings: { limits: [2, 5] },
      nullable: null,
    };
    const node = new NodeClient({
      secretKey: "synthetic-native-bootstrap-test",
      offline: false,
      flagsSyncMode: "in-request",
      flagsFetchRetries: 0,
      batchOptions: { intervalMs: 0, flushOnExit: false },
      logger,
      httpClient: {
        async get<Body>() {
          return {
            status: 200,
            ok: true,
            body: {
              success: true,
              protocolVersion: 2,
              flagStateVersion: 7,
              segments: [],
              flags: Object.entries(values).map(([key, value]) => ({
                key,
                sourceVersionId: `source:${key}`,
                variants: { chosen: value },
                rules: [
                  {
                    id: "native-rule",
                    filter: { type: "constant", value: true },
                    result: { type: "variant", variantKey: "chosen" },
                  },
                ],
              })),
            } as Body,
          };
        },
        async post() {
          throw new Error("Unexpected Node telemetry");
        },
      },
    });
    let state: BootstrappedFlags;
    try {
      await node.initialize();
      state = JSON.parse(
        JSON.stringify(
          node.getFlagsForBootstrap({
            user: { id: "native-user" },
            enableTracking: false,
          }),
        ),
      );
    } finally {
      node.destroy();
    }
    let result: unknown;
    function Read() {
      result = [
        useFlag("release"),
        useFlag("disabled"),
        useFlag("nullable", null),
        useFlag("settings", null),
        useFlag("missing"),
      ];
      return null;
    }
    await mount(
      <ReflagBootstrappedProvider {...props} enableTracking flags={state}>
        <CaptureClient />
        <Read />
      </ReflagBootstrappedProvider>,
    );
    expect(result).toEqual([true, false, null, { limits: [2, 5] }, false]);
    const client = latestClient();
    const check = vi.fn();
    client.on("check", check);
    client.getFlag("settings", null);
    // An already-read root is rate limited; a new subscriber still sees genuine identity after a new snapshot.
    await act(async () =>
      client.applyBootstrappedState({ ...state, flagStateVersion: 8 }),
    );
    client.getFlag("settings", null);
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "settings",
        flagStateVersion: 8,
        sourceVersionId: "source:settings",
        evalResult: "chosen",
      }),
    );
    const copy = client.getFlag("settings", null) as { limits: number[] };
    copy.limits.push(999);
    expect(client.getFlag("settings", null)).toEqual({ limits: [2, 5] });
    expect(
      fetchMock.mock.calls.every(
        ([input]) => new URL(String(input)).pathname === "/bulk",
      ),
    ).toBe(true);
    await client.stop();
    const checks = fetchMock.mock.calls.flatMap(([input, options]) =>
      new URL(String(input)).pathname === "/bulk"
        ? JSON.parse(String(options?.body))
        : [],
    );
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "feature-flag-event",
          key: "settings",
          sourceVersionId: "source:settings",
          flagStateVersion: 7,
          evalResult: "chosen",
        }),
      ]),
    );
  });

  test("rejects v1 bootstrap state instead of silently reading wrapper payloads", async () => {
    const legacy = { context: {}, flags: { release: { isEnabled: true } } };
    await expect(
      mount(
        <ReflagBootstrappedProvider
          {...props}
          flags={legacy as unknown as BootstrappedFlags}
        />,
      ),
    ).rejects.toThrow(/protocol-v2 bootstrap snapshot/);
  });

  test("uses the native SSE adapter for versioned v2 updates and closes it on stop", async () => {
    const seen: boolean[] = [];
    function Read() {
      seen.push(useFlag("release"));
      return null;
    }
    await mount(
      <ReflagProvider {...props} enableLiveFlagUpdates>
        <CaptureClient />
        <Read />
      </ReflagProvider>,
    );
    await settle(() => expect(native.sources).toHaveLength(1));
    const source = native.sources[0];
    expect(source.options).toEqual({ pollingInterval: 0 });
    expect(new URL(source.url).pathname).toBe("/sse/client");
    expect(new URL(source.url).searchParams.get("reflag-sdk-version")).toBe(
      `react-native-sdk/${version}`,
    );
    expect(source.listeners.has("message")).toBe(true);
    fetchMock.mockResolvedValue(Response.json(evaluated(false, 2)));
    await refreshFromSSE(2);
    await settle(() => expect(seen.at(-1)).toBe(false));
    const [url] = fetchMock.mock.calls.at(-1)!;
    expect(new URL(String(url)).searchParams.get("waitForVersion")).toBe("2");
    const requestCount = fetchMock.mock.calls.length;
    await refreshFromSSE(1);
    await refreshFromSSE(2);
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    await latestClient().stop();
    expect(source.close).toHaveBeenCalledOnce();
  });

  test.each([false, true])(
    "honors custom storage and SSE adapters, bootstrapped: %s",
    async (bootstrapped) => {
      const storage: StorageAdapter = {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => undefined),
      };
      const transport = { addEventListener: vi.fn(), close: vi.fn() };
      const eventSourceFactory = vi.fn(() => transport);
      const children = <CaptureClient />;
      await mount(
        bootstrapped ? (
          <ReflagBootstrappedProvider
            {...props}
            flags={bootstrap()}
            storage={storage}
            eventSourceFactory={eventSourceFactory}
            enableLiveFlagUpdates
          >
            {children}
          </ReflagBootstrappedProvider>
        ) : (
          <ReflagProvider
            {...props}
            storage={storage}
            eventSourceFactory={eventSourceFactory}
            enableLiveFlagUpdates
          >
            {children}
          </ReflagProvider>
        ),
      );
      await settle(() => expect(eventSourceFactory).toHaveBeenCalledOnce());
      expect(native.getItem).not.toHaveBeenCalled();
      expect(native.sources).toHaveLength(0);
      await latestClient().stop();
      expect(transport.close).toHaveBeenCalledOnce();
    },
  );

  test("offline native fallbacks and value overrides retain v2 direct-value semantics without HTTP", async () => {
    let value: unknown;
    function Read() {
      value = [useFlag("release"), useFlag("settings", null)];
      return null;
    }
    await mount(
      <ReflagProvider
        {...props}
        offline
        fallbackFlags={{ release: true, settings: { mode: "offline" } }}
      >
        <CaptureClient />
        <Read />
      </ReflagProvider>,
    );
    await settle(() => expect(value).toEqual([true, { mode: "offline" }]));
    await act(async () => latestClient().setFlagOverride("settings", null));
    expect(value).toEqual([true, null]);
    await act(async () =>
      latestClient().setFlagOverride("settings", undefined),
    );
    expect(value).toEqual([true, { mode: "offline" }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(native.sources).toHaveLength(0);
  });

  test("reapplies new v2 bootstrap props on the same native client", async () => {
    let value: boolean | undefined;
    function Read() {
      value = useFlag("release");
      return null;
    }
    const view = await mount(
      <ReflagBootstrappedProvider {...props} flags={bootstrap()}>
        <CaptureClient />
        <Read />
      </ReflagBootstrappedProvider>,
    );
    const original = latestClient();
    expect(value).toBe(true);
    await act(async () =>
      view.update(
        <ReflagBootstrappedProvider {...props} flags={bootstrap(false, 2)}>
          <CaptureClient />
          <Read />
        </ReflagBootstrappedProvider>,
      ),
    );
    expect(value).toBe(false);
    expect(clients.size).toBe(1);
    expect(latestClient()).toBe(original);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("loads opt-in metadata without replacing bootstrap values, then confirms v2 opt-in mutations", async () => {
    let result: ReturnType<typeof useOptInFlags>;
    let setOptIn: ReturnType<typeof useSetOptIn>;
    let enabled: boolean;
    let changed = false;
    fetchMock.mockImplementation(async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname === "/flags/opt-in") {
        expect(JSON.parse(String(options?.body))).toMatchObject({
          key: "release",
          optedIn: true,
        });
        changed = true;
        return Response.json({ success: true, flagStateVersion: 2 });
      }
      expect(url.pathname).toBe("/flags/evaluated");
      return Response.json({
        ...evaluated(false, changed ? 2 : 1),
        flags: {
          release: {
            ...selected(false),
            optInEnabled: true,
            optIn: {
              name: "Preview",
              description: null,
              userOptedIn: changed,
              companyOptedIn: false,
              isOptedIn: changed,
            },
          },
        },
      });
    });
    function Read() {
      result = useOptInFlags();
      setOptIn = useSetOptIn();
      enabled = useFlag("release");
      return null;
    }
    await mount(
      <ReflagBootstrappedProvider {...props} flags={bootstrap()}>
        <CaptureClient />
        <Read />
      </ReflagBootstrappedProvider>,
    );
    await settle(() =>
      expect(result!.flags).toEqual([
        expect.objectContaining({ key: "release", userOptedIn: false }),
      ]),
    );
    expect(result!.isLoading).toBe(false);
    expect(enabled!).toBe(true);
    await act(async () =>
      expect((await setOptIn!("release", { optedIn: true }))?.ok).toBe(true),
    );
    expect(result!.flags[0].userOptedIn).toBe(true);
    expect(enabled!).toBe(false);
  });

  test("keeps usage tracking and custom feedback separate from flag values", async () => {
    let track: ReturnType<typeof useTrack>;
    let sendFeedback: ReturnType<typeof useSendFeedback>;
    function Read() {
      track = useTrack();
      sendFeedback = useSendFeedback();
      return null;
    }
    await mount(
      <ReflagBootstrappedProvider {...props} flags={bootstrap()} enableTracking>
        <CaptureClient />
        <Read />
      </ReflagBootstrappedProvider>,
    );
    const client = latestClient();
    const trackSpy = vi.spyOn(client, "track").mockResolvedValue(undefined);
    const feedbackSpy = vi
      .spyOn(client, "feedback")
      .mockResolvedValue(undefined);
    await track!("Started native huddle", { screen: "home" });
    await sendFeedback!({ flagKey: "release", score: 5, comment: "Useful" });
    expect(trackSpy).toHaveBeenCalledWith("Started native huddle", {
      screen: "home",
    });
    expect(feedbackSpy).toHaveBeenCalledWith({
      flagKey: "release",
      score: 5,
      comment: "Useful",
    });
  });
});
