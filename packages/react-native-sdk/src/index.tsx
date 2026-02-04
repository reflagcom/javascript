import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ReflagBootstrappedProvider as BaseBootstrappedProvider,
  ReflagProvider as BaseProvider,
} from "@reflag/react-sdk";
import type {
  ReflagBootstrappedProps,
  ReflagProps,
} from "@reflag/react-sdk";

export * from "@reflag/react-sdk";

export function ReflagProvider(props: ReflagProps) {
  return <BaseProvider {...props} storage={props.storage ?? AsyncStorage} />;
}

export function ReflagBootstrappedProvider(props: ReflagBootstrappedProps) {
  return (
    <BaseBootstrappedProvider
      {...props}
      storage={props.storage ?? AsyncStorage}
    />
  );
}
