export const SERVICE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again shortly.';

/** Normalize transport and server failures while preserving useful 4xx messages. */
export function normalizeApiError(error) {
  if (!error || error.code === 'ERR_CANCELED') return error;

  const status = error.response?.status;
  const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
  const unavailable = !error.response || status >= 500 || timedOut;
  if (!unavailable) return error;

  const response = {
    ...(error.response || {}),
    status,
    data: {
      ...(error.response?.data && typeof error.response.data === 'object'
        ? error.response.data
        : {}),
      message: SERVICE_UNAVAILABLE_MESSAGE,
    },
  };

  try {
    // Keep the AxiosError prototype and flags expected by existing callers.
    error.response = response;
    return error;
  } catch (_assignmentError) {
    return {
      ...error,
      response,
    };
  }
}
