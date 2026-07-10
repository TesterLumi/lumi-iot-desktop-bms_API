# Automation Real HC Tests

## Scope

This feature folder validates automation prerequisites against a real Home
Controller and smoke-checks runtime device control and scheduler APIs.

## Folder Layout

```text
tests/e2e/automation-real-hc/
  automation-center-api.spec.ts
  health.spec.ts
  runtime-scene-scheduler.spec.ts
  automation-real-hc.support.ts
  README.md
```

`automation-real-hc.support.ts` contains feature-local helpers used only by
the real-HC runtime specs. Shared API clients and environment config remain in
`src/core` and `src/config`.

## Default Real HC Data

- HC MAC: `88:e6:28:f8:2e:4d`
- HC direct endpoint: `http://10.10.30.154:8080`
- Automation service: `http://10.10.0.198:19000`
- Device service: `http://10.10.0.198:3333`
- Device control service: `http://10.10.0.198:8081`

## Run

```bash
npx playwright test tests/e2e/automation-real-hc --config=playwright.config.ts
```

Device control cases require:

```bash
AUTOMATION_ALLOW_DEVICE_CONTROL=true
```
