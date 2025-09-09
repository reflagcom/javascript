import { HttpClient } from "../httpClient";
import { Logger } from "../logger";
import { AblySSEChannel, openAblySSEChannel } from "../sse";
import { Position } from "../ui/types";

import {
  FeedbackSubmission,
  FeedbackTranslations,
  OpenFeedbackFormOptions,
} from "./ui/types";
import {
  FeedbackPromptCompletionHandler,
  parsePromptMessage,
  processPromptMessage,
} from "./prompts";
import { getAuthToken } from "./promptStorage";
import * as feedbackLib from "./ui";
import { DEFAULT_POSITION } from "./ui";

export type Key = string;

export type FeedbackOptions = {
  /**
   * Enables automatic feedback prompting if it's set up in Reflag
   */
  enableAutoFeedback?: boolean;

  /**
   *
   */
  autoFeedbackHandler?: FeedbackPromptHandler;

  /**
   * With these options you can override the look of the feedback prompt
   */
  ui?: {
    /**
     * Control the placement and behavior of the feedback form.
     */
    position?: Position;

    /**
     * Add your own custom translations for the feedback form.
     * Undefined translation keys fall back to english defaults.
     */
    translations?: Partial<FeedbackTranslations>;
  };
};

export type RequestFeedbackData = Omit<
  OpenFeedbackFormOptions,
  "key" | "onSubmit"
> & {
  /**
   * Company ID from your own application.
   */
  companyId?: string;

  /**
   * Allows you to handle a copy of the already submitted
   * feedback.
   *
   * This can be used for side effects, such as storing a
   * copy of the feedback in your own application or CRM.
   *
   * @param {Object} data
   */
  onAfterSubmit?: (data: FeedbackSubmission) => void;

  /**
   * Flag key.
   */
  flagKey: string;
};

export type RequestFeedbackOptions = RequestFeedbackData & {
  /**
   * User ID from your own application.
   */
  userId: string;
};

export type UnassignedFeedback = {
  /**
   * Flag key.
   */
  flagKey: string;

  /**
   * Reflag feedback ID
   */
  feedbackId?: string;

  /**
   * The question that was presented to the user.
   */
  question?: string;

  /**
   * The original question.
   * This only needs to be populated if the feedback was submitted through the automated feedback surveys channel.
   */
  promptedQuestion?: string;

  /**
   * Customer satisfaction score.
   */
  score?: number;

  /**
   * User supplied comment about your flag.
   */
  comment?: string;

  /**
   * Reflag feedback prompt ID.
   *
   * This only exists if the feedback was submitted
   * as part of an automated prompt from Reflag.
   *
   * Used for internal state management of automated
   * feedback.
   */
  promptId?: string;

  /**
   * Source of the feedback, depending on how the user was asked
   * - `prompt` - Feedback submitted by way of an automated feedback survey (prompted)
   * - `widget` - Feedback submitted via `requestFeedback`
   * - `sdk` - Feedback submitted via `feedback`
   */
  source?: "prompt" | "sdk" | "widget";
};

export type Feedback = UnassignedFeedback & {
  /**
   * User ID from your own application.
   */
  userId?: string;

  /**
   * Company ID from your own application.
   */
  companyId?: string;
};

export type FeedbackPrompt = {
  /**
   * Specific question user was asked
   */
  question: string;

  /**
   * Feedback prompt should appear only after this time
   */
  showAfter: Date;

  /**
   * Feedback prompt will not be shown after this time
   */
  showBefore: Date;

  /**
   * Id of the prompt
   */
  promptId: string;

  /**
   * Feature ID from Reflag
   */
  featureId: string;
};

export type FeedbackPromptReply = {
  question: string;
  companyId?: string;
  score?: number;
  comment?: string;
};

export type FeedbackPromptReplyHandler = <T extends FeedbackPromptReply | null>(
  reply: T,
) => T extends null ? Promise<void> : Promise<{ feedbackId: string }>;

export type FeedbackPromptHandlerOpenFeedbackFormOptions = Omit<
  RequestFeedbackOptions,
  "featureId" | "flagKey" | "userId" | "companyId" | "onClose" | "onDismiss"
>;

export type FeedbackPromptHandlerCallbacks = {
  reply: FeedbackPromptReplyHandler;
  openFeedbackForm: (
    options: FeedbackPromptHandlerOpenFeedbackFormOptions,
  ) => void;
};

export type FeedbackPromptHandler = (
  prompt: FeedbackPrompt,
  handlers: FeedbackPromptHandlerCallbacks,
) => void;

export const createDefaultFeedbackPromptHandler = (
  options: FeedbackPromptHandlerOpenFeedbackFormOptions = {},
): FeedbackPromptHandler => {
  return (_prompt: FeedbackPrompt, handlers) => {
    handlers.openFeedbackForm(options);
  };
};
export const DEFAULT_FEEDBACK_CONFIG = {
  promptHandler: createDefaultFeedbackPromptHandler(),
  feedbackPosition: DEFAULT_POSITION,
  translations: {},
  autoFeedbackEnabled: true,
};

// Payload can include featureId or flagKey, but the public API only exposes flagKey
// We use featureId internally because prompting is based on featureId
type FeedbackPayload = Omit<Feedback, "flagKey"> & {
  featureId?: string;
  flagKey?: string;
};

export async function feedback(
  httpClient: HttpClient,
  logger: Logger,
  payload: FeedbackPayload,
) {
  if (!payload.score && !payload.comment) {
    logger.error(
      "`feedback` call ignored, either `score` or `comment` must be provided",
    );
    return;
  }

  if (!payload.userId) {
    logger.error("`feedback` call ignored, no `userId` provided");
    return;
  }

  const featureId = "featureId" in payload ? payload.featureId : undefined;
  const flagKey = "flagKey" in payload ? payload.flagKey : undefined;

  if (!featureId && !flagKey) {
    logger.error(
      "`feedback` call ignored. Neither `featureId` nor `flagKey` have been provided",
    );
    return;
  }

  // set default source to sdk
  const feedbackPayload = {
    ...payload,
    flagKey: undefined,
    source: payload.source ?? "sdk",
    featureId,
    key: flagKey,
  };

  const res = await httpClient.post({
    path: `/feedback`,
    body: feedbackPayload,
  });

  logger.debug(`sent feedback`, res);
  return res;
}

export class AutoFeedback {
  private initialized = false;
  private sseChannel: AblySSEChannel | null = null;

  constructor(
    private sseBaseUrl: string,
    private logger: Logger,
    private httpClient: HttpClient,
    private feedbackPromptHandler: FeedbackPromptHandler = createDefaultFeedbackPromptHandler(),
    private userId: string,
    private position: Position = DEFAULT_POSITION,
    private feedbackTranslations: Partial<FeedbackTranslations> = {},
  ) {}

  /**
   * Start receiving automated feedback surveys.
   */
  async initialize() {
    if (this.initialized) {
      this.logger.error("auto. feedback client already initialized");
      return;
    }
    this.initialized = true;

    const channel = await this.getChannel();
    if (!channel) return;

    try {
      this.logger.debug(`auto. feedback enabled`, channel);
      this.sseChannel = openAblySSEChannel({
        userId: this.userId,
        channel,
        httpClient: this.httpClient,
        callback: (message) =>
          this.handleFeedbackPromptRequest(this.userId, message),
        logger: this.logger,
        sseBaseUrl: this.sseBaseUrl,
      });
      this.logger.debug(`auto. feedback connection established`);
    } catch (e) {
      this.logger.error(`error initializing auto. feedback client`, e);
    }
  }

  private async getChannel() {
    const existingAuth = getAuthToken(this.userId);
    const channel = existingAuth?.channel;

    if (channel) {
      return channel;
    }

    try {
      if (!channel) {
        const res = await this.httpClient.post({
          path: `/feedback/prompting-init`,
          body: {
            userId: this.userId,
          },
        });

        this.logger.debug(`auto. feedback status sent`, res);
        if (res.ok) {
          const body: { success: boolean; channel?: string } = await res.json();
          if (body.success && body.channel) {
            return body.channel;
          }
        }
      }
    } catch (e) {
      this.logger.error(`error initializing auto. feedback`, e);
      return;
    }
    return;
  }

  handleFeedbackPromptRequest(userId: string, message: any) {
    const parsed = parsePromptMessage(message);
    if (!parsed) {
      this.logger.error(`invalid feedback prompt message received`, message);
    } else {
      if (
        !processPromptMessage(userId, parsed, async (u, m, cb) => {
          await this.feedbackPromptEvent({
            promptId: parsed.promptId,
            featureId: parsed.featureId,
            promptedQuestion: parsed.question,
            event: "received",
            userId,
          });
          await this.triggerFeedbackPrompt(u, m, cb);
        })
      ) {
        this.logger.info(
          `feedback prompt not shown, it was either expired or already processed`,
          message,
        );
      }
    }
  }

  stop() {
    if (this.sseChannel) {
      this.sseChannel.close();
      this.sseChannel = null;
    }
  }

  async triggerFeedbackPrompt(
    userId: string,
    message: FeedbackPrompt,
    completionHandler: FeedbackPromptCompletionHandler,
  ) {
    const feedbackId: string | undefined = undefined;

    await this.feedbackPromptEvent({
      promptId: message.promptId,
      featureId: message.featureId,
      promptedQuestion: message.question,
      event: "shown",
      userId,
    });

    const replyCallback: FeedbackPromptReplyHandler = async (reply) => {
      if (!reply) {
        await this.feedbackPromptEvent({
          promptId: message.promptId,
          featureId: message.featureId,
          event: "dismissed",
          userId,
          promptedQuestion: message.question,
        });

        completionHandler();
        return;
      }

      const feedbackPayload = {
        feedbackId: feedbackId,
        featureId: message.featureId,
        userId,
        companyId: reply.companyId,
        score: reply.score,
        comment: reply.comment,
        promptId: message.promptId,
        question: reply.question,
        promptedQuestion: message.question,
        source: "prompt",
      } satisfies FeedbackPayload;

      const response = await feedback(
        this.httpClient,
        this.logger,
        feedbackPayload,
      );

      completionHandler();

      if (response && response.ok) {
        return await response?.json();
      }
      return;
    };

    const handlers: FeedbackPromptHandlerCallbacks = {
      reply: replyCallback,
      openFeedbackForm: (options) => {
        feedbackLib.openFeedbackForm({
          key: message.featureId,
          title: message.question,
          onSubmit: async (data) => {
            const res = await replyCallback(data);
            if (!res) return;
            options.onAfterSubmit?.({ ...data, ...res });
            return res;
          },
          onDismiss: () => replyCallback(null),
          position: this.position,
          translations: this.feedbackTranslations,
          ...options,
        });
      },
    };

    this.feedbackPromptHandler(message, handlers);
  }

  async feedbackPromptEvent(args: {
    event: "received" | "shown" | "dismissed";
    featureId: string;
    promptId: string;
    promptedQuestion: string;
    userId: string;
  }) {
    const payload = {
      action: args.event,
      featureId: args.featureId,
      promptId: args.promptId,
      userId: args.userId,
      promptedQuestion: args.promptedQuestion,
    };

    const res = await this.httpClient.post({
      path: `/feedback/prompt-events`,
      body: payload,
    });
    this.logger.debug(`sent prompt event`, res);
    return res;
  }
}
