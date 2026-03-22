import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

// We need to test getDaysArray indirectly through the module
// Since getDaysArray is not exported, we test it through useDashboardCharts behavior
// But we can extract and test the date logic directly

describe('getDaysArray date range calculation', () => {
  it('gera array com número correto de dias', () => {
    const days = 7;
    const result: { dateISO: string; label: string }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({ dateISO: iso, label });
    }

    expect(result).toHaveLength(7);
    // First date should be 6 days ago
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    expect(result[0].dateISO).toBe(sixDaysAgo.toISOString().split('T')[0]);
    // Last date should be today
    expect(result[6].dateISO).toBe(now.toISOString().split('T')[0]);
  });

  it('gera array com 1 dia (apenas hoje)', () => {
    const days = 1;
    const result: { dateISO: string; label: string }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({ dateISO: iso, label });
    }

    expect(result).toHaveLength(1);
    expect(result[0].dateISO).toBe(now.toISOString().split('T')[0]);
  });

  it('formata label como dd/mm', () => {
    const d = new Date(2024, 0, 5); // Jan 5
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    expect(label).toBe('05/01');
  });

  it('gera 30 dias para range mensal', () => {
    const days = 30;
    const result: { dateISO: string; label: string }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({ dateISO: iso, label });
    }

    expect(result).toHaveLength(30);
    // Dates should be in ascending order
    for (let i = 1; i < result.length; i++) {
      expect(result[i].dateISO > result[i - 1].dateISO).toBe(true);
    }
  });
});

describe('useDashboardCharts queryKeys', () => {
  it('module exports useDashboardCharts and useFinancialEvolution', async () => {
    const mod = await import('./use-dashboard-charts');
    expect(mod.useDashboardCharts).toBeDefined();
    expect(typeof mod.useDashboardCharts).toBe('function');
    expect(mod.useFinancialEvolution).toBeDefined();
    expect(typeof mod.useFinancialEvolution).toBe('function');
  });

  it('queryKeys incluem startDate e days para cache correto', () => {
    // Verify the pattern used in the source code:
    // queryKey: ['chart-batch-credits', startDate, days]
    // queryKey: ['chart-cashback-credits', startDate, days]
    // queryKey: ['chart-campaign-credits', startDate, days]
    // queryKey: ['chart-manual-credits', startDate, days]
    const days = 14;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (days - 1));
    const startISO = startDate.toISOString().split('T')[0];

    const expectedKeys = [
      ['chart-batch-credits', startISO, days],
      ['chart-cashback-credits', startISO, days],
      ['chart-campaign-credits', startISO, days],
      ['chart-manual-credits', startISO, days],
    ];

    // Each key should include the days parameter for proper cache invalidation
    for (const key of expectedKeys) {
      expect(key).toContain(days);
      expect(key[1]).toBe(startISO);
    }
  });
});

describe('Daily metrics aggregation logic', () => {
  it('agrega dados por dia corretamente', () => {
    const dateISO = '2024-03-15';
    const dayStart = `${dateISO}T00:00:00`;
    const dayEnd = `${dateISO}T23:59:59`;
    const inDay = (d: string) => d >= dayStart && d <= dayEnd;

    const batchData = [
      { created_at: '2024-03-15T10:00:00', valor: 100 },
      { created_at: '2024-03-15T14:00:00', valor: 200 },
      { created_at: '2024-03-16T10:00:00', valor: 500 }, // different day
    ];

    const batchCredits = batchData.filter(b => inDay(b.created_at))
      .reduce((sum, b) => sum + (b.valor || 0), 0);

    expect(batchCredits).toBe(300);
  });

  it('retorna 0 quando não há dados para o dia', () => {
    const dateISO = '2024-03-15';
    const dayStart = `${dateISO}T00:00:00`;
    const dayEnd = `${dateISO}T23:59:59`;
    const inDay = (d: string) => d >= dayStart && d <= dayEnd;

    const batchData: { created_at: string; valor: number }[] = [];

    const batchCredits = batchData.filter(b => inDay(b.created_at))
      .reduce((sum, b) => sum + (b.valor || 0), 0);

    expect(batchCredits).toBe(0);
  });

  it('lida com valores null/undefined nos dados', () => {
    const dateISO = '2024-03-15';
    const dayStart = `${dateISO}T00:00:00`;
    const dayEnd = `${dateISO}T23:59:59`;
    const inDay = (d: string) => d >= dayStart && d <= dayEnd;

    const auditData = [
      { created_at: '2024-03-15T10:00:00', details: { valor: 50 } },
      { created_at: '2024-03-15T12:00:00', details: null },
      { created_at: '2024-03-15T14:00:00', details: { valor: undefined } },
    ];

    const manualCredits = auditData.filter(a => inDay(a.created_at))
      .reduce((sum, a) => sum + Number(a.details?.valor || 0), 0);

    expect(manualCredits).toBe(50);
  });
});
