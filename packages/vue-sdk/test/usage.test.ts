import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, Suspense } from "vue";

import { ReflagClient } from "@reflag/browser-sdk";

import {
  ReflagBootstrappedProvider,
  ReflagProvider,
  useClient,
  useFlag,
  useOnEvent,
  useOptInFlags,
  useSetOptIn,
} from "../src";

// Mock ReflagClient prototype methods like the React SDK tests
beforeAll(() => {
  vi.spyOn(ReflagClient.prototype, "initialize").mockResolvedValue(undefined);
  vi.spyOn(ReflagClient.prototype, "stop").mockResolvedValue(undefined);
  vi.spyOn(ReflagClient.prototype, "getFlag").mockReturnValue(true);
  vi.spyOn(ReflagClient.prototype, "getState").mockReturnValue("initialized");
  vi.spyOn(ReflagClient.prototype, "getFlags").mockReturnValue({});
  vi.spyOn(ReflagClient.prototype, "getOptInFlags").mockReturnValue([]);
  vi.spyOn(ReflagClient.prototype, "getIsLoadingOptInFlags").mockReturnValue(
    false,
  );
  vi.spyOn(ReflagClient.prototype, "setOptIn").mockResolvedValue(undefined);
  vi.spyOn(ReflagClient.prototype, "on").mockReturnValue(() => {
    // cleanup function
  });
  vi.spyOn(ReflagClient.prototype, "off").mockImplementation(() => {
    // off implementation
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ReflagClient.prototype.getFlag).mockReturnValue(true);
  vi.mocked(ReflagClient.prototype.getOptInFlags).mockReturnValue([]);
  vi.mocked(ReflagClient.prototype.getIsLoadingOptInFlags).mockReturnValue(
    false,
  );
  vi.mocked(ReflagClient.prototype.on).mockReturnValue(() => {
    // cleanup function
  });
});

function getProvider() {
  return {
    props: {
      publishableKey: "key",
    },
  };
}

describe("ReflagProvider", () => {
  test("useFlag returns a direct reactive value, forwards positional defaults and unsubscribes", async () => {
    let update: (() => void) | undefined;
    const unsubscribe = vi.fn();
    vi.mocked(ReflagClient.prototype.on).mockImplementation(
      (event, handler) => {
        if (event === "flagsUpdated") update = handler as () => void;
        return unsubscribe;
      },
    );
    vi.mocked(ReflagClient.prototype.getFlag)
      .mockReturnValueOnce(false)
      .mockReturnValue(false);
    const Child = defineComponent({
      setup() {
        return { enabled: useFlag("release") };
      },
      template: "<span>{{ enabled }}</span>",
    });
    const wrapper = mount(ReflagProvider, {
      props: { publishableKey: "reactive-direct-value" },
      slots: { default: () => h(Child) },
    });
    await nextTick();
    expect(wrapper.text()).toBe("false");
    expect(ReflagClient.prototype.getFlag).toHaveBeenCalledWith(
      "release",
      false,
    );
    vi.mocked(ReflagClient.prototype.getFlag).mockReturnValue(true);
    update?.();
    await nextTick();
    expect(wrapper.text()).toBe("true");
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  test("useFlag forwards JSON defaults without wrappers or truthiness fallback", async () => {
    vi.mocked(ReflagClient.prototype.getFlag).mockReturnValue(null);
    const fallback = { model: "default" };
    const Child = defineComponent({
      setup() {
        return { settings: useFlag("settings", fallback) };
      },
      template: "<span>{{ settings === null ? 'off' : settings.model }}</span>",
    });
    const wrapper = mount(ReflagProvider, {
      props: { publishableKey: "reactive-json-default" },
      slots: { default: () => h(Child) },
    });
    await nextTick();
    expect(ReflagClient.prototype.getFlag).toHaveBeenCalledWith(
      "settings",
      fallback,
    );
    expect(wrapper.text()).toBe("off");
    wrapper.unmount();
  });

  test("provides the client", async () => {
    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      ...getProvider(),
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(wrapper.findComponent(Child).vm.client).toBeDefined();
  });

  test("does not throw when unmounted before an event listener is registered", () => {
    const AsyncChild = defineComponent({
      setup() {
        useOnEvent("flagsUpdated", vi.fn());
        return new Promise(() => {
          // Remain suspended until the component is unmounted.
        });
      },
    });

    const wrapper = mount(ReflagProvider, {
      ...getProvider(),
      slots: {
        default: () =>
          h(Suspense, null, {
            default: () => h(AsyncChild),
            fallback: () => h("div"),
          }),
      },
    });

    expect(() => wrapper.unmount()).not.toThrow();
  });

  test("enables live flag updates by default", async () => {
    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      ...getProvider(),
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(
      (wrapper.findComponent(Child).vm.client as any)["enableLiveFlagUpdates"],
    ).toBe(true);
  });

  test("useOptInFlags returns opt-in flags and subscribes to updates", async () => {
    const optInFlags = [
      {
        key: "optInFlag",
        name: "Opt-in flag",
        description: "Try it early",
        isEnabled: false,
        userOptedIn: false,
        companyOptedIn: false,
        isOptedIn: false,
      },
    ];
    vi.mocked(ReflagClient.prototype.getOptInFlags).mockReturnValue(optInFlags);
    vi.mocked(ReflagClient.prototype.getIsLoadingOptInFlags).mockReturnValue(
      true,
    );

    const Child = defineComponent({
      setup() {
        const { flags, isLoading } = useOptInFlags();
        return { flags, isLoading };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      props: {
        publishableKey: "key-opt-in-flags",
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(wrapper.findComponent(Child).vm.flags).toEqual(optInFlags);
    expect(wrapper.findComponent(Child).vm.isLoading).toBe(true);
    expect(ReflagClient.prototype.on).toHaveBeenCalledWith(
      "flagsUpdated",
      expect.any(Function),
    );
    expect(ReflagClient.prototype.on).toHaveBeenCalledWith(
      "optInFlagsLoadingUpdated",
      expect.any(Function),
    );
  });

  test("useOptInFlags updates loading for missing bootstrapped metadata", async () => {
    let loadingHandler: ((isLoading: boolean) => void) | undefined;
    vi.mocked(ReflagClient.prototype.getIsLoadingOptInFlags).mockReturnValue(
      true,
    );
    vi.mocked(ReflagClient.prototype.on).mockImplementation(
      (event, handler) => {
        if (event === "optInFlagsLoadingUpdated") {
          loadingHandler = handler as (isLoading: boolean) => void;
        }
        return () => {
          // cleanup function
        };
      },
    );

    const Child = defineComponent({
      setup() {
        const { flags, isLoading } = useOptInFlags();
        return { flags, isLoading };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagBootstrappedProvider, {
      props: {
        publishableKey: "key-loading-opt-in-flags",
        flags: {
          protocolVersion: 2,
          context: { user: { id: "user-1" } },
          flags: {
            optInFlag: {
              value: false,
              resolved: true,
              variantKey: "false",
              sourceVersionId: "version-1",
              ruleResults: [],
              errors: [],
            },
          },
        },
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(wrapper.findComponent(Child).vm.isLoading).toBe(true);

    loadingHandler?.(false);
    await nextTick();

    expect(wrapper.findComponent(Child).vm.isLoading).toBe(false);
  });

  test("useSetOptIn delegates to the browser client", async () => {
    const Child = defineComponent({
      setup() {
        const setOptIn = useSetOptIn();
        return { setOptIn };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      props: {
        publishableKey: "key-set-opt-in",
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    await wrapper.findComponent(Child).vm.setOptIn("optInFlag", {
      optedIn: false,
      scope: "company",
    });

    expect(ReflagClient.prototype.setOptIn).toHaveBeenCalledWith("optInFlag", {
      optedIn: false,
      scope: "company",
    });
  });

  test("allows disabling live flag updates explicitly", async () => {
    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      props: {
        publishableKey: "key-disabled-live-flags",
        enableLiveFlagUpdates: false,
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(
      (wrapper.findComponent(Child).vm.client as any)["enableLiveFlagUpdates"],
    ).toBe(false);
  });

  test("uses provided logger", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      props: {
        publishableKey: "key-with-logger",
        logger,
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    const clientLogger = wrapper.findComponent(Child).vm.client.logger;
    expect(clientLogger.debug).toBe(logger.debug);
    expect(clientLogger.info).toBe(logger.info);
    expect(clientLogger.warn).toBe(logger.warn);
    expect(clientLogger.error).toBe(logger.error);
  });

  test("prefers logger over debug mode", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagProvider, {
      props: {
        publishableKey: "key-with-logger-and-debug",
        logger,
        debug: true,
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    const clientLogger = wrapper.findComponent(Child).vm.client.logger;
    expect(clientLogger.debug).toBe(logger.debug);
    expect(clientLogger.info).toBe(logger.info);
    expect(clientLogger.warn).toBe(logger.warn);
    expect(clientLogger.error).toBe(logger.error);
  });

  test("throws without provider", () => {
    const Comp = defineComponent({
      setup() {
        return () => {
          useClient();
        };
      },
    });

    expect(() => mount(Comp)).toThrow();
  });
});

describe("ReflagBootstrappedProvider", () => {
  const bootstrappedFlags = {
    protocolVersion: 2 as const,
    context: {
      user: { id: "test-user" },
      company: { id: "test-company" },
    },
    flags: {
      "test-flag": {
        value: true,
        resolved: true,
        variantKey: "true",
        sourceVersionId: "version-1",
        ruleResults: [],
        errors: [],
      },
    },
    flagStateVersion: 1,
  };

  test("provides the client with bootstrapped flags", async () => {
    const Child = defineComponent({
      setup() {
        const client = useClient();
        const flag = useFlag("test-flag");
        return { client, flag };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagBootstrappedProvider, {
      props: {
        publishableKey: "key",
        flags: bootstrappedFlags,
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(wrapper.findComponent(Child).vm.client).toBeDefined();
    expect(wrapper.findComponent(Child).vm.flag).toBe(true);
  });

  test("enables live flag updates by default for bootstrapped providers", async () => {
    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagBootstrappedProvider, {
      props: {
        publishableKey: "bootstrapped-default-live-flags",
        flags: bootstrappedFlags,
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(
      (wrapper.findComponent(Child).vm.client as any)["enableLiveFlagUpdates"],
    ).toBe(true);
  });

  test("allows disabling live flag updates explicitly for bootstrapped providers", async () => {
    const Child = defineComponent({
      setup() {
        const client = useClient();
        return { client };
      },
      template: "<div></div>",
    });

    const wrapper = mount(ReflagBootstrappedProvider, {
      props: {
        publishableKey: "bootstrapped-disabled-live-flags",
        flags: bootstrappedFlags,
        enableLiveFlagUpdates: false,
      },
      slots: { default: () => h(Child) },
    });

    await nextTick();
    expect(
      (wrapper.findComponent(Child).vm.client as any)["enableLiveFlagUpdates"],
    ).toBe(false);
  });
});
