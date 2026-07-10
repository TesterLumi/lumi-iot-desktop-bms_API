# Automation Real HC Testcase Matrix

Target HC:

- IP: `10.10.30.154`
- MAC: `88:e6:28:f8:2e:4d`
- HC ID: `4932308540097724437`

## Scope

This matrix covers the automation path from cloud configuration to Home Controller runtime behavior:

`Create config -> Sync to HC -> Trigger -> Device state changes -> Verify API/DB/event/log`

## Environment

| Key | Required For | Example |
| --- | --- | --- |
| `IOT_HC_ENDPOINT` | HC direct smoke | `http://10.10.30.154:8080` |
| `AUTOMATION_SERVICE_ENDPOINT` | Automation Center API tests | `http://10.10.0.198:19000` |
| `DEVICE_SERVICE_ENDPOINT` | Device discovery by HC | `http://10.10.0.198:3333` |
| `DEVICE_CONTROL_ENDPOINT` | Real device control and scheduler | `http://10.10.0.198:8081` |
| `AUTOMATION_HC_ID` | control header `x-hc-id` | `4932308540097724437` |
| `AUTOMATION_HC_MAC` | gateway/config tests | `88:e6:28:f8:2e:4d` |
| `IOT_CONSOLE_ENDPOINT` | HC DB/source-of-truth checks | `http://<console-host>:3333` |
| `POSTGRES_URI` | DB verification | `postgres://...` |
| `AUTOMATION_TRIGGER_DEVICE_ID` | runtime trigger tests | `118431937308523268` |
| `AUTOMATION_CONDITION_DEVICE_ID` | AND/OR condition tests | `118431937308523267` |
| `AUTOMATION_ACTION_DEVICE_ID` | action/scene target tests | `118431937308523266` |
| `AUTOMATION_DEVICE_STATE_IDX` | device on/off slot | `1` |
| `AUTOMATION_ALLOW_DEVICE_CONTROL` | enables real device state mutation | `true` |
| `AUTOMATION_DETAIL_PAYLOAD` | optional `POST /automations/detail` fixture | JSON string from captured UI request |

## P0 Testcases

| ID | Group | Scenario | Preconditions | Verification |
| --- | --- | --- | --- | --- |
| AUTO-HC-001 | Smoke | HC health check returns online | `IOT_HC_ENDPOINT` set | `GET /api/health_check` returns `200`, `{ status: true }` |
| AUTO-HC-002 | Smoke | HC exposes registered devices | HC online | `GET /api/devices` returns an array |
| AUTO-HC-003 | Smoke | HC MAC exists in DB | `POSTGRES_URI`, `AUTOMATION_HC_MAC` set | `home_controllers.mac` exists |
| AUTO-HC-004 | Smoke | HC MQTT status is connected | DB status table available | `home_controller_mqtt_status.connected = true` |
| AUTO-API-001 | API | List execution templates | Automation endpoint set | `GET /api/v0/execution-templates` returns `And`, `Or` |
| AUTO-API-002 | API | List existing automations | Automation endpoint set | `GET /api/v0/automations` returns paged `items`, `total` |
| AUTO-API-003 | API | Create automation detail from captured payload | `AUTOMATION_DETAIL_PAYLOAD` set | `POST /api/v0/automations/detail` returns `success=true` |
| AUTO-API-004 | API | Legacy CRUD endpoints are not assumed | N/A | `/config`, `/gateways`, `/executions` remain out of automated scope until documented |
| AUTO-RUN-001 | Runtime | A on triggers B on | safe trigger/action devices configured | action device state changes |
| AUTO-RUN-002 | Runtime | AND condition triggers only when both inputs match | safe trigger/condition/action devices configured | target changes only after both inputs satisfy |
| AUTO-RUN-003 | Runtime | OR condition triggers when either input matches | safe trigger/condition/action devices configured | target changes after first matching input |
| AUTO-RUN-004 | Runtime | Disabled cell does not execute | rule/cell disabled | target device state does not change |
| AUTO-SCENE-001 | Scene | Scene activation fanouts fixed bool outputs | safe action devices configured | target devices receive configured output states |
| AUTO-SCENE-002 | Scene | Scene does not emit when slot 0 is not true | scene exists | no target state change |
| AUTO-SCH-001 | Scheduler | Valid 7-field cron runs with `enable=true` | safe action device configured | state changes when cron is due |
| AUTO-SCH-002 | Scheduler | `enable=false` stores but does not run | safe action device configured | no state change |
| AUTO-SCH-003 | Scheduler | Invalid cron is ignored | safe action device configured | no state change; warning/log if available |
| AUTO-SYNC-001 | Failure | Gateway offline during sync does not crash cloud | automation endpoint and HC lifecycle control | API handles failure, service remains healthy |
| AUTO-SYNC-002 | Failure | Delete rule/scene removes runtime behavior | rule/scene exists and was synced | triggering old source no longer changes target |
| AUTO-NEG-001 | Negative | Non-existing execution/cell/scene id returns error | automation endpoint set | `404` or documented plain-text error |

## Safety Defaults

- Runtime and scheduler specs must skip unless `AUTOMATION_ALLOW_DEVICE_CONTROL=true`.
- Default device IDs are the selected A/B/C devices on HC `88:e6:28:f8:2e:4d`.
- `POST /api/v0/automations/detail` must skip unless a captured UI payload is supplied.
