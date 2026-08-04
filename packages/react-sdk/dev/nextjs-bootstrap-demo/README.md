This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

The purpose of this project is to demonstrate usage integration with the Reflag React SDK using server-side bootstrapping, with `useFlag` wrapped in a React Suspense boundary for any later client-side loading states.

## Getting Started

Configure both SDK keys in `.env.local`:

```bash
REFLAG_SECRET_KEY=sec_...
REFLAG_PUBLISHABLE_KEY=pub_...
```

The example logs a warning and uses offline mode for the affected SDK if either key is missing.

Run the development server:

```bash
yarn dev
```
