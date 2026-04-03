import { Logger } from "./types";

type SSEOptions = {
  url: string;
  headers: Record<string, string>;
  logger?: Logger;
  onFlagStateVersion: (version: number) => void;
  onReconnect?: () => void;
};

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export type FlagUpdatesSSESubscription = {
  ready: Promise<void>;
  close: () => void;
};

export function openFlagUpdatesSSE({
  url,
  headers,
  logger,
  onFlagStateVersion,
  onReconnect,
}: SSEOptions): FlagUpdatesSSESubscription {
  let stopped = false;
  let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let abortController: AbortController | undefined;
  let shouldNotifyReconnect = false;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const settleReady = () => {
    resolveReady?.();
    resolveReady = undefined;
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;

    shouldNotifyReconnect = true;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, reconnectDelayMs);
    reconnectTimer.unref();

    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  };

  const onSSEPayload = (payload: string) => {
    try {
      const message = JSON.parse(payload);
      if (message?.name !== "flags-updated") {
        return;
      }

      const data =
        typeof message.data === "string"
          ? JSON.parse(message.data)
          : message.data;

      const flagStateVersion = Number(data?.flagStateVersion);
      if (!Number.isInteger(flagStateVersion) || flagStateVersion < 0) {
        return;
      }

      onFlagStateVersion(flagStateVersion);
    } catch (error) {
      logger?.warn("failed to parse SSE message", error);
    }
  };

  const parseSSEBlock = (block: string) => {
    let eventName = "message";
    const dataLines: string[] = [];

    for (const rawLine of block.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line || line.startsWith(":")) {
        continue;
      }

      const delimiter = line.indexOf(":");
      const field = delimiter >= 0 ? line.slice(0, delimiter) : line;
      const value =
        delimiter >= 0 ? line.slice(delimiter + 1).replace(/^ /, "") : "";

      if (field === "event") {
        eventName = value;
      } else if (field === "data") {
        dataLines.push(value);
      }
    }

    if (eventName !== "message" || dataLines.length === 0) {
      return;
    }

    onSSEPayload(dataLines.join("\n"));
  };

  const connect = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    abortController = new AbortController();
    const requestUrl = new URL(url);

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: "GET",
        headers: {
          ...headers,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        signal: abortController.signal,
      });
    } catch (error) {
      if (!stopped) {
        logger?.warn("failed to connect to flag updates SSE endpoint", error);
        scheduleReconnect();
      }
      settleReady();
      return;
    }

    if (!response.ok || !response.body) {
      let responseBody: string | undefined;
      try {
        const rawBody = await response.text();
        if (rawBody) {
          responseBody =
            rawBody.length > 1000 ? `${rawBody.slice(0, 1000)}...` : rawBody;
        }
      } catch {
        // ignore body read errors
      }

      logger?.warn(
        "flag updates SSE endpoint returned an invalid response",
        new Error(
          `${response.status} ${response.statusText}${
            responseBody ? ` - ${responseBody}` : ""
          }`,
        ),
      );
      scheduleReconnect();
      settleReady();
      return;
    }

    reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    logger?.debug(
      `flag updates SSE connection established (channels=${requestUrl.searchParams.get("channels") ?? ""})`,
    );
    settleReady();

    if (shouldNotifyReconnect) {
      shouldNotifyReconnect = false;
      try {
        onReconnect?.();
      } catch (error) {
        logger?.warn("failed to handle flag updates SSE reconnect", error);
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffered += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

        while (true) {
          const separator = buffered.indexOf("\n\n");
          if (separator === -1) {
            break;
          }

          const block = buffered.slice(0, separator);
          buffered = buffered.slice(separator + 2);
          parseSSEBlock(block);
        }
      }
    } catch (error) {
      if (!stopped) {
        logger?.debug("flag updates SSE stream failed; reconnecting", error);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // noop
      }
    }

    if (!stopped) {
      scheduleReconnect();
    }
  };

  void connect();

  return {
    ready,
    close: () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }

      if (abortController) {
        abortController.abort();
        abortController = undefined;
      }
    },
  };
}
