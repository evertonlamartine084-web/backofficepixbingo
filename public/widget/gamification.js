/**
 * PixBingoBR Gamification Widget v2
 * Embed via GTM: <script src="YOUR_HOST/widget/gamification.js"></script>
 * Attributes: data-segment, data-player, data-require-login, data-auth-selector
 */
(function () {
  'use strict';

  const API_URL = 'https://backofficepixbingobr.vercel.app/api/gamification-widget';

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
    // Default: só mostra para usuários logados (.menu-saldo-body só existe após login)
    return !!document.querySelector('.menu-saldo-body');
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
      position: fixed !important; bottom: max(24px, calc(env(safe-area-inset-bottom) + 16px)) !important; right: 24px !important; width: 68px !important; height: 68px !important;
      border-radius: 50% !important; background: transparent !important;
      border: none !important; cursor: pointer !important; z-index: 2147483647 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      box-shadow: none !important;
      transition: transform 0.2s !important;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      opacity: 1 !important; visibility: visible !important;
      pointer-events: auto !important;
      transform: none !important;
      margin: 0 !important; padding: 0 !important;
      min-width: 68px !important; min-height: 68px !important;
      overflow: visible !important;
      left: auto !important; top: auto !important;
    }
    #pbg-widget-fab:hover { transform: scale(1.08) !important; }

    .pbg-fab-ring {
      position: absolute; inset: 0; width: 68px; height: 68px;
    }
    .pbg-fab-ring svg { width: 68px; height: 68px; transform: rotate(-90deg); filter: drop-shadow(0 2px 8px rgba(139,92,246,0.5)); }
    .pbg-fab-ring .ring-bg { fill: none; stroke: rgba(139,92,246,0.2); stroke-width: 4; }
    .pbg-fab-ring .ring-fg { fill: none; stroke: url(#pbg-fab-grad); stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease; }

    .pbg-fab-inner {
      position: relative; width: 54px; height: 54px; border-radius: 50%;
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      box-shadow: 0 4px 24px rgba(139,92,246,0.5);
      animation: pbg-pulse 2s infinite;
    }
    @keyframes pbg-pulse { 0%,100%{box-shadow:0 4px 20px rgba(139,92,246,0.4)} 50%{box-shadow:0 4px 28px rgba(139,92,246,0.7)} }
    .pbg-fab-inner svg { width: 24px; height: 24px; color: white; display: block; }
    .pbg-fab-level {
      font-size: 18px; font-weight: 800; color: #fff; line-height: 1;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      text-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .pbg-fab-lvlabel {
      font-size: 8px; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;
      letter-spacing: 0.5px; line-height: 1; margin-top: 1px;
      font-family: 'Space Grotesk', system-ui, sans-serif;
    }
    .pbg-fab-coins {
      position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff;
      font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      font-family: 'Space Grotesk', system-ui, sans-serif;
      white-space: nowrap; line-height: 1.2;
    }
    .pbg-fab-diamonds {
      position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #22d3ee, #0891b2); color: #fff;
      font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      font-family: 'Space Grotesk', system-ui, sans-serif;
      white-space: nowrap; line-height: 1.2;
    }

    #pbg-widget-panel {
      position: fixed !important; top: 0 !important; left: 50% !important; transform: translateX(-50%) scale(0.95);
      width: 420px; max-width: 95vw; height: 100dvh; max-height: 100vh;
      background: #0c0a1a !important; border: 1px solid rgba(139,92,246,0.2); border-radius: 20px;
      z-index: 2147483646 !important; transition: transform 0.3s ease, opacity 0.3s ease;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      display: flex !important; flex-direction: column; overflow: hidden;
      opacity: 0; pointer-events: none;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139,92,246,0.15);
    }
    #pbg-widget-panel.open { transform: translateX(-50%) scale(1) !important; opacity: 1 !important; pointer-events: auto !important; }
    #pbg-widget-backdrop { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.6) !important; z-index: 2147483645 !important; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
    #pbg-widget-backdrop.open { opacity: 1 !important; pointer-events: auto !important; }

    /* ---- Smartico-style header ---- */
    .pbg-smartico-header {
      padding: max(14px, env(safe-area-inset-top)) 16px 12px; border-radius: 20px 20px 0 0;
      background: linear-gradient(160deg, rgba(139,92,246,0.18) 0%, rgba(6,182,212,0.08) 100%);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      position: relative;
    }
    .pbg-header-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .pbg-avatar {
      width: 54px; height: 54px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 800; color: #fff;
      border: 2px solid rgba(139,92,246,0.6); overflow: hidden;
    }
    .pbg-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .pbg-user-info { flex: 1; min-width: 0; }
    .pbg-username { font-size: 13px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .pbg-level-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .pbg-level-img { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
    .pbg-level-name-lbl { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); }
    .pbg-xp-track { height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 3px; }
    .pbg-xp-fill { height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(.4,0,.2,1); }
    .pbg-next-lvl-txt { font-size: 10px; color: #71717a; }
    .pbg-next-lvl-txt span { color: #a78bfa; font-weight: 600; }
    .pbg-close {
      position: absolute; top: 12px; right: 12px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: #a1a1aa; width: 28px; height: 28px; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 16px; transition: all 0.2s; font-family: inherit; padding: 0;
    }
    .pbg-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .pbg-counters-row { display: flex; gap: 8px; }
    .pbg-counter-chip {
      flex: 1; display: flex; align-items: center; gap: 7px;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; padding: 7px 10px;
    }
    .pbg-counter-val { font-size: 14px; font-weight: 800; color: #fff; line-height: 1; }
    .pbg-counter-lbl { font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 1px; }

    /* ---- Smartico-style navbar ---- */
    .pbg-smartico-nav {
      display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch;
      background: rgba(255,255,255,0.015); border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 0 2px;
    }
    .pbg-smartico-nav::-webkit-scrollbar { display: none; }
    .pbg-nav-item {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 8px 11px; gap: 3px; cursor: pointer; flex-shrink: 0;
      border-bottom: 2px solid transparent; transition: all 0.15s; position: relative;
      min-width: 54px; background: none; border-left: none; border-right: none; border-top: none;
    }
    .pbg-nav-item:hover { background: rgba(255,255,255,0.03); }
    .pbg-nav-item.active { border-bottom-color: #8b5cf6; }
    .pbg-nav-icon { width: 20px; height: 20px; color: #52525b; transition: color 0.15s; display: flex; align-items: center; justify-content: center; }
    .pbg-nav-item.active .pbg-nav-icon { color: #8b5cf6; }
    .pbg-nav-lbl { font-size: 9px; font-weight: 600; color: #52525b; white-space: nowrap; letter-spacing: 0.2px; transition: color 0.15s; font-family: inherit; }
    .pbg-nav-item.active .pbg-nav-lbl { color: #8b5cf6; }
    .pbg-nav-badge {
      position: absolute; top: 3px; right: 3px;
      background: #ef4444; color: #fff; font-size: 8px; font-weight: 700;
      min-width: 14px; height: 14px; border-radius: 7px; display: flex; align-items: center; justify-content: center; padding: 0 3px;
    }

    .pbg-content { flex: 1; overflow-y: auto; padding: 16px; min-height: 0; }
    .pbg-content.pbg-no-pad { padding: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; }
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
    .pbg-badge-diamonds { background: rgba(34,211,238,0.15); color: #22d3ee; }
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

    /* Wheel — Donald Bet Style */
    .pbg-wheel-container {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
      background: radial-gradient(ellipse at 50% 30%, #0a2a5e 0%, #060e2a 55%, #020510 100%);
      margin: 0; padding: 20px 16px; position: relative;
      flex: 1; box-sizing: border-box;
    }
    /* Stars overlay */
    .pbg-wheel-container::before {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background-image:
        radial-gradient(1px 1px at 15% 20%, rgba(255,255,255,0.7) 0%, transparent 100%),
        radial-gradient(1px 1px at 75% 10%, rgba(255,255,255,0.5) 0%, transparent 100%),
        radial-gradient(1.5px 1.5px at 35% 60%, rgba(255,255,255,0.4) 0%, transparent 100%),
        radial-gradient(1px 1px at 85% 50%, rgba(255,255,255,0.6) 0%, transparent 100%),
        radial-gradient(1px 1px at 60% 80%, rgba(255,255,255,0.3) 0%, transparent 100%),
        radial-gradient(1.5px 1.5px at 10% 75%, rgba(255,255,255,0.5) 0%, transparent 100%),
        radial-gradient(1px 1px at 90% 85%, rgba(255,255,255,0.4) 0%, transparent 100%),
        radial-gradient(1px 1px at 50% 15%, rgba(255,255,255,0.6) 0%, transparent 100%),
        radial-gradient(1px 1px at 25% 40%, rgba(255,255,255,0.35) 0%, transparent 100%),
        radial-gradient(1px 1px at 70% 35%, rgba(255,255,255,0.5) 0%, transparent 100%);
    }
    .pbg-wheel-stage {
      position: relative; width: 250px; height: 250px; margin: 10px auto 20px;
    }
    /* Blue neon outer ring — rotates slowly (idle) */
    .pbg-wheel-ring-outer {
      position: absolute; inset: -14px; border-radius: 50%;
      background: conic-gradient(#00d4ff, #0066ff, #00aaff, #0055cc, #00d4ff);
      box-shadow: 0 0 30px rgba(0,180,255,0.7), 0 0 60px rgba(0,120,255,0.4), inset 0 0 20px rgba(0,0,0,0.5);
      animation: pbg-ring-idle-rot 18s linear infinite, pbg-ring-pulse 2s ease-in-out infinite;
    }
    @keyframes pbg-ring-pulse {
      0%,100% { box-shadow: 0 0 30px rgba(0,180,255,0.7), 0 0 60px rgba(0,120,255,0.4); }
      50% { box-shadow: 0 0 44px rgba(0,220,255,1), 0 0 90px rgba(0,150,255,0.6); }
    }
    /* Dark inner ring */
    .pbg-wheel-ring-inner {
      position: absolute; inset: -5px; border-radius: 50%;
      background: #05122b;
      box-shadow: inset 0 0 20px rgba(0,0,0,0.8), 0 0 8px rgba(0,100,255,0.3);
    }
    /* Bulbs on the blue ring */
    .pbg-wheel-bulbs { position: absolute; inset: -14px; border-radius: 50%; z-index: 3; pointer-events: none; }
    .pbg-bulb {
      position: absolute; width: 8px; height: 8px; border-radius: 50%;
      border: 1px solid rgba(0,0,0,0.3);
    }
    .pbg-bulb-on { background: radial-gradient(circle at 35% 35%, #fff, #00eeff); box-shadow: 0 0 8px 2px rgba(0,220,255,0.9); }
    .pbg-bulb-off { background: radial-gradient(circle at 35% 35%, #aaeeff, #005599); box-shadow: 0 0 4px 1px rgba(0,100,200,0.4); }
    @keyframes pbg-bulb-a { 0%,100%{ opacity:1 } 50%{ opacity:0.2 } }
    @keyframes pbg-bulb-b { 0%,100%{ opacity:0.2 } 50%{ opacity:1 } }
    .pbg-wheel-bulbs.spin .pbg-bulb-on { animation: pbg-bulb-a 0.3s infinite; }
    .pbg-wheel-bulbs.spin .pbg-bulb-off { animation: pbg-bulb-b 0.3s infinite; }
    /* SVG wheel */
    .pbg-wheel-svg {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 50%; z-index: 2;
      transition: transform 7s cubic-bezier(0.15, 0.85, 0.25, 1.00);
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6));
    }
    /* Idle: outer ring rotates slowly */
    @keyframes pbg-ring-idle-rot {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    /* Pointer on the RIGHT side */
    .pbg-wheel-flap {
      position: absolute; top: 50%; right: -10px; transform: translateY(-50%); z-index: 6;
    }
    .pbg-wheel-flap svg { filter: drop-shadow(0 3px 6px rgba(0,0,0,0.7)); }
    /* Center hub — blue */
    .pbg-wheel-hub {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 58px; height: 58px; border-radius: 50%; z-index: 4;
      background: radial-gradient(circle at 40% 35%, #3b9eff, #005fcc 60%, #003d99 100%);
      border: 3px solid rgba(255,255,255,0.2);
      box-shadow: 0 4px 20px rgba(0,100,255,0.6), inset 0 2px 8px rgba(255,255,255,0.25), 0 0 0 4px rgba(0,80,200,0.3);
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
      user-select: none;
    }
    .pbg-wheel-hub:hover { transform: translate(-50%,-50%) scale(1.08); box-shadow: 0 4px 28px rgba(0,150,255,0.8), inset 0 2px 8px rgba(255,255,255,0.3); }
    .pbg-wheel-hub.off { opacity: 0.5; cursor: not-allowed; }
    .pbg-wheel-hub.off:hover { transform: translate(-50%,-50%); }
    .pbg-hub-text { font-size: 9px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1; font-family: inherit; }
    .pbg-hub-icon { color: #fff; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; }
    /* Spin info / timer */
    .pbg-wheel-timer-banner {
      text-align: center; padding: 6px 16px 2px; color: #fbbf24;
      font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
    }
    .pbg-wheel-timer-countdown {
      display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 2px;
    }
    .pbg-timer-block {
      background: rgba(0,0,0,0.5); border: 1px solid rgba(255,193,7,0.3);
      border-radius: 6px; padding: 3px 8px; min-width: 36px; text-align: center;
    }
    .pbg-timer-num { font-size: 14px; font-weight: 800; color: #fbbf24; line-height: 1; }
    .pbg-timer-lbl { font-size: 8px; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; }
    .pbg-timer-sep { font-size: 18px; font-weight: 800; color: #fbbf24; line-height: 1; margin-top: -4px; }
    /* ROLETA DIÁRIA banner */
    .pbg-wheel-title-banner {
      font-size: 20px; font-weight: 900; text-align: center; letter-spacing: 0.08em;
      background: linear-gradient(180deg, #ffe566 0%, #d4a017 40%, #f7d86c 70%, #b8860b 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      text-shadow: none;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
      padding: 0; margin: 10px 0 30px;
      position: relative; z-index: 1;
    }
    .pbg-spin-info {
      font-size: 11px; color: #a1a1aa; text-align: center;
      display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;
      margin-top: 16px; padding-bottom: 0;
    }
    .pbg-spin-tag {
      display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px;
      border-radius: 8px; font-size: 11px; font-weight: 600;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    }
    .pbg-spin-result {
      text-align: center; padding: 8px 12px; border-radius: 10px;
      background: linear-gradient(135deg, rgba(212,160,23,0.15), rgba(0,100,255,0.08));
      border: 1px solid rgba(212,160,23,0.3);
      animation: pbg-scale-in 0.35s ease; margin: 0 0 16px;
    }
    .pbg-spin-result-prize { font-size: 18px; font-weight: 800; color: #f7d86c; margin-top: 2px; }
    .pbg-spin-cost-badge {
      display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
      border-radius: 8px; font-size: 11px; font-weight: 600;
      background: rgba(245,158,11,0.08); color: #fbbf24; border: 1px solid rgba(245,158,11,0.15);
    }
    @media (max-width: 420px) {
      .pbg-wheel-stage { width: 230px; height: 230px; }
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
    }
  `;

  const ICONS = {
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>',
    wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',
    gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="#f59e0b" stroke="#d97706" stroke-width="2"/><line x1="12" y1="6" x2="12" y2="18" stroke="#92400e" stroke-width="2"/><line x1="8" y1="8" x2="16" y2="8" stroke="#92400e" stroke-width="1.5"/><line x1="8" y1="16" x2="16" y2="16" stroke="#92400e" stroke-width="1.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    party: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    gem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>',
    dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M12 12h.01"/><path d="M8 16h.01"/></svg>',
    slot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/><path d="M12 7v4"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="14" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
    dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
    sad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
    giftbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    gold: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="800" fill="#92400e" font-family="sans-serif">1</text></svg>',
    silver: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="#c0c0c0" stroke="#9ca3af" stroke-width="2"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="800" fill="#4b5563" font-family="sans-serif">2</text></svg>',
    bronze: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="#cd7f32" stroke="#a16207" stroke-width="2"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="800" fill="#451a03" font-family="sans-serif">3</text></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="12" y2="8"/><circle cx="12" cy="14" r="8"/></svg>',
    hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
    diamond: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z" fill="#22d3ee" stroke="#06b6d4" stroke-width="2"/><path d="M11 3 8 9l4 13 4-13-3-6" fill="rgba(255,255,255,0.2)" stroke="#06b6d4" stroke-width="1"/><path d="M2 9h20" stroke="#06b6d4" stroke-width="2"/></svg>',
  };

  // Inline icon helper: wraps SVG in a small inline span
  const inlIcon = (name, size) => {
    const s = size || 14;
    return '<span style="width:'+s+'px;height:'+s+'px;display:inline-block;vertical-align:middle;line-height:0">'+ICONS[name]+'</span>';
  };

  const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const maskCpf = (cpf) => cpf ? cpf.slice(0,3) + '***' + cpf.slice(-2) : '???';
  const formatDate = (d) => { if (!d) return ''; const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; };
  const timeAgo = (d) => { const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (mins < 60) return `${mins}min`; const hrs = Math.floor(mins/60); if (hrs < 24) return `${hrs}h`; return `${Math.floor(hrs/24)}d`; };

  const rewardBadge = (type, value) => {
    const cls = `pbg-badge-${type}` || 'pbg-badge-bonus';
    const labels = { bonus: fmt(value), free_bet: fmt(value), coins: `${value} Moedas`, xp: `${value} XP`, diamonds: `${value} Diamantes`, spins: `${value} Giros`, nothing: 'Nada' };
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
    try { data = await apiCall('data'); updateFab(); renderContent(); } catch (e) { console.error('[PBG Widget]', e); }
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
      // Use data.wheel_prizes (same source as renderWheel) to calculate angle
      const wheelPrizes = data?.wheel_prizes || result.prizes || [];
      if (canvas && wheelPrizes.length) {
        // Rebuild displayPrizes same way as renderWheel
        let dp = [...wheelPrizes];
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
        // Pointer is on the RIGHT (3 o'clock = 90° from top), so add 90° offset
        const sectorCenter = winIndex * sliceAngle + sliceAngle / 2;
        const targetAngle = (360 - sectorCenter + 90) % 360;
        const totalRotation = (12 + Math.floor(Math.random() * 4)) * 360 + targetAngle;
        // Apply casino-style easing: fast start, long spin, slow deceleration
        canvas.style.transition = 'transform 7s cubic-bezier(0.05, 0.95, 0.20, 1.00)';
        canvas.style.transform = `rotate(${totalRotation}deg)`;
      }
      setTimeout(() => {
        isSpinning = false;
        const b = document.getElementById('pbg-wheel-bulbs');
        if (b) b.classList.remove('spin');
        fetchData();
      }, 7500);
    } catch (e) { isSpinning = false; renderContent(); }
  }

  // ---- RENDERS ----
  // Mission sub-tab state
  let missionTab = 'all';

  function renderMissions() {
    if (!data?.missions?.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto 12px;opacity:0.5;color:#71717a">${ICONS.target}</div><div style="font-size:13px">Nenhuma missão disponível</div></div>`;

    const typeColors = { daily: '#f59e0b', weekly: '#06b6d4', monthly: '#8b5cf6', one_time: '#10b981' };
    const typeIcons = { daily: inlIcon('zap',20), weekly: inlIcon('calendar',20), monthly: inlIcon('refresh',20), one_time: inlIcon('target',20) };
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
            <div class="pbg-m-detail-icon">${m.icon_url ? `<img src="${m.icon_url}" style="width:56px;height:56px;border-radius:14px" alt="">` : typeIcons[m.type] || inlIcon('target',22)}</div>
            <div class="pbg-m-detail-name">${m.name}</div>
            ${m.description ? `<div class="pbg-m-detail-desc">${m.description}</div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:10px">
              <span class="pbg-m-tag" style="background:${color}18;color:${color}">${typeIcons[m.type]} ${typeLabels[m.type]}</span>
              ${m.require_optin ? '<span class="pbg-m-tag pbg-m-optin-tag">' + inlIcon('hand',12) + ' Opt-in</span>' : ''}
              ${m.time_limit_hours ? `<span class="pbg-m-tag pbg-m-timer">${inlIcon('timer',12)} ${m.time_limit_hours}h</span>` : ''}
              ${m.recurrence && m.recurrence !== 'none' ? `<span class="pbg-m-tag pbg-m-rec">${inlIcon('refresh',12)} ${recLabels[m.recurrence] || m.recurrence}</span>` : ''}
              ${isCompleted ? '<span class="pbg-m-tag pbg-m-complete-tag">' + inlIcon('check',12) + ' Completa</span>' : ''}
            </div>
          </div>

          <!-- Objective -->
          <div class="pbg-m-detail-section">
            <div class="pbg-m-detail-section-title">${inlIcon('clipboard',14)} Objetivo</div>
            <div style="font-size:14px;font-weight:700;color:#fff">${conditionText(m.condition_type, m.condition_value)}</div>
          </div>

          <!-- Progress -->
          ${PLAYER_CPF ? `
            <div class="pbg-m-detail-section">
              <div class="pbg-m-detail-section-title">${inlIcon('chart',14)} Progresso</div>
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
            <div class="pbg-m-detail-section-title" style="color:#34d399">${inlIcon('gift',14)} Recompensa</div>
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 0">
              <div style="font-size:28px">${{bonus:inlIcon('dollar',28),free_bet:inlIcon('ticket',28),cartelas:inlIcon('card',28),coins:inlIcon('coin',28),xp:inlIcon('star',28),diamonds:inlIcon('diamond',28),spins:inlIcon('wheel',28)}[m.reward_type] || inlIcon('gift',28)}</div>
              <div>
                <div style="font-size:18px;font-weight:800;color:#fff">${m.reward_type === 'bonus' || m.reward_type === 'free_bet' ? fmt(m.reward_value) : m.reward_value}</div>
                <div style="font-size:11px;color:#71717a">${{bonus:'Bônus',free_bet:'Aposta Grátis',cartelas:'Cartelas',coins:'Moedas',xp:'Pontos XP',diamonds:'Diamantes',spins:'Giros na Roleta'}[m.reward_type] || m.reward_type}</div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          ${m.require_optin && !isOptedIn && !isCompleted && PLAYER_CPF ? `
            <button class="pbg-modal-btn" style="margin-top:4px" onclick="window.__pbg('missionOptin','${m.id}')">${inlIcon('hand',14)} Participar desta Missão</button>
          ` : ''}
          ${isCompleted && m.manual_claim && !isClaimed && PLAYER_CPF ? `
            <button class="pbg-modal-btn" style="margin-top:4px;background:linear-gradient(135deg,#10b981,#059669)" onclick="window.__pbg('claimMission','${m.id}')">${inlIcon('gift',14)} Resgatar Recompensa</button>
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
      { key: 'daily', label: inlIcon('zap')+' Diárias', count: data.missions.filter(m => m.type === 'daily').length },
      { key: 'weekly', label: inlIcon('calendar')+' Semanais', count: data.missions.filter(m => m.type === 'weekly').length },
      { key: 'monthly', label: inlIcon('refresh')+' Mensais', count: data.missions.filter(m => m.type === 'monthly').length },
      { key: 'one_time', label: inlIcon('target')+' Únicas', count: data.missions.filter(m => m.type === 'one_time').length },
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
      const rewardText = m.reward_type === 'bonus' || m.reward_type === 'free_bet' || m.reward_type === 'cartelas' ? fmt(m.reward_value) : `${m.reward_value} ${{coins:inlIcon('coin',12),xp:inlIcon('star',12),diamonds:inlIcon('diamond',12),spins:inlIcon('wheel',12)}[m.reward_type] || m.reward_type}`;

      return `
        <div class="pbg-m-card ${isCompleted ? 'completed' : ''}" onclick="window.__pbg('openMission',${globalIdx})">
          <div class="pbg-m-body">
            <div class="pbg-m-icon" style="background:${color}15">
              ${m.icon_url ? `<img src="${m.icon_url}" style="width:28px;height:28px;border-radius:6px" alt="">` : `<span>${typeIcons[m.type] || inlIcon('target',22)}</span>`}
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
                  <div class="pbg-m-progress-pct">${isCompleted ? inlIcon('check',14) : `${pct}%`}</div>
                </div>
              ` : `
                <div class="pbg-m-reward-chip">${rewardText}</div>
              `}
            </div>
          </div>
          <div class="pbg-m-footer">
            ${!PLAYER_CPF ? '' : `<span class="pbg-m-reward-chip" style="font-size:9px;padding:2px 7px">${rewardText}</span>`}
            ${m.time_limit_hours ? `<span class="pbg-m-tag pbg-m-timer">${inlIcon('timer',12)} ${m.time_limit_hours}h</span>` : ''}
            ${m.require_optin && !isOptedIn && !isCompleted ? '<span class="pbg-m-tag pbg-m-optin-tag">' + inlIcon('hand',12) + ' Opt-in</span>' : ''}
            ${m.recurrence && m.recurrence !== 'none' ? `<span class="pbg-m-tag pbg-m-rec">${inlIcon('refresh',12)}</span>` : ''}
            ${isCompleted && m.manual_claim && !isClaimed && PLAYER_CPF ? `<button class="pbg-m-claim-btn" onclick="event.stopPropagation();window.__pbg('claimMission','${m.id}')">${inlIcon('gift',12)} Resgatar</button>` : ''}
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
    if (!data?.achievements?.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto 12px;opacity:0.5;color:#71717a">${ICONS.trophy}</div><div style="font-size:13px">Nenhuma conquista disponível</div></div>`;
    const catNames = { deposito:inlIcon('money')+' Depósito', aposta:inlIcon('dice')+' Aposta', login:inlIcon('key')+' Login', vitoria:inlIcon('medal')+' Vitória', social:inlIcon('users')+' Social', geral:inlIcon('star')+' Geral' };
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
                ${a.icon_url ? `<img src="${a.icon_url}" width="20" height="20" style="border-radius:4px;${!isCompleted && !ap ? 'filter:grayscale(1);opacity:0.5' : ''}">` : (isCompleted ? inlIcon('trophy',18) : inlIcon('lock',18))}
                ${a.name}
                ${isCompleted ? '<span class="pbg-badge pbg-badge-completed">${inlIcon(\'check\',12)}</span>' : ''}
                ${segmentBadge(a)}
              </div>
              ${a.description ? `<p class="pbg-card-desc">${a.description}</p>` : ''}
              <div class="pbg-condition">${inlIcon('target',14)} ${conditionText(a.condition_type, a.condition_value)}</div>
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
    if (!data?.tournaments?.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto 12px;opacity:0.5;color:#71717a">${ICONS.swords}</div><div style="font-size:13px">Nenhum torneio ativo</div></div>`;
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
              <span class="pbg-t-tag">${inlIcon('chart',12)} ${pointsPerLabels[t.points_per]||'1 pt / R$ 1'}</span>
              ${t.buy_in_cost > 0 ? `<span class="pbg-t-tag" style="color:#fbbf24">${inlIcon('coin',12)} Entrada: ${t.buy_in_cost}</span>` : '<span class="pbg-t-tag" style="color:#34d399">' + inlIcon('check',12) + ' Grátis</span>'}
              ${t.max_players ? `<span class="pbg-t-tag">${inlIcon('users',12)} Máx: ${t.max_players}</span>` : ''}
              ${myRank > 0 ? `<span class="pbg-t-tag" style="color:#a78bfa">${inlIcon('medal',12)} Sua posição: #${myRank}</span>` : ''}
            </div>
          </div>

          <!-- Join button -->
          <div style="margin-top:10px">
            ${(t.require_optin || t.buy_in_cost > 0) && !isJoined && PLAYER_CPF ? `
              <button class="pbg-t-join-btn" onclick="window.__pbg('joinTournament','${t.id}')">
                ${t.buy_in_cost > 0 ? `${inlIcon('coin',14)} Inscrever-se (${t.buy_in_cost} moedas)` : inlIcon('swords',14)+' Participar do Torneio'}
              </button>
            ` : isJoined ? `
              <div class="pbg-t-joined">${inlIcon('check',14)} Inscrito ${myEntry.score > 0 ? `· ${Number(myEntry.score).toLocaleString('pt-BR')} pts` : ''}</div>
            ` : !t.require_optin && !t.buy_in_cost ? `
              <div class="pbg-t-joined">${inlIcon('check',14)} Participação automática</div>
            ` : ''}
          </div>

          <!-- Podium + Leaderboard -->
          <div style="margin-top:14px">
            <div class="pbg-section-title">${inlIcon('chart',14)} Classificação</div>
            ${lb.length === 0 ? `
              <div style="text-align:center;padding:24px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.04)">
                <div style="width:36px;height:36px;margin:0 auto 8px;opacity:0.6;color:#71717a">${ICONS.hourglass}</div>
                <div style="font-size:13px;color:#71717a">Aguardando participantes</div>
              </div>
            ` : `
              <!-- Podium for top 3 -->
              ${top3.length > 0 ? `
                <div class="pbg-podium">
                  ${top3.length >= 2 ? `<div class="pbg-podium-col pbg-podium-2"><div class="pbg-podium-bar"><div class="pbg-podium-medal">${inlIcon('silver',22)}</div><div class="pbg-podium-name">${PLAYER_CPF && top3[1].cpf === PLAYER_CPF ? 'Você' : maskCpf(top3[1].cpf)}</div><div class="pbg-podium-score">${Number(top3[1].score).toLocaleString('pt-BR')}</div></div></div>` : ''}
                  <div class="pbg-podium-col pbg-podium-1"><div class="pbg-podium-bar"><div class="pbg-podium-medal">${inlIcon('gold',22)}</div><div class="pbg-podium-name">${PLAYER_CPF && top3[0].cpf === PLAYER_CPF ? 'Você' : maskCpf(top3[0].cpf)}</div><div class="pbg-podium-score">${Number(top3[0].score).toLocaleString('pt-BR')}</div></div></div>
                  ${top3.length >= 3 ? `<div class="pbg-podium-col pbg-podium-3"><div class="pbg-podium-bar"><div class="pbg-podium-medal">${inlIcon('bronze',22)}</div><div class="pbg-podium-name">${PLAYER_CPF && top3[2].cpf === PLAYER_CPF ? 'Você' : maskCpf(top3[2].cpf)}</div><div class="pbg-podium-score">${Number(top3[2].score).toLocaleString('pt-BR')}</div></div></div>` : ''}
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
              <div class="pbg-section-title">${inlIcon('medal',14)} Premiação</div>
              <div style="background:rgba(255,255,255,0.02);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.04)">
                ${prizes.map((p,i) => {
                  const medals = [inlIcon('gold',18),inlIcon('silver',18),inlIcon('bronze',18)]; const medal = i < 3 ? medals[i] : `${p.rank||i+1}º`;
                  return `<div class="pbg-prize-row"><span class="pbg-prize-rank">${medal}</span><span class="pbg-prize-desc">${p.description||`${p.rank||i+1}º lugar`}</span><span class="pbg-prize-val">${fmt(p.value)}</span></div>`;
                }).join('')}
                <div class="pbg-prize-total"><span style="color:#fff;font-weight:700;font-size:13px">${inlIcon('money',14)} Pool Total</span><span style="color:#34d399;font-weight:800;font-size:15px;font-family:'JetBrains Mono',monospace">${fmt(pool)}</span></div>
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
              <div class="pbg-t-stat"><div class="pbg-t-stat-label">Entrada</div><div class="pbg-t-stat-val" style="font-size:12px;color:${t.buy_in_cost > 0 ? '#fbbf24' : '#34d399'}">${t.buy_in_cost > 0 ? inlIcon('coin',12)+' '+t.buy_in_cost : 'Grátis'}</div></div>
            </div>
            ${myEntry ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(16,185,129,0.08);border-radius:6px;font-size:11px;color:#34d399;font-weight:600;text-align:center">${inlIcon('check',12)} Inscrito${myEntry.score > 0 ? ' · '+Number(myEntry.score).toLocaleString('pt-BR')+' pts' : ''}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderWheel() {
    const prizes = data?.wheel_prizes || [];
    if (!prizes.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.wheel}</div><div style="font-size:13px">Roleta não configurada</div></div>`;

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

    const size = 270; const cx = size / 2; const cy = size / 2; const r = size / 2 - 2;
    const n = displayPrizes.length; const sliceAng = (2 * Math.PI) / n;

    // Red/blue alternating palette — Donald Bet style
    const paletteRed = ['#c0392b','#d63031','#e74c3c','#c0392b'];
    const paletteBlue = ['#1a3a8a','#154480','#0d2b6a','#1e4799'];

    let svg = `<defs>
      <linearGradient id="pbg-blu" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00aaff"/><stop offset="100%" stop-color="#0044cc"/></linearGradient>
      <radialGradient id="pbg-hub-center" cx="40%" cy="35%" r="60%"><stop offset="0%" stop-color="#60bbff"/><stop offset="100%" stop-color="#003a99"/></radialGradient>
    </defs>`;

    for (let i = 0; i < n; i++) {
      const sa = i * sliceAng - Math.PI / 2;
      const ea = sa + sliceAng;
      const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
      const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
      const la = sliceAng > Math.PI ? 1 : 0;
      // Always use red/blue palette (ignore DB colors)
      const isRed = i % 2 === 0;
      const color = isRed ? paletteRed[i % paletteRed.length] : paletteBlue[i % paletteBlue.length];

      svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} Z" fill="${color}" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>`;

      const midA = sa + sliceAng / 2;

      // Text: rotate so it points from center outward; flip if upside-down
      const label = displayPrizes[i].label.length > 10 ? displayPrizes[i].label.slice(0, 9) + '…' : displayPrizes[i].label;
      const fs = n > 8 ? 8 : n > 5 ? 9 : 11;
      const textR = r * 0.66;
      const tx = cx + textR * Math.cos(midA);
      const ty = cy + textR * Math.sin(midA);
      let deg = (midA * 180 / Math.PI) + 90;
      // Flip text that would appear upside-down (sectors on the bottom half)
      if (deg > 90 && deg < 270) deg += 180;
      svg += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="800" font-family="Space Grotesk,sans-serif" transform="rotate(${deg},${tx},${ty})" style="paint-order:stroke;stroke:#000;stroke-width:3px;stroke-opacity:0.6">${label}</text>`;
    }

    // Inner ring — dark blue hub area
    svg += `<circle cx="${cx}" cy="${cy}" r="40" fill="#04112a" stroke="none"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="url(#pbg-blu)" stroke-width="3"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="36" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;

    // Separator lines (white semi-transparent)
    for (let i = 0; i < n; i++) {
      const a = i * sliceAng - Math.PI / 2;
      const lx1 = cx + 40 * Math.cos(a), ly1 = cy + 40 * Math.sin(a);
      const lx2 = cx + r * Math.cos(a), ly2 = cy + r * Math.sin(a);
      svg += `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    }

    // Outer glow ring on SVG
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,180,255,0.2)" stroke-width="3"/>`;

    // Bulbs
    const numBulbs = Math.max(24, n * 3);
    const bulbCenter = 139; // (250 + 14*2) / 2
    const bulbR = 132;
    let bulbsHtml = '';
    for (let i = 0; i < numBulbs; i++) {
      const a = (i / numBulbs) * 2 * Math.PI - Math.PI / 2;
      const bx = bulbCenter + bulbR * Math.cos(a);
      const by = bulbCenter + bulbR * Math.sin(a);
      bulbsHtml += `<div class="pbg-bulb ${i % 2 === 0 ? 'pbg-bulb-on' : 'pbg-bulb-off'}" style="left:${bx}px;top:${by}px;transform:translate(-50%,-50%)"></div>`;
    }

    // Pointer — diamond arrow pointing LEFT, on the right side
    const flapSvg = `<svg width="36" height="28" viewBox="0 0 36 28"><defs><linearGradient id="pfg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#a0a0a0"/><stop offset="60%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e8e8e8"/></linearGradient></defs><path d="M0 14 L26 2 L36 14 L26 26 Z" fill="url(#pfg2)" stroke="#888" stroke-width="1.5"/><circle cx="26" cy="14" r="4" fill="rgba(255,255,255,0.5)"/></svg>`;

    // Hub content
    const hubSpin = `<div class="pbg-hub-icon" style="width:28px;height:28px">${inlIcon('refresh',28)}</div>`;
    let hubContent = hubSpin;
    if (isSpinning) hubContent = `<div class="pbg-hub-icon" style="animation:spin 0.6s linear infinite;width:28px;height:28px">${inlIcon('refresh',28)}</div>`;
    else if (maxReached) hubContent = `<div class="pbg-hub-icon" style="width:22px;height:22px">${inlIcon('lock',22)}</div>`;
    else if (!PLAYER_CPF) hubContent = `<div class="pbg-hub-icon" style="width:22px;height:22px">${inlIcon('lock',22)}</div>`;

    // Timer until next free spin (midnight reset)
    let timerHtml = '';
    if (maxReached || (freeLeft === 0 && !isFree)) {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
      const ms = midnight - now;
      const hrs = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      timerHtml = `
        <div class="pbg-wheel-timer-banner">⚠ JOGAR NOVAMENTE EM ⚠</div>
        <div class="pbg-wheel-timer-countdown">
          <div class="pbg-timer-block"><div class="pbg-timer-num">${String(hrs).padStart(2,'0')}</div><div class="pbg-timer-lbl">H</div></div>
          <span class="pbg-timer-sep">:</span>
          <div class="pbg-timer-block"><div class="pbg-timer-num">${String(mins).padStart(2,'0')}</div><div class="pbg-timer-lbl">M</div></div>
          <span class="pbg-timer-sep">:</span>
          <div class="pbg-timer-block"><div class="pbg-timer-num">${String(secs).padStart(2,'0')}</div><div class="pbg-timer-lbl">S</div></div>
        </div>
      `;
    }

    return `
      <div class="pbg-wheel-container">
        <div class="pbg-wheel-title-banner">ROLETA DIÁRIA</div>
        ${spinResult && !isSpinning ? (spinResult.error
          ? `<div class="pbg-modal-error" style="margin:0 0 8px">${spinResult.error}</div>`
          : `<div class="pbg-spin-result">
              <div style="font-size:12px;color:#a1a1aa">${inlIcon('party',14)} Você ganhou!</div>
              <div class="pbg-spin-result-prize">${spinResult.type === 'nothing' ? inlIcon('sad',14)+' Tente de novo!' : spinResult.label}</div>
            </div>`
        ) : ''}
        <div class="pbg-wheel-stage">
          <div class="pbg-wheel-ring-outer"></div>
          <div class="pbg-wheel-bulbs ${isSpinning ? 'spin' : ''}" id="pbg-wheel-bulbs">${bulbsHtml}</div>
          <div class="pbg-wheel-ring-inner"></div>
          <div class="pbg-wheel-flap">${flapSvg}</div>
          <svg viewBox="0 0 ${size} ${size}" class="pbg-wheel-svg" id="pbg-wheel-canvas">${svg}</svg>
          <div class="pbg-wheel-hub ${btnDisabled ? 'off' : ''}" onclick="${btnDisabled ? '' : "window.__pbg('spin')"}">${hubContent}</div>
        </div>
        ${timerHtml}
        ${!isFree && cfg.spin_cost_coins > 0 && !maxReached && !isSpinning ? `<div class="pbg-spin-cost-badge" style="margin-top:8px">${inlIcon('coin',12)} Próximo giro: ${cfg.spin_cost_coins} moedas</div>` : ''}
        <div class="pbg-spin-info">
          <span class="pbg-spin-tag" style="color:${freeLeft > 0 ? '#34d399' : '#f87171'}">${inlIcon('ticket',12)} Grátis: ${freeLeft}/${cfg.free_spins_per_day || 1}</span>
          ${cfg.max_spins_per_day > 0 ? `<span class="pbg-spin-tag" style="color:${maxReached ? '#f87171' : '#a1a1aa'}">${inlIcon('dice',12)} ${spinsUsed}/${cfg.max_spins_per_day}</span>` : ''}
          ${coins > 0 ? `<span class="pbg-spin-tag" style="color:#fbbf24">${inlIcon('coin',12)} ${coins}</span>` : ''}
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

    if (!games.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.gamepad}</div><div style="font-size:13px">Nenhum jogo disponível</div></div>`;

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
      const typeIcons = { scratch_card: inlIcon('card',20), gift_box: inlIcon('giftbox',20), prize_drop: inlIcon('target',20) };
      const typeLabels = { scratch_card: 'Raspadinha', gift_box: 'Caixa Surpresa', prize_drop: 'Prize Drop' };

      let html = `
        <button onclick="window.__pbg('closeMiniGame')" style="background:none;border:none;color:#a1a1aa;font-size:13px;cursor:pointer;font-family:inherit;padding:0;margin-bottom:10px">← Voltar</button>
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:36px;margin-bottom:6px">${typeIcons[game.type] || inlIcon('gamepad',36)}</div>
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
                  <div style="font-size:20px">${ICONS.sparkle}</div>
                  <div style="font-size:9px;color:#a1a1aa;margin-top:2px">Raspe</div>
                </div>
                <div class="pbg-scratch-inner ${revealed ? (isWin ? 'win' : 'lose') : ''}">
                  <div style="font-size:16px">${cell.prize?.icon || (isWin ? inlIcon('star',16) : inlIcon('x',16))}</div>
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
                <div style="font-size:24px;margin-bottom:6px">${won ? inlIcon('party',24) : inlIcon('sad',24)}</div>
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
                  <div class="pbg-gift-icon" style="width:32px;height:32px;color:#a78bfa">${ICONS.giftbox}</div>
                  <div class="pbg-gift-label">Abrir</div>
                ` : opened ? `
                  <div style="font-size:24px;margin-bottom:4px">${isWin ? (box.prize?.icon || inlIcon('party',24)) : inlIcon('wind',24)}</div>
                  <div style="font-size:10px;font-weight:700;color:${isWin ? '#34d399' : '#71717a'}">${box.prize?.label || (isWin ? 'Prêmio!' : 'Vazio')}</div>
                ` : `
                  <div class="pbg-gift-icon" style="opacity:0.3;width:32px;height:32px;color:#a78bfa">${ICONS.giftbox}</div>
                `}
              </div>
            `;
          });
          html += `</div>`;

          if (giftBoxOpened !== null) {
            const box = boxes[giftBoxOpened];
            html += `
              <div style="text-align:center;margin-top:16px;padding:16px;background:${box.winning ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)'};border:1px solid ${box.winning ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:12px">
                <div style="font-size:24px;margin-bottom:6px">${box.winning ? inlIcon('party',24) : inlIcon('sad',24)}</div>
                <div style="font-size:14px;font-weight:700;color:${box.winning ? '#34d399' : '#a1a1aa'}">${box.winning ? `Você ganhou: ${miniGameResult.prize?.label}!` : 'Tente novamente!'}</div>
              </div>
            `;
          }
        }

        // Prize Drop
        if (game.type === 'prize_drop') {
          html += `
            <div style="text-align:center;padding:24px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
              <div style="font-size:48px;margin-bottom:12px;animation:pbg-bounce 0.5s ease">${miniGameResult.prize?.type === 'nothing' ? inlIcon('wind',48) : (miniGameResult.prize?.icon || inlIcon('gift',48))}</div>
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
              ${maxReached ? 'Limite atingido' : inlIcon('refresh',14)+' Jogar Novamente'}
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
              ${!PLAYER_CPF ? 'Faça login' : maxReached ? 'Limite atingido' : `${typeIcons[game.type] || inlIcon('gamepad',14)} Jogar`}
            </button>
            ${!isFree && game.attempt_cost_coins > 0 && !maxReached ? `<div style="font-size:11px;color:#fbbf24;margin-top:8px">${inlIcon('coin',12)} Custo: ${game.attempt_cost_coins} moedas</div>` : ''}
          </div>
        `;
      } else {
        // Loading / playing
        html += `<div style="text-align:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div><div style="font-size:12px;color:#71717a;margin-top:12px">Jogando...</div></div>`;
      }

      // Attempts info
      html += `
        <div style="display:flex;justify-content:center;gap:12px;margin-top:12px">
          <span class="pbg-spin-tag" style="color:${isFree ? '#34d399' : '#f87171'}">${inlIcon('ticket',12)} Grátis: ${Math.max(0, freeAtt - attToday)}/${freeAtt}</span>
          ${maxAtt > 0 ? `<span class="pbg-spin-tag" style="color:${maxReached ? '#f87171' : '#a1a1aa'}">${inlIcon('dice',12)} ${attToday}/${maxAtt}</span>` : ''}
          ${coins > 0 ? `<span class="pbg-spin-tag" style="color:#fbbf24">${inlIcon('coin',12)} ${coins}</span>` : ''}
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
      const typeIcons = { scratch_card: inlIcon('card',20), gift_box: inlIcon('giftbox',20), prize_drop: inlIcon('target',20) };
      const typeLabels = { scratch_card: 'Raspadinha', gift_box: 'Caixa Surpresa', prize_drop: 'Prize Drop' };

      html += `
        <div class="pbg-mg-card ${maxReached ? 'greyed' : ''}" onclick="window.__pbg('openMiniGame','${game.id}')">
          <div class="pbg-mg-icon">${typeIcons[game.type] || inlIcon('gamepad',36)}</div>
          <div class="pbg-mg-name">${game.name}</div>
          <div class="pbg-mg-type">${typeLabels[game.type] || game.type}</div>
          <div class="pbg-mg-attempts" style="color:${maxReached ? '#f87171' : freeLeft > 0 ? '#34d399' : '#a1a1aa'}">
            ${maxReached ? 'Limite atingido' : freeLeft > 0 ? inlIcon('ticket',12)+` ${freeLeft} grátis` : inlIcon('coin',12)+` ${game.attempt_cost_coins || 0} moedas`}
          </div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  function renderStore() {
    const items = data?.store_items || [];
    if (!items.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.cart}</div><div style="font-size:13px">Loja vazia</div></div>`;

    const coins = data?.wallet?.coins || 0;
    const walletDiamonds = data?.wallet?.diamonds || 0;
    let html = `<div class="pbg-store-grid">${items.map((item, idx) => {
      const canAffordCoins = !item.price_coins || coins >= item.price_coins;
      const canAffordDiamonds = !item.price_diamonds || walletDiamonds >= item.price_diamonds;
      const canBuy = canAffordCoins && canAffordDiamonds;
      const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
      return `
        <div class="pbg-store-item ${!canBuy || outOfStock ? 'greyed' : ''}" onclick="window.__pbg('openStore',${idx})">
          ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : '<div style="width:32px;height:32px;margin:0 auto 8px;color:#a78bfa">' + ICONS.giftbox + '</div>'}
          <div style="font-size:12px;font-weight:600;color:#fff">${item.name}</div>
          <div style="font-size:11px;font-weight:600;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap">
            ${item.price_coins ? `<span style="color:#fbbf24">${inlIcon('coin',12)} ${item.price_coins}</span>` : ''}
            ${item.price_diamonds ? `<span style="color:#22d3ee">${inlIcon('diamond',12)} ${item.price_diamonds}</span>` : ''}
            ${item.price_xp ? `<span style="color:#818cf8">${inlIcon('star',12)} ${item.price_xp}</span>` : ''}
          </div>
          ${outOfStock ? '<div style="font-size:10px;color:#f87171;margin-top:2px">Esgotado</div>' : ''}
          ${!canAffordCoins && !outOfStock ? `<div style="font-size:10px;color:#f87171;margin-top:2px">Faltam ${item.price_coins - coins} moedas</div>` : ''}
          ${!canAffordDiamonds && canAffordCoins && !outOfStock ? `<div style="font-size:10px;color:#f87171;margin-top:2px">Faltam ${item.price_diamonds - walletDiamonds} diamantes</div>` : ''}
        </div>
      `;
    }).join('')}</div>`;

    if (selectedStoreItem !== null) {
      const item = items[selectedStoreItem];
      if (item) {
        const canAffordCoins = !item.price_coins || coins >= item.price_coins;
        const canAffordDiamonds = !item.price_diamonds || walletDiamonds >= item.price_diamonds;
        const canBuy = canAffordCoins && canAffordDiamonds;
        const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
        const insufficientMsg = !canAffordCoins ? 'Moedas insuficientes' : !canAffordDiamonds ? 'Diamantes insuficientes' : '';
        html += `
          <div class="pbg-modal-overlay" onclick="window.__pbg('closeStore')">
            <div class="pbg-modal" onclick="event.stopPropagation()">
              ${item.image_url ? `<img src="${item.image_url}" style="width:80px;height:80px;object-fit:contain;border-radius:12px;margin:0 auto 12px">` : '<div style="width:48px;height:48px;margin:0 auto 12px;color:#a78bfa">' + ICONS.giftbox + '</div>'}
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px">${item.name}</div>
              ${item.description ? `<div style="font-size:12px;color:#a1a1aa;margin-bottom:12px;line-height:1.5">${item.description}</div>` : ''}
              ${item.reward_description || item.reward_value ? `
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;text-align:left">
                  <div style="font-size:11px;font-weight:700;color:#34d399;margin-bottom:4px">${inlIcon('gift',12)} Você recebe</div>
                  ${item.reward_value ? `<div style="font-size:14px;font-weight:700;color:#fff">${item.reward_value}</div>` : ''}
                  ${item.reward_description ? `<div style="font-size:11px;color:#a1a1aa;margin-top:2px">${item.reward_description}</div>` : ''}
                </div>
              ` : ''}
              <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:12px">
                ${item.price_coins ? `<span style="font-size:14px;font-weight:700;color:#fbbf24">${inlIcon('coin',14)} ${item.price_coins}</span>` : ''}
                ${item.price_diamonds ? `<span style="font-size:14px;font-weight:700;color:#22d3ee">${inlIcon('diamond',14)} ${item.price_diamonds}</span>` : ''}
                ${item.price_xp ? `<span style="font-size:14px;font-weight:700;color:#818cf8">${inlIcon('star',14)} ${item.price_xp}</span>` : ''}
              </div>
              ${item.stock !== null && item.stock !== undefined ? `<div style="font-size:11px;color:#71717a;margin-bottom:12px">${item.stock} em estoque</div>` : ''}
              ${storeMessage ? `<div class="${storeMessage.type === 'success' ? 'pbg-modal-success' : 'pbg-modal-error'}">${storeMessage.text}</div>` : ''}
              ${!storeMessage || storeMessage.type !== 'success' ? `
                <button class="pbg-modal-btn" ${!canBuy || outOfStock || !PLAYER_CPF ? 'disabled' : ''} onclick="window.__pbg('buyItem','${item.id}')">
                  ${outOfStock ? 'Esgotado' : !PLAYER_CPF ? 'Faça login' : !canBuy ? insufficientMsg : inlIcon('cart',14)+' Comprar'}
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
    if (!PLAYER_CPF) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.clipboard}</div><div style="font-size:13px">Faça login para ver seu histórico</div></div>`;
    const log = data?.activity_log || [];
    if (!log.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.clipboard}</div><div style="font-size:13px">Nenhuma atividade registrada</div></div>`;

    const icons = { coins:inlIcon('coin',14), xp:inlIcon('star',14), diamonds:inlIcon('diamond',14), spin:inlIcon('wheel',14), wheel:inlIcon('wheel',14), bonus:inlIcon('money',14), store:inlIcon('cart',14), level_up:inlIcon('medal',14), mission:inlIcon('target',14), achievement:inlIcon('trophy',14), tournament:inlIcon('swords',14) };
    return `
      <div class="pbg-section-title">${inlIcon('clipboard',14)} Atividades Recentes</div>
      ${log.map(entry => `
        <div class="pbg-log-item">
          <div>
            <div class="pbg-log-desc">${icons[entry.type]||inlIcon('pin',14)} ${entry.description || entry.source}</div>
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
    if (!levels.length) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.medal}</div><div style="font-size:13px">Níveis não configurados</div></div>`;

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
      <div class="pbg-section-title">${inlIcon('map',14)} Mapa de Níveis</div>
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

  // ---- USERNAME FROM DOM ----
  function getPlayerUsername() {
    const nomeEl = document.querySelector('#nome');
    if (nomeEl && nomeEl.textContent.trim()) return nomeEl.textContent.trim().toUpperCase();
    const usernameInput = document.querySelector('#username');
    if (usernameInput && usernameInput.value.trim()) return usernameInput.value.trim().toUpperCase();
    if (PLAYER_CPF) return PLAYER_CPF;
    return 'Jogador';
  }

  // ---- HEADER RENDER ----
  function renderHeader() {
    const avatarEl = document.getElementById('pbg-avatar');
    const usernameEl = document.getElementById('pbg-username');
    const levelRowEl = document.getElementById('pbg-level-row');
    const xpTrackEl = document.getElementById('pbg-xp-track');
    const xpFillEl = document.getElementById('pbg-xp-fill');
    const nextLvlEl = document.getElementById('pbg-next-lvl-txt');
    const countersEl = document.getElementById('pbg-counters-row');
    if (!avatarEl) return;

    const username = getPlayerUsername();
    const initial = username.charAt(0).toUpperCase();
    if (usernameEl) usernameEl.textContent = username;
    if (avatarEl) avatarEl.innerHTML = initial;

    const fmt1k = n => n >= 1000 ? (n/1000).toFixed(1).replace('.',',')+'k' : n.toLocaleString('pt-BR');
    const lvInfo = getLevelInfo();

    if (lvInfo) {
      const col = lvInfo.current.color || '#8b5cf6';
      if (levelRowEl) levelRowEl.innerHTML = `
        ${lvInfo.current.icon_url
          ? `<img class="pbg-level-img" src="${lvInfo.current.icon_url}" style="filter:drop-shadow(0 1px 4px ${col}99)">`
          : `<div style="width:22px;height:22px;border-radius:6px;background:${col}33;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${col}">${lvInfo.current.level_number}</div>`}
        <span class="pbg-level-name-lbl">${lvInfo.current.name}</span>
      `;
      if (xpTrackEl) { xpTrackEl.style.display = 'block'; }
      if (xpFillEl) { xpFillEl.style.width = lvInfo.pct + '%'; xpFillEl.style.background = `linear-gradient(90deg,${col}cc,${col})`; }
      if (nextLvlEl) nextLvlEl.innerHTML = lvInfo.next
        ? `0 / ${lvInfo.xpForNext.toLocaleString('pt-BR')} · Próximo nível é <span>${lvInfo.next.name}</span>`
        : `<span>Nível máximo!</span>`;
    } else {
      if (levelRowEl) levelRowEl.innerHTML = `<div style="font-size:11px;color:#52525b">Sem nível configurado</div>`;
      if (xpTrackEl) xpTrackEl.style.display = 'none';
      if (nextLvlEl) nextLvlEl.textContent = '';
    }

    if (countersEl && data?.wallet) {
      const coins = data.wallet.coins || 0;
      const diamonds = data.wallet.diamonds || 0;
      const xp = data.wallet.xp || 0;
      countersEl.innerHTML = `
        <div class="pbg-counter-chip">
          <div style="color:#fbbf24;flex-shrink:0">${inlIcon('coin',18)}</div>
          <div><div class="pbg-counter-val">${fmt1k(coins)}</div><div class="pbg-counter-lbl">Moedas</div></div>
        </div>
        <div class="pbg-counter-chip">
          <div style="color:#22d3ee;flex-shrink:0">${inlIcon('diamond',18)}</div>
          <div><div class="pbg-counter-val">${fmt1k(diamonds)}</div><div class="pbg-counter-lbl">Diamantes</div></div>
        </div>
        <div class="pbg-counter-chip">
          <div style="color:#818cf8;flex-shrink:0">${inlIcon('star',18)}</div>
          <div><div class="pbg-counter-val">${fmt1k(xp)}</div><div class="pbg-counter-lbl">XP</div></div>
        </div>
      `;
    }
  }

  // ---- MAIN RENDER ----
  function renderContent() {
    const el = document.getElementById('pbg-widget-content');
    if (!el) return;
    if (!data) { el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'; return; }

    const renderers = { missions: renderMissions, achievements: renderAchievements, tournaments: renderTournaments, wheel: renderWheel, games: renderMiniGames, store: renderStore, history: renderHistory, levels: renderLevels };
    el.innerHTML = (renderers[activeTab] || renderMissions)();
    el.classList.toggle('pbg-no-pad', activeTab === 'wheel');
    el.scrollTop = 0;

    // Update nav tabs
    document.querySelectorAll('.pbg-nav-item').forEach(item => item.classList.toggle('active', item.dataset.tab === activeTab));

    // Update smartico header
    renderHeader();

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
      <div class="pbg-smartico-header" id="pbg-smartico-header">
        <button class="pbg-close" onclick="window.__pbg('toggle',false)">&times;</button>
        <div class="pbg-header-top">
          <div class="pbg-avatar" id="pbg-avatar"></div>
          <div class="pbg-user-info">
            <div class="pbg-username" id="pbg-username">Jogador</div>
            <div class="pbg-level-row" id="pbg-level-row"><div style="font-size:11px;color:#52525b">Carregando...</div></div>
            <div class="pbg-xp-track" id="pbg-xp-track" style="display:none"><div class="pbg-xp-fill" id="pbg-xp-fill" style="width:0%"></div></div>
            <div class="pbg-next-lvl-txt" id="pbg-next-lvl-txt"></div>
          </div>
        </div>
        <div class="pbg-counters-row" id="pbg-counters-row"></div>
      </div>
      <div class="pbg-smartico-nav">
        <div class="pbg-nav-item active" data-tab="missions" onclick="window.__pbg('tab','missions')">
          <div class="pbg-nav-icon">${inlIcon('target',20)}</div><span class="pbg-nav-lbl">Missões</span>
        </div>
        <div class="pbg-nav-item" data-tab="achievements" onclick="window.__pbg('tab','achievements')">
          <div class="pbg-nav-icon">${inlIcon('trophy',20)}</div><span class="pbg-nav-lbl">Conquistas</span>
        </div>
        <div class="pbg-nav-item" data-tab="tournaments" onclick="window.__pbg('tab','tournaments')">
          <div class="pbg-nav-icon">${inlIcon('swords',20)}</div><span class="pbg-nav-lbl">Torneios</span>
        </div>
        <div class="pbg-nav-item" data-tab="wheel" onclick="window.__pbg('tab','wheel')">
          <div class="pbg-nav-icon">${inlIcon('wheel',20)}</div><span class="pbg-nav-lbl">Roleta</span>
        </div>
        <div class="pbg-nav-item" data-tab="games" onclick="window.__pbg('tab','games')">
          <div class="pbg-nav-icon">${inlIcon('gamepad',20)}</div><span class="pbg-nav-lbl">Jogos</span>
        </div>
        <div class="pbg-nav-item" data-tab="store" onclick="window.__pbg('tab','store')">
          <div class="pbg-nav-icon">${inlIcon('cart',20)}</div><span class="pbg-nav-lbl">Loja</span>
        </div>
        <div class="pbg-nav-item" data-tab="levels" onclick="window.__pbg('tab','levels')">
          <div class="pbg-nav-icon">${inlIcon('medal',20)}</div><span class="pbg-nav-lbl">Níveis</span>
        </div>
        <div class="pbg-nav-item" data-tab="history" onclick="window.__pbg('tab','history')">
          <div class="pbg-nav-icon">${inlIcon('clipboard',20)}</div><span class="pbg-nav-lbl">Histórico</span>
          <span id="pbg-pending-badge" class="pbg-nav-badge" style="display:none">0</span>
        </div>
      </div>
      <div class="pbg-content" id="pbg-widget-content"></div>
    `;
    document.body.appendChild(panel);

    const fab = document.createElement('button');
    fab.id = 'pbg-widget-fab';
    fab.onclick = () => toggle(!isOpen);
    fab.title = 'Recompensas';
    updateFab(fab);
    document.body.appendChild(fab);

    // Pre-fetch data so FAB shows level ring immediately
    if (PLAYER_CPF && !data) fetchData();

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
          else {
            const msg = result.message || `${result.item_name} resgatado com sucesso!`;
            const isOk = result.delivery_status === 'delivered' || result.delivery_status === 'pending_manual';
            storeMessage = { type: isOk ? 'success' : 'warning', text: `${inlIcon(isOk ? 'check' : 'clock',14)} ${msg}` };
            setTimeout(() => fetchData(), 1000);
          }
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

  function updateFab(fabEl) {
    if (!fabEl) fabEl = document.getElementById('pbg-widget-fab');
    if (!fabEl) return;

    const lvInfo = data ? getLevelInfo() : null;
    const wallet = data?.wallet;
    const circumference = Math.PI * 2 * 30; // r=30
    let pct = 0;
    let levelNum = '';
    let color = '#8b5cf6';
    let coins = 0;
    let diamondsVal = 0;

    if (lvInfo) {
      pct = lvInfo.pct;
      levelNum = lvInfo.current.level_number;
      color = lvInfo.current.color || '#8b5cf6';
      coins = wallet?.coins || 0;
      diamondsVal = wallet?.diamonds || 0;
    } else if (wallet) {
      levelNum = wallet.level || 1;
      coins = wallet.coins || 0;
      diamondsVal = wallet.diamonds || 0;
    }

    const offset = circumference - (pct / 100) * circumference;
    const hasLevel = levelNum !== '';

    fabEl.innerHTML = `
      <div class="pbg-fab-ring">
        <svg viewBox="0 0 68 68">
          <defs><linearGradient id="pbg-fab-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color}"/>
            <stop offset="100%" style="stop-color:#06b6d4"/>
          </linearGradient></defs>
          <circle class="ring-bg" cx="34" cy="34" r="30"/>
          <circle class="ring-fg" cx="34" cy="34" r="30" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
        </svg>
      </div>
      <div class="pbg-fab-inner">
        ${ICONS.gift}
      </div>
      ${coins > 0 ? `<span class="pbg-fab-coins">${inlIcon('coin',10)} ${coins >= 1000 ? (coins/1000).toFixed(1)+'k' : coins}</span>` : ''}
      ${diamondsVal > 0 ? `<span class="pbg-fab-diamonds">${inlIcon('diamond',10)} ${diamondsVal >= 1000 ? (diamondsVal/1000).toFixed(1)+'k' : diamondsVal}</span>` : ''}
    `;
  }

  function toggle(state) {
    isOpen = state;
    const panel = document.getElementById('pbg-widget-panel');
    const backdrop = document.getElementById('pbg-widget-backdrop');
    const fab = document.getElementById('pbg-widget-fab');
    if (panel) panel.classList.toggle('open', isOpen);
    if (backdrop) backdrop.classList.toggle('open', isOpen);
    if (fab) { if (isOpen) { fab.style.setProperty('display', 'none', 'important'); } else { fab.style.removeProperty('display'); } }
    if (isOpen && !data) fetchData();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
