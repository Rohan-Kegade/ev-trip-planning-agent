export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Turns FastAPI error bodies ({detail: "..."} or a list of validation errors) into one message
const errorMessage = (body, fallback) => {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => String(d.msg).replace(/^Value error, /, '')).join(' ');
  }
  return fallback;
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Can’t reach the server. Is the FastAPI backend running?', 0);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(data, `Server error: ${response.statusText}`), response.status);
  return data;
}
