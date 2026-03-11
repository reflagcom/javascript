import {
  forgetAuthToken,
  getAuthToken,
  rememberAuthToken,
} from "./feedback/promptStorage";
import { logResponseError } from "./utils/responseError";
import { HttpClient } from "./httpClient";
import { Logger, loggerWithPrefix } from "./logger";

interface AblyTokenDetails {
  token: string;
  expires: number;
}

interface AblyTokenRequest {
  keyName: string;
}

const ABLY_TOKEN_ERROR_MIN = 40000;
const ABLY_TOKEN_ERROR_MAX = 49999;

export class AblySSEChannel {
  private isOpen: boolean = false;
  private eventSource: EventSource | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;

  constructor(
    private userId: string,
    private channel: string,
    private sseBaseUrl: string,
    private messageHandler: (message: any) => void,
    private httpClient: HttpClient,
    logger: Logger,
  ) {
    this.logger = loggerWithPrefix(logger, "[SSE]");

    if (!this.sseBaseUrl.endsWith("/")) {
      this.sseBaseUrl += "/";
    }
  }

  private async refreshTokenRequest() {
    const params = new URLSearchParams({ userId: this.userId });
    const res = await this.httpClient.get({
      path: `/feedback/prompting-auth`,
      params,
    });

    if (res.ok) {
      const body = await res.json();
      if (body.success) {
        delete body.success;
        const tokenRequest: AblyTokenRequest = body;

        this.logger.debug("obtained new token request", tokenRequest);
        return tokenRequest;
      }
    }

    await logResponseError({
      logger: this.logger,
      res,
      message: "server did not release a token request",
    });
    return;
  }

  private async refreshToken() {
    const cached = getAuthToken(this.userId);
    if (cached && cached.channel === this.channel) {
      this.logger.debug("using existing token", cached.channel, cached.token);
      return cached.token;
    }

    const tokenRequest = await this.refreshTokenRequest();
    if (!tokenRequest) {
      return;
    }

    const url = new URL(
      `keys/${encodeURIComponent(tokenRequest.keyName)}/requestToken`,
      this.sseBaseUrl,
    );

    const res = await fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokenRequest),
    });

    if (res.ok) {
      const details: AblyTokenDetails = await res.json();
      this.logger.debug("obtained new token", details);

      rememberAuthToken(
        this.userId,
        this.channel,
        details.token,
        new Date(details.expires),
      );
      return details.token;
    }

    await logResponseError({
      logger: this.logger,
      res,
      message: "server did not release a token",
    });

    return;
  }

  private async onError(e: Event) {
    if (e instanceof MessageEvent) {
      let errorCode: number | undefined;

      try {
        const errorPayload = JSON.parse(e.data);
        errorCode = errorPayload?.code && Number(errorPayload.code);
      } catch (error: any) {
        this.logger.warn("received unparsable error message", error, e);
      }

      if (
        errorCode &&
        errorCode >= ABLY_TOKEN_ERROR_MIN &&
        errorCode <= ABLY_TOKEN_ERROR_MAX
      ) {
        this.logger.warn("event source token expired, refresh required");
        forgetAuthToken(this.userId);
      }
    } else {
      const connectionState = (e as any)?.target?.readyState;

      if (connectionState === 2) {
        this.logger.debug("event source connection closed", e);
      } else if (connectionState === 1) {
        this.logger.warn("event source connection failed to open", e);
      } else {
        this.logger.warn("event source unexpected error occurred", e);
      }
    }

    this.disconnect();
  }

  private onMessage(e: MessageEvent) {
    let payload: any;

    try {
      if (e.data) {
        const message = JSON.parse(e.data);
        if (message.data) {
          payload = JSON.parse(message.data);
        }
      }
    } catch (error: any) {
      this.logger.warn("received unparsable message", error, e);
      return;
    }

    if (payload) {
      this.logger.debug("received message", payload);

      try {
        this.messageHandler(payload);
      } catch (error: any) {
        this.logger.warn("failed to handle message", error, payload);
      }

      return;
    }

    this.logger.warn("received invalid message", e);
  }

  private onOpen(e: Event) {
    this.logger.debug("event source connection opened", e);
  }

  public async connect() {
    if (this.isOpen) {
      this.logger.warn("channel connection already open");
      return;
    }

    this.isOpen = true;
    try {
      const token = await this.refreshToken();

      if (!token) return;

      const url = new URL("sse", this.sseBaseUrl);
      url.searchParams.append("v", "1.2");
      url.searchParams.append("accessToken", token);
      url.searchParams.append("channels", this.channel);
      url.searchParams.append("rewind", "1");

      this.eventSource = new EventSource(url);

      this.eventSource.addEventListener("error", (e) => this.onError(e));
      this.eventSource.addEventListener("open", (e) => this.onOpen(e));
      this.eventSource.addEventListener("message", (m) => this.onMessage(m));

      this.logger.debug("channel connection opened");
    } finally {
      this.isOpen = !!this.eventSource;
    }
  }

  public disconnect() {
    if (!this.isOpen) {
      this.logger.warn("channel connection already closed");
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;

      this.logger.debug("channel connection closed");
    }

    this.isOpen = false;
  }

  public open(options?: { retryInterval?: number; retryCount?: number }) {
    const retryInterval = options?.retryInterval ?? 1000 * 30;
    const retryCount = options?.retryCount ?? 3;
    let retriesRemaining = retryCount;

    const tryConnect = async () => {
      try {
        await this.connect();
        retriesRemaining = retryCount;
      } catch (e) {
        if (retriesRemaining > 0) {
          this.logger.warn(
            `failed to connect, ${retriesRemaining} retries remaining`,
            e,
          );
        } else {
          this.logger.warn(`failed to connect, no retries remaining`, e);
        }
      }
    };

    void tryConnect();

    this.retryInterval = setInterval(() => {
      if (!this.isConnected() && this.retryInterval) {
        if (retriesRemaining <= 0) {
          clearInterval(this.retryInterval);
          this.retryInterval = null;
          return;
        }

        retriesRemaining--;
        void tryConnect();
      }
    }, retryInterval);
  }

  public close() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }

    this.disconnect();
  }

  public isActive() {
    return !!this.retryInterval;
  }

  public isConnected() {
    return this.isOpen && !!this.eventSource;
  }
}

export function openAblySSEChannel({
  userId,
  channel,
  callback,
  httpClient,
  sseBaseUrl,
  logger,
}: {
  userId: string;
  channel: string;
  callback: (req: object) => void;
  httpClient: HttpClient;
  logger: Logger;
  sseBaseUrl: string;
}) {
  const sse = new AblySSEChannel(
    userId,
    channel,
    sseBaseUrl,
    callback,
    httpClient,
    logger,
  );

  sse.open();

  return sse;
}

export function closeAblySSEChannel(channel: AblySSEChannel) {
  channel.close();
}
