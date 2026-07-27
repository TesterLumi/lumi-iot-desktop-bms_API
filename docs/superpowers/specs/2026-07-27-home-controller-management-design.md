# Home Controller Management API Automation Design

Date: 2026-07-27

## Goal

Build a clean, compact Playwright API automation suite for Home Controller
Management against the real BMS/staging system. The suite must follow the
existing `bms-e2e-test` repo style, produce fresh per-test evidence on every
run, and collect useful failure logs without adding UI automation.

## Scope

In scope for this phase:

- Health check before suite execution.
- Real admin login and authenticated API calls.
- List, search, filter, pagination, and detail Home Controller APIs.
- Connection events read APIs.
- Create Home Controller with unique automation MAC.
- Update only safe fields such as notes/name on automation-created HC.
- Delete single Home Controller only when the HC was created by the testcase or
  is an explicitly configured automation fixture.
- IoT read APIs that do not mutate network/reset state, such as IoT list/get,
  sync-time, get-link-upload, and version-info when safe.
- BLE gateway cases only when they use automation-created data and cleanup.
- Auth, permission, invalid token, and validation cases.
- API request/response evidence for every testcase.
- System log and HC SSH log collection on failure when configured.

Out of scope for this phase:

- Delete batch Home Controller.
- Network configuration update.
- Reset factory request.
- Reset factory completed callback.
- UI automation and browser console/network capture.
- Any action against production HC that is not clearly an automation fixture.

## Recommended Approach

Use the compact-suite pattern already present in `account-management` and
`role-management`, with HC-specific safety rules:

- Add one helper file:
  `src/core/bms-api/home-controller-management-suite.ts`
- Add one spec file:
  `tests/api/bms/home-controller-management/home-controller-management.api.spec.ts`
- Add one README:
  `tests/api/bms/home-controller-management/README.md`

This keeps the repo easy to scan and avoids creating a nested helper tree for a
single suite. Existing `src/core/console/home_controller/*` CRUD helpers remain
untouched unless a tiny export/type reuse is needed.

## Testcase Shape

The spec will expose explicit testcase names in order:

```ts
test('TC1 - Health check he thong thanh cong', async () => {})
test('TC2 - Lay danh sach HC thanh cong', async () => {})
```

Each testcase will carry a comment block with:

- TC ID.
- Testcase name.
- Goal.
- Precondition.
- Expected result.
- Evidence summary.

The suite will be serial by default to reduce load on the real environment and
to make evidence ordering easy to read. Test data isolation still belongs to
each testcase: a case that creates HC must clean up its own HC in `finally`.

## Proposed Test Groups

The first implementation will cover these groups:

- TC1-TC11: health, list, search/filter, pagination.
- TC12-TC19: detail and connection events.
- TC20-TC27: create HC positive and validation cases.
- TC28-TC33: update safe fields and update validation cases.
- TC34-TC38: delete single automation-created HC and verify absence.
- TC39-TC48: IoT read/safe mutation APIs, excluding network config and reset.
- TC49-TC57: BLE gateway safe create/update/delete with cleanup.
- TC58-TC64: auth, invalid token, no-permission, and validation guard cases.

Numbering is intentionally compact for this phase. Cases from the original
TC1-TC90 that belong to delete-batch, network config, reset factory, or reset
callback are not implemented yet and will be documented in the README as
deferred.

## Data Safety

Automation-created HC data will use deterministic prefixes:

- MAC: `AA:BB:<TC-derived bytes>:<timestamp/random>`.
- Name: `auto_hc_<TC>_<timestamp>_<random>`.
- Notes: `auto_notes_<TC>_<timestamp>_<random>`.

Safety rules:

- A testcase may delete only a HC id it created in that testcase, except for a
  future explicitly gated fixture.
- Cleanup runs in `finally`.
- Cleanup accepts `200` and `404` as safe outcomes.
- Cleanup warnings are written to evidence.
- No delete-batch, reset factory, or network-config endpoint is called.

## Environment

Use shared BMS env names where possible:

```env
BASE_URL=
API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=
HOME_CONTROLLER_EVIDENCE_DIR=
HOME_CONTROLLER_RUN_DIR=
TEST_HC_ID=
TEST_HC_MAC=
TEST_HC_TYPE=mt7688
TEST_HC_VERSION=1.0.0
TEST_AREA_ID=
IOT_HC_LOG_UPLOAD_API_KEY=
IOT_LOG_OBJECT_KEY=automation/{{TEST_HC_MAC}}/logs/test.tar.gz
HC_SSH_HOST=
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=
HC_SSH_KEY_PASSPHRASE=
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
```

Missing optional fixtures will skip only the testcase group that needs them and
will write a clear evidence reason. Missing admin credentials or failed health
check blocks the suite and writes precheck evidence.

## Evidence

Evidence goes under:

```text
test-runs/home-controller-management-current/evidence/
```

The current run directory is reset once per run id, so the folder represents
the latest run and does not accumulate old evidence. Each testcase writes one
JSON file and attaches it to Playwright.

Evidence includes:

- `tc_id`, `tc_name`, status, start/end timestamps.
- Base URL and endpoint metadata.
- Full redacted API request and response for every step.
- Assertions.
- Cleanup status and cleanup warnings.
- Error message when failed.
- System log on failure when configured.
- HC SSH log window on failure when `HC_SSH_*` is configured.

Secrets are redacted in evidence: password, token, authorization, API key, and
similar fields.

## Failure Log Design

For API failures, request/response evidence is the primary "F12-like" artifact.
No browser/UI capture is added.

On testcase failure:

1. Capture system log using `HOME_CONTROLLER_SYSTEM_LOG_COMMAND` when provided,
   otherwise a conservative default such as iot-console/bms-api docker logs.
2. Capture HC log via SSH only when `HC_SSH_HOST` and password/key are present.
3. Filter HC log by testcase start/end window using Asia/Bangkok timestamp
   formatting, matching the existing device-history pattern.
4. If SSH is unavailable, write `skipped` with reason instead of failing
   evidence generation.

## API Client Design

`HomeControllerSuiteApi` will wrap Playwright `APIRequestContext` and expose
methods for:

- health/login/logout.
- list/get/create/update/delete Home Controller.
- connection events.
- IoT HC list/get/sync-time/get-link-upload/version-info.
- BLE gateway list/get/create/update/delete.
- invalid-token and no-token requests.

Every method records request/response to evidence when `withEvidence()` is
used. Negative tests call raw methods and assert the returned status.

## Verification

Implementation verification should run:

```powershell
npx.cmd playwright test tests/api/bms/home-controller-management/home-controller-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/home-controller-management-current/test-results
```

Expected result:

- Suite starts with health precheck and real admin login.
- Each executed testcase writes evidence.
- Created HC records are cleaned up.
- Deferred destructive groups are absent from the run.

If the real environment or credentials are missing, implementation may still
pass type/lint checks, but runtime verification must be reported as blocked
with the exact missing env/service.

## Risks

- API response contracts may differ from the prompt. The implementation should
  use flexible extraction helpers where existing suites already do this, while
  keeping assertions business-meaningful.
- Permission users may not exist in the target environment. Those cases should
  skip with evidence when no fixture credentials are configured.
- BLE gateway endpoints may mutate shared state. BLE write cases must use only
  automation-created HC/data and must cleanup; otherwise they should skip with
  a clear reason.

## Non-Goals

This design does not create a separate mini-repo, does not introduce UI tests,
does not add broad framework refactors, and does not touch destructive HC flows
that the user reserved for a later explicit request.
