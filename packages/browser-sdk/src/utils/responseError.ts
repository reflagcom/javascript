export type ResponseErrorDetails = {
  responseBody?: string;
  apiErrorCode?: string;
  apiErrorMessage?: string;
};

export type ParsedResponseError = {
  errorDetails: ResponseErrorDetails;
  errorSummary?: string;
};

type LogLevel = "debug" | "info" | "warn" | "error";

type ResponseLogger = {
  [key in LogLevel]: (message: string, ...args: any[]) => void;
};

const MAX_RESPONSE_BODY_PREVIEW_CHARS = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractApiError(value: unknown): { code?: string; message?: string } {
  if (!isObject(value)) {
    return {};
  }

  const topLevelCode = typeof value.code === "string" ? value.code : undefined;
  const topLevelMessage =
    typeof value.message === "string" ? value.message : undefined;

  const error = value.error;
  if (!isObject(error)) {
    return {
      code: topLevelCode,
      message: topLevelMessage,
    };
  }

  return {
    code: typeof error.code === "string" ? error.code : topLevelCode,
    message: typeof error.message === "string" ? error.message : topLevelMessage,
  };
}

export async function parseResponseErrorDetails(
  res: Response,
): Promise<ResponseErrorDetails> {
  try {
    const body = await res.text();
    if (!body) {
      return {};
    }

    let apiErrorCode: string | undefined;
    let apiErrorMessage: string | undefined;
    try {
      const parsed: unknown = JSON.parse(body);
      const parsedError = extractApiError(parsed);
      apiErrorCode = parsedError.code;
      apiErrorMessage = parsedError.message;
    } catch {
      // ignore JSON parse failures
    }

    return {
      responseBody: body.slice(0, MAX_RESPONSE_BODY_PREVIEW_CHARS),
      apiErrorCode,
      apiErrorMessage,
    };
  } catch {
    return {};
  }
}

export function formatResponseErrorSummary(details: ResponseErrorDetails) {
  if (details.apiErrorCode && details.apiErrorMessage) {
    return `${details.apiErrorCode}: ${details.apiErrorMessage}`;
  }

  return details.apiErrorMessage ?? details.apiErrorCode;
}

export async function parseResponseError(
  res: Response,
): Promise<ParsedResponseError> {
  const errorDetails = await parseResponseErrorDetails(res);
  const errorSummary = formatResponseErrorSummary(errorDetails);
  return { errorDetails, errorSummary };
}

export async function logResponseError(args: {
  logger: ResponseLogger;
  level?: LogLevel;
  res: Response;
  message: string;
  extra?: Record<string, unknown>;
}) {
  const { logger, level = "error", res, message, extra } = args;
  const { errorDetails, errorSummary } = await parseResponseError(res);

  logger[level](
    errorSummary ? `${message}: ${errorSummary}` : message,
    {
      status: res.status,
      statusText: res.statusText,
      ...errorDetails,
      ...extra,
    },
  );

  return { errorDetails, errorSummary };
}
