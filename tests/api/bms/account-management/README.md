# Account Management API Automation

Suite nay chi automation API cho quan ly tai khoan theo manual `TC1-TC75`.
Khong dung UI automation, khong mock API, token duoc login that tu
`/v0/auth/login` hoac `/api/v0/auth/login` tuy theo `BASE_URL`.

## Cau truc

```text
tests/api/bms/account-management/
  account-management.api.spec.ts
  README.md

src/core/bms-api/
  account-management-suite.ts
```

## Env

Tao `.env` hoac set env truoc khi run:

```bash
BASE_URL=http://10.10.0.198:3332/api
API_KEY=<client-api-key>
ADMIN_USERNAME=root
ADMIN_PASSWORD=<password>
BMS_API_THROTTLE_MS=900

TEST_USER_PASSWORD=<test-user-password>
TEST_USER_NEW_PASSWORD=<test-user-new-password>

# Optional. Neu khong co, suite se tao automation user khong gan quyen de test 403.
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=

# Optional guard fixture. Khong dung cho delete neu chua bat co an toan ben duoi.
SYSTEM_ADMIN_USER_ID=

# Optional system log collection on failure. Khong lien quan HC log.
ACCOUNT_COLLECT_SYSTEM_LOG_ON_FAIL=true
ACCOUNT_SYSTEM_LOG_COMMAND=docker compose logs --no-color --tail 300 bms-api
ACCOUNT_SYSTEM_LOG_MAX_CHARS=20000
```

Suite account dung cung thong tin ket noi voi `role-management` va
`area-management`: `BASE_URL`/`BMS_API_ENDPOINT`, `API_KEY`/`BMS_API_KEY`,
`ADMIN_USERNAME`/`BMS_ADMIN_USERNAME`, `ADMIN_PASSWORD`/`BMS_ADMIN_PASSWORD`,
`BMS_CLIENT_VERSION`, `BMS_CLIENT_OS`, `BMS_CLIENT_ID`, `BMS_ACCEPT_LANGUAGE`.
Khong can hoi lai credential khi them cac suite BMS khac.

`BASE_URL` nen cau hinh giong role/area, vi du `http://10.10.0.198:3332/api`.
Helper van tu xu ly neu endpoint duoc khai bao khong co `/api`.

## Run sach

Lenh duoi day xoa ket qua cu, tao report/evidence moi, va ghi terminal log vao
`run.log`:

```powershell
Remove-Item -Recurse -Force test-runs/account-management-current -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force test-runs/account-management-current | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/account-management-current/html-report'
$env:ACCOUNT_EVIDENCE_DIR='test-runs/account-management-current/evidence'
pnpm exec playwright test tests/api/bms/account-management/account-management.api.spec.ts --workers=1 --reporter=list,html --output=test-runs/account-management-current/test-results 2>&1 | Tee-Object -FilePath test-runs/account-management-current/run.log
```

Run mot case:

```powershell
pnpm exec playwright test tests/api/bms/account-management/account-management.api.spec.ts -g "TC14" --workers=1 --reporter=list,html
```

Kiem tra danh sach testcase:

```powershell
pnpm exec playwright test tests/api/bms/account-management/account-management.api.spec.ts --list
```

## Evidence

Moi testcase ghi mot file JSON rieng:

```text
test-runs/account-management-current/evidence/TC14_Admin_tao_tai_khoan_hop_le_<timestamp>.json
```

Evidence gom request/response da mask secret, assertions, cleanup, va
`system_logs` neu testcase fail.

Suite tu xoa `ACCOUNT_EVIDENCE_DIR` trong `beforeAll`, nen evidence cu khong bi
giu lai khi run suite nay. Command `Run sach` o tren xoa ca HTML report,
test-results va `run.log` cu.

## System Log Khi Fail

Mac dinh khi testcase fail, evidence se chay:

```powershell
docker compose logs --no-color --tail 300 bms-api
```

Neu chay tren staging/Kubernetes/server khac, override bang command doc log he
thong cua BMS API:

```powershell
$env:ACCOUNT_SYSTEM_LOG_COMMAND='kubectl logs deploy/bms-api -n staging --tail=300'
```

Day la system log cua API/backend, khong phai HC log. Neu command log fail,
evidence van ghi `reason`, `stdout`, `stderr` neu co.

## Quy Tac An Toan Du Lieu

- Moi user test co prefix `auto_user_TC...`.
- Case nao tao user thi cleanup user do bang `POST /v0/auth/delete`.
- Khong reset/update/delete user that, root, system admin.
- TC62/TC63 mac dinh khong goi delete tren admin/system admin. Chi bat khi co
  `ACCOUNT_ALLOW_DANGEROUS_GUARD_TESTS=true` va da chac chan moi truong test co
  guard an toan.
- Neu `VIEWER_USERNAME`/`NO_PERMISSION_USERNAME` khong co, suite tu tao user
  automation khong gan quyen de test cac case 403.
