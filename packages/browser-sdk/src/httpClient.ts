import { API_BASE_URL, SDK_VERSION, SDK_VERSION_HEADER_NAME } from "./config";
import { createAbortController } from "./utils/abortController";

const KEEPALIVE_MAX_IN_FLIGHT_BYTES = 60 * 1024;
const KEEPALIVE_MAX_IN_FLIGHT_REQUESTS = 15;

export interface HttpClientOptions {
  baseUrl?: string;
  sdkVersion?: string;
  credentials?: RequestCredentials;
}

function getBodyByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly sdkVersion: string;

  private readonly fetchOptions: RequestInit;
  private inFlightKeepaliveBytes = 0;
  private inFlightKeepaliveRequests = 0;

  constructor(
    public publishableKey: string,
    opts: HttpClientOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? API_BASE_URL;

    // Ensure baseUrl ends with a trailing slash so subsequent
    // path concatenation works as expected
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl += "/";
    }
    this.sdkVersion = opts.sdkVersion ?? SDK_VERSION;
    this.fetchOptions = { credentials: opts.credentials };
  }

  getUrl(path: string): URL {
    // see tests for examples
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    return new URL(path, this.baseUrl);
  }

  async get({
    path,
    params,
    timeoutMs,
  }: {
    path: string;
    params?: URLSearchParams;
    timeoutMs?: number;
  }): ReturnType<typeof fetch> {
    if (!params) {
      params = new URLSearchParams();
    }
    params.set(SDK_VERSION_HEADER_NAME, this.sdkVersion);
    params.set("publishableKey", this.publishableKey);

    // Do not assign `url.search` directly: some React Native URL implementations
    // expose `search` as getter-only and throw at runtime on assignment.
    const query = params.toString();
    const pathWithQuery = query
      ? `${path}${path.includes("?") ? "&" : "?"}${query}`
      : path;
    const url = this.getUrl(pathWithQuery);

    if (timeoutMs === undefined) {
      return fetch(url, this.fetchOptions);
    }

    const controller = createAbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      ...this.fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);

    return res;
  }

  async post({
    path,
    body,
    keepalive,
  }: {
    host?: string;
    path: string;
    body: any;
    keepalive?: boolean;
  }): ReturnType<typeof fetch> {
    const serializedBody = JSON.stringify(body);
    const bodyBytes = getBodyByteLength(serializedBody);
    const shouldUseKeepalive =
      keepalive &&
      this.inFlightKeepaliveBytes + bodyBytes <=
        KEEPALIVE_MAX_IN_FLIGHT_BYTES &&
      this.inFlightKeepaliveRequests < KEEPALIVE_MAX_IN_FLIGHT_REQUESTS;

    if (shouldUseKeepalive) {
      this.inFlightKeepaliveBytes += bodyBytes;
      this.inFlightKeepaliveRequests += 1;
    }

    try {
      return await fetch(this.getUrl(path), {
        ...this.fetchOptions,
        method: "POST",
        keepalive: shouldUseKeepalive,
        headers: {
          "Content-Type": "application/json",
          [SDK_VERSION_HEADER_NAME]: this.sdkVersion,
          Authorization: `Bearer ${this.publishableKey}`,
        },
        body: serializedBody,
      });
    } finally {
      if (shouldUseKeepalive) {
        this.inFlightKeepaliveBytes -= bodyBytes;
        this.inFlightKeepaliveRequests -= 1;
      }
    }
  }
}
