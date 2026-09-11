# ADR-003 — AI Provider Abstraction

Provider-specific API calls must sit behind a common provider interface so OpenAI, Gemini and future providers can be added without changing core conversation accounting.
