import { Logger, loggerWithPrefix } from "./logger";

export type PubSubMessage = {
  name?: string;
  event?: string;
  channel?: string;
  data?: any;
  [key: string]: any;
};

export class AblySSEChannel {
  private isOpen = false;
  private eventSource: EventSource | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;

  constructor(
    private channels: string[],
    private sseBaseUrl: string,
    private messageHandler: (message: PubSubMessage) => void,
    logger: Logger,
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
    this.logger.debug("event source connection opened", e);
  }

  private onError(e: Event) {
    const connectionState = (e as any)?.target?.readyState;

    if (connectionState === 2) {
      this.logger.debug("event source connection closed", e);
    } else if (connectionState === 1) {
      this.logger.warn("event source connection failed to open", e);
    } else {
      this.logger.warn("event source unexpected error occurred", e);
    }

    this.disconnect();
  }

  public async connect() {
    if (this.isOpen) {
      this.logger.warn("channel connection already open");
      return;
    }

    this.isOpen = true;
    try {
      const url = new URL("sse", this.sseBaseUrl);
      url.searchParams.append("v", "1.2");
      url.searchParams.append("channels", this.channels.join(","));
      url.searchParams.append("rewind", "1");

      if (typeof EventSource === "undefined") {
        this.logger.warn(
          "EventSource is not available in this environment; SSE channel cannot be opened",
        );
        return;
      }

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
    if (typeof EventSource === "undefined") {
      this.logger.warn(
        "EventSource is not available in this environment; SSE channel cannot be opened",
      );
      return;
    }

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
  channel,
  channels,
  callback,
  sseBaseUrl,
  logger,
}: {
  channel?: string;
  channels?: string[];
  callback: (req: PubSubMessage) => void;
  logger: Logger;
  sseBaseUrl: string;
}) {
  const subscribedChannels = channels ?? (channel ? [channel] : []);
  const sse = new AblySSEChannel(
    subscribedChannels,
    sseBaseUrl,
    callback,
    logger,
  );

  sse.open();

  return sse;
}

export function closeAblySSEChannel(channel: AblySSEChannel) {
  channel.close();
}
