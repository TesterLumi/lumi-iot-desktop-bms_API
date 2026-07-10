CREATE DATABASE IF NOT EXISTS iot_metrics;
CREATE DATABASE IF NOT EXISTS iot_logging;


--- MIGRATION IOT_LOGGING
use iot_logging;
CREATE TABLE IF NOT EXISTS d_device_action_log (
    timestamp     DateTime64(9, 'UTC'),
    hc_id         UInt64,
    mac           LowCardinality(String),
    started_at    DateTime64(3, 'UTC'),
    finished_at   DateTime64(3, 'UTC'),
    request_id    UInt64,
    device_id     UInt64,
    action        LowCardinality(String),
    params        String CODEC(ZSTD(3)),
    prev_state    String CODEC(ZSTD(3)),
    curr_state    String CODEC(ZSTD(3)),
    status        LowCardinality(String),
    error         Nullable(String),
    source_type   LowCardinality(String),
    source_id     Nullable(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, started_at, hc_id, mac, request_id)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

--- MIGRATION IOT_METRICS
use iot_metrics;
CREATE TABLE IF NOT EXISTS d_device_metrics_raw
(
    event_ts DateTime64(3, 'UTC'),
    ingest_ts DateTime64(3, 'UTC') DEFAULT now64(3),
    hc_id UInt64,
    device_id UInt64,
    cell_model_id LowCardinality(String),
    cell_idx UInt16,
    state_idx UInt16,
    alias LowCardinality(Nullable(String)),
    metric_key LowCardinality(String),
    metric_type LowCardinality(String),
    unit LowCardinality(Nullable(String)),
    value_u64 UInt64,
    value_f64 Nullable(Float64)
)
ENGINE = MergeTree
PARTITION BY toStartOfQuarter(event_ts)
ORDER BY (hc_id, device_id, metric_key, event_ts)
TTL toDateTime(event_ts) + INTERVAL 36 MONTH;

CREATE TABLE IF NOT EXISTS t_device_metric_counter_increase_by_hourly
(
    hc_id UInt64,
    device_id UInt64,
    metric_key LowCardinality(String),
    bucket DateTime('UTC'),
    value Float64
)
ENGINE = MergeTree
PARTITION BY toStartOfQuarter(bucket)
ORDER BY (hc_id, device_id, metric_key, bucket);

DROP VIEW IF EXISTS mv_device_metric_counter_increase_by_hourly;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_device_metric_counter_increase_by_hourly
REFRESH EVERY 1 MINUTE TO t_device_metric_counter_increase_by_hourly AS
SELECT
    hc_id,
    device_id,
    metric_key,
    toStartOfHour(event_ts) AS bucket,
    sum(delta) AS value
FROM
(
    SELECT
        hc_id,
        device_id,
        metric_key,
        event_ts,
        greatest(0, value_f64 - previous_value) AS delta
    FROM
    (
        SELECT
            hc_id,
            device_id,
            metric_key,
            event_ts,
            value_f64,
            lagInFrame(value_f64, 1, value_f64) OVER (PARTITION BY hc_id, device_id, metric_key ORDER BY event_ts ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS previous_value
        FROM
        (
            SELECT
                hc_id,
                device_id,
                metric_key,
                event_ts,
                assumeNotNull(value_f64) AS value_f64
            FROM
            (
                SELECT
                    hc_id,
                    device_id,
                    metric_key,
                    event_ts,
                    value_f64,
                    ROW_NUMBER() OVER (PARTITION BY hc_id, device_id, metric_key, event_ts ORDER BY ingest_ts DESC) AS rn
                FROM d_device_metrics_raw
                WHERE metric_type = 'counter' AND value_f64 IS NOT NULL
            )
            WHERE rn = 1
        )
    )
)
GROUP BY hc_id, device_id, metric_key, bucket;


CREATE TABLE IF NOT EXISTS d_home_controller_mqtt_connection_events
(
    event_ts DateTime64(3, 'UTC'),
    ingest_ts DateTime64(3, 'UTC') DEFAULT now64(3),
    hc_id UInt64,
    event_id String,
    event_type LowCardinality(String),
    broker_node LowCardinality(Nullable(String)),
    username Nullable(String),
    peer_addr Nullable(String),
    reason Nullable(String),
    raw_payload String CODEC(ZSTD(3))
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_ts)
ORDER BY (hc_id, event_ts, event_id)
TTL toDateTime(event_ts) + INTERVAL 12 MONTH
SETTINGS index_granularity = 8192;

