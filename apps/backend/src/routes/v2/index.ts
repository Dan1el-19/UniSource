import { Hono } from 'hono'
import { v2RequestIdGuard } from '../../middleware/v2RequestIdGuard'
import { v2ErrorHandler } from '../../middleware/v2Errors'
import filesV2 from './files'
import filesLegacy from './files.legacy'
import foldersV2Legacy from './folders'

type V2Env = { Bindings: CloudflareBindings; Variables: WorkerVariables }

const v2 = new Hono<V2Env>()

// 1. Validate/sanitise X-Request-Id, set c.var.requestId + response header
v2.use('*', v2RequestIdGuard)
// 2. V2 error shape for all errors thrown inside this sub-app
v2.onError(v2ErrorHandler)

v2.route('/files', filesV2)
v2.route('/files', filesLegacy)
v2.route('/folders', foldersV2Legacy)

export default v2
