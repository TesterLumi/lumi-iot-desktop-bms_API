# Advanced Config Real HC

Suite nay cover cau hinh nang cao trong `advanced_config.md` tren he thong that,
Home Controller that, va device that.

## Scope

- Total: 64 Playwright testcases, `TC-AC-001` through `TC-AC-064`.
- MSB scene switch: `autolock_schedule`, `event[press_1_time]`,
  `event[press_2_times]`, `event[hold_2_seconds]`, event update/delete, and
  payload limit negative case.
- MSB relay switch: `group_all`, `state_default`, `touch_mode`,
  `event[on]`, `event[off]`, event delete, `clear_time`, `clear_power`, and
  invalid config negative cases.
- Presence sensor: `presence_mode`, `pir_time`, `distance`,
  `environment_volatile`, `lux_threshold`, `link_state`, `schedule`,
  `sensitivity`, `radar_bluetooth_state`, `time`, `event[active]`,
  `event[inactive]`, `auto_calib`, invalid config negative cases, and all
  documented environment presets.
- Evidence JSON moi cho tung testcase.
- HC SSH log theo cua so thoi gian testcase neu fail.

## Environment

```env
ADVANCED_CONFIG_BASE_URL=http://10.10.0.198:8081
ADVANCED_CONFIG_HC_ID=4932308540097724437
ADVANCED_CONFIG_MSB_DEVICE_ID=<real-msb-relay-cell-id>
ADVANCED_CONFIG_MSB_SCENE_DEVICE_ID=<real-msb-scene-cell-id>
ADVANCED_CONFIG_PRESENCE_DEVICE_ID=<real-presence-device-id>
ADVANCED_CONFIG_TARGET_DEVICE_ID=<real-target-switch-or-light-id>
ADVANCED_CONFIG_GROUP_ID=<real-group-id>
ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL=true
ADVANCED_CONFIG_ACK_TIMEOUT_MS=30000
ADVANCED_CONFIG_POLL_INTERVAL_MS=500
ADVANCED_CONFIG_RUN_DIR=test-runs/advanced-config-real-hc-current

HC_SSH_HOST=10.10.30.154
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=C:\Users\thuyv\Downloads\key ssh\hcg1_Lumi
HC_SSH_KEY_PASSPHRASE=<local-passphrase>
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
```

Write cases skip unless `ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL=true`.

## Run

List testcase:

```powershell
npx.cmd playwright test tests/e2e/advanced-config-real-hc/advanced-config-real-hc.spec.ts --config=playwright.config.ts --list
```

Run full suite:

```powershell
$env:ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL='true'
$env:ADVANCED_CONFIG_RUN_ID=(Get-Date).ToString('yyyyMMddHHmmss')
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/advanced-config-real-hc-current/html-report'
npx.cmd playwright test tests/e2e/advanced-config-real-hc/advanced-config-real-hc.spec.ts --config=playwright.config.ts --reporter=html,line --workers=1 --output=test-runs/advanced-config-real-hc-current/test-results *>&1 | Tee-Object -FilePath test-runs\advanced-config-real-hc-current\run.log
```

## Evidence

Moi testcase ghi evidence tai:

```text
test-runs/advanced-config-real-hc-current/evidence/api/
```

Evidence gom request/response, config truoc/sau, polling attempts, assertions,
cleanup/restore, va `hc_logs` khi testcase fail.
