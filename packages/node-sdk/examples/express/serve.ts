import "dotenv/config";

import reflag from "./reflag";
import app from "./app";

// Initialize Reflag SDK before starting the server,
// so that features are available when the server starts.
reflag.initialize().then(() => {
  // Start listening for requests only after Reflag is initialized,
  // which guarantees that features are available.
  app.listen(process.env.PORT ?? 3000, () => {
    console.log("Server is running on port 3000");
  });
});
