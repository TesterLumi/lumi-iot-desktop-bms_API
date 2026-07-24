import { join } from 'path'

export type SharedBmsEnv = {
  baseUrl: string
  apiKey: string
  clientVersion: string
  clientOs: string
  clientId: string
  language: string
  adminUsername: string
  adminPassword: string
  evidenceDir: string
}

export const getSharedBmsEnv = (
  evidenceEnvName: string,
  defaultEvidenceFolder: string,
): SharedBmsEnv => ({
  baseUrl:
    process.env.BASE_URL ||
    process.env.BMS_API_ENDPOINT ||
    'http://10.10.0.198:3332/api',
  apiKey:
    process.env.BMS_API_KEY ||
    process.env.API_KEY ||
    '',
  clientVersion: process.env.BMS_CLIENT_VERSION || '1.0.0',
  clientOs: process.env.BMS_CLIENT_OS || 'windows',
  clientId: process.env.BMS_CLIENT_ID || 'client-001',
  language: process.env.BMS_ACCEPT_LANGUAGE || 'vi',
  adminUsername:
    process.env.ADMIN_USERNAME || process.env.BMS_ADMIN_USERNAME || '',
  adminPassword:
    process.env.ADMIN_PASSWORD || process.env.BMS_ADMIN_PASSWORD || '',
  evidenceDir:
    process.env[evidenceEnvName] ||
    join(process.cwd(), 'test-runs', defaultEvidenceFolder, 'evidence'),
})

export const normalizeBmsBaseUrl = (value: string) => {
  const trimmed = value.replace(/\/+$/, '')
  const hasApiPath = new URL(trimmed).pathname
    .replace(/\/+$/, '')
    .endsWith('/api')

  return {
    baseUrl: `${trimmed}/`,
    hasApiPath,
    apiPrefix: hasApiPath ? 'v0' : 'api/v0',
    healthEndpoint: hasApiPath ? 'health' : 'api/health',
  }
}
