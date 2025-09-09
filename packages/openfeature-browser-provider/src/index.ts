import {
  ErrorCode,
  EvaluationContext,
  JsonValue,
  OpenFeatureEventEmitter,
  Provider,
  ProviderMetadata,
  ProviderStatus,
  ResolutionDetails,
  StandardResolutionReasons,
  TrackingEventDetails,
} from "@openfeature/web-sdk";

import { Flag, InitOptions, ReflagClient } from "@reflag/browser-sdk";

export type ContextTranslationFn = (
  context?: EvaluationContext,
) => Record<string, any>;

export function defaultContextTranslator(
  context?: EvaluationContext,
): Record<string, any> {
  if (!context) return {};
  return {
    user: {
      id: context.targetingKey ?? context["userId"]?.toString(),
      email: context["email"]?.toString(),
      name: context["name"]?.toString(),
      avatar: context["avatar"]?.toString(),
      country: context["country"]?.toString(),
    },
    company: {
      id: context["companyId"]?.toString(),
      name: context["companyName"]?.toString(),
      plan: context["companyPlan"]?.toString(),
      avatar: context["companyAvatar"]?.toString(),
    },
  };
}

export class ReflagBrowserSDKProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: "reflag-browser-provider",
  };

  private _client?: ReflagClient;

  private readonly _clientOptions: InitOptions;
  private readonly _contextTranslator: ContextTranslationFn;

  public events = new OpenFeatureEventEmitter();

  private _status: ProviderStatus = ProviderStatus.NOT_READY;

  set status(status: ProviderStatus) {
    this._status = status;
  }

  get status() {
    return this._status;
  }

  get client() {
    return this._client;
  }

  constructor({
    contextTranslator,
    ...opts
  }: InitOptions & { contextTranslator?: ContextTranslationFn }) {
    this._clientOptions = opts;
    this._contextTranslator = contextTranslator || defaultContextTranslator;
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    const client = new ReflagClient({
      ...this._clientOptions,
      ...this._contextTranslator(context),
    });

    try {
      await client.initialize();
      this.status = ProviderStatus.READY;
      this._client = client;
    } catch {
      this.status = ProviderStatus.ERROR;
    }
  }

  onClose(): Promise<void> {
    if (this._client) {
      return this._client?.stop();
    }
    return Promise.resolve();
  }

  async onContextChange(
    _oldContext: EvaluationContext,
    newContext: EvaluationContext,
  ): Promise<void> {
    await this.initialize(newContext);
  }

  private resolveFlag<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    resolveFn: (feature: Flag) => ResolutionDetails<T>,
  ): ResolutionDetails<T> {
    if (!this._client) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: "Reflag client not initialized",
      } satisfies ResolutionDetails<T>;
    }

    const features = this._client.getFlags();
    if (flagKey in features) {
      return resolveFn(this._client.getFlag(flagKey));
    }

    return {
      value: defaultValue,
      reason: StandardResolutionReasons.DEFAULT,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: `Flag ${flagKey} not found`,
    };
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean) {
    return this.resolveFlag(flagKey, defaultValue, (feature) => {
      return {
        value: feature.isEnabled,
        variant: feature.config.key,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };
    });
  }

  resolveNumberEvaluation(_flagKey: string, defaultValue: number) {
    return {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.GENERAL,
      errorMessage:
        "Reflag doesn't support this method. Use `resolveObjectEvaluation` instead.",
    };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
  ): ResolutionDetails<string> {
    return this.resolveFlag(flagKey, defaultValue, (feature) => {
      if (!feature.config.key) {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DEFAULT,
        };
      }

      return {
        value: feature.config.key as string,
        variant: feature.config.key,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
  ) {
    return this.resolveFlag(flagKey, defaultValue, (feature) => {
      const expType = typeof defaultValue;

      const payloadType = typeof feature.config.payload;

      if (
        feature.config.payload === undefined ||
        feature.config.payload === null ||
        payloadType !== expType
      ) {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.ERROR,
          variant: feature.config.key,
          errorCode: ErrorCode.TYPE_MISMATCH,
          errorMessage: `Expected remote config payload of type \`${expType}\` but got \`${payloadType}\`.`,
        };
      }

      return {
        value: feature.config.payload,
        variant: feature.config.key,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };
    });
  }

  track(
    trackingEventName: string,
    _context?: EvaluationContext,
    trackingEventDetails?: TrackingEventDetails,
  ): void {
    if (!this._client) {
      this._clientOptions.logger?.error("client not initialized");
    }

    this._client
      ?.track(trackingEventName, trackingEventDetails)
      .catch((e: any) => {
        this._clientOptions.logger?.error("error tracking event", e);
      });
  }
}
