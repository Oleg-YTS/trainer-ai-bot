// Centralized API Helper for connecting the Web App interface to any backend (e.g. Render.com)

const DEFAULT_BACKEND_URL = '';
const rawEnvUrl = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '';
const API_BASE_URL = (rawEnvUrl ? rawEnvUrl : DEFAULT_BACKEND_URL).replace(/\/$/, '');

export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = getApiUrl(endpoint);
  const relativeUrl = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  const initData = (window as any).Telegram?.WebApp?.initData || '';
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (initData) {
    defaultHeaders['X-Telegram-Init-Data'] = initData;
  }

  const mergedHeaders = {
    ...defaultHeaders,
    ...(options.headers as Record<string, string> || {}),
  };

  const fetchOptions = {
    ...options,
    headers: mergedHeaders,
  };

  try {
    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html') && url !== relativeUrl) {
      console.warn(`[apiFetch] Endpoint "${url}" returned HTML instead of JSON. Trying local fallback...`);
      const fallbackRes = await fetch(relativeUrl, fetchOptions);
      return fallbackRes;
    }
    return res;
  } catch (err) {
    console.warn(`[apiFetch] Primary fetch to "${url}" failed:`, err);

    if (url !== relativeUrl) {
      try {
        console.warn(`[apiFetch] Retrying fetch on local relative endpoint "${relativeUrl}"...`);
        const fallbackRes = await fetch(relativeUrl, fetchOptions);
        return fallbackRes;
      } catch (fallbackErr) {
        console.error(`[apiFetch] Fallback fetch to "${relativeUrl}" also failed:`, fallbackErr);
      }
    }

    return new Response(JSON.stringify({ error: 'Network error', message: 'Failed to connect to server' }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
    });
  }
}
