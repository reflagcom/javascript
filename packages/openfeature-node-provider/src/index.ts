import {
  ErrorCode,
  EvaluationContext,
  JsonValue,
  OpenFeatureEventEmitter,
  Paradigm,
  Provider,
  ResolutionDetails,
  ServerProviderStatus,
  StandardResolutionReasons,
  TrackingEventDetails,
} from "@openfeature/server-sdk";

import {
  ClientOptions,
  Context as ReflagContext,
  ReflagClient,
} from "@reflag/node-sdk";

type ProviderOptions = ClientOptions & {
  contextTranslator?: (context: EvaluationContext) => ReflagContext;
};

export const defaultContextTranslator = (
  context: EvaluationContext,
): ReflagContext => {
  const user = {
    id: context.targetingKey ?? context["userId"]?.toString(),
    name: context["name"]?.toString(),
    email: context["email"]?.toString(),
    avatar: context["avatar"]?.toString(),
    country: context["country"]?.toString(),
  };

  const company = {
    id: context["companyId"]?.toString(),
    name: context["companyName"]?.toString(),
    avatar: context["companyAvatar"]?.toString(),
    plan: context["companyPlan"]?.toString(),
  };

  return {
    user,
    company,
  };
};

export class ReflagNodeProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();

  private _client: ReflagClient;

  private contextTranslator: (context: EvaluationContext) => ReflagContext;

  public runsOn: Paradigm = "server";

  public status: ServerProviderStatus = ServerProviderStatus.NOT_READY;

  public metadata = {
    name: "reflag-node",
  };

  get client() {
    return this._client;
  }

  constructor({ contextTranslator, ...opts }: ProviderOptions) {
    this._client = new ReflagClient(opts);
    this.contextTranslator = contextTranslator ?? defaultContextTranslator;
  }

  public async initialize(): Promise<void> {
    await this._client.initialize();
    this.status = ServerProviderStatus.READY;
  }

  private resolveFlag<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: ReflagContext,
    resolveFn: (
      feature: ReturnType<typeof this._client.getFlag>,
    ) => Promise<ResolutionDetails<T>>,
  ): Promise<ResolutionDetails<T>> {
    if (this.status !== ServerProviderStatus.READY) {
      return Promise.resolve({
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: "Reflag client not initialized",
      });
    }

    if (!context.user?.id) {
      return Promise.resolve({
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.INVALID_CONTEXT,
        errorMessage: "At least a user ID is required",
      });
    }

    const featureDefs = this._client.getFlagDefinitions();
    if (featureDefs.some(({ key }) => key === flagKey)) {
      return resolveFn(this._client.getFlag(context, flagKey));
    }

    return Promise.resolve({
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: `Flag ${flagKey} not found`,
    });
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolveFlag(
      flagKey,
      defaultValue,
      this.contextTranslator(context),
      (feature) => {
        return Promise.resolve({
          value: feature.isEnabled,
          variant: feature.config?.key,
          reason: StandardResolutionReasons.TARGETING_MATCH,
        });
      },
    );
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.resolveFlag(
      flagKey,
      defaultValue,
      this.contextTranslator(context),
      (feature) => {
        if (!feature.config.key) {
          return Promise.resolve({
            value: defaultValue,
            reason: StandardResolutionReasons.DEFAULT,
          });
        }

        return Promise.resolve({
          value: feature.config.key as string,
          variant: feature.config.key,
          reason: StandardResolutionReasons.TARGETING_MATCH,
        });
      },
    );
  }

  resolveNumberEvaluation(
    _flagKey: string,
    defaultValue: number,
  ): Promise<ResolutionDetails<number>> {
    return Promise.resolve({
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.GENERAL,
      errorMessage:
        "Reflag doesn't support this method. Use `resolveObjectEvaluation` instead.",
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    return this.resolveFlag(
      flagKey,
      defaultValue,
      this.contextTranslator(context),
      (feature) => {
        const expType = typeof defaultValue;
        const payloadType = typeof feature.config.payload;

        if (
          feature.config.payload === undefined ||
          feature.config.payload === null ||
          payloadType !== expType
        ) {
          return Promise.resolve({
            value: defaultValue,
            variant: feature.config.key,
            reason: StandardResolutionReasons.ERROR,
            errorCode: ErrorCode.TYPE_MISMATCH,
            errorMessage: `Expected remote config payload of type \`${expType}\` but got \`${payloadType}\`.`,
          });
        }

        return Promise.resolve({
          value: feature.config.payload,
          variant: feature.config.key,
          reason: StandardResolutionReasons.TARGETING_MATCH,
        });
      },
    );
  }

  track(
    trackingEventName: string,
    context?: EvaluationContext,
    trackingEventDetails?: TrackingEventDetails,
  ): void {
    const translatedContext = context
      ? this.contextTranslator(context)
      : undefined;

    const userId = translatedContext?.user?.id;
    if (!userId) {
      this._client.logger?.warn("No user ID provided for tracking event");
      return;
    }

    void this._client.track(String(userId), trackingEventName, {
      attributes: trackingEventDetails,
      companyId: translatedContext?.company?.id?.toString(),
    });
  }

  public async onClose(): Promise<void> {
    await this._client.flush();
  }
}
