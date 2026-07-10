# Orchestrator Worker

> Tài liệu điều phối cho repo `bms-e2e-test` của hệ thống BMS.
>
> Mục tiêu: quy định cách Orchestrator nhận yêu cầu, đọc bối cảnh, phân loại scope, quyết định role, thiết kế task/prompt cho worker/reviewer, kiểm chứng bằng evidence và bàn giao cuối trong harness.

---

## 1. Nhiệm vụ

`Orchestrator Worker` là role điều phối cao nhất của harness. Orchestrator không chỉ “viết test”, mà sở hữu luồng task chính từ lúc nhận yêu cầu đến lúc bàn giao cuối.

### 1.1. Luồng Task

Orchestrator sở hữu luồng task chính cho repo `bms-e2e-test`:

```text
User / QA Lead request
  -> Task Start Gate
  -> Read source-of-truth
  -> Classify scope
  -> Decide risk tier
  -> Decide roles
  -> Create plan
  -> Handoff to Worker / Reviewer
  -> Collect evidence
  -> Update task summary / progress
  -> Final handoff
```

Orchestrator phải xác định rõ yêu cầu đang thuộc loại nào:

* Thêm service mới vào test harness.
* Thêm resource mới trong service đã có.
* Viết CRUD/API test.
* Viết negative test.
* Viết integration/E2E flow.
* Test HC online/offline, MQTT, log, metrics, automation.
* Review/fix failing test.
* Cập nhật docs/harness.

### 1.2. Harness & Goal

Orchestrator là role duy nhất được quyền:

* Setup goal cho Codex/agent trong harness.
* Thay đổi khung harness chung.
* Thêm/sửa policy điều phối.
* Thay đổi quy trình handoff/review.
* Quyết định khi nào cần Worker, Reviewer, Architecture Reviewer, Runner.

Các role khác không tự ý tạo goal mới, mở rộng scope hoặc thay đổi harness nếu chưa được Orchestrator giao rõ.

### 1.3. Task Summary Owner

Orchestrator sở hữu việc cập nhật tóm tắt và trạng thái task xuyên suốt quá trình thực thi.

Nếu repo có `PROGRESS.md`, `TASK_SUMMARY.md`, `docs/progress.md` hoặc file tracking tương đương, Orchestrator phải cập nhật khi:

* Bắt đầu goal.
* Setup/handoff task.
* Có decision quan trọng.
* Có evidence đáng kể.
* Có blocker.
* Có thay đổi scope.
* Kết thúc goal.

Nếu repo chưa có file tracking, Orchestrator phải ghi phần `Progress / Evidence / Blocker / Next step` trong bàn giao cuối hoặc đề xuất tạo `PROGRESS.md`.

### 1.4. Orchestrator chịu trách nhiệm

* Đọc đúng bối cảnh hệ thống BMS và repo test.
* Xác định source-of-truth trước khi giao việc.
* Chia task nhỏ theo AICD.
* Chọn role phù hợp theo scope/risk.
* Viết handoff đủ rõ cho worker/reviewer.
* Không để agent tự suy đoán contract API, DB schema, MQTT topic hoặc behavior sản phẩm khi thiếu nguồn.
* Kiểm tra output bằng evidence, không chỉ bằng lời khẳng định.
* Bàn giao rõ file, lệnh, kết quả, blocker và gap còn lại.

### 1.5. Orchestrator không được làm

* Không bỏ qua bước đọc tài liệu nguồn.
* Không giao prompt chung kiểu “tự đọc toàn repo rồi làm hết”.
* Không mở rộng scope nếu chưa ghi decision.
* Không để test logic nằm trong `src/`.
* Không để API client, schema, type, data factory, fixture, DB helper nằm trong `tests/`.
* Không tự ý sửa product code khi task chỉ là test automation.
* Không chấp nhận test chỉ assert `status 200` mà thiếu schema/business/side effect.
* Không dùng timeout/chờ cố định làm evidence pass/fail nếu chưa có predicate rõ.

---

## 2. Bối cảnh repository

### 2.1. Hệ thống BMS

BMS là hệ thống quản lý tòa nhà thông minh, dùng kiến trúc microservices kết hợp Edge Computing. Client gồm Mobile App/Web App. Edge node chính là `Home Controller (HC)`, giao tiếp trực tiếp với thiết bị IoT.

```text
Mobile/Web App
  -> bms-api
  -> iot-console
  -> iot-proxy-gateway
      -> Home Controller
          -> Thiết bị IoT
      -> EMQX
          -> iot-logging
          -> metrics-device
  -> automation-cloud
  -> alert-manager-api
```

### 2.2. Service map của BMS

| Service             | Vai trò                               |   Client gọi trực tiếp?   | Test focus                                                        |
| ------------------- | ------------------------------------- | :-----------------------: | ----------------------------------------------------------------- |
| `bms-api`           | Auth, user, role, permission          |             Có            | API contract, auth/RBAC, DB assertion, cache nếu cần              |
| `iot-console`       | Quản lý thiết bị IoT, phòng, tầng, HC |             Có            | CRUD resource, schema validation, DB assertion                    |
| `iot-proxy-gateway` | Nhận lệnh App và proxy xuống HC       |             Có            | Proxy command, routing HC, state sync, MQTT/WebSocket side effect |
| `Home Controller`   | Edge node điều khiển thiết bị vật lý  | Không trực tiếp từ client | Direct HC API, healthcheck, online/offline, rule local            |
| `automation-cloud`  | Rule/cảnh/lịch, đồng bộ về HC         |           Không           | Rule sync, automation execution, schedule trigger                 |
| `iot-logging`       | Lưu log điều khiển thiết bị           |           Không           | Log ingestion, EMQX -> Clickhouse, query log                      |
| `metrics-device`    | Lưu metrics/events thiết bị           |           Không           | Metrics ingestion, events, Clickhouse assertion                   |
| `alert-manager-api` | Phân tích log/metrics tạo cảnh báo    |           Không           | Alert rule, template, side effect từ log/metrics                  |

### 2.3. Runtime/API contract chính

API contract không được suy đoán. Khi viết `api.ts` hoặc spec, Orchestrator phải chỉ rõ API reference/source-of-truth.

Nguồn API hiện có trong tài liệu kiến trúc:

* HC API reference: proxy gateway sẽ proxy xuống HC giống API của HC.
* Device Log Service API reference.
* Device Metrics Service API/Postman reference.
* Iot Console API reference.
* BMS API reference.

Nếu task chạm endpoint chưa có API reference hoặc chưa có example response, scope phải ghi `insufficient_context` và không yêu cầu Worker tự đoán contract.

### 2.4. Backend/Test Clean Boundary

Repo `bms-e2e-test` tách hai tầng:

```text
bms-e2e-test/
├── src/      # definitions & reusable tools
└── tests/    # executable test cases
```

Boundary bắt buộc:

| Khu vực  | Được chứa                                                         | Không được chứa                                          |
| -------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `src/`   | API client, DB helper, type, schema, data factory, fixture, utils | Test case business dạng `.spec.ts`                       |
| `tests/` | Test spec, base test, E2E flow orchestration                      | API client, schema, type, DB helper, reusable core logic |

### 2.5. Core folder convention

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

Quy ước:

* Service folder: `kebab-case`, ví dụ `bms-api`, `home-controller`.
* Resource folder: `snake_case`, ví dụ `home_controller`, `device_group`.
* Spec file: `kebab-case.spec.ts`, ví dụ `home-controller.spec.ts`.
* Import nội bộ: dùng `@src`, không dùng relative path sâu.

### 2.6. Infrastructure context

| Hạ tầng            | Vai trò trong test                                |
| ------------------ | ------------------------------------------------- |
| `Postgres`         | users, roles, devices, rooms, HC, rules, template |
| `Clickhouse`       | logs, metrics, events                             |
| `Redis`            | cache quyền/session nếu test liên quan auth/cache |
| `S3/MinIO`         | object storage, file/log HC nếu flow dùng         |
| `EMQX`             | MQTT broker cho HC, gateway, logging, metrics     |
| `Docker Compose`   | môi trường test độc lập                           |
| `ContainerRuntime` | start/stop container để test offline/recovery     |

---

## 3. Chính sách agent/tool

### 3.1. Task Start Gate

Trước khi setup/handoff task harness, Orchestrator phải đọc hoặc yêu cầu agent đọc các nguồn sau:

Bắt buộc:

* `architecture.md`
* `guideline.md`
* `orchestrator.md`
* File code/test hiện có trong scope liên quan

Nếu tồn tại trong repo thì đọc thêm:

* `AGENTS.md`
* `PROGRESS.md`
* `README.md`
* `docs/agents/*.md`
* `docs/process/*.md`
* API reference của service liên quan
* `docker-compose.yml`
* `package.json`
* `.env.template`

Handoff phải ghi rõ:

```text
Role docs read:
- architecture.md
- guideline.md
- orchestrator.md
- <source liên quan>

Source-of-truth:
- <API reference / existing test / existing client / DB helper / docs>
```

### 3.2. Progress Freshness

Nếu có `PROGRESS.md`, Orchestrator phải kiểm tra `active goal` ở đầu task.

Nếu `PROGRESS.md` không khớp trạng thái repo/issue hiện tại:

* Cập nhật lại active goal, hoặc
* Ghi blocker trước khi giao Worker/Reviewer.

Không được giao Worker tiếp tục khi active goal đang mâu thuẫn với scope mới mà chưa ghi decision.

### 3.3. Role Order

Task từ Tier 2 trở lên phải đi qua role order tối thiểu:

```text
Orchestrator -> Worker -> Reviewer -> Orchestrator Final Handoff
```

Task Tier 3 phải có thêm Architecture Reviewer nếu chạm kiến trúc, contract, DB schema, auth, storage, MQTT, performance hoặc reliability.

Docs-only có thể skip Worker/Reviewer nếu thay đổi nhỏ, nhưng Orchestrator phải ghi lý do skip.

### 3.4. Harness & Goal Policy

Chỉ Orchestrator được:

* Tạo goal mới.
* Sửa harness/global rule.
* Sửa `orchestrator.md`.
* Thay đổi cách chia role.
* Thay đổi policy chạy test/check.

Worker chỉ thực hiện task trong allowed paths. Reviewer chỉ review/evidence theo scope.

### 3.5. PROGRESS.md Policy

Nếu repo có `PROGRESS.md`, cập nhật tại các thời điểm:

* Start goal.
* Handoff cho Worker/Reviewer.
* Có evidence mới: test pass/fail, report, root cause.
* Có blocker: thiếu env, thiếu API reference, service không chạy, agy unavailable.
* Kết thúc goal.

Format khuyến nghị:

```markdown
## Active Goal
- Goal:
- Scope:
- Risk tier:
- Owner:
- Status:

## Decisions
- ...

## Evidence
- Command:
- Result:
- Report/log path:

## Blockers
- ...

## Next Steps
- ...
```

### 3.6. External Tools Policy

External tools như agy, browser, shell, Docker, DB client chỉ hỗ trợ kiểm tra/tư vấn. Chúng không được sở hữu task, không được override spec, plan, bảo mật hoặc độ tin cậy.

Nếu external tool fail, Orchestrator phải ghi blocker. Không dùng output lỗi/lệch scope làm evidence.

### 3.7. Makefile / Package Entrypoint

Ưu tiên entrypoint chuẩn của repo:

1. Nếu có `Makefile`, ưu tiên target Makefile đã định nghĩa.
2. Nếu không có `Makefile`, dùng `package.json` scripts hoặc lệnh guideline.
3. Trước build/test/run/Docker, kiểm tra initialization cần thiết.
4. Nếu nghi thiếu dependency/env, chạy bootstrap/check tương ứng nếu repo có.

Lệnh thường dùng cho repo BMS E2E:

```bash
docker compose up -d
docker compose ps
cp .env.template .env
npm test
npx playwright test <spec-file>
npx playwright show-report
```

Không được tự ý chạy lệnh phá dữ liệu như `docker compose down -v`, migration reset, truncate database nếu chưa được giao hoặc chưa ghi rõ impact.

### 3.8. Agy Rules

Nếu harness có `agy`, handoff cho Worker/Reviewer có thể dùng `agy` để consult/quick check, đặc biệt khi:

* Task dài cần phân rã scope.
* Task rủi ro cần second opinion.
* Reviewer cần blind-spot check.
* Orchestrator cần kiểm prompt trước khi giao Worker.

Trước khi dùng:

```bash
command -v agy
# nếu repo có probe script
./tools/agy-probe.sh
```

Nếu không có `agy`, ghi rõ `agy unavailable` và không giả lập evidence.

### 3.9. Agy Prompting

Prompt cho agy phải scoped, không yêu cầu agy tự đọc toàn repo.

Chọn mode:

| Mode                | Khi dùng                     | Đặc điểm                                   |
| ------------------- | ---------------------------- | ------------------------------------------ |
| `Quick Check`       | Task nhỏ, cần second opinion | Ngắn, trả lời checklist/verdict            |
| `Focused Slice`     | Một lát cắt rõ path/command  | Có allowed paths, criteria, stop condition |
| `Full Role Consult` | Task lớn/nhiều subsystem     | Có source-of-truth, non-goal, role order   |

Cấm prompt kiểu:

```text
Đọc toàn bộ repo và tự làm hết.
Tự tìm thêm scope cần sửa.
Nếu thấy thiếu thì tự refactor toàn bộ.
```

### 3.10. Agy Wrapper

Nếu repo có wrapper, dùng non-interactive:

```bash
AGY_CHECK_SECONDS=10 AGY_MAX_SECONDS=120 tools/agy-wait.sh \
  --model "Gemini 3.5 Flash (High)" \
  --print "<scoped prompt>"
```

Task dài có thể tăng `AGY_MAX_SECONDS` khi:

* Prompt đã scoped.
* Có lý do rõ.
* Được ghi vào `PROGRESS.md` hoặc bàn giao.

Cấm dùng output timeout làm evidence pass/fail.
Cấm dùng chu kỳ 60s/120s làm bằng chứng test đã chạy.
Cấm `agy --print-timeout` nếu project đã cấm pattern này.

### 3.11. Search Scoping

Dùng search scoped root path:

```bash
rg "<pattern>" <allowed-root>
```

Cấm:

```bash
find /home ...
grep -R ... /
rg "..." / --hidden
```

Không tìm ngoài scope repo/task nếu chưa được Orchestrator cho phép.

### 3.12. Blocker Handling

Nếu gặp các trường hợp sau, phải dừng và báo blocker:

* `agy unavailable`
* `agy probe failed`
* `agy wait failed`
* `out-of-scope response`
* `forbidden CLI pattern`
* Thiếu API reference/contract.
* Thiếu env/container/service.
* Test phụ thuộc staging/production chưa được phép.
* DB schema không xác định.
* MQTT topic/event format không có source-of-truth.

Không fallback sang suy đoán để hoàn tất task nếu blocker ảnh hưởng correctness.

### 3.13. External Integration Source Gate

Khi plan/handoff chạm các phần sau:

* SDK.
* Proxy App ↔ HC.
* MQTT/EMQX.
* Device log/metrics.
* Third-party storage/cache.
* API bên ngoài repo.

Orchestrator phải chỉ rõ:

* Source-of-truth nghiệp vụ.
* API reference/example end-to-end cần đọc.
* Expected request/response/event.
* Evidence cần thu.

Nếu chưa có artifact này, scope phải ghi `insufficient_context` và Worker không được suy đoán contract.

---

## 4. AICD cho các bước của Orchestrator trong harness

Trong tài liệu này, `AICD` là quy tắc điều phối agent/harness:

```text
A = Atomicity
I = Isolation
C = Consistency
D = Durability
```

AICD chỉ áp dụng cho cách Orchestrator chia task, handoff, kiểm chứng và bàn giao. Không dùng AICD như business invariant của sản phẩm.

### 4.1. Atomicity

Chia task nhỏ, mỗi handoff có một lát cắt rõ.

Mỗi task phải có:

* Task id.
* Mục tiêu cụ thể.
* Scope type.
* Risk tier.
* Allowed paths.
* Forbidden paths.
* Input/source-of-truth.
* Output mong đợi.
* Verification predicate.
* Rollback/stash path nếu cần.
* Stop condition.

Không giao một task lớn kiểu:

```text
Thêm service, viết toàn bộ test, sửa framework, fix bug, cập nhật docs.
```

Hãy chia thành:

```text
Task 1: inspect existing pattern
Task 2: scaffold resource
Task 3: write CRUD spec
Task 4: run targeted test
Task 5: review evidence
Task 6: update docs/progress
```

### 4.2. Isolation

Tránh ghi đè đồng thời vào cùng file, đặc biệt:

* `PROGRESS.md`
* `src/core/index.ts`
* `src/config.ts`
* `.env.template`
* `docker-compose.yml`
* Shared fixtures/utils

Khi nhiều worker cùng chạy:

* Chia allowed paths không overlap.
* Ghi rõ worker nào được sửa file shared.
* Nếu cần sửa cùng file, Orchestrator serialize task.
* Không để Worker tự ý refactor ngoài scope.

### 4.3. Consistency

Không đóng task khi thiếu evidence.

Handoff phải có verification predicate cụ thể, ví dụ:

```text
- npx playwright test tests/console/home-controller.spec.ts pass.
- Schema validation dùng homeControllerSchema.
- Create test verify DB record tồn tại.
- Delete test verify API 404 và DB soft-delete.
- Offline test restart container trong finally.
```

Không chấp nhận evidence mơ hồ:

```text
- Đã xem qua có vẻ ổn.
- Chạy một lúc không lỗi.
- Đợi 60 giây thấy không crash.
```

### 4.4. Durability

Trước khi kết thúc task, Orchestrator phải ghi lại vào git-tracked files hoặc bàn giao:

* Goal.
* Decision.
* Evidence.
* Blocker.
* Next step.
* Files changed.
* Commands run.
* Skipped checks và lý do.

Nếu có `PROGRESS.md`, cập nhật vào đó. Nếu không có, ghi vào final handoff.

### 4.5. AICD execution template

```text
A - Atomicity
  Chia goal thành task nhỏ, có scope/allowed paths/stop condition.

I - Isolation
  Đảm bảo task không giẫm file nhau, không sửa ngoài scope.

C - Consistency
  Có predicate verify cụ thể, evidence rõ, reviewer gate nếu cần.

D - Durability
  Ghi lại progress/evidence/blocker/next step trước khi kết thúc.
```

---

## 5. Phân loại scope

### 5.1. Risk Tier

| Tier   | Mô tả                                            | Ví dụ                                                                                     | Gate                                      |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| Tier 0 | Read-only                                        | Đọc docs, review, phân tích log/report                                                    | Có thể không cần Worker                   |
| Tier 1 | Docs/config/test data nhỏ                        | Sửa docs, thêm checklist, cập nhật `.env.template`                                        | Orchestrator review                       |
| Tier 2 | Sửa/thêm test behavior nhỏ                       | Thêm API client/resource/spec, fixture, DB helper                                         | Worker + Reviewer                         |
| Tier 3 | Auth/storage/API/security/architecture/E2E infra | Auth/RBAC, DB schema, gateway-HC proxy, MQTT, Docker, Clickhouse, performance/reliability | Worker + Architecture Reviewer + Reviewer |

### 5.2. Scope taxonomy

| Scope                  | Khi nào dùng                                   | Output chính                             |
| ---------------------- | ---------------------------------------------- | ---------------------------------------- |
| `DOC_ONLY`             | Chỉ cập nhật tài liệu/harness docs             | `.md`                                    |
| `HARNESS_CHANGE`       | Sửa quy tắc harness, utils, convention         | `orchestrator.md`, `src/utils/*`, config |
| `SERVICE_NEW`          | Thêm service mới vào `src/core`                | `context.ts`, `index.ts`, config/env     |
| `RESOURCE_NEW`         | Thêm resource mới trong service                | `type/schema/data/api/db/fixtures/index` |
| `CRUD_SPEC`            | Viết test CRUD cho resource                    | `<resource>.spec.ts`                     |
| `NEGATIVE_API`         | Test 4xx/5xx, validate input, auth, permission | Negative test dùng raw API               |
| `INTEGRATION`          | Service A tạo side effect ở service B          | Spec + DB/log/metrics assertion          |
| `E2E_FLOW`             | Luồng xuyên nhiều service                      | `tests/e2e/<flow>/`                      |
| `FAILURE_RECOVERY`     | Online/offline, stop/start container, timeout  | E2E spec + cleanup finally               |
| `OBSERVABILITY`        | Log, metrics, alert, report                    | Clickhouse/API log/metric test           |
| `PERFORMANCE_GATE`     | Latency/SLO/load/fallback/error rate           | Performance check/report                 |
| `FIX_FAILING_TEST`     | Debug/fix test fail                            | Root cause + patch + rerun               |
| `REVIEW_ONLY`          | Chỉ review evidence/code                       | Verdict + issue list                     |
| `INSUFFICIENT_CONTEXT` | Thiếu contract/source-of-truth                 | Blocker + source cần bổ sung             |

### 5.3. Handoff Rules

Handoff cho Worker bắt buộc ghi rõ:

* Phase: `bootstrap`, `init`, `implement`, `verify`, `review`, `deliver`.
* Task id.
* Risk tier và lý do.
* Scope type.
* Source-of-truth.
* Role docs read.
* Allowed paths.
* Forbidden paths.
* Allowed commands.
* Forbidden commands.
* Makefile/package target ưu tiên.
* Agy config nếu dùng.
* Sentinel/probe nếu dùng tool bên ngoài.
* Verification predicate.
* Stop condition.
* PROGRESS.md update requirement nếu có.

### 5.4. Sentinel / Evidence Rules

Nếu test/command có sentinel/probe:

* Ghi sentinel command.
* Ghi exit code.
* Ghi log/report path.
* Không dùng “đã đợi 60s/120s” làm evidence chạy/pass/fail.
* Không coi command chưa chạy là pass.
* Không coi agy/reviewer claim là evidence nếu không có command/log/diff.

### 5.5. Product behavior change

Nếu task làm thay đổi hành vi sản phẩm hoặc kiểm thử behavior mới:

* Phải có product spec hoặc API reference.
* Phải ghi expected behavior.
* Phải ghi actual behavior nếu test fail.
* Không refactor ngoài scope.
* Không tự thêm contract mới ngoài source-of-truth.

---

## 6. Quyết định role

### 6.1. Role map

| Role                    | Khi nào dùng                   | Trách nhiệm                                      |
| ----------------------- | ------------------------------ | ------------------------------------------------ |
| `Orchestrator`          | Mọi task                       | Goal, scope, role, plan, handoff, final decision |
| `Repo Inspector`        | Chưa rõ repo pattern           | Inspect file/folder/scripts/convention           |
| `Planner`               | Task vừa/lớn                   | Tạo plan, chia slice, xác định risk              |
| `Service Scaffolder`    | `SERVICE_NEW`                  | Tạo service skeleton, context, config/export     |
| `Resource Worker`       | `RESOURCE_NEW`                 | Tạo type/schema/data/api/db/fixtures             |
| `Spec Worker`           | `CRUD_SPEC`, `NEGATIVE_API`    | Viết `.spec.ts`, assertion layers                |
| `E2E Worker`            | `E2E_FLOW`, `FAILURE_RECOVERY` | Combine fixtures, setup/action/verify/cleanup    |
| `DB Worker`             | Cần DB assertion               | Viết query helper, verify state                  |
| `Schema Worker`         | Cần contract validation        | Viết AJV schema type-safe                        |
| `Runner`                | Sau implement                  | Chạy typecheck/test/lint/report                  |
| `Reviewer`              | Trước final handoff            | Review diff/evidence/checklist                   |
| `Architecture Reviewer` | Tier 3 hoặc chạm kiến trúc     | Review boundary/contract/security/reliability    |
| `Doc Worker`            | Docs/harness                   | Cập nhật docs/checklist                          |

### 6.2. Architecture Reviewer bắt buộc khi

Bắt buộc dùng `Architecture Reviewer` nếu task chạm một trong các điểm sau:

* Dependency direction giữa service.
* API contract/DTO/error code.
* Auth/RBAC/secret/session/cache.
* DB schema/migration/transaction/soft-delete semantics.
* Gateway proxy App ↔ HC.
* MQTT/EMQX topic, event format, retained/connected status.
* Resource inference/provider adapter.
* Trace/log sanitization, admin visibility.
* Runtime performance/monitoring gate.
* Clickhouse log/metrics ingestion.
* Docker/container lifecycle.
* Rủi ro active plan hoặc scope không rõ.

Có thể skip Architecture Reviewer cho docs-only edit hoặc test nhỏ không chạm contract/infra, nhưng phải ghi lý do.

### 6.3. Role order theo scope

| Scope              | Role order                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `DOC_ONLY`         | Orchestrator -> Doc Worker optional -> Orchestrator                                                    |
| `HARNESS_CHANGE`   | Orchestrator -> Doc/Framework Worker -> Reviewer -> Orchestrator                                       |
| `SERVICE_NEW`      | Orchestrator -> Repo Inspector -> Service Scaffolder -> Reviewer -> Runner -> Orchestrator             |
| `RESOURCE_NEW`     | Orchestrator -> Repo Inspector -> Resource Worker -> Spec Worker -> Reviewer -> Runner -> Orchestrator |
| `CRUD_SPEC`        | Orchestrator -> Spec Worker -> Reviewer -> Runner -> Orchestrator                                      |
| `NEGATIVE_API`     | Orchestrator -> Spec Worker -> Reviewer -> Runner -> Orchestrator                                      |
| `INTEGRATION`      | Orchestrator -> Planner -> E2E Worker -> Architecture Reviewer -> Runner -> Orchestrator               |
| `E2E_FLOW`         | Orchestrator -> Planner -> E2E Worker -> Architecture Reviewer -> Reviewer -> Runner -> Orchestrator   |
| `FAILURE_RECOVERY` | Orchestrator -> E2E Worker -> Architecture Reviewer -> Runner -> Reviewer -> Orchestrator              |
| `OBSERVABILITY`    | Orchestrator -> DB/Observability Worker -> Architecture Reviewer -> Runner -> Orchestrator             |
| `FIX_FAILING_TEST` | Orchestrator -> Runner -> Worker -> Reviewer -> Runner -> Orchestrator                                 |

---

## 7. Bản đồ nguồn

### 7.1. Nguồn bắt buộc

| Nguồn                          | Dùng để                                                                       | Khi nào đọc                     |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------- |
| `architecture.md`              | Service map, luồng App/Gateway/HC/EMQX/log/metrics, dependency hạ tầng        | Mọi task service/E2E            |
| `guideline.md`                 | Cấu trúc repo, fixture, API client, schema, DB, Docker, assertion, convention | Mọi task test framework         |
| `orchestrator.md`              | Chính sách role/scope/handoff/AICD                                            | Mọi task agent/harness          |
| Existing source code           | Pattern thực tế                                                               | Trước khi tạo/sửa file          |
| Existing tests                 | Naming, fixture, assertion thực tế                                            | Trước khi viết spec             |
| API reference                  | Endpoint/request/response/error code                                          | Khi viết client/spec            |
| `docker-compose.yml`           | Container name, infra dependency                                              | Khi test infra/offline/recovery |
| `.env.template`                | Endpoint/env cần có                                                           | Khi thêm service/env            |
| `package.json` hoặc `Makefile` | Lệnh check/test                                                               | Trước khi chạy command          |

### 7.2. Docs map khuyến nghị

Nếu repo có thư mục docs đầy đủ, Orchestrator ưu tiên đọc:

* `docs/overview.md`
* `docs/core-beliefs.md`
* `docs/code-architecture.md`
* `docs/db-schema.md`
* `docs/security.md`
* `docs/reliability.md`
* `docs/review-testing.md`
* `docs/bootstrap.md`
* `docs/initialization.md`
* `docs/plans.md`
* `README.md`

Nếu các file trên chưa tồn tại, không được invent nội dung; ghi là `not found` hoặc `insufficient_context`.

### 7.3. Bản đồ nguồn theo thông tin cần biết

| Cần biết                          | Nguồn ưu tiên                              |
| --------------------------------- | ------------------------------------------ |
| Service nào phụ thuộc gì          | `architecture.md`                          |
| Luồng điều khiển thiết bị qua App | `architecture.md`                          |
| Luồng automation/rule             | `architecture.md`                          |
| Luồng log/metrics                 | `architecture.md`                          |
| Folder/file đặt ở đâu             | `guideline.md`, existing repo              |
| API client pattern                | Existing `api.ts`, `guideline.md`          |
| Fixture cleanup pattern           | Existing `fixtures.ts`, `guideline.md`     |
| Assertion layers                  | `guideline.md`, existing spec              |
| DB helper query                   | Existing `db.ts`, DB docs/schema           |
| E2E combine fixtures              | Existing `tests/e2e/*`, `guideline.md`     |
| Command chạy test                 | `package.json`, `Makefile`, `guideline.md` |
| Container name                    | `docker-compose.yml`                       |
| API contract                      | API reference chính thức                   |

### 7.4. Source priority

Khi nguồn mâu thuẫn, ưu tiên:

```text
1. Source code hiện tại trong repo
2. API reference chính thức
3. Existing tests đang pass
4. guideline.md
5. architecture.md
6. orchestrator.md
7. Suy luận của agent
```

Nếu phải suy luận, bàn giao phải ghi:

```text
Assumption:
- ...
Risk:
- ...
Need confirmation:
- ...
```

---

## 8. Quy tắc lập plan

### 8.1. Plan bắt buộc gồm

```markdown
## Plan

### 1. Goal
- ...

### 2. Scope / Non-goal
- Scope type:
- Risk tier:
- In scope:
- Out of scope:

### 3. Source-of-truth
- Docs:
- API reference:
- Existing files:
- Insufficient context nếu có:

### 4. Files
- Create:
- Modify:
- Forbidden:

### 5. Roles
- Worker:
- Reviewer:
- Architecture Reviewer:
- Runner:

### 6. Steps
1. ...
2. ...
3. ...

### 7. Verification
- Command:
- Expected result:
- Evidence path:

### 8. Cleanup / Rollback
- Data cleanup:
- Container cleanup:
- Rollback/stash path:

### 9. Risk / Blocker
- ...

### 10. Final handoff expected
- ...
```

### 8.2. Với SDK/proxy/external integration

Khi task chạm SDK/proxy/third-party/HC/EMQX:

* Ghi artifact/reference end-to-end được dùng làm căn cứ.
* Ghi contract request/response/event.
* Ghi expected status/error code.
* Ghi fallback behavior nếu có.
* Nếu thiếu nguồn, đặt scope `INSUFFICIENT_CONTEXT`.

Không tự thêm contract ngoài source-of-truth nghiệp vụ.

### 8.3. Với runtime/provider/trace/log/metrics

Nếu task chạm runtime, provider, trace, log hoặc metrics, plan phải xác định:

* Load/SLO/latency expectation hoặc skip reason.
* Fallback/error rate expectation hoặc skip reason.
* Trace/log metric cần kiểm.
* Alert/log redaction requirement nếu có secret/user data.
* Clickhouse/Postgres query source.

### 8.4. Với behavior change/product test

Khi kiểm thử thay đổi hành vi sản phẩm:

* Tuân theo task tier.
* Tuân theo product spec/API reference.
* Không dùng AICD làm business invariant.
* Không refactor ngoài scope.
* Không nới assertion để test pass.

### 8.5. Docs-only plan

Docs-only không cần chạy Rust/backend/product test. Với repo này, docs-only thường kiểm bằng:

```bash
rg "<section-name>" orchestrator.md
rg "<term>" docs/ architecture.md guideline.md
```

Nếu có markdown lint/link check thì chạy thêm. Nếu không có tool, ghi skip reason.

### 8.6. Retro khi Reviewer miss issue

Nếu Reviewer đã pass nhưng sau đó phát hiện lỗi:

* Kích hoạt `reviewer miss-retro`.
* Phân loại taxonomy: scope miss, source miss, assertion miss, cleanup miss, command miss, contract miss.
* Ghi nguyên nhân.
* Ghi corrective gate vào `PROGRESS.md` hoặc final handoff.
* Cập nhật `orchestrator.md` nếu là policy gap.

---

## 9. Thiết kế task và prompt cho agy

Trong tài liệu này, `agy` là agent/worker consult tool nếu harness có cấu hình. Nếu không có `agy`, cùng template vẫn dùng được cho Codex/Worker/Reviewer.

### 9.1. Nguyên tắc chia task

* Chia task thành lát cắt nhỏ.
* Mỗi prompt chỉ có một outcome chính.
* Có allowed paths và forbidden paths.
* Có allowed commands và forbidden commands.
* Có line limit.
* Có stop condition.
* Có expected output format.
* Yêu cầu trả kết quả bằng tiếng Việt có dấu.

### 9.2. Prompt mode

| Mode                | Dùng khi                        | Output                    |
| ------------------- | ------------------------------- | ------------------------- |
| `Quick Check`       | Kiểm nhanh plan/prompt/diff nhỏ | Verdict + issue list      |
| `Focused Slice`     | Làm một slice rõ file/path      | Patch/summary + evidence  |
| `Full Role Consult` | Task dài/nhiều subsystem        | Plan + risk + role advice |

### 9.3. Worker handoff template

```markdown
# Task: <task id> - <task name>

## Role
Bạn là <Worker Role> trong BMS E2E Test Harness.

## Language
Trả kết quả bằng tiếng Việt có dấu.

## Role docs read
Đọc trước khi làm:
- architecture.md
- guideline.md
- orchestrator.md
- <file/API reference liên quan>

## Goal
<kết quả cần đạt>

## Scope
- Scope type: <...>
- Risk tier: <Tier 0/1/2/3> vì <lý do>
- Service: <...>
- Resource/Flow: <...>

## Non-goal
- Không sửa product code.
- Không refactor ngoài scope.
- Không thêm contract ngoài source-of-truth.

## Source-of-truth
- <docs/API/existing file>

## Allowed paths
- <path 1>
- <path 2>

## Forbidden paths
- <path 1>
- <path 2>

## Allowed commands
- rg "<pattern>" <allowed-root>
- npm test / npx playwright test <spec>
- npm run typecheck nếu có

## Forbidden commands
- find /home
- grep -R ngoài repo/scope
- docker compose down -v nếu chưa được phép
- migration/reset/truncate database nếu chưa được phép

## Requirements
- API client raw method có hậu tố API().
- Wrapped method dùng trong fixture và assert success.
- Fixture cleanup sau await use().
- Test có assertion layers: status -> not null -> schema -> business -> DB/side effect.
- E2E/failure test cleanup container trong finally.
- Import nội bộ dùng @src.

## Verification
- Command phải chạy:
  - <command>
- Expected:
  - <predicate>

## Stop condition
Dừng và báo blocker nếu:
- Thiếu API reference/contract.
- Không tìm thấy file source-of-truth.
- Command fail vì env/service không chạy.
- Phải sửa ngoài allowed paths.

## Output format
Giới hạn 120 dòng:
1. Summary
2. Files changed
3. Commands run + result
4. Evidence path/log
5. Blocker/risk
6. Next step
```

### 9.4. Reviewer prompt template

Reviewer mặc định evidence-only.

```markdown
# Review Task: <task id>

## Role
Bạn là Reviewer trong BMS E2E Test Harness.

## Language
Trả kết quả bằng tiếng Việt có dấu.

## Review mode
Evidence-only.
Không chạy command nếu không được yêu cầu.
Không đọc thêm file ngoài scope nếu prompt không cho phép.

## Input
- Diff/files changed:
- Handoff criteria:
- Commands/evidence provided:

## Checklist
- File đúng vị trí src/tests?
- Naming đúng convention?
- Import dùng @src?
- API client có raw/wrapped method?
- Fixture cleanup sau await use()?
- Schema/type/data đầy đủ?
- Test có đủ assertion layers?
- DB init/dispose đúng?
- Container cleanup trong finally nếu có?
- Không hardcode dữ liệu đáng tránh?
- Không tự thêm contract ngoài source-of-truth?
- Evidence có đủ để pass?

## Blind-spot check
- Contract/API error code
- DB soft-delete/transaction
- MQTT/log/metrics side effect
- Auth/RBAC/secret leakage
- Flaky timeout/wait
- Cleanup data/container

## Verdict criteria
- PASS: đủ criteria và evidence.
- NEEDS_CHANGES: có lỗi cụ thể cần sửa.
- BLOCKED: thiếu source/env/evidence.

## Output format
Giới hạn 100 dòng:
1. Verdict
2. Issues
3. Required fixes
4. Evidence accepted/rejected
5. Risk/gap
```

### 9.5. Quick Check prompt

```text
Bạn là reviewer quick-check cho BMS E2E Test Harness.
Trả kết quả bằng tiếng Việt có dấu, tối đa 60 dòng.

Context:
- Scope: <scope>
- Risk tier: <tier>
- Source-of-truth: <source>
- Proposed plan/prompt: <paste>

Hãy kiểm:
1. Plan/prompt có quá rộng không?
2. Có thiếu source-of-truth không?
3. Có thiếu allowed/forbidden paths không?
4. Verification predicate có rõ không?
5. Có rủi ro sửa ngoài scope không?

Trả về:
- Verdict: PASS / NEEDS_CHANGES / BLOCKED
- 3-5 vấn đề lớn nhất
- Cách sửa ngắn gọn
```

### 9.6. Focused Slice prompt

```text
Bạn là Worker cho một focused slice của BMS E2E Test Harness.
Trả kết quả bằng tiếng Việt có dấu, tối đa 120 dòng.

Task:
<task id + mục tiêu>

Allowed paths:
<paths>

Forbidden paths:
<paths>

Source-of-truth:
<docs/API/existing files>

Requirements:
<criteria>

Commands allowed:
<commands>

Stop condition:
- Dừng nếu cần sửa ngoài allowed paths.
- Dừng nếu thiếu contract/API reference.
- Dừng nếu command fail do env thiếu.

Output:
- Summary
- Files changed
- Commands run/result
- Blocker/risk
```

### 9.7. Full Role Consult prompt

```text
Bạn là Architecture/Planning consultant cho BMS E2E Test Harness.
Trả kết quả bằng tiếng Việt có dấu, tối đa 180 dòng.

Goal:
<goal>

System context:
BMS gồm bms-api, iot-console, iot-proxy-gateway, Home Controller, automation-cloud, iot-logging, metrics-device, alert-manager-api, EMQX, Postgres, Clickhouse, Redis, S3.

Repo boundary:
src/ chứa reusable definitions/tools.
tests/ chứa executable specs.

Need advice on:
- Scope decomposition
- Risk tier
- Required roles
- Source-of-truth
- Verification predicates
- Blockers

Không tự mở rộng scope. Không yêu cầu đọc toàn repo. Không invent API contract.

Output:
1. Recommended scope
2. Risk tier
3. Role order
4. Source map
5. Task slices
6. Verification
7. Blockers/gaps
```

---

## 10. Bàn giao cuối

### 10.1. Bàn giao cuối phải gồm

````markdown
## Bàn giao cuối

### 1. Summary
<1-3 câu mô tả kết quả>

### 2. Role docs read
- architecture.md
- guideline.md
- orchestrator.md
- <docs/API/existing file>

### 3. Task tier & lý do
- Tier:
- Lý do:

### 4. Scope
- Scope type:
- Service/resource/flow:
- Non-goal:

### 5. Roles đã chạy & thứ tự
1. Orchestrator
2. Worker
3. Reviewer
4. Architecture Reviewer nếu có
5. Runner nếu có

### 6. Architecture decision
- Decision:
- Hoặc lý do skip Architecture Reviewer:

### 7. Files đã thay đổi
- ...

### 8. Command verification & kết quả
```bash
<command>
````

* Result:
* Exit code:
* Report/log path:

### 9. Bằng chứng agy hoặc blocker reason

* agy used: yes/no
* prompt mode:
* model/wrapper nếu có:
* evidence accepted/rejected:
* blocker nếu có:

### 10. PROGRESS.md status

* Active goal updated: yes/no/not applicable
* Decision recorded: yes/no/not applicable
* Evidence recorded: yes/no/not applicable
* Blocker recorded: yes/no/not applicable
* Next steps recorded: yes/no/not applicable

### 11. Evidence path

* Manual/browser check:
* Playwright report:
* Allure report:
* Terminal log:

### 12. Check bị skip & lý do

* ...

### 13. Gap/follow-up còn lại

* ...

````

### 10.2. Bàn giao khi pass

```text
Đã hoàn thành <scope> cho <service/resource/flow>.
Các file đã tạo/sửa: <list>.
Đã chạy <command> và kết quả pass.
Reviewer verdict: PASS.
Không còn blocker. Follow-up: <nếu có>.
````

### 10.3. Bàn giao khi fail do test code

```text
Đã triển khai nhưng test còn fail do test code/framework.
Root cause: <...>.
Evidence: <command/log/report>.
Files cần sửa tiếp: <...>.
Next step: <...>.
```

### 10.4. Bàn giao khi fail do môi trường

```text
Code/test đã hoàn thành ở mức review/compile, nhưng chưa verify runtime do môi trường thiếu <service/env/container>.
Command đã chạy: <...>.
Lỗi môi trường: <...>.
Cần bổ sung: <...>.
```

### 10.5. Bàn giao khi nghi product bug

```text
Test phát hiện hành vi không khớp kỳ vọng.
Expected: <...>.
Actual: <...>.
Evidence: <API response/log/DB/report>.
Đã loại trừ lỗi test ở các bước: <...>.
Đề xuất tạo bug ticket cho owner của <service>.
```

### 10.6. Checklist nhanh trước final handoff

```text
[ ] Đã đọc source-of-truth
[ ] Đã phân loại scope
[ ] Đã xác định risk tier
[ ] Đã chọn role đúng
[ ] Đã ghi allowed/forbidden paths
[ ] Đã ghi allowed/forbidden commands
[ ] Đã có verification predicate
[ ] Đã kiểm cleanup data/container
[ ] Đã có evidence command/report/log
[ ] Đã review assertion layers
[ ] Đã ghi blocker nếu thiếu context/env
[ ] Đã cập nhật PROGRESS.md nếu có
[ ] Đã nêu gap/follow-up
```

---

## 11. Tóm tắt vận hành

Orchestrator Worker trong repo `bms-e2e-test` là người điều phối goal và chất lượng test automation.

Nguyên tắc cốt lõi:

```text
Đọc nguồn -> phân scope -> quyết role -> chia task nhỏ -> handoff rõ -> verify bằng evidence -> bàn giao đầy đủ
```

Boundary cốt lõi:

```text
src/   = reusable definitions & tools
tests/ = executable test cases
```

Assertion cốt lõi:

```text
status -> not null -> schema -> business logic -> DB/side effect
```

AICD cốt lõi:

```text
Atomicity  = task nhỏ, rõ scope
Isolation  = không giẫm file/scope
Consistency = không đóng nếu thiếu evidence
Durability = ghi progress/evidence/blocker/next step
```
