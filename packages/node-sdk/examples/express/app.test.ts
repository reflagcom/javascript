import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import app, { todos } from "./app";
import reflag from "./reflag";

function flag(name: string, enabled: boolean): void {
  let remove: (() => void) | undefined;

  beforeEach(() => {
    remove = reflag.pushFlagOverrides({ [name]: enabled });
  });

  afterEach(() => {
    remove?.();
    remove = undefined;
  });
}

beforeAll(async () => await reflag.initialize());

beforeEach(() => {
  reflag.setFlagOverrides({
    "show-todos": true,
  });
});

afterEach(() => {
  reflag.clearFlagOverrides();
});

describe("API Tests", () => {
  it("should return 200 for the root endpoint", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Ready to manage some TODOs!" });
  });

  it("should return todos", async () => {
    const response = await request(app).get("/todos");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ todos });
  });

  describe("with show-todos temporarily disabled", () => {
    flag("show-todos", false);

    it("should return no todos", async () => {
      const response = await request(app).get("/todos");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ todos: [] });
    });
  });
});
