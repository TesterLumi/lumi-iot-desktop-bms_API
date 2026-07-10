# Home Controller Console API Tests

## Scope

This feature folder validates console Home Controller CRUD APIs and the
database state created by those APIs.

## Folder Layout

```text
tests/console/home-controller/
  home-controller.spec.ts
  home-controller.support.ts
  README.md
```

`home-controller.support.ts` owns the Playwright fixture setup for this feature.
Reusable console API clients, schemas, and data factories stay in `src/core`.

## Run

```bash
npx playwright test tests/console/home-controller --config=playwright.config.ts
```

## Required Environment

- Console API endpoint values from `.env`
- Postgres connection values used by `PostgresClient`
