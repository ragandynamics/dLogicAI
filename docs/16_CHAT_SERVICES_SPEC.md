# dLogicAI Chat Services Specification
A Chat Service is a reusable conversational configuration associated with a project.

It should define configurable:
- provider/model policy
- system behavior
- language behavior
- safety/policy controls
- knowledge/connectors
- usage/billing policy
- observability settings

CRUD and runtime invocation must be exposed through authenticated project-scoped APIs.

Provider provisioning is explicit per Chat Service:
- `managed`: use dLogicAI's configured provider credentials.
- `tenant`: use an encrypted tenant OpenAI or Google Gemini credential configured for the project.

`POST /v1/responses` accepts an optional `chat_service_id`. When present, the service's provider mode and provider policy are applied after validating that the service belongs to the authenticated project and tenant.
