# Home Controller Management API Suite

API-only Playwright suite for real Home Controller Management validation.

## Scope

Included:

- health, list, search, detail, and connection events;
- create, update safe fields, and delete single automation-created HC;
- IoT read/safe endpoints;
- BLE gateway safe automation data;
- auth, permission, and validation;
- per-test evidence and failure logs.

Deferred:

- delete batch;
- network config;
- reset factory;
- reset factory completed callback;
- UI automation.

## Environment

```env
BASE_URL=
API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=
TEST_HC_TYPE=mt7688
TEST_HC_VERSION=1.0.0
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

## Run

```powershell
$runDir='test-runs\home-controller-management-current'
Remove-Item -Recurse -Force $runDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $runDir | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/home-controller-management-current/html-report'
$env:HOME_CONTROLLER_RUN_DIR='test-runs/home-controller-management-current'
$env:HOME_CONTROLLER_EVIDENCE_DIR='test-runs/home-controller-management-current/evidence'
npx.cmd playwright test tests/api/bms/home-controller-management/home-controller-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/home-controller-management-current/test-results *>&1 | Tee-Object -FilePath test-runs\home-controller-management-current\run.log
```

Run one testcase:

```powershell
npx.cmd playwright test tests/api/bms/home-controller-management/home-controller-management.api.spec.ts -g "TC14" --config=playwright.config.ts --workers=1
```

## Evidence

Latest run artifacts:

```text
test-runs/home-controller-management-current/run.log
test-runs/home-controller-management-current/html-report/index.html
test-runs/home-controller-management-current/evidence/*.json
```

Each evidence file contains redacted request/response, assertions, cleanup
warnings, and failure logs. If `HC_SSH_*` is missing, HC log collection is
recorded as skipped in evidence.
