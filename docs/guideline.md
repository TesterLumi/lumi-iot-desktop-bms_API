# BMS E2E Test — Guideline Triển Khai

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Tổ chức thư mục](#2-tổ-chức-thư-mục)
3. [Khởi động Infrastructure với Docker Compose](#3-khởi-động-infrastructure-với-docker-compose)
4. [Các khái niệm và tool cốt lõi](#4-các-khái-niệm-và-tool-cốt-lõi)
5. [Hướng dẫn thêm service mới vào `src/`](#5-hướng-dẫn-thêm-service-mới-vào-src)
6. [Hướng dẫn viết test case trong `tests/`](#6-hướng-dẫn-viết-test-case-trong-tests)
7. [Hướng dẫn viết E2E test đa service](#7-hướng-dẫn-viết-e2e-test-đa-service)
8. [Chạy test và xem báo cáo](#8-chạy-test-và-xem-báo-cáo)
9. [Code Conventions](#9-code-conventions)
10. [Checklist triển khai nhanh](#10-checklist-triển-khai-nhanh)

---

## 1. Tổng quan kiến trúc

Dự án được tổ chức theo hai tầng tách biệt:

```text
bms-e2e-test/
├── src/      ← Definitions & Tools: client, type, schema, fixture
└── tests/    ← Test Cases: các test suite thực thi
```

### Luồng dữ liệu

```text
Test Spec (.spec.ts)
    │  sử dụng fixture
    ▼
Fixture (fixtures.ts)
    │  khởi tạo client
    ▼
API Client (api.ts)          DB Client (db.ts)
    │  gọi HTTP                   │  query SQL
    ▼                             ▼
Service (microservice)       PostgreSQL Database
```

### Nguyên tắc thiết kế

- **`src/`** không chứa logic test, chỉ chứa công cụ và định nghĩa tái sử dụng
- **`tests/`** chứa các test spec; mỗi `.spec.ts` là một nhóm test case cho một resource/flow
- Mỗi service trong hệ thống có một folder riêng trong `src/core/`
- Fixtures tự động setup và cleanup dữ liệu, test case không cần quản lý lifecycle

---

## 2. Tổ chức thư mục

### Cấu trúc đầy đủ

```text
bms-e2e-test/
├── src/
│   ├── config.ts                      # Biến môi trường toàn cục
│   ├── index.ts                       # Re-export tất cả public API
│   ├── core/
│   │   ├── index.ts
│   │   ├── console/                   # Service: iot-console
│   │   │   ├── index.ts
│   │   │   ├── context.ts             # APIRequestContext cho console
│   │   │   ├── response.ts            # Shared response wrapper types
│   │   │   └── home_controller/       # Resource: Home Controller
│   │   │       ├── index.ts
│   │   │       ├── api.ts             # HTTP client methods
│   │   │       ├── type.ts            # TypeScript types/interfaces
│   │   │       ├── schema.ts          # AJV JSON Schema validation
│   │   │       ├── data.ts            # Faker test data factories
│   │   │       ├── fixtures.ts        # Playwright fixtures
│   │   │       └── db.ts              # Database query helpers
│   │   └── home-controller/           # Service: IoT HC edge device
│   │       ├── index.ts
│   │       ├── api.ts
│   │       ├── context.ts
│   │       ├── data.ts
│   │       └── fixtures.ts
│   └── utils/
│       ├── index.ts
│       ├── assertions.ts              # Custom assertion wrappers
│       ├── fixtures.ts                # combineFixtures helper
│       ├── time.ts                    # Hằng số thời gian & delay()
│       ├── clients/
│       │   ├── api.ts                 # APIClient interface
│       │   ├── pg.ts                  # PostgreSQL singleton
│       │   └── container.ts           # Docker container runtime
│       ├── schema/
│       │   └── index.ts               # validateSchema() utility
│       └── reporters/
│           ├── allure.ts
│           └── global_teardown.ts
├── tests/
│   ├── console/                       # Tests cho Console service
│   │   ├── console-test.ts            # Base test fixture
│   │   └── home-controller.spec.ts
│   └── e2e/
│       └── hc-online/                 # E2E flow: HC online/offline
│           ├── hc-online-test.ts
│           └── hc-online.spec.ts
├── docs/
├── docker-compose.yml                 # Infrastructure services
├── playwright.config.ts
├── tsconfig.json
└── .env.template
```

### Quy tắc đặt tên

| Loại             | Quy tắc            | Ví dụ                                       |
| ---------------- | ------------------ | ------------------------------------------- |
| Thư mục service  | `kebab-case`       | `home-controller/`, `bms-api/`              |
| Thư mục resource | `snake_case`       | `home_controller/`, `device_group/`         |
| File TypeScript  | `kebab-case.ts`    | `api.ts`, `home-controller.spec.ts`         |
| Biến / function  | `camelCase`        | `createHomeController`, `homeControllerDb`  |
| Class / Type     | `PascalCase`       | `HomeControllerApiClient`, `HomeController` |
| Hằng số env      | `UPPER_SNAKE_CASE` | `IOT_CONSOLE_ENDPOINT`                      |

---

## 3. Khởi động Infrastructure với Docker Compose

Để test chạy độc lập (không phụ thuộc staging/production), dùng `docker-compose.yml` để spin up toàn bộ infrastructure.

### Các service trong docker-compose

| Service    | Image            | Mục đích                       |
| ---------- | ---------------- | ------------------------------ |
| `postgres` | `postgres:16.6`  | Database chính của BMS         |
| `redis`    | `redis:7-alpine` | Cache / session store          |
| `minio`    | `minio/minio`    | Object storage (S3-compatible) |

### Workflow chuẩn

```bash
# 1. Khởi động infrastructure
docker compose up -d

# 2. Kiểm tra trạng thái
docker compose ps

# 3. Cấu hình environment
cp .env.template .env
# Chỉnh sửa .env với endpoint và credentials

# 4. Chạy tests
npm test

# 5. Dọn dẹp
docker compose down -v
```

### Cấu hình `.env`

```env
IOT_CONSOLE_ENDPOINT=http://localhost:3000
IOT_HC_ENDPOINT=http://localhost:8080
IOT_METRICS_ENDPOINT=http://localhost:9000
IOT_LOG_ENDPOINT=http://localhost:9001
BMS_API_ENDPOINT=http://localhost:4000
BMS_ALERT_MANAGER_ENDPOINT=http://localhost:4001
POSTGRES_URI=postgresql://postgres:password@localhost:5432/bms_db
```

### ContainerRuntime trong test

Khi test cần kiểm soát vòng đời container (ví dụ: test offline):

```typescript
import { ContainerRuntime, delay } from '@src/utils'

// Dừng container
await ContainerRuntime.getInstance().stopContainer('bms-home-controller-1')
await delay(500) // Chờ container tắt hoàn toàn

// Khởi động lại
await ContainerRuntime.getInstance().startContainer('bms-home-controller-1')
```

> **Lưu ý:** Tên container phải khớp với tên định nghĩa trong `docker-compose.yml`.

---

## 4. Các khái niệm và tool cốt lõi

### 4.1 APIClient Interface

Tất cả HTTP client đều implement interface `APIClient`:

```typescript
// src/utils/clients/api.ts
interface APIClient {
  context: APIRequestContext
}
```

**Quy ước đặt tên method:**

- Hậu tố `API()` → raw call, trả về `APIResponse` (không có assertion) — dùng để test lỗi 4xx/5xx
- Không có hậu tố → wrapped call, có assertion, trả về typed data — dùng trong fixture

```typescript
// Raw: dùng khi cần kiểm tra status code lỗi
const response = await client.createHomeControllerAPI(data)

// Wrapped: dùng trong fixture, tự assert status 200
const hc = await client.createHomeController(data)
```

### 4.2 Fixture Pattern

Fixtures là cơ chế Playwright để share setup/teardown giữa các test. Dùng `yield` pattern:

```typescript
// src/core/console/home_controller/fixtures.ts
export const homeControllerFixture: Fixtures<HomeControllerFixture> = {
  // Fixture API client — không cần cleanup
  homeControllerClient: async ({}, use) => {
    const context = await getApiDefaultContext()
    await use(new HomeControllerApiClient(context))
  },

  // Fixture pre-created entity — tự động tạo trước test, xóa sau test
  homeController: async ({ homeControllerClient }, use) => {
    const hc = await homeControllerClient.createHomeController(
      createHomeControllerData(),
    )
    await use(hc) // ← cung cấp cho test
    await homeControllerClient.deleteHomeControllerAPI(hc.id) // ← cleanup
  },

  // Fixture DB client
  homeControllerDb: async ({}, use) => {
    const db = new HomeControllerDb(PostgresClient.getInstance())
    await use(db)
  },
}
```

**Kết hợp nhiều fixture** với `combineFixtures()`:

```typescript
// tests/e2e/hc-online/hc-online-test.ts
export const hcOnlineE2eTest = base.extend<
  HomeControllerFixture,
  IotHomeControllerFixture
>(combineFixtures(homeControllerFixture, iotHomeControllerFixture))
```

### 4.3 Singleton Clients

**PostgreSQL Client:**

```typescript
import { PostgresClient } from '@src/utils'

// Trong beforeAll
await PostgresClient.getInstance().init()

// Trong test
const result = await PostgresClient.getInstance().executeQuery(
  'SELECT * FROM home_controllers WHERE id = $1',
  [id],
)

// Trong afterAll
await PostgresClient.getInstance().dispose()
```

**ContainerRuntime:**

```typescript
import { ContainerRuntime } from '@src/utils'

await ContainerRuntime.getInstance().startContainer('container-name')
await ContainerRuntime.getInstance().stopContainer('container-name')
```

### 4.4 JSON Schema Validation (AJV)

Schema được định nghĩa co-located với type trong `schema.ts`. Dùng `JSONSchemaType` của AJV để đảm bảo type-safe:

```typescript
// src/core/console/home_controller/schema.ts
import { JSONSchemaType } from 'ajv'
import { HomeController } from './type'

export const homeControllerSchema: JSONSchemaType<HomeController> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    id: { type: 'string' },
    mac: { type: 'string' },
    name: { type: 'string', nullable: true },
    // ...
  },
  required: ['id', 'mac'],
}
```

**Sử dụng trong test:**

```typescript
import { validateSchema } from '@src/utils'
import { homeControllerSchema } from '@src/core'

await validateSchema({ schema: homeControllerSchema, json: response.data })
```

Nếu validation thất bại, `validateSchema()` throw lỗi kèm JSON diff chi tiết.

### 4.5 Test Data Generation (Faker.js)

Mỗi resource có các factory function trong `data.ts`:

```typescript
// src/core/console/home_controller/data.ts
import { faker } from '@faker-js/faker'

export const createHomeControllerData = (): HomeControllerCreateRequest => ({
  mac: faker.internet.mac(),
  name: faker.word.words(3),
  ip: faker.internet.ipv4({ cidrBlock: '10.8.0.0/8' }),
})

export const updateHomeControllerData = () => ({
  name: faker.word.words(3),
  notes: faker.lorem.sentence({ min: 2, max: 6 }),
})
```

**Quy tắc:**

- `create<Resource>Data()` → data cho POST request
- `update<Resource>Data()` → data cho PATCH/PUT request
- Luôn dùng Faker, không hardcode giá trị cố định

### 4.6 Custom Assertions

Tất cả assertions wrap trong `test.step()` để hiển thị rõ ràng trong report:

```typescript
import { expectStatusCode, expectNotNull, expectToEqual } from '@src/utils'

// Kiểm tra HTTP status code
await expectStatusCode({
  actual: response.status(),
  expected: 200,
  api: response.url(),
})

// Kiểm tra giá trị không null/undefined
await expectNotNull({
  actual: json.data,
  description: 'HomeController data should not be null',
})

// Kiểm tra giá trị bằng nhau
await expectToEqual({
  actual: json.data.mac,
  expected: payload.mac,
  description: 'MAC address phải khớp với request payload',
})
```

### 4.7 Time Utilities

```typescript
import { SEC, MIN, HOUR, delay } from '@src/utils'

// Hằng số (milliseconds)
// SEC = 1000, MIN = 60_000, HOUR = 3_600_000

await delay(500) // 500ms
await delay(2 * SEC) // 2 giây
await delay(1 * MIN) // 1 phút
```

---

## 5. Hướng dẫn thêm service mới vào `src/`

Ví dụ: thêm service `bms-api` với resource `device-group`.

### Bước 1 — Tạo cấu trúc folder

```text
src/core/bms-api/
├── index.ts
├── context.ts
└── device_group/
    ├── index.ts
    ├── api.ts
    ├── type.ts
    ├── schema.ts
    ├── data.ts
    ├── fixtures.ts
    └── db.ts
```

### Bước 2 — Định nghĩa Types (`type.ts`)

```typescript
// src/core/bms-api/device_group/type.ts

export type DeviceGroup = {
  id: string
  name: string
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  deleted_at?: string | null
}

export type DeviceGroupCreateRequest = {
  name: string
  description?: string | null
}

export type DeviceGroupUpdateRequest = {
  name?: string | null
  description?: string | null
}
```

### Bước 3 — Định nghĩa JSON Schema (`schema.ts`)

```typescript
// src/core/bms-api/device_group/schema.ts
import { JSONSchemaType } from 'ajv'
import { DeviceGroup } from './type'

export const deviceGroupSchema: JSONSchemaType<DeviceGroup> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    created_at: { type: 'string', nullable: true },
    updated_at: { type: 'string', nullable: true },
    deleted_at: { type: 'string', nullable: true },
  },
  required: ['id', 'name'],
}
```

### Bước 4 — Tạo Test Data Factory (`data.ts`)

```typescript
// src/core/bms-api/device_group/data.ts
import { faker } from '@faker-js/faker'
import { DeviceGroupCreateRequest, DeviceGroupUpdateRequest } from './type'

export const createDeviceGroupData = (): DeviceGroupCreateRequest => ({
  name: faker.word.words(2),
  description: faker.lorem.sentence(),
})

export const updateDeviceGroupData = (): DeviceGroupUpdateRequest => ({
  name: faker.word.words(2),
  description: faker.lorem.sentence(),
})
```

### Bước 5 — Implement API Client (`api.ts`)

```typescript
// src/core/bms-api/device_group/api.ts
import test, { APIRequestContext, APIResponse } from '@playwright/test'
import { APIClient, expectNotNull, expectStatusCode } from '@src/utils'
import { DeviceGroup, DeviceGroupCreateRequest } from './type'

const ROUTE = '/api/v1/device-groups'

export class DeviceGroupApiClient implements APIClient {
  constructor(public context: APIRequestContext) {}

  async createDeviceGroupAPI(
    data: DeviceGroupCreateRequest,
  ): Promise<APIResponse> {
    return await test.step('Creating device group', async () => {
      return await this.context.post(ROUTE, { data })
    })
  }

  async getDeviceGroupAPI(id: string): Promise<APIResponse> {
    return await test.step(`Getting device group ${id}`, async () => {
      return await this.context.get(`${ROUTE}/${id}`)
    })
  }

  async updateDeviceGroupAPI(
    id: string,
    data: Partial<DeviceGroupCreateRequest>,
  ): Promise<APIResponse> {
    return await test.step(`Updating device group ${id}`, async () => {
      return await this.context.patch(`${ROUTE}/${id}`, { data })
    })
  }

  async deleteDeviceGroupAPI(id: string): Promise<APIResponse> {
    return await test.step(`Deleting device group ${id}`, async () => {
      return await this.context.delete(`${ROUTE}/${id}`)
    })
  }

  // Wrapped method (có assertion) — dùng trong fixture
  async createDeviceGroup(
    data: DeviceGroupCreateRequest,
  ): Promise<DeviceGroup> {
    const response = await this.createDeviceGroupAPI(data)
    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })

    const body = await response.json()
    await expectNotNull({
      actual: body.data,
      description: 'Device group data in response',
    })

    return body.data!
  }
}
```

### Bước 6 — Cấu hình APIRequestContext (`context.ts`)

```typescript
// src/core/bms-api/shared/context.ts
import { request } from '@playwright/test'
import { BMS_API_ENDPOINT } from '@src/config'

export const getBmsApiContext = async () => {
  return await request.newContext({
    baseURL: BMS_API_ENDPOINT,
  })
}
```

Thêm endpoint vào `src/config.ts`:

```typescript
export const BMS_API_ENDPOINT =
  process.env.BMS_API_ENDPOINT ?? 'http://localhost:4000'
```

### Bước 7 — Tạo DB Helper (`db.ts`)

Chỉ cần khi test cần assert dữ liệu trực tiếp trong database:

```typescript
// src/core/bms-api/device_group/db.ts
import { PostgresClient } from '@src/utils'
import { DeviceGroup } from './type'

export class DeviceGroupDb {
  constructor(private client: PostgresClient) {}

  async getDeviceGroupById(id: string): Promise<DeviceGroup | null> {
    const result = await this.client.executeQuery(
      'SELECT * FROM device_groups WHERE id = $1',
      [id],
    )
    return result.rows[0] ?? null
  }
}
```

### Bước 8 — Tạo Fixtures (`fixtures.ts`)

```typescript
// src/core/bms-api/device_group/fixtures.ts
import { Fixtures } from '@playwright/test'
import { DeviceGroupApiClient } from './api'
import { DeviceGroup } from './type'
import { getBmsApiContext } from '../shared/context'
import { createDeviceGroupData } from './data'
import { PostgresClient } from '@src/utils'
import { DeviceGroupDb } from './db'

export type DeviceGroupFixture = {
  deviceGroupClient: DeviceGroupApiClient
  deviceGroup: DeviceGroup
  deviceGroupDb: DeviceGroupDb
}

export const deviceGroupFixture: Fixtures<DeviceGroupFixture> = {
  deviceGroupClient: async ({}, use) => {
    const context = await getBmsApiContext()
    await use(new DeviceGroupApiClient(context))
  },

  deviceGroup: async ({ deviceGroupClient }, use) => {
    const group = await deviceGroupClient.createDeviceGroup(
      createDeviceGroupData(),
    )
    await use(group)
    await deviceGroupClient.deleteDeviceGroupAPI(group.id) // cleanup
  },

  deviceGroupDb: async ({}, use) => {
    await use(new DeviceGroupDb(PostgresClient.getInstance()))
  },
}
```

### Bước 9 — Export qua `index.ts`

```typescript
// src/core/bms-api/device_group/index.ts
export * from './api'
export * from './type'
export * from './schema'
export * from './data'
export * from './fixtures'
export * from './db'

// src/core/bms-api/index.ts
export * from './device_group'

// src/core/index.ts — thêm dòng mới
export * from './bms-api'
```

---

## 6. Hướng dẫn viết test case trong `tests/`

### Bước 1 — Tạo base test file

```typescript
// tests/bms-api/bms-api-test.ts
import { test as base } from '@playwright/test'
import { DeviceGroupFixture, deviceGroupFixture } from '@src/core'
import { combineFixtures } from '@src/utils'

// Khi có nhiều resource: combineFixtures(deviceGroupFixture, anotherFixture)
export const bmsApiTest = base.extend<DeviceGroupFixture>(
  combineFixtures(deviceGroupFixture),
)
```

### Bước 2 — Viết test spec (pattern CRUD)

```typescript
// tests/bms-api/device-group.spec.ts
import { deviceGroupSchema } from '@src/core'
import { bmsApiTest as test } from './bms-api-test'
import {
  expectNotNull,
  expectStatusCode,
  PostgresClient,
  validateSchema,
} from '@src/utils'
import { createDeviceGroupData } from '@src/core/bms-api/device_group/data'
import { expect } from '@playwright/test'

test.describe('Device Group', () => {
  test.beforeAll(async () => {
    await PostgresClient.getInstance().init()
  })

  test.afterAll(async () => {
    await PostgresClient.getInstance().dispose()
  })

  // ── GET ──────────────────────────────────────────────────────
  test('Get DeviceGroup', async ({ deviceGroup, deviceGroupClient }) => {
    const response = await deviceGroupClient.getDeviceGroupAPI(deviceGroup.id)
    const json = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expectNotNull({
      actual: json.data,
      description: 'DeviceGroup data should not be null',
    })
    await validateSchema({ schema: deviceGroupSchema, json: json.data })
  })

  // ── CREATE ───────────────────────────────────────────────────
  test('Create DeviceGroup', async ({ deviceGroupClient, deviceGroupDb }) => {
    const payload = createDeviceGroupData()
    const response = await deviceGroupClient.createDeviceGroupAPI(payload)
    const json = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expectNotNull({
      actual: json.data,
      description: 'DeviceGroup data should not be null',
    })
    await validateSchema({ schema: deviceGroupSchema, json: json.data })
    await expect(json.data.name).toBe(payload.name)

    // Verify trong database
    const inDb = await deviceGroupDb.getDeviceGroupById(json.data.id)
    await expectNotNull({
      actual: inDb,
      description: 'DeviceGroup should exist in DB',
    })
    await expect(inDb!.name).toBe(payload.name)
  })

  // ── UPDATE ───────────────────────────────────────────────────
  test('Update DeviceGroup', async ({ deviceGroup, deviceGroupClient }) => {
    const payload = { name: 'Updated Name', description: 'Updated desc' }
    const response = await deviceGroupClient.updateDeviceGroupAPI(
      deviceGroup.id,
      payload,
    )
    const json = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await validateSchema({ schema: deviceGroupSchema, json: json.data })
    await expect(json.data.name).toBe(payload.name)
    await expect(json.data.description).toBe(payload.description)
  })

  // ── DELETE ───────────────────────────────────────────────────
  test('Delete DeviceGroup', async ({
    deviceGroup,
    deviceGroupClient,
    deviceGroupDb,
  }) => {
    const response = await deviceGroupClient.deleteDeviceGroupAPI(
      deviceGroup.id,
    )
    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })

    // API phải trả 404 sau khi xóa
    const getResponse = await deviceGroupClient.getDeviceGroupAPI(
      deviceGroup.id,
    )
    await expectStatusCode({
      actual: getResponse.status(),
      expected: 404,
      api: getResponse.url(),
    })

    // Verify soft-delete trong database
    const inDb = await deviceGroupDb.getDeviceGroupById(deviceGroup.id)
    await expectNotNull({
      actual: inDb,
      description: 'Record vẫn phải tồn tại trong DB (soft delete)',
    })
    await expect(inDb!.deleted_at).not.toBeNull()
  })
})
```

### Assertion Layers — thứ tự chuẩn

Mỗi test case kiểm tra theo thứ tự từ ngoài vào trong:

```text
1. HTTP Status Code    → expectStatusCode()
2. Response not null   → expectNotNull()
3. Schema structure    → validateSchema()
4. Business logic      → expect(field).toBe(value)
5. Database state      → DB query + expectNotNull() + expect()
```

---

## 7. Hướng dẫn viết E2E test đa service

E2E test kiểm tra luồng business logic xuyên suốt nhiều service cùng lúc.

### Khi nào cần E2E test?

- Hành động trên service A tạo side effect trên service B
- Cần kiểm tra trạng thái hệ thống sau chuỗi sự kiện (online/offline, sync, webhook...)
- Cần kiểm soát infrastructure (start/stop container, delay...)

### Cấu trúc folder

```text
tests/e2e/
└── <flow-name>/
    ├── <flow>-test.ts     # Kết hợp fixtures từ nhiều service
    └── <flow>.spec.ts     # Test cases
```

### Kết hợp fixtures đa service

```typescript
// tests/e2e/hc-online/hc-online-test.ts
import { test as base } from '@playwright/test'
import {
  HomeControllerFixture,
  homeControllerFixture,
  IotHomeControllerFixture,
  iotHomeControllerFixture,
} from '@src/core'
import { combineFixtures } from '@src/utils'

export const hcOnlineE2eTest = base.extend<
  HomeControllerFixture,
  IotHomeControllerFixture
>(combineFixtures(homeControllerFixture, iotHomeControllerFixture))
```

### Pattern: Setup → Action → Verify → Cleanup

```typescript
// tests/e2e/hc-online/hc-online.spec.ts
import { hcOnlineE2eTest as test } from './hc-online-test'
import {
  ContainerRuntime,
  delay,
  expectStatusCode,
  PostgresClient,
} from '@src/utils'
import { expect } from '@playwright/test'

test.describe('Home Controller online/offline e2e', () => {
  test.beforeAll(async () => {
    await PostgresClient.getInstance().init()
  })

  test.afterAll(async () => {
    await PostgresClient.getInstance().dispose()
  })

  test('Check home controller is online', async ({
    iotHomeControllerClient,
    iotHcExampleInfo,
    homeControllerDb,
  }) => {
    // Action: gọi healthcheck trực tiếp trên HC device
    const response = await iotHomeControllerClient.healthcheckAPI()
    const json = await response.json()

    // Verify API response
    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expect(json.status).toBe(true)

    // Verify side effect trong database (MQTT connected)
    const hc = await homeControllerDb.getHomeControllerByMac(
      iotHcExampleInfo.mac,
    )
    await expect(hc).not.toBeNull()
    const mqttConnected = await homeControllerDb.getHomeControllerMqttStatus(
      hc!.id,
    )
    await expect(mqttConnected).toBe(true)
  })

  test('Check home controller is offline', async ({
    iotHomeControllerClient,
    iotHcExampleInfo,
    homeControllerDb,
  }) => {
    // Setup: dừng container để simulate offline
    await ContainerRuntime.getInstance().stopContainer(
      iotHcExampleInfo.container,
    )
    await delay(500)

    try {
      await iotHomeControllerClient.healthcheckAPI()
    } catch {
      // expected — container đã offline
    } finally {
      // Verify: DB phải cập nhật mqtt_status.connected = false
      const mqttConnected = await homeControllerDb.getHomeControllerMqttStatus(
        iotHcExampleInfo.id,
      )
      await expect(mqttConnected).toBe(false)

      // Cleanup: luôn restart container trong finally
      await ContainerRuntime.getInstance().startContainer(
        iotHcExampleInfo.container,
      )
    }
  })
})
```

> **Quan trọng:** Luôn đặt cleanup trong `finally` block để container được restart ngay cả khi test fail.

---

## 8. Chạy test và xem báo cáo

### Chạy test

```bash
# Toàn bộ test suite
npm test

# Một file cụ thể
npx playwright test tests/console/home-controller.spec.ts

# Lọc theo tên
npx playwright test --grep "Get HomeController"
npx playwright test --grep "online"

# Debug mode
npx playwright test --debug
```

### Xem báo cáo HTML

```bash
npx playwright show-report
```

### Xem báo cáo Allure

```bash
npm run ui
# hoặc
allure open allure-results
```

---

## 9. Code Conventions

### Prettier

```json
{ "semi": false, "singleQuote": true, "tabWidth": 2, "printWidth": 80 }
```

### Import — dùng path alias, không dùng relative path

```typescript
// ✅ Đúng
import { HomeControllerApiClient } from '@src/core'
import { PostgresClient } from '@src/utils'

// ❌ Tránh
import { HomeControllerApiClient } from '../../../src/core/console/home_controller/api'
```

### Import Order

```typescript
// 1. Third-party
import test, { APIRequestContext } from '@playwright/test'
import { faker } from '@faker-js/faker'

// 2. Internal utils
import { expectStatusCode, PostgresClient } from '@src/utils'

// 3. Internal core
import { HomeController, homeControllerSchema } from '@src/core'

// 4. Local (cùng module)
import { createHomeControllerData } from './data'
```

### Tóm tắt naming

| Đối tượng              | Convention         | Ví dụ                     |
| ---------------------- | ------------------ | ------------------------- |
| Variable, function     | `camelCase`        | `homeControllerDb`        |
| Class, Type, Interface | `PascalCase`       | `HomeControllerApiClient` |
| Constants              | `UPPER_SNAKE_CASE` | `IOT_CONSOLE_ENDPOINT`    |
| File, folder (service) | `kebab-case`       | `home-controller/`        |
| Folder (resource)      | `snake_case`       | `home_controller/`        |
| Test describe          | Tên resource       | `'Home Controller'`       |
| Test case              | Động từ + tên      | `'Get HomeController'`    |

---

## 10. Checklist triển khai nhanh

### ✅ Thêm resource mới vào service đã có

- [ ] Tạo folder `src/core/<service>/<resource>/`
- [ ] `type.ts` — TypeScript types
- [ ] `schema.ts` — AJV JSON Schema
- [ ] `data.ts` — Faker factory functions
- [ ] `api.ts` — implement `APIClient`, đủ raw + wrapped methods
- [ ] `db.ts` — DB queries (nếu cần assert DB state)
- [ ] `fixtures.ts` — Playwright fixtures với auto-cleanup
- [ ] `index.ts` — export tất cả
- [ ] Re-export qua `src/core/<service>/index.ts`
- [ ] Tạo `tests/<service>/<resource>.spec.ts`
- [ ] Viết test CRUD: GET, CREATE, UPDATE, DELETE
- [ ] Mỗi test đủ 5 lớp assertion (status → null → schema → logic → DB)

### ✅ Thêm service mới hoàn toàn

- [ ] Thêm endpoint constant vào `src/config.ts`
- [ ] Thêm endpoint vào `.env.template`
- [ ] Tạo folder `src/core/<service>/`
- [ ] `context.ts` — `APIRequestContext` setup
- [ ] `response.ts` — response wrapper types của service (nếu khác console)
- [ ] Triển khai các resource (theo checklist trên)
- [ ] `src/core/<service>/index.ts` — export tất cả
- [ ] Re-export qua `src/core/index.ts`
- [ ] Tạo `tests/<service>/` với base test file
- [ ] Thêm service vào `docker-compose.yml` nếu cần

### ✅ Thêm E2E flow mới

- [ ] Tạo folder `tests/e2e/<flow-name>/`
- [ ] `<flow>-test.ts` — kết hợp fixtures từ các service liên quan
- [ ] `<flow>.spec.ts` — test cases theo pattern Setup → Action → Verify
- [ ] Dùng `ContainerRuntime` để control state nếu cần
- [ ] Cleanup luôn nằm trong `finally` block
- [ ] `beforeAll/afterAll` có `PostgresClient.init()/dispose()`
