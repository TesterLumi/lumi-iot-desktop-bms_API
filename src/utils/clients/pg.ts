import { Pool } from 'pg'

export class PostgresClient {
  private static instance: PostgresClient

  public static getInstance(): PostgresClient {
    if (!PostgresClient.instance) {
      PostgresClient.instance = new PostgresClient()
    }
    return PostgresClient.instance
  }

  private _pool: Pool
  private constructor() {
    // Initialize the connection pool with the PostgreSQL URI from the config
    this._pool = new Pool({
      connectionString: process.env.POSTGRES_URI,
    })
  }

  init = async () => {
    await this._pool.connect()
  }

  dispose = async () => {
    this._pool.end()
  }

  executeQuery = async (query: any, params: any) => {
    const result = await this._pool.query(query, params)
    return result.rows
  }
}
