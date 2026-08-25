# dLogicAI Deployment & CI/CD Specification
Environments:
- development/local
- staging/UAT
- production

Pipeline should:
1. install with one supported package manager
2. lint/typecheck
3. run tests
4. build
5. validate migrations
6. deploy to target environment
7. run smoke tests

D1 migration identifiers must be unique and deployment-safe.
Environment-specific secrets/bindings must never be committed.
