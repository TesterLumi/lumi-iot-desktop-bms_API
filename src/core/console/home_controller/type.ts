export type MqttStatus = {
  connected: boolean
  last_event_at?: string | null
  last_connected_at?: string | null
  last_disconnected_at?: string | null
}

export type HomeController = {
  id: string
  mac: string
  name?: string | null
  hc_type?: string | null
  version?: string | null
  ip?: string | null
  device_time?: number | null
  time_zone?: string | null
  network_interface?: string | null
  lan_interface?: string | null
  wifi_interface?: string | null
  network_mode?: number | null
  notes?: string | null
  created_at?: string | null // ISO 8601 datetime
  updated_at?: string | null // ISO 8601 datetime
  deleted_at?: string | null // ISO 8601 datetime
  area?: string | null
  mqtt_status?: MqttStatus | null
  automation_gateway?: boolean | null
}

export type HomeControllerCreateRequest = {
  mac: string
  name?: string | null
  hc_type?: string | null
  version?: string | null
  ip?: string | null
  device_time?: number | null
  time_zone?: string | null
  network_interface?: string | null
  network_mode?: number | null
  notes?: string | null
}

export type HomeControllerUpdateRequest = {
  name?: string | null
  notes?: string | null
}
