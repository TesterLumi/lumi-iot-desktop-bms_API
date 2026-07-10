export const SEC = 1000
export const MIN = 60 * SEC
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
