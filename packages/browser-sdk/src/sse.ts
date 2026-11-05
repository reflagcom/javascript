import { SDK_VERSION_HEADER_NAME } from "./config";
import { canonicalContextJSONStringify, ReflagContext } from "./context";
import { Logger, loggerWithPrefix } from "./logger";

export type EventSourceLike = {
  addEventListener: (type: string, cb: (event: any) => void) => void;
  close: () => void;
};

export type EventSourceFactory = (url: string) => EventSourceLike;

export type PubSubMessage = {
  name?: string;
  event?: string;
  channel?: string;
  data?: any;
  [key: string]: any;
};

export class AblySSEChannel {
  private isOpen = false;
  private eventSource: EventSourceLike | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private retryCount = 3;
  private retriesRemaining = 3;
  private logger: Logger;

  constructor(
    private channels: string[],
    private sseBaseUrl: string,
    private messageHandler: (message: PubSubMessage) => void,
    logger: Logger,
    private eventSourceFactory?: EventSourceFactory,
    private publishableKey?: string,
    private sdkVersion?: string,
    private path = "sse",
    private context?: ReflagContext,
    private credentials?: RequestCredentials,
  ) {
    this.logger = loggerWithPrefix(logger, "[SSE]");

    if (!this.sseBaseUrl.endsWith("/")) {
      this.sseBaseUrl += "/";
    }
  }

  private onMessage(e: MessageEvent) {
    let payload: PubSubMessage | undefined;

    try {
      if (e.data) {
        const message = JSON.parse(e.data);
        if (message && typeof message === "object") {
          const parsed = { ...message } as PubSubMessage;
          if (typeof parsed.data === "string") {
            try {
              parsed.data = JSON.parse(parsed.data);
            } catch {
              // keep string payload as-is
            }
          }
          payload = parsed;
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
    this.isOpen = true;
    this.retriesRemaining = this.retryCount;
    this.logger.debug("event source connection opened", e);
  }

  private onError(e: Event) {
    this.isOpen = false;
    const connectionState = (e as any)?.target?.readyState;

    if (!this.eventSourceFactory && connectionState !== 2) {
      // Native EventSource reconnects recoverable failures itself. Calling
      // close() here would cancel that reconnect, including its retry delay.
      this.logger.debug("event source reconnecting", e);
      return;
    }

    if (connectionState === 2) {
      // Native terminal errors (including HTTP 403) must not be retried.
      this.logger.debug("event source connection closed", e);
    } else {
      this.logger.warn("event source connection failed", e);
    }

    this.disconnect();
  }

  private createEventSource(url: string): EventSourceLike | undefined {
    if (this.eventSourceFactory) {
      return this.eventSourceFactory(url);
    }

    if (typeof EventSource === "undefined") {
      this.logger.warn(
        "EventSource is not available in this environment; SSE channel cannot be opened",
      );
      return;
    }

    return this.credentials === "include"
      ? new EventSource(url, { withCredentials: true })
      : new EventSource(url);
  }

  public async connect() {
    if (this.eventSource) {
      this.logger.warn("channel connection already active");
      return;
    }

    const url = new URL(this.path, this.sseBaseUrl);
    if (this.channels.length > 0) {
      url.searchParams.append("v", "1.2");
      url.searchParams.append("channels", this.channels.join(","));
      url.searchParams.append("rewind", "1");
    }
    if (this.publishableKey) {
      url.searchParams.append("publishableKey", this.publishableKey);
    }
    if (this.sdkVersion) {
      url.searchParams.append(SDK_VERSION_HEADER_NAME, this.sdkVersion);
    }
    const serializedContext = canonicalContextJSONStringify(this.context);
    if (serializedContext) {
      url.searchParams.append("contextJson", serializedContext);
    }

    const eventSource = this.createEventSource(url.toString());
    if (!eventSource) return;
    this.eventSource = eventSource;

    eventSource.addEventListener("error", (e) => {
      if (this.eventSource === eventSource) this.onError(e);
    });
    eventSource.addEventListener("open", (e) => {
      if (this.eventSource === eventSource) this.onOpen(e);
    });
    eventSource.addEventListener("message", (m) => {
      if (this.eventSource === eventSource) this.onMessage(m);
    });

    this.logger.debug("opening channel connection");
  }

  public disconnect() {
    const eventSource = this.eventSource;
    this.eventSource = null;
    this.isOpen = false;
    if (eventSource) {
      eventSource.close();
      this.logger.debug("channel connection closed");
    }
  }

  public open(options?: { retryInterval?: number; retryCount?: number }) {
    if (this.isActive()) return;
    if (!this.eventSourceFactory && typeof EventSource === "undefined") {
      this.logger.warn(
        "EventSource is not available in this environment; SSE channel cannot be opened",
      );
      return;
    }

    this.retryCount = options?.retryCount ?? 3;
    this.retriesRemaining = this.retryCount;

    const tryConnect = async () => {
      try {
        await this.connect();
      } catch (e) {
        this.logger.warn("failed to create event source connection", e);
      }
    };

    void tryConnect();

    // Native EventSource owns reconnection and terminal failure handling.
    // Keep the SDK fallback for custom transports such as React Native's,
    // which disables its own reconnect loop.
    if (!this.eventSourceFactory) return;

    this.retryInterval = setInterval(
      () => {
        if (!this.eventSource && this.retryInterval) {
          if (this.retriesRemaining <= 0) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
            return;
          }

          this.retriesRemaining--;
          void tryConnect();
        }
      },
      options?.retryInterval ?? 1000 * 30,
    );
  }

  public close() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }

    this.disconnect();
  }

  public isActive() {
    return !!this.eventSource || !!this.retryInterval;
  }

  public isConnected() {
    return this.isOpen && !!this.eventSource;
  }
}

export function openAblySSEChannel({
  channel,
  channels,
  callback,
  sseBaseUrl,
  logger,
  eventSourceFactory,
  publishableKey,
  sdkVersion,
  path,
  context,
  credentials,
}: {
  channel?: string;
  channels?: string[];
  callback: (req: PubSubMessage) => void;
  logger: Logger;
  sseBaseUrl: string;
  eventSourceFactory?: EventSourceFactory;
  publishableKey?: string;
  sdkVersion?: string;
  path?: string;
  context?: ReflagContext;
  credentials?: RequestCredentials;
}) {
  const subscribedChannels = channels ?? (channel ? [channel] : []);
  const sse = new AblySSEChannel(
    subscribedChannels,
    sseBaseUrl,
    callback,
    logger,
    eventSourceFactory,
    publishableKey,
    sdkVersion,
    path,
    context,
    credentials,
  );

  sse.open();

  return sse;
}

export function closeAblySSEChannel(channel: AblySSEChannel) {
  channel.close();
}
