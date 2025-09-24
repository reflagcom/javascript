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

import {
  BootstrappedFlags,
  ReflagBootstrappedProvider,
  ReflagClientProvider,
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
const other = { test: "test" };

function getProvider(props: Partial<ReflagProps> = {}) {
  return (
    <ReflagProvider
      context={{ user, company, other }}
      publishableKey={publishableKey}
      {...props}
    />
  );
}

function getBootstrapProvider(
  bootstrapFlags: BootstrappedFlags,
  props: Partial<Omit<ReflagProps, "user" | "company" | "otherContext">> = {},
) {
  return (
    <ReflagBootstrappedProvider
      flags={bootstrapFlags}
      publishableKey={publishableKey}
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
    const initialize = vi.spyOn(ReflagClient.prototype, "initialize");

    const provider = getProvider({
      publishableKey: "KEY",
      apiBaseUrl: "https://apibaseurl.com",
      sseBaseUrl: "https://ssebaseurl.com",
      context: {
        user: { id: "456", name: "test" },
        company: { id: "123", name: "test" },
        other: { test: "test" },
      },
      enableTracking: false,
      appBaseUrl: "https://appbaseurl.com",
      staleTimeMs: 1001,
      timeoutMs: 1002,
      expireTimeMs: 1003,
      staleWhileRevalidate: true,
      fallbackFlags: ["flag2"],
      feedback: { enableAutoFeedback: true },
      toolbar: { show: true },
    });

    render(provider);

    expect(initialize).toHaveBeenCalled();
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

  test("handles context changes", async () => {
    const { queryByTestId, rerender } = render(
      getProvider({
        loadingComponent: <span data-testid="loading">Loading...</span>,
        children: <span data-testid="content">Content</span>,
      }),
    );

    // Wait for content to be visible
    await waitFor(() => {
      expect(queryByTestId("content")).not.toBeNull();
    });

    // Change user context
    rerender(
      getProvider({
        loadingComponent: <span data-testid="loading">Loading...</span>,
        user: { ...user, id: "new-user-id" },
        children: <span data-testid="content">Content</span>,
      }),
    );

    // Content should still be visible
    await waitFor(() => {
      expect(queryByTestId("content")).not.toBeNull();
    });

    // Change company context
    rerender(
      getProvider({
        loadingComponent: <span data-testid="loading">Loading...</span>,
        company: { ...company, id: "new-company-id" },
        children: <span data-testid="content">Content</span>,
      }),
    );

    // Content should still be visible
    await waitFor(() => {
      expect(queryByTestId("content")).not.toBeNull();
    });
  });
});

describe("useFlag", () => {
  test("returns a loading state initially", async () => {
    const { result, unmount } = renderHook(() => useFlag("huddle"), {
      wrapper: ({ children }) => getProvider({ children }),
    });

    // The flag should exist but may be loading or not depending on implementation
    expect(result.current.key).toBe("huddle");
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.config).toEqual({
      key: undefined,
      payload: undefined,
    });
    expect(typeof result.current.track).toBe("function");
    expect(typeof result.current.requestFeedback).toBe("function");

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

describe("<ReflagBootstrappedProvider />", () => {
  test("renders with pre-fetched flags", () => {
    const bootstrapFlags: BootstrappedFlags = {
      context: {
        user: { id: "456", name: "test" },
        company: { id: "123", name: "test" },
        other: { test: "test" },
      },
      flags: {
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
    };

    const { container } = render(
      getBootstrapProvider(bootstrapFlags, {
        publishableKey: "KEY",
        apiBaseUrl: "https://apibaseurl.com",
        sseBaseUrl: "https://ssebaseurl.com",
        enableTracking: false,
        appBaseUrl: "https://appbaseurl.com",
        staleTimeMs: 1001,
        timeoutMs: 1002,
        expireTimeMs: 1003,
        staleWhileRevalidate: true,
        fallbackFlags: ["flag2"],
        feedback: { enableAutoFeedback: true },
        toolbar: { show: true },
        children: <span>Test Content</span>,
      }),
    );

    expect(container).toBeDefined();
  });

  test("renders in bootstrap mode", () => {
    const bootstrapFlags: BootstrappedFlags = {
      context: {
        user: { id: "456", name: "test" },
        company: { id: "123", name: "test" },
        other: { test: "test" },
      },
      flags: {
        abc: {
          key: "abc",
          isEnabled: true,
          targetingVersion: 1,
        },
      },
    };

    const { container } = render(
      getBootstrapProvider(bootstrapFlags, {
        children: <span>Bootstrap Content</span>,
      }),
    );

    expect(container).toBeDefined();
  });

  // Removed test "does not initialize when no flags are provided"
  // because ReflagBootstrappedProvider requires flags to be provided

  test("shows content after initialization", async () => {
    const bootstrapFlags: BootstrappedFlags = {
      context: {
        user: { id: "456", name: "test" },
        company: { id: "123", name: "test" },
        other: { test: "test" },
      },
      flags: {
        abc: {
          key: "abc",
          isEnabled: true,
          targetingVersion: 1,
        },
      },
    };

    const { container } = render(
      getBootstrapProvider(bootstrapFlags, {
        loadingComponent: <span data-testid="loading">Loading...</span>,
        children: <span data-testid="bootstrap-content">Content</span>,
      }),
    );

    // Content should eventually be visible
    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="bootstrap-content"]'),
      ).not.toBeNull();
    });
  });

  // Removed test "shows loading component when no flags are provided"
  // because ReflagBootstrappedProvider requires flags to be provided
});

describe("useFlag with ReflagBootstrappedProvider", () => {
  test("returns bootstrapped flag values", async () => {
    const bootstrapFlags: BootstrappedFlags = {
      context: {
        user: { id: "456", name: "test" },
        company: { id: "123", name: "test" },
        other: { test: "test" },
      },
      flags: {
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
    };

    const { result, unmount } = renderHook(() => useFlag("abc"), {
      wrapper: ({ children }) =>
        getBootstrapProvider(bootstrapFlags, { children }),
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

  test("returns disabled flag for non-existent flags", async () => {
    const bootstrapFlags: BootstrappedFlags = {
      context: {
        user: { id: "456", name: "test" },
        company: { id: "123", name: "test" },
        other: { test: "test" },
      },
      flags: {
        abc: {
          key: "abc",
          isEnabled: true,
          targetingVersion: 1,
        },
      },
    };

    const { result, unmount } = renderHook(() => useFlag("nonexistent"), {
      wrapper: ({ children }) =>
        getBootstrapProvider(bootstrapFlags, { children }),
    });

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        key: "nonexistent",
        isEnabled: false,
        isLoading: false,
        config: {
          key: undefined,
          payload: undefined,
        },
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
      });
    });

    unmount();
  });

  // Removed test "returns loading state when no flags are bootstrapped"
  // because ReflagBootstrappedProvider requires flags to be provided
});

describe("<ReflagClientProvider />", () => {
  test("renders with external client and optional loadingComponent", async () => {
    const client = new ReflagClient({
      publishableKey: "test-key",
      user,
      company,
      other,
    });

    const { container } = render(
      <ReflagClientProvider client={client}>
        <span data-testid="content">Test Content</span>
      </ReflagClientProvider>,
    );

    expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
  });

  test("renders with external client and loadingComponent", async () => {
    const client = new ReflagClient({
      publishableKey: "test-key",
      user,
      company,
      other,
    });

    const { container } = render(
      <ReflagClientProvider
        client={client}
        loadingComponent={<span data-testid="loading">Loading...</span>}
      >
        <span data-testid="content">Test Content</span>
      </ReflagClientProvider>,
    );

    // Initially may show loading or content depending on client state
    expect(container).toBeDefined();
  });

  test("provides client to child components", async () => {
    const client = new ReflagClient({
      publishableKey: "test-key",
      user,
      company,
      other,
    });

    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagClientProvider client={client}>{children}</ReflagClientProvider>
      ),
    });

    expect(result.current).toBe(client);

    // Verify that the external client maintains its context
    const context = result.current.getContext();
    expect(context.user).toEqual(user);
    expect(context.company).toEqual(company);
    expect(context.other).toEqual(other);

    unmount();
  });

  test("handles client state changes", async () => {
    const client = new ReflagClient({
      publishableKey: "test-key-state-changes",
      user,
      company,
      other,
    });

    const { container } = render(
      <ReflagClientProvider
        client={client}
        loadingComponent={<span data-testid="client-loading">Loading...</span>}
      >
        <span data-testid="client-content">Content</span>
      </ReflagClientProvider>,
    );

    // The component should handle state changes properly
    expect(
      container.querySelector('[data-testid="client-content"]') ||
        container.querySelector('[data-testid="client-loading"]'),
    ).not.toBeNull();
  });

  test("works with useFlag hook", async () => {
    const client = new ReflagClient({
      publishableKey: "test-key",
      user,
      company,
      other,
    });

    const { result, unmount } = renderHook(() => useFlag("test-flag"), {
      wrapper: ({ children }) => (
        <ReflagClientProvider client={client}>{children}</ReflagClientProvider>
      ),
    });

    expect(result.current.key).toBe("test-flag");
    expect(typeof result.current.track).toBe("function");
    expect(typeof result.current.requestFeedback).toBe("function");

    unmount();
  });
});

describe("ReflagProvider with deprecated properties", () => {
  test("works with deprecated user property", async () => {
    const deprecatedUser = { id: "deprecated-user", name: "Deprecated User" };
    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagProvider
          context={{}}
          publishableKey="test-key-1"
          user={deprecatedUser}
        >
          {children}
        </ReflagProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      const context = result.current.getContext();
      expect(context.user).toEqual(deprecatedUser);
      expect(context.company).toBeUndefined();
      expect(context.other).toEqual({});
    });

    unmount();
  });

  test("works with deprecated company property", async () => {
    const deprecatedCompany = {
      id: "deprecated-company",
      name: "Deprecated Company",
    };
    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagProvider
          company={deprecatedCompany}
          context={{}}
          publishableKey="test-key-2"
        >
          {children}
        </ReflagProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      const context = result.current.getContext();
      expect(context.company).toEqual(deprecatedCompany);
      expect(context.user).toBeUndefined();
      expect(context.other).toEqual({});
    });

    unmount();
  });

  test("works with deprecated otherContext property", async () => {
    const deprecatedOtherContext = { workspace: "deprecated-workspace" };
    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagProvider
          context={{}}
          otherContext={deprecatedOtherContext}
          publishableKey="test-key-3"
        >
          {children}
        </ReflagProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      const context = result.current.getContext();
      expect(context.other).toEqual(deprecatedOtherContext);
      expect(context.user).toBeUndefined();
      expect(context.company).toBeUndefined();
    });

    unmount();
  });

  test("context property overrides deprecated properties", async () => {
    const contextUser = { id: "context-user", name: "Context User" };
    const contextCompany = { id: "context-company", name: "Context Company" };
    const contextOther = { workspace: "context-workspace" };

    const deprecatedUser = { id: "deprecated-user", name: "Deprecated User" };
    const deprecatedCompany = {
      id: "deprecated-company",
      name: "Deprecated Company",
    };
    const deprecatedOtherContext = { workspace: "deprecated-workspace" };

    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagProvider
          company={deprecatedCompany}
          context={{
            user: contextUser,
            company: contextCompany,
            other: contextOther,
          }}
          otherContext={deprecatedOtherContext}
          publishableKey="test-key-4"
          user={deprecatedUser}
        >
          {children}
        </ReflagProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      const context = result.current.getContext();
      // The context property should override deprecated properties
      expect(context.user).toEqual(contextUser);
      expect(context.company).toEqual(contextCompany);
      expect(context.other).toEqual(contextOther);
    });

    unmount();
  });

  test("merges deprecated properties with context", async () => {
    const contextUser = { id: "context-user", email: "context@example.com" };
    const deprecatedUser = { id: "deprecated-user", name: "Deprecated User" };
    const deprecatedCompany = {
      id: "deprecated-company",
      name: "Deprecated Company",
    };

    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagProvider
          company={deprecatedCompany}
          context={{
            user: contextUser,
          }}
          publishableKey="test-key-5"
          user={deprecatedUser}
        >
          {children}
        </ReflagProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      const context = result.current.getContext();
      // The context user should override the deprecated user,
      // but deprecated company should still be present
      expect(context.user).toEqual(contextUser);
      expect(context.company).toEqual(deprecatedCompany);
      expect(context.other).toEqual({});
    });

    unmount();
  });

  test("handles all deprecated properties together", async () => {
    const deprecatedUser = { id: "deprecated-user", name: "Deprecated User" };
    const deprecatedCompany = {
      id: "deprecated-company",
      name: "Deprecated Company",
    };
    const deprecatedOtherContext = {
      workspace: "deprecated-workspace",
      feature: "test",
    };

    const { result, unmount } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ReflagProvider
          company={deprecatedCompany}
          context={{}}
          otherContext={deprecatedOtherContext}
          publishableKey="test-key-6"
          user={deprecatedUser}
        >
          {children}
        </ReflagProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      const context = result.current.getContext();
      // All deprecated properties should be properly set
      expect(context.user).toEqual(deprecatedUser);
      expect(context.company).toEqual(deprecatedCompany);
      expect(context.other).toEqual(deprecatedOtherContext);
    });

    unmount();
  });
});
