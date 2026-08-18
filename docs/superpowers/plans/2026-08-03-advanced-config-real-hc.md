# Advanced Config Real HC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact Playwright E2E suite for advanced device config against a real BMS system, real Home Controller, and real devices.

**Architecture:** Add one focused feature folder under `tests/e2e/advanced-config-real-hc` with a support helper and a data-driven spec. The helper owns API calls, evidence, polling, restore, and HC SSH failure logs; the spec owns testcase matrix and business assertions.

**Tech Stack:** Playwright Test, TypeScript, Node fs/path, ssh2, existing `@src/config` and `@src/utils` helpers.

---

### Task 1: Environment And Docs

**Files:**

- Modify: `src/config.ts`
- Modify: `.env.template`
- Create: `tests/e2e/advanced-config-real-hc/README.md`

- [ ] **Step 1: Add advanced config env constants**

Add constants for base URL, HC id, MSB/presence/target/group ids, run dir, polling, and write guard.

- [ ] **Step 2: Add `.env.template` entries**

Add a clear section for `ADVANCED_CONFIG_*` values and reuse existing `HC_SSH_*`.

- [ ] **Step 3: Add README**

Document scope, env, run commands, evidence path, and safety guard.

### Task 2: Support Helper

**Files:**

- Create: `tests/e2e/advanced-config-real-hc/advanced-config-real-hc.support.ts`

- [ ] **Step 1: Build evidence model**

Create `AdvancedConfigEvidence` with testcase metadata, steps, assertions, cleanup, and HC logs. Evidence saves to `test-runs/advanced-config-real-hc-current/evidence/api` and attaches JSON to Playwright.

- [ ] **Step 2: Build API client**

Create `AdvancedConfigApiClient` wrapping Playwright `APIRequestContext` for:

- `GET /api/devices`
- `GET /api/devices/{id}/config`
- `GET /api/devices/{id}`
- `POST /api/devices/config`
- `POST /api/devices/cmd`

- [ ] **Step 3: Add polling and restore helpers**

Poll config until requested key/value is visible or 30s expires. Capture original config keys and restore them in `finally`.

- [ ] **Step 4: Add HC log capture**

On failure, SSH to HC and filter `HC_LOG_PATH` by testcase start/end window using Asia/Bangkok timestamps.

### Task 3: Testcase Spec

**Files:**

- Create: `tests/e2e/advanced-config-real-hc/advanced-config-real-hc.spec.ts`

- [ ] **Step 1: Add serial suite precheck**

Reset evidence once per `ADVANCED_CONFIG_RUN_ID`, create API client, and verify required env per testcase group.

- [ ] **Step 2: Add MSB scene and relay cases**

Add cases for `autolock_schedule`, `event[press_1_time]`, `group_all`, `state_default`, `touch_mode`, `event[on]`, `event[off]`, `clear_time`, `clear_power`, and negative config/cmd misuse.

- [ ] **Step 3: Add presence cases**

Add cases for `presence_mode`, `pir_time`, `distance`, `environment_volatile`, `link_state`, `lux_threshold`, `schedule`, `event[active]`, `event[inactive]`, `auto_calib`, and preset sequence.

- [ ] **Step 4: Guard physical mutations**

Run write cases only when `ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL=true`. Read/precheck cases can run without the guard.

### Task 4: Verification

**Files:**

- Test: all new/modified files

- [ ] **Step 1: Run typecheck**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: List tests**

Run:

```powershell
npx.cmd playwright test tests/e2e/advanced-config-real-hc/advanced-config-real-hc.spec.ts --config=playwright.config.ts --list
```

Expected: all advanced config testcases are listed.

- [ ] **Step 3: Runtime command for real environment**

Run when real env and device ids are configured:

```powershell
$env:ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL='true'
$env:ADVANCED_CONFIG_RUN_ID=(Get-Date).ToString('yyyyMMddHHmmss')
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/advanced-config-real-hc-current/html-report'
npx.cmd playwright test tests/e2e/advanced-config-real-hc/advanced-config-real-hc.spec.ts --config=playwright.config.ts --reporter=html,line --workers=1 --output=test-runs/advanced-config-real-hc-current/test-results
```

Expected: every executed testcase writes evidence; failed cases include HC log or skipped reason.

### Self-Review

- Spec coverage: covers MSB scene switch, MSB relay switch, presence sensor, commands, negative misuse, evidence, cleanup, and HC logs.
- Placeholder scan: no placeholder task remains.
- Type consistency: env, helper, and spec names use `AdvancedConfig*` consistently.
