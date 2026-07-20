# Area Control API E2E

Thu muc nay gom API automation cho chuc nang dieu khien theo khu vuc, TC1 den TC19 theo bang manual moi nhat, chay tren he thong that/staging va khong mock API.

## Structure

```text
tests/e2e/area-control/
  area-control.api.spec.ts
  README.md
```

`area-control.api.spec.ts` la file code chinh duy nhat: gom TC1..TC19, API client, setup/cleanup area va helper ghi evidence de de doc nhu cac bo schedule/scenes.

## Real Environment

Chi chay tren HC/test account duoc phep dieu khien thiet bi that.
Suite tu tao 2 khu vuc root bang `POST /api/v0/areas`, verify lai bang
`GET /api/v0/areas`, discover tat ca device online/activated cua HC that tu
`DEVICE_SERVICE_ENDPOINT /api/v0/devices`, chi giu device co live status slot
on/off boolean, gan vao khu vuc test, roi cleanup khi ket thuc run.

```env
BASE_URL=http://10.10.0.198:3332/api
GATEWAY_BASE_URL=http://10.10.0.198:8081
DEVICE_SERVICE_ENDPOINT=http://10.10.0.198:3333
DEVICE_STATUS_BASE_URL=http://10.10.30.154:8080

ADMIN_USERNAME=
ADMIN_PASSWORD=
BMS_ACCESS_TOKEN=

TEST_OFFLINE_DEVICE_ID=
TEST_OFFLINE_HC_ID=

SLOT_ON_OFF=1
POLL_INTERVAL_MS=500
POLL_TIMEOUT_MS=10000
AREA_CONTROL_ALLOW_DEVICE_CONTROL=true

HC_SSH_HOST=
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=
HC_SSH_KEY_PASSPHRASE=
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
```

Neu chua co fixture offline/offline HC, cac case tuong ung se skip voi ly do fixture missing. Cac case control that chay serial, luu state ban dau va reset trong `finally`.
Khi testcase fail, suite se tu lay `tail` log HC qua SSH va ghi vao field `hc_logs` trong evidence JSON. Neu chua cau hinh SSH, evidence van ghi ro ly do skip lay log.

## Run

Typecheck:

```powershell
npx.cmd tsc --noEmit
```

List testcase:

```powershell
npx.cmd playwright test tests/e2e/area-control/area-control.api.spec.ts --config=playwright.config.ts --list
```

Run full suite:

```powershell
$env:AREA_CONTROL_ALLOW_DEVICE_CONTROL='true'
$env:AREA_CONTROL_RUN_ID=(Get-Date).ToString('yyyyMMddHHmmss')
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/area-control-current/html-report'
npx.cmd playwright test tests/e2e/area-control/area-control.api.spec.ts --config=playwright.config.ts --reporter=html,line --workers=1 --output=test-runs/area-control-current/test-results *>&1 | Tee-Object -FilePath test-runs\area-control-current\run.log
```

Run mot testcase:

```powershell
npx.cmd playwright test tests/e2e/area-control/area-control.api.spec.ts -g "TC3 -" --config=playwright.config.ts --workers=1
```

Run rieng nhom area/control theo bang manual:

```powershell
npx.cmd playwright test tests/e2e/area-control/area-control.api.spec.ts -g "TC(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19) -" --config=playwright.config.ts --workers=1
```

## Evidence

Moi testcase ghi evidence JSON rieng tai:

```text
test-runs/area-control-current/evidence/api/
```

Thu muc evidence nay duoc xoa va tao lai o dau moi run theo `AREA_CONTROL_RUN_ID`, nen ket qua trong do luon la ket qua moi nhat cua lan run hien tai. Khi Playwright restart worker sau case fail, run id giu nguyen nen evidence da ghi truoc do khong bi xoa.

Evidence gom request/response, status polling, assertion, `hc_logs` cho case fail va ket qua cleanup/reset thiet bi. Setup/cleanup area cua suite duoc ghi trong Playwright log; tung testcase van co evidence rieng cho request runtime cua case do.
