import request from "supertest";
import { expect, it, vi } from "vitest";

import app from "./app";

// Keep smoke tests offline: the default OpenFeature provider returns fallbacks.
vi.mock("./reflag", () => ({}));

it("serves the root endpoint", async () => {
  const response = await request(app).get("/");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ message: "Ready to manage some TODOs!" });
});

it("denies access when the show-todos flag falls back to false", async () => {
  const response = await request(app).get("/todos");
  expect(response.status).toBe(403);
});

it("rejects invalid todo bodies", async () => {
  const response = await request(app).post("/todos").send({ todo: 123 });
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: "Invalid todo" });
});

it("rejects invalid todo indices", async () => {
  const response = await request(app).delete("/todos/not-a-number");
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: "Invalid index" });
});
