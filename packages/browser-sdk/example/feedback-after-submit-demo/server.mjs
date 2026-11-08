import { randomUUID } from "node:crypto";
import http from "node:http";

// Minimal mock of the Reflag API, just enough for the feedback widget demo:
// - GET  /features/evaluated   so ReflagClient.initialize() resolves
// - POST /feedback             the endpoint the widget's onSubmit/onScoreSubmit calls,
//                              delayed by `state.delayMs` to make the async gap visible
// - GET  /log, POST /reset     ground truth for what the server actually received,
//                              independent of whatever the browser tab believes happened

const MIN_DELAY_MS = 0;
const MAX_DELAY_MS = 20_000;

const state = {
  delayMs: 1500,
  received: [],
};

const ATTEMPT_RE = /\[demo:([a-f0-9-]+)\]/i;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/features/evaluated") {
    return send(res, 200, { success: true, features: {} });
  }

  if (req.method === "POST" && url.pathname === "/feedback/prompting-init") {
    return send(res, 200, { success: false });
  }

  if (req.method === "POST" && url.pathname === "/feedback") {
    const body = await readBody(req);
    const receivedAt = Date.now();

    // Simulate real-world network/processing latency, so the window between
    // "request sent" and "onAfterSubmit fires" is long enough to see.
    await new Promise((resolve) => setTimeout(resolve, state.delayMs));

    const feedbackId = randomUUID();
    const attemptMatch = ATTEMPT_RE.exec(body.comment ?? "");

    state.received.push({
      feedbackId,
      receivedAt,
      respondedAt: Date.now(),
      score: body.score,
      comment: body.comment,
      attemptId: attemptMatch?.[1] ?? null,
    });

    return send(res, 200, { feedbackId });
  }

  if (req.method === "GET" && url.pathname === "/log") {
    return send(res, 200, { delayMs: state.delayMs, received: state.received });
  }

  if (req.method === "POST" && url.pathname === "/config") {
    const body = await readBody(req);
    const requestedDelay = body.delayMs;
    // Reject anything out of range rather than clamping it, so the value
    // the timer below ever sees is always one we validated ourselves.
    if (
      Number.isFinite(requestedDelay) &&
      requestedDelay >= MIN_DELAY_MS &&
      requestedDelay <= MAX_DELAY_MS
    ) {
      state.delayMs = requestedDelay;
    }
    return send(res, 200, { delayMs: state.delayMs });
  }

  if (req.method === "POST" && url.pathname === "/reset") {
    state.received = [];
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "not found", path: url.pathname });
});

const PORT = Number(process.env.PORT ?? 4100);
server.listen(PORT, () => {
  console.log(`[mock-api] listening on http://localhost:${PORT}`);
});
