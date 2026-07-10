# Role Management API Automation

Suite nay chi chua API automation cho quan ly vai tro theo manual `TC1-TC45`.
Khong dung UI automation, khong mock API, token duoc lay that tu
`/api/v0/auth/login`.

## Cau truc

```text
tests/api/bms/role-management/
  role-management.api.spec.ts
  README.md

src/core/bms-api/
  role-management-suite.ts
```

## Env

Tao `.env` hoac set env truoc khi run:

```bash
BASE_URL=http://10.10.0.198:3332/api
API_KEY=<client-api-key>
ADMIN_USERNAME=root
ADMIN_PASSWORD=<password>
BMS_API_THROTTLE_MS=900
```

Suite compact tu tao user test qua API that `POST /api/v0/auth/register`,
login bang user do khi can test permission, va cleanup bang
`POST /api/v0/auth/delete`. Khong can cau hinh `NORMAL_USER_ID`,
`VIEWER_USERNAME`, `NO_PERMISSION_USERNAME`, `ROOT_USER_ID` hay
`SYSTEM_ADMIN_USER_ID` cho suite quan ly vai tro.

## Run sach

Lenh duoi day xoa run cu, tao dung mot folder report hien tai, va ghi evidence
vao cung mot noi:

```powershell
Remove-Item -Recurse -Force test-runs/role-management-current -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force test-runs/role-management-current | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/role-management-current/html-report'
$env:ROLE_EVIDENCE_DIR='test-runs/role-management-current/evidence'
pnpm exec playwright test tests/api/bms/role-management/role-management.api.spec.ts --workers=1 --reporter=list,html --output=test-runs/role-management-current/test-results 2>&1 | Tee-Object -FilePath test-runs/role-management-current/run.log
```

Run mot case:

```powershell
pnpm exec playwright test tests/api/bms/role-management/role-management.api.spec.ts -g "TC3" --workers=1 --reporter=list,html
```

Type check:

```powershell
pnpm exec tsc --noEmit
```

## Output

Sau khi run chi can xem:

```text
test-runs/role-management-current/run.log
test-runs/role-management-current/html-report/index.html
test-runs/role-management-current/evidence/*.json
```

Tat ca artifact tren da duoc ignore, khong commit vao repo.

## Cleanup data

Moi case tao role rieng voi prefix `auto_role_TC...` va user rieng voi prefix
`auto_user_TC...`. Cleanup se xoa user truoc, sau do xoa role. Neu xoa role that
bai do role da gan user, cleanup se thu patch `status=Disabled` va ghi warning
vao evidence.
