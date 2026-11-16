---
"@reflag/react-native-sdk": major
---

Migrate React Native to the matching React/Browser v2 toolchain and protocol-v2 evaluated flags.

Native `useFlag()` now returns Boolean/direct JSON values, not v1 wrappers. Positional JSON defaults infer widened types; `useFlagSuspense()` handles readiness separately, and usage/feedback use their own hooks. Native reexports the v2 value/opt-in types and shares React's optional `Flags` registry, including React-format generated declarations. Legacy wrapper and remote-config types are removed.

Both Native providers retain AsyncStorage persistence, native SSE live updates and configurable platform adapters. Web toolbar/automatic feedback UI are disabled by default. Node v2 bootstrap envelopes work without an initial evaluation fetch; legacy v1 bootstrap is rejected. Offline fallbacks support direct-value maps as well as Boolean string-array shorthand. Upgrade bootstrap producers and consumers together.

Move the Native development version to `2.0.0-next.0`, depend on workspace React v2, use the modern JSX runtime (React 17+), and migrate the Expo/bare Native examples. OpenFeature Browser remains isolated on published Browser v1. This source change does not publish SDKs, deploy server support or claim device acceptance.
