# Schedule Management API Tests

## Scope

This folder contains generated API automation testcase coverage for device
schedule management, `TC1` to `TC25`. Token/permission cases `TC26` to `TC29`
were removed because scheduler auth/RBAC contracts are not available in this
harness.

The suite connects to the real gateway/Home Controller scheduler API. It keeps
the same safety gate as other real-device tests: write/runtime cases are skipped
unless `AUTOMATION_ALLOW_DEVICE_CONTROL=true`.

## Folder Layout

```text
tests/e2e/schedule-management/
  schedule-management.api.spec.ts
  schedule-management.support.ts
  README.md
```

## Run

Run the schedule suite:

```bash
AUTOMATION_ALLOW_DEVICE_CONTROL=true npx playwright test tests/e2e/schedule-management/schedule-management.api.spec.ts --config=playwright.config.ts
```

Run only CRUD scheduler cases:

```bash
AUTOMATION_ALLOW_DEVICE_CONTROL=true npx playwright test tests/e2e/schedule-management/schedule-management.api.spec.ts -g "TC(1|2|3|4|5|6|7|8|9|10|11|12) -"
```

Useful optional fixture overrides:

```bash
DEVICE_CONTROL_ENDPOINT=http://10.10.0.198:8081
IOT_HC_ENDPOINT=http://10.10.30.154:8080
TEST_SWITCH_DEVICE_ID=<safe-switch-device>
TEST_DIMMER_DEVICE_ID=<safe-dimmer-device>
SLOT_ON_OFF=1
SLOT_BRIGHTNESS=2
POLL_INTERVAL_MS=500
POLL_TIMEOUT_MS=15000
HC_SSH_HOST=10.10.30.154
HC_SSH_USER=root
HC_SSH_KEY_PATH=<path-to-unencrypted-or-agent-usable-private-key>
HC_SSH_KEY_PASSPHRASE=<optional-private-key-passphrase>
HC_SSH_PASSWORD=<optional-password-auth-fallback>
HC_RESTART_COMMAND="/etc/init.d/S90process-manager restart"
```

`TC17` restarts Home Controller through SSH. The key must be usable by OpenSSH
in non-interactive mode, or provide `HC_SSH_KEY_PASSPHRASE` for encrypted keys.

## Evidence

Evidence JSON is written to:

```text
test-runs/schedule-management-current/evidence/api/
```

The `schedule-management-current` evidence directory is reset at the start of
each Playwright run so it only contains the latest run's testcase evidence.

Current real-HC contract note: `POST /api/devices/scheduler/{device_id}` is
supported, while `GET /api/devices/scheduler/{device_id}` returned `405` during
the latest run. CRUD cases record that response in evidence and verify the
write API response.
