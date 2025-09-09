import { DefaultBodyType, http, HttpResponse, StrictRequest } from "msw";

import { RawFlags } from "../../src/flag/flags";

export const testChannel = "testChannel";

export const flagResponse = {
  success: true,
  features: {
    flagA: {
      isEnabled: true,
      key: "flagA",
      targetingVersion: 1,
      config: undefined,
      ruleEvaluationResults: [false, true],
      missingContextFields: ["field1", "field2"],
    },
    flagB: {
      isEnabled: true,
      targetingVersion: 11,
      key: "flagB",
      config: {
        version: 12,
        key: "gpt3",
        payload: { model: "gpt-something", temperature: 0.5 },
        ruleEvaluationResults: [true, false, false],
        missingContextFields: ["field3"],
      },
    },
  },
};

export const flagsResult = Object.entries(flagResponse.features).reduce(
  (acc, [key, flag]) => {
    acc[key] = {
      ...flag!,
      config: flag.config,
      isEnabledOverride: null,
    };
    return acc;
  },
  {} as RawFlags,
);

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
  http.get("https://front.reflag.com/features/evaluated", getFlags),
  http.post(
    "https://front.reflag.com/feedback/prompting-init",
    ({ request }) => {
      if (!checkRequest(request)) return invalidReqResponse;

      return HttpResponse.json({ success: true, channel: testChannel });
    },
  ),
  http.get(
    "https://front.reflag.com/feedback/prompting-auth",
    ({ request }) => {
      if (!checkRequest(request)) return invalidReqResponse;
      return HttpResponse.json({ success: true, keyName: "keyName" });
    },
  ),
  http.post(
    "https://livemessaging.bucket.co/keys/keyName/requestToken",
    async ({ request }) => {
      const data = await request.json();
      if (typeof data !== "object") {
        return HttpResponse.error();
      }

      return HttpResponse.json({
        success: true,
        token: "token",
        expires: 1234567890,
      });
    },
  ),
];
