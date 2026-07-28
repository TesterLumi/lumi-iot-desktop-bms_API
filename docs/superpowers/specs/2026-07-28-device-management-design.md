# Device Management API Automation Design

Date: 2026-07-28

## Goal

Build a clean, compact Playwright API automation suite for Device Management
against the real BMS system, real Home Controller, and real devices. The suite
must follow existing repo conventions, write fresh evidence for every run, and
collect useful failure logs without leaving automation data behind.

## Scope

In scope for this phase:

- Health check before suite execution.
- Real admin login and authenticated API calls.
- Device list, search, filters, pagination, detail, and lookup APIs.
- Safe create/update/delete for devices created by the testcase.
- Assign and unassign one automation-created device to an automation area.
- Update and clear position for an automation-created device assigned to an
  automation area.
- Area device summary read APIs.
- Auth, invalid token, and no-permission cases when fixture credentials exist.
- Request/response evidence for every testcase.
- System log and HC SSH log collection on failure when configured.

Out of scope for this phase:

- Device batch delete.
- Network configuration changes.
- Factory reset flows.
- Any operation that deletes or mutates an unmanaged real production device.
- UI automation. API request/response evidence is the F12-like artifact for
  this phase.
- Broad framework refactors unrelated to Device Management.

## Source Of Truth

Primary sources:

- `C:\Users\thuyv\Downloads\iot-console-bms.postman_collection.json`
- Existing compact suites:
  `src/core/bms-api/home-controller-management-suite.ts`,
  `tests/api/bms/home-controller-management/home-controller-management.api.spec.ts`
- Existing real-HC evidence and log patterns:
  `tests/e2e/device-history/device-history.api.spec.ts`,
  `tests/e2e/schedule-management/schedule-management.support.ts`
- `docs/hc-ssh-logging.md`
- `docs/architecture.md`, `docs/guideline.md`, `docs/orchestrator.md`

The implementation must not invent request payloads or status codes beyond
these sources. If a manual-sheet case has no confirmed endpoint or safe fixture,
the case is documented as deferred or skipped with explicit evidence.

## Recommended Approach

Use the compact-suite pattern already used by Home Controller Management:

- Create one helper file:
  `src/core/bms-api/device-management-suite.ts`
- Create one executable spec:
  `tests/api/bms/device-management/device-management.api.spec.ts`
- Create one README:
  `tests/api/bms/device-management/README.md`

This keeps the repo easy to scan and avoids a nested helper tree until the
Device Management surface needs multiple independently reusable resources. The
helper owns environment parsing, API wrappers, evidence writing, cleanup, and
failure-log collection. The spec owns testcase order and business assertions.

## Testcase Groups

The first implementation maps the user-provided 54-row manual sheet into safe
automation groups.

Implemented now:

- TC1-TC4: device list, empty/no-result view, pagination, limit.
- TC5-TC7: search with result, search without result, clear search.
- TC8-TC20: filters for HC, protocol, network state, online status, one area,
  multiple areas, unassigned area, area-or-unassigned, device type, input,
  output, both input/output, and combined filters.
- TC21-TC24: detail and lookup positive/negative cases.
- TC25-TC30: add one device to a configured HC, missing required fields,
  invalid MAC, duplicate id, duplicate MAC.
- TC33-TC38: safe update cases for an automation-created device and negative
  update cases.
- TC39-TC43: delete one automation-created device and delete-block/negative
  behaviors that can be verified without touching unmanaged data.
- TC45-TC49: assign area, unassign area, update position, invalid position,
  and area summary.
- TC50-TC54: permission and auth guard cases, skipping with evidence if the
  required no-permission/viewer fixture is not configured.

Deferred by explicit user instruction:

- TC44: delete multiple devices successfully.
- Any network configuration test.
- Any factory reset test.

Conditionally deferred until source-of-truth exists:

- Bind-batch cases TC31-TC32 if the endpoint requires physical mesh side
  effects that cannot be safely cleaned up using current API references.

## Data Safety

All write cases must create and own their own data:

- Device MAC prefix: `EA:2C:<TC-derived bytes>:<timestamp/random>`.
- Device name: `auto_device_<TC>_<timestamp>_<random>`.
- Area name: `auto_device_area_<TC>_<timestamp>_<random>`.
- Notes: `auto_device_notes_<TC>_<timestamp>_<random>`.

Safety rules:

- A testcase may delete only a device id created by that testcase.
- A testcase may update only its own automation-created device, except read-only
  discovery used for filters.
- Area cleanup runs in `finally`.
- Device cleanup runs in `finally`.
- Cleanup accepts `200`, `204`, and `404` as explicit safe outcomes.
- Cleanup warnings are recorded in evidence.
- Batch delete, network config, and factory reset endpoints are not called.

## Environment

Use shared BMS env names where possible and add only device-specific names when
needed:

```env
BASE_URL=
API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=
DEVICE_MANAGEMENT_RUN_DIR=
DEVICE_MANAGEMENT_EVIDENCE_DIR=
DEVICE_MANAGEMENT_RUN_ID=
DEVICE_MANAGEMENT_COLLECT_SYSTEM_LOG_ON_FAIL=true
DEVICE_MANAGEMENT_SYSTEM_LOG_COMMAND=docker compose logs --no-color --tail 300 iot-console bms-api
DEVICE_MANAGEMENT_SYSTEM_LOG_MAX_CHARS=30000
TEST_HC_ID=
TEST_HC_MAC=
TEST_DEVICE_CELL_MODEL_ID=501
TEST_DEVICE_PID=1234
TEST_DEVICE_PROTOCOL=ble
TEST_DEVICE_CELL_IDX=1
TEST_DEVICE_TYPE_ID=
TEST_AREA_ID=
HC_SSH_HOST=
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=
HC_SSH_KEY_PASSPHRASE=
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
HC_SSH_READY_TIMEOUT_MS=15000
```

Missing optional fixtures skip only the affected testcase group and write the
reason to evidence. Missing admin credentials or a failed health check blocks
the suite and writes precheck evidence.

## API Client Design

`DeviceManagementSuiteApi` wraps Playwright `APIRequestContext` and exposes:

- health, login, logout.
- list devices.
- get device detail.
- lookup devices.
- create device under HC.
- put full update.
- patch partial update.
- delete single device.
- area create/delete.
- assign/unassign devices to area.
- list devices in area.
- update device position.
- area device summary.
- invalid-token and no-token requests.

Every method records redacted request/response evidence when `withEvidence()` is
used. Negative tests use raw status assertions instead of wrapped happy-path
helpers.

## Evidence

Evidence goes under:

```text
test-runs/device-management-current/evidence/
```

The current evidence directory is reset once per suite run id, so it represents
the latest run and does not accumulate stale files. Each testcase writes one
JSON evidence file and attaches it to Playwright.

Evidence includes:

- `tc_id`, `tc_name`, status, start/end timestamps.
- Base URL and endpoint metadata.
- Full redacted API request and response for every step.
- Assertions.
- Cleanup status and cleanup warnings.
- Error message when failed.
- System log on failure when configured.
- HC SSH log window on failure when `HC_SSH_*` is configured.

Secrets are redacted: password, token, authorization, API key, and similar
fields.

## Failure Log Design

For API failures, request/response evidence is the primary F12-like artifact.

On testcase failure:

1. Capture system log with `DEVICE_MANAGEMENT_SYSTEM_LOG_COMMAND` when enabled.
2. Capture HC log via SSH only when `HC_SSH_HOST` and password/key are present.
3. Filter HC log by testcase start/end window using Asia/Bangkok timestamps, as
   required by `docs/hc-ssh-logging.md`.
4. If SSH is unavailable, write `skipped` with a clear reason instead of hiding
   the original testcase failure.

## Verification

Implementation verification should run:

```powershell
npx.cmd playwright test tests/api/bms/device-management/device-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/device-management-current/test-results
```

Expected result:

- Suite starts with health precheck and real admin login.
- Each executed testcase writes evidence.
- Automation-created devices and areas are cleaned up.
- Deferred destructive groups are absent from the run.
- Failed cases include request/response evidence and, when configured, system
  and HC logs.

If the real environment, credentials, HC fixture, or SSH config is missing,
runtime verification must be reported as blocked with the exact missing value or
service.

## Risks

- The manual sheet includes UI wording while the first phase is API automation.
  API evidence is accepted as the F12-like artifact for this phase.
- Some filters require existing real data. Those cases should assert API
  contract and filter shape; strict matching is used only when the suite creates
  the matching fixture itself.
- Device create may require a valid `cell_model_id` and HC fixture. Missing
  values block only write cases, not read-only cases.
- Bind-batch may affect HC mesh/group state. It stays conditional until cleanup
  behavior is confirmed.
- Permission users may not exist in the target environment. Those cases skip
  with evidence instead of forcing shared data changes.

## Non-Goals

This design does not create a new framework layer, does not add UI automation,
does not modify product code, does not run destructive device actions, and does
not cover the deferred batch delete, network configuration, or factory reset
work reserved for a later explicit request.
