import type { ServiceRecord } from '../db/services';

declare global {
  interface WorkerVariables {
    userId: string;
    serviceId: string;
    authType: 'appwrite' | 'apikey';
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
  }
}

export {};
