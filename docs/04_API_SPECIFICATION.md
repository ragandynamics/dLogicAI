# dLogicAI API Specification
## Base
`/v1`

## Core endpoints
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/me`
- `GET/PATCH /v1/organization`
- organization members/invitations endpoints
- project CRUD
- project API-key CRUD
- provider/BYOK endpoints
- `POST /v1/responses`
- conversation and message endpoints
- `GET /v1/usage`
- billing/subscription/credits endpoints
- health endpoint

## Contract rules
- JSON request/response format.
- Authentication errors must be safe and consistent.
- Tenant/project authorization is mandatory.
- API-key secrets are returned only at creation.
- Provider errors are normalized before returning to clients.
