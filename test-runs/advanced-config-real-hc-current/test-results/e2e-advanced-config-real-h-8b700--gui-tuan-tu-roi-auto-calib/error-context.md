# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\advanced-config-real-hc\advanced-config-real-hc.spec.ts >> Advanced config real HC >> TC-AC-064 - Presence environment preset other gui tuan tu roi auto_calib
- Location: tests\e2e\advanced-config-real-hc\advanced-config-real-hc.spec.ts:456:5

# Error details

```
TimeoutError: apiRequestContext.get: Timeout 10000ms exceeded.
Call log:
  - → GET http://10.10.30.154:8080/api/devices
    - user-agent: Playwright/1.60.0 (x64; windows 10.0) node/24.16
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - x-hc-id: 4932308540097724437
    - x-request-id: advanced-config-1785903142957
    - x-user-id: automation-test
    - x-app-id: bms-e2e-test

```

# Test source

```ts
  95  |   hcLogPath: process.env.HC_LOG_PATH || '/tmp/log/home-controller.log',
  96  |   hcLogTailLines: Number(process.env.HC_LOG_TAIL_LINES || '300'),
  97  |   hcLogMaxChars: Number(process.env.HC_LOG_MAX_CHARS || '60000'),
  98  |   hcSshReadyTimeoutMs: Number(process.env.HC_SSH_READY_TIMEOUT_MS || '15000'),
  99  | })
  100 | 
  101 | export class AdvancedConfigEvidence {
  102 |   private steps: EvidenceStep[] = []
  103 |   private assertions: string[] = []
  104 |   private hcLogs: HcLogEvidence[] = []
  105 |   private cleanup = {
  106 |     restored_keys: [] as string[],
  107 |     warnings: [] as string[],
  108 |   }
  109 | 
  110 |   readonly startedAt = new Date().toISOString()
  111 | 
  112 |   constructor(
  113 |     private testInfo: TestInfo,
  114 |     private tcId: string,
  115 |     private tcName: string,
  116 |     private env: AdvancedConfigEnv,
  117 |   ) {}
  118 | 
  119 |   attachStep(step: EvidenceStep) {
  120 |     this.steps.push(redactSecrets(step) as EvidenceStep)
  121 |   }
  122 | 
  123 |   attachAssertion(assertion: string) {
  124 |     this.assertions.push(assertion)
  125 |   }
  126 | 
  127 |   attachRestoredKey(key: string) {
  128 |     this.cleanup.restored_keys.push(key)
  129 |   }
  130 | 
  131 |   attachCleanupWarning(warning: string) {
  132 |     this.cleanup.warnings.push(warning)
  133 |   }
  134 | 
  135 |   attachHcLog(log: HcLogEvidence) {
  136 |     this.hcLogs.push(log)
  137 |   }
  138 | 
  139 |   async save(status: AdvancedConfigEvidenceStatus, error?: unknown) {
  140 |     await mkdir(EVIDENCE_DIR, { recursive: true })
  141 |     const finishedAt = new Date().toISOString()
  142 |     if (status === 'FAILED') {
  143 |       await collectHcLog(this, this.env, this.startedAt, finishedAt)
  144 |     }
  145 | 
  146 |     const filename = `${this.tcId}_${slug(this.tcName)}_${Date.now()}.json`
  147 |     const evidence = {
  148 |       tc_id: this.tcId,
  149 |       tc_name: this.tcName,
  150 |       status,
  151 |       started_at: this.startedAt,
  152 |       finished_at: finishedAt,
  153 |       endpoints: {
  154 |         base_url: this.env.baseUrl,
  155 |         config_api: '/api/devices/config',
  156 |         cmd_api: '/api/devices/cmd',
  157 |         devices_api: '/api/devices',
  158 |       },
  159 |       steps: this.steps,
  160 |       assertions: this.assertions,
  161 |       cleanup: this.cleanup,
  162 |       hc_logs: this.hcLogs,
  163 |       error_message:
  164 |         error instanceof Error
  165 |           ? error.message
  166 |           : error
  167 |             ? String(error)
  168 |             : undefined,
  169 |     }
  170 |     const body = JSON.stringify(redactSecrets(evidence), null, 2)
  171 |     await writeFile(path.join(EVIDENCE_DIR, filename), body, 'utf8')
  172 |     await this.testInfo.attach(filename, {
  173 |       body,
  174 |       contentType: 'application/json',
  175 |     })
  176 |   }
  177 | }
  178 | 
  179 | export class AdvancedConfigApiClient {
  180 |   constructor(
  181 |     private context: APIRequestContext,
  182 |     private env: AdvancedConfigEnv,
  183 |     private evidence?: AdvancedConfigEvidence,
  184 |   ) {}
  185 | 
  186 |   withEvidence(evidence: AdvancedConfigEvidence) {
  187 |     return new AdvancedConfigApiClient(this.context, this.env, evidence)
  188 |   }
  189 | 
  190 |   async dispose() {
  191 |     await this.context.dispose()
  192 |   }
  193 | 
  194 |   async listDevicesAPI() {
> 195 |     return this.context.get('/api/devices', {
      |                         ^ TimeoutError: apiRequestContext.get: Timeout 10000ms exceeded.
  196 |       headers: requestHeaders(this.env),
  197 |       timeout: 10_000,
  198 |     })
  199 |   }
  200 | 
  201 |   async getDeviceConfigAPI(deviceId: string | number) {
  202 |     return this.context.get(`/api/devices/${deviceId}/config`, {
  203 |       headers: requestHeaders(this.env),
  204 |       timeout: 10_000,
  205 |     })
  206 |   }
  207 | 
  208 |   async getDeviceDetailAPI(deviceId: string | number) {
  209 |     return this.context.get(`/api/devices/${deviceId}`, {
  210 |       headers: requestHeaders(this.env),
  211 |       timeout: 10_000,
  212 |     })
  213 |   }
  214 | 
  215 |   async setConfigAPI(
  216 |     deviceId: string | number,
  217 |     config: Record<string, unknown>,
  218 |   ) {
  219 |     return this.context.post('/api/devices/config', {
  220 |       headers: requestHeaders(this.env),
  221 |       timeout: 20_000,
  222 |       data: {
  223 |         device_id: String(deviceId),
  224 |         config,
  225 |       },
  226 |     })
  227 |   }
  228 | 
  229 |   async commandAPI(
  230 |     deviceId: string | number,
  231 |     cmd: string,
  232 |     params: Record<string, unknown> = {},
  233 |   ) {
  234 |     return this.context.post('/api/devices/cmd', {
  235 |       headers: requestHeaders(this.env),
  236 |       timeout: 20_000,
  237 |       data: {
  238 |         device_id: String(deviceId),
  239 |         cmd,
  240 |         params,
  241 |       },
  242 |     })
  243 |   }
  244 | 
  245 |   async listDevices(step = 'List devices') {
  246 |     const response = await this.listDevicesAPI()
  247 |     const body = await recordResponse(this.evidence, step, response, {
  248 |       method: 'GET',
  249 |       endpoint: '/api/devices',
  250 |       baseUrl: this.env.baseUrl,
  251 |     })
  252 |     expect(response.status()).toBe(200)
  253 |     return extractItems(body)
  254 |   }
  255 | 
  256 |   async readDeviceConfig(
  257 |     deviceId: string | number,
  258 |     step = 'Read device config',
  259 |   ) {
  260 |     const response = await this.getDeviceConfigAPI(deviceId)
  261 |     const body = await safeJson(response)
  262 |     if (response.status() === 200) {
  263 |       this.evidence?.attachStep({
  264 |         step,
  265 |         method: 'GET',
  266 |         endpoint: `/api/devices/${deviceId}/config`,
  267 |         base_url: this.env.baseUrl,
  268 |         response: body,
  269 |         status: response.status(),
  270 |       })
  271 |       return extractConfig(body)
  272 |     }
  273 | 
  274 |     const detailResponse = await this.getDeviceDetailAPI(deviceId)
  275 |     const detailBody = await recordResponse(
  276 |       this.evidence,
  277 |       `${step} fallback detail`,
  278 |       detailResponse,
  279 |       {
  280 |         method: 'GET',
  281 |         endpoint: `/api/devices/${deviceId}`,
  282 |         baseUrl: this.env.baseUrl,
  283 |       },
  284 |     )
  285 |     if (detailResponse.status() === 200) {
  286 |       return extractConfig(detailBody)
  287 |     }
  288 | 
  289 |     const devices = await this.listDevices(`${step} fallback list devices`)
  290 |     const device = devices.find((item) => String(item.id) === String(deviceId))
  291 |     expect(
  292 |       device,
  293 |       `Device ${String(deviceId)} must exist in /api/devices`,
  294 |     ).toBeTruthy()
  295 |     return extractConfig(device)
```