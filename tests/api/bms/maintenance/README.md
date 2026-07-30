# Maintenance API Test Suite

Source of truth:
- `C:\Users\thuyv\Downloads\07-maintenance-api.md`
- `C:\Users\thuyv\Downloads\bms-api.postman_collection.json`

Suite coverage:
- `TC1-TC3`: cau hinh bao tri va validation.
- `TC4-TC8`: danh sach, filter, pagination, summary.
- `TC9-TC14`: hoan tat bao tri va lich su.
- `TC15-TC18`: nguong bao tri theo thiet bi.
- `TC19-TC24`: bulk done va bulk thresholds.
- `TC25-TC30`: permission/auth/token.
- `TC31-TC35`: error handling va refresh.

Run latest evidence:

```powershell
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/maintenance-current/html-report'
$env:MAINTENANCE_EVIDENCE_DIR='test-runs/maintenance-current/evidence'
npx.cmd playwright test tests/api/bms/maintenance/maintenance.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/maintenance-current/test-results *>&1 | Tee-Object -FilePath test-runs\maintenance-current\run.log
```

Auth dung chung voi cac suite BMS cu:
- `MAINTENANCE_ADMIN_ACCESS_TOKEN`, `BMS_ACCESS_TOKEN`, `BMS_ROOT_ACCESS_TOKEN`
- hoac token suite cu `DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN`, `HOME_CONTROLLER_ADMIN_ACCESS_TOKEN`, `GROUP_ADMIN_ACCESS_TOKEN`
- hoac login bang `ADMIN_USERNAME`/`ADMIN_PASSWORD`

Safety:
- Config update cases backup/restore config.
- Threshold update cases try to restore original thresholds.
- Done/bulk-done success cases are guarded because they reset real device absolute values. Set `MAINTENANCE_ALLOW_DONE_WRITES=true` or `MAINTENANCE_TEST_DEVICE_ID=<device-id>` to execute those writes.

Evidence:
- JSON per testcase: `test-runs/maintenance-current/evidence`
- Playwright HTML: `test-runs/maintenance-current/html-report/index.html`
- Terminal log: `test-runs/maintenance-current/run.log`
