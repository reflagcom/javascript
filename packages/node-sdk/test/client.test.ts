import flushPromises from "flush-promises";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from "vitest";

import { flattenJSON } from "@reflag/flag-evaluation";

import { BoundReflagClient, ReflagClient } from "../src";
import {
  API_BASE_URL,
  API_TIMEOUT_MS,
  BATCH_INTERVAL_MS,
  BATCH_MAX_SIZE,
  FLAG_EVENT_RATE_LIMITER_WINDOW_SIZE_MS,
  FLAGS_REFETCH_MS,
  SDK_VERSION,
  SDK_VERSION_HEADER_NAME,
} from "../src/config";
import fetchClient from "../src/fetch-http-client";
import { subscribe as triggerOnExit } from "../src/flusher";
import { newRateLimiter } from "../src/rate-limiter";
import { ClientOptions, Context, FlagsAPIResponse } from "../src/types";

const BULK_ENDPOINT = "https://api.example.com/bulk";

vi.mock("../src/rate-limiter", async (importOriginal) => {
  const original = (await importOriginal()) as any;

  return {
    ...original,
    newRateLimiter: vi.fn(original.newRateLimiter),
  };
});

vi.mock("../src/flusher", () => ({
  subscribe: vi.fn(),
}));

const user = {
  id: "user123",
  age: 1,
  name: "John",
};

const company = {
  id: "company123",
  employees: 100,
  name: "Acme Inc.",
};

const event = {
  event: "flag-event",
  attrs: { key: "value" },
};

const otherContext = { custom: "context", key: "value" };
const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
const httpClient = { post: vi.fn(), get: vi.fn() };

const fallbackFlags = ["key"];

const validOptions: ClientOptions = {
  secretKey: "validSecretKeyWithMoreThan22Chars",
  apiBaseUrl: "https://api.example.com/",
  logger,
  httpClient,
  fallbackFlags,
  flagsFetchRetries: 2,
  batchOptions: {
    maxSize: 99,
    intervalMs: 10001,
    flushOnExit: false,
  },
  offline: false,
};

const expectedHeaders = {
  [SDK_VERSION_HEADER_NAME]: SDK_VERSION,
  "Content-Type": "application/json",
  Authorization: `Bearer ${validOptions.secretKey}`,
};

const flagDefinitions: FlagsAPIResponse = {
  features: [
    {
      key: "flag1",
      description: "Flag 1",
      targeting: {
        version: 1,
        rules: [
          {
            filter: {
              type: "context" as const,
              field: "company.id",
              operator: "IS",
              values: ["company123"],
            },
          },
        ],
      },
      config: {
        version: 1,
        variants: [
          {
            filter: {
              type: "context",
              field: "company.id",
              operator: "IS",
              values: ["company123"],
            },
            key: "config-1",
            payload: { something: "else" },
          },
        ],
      },
    },
    {
      key: "flag2",
      description: "Flag 2",
      targeting: {
        version: 2,
        rules: [
          {
            filter: {
              type: "group" as const,
              operator: "and",
              filters: [
                {
                  type: "context" as const,
                  field: "company.id",
                  operator: "IS",
                  values: ["company123"],
                },
                {
                  partialRolloutThreshold: 0.5,
                  partialRolloutAttribute: "attributeKey",
                  type: "rolloutPercentage" as const,
                  key: "flag2",
                },
              ],
            },
          },
        ],
      },
    },
  ],
};

describe("ReflagClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with no options", async () => {
      const secretKeyEnv = process.env.REFLAG_SECRET_KEY;
      process.env.REFLAG_SECRET_KEY = "validSecretKeyWithMoreThan22Chars";
      try {
        const reflagInstance = new ReflagClient();
        expect(reflagInstance).toBeInstanceOf(ReflagClient);
      } finally {
        process.env.REFLAG_SECRET_KEY = secretKeyEnv;
      }
    });

    it("should accept fallback flags as an array", async () => {
      const reflagInstance = new ReflagClient({
        secretKey: "validSecretKeyWithMoreThan22Chars",
        fallbackFlags: ["flag1", "flag2"],
      });

      expect(reflagInstance["_config"].fallbackFlags).toEqual({
        flag1: {
          isEnabled: true,
          key: "flag1",
        },
        flag2: {
          isEnabled: true,
          key: "flag2",
        },
      });
    });

    it("should accept fallback flags as an object", async () => {
      const reflagInstance = new ReflagClient({
        secretKey: "validSecretKeyWithMoreThan22Chars",
        fallbackFlags: {
          flag1: true,
          flag2: {
            isEnabled: true,
            config: {
              key: "config1",
              payload: { value: true },
            },
          },
        },
      });

      expect(reflagInstance["_config"].fallbackFlags).toStrictEqual({
        flag1: {
          key: "flag1",
          config: undefined,
          isEnabled: true,
        },
        flag2: {
          key: "flag2",
          isEnabled: true,
          config: {
            key: "config1",
            payload: { value: true },
          },
        },
      });
    });

    it("should create a client instance with valid options", () => {
      const client = new ReflagClient(validOptions);

      expect(client).toBeInstanceOf(ReflagClient);
      expect(client["_config"].apiBaseUrl).toBe("https://api.example.com/");
      expect(client["_config"].refetchInterval).toBe(FLAGS_REFETCH_MS);
      expect(client["_config"].staleWarningInterval).toBe(FLAGS_REFETCH_MS * 5);
      expect(client.logger).toBeDefined();
      expect(client.httpClient).toBe(validOptions.httpClient);
      expect(client["_config"].headers).toEqual(expectedHeaders);
      expect(client["batchBuffer"]).toMatchObject({
        maxSize: 99,
        intervalMs: 10001,
      });

      expect(client["_config"].fallbackFlags).toEqual({
        key: {
          key: "key",
          isEnabled: true,
        },
      });
      expect(client["_config"].flagsFetchRetries).toBe(2);
    });

    it("should route messages to the supplied logger", () => {
      const client = new ReflagClient(validOptions);

      const actualLogger = client.logger!;
      actualLogger.debug("debug message");
      actualLogger.info("info message");
      actualLogger.warn("warn message");
      actualLogger.error("error message");

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringMatching("debug message"),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching("info message"),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching("warn message"),
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching("error message"),
      );
    });

    it("should create a client instance with default values for optional fields", () => {
      const client = new ReflagClient({
        secretKey: "validSecretKeyWithMoreThan22Chars",
      });

      expect(client["_config"].apiBaseUrl).toBe(API_BASE_URL);
      expect(client["_config"].refetchInterval).toBe(FLAGS_REFETCH_MS);
      expect(client["_config"].staleWarningInterval).toBe(FLAGS_REFETCH_MS * 5);
      expect(client.httpClient).toBe(fetchClient);
      expect(client["_config"].headers).toEqual(expectedHeaders);
      expect(client["_config"].fallbackFlags).toBeUndefined();
      expect(client["batchBuffer"]).toMatchObject({
        maxSize: BATCH_MAX_SIZE,
        intervalMs: BATCH_INTERVAL_MS,
      });
    });

    it("should throw an error if options are invalid", () => {
      let invalidOptions: any = null;
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "options must be an object",
      );

      invalidOptions = { ...validOptions, secretKey: "shortKey" };
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "invalid secretKey specified",
      );

      invalidOptions = { ...validOptions, host: 123 };
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "host must be a string",
      );

      invalidOptions = {
        ...validOptions,
        logger: "invalidLogger" as any,
      };
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "logger must be an object",
      );

      invalidOptions = {
        ...validOptions,
        httpClient: "invalidHttpClient" as any,
      };
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "httpClient must be an object",
      );

      invalidOptions = {
        ...validOptions,
        batchOptions: "invalid" as any,
      };
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "batchOptions must be an object",
      );

      invalidOptions = {
        ...validOptions,
        fallbackFlags: "invalid" as any,
      };
      expect(() => new ReflagClient(invalidOptions)).toThrow(
        "fallbackFlags must be an array or object",
      );
    });

    it("should create a new flag events rate-limiter", () => {
      const client = new ReflagClient(validOptions);

      expect(client["rateLimiter"]).toBeDefined();
      expect(newRateLimiter).toHaveBeenCalledWith(
        FLAG_EVENT_RATE_LIMITER_WINDOW_SIZE_MS,
      );
    });

    it("should not register an exit flush handler if `batchOptions.flushOnExit` is false", () => {
      new ReflagClient({
        ...validOptions,
        batchOptions: { ...validOptions.batchOptions, flushOnExit: false },
      });

      expect(triggerOnExit).not.toHaveBeenCalled();
    });

    it("should not register an exit flush handler if `offline` is true", () => {
      new ReflagClient({
        ...validOptions,
        offline: true,
      });

      expect(triggerOnExit).not.toHaveBeenCalled();
    });

    it.each([undefined, true])(
      "should register an exit flush handler if `batchOptions.flushOnExit` is `%s`",
      (flushOnExit) => {
        new ReflagClient({
          ...validOptions,
          batchOptions: { ...validOptions.batchOptions, flushOnExit },
        });

        expect(triggerOnExit).toHaveBeenCalledWith(expect.any(Function));
      },
    );

    it.each([
      ["https://api.example.com", "https://api.example.com/bulk"],
      ["https://api.example.com/", "https://api.example.com/bulk"],
      ["https://api.example.com/path", "https://api.example.com/path/bulk"],
      ["https://api.example.com/path/", "https://api.example.com/path/bulk"],
    ])(
      "should build the URLs correctly %s -> %s",
      async (apiBaseUrl, expectedUrl) => {
        const client = new ReflagClient({
          ...validOptions,
          apiBaseUrl,
        });

        await client.updateUser("user_id");
        await client.flush();

        expect(httpClient.post).toHaveBeenCalledWith(
          expectedUrl,
          expect.any(Object),
          expect.any(Object),
        );
      },
    );
  });

  describe("bindClient", () => {
    const client = new ReflagClient(validOptions);
    const context = {
      user,
      company,
      other: otherContext,
    };

    beforeEach(() => {
      vi.mocked(httpClient.post).mockResolvedValue({ body: { success: true } });
      client["rateLimiter"].clearStale(true);
    });

    it("should return a new client instance with the `user`, `company` and `other` set", async () => {
      const newClient = client.bindClient(context);
      await client.flush();

      expect(newClient.user).toEqual(user);
      expect(newClient.company).toEqual(company);
      expect(newClient.otherContext).toEqual(otherContext);

      expect(newClient).toBeInstanceOf(BoundReflagClient);
      expect(newClient).not.toBe(client); // Ensure a new instance is returned
      expect(newClient["_options"]).toEqual({
        enableTracking: true,
        ...context,
      });
    });

    it("should update user in Reflag when called", async () => {
      client.bindClient({ user: context.user });
      await client.flush();

      const { id: _, ...attributes } = context.user;

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            type: "user",
            userId: user.id,
            attributes: attributes,
            context: undefined,
          },
        ],
      );

      expect(httpClient.post).toHaveBeenCalledOnce();
    });

    it("should update company in Reflag when called", async () => {
      client.bindClient({ company: context.company, meta: { active: true } });
      await client.flush();

      const { id: _, ...attributes } = context.company;

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            type: "company",
            companyId: company.id,
            attributes: attributes,
            context: {
              active: true,
            },
          },
        ],
      );

      expect(httpClient.post).toHaveBeenCalledOnce();
    });

    it("should not update `company` or `user` in Reflag when `enableTracking` is `false`", async () => {
      client.bindClient({
        user: context.user,
        company: context.company,
        enableTracking: false,
      });

      await client.flush();

      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it("should throw an error if `user` is invalid", () => {
      expect(() =>
        client.bindClient({ user: "bad_attributes" as any }),
      ).toThrow("validation failed: user must be an object if given");
      expect(() => client.bindClient({ user: { id: {} as any } })).toThrow(
        "validation failed: user.id must be a string or number if given",
      );
    });

    it("should throw an error if `company` is invalid", () => {
      expect(() =>
        client.bindClient({ company: "bad_attributes" as any }),
      ).toThrow("validation failed: company must be an object if given");
      expect(() => client.bindClient({ company: { id: {} as any } })).toThrow(
        "validation failed: company.id must be a string or number if given",
      );
    });

    it("should throw an error if `other` is invalid", () => {
      expect(() =>
        client.bindClient({ other: "bad_attributes" as any }),
      ).toThrow("validation failed: other must be an object");
    });

    it("should throw an error if `enableTracking` is invalid", () => {
      expect(() =>
        client.bindClient({ enableTracking: "bad_attributes" as any }),
      ).toThrow("validation failed: enableTracking must be a boolean");
    });

    it("should allow context without id", () => {
      const c = client.bindClient({
        user: { id: undefined, name: "userName" },
        company: { id: undefined, name: "companyName" },
      });
      expect(c.user?.id).toBeUndefined();
      expect(c.company?.id).toBeUndefined();
    });
  });

  describe("updateUser", () => {
    const client = new ReflagClient(validOptions);

    beforeEach(() => {
      client["rateLimiter"].clearStale(true);
    });

    // try with both string and number IDs
    test.each([
      { id: "user123", age: 1, name: "John" },
      { id: 42, age: 1, name: "John" },
    ])("should successfully update the user", async (testUser) => {
      const response = { status: 200, body: { success: true } };
      httpClient.post.mockResolvedValue(response);

      await client.updateUser(testUser.id, {
        attributes: { age: 2, brave: false },
        meta: {
          active: true,
        },
      });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            type: "user",
            userId: testUser.id,
            attributes: { age: 2, brave: false },
            context: { active: true },
          },
        ],
      );

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringMatching("post request to "),
        response,
      );
    });

    it("should log an error if the post request throws", async () => {
      const error = new Error("Network error");
      httpClient.post.mockRejectedValue(error);

      await client.updateUser(user.id);
      await client.flush();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching("post request to .* failed with error"),
        error,
      );
    });

    it("should log if API call returns false", async () => {
      const response = { status: 200, body: { success: false } };

      httpClient.post.mockResolvedValue(response);

      await client.updateUser(user.id);
      await client.flush();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching("invalid response received from server for"),
        JSON.stringify(response),
      );
    });

    it("should throw an error if opts are not valid or the user is not set", async () => {
      await expect(
        client.updateUser(user.id, "bad_opts" as any),
      ).rejects.toThrow("validation failed: options must be an object");

      await expect(
        client.updateUser(user.id, { attributes: "bad_attributes" as any }),
      ).rejects.toThrow("attributes must be an object");

      await expect(
        client.updateUser(user.id, { meta: "bad_meta" as any }),
      ).rejects.toThrow("meta must be an object");
    });
  });

  describe("updateCompany", () => {
    const client = new ReflagClient(validOptions);

    beforeEach(() => {
      client["rateLimiter"].clearStale(true);
    });

    test.each([
      {
        id: "company123",
        employees: 100,
        name: "Acme Inc.",
        userId: "user123",
      },
      { id: 42, employees: 100, name: "Acme Inc.", userId: 42 },
    ])(`should successfully update the company`, async (testCompany) => {
      const response = { status: 200, body: { success: true } };
      httpClient.post.mockResolvedValue(response);

      await client.updateCompany(testCompany.id, {
        attributes: { employees: 200, bankrupt: false },
        meta: { active: true },
        userId: testCompany.userId,
      });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            type: "company",
            companyId: testCompany.id,
            attributes: { employees: 200, bankrupt: false },
            context: { active: true },
            userId: testCompany.userId,
          },
        ],
      );

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringMatching("post request to .*"),
        response,
      );
    });

    it("should log an error if the post request throws", async () => {
      const error = new Error("Network error");
      httpClient.post.mockRejectedValue(error);

      await client.updateCompany(company.id, {});
      await client.flush();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching("post request to .* failed with error"),
        error,
      );
    });

    it("should log an error if API responds with success: false", async () => {
      const response = {
        status: 200,
        body: { success: false },
      };

      httpClient.post.mockResolvedValue(response);

      await client.updateCompany(company.id, {});
      await client.flush();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching("invalid response received from server for"),
        JSON.stringify(response),
      );
    });

    it("should throw an error if company is not valid", async () => {
      await expect(
        client.updateCompany(company.id, "bad_opts" as any),
      ).rejects.toThrow("validation failed: options must be an object");

      await expect(
        client.updateCompany(company.id, {
          attributes: "bad_attributes" as any,
        }),
      ).rejects.toThrow("attributes must be an object");

      await expect(
        client.updateCompany(company.id, { meta: "bad_meta" as any }),
      ).rejects.toThrow("meta must be an object");
    });
  });

  describe("track", () => {
    const client = new ReflagClient(validOptions);

    beforeEach(() => {
      client["rateLimiter"].clearStale(true);
    });

    test.each([
      { id: "user123", age: 1, name: "John" },
      { id: 42, age: 1, name: "John" },
    ])("should successfully track the flag usage", async (testUser) => {
      const response = {
        status: 200,
        body: { success: true },
      };
      httpClient.post.mockResolvedValue(response);

      await client.bindClient({ user: testUser, company }).track(event.event, {
        attributes: event.attrs,
        meta: { active: true },
      });

      await client.flush();
      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          expect.objectContaining({
            type: "company",
          }),
          expect.objectContaining({
            type: "user",
          }),
          {
            attributes: {
              key: "value",
            },
            context: {
              active: true,
            },
            event: "flag-event",
            type: "event",
            userId: testUser.id,
            companyId: company.id,
          },
        ],
      );

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringMatching("post request to"),
        response,
      );
    });

    it("should successfully track the flag usage including user and company", async () => {
      httpClient.post.mockResolvedValue({
        status: 200,
        body: { success: true },
      });

      await client.bindClient({ user }).track(event.event, {
        companyId: "otherCompanyId",
        attributes: event.attrs,
        meta: { active: true },
      });

      await client.flush();
      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          expect.objectContaining({
            type: "user",
          }),
          {
            attributes: {
              key: "value",
            },
            context: {
              active: true,
            },
            event: "flag-event",
            companyId: "otherCompanyId",
            type: "event",
            userId: "user123",
          },
        ],
      );
    });

    it("should log an error if the post request fails", async () => {
      const error = new Error("Network error");
      httpClient.post.mockRejectedValue(error);

      await client.bindClient({ user }).track(event.event);
      await client.flush();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching("post request to .* failed with error"),
        error,
      );
    });

    it("should log if the API call returns false", async () => {
      const response = {
        status: 200,
        body: { success: false },
      };

      httpClient.post.mockResolvedValue(response);

      await client.bindClient({ user }).track(event.event);
      await client.flush();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching("invalid response received from server for "),
        JSON.stringify(response),
      );
    });

    it("should log if user is not set", async () => {
      const boundClient = client.bindClient({ company });

      await boundClient.track("hello");

      expect(httpClient.post).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching("no user set, cannot track event"),
      );
    });

    it("should throw an error if event is invalid", async () => {
      const boundClient = client.bindClient({ company, user });

      await expect(boundClient.track(undefined as any)).rejects.toThrow(
        "event must be a string",
      );
      await expect(boundClient.track(1 as any)).rejects.toThrow(
        "event must be a string",
      );

      await expect(
        boundClient.track(event.event, "bad_opts" as any),
      ).rejects.toThrow("validation failed: options must be an object");

      await expect(
        boundClient.track(event.event, {
          attributes: "bad_attributes" as any,
        }),
      ).rejects.toThrow("attributes must be an object");

      await expect(
        boundClient.track(event.event, { meta: "bad_meta" as any }),
      ).rejects.toThrow("meta must be an object");
    });
  });

  describe("user", () => {
    it("should return the undefined if user was not set", () => {
      const client = new ReflagClient(validOptions).bindClient({ company });
      expect(client.user).toBeUndefined();
    });

    it("should return the user if user was associated", () => {
      const client = new ReflagClient(validOptions).bindClient({ user });

      expect(client.user).toEqual(user);
    });
  });

  describe("company", () => {
    it("should return the undefined if company was not set", () => {
      const client = new ReflagClient(validOptions).bindClient({ user });
      expect(client.company).toBeUndefined();
    });

    it("should return the user if company was associated", () => {
      const client = new ReflagClient(validOptions).bindClient({ company });

      expect(client.company).toEqual(company);
    });
  });

  describe("otherContext", () => {
    it("should return the undefined if custom context was not set", () => {
      const client = new ReflagClient(validOptions).bindClient({ company });
      expect(client.otherContext).toBeUndefined();
    });

    it("should return the user if custom context was associated", () => {
      const client = new ReflagClient(validOptions).bindClient({
        other: otherContext,
      });

      expect(client.otherContext).toEqual(otherContext);
    });
  });

  describe("initialize", () => {
    it("should initialize the client", async () => {
      const client = new ReflagClient(validOptions);

      const get = vi
        .spyOn(client["flagsCache"], "get")
        .mockReturnValue(undefined);
      const refresh = vi
        .spyOn(client["flagsCache"], "refresh")
        .mockResolvedValue(undefined);

      await client.initialize();
      await client.initialize();
      await client.initialize();

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
    });

    it("should call the backend to obtain flags", async () => {
      const client = new ReflagClient(validOptions);

      httpClient.get.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await client.initialize();

      expect(httpClient.get).toHaveBeenCalledWith(
        `https://api.example.com/features`,
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });
  });

  describe("flush", () => {
    it("should flush all bulk data", async () => {
      const client = new ReflagClient(validOptions);

      await client.updateUser(user.id, { attributes: { age: 2 } });
      await client.updateUser(user.id, { attributes: { age: 3 } });
      await client.updateUser(user.id, { attributes: { name: "Jane" } });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            type: "user",
            userId: user.id,
            attributes: { age: 2 },
          },
          {
            type: "user",
            userId: user.id,
            attributes: { age: 3 },
          },
          {
            type: "user",
            userId: user.id,
            attributes: { name: "Jane" },
          },
        ],
      );
    });

    it("should not flush all bulk data if `offline` is true", async () => {
      const client = new ReflagClient({
        ...validOptions,
        offline: true,
      });

      await client.updateUser(user.id, { attributes: { age: 2 } });
      await client.flush();

      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("getFlag", () => {
    let client: ReflagClient;

    beforeEach(async () => {
      httpClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          success: true,
          ...flagDefinitions,
        },
      });

      client = new ReflagClient(validOptions);

      httpClient.post.mockResolvedValue({
        status: 200,
        body: { success: true },
      });
    });

    it("returns a flag", async () => {
      await client.initialize();
      const flag = client.getFlag(
        {
          company,
          user,
          other: otherContext,
        },
        "flag1",
      );

      expect(flag).toStrictEqual({
        key: "flag1",
        isEnabled: true,
        config: {
          key: "config-1",
          payload: { something: "else" },
        },
        track: expect.any(Function),
      });
    });

    it("`track` sends all expected events when `enableTracking` is `true`", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(
        {
          ...context,
          meta: {
            active: true,
          },
          enableTracking: true,
        },
        "flag1",
      );

      await flag.track();
      await client.flush();

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            attributes: {
              employees: 100,
              name: "Acme Inc.",
            },
            companyId: "company123",
            context: {
              active: true,
            },
            type: "company",
            userId: undefined,
          },
          {
            attributes: {
              age: 1,
              name: "John",
            },
            context: {
              active: true,
            },
            type: "user",
            userId: "user123",
          },
          {
            type: "feature-flag-event",
            action: "evaluate",
            key: "flag1",
            targetingVersion: 1,
            evalContext: flattenJSON(context),
            evalResult: true,
            evalRuleResults: [true],
            evalMissingFields: [],
          },
          {
            type: "feature-flag-event",
            action: "evaluate-config",
            key: "flag1",
            targetingVersion: 1,
            evalContext: flattenJSON(context),
            evalResult: {
              key: "config-1",
              payload: {
                something: "else",
              },
            },
            evalRuleResults: [true],
            evalMissingFields: [],
          },
          {
            type: "event",
            event: "flag1",
            userId: user.id,
            companyId: company.id,
          },
        ],
      );
    });

    it("`track` does not send evaluation events when `emitEvaluationEvents` is `false`", async () => {
      client = new ReflagClient({
        ...validOptions,
        emitEvaluationEvents: false,
      });

      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(
        {
          ...context,
          meta: {
            active: true,
          },
          enableTracking: true,
        },
        "flag1",
      );

      await flag.track();
      await client.flush();

      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          {
            attributes: {
              employees: 100,
              name: "Acme Inc.",
            },
            companyId: "company123",
            context: {
              active: true,
            },
            type: "company",
          },
          {
            attributes: {
              age: 1,
              name: "John",
            },
            context: {
              active: true,
            },
            type: "user",
            userId: "user123",
          },
          {
            type: "event",
            event: "flag1",
            userId: user.id,
            companyId: company.id,
          },
        ],
      );
    });

    it("`isEnabled` sends `check` event", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(context, "flag1");

      // trigger `check` event
      expect(flag.isEnabled).toBe(true);

      await client.flush();
      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter((e) => e.action === "check");

      expect(checkEvents).toStrictEqual([
        {
          type: "feature-flag-event",
          action: "check",
          key: "flag1",
          targetingVersion: 1,
          evalResult: true,
          evalContext: context,
          evalRuleResults: [true],
          evalMissingFields: [],
        },
      ]);
    });

    it("`isEnabled` warns about missing context fields", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(context, "flag2");

      // trigger the warning
      expect(flag.isEnabled).toBe(false);

      expect(logger.warn).toHaveBeenCalledWith(
        "flag targeting rules might not be correctly evaluated due to missing context fields.",
        {
          flag2: ["attributeKey"],
        },
      );
    });

    it("`isEnabled` should not warn about missing context fields if not needed", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(context, "flag1");

      // should not trigger the warning
      expect(flag.isEnabled).toBe(true);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("`config` sends `check` event", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(context, "flag1");

      // trigger `check` event
      expect(flag.config).toBeDefined();

      await client.flush();

      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter((e) => e.action === "check-config");

      expect(checkEvents).toStrictEqual([
        {
          type: "feature-flag-event",
          action: "check-config",
          key: "flag1",
          evalResult: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          targetingVersion: 1,
          evalContext: context,
          evalRuleResults: [true],
          evalMissingFields: [],
        },
      ]);
    });

    it("sends events for unknown flags", async () => {
      const context: Context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(context, "unknown-flag");

      // trigger `check` event
      expect(flag.isEnabled).toBe(false);
      await flag.track();
      await client.flush();

      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter((e) => e.type === "feature-flag-event");

      expect(checkEvents).toStrictEqual([
        {
          type: "feature-flag-event",
          action: "check",
          key: "unknown-flag",
          targetingVersion: undefined,
          evalContext: context,
          evalResult: false,
          evalRuleResults: undefined,
          evalMissingFields: undefined,
        },
      ]);
    });

    it("sends company/user and track events", async () => {
      const context: Context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlag(context, "flag1");

      // trigger `check` event
      await flag.track();
      await client.flush();

      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter(
          (e) =>
            e.type === "company" || e.type === "user" || e.type === "event",
        );

      expect(checkEvents).toStrictEqual([
        {
          type: "company",
          companyId: "company123",
          attributes: {
            employees: 100,
            name: "Acme Inc.",
          },
          userId: undefined, // this is a bug, will fix in separate PR
          context: undefined,
        },
        {
          type: "user",
          userId: "user123",
          attributes: {
            age: 1,
            name: "John",
          },
          context: undefined,
        },
        {
          type: "event",
          event: "flag1",
          userId: user.id,
          companyId: company.id,
          context: undefined,
          attributes: undefined,
        },
      ]);
    });
  });

  describe("getFlags", () => {
    let client: ReflagClient;

    beforeEach(async () => {
      httpClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          success: true,
          ...flagDefinitions,
        },
      });

      client = new ReflagClient(validOptions);

      client["rateLimiter"].clearStale(true);

      httpClient.post.mockResolvedValue({
        ok: true,
        status: 200,
        body: { success: true },
      });
    });

    it("should return evaluated flags", async () => {
      httpClient.post.mockClear(); // not interested in updates

      await client.initialize();
      const result = client.getFlags({
        company,
        user,
        other: otherContext,
      });

      expect(result).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: true,
          config: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(1);
    });

    it("should properly define the rate limiter key", async () => {
      const isAllowedSpy = vi.spyOn(client["rateLimiter"], "isAllowed");

      await client.initialize();
      client.getFlags({ user, company, other: otherContext });

      expect(isAllowedSpy).toHaveBeenCalledWith("1GHpP+QfYperQ0AtD8bWPiRE4H0=");
    });

    it("should return evaluated flags when only user is defined", async () => {
      httpClient.post.mockClear(); // not interested in updates

      await client.initialize();
      const flags = client.getFlags({ user });

      expect(flags).toStrictEqual({
        flag1: {
          isEnabled: false,
          key: "flag1",
          config: {
            key: undefined,
            payload: undefined,
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(1);
    });

    it("should return evaluated flags when only company is defined", async () => {
      await client.initialize();
      const flags = client.getFlags({ company });

      // expect will trigger the `isEnabled` getter and send a `check` event
      expect(flags).toStrictEqual({
        flag1: {
          isEnabled: true,
          key: "flag1",
          config: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(1);
    });

    it("should not send flag events when `enableTracking` is `false`", async () => {
      await client.initialize();
      const flags = client.getFlags({ company, enableTracking: false });

      // expect will trigger the `isEnabled` getter and send a `check` event
      expect(flags).toStrictEqual({
        flag1: {
          isEnabled: true,
          key: "flag1",
          config: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      await client.flush();

      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it("should return evaluated flags when only other context is defined", async () => {
      await client.initialize();
      const flags = client.getFlags({ other: otherContext });

      expect(flags).toStrictEqual({
        flag1: {
          isEnabled: false,
          key: "flag1",
          config: {
            key: undefined,
            payload: undefined,
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(1);
    });

    it("should send `track` with user and company if provided", async () => {
      await client.initialize();
      const flags = client.getFlags({ company, user });
      await client.flush();

      await flags.flag1.track();
      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(2);
      // second call includes the track event
      const events = httpClient.post.mock.calls[1][2].filter(
        (e: any) => e.type === "event",
      );

      expect(events).toStrictEqual([
        {
          event: "flag1",
          type: "event",
          userId: "user123",
          companyId: "company123",
          attributes: undefined,
          context: undefined,
        },
      ]);
    });

    it("should send `track` with user if provided", async () => {
      await client.initialize();
      const flags = client.getFlags({ user });

      await client.flush();
      await flags.flag1.track();
      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(2);

      const emptyEvents = httpClient.post.mock.calls[0][2].filter(
        (e: any) => e.type === "event",
      );

      expect(emptyEvents).toStrictEqual([]);

      // second call includes the track event
      const events = httpClient.post.mock.calls[1][2].filter(
        (e: any) => e.type === "event",
      );

      expect(events).toStrictEqual([
        {
          event: "flag1",
          type: "event",
          userId: "user123",
          companyId: undefined,
          attributes: undefined,
          context: undefined,
        },
      ]);
    });

    it("should not send `track` with only company if no user is provided", async () => {
      // we do not accept track events without a userId
      await client.initialize();
      const flag = client.getFlags({ company });

      await flag.flag1.track();
      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(1);
      const events = httpClient.post.mock.calls[0][2].filter(
        (e: any) => e.type === "event",
      );

      expect(events).toStrictEqual([]);
    });

    it("`isEnabled` does not send `check` event", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlags(context);

      // trigger `check` event
      expect(flag.flag1.isEnabled).toBe(true);

      await client.flush();
      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter((e) => e.action === "check");

      expect(checkEvents).toStrictEqual([]);
    });

    it("`config` does not send `check` event", async () => {
      const context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      const flag = client.getFlags(context);

      // attempt to trigger `check` event
      expect(flag.flag1.config).toBeDefined();

      await client.flush();

      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter((e) => e.action === "check-config");

      expect(checkEvents).toStrictEqual([]);
    });

    it("sends company/user events", async () => {
      const context: Context = {
        company,
        user,
        other: otherContext,
      };

      // test that the flag is returned
      await client.initialize();
      client.getFlags(context);

      // trigger `check` event
      await client.flush();

      const checkEvents = httpClient.post.mock.calls
        .flatMap((call) => call[2])
        .filter(
          (e) =>
            e.type === "company" || e.type === "user" || e.type === "event",
        );

      expect(checkEvents).toStrictEqual([
        {
          type: "company",
          companyId: "company123",
          attributes: {
            employees: 100,
            name: "Acme Inc.",
          },
          userId: undefined, // this is a bug, will fix in separate PR
          context: undefined,
        },
        {
          type: "user",
          userId: "user123",
          attributes: {
            age: 1,
            name: "John",
          },
          context: undefined,
        },
      ]);
    });

    it("should use fallback flags when `getFlagDefinitions` returns `undefined`", async () => {
      httpClient.get.mockResolvedValue({
        success: false,
      });

      await client.initialize();
      const result = client.getFlag(
        { user: { id: "user123" }, enableTracking: true },
        "key",
      );

      expect(result).toStrictEqual({
        key: "key",
        isEnabled: true,
        config: { key: undefined, payload: undefined },
        track: expect.any(Function),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching(
          "no flag definitions available, using fallback flags",
        ),
      );

      await client.flush();

      expect(httpClient.post).toHaveBeenCalledTimes(1);
      expect(httpClient.post).toHaveBeenCalledWith(
        BULK_ENDPOINT,
        expectedHeaders,
        [
          expect.objectContaining({ type: "user" }),
          expect.objectContaining({
            type: "feature-flag-event",
            action: "check-config",
            key: "key",
          }),
          expect.objectContaining({
            type: "feature-flag-event",
            action: "check",
            key: "key",
            evalResult: true,
          }),
        ],
      );
    });

    it("should not fail if sendFlagEvent fails to send evaluate event", async () => {
      httpClient.post.mockRejectedValueOnce(new Error("Network error"));
      const context = { user, company, other: otherContext };

      await client.initialize();
      const flags = client.getFlags(context);

      await client.flush();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching("post request .* failed with error"),
        expect.any(Error),
      );

      expect(flags).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: true,
          config: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });
    });

    it("should not fail if sendFlagEvent fails to send check event", async () => {
      httpClient.post.mockResolvedValue({
        status: 200,
        body: { success: true },
      });

      await client.initialize();
      httpClient.post.mockRejectedValue(new Error("Network error"));
      const context = { user, company, other: otherContext };

      const result = client.getFlags(context);

      // Trigger a flag check
      expect(result.flag1).toStrictEqual({
        key: "flag1",
        isEnabled: true,
        track: expect.any(Function),
        config: {
          key: "config-1",
          payload: {
            something: "else",
          },
        },
      });

      await client.flush();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching("post request .* failed with error"),
        expect.any(Error),
      );
    });

    it("should use flag overrides", async () => {
      await client.initialize();
      const context = { user, company, other: otherContext };

      const pristineResults = client.getFlags(context);
      expect(pristineResults).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: true,
          config: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      client.flagOverrides = {
        flag1: false,
      };
      const flags = client.getFlags(context);

      expect(flags).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      client.clearFlagOverrides();
      const flags2 = client.getFlags(context);

      expect(flags2).toStrictEqual({
        ...pristineResults,
        flag1: {
          ...pristineResults.flag1,
          track: expect.any(Function),
        },
        flag2: {
          ...pristineResults.flag2,
          track: expect.any(Function),
        },
      });
    });

    it("should use flag overrides from function", async () => {
      await client.initialize();
      const context = { user, company, other: otherContext };

      const pristineResults = client.getFlags(context);
      expect(pristineResults).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: true,
          config: {
            key: "config-1",
            payload: {
              something: "else",
            },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      client.flagOverrides = (_context: Context) => {
        expect(context).toStrictEqual(context);
        return {
          flag1: { isEnabled: false },
          flag2: true,
          flag3: {
            isEnabled: true,
            config: {
              key: "config-1",
              payload: { something: "else" },
            },
          },
        };
      };
      const flags = client.getFlags(context);

      expect(flags).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: true,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
        flag3: {
          key: "flag3",
          isEnabled: true,
          config: {
            key: "config-1",
            payload: { something: "else" },
          },
          track: expect.any(Function),
        },
      });
    });
  });

  describe("getFlagsRemote", () => {
    let client: ReflagClient;

    beforeEach(async () => {
      httpClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          success: true,
          remoteContextUsed: true,
          features: {
            flag1: {
              key: "flag1",
              targetingVersion: 1,
              isEnabled: true,
              config: {
                key: "config-1",
                version: 3,
                default: true,
                payload: { something: "else" },
                missingContextFields: ["funny"],
              },
              missingContextFields: ["something", "funny"],
            },
            flag2: {
              key: "flag2",
              targetingVersion: 2,
              isEnabled: false,
              missingContextFields: ["another"],
            },
            flag3: {
              key: "flag3",
              targetingVersion: 5,
              isEnabled: true,
            },
          },
        },
      });

      client = new ReflagClient(validOptions);
    });

    afterEach(() => {
      httpClient.get.mockClear();
    });

    it("should return evaluated flags", async () => {
      const result = await client.getFlagsRemote("c1", "u1", {
        other: otherContext,
      });

      expect(result).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: true,
          config: {
            key: "config-1",
            payload: { something: "else" },
          },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
        flag3: {
          key: "flag3",
          isEnabled: true,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      expect(httpClient.get).toHaveBeenCalledTimes(1);

      expect(httpClient.get).toHaveBeenCalledWith(
        "https://api.example.com/features/evaluated?context.other.custom=context&context.other.key=value&context.user.id=c1&context.company.id=u1",
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });

    it("should not try to append the context if it's empty", async () => {
      await client.getFlagsRemote();

      expect(httpClient.get).toHaveBeenCalledTimes(1);

      expect(httpClient.get).toHaveBeenCalledWith(
        "https://api.example.com/features/evaluated?",
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });
  });

  describe("getFlagRemote", () => {
    let client: ReflagClient;

    beforeEach(async () => {
      httpClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          success: true,
          remoteContextUsed: true,
          features: {
            flag1: {
              key: "flag1",
              targetingVersion: 1,
              isEnabled: true,
              config: {
                key: "config-1",
                version: 3,
                default: true,
                payload: { something: "else" },
                missingContextFields: ["two"],
              },
              missingContextFields: ["one", "two"],
            },
          },
        },
      });

      client = new ReflagClient(validOptions);
    });

    afterEach(() => {
      httpClient.get.mockClear();
    });

    it("should return evaluated flag", async () => {
      const result = await client.getFlagRemote("flag1", "c1", "u1", {
        other: otherContext,
      });

      expect(result).toStrictEqual({
        key: "flag1",
        isEnabled: true,
        track: expect.any(Function),
        config: {
          key: "config-1",
          payload: { something: "else" },
        },
      });

      expect(httpClient.get).toHaveBeenCalledTimes(1);

      expect(httpClient.get).toHaveBeenCalledWith(
        "https://api.example.com/features/evaluated?context.other.custom=context&context.other.key=value&context.user.id=c1&context.company.id=u1&key=flag1",
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });

    it("should not try to append the context if it's empty", async () => {
      await client.getFlagRemote("flag1");

      expect(httpClient.get).toHaveBeenCalledWith(
        "https://api.example.com/features/evaluated?key=flag1",
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });
  });

  describe("offline mode", () => {
    let client: ReflagClient;

    beforeEach(async () => {
      client = new ReflagClient({
        ...validOptions,
        offline: true,
      });
      await client.initialize();
    });

    it("should send not send or fetch anything", async () => {
      client.getFlags({});

      expect(httpClient.get).toHaveBeenCalledTimes(0);
      expect(httpClient.post).toHaveBeenCalledTimes(0);
    });
  });
});

describe("BoundReflagClient", () => {
  beforeAll(() => {
    const response = {
      status: 200,
      body: { success: true },
    };

    httpClient.post.mockResolvedValue(response);

    httpClient.get.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        ...flagDefinitions,
      },
    });
  });
  const client = new ReflagClient(validOptions);

  beforeEach(async () => {
    await flushPromises();
    await client.flush();

    vi.mocked(httpClient.post).mockClear();
    client["rateLimiter"].clearStale(true);
  });

  it("should create a client instance", () => {
    expect(client).toBeInstanceOf(ReflagClient);
  });

  it("should return a new client instance with merged attributes", () => {
    const userOverride = { sex: "male", age: 30 };
    const companyOverride = { employees: 200, bankrupt: false };
    const otherOverride = { key: "new-value" };
    const other = { key: "value" };

    const newClient = client
      .bindClient({
        user,
        company,
        other,
      })
      .bindClient({
        user: { id: user.id, ...userOverride },
        company: { id: company.id, ...companyOverride },
        other: otherOverride,
      });

    expect(newClient["_options"]).toEqual({
      user: { ...user, ...userOverride },
      company: { ...company, ...companyOverride },
      other: { ...other, ...otherOverride },
      enableTracking: true,
    });
  });

  it("should allow using expected methods when bound to user", async () => {
    const boundClient = client.bindClient({ user });
    expect(boundClient.user).toEqual(user);

    expect(
      boundClient.bindClient({ other: otherContext }).otherContext,
    ).toEqual(otherContext);

    boundClient.getFlags();

    await boundClient.track("flag");
    await client.flush();

    expect(httpClient.post).toHaveBeenCalledWith(
      BULK_ENDPOINT,
      expectedHeaders,
      [
        expect.objectContaining({ type: "user" }),
        {
          event: "flag",
          type: "event",
          userId: "user123",
        },
      ],
    );
  });

  it("should add company ID from the context if not explicitly supplied", async () => {
    const boundClient = client.bindClient({ user, company });

    boundClient.getFlags();
    await boundClient.track("flag");

    await client.flush();

    expect(httpClient.post).toHaveBeenCalledWith(
      BULK_ENDPOINT,
      expectedHeaders,
      [
        expect.objectContaining({ type: "company" }),
        expect.objectContaining({ type: "user" }),
        {
          companyId: "company123",
          event: "flag",
          type: "event",
          userId: "user123",
        },
      ],
    );
  });

  it("should disable tracking within the client if `enableTracking` is `false`", async () => {
    const boundClient = client.bindClient({
      user,
      company,
      enableTracking: false,
    });

    const { track } = boundClient.getFlag("flag2");
    await track();
    await boundClient.track("flag1");

    await client.flush();

    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("should allow using expected methods", async () => {
    const boundClient = client.bindClient({ other: { key: "value" } });
    expect(boundClient.otherContext).toEqual({
      key: "value",
    });

    await client.initialize();

    boundClient.getFlags();
    boundClient.getFlag("flag1");

    await boundClient.flush();
  });

  describe("getFlagRemote/getFlagsRemote", () => {
    beforeEach(async () => {
      httpClient.get.mockClear();
      httpClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          success: true,
          remoteContextUsed: true,
          features: {
            flag1: {
              key: "flag1",
              targetingVersion: 1,
              isEnabled: true,
              config: {
                key: "config-1",
                version: 3,
                default: true,
                payload: { something: "else" },
                missingContextFields: ["else"],
              },
            },
            flag2: {
              key: "flag2",
              targetingVersion: 2,
              isEnabled: false,
              missingContextFields: ["something"],
            },
          },
        },
      });
    });

    it("should return evaluated flags", async () => {
      const boundClient = client.bindClient({
        user,
        company,
        other: otherContext,
      });

      const result = await boundClient.getFlagsRemote();

      expect(result).toStrictEqual({
        flag1: {
          key: "flag1",
          isEnabled: true,
          config: { key: "config-1", payload: { something: "else" } },
          track: expect.any(Function),
        },
        flag2: {
          key: "flag2",
          isEnabled: false,
          config: { key: undefined, payload: undefined },
          track: expect.any(Function),
        },
      });

      expect(httpClient.get).toHaveBeenCalledTimes(1);

      expect(httpClient.get).toHaveBeenCalledWith(
        "https://api.example.com/features/evaluated?context.user.id=user123&context.user.age=1&context.user.name=John&context.company.id=company123&context.company.employees=100&context.company.name=Acme+Inc.&context.other.custom=context&context.other.key=value",
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });

    it("should return evaluated flag", async () => {
      const boundClient = client.bindClient({
        user,
        company,
        other: otherContext,
      });

      const result = await boundClient.getFlagRemote("flag1");

      expect(result).toStrictEqual({
        key: "flag1",
        isEnabled: true,
        config: { key: "config-1", payload: { something: "else" } },
        track: expect.any(Function),
      });

      expect(httpClient.get).toHaveBeenCalledTimes(1);

      expect(httpClient.get).toHaveBeenCalledWith(
        "https://api.example.com/features/evaluated?context.user.id=user123&context.user.age=1&context.user.name=John&context.company.id=company123&context.company.employees=100&context.company.name=Acme+Inc.&context.other.custom=context&context.other.key=value&key=flag1",
        expectedHeaders,
        API_TIMEOUT_MS,
      );
    });
  });
});
