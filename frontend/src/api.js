export const API_URL =
  import.meta.env?.VITE_API_URL ||
  (typeof window === 'undefined' ? '' : window.location.origin);
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
export async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof URLSearchParams))
    headers['Content-Type'] = 'application/json';
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    const result = await fetch(`${API_URL}/api/auth/csrf`, {
      credentials: 'include',
      signal: options.signal,
    });
    if (!result.ok)
      throw new ApiError(
        'Could not secure your request. Please try again.',
        result.status,
      );
    headers['X-CSRF-Token'] = (await result.json()).token;
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = {
      LOGIN_BAD_CREDENTIALS: 'Email or password is incorrect.',
      LOGIN_USER_NOT_VERIFIED: 'Verify your email before signing in.',
      REGISTER_USER_ALREADY_EXISTS:
        'An account already uses this email. Sign in or reset your password.',
      VERIFY_USER_BAD_TOKEN:
        'This verification link is invalid or expired. Request another email.',
      RESET_PASSWORD_BAD_TOKEN:
        'This reset link is invalid or expired. Request another email.',
      OAUTH_USER_ALREADY_EXISTS:
        'Sign in to your existing account, then link Google from Account.',
    };
    const detail =
      typeof body.detail === 'string' ? body.detail : body.detail?.reason;
    const error = new ApiError(
      messages[detail] || detail || 'Please check the details and try again.',
      response.status,
    );
    error.code = body.detail?.code;
    throw error;
  }
  return body;
}
