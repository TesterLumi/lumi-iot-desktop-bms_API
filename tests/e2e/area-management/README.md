# Area Management UI Evidence

Spec nay tao mot workflow du lieu that de kiem tra thu cong tren UI, tach rieng
khoi API suite `TC1-TC84`.

## Env

Dung chung env voi area API suite:

```bash
BASE_URL=http://10.10.0.198:3332/api
API_KEY=<client-api-key>
ADMIN_USERNAME=root
ADMIN_PASSWORD=<password>
BMS_API_THROTTLE_MS=900

TEST_DEVICE_ID_1=<automation-device-id>
TEST_LIGHTING_GROUP_ID=<lighting-iot-group-id>
TEST_HC_ID_1=<automation-home-controller-id>

AREA_UI_EVIDENCE_PAUSE_MS=10000
```

Neu khong set fixture device/group/HC, spec van chay cac buoc area va log
`skipped_fixture` cho buoc thieu fixture.

## Run

```powershell
Remove-Item -Recurse -Force test-runs/area-ui-evidence-current -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force test-runs/area-ui-evidence-current | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/area-ui-evidence-current/html-report'
$env:AREA_UI_EVIDENCE_PAUSE_MS='10000'
pnpm exec playwright test tests/e2e/area-management/area-ui-evidence.spec.ts --workers=1 --reporter=list,html --output=test-runs/area-ui-evidence-current/test-results 2>&1 | Tee-Object -FilePath test-runs/area-ui-evidence-current/run.log
```

Trong luc pause, mo UI quan ly khu vuc va search theo `name`, `code`, `area_id`
duoc in trong timeline. Spec cleanup du lieu cuoi test.
