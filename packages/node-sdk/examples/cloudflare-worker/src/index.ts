/**
 * This is a simple example of how to use the Reflag SDK in a Cloudflare Worker.
 * It demonstrates how to initialize the client and evaluate flags.
 * It also shows how to flush the client and wait for any in-flight requests to complete.
 *
 * Set the REFLAG_SECRET_KEY environment variable in wrangler.jsonc to get started.
 *
 * - Run `yarn run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `yarn run deploy` to publish your worker
 *
 */

import { EdgeClient } from "../../../";

// set the REFLAG_SECRET_KEY environment variable or pass the secret key in the constructor
const reflag = new EdgeClient();

export default {
  async fetch(request, _env, ctx): Promise<Response> {
    // initialize the client and wait for it to complete
    // this is not required for the edge client, but is included for completeness
    await reflag.initialize();

    const url = new URL(request.url);
    const userId = url.searchParams.get("user.id");
    const companyId = url.searchParams.get("company.id");

    const f = reflag.getFlags({
      user: { id: userId ?? undefined },
      company: { id: companyId ?? undefined },
    });

    // ensure all events are flushed and any requests to refresh the feature cache
    // have completed after the response is sent
    ctx.waitUntil(reflag.flush());

    return new Response(
      `Flags for user ${userId} and company ${companyId}: ${JSON.stringify(f, null, 2)}`,
    );
  },
} satisfies ExportedHandler<Env>;
