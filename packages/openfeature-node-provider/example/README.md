# Reflag Node OpenFeature provider express example

This directory contains a simple example of how to use Reflag's `node-sdk`
with and the OpenFeature Reflag Node Provider with the `Express` framework.

The example code sets up a Reflag Node Provider, starts a
simple REST API service, and uses a set of predefined features to control
a user's access to the API.

The provider is initialized before the API is started and then, instances
of the client are bound to each individual user's request, to allow for fetching
the relevant features for each request.

To get started, create an app on [Reflag](https://reflag.com) and take a note of the
secret key which is found under _"Settings"_ -> _"Environments"_.

## Context

See [defaultTranslator](https://github.com/reflagcom/javascript/blob/7d108db2d1bde6e40d9eda92b66d06a1fbb7fa3f/packages/openfeature-node-provider/src/index.ts#L23-L45) for how OpenFeature context is translated into Reflag context
by default

## Running

The following code snippet should be enough to demonstrate the functionality
of the SDK:

```sh
yarn install

REFLAG_SECRET_KEY=<secretKey> yarn start
```
