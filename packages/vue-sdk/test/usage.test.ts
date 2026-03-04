import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { ReflagClient } from "@reflag/browser-sdk";

import {
  ReflagBootstrappedProvider,
  ReflagProvider,
  useClient,
  useFlag,
} from "../src";

// Mock ReflagClient prototype methods like the React SDK tests
beforeAll(() => {
  vi.spyOn(ReflagClient.prototype, "initialize").mockResolvedValue(undefined);
  vi.spyOn(ReflagClient.prototype, "stop").mockResolvedValue(undefined);
  vi.spyOn(ReflagClient.prototype, "getFlag").mockReturnValue({
    isEnabled: true,
    config: { key: "default", payload: { message: "Hello" } },
    track: vi.fn().mockResolvedValue(undefined),
    requestFeedback: vi.fn(),
    setIsEnabledOverride: vi.fn(),
    isEnabledOverride: null,
  });
  vi.spyOn(ReflagClient.prototype, "getFlags").mockReturnValue({});
  vi.spyOn(ReflagClient.prototype, "on").mockReturnValue(() => {
    // cleanup function
  });
  vi.spyOn(ReflagClient.prototype, "off").mockImplementation(() => {
    // off implementation
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

function getProvider() {
  return {
    props: {
      publishableKey: "key",
    },
  };
}

describe("ReflagProvider", () => {
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
  test("provides the client with bootstrapped flags", async () => {
    const bootstrappedFlags = {
      context: {
        user: { id: "test-user" },
        company: { id: "test-company" },
      },
      flags: {
        "test-flag": {
          key: "test-flag",
          isEnabled: true,
          config: { key: "default", payload: { message: "Hello" } },
        },
      },
    };

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
    expect(wrapper.findComponent(Child).vm.flag.isEnabled.value).toBe(true);
  });
});
