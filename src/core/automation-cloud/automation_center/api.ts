import test, { APIRequestContext, APIResponse } from '@playwright/test'
import { AUTOMATION_SERVICE_ENDPOINT } from '@src/config'
import { APIClient } from '@src/utils'
import {
  AutomationCellCreateRequest,
  AutomationConfigUpdateRequest,
  AutomationConnectionCreateRequest,
  AutomationDetailCreateRequest,
  AutomationExecutionCreateRequest,
  AutomationExecutionUpdateRequest,
  AutomationGateway,
  AutomationPayload,
  AutomationSceneCreateRequest,
  AutomationSceneSyncFromGatewayRequest,
  AutomationSceneUpdateRequest,
} from './type'

const ROUTE = '/api/v0'

const endpoint = (path: string) =>
  `${AUTOMATION_SERVICE_ENDPOINT.replace(/\/$/, '')}${ROUTE}${path}`

export class AutomationCenterApiClient implements APIClient {
  constructor(public context: APIRequestContext) {}

  async listExecutionTemplatesAPI(): Promise<APIResponse> {
    return await test.step('Listing automation execution templates', async () => {
      return await this.context.get(endpoint('/execution-templates'))
    })
  }

  async getExecutionTemplateAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Getting automation execution template ${id}`, async () => {
      return await this.context.get(endpoint(`/execution-templates/${id}`))
    })
  }

  async createExecutionTemplateAPI(
    data: Record<string, unknown>,
  ): Promise<APIResponse> {
    return await test.step('Creating automation execution template', async () => {
      return await this.context.post(endpoint('/execution-templates'), { data })
    })
  }

  async updateExecutionTemplateAPI(
    id: string | number,
    data: Record<string, unknown>,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation execution template ${id}`, async () => {
      return await this.context.post(endpoint(`/execution-templates/${id}`), {
        data,
      })
    })
  }

  async deleteExecutionTemplateAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Deleting automation execution template ${id}`, async () => {
      return await this.context.delete(endpoint(`/execution-templates/${id}`))
    })
  }

  async listAutomationsAPI(params?: {
    page?: number
    limit?: number
    no_limit?: boolean
    extra_fields?: string
  }): Promise<APIResponse> {
    return await test.step('Listing automations', async () => {
      return await this.context.get(endpoint('/automations'), { params })
    })
  }

  async createAutomationAPI(
    data: AutomationPayload & { execution_id?: string | number },
  ): Promise<APIResponse> {
    return await test.step('Creating automation', async () => {
      return await this.context.post(endpoint('/automations'), { data })
    })
  }

  async createAutomationDetailAPI(
    data: AutomationDetailCreateRequest | Record<string, unknown>,
  ): Promise<APIResponse> {
    return await test.step('Creating automation detail', async () => {
      return await this.context.post(endpoint('/automations/detail'), { data })
    })
  }

  async getAutomationDetailAPI(
    id: string | number,
    extraFields: string[] = ['input_connection', 'output_connection'],
  ): Promise<APIResponse> {
    return await test.step(`Getting automation detail ${id}`, async () => {
      return await this.context.get(endpoint(`/automations/${id}/detail`), {
        params: {
          extra_fields: extraFields.join(','),
        },
      })
    })
  }

  async updateAutomationAPI(
    id: string | number,
    data: Partial<AutomationPayload>,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation ${id}`, async () => {
      return await this.context.post(endpoint(`/automations/${id}`), { data })
    })
  }

  async updateAutomationDetailAPI(
    id: string | number,
    data: AutomationDetailCreateRequest | Record<string, unknown>,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation detail ${id}`, async () => {
      return await this.context.put(endpoint(`/automations/${id}/detail`), {
        data,
      })
    })
  }

  async deleteAutomationAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Deleting automation ${id}`, async () => {
      return await this.context.delete(endpoint(`/automations/${id}`))
    })
  }

  async deleteManyAutomationsAPI(
    ids: Array<string | number>,
  ): Promise<APIResponse> {
    return await test.step('Deleting many automations', async () => {
      return await this.context.delete(endpoint('/automations'), { data: ids })
    })
  }

  async updateConfigAPI(
    data: AutomationConfigUpdateRequest,
  ): Promise<APIResponse> {
    return await test.step('Updating automation config', async () => {
      return await this.context.post(endpoint('/config'), { data })
    })
  }

  async listGatewaysAPI(): Promise<APIResponse> {
    return await test.step('Listing automation gateways', async () => {
      return await this.context.get(endpoint('/gateways'))
    })
  }

  async createGatewayAPI(data: AutomationGateway): Promise<APIResponse> {
    return await test.step('Creating automation gateway', async () => {
      return await this.context.post(endpoint('/gateways'), { data })
    })
  }

  async getGatewayAPI(mac: string): Promise<APIResponse> {
    return await test.step(`Getting automation gateway ${mac}`, async () => {
      return await this.context.get(endpoint(`/gateways/${mac}`))
    })
  }

  async updateGatewayAPI(
    mac: string,
    data: Partial<AutomationGateway>,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation gateway ${mac}`, async () => {
      return await this.context.post(endpoint(`/gateways/${mac}`), { data })
    })
  }

  async deleteGatewayAPI(mac: string): Promise<APIResponse> {
    return await test.step(`Deleting automation gateway ${mac}`, async () => {
      return await this.context.delete(endpoint(`/gateways/${mac}`))
    })
  }

  async createExecutionAPI(
    data: AutomationExecutionCreateRequest,
  ): Promise<APIResponse> {
    return await test.step('Creating automation execution', async () => {
      return await this.context.post(endpoint('/executions'), { data })
    })
  }

  async listExecutionsAPI(params?: {
    page?: number
    limit?: number
    no_limit?: boolean
  }): Promise<APIResponse> {
    return await test.step('Listing automation executions', async () => {
      return await this.context.get(endpoint('/executions'), { params })
    })
  }

  async getExecutionAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Getting automation execution ${id}`, async () => {
      return await this.context.get(endpoint(`/executions/${id}`))
    })
  }

  async updateExecutionAPI(
    id: string | number,
    data: AutomationExecutionUpdateRequest,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation execution ${id}`, async () => {
      return await this.context.post(endpoint(`/executions/${id}`), { data })
    })
  }

  async deleteExecutionAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Deleting automation execution ${id}`, async () => {
      return await this.context.delete(endpoint(`/executions/${id}`))
    })
  }

  async createCellAPI(data: AutomationCellCreateRequest): Promise<APIResponse> {
    return await test.step('Creating automation cell', async () => {
      return await this.context.post(endpoint('/cells'), { data })
    })
  }

  async deleteCellAPI(id: number): Promise<APIResponse> {
    return await test.step(`Deleting automation cell ${id}`, async () => {
      return await this.context.delete(endpoint(`/cells/${id}`))
    })
  }

  async createConnectionAPI(
    data: AutomationConnectionCreateRequest,
  ): Promise<APIResponse> {
    return await test.step('Creating automation connection', async () => {
      return await this.context.post(endpoint('/connections'), { data })
    })
  }

  async listConnectionsAPI(params?: {
    page?: number
    limit?: number
  }): Promise<APIResponse> {
    return await test.step('Listing automation connections', async () => {
      return await this.context.get(endpoint('/connections'), { params })
    })
  }

  async getConnectionAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Getting automation connection ${id}`, async () => {
      return await this.context.get(endpoint(`/connections/${id}`))
    })
  }

  async updateConnectionAPI(
    id: string | number,
    data: Partial<AutomationConnectionCreateRequest>,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation connection ${id}`, async () => {
      return await this.context.post(endpoint(`/connections/${id}`), { data })
    })
  }

  async createManyConnectionsAPI(
    data: AutomationConnectionCreateRequest[],
  ): Promise<APIResponse> {
    return await test.step('Creating many automation connections', async () => {
      return await this.context.post(endpoint('/connections/bulk'), { data })
    })
  }

  async updateManyConnectionsAPI(
    data: Array<Partial<AutomationConnectionCreateRequest>>,
  ): Promise<APIResponse> {
    return await test.step('Updating many automation connections', async () => {
      return await this.context.put(endpoint('/connections/bulk'), { data })
    })
  }

  async deleteConnectionAPI(id: number): Promise<APIResponse> {
    return await test.step(`Deleting automation connection ${id}`, async () => {
      return await this.context.delete(endpoint(`/connections/${id}`))
    })
  }

  async createSceneAPI(
    data: AutomationSceneCreateRequest,
  ): Promise<APIResponse> {
    return await test.step('Creating automation scene', async () => {
      return await this.context.post(endpoint('/scenes'), { data })
    })
  }

  async listScenesAPI(params?: {
    page?: number
    limit?: number
    id?: string | number
    name?: string
    status?: string
    type?: string
    scene_type?: string
    no_limit?: boolean
    extra_fields?: string
  }): Promise<APIResponse> {
    return await test.step('Listing automation scenes', async () => {
      return await this.context.get(endpoint('/scenes'), { params })
    })
  }

  async getSceneAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Getting automation scene ${id}`, async () => {
      return await this.context.get(endpoint(`/scenes/${id}`))
    })
  }

  async getSceneDetailAPI(id: string | number): Promise<APIResponse> {
    return await test.step(
      `Getting automation scene ${id} expanded detail`,
      async () => {
        return await this.context.get(endpoint(`/scenes/${id}/detail`), {
          params: {
            extra_fields: 'device,scene,area',
          },
        })
      },
    )
  }

  async updateSceneAPI(
    id: string | number,
    data: AutomationSceneUpdateRequest,
  ): Promise<APIResponse> {
    return await test.step(`Updating automation scene ${id}`, async () => {
      return await this.context.post(endpoint(`/scenes/${id}`), { data })
    })
  }

  async syncSceneFromGatewayAPI(
    id: string | number,
    data: AutomationSceneSyncFromGatewayRequest,
  ): Promise<APIResponse> {
    return await test.step(`Syncing automation scene ${id} from gateway`, async () => {
      return await this.context.post(endpoint(`/scenes/${id}/sync-from-gateway`), {
        data,
      })
    })
  }

  async deleteSceneAPI(id: string | number): Promise<APIResponse> {
    return await test.step(`Deleting automation scene ${id}`, async () => {
      return await this.context.delete(endpoint(`/scenes/${id}`))
    })
  }

  async deleteManyScenesAPI(ids: Array<string | number>): Promise<APIResponse> {
    return await test.step('Deleting many automation scenes', async () => {
      return await this.context.delete(endpoint('/scenes'), { data: ids })
    })
  }

  async listTransformersAPI(): Promise<APIResponse> {
    return await test.step('Listing automation transformers', async () => {
      return await this.context.get(endpoint('/transformers'))
    })
  }
}
