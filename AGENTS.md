# AGENTS.md

## Mục đích

Repository này là `bms-e2e-test`: bộ harness kiểm thử E2E/API cho hệ thống BMS.

BMS là hệ thống quản lý tòa nhà thông minh gồm Mobile/Web App, các microservice cloud và Home Controller ở edge. Test harness dùng Playwright/TypeScript để kiểm API, DB state, E2E flow, log/metrics và hành vi online/offline của HC.

Service chính:

* `bms-api`: auth, user, role, permission.
* `iot-console`: thiết bị, tầng, phòng, Home Controller.
* `iot-proxy-gateway`: nhận lệnh từ App và proxy xuống HC.
* `Home Controller`: edge node giao tiếp thiết bị vật lý.
* `automation-cloud`: rule, cảnh, lịch tự động.
* `iot-logging`: log điều khiển thiết bị.
* `metrics-device`: metrics/events thiết bị.
* `alert-manager-api`: cảnh báo từ log/metrics.

Hạ tầng test: `Postgres`, `Clickhouse`, `Redis`, `S3/MinIO`, `EMQX`, `Docker Compose`.

---

## Chính sách agent/role

Harness gồm các role chính:

* `Orchestrator`: sở hữu goal, scope, plan, handoff và bàn giao cuối.
* `Worker`: thực thi thay đổi trong scope đã duyệt.
* `Reviewer`: review diff, evidence, convention và test coverage.
* `Architecture Reviewer`: dùng khi task chạm API contract, DB, MQTT, auth, gateway, HC, log/metrics hoặc kiến trúc.

Quy tắc:

* Chỉ `Orchestrator` được setup goal, đổi scope, sửa policy harness.
* `Worker` không tự mở rộng scope, không tự sửa policy.
* `Reviewer` không setup goal, không sửa thay Worker.
* External tools chỉ hỗ trợ kiểm tra/tư vấn, không override spec hoặc active plan.

---

## Checklist bắt đầu task

Trước khi đánh giá, sửa hoặc bàn giao task harness, agent phải đọc:

* `AGENTS.md`
* `PROGRESS.md` nếu có
* `docs/agents/orchestrator.md` hoặc `orchestrator.md`
* `docs/agents/worker.md` hoặc `worker.md`
* `docs/agents/reviewer.md` hoặc `reviewer.md`
* `architecture.md`
* `guideline.md`
* `HARNESS.md`
* File code/test liên quan trong scope
* API reference nếu task chạm endpoint thật

Nếu `PROGRESS.md` tồn tại nhưng active goal stale hoặc không khớp scope hiện tại, dừng để Orchestrator cập nhật hoặc ghi blocker.

Bàn giao phải ghi:

* Role docs read.
* Source-of-truth đã đọc.
* Scope/risk tier.
* Verification đã chạy hoặc skip reason.
* Blocker/follow-up nếu có.

---

## Boundary repository

Repo tách rõ hai tầng:

```text
src/   = reusable definitions & tools
tests/ = executable test cases
```

Trong `src/` được đặt:

* API client.
* Type/schema/data factory.
* Fixture.
* DB helper.
* Utils/reporters.

Trong `tests/` được đặt:

* Base test fixture.
* `.spec.ts`.
* E2E flow orchestration.

Không được:

* Đặt test logic trong `src/`.
* Đặt API client/schema/type/data/fixture/db helper trong `tests/`.
* Dùng import relative sâu khi có thể dùng `@src`.

---

## Quy tắc cấu trúc code test

Service/resource module chuẩn:

```text
src/core/<service>/
├── index.ts
├── context.ts
└── <resource>/
    ├── index.ts
    ├── api.ts
    ├── type.ts
    ├── schema.ts
    ├── data.ts
    ├── fixtures.ts
    └── db.ts
```

Convention:

* Service folder: `kebab-case`, ví dụ `bms-api`, `home-controller`.
* Resource folder: `snake_case`, ví dụ `home_controller`, `device_group`.
* Spec file: `kebab-case.spec.ts`.
* Variable/function: `camelCase`.
* Class/type/interface: `PascalCase`.
* Env constant: `UPPER_SNAKE_CASE`.

API client:

* Raw method có hậu tố `API()`, ví dụ `createHomeControllerAPI()`.
* Wrapped method không có hậu tố, dùng trong fixture và assert success.
* Negative test dùng raw method để kiểm 4xx/5xx.

Fixture:

* Setup trước `await use()`.
* Cleanup sau `await use()`.
* Nếu tác động container/infrastructure, cleanup phải nằm trong `finally`.

---

## Quy tắc test

Mỗi test nên kiểm theo lớp:

```text
status -> not null -> schema -> business logic -> DB/side effect
```

CRUD/API test:

* Create: verify response, schema, field chính và DB state.
* Get: verify status, data, schema.
* Update: verify field thay đổi đúng.
* Delete: verify API result, get sau xóa hoặc soft-delete DB nếu có.

E2E flow:

```text
Setup -> Action -> Verify -> Cleanup
```

Side effect cần kiểm tùy flow:

* Postgres state.
* Clickhouse log/metrics.
* EMQX/MQTT event/status.
* HC online/offline.
* Automation rule/cảnh/lịch sync.
* WebSocket/state broadcast nếu flow yêu cầu.

Không chấp nhận test chỉ assert `status 200` nếu thiếu business/schema/side effect phù hợp.

---

## AICD cho harness

AICD dùng để quản trị cách agent thực thi task trong harness:

* **Atomicity**: chia task nhỏ, scope rõ, không bỏ dở.
* **Isolation**: chỉ sửa allowed paths, tránh giẫm file/shared state.
* **Consistency**: có verification predicate rõ trước khi bàn giao.
* **Durability**: ghi decision, evidence, blocker, next step vào `PROGRESS.md` hoặc bàn giao cuối.

AICD không thay thế product spec, API contract hoặc security invariant.

---

## Phân tầng rủi ro task

* **Tier 0**: Read-only, phân tích, review, không sửa file.
* **Tier 1**: Docs/config mẫu, không đổi behavior test/runtime.
* **Tier 2**: Thêm/sửa test, API client, fixture, DB helper, schema.
* **Tier 3**: Chạm auth, API contract, DB schema, MQTT/EMQX, gateway-HC proxy, Docker lifecycle, log/metrics pipeline, performance/reliability.

Nếu task thuộc nhiều tier, chọn tier cao nhất.

Tier 3 phải có Architecture Reviewer, trừ khi Orchestrator ghi rõ skip reason.

---

## Quy tắc tool

Search:

```bash
rg "<pattern>" <allowed-root>
```

Cấm:

```bash
find /home
grep -R /
rg "..." / --hidden
```

Nếu repo có `Makefile`, ưu tiên Makefile target. Nếu không có, dùng `package.json` scripts hoặc lệnh trong `guideline.md`.

Lệnh thường dùng:

```bash
docker compose up -d
docker compose ps
cp .env.template .env
npm test
npx playwright test <spec-file>
npx playwright show-report
npm run typecheck
npm run lint
```

Không chạy lệnh phá dữ liệu như `docker compose down -v`, reset migration, truncate DB nếu chưa được giao rõ.

---

## Agy policy

Nếu repo/handoff yêu cầu `agy`:

* Worker/Reviewer phải kiểm `command -v agy` và `tools/agy-probe.sh` nếu script tồn tại.
* Prompt phải scoped, có role, goal, allowed paths, forbidden actions, allowed commands, output format, line limit và stop condition.
* Không yêu cầu `agy` tự đọc toàn repo hoặc tự mở rộng scope.

Wrapper khuyến nghị:

```bash
AGY_CHECK_SECONDS=10 AGY_MAX_SECONDS=120 tools/agy-wait.sh \
  --model "Gemini 3.5 Flash (High)" \
  --print "<scoped prompt>"
```

Cấm dùng output timeout hoặc chu kỳ chờ 60s/120s làm evidence pass/fail.

Nếu `agy` lỗi/lệch scope, báo blocker:

* `unavailable`
* `agy probe failed`
* `agy wait failed`
* `out-of-scope response`
* `forbidden CLI pattern`

---

## Source-of-truth gate

Không tự suy đoán contract. Khi task chạm API/DB/MQTT/HC/log/metrics/automation, phải có source-of-truth:

* API reference chính thức.
* Existing client/test đang pass.
* Database/schema docs hoặc DB helper hiện có.
* MQTT topic/event docs hoặc flow example.
* Product/spec/handoff của Orchestrator.

Nếu thiếu, ghi:

```text
insufficient_context
```

và không triển khai bằng giả định.

Ưu tiên nguồn khi mâu thuẫn:

```text
1. Source code hiện tại
2. API reference chính thức
3. Existing tests đang pass
4. guideline.md
5. architecture.md
6. orchestrator.md / worker.md / reviewer.md
7. Suy luận của agent
```

Nếu phải suy luận, ghi rõ `Assumption`, `Risk`, `Need confirmation`.

---

## Luồng bàn giao theo role

1. **Orchestrator**

   * Đọc `orchestrator.md` và progress.
   * Setup goal, scope, risk tier, source-of-truth, plan, handoff.

2. **Worker**

   * Đọc `worker.md`.
   * Thực hiện đúng allowed paths.
   * Chạy verification.
   * Ghi evidence/blocker.

3. **Architecture Reviewer** nếu cần

   * Review kiến trúc/API/DB/MQTT/security/reliability.

4. **Reviewer**

   * Đọc `reviewer.md`.
   * Review diff/evidence/AICD.
   * Trả verdict: `PASS`, `NEEDS_CHANGES`, `BLOCKED`, `INSUFFICIENT_CONTEXT`.

5. **Orchestrator final handoff**

   * Tổng hợp file, command, evidence, blocker, gap/follow-up.

---

## Bàn giao cuối bắt buộc có

```markdown
## Final Handoff

### Summary

### Role docs read

### Scope / Risk tier

### Roles executed

### Architecture decision / skip reason

### Files changed

### Commands & result

### Evidence path

### PROGRESS.md status

### Checks skipped & reason

### Blocker / gap / follow-up
```

---

## Quy tắc cốt lõi

* Giữ đúng boundary `src/` và `tests/`.
* Không tự mở rộng scope.
* Không tự đoán API/DB/MQTT contract.
* Fixture phải cleanup dữ liệu.
* E2E/failure test phải cleanup infrastructure trong `finally`.
* Test phải có verification thật, không chỉ `status 200`.
* Evidence phải dựa trên command/log/report/diff rõ ràng.
* Không có source-of-truth thì báo blocker, không suy đoán.
