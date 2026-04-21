import { account } from '../lib/appwrite';
import type { Models } from 'appwrite';

class AuthState {
  user = $state<Models.User<Models.Preferences> | null>(null);
  isLoading = $state(true);
  error = $state<string | null>(null);
  private sessionCheckPromise: Promise<Models.User<Models.Preferences> | null> | null = null;

  async checkSession(force = false) {
    if (this.sessionCheckPromise && !force) {
      return this.sessionCheckPromise;
    }

    this.isLoading = true;
    this.error = null;

    const pendingCheck = (async () => {
      try {
        const currentUser = await account.get();
        document.cookie = "unisource_auth=1; path=/; max-age=31536000; SameSite=Lax";
        this.user = currentUser;
        return currentUser;
      } catch {
        document.cookie = "unisource_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
        this.user = null;
        return null;
      } finally {
        this.isLoading = false;
        this.sessionCheckPromise = null;
      }
    })();

    this.sessionCheckPromise = pendingCheck;
    return pendingCheck;
  }

  async logout() {
    this.isLoading = true;
    this.error = null;
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch {
      this.error = 'Nie udało się wylogować, wystąpił błąd sesji.';
    } finally {
      document.cookie = "unisource_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
      this.user = null;
      this.isLoading = false;
      window.location.href = '/login';
    }
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    this.error = null;

    try {
      await account.createEmailPasswordSession({ email, password });
      const currentUser = await account.get();
      document.cookie = "unisource_auth=1; path=/; max-age=31536000; SameSite=Lax";
      this.user = currentUser;
      return currentUser;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Wystąpił błąd podczas logowania.';
      this.error = message;
      throw e;
    } finally {
      this.isLoading = false;
    }
  }
}

export const authState = new AuthState();
