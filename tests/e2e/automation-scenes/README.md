# Automation Scenes E2E

Thu muc nay gom rieng testcase Scene theo 2 nhom: API management va UI evidence/runtime that tren HC.

## Structure

```text
tests/e2e/automation-scenes/
  api.spec.ts
  ui-evidence.spec.ts
  scenes.support.ts
  README.md
```

| File | Nhiem vu |
| --- | --- |
| `api.spec.ts` | Testcase API Scene TC1..TC53, bo nhom auth/permission. Moi testcase co comment `/* ... */` va evidence rieng. |
| `ui-evidence.spec.ts` | Testcase UI evidence TC1..TC6: tao scene `thuy<N>`, tao scene lich, rename `thuyvu<N>`, kich hoat, verify output, cleanup. |
| `scenes.support.ts` | Helper chung: config endpoint, discover device online theo HC, payload scene, activation, poll status, evidence, cleanup. |

## Real Environment

| Key | Default |
| --- | --- |
| HC MAC | `88:e6:28:f8:2e:4d` |
| HC ID | `4932308540097724437` |
| HC direct endpoint | `http://10.10.30.154:8080` |
| Automation service | `http://10.10.0.198:19000` |
| Device service | `http://10.10.0.198:3333` |
| Device control service | `http://10.10.0.198:8081` |
| Slot test | `1` |

## Device Discovery Rule

Moi suite goi that:

```text
GET {DEVICE_SERVICE_ENDPOINT}/api/v0/devices?limit=100
```

Sau do filter:

- device thuoc HC MAC `88:e6:28:f8:2e:4d`;
- `status=true` va `network_state=activated`;
- slot `1` la boolean trong `spec.input`, `spec.output`, `spec.state`;
- uu tien device type `4`, `rule_count=0`;
- verify lai detail device de tranh list stale/sai HC;
- random 2-3 device cho moi scene, co gang tach nhom neu du inventory.

## UI Evidence Flow

`ui-evidence.spec.ts` chay serial TC1..TC6:

- `TC1`: tao scene `thuy<N>` voi device online that, snapshot mixed `true/false`.
- `TC2`: tao scene `thuy<N+1>` voi cron 8:30 thu 2-7: `0 30 8 * * 2,3,4,5,6,7 *`.
- `TC3`: doi ten `thuy<N>` thanh `thuyvu<N>`.
- `TC4`: baseline device nguoc snapshot, kich hoat `thuyvu<N>`, poll HC va assert output dung snapshot.
- `TC5`: baseline device nguoc snapshot, kich hoat scene lich, poll HC va assert output dung snapshot.
- `TC6`: xoa cac scene UI evidence vua tao.

Ghi chu: activation dung hanh vi UI log thuc te, control tung output device trong binding:

```text
POST {DEVICE_CONTROL_ENDPOINT}/api/devices/control
header x-hc-id=<device hc_id>
body device_id=<binding device_id>, states=[{idx: 1, value: <snapshot value>}]
```

## Output

```text
test-runs/automation-scenes-current/
  run.log
  evidence/
    api/*.json
    ui/*.json
  html-report/index.html
  test-results/
```

## Run

```powershell
npx.cmd tsc --noEmit
```

```powershell
npx.cmd playwright test tests/e2e/automation-scenes --config=playwright.config.ts --list
```

```powershell
$runDir='test-runs\automation-scenes-current'
if (Test-Path $runDir) { Remove-Item -LiteralPath (Resolve-Path $runDir).Path -Recurse -Force }
New-Item -ItemType Directory -Force $runDir | Out-Null
$env:IOT_HC_ENDPOINT='http://10.10.30.154:8080'
$env:AUTOMATION_ALLOW_DEVICE_CONTROL='true'
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/automation-scenes-current/html-report'
npx.cmd playwright test tests/e2e/automation-scenes --config=playwright.config.ts --reporter=html,allure-playwright --workers=1 --output=test-runs/automation-scenes-current/test-results *>&1 | Tee-Object -FilePath test-runs\automation-scenes-current\run.log
```

Full testcase matrix dai van nam o `docs/automation/testcase_scenes.md`.
