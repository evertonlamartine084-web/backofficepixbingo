import { HandlerContext, platformLogin, searchPlayerByCpf } from './types.js';

export async function handleTournamentJoin(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ error: 'CPF obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const tournamentId = url.searchParams.get('tournament_id');
  if (!tournamentId) {
    return new Response(JSON.stringify({ error: 'tournament_id obrigatório' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get tournament
  const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
  if (!tournament) {
    return new Response(JSON.stringify({ error: 'Torneio não encontrado' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check if already joined
  const { data: existing } = await supabase.from('player_tournament_entries')
    .select('id').eq('cpf', playerCpf).eq('tournament_id', tournamentId).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ error: 'Já inscrito neste torneio' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check buy-in
  let coinsPaid = 0;
  if (tournament.buy_in_cost && tournament.buy_in_cost > 0) {
    coinsPaid = tournament.buy_in_cost;
    const { data: wallet } = await supabase.from('player_wallets').select('coins').eq('cpf', playerCpf).maybeSingle();
    if (!wallet || (wallet.coins || 0) < coinsPaid) {
      return new Response(JSON.stringify({ error: 'Moedas insuficientes', cost: coinsPaid, balance: wallet?.coins || 0 }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Deduct
    await supabase.from('player_wallets')
      .update({ coins: (wallet.coins || 0) - coinsPaid } as Record<string, unknown>)
      .eq('cpf', playerCpf);
  }

  // Create entry
  await supabase.from('player_tournament_entries').insert({
    cpf: playerCpf,
    tournament_id: tournamentId,
    opted_in: true,
    bought_in: coinsPaid > 0,
    coins_paid: coinsPaid,
  } as Record<string, unknown>);

  // Log
  try {
    await supabase.from('player_activity_log').insert({
      cpf: playerCpf,
      type: 'tournament',
      amount: coinsPaid > 0 ? -coinsPaid : 0,
      source: 'Torneio',
      source_id: tournamentId,
      description: `Inscreveu-se no torneio: ${tournament.name}`,
    } as Record<string, unknown>);
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ success: true, coins_paid: coinsPaid }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleCheckSegment(ctx: HandlerContext): Promise<Response> {
  const { supabase, playerCpf, segmentId, corsHeaders } = ctx;

  if (!segmentId || !playerCpf) {
    return new Response(JSON.stringify({ belongs: !segmentId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Normalize CPF: remove dots, dashes, spaces
  const cleanCpf = playerCpf.replace(/[.\-\s/]/g, '');
  const { data: match } = await supabase.from('segment_items')
    .select('id')
    .eq('segment_id', segmentId)
    .eq('cpf', cleanCpf)
    .maybeSingle();
  return new Response(JSON.stringify({ belongs: !!match }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handlePlatformBalance(ctx: HandlerContext): Promise<Response> {
  const { supabase, playerCpf, corsHeaders } = ctx;

  if (!playerCpf) {
    return new Response(JSON.stringify({ saldo: 0, bonus: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const { data: config } = await supabase.from('platform_config').select('*').limit(1).maybeSingle();
    if (!config?.username || !config?.password) {
      return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: 'config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const loginDomain = (config.login_url || config.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
    const login = await platformLogin(loginDomain, config.username, config.password, config.login_url);
    if (!login.success) {
      return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: 'login' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const headers2: Record<string, string> = {
      'Cookie': login.cookies,
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    let saldo = 0, bonus = 0;
    // First find uuid by CPF
    const searchResult = await searchPlayerByCpf(loginDomain, headers2, playerCpf);
    const uuid = searchResult.uuid;
    if (uuid) {
      // Fetch /usuarios/transacoes which returns carteiras
      const txRes = await fetch(`${loginDomain}/usuarios/transacoes?id=${uuid}`, {
        headers: headers2, signal: AbortSignal.timeout(10000),
      });
      const txText = await txRes.text();
      let txData: Record<string, unknown> | null;
      try { txData = JSON.parse(txText); } catch { txData = null; }
      const carteiras = txData?.carteiras;
      // Parse BR currency format: "4.279,46" -> 4279.46
      const parseBR = (v: unknown): number => {
        if (typeof v === 'number') return v;
        if (!v) return 0;
        return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
      };

      if (Array.isArray(carteiras)) {
        for (const c of carteiras) {
          const nome = (c.carteira || c.nome || c.tipo || '').toUpperCase();
          const val = parseBR(c.saldo || c.valor);
          if (nome.includes('BONUS')) bonus = val;
          else if (nome.includes('PREMIO') || nome.includes('CREDITO') || nome.includes('REAL') || nome.includes('PRINCIPAL')) {
            saldo += val;
          }
        }
      } else if (carteiras && typeof carteiras === 'object') {
        // Direct key format: { CREDITO: "0,00", BONUS: "4.279,46", PREMIO: "207,71" }
        for (const [key, val] of Object.entries(carteiras as Record<string, unknown>)) {
          const k = key.toUpperCase();
          if (k.includes('BONUS')) bonus = parseBR(val);
          else if (k === 'PREMIO' || k === 'CREDITO' || k === 'REAL' || k === 'SALDO') {
            saldo += parseBR(val);
          }
        }
      }
    }
    return new Response(JSON.stringify({ saldo, bonus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ saldo: 0, bonus: 0, error: e instanceof Error ? e.message : 'Erro' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function handleScrapePlatform(ctx: HandlerContext): Promise<Response> {
  const { supabase, url, corsHeaders } = ctx;

  const path = url.searchParams.get('path') || '/';
  const { data: config } = await supabase.from('platform_config').select('*').limit(1).maybeSingle();
  if (!config?.username || !config?.password) {
    return new Response(JSON.stringify({ error: 'No platform config' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const siteUrl = (config.site_url || 'https://pixbingobr.concurso.club').replace(/\/+$/, '');
  const login = await platformLogin(siteUrl, config.username, config.password, config.login_url);
  if (!login.success) {
    return new Response(JSON.stringify({ error: 'Login failed' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const hdrs: Record<string, string> = {
    'Cookie': login.cookies, 'Accept': 'text/html,*/*', 'X-Requested-With': 'XMLHttpRequest', 'Referer': siteUrl,
  };
  const pageRes = await fetch(`${siteUrl}${path}`, { method: 'GET', headers: hdrs, signal: AbortSignal.timeout(12000) });
  const html = await pageRes.text();
  const menuLinks = [...html.matchAll(/href=['"]([^'"]+)['"]/gi)].map(m => m[1]).filter(h => h.startsWith('/'));
  const ajaxUrls = [...html.matchAll(/ajax\s*:\s*['"`]([^'"`]+)['"`]/gi)].map(m => m[1]);
  const formActions = [...html.matchAll(/action=['"]([^'"]+)['"]/gi)].map(m => m[1]);
  const selectOptions = [...html.matchAll(/<option[^>]*value=['"]([^'"]*?)['"][^>]*>([^<]*?)<\/option>/gi)].map(m => ({ value: m[1], label: m[2].trim() }));
  const inputFields = [...html.matchAll(/<input[^>]*name=['"]([^'"]+)['"][^>]*/gi)].map(m => m[0]);
  const labels = [...html.matchAll(/<label[^>]*>(.*?)<\/label>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  return new Response(JSON.stringify({
    status: pageRes.status,
    html_length: html.length,
    title: html.match(/<title>(.*?)<\/title>/i)?.[1] || '',
    menu_links: [...new Set(menuLinks)],
    ajax_urls: ajaxUrls,
    form_actions: formActions,
    select_options: selectOptions,
    input_fields: inputFields.slice(0, 50),
    labels: labels.slice(0, 50),
    html_snippet: html.slice(0, 5000),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
