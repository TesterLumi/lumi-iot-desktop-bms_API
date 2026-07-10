export type AutomationResponse<T> = {
  metadata: Record<string, unknown>
  data: T
}

export type AutomationConfigUpdateRequest = {
  actived_gateway?: string[]
}

export type AutomationGateway = {
  mac: string
  address: string
  active_automation: boolean
}

export type AutomationExecutionType = 'And' | 'Or'

export type AutomationPrimitiveState = boolean | number | string

export type AutomationRuleDeviceCondition = {
  status: AutomationPrimitiveState
  id: number | string
  slot: number
  endpoint_slot: number
}

export type AutomationPayload = {
  name: string
  description?: string | null
  enable: boolean
  start_time?: string | null
  end_time?: string | null
  icon?: string
}

export type AutomationDetailCreateRequest = {
  automation: AutomationPayload
  execution: {
    type: AutomationExecutionType
    input: AutomationRuleDeviceCondition[]
    output: AutomationRuleDeviceCondition[]
  }
}

export type AutomationExecutionCreateRequest = {
  type: AutomationExecutionType
  input: Record<
    string,
    {
      condition: string
      value: AutomationPrimitiveState
    }
  >
  output: Record<string, AutomationPrimitiveState>
}

export type AutomationExecutionUpdateRequest =
  Partial<AutomationExecutionCreateRequest>

export type AutomationCellCreateRequest = {
  name: string
  description: string
  execution_id: number
  enable: boolean
  cron: string | null
}

export type AutomationEndpoint = {
  id: number
  slot: number
}

export type AutomationConnectionCreateRequest = {
  source: AutomationEndpoint
  target: AutomationEndpoint
  transformer: null | {
    id: string
    data: Record<string, unknown>
  }
}

export type AutomationSceneType = 'Normal' | 'Lighting'

export type AutomationSceneBindingStatus =
  | 'Updating'
  | 'Deleting'
  | 'Activated'
  | 'Failed'

export type AutomationSceneBinding = {
  id: string
  snapshot: Record<string, AutomationPrimitiveState>
  status: AutomationSceneBindingStatus
}

export type AutomationSceneCreateRequest = {
  type: AutomationSceneType
  name: string
  icon: string
  enable: boolean
  background?: string | null
  background_color: string
  binding: AutomationSceneBinding[]
  cron: string | null
  cron_enable: boolean
}

export type AutomationSceneUpdateRequest = Partial<AutomationSceneCreateRequest>
export type AutomationSceneSyncFromGatewayRequest =
  Partial<AutomationSceneCreateRequest> & {
    status?: 'Provision' | 'Activated' | 'Destroying'
  }
