# Home Controller Online E2E Tests

## Scope

This feature folder verifies a Home Controller health check and the matching
MQTT online/offline status in Postgres.

## Folder Layout

```text
tests/e2e/hc-online/
  hc-online.spec.ts
  hc-online.support.ts
  README.md
```

`hc-online.support.ts` owns the feature fixture setup. Shared HC clients,
config loading, DB helpers, and container helpers remain in `src/core` and
`src/utils`.

## Run

```bash
npx playwright test tests/e2e/hc-online --config=playwright.config.ts
```

## Required Environment

- `IOT_HC_ENDPOINT`
- Test HC metadata from sysconfig
- Postgres connection values
- Docker/container access for the offline testcase
