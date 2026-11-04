import { DefaultBodyType, http, HttpResponse, StrictRequest } from "msw";

import { RawFlags } from "../../src/flag/flags";

export const testChannel = "testChannel";

export function selectedFlag(
  value: RawFlags[string]["value"],
  variantKey = "true",
  sourceVersionId = "version-1",
): RawFlags[string] {
  return {
    value,
    resolved: true,
    variantKey,
    sourceVersionId,
    matchedRuleId: "default",
    ruleResults: [{ ruleId: "default", matched: true }],
    errors: [],
  };
}

export const flagsResult: RawFlags = {
  flagA: { ...selectedFlag(true), optInEnabled: false, optIn: null },
  flagB: {
    ...selectedFlag(
      { model: "gpt-something", temperature: 0.5 },
      "gpt3",
      "version-2",
    ),
    optInEnabled: false,
    optIn: null,
  },
};
export const flagResponse = {
  success: true,
  protocolVersion: 2,
  flagStateVersion: 1,
  remoteContextUsed: false,
  flags: flagsResult,
};

function checkRequest(request: StrictRequest<DefaultBodyType>) {
  const url = new URL(request.url);
  const hasKey =
    url.searchParams.get("publishableKey") ||
    request.headers.get("Authorization");

  const hasSdkVersion =
    url.searchParams.get("reflag-sdk-version") ||
    request.headers.get("reflag-sdk-version");

  const valid = hasKey && hasSdkVersion;
  if (!valid) {
    console.log(
      "missing token or sdk: " +
        request.url.toString() +
        " " +
        JSON.stringify(request.headers),
    );
  }
  return valid;
}

const invalidReqResponse = new HttpResponse("missing token or sdk", {
  status: 400,
});

export function getFlags({
  request,
}: {
  request: StrictRequest<DefaultBodyType>;
}) {
  if (!checkRequest(request)) return invalidReqResponse;

  return HttpResponse.json(flagResponse);
}

export const handlers = [
  http.post("https://front.reflag.com/bulk", async ({ request }) => {
    if (!checkRequest(request)) return invalidReqResponse;

    const data = await request.json();
    if (!Array.isArray(data) || data.length === 0) {
      return HttpResponse.error();
    }

    const valid = data.every((item) => {
      if (typeof item !== "object" || item === null || !("type" in item)) {
        return false;
      }
      const event = item as Record<string, unknown>;
      if (event.type === "user") {
        return typeof event.userId === "string";
      }
      if (event.type === "company") {
        return typeof event.companyId === "string";
      }
      if (event.type === "event") {
        return (
          typeof event.userId === "string" && typeof event.event === "string"
        );
      }
      if (event.type === "feature-flag-event") {
        return typeof event.key === "string" && event.action === "check";
      }
      if (event.type === "prompt-event") {
        return (
          typeof event.featureId === "string" &&
          typeof event.promptId === "string" &&
          typeof event.userId === "string" &&
          typeof event.promptedQuestion === "string" &&
          (event.action === "received" ||
            event.action === "shown" ||
            event.action === "dismissed")
        );
      }
      return false;
    });

    if (!valid) {
      return HttpResponse.error();
    }

    return HttpResponse.json({
      success: true,
    });
  }),
  http.post("https://front.reflag.com/user", async ({ request }) => {
    if (!checkRequest(request)) return invalidReqResponse;

    const data = await request.json();
    if (
      typeof data !== "object" ||
      !data ||
      !data["userId"] ||
      !data["attributes"]
    ) {
      return HttpResponse.error();
    }

    return HttpResponse.json({
      success: true,
    });
  }),
  http.post("https://front.reflag.com/company", async ({ request }) => {
    if (!checkRequest(request)) return invalidReqResponse;
    const data = await request.json();

    if (
      typeof data !== "object" ||
      !data ||
      !data["companyId"] ||
      !data["attributes"]
    ) {
      return HttpResponse.error();
    }

    return HttpResponse.json({
      success: true,
    });
  }),
  http.post("https://front.reflag.com/event", async ({ request }) => {
    if (!checkRequest(request)) return invalidReqResponse;
    const data = await request.json();

    if (typeof data !== "object" || !data || !data["userId"]) {
      return HttpResponse.error();
    }

    return HttpResponse.json({
      success: true,
    });
  }),
  http.post("https://front.reflag.com/features/events", async ({ request }) => {
    if (!checkRequest(request)) return invalidReqResponse;
    const data = await request.json();

    if (typeof data !== "object" || !data || !data["userId"]) {
      return HttpResponse.error();
    }

    return HttpResponse.json({
      success: true,
    });
  }),
  http.post("https://front.reflag.com/feedback", async ({ request }) => {
    if (!checkRequest(request)) return invalidReqResponse;
    const data = await request.json();
    if (
      typeof data !== "object" ||
      !data ||
      !data["userId"] ||
      typeof data["score"] !== "number" ||
      (!data["featureId"] && !data["key"])
    ) {
      return HttpResponse.error();
    }

    return HttpResponse.json({
      success: true,
    });
  }),
  http.get("https://front.reflag.com/features/enabled", getFlags),
  http.get("https://front.reflag.com/flags/evaluated", getFlags),
  http.post(
    "https://front.reflag.com/feedback/prompting-init",
    ({ request }) => {
      if (!checkRequest(request)) return invalidReqResponse;

      return HttpResponse.json({ success: true, channel: testChannel });
    },
  ),
];
