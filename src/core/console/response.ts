export type ApiV0ErrorPayload = {
  code: string
  msg: string
  detail: any
}

export type ApiV0Response<T> = {
  success: boolean
  data?: T
  error?: ApiV0ErrorPayload
  timestamp: string
}
