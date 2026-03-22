import type {
  ConfigurationParameters,
  InitOverrideFunction,
  RequestOpts,
} from "./generated/runtime";
import { ResponseError } from "./generated/runtime";
import { Configuration, DefaultApi } from "./generated";

export type OmitAppIdParam<F> = F extends (
  arg1: infer A,
  ...rest: infer R
) => infer Ret
  ? A extends { appId: string }
    ? (arg1: Omit<A, "appId">, ...rest: R) => Ret
    : F
  : F;

export type AppScopedApi<T> = {
  [K in keyof T]: OmitAppIdParam<T[K]>;
};

export class ReflagApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ReflagApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function buildApiError(response: Response) {
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  let details: unknown = undefined;
  let message = `Request failed with ${status}`;
  let code: string | undefined;

  if (contentType.includes("application/json")) {
    try {
      details = await response.clone().json();
      const maybeError = (
        details as { error?: { message?: string; code?: string } }
      )?.error;
      if (maybeError?.message) {
        message = maybeError.message;
      }
      if (maybeError?.code) {
        code = maybeError.code;
      }
    } catch {
      details = undefined;
    }
  } else {
    try {
      const text = await response.clone().text();
      if (text) {
        details = text;
        message = `Request failed with ${status}: ${text}`;
      }
    } catch {
      details = undefined;
    }
  }

  return new ReflagApiError(status, message, code, details);
}

export class Api extends DefaultApi {
  constructor(config?: ConfigurationParameters) {
    super(new Configuration(config));
  }

  protected async request(
    context: RequestOpts,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<Response> {
    try {
      return await super.request(context, initOverrides);
    } catch (error) {
      if (error instanceof ResponseError) {
        throw await buildApiError(error.response);
      }
      throw error;
    }
  }
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> | Record<string, never> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scopeApiToAppId<T extends object>(
  api: T,
  appId: string,
  scopedCache: WeakMap<object, object> = new WeakMap(),
): AppScopedApi<T> {
  const cached = scopedCache.get(api as object);
  if (cached) {
    return cached as AppScopedApi<T>;
  }

  const scopedApi = new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      const wrapResult = (result: unknown) => {
        if (result instanceof Api) {
          return scopeApiToAppId(result, appId, scopedCache);
        }
        return result;
      };

      return (arg1: unknown, ...rest: unknown[]) => {
        const isWithMethod =
          typeof prop === "string" && prop.startsWith("with");
        if (!isWithMethod && isPlainObject(arg1)) {
          const args = "appId" in arg1 ? arg1 : { ...arg1, appId };
          const result = (value as (...args: unknown[]) => unknown).call(
            target,
            args,
            ...rest,
          );
          return wrapResult(result);
        }
        const result = (value as (...args: unknown[]) => unknown).call(
          target,
          arg1,
          ...rest,
        );
        return wrapResult(result);
      };
    },
  }) as AppScopedApi<T>;

  scopedCache.set(api as object, scopedApi as object);
  return scopedApi;
}

export function createAppClient(
  appId: string,
  config?: ConfigurationParameters,
) {
  return scopeApiToAppId(new Api(config), appId);
}
