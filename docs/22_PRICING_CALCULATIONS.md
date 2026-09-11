# dLogicAI Pricing Calculations

## Purpose

This document defines how dLogicAI calculates monthly customer charges for combinations of platform subscription, managed AI, BYOK, knowledge bases, channels, and connectors.

All amounts are USD. Monetary calculations use integer micros internally:

```text
1 USD = 1,000,000 micros
1 USD cent = 10,000 micros
```

Customer pricing is configuration-driven. Provider cost is tracked for profitability and settlement, but it must not itself become a hard-coded customer price.

## Monthly Charge Formula

```text
monthly_charge = platform_subscription
               + managed_ai_topups
               + byok_platform_subscription
               + knowledge_addons
               + channel_fees
               + channel_provider_pass_through
               + connector_fees
               + connector_operation_overages
               + optional_governance_addons
```

A tenant uses either the managed subscription price or the eligible BYOK subscription price for its selected plan, not both.

## Base Plans

| Plan | Managed monthly price | BYOK monthly price | Included managed AI allowance | Request safeguard |
|---|---:|---:|---:|---:|
| Free | $0 | Not available | $2 | 1,000 |
| Builder | $29 | $19 | $15 | 25,000 |
| Growth | $99 | $59 | $50 | 100,000 |
| Business | $399 | $199 | $200 | 500,000 |

Managed AI allowance is stored as credit micros and is consumed from actual completed usage. Request safeguards are protective quotas, not a second billable allowance.

## Managed AI Calculation

### Provider Cost

```text
provider_cost = (input_tokens * input_price_per_million
               + output_tokens * output_price_per_million) / 1,000,000
```

The platform defaults to Gemini 2.5 Flash-Lite. GPT-5 Mini is the managed secondary provider and can be promoted to primary only through the platform deployment setting. Higher-cost models require BYOK.

### Customer Credit Consumption

```text
managed_ai_charge = ceil(provider_cost * (10,000 + markup_bps) / 10,000)
```

The current plan-configured markup is `3,500` basis points, or 35%.

```text
managed_ai_charge = provider_cost * 1.35
```

Before calling a managed provider, dLogicAI reserves a bounded estimated charge. After a non-streaming response, it settles the actual token charge and returns unused reserved credits to the original balance bucket.

### Example Managed AI Turn

For 1,000 input tokens and 500 output tokens:

| Managed model | Internal provider-cost assumption | Estimated provider cost | Customer credit consumption at 35% markup |
|---|---|---:|---:|
| Gemini 2.5 Flash-Lite | $0.10 input / $0.40 output per 1M tokens | $0.00030 | $0.000405 |
| GPT-5 Mini | $0.25 input / $2.00 output per 1M tokens | $0.00125 | $0.001688 |

Provider price sheets must be reviewed regularly. The values above are operational assumptions in the current API and are not a substitute for provider invoices.

## BYOK Calculation

BYOK tenants supply encrypted OpenAI or Gemini credentials. dLogicAI does not pay their model-provider bill.

```text
monthly_charge = byok_plan_price
               + connector_fees
               + connector_operation_overages
               + channel_fees
               + channel_provider_pass_through
               + knowledge_addons
```

A plan-configured request service fee may apply where enabled:

```text
byok_usage_charge = completed_byok_requests * byok_request_fee_micros
```

The current recommendation is to keep that fee at zero or minimal while the plan subscription funds orchestration, knowledge retrieval, observability, and support.

## Knowledge Base Calculation

Knowledge-base controls constrain storage, D1 chunk rows, retrieval work, and LLM input context.

| Plan | KBs | Documents | Storage | Chunks | Max file | KBs per Chat Service | Retrieval chunks | Retrieval context |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Free | 1 | 10 | 25 MB | 1,000 | 1 MB | 1 | 1 | 1,200 chars |
| Builder | 5 | 100 | 1 GB | 10,000 | 5 MB | 3 | 2 | 2,400 chars |
| Growth | 20 | 1,000 | 10 GB | 75,000 | 15 MB | 10 | 4 | 6,000 chars |
| Business | 100 | 10,000 | 100 GB | 500,000 | 25 MB | 25 | 6 | 9,000 chars |

For future paid add-ons:

```text
knowledge_addon_charge = additional_storage_gb * storage_price_per_gb
                       + additional_chunk_pack * chunk_pack_price
```

Do not charge separately for normal lexical retrieval within the plan cap. The retrieved context increases managed-AI input tokens and is therefore already reflected in managed credit usage.

When the tenant enables post-index source deletion, original R2 files are deleted after successful extraction while chunks and document metadata remain. This reduces storage cost but removes source-file download capability.

## Channel Calculation

### Telegram

```text
telegram_charge = channel_installation_fee + managed_ai_or_byok_usage
```

Telegram text delivery has no expected direct per-message platform charge in the current integration. The cost drivers are AI inference, Worker execution, D1 event storage, and retries.

### WhatsApp

```text
whatsapp_charge = channel_installation_fee
                + managed_ai_or_byok_usage
                + delivered_template_messages * meta_rate_by_category_country_tier
                + platform_delivery_margin
```

Non-template messages inside an open customer-service window are typically free from Meta. Delivered templates outside that window are charged by Meta based on destination country, category, and volume tier. These charges must be passed through from delivery pricing data; they must never consume managed AI allowance.

## Connector Calculation

Connector billing begins when a real marketplace adapter is available. Credential tests, dLogicAI retries, and failed dLogicAI calls are not billable.

```text
connector_charge = active_installations * installation_fee
                 + max(0, successful_operations - included_operations) * overage_price_per_operation
```

Suggested initial commercial controls:

| Plan | Connector installations | Included successful operations |
|---|---:|---:|
| Free | 0 | 0 |
| Builder | 0 | 0 |
| Growth | 2 | 5,000 shared/month |
| Business | 10 | 50,000 shared/month |
| Enterprise | Contract | Contract |

Amazon SP-API should be priced as a Business/Enterprise connector. Shopee and Lazada are Growth/Business add-ons. Use cached marketplace data and webhook synchronization to reduce billable live lookups.

## Example Requirement Combinations

### 1. Builder API chatbot with managed Gemini

Requirements:

- Builder subscription
- Gemini 2.5 Flash-Lite managed routing
- One project and one API key
- Two knowledge bases, under 1 GB
- No channels or connectors
- $8 of actual managed AI consumption in the period

```text
monthly_charge = $29 base + $0 AI top-up + $0 add-ons = $29
remaining_managed_allowance = $15 - $8 = $7
```

### 2. Growth support service with Telegram and knowledge retrieval

Requirements:

- Growth subscription
- Telegram installation
- Four attached knowledge bases
- $65 actual managed AI consumption
- No connector

```text
monthly_charge = $99 base + $15 managed AI top-up + telegram_installation_fee
```

The first $50 of managed consumption is included. The `$15` top-up is priced from the configured AI-credit catalog, not inferred from provider cost at invoice time.

### 3. Growth ecommerce service with Lazada connector

Requirements:

- Growth subscription
- Lazada installation
- 6,200 successful connector operations
- $30 managed AI consumption
- No WhatsApp templates

```text
monthly_charge = $99 base
               + lazada_installation_fee
               + (6,200 - 5,000) * lazada_operation_overage
               = $99 + configured connector charges
```

Managed AI remains inside the `$50` included allowance.

### 4. Business WhatsApp order support with BYOK

Requirements:

- Business BYOK subscription
- Tenant OpenAI/Gemini credentials
- WhatsApp installation
- 12,000 delivered templates with destination/category-specific Meta rates
- 60,000 successful connector operations
- 120 GB knowledge storage

```text
monthly_charge = $199 BYOK base
               + whatsapp_installation_fee
               + Meta template pass-through
               + platform delivery margin
               + 10,000 * connector_operation_overage
               + 20 GB * additional_storage_price_per_gb
```

The customer pays their AI-provider invoice directly. dLogicAI bills the platform, channel, connector, and storage components.

### 5. Free evaluation workspace

Requirements:

- Free plan
- Web/API testing only
- One knowledge base
- $2 managed AI allowance exhausted

```text
monthly_charge = $0
next_action = require paid-plan upgrade or purchased managed AI credits
```

No channels, connectors, or BYOK are available on the Free plan.

## Invoicing Rules

- Charge only completed managed AI usage; failed provider calls refund the reservation.
- Charge connector overage only for successful external operations.
- Record WhatsApp provider charges from delivery pricing metadata before invoicing.
- Use plan version and effective dates when pricing a billing period.
- Keep provider cost, customer charge, usage event, credit reservation, and ledger references reconcilable.
- Apply tax, currency conversion, and Stripe processing according to the tenant billing configuration; they are outside the base usage formula.

## Configuration Requirements

The following prices must be maintained in configuration or billing catalog data:

- Plan subscription and eligible BYOK prices
- Managed AI markup by plan
- Managed AI credit top-up packs
- Channel installation and platform delivery margin
- WhatsApp destination/category/tier pass-through rate source
- Connector installation prices, operation allowances, overage rates, and hard limits
- Knowledge storage and chunk-pack add-ons
- Optional governance, retention, and support add-ons

Do not place these customer-price values in provider invocation code.
