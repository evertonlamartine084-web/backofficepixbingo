/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, optionsResponse, verifyAuth } from './_cors.js';
export const config = { runtime: 'edge' };

interface SegmentRule {
  id: string;
  field: string;
  operator: string;
  value: string | number;
  table?: string;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  const cors = getCorsHeaders(req);
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  // Auth check
  const auth = await verifyAuth(req);
  if (!auth) return json({ error: 'Não autorizado' }, 401);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Config missing' }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';

  // POST /api/segment-evaluate?action=preview — preview matching CPFs count
  // POST /api/segment-evaluate?action=evaluate — evaluate and populate segment_items
  // POST /api/segment-evaluate?action=count — just return count without populating
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const rules: SegmentRule[] = body.rules || [];
  const matchType: string = body.match_type || 'all'; // all = AND, any = OR
  const segmentId: string = body.segment_id || '';

  if (rules.length === 0) return json({ error: 'Nenhuma regra definida' }, 400);

  try {
    // Build queries per rule and collect matching CPFs
    const cpfSets: Set<string>[] = [];

    for (const rule of rules) {
      const matchingCpfs = await evaluateRule(supabase, rule);
      cpfSets.push(matchingCpfs);
    }

    // Combine based on match_type
    let finalCpfs: Set<string>;
    if (matchType === 'any') {
      // OR — union of all sets
      finalCpfs = new Set<string>();
      for (const s of cpfSets) s.forEach(cpf => finalCpfs.add(cpf));
    } else {
      // AND — intersection of all sets
      if (cpfSets.length === 0) {
        finalCpfs = new Set<string>();
      } else {
        finalCpfs = cpfSets[0];
        for (let i = 1; i < cpfSets.length; i++) {
          const next = cpfSets[i];
          for (const cpf of finalCpfs) {
            if (!next.has(cpf)) finalCpfs.delete(cpf);
          }
        }
      }
    }

    const count = finalCpfs.size;
    const cpfArray = Array.from(finalCpfs);

    if (action === 'count' || action === 'preview') {
      // Return count + sample CPFs
      const sample = cpfArray.slice(0, 20);
      return json({ count, sample });
    }

    if (action === 'evaluate') {
      if (!segmentId) return json({ error: 'segment_id obrigatório' }, 400);

      // Clear existing rule-based items
      await supabase.from('segment_items')
        .delete()
        .eq('segment_id', segmentId)
        .eq('source', 'rule');

      // Insert new items in batches
      const BATCH_SIZE = 500;
      let inserted = 0;
      for (let i = 0; i < cpfArray.length; i += BATCH_SIZE) {
        const batch = cpfArray.slice(i, i + BATCH_SIZE).map(cpf => ({
          segment_id: segmentId,
          cpf,
          cpf_masked: cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4'),
          source: 'rule',
          metadata: { evaluated_at: new Date().toISOString() },
        }));
        const { error } = await supabase.from('segment_items').upsert(batch, {
          onConflict: 'segment_id,cpf',
          ignoreDuplicates: false,
        });
        if (error) throw error;
        inserted += batch.length;
      }

      // Update segment metadata
      await supabase.from('segments').update({
        last_evaluated_at: new Date().toISOString(),
        member_count: count,
      }).eq('id', segmentId);

      return json({ count, inserted, evaluated_at: new Date().toISOString() });
    }

    return json({ error: 'action inválida' }, 400);
  } catch (err: any) {
    return json({ error: err.message || 'Erro ao avaliar regras' }, 500);
  }
}

async function evaluateRule(supabase: any, rule: SegmentRule): Promise<Set<string>> {
  const cpfs = new Set<string>();
  const { field, operator, value } = rule;

  // Determine which table and column to query
  const fieldMap: Record<string, { table: string; column: string }> = {
    // player_wallets fields
    level: { table: 'player_wallets', column: 'level' },
    coins: { table: 'player_wallets', column: 'coins' },
    xp: { table: 'player_wallets', column: 'xp' },
    total_coins_earned: { table: 'player_wallets', column: 'total_coins_earned' },
    total_xp_earned: { table: 'player_wallets', column: 'total_xp_earned' },
    // Aggregated fields (require custom logic)
    total_deposits: { table: 'xp_history', column: 'amount' },
    total_bets: { table: 'xp_history', column: 'amount' },
    missions_completed: { table: 'player_mission_progress', column: 'completed' },
    achievements_completed: { table: 'player_achievements', column: 'completed' },
    tournaments_joined: { table: 'player_tournament_entries', column: 'opted_in' },
    store_purchases_count: { table: 'store_purchases', column: 'id' },
    total_spins: { table: 'player_spins', column: 'total_spins' },
    last_activity: { table: 'player_activity_log', column: 'created_at' },
    registration_date: { table: 'player_wallets', column: 'created_at' },
  };

  const mapping = fieldMap[field];
  if (!mapping) return cpfs;

  // Simple numeric comparison on player_wallets
  if (mapping.table === 'player_wallets' && !['last_activity', 'registration_date'].includes(field)) {
    let query = supabase.from('player_wallets').select('cpf');
    query = applyOperator(query, mapping.column, operator, value);
    const { data } = await query.limit(50000);
    if (data) data.forEach((r: any) => cpfs.add(r.cpf));
    return cpfs;
  }

  // Registration date
  if (field === 'registration_date') {
    let query = supabase.from('player_wallets').select('cpf');
    query = applyDateOperator(query, 'created_at', operator, value);
    const { data } = await query.limit(50000);
    if (data) data.forEach((r: any) => cpfs.add(r.cpf));
    return cpfs;
  }

  // Total deposits (sum from xp_history where action=deposito)
  if (field === 'total_deposits') {
    const { data } = await supabase.from('xp_history')
      .select('cpf, amount')
      .eq('action', 'deposito');
    if (data) {
      const sums: Record<string, number> = {};
      data.forEach((r: any) => { sums[r.cpf] = (sums[r.cpf] || 0) + (r.amount || 0); });
      const numVal = Number(value);
      Object.entries(sums).forEach(([cpf, total]) => {
        if (compareValues(total, operator, numVal)) cpfs.add(cpf);
      });
    }
    return cpfs;
  }

  // Total bets (sum from xp_history where action=aposta)
  if (field === 'total_bets') {
    const { data } = await supabase.from('xp_history')
      .select('cpf, amount')
      .eq('action', 'aposta');
    if (data) {
      const sums: Record<string, number> = {};
      data.forEach((r: any) => { sums[r.cpf] = (sums[r.cpf] || 0) + (r.amount || 0); });
      const numVal = Number(value);
      Object.entries(sums).forEach(([cpf, total]) => {
        if (compareValues(total, operator, numVal)) cpfs.add(cpf);
      });
    }
    return cpfs;
  }

  // Missions completed count
  if (field === 'missions_completed') {
    const { data } = await supabase.from('player_mission_progress')
      .select('cpf')
      .eq('completed', true);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((r: any) => { counts[r.cpf] = (counts[r.cpf] || 0) + 1; });
      const numVal = Number(value);
      Object.entries(counts).forEach(([cpf, count]) => {
        if (compareValues(count, operator, numVal)) cpfs.add(cpf);
      });
    }
    return cpfs;
  }

  // Achievements completed count
  if (field === 'achievements_completed') {
    const { data } = await supabase.from('player_achievements')
      .select('cpf')
      .eq('completed', true);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((r: any) => { counts[r.cpf] = (counts[r.cpf] || 0) + 1; });
      const numVal = Number(value);
      Object.entries(counts).forEach(([cpf, count]) => {
        if (compareValues(count, operator, numVal)) cpfs.add(cpf);
      });
    }
    return cpfs;
  }

  // Tournaments joined
  if (field === 'tournaments_joined') {
    const { data } = await supabase.from('player_tournament_entries')
      .select('cpf')
      .eq('opted_in', true);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((r: any) => { counts[r.cpf] = (counts[r.cpf] || 0) + 1; });
      const numVal = Number(value);
      Object.entries(counts).forEach(([cpf, count]) => {
        if (compareValues(count, operator, numVal)) cpfs.add(cpf);
      });
    }
    return cpfs;
  }

  // Store purchases count
  if (field === 'store_purchases_count') {
    const { data } = await supabase.from('store_purchases').select('cpf');
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((r: any) => { counts[r.cpf] = (counts[r.cpf] || 0) + 1; });
      const numVal = Number(value);
      Object.entries(counts).forEach(([cpf, count]) => {
        if (compareValues(count, operator, numVal)) cpfs.add(cpf);
      });
    }
    return cpfs;
  }

  // Total spins
  if (field === 'total_spins') {
    let query = supabase.from('player_spins').select('cpf');
    query = applyOperator(query, 'total_spins', operator, value);
    const { data } = await query.limit(50000);
    if (data) data.forEach((r: any) => cpfs.add(r.cpf));
    return cpfs;
  }

  // Last activity (days ago)
  if (field === 'last_activity') {
    const daysAgo = Number(value);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);

    if (operator === 'within') {
      // Active within last N days
      const { data } = await supabase.from('player_activity_log')
        .select('cpf')
        .gte('created_at', cutoff.toISOString());
      if (data) {
        const seen = new Set<string>();
        data.forEach((r: any) => { if (!seen.has(r.cpf)) { seen.add(r.cpf); cpfs.add(r.cpf); } });
      }
    } else if (operator === 'not_within') {
      // Inactive for more than N days — get all wallets, subtract active
      const { data: allWallets } = await supabase.from('player_wallets').select('cpf').limit(50000);
      const { data: activeData } = await supabase.from('player_activity_log')
        .select('cpf')
        .gte('created_at', cutoff.toISOString());
      const activeCpfs = new Set<string>();
      if (activeData) activeData.forEach((r: any) => activeCpfs.add(r.cpf));
      if (allWallets) allWallets.forEach((r: any) => { if (!activeCpfs.has(r.cpf)) cpfs.add(r.cpf); });
    }
    return cpfs;
  }

  return cpfs;
}

function applyOperator(query: any, column: string, operator: string, value: string | number): any {
  const numVal = Number(value);
  switch (operator) {
    case 'eq': return query.eq(column, numVal);
    case 'neq': return query.neq(column, numVal);
    case 'gt': return query.gt(column, numVal);
    case 'gte': return query.gte(column, numVal);
    case 'lt': return query.lt(column, numVal);
    case 'lte': return query.lte(column, numVal);
    default: return query.gte(column, numVal);
  }
}

function applyDateOperator(query: any, column: string, operator: string, value: string | number): any {
  if (operator === 'within') {
    const daysAgo = Number(value);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    return query.gte(column, cutoff.toISOString());
  }
  if (operator === 'not_within') {
    const daysAgo = Number(value);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    return query.lt(column, cutoff.toISOString());
  }
  if (operator === 'before') {
    return query.lt(column, String(value));
  }
  if (operator === 'after') {
    return query.gt(column, String(value));
  }
  return query;
}

function compareValues(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    default: return actual >= expected;
  }
}
