import type {
  ConfigurationParameters,
  InitOverrideFunction,
  RequestOpts,
} from "./generated/runtime";
import { ResponseError } from "./generated/runtime";
import { Configuration, DefaultApi } from "./generated";

type OmitAppIdParam<F> = F extends (
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

function scopeApiToAppId<T extends object>(
  api: T,
  appId: string,
): AppScopedApi<T> {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (arg1: unknown, ...rest: unknown[]) => {
        if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
          const args =
            "appId" in (arg1 as object) ? arg1 : { ...(arg1 as object), appId };
          return (value as (...args: unknown[]) => unknown).call(
            target,
            args,
            ...rest,
          );
        }
        return (value as (...args: unknown[]) => unknown).call(
          target,
          arg1,
          ...rest,
        );
      };
    },
  }) as AppScopedApi<T>;
}

export function createAppClient(
  appId: string,
  config?: ConfigurationParameters,
) {
  return scopeApiToAppId(new Api(config), appId);
}
