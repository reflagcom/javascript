import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { ReflagClient } from "../../src";
import fetchClient from "../../src/fetch-http-client";

// A new ID means a cold start. Repeat invocations with gaps to observe thawing.
const environmentId = randomUUID();
let invocation = 0;
let pending = 0;
let started = 0;
let succeeded = 0;
let failed = 0;
let setup: Promise<ReflagClient> | undefined;

async function createClient() {
  let apiBaseUrl = process.env.REFLAG_API_BASE_URL;
  if (!apiBaseUrl) {
    // Deterministic race probe: real HTTP, but no Reflag credentials/traffic.
    // This server freezes too; use the real endpoint for network diagnosis.
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        setTimeout(() => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ success: true }));
        }, 250);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    server.unref();
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No server address");
    apiBaseUrl = `http://127.0.0.1:${address.port}`;
  } else if (!process.env.REFLAG_SECRET_KEY) {
    throw new Error("Real endpoint mode requires a test REFLAG_SECRET_KEY");
  }

  return new ReflagClient({
    secretKey:
      process.env.REFLAG_SECRET_KEY || "lambda-local-probe-not-a-real-secret",
    apiBaseUrl,
    flagsSyncMode: "in-request",
    batchOptions: { intervalMs: 100, maxSize: 100, flushOnExit: false },
    httpClient: {
      ...fetchClient,
      async post<TBody, TResponse>(
        url: string,
        headers: Record<string, string>,
        body: TBody,
      ) {
        pending++;
        started++;
        const start = Date.now();
        try {
          const response = await fetchClient.post<TBody, TResponse>(
            url,
            headers,
            body,
          );
          if (response.ok) succeeded++;
          else failed++;
          return response;
        } catch (error) {
          failed++;
          console.log(
            JSON.stringify({
              environmentId,
              error: error instanceof Error ? error.name : "unknown",
            }),
          );
          throw error;
        } finally {
          pending--;
          console.log(
            JSON.stringify({
              environmentId,
              elapsedMs: Date.now() - start,
              pending,
            }),
          );
        }
      },
    },
  });
}

export async function handler(
  event: { mode?: "timer" | "full"; flush?: boolean } = {},
  context: {
    callbackWaitsForEmptyEventLoop: boolean;
    getRemainingTimeInMillis(): number;
  },
) {
  context.callbackWaitsForEmptyEventLoop = false;
  const pendingAtEntry = pending;
  const client = await (setup ??= createClient());
  invocation++;
  const start = Date.now();
  const tracking: Promise<void>[] = [];
  // Full batches start I/O synchronously, as fire-and-forget flag checks can.
  for (let i = 0; i < (event.mode === "full" ? 100 : 1); i++) {
    tracking.push(
      client.track(`lambda-probe-${environmentId}`, "lambda-lifecycle-probe"),
    );
  }
  if (event.mode !== "full") {
    await Promise.all(tracking);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (event.flush !== false) await client.flush();
  // Deliberately don't await full-batch tracking separately: test flush's contract.
  const result = {
    environmentId,
    invocation,
    mode: event.mode ?? "timer",
    flush: event.flush !== false,
    pendingAtEntry,
    pendingAtReturn: pending,
    started,
    succeeded,
    failed,
    elapsedMs: Date.now() - start,
    remainingMs: context.getRemainingTimeInMillis(),
  };
  console.log(JSON.stringify(result));
  return result;
}
