# Moved: `@reflag/rest-api-sdk` → `@reflag/management-sdk`

This SDK has been renamed.

- Old package: `@reflag/rest-api-sdk`
- New package: `@reflag/management-sdk`
- New location in this repo: [`packages/management-sdk`](../management-sdk/README.md)

Please update your dependencies and imports:

```diff
- npm install @reflag/rest-api-sdk
+ npm install @reflag/management-sdk
```

```diff
- import { Api } from "@reflag/rest-api-sdk";
+ import { Api } from "@reflag/management-sdk";
```
