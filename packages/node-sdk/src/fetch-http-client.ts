import { API_TIMEOUT_MS } from "./config";
import { HttpClient } from "./types";
import { ok } from "./utils";

/**
 * The default HTTP client implementation.
 *
 * @remarks
 * This implementation uses the `fetch` API to send HTTP requests.
 **/
const fetchClient: HttpClient = {
  post: async <TBody, TResponse>(
    url: string,
    headers: Record<string, string>,
    body: TBody,
    timeoutMs: number = API_TIMEOUT_MS,
  ) => {
    ok(typeof url === "string" && url.length > 0, "URL must be a string");
    ok(typeof headers === "object", "Headers must be an object");

    const response = await fetch(url, {
      method: "post",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    const json = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body: json as TResponse,
    };
  },

  get: async <TResponse>(
    url: string,
    headers: Record<string, string>,
    timeoutMs: number = API_TIMEOUT_MS,
  ) => {
    ok(typeof url === "string" && url.length > 0, "URL must be a string");
    ok(typeof headers === "object", "Headers must be an object");

    const response = await fetch(url, {
      method: "get",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    const json = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body: json as TResponse,
    };
  },
};

/**
 * Implements exponential backoff retry logic for async functions.
 *
 * @param fn - The async function to retry.
 * @param maxRetries - Maximum number of retry attempts.
 * @param baseDelay - Base delay in milliseconds before retrying.
 * @param maxDelay - Maximum delay in milliseconds.
 * @returns The result of the function call or throws an error if all retries fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  onFailedTry: () => void,
  maxRetries: number,
  baseDelay: number,
  maxDelay: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      onFailedTry();

      // Calculate exponential backoff with jitter
      const delay = Math.min(
        maxDelay,
        baseDelay * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4),
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default fetchClient;
