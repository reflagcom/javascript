import { afterEach, describe, expect, it, vi } from "vitest";

import { FlagsCache, type FlagsCacheSnapshot } from "../src/flags-cache";

function createDefinitions(key: string) {
  return [{ key }] as any;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function scheduleTrailingRefresh(delayMs: number, callback: () => void) {
  const timer = setTimeout(callback, delayMs);
  return () => {
    clearTimeout(timer);
  };
}

describe("FlagsCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs one follow-up refresh with the highest pending version", async () => {
    const firstRefresh = createDeferred<any>();
    const fetchFlags = vi
      .fn()
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockResolvedValueOnce({
        definitions: createDefinitions("newest"),
        flagStateVersion: 22,
      });

    const cache = new FlagsCache(fetchFlags, { minRefreshIntervalMs: 0 });
    const refreshPromise = cache.refresh();

    await vi.waitFor(() => {
      expect(fetchFlags).toHaveBeenCalledTimes(1);
      expect(fetchFlags).toHaveBeenNthCalledWith(1, undefined);
    });

    void cache.refresh(21);
    void cache.refresh(22);
    void cache.refresh();

    firstRefresh.resolve({
      definitions: createDefinitions("first"),
      flagStateVersion: 20,
    });

    await vi.waitFor(() => {
      expect(fetchFlags).toHaveBeenCalledTimes(2);
      expect(fetchFlags).toHaveBeenNthCalledWith(2, 22);
    });

    await refreshPromise;
    expect(fetchFlags).toHaveBeenCalledTimes(2);
    expect(cache.get()).toEqual(createDefinitions("newest"));
  });

  it("skips a pending versioned refresh when the in-flight response already satisfies it", async () => {
    const firstRefresh = createDeferred<any>();
    const fetchFlags = vi
      .fn()
      .mockImplementationOnce(() => firstRefresh.promise);

    const cache = new FlagsCache(fetchFlags, { minRefreshIntervalMs: 0 });
    const refreshPromise = cache.refresh();

    await vi.waitFor(() => {
      expect(fetchFlags).toHaveBeenCalledTimes(1);
    });

    void cache.refresh(22);

    firstRefresh.resolve({
      definitions: createDefinitions("latest"),
      flagStateVersion: 30,
    });

    await refreshPromise;
    expect(fetchFlags).toHaveBeenCalledTimes(1);
    expect(cache.get()).toEqual(createDefinitions("latest"));
  });

  it("does not replace cached definitions with an older flag state version", async () => {
    const fetchFlags = vi
      .fn()
      .mockResolvedValueOnce({
        definitions: createDefinitions("newer"),
        flagStateVersion: 30,
      })
      .mockResolvedValueOnce({
        definitions: createDefinitions("older"),
        flagStateVersion: 20,
      });

    const cache = new FlagsCache(fetchFlags, { minRefreshIntervalMs: 0 });

    await cache.refresh();
    await cache.refresh();

    expect(cache.get()).toEqual(createDefinitions("newer"));
  });

  it("does not let a 304 satisfy a pending newer version", async () => {
    const revalidation = createDeferred<any>();
    const fetchFlags = vi
      .fn()
      .mockResolvedValueOnce({
        definitions: createDefinitions("first"),
        flagStateVersion: 1,
        etag: '"v1"',
      })
      .mockImplementationOnce(() => revalidation.promise)
      .mockResolvedValueOnce({
        definitions: createDefinitions("newer"),
        flagStateVersion: 2,
        etag: '"v2"',
      });
    const cache = new FlagsCache(fetchFlags, { minRefreshIntervalMs: 0 });
    await cache.refresh();
    const refreshPromise = cache.refresh();
    const versionPromise = cache.refresh(2);
    revalidation.resolve({ notModified: true });
    await Promise.all([refreshPromise, versionPromise]);

    expect(fetchFlags).toHaveBeenCalledTimes(3);
    expect(fetchFlags).toHaveBeenNthCalledWith(3, 2);
    expect(cache.getFlagStateVersion()).toBe(2);
    expect(cache.getETag()).toBe('"v2"');
  });

  it.each([
    ["succeeds", '"old"'],
    ["fails", undefined],
  ])(
    "does not replace a newer validator when an older save %s",
    async (_, etag) => {
      const definitions = createDefinitions("unchanged");
      const older: FlagsCacheSnapshot = {
        definitions,
        flagStateVersion: 1,
      };
      const fetchFlags = vi
        .fn()
        .mockResolvedValueOnce(older)
        .mockResolvedValueOnce({
          definitions,
          flagStateVersion: 2,
          etag: '"newer"',
        });
      const cache = new FlagsCache(fetchFlags, { minRefreshIntervalMs: 0 });
      await cache.refresh();
      expect(cache.getETag()).toBeUndefined();
      await cache.refresh();
      older.etag = etag;

      expect(cache.getFlagStateVersion()).toBe(2);
      expect(cache.getETag()).toBe('"newer"');
    },
  );

  it("does not restore a late validator after destruction", async () => {
    const snapshot: FlagsCacheSnapshot = {
      definitions: createDefinitions("first"),
      flagStateVersion: 1,
    };
    const cache = new FlagsCache(async () => snapshot);
    await cache.refresh();
    cache.destroy();
    snapshot.etag = '"first"';

    expect(cache.get()).toBeUndefined();
    expect(cache.getETag()).toBeUndefined();
  });

  it("does not apply a refresh or validator after destruction", async () => {
    const response = createDeferred<any>();
    const cache = new FlagsCache(() => response.promise);
    const refreshPromise = cache.refresh();
    cache.destroy();
    response.resolve({
      definitions: createDefinitions("late"),
      flagStateVersion: 1,
      etag: '"late"',
    });
    await refreshPromise;

    expect(cache.get()).toBeUndefined();
    expect(cache.getETag()).toBeUndefined();
    expect(cache.getLastRefreshAt()).toBeUndefined();
  });

  it("throttles refreshes and runs one trailing refresh when scheduling is supported", async () => {
    vi.useFakeTimers();

    const fetchFlags = vi
      .fn()
      .mockResolvedValueOnce({
        definitions: createDefinitions("first"),
        flagStateVersion: 10,
      })
      .mockResolvedValueOnce({
        definitions: createDefinitions("second"),
        flagStateVersion: 20,
      });

    const cache = new FlagsCache(fetchFlags, {
      scheduleTrailingRefresh,
    });

    await cache.refresh();
    const refreshPromise = cache.refresh(20);

    expect(fetchFlags).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchFlags).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await refreshPromise;

    expect(fetchFlags).toHaveBeenCalledTimes(2);
    expect(fetchFlags).toHaveBeenNthCalledWith(2, 20);
    expect(cache.get()).toEqual(createDefinitions("second"));
  });

  it("uses a simple throttle when trailing scheduling is unavailable", async () => {
    vi.useFakeTimers();

    const fetchFlags = vi
      .fn()
      .mockResolvedValueOnce({
        definitions: createDefinitions("first"),
        flagStateVersion: 10,
      })
      .mockResolvedValueOnce({
        definitions: createDefinitions("second"),
        flagStateVersion: 20,
      });

    const cache = new FlagsCache(fetchFlags);

    await cache.refresh();
    await cache.refresh(20);

    expect(fetchFlags).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFlags).toHaveBeenCalledTimes(1);

    await cache.refresh(20);

    expect(fetchFlags).toHaveBeenCalledTimes(2);
    expect(fetchFlags).toHaveBeenNthCalledWith(2, 20);
    expect(cache.get()).toEqual(createDefinitions("second"));
  });
});
