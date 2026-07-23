export const IOT_CONSOLE_ENDPOINT =
  process.env.IOT_CONSOLE_ENDPOINT || 'http://localhost:3000'

export const IOT_HC_ENDPOINT =
  process.env.IOT_HC_ENDPOINT || 'http://localhost:8080'

export const AUTOMATION_SERVICE_ENDPOINT =
  process.env.AUTOMATION_SERVICE_ENDPOINT ||
  process.env.AUTOMATION_CLOUD_ENDPOINT ||
  'http://10.10.0.198:19000'

export const DEVICE_SERVICE_ENDPOINT =
  process.env.DEVICE_SERVICE_ENDPOINT || 'http://10.10.0.198:3333'

export const DEVICE_CONTROL_ENDPOINT =
  process.env.DEVICE_CONTROL_ENDPOINT || 'http://10.10.0.198:8081'

export const AUTOMATION_CLOUD_ENDPOINT = AUTOMATION_SERVICE_ENDPOINT

export const GROUP_BASE_URL =
  process.env.GROUP_BASE_URL ||
  process.env.BASE_URL ||
  DEVICE_SERVICE_ENDPOINT

export const GROUP_API_BASE = process.env.GROUP_API_BASE || '/api/v0/groups'
export const GROUP_AUTH_LOGIN_API =
  process.env.GROUP_AUTH_LOGIN_API || '/api/v0/auth/login'
export const GROUP_DEVICE_CONTROL_API =
  process.env.GROUP_DEVICE_CONTROL_API ||
  process.env.DEVICE_CONTROL_API ||
  '/api/devices/control'
export const GROUP_DEVICE_STATUS_API =
  process.env.GROUP_DEVICE_STATUS_API ||
  process.env.DEVICE_STATUS_API ||
  '/api/devices/status'
export const GROUP_HC_API_BASE =
  process.env.GROUP_HC_API_BASE || process.env.HC_GROUP_API_BASE || '/api/groups'
export const GROUP_ALLOW_DEVICE_CONTROL =
  process.env.GROUP_ALLOW_DEVICE_CONTROL === 'true' ||
  process.env.AUTOMATION_ALLOW_DEVICE_CONTROL === 'true'
export const GROUP_REQUIRE_AUTH = process.env.GROUP_REQUIRE_AUTH === 'true'

export const AUTOMATION_HC_ID =
  process.env.AUTOMATION_HC_ID || '4932308540097724437'

export const AUTOMATION_HC_MAC =
  process.env.AUTOMATION_HC_MAC || '88:e6:28:f8:2e:4d'

export const AUTOMATION_TRIGGER_DEVICE_ID =
  process.env.AUTOMATION_TRIGGER_DEVICE_ID ||
  process.env.INPUT_DEVICE_1_ID ||
  '118431937308523268'

export const AUTOMATION_CONDITION_DEVICE_ID =
  process.env.AUTOMATION_CONDITION_DEVICE_ID ||
  process.env.INPUT_DEVICE_2_ID ||
  '118431937308523267'

export const AUTOMATION_ACTION_DEVICE_ID =
  process.env.AUTOMATION_ACTION_DEVICE_ID ||
  process.env.OUTPUT_DEVICE_1_ID ||
  '118431937308523266'

export const AUTOMATION_PIR_SENSOR_DEVICE_ID =
  process.env.AUTOMATION_PIR_SENSOR_DEVICE_ID ||
  process.env.PIR_SENSOR_DEVICE_ID ||
  '120416080507841536'

export const AUTOMATION_DEVICE_STATE_IDX =
  process.env.AUTOMATION_DEVICE_STATE_IDX || '1'

export const AUTOMATION_ALLOW_DEVICE_CONTROL =
  process.env.AUTOMATION_ALLOW_DEVICE_CONTROL === 'true'

export const AUTOMATION_RULE_INPUT_SLOT = Number(
  process.env.INPUT_SLOT ?? process.env.AUTOMATION_RULE_INPUT_SLOT ?? '0',
)

export const AUTOMATION_RULE_OUTPUT_SLOT = Number(
  process.env.OUTPUT_SLOT ?? process.env.AUTOMATION_RULE_OUTPUT_SLOT ?? '0',
)

export const AUTOMATION_RULE_ENDPOINT_SLOT = Number(
  process.env.ENDPOINT_SLOT ?? process.env.AUTOMATION_RULE_ENDPOINT_SLOT ?? '1',
)

export const AUTOMATION_RULE_POLL_INTERVAL_MS = Number(
  process.env.POLL_INTERVAL_MS ??
    process.env.AUTOMATION_RULE_POLL_INTERVAL_MS ??
    '500',
)

export const AUTOMATION_RULE_POLL_TIMEOUT_MS = Number(
  process.env.POLL_TIMEOUT_MS ??
    process.env.AUTOMATION_RULE_POLL_TIMEOUT_MS ??
    '10000',
)

export const BMS_API_ENDPOINT =
  process.env.BMS_API_ENDPOINT || 'http://localhost:3332'

export const BMS_API_KEY = process.env.BMS_API_KEY || ''
export const BMS_CLIENT_VERSION = process.env.BMS_CLIENT_VERSION || '1.0.0'
export const BMS_CLIENT_OS = process.env.BMS_CLIENT_OS || 'windows'
export const BMS_CLIENT_ID = process.env.BMS_CLIENT_ID || 'client-001'
export const BMS_ACCEPT_LANGUAGE = process.env.BMS_ACCEPT_LANGUAGE || 'vi'
export const BMS_API_THROTTLE_MS = Number(
  process.env.BMS_API_THROTTLE_MS || '0',
)

export const BMS_ACCESS_TOKEN = process.env.BMS_ACCESS_TOKEN || ''
export const BMS_ROOT_ACCESS_TOKEN = process.env.BMS_ROOT_ACCESS_TOKEN || ''
export const BMS_VIEWER_ACCESS_TOKEN = process.env.BMS_VIEWER_ACCESS_TOKEN || ''
export const BMS_NORMAL_USER_ACCESS_TOKEN =
  process.env.BMS_NORMAL_USER_ACCESS_TOKEN || ''
export const BMS_NO_PERMISSION_ACCESS_TOKEN =
  process.env.BMS_NO_PERMISSION_ACCESS_TOKEN || ''

export const BMS_NORMAL_USER_ID = process.env.BMS_NORMAL_USER_ID || ''
export const BMS_NORMAL_USER_2_ID = process.env.BMS_NORMAL_USER_2_ID || ''
export const BMS_ROOT_USER_ID = process.env.BMS_ROOT_USER_ID || ''
export const BMS_SYS_ADMIN_USER_ID = process.env.BMS_SYS_ADMIN_USER_ID || ''
export const BMS_SYS_ADMIN_2_USER_ID = process.env.BMS_SYS_ADMIN_2_USER_ID || ''
export const BMS_SYSTEM_ROLE_ID = process.env.BMS_SYSTEM_ROLE_ID || ''

export const BMS_RESOURCE_ID_A = process.env.BMS_RESOURCE_ID_A || ''
export const BMS_RESOURCE_ID_B = process.env.BMS_RESOURCE_ID_B || ''
export const BMS_DELETED_RESOURCE_ID = process.env.BMS_DELETED_RESOURCE_ID || ''
export const BMS_SERVICE_CODE = process.env.BMS_SERVICE_CODE || 'bms'
export const BMS_AUTHZ_READ_RESOURCE_A_ENDPOINT =
  process.env.BMS_AUTHZ_READ_RESOURCE_A_ENDPOINT || ''
export const BMS_AUTHZ_READ_RESOURCE_B_ENDPOINT =
  process.env.BMS_AUTHZ_READ_RESOURCE_B_ENDPOINT || ''
export const BMS_AUTHZ_WRITE_RESOURCE_A_ENDPOINT =
  process.env.BMS_AUTHZ_WRITE_RESOURCE_A_ENDPOINT || ''

export const ALLURE_RESULTS_FOLDER =
  process.env.ALLURE_RESULTS_FOLDER || 'reporters/allure-results'

export const POSTGRES_URI =
  process.env.POSTGRES_URI ||
  'postgresql://postgres:password@localhost:5432/postgres'
