import { afterAll, afterEach, beforeAll } from "vitest";

import { cleanupUi } from "./test/cleanupUi";
import { server } from "./test/mocks/server.js";

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
