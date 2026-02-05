import { createAbortController } from "./utils/abortController";
import { API_BASE_URL, SDK_VERSION, SDK_VERSION_HEADER_NAME } from "./config";

export interface HttpClientOptions {
  baseUrl?: string;
  sdkVersion?: string;
  credentials?: RequestCredentials;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly sdkVersion: string;

  private readonly fetchOptions: RequestInit;

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

    const url = this.getUrl(path);
    url.search = params.toString();

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
  }: {
    host?: string;
    path: string;
    body: any;
  }): ReturnType<typeof fetch> {
    return fetch(this.getUrl(path), {
      ...this.fetchOptions,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SDK_VERSION_HEADER_NAME]: this.sdkVersion,
        Authorization: `Bearer ${this.publishableKey}`,
      },
      body: JSON.stringify(body),
    });
  }
}
