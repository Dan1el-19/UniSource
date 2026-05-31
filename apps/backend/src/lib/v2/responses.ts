import type { Context } from 'hono';
import { wantsV2 } from './negotiation';

export type V2Page = { limit: number; next_cursor: string | null };

export function item<T>(value: T) {
  return { item: value };
}

export function list<T>(items: T[], page: V2Page) {
  return { items, page };
}

export function itemOrLegacy<T>(c: Context, value: T, legacy: Record<string, unknown>) {
  return wantsV2(c) ? item(value) : legacy;
}

export function listOrLegacy<T>(c: Context, values: T[], page: V2Page, legacyExtra: Record<string, unknown> = {}) {
  return wantsV2(c)
    ? list(values, page)
    : { items: values, next_cursor: page.next_cursor, limit: page.limit, ...legacyExtra };
}

export function unpaginatedListOrLegacy<T>(c: Context, values: T[], legacy: Record<string, unknown>) {
  return wantsV2(c) ? list(values, { limit: values.length, next_cursor: null }) : legacy;
}

export function actionOrLegacy<T extends Record<string, unknown>>(c: Context, action: T, legacy: Record<string, unknown>) {
  return wantsV2(c) ? item(action) : legacy;
}
