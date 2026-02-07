# Customer Admin Panel

Small Next.js (App Router) app that uses `@reflag/rest-api-sdk` with server actions to view and toggle flags for users and companies.

## Setup

Create a `.env.local` file in this folder with:

```
REFLAG_API_KEY=your-api-key
# Optional
REFLAG_BASE_URL=https://app.reflag.com/api
```

## Run

```bash
yarn dev
```

Visit:
- http://localhost:3000/flags/user
- http://localhost:3000/flags/company
