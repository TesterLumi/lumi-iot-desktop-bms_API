# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\group-management\group-management.api.spec.ts >> Group Management API Real HC TC1-TC69 >> TC27 - Gan 1 thiet bi vao group thuong
- Location: tests\e2e\group-management\group-management.api.spec.ts:82:5

# Error details

```
Error: Expected status 404 in 200,201,204

expect(received).toContain(expected) // indexOf

Expected value: 404
Received array: [200, 201, 204]
```

# Test source

```ts
  585 |   expectedSlot,
  586 |   expectedValue,
  587 | }: {
  588 |   client: GroupApiClient
  589 |   context: GroupTestContext
  590 |   groupId: string | number
  591 |   deviceIds: Array<string | number>
  592 |   states: GroupState[]
  593 |   expectedSlot: number
  594 |   expectedValue: GroupStateValue
  595 | }) => {
  596 |   const before = await getDeviceStatus(client, deviceIds)
  597 |   attachGroupStep(context, {
  598 |     step: 'Get initial device status',
  599 |     method: 'GET',
  600 |     endpoint: GROUP_DEVICE_STATUS_API,
  601 |     response: before,
  602 |   })
  603 | 
  604 |   const control = await client.controlGroupOrDevicesAPI(groupId, deviceIds, states)
  605 |   await recordGroupResponse(context, `Control group mode=${control.mode}`, control.response, {
  606 |     method: 'POST',
  607 |     endpoint: `${GROUP_API_BASE}/${groupId}/control`,
  608 |     request: { states },
  609 |   })
  610 |   for (const deviceResponse of control.deviceResponses) {
  611 |     await recordGroupResponse(context, 'Fallback control device', deviceResponse, {
  612 |       method: 'POST',
  613 |       endpoint: GROUP_DEVICE_CONTROL_API,
  614 |       request: { states },
  615 |     })
  616 |   }
  617 |   if (control.mode === 'group') {
  618 |     expect([200, 202]).toContain(control.response.status())
  619 |   } else {
  620 |     for (const deviceResponse of control.deviceResponses) {
  621 |       expect([200, 202]).toContain(deviceResponse.status())
  622 |     }
  623 |   }
  624 | 
  625 |   await waitForManyDeviceStates(client, deviceIds, expectedSlot, expectedValue)
  626 |   const after = await getDeviceStatus(client, deviceIds)
  627 |   attachGroupStep(context, {
  628 |     step: 'Get device status after group control',
  629 |     method: 'GET',
  630 |     endpoint: GROUP_DEVICE_STATUS_API,
  631 |     response: after,
  632 |   })
  633 |   attachGroupAssertion(
  634 |     context,
  635 |     `All devices have slot ${expectedSlot}=${String(expectedValue)} after group control`,
  636 |   )
  637 |   return { before, control, after }
  638 | }
  639 | 
  640 | export const waitForGroupSyncedToHC = async (
  641 |   client: GroupApiClient,
  642 |   groupId: string | number,
  643 |   timeoutMs = SYNC_TIMEOUT_MS,
  644 | ) =>
  645 |   await pollUntil(async () => {
  646 |     const response = await client.getGroupsFromHCAPI()
  647 |     if (response.status() !== 200) {
  648 |       return null
  649 |     }
  650 |     const groups = extractItems(await safeJson(response))
  651 |     return groups.some((item) => String(extractId(item)) === String(groupId))
  652 |       ? groups
  653 |       : null
  654 |   }, timeoutMs)
  655 | 
  656 | export const waitForGroupDeletedFromHC = async (
  657 |   client: GroupApiClient,
  658 |   groupId: string | number,
  659 |   timeoutMs = SYNC_TIMEOUT_MS,
  660 | ) =>
  661 |   await pollUntil(async () => {
  662 |     const response = await client.getGroupsFromHCAPI()
  663 |     if (response.status() !== 200) {
  664 |       return null
  665 |     }
  666 |     const groups = extractItems(await safeJson(response))
  667 |     return groups.some((item) => String(extractId(item)) === String(groupId))
  668 |       ? null
  669 |       : groups
  670 |   }, timeoutMs)
  671 | 
  672 | export const probeUrl = async (baseUrl: string) => {
  673 |   const context = await playwrightRequest.newContext()
  674 |   try {
  675 |     const response = await context.get(baseUrl, { timeout: 5000 })
  676 |     return { ok: response.status() < 500, status: response.status() }
  677 |   } catch (error) {
  678 |     return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  679 |   } finally {
  680 |     await context.dispose()
  681 |   }
  682 | }
  683 | 
  684 | export const expectAllowedStatus = (status: number, accepted: number[]) => {
> 685 |   expect(accepted, `Expected status ${status} in ${accepted.join(',')}`).toContain(status)
      |                                                                          ^ Error: Expected status 404 in 200,201,204
  686 | }
  687 | 
  688 | export const expectGroupListShape = (body: unknown) => {
  689 |   expect(Array.isArray(extractItems(body))).toBe(true)
  690 | }
  691 | 
  692 | export const expectGroupDetailShape = (body: unknown) => {
  693 |   const data = extractData(body)
  694 |   expect(extractId(data)).toBeTruthy()
  695 |   expect(asRecord(data)).toHaveProperty('name')
  696 | }
  697 | 
  698 | export const extractId = (body: unknown): string | number | undefined => {
  699 |   const record = asRecord(body)
  700 |   const data = asRecord(record.data)
  701 |   return record.id as string | number | undefined ??
  702 |     data.id as string | number | undefined ??
  703 |     data.group_id as string | number | undefined
  704 | }
  705 | 
  706 | export const extractData = (body: unknown) => {
  707 |   const record = asRecord(body)
  708 |   return record.data ?? body
  709 | }
  710 | 
  711 | export const extractItems = (body: unknown): Record<string, unknown>[] => {
  712 |   if (Array.isArray(body)) {
  713 |     return body as Record<string, unknown>[]
  714 |   }
  715 |   const data = asRecord(body).data
  716 |   if (Array.isArray(data)) {
  717 |     return data as Record<string, unknown>[]
  718 |   }
  719 |   const nested = asRecord(data)
  720 |   if (Array.isArray(nested.items)) {
  721 |     return nested.items as Record<string, unknown>[]
  722 |   }
  723 |   if (Array.isArray(nested.data)) {
  724 |     return nested.data as Record<string, unknown>[]
  725 |   }
  726 |   return []
  727 | }
  728 | 
  729 | export const normalizeStatuses = (body: unknown): DeviceStatus[] => {
  730 |   if (Array.isArray(body)) {
  731 |     return body as DeviceStatus[]
  732 |   }
  733 |   const data = asRecord(body).data
  734 |   if (Array.isArray(data)) {
  735 |     return data as DeviceStatus[]
  736 |   }
  737 |   const items = asRecord(data).items
  738 |   return Array.isArray(items) ? items as DeviceStatus[] : []
  739 | }
  740 | 
  741 | export const getSlotValue = (
  742 |   statuses: DeviceStatus[],
  743 |   deviceId: string | number,
  744 |   slot: string | number,
  745 | ) => {
  746 |   const device = statuses.find((item) => String(item.id) === String(deviceId))
  747 |   return device?.status?.find((item) => Number(item.idx) === Number(slot))?.value
  748 | }
  749 | 
  750 | export const safeJson = async (response: { json: () => Promise<unknown> }) => {
  751 |   try {
  752 |     return await response.json()
  753 |   } catch {
  754 |     return null
  755 |   }
  756 | }
  757 | 
  758 | export const asRecord = (value: unknown): Record<string, unknown> =>
  759 |   typeof value === 'object' && value !== null
  760 |     ? value as Record<string, unknown>
  761 |     : {}
  762 | 
  763 | const compactQuery = (query?: Record<string, string | number | boolean | undefined>) =>
  764 |   Object.fromEntries(
  765 |     Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== ''),
  766 |   ) as Record<string, string | number | boolean>
  767 | 
  768 | const absoluteUrl = (baseUrl: string, endpoint: string) => {
  769 |   if (/^https?:\/\//i.test(endpoint)) {
  770 |     return endpoint
  771 |   }
  772 |   return `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`
  773 | }
  774 | 
  775 | const envTokenFor = (userType: 'admin' | 'viewer' | 'no_permission') => {
  776 |   if (userType === 'admin') {
  777 |     return process.env.GROUP_ADMIN_ACCESS_TOKEN || process.env.BMS_ACCESS_TOKEN || process.env.BMS_ROOT_ACCESS_TOKEN || ''
  778 |   }
  779 |   if (userType === 'viewer') {
  780 |     return process.env.GROUP_VIEWER_ACCESS_TOKEN || process.env.BMS_VIEWER_ACCESS_TOKEN || ''
  781 |   }
  782 |   return process.env.GROUP_NO_PERMISSION_ACCESS_TOKEN || process.env.BMS_NO_PERMISSION_ACCESS_TOKEN || ''
  783 | }
  784 | 
  785 | const pollUntil = async <T>(
```