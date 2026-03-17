/**
 * PixBingoBR Gamification Widget
 * Embed via GTM: <script src="https://nehmmvtpagncmldivnxn.supabase.co/storage/v1/object/public/assets/gamification.js"></script>
 * Or directly: <script src="YOUR_HOST/widget/gamification.js"></script>
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://nehmmvtpagncmldivnxn.supabase.co';
  const API_URL = SUPABASE_URL + '/functions/v1/gamification-widget';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laG1tdnRwYWduY21sZGl2bnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEyMDE3NzcsImV4cCI6MjA1Njc3Nzc3N30.KMSaGEjGr0GJE0LuKR25nRSGGNbbgIIDRkrCmWon12I';

  // Prevent double load
  if (window.__PIXBINGO_GAMIFICATION__) return;
  window.__PIXBINGO_GAMIFICATION__ = true;

  let data = null;
  let isOpen = false;
  let activeTab = 'missions';
  let isSpinning = false;
  let spinResult = null;

  // ---- STYLES ----
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

    #pbg-widget-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      border: none;
      cursor: pointer;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 24px rgba(139, 92, 246, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
      animation: pbg-pulse 2s infinite;
    }
    #pbg-widget-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 32px rgba(139, 92, 246, 0.6);
    }
    @keyframes pbg-pulse {
      0%, 100% { box-shadow: 0 4px 24px rgba(139, 92, 246, 0.4); }
      50% { box-shadow: 0 4px 32px rgba(139, 92, 246, 0.7); }
    }
    #pbg-widget-fab svg { width: 28px; height: 28px; color: white; }

    #pbg-widget-panel {
      position: fixed;
      top: 0;
      right: -400px;
      width: 380px;
      max-width: 100vw;
      height: 100vh;
      background: #0c0a1a;
      border-left: 1px solid rgba(139, 92, 246, 0.2);
      z-index: 999998;
      transition: right 0.3s ease;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #pbg-widget-panel.open { right: 0; }
    #pbg-widget-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 999997;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    #pbg-widget-backdrop.open { opacity: 1; pointer-events: auto; }

    .pbg-header {
      padding: 16px 20px;
      background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1));
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pbg-header h2 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pbg-close {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #a1a1aa;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      transition: all 0.2s;
    }
    .pbg-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

    .pbg-tabs {
      display: flex;
      padding: 0 12px;
      gap: 2px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .pbg-tabs::-webkit-scrollbar { display: none; }
    .pbg-tab {
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #71717a;
      background: none;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
      font-family: inherit;
    }
    .pbg-tab:hover { color: #a1a1aa; }
    .pbg-tab.active {
      color: #8b5cf6;
      border-bottom-color: #8b5cf6;
    }

    .pbg-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .pbg-content::-webkit-scrollbar { width: 4px; }
    .pbg-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

    .pbg-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 10px;
      transition: border-color 0.2s;
    }
    .pbg-card:hover { border-color: rgba(139,92,246,0.3); }

    .pbg-card-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin: 0 0 4px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pbg-card-desc {
      font-size: 12px;
      color: #71717a;
      margin: 0;
      line-height: 1.4;
    }
    .pbg-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .pbg-badge-bonus { background: rgba(16,185,129,0.15); color: #34d399; }
    .pbg-badge-coins { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .pbg-badge-xp { background: rgba(99,102,241,0.15); color: #818cf8; }
    .pbg-badge-nothing { background: rgba(113,113,122,0.15); color: #a1a1aa; }
    .pbg-badge-daily { background: rgba(245,158,11,0.12); color: #fbbf24; }
    .pbg-badge-weekly { background: rgba(6,182,212,0.12); color: #22d3ee; }

    .pbg-reward {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.04);
    }
    .pbg-reward-label { font-size: 11px; color: #71717a; }
    .pbg-reward-value { font-size: 13px; font-weight: 700; color: #34d399; font-family: 'JetBrains Mono', monospace; }

    .pbg-condition {
      font-size: 11px;
      color: #a1a1aa;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Tournament card */
    .pbg-tournament-meta {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .pbg-tournament-stat {
      background: rgba(255,255,255,0.04);
      padding: 6px 10px;
      border-radius: 8px;
      flex: 1;
      min-width: 80px;
    }
    .pbg-tournament-stat-label { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .pbg-tournament-stat-value { font-size: 13px; font-weight: 700; color: #fff; margin-top: 2px; }
    .pbg-prize-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
    }
    .pbg-prize-rank { color: #a1a1aa; }
    .pbg-prize-value { color: #34d399; font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    /* Wheel */
    .pbg-wheel-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 10px 0;
    }
    .pbg-wheel-wrapper {
      position: relative;
      width: 280px;
      height: 280px;
    }
    .pbg-wheel-canvas {
      width: 280px;
      height: 280px;
      border-radius: 50%;
      transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);
    }
    .pbg-wheel-pointer {
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-top: 20px solid #8b5cf6;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
      z-index: 2;
    }
    .pbg-wheel-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      border: 3px solid #0c0a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
    .pbg-spin-btn {
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      border: none;
      color: white;
      padding: 12px 32px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
      box-shadow: 0 4px 16px rgba(139,92,246,0.3);
    }
    .pbg-spin-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(139,92,246,0.5); }
    .pbg-spin-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .pbg-spin-result {
      text-align: center;
      padding: 16px;
      border-radius: 12px;
      background: rgba(139,92,246,0.1);
      border: 1px solid rgba(139,92,246,0.2);
    }
    .pbg-spin-result-label { font-size: 13px; color: #a1a1aa; }
    .pbg-spin-result-value { font-size: 22px; font-weight: 700; color: #fff; margin-top: 4px; }

    .pbg-empty {
      text-align: center;
      padding: 40px 20px;
      color: #52525b;
    }
    .pbg-empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
    .pbg-empty-text { font-size: 13px; }

    .pbg-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #52525b;
      margin-bottom: 10px;
      padding-left: 2px;
    }

    /* Store */
    .pbg-store-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .pbg-store-item {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 12px;
      text-align: center;
      transition: border-color 0.2s;
    }
    .pbg-store-item:hover { border-color: rgba(139,92,246,0.3); }
    .pbg-store-item img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      margin: 0 auto 8px;
      border-radius: 8px;
    }
    .pbg-store-name { font-size: 12px; font-weight: 600; color: #fff; }
    .pbg-store-price { font-size: 11px; color: #fbbf24; font-weight: 600; margin-top: 4px; }

    @media (max-width: 420px) {
      #pbg-widget-panel { width: 100vw; }
      #pbg-widget-fab { bottom: 16px; right: 16px; width: 52px; height: 52px; }
      .pbg-wheel-wrapper, .pbg-wheel-canvas { width: 240px; height: 240px; }
    }
  `;

  // ---- ICONS (inline SVG) ----
  const ICONS = {
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
    target: '🎯',
    star: '⭐',
    swords: '⚔️',
    wheel: '🎡',
    shop: '🛒',
  };

  // ---- HELPERS ----
  const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rewardBadge = (type, value) => {
    const cls = { bonus: 'pbg-badge-bonus', coins: 'pbg-badge-coins', xp: 'pbg-badge-xp', nothing: 'pbg-badge-nothing' }[type] || 'pbg-badge-bonus';
    const label = type === 'bonus' ? fmt(value) : type === 'nothing' ? 'Nada' : `${value} ${type.toUpperCase()}`;
    return `<span class="pbg-badge ${cls}">${label}</span>`;
  };

  const conditionText = (type, value) => {
    const map = {
      first_deposit: '1º Depósito',
      total_deposited: `Depositar ${fmt(value)}`,
      total_bet: `Apostar ${fmt(value)}`,
      consecutive_days: `${value} dias consecutivos`,
      total_wins: `${value} vitória(s)`,
      total_games: `${value} partida(s)`,
      referrals: `${value} indicação(ões)`,
      deposit: `Depositar ${fmt(value)}`,
      bet: `Apostar ${fmt(value)}`,
      win: `Vencer ${value}x`,
      login: 'Fazer login',
      play_keno: `Jogar Keno ${value}x`,
      play_cassino: `Jogar Cassino ${value}x`,
    };
    return map[type] || `${type}: ${value}`;
  };

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  };

  // ---- FETCH DATA ----
  async function fetchData() {
    try {
      const res = await fetch(`${API_URL}?action=data`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      });
      data = await res.json();
      renderContent();
    } catch (e) {
      console.error('[PixBingo Widget]', e);
    }
  }

  async function spinWheel() {
    if (isSpinning) return;
    isSpinning = true;
    spinResult = null;
    renderContent();

    try {
      const res = await fetch(`${API_URL}?action=spin`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      });
      const result = await res.json();
      spinResult = result.prize;

      // Animate wheel
      const canvas = document.getElementById('pbg-wheel-canvas');
      if (canvas && result.prizes) {
        const prizes = result.prizes;
        const winIndex = prizes.findIndex(p => p.id === spinResult.id);
        const sliceAngle = 360 / prizes.length;
        const targetAngle = 360 - (winIndex * sliceAngle + sliceAngle / 2);
        const spins = 5 + Math.floor(Math.random() * 3);
        canvas.style.transform = `rotate(${spins * 360 + targetAngle}deg)`;
      }

      setTimeout(() => {
        isSpinning = false;
        renderContent();
      }, 4200);
    } catch (e) {
      isSpinning = false;
      renderContent();
    }
  }

  // ---- RENDER ----
  function renderMissions() {
    if (!data?.missions?.length) return '<div class="pbg-empty"><div class="pbg-empty-icon">🎯</div><div class="pbg-empty-text">Nenhuma missão disponível</div></div>';

    const daily = data.missions.filter(m => m.type === 'daily');
    const weekly = data.missions.filter(m => m.type === 'weekly');
    let html = '';

    if (daily.length) {
      html += '<div class="pbg-section-title">⚡ Missões Diárias</div>';
      html += daily.map(m => `
        <div class="pbg-card">
          <div class="pbg-card-title">${m.name} <span class="pbg-badge pbg-badge-daily">Diária</span></div>
          ${m.description ? `<p class="pbg-card-desc">${m.description}</p>` : ''}
          <div class="pbg-condition">📋 ${conditionText(m.condition_type, m.condition_value)}</div>
          <div class="pbg-reward">
            <span class="pbg-reward-label">Recompensa</span>
            ${rewardBadge(m.reward_type, m.reward_value)}
          </div>
        </div>
      `).join('');
    }

    if (weekly.length) {
      html += '<div class="pbg-section-title" style="margin-top:16px">📅 Missões Semanais</div>';
      html += weekly.map(m => `
        <div class="pbg-card">
          <div class="pbg-card-title">${m.name} <span class="pbg-badge pbg-badge-weekly">Semanal</span></div>
          ${m.description ? `<p class="pbg-card-desc">${m.description}</p>` : ''}
          <div class="pbg-condition">📋 ${conditionText(m.condition_type, m.condition_value)}</div>
          <div class="pbg-reward">
            <span class="pbg-reward-label">Recompensa</span>
            ${rewardBadge(m.reward_type, m.reward_value)}
          </div>
        </div>
      `).join('');
    }

    return html;
  }

  function renderAchievements() {
    if (!data?.achievements?.length) return '<div class="pbg-empty"><div class="pbg-empty-icon">🏆</div><div class="pbg-empty-text">Nenhuma conquista disponível</div></div>';

    const categories = [...new Set(data.achievements.map(a => a.category))];
    const catNames = { deposito: '💰 Depósito', aposta: '🎲 Aposta', login: '🔑 Login', vitoria: '🏅 Vitória', social: '👥 Social', geral: '⭐ Geral' };

    return categories.map(cat => {
      const items = data.achievements.filter(a => a.category === cat);
      return `
        <div class="pbg-section-title">${catNames[cat] || cat}</div>
        ${items.map(a => `
          <div class="pbg-card">
            <div class="pbg-card-title">
              ${a.icon_url ? `<img src="${a.icon_url}" width="20" height="20" style="border-radius:4px">` : '🏆'}
              ${a.name}
            </div>
            ${a.description ? `<p class="pbg-card-desc">${a.description}</p>` : ''}
            <div class="pbg-condition">🎯 ${conditionText(a.condition_type, a.condition_value)}</div>
            <div class="pbg-reward">
              <span class="pbg-reward-label">Recompensa</span>
              ${rewardBadge(a.reward_type, a.reward_value)}
            </div>
          </div>
        `).join('')}
      `;
    }).join('');
  }

  function renderTournaments() {
    if (!data?.tournaments?.length) return '<div class="pbg-empty"><div class="pbg-empty-icon">⚔️</div><div class="pbg-empty-text">Nenhum torneio ativo</div></div>';

    const metricNames = { total_bet: 'Total Apostado', total_won: 'Total Ganho', total_deposit: 'Total Depositado', ggr: 'GGR' };
    const gameNames = { all: 'Todos', keno: 'Keno', cassino: 'Cassino' };

    return data.tournaments.map(t => {
      const prizes = t.prizes || [];
      const pool = prizes.reduce((s, p) => s + Number(p.value || 0), 0);
      return `
        <div class="pbg-card">
          <div class="pbg-card-title">🏆 ${t.name}</div>
          ${t.description ? `<p class="pbg-card-desc">${t.description}</p>` : ''}
          <div class="pbg-tournament-meta">
            <div class="pbg-tournament-stat">
              <div class="pbg-tournament-stat-label">Métrica</div>
              <div class="pbg-tournament-stat-value">${metricNames[t.metric] || t.metric}</div>
            </div>
            <div class="pbg-tournament-stat">
              <div class="pbg-tournament-stat-label">Jogo</div>
              <div class="pbg-tournament-stat-value">${gameNames[t.game_filter] || t.game_filter}</div>
            </div>
            <div class="pbg-tournament-stat">
              <div class="pbg-tournament-stat-label">Período</div>
              <div class="pbg-tournament-stat-value">${formatDate(t.start_date)} - ${formatDate(t.end_date)}</div>
            </div>
          </div>
          ${prizes.length ? `
            <div style="margin-top:10px">
              <div class="pbg-section-title" style="margin-bottom:6px">Prêmios</div>
              ${prizes.slice(0, 5).map(p => `
                <div class="pbg-prize-row">
                  <span class="pbg-prize-rank">${p.description || p.rank + 'º'}</span>
                  <span class="pbg-prize-value">${fmt(p.value)}</span>
                </div>
              `).join('')}
              ${prizes.length > 5 ? `<div style="font-size:11px;color:#52525b;text-align:center;margin-top:4px">+${prizes.length-5} prêmios</div>` : ''}
              <div class="pbg-prize-row" style="border-top:1px solid rgba(255,255,255,0.06);margin-top:6px;padding-top:6px">
                <span class="pbg-prize-rank" style="font-weight:600">Prize Pool</span>
                <span class="pbg-prize-value" style="font-size:14px">${fmt(pool)}</span>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function renderWheel() {
    const prizes = data?.wheel_prizes || [];
    if (!prizes.length) return '<div class="pbg-empty"><div class="pbg-empty-icon">🎡</div><div class="pbg-empty-text">Roleta não configurada</div></div>';

    const drawWheel = () => {
      const size = 280;
      const slices = prizes.length;
      const sliceAngle = (2 * Math.PI) / slices;

      let svgSlices = '';
      for (let i = 0; i < slices; i++) {
        const startAngle = i * sliceAngle - Math.PI / 2;
        const endAngle = startAngle + sliceAngle;
        const x1 = size/2 + (size/2) * Math.cos(startAngle);
        const y1 = size/2 + (size/2) * Math.sin(startAngle);
        const x2 = size/2 + (size/2) * Math.cos(endAngle);
        const y2 = size/2 + (size/2) * Math.sin(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;

        svgSlices += `<path d="M${size/2},${size/2} L${x1},${y1} A${size/2},${size/2} 0 ${largeArc},1 ${x2},${y2} Z" fill="${prizes[i].color}" stroke="#0c0a1a" stroke-width="2"/>`;

        // Label
        const midAngle = startAngle + sliceAngle / 2;
        const labelR = size * 0.35;
        const lx = size/2 + labelR * Math.cos(midAngle);
        const ly = size/2 + labelR * Math.sin(midAngle);
        const rotation = (midAngle * 180 / Math.PI);
        svgSlices += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="11" font-weight="600" font-family="Space Grotesk, sans-serif" transform="rotate(${rotation}, ${lx}, ${ly})">${prizes[i].label}</text>`;
      }

      return `<svg viewBox="0 0 ${size} ${size}" class="pbg-wheel-canvas" id="pbg-wheel-canvas">${svgSlices}</svg>`;
    };

    return `
      <div class="pbg-wheel-container">
        <div class="pbg-wheel-wrapper">
          <div class="pbg-wheel-pointer"></div>
          ${drawWheel()}
          <div class="pbg-wheel-center">
            <span style="font-size:20px">🎡</span>
          </div>
        </div>
        ${spinResult && !isSpinning ? `
          <div class="pbg-spin-result">
            <div class="pbg-spin-result-label">Você ganhou!</div>
            <div class="pbg-spin-result-value">${spinResult.type === 'nothing' ? 'Tente novamente!' : spinResult.label}</div>
          </div>
        ` : ''}
        <button class="pbg-spin-btn" ${isSpinning ? 'disabled' : ''} onclick="window.__pbgSpin()">
          ${isSpinning ? '⏳ Girando...' : '🎰 Girar a Roleta'}
        </button>
      </div>
    `;
  }

  function renderStore() {
    const items = data?.store_items || [];
    if (!items.length) return '<div class="pbg-empty"><div class="pbg-empty-icon">🛒</div><div class="pbg-empty-text">Loja vazia</div></div>';

    return `<div class="pbg-store-grid">${items.map(item => `
      <div class="pbg-store-item">
        ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : '<div style="font-size:32px;margin-bottom:8px">🎁</div>'}
        <div class="pbg-store-name">${item.name}</div>
        ${item.description ? `<div style="font-size:10px;color:#71717a;margin-top:2px">${item.description}</div>` : ''}
        <div class="pbg-store-price">
          ${item.price_coins ? `🪙 ${item.price_coins}` : ''}
          ${item.price_coins && item.price_xp ? ' · ' : ''}
          ${item.price_xp ? `⭐ ${item.price_xp} XP` : ''}
        </div>
        ${item.min_level ? `<div style="font-size:10px;color:#52525b;margin-top:2px">Nível ${item.min_level}+</div>` : ''}
      </div>
    `).join('')}</div>`;
  }

  function renderContent() {
    const contentEl = document.getElementById('pbg-widget-content');
    if (!contentEl) return;

    if (!data) {
      contentEl.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
      return;
    }

    const renderers = {
      missions: renderMissions,
      achievements: renderAchievements,
      tournaments: renderTournaments,
      wheel: renderWheel,
      store: renderStore,
    };

    contentEl.innerHTML = (renderers[activeTab] || renderMissions)();

    // Update tab active states
    document.querySelectorAll('.pbg-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
    });
  }

  // ---- BUILD DOM ----
  function init() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'pbg-widget-backdrop';
    backdrop.onclick = () => toggle(false);
    document.body.appendChild(backdrop);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'pbg-widget-panel';
    panel.innerHTML = `
      <div class="pbg-header">
        <h2>${ICONS.trophy} Recompensas</h2>
        <button class="pbg-close" onclick="window.__pbgToggle(false)">&times;</button>
      </div>
      <div class="pbg-tabs">
        <button class="pbg-tab active" data-tab="missions" onclick="window.__pbgTab('missions')">🎯 Missões</button>
        <button class="pbg-tab" data-tab="achievements" onclick="window.__pbgTab('achievements')">🏆 Conquistas</button>
        <button class="pbg-tab" data-tab="tournaments" onclick="window.__pbgTab('tournaments')">⚔️ Torneios</button>
        <button class="pbg-tab" data-tab="wheel" onclick="window.__pbgTab('wheel')">🎡 Roleta</button>
        <button class="pbg-tab" data-tab="store" onclick="window.__pbgTab('store')">🛒 Loja</button>
      </div>
      <div class="pbg-content" id="pbg-widget-content"></div>
    `;
    document.body.appendChild(panel);

    // FAB
    const fab = document.createElement('button');
    fab.id = 'pbg-widget-fab';
    fab.innerHTML = ICONS.gift;
    fab.onclick = () => toggle(!isOpen);
    fab.title = 'Recompensas';
    document.body.appendChild(fab);

    // Global handlers
    window.__pbgToggle = (state) => toggle(state);
    window.__pbgTab = (tab) => { activeTab = tab; renderContent(); };
    window.__pbgSpin = () => spinWheel();

    // Fetch data
    fetchData();
    // Refresh every 2 minutes
    setInterval(fetchData, 120_000);
  }

  function toggle(state) {
    isOpen = state;
    const panel = document.getElementById('pbg-widget-panel');
    const backdrop = document.getElementById('pbg-widget-backdrop');
    const fab = document.getElementById('pbg-widget-fab');
    if (panel) panel.classList.toggle('open', isOpen);
    if (backdrop) backdrop.classList.toggle('open', isOpen);
    if (fab) fab.style.display = isOpen ? 'none' : 'flex';
    if (isOpen && !data) fetchData();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
