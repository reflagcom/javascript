# cloudflare-worker

This is a simple example of how to use the Reflag SDK in a Cloudflare Worker.
It demonstrates how to initialize the client and evaluate flags.
It also shows how to flush the client and wait for any in-flight requests to complete.

- Set the REFLAG_SECRET_KEY environment variable in wrangler.jsonc to get started.
- Run `yarn dev` in your terminal to start a development server
- Open a browser tab at http://localhost:8787/ to see your worker in action
- Run `yarn run deploy` to publish your worker
