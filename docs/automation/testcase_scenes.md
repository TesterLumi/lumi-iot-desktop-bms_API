# Automation Scenes Testcases

Executable tests and quick run notes are colocated at
`tests/e2e/automation-scenes/README.md`. The current folder is intentionally
compact: one main spec plus one README.

The current Scene Management API set from `prompt_generation_auto_test_quan_ly_scene.md`
is implemented in `tests/e2e/automation-scenes/scene-management.api.spec.ts`
as visible Playwright cases for non-permission scenarios, with per-case JSON evidence in
`test-runs/automation-scenes-current/evidence`.

Permission/auth cases `TC43` and `TC54` through `TC60` are intentionally out of
scope for this phase and will be added later when auth fixtures/tokens are ready.

This matrix also includes the missing API cases reviewed from
`C:\Users\thuyv\Downloads\api.md`.

## Scope

Scenes are automation cells with one fixed trigger input and a fixed set of boolean outputs:

- `inputs.slot_0 == true`: emit configured boolean outputs.
- `inputs.slot_0 != true`: emit no outputs.
- Each output slot maps to a configured downstream device/cell connection.

This testcase set targets the real HC environment currently used for testing:

| Key | Value |
| --- | --- |
| HC name | `Tester` |
| HC ID | `4932308540097724437` |
| HC MAC | `88:e6:28:f8:2e:4d` |
| HC direct endpoint | `http://10.10.30.154:8080` |
| Automation service | `http://10.10.0.198:19000` |
| Device service | `http://10.10.0.198:3333` |
| Device control service | `http://10.10.0.198:8081` |
| Default slot | `1` |

## Test Data

Target devices are discovered dynamically before each scenes suite run:

1. Call `GET {DEVICE_SERVICE_ENDPOINT}/api/v0/devices?limit=100`.
2. Keep devices where `hc.mac == 88:e6:28:f8:2e:4d`.
3. Mark online devices where `status == true` and `network_state == activated`.
4. Select only devices with boolean `spec.input`, `spec.output`, and `spec.state` at slot `1`.
5. Prefer devices with no existing rules and switch-like device types.
6. Pick up to 3 eligible online devices. The real HC inventory is allowed to run with at least 1 eligible controllable device.
7. If no eligible device exists, fail early and print selected/offline/skipped lists.

Snapshot data for selected devices:

| Scene | Device count | Slot | Snapshot |
| --- | ---: | --- | --- |
| ON scene | 1-3 auto-discovered devices | `1` | `true` |
| OFF scene | 1-3 auto-discovered devices | `1` | `false` |
| Scheduled scene | 1-3 auto-discovered devices | `1` | `true` |

Latest verified discovery example on HC `88:e6:28:f8:2e:4d`:

| Device ID | Name | Status | Device Type | Rule Count |
| --- | --- | --- | ---: | ---: |
| `118431937308523268` | `thiết bị_55FB_4` | `activated` | `4` | `0` |
| `118431937308523267` | `thiết bị_55FB_3` | `activated` | `4` | `0` |
| `118431937308523266` | `thiết bị_55FB_2` | `activated` | `4` | `0` |

Scene naming convention:

- Main scene: `thuy<N>`.
- Renamed scene: `thuyvu<N>`.
- Scheduled scene: `thuy<N+1>`.
- `<N>` is calculated from existing cloud scenes by finding the largest suffix in `thuy\d+` or `thuyvu\d+`, then adding `1`.
- Scheduled scene time: `8:30`, Monday to Saturday, represented as cron `0 30 8 * * 2,3,4,5,6,7 *`.

## API And Sync Testcases

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-001 | P0 | List scenes | `GET /api/v0/scenes` | `success=true`, response has `data.items[]`, `total` | Automated |
| SCN-002 | P0 | Get existing scene detail | Pick an ID from list, `GET /api/v0/scenes/{id}` | `success=true`, scene has `id`, `name`, `status`, `binding` | Automated |
| SCN-003 | P0 | Create three-device ON scene | Discover 3 eligible online devices, create `thuy<N>` with all snapshots `{ "1": true }` | Response `success=true`, name is `thuy<N>`, all 3 bindings exist | Automated |
| SCN-004 | P0 | Created scene syncs to HC runtime | Poll `GET /api/v0/scenes/{id}`, then `GET {HC}/api/scenes` | Cloud scene becomes `Activated`; HC scenes include same ID and binding | Automated |
| SCN-005 | P0 | Created scene maps into device detail | After sync, call `GET /api/v0/devices/{device_id}` for all 3 devices | Each device `scene` field contains `{scene_id: [[1,true]]}` | Automated |
| SCN-006 | P0 | Rename and update to three-device OFF scene | Rename `thuy<N>` to `thuyvu<N>` and update selected devices to `{ "1": false }` | Response `success=true`, detail has updated name and all OFF snapshots | Automated |
| SCN-007 | P0 | Create scheduled three-device ON scene at 8:30 | Create `thuy<N+1>` using selected devices, `cron_enable=true`, `cron="0 30 8 * * 2,3,4,5,6,7 *"` | Scene is accepted, syncs to HC, and keeps cron config | Automated |
| SCN-008 | P0 | Delete scene | `DELETE /api/v0/scenes/{id}` | Response success/affected; scene removed from cloud list and HC runtime | Automated |
| SCN-009 | P1 | Create multi-device bool scene | Create scene with target C `true`, target B `false` | Both bindings sync to HC with correct bool snapshots | Automated after second safe target is approved |
| SCN-010 | P1 | Create Lighting scene | Create scene with `type=Lighting` and valid binding | Scene is accepted or documented validation error is returned | Automated after product confirms Lighting support |

## API Schema And Filter Testcases From `api.md`

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-011 | P0 | Validate list response schema | `GET /api/v0/scenes` | Response has `success`, `data.items[]`; each item has `id`, `name`, `type`, `status`, `binding`, `cron`, `cron_enable` | Missing |
| SCN-012 | P0 | Validate detail response schema | Create or pick scene, `GET /api/v0/scenes/{id}` | Detail has real API scene schema and binding array shape | Missing |
| SCN-013 | P1 | Filter by scene id | Create scene, call list with id filter if supported | Returned list contains only matching scene or behavior is marked TODO_CONFIRM | Missing |
| SCN-014 | P1 | Filter by scene status | Call list with `status=Activated` | All returned scenes have `status=Activated` or filter behavior is TODO_CONFIRM | Missing |
| SCN-015 | P1 | Filter by type Normal | Call list with `type=Normal` | All returned scenes have `type=Normal` or filter behavior is TODO_CONFIRM | Missing |
| SCN-016 | P1 | Filter by type Lighting | Call list with `type=Lighting` | All returned scenes have `type=Lighting` or filter behavior is TODO_CONFIRM | Missing |
| SCN-017 | P1 | Filter by unique name | Create scene with unique name, list by name if supported | Returned scene name matches filter or behavior is TODO_CONFIRM | Missing |
| SCN-018 | P1 | Filter no result | List by random missing name if supported | Empty list or behavior is TODO_CONFIRM | Missing |
| SCN-019 | P2 | Invalid id filter | `GET /api/v0/scenes?id=abc` | 400 validation or ignored filter behavior is TODO_CONFIRM | Missing |
| SCN-020 | P2 | Invalid status filter | `GET /api/v0/scenes?status=Invalid` | 400 validation or empty list behavior is TODO_CONFIRM | Missing |

## Create Validation And Boundary Testcases From `api.md`

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-021 | P1 | Create scene with fixed background id | `POST /api/v0/scenes` with `background="bg_living_room_evening"` | Background is stored or validation behavior is TODO_CONFIRM | Missing |
| SCN-022 | P1 | Create scene with color background | `POST /api/v0/scenes` with `background_color` preset | Color is stored in detail | Missing |
| SCN-023 | P2 | Create scene with background URL | `POST /api/v0/scenes` with HTTPS image URL | Accepted or rejected by documented validation | Missing |
| SCN-024 | P1 | Create scene with multiple bindings | Discover 2-3 safe controllable devices and create one scene with all bindings | All bindings are stored and synced | Missing, blocked if HC has fewer than 2 safe devices |
| SCN-025 | P0 | Create scene missing name | `POST /api/v0/scenes` without `name` | 400 validation or documented default behavior | Missing |
| SCN-026 | P0 | Create scene empty name | `POST /api/v0/scenes` with `name=""` | 400 validation or TODO_CONFIRM | Missing |
| SCN-027 | P0 | Create scene missing type | `POST /api/v0/scenes` without `type` | 400 validation or documented default behavior | Missing |
| SCN-028 | P0 | Create scene invalid type | `POST /api/v0/scenes` with `type="Automation"` | 400 validation or TODO_CONFIRM | Missing |
| SCN-029 | P1 | Create scene missing icon | `POST /api/v0/scenes` without `icon` | 400 validation or default icon behavior is TODO_CONFIRM | Missing |
| SCN-030 | P1 | Create scene missing background fields | Omit `background` and/or `background_color` | 400 validation or default behavior is TODO_CONFIRM | Missing |
| SCN-031 | P1 | Create scene missing binding | `POST /api/v0/scenes` without `binding` | 400 validation or empty binding behavior is TODO_CONFIRM | Missing |
| SCN-032 | P1 | Create scene empty binding | `POST /api/v0/scenes` with `binding=[]` | 400 validation or allowed empty scene is TODO_CONFIRM | Missing |
| SCN-033 | P1 | Create scene invalid binding status | Binding item has `status="Pending"` | 400 validation or sync failure behavior is TODO_CONFIRM | Missing |
| SCN-034 | P1 | Create scene snapshot not object | Binding item has `snapshot=[]` or string | 400 validation or TODO_CONFIRM | Missing |
| SCN-035 | P2 | Create scene non-numeric binding id | Binding item id is non-number string | 400 validation or TODO_CONFIRM | Missing |
| SCN-036 | P2 | Create duplicate scene name | Create scene with existing name | 200 allowed duplicate or 409 unique constraint TODO_CONFIRM | Missing |
| SCN-037 | P2 | Boundary name length | Create/update scene with min/max/over-max name | Accepted within limit, rejected over limit once limit is confirmed | Missing |
| SCN-038 | P2 | Boundary icon/background length | Create/update over-long icon/background values | Accepted/rejected according to confirmed limits | Missing |

## Detail, Update, And Delete Missing API Testcases From `api.md`

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-039 | P0 | Detail non-existing scene | `GET /api/v0/scenes/{fake_id}` | 404 or `success=false` | Missing |
| SCN-040 | P1 | Detail invalid id type | `GET /api/v0/scenes/abc` | 400 or 404 according to router behavior | Missing |
| SCN-041 | P1 | Detail negative id | `GET /api/v0/scenes/-1` | 400 or 404 according to router behavior | Missing |
| SCN-042 | P1 | Update icon only | Create scene, update only `icon` | Icon changes; name/background/binding remain unchanged | Missing |
| SCN-043 | P1 | Update background only | Create scene, update only `background` | Background changes; other fields remain unchanged | Missing |
| SCN-044 | P1 | Update multiple fields | Update name, icon, background/background_color, binding | All sent fields update correctly | Missing |
| SCN-045 | P1 | Omitted fields remain unchanged | Update only name | Unsent fields remain unchanged in detail | Missing |
| SCN-046 | P2 | Update empty body | `POST /api/v0/scenes/{id}` with `{}` | 200 unchanged or 400 TODO_CONFIRM | Missing |
| SCN-047 | P1 | Update empty name | Update `name=""` | 400 validation or TODO_CONFIRM | Missing |
| SCN-048 | P1 | Update invalid binding status | Update binding item `status="Pending"` | 400 validation or TODO_CONFIRM | Missing |
| SCN-049 | P1 | Update invalid snapshot type | Update snapshot as array/string | 400 validation or TODO_CONFIRM | Missing |
| SCN-050 | P0 | Update non-existing scene | `POST /api/v0/scenes/{fake_id}` | 404 or `success=false` | Missing |
| SCN-051 | P1 | Update invalid id type | `POST /api/v0/scenes/abc` | 400 or 404 | Missing |
| SCN-052 | P0 | Deleted scene absent from list | Delete test-created scene, then list by id/name if supported | Deleted scene absent or status behavior documented | Missing |
| SCN-053 | P0 | Detail deleted scene | Delete test-created scene, then get detail | 404 or Destroying status TODO_CONFIRM | Missing |
| SCN-054 | P0 | Delete non-existing scene | `DELETE /api/v0/scenes/{fake_id}` | 404 or `data=0` TODO_CONFIRM | Missing |
| SCN-055 | P1 | Delete invalid id type | `DELETE /api/v0/scenes/abc` | 400 or 404 | Missing |
| SCN-056 | P1 | Delete same scene twice | Delete test-created scene twice | Second call returns `data=0` or 404 TODO_CONFIRM | Missing |

## Gateway Sync, Security, And Stress Testcases From `api.md`

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-057 | P1 | Sync scene from gateway | `POST /api/v0/scenes/{id}/sync-from-gateway` with binding | Binding updates from gateway payload | Pending: endpoint not confirmed |
| SCN-058 | P1 | Sync number snapshot from gateway | Sync snapshot with number value such as brightness | Number snapshot persists | Pending: endpoint not confirmed |
| SCN-059 | P1 | Sync multiple bindings from gateway | Sync binding for multiple device/cell ids | All bindings update | Pending: endpoint not confirmed |
| SCN-060 | P1 | Sync only binding keeps metadata | Sync only binding | Name/icon/background remain unchanged | Pending: endpoint not confirmed |
| SCN-061 | P1 | Sync non-existing scene | Sync with fake scene id | 404 or `success=false` | Pending: endpoint not confirmed |
| SCN-062 | P1 | Sync invalid binding status | Sync status `Pending` | 400 validation | Pending: endpoint not confirmed |
| SCN-063 | P2 | No-token scene API | Call list/detail/create/update/delete without token if auth is enabled | 401 | Pending: auth not configured |
| SCN-064 | P2 | No-permission scene API | Call scene API with no-permission user if auth is enabled | 403 | Pending: auth not configured |
| SCN-065 | P2 | Large binding stress | Create/update scene with large binding list using safe virtual devices | Service accepts within supported limit or returns validation error | Missing |

## Postman Collection Confirmed Testcases

These cases were added after reviewing
`C:\Users\thuyv\Downloads\automation-center.postman_collection.json`.

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-066 | P0 | Get expanded scene detail | Create scene, call `GET /api/v0/scenes/{id}/detail?extra_fields=device,scene,area` | Response has expanded binding with `snapshot`, `area`, and `type` | Automated |
| SCN-067 | P1 | Update scene enable flag | Create scene, update `{enable:false}`, then `{enable:true}` via scene update API | Response persists enable changes | Automated |
| SCN-068 | P1 | Update scene cron config | Update scene with `cron="0 34 16 * * * *"` and `cron_enable=true` | Response persists cron fields | Automated |
| SCN-069 | P1 | Sync scene from gateway | Call `POST /api/v0/scenes/{id}/sync-from-gateway` with binding snapshot | Response updates binding snapshot from gateway payload | Automated |
| SCN-070 | P1 | Delete many scenes | Create two scenes and call `DELETE /api/v0/scenes` with scene ID array | Response `success=true`; scenes disappear from HC runtime | Automated |
| SCN-071 | P0 | Activate first random-state scene and verify device state | Randomly select eligible device group; set each device to the opposite of its scene snapshot; activate scene via `/api/devices/control`; poll `GET /api/devices/status?ids=...` | Each device slot `1` matches its configured scene snapshot | Automated |
| SCN-072 | P0 | Activate second random-state scene and verify device state | Select a different eligible device group when enough devices exist; use inverted/mixed snapshots; activate scene and poll device status | Each device slot `1` matches its configured scene snapshot; report flags reused devices if HC inventory is insufficient | Automated |

## Runtime Activation Testcases

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-101 | P0 | Activate ON/OFF scenes through API | Discover eligible online devices; create `thuy<N>` ON and `thuy<N+1>` OFF; set baselines opposite; call `POST /api/devices/control` with `device_id=<scene_id>` | API returns `{status:true}`; request/response evidence printed in report | Automated |
| SCN-102 | P0 | Do not emit when scene activation value is false | Call scene activation control with value `false` | Target device state remains unchanged | Missing |
| SCN-103 | P1 | Scene can be triggered by scheduler/rule | Scheduler/rule emits `true` to scene input | Scene outputs fan out to configured targets | Pending: graph trigger API not yet captured |

## Negative And Failure Testcases

| ID | Priority | Scenario | Steps | Expected Result | Automation |
| --- | --- | --- | --- | --- | --- |
| SCN-201 | P0 | Get non-existing scene | `GET /api/v0/scenes/{fake_id}` | `404` or `success=false` according to service behavior | Automated |
| SCN-202 | P0 | Update non-existing scene | `POST /api/v0/scenes/{fake_id}` | `404` or validation error; service remains healthy | Automated |
| SCN-203 | P0 | Delete non-existing scene | `DELETE /api/v0/scenes/{fake_id}` | `404`, `data=0`, or documented no-op | Automated |
| SCN-204 | P1 | Create scene without name | `POST /api/v0/scenes` missing `name` | Validation error; no scene is created | Automated |
| SCN-205 | P1 | Create scene without binding | `POST /api/v0/scenes` with empty/missing binding | Validation error or scene with empty binding according to product decision | Automated after decision |
| SCN-206 | P1 | Invalid snapshot slot | Snapshot contains unsupported slot | Validation error or sync failure status is exposed | Automated after validation behavior is confirmed |
| SCN-207 | P1 | Device not on target HC | Binding points to device under another HC | Scene should not sync to HC `88:e6:28:f8:2e:4d` | Automated after safe foreign device is selected |

## Evidence Required In Automation

Each automated P0 create/update/delete test must print or assert these evidence points:

- Cloud scene ID, name, status, and all 3 bindings.
- Device discovery JSON: selected devices, online count, offline devices, skipped devices.
- HC runtime scene entry from `GET /api/scenes`.
- Device detail `scene` mapping from `GET /api/v0/devices/{device_id}` for all 3 target devices.
- Cleanup result for any scene created by the test.

## Current Limitation

The UI activation endpoint has been identified as `POST /api/devices/control`
with `device_id=<scene_id>`. The remaining open point is how to verify final
physical state from a stable read-state API after activation; current automated
evidence asserts the baseline control response and scene activation response.
