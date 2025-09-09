import React from "react";
import { render, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
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

import { ReflagClient } from "@reflag/browser-sdk";

import { version } from "../package.json";
import {
  ReflagProps,
  ReflagProvider,
  useClient,
  useFlag,
  useRequestFeedback,
  useSendFeedback,
  useTrack,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
} from "../src";

const events: string[] = [];
const originalConsoleError = console.error.bind(console);

afterEach(() => {
  events.length = 0;
  console.error = originalConsoleError;
});

const publishableKey = Math.random().toString();
const company = { id: "123", name: "test" };
const user = { id: "456", name: "test" };
const otherContext = { test: "test" };

function getProvider(props: Partial<ReflagProps> = {}) {
  return (
    <ReflagProvider
      company={company}
      otherContext={otherContext}
      publishableKey={publishableKey}
      user={user}
      {...props}
    />
  );
}

const server = setupServer(
  http.post(/\/event$/, () => {
    events.push("EVENT");
    return new HttpResponse(
      JSON.stringify({
        success: true,
      }),
      { status: 200 },
    );
  }),
  http.post(/\/feedback$/, () => {
    events.push("FEEDBACK");
    return new HttpResponse(
      JSON.stringify({
        success: true,
      }),
      { status: 200 },
    );
  }),
  http.get(/\/features\/evaluated$/, () => {
    return new HttpResponse(
      JSON.stringify({
        success: true,
        features: {
          abc: {
            key: "abc",
            isEnabled: true,
            targetingVersion: 1,
            config: {
              key: "gpt3",
              payload: { model: "gpt-something", temperature: 0.5 },
              version: 2,
            },
          },
          def: {
            key: "def",
            isEnabled: true,
            targetingVersion: 2,
          },
        },
      }),
      { status: 200 },
    );
  }),
  http.post(/\/user$/, () => {
    return new HttpResponse(
      JSON.stringify({
        success: true,
      }),
      { status: 200 },
    );
  }),
  http.post(/\/company$/, () => {
    return new HttpResponse(
      JSON.stringify({
        success: true,
      }),
      { status: 200 },
    );
  }),
  http.post(/feedback\/prompting-init$/, () => {
    return new HttpResponse(
      JSON.stringify({
        success: false,
      }),
      { status: 200 },
    );
  }),
  http.post(/\/features\/events$/, () => {
    return new HttpResponse(
      JSON.stringify({
        success: false,
      }),
      { status: 200 },
    );
  }),
);

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request) {
      console.error("Unhandled %s %s", request.method, request.url);
    },
  }),
);

afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeAll(() => {
  vi.spyOn(ReflagClient.prototype, "initialize");
  vi.spyOn(ReflagClient.prototype, "stop");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<ReflagProvider />", () => {
  test("calls initialize", () => {
    const on = vi.fn();

    const newReflagClient = vi.fn().mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      on,
    });

    const provider = getProvider({
      publishableKey: "KEY",
      apiBaseUrl: "https://apibaseurl.com",
      sseBaseUrl: "https://ssebaseurl.com",
      company: { id: "123", name: "test" },
      user: { id: "456", name: "test" },
      otherContext: { test: "test" },
      enableTracking: false,
      appBaseUrl: "https://appbaseurl.com",
      staleTimeMs: 1001,
      timeoutMs: 1002,
      expireTimeMs: 1003,
      staleWhileRevalidate: true,
      fallbackFlags: ["flag2"],
      feedback: { enableAutoFeedback: true },
      toolbar: { show: true },
      newReflagClient,
    });

    render(provider);

    expect(newReflagClient.mock.calls.at(0)).toStrictEqual([
      {
        publishableKey: "KEY",
        user: {
          id: "456",
          name: "test",
        },
        company: {
          id: "123",
          name: "test",
        },
        otherContext: {
          test: "test",
        },
        apiBaseUrl: "https://apibaseurl.com",
        appBaseUrl: "https://appbaseurl.com",
        sseBaseUrl: "https://ssebaseurl.com",
        logger: undefined,
        enableTracking: false,
        expireTimeMs: 1003,
        fallbackFlags: ["flag2"],
        feedback: {
          enableAutoFeedback: true,
        },
        staleTimeMs: 1001,
        staleWhileRevalidate: true,
        timeoutMs: 1002,
        toolbar: {
          show: true,
        },
        sdkVersion: `react-sdk/${version}`,
      },
    ]);

    expect(on).toBeTruthy();
  });

  test("only calls init once with the same args", () => {
    const node = getProvider();
    const initialize = vi.spyOn(ReflagClient.prototype, "initialize");

    const x = render(node);
    x.rerender(node);
    x.rerender(node);
    x.rerender(node);

    expect(initialize).toHaveBeenCalledOnce();
    expect(ReflagClient.prototype.stop).not.toHaveBeenCalledOnce();
  });

  test("resets loading state when context changes", async () => {
    const { queryByTestId, rerender } = render(
      getProvider({
        loadingComponent: <span data-testid="loading">Loading...</span>,
      }),
    );

    // Loading component should be visible initially
    expect(queryByTestId("loading")).not.toBeNull();

    // Wait for initial loading to complete
    await waitFor(() => {
      expect(queryByTestId("loading")).toBeNull();
    });

    // Change user context
    rerender(
      getProvider({
        loadingComponent: <span data-testid="loading">Loading...</span>,
        user: { ...user, id: "new-user-id" },
      }),
    );

    // Loading should appear again
    expect(queryByTestId("loading")).not.toBeNull();

    // Wait for loading to complete again
    await waitFor(() => {
      expect(queryByTestId("loading")).toBeNull();
    });

    // Change company context
    rerender(
      getProvider({
        loadingComponent: <span data-testid="loading">Loading...</span>,
        company: { ...company, id: "new-company-id" },
      }),
    );

    // Loading should appear again
    expect(queryByTestId("loading")).not.toBeNull();

    // Wait for loading to complete again
    await waitFor(() => {
      expect(queryByTestId("loading")).toBeNull();
    });
  });
});

describe("useFlag", () => {
  test("returns a loading state initially", async () => {
    const { result, unmount } = renderHook(() => useFlag("huddle"), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    expect(result.current).toStrictEqual({
      key: "huddle",
      isEnabled: false,
      isLoading: true,
      config: { key: undefined, payload: undefined },
      track: expect.any(Function),
      requestFeedback: expect.any(Function),
    });

    unmount();
  });

  test("finishes loading", async () => {
    const { result, unmount } = renderHook(() => useFlag("huddle"), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        key: "huddle",
        config: { key: undefined, payload: undefined },
        isEnabled: false,
        isLoading: false,
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
      });
    });

    unmount();
  });

  test("provides the expected values if flag is enabled", async () => {
    const { result, unmount } = renderHook(() => useFlag("abc"), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        key: "abc",
        isEnabled: true,
        isLoading: false,
        config: {
          key: "gpt3",
          payload: { model: "gpt-something", temperature: 0.5 },
        },
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
      });
    });

    unmount();
  });
});

describe("useTrack", () => {
  test("sends track request", async () => {
    const { result, unmount } = renderHook(() => useTrack(), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    await waitFor(async () => {
      await result.current("event", { test: "test" });
      expect(events).toStrictEqual(["EVENT"]);
    });

    unmount();
  });
});

describe("useSendFeedback", () => {
  test("sends feedback", async () => {
    const { result, unmount } = renderHook(() => useSendFeedback(), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    await waitFor(async () => {
      await result.current({
        flagKey: "huddles",
        score: 5,
      });
      expect(events).toStrictEqual(["FEEDBACK"]);
    });

    unmount();
  });
});

describe("useRequestFeedback", () => {
  test("sends feedback", async () => {
    const requestFeedback = vi
      .spyOn(ReflagClient.prototype, "requestFeedback")
      .mockReturnValue(undefined);

    const { result, unmount } = renderHook(() => useRequestFeedback(), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    await waitFor(async () => {
      result.current({
        flagKey: "huddles",
        title: "Test question",
        companyId: "456",
      });

      expect(requestFeedback).toHaveBeenCalledOnce();
      expect(requestFeedback).toHaveBeenCalledWith({
        flagKey: "huddles",
        companyId: "456",
        title: "Test question",
      });
    });

    unmount();
  });
});

describe("useUpdateUser", () => {
  test("updates user", async () => {
    const updateUser = vi
      .spyOn(ReflagClient.prototype, "updateUser")
      .mockResolvedValue(undefined);

    const { result: updateUserFn, unmount } = renderHook(
      () => useUpdateUser(),
      {
        wrapper: ({ children }) => getProvider({ children }),
      },
    );

    // todo: need this `waitFor` because useUpdateOtherContext
    // runs before `client` is initialized and then the call gets
    // lost.
    await waitFor(async () => {
      await updateUserFn.current({ optInHuddles: "true" });

      expect(updateUser).toHaveBeenCalledWith({
        optInHuddles: "true",
      });
    });

    unmount();
  });
});

describe("useUpdateCompany", () => {
  test("updates company", async () => {
    const updateCompany = vi
      .spyOn(ReflagClient.prototype, "updateCompany")
      .mockResolvedValue(undefined);

    const { result: updateCompanyFn, unmount } = renderHook(
      () => useUpdateCompany(),
      {
        wrapper: ({ children }) => getProvider({ children }),
      },
    );

    // todo: need this `waitFor` because useUpdateOtherContext
    // runs before `client` is initialized and then the call gets
    // lost.
    await waitFor(async () => {
      await updateCompanyFn.current({ optInHuddles: "true" });

      expect(updateCompany).toHaveBeenCalledWith({
        optInHuddles: "true",
      });
    });
    unmount();
  });
});

describe("useUpdateOtherContext", () => {
  test("updates other context", async () => {
    const updateOtherContext = vi
      .spyOn(ReflagClient.prototype, "updateOtherContext")
      .mockResolvedValue(undefined);

    const { result: updateOtherContextFn, unmount } = renderHook(
      () => useUpdateOtherContext(),
      {
        wrapper: ({ children }) => getProvider({ children }),
      },
    );

    // todo: need this `waitFor` because useUpdateOtherContext
    // runs before `client` is initialized and then the call gets
    // lost.
    await waitFor(async () => {
      await updateOtherContextFn.current({ optInHuddles: "true" });

      expect(updateOtherContext).toHaveBeenCalledWith({
        optInHuddles: "true",
      });
    });

    unmount();
  });
});

describe("useClient", () => {
  test("gets the client", async () => {
    const { result: clientFn, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    await waitFor(async () => {
      expect(clientFn.current).toBeDefined();
    });

    unmount();
  });
});
