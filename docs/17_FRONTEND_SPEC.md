# dLogicAI Frontend Specification
Frontend: Astro + Tailwind.

Primary areas:
- authentication
- dashboard
- organizations/team
- projects
- API keys
- providers/BYOK
- conversations
- Chat Services
- integrations/connectors
- usage
- billing
- AI credits
- settings
- governance

Frontend routes must only depend on APIs that are documented and implemented.
# MVP navigation and activation clarification (2026-09-02)

For the MVP, the authenticated primary menu is task-oriented:

- Build: Overview, Chat Services, Channels, Conversations, Knowledge, Dialog Flows.
- Operate: Usage, Integrations.
- Account: Team, Billing, Settings.
- Report a problem is a persistent support action and accepts an optional screenshot.

Project, provider, API key, playground, governance, credit, and embed pages may remain accessible from contextual workflows, but are not primary navigation. The shell does not expose environment switching. New Telegram and WhatsApp installations remain in testing until the user explicitly activates them.
