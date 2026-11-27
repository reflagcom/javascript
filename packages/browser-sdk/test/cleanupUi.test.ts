import { options } from "preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ReflagClient } from "../src/client";
import { showToolbarToggle } from "../src/toolbar";
import { toolbarContainerId } from "../src/ui/constants";
import { cleanupUi } from "./cleanupUi";

let effects: (() => void)[];
let renders: (() => void)[];
const originalRaf = options.requestAnimationFrame;
const originalDebounce = options.debounceRendering;

beforeEach(() => {
  effects = [];
  renders = [];
  // Hold the actual Preact callbacks so teardown timing is deterministic.
  options.requestAnimationFrame = (callback) => effects.push(callback);
  options.debounceRendering = (callback) => renders.push(callback);
});

function drainCallbacks() {
  while (effects.length || renders.length) {
    effects.shift()?.();
    renders.shift()?.();
  }
}

function withoutSessionStorage(callback: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  )!;
  Reflect.deleteProperty(globalThis, "sessionStorage");
  try {
    callback();
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", descriptor);
  }
}

function createToolbarClient() {
  return new ReflagClient({
    publishableKey: "test-key",
    offline: true,
    toolbar: false,
  });
}

function mountToolbar() {
  const client = createToolbarClient();
  const unsubscribe = vi.fn();
  const on = vi.spyOn(client, "on").mockReturnValue(unsubscribe);
  showToolbarToggle({ reflagClient: client });
  expect(document.getElementById(toolbarContainerId)).not.toBeNull();
  return { on, unsubscribe };
}

afterEach(() => {
  cleanupUi();
  drainCallbacks();
  options.requestAnimationFrame = originalRaf;
  options.debounceRendering = originalDebounce;
  vi.restoreAllMocks();
});

test.each([
  { override: false, clearControl: "reset link" },
  { override: true, clearControl: "reset link" },
  { override: false, clearControl: "switch" },
  { override: true, clearControl: "switch" },
])(
  "shows a $override override as active and clears it with the $clearControl",
  async ({ override, clearControl }) => {
    const client = createToolbarClient();
    client.updateFlags({
      release: {
        value: !override,
        resolved: false,
        ruleResults: [],
        errors: [],
      },
    });
    const getOverride = vi.spyOn(client, "getFlagOverride");
    const getFlag = vi.spyOn(client, "getFlag");
    const getFlags = vi.spyOn(client, "getFlags");

    showToolbarToggle({ reflagClient: client });
    drainCallbacks();

    const root = document.getElementById(toolbarContainerId)!.shadowRoot!;
    const checkbox = root.querySelector<HTMLInputElement>(".switch-input")!;
    const overrideIndicator = () =>
      root.querySelector(".override-indicator.show");
    expect(getOverride).toHaveBeenCalledExactlyOnceWith("release");
    expect(checkbox.checked).toBe(!override);
    expect(overrideIndicator()).toBeNull();

    getOverride.mockClear();
    checkbox.click();
    drainCallbacks();
    expect(getOverride).toHaveBeenCalledExactlyOnceWith("release");
    expect(client.getFlagOverride("release")).toBe(override);
    expect(checkbox.checked).toBe(override);
    expect(overrideIndicator()).not.toBeNull();

    const resetLink = root.querySelector<HTMLAnchorElement>(".reset")!;
    expect(resetLink).not.toBeNull();
    (clearControl === "reset link" ? resetLink : checkbox).click();
    drainCallbacks();
    expect(client.getFlagOverride("release")).toBeUndefined();
    expect(checkbox.checked).toBe(!override);
    expect(overrideIndicator()).toBeNull();
    expect(root.querySelector(".reset")).toBeNull();
    expect(getFlag).not.toHaveBeenCalled();
    expect(getFlags).not.toHaveBeenCalled();
    await client.stop();
  },
);

test("unmounts before a delayed toolbar effect can run after jsdom teardown", () => {
  const { on } = mountToolbar();
  expect(effects.length).toBeGreaterThan(0);

  cleanupUi();

  withoutSessionStorage(() => {
    expect(drainCallbacks).not.toThrow();
  });
  expect(on).not.toHaveBeenCalled();
  expect(document.getElementById(toolbarContainerId)).toBeNull();
});

test("cancels queued toolbar renders and unsubscribes mounted effects", () => {
  const { unsubscribe } = mountToolbar();
  // Run useEffect: updateFlags queues a render and subscribes to flagsUpdated.
  while (effects.length) effects.shift()!();
  expect(renders.length).toBeGreaterThan(0);

  cleanupUi();

  withoutSessionStorage(() => {
    expect(drainCallbacks).not.toThrow();
  });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(document.getElementById(toolbarContainerId)).toBeNull();
});
