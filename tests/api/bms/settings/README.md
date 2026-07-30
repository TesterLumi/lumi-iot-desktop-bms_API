# Settings API Automation

Suite nay automation API cho man hinh Cai dat theo manual `TC1-TC22`.
Khong dung mock, ket noi that den BMS API va ghi evidence JSON tung testcase.

## API Cover

- `POST /v0/auth/me`
- `POST /v0/auth/update`
- `POST /v0/auth/reset_password`
- `POST /v0/auth/logout`
- `POST /v0/files/upload`
- `GET /v0/files/presigned-url`

## Env

Suite dung chung credential BMS:

```powershell
$env:BASE_URL='http://10.10.0.198:3332/api'
$env:API_KEY='<client-api-key>'
$env:ADMIN_USERNAME='root'
$env:ADMIN_PASSWORD='<password>'
$env:BMS_API_THROTTLE_MS='900'
```

Co the thay login bang token co san:

```powershell
$env:SETTINGS_ADMIN_ACCESS_TOKEN='<access-token>'
$env:BMS_ACCESS_TOKEN='<access-token>'
$env:BMS_ROOT_ACCESS_TOKEN='<root-token>'
```

Mac dinh suite khong upload file hop le de tranh sinh object that trong
storage vi Postman collection khong co endpoint delete file. Bat guard nay neu
moi truong test cho phep rac storage hoac co job cleanup rieng:

```powershell
$env:SETTINGS_ALLOW_FILE_UPLOADS='true'
```

## Run Sach

```powershell
New-Item -ItemType Directory -Force -Path 'test-runs\settings-current' | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/settings-current/html-report'
$env:SETTINGS_EVIDENCE_DIR='test-runs/settings-current/evidence'
npx.cmd playwright test tests/api/bms/settings/settings.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/settings-current/test-results *>&1 | Tee-Object -FilePath test-runs\settings-current\run.log
exit $LASTEXITCODE
```

Evidence moi nam tai:

```text
test-runs/settings-current/evidence/*.json
test-runs/settings-current/html-report/index.html
test-runs/settings-current/run.log
```

Suite tu clear `SETTINGS_EVIDENCE_DIR` trong `beforeAll`; `test-runs/settings-current`
duoc ignore trong git.
