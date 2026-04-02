import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-123', email: 'test@test.com' } },
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  },
}));

import { logAudit, _resetAuditThrottle } from './use-audit';
import { supabase } from '@/integrations/supabase/client';

describe('logAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAuditThrottle();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
    });
  });

  it('chama supabase.from("audit_log").insert com params corretos', async () => {
    await logAudit({
      action: 'CREATE',
      resource_type: 'batch',
      resource_id: 'batch-1',
      resource_name: 'Batch Test',
      details: { foo: 'bar' },
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      user_email: 'test@test.com',
      action: 'CREATE',
      resource_type: 'batch',
      resource_id: 'batch-1',
      resource_name: 'Batch Test',
      details: { foo: 'bar' },
    });
  });

  it('usa null para campos opcionais não fornecidos', async () => {
    await logAudit({
      action: 'DELETE',
      resource_type: 'player',
    });

    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      user_email: 'test@test.com',
      action: 'DELETE',
      resource_type: 'player',
      resource_id: null,
      resource_name: null,
      details: null,
    });
  });

  it('usa null para user_id/user_email quando user não existe', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await logAudit({
      action: 'VIEW',
      resource_type: 'dashboard',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null,
        user_email: null,
      }),
    );
  });

  it('não lança erro quando insert falha (fire-and-forget)', async () => {
    mockInsert.mockRejectedValue(new Error('DB connection failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      logAudit({ action: 'CREATE', resource_type: 'batch' }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      '[Audit] Failed to log action:',
      'CREATE',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('não lança erro quando getUser falha', async () => {
    mockGetUser.mockRejectedValue(new Error('Auth error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      logAudit({ action: 'UPDATE', resource_type: 'config' }),
    ).resolves.toBeUndefined();

    warnSpy.mockRestore();
  });
});
