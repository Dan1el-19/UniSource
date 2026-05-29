import type { ServiceRecord } from '../db/services';

declare global {
  interface WorkerVariables {
    userId: string;
    serviceId: string;
    authType: 'appwrite' | 'apikey' | 'cf_access' | 'cf_access_service' | 'cf_access_dev';
    isAdmin: boolean;
    /**
     * Role of the authenticated user against the resolved service. `system`
     * indicates an API-key authenticated request (server-to-server).
     */
    serviceRole?: 'user' | 'plus' | 'admin' | 'system';
    actorId?: string;
    /** The Appwrite JWT used to authenticate this request. Set only for JWT-authenticated requests. */
    appwriteJwt?: string;
    /** Service config resolved from D1 by authMiddleware. Always present after auth completes. */
    service?: ServiceRecord;
    /** V2 request ID for tracing, set by v2RequestIdGuard. */
    requestId?: string;
    /** CF Access user info, set by cfAccessMiddleware for superadmin routes. */
    cfAccessUser?: { email: string; sub: string };
  }
}

export {};
