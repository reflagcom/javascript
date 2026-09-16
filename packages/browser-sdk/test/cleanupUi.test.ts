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

function mountToolbar() {
  const client = new ReflagClient({
    publishableKey: "test-key",
    offline: true,
    toolbar: false,
  });
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
