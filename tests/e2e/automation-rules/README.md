# Automation Rules E2E

Thu muc nay gom rieng testcase Rule theo 2 nhom: API/runtime management va UI evidence tren HC that.

## Structure

```text
tests/e2e/automation-rules/
  rule-api-testcases.spec.ts
  rule-ui-evidence.spec.ts
  rule.support.ts
  README.md
```

| File | Nhiem vu |
| --- | --- |
| `rule-api-testcases.spec.ts` | Testcase API/runtime Rule TC1..TC73. Moi testcase co title `TCx - ...` va evidence rieng. |
| `rule-ui-evidence.spec.ts` | Testcase UI evidence tao retained rule `thuy_rule_*` de check tren UI. |
| `rule.support.ts` | Helper chung: endpoint, discover device online theo HC, control device, poll output, evidence, cleanup. |

## Real Environment

| Key | Default |
| --- | --- |
| HC MAC | `88:e6:28:f8:2e:4d` |
| HC ID | `4932308540097724437` |
| HC direct endpoint | `http://10.10.30.154:8080` |
| Automation service | `http://10.10.0.198:19000` |
| Device service | `http://10.10.0.198:3333` |
| Device control service | `http://10.10.0.198:8081` |
| Rule logical input slot | `0` |
| Rule logical output slot | `0` |
| Device endpoint slot | `1` |

## Device Discovery Rule

Moi suite goi that:

```text
GET {DEVICE_SERVICE_ENDPOINT}/api/v0/devices?limit=100
```

Sau do filter:

- device thuoc HC MAC `88:e6:28:f8:2e:4d`;
- `network_state=activated`;
- slot `1` la boolean trong `spec.input`, `spec.output`, `spec.state`;
- uu tien device khong co active rule mapping;
- rule da disabled khong chan device discovery;
- verify output bang HC direct endpoint.

## Output

```text
test-runs/automation-rules-current/
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
npx.cmd playwright test tests/e2e/automation-rules --config=playwright.config.ts --list
```

```powershell
$runDir='test-runs\automation-rules-current'
if (Test-Path $runDir) { Remove-Item -LiteralPath (Resolve-Path $runDir).Path -Recurse -Force }
New-Item -ItemType Directory -Force $runDir | Out-Null
$env:IOT_HC_ENDPOINT='http://10.10.30.154:8080'
$env:AUTOMATION_RULE_WRITE_ENABLED='true'
$env:AUTOMATION_ALLOW_DEVICE_CONTROL='true'
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/automation-rules-current/html-report'
npx.cmd playwright test tests/e2e/automation-rules --config=playwright.config.ts --reporter=html,allure-playwright --workers=1 --output=test-runs/automation-rules-current/test-results *>&1 | Tee-Object -FilePath test-runs\automation-rules-current\run.log
```

## Notes

- `rule-api-testcases.spec.ts` chi con TC1..TC73.
- Runtime tests dieu khien thiet bi that bang `endpoint_slot=1`.
- Rule payload van giu logical slot theo API, input nhieu dieu kien tang dan `0,1,2...`.
- Evidence JSON redact `app_key`, `dev_key`, va `nwk_key`.
