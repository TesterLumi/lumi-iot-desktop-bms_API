import { PostgresClient } from '@src/utils'
import { HomeController } from './type'

export class HomeControllerDb {
  private _client: PostgresClient

  constructor(client: PostgresClient) {
    this._client = client
  }

  getHomeControllerById = async (
    id: string,
  ): Promise<HomeController | null> => {
    const query = 'SELECT * FROM home_controllers WHERE id = $1'
    const params = [id]
    const result = await this._client.executeQuery(query, params)
    if (result.length === 0) {
      return null
    }
    return result[0] as any as HomeController
  }

  getHomeControllerByMac = async (
    mac: string,
  ): Promise<HomeController | null> => {
    const query = 'SELECT * FROM home_controllers WHERE mac = $1'
    const params = [mac]
    const result = await this._client.executeQuery(query, params)
    if (result.length === 0) {
      return null
    }
    return result[0] as any as HomeController
  }

  getHomeControllerMqttStatus = async (id: string) => {
    const query = 'SELECT * FROM home_controller_mqtt_status WHERE hc_id = $1'
    const params = [id]
    const result = await this._client.executeQuery(query, params)
    if (result.length === 0) {
      return null
    }
    return (result[0] as any).connected as boolean
  }
}
