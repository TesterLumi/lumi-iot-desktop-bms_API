# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\area-control\area-control.api.spec.ts >> Area Control API Real System TC1-TC19 >> TC4 - Tat khu vuc co thiet bi bat/tat lan lon
- Location: tests\e2e\area-control\area-control.api.spec.ts:1425:5

# Error details

```
Error: Device 120416080507841538 slot 1 should become false

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Test source

```ts
  608 |     return extractStatuses(body)
  609 |   }
  610 | 
  611 |   async getInitialDeviceState(token: string | undefined, deviceId: string) {
  612 |     const statuses = await this.getDeviceStatus(token, [deviceId])
  613 |     const device = statuses.find((item) => String(item.id) === String(deviceId))
  614 |     expect(device, `Device ${deviceId} status should exist`).toBeTruthy()
  615 |     return device?.status ?? []
  616 |   }
  617 | 
  618 |   async controlDevice(
  619 |     token: string | undefined,
  620 |     deviceId: string,
  621 |     states: AreaControlState[],
  622 |     step = 'Control device',
  623 |   ) {
  624 |     const response = await this.controlDeviceAPI(token, deviceId, states)
  625 |     await recordResponse(this.evidence, step, response, {
  626 |       method: 'POST',
  627 |       endpoint: this.env.deviceControlApi,
  628 |       request: { device_id: deviceId, states },
  629 |       baseUrl: this.env.gatewayBaseUrl,
  630 |     })
  631 |     return response
  632 |   }
  633 | 
  634 |   async controlDeviceWithHeaderOverrides(
  635 |     token: string | undefined,
  636 |     deviceId: string,
  637 |     states: AreaControlState[],
  638 |     overrides: { hcId?: string; omitHcId?: boolean },
  639 |     step = 'Control device with header overrides',
  640 |   ) {
  641 |     const response = await this.controlDeviceWithHeaderOverridesAPI(
  642 |       token,
  643 |       deviceId,
  644 |       states,
  645 |       overrides,
  646 |     )
  647 |     await recordResponse(this.evidence, step, response, {
  648 |       method: 'POST',
  649 |       endpoint: this.env.deviceControlApi,
  650 |       request: {
  651 |         device_id: deviceId,
  652 |         states,
  653 |         headers: overrides.omitHcId
  654 |           ? { 'x-hc-id': '<omitted>' }
  655 |           : { 'x-hc-id': overrides.hcId },
  656 |       },
  657 |       baseUrl: this.env.gatewayBaseUrl,
  658 |     })
  659 |     return response
  660 |   }
  661 | 
  662 |   async controlManyDevices(
  663 |     token: string | undefined,
  664 |     controls: Array<{ deviceId: string; states: AreaControlState[] }>,
  665 |   ) {
  666 |     const responses: APIResponse[] = []
  667 |     for (const control of controls) {
  668 |       responses.push(
  669 |         await this.controlDevice(
  670 |           token,
  671 |           control.deviceId,
  672 |           control.states,
  673 |           `Control device ${control.deviceId}`,
  674 |         ),
  675 |       )
  676 |     }
  677 |     return responses
  678 |   }
  679 | 
  680 |   async waitForDeviceState(
  681 |     token: string | undefined,
  682 |     deviceId: string,
  683 |     slot: number,
  684 |     expectedValue: AreaControlValue,
  685 |     timeoutMs = this.env.pollTimeoutMs,
  686 |   ) {
  687 |     const attempts = Math.max(1, Math.ceil(timeoutMs / this.env.pollIntervalMs))
  688 |     for (let attempt = 0; attempt < attempts; attempt += 1) {
  689 |       const statuses = await this.getDeviceStatus(token, [deviceId])
  690 |       if (getSlotValue(statuses, deviceId, slot) === expectedValue) {
  691 |         this.evidence?.attachStep({
  692 |           step: 'Polling device status matched',
  693 |           method: 'GET',
  694 |           endpoint: `${this.env.deviceStatusApi}?ids=${deviceId}`,
  695 |           response: statuses,
  696 |           status: 200,
  697 |           base_url: this.env.statusBaseUrl,
  698 |         })
  699 |         return statuses
  700 |       }
  701 |       await delay(this.env.pollIntervalMs)
  702 |     }
  703 | 
  704 |     const finalStatuses = await this.getDeviceStatus(token, [deviceId])
  705 |     expect(
  706 |       getSlotValue(finalStatuses, deviceId, slot),
  707 |       `Device ${deviceId} slot ${slot} should become ${String(expectedValue)}`,
> 708 |     ).toBe(expectedValue)
      |       ^ Error: Device 120416080507841538 slot 1 should become false
  709 |     return finalStatuses
  710 |   }
  711 | 
  712 |   async expectDeviceStateNotChanged(
  713 |     token: string | undefined,
  714 |     deviceId: string,
  715 |     slot: number,
  716 |     initialValue: AreaControlValue | undefined,
  717 |     timeoutMs = this.env.pollTimeoutMs,
  718 |   ) {
  719 |     const attempts = Math.max(1, Math.ceil(timeoutMs / this.env.pollIntervalMs))
  720 |     for (let attempt = 0; attempt < attempts; attempt += 1) {
  721 |       const statuses = await this.getDeviceStatus(token, [deviceId])
  722 |       expect(getSlotValue(statuses, deviceId, slot)).toBe(initialValue)
  723 |       await delay(this.env.pollIntervalMs)
  724 |     }
  725 |   }
  726 | 
  727 |   async resetDeviceState(
  728 |     token: string | undefined,
  729 |     deviceId: string,
  730 |     initialStates: Array<{ idx: string | number; value: AreaControlValue }>,
  731 |   ) {
  732 |     const states = initialStates.map((item) => ({
  733 |       idx: Number(item.idx),
  734 |       value: item.value,
  735 |     }))
  736 |     if (states.length === 0) {
  737 |       this.evidence?.attachCleanup({
  738 |         warning: `Skip reset ${deviceId}: initial state is empty`,
  739 |       })
  740 |       return
  741 |     }
  742 | 
  743 |     try {
  744 |       const response = await this.controlDevice(
  745 |         token,
  746 |         deviceId,
  747 |         states,
  748 |         'Reset device to initial state',
  749 |       )
  750 |       this.evidence?.attachCleanup({ device_reset: response.status() < 400 })
  751 |     } catch (error) {
  752 |       this.evidence?.attachCleanup({
  753 |         warning: `Reset ${deviceId} failed: ${formatError(error)}`,
  754 |       })
  755 |     }
  756 |   }
  757 | 
  758 |   async assertDeviceInArea(token: string | undefined, areaId: string, deviceId: string) {
  759 |     const devices = await this.listAreaDevices(token, areaId)
  760 |     expect(
  761 |       devices.some((device) => String(device.device_id ?? device.id) === deviceId),
  762 |       `Device ${deviceId} should belong to area ${areaId}`,
  763 |     ).toBe(true)
  764 |   }
  765 | 
  766 |   async assertDeviceNotInArea(
  767 |     token: string | undefined,
  768 |     areaId: string,
  769 |     deviceId: string,
  770 |   ) {
  771 |     const devices = await this.listAreaDevices(token, areaId)
  772 |     expect(
  773 |       devices.some((device) => String(device.device_id ?? device.id) === deviceId),
  774 |       `Device ${deviceId} should not belong to area ${areaId}`,
  775 |     ).toBe(false)
  776 |   }
  777 | }
  778 | 
  779 | const newAreaControlApi = async (
  780 |   areaControlEnv = getAreaControlEnv(),
  781 |   token?: string,
  782 | ) => {
  783 |   const areaHeaders = commonHeaders(token)
  784 |   const controlBaseHeaders = controlHeaders(token)
  785 |   const areaContext = await request.newContext({
  786 |     baseURL: areaControlEnv.baseUrl,
  787 |     extraHTTPHeaders: areaHeaders,
  788 |   })
  789 |   const deviceServiceContext = await request.newContext({
  790 |     baseURL: areaControlEnv.deviceServiceBaseUrl,
  791 |     extraHTTPHeaders: areaHeaders,
  792 |   })
  793 |   const controlContext = await request.newContext({
  794 |     baseURL: areaControlEnv.gatewayBaseUrl,
  795 |     extraHTTPHeaders: controlBaseHeaders,
  796 |   })
  797 |   const statusContext = await request.newContext({
  798 |     baseURL: areaControlEnv.statusBaseUrl,
  799 |     extraHTTPHeaders: areaHeaders,
  800 |   })
  801 | 
  802 |   return new AreaControlApiClient(
  803 |     areaContext,
  804 |     deviceServiceContext,
  805 |     controlContext,
  806 |     statusContext,
  807 |     areaControlEnv,
  808 |   )
```