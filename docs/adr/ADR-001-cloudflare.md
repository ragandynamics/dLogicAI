# ADR-001 — Cloudflare Platform

Use Cloudflare Workers/Hono as the primary API runtime and Cloudflare D1 as the transactional relational store. R2/KV/Queues are adopted when the domain requires their characteristics.
