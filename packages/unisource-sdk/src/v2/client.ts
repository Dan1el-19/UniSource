import { createV2Request } from './transport'
import { createAdminResource } from './resources/admin'
import { createAppResource } from './resources/app'
import { createFilesResource } from './resources/files'
import { createFoldersResource } from './resources/folders'
import { createMainStorageResource } from './resources/main-storage'
import { createMyFilesResource } from './resources/my-files'
import { createPublicResource } from './resources/public'
import { createShareLinksResource } from './resources/share-links'
import { createSharesResource } from './resources/shares'
import { createUploadResource } from './resources/upload'
import { createUserFilesResource } from './resources/user-files'

let warned = false

export interface UnisourceV2ClientConfig {
  baseUrl: string
  serviceId: string
  /**
   * JWT/user auth: token fetched per request (frontend, auto-refresh).
   * Mutually exclusive with apiKey.
   */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>
  /**
   * API key auth: static secret from env (server-to-server, no refresh).
   * Mutually exclusive with getToken.
   */
  apiKey?: string
  /** Set to true to suppress the beta warning in console */
  silentBeta?: boolean
}

export class UnisourceV2Client {
  readonly files: ReturnType<typeof createFilesResource>
  readonly shares: ReturnType<typeof createSharesResource>
  readonly app: ReturnType<typeof createAppResource>
  readonly shareLinks: ReturnType<typeof createShareLinksResource>
  readonly folders: ReturnType<typeof createFoldersResource>
  readonly mainStorage: ReturnType<typeof createMainStorageResource>
  readonly myFiles: ReturnType<typeof createMyFilesResource>
  readonly userFiles: ReturnType<typeof createUserFilesResource>
  readonly admin: ReturnType<typeof createAdminResource>
  readonly public: ReturnType<typeof createPublicResource>
  readonly upload: ReturnType<typeof createUploadResource>

  constructor(config: UnisourceV2ClientConfig) {
    if (config.apiKey && config.getToken) {
      throw new Error(
        'UnisourceV2Client: provide either apiKey or getToken, not both'
      )
    }

    if (!warned && !config.silentBeta) {
      console.warn(
        '[unisource-sdk] V2 API is in beta. Breaking changes possible. ' +
        'See https://docs.unisource.example/v2 for stability commitments.'
      )
      warned = true
    }

    const request = createV2Request(config)
    this.files = createFilesResource(request)
    this.shares = createSharesResource(request)
    this.app = createAppResource(request)
    this.shareLinks = createShareLinksResource(request)
    this.folders = createFoldersResource(request)
    this.mainStorage = createMainStorageResource(request)
    this.myFiles = createMyFilesResource(request)
    this.userFiles = createUserFilesResource(request)
    this.admin = createAdminResource(request)
    this.public = createPublicResource(request, config.baseUrl)
    this.upload = createUploadResource(request)
  }
}
