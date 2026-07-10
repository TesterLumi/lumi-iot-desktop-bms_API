# Area Management API Automation

Suite nay chua API automation cho quan ly khu vuc theo `TC1-TC84`.
Khong dung UI automation, khong mock API, token duoc lay that tu
`/api/v0/auth/login`.

## Cau truc

```text
tests/api/bms/area-management/
  area-management.api.spec.ts
  README.md

src/core/bms-api/
  area-management-suite.ts
```

## Env

Tao `.env` hoac set env truoc khi run:

```bash
BASE_URL=http://10.10.0.198:3332/api
API_KEY=<client-api-key>
ADMIN_USERNAME=root
ADMIN_PASSWORD=<password>
BMS_API_THROTTLE_MS=900

TEST_DEVICE_ID_1=<automation-device-uuid-1>
TEST_DEVICE_ID_2=<automation-device-uuid-2>
TEST_LIGHTING_GROUP_ID=<lighting-iot-group-id>
TEST_NON_LIGHTING_GROUP_ID=<non-lighting-iot-group-id>
TEST_HC_ID_1=<automation-home-controller-id-1>
TEST_HC_ID_2=<automation-home-controller-id-2>
```

`BASE_URL` trong repo nay nen bao gom `/api`, vi suite goi endpoint theo
pattern hien co nhu `/api/v0/areas`.

Suite tu tao area test bang prefix `auto_area_TC...`. Cac case permission tu tao
user/role/policy automation qua API that va cleanup bang API that.

## Run sach

Lenh duoi day xoa run cu, tao dung mot folder report hien tai, va ghi evidence
vao cung mot noi:

```powershell
Remove-Item -Recurse -Force test-runs/area-management-current -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force test-runs/area-management-current | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/area-management-current/html-report'
$env:AREA_EVIDENCE_DIR='test-runs/area-management-current/evidence'
pnpm exec playwright test tests/api/bms/area-management/area-management.api.spec.ts --workers=1 --reporter=list,html --output=test-runs/area-management-current/test-results 2>&1 | Tee-Object -FilePath test-runs/area-management-current/run.log
```

Run mot case:

```powershell
pnpm exec playwright test tests/api/bms/area-management/area-management.api.spec.ts -g "TC9" --workers=1 --reporter=list,html
```

Type check:

```powershell
pnpm exec tsc --noEmit
```

## Output

Sau khi run chi can xem:

```text
test-runs/area-management-current/run.log
test-runs/area-management-current/html-report/index.html
test-runs/area-management-current/evidence/*.json
```

Tat ca artifact tren da duoc ignore, khong commit vao repo.

## Cleanup data

Moi case tao area rieng voi prefix `auto_area_TC...`. Case nao tao parent/child
thi xoa parent de backend cascade con. Device, IoT group va Home Controller la
fixture automation co san, chi gan/go lien ket khu vuc; suite khong xoa cac
fixture nay.

Neu cleanup delete fail, suite ghi warning vao evidence JSON cua testcase tuong
ung.
