import { normalizeApiError, SERVICE_UNAVAILABLE_MESSAGE } from './apiErrors';

describe('API failure messages', () => {
  test('network failures become a retryable service message', () => {
    const error = { isAxiosError: true, message: 'Network Error' };
    const normalized = normalizeApiError(error);
    expect(normalized).toBe(error);
    expect(normalized.isAxiosError).toBe(true);
    expect(normalized.response.data.message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
  });

  test('timeouts and server failures become a retryable service message', () => {
    expect(normalizeApiError({ code: 'ECONNABORTED' }).response.data.message)
      .toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(normalizeApiError({ response: { status: 503, data: { details: 'private' } } }).response.data)
      .toEqual({ details: 'private', message: SERVICE_UNAVAILABLE_MESSAGE });
  });

  test('client validation and authorization errors keep their original message', () => {
    const error = { response: { status: 401, data: { message: 'Please sign in again.' } } };
    expect(normalizeApiError(error)).toBe(error);
  });

  test('canceled requests are not presented as service outages', () => {
    const error = { code: 'ERR_CANCELED' };
    expect(normalizeApiError(error)).toBe(error);
  });
});
