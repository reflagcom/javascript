import { transferableAbortController } from "node:util";

import { afterAll, afterEach, beforeAll } from "vitest";

import { cleanupUi } from "./test/cleanupUi";
import { server } from "./test/mocks/server.js";

// Node fetch requires its own AbortSignal, not jsdom's cross-realm signal.
globalThis.AbortController = transferableAbortController()
  .constructor as typeof AbortController;

beforeAll(() => {
  server.listen({
    onUnhandledRequest(request) {
      console.error("Unhandled %s %s", request.method, request.url);
    },
  });
});

afterEach(() => {
  cleanupUi();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
