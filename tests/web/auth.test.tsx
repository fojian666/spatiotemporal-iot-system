import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../src/components/AuthProvider';
import { useAuth } from '../../src/auth/AuthContext';
import { getAuthToken, setAuthToken } from '../../src/services/authToken';
import * as api from '../../src/services/api';

vi.mock('../../src/services/api', async (original) => ({
  ...await original<typeof api>(), REMOTE_ENABLED: true,
  fetchMe: vi.fn(), loginRequest: vi.fn(), demoLoginRequest: vi.fn(), logoutRequest: vi.fn(),
}));

it('starts anonymous without a token', () => {
  const { result } = renderHook(useAuth, { wrapper: AuthProvider });
  expect(result.current.status).toBe('anonymous');
  expect(result.current.canOperate).toBe(false);
});

for (const role of ['admin', 'operator', 'viewer'] as const) {
  it(`restores ${role} with matching UI permissions`, async () => {
    setAuthToken('test-token');
    vi.mocked(api.fetchMe).mockResolvedValue({ id: 1, username: role, displayName: role, role });
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.canOperate).toBe(role !== 'viewer');
  });
}

it('network failure preserves the token and can retry successfully', async () => {
  setAuthToken('test-token');
  vi.mocked(api.fetchMe).mockRejectedValueOnce(new api.ApiError(0, 'offline')).mockResolvedValueOnce({ id: 1, username: 'viewer', displayName: 'viewer', role: 'viewer' });
  const { result } = renderHook(useAuth, { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(getAuthToken()).toBe('test-token');
  act(() => result.current.retrySession());
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
});

it('401 clears the token and restores login', async () => {
  setAuthToken('test-token');
  vi.mocked(api.fetchMe).mockRejectedValue(new api.ApiError(401, 'revoked'));
  const { result } = renderHook(useAuth, { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.status).toBe('anonymous'));
  expect(getAuthToken()).toBeNull();
});
