import { Hono } from 'hono'
import { v2ErrorHandler } from '../../middleware/v2Errors'
import filesV2 from './files'
import foldersV2 from './folders'

type V2Env = { Bindings: CloudflareBindings; Variables: WorkerVariables }

const v2 = new Hono<V2Env>()

v2.onError(v2ErrorHandler)

v2.route('/files', filesV2)
v2.route('/folders', foldersV2)

export default v2
