import { CheckEvent, RawFlags } from "./flag/flags";
import { CompanyContext, UserContext } from "./context";

export interface HookArgs {
  check: CheckEvent;
  flagsUpdated: RawFlags;

  /**
   * @deprecated Use `flagsUpdated` instead.
   */
  featuresUpdated: RawFlags;
  user: UserContext;
  company: CompanyContext;
  track: TrackEvent;
}

export type TrackEvent = {
  user: UserContext;
  company?: CompanyContext;
  eventName: string;
  attributes?: Record<string, any> | null;
};

/**
 * Hooks manager.
 * @internal
 */
export class HooksManager {
  private hooks: {
    check: ((arg0: CheckEvent) => void)[];
    flagsUpdated: ((arg0: RawFlags) => void)[];
    user: ((arg0: UserContext) => void)[];
    company: ((arg0: CompanyContext) => void)[];
    track: ((arg0: TrackEvent) => void)[];
  } = {
    check: [],
    flagsUpdated: [],
    user: [],
    company: [],
    track: [],
  };

  private _adjustEvent(event: keyof HookArgs) {
    return event === "featuresUpdated" ? "flagsUpdated" : event;
  }

  addHook<THookType extends keyof HookArgs>(
    event: THookType,
    cb: (arg0: HookArgs[THookType]) => void,
  ): () => void {
    (this.hooks[this._adjustEvent(event)] as any[]).push(cb);
    return () => {
      this.removeHook(event, cb);
    };
  }

  removeHook<THookType extends keyof HookArgs>(
    event: THookType,
    cb: (arg0: HookArgs[THookType]) => void,
  ): void {
    this.hooks[this._adjustEvent(event)] = this.hooks[
      this._adjustEvent(event)
    ].filter((hook) => hook !== cb) as any;
  }

  trigger<THookType extends keyof HookArgs>(
    event: THookType,
    arg: HookArgs[THookType],
  ): void {
    this.hooks[this._adjustEvent(event)].forEach((hook) => hook(arg as any));
  }
}
