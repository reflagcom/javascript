---
"@reflag/node-sdk": patch
"@reflag/react-sdk": patch
"@reflag/vue-sdk": patch
"@reflag/react-native-sdk": patch
---

Replace workspace-only dependency ranges with registry-compatible versions so the published SDKs can be installed outside the monorepo. Keep local workspace linking and the existing v1 OpenFeature dependencies unchanged.
