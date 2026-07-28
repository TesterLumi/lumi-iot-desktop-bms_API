# Device Management API Suite

Suite nay cover phan quan ly thiet bi theo huong safe-first: chi thao tac tren device/area automation tao ra trong luc test va cleanup ngay sau tung case.

## Pham vi

- List/search/filter/pagination device.
- Detail/lookup device.
- Create/update/delete single automation-created device.
- Assign/unassign/move device voi automation-created area.
- Permission va auth negative cases.
- Evidence moi nhat cho tung lan chay, gom request/response da redact token.
- Khi fail: ghi system log tu command cau hinh, va HC SSH log neu co bien `HC_SSH_*`.

## Tam hoan theo yeu cau

- Bulk delete.
- Network configuration thao tac len HC/device that.
- Factory reset.
- Bind-batch success/mixed-result dang skip cho den khi co fixture cleanup mesh duoc duyet.

## Bien moi truong chinh

- `BASE_URL` hoac `DEVICE_MANAGEMENT_BASE_URL`: endpoint BMS/IOT console that.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` hoac `DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN`: tai khoan admin.
- `TEST_HC_ID`: HC that dung de tao automation device.
- `TEST_AREA_ID`: area co san neu muon filter theo area co san.
- `VIEWER_USERNAME`/`VIEWER_PASSWORD`, `NO_PERMISSION_USERNAME`/`NO_PERMISSION_PASSWORD`: user permission negative.
- `HC_SSH_HOST`, `HC_SSH_USER`, `HC_SSH_PASSWORD` hoac `HC_SSH_KEY_PATH`: lay log HC khi fail.

## Chay suite

```powershell
npx.cmd playwright test tests/api/bms/device-management/device-management.api.spec.ts --config=playwright.config.ts --workers=1
```

Evidence mac dinh:

```text
test-runs/device-management-current/evidence
```

Moi lan suite bat dau, thu muc evidence cua suite se duoc clear de ket qua moi nhat khong bi tron voi lan chay cu.
