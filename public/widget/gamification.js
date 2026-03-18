/**
 * PixBingoBR Gamification Widget v2
 * Embed via GTM: <script src="YOUR_HOST/widget/gamification.js"></script>
 * Attributes: data-segment, data-player, data-require-login, data-auth-selector
 */
(function () {
  'use strict';

  const API_URL = 'https://nehmmvtpagncmldivnxn.supabase.co/functions/v1/gamification-widget';

  if (window.__PIXBINGO_GAMIFICATION__) return;
  window.__PIXBINGO_GAMIFICATION__ = true;

  // Find the script tag — GTM injects via innerHTML so document.currentScript may be null
  let currentScript = document.currentScript;
  if (!currentScript) {
    const scripts = document.querySelectorAll('script[src*="gamification"]');
    currentScript = scripts.length > 0 ? scripts[scripts.length - 1] : null;
  }
  if (!currentScript) {
    const allScripts = document.querySelectorAll('script[data-segment], script[data-player], script[data-require-login]');
    currentScript = allScripts.length > 0 ? allScripts[allScripts.length - 1] : null;
  }

  const SEGMENT_ID = currentScript ? currentScript.getAttribute('data-segment') : null;
  const REQUIRE_LOGIN = currentScript ? currentScript.getAttribute('data-require-login') : null;
  const AUTH_SELECTOR = currentScript ? currentScript.getAttribute('data-auth-selector') : null;

  // CPF: 1) data-player attribute, 2) localStorage __pbr_cpf
  function getPlayerCpf() {
    const attr = currentScript ? currentScript.getAttribute('data-player') : null;
    if (attr) return attr;
    try { const ls = localStorage.getItem('__pbr_cpf'); if (ls) return ls; } catch {}
    return null;
  }
  let PLAYER_CPF = getPlayerCpf();

  function isUserLoggedIn() {
    PLAYER_CPF = getPlayerCpf(); // re-check (may have logged in after page load)
    if (PLAYER_CPF) return true;
    if (REQUIRE_LOGIN === 'true') {
      if (AUTH_SELECTOR) return !!document.querySelector(AUTH_SELECTOR);
      return false;
    }
    if (AUTH_SELECTOR) return !!document.querySelector(AUTH_SELECTOR);
    return true;
  }

  let data = null;
  let isOpen = false;
  let activeTab = 'missions';
  let isSpinning = false;
  let spinResult = null;
  let selectedTournament = null;
  let selectedStoreItem = null;
  let storeMessage = null;
  let selectedMission = null;
  let selectedMiniGame = null;
  let miniGameResult = null;
  let miniGamePlaying = false;
  let scratchRevealed = [];
  let giftBoxOpened = null;

  // ---- STYLES ----
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

    #pbg-widget-fab {
      position: fixed !important; bottom: 24px !important; right: 24px !important; width: 60px !important; height: 60px !important;
      border-radius: 50% !important; background: linear-gradient(135deg, #8b5cf6, #6366f1) !important;
      border: none !important; cursor: pointer !important; z-index: 2147483647 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      box-shadow: 0 4px 24px rgba(139, 92, 246, 0.4) !important;
      transition: transform 0.2s, box-shadow 0.2s !important;
      animation: pbg-pulse 2s infinite !important;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      opacity: 1 !important; visibility: visible !important;
      pointer-events: auto !important;
      transform: none !important;
      margin: 0 !important; padding: 0 !important;
      min-width: 60px !important; min-height: 60px !important;
      overflow: visible !important;
      left: auto !important; top: auto !important;
    }
    #pbg-widget-fab:hover { transform: scale(1.1) !important; box-shadow: 0 6px 32px rgba(139, 92, 246, 0.6) !important; }
    @keyframes pbg-pulse { 0%,100%{box-shadow:0 4px 24px rgba(139,92,246,0.4)} 50%{box-shadow:0 4px 32px rgba(139,92,246,0.7)} }
    #pbg-widget-fab svg { width: 28px !important; height: 28px !important; color: white !important; display: block !important; }

    #pbg-widget-panel {
      position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) scale(0.95);
      width: 420px; max-width: 95vw; height: 100vh;
      background: #0c0a1a !important; border: 1px solid rgba(139,92,246,0.2); border-radius: 20px;
      z-index: 2147483646 !important; transition: transform 0.3s ease, opacity 0.3s ease;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      display: flex !important; flex-direction: column; overflow: hidden;
      opacity: 0; pointer-events: none;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139,92,246,0.15);
    }
    #pbg-widget-panel.open { transform: translate(-50%, -50%) scale(1) !important; opacity: 1 !important; pointer-events: auto !important; }
    #pbg-widget-backdrop { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.6) !important; z-index: 2147483645 !important; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
    #pbg-widget-backdrop.open { opacity: 1 !important; pointer-events: auto !important; }

    .pbg-header {
      padding: 14px 20px; background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1));
      border-bottom: 1px solid rgba(255,255,255,0.06); border-radius: 20px 20px 0 0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .pbg-header h2 { font-size: 18px; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; gap: 8px; }
    .pbg-close {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: #a1a1aa; width: 32px; height: 32px; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 18px; transition: all 0.2s;
    }
    .pbg-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

    /* Level & Wallet bar */
    .pbg-level-bar {
      padding: 10px 16px; background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .pbg-level-info { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .pbg-level-name { font-size: 13px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px; }
    .pbg-level-xp { font-size: 11px; color: #71717a; }
    .pbg-xp-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
    .pbg-xp-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
    .pbg-wallet-row { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 8px; }
    .pbg-wallet-item { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; }
    .pbg-wallet-divider { width: 1px; height: 14px; background: rgba(255,255,255,0.08); }

    .pbg-tabs {
      display: flex; padding: 0 8px; gap: 1px;
      background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.06);
      overflow-x: auto; -webkit-overflow-scrolling: touch;
    }
    .pbg-tabs::-webkit-scrollbar { display: none; }
    .pbg-tab {
      padding: 9px 10px; font-size: 11px; font-weight: 600; color: #71717a;
      background: none; border: none; cursor: pointer; white-space: nowrap;
      border-bottom: 2px solid transparent; transition: all 0.2s; font-family: inherit;
    }
    .pbg-tab:hover { color: #a1a1aa; }
    .pbg-tab.active { color: #8b5cf6; border-bottom-color: #8b5cf6; }
    .pbg-tab-badge { background: #ef4444; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 8px; margin-left: 3px; font-weight: 700; }

    .pbg-content { flex: 1; overflow-y: auto; padding: 16px; }
    .pbg-content::-webkit-scrollbar { width: 4px; }
    .pbg-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

    .pbg-card {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; padding: 14px; margin-bottom: 10px; transition: border-color 0.2s; cursor: pointer;
    }
    .pbg-card:hover { border-color: rgba(139,92,246,0.3); }
    .pbg-card-title { font-size: 14px; font-weight: 600; color: #fff; margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pbg-card-desc { font-size: 12px; color: #71717a; margin: 0; line-height: 1.4; }
    .pbg-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; }

    /* Mission Smartico Style */
    .pbg-m-tabs { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 2px; }
    .pbg-m-tabs::-webkit-scrollbar { display: none; }
    .pbg-m-tab {
      padding: 7px 14px; border-radius: 20px; font-size: 11px; font-weight: 700;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      color: #a1a1aa; cursor: pointer; white-space: nowrap; transition: all 0.2s; font-family: inherit;
    }
    .pbg-m-tab:hover { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.2); }
    .pbg-m-tab.active { background: linear-gradient(135deg, #8b5cf6, #6366f1); border-color: transparent; color: #fff; }
    .pbg-m-tab-count { background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 9px; margin-left: 4px; }
    .pbg-m-card {
      position: relative; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; overflow: hidden; margin-bottom: 10px; cursor: pointer;
      transition: all 0.2s;
    }
    .pbg-m-card:hover { border-color: rgba(139,92,246,0.25); transform: translateY(-1px); }
    .pbg-m-card.completed { opacity: 0.55; }
    .pbg-m-card.completed:hover { opacity: 0.75; }
    .pbg-m-body { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
    .pbg-m-icon {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
    }
    .pbg-m-info { flex: 1; min-width: 0; }
    .pbg-m-name { font-size: 13px; font-weight: 700; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pbg-m-desc { font-size: 11px; color: #71717a; margin: 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pbg-m-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .pbg-m-reward-chip {
      padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700;
      background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: #34d399;
    }
    .pbg-m-progress-ring {
      width: 38px; height: 38px; position: relative;
    }
    .pbg-m-progress-ring svg { width: 38px; height: 38px; transform: rotate(-90deg); }
    .pbg-m-progress-ring .bg { fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 3; }
    .pbg-m-progress-ring .fg { fill: none; stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
    .pbg-m-progress-pct {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 800; color: #fff;
    }
    .pbg-m-footer {
      display: flex; align-items: center; gap: 6px; padding: 0 14px 10px;
      flex-wrap: wrap;
    }
    .pbg-m-tag {
      display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px;
      border-radius: 5px; font-size: 9px; font-weight: 600;
    }
    .pbg-m-timer { background: rgba(239,68,68,0.1); color: #f87171; }
    .pbg-m-optin-tag { background: rgba(245,158,11,0.1); color: #fbbf24; }
    .pbg-m-rec { background: rgba(139,92,246,0.1); color: #a78bfa; }
    .pbg-m-complete-tag { background: rgba(16,185,129,0.12); color: #34d399; }
    .pbg-m-claim-btn {
      padding: 4px 12px; border-radius: 8px; font-size: 10px; font-weight: 700;
      background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none;
      cursor: pointer; font-family: inherit; animation: pbg-pulse-green 1.5s infinite;
    }
    @keyframes pbg-pulse-green { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0)} }

    /* Detail view */
    .pbg-m-detail { animation: pbg-fade-in 0.2s ease; }
    .pbg-m-detail-header {
      text-align: center; padding: 20px; position: relative;
      background: linear-gradient(180deg, rgba(139,92,246,0.12) 0%, transparent 100%);
      border-radius: 14px 14px 0 0; margin: -16px -16px 16px;
    }
    .pbg-m-detail-icon { font-size: 48px; margin-bottom: 8px; }
    .pbg-m-detail-name { font-size: 18px; font-weight: 800; color: #fff; }
    .pbg-m-detail-desc { font-size: 12px; color: #a1a1aa; margin-top: 4px; line-height: 1.5; }
    .pbg-m-detail-section {
      padding: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; margin-bottom: 12px;
    }
    .pbg-m-detail-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #52525b; margin-bottom: 8px; }
    .pbg-m-detail-progress-bar { height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
    .pbg-m-detail-progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
    .pbg-m-detail-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .pbg-m-detail-stat {
      padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
      border-radius: 8px; text-align: center;
    }
    .pbg-m-detail-stat-value { font-size: 16px; font-weight: 800; color: #fff; }
    .pbg-m-detail-stat-label { font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
    .pbg-badge-bonus { background: rgba(16,185,129,0.15); color: #34d399; }
    .pbg-badge-coins { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .pbg-badge-xp { background: rgba(99,102,241,0.15); color: #818cf8; }
    .pbg-badge-spins { background: rgba(139,92,246,0.15); color: #a78bfa; }
    .pbg-badge-free_bet { background: rgba(6,182,212,0.15); color: #22d3ee; }
    .pbg-badge-nothing { background: rgba(113,113,122,0.15); color: #a1a1aa; }
    .pbg-badge-daily { background: rgba(245,158,11,0.12); color: #fbbf24; }
    .pbg-badge-weekly { background: rgba(6,182,212,0.12); color: #22d3ee; }
    .pbg-badge-monthly { background: rgba(139,92,246,0.12); color: #a78bfa; }
    .pbg-badge-one_time { background: rgba(16,185,129,0.12); color: #34d399; }
    .pbg-badge-optin { background: rgba(245,158,11,0.12); color: #f59e0b; }
    .pbg-badge-timer { background: rgba(239,68,68,0.12); color: #f87171; }
    .pbg-badge-recurrence { background: rgba(139,92,246,0.12); color: #a78bfa; }
    .pbg-badge-completed { background: rgba(16,185,129,0.15); color: #34d399; }
    .pbg-reward { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); }
    .pbg-reward-label { font-size: 11px; color: #71717a; }
    .pbg-condition { font-size: 11px; color: #a1a1aa; margin-top: 6px; display: flex; align-items: center; gap: 4px; }
    .pbg-progress-track { height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 6px; }
    .pbg-progress-fill { height: 100%; background: linear-gradient(90deg, #8b5cf6, #6366f1); border-radius: 3px; transition: width 0.3s; }
    .pbg-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #52525b; margin-bottom: 10px; padding-left: 2px; }
    .pbg-segment-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 5px; font-size: 9px; font-weight: 600; background: rgba(139,92,246,0.12); color: #a78bfa; }

    /* Tournament — Smartico style */
    .pbg-t-card {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; overflow: hidden; margin-bottom: 12px; cursor: pointer;
      transition: border-color 0.2s, transform 0.15s;
    }
    .pbg-t-card:hover { border-color: rgba(139,92,246,0.3); transform: translateY(-1px); }
    .pbg-t-banner {
      position: relative; height: 90px; background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.15));
      display: flex; align-items: flex-end; padding: 10px 14px;
    }
    .pbg-t-banner img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .pbg-t-banner-overlay { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(12,10,26,0.85) 0%, transparent 60%); }
    .pbg-t-banner-content { position: relative; z-index: 1; width: 100%; }
    .pbg-t-status {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
      border-radius: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .pbg-t-status-live { background: rgba(16,185,129,0.2); color: #34d399; }
    .pbg-t-status-soon { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .pbg-t-status-ended { background: rgba(113,113,122,0.2); color: #a1a1aa; }
    .pbg-t-body { padding: 12px 14px; }
    .pbg-t-title { font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 6px; }
    .pbg-t-desc { font-size: 11px; color: #71717a; margin: 0 0 10px; line-height: 1.4; }
    .pbg-t-stats { display: flex; gap: 6px; }
    .pbg-t-stat {
      flex: 1; background: rgba(255,255,255,0.04); border-radius: 8px;
      padding: 8px; text-align: center; min-width: 0;
    }
    .pbg-t-stat-label { font-size: 9px; color: #52525b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    .pbg-t-stat-val { font-size: 14px; font-weight: 800; color: #fff; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pbg-t-countdown {
      display: flex; gap: 6px; justify-content: center; margin: 10px 0;
    }
    .pbg-t-cd-unit {
      background: linear-gradient(145deg, rgba(139,92,246,0.15), rgba(99,102,241,0.08));
      border: 1px solid rgba(139,92,246,0.2); border-radius: 8px;
      padding: 6px 10px; text-align: center; min-width: 48px;
    }
    .pbg-t-cd-num { font-size: 20px; font-weight: 800; color: #fff; font-family: 'JetBrains Mono', monospace; line-height: 1; }
    .pbg-t-cd-lbl { font-size: 8px; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
    /* Podium */
    .pbg-podium { display: flex; align-items: flex-end; justify-content: center; gap: 6px; margin: 12px 0 8px; }
    .pbg-podium-col { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .pbg-podium-bar {
      width: 72px; border-radius: 8px 8px 0 0; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-start; padding: 10px 4px 6px;
    }
    .pbg-podium-1 .pbg-podium-bar { background: linear-gradient(180deg, rgba(251,191,36,0.25), rgba(251,191,36,0.08)); border: 1px solid rgba(251,191,36,0.3); border-bottom: none; height: 100px; }
    .pbg-podium-2 .pbg-podium-bar { background: linear-gradient(180deg, rgba(192,192,192,0.2), rgba(192,192,192,0.06)); border: 1px solid rgba(192,192,192,0.2); border-bottom: none; height: 80px; }
    .pbg-podium-3 .pbg-podium-bar { background: linear-gradient(180deg, rgba(205,127,50,0.2), rgba(205,127,50,0.06)); border: 1px solid rgba(205,127,50,0.2); border-bottom: none; height: 65px; }
    .pbg-podium-medal { font-size: 22px; line-height: 1; }
    .pbg-podium-name { font-size: 10px; color: #a1a1aa; margin-top: 4px; font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 68px; }
    .pbg-podium-score { font-size: 11px; font-weight: 700; color: #fbbf24; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
    /* Leaderboard rows */
    .pbg-lb-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; margin-bottom: 2px; }
    .pbg-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
    .pbg-lb-rank { font-size: 12px; font-weight: 700; width: 24px; text-align: center; color: #71717a; }
    .pbg-lb-cpf { font-size: 12px; color: #a1a1aa; flex: 1; font-family: 'JetBrains Mono', monospace; }
    .pbg-lb-score { font-size: 12px; font-weight: 700; color: #fbbf24; font-family: 'JetBrains Mono', monospace; }
    .pbg-lb-me { background: rgba(139,92,246,0.1) !important; border: 1px solid rgba(139,92,246,0.3); }
    /* Prize table */
    .pbg-prize-row { display: flex; align-items: center; padding: 10px 14px; gap: 10px; }
    .pbg-prize-row:nth-child(even) { background: rgba(255,255,255,0.02); }
    .pbg-prize-rank { width: 28px; font-size: 16px; text-align: center; }
    .pbg-prize-desc { flex: 1; font-size: 12px; color: #d4d4d8; }
    .pbg-prize-val { font-size: 13px; font-weight: 700; color: #34d399; font-family: 'JetBrains Mono', monospace; }
    .pbg-prize-total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: linear-gradient(135deg, rgba(139,92,246,0.1), rgba(16,185,129,0.06)); border-top: 1px solid rgba(255,255,255,0.06); }
    .pbg-t-join-btn {
      width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: all 0.2s;
      background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff;
      box-shadow: 0 4px 16px rgba(139,92,246,0.3);
    }
    .pbg-t-join-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(139,92,246,0.4); }
    .pbg-t-joined {
      width: 100%; padding: 10px; border-radius: 10px; text-align: center;
      background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15);
      font-size: 13px; font-weight: 600; color: #34d399;
    }
    .pbg-t-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
    .pbg-t-tag {
      display: inline-flex; align-items: center; gap: 3px; padding: 3px 7px;
      border-radius: 5px; font-size: 9px; font-weight: 600;
      background: rgba(255,255,255,0.04); color: #a1a1aa;
    }

    /* Wheel — Premium Casino */
    .pbg-wheel-container { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 0 0 6px; }
    .pbg-wheel-stage {
      position: relative; width: 280px; height: 280px; margin: 20px auto 0;
    }
    /* Golden outer ring */
    .pbg-wheel-ring-outer {
      position: absolute; inset: -12px; border-radius: 50%;
      background: linear-gradient(160deg, #d4a017 0%, #f7d86c 25%, #b8860b 50%, #f7d86c 75%, #d4a017 100%);
      box-shadow: 0 0 24px rgba(212,160,23,0.35), inset 0 0 12px rgba(0,0,0,0.4);
    }
    /* Dark inner ring */
    .pbg-wheel-ring-inner {
      position: absolute; inset: -4px; border-radius: 50%;
      background: #110d24;
      box-shadow: inset 0 0 16px rgba(0,0,0,0.6);
    }
    /* Bulbs on the golden ring */
    .pbg-wheel-bulbs { position: absolute; inset: -12px; border-radius: 50%; z-index: 3; pointer-events: none; }
    .pbg-bulb {
      position: absolute; width: 9px; height: 9px; border-radius: 50%;
      border: 1.5px solid rgba(0,0,0,0.25);
    }
    .pbg-bulb-on { background: radial-gradient(circle at 35% 35%, #fff, #ffe066); box-shadow: 0 0 8px 2px rgba(255,224,102,0.7); }
    .pbg-bulb-off { background: radial-gradient(circle at 35% 35%, #fff, #f0abfc); box-shadow: 0 0 8px 2px rgba(240,171,252,0.5); }
    @keyframes pbg-bulb-a { 0%,100%{ opacity:1 } 50%{ opacity:0.25 } }
    @keyframes pbg-bulb-b { 0%,100%{ opacity:0.25 } 50%{ opacity:1 } }
    .pbg-wheel-bulbs.spin .pbg-bulb-on { animation: pbg-bulb-a 0.4s infinite; }
    .pbg-wheel-bulbs.spin .pbg-bulb-off { animation: pbg-bulb-b 0.4s infinite; }
    /* SVG wheel */
    .pbg-wheel-svg {
      position: absolute; inset: 0; width: 280px; height: 280px; border-radius: 50%; z-index: 2;
      transition: transform 5s cubic-bezier(0.12,0.68,0.08,1.00);
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
    }
    /* Pointer / flapper */
    .pbg-wheel-flap {
      position: absolute; top: -8px; left: 50%; transform: translateX(-50%); z-index: 6;
    }
    .pbg-wheel-flap svg { filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
    /* Center hub */
    .pbg-wheel-hub {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 56px; height: 56px; border-radius: 50%; z-index: 4;
      background: linear-gradient(145deg, #f7d86c 0%, #d4a017 40%, #b8860b 100%);
      border: 3px solid #1a1435;
      box-shadow: 0 4px 18px rgba(0,0,0,0.5), inset 0 2px 6px rgba(255,255,255,0.35);
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
      user-select: none;
    }
    .pbg-wheel-hub:hover { transform: translate(-50%,-50%) scale(1.06); box-shadow: 0 4px 24px rgba(212,160,23,0.5), inset 0 2px 6px rgba(255,255,255,0.35); }
    .pbg-wheel-hub.off { opacity: 0.55; cursor: not-allowed; }
    .pbg-wheel-hub.off:hover { transform: translate(-50%,-50%); box-shadow: 0 4px 18px rgba(0,0,0,0.5), inset 0 2px 6px rgba(255,255,255,0.35); }
    .pbg-hub-text { font-size: 11px; font-weight: 800; color: #1a1435; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.1; text-align: center; font-family: inherit; }
    .pbg-hub-icon { font-size: 18px; line-height: 1; }
    .pbg-spin-info {
      font-size: 11px; color: #a1a1aa; text-align: center;
      display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;
      margin-top: 4px;
    }
    .pbg-spin-tag {
      display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px;
      border-radius: 8px; font-size: 11px; font-weight: 600;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    }
    .pbg-spin-result {
      text-align: center; padding: 14px 16px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(212,160,23,0.10), rgba(139,92,246,0.08));
      border: 1px solid rgba(212,160,23,0.2);
      animation: pbg-scale-in 0.35s ease;
    }
    .pbg-spin-result-prize { font-size: 22px; font-weight: 800; color: #f7d86c; margin-top: 4px; }
    .pbg-spin-cost-badge {
      display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
      border-radius: 8px; font-size: 11px; font-weight: 600;
      background: rgba(245,158,11,0.08); color: #fbbf24; border: 1px solid rgba(245,158,11,0.15);
    }
    @media (max-width: 420px) {
      .pbg-wheel-stage { width: 250px; height: 250px; }
    }

    /* Mini Games */
    .pbg-mg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pbg-mg-card {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; padding: 16px; text-align: center; cursor: pointer;
      transition: border-color 0.2s, transform 0.15s;
    }
    .pbg-mg-card:hover { border-color: rgba(139,92,246,0.3); transform: translateY(-2px); }
    .pbg-mg-card.greyed { opacity: 0.45; pointer-events: none; }
    .pbg-mg-icon { font-size: 36px; margin-bottom: 8px; }
    .pbg-mg-name { font-size: 13px; font-weight: 700; color: #fff; }
    .pbg-mg-type { font-size: 10px; color: #71717a; margin-top: 2px; }
    .pbg-mg-attempts { font-size: 10px; color: #a1a1aa; margin-top: 6px; }
    @keyframes pbg-bounce { 0%{transform:scale(0.5);opacity:0} 50%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
    /* Scratch Card */
    .pbg-scratch-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; max-width: 280px; margin: 0 auto; }
    .pbg-scratch-cell {
      aspect-ratio: 1; border-radius: 12px; cursor: pointer; position: relative; overflow: hidden;
      transition: transform 0.2s;
    }
    .pbg-scratch-cell:hover { transform: scale(1.03); }
    .pbg-scratch-cover {
      position: absolute; inset: 0; border-radius: 12px;
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; transition: opacity 0.4s, transform 0.4s;
    }
    .pbg-scratch-cover.revealed { opacity: 0; transform: scale(0.8); pointer-events: none; }
    .pbg-scratch-inner {
      position: absolute; inset: 0; border-radius: 12px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600; color: #fff; padding: 6px;
    }
    .pbg-scratch-inner.win { background: rgba(16,185,129,0.15); border: 2px solid rgba(16,185,129,0.3); }
    .pbg-scratch-inner.lose { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
    /* Gift Box */
    .pbg-gift-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; max-width: 280px; margin: 0 auto; }
    .pbg-gift-box {
      aspect-ratio: 1; border-radius: 14px; cursor: pointer; position: relative;
      background: linear-gradient(145deg, rgba(139,92,246,0.2), rgba(99,102,241,0.1));
      border: 2px solid rgba(139,92,246,0.3);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .pbg-gift-box:hover { transform: scale(1.05); box-shadow: 0 4px 20px rgba(139,92,246,0.3); }
    .pbg-gift-box.opened {
      background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08);
      cursor: default; transform: none;
    }
    .pbg-gift-box.opened:hover { transform: none; box-shadow: none; }
    .pbg-gift-box.won { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
    .pbg-gift-icon { font-size: 32px; transition: transform 0.3s; }
    .pbg-gift-box:hover .pbg-gift-icon { transform: rotate(-10deg) scale(1.1); }
    .pbg-gift-label { font-size: 10px; color: #a1a1aa; margin-top: 4px; font-weight: 600; }

    /* Store */
    .pbg-store-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pbg-store-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; text-align: center; transition: border-color 0.2s; cursor: pointer; }
    .pbg-store-item:hover { border-color: rgba(139,92,246,0.3); }
    .pbg-store-item img { width: 48px; height: 48px; object-fit: contain; margin: 0 auto 8px; border-radius: 8px; }
    .pbg-store-item.greyed { opacity: 0.45; }

    /* Modal */
    .pbg-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.7); z-index: 10; display: flex; align-items: center; justify-content: center; padding: 20px; animation: pbg-fade-in 0.2s ease; }
    @keyframes pbg-fade-in { from{opacity:0} to{opacity:1} }
    .pbg-modal { background: #1a1730; border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 24px; width: 100%; max-width: 320px; text-align: center; animation: pbg-scale-in 0.2s ease; max-height: 90%; overflow-y: auto; }
    @keyframes pbg-scale-in { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }
    .pbg-modal-btn { background: linear-gradient(135deg,#8b5cf6,#6366f1); border: none; color: white; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; width: 100%; transition: all 0.2s; box-shadow: 0 4px 16px rgba(139,92,246,0.3); }
    .pbg-modal-btn:hover { transform: translateY(-1px); }
    .pbg-modal-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .pbg-modal-btn-close { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #a1a1aa; padding: 10px 24px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; width: 100%; margin-top: 8px; transition: all 0.2s; }
    .pbg-modal-btn-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .pbg-modal-success { color: #34d399; font-size: 14px; font-weight: 600; padding: 12px; background: rgba(16,185,129,0.1); border-radius: 10px; margin-bottom: 12px; }
    .pbg-modal-error { color: #f87171; font-size: 13px; font-weight: 600; padding: 10px; background: rgba(239,68,68,0.1); border-radius: 10px; margin-bottom: 10px; }

    /* Activity log */
    .pbg-log-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .pbg-log-item:last-child { border-bottom: none; }
    .pbg-log-desc { font-size: 12px; color: #d4d4d8; }
    .pbg-log-source { font-size: 10px; color: #52525b; margin-top: 2px; }
    .pbg-log-amount { font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .pbg-log-positive { color: #34d399; }
    .pbg-log-negative { color: #f87171; }
    .pbg-log-time { font-size: 10px; color: #52525b; }

    /* Leaderboard */
    .pbg-lb-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; margin-bottom: 4px; }
    .pbg-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
    .pbg-lb-rank { font-size: 14px; font-weight: 700; width: 28px; text-align: center; }
    .pbg-lb-cpf { font-size: 12px; color: #a1a1aa; flex: 1; font-family: 'JetBrains Mono', monospace; }
    .pbg-lb-score { font-size: 13px; font-weight: 700; color: #fbbf24; font-family: 'JetBrains Mono', monospace; }
    .pbg-lb-me { background: rgba(139,92,246,0.1) !important; border: 1px solid rgba(139,92,246,0.3); }

    /* Pending rewards */
    .pbg-pending-card { background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.15); border-radius: 10px; padding: 12px; margin-bottom: 8px; }
    .pbg-claim-btn { background: linear-gradient(135deg, #f59e0b, #d97706); border: none; color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; margin-top: 8px; }

    @media (max-width: 420px) {
      #pbg-widget-panel { width: 100vw !important; height: 100vh !important; max-height: 100vh !important; border-radius: 0 !important; max-width: 100vw !important; }
      #pbg-widget-fab { bottom: 16px !important; right: 16px !important; width: 56px !important; height: 56px !important; min-width: 56px !important; min-height: 56px !important; }
      .pbg-header { border-radius: 0 !important; }
      .pbg-wheel-stage { width: 250px; height: 250px; }
    }
  `;

  const ICONS = {
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
  };

  const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const maskCpf = (cpf) => cpf ? cpf.slice(0,3) + '***' + cpf.slice(-2) : '???';
  const formatDate = (d) => { if (!d) return ''; const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; };
  const timeAgo = (d) => { const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (mins < 60) return `${mins}min`; const hrs = Math.floor(mins/60); if (hrs < 24) return `${hrs}h`; return `${Math.floor(hrs/24)}d`; };

  const rewardBadge = (type, value) => {
    const cls = `pbg-badge-${type}` || 'pbg-badge-bonus';
    const labels = { bonus: fmt(value), free_bet: fmt(value), coins: `${value} Moedas`, xp: `${value} XP`, spins: `${value} Giros`, nothing: 'Nada' };
    return `<span class="pbg-badge pbg-badge-${type}">${labels[type] || `${value} ${type}`}</span>`;
  };

  const segmentBadge = (item) => item.segments?.name ? `<span class="pbg-segment-badge">${item.segments.name}</span>` : '';

  const conditionText = (type, value) => {
    const map = {
      first_deposit: '1º Depósito', total_deposited: `Depositar ${fmt(value)}`, total_bet: `Apostar ${fmt(value)}`,
      min_balance: `Saldo acima de ${fmt(value)}`,
      consecutive_days: `${value} dias consecutivos`, total_wins: `${value} vitória(s)`, total_games: `${value} partida(s)`,
      referrals: `${value} indicação(ões)`, deposit: `Depositar ${fmt(value)}`, bet: `Apostar ${fmt(value)}`,
      win: `Vencer ${value}x`, login: `Login ${value}x`, play_keno: `Jogar Keno ${value}x`, play_cassino: `Jogar Cassino ${value}x`,
      referral: `Indicar ${value} amigo(s)`, spin_wheel: `Girar roleta ${value}x`, store_purchase: `Comprar na loja ${value}x`,
    };
    return map[type] || `${type}: ${value}`;
  };

  const apiCall = async (action, params = {}) => {
    const segQ = SEGMENT_ID ? `&segment=${SEGMENT_ID}` : '';
    const playerQ = PLAYER_CPF ? `&player=${PLAYER_CPF}` : '';
    const extra = Object.entries(params).map(([k,v]) => `&${k}=${v}`).join('');
    const res = await fetch(`${API_URL}?action=${action}${segQ}${playerQ}${extra}`, { headers: { 'Content-Type': 'application/json' } });
    return res.json();
  };

  async function fetchData() {
    try { data = await apiCall('data'); renderContent(); } catch (e) { console.error('[PBG Widget]', e); }
  }

  // ---- LEVEL HELPERS ----
  function getLevelInfo() {
    if (!data?.wallet || !data?.levels?.length) return null;
    const w = data.wallet;
    const levels = data.levels.sort((a,b) => a.level_number - b.level_number);
    let current = levels[0];
    let next = levels.length > 1 ? levels[1] : null;
    for (let i = 0; i < levels.length; i++) {
      if (w.xp >= levels[i].min_xp) { current = levels[i]; next = levels[i+1] || null; }
    }
    const xpInLevel = w.xp - current.min_xp;
    const xpForNext = next ? next.min_xp - current.min_xp : 1;
    const pct = next ? Math.min(100, Math.round((xpInLevel / xpForNext) * 100)) : 100;
    return { current, next, pct, xpInLevel, xpForNext };
  }

  function getMissionProgress(missionId) {
    return (data?.mission_progress || []).find(p => p.mission_id === missionId);
  }

  // ---- SPIN ----
  async function spinWheel() {
    if (isSpinning) return;
    isSpinning = true; spinResult = null; renderContent();

    // Start bulbs animation
    const bulbs = document.getElementById('pbg-wheel-bulbs');
    if (bulbs) bulbs.classList.add('spin');

    try {
      const result = await apiCall('spin');
      if (result.error) { spinResult = { error: result.error }; isSpinning = false; renderContent(); return; }
      spinResult = result.prize;
      const canvas = document.getElementById('pbg-wheel-canvas');
      if (canvas && result.prizes) {
        // Rebuild displayPrizes same way as renderWheel
        let dp = [...result.prizes];
        while (dp.length < 6 && dp.length > 0) dp = dp.concat(result.prizes);
        // Find ALL matching slots and pick one randomly
        const matchingSlots = [];
        for (let si = 0; si < dp.length; si++) {
          if (dp[si].id === spinResult.id) matchingSlots.push(si);
        }
        const winIndex = matchingSlots.length > 0
          ? matchingSlots[Math.floor(Math.random() * matchingSlots.length)]
          : 0;
        const sliceAngle = 360 / dp.length;
        // The pointer is at top (12 o'clock). Sector 0 starts at -90deg (top).
        // To land on sector winIndex, we rotate so that sector's center aligns with top.
        const sectorCenter = winIndex * sliceAngle + sliceAngle / 2;
        const targetAngle = 360 - sectorCenter;
        const totalRotation = (7 + Math.floor(Math.random() * 3)) * 360 + targetAngle;
        canvas.style.transform = `rotate(${totalRotation}deg)`;
      }
      setTimeout(() => {
        isSpinning = false;
        const b = document.getElementById('pbg-wheel-bulbs');
        if (b) b.classList.remove('spin');
        fetchData();
      }, 5200);
    } catch (e) { isSpinning = false; renderContent(); }
  }

  // ---- RENDERS ----
  // Mission sub-tab state
  let missionTab = 'all';

  function renderMissions() {
    if (!data?.missions?.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">🎯</div><div style="font-size:13px">Nenhuma missão disponível</div></div>';

    const typeColors = { daily: '#f59e0b', weekly: '#06b6d4', monthly: '#8b5cf6', one_time: '#10b981' };
    const typeIcons = { daily: '⚡', weekly: '📅', monthly: '🔄', one_time: '🎯' };
    const typeLabels = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', one_time: 'Única' };
    const recLabels = { daily: 'Reseta todo dia', weekly: 'Reseta toda semana', monthly: 'Reseta todo mês' };
    const circumference = Math.PI * 2 * 15; // r=15

    // Mission detail view
    if (selectedMission !== null) {
      const m = data.missions[selectedMission];
      if (!m) { selectedMission = null; return renderMissions(); }
      const progress = getMissionProgress(m.id);
      const pct = progress ? Math.min(100, Math.round((progress.progress / progress.target) * 100)) : 0;
      const isCompleted = progress?.completed;
      const isOptedIn = progress?.opted_in;
      const isClaimed = progress?.claimed;
      const color = typeColors[m.type] || '#8b5cf6';
      const dashOffset = circumference - (circumference * pct / 100);

      return `
        <div class="pbg-m-detail">
          <button onclick="window.__pbg('closeMission')" style="background:none;border:none;color:#a1a1aa;font-size:13px;cursor:pointer;font-family:inherit;padding:0;margin-bottom:8px">← Voltar</button>

          <div class="pbg-m-detail-header">
            <div class="pbg-m-detail-icon">${m.icon_url ? `<img src="${m.icon_url}" style="width:56px;height:56px;border-radius:14px" alt="">` : typeIcons[m.type] || '🎯'}</div>
            <div class="pbg-m-detail-name">${m.name}</div>
            ${m.description ? `<div class="pbg-m-detail-desc">${m.description}</div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:10px">
              <span class="pbg-m-tag" style="background:${color}18;color:${color}">${typeIcons[m.type]} ${typeLabels[m.type]}</span>
              ${m.require_optin ? '<span class="pbg-m-tag pbg-m-optin-tag">✋ Opt-in</span>' : ''}
              ${m.time_limit_hours ? `<span class="pbg-m-tag pbg-m-timer">⏱ ${m.time_limit_hours}h</span>` : ''}
              ${m.recurrence && m.recurrence !== 'none' ? `<span class="pbg-m-tag pbg-m-rec">🔄 ${recLabels[m.recurrence] || m.recurrence}</span>` : ''}
              ${isCompleted ? '<span class="pbg-m-tag pbg-m-complete-tag">✅ Completa</span>' : ''}
            </div>
          </div>

          <!-- Objective -->
          <div class="pbg-m-detail-section">
            <div class="pbg-m-detail-section-title">📋 Objetivo</div>
            <div style="font-size:14px;font-weight:700;color:#fff">${conditionText(m.condition_type, m.condition_value)}</div>
          </div>

          <!-- Progress -->
          ${PLAYER_CPF ? `
            <div class="pbg-m-detail-section">
              <div class="pbg-m-detail-section-title">📊 Progresso</div>
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">
                <div class="pbg-m-progress-ring">
                  <svg viewBox="0 0 38 38">
                    <circle class="bg" cx="19" cy="19" r="15" />
                    <circle class="fg" cx="19" cy="19" r="15" stroke="${isCompleted ? '#34d399' : color}" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" />
                  </svg>
                  <div class="pbg-m-progress-pct">${pct}%</div>
                </div>
                <div style="flex:1">
                  <div class="pbg-m-detail-progress-bar">
                    <div class="pbg-m-detail-progress-fill" style="width:${pct}%;background:${isCompleted ? '#34d399' : `linear-gradient(90deg, ${color}, ${color}cc)`}"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px">
                    <span style="color:#71717a">Atual</span>
                    <span style="color:#fff;font-weight:700">${progress ? `${progress.progress} / ${progress.target}` : '0 / ?'}</span>
                  </div>
                </div>
              </div>
              <div class="pbg-m-detail-stats">
                <div class="pbg-m-detail-stat">
                  <div class="pbg-m-detail-stat-value" style="color:${color}">${progress?.progress || 0}</div>
                  <div class="pbg-m-detail-stat-label">Progresso</div>
                </div>
                <div class="pbg-m-detail-stat">
                  <div class="pbg-m-detail-stat-value">${progress?.target || '?'}</div>
                  <div class="pbg-m-detail-stat-label">Objetivo</div>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Reward -->
          <div class="pbg-m-detail-section" style="background:rgba(16,185,129,0.04);border-color:rgba(16,185,129,0.12)">
            <div class="pbg-m-detail-section-title" style="color:#34d399">🎁 Recompensa</div>
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 0">
              <div style="font-size:28px">${{bonus:'💵',free_bet:'🎟️',coins:'🪙',xp:'⭐',spins:'🎡'}[m.reward_type] || '🎁'}</div>
              <div>
                <div style="font-size:18px;font-weight:800;color:#fff">${m.reward_type === 'bonus' || m.reward_type === 'free_bet' ? fmt(m.reward_value) : m.reward_value}</div>
                <div style="font-size:11px;color:#71717a">${{bonus:'Bônus',free_bet:'Aposta Grátis',coins:'Moedas',xp:'Pontos XP',spins:'Giros na Roleta'}[m.reward_type] || m.reward_type}</div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          ${m.require_optin && !isOptedIn && !isCompleted && PLAYER_CPF ? `
            <button class="pbg-modal-btn" style="margin-top:4px" onclick="window.__pbg('missionOptin','${m.id}')">✋ Participar desta Missão</button>
          ` : ''}
          ${isCompleted && m.manual_claim && !isClaimed && PLAYER_CPF ? `
            <button class="pbg-modal-btn" style="margin-top:4px;background:linear-gradient(135deg,#10b981,#059669)" onclick="window.__pbg('claimMission','${m.id}')">🎁 Resgatar Recompensa</button>
          ` : ''}
          ${m.cta_text && m.cta_url && !isCompleted ? `
            <a href="${m.cta_url}" target="_blank" style="display:block;text-align:center;padding:12px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;color:#a78bfa;font-weight:700;font-size:13px;text-decoration:none;margin-top:8px;transition:all 0.2s">${m.cta_text} →</a>
          ` : ''}
        </div>
      `;
    }

    // Mission list with sub-tabs
    const tabs = [
      { key: 'all', label: 'Todas', count: data.missions.length },
      { key: 'daily', label: '⚡ Diárias', count: data.missions.filter(m => m.type === 'daily').length },
      { key: 'weekly', label: '📅 Semanais', count: data.missions.filter(m => m.type === 'weekly').length },
      { key: 'monthly', label: '🔄 Mensais', count: data.missions.filter(m => m.type === 'monthly').length },
      { key: 'one_time', label: '🎯 Únicas', count: data.missions.filter(m => m.type === 'one_time').length },
    ].filter(t => t.count > 0);

    let html = `<div class="pbg-m-tabs">`;
    tabs.forEach(t => {
      html += `<button class="pbg-m-tab ${missionTab === t.key ? 'active' : ''}" onclick="window.__pbg('missionFilter','${t.key}')">${t.label}<span class="pbg-m-tab-count">${t.count}</span></button>`;
    });
    html += `</div>`;

    const filtered = missionTab === 'all' ? data.missions : data.missions.filter(m => m.type === missionTab);

    // Separate active vs completed
    const active = filtered.filter(m => { const p = getMissionProgress(m.id); return !p?.completed; });
    const completed = filtered.filter(m => { const p = getMissionProgress(m.id); return p?.completed; });

    const renderCard = (m) => {
      const globalIdx = data.missions.indexOf(m);
      const progress = getMissionProgress(m.id);
      const pct = progress ? Math.min(100, Math.round((progress.progress / progress.target) * 100)) : 0;
      const isCompleted = progress?.completed;
      const isClaimed = progress?.claimed;
      const isOptedIn = progress?.opted_in;
      const color = typeColors[m.type] || '#8b5cf6';
      const dashOffset = circumference - (circumference * pct / 100);
      const rewardText = m.reward_type === 'bonus' || m.reward_type === 'free_bet' ? fmt(m.reward_value) : `${m.reward_value} ${{coins:'🪙',xp:'⭐',spins:'🎡'}[m.reward_type] || m.reward_type}`;

      return `
        <div class="pbg-m-card ${isCompleted ? 'completed' : ''}" onclick="window.__pbg('openMission',${globalIdx})">
          <div class="pbg-m-body">
            <div class="pbg-m-icon" style="background:${color}15">
              ${m.icon_url ? `<img src="${m.icon_url}" style="width:28px;height:28px;border-radius:6px" alt="">` : `<span>${typeIcons[m.type] || '🎯'}</span>`}
            </div>
            <div class="pbg-m-info">
              <div class="pbg-m-name">${m.name}</div>
              <div class="pbg-m-desc">${conditionText(m.condition_type, m.condition_value)}</div>
            </div>
            <div class="pbg-m-right">
              ${PLAYER_CPF ? `
                <div class="pbg-m-progress-ring">
                  <svg viewBox="0 0 38 38">
                    <circle class="bg" cx="19" cy="19" r="15" />
                    <circle class="fg" cx="19" cy="19" r="15" stroke="${isCompleted ? '#34d399' : color}" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" />
                  </svg>
                  <div class="pbg-m-progress-pct">${isCompleted ? '✅' : `${pct}%`}</div>
                </div>
              ` : `
                <div class="pbg-m-reward-chip">${rewardText}</div>
              `}
            </div>
          </div>
          <div class="pbg-m-footer">
            ${!PLAYER_CPF ? '' : `<span class="pbg-m-reward-chip" style="font-size:9px;padding:2px 7px">${rewardText}</span>`}
            ${m.time_limit_hours ? `<span class="pbg-m-tag pbg-m-timer">⏱ ${m.time_limit_hours}h</span>` : ''}
            ${m.require_optin && !isOptedIn && !isCompleted ? '<span class="pbg-m-tag pbg-m-optin-tag">✋ Opt-in</span>' : ''}
            ${m.recurrence && m.recurrence !== 'none' ? `<span class="pbg-m-tag pbg-m-rec">🔄</span>` : ''}
            ${isCompleted && m.manual_claim && !isClaimed && PLAYER_CPF ? `<button class="pbg-m-claim-btn" onclick="event.stopPropagation();window.__pbg('claimMission','${m.id}')">🎁 Resgatar</button>` : ''}
          </div>
        </div>
      `;
    };

    if (active.length) {
      html += active.map(renderCard).join('');
    }
    if (completed.length) {
      html += `<div style="margin-top:14px;margin-bottom:8px;display:flex;align-items:center;gap:8px"><div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div><span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em">Completas (${completed.length})</span><div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div></div>`;
      html += completed.map(renderCard).join('');
    }
    if (!active.length && !completed.length) {
      html += '<div style="text-align:center;padding:30px;color:#52525b;font-size:12px">Nenhuma missão nesta categoria</div>';
    }
    return html;
  }

  function renderAchievements() {
    if (!data?.achievements?.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">🏆</div><div style="font-size:13px">Nenhuma conquista disponível</div></div>';
    const catNames = { deposito:'💰 Depósito', aposta:'🎲 Aposta', login:'🔑 Login', vitoria:'🏅 Vitória', social:'👥 Social', geral:'⭐ Geral' };
    const categories = [...new Set(data.achievements.map(a => a.category))];
    return categories.map(cat => {
      const items = data.achievements.filter(a => a.category === cat);
      return `
        <div class="pbg-section-title">${catNames[cat] || cat}</div>
        ${items.map(a => {
          const ap = (data.achievement_progress || []).find(p => p.achievement_id === a.id);
          const isCompleted = ap?.completed;
          const shouldHide = a.hide_if_not_earned && !isCompleted;
          if (shouldHide) return '';
          return `
            <div class="pbg-card" style="cursor:default;${isCompleted ? 'border-color:rgba(16,185,129,0.3)' : !ap ? 'opacity:0.7' : ''}">
              <div class="pbg-card-title">
                ${a.icon_url ? `<img src="${a.icon_url}" width="20" height="20" style="border-radius:4px;${!isCompleted && !ap ? 'filter:grayscale(1);opacity:0.5' : ''}">` : (isCompleted ? '🏆' : '🔒')}
                ${a.name}
                ${isCompleted ? '<span class="pbg-badge pbg-badge-completed">✅</span>' : ''}
                ${segmentBadge(a)}
              </div>
              ${a.description ? `<p class="pbg-card-desc">${a.description}</p>` : ''}
              <div class="pbg-condition">🎯 ${conditionText(a.condition_type, a.condition_value)}</div>
              <div class="pbg-reward">
                <span class="pbg-reward-label">Recompensa</span>
                ${rewardBadge(a.reward_type, a.reward_value)}
              </div>
            </div>
          `;
        }).join('')}
      `;
    }).join('');
  }

  function renderTournaments() {
    if (!data?.tournaments?.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">⚔️</div><div style="font-size:13px">Nenhum torneio ativo</div></div>';
    const metricNames = { total_bet:'Total Apostado', total_won:'Total Ganho', total_deposit:'Total Depositado', ggr:'GGR' };
    const pointsPerLabels = { '1_centavo':'1 pt / R$ 0,01', '10_centavos':'1 pt / R$ 0,10', '1_real':'1 pt / R$ 1,00' };

    const getCountdown = (endDate) => {
      const ms = Math.max(0, new Date(endDate) - Date.now());
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      return { d, h, m, s, total: ms };
    };

    // --- Tournament detail view ---
    if (selectedTournament !== null) {
      const t = data.tournaments[selectedTournament];
      if (!t) { selectedTournament = null; return renderTournaments(); }
      const prizes = t.prizes || [];
      const pool = prizes.reduce((s,p) => s + Number(p.value||0), 0);
      const cd = getCountdown(t.end_date);
      const lb = data.leaderboards?.[t.id] || [];
      const myEntry = (data.tournament_entries||[]).find(e => e.tournament_id === t.id);
      const isJoined = !!myEntry;
      const top3 = lb.slice(0, 3);
      const rest = lb.slice(3, 20);
      const myRank = PLAYER_CPF ? lb.findIndex(e => e.cpf === PLAYER_CPF) + 1 : 0;

      return `
        <div style="animation:pbg-fade-in 0.2s ease">
          <button onclick="window.__pbg('closeTournament')" style="background:none;border:none;color:#a1a1aa;font-size:13px;cursor:pointer;font-family:inherit;padding:0;margin-bottom:10px">← Voltar</button>

          <!-- Banner -->
          <div class="pbg-t-banner" style="height:100px;border-radius:14px 14px 0 0;cursor:default">
            ${t.image_url ? `<img src="${t.image_url}" alt="">` : ''}
            <div class="pbg-t-banner-overlay"></div>
            <div class="pbg-t-banner-content">
              <div class="pbg-t-status ${cd.total > 0 ? 'pbg-t-status-live' : 'pbg-t-status-ended'}">${cd.total > 0 ? '● AO VIVO' : '● ENCERRADO'}</div>
            </div>
          </div>

          <!-- Info -->
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-top:none;border-radius:0 0 14px 14px;padding:14px">
            <div class="pbg-t-title">${t.name}</div>
            ${t.description ? `<div class="pbg-t-desc">${t.description}</div>` : ''}

            <!-- Countdown -->
            ${cd.total > 0 ? `
              <div style="font-size:9px;color:#52525b;text-align:center;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:4px">Termina em</div>
              <div class="pbg-t-countdown">
                <div class="pbg-t-cd-unit"><div class="pbg-t-cd-num">${String(cd.d).padStart(2,'0')}</div><div class="pbg-t-cd-lbl">dias</div></div>
                <div class="pbg-t-cd-unit"><div class="pbg-t-cd-num">${String(cd.h).padStart(2,'0')}</div><div class="pbg-t-cd-lbl">horas</div></div>
                <div class="pbg-t-cd-unit"><div class="pbg-t-cd-num">${String(cd.m).padStart(2,'0')}</div><div class="pbg-t-cd-lbl">min</div></div>
                <div class="pbg-t-cd-unit"><div class="pbg-t-cd-num">${String(cd.s).padStart(2,'0')}</div><div class="pbg-t-cd-lbl">seg</div></div>
              </div>
            ` : ''}

            <!-- Stats row -->
            <div class="pbg-t-stats" style="margin-top:10px">
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Prize Pool</div><div class="pbg-t-stat-val" style="color:#34d399">${fmt(pool)}</div></div>
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Jogadores</div><div class="pbg-t-stat-val">${lb.length}</div></div>
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Métrica</div><div class="pbg-t-stat-val" style="font-size:11px">${metricNames[t.metric]||t.metric}</div></div>
            </div>

            <div class="pbg-t-tags">
              <span class="pbg-t-tag">📊 ${pointsPerLabels[t.points_per]||'1 pt / R$ 1'}</span>
              ${t.buy_in_cost > 0 ? `<span class="pbg-t-tag" style="color:#fbbf24">🪙 Entrada: ${t.buy_in_cost}</span>` : '<span class="pbg-t-tag" style="color:#34d399">✅ Grátis</span>'}
              ${t.max_players ? `<span class="pbg-t-tag">👥 Máx: ${t.max_players}</span>` : ''}
              ${myRank > 0 ? `<span class="pbg-t-tag" style="color:#a78bfa">🏅 Sua posição: #${myRank}</span>` : ''}
            </div>
          </div>

          <!-- Join button -->
          <div style="margin-top:10px">
            ${(t.require_optin || t.buy_in_cost > 0) && !isJoined && PLAYER_CPF ? `
              <button class="pbg-t-join-btn" onclick="window.__pbg('joinTournament','${t.id}')">
                ${t.buy_in_cost > 0 ? `🪙 Inscrever-se (${t.buy_in_cost} moedas)` : '⚔️ Participar do Torneio'}
              </button>
            ` : isJoined ? `
              <div class="pbg-t-joined">✅ Inscrito ${myEntry.score > 0 ? `· ${Number(myEntry.score).toLocaleString('pt-BR')} pts` : ''}</div>
            ` : !t.require_optin && !t.buy_in_cost ? `
              <div class="pbg-t-joined">✅ Participação automática</div>
            ` : ''}
          </div>

          <!-- Podium + Leaderboard -->
          <div style="margin-top:14px">
            <div class="pbg-section-title">📊 Classificação</div>
            ${lb.length === 0 ? `
              <div style="text-align:center;padding:24px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.04)">
                <div style="font-size:36px;margin-bottom:8px;opacity:0.6">⏳</div>
                <div style="font-size:13px;color:#71717a">Aguardando participantes</div>
              </div>
            ` : `
              <!-- Podium for top 3 -->
              ${top3.length >= 2 ? `
                <div class="pbg-podium">
                  ${top3.length >= 2 ? `<div class="pbg-podium-col pbg-podium-2"><div class="pbg-podium-bar"><div class="pbg-podium-medal">🥈</div><div class="pbg-podium-name">${PLAYER_CPF && top3[1].cpf === PLAYER_CPF ? 'Você' : maskCpf(top3[1].cpf)}</div><div class="pbg-podium-score">${Number(top3[1].score).toLocaleString('pt-BR')}</div></div></div>` : ''}
                  <div class="pbg-podium-col pbg-podium-1"><div class="pbg-podium-bar"><div class="pbg-podium-medal">🥇</div><div class="pbg-podium-name">${PLAYER_CPF && top3[0].cpf === PLAYER_CPF ? 'Você' : maskCpf(top3[0].cpf)}</div><div class="pbg-podium-score">${Number(top3[0].score).toLocaleString('pt-BR')}</div></div></div>
                  ${top3.length >= 3 ? `<div class="pbg-podium-col pbg-podium-3"><div class="pbg-podium-bar"><div class="pbg-podium-medal">🥉</div><div class="pbg-podium-name">${PLAYER_CPF && top3[2].cpf === PLAYER_CPF ? 'Você' : maskCpf(top3[2].cpf)}</div><div class="pbg-podium-score">${Number(top3[2].score).toLocaleString('pt-BR')}</div></div></div>` : ''}
                </div>
              ` : ''}
              <!-- Rest of leaderboard -->
              ${rest.length > 0 ? `
                <div style="background:rgba(255,255,255,0.02);border-radius:10px;overflow:hidden;margin-top:4px">
                  ${rest.map((entry, i) => {
                    const rank = i + 4;
                    const isMe = PLAYER_CPF && entry.cpf === PLAYER_CPF;
                    return `<div class="pbg-lb-row ${isMe ? 'pbg-lb-me' : ''}"><span class="pbg-lb-rank">${rank}º</span><span class="pbg-lb-cpf">${isMe ? 'Você' : maskCpf(entry.cpf)}</span><span class="pbg-lb-score">${Number(entry.score).toLocaleString('pt-BR')}</span></div>`;
                  }).join('')}
                  ${lb.length > 20 ? `<div style="font-size:10px;color:#52525b;text-align:center;padding:8px">+${lb.length-20} jogadores</div>` : ''}
                </div>
              ` : ''}
            `}
          </div>

          <!-- Prize Table -->
          ${prizes.length > 0 ? `
            <div style="margin-top:14px">
              <div class="pbg-section-title">🏅 Premiação</div>
              <div style="background:rgba(255,255,255,0.02);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.04)">
                ${prizes.map((p,i) => {
                  const medals = ['🥇','🥈','🥉']; const medal = i < 3 ? medals[i] : `${p.rank||i+1}º`;
                  return `<div class="pbg-prize-row"><span class="pbg-prize-rank">${medal}</span><span class="pbg-prize-desc">${p.description||`${p.rank||i+1}º lugar`}</span><span class="pbg-prize-val">${fmt(p.value)}</span></div>`;
                }).join('')}
                <div class="pbg-prize-total"><span style="color:#fff;font-weight:700;font-size:13px">💰 Pool Total</span><span style="color:#34d399;font-weight:800;font-size:15px;font-family:'JetBrains Mono',monospace">${fmt(pool)}</span></div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    // --- Tournament list ---
    return data.tournaments.map((t, idx) => {
      const prizes = t.prizes || [];
      const pool = prizes.reduce((s,p) => s + Number(p.value||0), 0);
      const cd = getCountdown(t.end_date);
      const lb = data.leaderboards?.[t.id] || [];
      const myEntry = (data.tournament_entries||[]).find(e => e.tournament_id === t.id);

      return `
        <div class="pbg-t-card" onclick="window.__pbg('openTournament',${idx})">
          <div class="pbg-t-banner">
            ${t.image_url ? `<img src="${t.image_url}" alt="">` : ''}
            <div class="pbg-t-banner-overlay"></div>
            <div class="pbg-t-banner-content" style="display:flex;justify-content:space-between;align-items:flex-end">
              <div class="pbg-t-status ${cd.total > 0 ? 'pbg-t-status-live' : 'pbg-t-status-ended'}">${cd.total > 0 ? '● AO VIVO' : '● ENCERRADO'}</div>
              ${cd.total > 0 ? `<div style="font-size:11px;color:#fff;font-weight:700">${cd.d > 0 ? cd.d+'d ' : ''}${cd.h}h ${cd.m}m</div>` : ''}
            </div>
          </div>
          <div class="pbg-t-body">
            <div class="pbg-t-title">${t.name} ${segmentBadge(t)}</div>
            ${t.description ? `<div class="pbg-t-desc">${t.description}</div>` : ''}
            <div class="pbg-t-stats">
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Prize Pool</div><div class="pbg-t-stat-val" style="color:#34d399;font-size:13px">${fmt(pool)}</div></div>
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Jogadores</div><div class="pbg-t-stat-val">${lb.length}</div></div>
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Entrada</div><div class="pbg-t-stat-val" style="font-size:12px;color:${t.buy_in_cost > 0 ? '#fbbf24' : '#34d399'}">${t.buy_in_cost > 0 ? '🪙 '+t.buy_in_cost : 'Grátis'}</div></div>
            </div>
            ${myEntry ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(16,185,129,0.08);border-radius:6px;font-size:11px;color:#34d399;font-weight:600;text-align:center">✅ Inscrito${myEntry.score > 0 ? ' · '+Number(myEntry.score).toLocaleString('pt-BR')+' pts' : ''}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderWheel() {
    const prizes = data?.wheel_prizes || [];
    if (!prizes.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;opacity:0.5">🎡</div><div style="font-size:13px">Roleta não configurada</div></div>';

    const cfg = data?.wheel_config || { max_spins_per_day: 3, spin_cost_coins: 0, free_spins_per_day: 1 };
    const ps = data?.player_spins || { spins_used_today: 0 };
    const spinsUsed = ps.spins_used_today || 0;
    const isFree = spinsUsed < (cfg.free_spins_per_day || 1);
    const maxReached = cfg.max_spins_per_day > 0 && spinsUsed >= cfg.max_spins_per_day;
    const coins = data?.wallet?.coins || 0;
    const canAfford = isFree || cfg.spin_cost_coins <= 0 || coins >= cfg.spin_cost_coins;
    const btnDisabled = isSpinning || maxReached || (!canAfford && !isFree) || !PLAYER_CPF;
    const freeLeft = Math.max(0, (cfg.free_spins_per_day || 1) - spinsUsed);

    // If fewer than 4 prizes, repeat them to fill the wheel nicely
    let displayPrizes = [...prizes];
    while (displayPrizes.length < 6 && displayPrizes.length > 0) {
      displayPrizes = displayPrizes.concat(prizes);
    }
    // Keep mapping to original for result
    const prizeMap = displayPrizes.map((p, i) => prizes[i % prizes.length]);

    const size = 280; const cx = size / 2; const cy = size / 2; const r = size / 2 - 2;
    const n = displayPrizes.length; const sliceAng = (2 * Math.PI) / n;

    // High-contrast alternating palette
    const palette = ['#7c3aed','#1e1b4b','#6d28d9','#0f172a','#8b5cf6','#1a1435','#a855f7','#0c0a1a','#6366f1','#1e1145'];

    let svg = `<defs>`;
    // Inner shadow filter
    svg += `<filter id="pbg-inner-shadow"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dx="0" dy="2"/><feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1"/><feFlood flood-color="#000" flood-opacity="0.3"/><feComposite in2="SourceGraphic" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    svg += `</defs>`;

    for (let i = 0; i < n; i++) {
      const sa = i * sliceAng - Math.PI / 2;
      const ea = sa + sliceAng;
      const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
      const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
      const la = sliceAng > Math.PI ? 1 : 0;
      const color = displayPrizes[i].color || palette[i % palette.length];

      // Sector
      svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} Z" fill="${color}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;

      // Horizontal text at the centroid of the sector — always readable
      const midA = sa + sliceAng / 2;
      const label = displayPrizes[i].label.length > 14 ? displayPrizes[i].label.slice(0, 13) + '…' : displayPrizes[i].label;
      const fs = n > 8 ? 8.5 : n > 5 ? 9.5 : 11;
      const textR = r * 0.65;
      const tx = cx + textR * Math.cos(midA);
      const ty = cy + textR * Math.sin(midA);
      svg += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="700" font-family="Space Grotesk,sans-serif" style="paint-order:stroke;stroke:#000;stroke-width:3px;stroke-opacity:0.5">${label}</text>`;
    }

    // Inner decorative ring
    svg += `<circle cx="${cx}" cy="${cy}" r="36" fill="#110d24" stroke="none"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="36" fill="none" stroke="url(#pbg-gold)" stroke-width="3"/>`;
    // Gold gradient for inner ring
    svg = svg.replace('</defs>', `<linearGradient id="pbg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f7d86c"/><stop offset="50%" stop-color="#b8860b"/><stop offset="100%" stop-color="#f7d86c"/></linearGradient></defs>`);

    // Separator lines (golden)
    for (let i = 0; i < n; i++) {
      const a = i * sliceAng - Math.PI / 2;
      const lx1 = cx + 36 * Math.cos(a), ly1 = cy + 36 * Math.sin(a);
      const lx2 = cx + r * Math.cos(a), ly2 = cy + r * Math.sin(a);
      svg += `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="rgba(247,216,108,0.25)" stroke-width="1.5"/>`;
    }

    // Outer decorative border on the SVG itself
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(247,216,108,0.15)" stroke-width="2"/>`;

    // Bulbs on golden ring
    // Bulbs: container has inset:-12px on 280px = 304x304, center at 152,152
    const numBulbs = Math.max(20, n * 3);
    const bulbCenter = 152; // (280 + 12*2) / 2
    const bulbR = 144; // radius where bulbs sit on the golden ring
    let bulbsHtml = '';
    for (let i = 0; i < numBulbs; i++) {
      const a = (i / numBulbs) * 2 * Math.PI - Math.PI / 2;
      const bx = bulbCenter + bulbR * Math.cos(a);
      const by = bulbCenter + bulbR * Math.sin(a);
      bulbsHtml += `<div class="pbg-bulb ${i % 2 === 0 ? 'pbg-bulb-on' : 'pbg-bulb-off'}" style="left:${bx}px;top:${by}px;transform:translate(-50%,-50%)"></div>`;
    }

    // Flapper / pointer SVG
    const flapSvg = `<svg width="32" height="38" viewBox="0 0 32 38"><defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f7d86c"/><stop offset="100%" stop-color="#b8860b"/></linearGradient></defs><path d="M16 38 L2 6 A14 14 0 0 1 30 6 Z" fill="url(#pfg)" stroke="#8b6914" stroke-width="1.5"/><circle cx="16" cy="12" r="5" fill="#fff" opacity="0.25"/></svg>`;

    // Hub content
    let hubContent = `<div class="pbg-hub-icon">🎰</div><div class="pbg-hub-text">GIRAR</div>`;
    if (isSpinning) hubContent = `<div class="pbg-hub-icon" style="animation:pbg-bulb-a 0.3s infinite">✨</div>`;
    else if (maxReached) hubContent = `<div class="pbg-hub-icon">🔒</div><div class="pbg-hub-text" style="font-size:8px">LIMITE</div>`;
    else if (!PLAYER_CPF) hubContent = `<div class="pbg-hub-icon">🔒</div><div class="pbg-hub-text" style="font-size:8px">LOGIN</div>`;

    return `
      <div class="pbg-wheel-container">
        <div class="pbg-wheel-stage">
          <div class="pbg-wheel-ring-outer"></div>
          <div class="pbg-wheel-bulbs ${isSpinning ? 'spin' : ''}" id="pbg-wheel-bulbs">${bulbsHtml}</div>
          <div class="pbg-wheel-ring-inner"></div>
          <div class="pbg-wheel-flap">${flapSvg}</div>
          <svg viewBox="0 0 ${size} ${size}" class="pbg-wheel-svg" id="pbg-wheel-canvas">${svg}</svg>
          <div class="pbg-wheel-hub ${btnDisabled ? 'off' : ''}" onclick="${btnDisabled ? '' : "window.__pbg('spin')"}">${hubContent}</div>
        </div>
        ${spinResult && !isSpinning ? (spinResult.error
          ? `<div class="pbg-modal-error">${spinResult.error}</div>`
          : `<div class="pbg-spin-result">
              <div style="font-size:12px;color:#a1a1aa">🎉 Você ganhou!</div>
              <div class="pbg-spin-result-prize">${spinResult.type === 'nothing' ? '😅 Tente de novo!' : spinResult.label}</div>
            </div>`
        ) : ''}
        ${!isFree && cfg.spin_cost_coins > 0 && !maxReached && !isSpinning ? `<div class="pbg-spin-cost-badge">🪙 Próximo giro: ${cfg.spin_cost_coins} moedas</div>` : ''}
        <div class="pbg-spin-info">
          <span class="pbg-spin-tag" style="color:${freeLeft > 0 ? '#34d399' : '#f87171'}">🎫 Grátis: ${freeLeft}/${cfg.free_spins_per_day || 1}</span>
          ${cfg.max_spins_per_day > 0 ? `<span class="pbg-spin-tag" style="color:${maxReached ? '#f87171' : '#a1a1aa'}">🎲 ${spinsUsed}/${cfg.max_spins_per_day}</span>` : ''}
          ${coins > 0 ? `<span class="pbg-spin-tag" style="color:#fbbf24">🪙 ${coins}</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderMiniGames() {
    const games = data?.mini_games || [];
    const prizes = data?.mini_game_prizes || [];
    const attempts = data?.mini_game_attempts || [];
    const coins = data?.wallet?.coins || 0;
    const today = new Date().toISOString().slice(0, 10);

    if (!games.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;opacity:0.5">🎮</div><div style="font-size:13px">Nenhum jogo disponível</div></div>';

    // Playing a specific game
    if (selectedMiniGame !== null) {
      const game = games.find(g => g.id === selectedMiniGame);
      if (!game) { selectedMiniGame = null; return renderMiniGames(); }
      const gamePrizes = prizes.filter(p => p.game_id === game.id);
      const att = attempts.find(a => a.game_id === game.id);
      const attToday = (att && att.last_attempt_date === today) ? att.attempts_today : 0;
      const maxAtt = game.max_attempts_per_day || 1;
      const freeAtt = game.free_attempts_per_day || 1;
      const isFree = attToday < freeAtt;
      const maxReached = maxAtt > 0 && attToday >= maxAtt;
      const typeIcons = { scratch_card: '🎴', gift_box: '🎁', prize_drop: '🎯' };
      const typeLabels = { scratch_card: 'Raspadinha', gift_box: 'Caixa Surpresa', prize_drop: 'Prize Drop' };

      let html = `
        <button onclick="window.__pbg('closeMiniGame')" style="background:none;border:none;color:#a1a1aa;font-size:13px;cursor:pointer;font-family:inherit;padding:0;margin-bottom:10px">← Voltar</button>
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:36px;margin-bottom:6px">${typeIcons[game.type] || '🎮'}</div>
          <div style="font-size:16px;font-weight:700;color:#fff">${game.name}</div>
          ${game.description ? `<div style="font-size:12px;color:#71717a;margin-top:4px">${game.description}</div>` : ''}
        </div>
      `;

      // Game result display
      if (miniGameResult) {
        if (miniGameResult.error) {
          html += `<div class="pbg-modal-error" style="margin-bottom:12px">${miniGameResult.error}</div>`;
        }

        // Scratch card game
        if (game.type === 'scratch_card' && miniGameResult.game_data?.cells) {
          const cells = miniGameResult.game_data.cells;
          html += `<div class="pbg-scratch-grid">`;
          cells.forEach((cell, i) => {
            const revealed = scratchRevealed.includes(i);
            const isWin = cell.winning;
            html += `
              <div class="pbg-scratch-cell" onclick="window.__pbg('scratchCell',${i})">
                <div class="pbg-scratch-cover ${revealed ? 'revealed' : ''}">
                  <div style="font-size:20px">✨</div>
                  <div style="font-size:9px;color:#a1a1aa;margin-top:2px">Raspe</div>
                </div>
                <div class="pbg-scratch-inner ${revealed ? (isWin ? 'win' : 'lose') : ''}">
                  <div style="font-size:16px">${cell.prize?.icon || (isWin ? '⭐' : '❌')}</div>
                  <div style="font-size:9px;font-weight:600;margin-top:2px;color:${isWin ? '#34d399' : '#71717a'}">${cell.prize?.label || ''}</div>
                </div>
              </div>
            `;
          });
          html += `</div>`;

          // Check if all revealed
          const winCount = cells.filter((c, i) => scratchRevealed.includes(i) && c.winning).length;
          const allRevealed = scratchRevealed.length >= cells.length;
          if (winCount >= 3 || allRevealed) {
            const won = winCount >= 3;
            html += `
              <div style="text-align:center;margin-top:16px;padding:16px;background:${won ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)'};border:1px solid ${won ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:12px">
                <div style="font-size:24px;margin-bottom:6px">${won ? '🎉' : '😅'}</div>
                <div style="font-size:14px;font-weight:700;color:${won ? '#34d399' : '#a1a1aa'}">${won ? `Você ganhou: ${miniGameResult.prize?.label}!` : 'Não foi dessa vez!'}</div>
              </div>
            `;
          }
        }

        // Gift box game
        if (game.type === 'gift_box' && miniGameResult.game_data?.boxes) {
          const boxes = miniGameResult.game_data.boxes;
          html += `<div class="pbg-gift-grid">`;
          boxes.forEach((box, i) => {
            const opened = giftBoxOpened === i;
            const otherOpened = giftBoxOpened !== null && giftBoxOpened !== i;
            const isWin = box.winning;
            html += `
              <div class="pbg-gift-box ${opened ? 'opened' : ''} ${opened && isWin ? 'won' : ''} ${otherOpened ? 'opened' : ''}"
                   onclick="${giftBoxOpened === null ? `window.__pbg('openGiftBox',${i})` : ''}">
                ${!opened && giftBoxOpened === null ? `
                  <div class="pbg-gift-icon">🎁</div>
                  <div class="pbg-gift-label">Abrir</div>
                ` : opened ? `
                  <div style="font-size:24px;margin-bottom:4px">${isWin ? (box.prize?.icon || '🎉') : '💨'}</div>
                  <div style="font-size:10px;font-weight:700;color:${isWin ? '#34d399' : '#71717a'}">${box.prize?.label || (isWin ? 'Prêmio!' : 'Vazio')}</div>
                ` : `
                  <div class="pbg-gift-icon" style="opacity:0.3">🎁</div>
                `}
              </div>
            `;
          });
          html += `</div>`;

          if (giftBoxOpened !== null) {
            const box = boxes[giftBoxOpened];
            html += `
              <div style="text-align:center;margin-top:16px;padding:16px;background:${box.winning ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)'};border:1px solid ${box.winning ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:12px">
                <div style="font-size:24px;margin-bottom:6px">${box.winning ? '🎉' : '😅'}</div>
                <div style="font-size:14px;font-weight:700;color:${box.winning ? '#34d399' : '#a1a1aa'}">${box.winning ? `Você ganhou: ${miniGameResult.prize?.label}!` : 'Tente novamente!'}</div>
              </div>
            `;
          }
        }

        // Prize Drop
        if (game.type === 'prize_drop') {
          html += `
            <div style="text-align:center;padding:24px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
              <div style="font-size:48px;margin-bottom:12px;animation:pbg-bounce 0.5s ease">${miniGameResult.prize?.type === 'nothing' ? '💨' : (miniGameResult.prize?.icon || '🎁')}</div>
              <div style="font-size:16px;font-weight:700;color:${miniGameResult.prize?.type === 'nothing' ? '#a1a1aa' : '#34d399'}">${miniGameResult.prize?.type === 'nothing' ? 'Tente novamente!' : miniGameResult.prize?.label}</div>
              ${miniGameResult.prize?.type !== 'nothing' && miniGameResult.prize?.value ? `<div style="font-size:13px;color:#fbbf24;margin-top:6px;font-weight:600">+${miniGameResult.prize.value} ${miniGameResult.prize.type}</div>` : ''}
            </div>
          `;
        }

        // Play again button
        html += `
          <div style="text-align:center;margin-top:16px">
            <button class="pbg-modal-btn" ${maxReached || (!isFree && game.attempt_cost_coins > 0 && coins < game.attempt_cost_coins) ? 'disabled' : ''}
                    onclick="window.__pbg('playMiniGame','${game.id}')">
              ${maxReached ? 'Limite atingido' : '🔄 Jogar Novamente'}
            </button>
          </div>
        `;
      } else if (!miniGamePlaying) {
        // Show play button (initial state)
        html += `
          <div style="text-align:center;padding:20px">
            ${gamePrizes.length > 0 ? `
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:10px">Prêmios possíveis</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:20px">
                ${gamePrizes.filter(p => p.type !== 'nothing').map(p => `
                  <span class="pbg-badge pbg-badge-${p.type}" style="font-size:11px">
                    ${p.icon || ''} ${p.label}
                  </span>
                `).join('')}
              </div>
            ` : ''}
            <button class="pbg-modal-btn" ${!PLAYER_CPF || maxReached ? 'disabled' : ''}
                    onclick="window.__pbg('playMiniGame','${game.id}')">
              ${!PLAYER_CPF ? 'Faça login' : maxReached ? 'Limite atingido' : `${typeIcons[game.type] || '🎮'} Jogar`}
            </button>
            ${!isFree && game.attempt_cost_coins > 0 && !maxReached ? `<div style="font-size:11px;color:#fbbf24;margin-top:8px">🪙 Custo: ${game.attempt_cost_coins} moedas</div>` : ''}
          </div>
        `;
      } else {
        // Loading / playing
        html += `<div style="text-align:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div><div style="font-size:12px;color:#71717a;margin-top:12px">Jogando...</div></div>`;
      }

      // Attempts info
      html += `
        <div style="display:flex;justify-content:center;gap:12px;margin-top:12px">
          <span class="pbg-spin-tag" style="color:${isFree ? '#34d399' : '#f87171'}">🎫 Grátis: ${Math.max(0, freeAtt - attToday)}/${freeAtt}</span>
          ${maxAtt > 0 ? `<span class="pbg-spin-tag" style="color:${maxReached ? '#f87171' : '#a1a1aa'}">🎲 ${attToday}/${maxAtt}</span>` : ''}
          ${coins > 0 ? `<span class="pbg-spin-tag" style="color:#fbbf24">🪙 ${coins}</span>` : ''}
        </div>
      `;

      return html;
    }

    // Game selection grid
    let html = '<div class="pbg-mg-grid">';
    games.forEach(game => {
      const att = attempts.find(a => a.game_id === game.id);
      const attToday = (att && att.last_attempt_date === today) ? att.attempts_today : 0;
      const maxAtt = game.max_attempts_per_day || 1;
      const freeAtt = game.free_attempts_per_day || 1;
      const freeLeft = Math.max(0, freeAtt - attToday);
      const maxReached = maxAtt > 0 && attToday >= maxAtt;
      const typeIcons = { scratch_card: '🎴', gift_box: '🎁', prize_drop: '🎯' };
      const typeLabels = { scratch_card: 'Raspadinha', gift_box: 'Caixa Surpresa', prize_drop: 'Prize Drop' };

      html += `
        <div class="pbg-mg-card ${maxReached ? 'greyed' : ''}" onclick="window.__pbg('openMiniGame','${game.id}')">
          <div class="pbg-mg-icon">${typeIcons[game.type] || '🎮'}</div>
          <div class="pbg-mg-name">${game.name}</div>
          <div class="pbg-mg-type">${typeLabels[game.type] || game.type}</div>
          <div class="pbg-mg-attempts" style="color:${maxReached ? '#f87171' : freeLeft > 0 ? '#34d399' : '#a1a1aa'}">
            ${maxReached ? 'Limite atingido' : freeLeft > 0 ? `🎫 ${freeLeft} grátis` : `🪙 ${game.attempt_cost_coins || 0} moedas`}
          </div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  function renderStore() {
    const items = data?.store_items || [];
    if (!items.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;opacity:0.5">🛒</div><div style="font-size:13px">Loja vazia</div></div>';

    const coins = data?.wallet?.coins || 0;
    let html = `<div class="pbg-store-grid">${items.map((item, idx) => {
      const canBuy = !item.price_coins || coins >= item.price_coins;
      const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
      return `
        <div class="pbg-store-item ${!canBuy || outOfStock ? 'greyed' : ''}" onclick="window.__pbg('openStore',${idx})">
          ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : '<div style="font-size:32px;margin-bottom:8px">🎁</div>'}
          <div style="font-size:12px;font-weight:600;color:#fff">${item.name}</div>
          <div style="font-size:11px;color:#fbbf24;font-weight:600;margin-top:4px">
            ${item.price_coins ? `🪙 ${item.price_coins}` : ''} ${item.price_xp ? `⭐ ${item.price_xp}` : ''}
          </div>
          ${outOfStock ? '<div style="font-size:10px;color:#f87171;margin-top:2px">Esgotado</div>' : ''}
          ${!canBuy && !outOfStock ? `<div style="font-size:10px;color:#f87171;margin-top:2px">Faltam ${item.price_coins - coins} moedas</div>` : ''}
        </div>
      `;
    }).join('')}</div>`;

    if (selectedStoreItem !== null) {
      const item = items[selectedStoreItem];
      if (item) {
        const canBuy = !item.price_coins || coins >= item.price_coins;
        const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
        html += `
          <div class="pbg-modal-overlay" onclick="window.__pbg('closeStore')">
            <div class="pbg-modal" onclick="event.stopPropagation()">
              ${item.image_url ? `<img src="${item.image_url}" style="width:80px;height:80px;object-fit:contain;border-radius:12px;margin:0 auto 12px">` : '<div style="font-size:48px;margin-bottom:12px">🎁</div>'}
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px">${item.name}</div>
              ${item.description ? `<div style="font-size:12px;color:#a1a1aa;margin-bottom:12px;line-height:1.5">${item.description}</div>` : ''}
              ${item.reward_description || item.reward_value ? `
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;text-align:left">
                  <div style="font-size:11px;font-weight:700;color:#34d399;margin-bottom:4px">🎁 Você recebe</div>
                  ${item.reward_value ? `<div style="font-size:14px;font-weight:700;color:#fff">${item.reward_value}</div>` : ''}
                  ${item.reward_description ? `<div style="font-size:11px;color:#a1a1aa;margin-top:2px">${item.reward_description}</div>` : ''}
                </div>
              ` : ''}
              <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:12px">
                ${item.price_coins ? `<span style="font-size:14px;font-weight:700;color:#fbbf24">🪙 ${item.price_coins}</span>` : ''}
                ${item.price_xp ? `<span style="font-size:14px;font-weight:700;color:#818cf8">⭐ ${item.price_xp}</span>` : ''}
              </div>
              ${item.stock !== null && item.stock !== undefined ? `<div style="font-size:11px;color:#71717a;margin-bottom:12px">${item.stock} em estoque</div>` : ''}
              ${storeMessage ? `<div class="${storeMessage.type === 'success' ? 'pbg-modal-success' : 'pbg-modal-error'}">${storeMessage.text}</div>` : ''}
              ${!storeMessage || storeMessage.type !== 'success' ? `
                <button class="pbg-modal-btn" ${!canBuy || outOfStock || !PLAYER_CPF ? 'disabled' : ''} onclick="window.__pbg('buyItem','${item.id}')">
                  ${outOfStock ? 'Esgotado' : !PLAYER_CPF ? 'Faça login' : !canBuy ? 'Moedas insuficientes' : '🛒 Comprar'}
                </button>
              ` : ''}
              <button class="pbg-modal-btn-close" onclick="window.__pbg('closeStore')">Voltar</button>
            </div>
          </div>
        `;
      }
    }
    return html;
  }

  function renderHistory() {
    if (!PLAYER_CPF) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;opacity:0.5">📋</div><div style="font-size:13px">Faça login para ver seu histórico</div></div>';
    const log = data?.activity_log || [];
    if (!log.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;opacity:0.5">📋</div><div style="font-size:13px">Nenhuma atividade registrada</div></div>';

    const icons = { coins:'🪙', xp:'⭐', spin:'🎡', wheel:'🎡', bonus:'💰', store:'🛒', level_up:'🏅', mission:'🎯', achievement:'🏆', tournament:'⚔️' };
    return `
      <div class="pbg-section-title">📋 Atividades Recentes</div>
      ${log.map(entry => `
        <div class="pbg-log-item">
          <div>
            <div class="pbg-log-desc">${icons[entry.type]||'📌'} ${entry.description || entry.source}</div>
            <div class="pbg-log-source">${entry.source} · ${timeAgo(entry.created_at)}</div>
          </div>
          <div style="text-align:right">
            <div class="pbg-log-amount ${entry.amount >= 0 ? 'pbg-log-positive' : 'pbg-log-negative'}">${entry.amount >= 0 ? '+' : ''}${Number(entry.amount).toLocaleString('pt-BR')}</div>
          </div>
        </div>
      `).join('')}
    `;
  }

  function renderLevels() {
    const levels = data?.levels || [];
    if (!levels.length) return '<div style="text-align:center;padding:40px;color:#52525b"><div style="font-size:40px;opacity:0.5">🏅</div><div style="font-size:13px">Níveis não configurados</div></div>';

    const lvInfo = getLevelInfo();
    const sorted = [...levels].sort((a,b) => a.level_number - b.level_number);

    return `
      ${lvInfo ? `
        <div class="pbg-card" style="border-color:rgba(139,92,246,0.3);cursor:default;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
            <div style="width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;background:${lvInfo.current.color}20;color:${lvInfo.current.color}">
              ${lvInfo.current.icon_url ? `<img src="${lvInfo.current.icon_url}" style="width:28px;height:28px">` : lvInfo.current.level_number}
            </div>
            <div style="flex:1">
              <div style="font-size:15px;font-weight:700;color:#fff">${lvInfo.current.name}</div>
              <div style="font-size:11px;color:#71717a">${lvInfo.next ? `${lvInfo.xpInLevel}/${lvInfo.xpForNext} XP para ${lvInfo.next.name}` : 'Nível máximo!'}</div>
            </div>
          </div>
          <div class="pbg-xp-track"><div class="pbg-xp-fill" style="width:${lvInfo.pct}%;background:${lvInfo.current.color}"></div></div>
        </div>
      ` : ''}
      <div class="pbg-section-title">🗺️ Mapa de Níveis</div>
      ${sorted.map(lvl => {
        const isCurrent = lvInfo && lvl.id === lvInfo.current.id;
        const isLocked = lvInfo && data.wallet && data.wallet.xp < lvl.min_xp;
        return `
          <div class="pbg-card" style="cursor:default;${isCurrent ? 'border-color:'+lvl.color+';background:rgba(255,255,255,0.04)' : isLocked ? 'opacity:0.5' : ''}">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;background:${lvl.color}20;color:${lvl.color};font-size:14px;${isLocked ? 'filter:grayscale(1)' : ''}">
                ${lvl.icon_url ? `<img src="${lvl.icon_url}" style="width:20px;height:20px">` : lvl.level_number}
              </div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:${isCurrent ? '#fff' : '#a1a1aa'}">${lvl.name} ${isCurrent ? '← Você' : ''}</div>
                <div style="font-size:10px;color:#52525b">${lvl.min_xp.toLocaleString()} XP${lvl.xp_multiplier > 1 ? ` · ${lvl.xp_multiplier}x XP` : ''}</div>
              </div>
              ${lvl.reward_type && lvl.reward_type !== 'none' ? `<div>${rewardBadge(lvl.reward_type, lvl.reward_value)}</div>` : ''}
            </div>
            ${lvl.rewards_description ? `<div style="font-size:10px;color:#71717a;margin-top:6px;padding-left:46px">${lvl.rewards_description}</div>` : ''}
          </div>
        `;
      }).join('')}
    `;
  }

  // ---- MAIN RENDER ----
  function renderContent() {
    const el = document.getElementById('pbg-widget-content');
    if (!el) return;
    if (!data) { el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'; return; }

    const renderers = { missions: renderMissions, achievements: renderAchievements, tournaments: renderTournaments, wheel: renderWheel, games: renderMiniGames, store: renderStore, history: renderHistory, levels: renderLevels };
    el.innerHTML = (renderers[activeTab] || renderMissions)();

    // Update tabs
    document.querySelectorAll('.pbg-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === activeTab));

    // Update level bar
    const levelBar = document.getElementById('pbg-level-bar');
    if (levelBar) {
      const lvInfo = getLevelInfo();
      if (lvInfo && data.wallet) {
        levelBar.style.display = 'block';
        levelBar.innerHTML = `
          <div class="pbg-level-info">
            <div class="pbg-level-name">
              <span style="width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:${lvInfo.current.color}20;color:${lvInfo.current.color}">
                ${lvInfo.current.icon_url ? `<img src="${lvInfo.current.icon_url}" style="width:14px;height:14px">` : lvInfo.current.level_number}
              </span>
              ${lvInfo.current.name}
            </div>
            <div class="pbg-level-xp">${lvInfo.next ? `${lvInfo.xpInLevel}/${lvInfo.xpForNext} XP` : 'MAX'}</div>
          </div>
          <div class="pbg-xp-track"><div class="pbg-xp-fill" style="width:${lvInfo.pct}%;background:${lvInfo.current.color}"></div></div>
          <div class="pbg-wallet-row">
            <div class="pbg-wallet-item" style="color:#fbbf24">🪙 ${(data.wallet.coins||0).toLocaleString('pt-BR')}</div>
            <div class="pbg-wallet-divider"></div>
            <div class="pbg-wallet-item" style="color:#818cf8">⭐ ${(data.wallet.xp||0).toLocaleString('pt-BR')}</div>
            <div class="pbg-wallet-divider"></div>
            <div class="pbg-wallet-item" style="color:#fff">🏅 Nv.${data.wallet.level||1}</div>
          </div>
        `;
      } else if (data.wallet) {
        levelBar.style.display = 'block';
        levelBar.innerHTML = `
          <div class="pbg-wallet-row" style="margin-top:0">
            <div class="pbg-wallet-item" style="color:#fbbf24">🪙 ${(data.wallet.coins||0).toLocaleString('pt-BR')}</div>
            <div class="pbg-wallet-divider"></div>
            <div class="pbg-wallet-item" style="color:#818cf8">⭐ ${(data.wallet.xp||0).toLocaleString('pt-BR')}</div>
          </div>
        `;
      } else {
        levelBar.style.display = 'none';
      }
    }

    // Update pending rewards badge
    const pendingCount = (data.pending_rewards || []).length;
    const pendingBadge = document.getElementById('pbg-pending-badge');
    if (pendingBadge) pendingBadge.style.display = pendingCount > 0 ? 'inline' : 'none';
    if (pendingBadge) pendingBadge.textContent = pendingCount;
  }

  // ---- BUILD DOM ----
  let widgetInitialized = false;

  function initWidget() {
    if (widgetInitialized) return;
    widgetInitialized = true;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'pbg-widget-backdrop';
    backdrop.onclick = () => toggle(false);
    document.body.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.id = 'pbg-widget-panel';
    panel.innerHTML = `
      <div class="pbg-header">
        <h2>${ICONS.trophy} Recompensas</h2>
        <button class="pbg-close" onclick="window.__pbg('toggle',false)">&times;</button>
      </div>
      <div id="pbg-level-bar" class="pbg-level-bar" style="display:none"></div>
      <div class="pbg-tabs">
        <button class="pbg-tab active" data-tab="missions" onclick="window.__pbg('tab','missions')">🎯 Missões</button>
        <button class="pbg-tab" data-tab="achievements" onclick="window.__pbg('tab','achievements')">🏆 Conquistas</button>
        <button class="pbg-tab" data-tab="tournaments" onclick="window.__pbg('tab','tournaments')">⚔️ Torneios</button>
        <button class="pbg-tab" data-tab="wheel" onclick="window.__pbg('tab','wheel')">🎡 Roleta</button>
        <button class="pbg-tab" data-tab="games" onclick="window.__pbg('tab','games')">🎮 Jogos</button>
        <button class="pbg-tab" data-tab="store" onclick="window.__pbg('tab','store')">🛒 Loja</button>
        <button class="pbg-tab" data-tab="levels" onclick="window.__pbg('tab','levels')">🏅 Níveis</button>
        <button class="pbg-tab" data-tab="history" onclick="window.__pbg('tab','history')">📋 Histórico<span id="pbg-pending-badge" class="pbg-tab-badge" style="display:none">0</span></button>
      </div>
      <div class="pbg-content" id="pbg-widget-content"></div>
    `;
    document.body.appendChild(panel);

    const fab = document.createElement('button');
    fab.id = 'pbg-widget-fab';
    fab.innerHTML = ICONS.gift;
    fab.onclick = () => toggle(!isOpen);
    fab.title = 'Recompensas';
    document.body.appendChild(fab);

    // Global handler
    window.__pbg = async (action, arg) => {
      if (action === 'toggle') toggle(arg);
      else if (action === 'tab') { activeTab = arg; selectedStoreItem = null; storeMessage = null; selectedTournament = null; selectedMission = null; selectedMiniGame = null; miniGameResult = null; miniGamePlaying = false; scratchRevealed = []; giftBoxOpened = null; renderContent(); }
      else if (action === 'spin') spinWheel();
      else if (action === 'openTournament') { selectedTournament = arg; renderContent(); }
      else if (action === 'closeTournament') { selectedTournament = null; renderContent(); }
      else if (action === 'openMission') { selectedMission = arg; renderContent(); }
      else if (action === 'closeMission') { selectedMission = null; renderContent(); }
      else if (action === 'openStore') { selectedStoreItem = arg; storeMessage = null; renderContent(); }
      else if (action === 'closeStore') { selectedStoreItem = null; storeMessage = null; renderContent(); }
      else if (action === 'buyItem') {
        try {
          const result = await apiCall('store_buy', { item_id: arg });
          if (result.error) { storeMessage = { type: 'error', text: result.error }; }
          else { storeMessage = { type: 'success', text: `✅ ${result.item_name} resgatado com sucesso!` }; setTimeout(() => fetchData(), 1000); }
        } catch (e) { storeMessage = { type: 'error', text: 'Erro ao comprar' }; }
        renderContent();
      }
      else if (action === 'joinTournament') {
        try {
          const result = await apiCall('tournament_join', { tournament_id: arg });
          if (result.error) alert(result.error);
          else { await fetchData(); }
        } catch (e) { alert('Erro ao inscrever'); }
      }
      else if (action === 'missionFilter') { missionTab = arg; renderContent(); }
      else if (action === 'missionOptin') {
        try {
          await apiCall('mission_optin', { mission_id: arg });
          await fetchData();
        } catch (e) { alert('Erro ao participar'); }
      }
      else if (action === 'claimMission') {
        try {
          const result = await apiCall('mission_claim', { mission_id: arg });
          if (result.error) alert(result.error);
          else await fetchData();
        } catch (e) { alert('Erro ao resgatar'); }
      }
      else if (action === 'claimReward') {
        try {
          const result = await apiCall('claim_reward', { reward_id: arg });
          if (result.error) alert(result.error);
          else await fetchData();
        } catch (e) { alert('Erro ao resgatar'); }
      }
      else if (action === 'openMiniGame') {
        selectedMiniGame = arg; miniGameResult = null; miniGamePlaying = false; scratchRevealed = []; giftBoxOpened = null; renderContent();
      }
      else if (action === 'closeMiniGame') {
        selectedMiniGame = null; miniGameResult = null; miniGamePlaying = false; scratchRevealed = []; giftBoxOpened = null; renderContent();
      }
      else if (action === 'playMiniGame') {
        miniGameResult = null; miniGamePlaying = true; scratchRevealed = []; giftBoxOpened = null; renderContent();
        try {
          const result = await apiCall('play_mini_game', { game_id: arg });
          miniGamePlaying = false;
          if (result.error) { miniGameResult = { error: result.error }; }
          else { miniGameResult = result; }
          renderContent();
          setTimeout(() => fetchData(), 1500);
        } catch (e) { miniGamePlaying = false; miniGameResult = { error: 'Erro ao jogar' }; renderContent(); }
      }
      else if (action === 'scratchCell') {
        if (!scratchRevealed.includes(arg)) {
          scratchRevealed.push(arg);
          renderContent();
        }
      }
      else if (action === 'openGiftBox') {
        if (giftBoxOpened === null) {
          giftBoxOpened = arg;
          renderContent();
        }
      }
    };
    // Legacy compat
    window.__pbgToggle = (s) => toggle(s);

    fetchData();
    setInterval(fetchData, 120_000);
  }

  function init() {
    if (isUserLoggedIn()) initWidget();
    else { const chk = setInterval(() => { if (isUserLoggedIn()) { clearInterval(chk); initWidget(); } }, 3000); }
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
