import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { ReflagProvider, useClient } from "../src";

const fakeClient = {
  initialize: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  on: vi.fn(),
};

function getProvider() {
  return {
    props: {
      publishableKey: "key",
      newReflagClient: () => fakeClient,
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
    expect(wrapper.findComponent(Child).vm.client).toStrictEqual(fakeClient);
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
