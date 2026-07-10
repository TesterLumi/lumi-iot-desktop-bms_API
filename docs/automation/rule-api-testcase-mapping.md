# Automation Rule API Testcase Mapping

This document is the compact generated artifact for Rule / Automation Center API
coverage. It combines the run README, testcase mapping, sample report, and open
contract notes to avoid scattering many generated files.

## Run README

Source of truth:
- Prompt: `C:\Users\thuyv\Downloads\prompt_auto_test_rule_api.md`
- Postman collection: `C:\Users\thuyv\Downloads\automation-center.postman_collection.json`
- Numbered executable testcase spec: `tests/e2e/automation-rules/rule-api-testcases.spec.ts`
- UI evidence spec: `tests/e2e/automation-rules/rule-ui-evidence.spec.ts`
- Shared client/helper: `src/core/automation-cloud/automation_center/*`

Environment:

```env
AUTOMATION_SERVICE_ENDPOINT=http://<cloud_host>:<cloud_port>
DEVICE_CONTROL_ENDPOINT=http://<gateway_host>:<gateway_port>
DEVICE_SERVICE_ENDPOINT=http://<device_service_host>:<port>

INPUT_DEVICE_1_ID=72057595585990317
INPUT_DEVICE_2_ID=72057595448511926
OUTPUT_DEVICE_1_ID=72057597079298939
INPUT_SLOT=0
OUTPUT_SLOT=0
ENDPOINT_SLOT=1
POLL_INTERVAL_MS=500
POLL_TIMEOUT_MS=10000

AUTOMATION_RULE_WRITE_ENABLED=true
AUTOMATION_ALLOW_DEVICE_CONTROL=true
AUTOMATION_RULE_RUNTIME_READY=true
```

Device selection for the numbered Rule suite:

1. Call `GET {DEVICE_SERVICE_ENDPOINT}/api/v0/devices?limit=100`.
2. Filter devices where `hc.mac == AUTOMATION_HC_MAC` (`88:e6:28:f8:2e:4d` by default).
3. Keep devices where `network_state == activated`.
4. Keep devices with boolean input/output/state slot support and no active rule mapping.
5. Select eligible devices as trigger, condition, action, and output pool.
6. Fail early with `rule_device_discovery` evidence if fewer than 3 eligible online devices exist.

Run commands on Windows:

```bash
cmd /c npx tsc --noEmit
cmd /c npx playwright test tests/e2e/automation-rules --config=playwright.config.ts --list
```

Safety gates:
- Create/update/delete rule tests are skipped unless `AUTOMATION_RULE_WRITE_ENABLED=true`.
- Device control tests are skipped unless `AUTOMATION_ALLOW_DEVICE_CONTROL=true`.
- Runtime assertions must poll `GET /api/devices/status`; asserting only `POST /api/devices/control` is not enough.
 - Full runs write evidence under `test-runs/automation-rules-current/evidence`.

## Testcase Mapping

## Numbered Executable API Testcases

`rule-api-testcases.spec.ts` is the Rule equivalent of the numbered Scene API
suite. The Playwright report displays each case as `TCx - <ten testcase>`.

| TC ID | Nhom | API | Muc tieu | Priority | Automation |
| --- | --- | --- | --- | --- | --- |
| TC1 | Execution template | GET `/api/v0/execution-templates` | Lay danh sach execution template | P0 | Automated |
| TC2 | Execution template | GET `/api/v0/execution-templates/{id}` | Lay chi tiet execution template | P0 | Automated |
| TC3 | Execution template negative | GET `/api/v0/execution-templates/{id}` | Lay execution template khong ton tai | P1 | Automated |
| TC4 | Execution | POST `/api/v0/executions` | Tao execution And thanh cong | P0 | Automated, gated by `AUTOMATION_RULE_WRITE_ENABLED=true` |
| TC5 | Execution | POST `/api/v0/executions` | Tao execution Or thanh cong | P0 | Automated, gated |
| TC6 | Execution | GET `/api/v0/executions` | Lay danh sach execution | P0 | Automated |
| TC7 | Execution | GET `/api/v0/executions/{id}` | Lay chi tiet execution vua tao | P0 | Automated, gated |
| TC8 | Execution | POST `/api/v0/executions/{id}` | Cap nhat execution tu And sang Or | P0 | Automated, gated |
| TC9 | Execution | DELETE `/api/v0/executions/{id}` | Xoa execution chua dung trong rule | P0 | Automated, gated |
| TC10 | Execution negative | POST `/api/v0/executions` | Tao execution thieu input | P0 | Automated |
| TC11 | Execution negative | POST `/api/v0/executions` | Tao execution thieu output | P0 | Automated |
| TC12 | Execution negative | POST `/api/v0/executions` | Tao execution type sai enum | P1 | Automated |
| TC13 | Execution negative | POST `/api/v0/executions/{id}` | Cap nhat execution khong ton tai | P1 | Automated |
| TC14 | Automation detail | POST `/api/v0/automations/detail` | Tao automation detail And mot input mot output | P0 | Automated, gated |
| TC15 | Automation detail | POST `/api/v0/automations/detail` | Tao automation detail And hai input | P0 | Automated, gated |
| TC16 | Automation detail | POST `/api/v0/automations/detail` | Tao automation detail Or hai input | P0 | Automated, gated |
| TC17 | Automation detail | POST `/api/v0/automations/detail` | Tao automation detail nhieu output action | P0 | Automated, gated |
| TC18 | Automation detail | POST `/api/v0/automations/detail` | Tao automation detail voi time range | P0 | Automated, gated |
| TC19 | Automation detail | POST `/api/v0/automations/detail` | Tao automation detail dang disabled | P0 | Automated, gated |
| TC20 | Automation CRUD | GET `/api/v0/automations` | Lay danh sach automation | P0 | Automated |
| TC21 | Automation CRUD | GET `/api/v0/automations/{id}/detail` | Lay expanded detail automation | P0 | Automated, gated |
| TC22 | Automation CRUD | POST `/api/v0/automations/{id}` | Cap nhat rule sang disabled | P0 | Automated, gated |
| TC23 | Automation CRUD | POST `/api/v0/automations/{id}` | Cap nhat rule sang enabled | P0 | Automated, gated |
| TC24 | Automation CRUD | POST `/api/v0/automations/{id}` | Doi ten automation rule | P0 | Automated, gated |
| TC25 | Automation detail update | PUT `/api/v0/automations/{id}/detail` | Update output value cua rule | P0 | Automated, gated |
| TC26 | Automation detail update | PUT `/api/v0/automations/{id}/detail` | Update condition type tu And sang Or | P1 | Automated, gated |
| TC27 | Automation detail update | PUT `/api/v0/automations/{id}/detail` | Update input device cua rule | P1 | Automated, gated |
| TC28 | Automation detail update | PUT `/api/v0/automations/{id}/detail` | Update time range cua rule | P1 | Automated, gated |
| TC29 | Automation CRUD | DELETE `/api/v0/automations/{id}` | Xoa automation rule thanh cong | P0 | Automated, gated |
| TC30 | Automation CRUD | DELETE `/api/v0/automations` | Xoa nhieu automation rule | P1 | Automated, gated |
| TC31 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail thieu automation | P0 | Automated |
| TC32 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail thieu execution | P0 | Automated |
| TC33 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail input rong | P0 | Automated, cleanup if backend accepts |
| TC34 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail output rong | P0 | Automated, cleanup if backend accepts |
| TC35 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail device khong ton tai | P0 | Automated, cleanup if backend accepts |
| TC36 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail slot khong hop le | P1 | Automated, cleanup if backend accepts |
| TC37 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail endpoint slot khong hop le | P1 | Automated, cleanup if backend accepts |
| TC38 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail start time sai cron | P1 | Automated, cleanup if backend accepts |
| TC39 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail end time sai dinh dang | P1 | Automated, cleanup if backend accepts |
| TC40 | Automation detail negative | POST `/api/v0/automations/detail` | Tao automation detail trung ten rule | P2 | Automated, gated |
| TC41 | Automation CRUD negative | POST `/api/v0/automations/{id}` | Update automation khong ton tai | P1 | Automated |
| TC42 | Automation CRUD negative | DELETE `/api/v0/automations/{id}` | Delete automation khong ton tai | P1 | Automated |
| TC43 | Automation CRUD | POST `/api/v0/automations` | Tao automation basic voi execution id hop le | P0 | Automated, gated |
| TC44 | Automation CRUD negative | POST `/api/v0/automations` | Tao automation basic thieu name | P0 | Automated |
| TC45 | Automation CRUD negative | POST `/api/v0/automations` | Tao automation basic execution id khong ton tai | P0 | Automated, cleanup if backend accepts |
| TC46 | Execution lifecycle | DELETE `/api/v0/executions/{id}` | Delete execution dang duoc automation su dung | P1 | Automated, gated |
| TC47 | Connection | POST `/api/v0/connections` | Tao connection input | P1 | Automated contract; accepts documented validation/not-found statuses |
| TC48 | Connection | POST `/api/v0/connections` | Tao connection output | P1 | Automated contract; accepts documented validation/not-found statuses |
| TC49 | Connection | GET `/api/v0/connections` | Lay danh sach connection | P1 | Automated |
| TC50 | Connection | GET `/api/v0/connections/{id}` | Lay chi tiet connection | P1 | Automated negative contract |
| TC51 | Connection | POST `/api/v0/connections/{id}` | Update connection target | P1 | Automated negative contract |
| TC52 | Connection | POST `/api/v0/connections/bulk` | Bulk create connection | P1 | Automated contract |
| TC53 | Connection | PUT `/api/v0/connections/bulk` | Bulk update connection | P1 | Automated contract; current backend returns 405 |
| TC54 | Connection | DELETE `/api/v0/connections/{id}` | Delete connection | P1 | Automated negative contract |
| TC55 | Runtime | POST `/api/devices/control`, GET `/api/devices/status` | Runtime input ON trigger output ON | P0 | Automated, gated by write and device-control env |
| TC56 | Runtime | Device runtime APIs | Runtime input OFF trigger output OFF | P0 | Automated, gated by write and device-control env |
| TC57 | Runtime | Device runtime APIs | Runtime sai input khong doi output | P0 | Automated, gated by write and device-control env |
| TC58 | Runtime AND | Device runtime APIs | Runtime AND hai input cung dung moi trigger | P0 | Automated happy path, gated by write and device-control env |
| TC59 | Runtime AND | Device runtime APIs | Runtime AND thieu input thu hai khong trigger | P0 | Automated; currently failing because output still turns ON |
| TC60 | Runtime OR | Device runtime APIs | Runtime OR input thu nhat trigger output | P0 | Automated, gated by write and device-control env |
| TC61 | Runtime OR | Device runtime APIs | Runtime OR input thu hai trigger output | P0 | Automated, gated by write and device-control env |
| TC62 | Runtime OR | Device runtime APIs | Runtime OR khong input nao dung khong trigger | P0 | Automated, gated by write and device-control env |
| TC63 | Runtime | Device runtime APIs | Runtime rule disabled khong chay | P0 | Automated, gated by write and device-control env |
| TC64 | Runtime | Automation update + runtime APIs | Runtime re-enable rule roi trigger lai | P0 | Automated, gated by write and device-control env |
| TC65 | Runtime | Device runtime APIs | Runtime mot input dieu khien nhieu output | P0 | Automated with discovered output pool |
| TC66 | Runtime reliability | Device runtime APIs | Runtime lap lai trigger 5 lan | P1 | Automated with repeated device-control gate |
| TC67 | Runtime reliability | Device runtime APIs | Runtime rapid repeated input | P1 | Automated with device-control gate |
| TC68 | Runtime update | Update detail + runtime APIs | Runtime sau khi doi output target | P1 | Automated with discovered output pool |
| TC69 | Runtime update | Update detail + runtime APIs | Runtime sau khi doi input condition | P1 | Automated with discovered input pool |
| TC70 | Output action | Runtime APIs | Output action la device | P0 | Automated, gated by write and device-control env |
| TC71 | Output action | Runtime APIs | Output action la nhieu device | P0 | Automated with discovered output pool |
| TC72 | Output action | Scene APIs + runtime | Output action la scene | P1 | Automated: create scene, add scene as rule output, trigger input, verify scene target output |
| TC73 | Runtime schedule/time range | Rule runtime APIs | Rule co lich trong va ngoai khoang | P1 | Automated: current time window triggers, outside window does not trigger |

| TC ID | Nhom | API | Muc tieu | Priority | Expected |
| --- | --- | --- | --- | --- | --- |
| TC-RULE-TPL-001 | Execution template | GET `/api/v0/execution-templates` | List templates | P0 | 200, `success=true`, contains `And` and `Or` |
| TC-RULE-TPL-002 | Execution template | GET `/api/v0/execution-templates/{id}` | Get template detail | P0 | 200, returned `id` and `type` match list item |
| TC-RULE-TPL-003 | Execution template | POST `/api/v0/execution-templates` | Create `And` template | P1 | 200, created type is `And` |
| TC-RULE-TPL-004 | Execution template | POST `/api/v0/execution-templates` | Create `Or` template | P1 | 200, created type is `Or` |
| TC-RULE-TPL-005 | Execution template | POST `/api/v0/execution-templates/{id}` | Update template | P1 | 200, updated fields persist |
| TC-RULE-TPL-006 | Execution template | DELETE `/api/v0/execution-templates/{id}` | Delete test template | P1 | 200, detail no longer returns active record |
| TC-RULE-TPL-007 | Negative | POST `/api/v0/execution-templates` | Missing type | P0 | 400 or validation error |
| TC-RULE-TPL-008 | Negative | POST `/api/v0/execution-templates` | Invalid type enum | P1 | 400 or TODO_CONFIRM if backend accepts dynamic types |
| TC-RULE-TPL-009 | Negative | GET `/api/v0/execution-templates/{id}` | Unknown template id | P1 | 404 or business error |
| TC-RULE-EXE-001 | Execution | POST `/api/v0/executions` | Create `And` execution | P0 | 200, input/output saved |
| TC-RULE-EXE-002 | Execution | POST `/api/v0/executions` | Create `Or` execution with multiple inputs | P0 | 200, type `Or` saved |
| TC-RULE-EXE-003 | Execution | GET `/api/v0/executions` | List executions | P0 | 200, `items`, `total`, `page`, `limit` exist |
| TC-RULE-EXE-004 | Execution | GET `/api/v0/executions/{id}` | Get execution detail | P0 | 200, detail matches created execution |
| TC-RULE-EXE-005 | Execution | POST `/api/v0/executions/{id}` | Update `And` to `Or` | P0 | 200, `type=Or`, `updated_at` exists |
| TC-RULE-EXE-006 | Execution | DELETE `/api/v0/executions/{id}` | Delete unused execution | P0 | 200 or idempotent 404 during cleanup |
| TC-RULE-EXE-007 | Negative | POST `/api/v0/executions` | Missing input | P0 | 400 validation |
| TC-RULE-EXE-008 | Negative | POST `/api/v0/executions` | Missing output | P0 | 400 validation |
| TC-RULE-EXE-009 | Negative | POST `/api/v0/executions` | Invalid type enum | P1 | 400 or business error |
| TC-RULE-EXE-010 | Negative | POST `/api/v0/executions/{id}` | Update unknown execution | P1 | 404 |
| TC-RULE-EXE-011 | Execution | DELETE `/api/v0/executions/{id}` | Delete execution used by automation | P1 | Blocked or cascade behavior, TODO_CONFIRM |
| TC-RULE-AUTO-001 | Automation CRUD | POST `/api/v0/automations` | Create basic automation | P0 | 200, id exists, execution_id matches |
| TC-RULE-AUTO-002 | Automation CRUD | GET `/api/v0/automations` | List automations | P0 | 200, created item visible |
| TC-RULE-AUTO-003 | Automation CRUD | GET `/api/v0/automations/{id}/detail` | Expanded detail | P0 | 200, execution and connections present |
| TC-RULE-AUTO-004 | Automation CRUD | POST `/api/v0/automations/{id}` | Disable automation | P0 | 200, `enable=false` |
| TC-RULE-AUTO-005 | Automation CRUD | POST `/api/v0/automations/{id}` | Enable automation | P0 | 200, `enable=true` |
| TC-RULE-AUTO-006 | Automation CRUD | POST `/api/v0/automations/{id}` | Rename automation | P0 | 200, name changed |
| TC-RULE-AUTO-007 | Automation CRUD | DELETE `/api/v0/automations/{id}` | Delete automation | P0 | 200, record no longer active |
| TC-RULE-AUTO-008 | Automation CRUD | DELETE `/api/v0/automations` | Delete many automations | P1 | 200, count/schema matches contract |
| TC-RULE-AUTO-009 | Negative | POST `/api/v0/automations` | Missing name | P0 | 400 validation |
| TC-RULE-AUTO-010 | Negative | POST `/api/v0/automations` | Unknown execution_id | P0 | 400 or 404 |
| TC-RULE-AUTO-011 | Negative | POST `/api/v0/automations/{id}` | Update unknown automation | P1 | 404 |
| TC-RULE-AUTO-012 | Negative | DELETE `/api/v0/automations/{id}` | Delete unknown automation | P1 | 404 or `data=0`, TODO_CONFIRM |
| TC-RULE-DETAIL-001 | Automation detail | POST `/api/v0/automations/detail` | Create `And`, 1 input, 1 output | P0 | 200, automation and execution created |
| TC-RULE-DETAIL-002 | Automation detail | POST `/api/v0/automations/detail` | Create `And`, 2 inputs | P0 | 200, 2 input connections |
| TC-RULE-DETAIL-003 | Automation detail | POST `/api/v0/automations/detail` | Create `Or`, 2 inputs | P0 | 200, detail type `Or` |
| TC-RULE-DETAIL-004 | Automation detail | POST `/api/v0/automations/detail` | Create multiple output actions | P0 | 200, output connections match |
| TC-RULE-DETAIL-005 | Automation detail | POST `/api/v0/automations/detail` | Create time range rule | P0 | 200, start/end time persisted |
| TC-RULE-DETAIL-006 | Automation detail | POST `/api/v0/automations/detail` | Create disabled rule | P0 | 200, `enable=false` |
| TC-RULE-DETAIL-007 | Automation detail | PUT `/api/v0/automations/{id}/detail` | Change output status | P0 | 200, output detail changed |
| TC-RULE-DETAIL-008 | Automation detail | PUT `/api/v0/automations/{id}/detail` | Change `And` to `Or` | P1 | 200, type changed |
| TC-RULE-DETAIL-009 | Automation detail | PUT `/api/v0/automations/{id}/detail` | Change input device | P1 | 200, input connection changed |
| TC-RULE-DETAIL-010 | Automation detail | PUT `/api/v0/automations/{id}/detail` | Change time range | P1 | 200, time range changed |
| TC-RULE-DETAIL-011 | Negative | POST `/api/v0/automations/detail` | Missing automation | P0 | 400 validation |
| TC-RULE-DETAIL-012 | Negative | POST `/api/v0/automations/detail` | Missing execution | P0 | 400 or 422 validation |
| TC-RULE-DETAIL-013 | Negative | POST `/api/v0/automations/detail` | Empty input | P0 | 400 validation |
| TC-RULE-DETAIL-014 | Negative | POST `/api/v0/automations/detail` | Empty output | P0 | 400 validation |
| TC-RULE-DETAIL-015 | Negative | POST `/api/v0/automations/detail` | Unknown input device | P0 | 400 or 404 |
| TC-RULE-DETAIL-016 | Negative | POST `/api/v0/automations/detail` | Unknown output device | P0 | 400 or 404 |
| TC-RULE-DETAIL-017 | Negative | POST `/api/v0/automations/detail` | Invalid slot | P1 | 400 validation |
| TC-RULE-DETAIL-018 | Negative | POST `/api/v0/automations/detail` | Invalid endpoint_slot | P1 | 400 validation |
| TC-RULE-DETAIL-019 | Negative | POST `/api/v0/automations/detail` | Invalid start_time cron | P1 | 400 validation |
| TC-RULE-DETAIL-020 | Negative | POST `/api/v0/automations/detail` | Invalid end_time | P1 | 400 validation |
| TC-RULE-CONN-001 | Connection | POST `/api/v0/connections` | Create input connection | P1 | 200, id/source/target exist |
| TC-RULE-CONN-002 | Connection | POST `/api/v0/connections` | Create output connection | P1 | 200 |
| TC-RULE-CONN-003 | Connection | GET `/api/v0/connections` | List connections | P1 | 200, created connection visible |
| TC-RULE-CONN-004 | Connection | GET `/api/v0/connections/{id}` | Get connection detail | P1 | 200, source/target match |
| TC-RULE-CONN-005 | Connection | POST `/api/v0/connections/{id}` | Update target | P1 | 200, target changed |
| TC-RULE-CONN-006 | Connection | POST `/api/v0/connections/bulk` | Bulk create | P1 | 200, count/schema matches |
| TC-RULE-CONN-007 | Connection | PUT `/api/v0/connections/bulk` | Bulk update | P1 | 200, updated targets match |
| TC-RULE-CONN-008 | Connection | DELETE `/api/v0/connections/{id}` | Delete connection | P1 | 200 or idempotent 404 |
| TC-RULE-ACT-001 | Runtime | POST `/api/devices/control`, GET `/api/devices/status` | Input ON triggers output ON | P0 | Polling sees output slot become true |
| TC-RULE-ACT-002 | Runtime | POST `/api/devices/control`, GET `/api/devices/status` | Input OFF triggers output OFF | P0 | Polling sees output slot become false |
| TC-RULE-ACT-003 | Runtime | POST `/api/devices/control`, GET `/api/devices/status` | Wrong input does not change output | P0 | Output remains unchanged after timeout |
| TC-RULE-ACT-004 | Runtime AND | Device runtime APIs | 2 inputs both true trigger output | P0 | Output becomes true |
| TC-RULE-ACT-005 | Runtime AND | Device runtime APIs | Missing second input does not trigger | P0 | Output remains false |
| TC-RULE-ACT-006 | Runtime OR | Device runtime APIs | First input true triggers output | P0 | Output becomes true |
| TC-RULE-ACT-007 | Runtime OR | Device runtime APIs | Second input true triggers output | P0 | Output becomes true |
| TC-RULE-ACT-008 | Runtime OR | Device runtime APIs | No input true does not trigger | P0 | Output remains false |
| TC-RULE-ACT-009 | Runtime | Device runtime APIs | Disabled rule does not run | P0 | Output remains unchanged |
| TC-RULE-ACT-010 | Runtime | Automation update + runtime APIs | Re-enable rule then trigger | P0 | Output changes after enable |
| TC-RULE-ACT-011 | Runtime | Device runtime APIs | 1 input controls 3 outputs | P0 | All output devices change |
| TC-RULE-ACT-012 | Runtime reliability | Device runtime APIs | Repeat trigger 5 times | P1 | Correct output every loop |
| TC-RULE-ACT-013 | Runtime reliability | Device runtime APIs | Rapid repeated input | P1 | Output correct, APIs do not error |
| TC-RULE-ACT-014 | Runtime update | Update detail + runtime APIs | Trigger after changing output target | P1 | New output changes, old output unchanged |
| TC-RULE-ACT-015 | Runtime update | Update detail + runtime APIs | Trigger after changing input condition | P1 | Old input does not trigger, new input triggers |
| TC-RULE-OUT-001 | Output action | Runtime APIs | Output is device | P0 | Device status changes |
| TC-RULE-OUT-002 | Output action | Runtime APIs | Output is many devices | P0 | All devices change |
| TC-RULE-OUT-003 | Output action | Scene APIs + runtime | Output is scene | P1 | Scene/binding activated |
| TC-RULE-OUT-004 | Output action | Schedule APIs + runtime | Output is schedule | P2 | Schedule activated or updated |
| TC-RULE-OUT-005 | Output action | Automation APIs + runtime | Output is another automation | P2 | Downstream automation output changes |
| TC-RULE-OUT-006 | Negative | Create/update rule | Unknown output target | P1 | 400 or 404 |
| TC-RULE-SEC-001 | Security | POST `/api/v0/automations/detail` | Missing token | P0 | 401 if auth is enabled |
| TC-RULE-SEC-002 | Security | POST `/api/v0/automations/detail` | Invalid token | P0 | 401 if auth is enabled |
| TC-RULE-SEC-003 | Security | POST `/api/v0/automations/detail` | No create permission | P0 | 403 |
| TC-RULE-SEC-004 | Security | PUT `/api/v0/automations/{id}/detail` | Viewer cannot update | P0 | 403 |
| TC-RULE-SEC-005 | Security | DELETE `/api/v0/automations/{id}` | Viewer cannot delete | P0 | 403 |
| TC-RULE-SEC-006 | Security | GET list/detail | Viewer can read | P1 | 200 |

## Executable Coverage Summary

| Spec | TC IDs covered now | Notes |
| --- | --- | --- |
| `rule-api-testcases.spec.ts` | TC1..TC73 | Numbered Rule API/runtime suite with full `TCx - name` Playwright titles; write/runtime cases are env gated |
| `rule-ui-evidence.spec.ts` | RULE-UI* | Retained UI evidence data for manual UI checks |

## Sample Pass/Fail Report

```text
Suite: Automation Center generated rule API coverage
Environment: staging
Started: 2026-06-30T00:00:00Z

PASS TC-RULE-TPL-001/002
  Evidence: GET /execution-templates returned And/Or and detail matched id/type.

PASS TC-RULE-EXE-001/003/004/005/006
  Evidence: Created execution, found in list, got detail, updated type, cleanup delete returned 200.

SKIP TC-RULE-DETAIL-001/003/004
  Reason: AUTOMATION_RULE_WRITE_ENABLED was not true.

PASS TC-RULE-NEG-002
  Evidence: POST /automations/detail without execution returned 400.

SKIP TC-RULE-ACT-001/003
  Reason: AUTOMATION_ALLOW_DEVICE_CONTROL or AUTOMATION_RULE_RUNTIME_READY was not true.
```

## TODO_CONFIRM

- Whether automation names must be unique.
- Whether deleting automation cascades execution and connections.
- Whether deleting an execution used by an automation is blocked or cascaded.
- Whether disabled rules are removed from gateway runtime or ignored at runtime.
- Exact cron field count and timezone for `start_time`, `end_time`, `duration`.
- Security/auth behavior for Automation Center endpoints.
- Expected API/status source for scene, schedule, and nested automation outputs.
- Device offline contract: fail creation or allow creation and fail runtime.
- Debounce/throttle behavior for rapid repeated triggers.
- Partial output failure behavior and observable log/event location.
