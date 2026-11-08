import { ReflagClient } from "../../src";

const FLAG_KEY = "demo-flag";
const ATTEMPTS_STORAGE_KEY = "reflag-demo-attempts";
const API_BASE = `${location.origin}/api`;

// --- Event log (section 2: the live widget) ------------------------------

const logEl = document.querySelector<HTMLDivElement>("#log")!;
const bannerEl = document.querySelector<HTMLDivElement>("#risk-banner")!;

let pendingSince: number | null = null;
let requestInFlight = false;
let bannerTimer: number | undefined;

function logLine(text: string, kind: "ok" | "pending" | "err" = "pending") {
  const line = document.createElement("div");
  line.className = kind;
  const t = new Date().toLocaleTimeString([], { hour12: false });
  line.textContent = `[${t}] ${text}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function openRiskWindow() {
  pendingSince = performance.now();
  requestInFlight = true;
  bannerEl.className = "pending";
  tickBanner();
  if (bannerTimer === undefined) bannerTimer = window.setInterval(tickBanner, 50);
}

function onFeedbackRequestSettled() {
  // The POST resolved, so the data is safely on the server. onAfterSubmit is
  // still deferred until Send or a dialog close, by design (see
  // withFeedbackSubmissionCallback) — so an abrupt tab close here loses the
  // callback even though it would NOT lose the feedback itself.
  requestInFlight = false;
  tickBanner();
}

function tickBanner() {
  if (pendingSince === null) return;
  const elapsed = Math.round(performance.now() - pendingSince);
  bannerEl.textContent = requestInFlight
    ? `⚠ request pending for ${elapsed}ms — closing the tab right now would lose this feedback entirely. onAfterSubmit has NOT fired yet.`
    : `⚠ response received ${elapsed}ms ago, feedback is saved server-side — but onAfterSubmit is still waiting on Send or the dialog closing. Closing the tab right now would lose the callback (not the data).`;
}

function closeRiskWindow(fired: boolean) {
  if (bannerTimer !== undefined) {
    clearInterval(bannerTimer);
    bannerTimer = undefined;
  }
  if (pendingSince === null) return;
  const elapsed = Math.round(performance.now() - pendingSince);
  pendingSince = null;
  requestInFlight = false;
  if (fired) {
    bannerEl.className = "resolved";
    bannerEl.textContent = `✓ onAfterSubmit fired after ${elapsed}ms. Safe to close the tab now.`;
  }
}

// Intercept fetch purely to see exactly when the request to /api/feedback
// leaves the browser and when its response comes back — this is the gap
// onAfterSubmit waits out, observed from the outside without touching the
// widget's internals.
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const isFeedbackSubmit = url.endsWith("/api/feedback") && method === "POST";

  if (isFeedbackSubmit) {
    logLine("→ POST /feedback sent", "pending");
    openRiskWindow();
  }

  const result = originalFetch(input, init);

  if (isFeedbackSubmit) {
    result
      .then(() => {
        logLine("← response received from server", "ok");
        onFeedbackRequestSettled();
      })
      .catch(() => {
        logLine("✕ request failed/aborted", "err");
        onFeedbackRequestSettled();
      });
  }

  return result;
};

// --- Reflag client ---------------------------------------------------------

const reflag = new ReflagClient({
  publishableKey: "demo-publishable-key",
  user: { id: "demo-user" },
  company: { id: "demo-company" },
  apiBaseUrl: API_BASE,
  enableTracking: false,
  feedback: { enableAutoFeedback: false },
});

reflag.initialize();

document.querySelector("#open-widget")!.addEventListener("click", (event) => {
  reflag.requestFeedback({
    flagKey: FLAG_KEY,
    title: "How do you like this demo?",
    position: { type: "POPOVER", anchor: event.currentTarget as HTMLElement },
    onAfterSubmit: (data) => {
      logLine(
        `✓ onAfterSubmit called (score=${data.score}, comment=${JSON.stringify(data.comment)}, feedbackId=${data.feedbackId})`,
        "ok",
      );
      closeRiskWindow(true);
    },
  });
});

// --- Artificial latency control --------------------------------------------

const delayInput = document.querySelector<HTMLInputElement>("#delay-input")!;
const delayStatus = document.querySelector<HTMLSpanElement>("#delay-status")!;

async function refreshDelay() {
  const res = await fetch(`${API_BASE}/log`);
  const { delayMs } = await res.json();
  delayInput.value = String(delayMs);
  delayStatus.textContent = `current: ${delayMs}ms`;
}

document.querySelector("#apply-delay")!.addEventListener("click", async () => {
  const delayMs = Number(delayInput.value);
  const res = await fetch(`${API_BASE}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delayMs }),
  });
  const body = await res.json();
  delayStatus.textContent = `current: ${body.delayMs}ms`;
});

refreshDelay();

// --- Danger zone: navigate away mid-submit ----------------------------------

type Attempt = {
  id: string;
  mode: "sdk (no keepalive)" | "raw fetch (keepalive)";
  sentAt: number;
  clientConfirmedAt: number | null;
  serverConfirmedAt: number | null;
};

function loadAttempts(): Attempt[] {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveAttempts(attempts: Attempt[]) {
  localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
}

function renderAttempts(serverReceived: { attemptId: string | null; receivedAt: number }[]) {
  const attempts = loadAttempts();
  const tbody = document.querySelector("#attempts tbody")!;
  tbody.innerHTML = "";

  for (const attempt of attempts) {
    const serverHit = serverReceived.find((r) => r.attemptId === attempt.id);
    if (serverHit && !attempt.serverConfirmedAt) {
      attempt.serverConfirmedAt = serverHit.receivedAt;
    }

    const clientOk = attempt.clientConfirmedAt !== null;
    const serverOk = attempt.serverConfirmedAt !== null;

    let verdict: string;
    let verdictClass: string;
    if (clientOk && serverOk) {
      verdict = "delivered, callback fired";
      verdictClass = "verdict-ok";
    } else if (!clientOk && serverOk) {
      verdict = "server got it, but onAfterSubmit never ran — don't rely on it for anything that must survive navigation";
      verdictClass = "verdict-partial";
    } else {
      verdict = "feedback lost entirely — the request itself was killed by the navigation";
      verdictClass = "verdict-lost";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="mono">${attempt.id.slice(0, 8)}</td>
      <td>${attempt.mode}</td>
      <td>${new Date(attempt.sentAt).toLocaleTimeString([], { hour12: false })}</td>
      <td>${clientOk ? "yes" : "no"}</td>
      <td>${serverOk ? "yes" : "no"}</td>
      <td class="${verdictClass}">${verdict}</td>
    `;
    tbody.appendChild(row);
  }

  saveAttempts(attempts);
}

async function pollServerLog() {
  const res = await fetch(`${API_BASE}/log`);
  const { received } = await res.json();
  renderAttempts(received);
}

setInterval(pollServerLog, 1000);
pollServerLog();

function markClientConfirmed(id: string) {
  const attempts = loadAttempts();
  const attempt = attempts.find((a) => a.id === id);
  if (attempt) attempt.clientConfirmedAt = Date.now();
  saveAttempts(attempts);
}

document.querySelector("#run-danger")!.addEventListener("click", () => {
  const id = crypto.randomUUID();
  const useKeepalive = document.querySelector<HTMLInputElement>("#use-keepalive")!.checked;
  const comment = `[demo:${id}] sent right before navigating away`;

  const attempts = loadAttempts();
  attempts.push({
    id,
    mode: useKeepalive ? "raw fetch (keepalive)" : "sdk (no keepalive)",
    sentAt: Date.now(),
    clientConfirmedAt: null,
    serverConfirmedAt: null,
  });
  saveAttempts(attempts);

  // Reproduces exactly what the widget's Send button does: await the POST,
  // then call onAfterSubmit. `reflag.feedback()` is the same method the
  // widget's onSubmit handler calls; `keepalive` isn't something the SDK
  // exposes, so that variant bypasses it entirely to show what a fix for the
  // *data-loss* half of the problem could look like. Either way, the
  // `.then()` below — standing in for onAfterSubmit — never gets a chance to
  // run: the navigation below destroys the page before the response arrives.
  const request = useKeepalive
    ? fetch(`${API_BASE}/feedback`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: FLAG_KEY,
          userId: "demo-user",
          companyId: "demo-company",
          score: 5,
          comment,
          source: "widget",
        }),
      })
    : reflag.feedback({ flagKey: FLAG_KEY, score: 5, comment });

  request.then(() => markClientConfirmed(id));

  logLine(`→ sent attempt ${id.slice(0, 8)}, navigating away in 30ms…`, "pending");

  setTimeout(() => {
    location.href = `gone.html?attempt=${id}`;
  }, 30);
});

document.querySelector("#reset")!.addEventListener("click", async () => {
  localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
  await fetch(`${API_BASE}/reset`, { method: "POST" });
  logEl.innerHTML = "";
  await pollServerLog();
});

// If we just came back from gone.html, highlight that this round-trip proves
// the point: reloading this script resets all in-memory state, so the only
// way `clientConfirmedAt` gets set below is if onAfterSubmit manages to run
// before navigation — which, for the danger-zone button, it never does.
const params = new URLSearchParams(location.search);
if (params.get("checkAttempt")) {
  logLine(
    `Back from navigating away mid-submit (attempt ${params.get("checkAttempt")!.slice(0, 8)}). Check the table below.`,
    "err",
  );
}
