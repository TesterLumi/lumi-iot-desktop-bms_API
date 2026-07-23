# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\group-management\group-management.api.spec.ts >> Group Management API Real HC TC1-TC123 >> TC56 - Dieu khien lien tiep nhieu lan
- Location: tests\e2e\group-management\group-management.api.spec.ts:82:5

# Error details

```
Error: Expected status 404 in 200,202

expect(received).toContain(expected) // indexOf

Expected value: 404
Received array: [200, 202]
```

# Test source

```ts
  651 |   expectedSlot,
  652 |   expectedValue,
  653 | }: {
  654 |   client: GroupApiClient
  655 |   context: GroupTestContext
  656 |   groupId: string | number
  657 |   deviceIds: Array<string | number>
  658 |   states: GroupState[]
  659 |   expectedSlot: number
  660 |   expectedValue: GroupStateValue
  661 | }) => {
  662 |   const before = await getDeviceStatus(client, deviceIds)
  663 |   attachGroupStep(context, {
  664 |     step: 'Get initial device status',
  665 |     method: 'GET',
  666 |     endpoint: GROUP_DEVICE_STATUS_API,
  667 |     response: before,
  668 |   })
  669 | 
  670 |   const control = await client.controlGroupOrDevicesAPI(groupId, deviceIds, states)
  671 |   await recordGroupResponse(context, `Control group mode=${control.mode}`, control.response, {
  672 |     method: 'POST',
  673 |     endpoint: `${GROUP_API_BASE}/${groupId}/control`,
  674 |     request: { states },
  675 |   })
  676 |   for (const deviceResponse of control.deviceResponses) {
  677 |     await recordGroupResponse(context, 'Fallback control device', deviceResponse, {
  678 |       method: 'POST',
  679 |       endpoint: GROUP_DEVICE_CONTROL_API,
  680 |       request: { states },
  681 |     })
  682 |   }
  683 |   if (control.mode === 'group') {
  684 |     expect([200, 202]).toContain(control.response.status())
  685 |   } else {
  686 |     for (const deviceResponse of control.deviceResponses) {
  687 |       expect([200, 202]).toContain(deviceResponse.status())
  688 |     }
  689 |   }
  690 | 
  691 |   await waitForManyDeviceStates(client, deviceIds, expectedSlot, expectedValue)
  692 |   const after = await getDeviceStatus(client, deviceIds)
  693 |   attachGroupStep(context, {
  694 |     step: 'Get device status after group control',
  695 |     method: 'GET',
  696 |     endpoint: GROUP_DEVICE_STATUS_API,
  697 |     response: after,
  698 |   })
  699 |   attachGroupAssertion(
  700 |     context,
  701 |     `All devices have slot ${expectedSlot}=${String(expectedValue)} after group control`,
  702 |   )
  703 |   return { before, control, after }
  704 | }
  705 | 
  706 | export const waitForGroupSyncedToHC = async (
  707 |   client: GroupApiClient,
  708 |   groupId: string | number,
  709 |   timeoutMs = SYNC_TIMEOUT_MS,
  710 | ) =>
  711 |   await pollUntil(async () => {
  712 |     const response = await client.getGroupsFromHCAPI()
  713 |     if (response.status() !== 200) {
  714 |       return null
  715 |     }
  716 |     const groups = extractItems(await safeJson(response))
  717 |     return groups.some((item) => String(extractId(item)) === String(groupId))
  718 |       ? groups
  719 |       : null
  720 |   }, timeoutMs)
  721 | 
  722 | export const waitForGroupDeletedFromHC = async (
  723 |   client: GroupApiClient,
  724 |   groupId: string | number,
  725 |   timeoutMs = SYNC_TIMEOUT_MS,
  726 | ) =>
  727 |   await pollUntil(async () => {
  728 |     const response = await client.getGroupsFromHCAPI()
  729 |     if (response.status() !== 200) {
  730 |       return null
  731 |     }
  732 |     const groups = extractItems(await safeJson(response))
  733 |     return groups.some((item) => String(extractId(item)) === String(groupId))
  734 |       ? null
  735 |       : groups
  736 |   }, timeoutMs)
  737 | 
  738 | export const probeUrl = async (baseUrl: string) => {
  739 |   const context = await playwrightRequest.newContext()
  740 |   try {
  741 |     const response = await context.get(baseUrl, { timeout: 5000 })
  742 |     return { ok: response.status() < 500, status: response.status() }
  743 |   } catch (error) {
  744 |     return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  745 |   } finally {
  746 |     await context.dispose()
  747 |   }
  748 | }
  749 | 
  750 | export const expectAllowedStatus = (status: number, accepted: number[]) => {
> 751 |   expect(accepted, `Expected status ${status} in ${accepted.join(',')}`).toContain(status)
      |                                                                          ^ Error: Expected status 404 in 200,202
  752 | }
  753 | 
  754 | export const expectGroupListShape = (body: unknown) => {
  755 |   expect(Array.isArray(extractItems(body))).toBe(true)
  756 | }
  757 | 
  758 | export const expectGroupDetailShape = (body: unknown) => {
  759 |   const data = extractData(body)
  760 |   expect(extractId(data)).toBeTruthy()
  761 |   expect(asRecord(data)).toHaveProperty('name')
  762 | }
  763 | 
  764 | export const extractId = (body: unknown): string | number | undefined => {
  765 |   const record = asRecord(body)
  766 |   const data = asRecord(record.data)
  767 |   return record.id as string | number | undefined ??
  768 |     data.id as string | number | undefined ??
  769 |     data.group_id as string | number | undefined
  770 | }
  771 | 
  772 | export const extractData = (body: unknown) => {
  773 |   const record = asRecord(body)
  774 |   return record.data ?? body
  775 | }
  776 | 
  777 | export const extractItems = (body: unknown): Record<string, unknown>[] => {
  778 |   if (Array.isArray(body)) {
  779 |     return body as Record<string, unknown>[]
  780 |   }
  781 |   const data = asRecord(body).data
  782 |   if (Array.isArray(data)) {
  783 |     return data as Record<string, unknown>[]
  784 |   }
  785 |   const nested = asRecord(data)
  786 |   if (Array.isArray(nested.items)) {
  787 |     return nested.items as Record<string, unknown>[]
  788 |   }
  789 |   if (Array.isArray(nested.data)) {
  790 |     return nested.data as Record<string, unknown>[]
  791 |   }
  792 |   return []
  793 | }
  794 | 
  795 | export const normalizeStatuses = (body: unknown): DeviceStatus[] => {
  796 |   if (Array.isArray(body)) {
  797 |     return body as DeviceStatus[]
  798 |   }
  799 |   const data = asRecord(body).data
  800 |   if (Array.isArray(data)) {
  801 |     return data as DeviceStatus[]
  802 |   }
  803 |   const items = asRecord(data).items
  804 |   return Array.isArray(items) ? items as DeviceStatus[] : []
  805 | }
  806 | 
  807 | export const getSlotValue = (
  808 |   statuses: DeviceStatus[],
  809 |   deviceId: string | number,
  810 |   slot: string | number,
  811 | ) => {
  812 |   const device = statuses.find((item) => String(item.id) === String(deviceId))
  813 |   return device?.status?.find((item) => Number(item.idx) === Number(slot))?.value
  814 | }
  815 | 
  816 | export const safeJson = async (response: { json: () => Promise<unknown> }) => {
  817 |   try {
  818 |     return await response.json()
  819 |   } catch {
  820 |     return null
  821 |   }
  822 | }
  823 | 
  824 | export const asRecord = (value: unknown): Record<string, unknown> =>
  825 |   typeof value === 'object' && value !== null
  826 |     ? value as Record<string, unknown>
  827 |     : {}
  828 | 
  829 | const compactQuery = (query?: Record<string, string | number | boolean | undefined>) =>
  830 |   Object.fromEntries(
  831 |     Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== ''),
  832 |   ) as Record<string, string | number | boolean>
  833 | 
  834 | const absoluteUrl = (baseUrl: string, endpoint: string) => {
  835 |   if (/^https?:\/\//i.test(endpoint)) {
  836 |     return endpoint
  837 |   }
  838 |   return `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`
  839 | }
  840 | 
  841 | const getRequestedDeviceIds = (payload: unknown): Array<string | number> => {
  842 |   const attr = asRecord(asRecord(payload).attr)
  843 |   const value = attr.requested_device_ids
  844 |   return Array.isArray(value) ? value as Array<string | number> : []
  845 | }
  846 | 
  847 | const envTokenFor = (userType: 'admin' | 'viewer' | 'no_permission') => {
  848 |   if (userType === 'admin') {
  849 |     return process.env.GROUP_ADMIN_ACCESS_TOKEN || process.env.BMS_ACCESS_TOKEN || process.env.BMS_ROOT_ACCESS_TOKEN || ''
  850 |   }
  851 |   if (userType === 'viewer') {
```