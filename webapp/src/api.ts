// Centralized API Helper for connecting the Web App interface to any backend (e.g. Render.com)

const API_BASE_URL = (((import.meta as any).env?.VITE_API_BASE_URL as string) || '').replace(/\/$/, '');

export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!API_BASE_URL) {
    return cleanEndpoint;
  }
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
    return res;
  } catch (err) {
    console.warn(`[apiFetch] Primary fetch to "${url}" failed:`, err);

    // If primary URL was external, fallback to relative URL on local server
    if (url !== relativeUrl) {
      try {
        console.warn(`[apiFetch] Retrying fetch on local relative endpoint "${relativeUrl}"...`);
        const fallbackRes = await fetch(relativeUrl, fetchOptions);
        return fallbackRes;
      } catch (fallbackErr) {
        console.error(`[apiFetch] Fallback fetch to "${relativeUrl}" also failed:`, fallbackErr);
      }
    }

    // Return a safe dummy Response object to prevent uncaught "Failed to fetch" crashes in callers
    return new Response(JSON.stringify({ error: 'Network error', message: 'Failed to connect to server' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


