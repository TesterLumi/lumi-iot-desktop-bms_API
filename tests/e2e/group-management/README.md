# Group Management API E2E

This suite covers Group Management API automation from TC1 to TC123, excluding
TC45..TC47 because the current real devices only support on/off group control.
It follows the same compact structure used by Scene and Schedule suites.

## Structure

```text
tests/e2e/group-management/
  group-management.api.spec.ts
  group-management.support.ts
  README.md
```

| File | Purpose |
| --- | --- |
| `group-management.api.spec.ts` | Executable TC1..TC123 in manual-test order, with TC45..TC47 removed for the current on/off-only fixture. |
| `group-management.support.ts` | Real API helper, token/login helper, evidence, cleanup, device status polling, HC sync and HC log tail on failure. |

## Required Environment

Set these values in `.env` or the shell before running against the real system:

```env
GROUP_BASE_URL=http://10.10.0.198:3333
GROUP_API_BASE=/api/v0/groups
GROUP_AUTH_LOGIN_API=/api/v0/auth/login
GROUP_ADMIN_ACCESS_TOKEN=
GROUP_VIEWER_ACCESS_TOKEN=
GROUP_NO_PERMISSION_ACCESS_TOKEN=

GROUP_DEVICE_CONTROL_BASE_URL=http://10.10.0.198:8081
GROUP_DEVICE_CONTROL_API=/api/devices/control
GROUP_DEVICE_STATUS_BASE_URL=http://10.10.30.154:8080
GROUP_DEVICE_STATUS_API=/api/devices/status
GROUP_HC_BASE_URL=http://10.10.30.154:8080
GROUP_HC_API_BASE=/api/groups
GROUP_REQUIRE_AUTH=false
GROUP_NORMAL_DEVICE_TYPE_ID=10001
GROUP_LIGHTING_DEVICE_TYPE_ID=10000

TEST_SWITCH_DEVICE_ID_1=
TEST_SWITCH_DEVICE_ID_2=
TEST_LIGHTING_DEVICE_ID_1=
TEST_LIGHTING_DEVICE_ID_2=
SLOT_ON_OFF=1
POLL_INTERVAL_MS=500
POLL_TIMEOUT_MS=10000
SYNC_TIMEOUT_MS=15000
GROUP_ALLOW_DEVICE_CONTROL=false
GROUP_ALLOW_DEFAULT_BLE_DELETE_CHECK=false
```

If `GROUP_REQUIRE_AUTH=true` and token env is empty, the suite attempts login with:

```env
ADMIN_USERNAME=
ADMIN_PASSWORD=
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=
```

Only use automation/staging-safe HC and device fixtures. Do not point this suite
at production devices.

## Runtime Control

TC37..TC48, TC52, TC101..TC122 control real devices or default groups. They
are skipped unless:

```powershell
$env:GROUP_ALLOW_DEVICE_CONTROL='true'
```

Those cases create a test group, capture initial device state, control the group
or fallback to per-device control, poll `GET /api/devices/status`, assert real
device output, reset the device state in `finally`, and cleanup the group.

On the current real environment, Group CRUD is served by iot-console at
`GROUP_BASE_URL=http://10.10.0.198:3333`.

If `/groups/:id/control` is not implemented, the helper records the 404/405/501
group-control response and controls each device in the group through
`GROUP_DEVICE_CONTROL_API`.

TC123 is intentionally skipped by default because it attempts to delete the
default BLE group to prove the backend rejects that action. Only enable it in a
safe test environment:

```powershell
$env:GROUP_ALLOW_DEFAULT_BLE_DELETE_CHECK='true'
```

## Removed Cases

The current HC/device fixture only supports group on/off. These dimming cases
were removed from the executable suite:

| Removed | Reason | Covered by |
| --- | --- | --- |
| TC45 - Dim group lighting 50% | No real dimmer/brightness device in fixture; slot 2 reports device telemetry, not brightness. | Not covered until a real dimmer fixture is provided. |
| TC46 - Dim group lighting 100% | Same as TC45. | Not covered until a real dimmer fixture is provided. |
| TC47 - Dim group lighting 0% | Same as TC45. | Not covered until a real dimmer fixture is provided. |

On/off lighting control remains covered by TC43, TC44, TC101 and TC102.

## Evidence

Each testcase writes a separate JSON file:

```text
test-runs/group-management-current/evidence/api/TC*_*.json
```

Evidence includes request/response, assertions, cleanup result, configured
endpoints, and `error_message` when the testcase fails. If SSH env is provided,
failed cases also attach HC log tail:

```env
HC_SSH_HOST=
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
```

## Run

```powershell
npx.cmd tsc --noEmit
```

```powershell
npx.cmd playwright test tests/e2e/group-management/group-management.api.spec.ts --config=playwright.config.ts --list
```

```powershell
$runDir='test-runs\group-management-current'
if (Test-Path $runDir) { Remove-Item -LiteralPath (Resolve-Path $runDir).Path -Recurse -Force }
New-Item -ItemType Directory -Force $runDir | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/group-management-current/html-report'
npx.cmd playwright test tests/e2e/group-management/group-management.api.spec.ts --config=playwright.config.ts --reporter=html,allure-playwright --workers=1 --output=test-runs/group-management-current/test-results *>&1 | Tee-Object -FilePath test-runs\group-management-current\run.log
```

Run one testcase:

```powershell
npx.cmd playwright test tests/e2e/group-management/group-management.api.spec.ts --config=playwright.config.ts -g "TC43"
```
