# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\automation-rules\rule-api-testcases.spec.ts >> Automation Rule API TC1-TC73 >> TC71 - Output action la nhieu device
- Location: tests\e2e\automation-rules\rule-api-testcases.spec.ts:86:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1814 | const setRuleSlots = async (
  1815 |   deviceValues: Array<[string | number, boolean]>,
  1816 | ) => {
  1817 |   for (const [deviceId, value] of deviceValues) {
  1818 |     await controlGatewayDevice({
  1819 |       deviceId,
  1820 |       slot: GATEWAY_DEVICE_SLOT,
  1821 |       value,
  1822 |     })
  1823 |     await waitForGatewaySlotValue(deviceId, GATEWAY_DEVICE_SLOT, value)
  1824 |   }
  1825 | }
  1826 | 
  1827 | const expectOutputAfterTrigger = async ({
  1828 |   inputDeviceId,
  1829 |   inputValue,
  1830 |   outputDeviceId,
  1831 |   expectedOutputValue,
  1832 | }: {
  1833 |   inputDeviceId: string | number
  1834 |   inputValue: boolean
  1835 |   outputDeviceId: string | number
  1836 |   expectedOutputValue: boolean
  1837 | }) => {
  1838 |   const evidence = await triggerRuleAndCollectEvidence({
  1839 |     inputDeviceId,
  1840 |     inputSlot: GATEWAY_DEVICE_SLOT,
  1841 |     inputValue,
  1842 |     outputDeviceId,
  1843 |     outputSlot: GATEWAY_DEVICE_SLOT,
  1844 |     initialOutputValue: !expectedOutputValue,
  1845 |     expectedOutputValue,
  1846 |     timeoutMs: 30000,
  1847 |   })
  1848 | 
  1849 |   console.log(JSON.stringify({ rule_runtime_evidence: evidence }))
  1850 |   await expect(evidence.outputMatched).toBe(true)
  1851 | }
  1852 | 
  1853 | const expectOutputUnchanged = async ({
  1854 |   inputDeviceId,
  1855 |   inputValue,
  1856 |   outputDeviceId,
  1857 |   outputValue,
  1858 | }: {
  1859 |   inputDeviceId: string | number
  1860 |   inputValue: boolean
  1861 |   outputDeviceId: string | number
  1862 |   outputValue: boolean
  1863 | }) => {
  1864 |   await controlGatewayDevice({
  1865 |     deviceId: outputDeviceId,
  1866 |     slot: GATEWAY_DEVICE_SLOT,
  1867 |     value: outputValue,
  1868 |   })
  1869 |   await controlGatewayDevice({
  1870 |     deviceId: inputDeviceId,
  1871 |     slot: GATEWAY_DEVICE_SLOT,
  1872 |     value: inputValue,
  1873 |   })
  1874 |   await new Promise((resolve) => setTimeout(resolve, 5000))
  1875 |   await expectGatewayOutput(outputDeviceId, outputValue, 1000)
  1876 | }
  1877 | 
  1878 | const expectGatewayOutput = async (
  1879 |   deviceId: string | number,
  1880 |   value: boolean,
  1881 |   timeoutMs = 30000,
  1882 | ) => {
  1883 |   await waitForGatewaySlotValue(deviceId, GATEWAY_DEVICE_SLOT, value, timeoutMs)
  1884 | }
  1885 | 
  1886 | const waitForGatewaySlotValue = async (
  1887 |   deviceId: string | number,
  1888 |   slot: number,
  1889 |   value: boolean,
  1890 |   timeoutMs = 30000,
  1891 | ) => {
  1892 |   const intervalMs = 1000
  1893 |   const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  1894 |   let statuses = await getGatewayDeviceStatus([deviceId])
  1895 |   let matched = hasGatewaySlotValue(statuses, deviceId, slot, value)
  1896 | 
  1897 |   for (let attempt = 0; attempt < attempts && !matched; attempt += 1) {
  1898 |     await new Promise((resolve) => setTimeout(resolve, intervalMs))
  1899 |     statuses = await getGatewayDeviceStatus([deviceId])
  1900 |     matched = hasGatewaySlotValue(statuses, deviceId, slot, value)
  1901 |   }
  1902 | 
  1903 |   console.log(
  1904 |     JSON.stringify({
  1905 |       rule_gateway_slot_check: {
  1906 |         device_id: deviceId,
  1907 |         slot,
  1908 |         expected: value,
  1909 |         matched,
  1910 |         statuses,
  1911 |       },
  1912 |     }),
  1913 |   )
> 1914 |   await expect(matched).toBe(true)
       |                         ^ Error: expect(received).toBe(expected) // Object.is equality
  1915 | }
  1916 | 
```