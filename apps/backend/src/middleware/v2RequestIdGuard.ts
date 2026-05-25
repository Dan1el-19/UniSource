import { createMiddleware } from 'hono/factory'

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/

export const v2RequestIdGuard = createMiddleware(async (c, next) => {
  const incoming = c.req.header('X-Request-Id')
  const requestId =
    incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)
  await next()
})
