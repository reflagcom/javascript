# Reflag

Feature flags for SaaS that run on TypeScript. [Learn more and get started](https://reflag.com/)

## React SDK

Client side React SDK

[Read the docs](packages/react-sdk/README.md)

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
2. Run `yarn run version`
3. Push and PR

### Publishing

The [Github Action](.github/workflows/publish.yml) will automatically publish any versioned packages when merging to `main`
