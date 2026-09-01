# dLogicAI Conversation Specification
## Conversation lifecycle
1. Authenticate request.
2. Resolve tenant/project.
3. Validate input.
4. Resolve language.
5. Resolve provider/model.
6. Reserve usage/credits.
7. Invoke provider.
8. Persist response/message.
9. Settle usage and billing.
10. Finalize or refund reservations on failure.

Streaming follows the same accounting lifecycle, with final settlement after the stream completes.

Authenticated tenant users may pause or resume automated responses for a conversation and send a direct agent message while automation is paused. These actions are tenant-scoped and recorded in the conversation message history.
