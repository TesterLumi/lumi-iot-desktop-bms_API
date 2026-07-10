# Kiến trúc hệ thống BMS

## 1. Tổng quan

Hệ thống **BMS (Building Management System)** là nền tảng quản lý tòa nhà thông minh tích hợp các thiết bị IoT.
Hệ thống cho phép người dùng giám sát, điều khiển thiết bị và thiết lập các kịch bản tự động hóa thông qua ứng dụng mobile/web.

- **Mô hình triển khai**: Microservices kết hợp Edge Computing (triển khai tập trung )
- **Người dùng**: Cư dân, quản lý tòa nhà
- **Thiết bị hỗ trợ**: Đèn, điều hòa, cảm biến, khóa cửa, v.v.

---

## 2. Sơ đồ kiến trúc tổng quan

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          TẦNG CLIENT                                 │
│                   [ Mobile App / Web App ]                           │
└───────────┬──────────────────┬─────────────────┬─────────────────────┘
            │ HTTP/REST        │ HTTP/REST       │ HTTP/REST
            ▼                  ▼                 ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│    bms-api      │  │   iot-console    │  │  iot-proxy-gateway   │
│ (Auth & Users)  │  │ (Quản lý TB IoT) │  │  (Cầu nối App ↔ HC)  │
└─────────────────┘  └────────┬─────────┘  └──────────┬───────────┘
                              │                       │ HTTP / MQTT
                              │       ┌───────────────┼──────────────────┐
                              │       ▼               ▼                  ▼
                              │  ┌──────────────┐  ┌──────────────────────┐
                              │  │     EMQX     │  │   automation-cloud   │
                              │  │ (MQTT Broker)│  │   (Rule/Cảnh/Lịch)   │
                              │  └──────┬───────┘  └──────────┬───────────┘
                              │         │                     │
                              │    ┌────┴─────┐               │
                              │    ▼          ▼               │
                              │  ┌──────────────┐  ┌─────────────────┐
                              │  │ iot-logging  │  │ metrics-device  │
                              │  │  (Lưu Log TB)│  │(Lưu Metrics/    │
                              │  └──────────────┘  │ Events TB)      │
                              │                    └─────────────────┘
                              │
                    ┌─────────┴─────────────────────────────────────┐
                    │            Home Controller (HC)               │
                    │   (Bộ điều khiển trung tâm - Edge Node)       │
                    │   Giao tiếp trực tiếp với thiết bị IoT        │
                    └───────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         TẦNG DỮ LIỆU                                 │
│   [Postgres]   [Clickhouse]   [Redis]   [S3]   [EMQX]                │
└──────────────────────────────────────────────────────────────────────┘

Chú thích:
  ──►  Giao tiếp HTTP/REST
  ···► Giao tiếp MQTT (bất đồng bộ)
  TB   = Thiết bị
  HC   = Home Controller
```

---

## 3. Mô tả các thành phần

| Service                  | Chức năng chính                                                | Client gọi trực tiếp? | Phụ thuộc chính                                        |
| ------------------------ | -------------------------------------------------------------- | :-------------------: | ------------------------------------------------------ |
| **bms-api**              | Quản lý tài khoản người dùng, phân quyền, xác thực             |         ✅ Có         | Postgres, Redis                                        |
| **iot-console**          | Quản lý thông tin thiết bị IoT, tầng, phòng, HC                |         ✅ Có         | Postgres, S3, Clickhouse                               |
| **iot-proxy-gateway**    | Nhận lệnh điều khiển từ App, chuyển tiếp đến HC tương ứng      |         ✅ Có         | Postgres, iot-console, EMQX, HC                        |
| **Home Controller (HC)** | Bộ điều khiển tại chỗ, giao tiếp trực tiếp với thiết bị vật lý |       ❌ Không        | iot-console, automation-cloud, iot-proxy-gateway, EMQX |
| **automation-cloud**     | Lưu trữ và đồng bộ các rule, cảnh, lịch tự động về HC          |       ❌ Không        | Postgres, HC                                           |
| **iot-logging**          | Thu thập và lưu trữ log điều khiển từ thiết bị                 |       ❌ Không        | Clickhouse, EMQX                                       |
| **metrics-device**       | Thu thập và lưu trữ metrics, events gửi từ thiết bị            |       ❌ Không        | Clickhouse, EMQX                                       |
| **alert-manager-api**    | Phân tích log/metrics để tạo cảnh báo cho người dùng           |       ❌ Không        | Clickhouse, Postgres                                   |

---

## 4. Luồng nghiệp vụ chính

### Luồng 1 — Người dùng điều khiển thiết bị qua App

```text
App            iot-proxy-gateway        iot-console             HC              EMQX          Thiết bị
 │                     │                     │                   │                │               │
 │── Gửi lệnh (HTTP) ─►│                     │                   │                │               │
 │                     │── Tìm HC chứa TB ──►│                   │                │               │
 │                     │◄─ Trả thông tin HC ─│                   │                │               │
 │                     │                     │                   │                │               │
 │                     │──────── HTTP proxy lệnh điều khiển ────►│                │               │
 │◄──────────────────── 200 OK (xác nhận đã nhận lệnh) ──────────│                │               │
 │                     │                     │                   │                │               │
 │                     │                     │                   │── Gửi lệnh ───────────────────►│
 │                     │                     │                   │◄────────────── Phản hồi ───────│
 │                     │                     │                   │                │               │
 │                     │                     │                   │── Broadcast trạng thái mới ───►│
 │                     │                     │                   │                │               │
 │                     │◄────────────────────────────── Sub MQTT (trạng thái) ────│               │
 │◄──── WebSocket──────|                     │                   │                │               │
```

### Luồng 2 — HC tự động thực thi rule/automation

```text
automation-cloud           HC                         Thiết bị
       │                   │                              │
       │──── Sync rules ──►│                              │
       │                   │  (HC lưu rules cục bộ)       │
       │                   │                              │
       │             [Trigger: cảm biến/lịch]             │
       │                   │──── Thực thi rule ──────────►│
       │                   │◄─── Phản hồi trạng thái ─────│
       │                   │                              │
       │                   │──── Ghi log ───► EMQX ──► iot-logging
```

### Luồng 3 — Thiết bị gửi metrics/events lên hệ thống

```text
Thiết bị           HC                EMQX          metrics-device      Clickhouse
    │               │                  │                  │                  │
    │── Gửi data ──►│                  │                  │                  │
    │               │──── Pub MQTT ───►│                  │                  │
    │               │                  │──── Sub MQTT ───►│                  │
    │               │                  │                  │──── Lưu trữ ────►│
```

---

## 5. Phụ thuộc hạ tầng

| Service              |         Postgres         |         Clickhouse         |      Redis       |     S3      |               EMQX               |
| -------------------- | :----------------------: | :------------------------: | :--------------: | :---------: | :------------------------------: |
| bms-api              |    ✅ (users, roles)     |                            | ✅ (cache quyền) |             |                                  |
| iot-console          | ✅ (thiết bị, phòng, HC) |      ✅ (metrics TB)       |                  | ✅ (log HC) |                                  |
| iot-proxy-gateway    |    ✅ (trạng thái TB)    |                            |                  |             |        ✅ (giao tiếp HC)         |
| automation-cloud     |  ✅ (rules, cảnh, lịch)  |                            |                  |             |                                  |
| iot-logging          |                          |    ✅ (log điều khiển)     |                  |             |       ✅ (nhận log từ HC)        |
| metrics-device       |                          |    ✅ (metrics, events)    |                  |             |         ✅ (nhận từ HC)          |
| alert-manager-api    | ✅ (template thông báo)  | ✅ (truy xuất log/metrics) |                  |             |                                  |
| Home Controller (HC) |                          |                            |                  |             | ✅ (giao tiếp gateway & HC khác) |

## 6. API reference

- HC (Proxy sẽ proxy xuống HC giống hệt API của HC): [API reference](https://github.com/rd-lumi/iot-platform-v3/blob/main/docs/archiecture/components/home-controller/api-references.md)
- Device Log Service: [API reference](https://github.com/rd-lumi/bms-backend/blob/main/bin/device-log/docs/api-references.md)
- Device Metrics Service: [API reference](https://github.com/rd-lumi/bms-backend/tree/main/bin/metrics-gateway/docs/postman)
- Iot Console: [API reference](https://github.com/rd-lumi/bms-backend/blob/main/bin/iot-console/docs/api-references.md)
- Bms API: [API reference](https://github.com/rd-lumi/bms-backend/tree/main/documents/05-api-reference)
