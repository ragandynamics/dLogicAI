# dLogicAI frontend billing changes

The frontend remains Astro + Tailwind CSS and stays separated from the backend API.

## Added

- `/register`
- `/pricing`
- `/dashboard/billing`
- `/dashboard/credits`
- `/dashboard/team`
- `/dashboard/settings`

## Updated

- `src/layouts/AppLayout.astro`
- `src/services/api.ts`
- `src/pages/api/[...path].ts`
- `src/pages/dashboard/index.astro`
- `src/pages/login.astro`
- `src/pages/index.astro`

## API proxy

Browser calls use `/api/...`.

The Astro proxy maps:

- `/api/auth/login` -> backend `/v1/auth/login`
- `/api/auth/register` -> backend `/v1/auth/register`
- `/api/plans` -> backend `/v1/plans`
- `/api/billing/...` -> backend `/v1/billing/...`
- `/api/projects/...` -> backend `/v1/projects/...`
- `/api/usage` -> backend `/v1/usage`

This keeps the browser independent from the backend origin and preserves HttpOnly session cookies.

## Required environment

For local development the default backend is:

`http://127.0.0.1:8787`

For production, set:

`PUBLIC_API_BASE_URL=https://your-api-host`

## Important backend dependency

Subscription upgrade to a paid plan currently returns `checkout_required` until the payment/checkout backend endpoint is implemented.

The AI credit dashboard and credit ledger are wired to the current credit endpoints.

Manual credit purchase UI should be enabled only after the backend exposes a payment-backed credit purchase endpoint.
