// Narrow external data without treating a type annotation as verification.

/** @param {unknown} value @returns {Record<string, unknown>} */
export function recordOf(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * The minimal HTTP response consumed by read-only adapters. JSON stays unknown
 * until each adapter validates it. Failed responses need no JSON method.
 * @typedef {{ok: boolean, status?: number, json?: () => Promise<unknown>}} JsonResponse
 * @typedef {(url: string | URL, init: RequestInit) => Promise<JsonResponse>} JsonFetch
 */
