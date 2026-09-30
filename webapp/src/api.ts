// Centralized API Helper for connecting the Web App interface to any backend (e.g. Render.com)

const API_BASE_URL = (((import.meta as any).env?.VITE_API_BASE_URL as string) || '').replace(/\/$/, '');

export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = getApiUrl(endpoint);
  
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

  return fetch(url, {
    ...options,
    headers: mergedHeaders,
  });
}

