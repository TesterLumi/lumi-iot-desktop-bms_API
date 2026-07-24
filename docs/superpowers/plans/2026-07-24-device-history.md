# Device History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-HC E2E suite for device history logs with fresh evidence and HC log capture on failure.

**Architecture:** Create a standalone `tests/e2e/device-history` suite based on the existing `area-control` evidence pattern. The suite uses Playwright API contexts for device logs, device discovery, real control, and status polling, with runtime cases gated by `DEVICE_HISTORY_ALLOW_DEVICE_CONTROL=true`.

**Tech Stack:** Playwright Test, TypeScript, `ssh2`, existing `@src/config` and `@src/utils`.

---

### Task 1: Add Device History Suite

**Files:**

- Create: `tests/e2e/device-history/device-history.api.spec.ts`

- [x] **Step 1: Define env, evidence model, API client, log extraction helpers, SSH log capture, and four testcases.**

The spec file contains all suite logic to match the current repository pattern used by `area-control`.

- [x] **Step 2: Run TypeScript typecheck.**

Run: `npx.cmd tsc --noEmit`

Expected: PASS.

### Task 2: Add Suite README

**Files:**

- Create: `tests/e2e/device-history/README.md`

- [x] **Step 1: Document env, run commands, and evidence location.**

The README explains endpoint defaults, runtime gate, and evidence output.

- [x] **Step 2: List Playwright tests.**

Run: `npx.cmd playwright test tests/e2e/device-history/device-history.api.spec.ts --config=playwright.config.ts --list`

Expected: four tests are listed.

### Self-Review

Spec coverage: TC1-TC4, real HC control, latest evidence reset, and HC log-on-failure are covered.

Placeholder scan: no placeholders remain.

Type consistency: evidence, env, and helper names are local to the suite and consistently referenced.
