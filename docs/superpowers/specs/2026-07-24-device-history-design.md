# Device History E2E Design

## Goal

Add an E2E suite for device history logs that runs against the real HC/device services, records fresh evidence for every testcase run, and captures Home Controller logs when a testcase fails.

## Scope

The suite covers `GET /api/device_logs` from the device-log service at `DEVICE_HISTORY_BASE_URL`, defaulting to `http://10.10.0.198:4420`. Runtime cases use real device control through `POST /api/devices/control` and verify status through `GET /api/devices/status`.

## Architecture

Create `tests/e2e/device-history/device-history.api.spec.ts` as a focused Playwright suite. It follows the `area-control` evidence pattern: a current run directory, per-testcase JSON evidence, Playwright attachments, and HC SSH log capture on failure. The suite discovers online switchable devices from `DEVICE_SERVICE_ENDPOINT`, filtered by `AUTOMATION_HC_MAC`, and skips runtime cases when device control is not explicitly enabled.

## Testcases

- `TC1`: list device history successfully from `GET /api/device_logs`.
- `TC2`: control one real device and verify the newest matching log appears.
- `TC3`: control a device twice and verify history ordering/newest cursor behavior.
- `TC4`: control two discovered devices to represent a lighting/group action and verify logs for both.

## Evidence

Evidence is written to `test-runs/device-history-current/evidence/api`. The current run directory is reset once per run id, so evidence represents the latest run. Each evidence file includes request/response payloads, selected devices, before/after logs, assertions, cleanup/reset details, and `hc_logs` for failures.

## Environment

Required for runtime cases:

```env
DEVICE_HISTORY_BASE_URL=http://10.10.0.198:4420
DEVICE_HISTORY_API=/api/device_logs
DEVICE_HISTORY_DEVICE_ID_PARAM=device_id
DEVICE_HISTORY_ALLOW_DEVICE_CONTROL=true
DEVICE_SERVICE_ENDPOINT=http://10.10.0.198:3333
GATEWAY_BASE_URL=http://10.10.0.198:8081
DEVICE_STATUS_BASE_URL=http://10.10.30.154:8080
AUTOMATION_HC_MAC=88:e6:28:f8:2e:4d
AUTOMATION_HC_ID=4932308540097724437
SLOT_ON_OFF=1
HC_SSH_HOST=10.10.30.154
HC_SSH_USER=root
HC_SSH_KEY_PATH=C:\Users\thuyv\Downloads\key ssh\hcg1_Lumi
HC_SSH_KEY_PASSPHRASE=<local-passphrase>
HC_LOG_PATH=/tmp/log/home-controller.log
```
