# Device History API E2E

Suite nay kiem tra lich su thiet bi tren moi truong that/staging, dung endpoint log thuc te:

```text
GET http://10.10.0.198:4420/api/device_logs
```

## Environment

```env
DEVICE_HISTORY_BASE_URL=http://10.10.0.198:4420
DEVICE_HISTORY_API=/api/device_logs
DEVICE_HISTORY_DEVICE_ID_PARAM=device_id
DEVICE_HISTORY_LIMIT=10
DEVICE_HISTORY_ALLOW_DEVICE_CONTROL=true

DEVICE_SERVICE_ENDPOINT=http://10.10.0.198:3333
GATEWAY_BASE_URL=http://10.10.0.198:8081
DEVICE_STATUS_BASE_URL=http://10.10.30.154:8080

AUTOMATION_HC_ID=4932308540097724437
AUTOMATION_HC_MAC=88:e6:28:f8:2e:4d
SLOT_ON_OFF=1
POLL_INTERVAL_MS=500
POLL_TIMEOUT_MS=10000

HC_SSH_HOST=10.10.30.154
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=C:\Users\thuyv\Downloads\key ssh\hcg1_Lumi
HC_SSH_KEY_PASSPHRASE=<local-passphrase>
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
```

Runtime testcase se skip neu chua set `DEVICE_HISTORY_ALLOW_DEVICE_CONTROL=true`.

## Run

List testcase:

```powershell
npx.cmd playwright test tests/e2e/device-history/device-history.api.spec.ts --config=playwright.config.ts --list
```

Run full suite:

```powershell
$env:DEVICE_HISTORY_ALLOW_DEVICE_CONTROL='true'
$env:DEVICE_HISTORY_RUN_ID=(Get-Date).ToString('yyyyMMddHHmmss')
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/device-history-current/html-report'
npx.cmd playwright test tests/e2e/device-history/device-history.api.spec.ts --config=playwright.config.ts --reporter=html,line --workers=1 --output=test-runs/device-history-current/test-results *>&1 | Tee-Object -FilePath test-runs\device-history-current\run.log
```

Run mot testcase:

```powershell
npx.cmd playwright test tests/e2e/device-history/device-history.api.spec.ts -g "TC2 -" --config=playwright.config.ts --workers=1
```

## Evidence

Moi testcase ghi evidence JSON rieng tai:

```text
test-runs/device-history-current/evidence/api/
```

Thu muc evidence duoc reset mot lan dau moi `DEVICE_HISTORY_RUN_ID`, nen ket qua trong do la ket qua moi nhat cua lan run hien tai. Khi testcase fail, suite lay HC log qua SSH va ghi vao `hc_logs` neu da cau hinh `HC_SSH_*`.
