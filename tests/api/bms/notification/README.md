# Notification API Test Suite

Source of truth:
- `C:\Users\thuyv\Downloads\06-notification-api.md`
- `C:\Users\thuyv\Downloads\bms-api.postman_collection.json`

Suite coverage:
- `TC1-TC15`: danh sach, phan trang, loc, unread badge.
- `TC16-TC24`: danh dau da doc, read-all, cancel confirm API evidence.
- `TC25-TC34`: notification preferences va validation payload.
- `TC35-TC36`: refresh list sau khi state thay doi.
- `TC37-TC38`: JWT ownership/permission behavior.

Run latest evidence:

```powershell
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/notification-current/html-report'
$env:NOTIFICATION_EVIDENCE_DIR='test-runs/notification-current/evidence'
npx.cmd playwright test tests/api/bms/notification/notification.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/notification-current/test-results *>&1 | Tee-Object -FilePath test-runs\notification-current\run.log
```

Evidence:
- JSON per testcase: `test-runs/notification-current/evidence`
- Playwright HTML: `test-runs/notification-current/html-report/index.html`
- Terminal log: `test-runs/notification-current/run.log`

Notes:
- The suite connects to the real BMS API using `BASE_URL` or `BMS_API_ENDPOINT`.
- Auth dung chung voi cac suite BMS cu:
  `BMS_ACCESS_TOKEN`/`BMS_ROOT_ACCESS_TOKEN`, hoac token suite cu
  `DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN`, `HOME_CONTROLLER_ADMIN_ACCESS_TOKEN`,
  `GROUP_ADMIN_ACCESS_TOKEN`, hoac `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- Preference update cases restore the original preference values in cleanup.
- The suite clears only `test-runs/notification-current/evidence` before running.
