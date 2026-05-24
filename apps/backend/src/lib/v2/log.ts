import type { Context } from 'hono'

export function logV2Request(
  c: Context,
  start: number,
  extra?: { route_family?: string; operation?: string }
): void {
  const sampleRate = parseFloat(c.env.V2_LOG_SAMPLE_RATE ?? '0.1')
  const status = c.res.status
  const shouldLog = status >= 400 || Math.random() < sampleRate

  if (!shouldLog) {
    return
  }

  const ms = Date.now() - start
  const log = {
    request_id: c.var.requestId ?? 'unknown',
    method: c.req.method,
    path: c.req.path,
    status,
    ms,
    service_id: c.var.serviceId ?? 'unknown',
    user_id: c.var.userId ?? 'unknown',
    auth_type: c.var.authType ?? 'unknown',
    ...(extra?.route_family && { route_family: extra.route_family }),
    ...(extra?.operation && { operation: extra.operation }),
  }

  console.log(JSON.stringify(log))
}
