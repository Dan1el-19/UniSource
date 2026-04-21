import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const hasAuth = event.cookies.get('unisource_auth');
	const path = event.url.pathname;

	const protectedPrefixes = ['/drive', '/settings', '/shared', '/trash', '/search', '/admin'];
	const isProtected = protectedPrefixes.some((prefix) => path.startsWith(prefix));

	if (hasAuth) {
		if (path === '/' || path === '/login') {
			redirect(302, '/drive');
		}
	} else {
		if (path === '/' || isProtected) {
			redirect(302, '/login');
		}
	}

	return resolve(event);
};
