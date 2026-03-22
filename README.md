# Reflag

Feature flags for SaaS that run on TypeScript. [Learn more and get started](https://reflag.com/)

## React SDK

Client side React SDK

[Read the docs](packages/react-sdk/README.md)

## React Native SDK (beta)

React Native SDK for mobile apps

[Read the docs](packages/react-native-sdk/README.md)

## Vue SDK (beta)

Client side Vue SDK

[Read the docs](packages/vue-sdk/README.md)

## Browser SDK

Browser SDK for use in non-React web applications

[Read the docs](packages/browser-sdk/README.md)

## Node.js SDK

Node.js SDK for use on the server side.
Use this for Cloudflare Workers as well.

[Read the docs](packages/node-sdk/README.md)

## Management SDK (beta)

Typed SDK for Reflag's REST API.

[Read the docs](packages/management-sdk/README.md)

## Reflag CLI

CLI to interact with Reflag and generate types

[Read the docs](packages/cli/README.md)

## OpenFeature Browser Provider

Use Reflag with OpenFeature in the browser through the Reflag OpenFeature Browser Provider

[Read the docs](packages/openfeature-browser-provider/README.md)

## OpenFeature Node.js Provider

Use the Reflag with OpenFeature on the server in Node.js through the Reflag OpenFeature Node.js Provider

[Read the docs](packages/openfeature-node-provider/README.md)

## Development

### Versioning

1. Create a new branch locally
2. Run `yarn changeset`
3. Select the packages that changed and the correct bump type
4. Commit the generated file in `.changeset/`
5. Push and open a PR

### Publishing

Repository setup:

1. Configure npm Trusted Publisher entries for the packages in this repo against the `reflagcom/javascript` GitHub repository and the `publish.yml` workflow
2. Keep the workflow on GitHub-hosted runners with `id-token: write`, plus `contents: write` and `pull-requests: write` for the release PR flow

When a PR with one or more changesets is merged to `main`, the release workflow will open or update a `Version Packages` PR.

Merging that PR will:

1. Apply the version bumps
2. Publish the updated packages to npm
3. Rebuild and push the generated SDK docs
