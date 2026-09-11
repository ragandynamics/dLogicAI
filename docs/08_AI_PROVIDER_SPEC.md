# dLogicAI AI Provider Specification
## Providers
Initial:
- OpenAI
- Google Gemini

## Provider abstraction
```ts
interface AIProvider {
  generate(request): Promise<ProviderResult>;
  stream(request): Promise<ProviderStream>;
  calculateCost(usage): number;
}
```

## Routing
- Provider may be selected explicitly or through policy/auto routing.
- Model selection must be configurable.
- BYOK credentials are tenant/project scoped and encrypted.
- Provider failures must be normalized.
