# Reflag Node-SDK Express example

This directory contains a simple example of how to use Reflag's `node-sdk` with
`Express` framework. The example code sets up a Reflag SDK client, starts a
simple REST API service, and uses a set of predefined features to control
a user's access to the API.

The Reflag SDK client is initialized before the API is started and then, instances
of the client are bound to each individual user's request, to allow for fetching
the relevant features for each request.

To get started, create an app on [Reflag](https://reflag.com) and take a note of the
secret key which is found under _"Settings"_ -> _"Environments"_.

## Running

The following code snippet should be enough to demonstrate the functionality
of the SDK:

```sh
yarn install

REFLAG_SECRET_KEY=<secretKey> yarn start
```
