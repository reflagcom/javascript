import reflag from "./reflag";
import express from "express";
import { BoundReflagClient } from "../src";

// Augment the Express types to include the `reflagUser` property on the `res.locals` object
// This will allow us to access the ReflagClient instance in our route handlers
// without having to pass it around manually
declare global {
  namespace Express {
    interface Locals {
      reflagUser: BoundReflagClient;
    }
  }
}

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  // Extract the user and company IDs from the request headers
  // You'll want to use a proper authentication and identification
  // mechanism in a real-world application
  const { user, company } = extractReflagContextFromHeader(req);

  // Create a new BoundReflagClient instance by calling the `bindClient` method on a `ReflagClient` instance
  // This will create a new instance that is bound to the user/company given.
  const reflagUser = reflag.bindClient({ user, company });

  // Store the BoundReflagClient instance in the `res.locals` object so we can access it in our route handlers
  res.locals.reflagUser = reflagUser;
  next();
});

export const todos = ["Buy milk", "Walk the dog"];

app.get("/", (_req, res) => {
  res.locals.reflagUser.track("Front Page Viewed");
  res.json({ message: "Ready to manage some TODOs!" });
});

// Return todos if the feature is enabled for the user
app.get("/todos", async (_req, res) => {
  // We use the `getFlag` method to check if the user has the "show-todos" feature enabled.
  // Note that "show-todos" is a feature that we defined in the `Flags` interface in the `reflag.ts` file.
  // and that the indexing for feature name below is type-checked at compile time.
  const { isEnabled, track } = res.locals.reflagUser.getFlag("show-todos");

  if (isEnabled) {
    track();

    // You can instead also send any custom event if you prefer, including attributes.
    // res.locals.reflagUser.track("Todo's viewed", { attributes: { access: "api" } });

    return res.json({ todos });
  }

  // Return no todos if the feature is disabled for the user
  return res.json({ todos: [] });
});

app.post("/todos", (req, res) => {
  const { todo } = req.body;

  if (typeof todo !== "string") {
    return res.status(400).json({ error: "Invalid todo" });
  }

  const { track, isEnabled, config } =
    res.locals.reflagUser.getFlag("create-todos");

  // Check if the user has the "create-todos" feature enabled
  if (isEnabled) {
    // Check if the todo is at least N characters long
    if (todo.length < config.payload.minimumLength) {
      return res
        .status(400)
        .json({ error: "Todo must be at least 5 characters long" });
    }

    // Track the feature usage
    track();
    todos.push(todo);

    return res.status(201).json({ todo });
  }

  res
    .status(403)
    .json({ error: "You do not have access to this feature yet!" });
});

app.delete("/todos/:idx", (req, res) => {
  const idx = parseInt(req.params.idx);

  if (isNaN(idx) || idx < 0 || idx >= todos.length) {
    return res.status(400).json({ error: "Invalid index" });
  }

  const { track, isEnabled } = res.locals.reflagUser.getFlag("delete-todos");

  if (isEnabled) {
    todos.splice(idx, 1);

    track();
    res.json({});
  }

  res
    .status(403)
    .json({ error: "You do not have access to this feature yet!" });
});

app.get("/features", async (_req, res) => {
  const features = await res.locals.reflagUser.getFlagsRemote();
  res.json(features);
});

export default app;

function extractReflagContextFromHeader(req: express.Request) {
  const user = req.headers["x-reflag-user-id"]
    ? {
        id: req.headers["x-reflag-user-id"] as string,
        role: req.headers["x-reflag-is-admin"] ? "admin" : "user",
      }
    : undefined;
  const company = req.headers["x-reflag-company-id"]
    ? {
        id: req.headers["x-reflag-company-id"] as string,
        betaUser: !!req.headers["x-reflag-company-beta-user"],
      }
    : undefined;
  return { user, company };
}
