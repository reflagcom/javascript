import type { RawFlag, ReflagContext } from "@reflag/browser-sdk";

import type {
  BootstrappedFlags,
  FlagKey,
  ReflagBootstrappedProps,
  SerializedBootstrappedFlags,
} from "../src";
import { useFlag } from "../src";

declare module "../src" {
  interface Flags {
    "frontend-flag": {
      config: {
        payload: {
          message: string;
        };
      };
    };
  }
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T,
>() => T extends B ? 1 : 2
  ? true
  : false;

type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

type SharedBootstrappedPayload = {
  context: ReflagContext;
  flags: Record<string, RawFlag>;
};

type ServerGeneratedBootstrappedPayload = {
  context: ReflagContext;
  flags: Record<"server-only-flag", RawFlag>;
};

type Assertions = [
  Expect<Extends<SharedBootstrappedPayload, BootstrappedFlags>>,
  Expect<Extends<SharedBootstrappedPayload, SerializedBootstrappedFlags>>,
  Expect<Extends<SharedBootstrappedPayload, ReflagBootstrappedProps["flags"]>>,
  Expect<Extends<ServerGeneratedBootstrappedPayload, BootstrappedFlags>>,
  Expect<
    Extends<ServerGeneratedBootstrappedPayload, ReflagBootstrappedProps["flags"]>
  >,
  Expect<Equal<FlagKey, "frontend-flag">>,
  Expect<Equal<Parameters<typeof useFlag>[0], "frontend-flag">>,
];

declare const assertions: Assertions;
declare const sharedPayload: SharedBootstrappedPayload;
declare const serverGeneratedPayload: ServerGeneratedBootstrappedPayload;

const bootstrappedFlags: BootstrappedFlags = sharedPayload;
const serializedFlags: SerializedBootstrappedFlags = serverGeneratedPayload;
const sharedProviderProps: ReflagBootstrappedProps = {
  flags: sharedPayload,
  publishableKey: "pk_test",
};
const mismatchedUnionProviderProps: ReflagBootstrappedProps = {
  flags: serverGeneratedPayload,
  publishableKey: "pk_test",
};
const validLocalFlagKey: Parameters<typeof useFlag>[0] = "frontend-flag";

void assertions;
void bootstrappedFlags;
void serializedFlags;
void sharedProviderProps;
void mismatchedUnionProviderProps;
void validLocalFlagKey;

// @ts-expect-error Bootstrapped transport widening must not weaken local consumer typing.
const _invalidLocalFlagKey: Parameters<typeof useFlag>[0] = "server-only-flag";
