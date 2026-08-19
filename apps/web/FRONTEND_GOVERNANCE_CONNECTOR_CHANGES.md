# dLogicAI frontend governance + connector changes

## Included
- Added the dLogicAI tagline beneath the logo in the desktop dashboard shell, mobile dashboard header and public home header.
- Added **Data Governance** dashboard page covering active retention, backup frequency/retention and archival policy.
- Added **Integration Connectors** dashboard page showing connector status, included monthly API-call allowances, usage and the separate overage billing model.
- Added navigation entries for Data Governance and Integrations.
- Added billing-impact messaging linking retention/backup/archival and connector usage to bundled offers, add-ons and overages.

## Persistence note
The governance page currently saves its preview settings to browser local storage because the current API source does not expose tenant governance endpoints. Server-side persistence should be wired to the API when those endpoints are added; the UI deliberately does not pretend browser-local settings are tenant configuration.
