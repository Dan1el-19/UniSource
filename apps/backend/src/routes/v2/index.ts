import { Hono } from 'hono'
import { v2ErrorHandler } from '../../middleware/v2Errors'
import uploadV2 from './upload'
import adminFilesV2 from './adminFiles'
import foldersV2 from './folders'
import myFilesV2 from './myFiles'
import filesV2 from './files'
import adminV2 from './admin'
import mainStorageV2 from './mainStorage'
import releasesV2 from './releases'
import appV2 from './app'
import publicV2 from './public'
import sharesV2 from './shares'
import shareLinksV2 from './shareLinks'
import superadminV2 from './superadmin'

type V2Env = { Bindings: CloudflareBindings; Variables: WorkerVariables }

const v2 = new Hono<V2Env>()

v2.onError(v2ErrorHandler)

v2.route('/upload', uploadV2)
v2.route('/admin/files', adminFilesV2)
v2.route('/folders', foldersV2)
v2.route('/my-files', myFilesV2)
v2.route('/files', filesV2)
v2.route('/admin', adminV2)
v2.route('/main', mainStorageV2)
v2.route('/releases', releasesV2)
v2.route('/app', appV2)
v2.route('/public', publicV2)
v2.route('/shares', sharesV2)
// shareLinks router handles both /my-files/:fileId/share-links and /share-links/:linkId
v2.route('/', shareLinksV2)
v2.route('/superadmin', superadminV2)

export default v2
