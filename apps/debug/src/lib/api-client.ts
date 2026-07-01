import type { ApiResponse } from '../types/api';

const BASE_URL = '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const json: ApiResponse<T> = await response.json();
  if (json.error) {
    throw new Error(json.error);
  }
  if (json.data === null) {
    throw new Error('API returned null data');
  }
  return json.data;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const json: ApiResponse<T> = await response.json();
  if (json.error) {
    throw new Error(json.error);
  }
  if (json.data === null) {
    throw new Error('API returned null data');
  }
  return json.data;
}
