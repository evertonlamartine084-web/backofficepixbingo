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

  // Read config from: 1) data-* attributes on script tag, 2) window.__pbgConfig (set by GTM before script loads), 3) URL params on script src
  const scriptSrc = currentScript?.getAttribute('src') || '';
  const srcParams = new URLSearchParams(scriptSrc.split('?')[1] || '');
  const cfg = window.__pbgConfig || {};

  const SEGMENT_ID = currentScript?.getAttribute('data-segment') || cfg.segment || srcParams.get('segment') || null;
  const REQUIRE_LOGIN = currentScript?.getAttribute('data-require-login') || cfg.requireLogin || srcParams.get('require-login') || null;
  const AUTH_SELECTOR = currentScript?.getAttribute('data-auth-selector') || cfg.authSelector || srcParams.get('auth-selector') || null;

  // Capture referral code from URL and persist to localStorage
  // Platform uses: /registrar/CODE (path-based) and saves as 'codigo_indicacao'
  // Widget also supports: ?ref=CODE (query-based)
  try {
    const pageUrl = new URL(window.location.href);
    const refParam = pageUrl.searchParams.get('ref');
    if (refParam) {
      localStorage.setItem('codigo_indicacao', refParam);
      localStorage.setItem('__pbr_ref_code', refParam);
    }
    // Also capture from path: /registrar/CODE or /CODE
    const pathParts = pageUrl.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && pathParts[0] === 'registrar' && /^[A-Za-z0-9]+$/.test(pathParts[1])) {
      localStorage.setItem('__pbr_ref_code', pathParts[1]);
    }
  } catch (e) {}

  // CPF: 1) data-player attribute, 2) localStorage __pbr_cpf, 3) auto-detect from page
  function getPlayerCpf() {
    const attr = currentScript ? currentScript.getAttribute('data-player') : null;
    if (attr) return attr;
    try { const ls = localStorage.getItem('__pbr_cpf'); if (ls) return ls; } catch {}
    return null;
  }
  let PLAYER_CPF = getPlayerCpf();

  // Auto-detect player CPF from platform if not set
  async function autoDetectCpf() {
    if (PLAYER_CPF) return;
    try {
      // 1) Try data-cpf attribute on any element
      const cpfEl = document.querySelector('[data-cpf]');
      if (cpfEl) {
        const cpf = cpfEl.getAttribute('data-cpf').replace(/\D/g, '');
        if (cpf.length === 11) { PLAYER_CPF = cpf; localStorage.setItem('__pbr_cpf', cpf); return; }
      }
      // 2) Try window vars set by platform
      if (window.cpf_usuario) {
        const cpf = String(window.cpf_usuario).replace(/\D/g, '');
        if (cpf.length === 11) { PLAYER_CPF = cpf; localStorage.setItem('__pbr_cpf', cpf); return; }
      }
      // 3) Try platform's /api/wallet/saldo to check if logged in and get CPF
      if (document.querySelector('.menu-saldo-body') || document.querySelector('.desc-saldo')) {
        const res = await fetch('/api/wallet/saldo', { credentials: 'same-origin' });
        const d = await res.json();
        if (d.logged && d.cpf) {
          const cpf = String(d.cpf).replace(/\D/g, '');
          if (cpf.length === 11) { PLAYER_CPF = cpf; localStorage.setItem('__pbr_cpf', cpf); return; }
        }
        // If API returns logged but no cpf, try /api/perfil or similar
        if (d.logged && !d.cpf) {
          try {
            const pRes = await fetch('/api/perfil', { credentials: 'same-origin' });
            const pData = await pRes.json();
            const cpf = String(pData.cpf || pData.documento || '').replace(/\D/g, '');
            if (cpf.length === 11) { PLAYER_CPF = cpf; localStorage.setItem('__pbr_cpf', cpf); return; }
          } catch (e2) {}
        }
      }
    } catch (e) {}
  }
  // Run CPF detection after a short delay to let the page load
  setTimeout(() => { autoDetectCpf().then(() => { if (PLAYER_CPF && !data) fetchData(); }); }, 2000);

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
  let selectedLevel = null;

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
    .pbg-level-name-lbl { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.85); font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.5px; }
    .pbg-xp-track { height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 3px; }
    .pbg-xp-fill { height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(.4,0,.2,1); }
    .pbg-next-lvl-txt { font-size: 10px; color: #71717a; }
    .pbg-next-lvl-txt span { color: #a78bfa; font-weight: 700; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.5px; }
    .pbg-close {
      position: absolute; top: 12px; right: 12px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: #a1a1aa; width: 28px; height: 28px; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 16px; transition: all 0.2s; font-family: inherit; padding: 0;
    }
    .pbg-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .pbg-counters-wrapper { position: relative; }
    .pbg-counters-row {
      display: flex; align-items: center; gap: 0;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 6px 10px; position: relative;
      cursor: pointer; user-select: none; transition: border-color 0.2s;
    }
    .pbg-counters-row:hover { border-color: rgba(139,92,246,0.3); }
    .pbg-counters-row .pbg-counters-arrow {
      width: 12px; height: 12px; flex-shrink: 0; margin-left: 4px; color: #64748b; transition: transform 0.2s;
    }
    .pbg-counters-row.open .pbg-counters-arrow { transform: rotate(180deg); }
    .pbg-counter-chip {
      flex: 1; display: flex; align-items: center; gap: 5px;
      justify-content: center; padding: 4px 6px;
    }
    .pbg-counter-chip + .pbg-counter-chip { border-left: 1px solid rgba(255,255,255,0.08); }
    .pbg-counter-val { font-size: 13px; font-weight: 800; line-height: 1; }
    .pbg-counter-lbl { font-size: 8px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }
    .pbg-counter-coin-icon { width: 22px; height: 22px; flex-shrink: 0; }
    .pbg-counter-diamond-icon { width: 18px; height: 22px; flex-shrink: 0; }
    .pbg-counter-gem-icon { width: 22px; height: 22px; flex-shrink: 0; }
    .pbg-wallet-dropdown {
      position: absolute; top: calc(100% + 6px); left: 0; right: 0;
      background: #1e293b; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; padding: 8px 0; z-index: 20;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: none; animation: pbg-fade-in 0.15s ease;
    }
    .pbg-wallet-dropdown.open { display: block; }
    .pbg-wallet-dd-item {
      display: flex; align-items: center; gap: 12px; padding: 10px 16px;
      transition: background 0.15s;
    }
    .pbg-wallet-dd-item:hover { background: rgba(255,255,255,0.04); }
    .pbg-wallet-dd-item + .pbg-wallet-dd-item { border-top: 1px solid rgba(255,255,255,0.06); }
    .pbg-wallet-dd-icon { width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .pbg-wallet-dd-info { flex: 1; }
    .pbg-wallet-dd-val { font-size: 15px; font-weight: 800; color: #fff; }
    .pbg-wallet-dd-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

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

    /* Mission Reference Style */
    .pbg-m-section-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; margin-top: 4px;
    }
    .pbg-m-section-header:first-child { margin-top: 0; }
    .pbg-m-section-left { display: flex; align-items: center; gap: 8px; }
    .pbg-m-section-icon { color: #a1a1aa; display: flex; align-items: center; }
    .pbg-m-section-title { font-size: 15px; font-weight: 800; color: #fff; }
    .pbg-m-section-more {
      font-size: 10px; font-weight: 700; color: #8b5cf6; cursor: pointer; text-transform: uppercase;
      letter-spacing: 0.05em; background: none; border: none; font-family: inherit; padding: 4px 8px;
    }
    .pbg-m-section-more:hover { color: #a78bfa; }
    .pbg-m-scroll {
      display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch; margin: 0 -16px; padding-left: 16px; padding-right: 16px;
    }
    .pbg-m-scroll::-webkit-scrollbar { height: 3px; }
    .pbg-m-scroll::-webkit-scrollbar-track { background: transparent; }
    .pbg-m-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    /* Available mission card */
    .pbg-m-avail-card {
      flex: 0 0 185px; min-width: 185px; scroll-snap-align: start;
      background: linear-gradient(180deg, #141a30 0%, #0e1228 100%);
      border: 1px solid rgba(60,80,140,0.3); border-radius: 12px; overflow: hidden;
      transition: all 0.2s; position: relative;
    }
    .pbg-m-avail-card:hover { border-color: rgba(80,100,180,0.5); transform: translateY(-2px); }
    .pbg-m-day-label {
      font-size: 8px; font-weight: 800; color: rgba(255,255,255,0.5); text-transform: uppercase;
      letter-spacing: 0.1em; padding: 8px 12px 0; text-align: center;
    }
    .pbg-m-avail-img {
      width: 100%; height: 90px; object-fit: cover; display: block;
    }
    .pbg-m-avail-img-wrap {
      width: 100%; height: 90px; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(180deg, rgba(30,35,60,0.5) 0%, transparent 100%);
      overflow: hidden; position: relative;
    }
    .pbg-m-avail-body { padding: 10px 12px 12px; }
    .pbg-m-avail-name {
      font-size: 12px; font-weight: 800; color: #fff; margin: 0 0 2px;
      text-transform: uppercase; line-height: 1.2;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .pbg-m-avail-desc {
      font-size: 9px; color: rgba(255,255,255,0.45); margin: 0 0 8px; line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .pbg-m-avail-prize {
      display: flex; align-items: center; gap: 5px; margin-bottom: 10px;
      padding: 5px 8px; background: rgba(245,158,11,0.12); border-radius: 8px;
    }
    .pbg-m-avail-prize-icon { display: flex; align-items: center; color: #f59e0b; flex-shrink: 0; }
    .pbg-m-avail-prize-text { font-size: 10px; font-weight: 700; color: #fbbf24; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pbg-m-avail-btns { display: flex; gap: 6px; margin-bottom: 8px; }
    .pbg-m-btn-participar {
      flex: 1; padding: 6px 0; border-radius: 8px; font-size: 10px; font-weight: 700;
      background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none;
      cursor: pointer; font-family: inherit; text-align: center; transition: all 0.2s;
    }
    .pbg-m-btn-participar:hover { filter: brightness(1.15); }
    .pbg-m-btn-regras {
      padding: 6px 10px; border-radius: 8px; font-size: 10px; font-weight: 600;
      background: transparent; color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.15);
      cursor: pointer; font-family: inherit; transition: all 0.2s;
    }
    .pbg-m-btn-regras:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
    .pbg-m-avail-games {
      font-size: 9px; color: rgba(255,255,255,0.35); cursor: pointer; display: flex; align-items: center; gap: 4px;
    }
    .pbg-m-avail-games:hover { color: rgba(255,255,255,0.6); }
    /* Participating mission card - reference layout */
    .pbg-m-part-card {
      flex: 0 0 260px; min-width: 260px; scroll-snap-align: start;
      background: linear-gradient(180deg, #1a2444 0%, #151d3a 50%, #111832 100%);
      border: 1px solid rgba(60,90,180,0.35); border-radius: 14px; overflow: hidden;
      transition: all 0.2s; position: relative; cursor: pointer;
    }
    .pbg-m-part-card:hover { border-color: rgba(80,120,220,0.5); transform: translateY(-2px); }
    .pbg-m-badge-emalta {
      display: block; text-align: center; margin: 0; padding: 10px 12px 6px;
    }
    .pbg-m-badge-emalta span {
      display: inline-block; padding: 4px 20px; border-radius: 6px; font-size: 9px; font-weight: 800;
      background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); text-transform: uppercase;
      letter-spacing: 0.06em; border: 1px solid rgba(255,255,255,0.08);
    }
    .pbg-m-part-top {
      display: flex; align-items: flex-start; gap: 10px; padding: 0 12px 8px;
    }
    .pbg-m-part-img-wrap {
      width: 72px; height: 72px; flex-shrink: 0; border-radius: 10px; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    .pbg-m-part-img-wrap img {
      width: 100%; height: 100%; object-fit: contain;
    }
    .pbg-m-part-info { flex: 1; min-width: 0; }
    .pbg-m-part-name {
      font-size: 14px; font-weight: 900; color: #fff; margin: 0 0 4px; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3;
    }
    .pbg-m-part-desc {
      font-size: 10px; color: rgba(255,255,255,0.45); margin: 0; line-height: 1.4;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    }
    .pbg-m-part-duration {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      padding: 6px 12px; background: rgba(0,0,0,0.3); margin: 0;
    }
    .pbg-m-part-duration-label {
      font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.05em;
    }
    .pbg-m-part-duration-time {
      display: flex; align-items: center; gap: 5px;
    }
    .pbg-m-part-duration-time svg { flex-shrink: 0; }
    .pbg-m-part-duration-time span { color: #fff; font-weight: 800; font-size: 13px; }
    .pbg-m-part-prize-row {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 8px 12px; background: rgba(40,60,120,0.25);
    }
    .pbg-m-part-prize-text { font-size: 13px; font-weight: 800; color: #fff; }
    .pbg-m-part-progress-wrap { padding: 8px 10px 4px; }
    .pbg-m-part-progress-inner {
      display: flex; align-items: center; gap: 6px;
    }
    .pbg-m-part-progress-icon { flex-shrink: 0; display: flex; align-items: center; }
    .pbg-m-part-progress-bar-wrap { flex: 1; position: relative; }
    .pbg-m-part-progress-bar {
      height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;
    }
    .pbg-m-part-progress-fill {
      height: 100%; border-radius: 3px; background: rgb(0, 201, 255);
      transition: width 0.5s ease; min-width: 2px;
    }
    .pbg-m-part-progress-pct {
      display: block; text-align: center; font-size: 11px; font-weight: 800;
      color: rgba(255,255,255,0.6); margin-top: 4px;
    }
    .pbg-m-part-games {
      display: flex; align-items: center; gap: 6px; padding: 6px 12px 10px;
      font-size: 10px; color: rgba(255,255,255,0.35); cursor: pointer;
    }
    .pbg-m-part-games:hover { color: rgba(255,255,255,0.6); }
    .pbg-m-part-games-thumb {
      width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);
    }
    .pbg-m-claim-btn {
      width: calc(100% - 24px); margin: 0 12px 8px; padding: 7px 0; border-radius: 8px; font-size: 11px; font-weight: 700;
      background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none;
      cursor: pointer; font-family: inherit; animation: pbg-pulse-green 1.5s infinite;
    }
    @keyframes pbg-pulse-green { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0)} }

    /* Detail view */
    .pbg-m-detail { animation: pbg-fade-in 0.2s ease; padding: 12px 0; overflow: hidden; }
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
    .pbg-m-tag {
      display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px;
      border-radius: 5px; font-size: 9px; font-weight: 600;
    }
    .pbg-m-timer { background: rgba(239,68,68,0.1); color: #f87171; }
    .pbg-m-optin-tag { background: rgba(245,158,11,0.1); color: #fbbf24; }
    .pbg-m-rec { background: rgba(139,92,246,0.1); color: #a78bfa; }
    .pbg-m-complete-tag { background: rgba(16,185,129,0.12); color: #34d399; }
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

    /* ---- Levels Tab ---- */
    .pbg-lvl-current {
      background: linear-gradient(135deg, rgba(139,92,246,0.12), rgba(6,182,212,0.08));
      border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 20px; margin-bottom: 16px; text-align: center;
    }
    .pbg-lvl-current-badge { width: 80px; height: 80px; margin: 0 auto 10px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); }
    .pbg-lvl-current-badge img { width: 100%; height: 100%; object-fit: contain; }
    .pbg-lvl-current-name { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 2px; }
    .pbg-lvl-current-tier { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
    .pbg-lvl-xp-bar-wrap { margin: 0 auto; max-width: 280px; }
    .pbg-lvl-xp-bar { height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
    .pbg-lvl-xp-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(.4,0,.2,1); }
    .pbg-lvl-xp-text { font-size: 11px; color: #71717a; }
    .pbg-lvl-xp-text span { font-weight: 700; }

    .pbg-lvl-xp-info {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; padding: 12px 14px; margin-bottom: 16px;
    }
    .pbg-lvl-xp-info-title { font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .pbg-lvl-xp-info-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    .pbg-lvl-xp-info-row + .pbg-lvl-xp-info-row { border-top: 1px solid rgba(255,255,255,0.04); }
    .pbg-lvl-xp-info-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .pbg-lvl-xp-info-label { font-size: 12px; color: #a1a1aa; flex: 1; }
    .pbg-lvl-xp-info-val { font-size: 12px; font-weight: 700; color: #fff; }

    .pbg-lvl-tier-section { margin-bottom: 16px; }
    .pbg-lvl-tier-header {
      display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 10px;
      border-radius: 8px; cursor: pointer; transition: background 0.15s;
    }
    .pbg-lvl-tier-header:hover { background: rgba(255,255,255,0.03); }
    .pbg-lvl-tier-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .pbg-lvl-tier-name { font-size: 13px; font-weight: 700; color: #fff; flex: 1; }
    .pbg-lvl-tier-range { font-size: 10px; color: #52525b; }
    .pbg-lvl-tier-arrow { width: 12px; height: 12px; color: #52525b; transition: transform 0.2s; }
    .pbg-lvl-tier-arrow.open { transform: rotate(180deg); }

    .pbg-lvl-grid {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 0 4px;
    }
    .pbg-lvl-cell {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      padding: 8px 4px; border-radius: 10px; cursor: pointer; transition: all 0.15s;
      border: 2px solid transparent; position: relative; background: rgba(255,255,255,0.02);
    }
    .pbg-lvl-cell:hover { background: rgba(255,255,255,0.05); }
    .pbg-lvl-cell.locked { opacity: 0.35; cursor: default; }
    .pbg-lvl-cell.locked:hover { background: rgba(255,255,255,0.02); }
    .pbg-lvl-cell.current { border-color: rgba(139,92,246,0.5); background: rgba(139,92,246,0.08); }
    .pbg-lvl-cell.completed .pbg-lvl-cell-check {
      position: absolute; top: 2px; right: 2px; width: 14px; height: 14px;
      background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    }
    .pbg-lvl-cell-icon { width: 36px; height: 36px; object-fit: contain; }
    .pbg-lvl-cell.locked .pbg-lvl-cell-icon { filter: grayscale(1) brightness(0.5); }
    .pbg-lvl-cell-num { font-size: 9px; font-weight: 700; color: #71717a; }
    .pbg-lvl-cell.current .pbg-lvl-cell-num { color: #a78bfa; }

    .pbg-lvl-detail-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 2147483647;
      display: flex; align-items: center; justify-content: center; padding: 20px;
      animation: pbg-fade-in 0.15s ease;
    }
    .pbg-lvl-detail-card {
      background: linear-gradient(180deg, #1a1f35, #0e1228); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; padding: 24px; width: 100%; max-width: 320px; text-align: center;
      position: relative; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    }
    .pbg-lvl-detail-close {
      position: absolute; top: 10px; right: 10px; width: 28px; height: 28px;
      border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: #a1a1aa; cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 16px; transition: all 0.2s; font-family: inherit; padding: 0;
    }
    .pbg-lvl-detail-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .pbg-lvl-detail-icon { width: 64px; height: 64px; margin: 0 auto 10px; }
    .pbg-lvl-detail-icon img { width: 100%; height: 100%; object-fit: contain; }
    .pbg-lvl-detail-name { font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 2px; }
    .pbg-lvl-detail-tier { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
    .pbg-lvl-detail-xp { font-size: 11px; color: #71717a; margin-bottom: 14px; }
    .pbg-lvl-detail-rewards { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
    .pbg-lvl-detail-rwd {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 10px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px; min-width: 70px;
    }
    .pbg-lvl-detail-rwd-val { font-size: 16px; font-weight: 800; color: #fff; }
    .pbg-lvl-detail-rwd-lbl { font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .pbg-lvl-detail-status {
      margin-top: 14px; padding: 8px 16px; border-radius: 8px; font-size: 11px; font-weight: 700;
      display: inline-block; text-transform: uppercase; letter-spacing: 0.06em;
    }

    /* Tournament — Smartico style */
    /* ---- Tournament Hero Banner ---- */
    .pbg-t-hero { position: relative; border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
    .pbg-t-hero-img { width: 100%; height: 180px; object-fit: cover; display: block; }
    .pbg-t-hero-grad { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(12,10,26,0.95) 0%, rgba(12,10,26,0.4) 40%, transparent 70%); }
    .pbg-t-hero-body { position: absolute; bottom: 0; left: 0; right: 0; padding: 10px 12px; display: flex; align-items: flex-end; gap: 8px; z-index: 1; flex-wrap: wrap; }
    .pbg-t-hero-info { flex: 1; min-width: 0; }
    .pbg-t-hero-name { font-size: 14px; font-weight: 800; color: #fff; text-transform: uppercase; margin: 0 0 2px; }
    .pbg-t-hero-prize { font-size: 12px; color: #a1a1aa; }
    .pbg-t-hero-prize span { color: #22d3ee; font-weight: 700; }
    .pbg-t-hero-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .pbg-t-hero-cd { display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.5); border-radius: 8px; padding: 6px 10px; }
    .pbg-t-hero-cd > div { text-align: center; }
    .pbg-t-hero-cd-num { font-size: 12px; font-weight: 800; color: #fff; min-width: 18px; text-align: center; }
    .pbg-t-hero-cd-lbl { font-size: 7px; color: #71717a; text-transform: uppercase; }
    .pbg-t-hero-cd-sep { color: #52525b; font-weight: 800; font-size: 12px; }
    .pbg-t-hero-btn {
      padding: 8px 16px; border: none; border-radius: 8px; font-size: 11px; font-weight: 800;
      font-family: inherit; cursor: pointer; text-transform: uppercase; letter-spacing: 0.04em;
      background: linear-gradient(135deg, #f97316, #ea580c); color: #fff;
      display: flex; align-items: center; gap: 4px; white-space: nowrap;
    }
    .pbg-t-hero-btn:hover { filter: brightness(1.1); }
    /* Filter tabs */
    .pbg-t-filters { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 2px; }
    .pbg-t-filters::-webkit-scrollbar { display: none; }
    .pbg-t-filter {
      padding: 7px 14px; border-radius: 20px; font-size: 10px; font-weight: 700;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      color: #a1a1aa; cursor: pointer; white-space: nowrap; transition: all 0.2s; font-family: inherit;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .pbg-t-filter:hover { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.2); }
    .pbg-t-filter.active { background: linear-gradient(135deg, #8b5cf6, #6366f1); border-color: transparent; color: #fff; }
    /* Section header */
    .pbg-t-section { display: flex; align-items: center; gap: 8px; margin: 16px 0 10px; }
    .pbg-t-section-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(139,92,246,0.1); }
    .pbg-t-section-title { font-size: 14px; font-weight: 700; color: #fff; flex: 1; }
    /* Card grid — horizontal scroll on mobile */
    .pbg-t-grid { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
    .pbg-t-grid::-webkit-scrollbar { display: none; }
    .pbg-t-card {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; overflow: hidden; cursor: pointer; flex-shrink: 0;
      width: 180px; transition: border-color 0.2s, transform 0.15s;
    }
    .pbg-t-card:hover { border-color: rgba(139,92,246,0.3); transform: translateY(-2px); }
    .pbg-t-banner {
      position: relative; height: 110px; background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.15));
    }
    .pbg-t-banner img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .pbg-t-banner-overlay { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(12,10,26,0.6) 0%, transparent 50%); }
    .pbg-t-banner-content { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 8px; }
    .pbg-t-type-badge {
      display: inline-flex; padding: 3px 8px; border-radius: 4px; font-size: 8px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.06em; align-self: flex-start;
    }
    .pbg-t-type-daily { background: #16a34a; color: #fff; }
    .pbg-t-type-weekly { background: #2563eb; color: #fff; }
    .pbg-t-type-monthly { background: #9333ea; color: #fff; }
    .pbg-t-players-badge {
      display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 4px;
      background: rgba(0,0,0,0.6); font-size: 9px; font-weight: 700; color: #fff; align-self: flex-end;
    }
    .pbg-t-status {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
      border-radius: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .pbg-t-status-live { background: rgba(16,185,129,0.2); color: #34d399; }
    .pbg-t-status-soon { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .pbg-t-status-ended { background: rgba(113,113,122,0.2); color: #a1a1aa; }
    .pbg-t-body { padding: 10px; }
    .pbg-t-title { font-size: 12px; font-weight: 800; color: #fff; margin: 0 0 6px; text-transform: uppercase; text-align: center; }
    .pbg-t-desc { font-size: 11px; color: #71717a; margin: 0 0 10px; line-height: 1.4; }
    .pbg-t-top3 { display: flex; justify-content: center; gap: 6px; font-size: 9px; color: #a1a1aa; margin-bottom: 8px; flex-wrap: wrap; }
    .pbg-t-top3-item { display: flex; align-items: center; gap: 2px; }
    .pbg-t-card-footer { display: flex; align-items: center; gap: 6px; }
    .pbg-t-pool-badge {
      flex: 1; padding: 6px; border-radius: 6px; text-align: center;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
    }
    .pbg-t-pool-lbl { font-size: 7px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .pbg-t-pool-val { font-size: 11px; font-weight: 800; color: #22d3ee; margin-top: 1px; }
    .pbg-t-part-btn {
      padding: 6px 12px; border: none; border-radius: 6px; font-size: 10px; font-weight: 800;
      font-family: inherit; cursor: pointer; text-transform: uppercase;
      background: linear-gradient(135deg, #f97316, #ea580c); color: #fff;
      display: flex; align-items: center; gap: 3px; white-space: nowrap;
    }
    .pbg-t-part-btn:hover { filter: brightness(1.1); }
    /* Stats row in detail */
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
      background: linear-gradient(135deg, #f97316, #ea580c); color: #fff;
      box-shadow: 0 4px 16px rgba(249,115,22,0.3);
    }
    .pbg-t-join-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(249,115,22,0.4); }
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
      position: relative; width: 250px; height: 250px; margin: 10px auto 28px;
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
      padding: 0; margin: 14px 0 40px;
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
      animation: pbg-scale-in 0.35s ease; margin: 0 0 24px;
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

    /* Mini Games — Card grid (reference design) */
    .pbg-mg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .pbg-mg-card {
      position: relative; border-radius: 14px; padding: 16px 14px; text-align: center; cursor: pointer;
      background: linear-gradient(180deg, rgba(1,6,18,0.4) 0%, rgba(11,31,79,0.4) 100%);
      border: 1.5px solid rgba(100,100,100,0.25);
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex; flex-direction: column; align-items: center;
    }
    .pbg-mg-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    .pbg-mg-card.greyed { opacity: 0.4; pointer-events: none; }
    .pbg-mg-card-img {
      width: 90px; height: 90px; object-fit: contain; margin-bottom: 8px;
      transition: transform 0.3s;
    }
    .pbg-mg-card:hover .pbg-mg-card-img { transform: scale(1.06); }
    .pbg-mg-icon { font-size: 36px; margin-bottom: 8px; }
    .pbg-mg-name { font-size: 14px; font-weight: 800; color: #fff; letter-spacing: 0.03em; }
    .pbg-mg-type { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }
    .pbg-mg-actions { display: flex; gap: 6px; width: 100%; margin-top: 12px; }
    .pbg-mg-btn-free {
      padding: 8px 14px; border-radius: 8px; background: rgb(38,45,65); color: #fff;
      font-size: 11px; font-weight: 700; letter-spacing: 0.04em; border: none; cursor: pointer;
      transition: background 0.2s; font-family: inherit;
    }
    .pbg-mg-btn-free:hover { background: rgb(50,58,82); }
    .pbg-mg-btn-open {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 8px 12px; border-radius: 8px;
      background: linear-gradient(135deg, #e85d3a, #f07040); color: #fff;
      font-size: 11px; font-weight: 700; letter-spacing: 0.04em; border: none; cursor: pointer;
      transition: all 0.2s; box-shadow: 0 3px 10px rgba(232,93,58,0.3); font-family: inherit;
    }
    .pbg-mg-btn-open:hover { background: linear-gradient(135deg, #f06a48, #f58050); box-shadow: 0 4px 14px rgba(232,93,58,0.45); }
    .pbg-mg-btn-open svg { width: 12px; height: 9px; flex-shrink: 0; }
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

    /* Gift Box — Chest game (reference design) */
    .pbg-gift-grid { display: flex; justify-content: center; gap: 8px; max-width: 360px; margin: 0 auto; }
    .pbg-gift-box {
      width: 110px; height: 110px; border-radius: 14px; cursor: pointer; position: relative;
      background: transparent;
      border: none;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .pbg-gift-box img {
      animation: pbg-chest-float 3s ease-in-out infinite;
      transition: filter 0.3s ease;
    }
    .pbg-gift-box:nth-child(1) img { animation-delay: 0s; }
    .pbg-gift-box:nth-child(2) img { animation-delay: 1s; }
    .pbg-gift-box:nth-child(3) img { animation-delay: 2s; }
    .pbg-gift-box:hover img { filter: saturate(0) brightness(0.7) contrast(1.2) drop-shadow(0 4px 16px rgba(245,174,0,0.4)); }
    .pbg-gift-box.opened img { animation: none; }
    .pbg-gift-box.opened:hover img { filter: none; }
    .pbg-gift-box.won img { animation: pbg-chest-win 0.8s ease forwards; }
    @keyframes pbg-chest-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    @keyframes pbg-chest-win {
      0% { transform: scale(1) rotate(0deg); }
      25% { transform: scale(1.15) rotate(-4deg); }
      50% { transform: scale(1.2) rotate(3deg); }
      75% { transform: scale(1.15) rotate(-2deg); }
      100% { transform: scale(1.1) rotate(0deg); }
    }
    @keyframes pbg-glow-pulse {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.15); }
    }
    /* Chest opening animation phases */
    @keyframes pbg-chest-shake {
      0%, 100% { transform: rotate(0deg) scale(1); }
      10% { transform: rotate(-8deg) scale(1.02); }
      20% { transform: rotate(8deg) scale(1.04); }
      30% { transform: rotate(-10deg) scale(1.06); }
      40% { transform: rotate(10deg) scale(1.08); }
      50% { transform: rotate(-12deg) scale(1.1); }
      60% { transform: rotate(12deg) scale(1.08); }
      70% { transform: rotate(-8deg) scale(1.06); }
      80% { transform: rotate(6deg) scale(1.04); }
      90% { transform: rotate(-3deg) scale(1.02); }
    }
    @keyframes pbg-chest-burst {
      0% { transform: scale(1); filter: saturate(0) brightness(0.55) contrast(1.2); }
      30% { transform: scale(1.3); filter: saturate(1) brightness(2) contrast(1); }
      50% { transform: scale(1.15); filter: saturate(0.8) brightness(1.3) contrast(1.1); }
      100% { transform: scale(1.1); filter: saturate(0.8) brightness(1.1) contrast(1); }
    }
    @keyframes pbg-chest-rays {
      0% { opacity: 0; transform: scale(0.3) rotate(0deg); }
      40% { opacity: 1; transform: scale(1.5) rotate(45deg); }
      100% { opacity: 0.5; transform: scale(1.2) rotate(90deg); }
    }
    @keyframes pbg-chest-sparkle {
      0%, 100% { opacity: 0; transform: scale(0) translateY(0); }
      20% { opacity: 1; transform: scale(1) translateY(-10px); }
      80% { opacity: 0.8; transform: scale(0.8) translateY(-40px); }
    }
    @keyframes pbg-prize-reveal {
      0% { opacity: 0; transform: translateY(20px) scale(0.5); }
      60% { opacity: 1; transform: translateY(-5px) scale(1.1); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    .pbg-chest-opening { animation: pbg-chest-shake 1s ease-in-out forwards; }
    .pbg-chest-burst { animation: pbg-chest-burst 0.8s ease-out forwards; }
    .pbg-chest-rays-el { animation: pbg-chest-rays 1s ease-out forwards; }
    .pbg-prize-text { animation: pbg-prize-reveal 0.6s ease-out forwards; }
    /* Roulette wheel — premium style */
    .pbg-roulette-container { position: relative; width: 290px; height: 290px; margin: 0 auto; display: flex; align-items: center; justify-content: center; }
    .pbg-roulette-outer { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, #4ade80, #22c55e, #16a34a, #4ade80, #22c55e, #16a34a, #4ade80, #22c55e, #16a34a, #4ade80, #22c55e, #16a34a, #4ade80); padding: 4px; box-shadow: 0 0 30px rgba(74,222,128,0.3), 0 0 60px rgba(74,222,128,0.1); }
    .pbg-roulette-outer-inner { width: 100%; height: 100%; border-radius: 50%; background: #1a1a2e; padding: 6px; display: flex; align-items: center; justify-content: center; }
    .pbg-roulette-wheel { width: 260px; height: 260px; border-radius: 50%; overflow: hidden; box-shadow: inset 0 0 20px rgba(0,0,0,0.5); flex-shrink: 0; }
    .pbg-roulette-pointer { position: absolute; top: -4px; left: 50%; transform: translateX(-50%); z-index: 10; width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 28px solid #4ade80; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 8px rgba(74,222,128,0.5)); }
    .pbg-roulette-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 48px; height: 48px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #4ade80 0%, #16a34a 50%, #064e3b 100%); border: 3px solid #86efac; z-index: 5; box-shadow: 0 0 15px rgba(74,222,128,0.4), inset 0 2px 4px rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; }
    .pbg-roulette-bulbs { position: absolute; inset: -4px; border-radius: 50%; z-index: 3; pointer-events: none; }
    .pbg-roulette-bulb { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff 0%, #4ade80 60%); box-shadow: 0 0 6px #4ade80, 0 0 3px #fff; }
    .pbg-roulette-bulb.alt { background: radial-gradient(circle at 30% 30%, #fff 0%, #22c55e 60%); box-shadow: 0 0 6px #22c55e, 0 0 3px #fff; }
    @keyframes pbg-bulb-blink { 0%, 100% { opacity: 1; transform: translate(-50%,-50%) scale(1.2); } 50% { opacity: 0.2; transform: translate(-50%,-50%) scale(0.8); } }
    @keyframes pbg-roulette-glow { 0%, 100% { box-shadow: 0 0 30px rgba(74,222,128,0.3), 0 0 60px rgba(74,222,128,0.1); } 50% { box-shadow: 0 0 40px rgba(74,222,128,0.5), 0 0 80px rgba(74,222,128,0.2); } }
    .pbg-roulette-spinning .pbg-roulette-bulb { animation: pbg-bulb-blink 0.25s ease-in-out infinite; }
    .pbg-roulette-spinning .pbg-roulette-bulb.alt { animation: pbg-bulb-blink 0.25s 0.125s ease-in-out infinite; }
    .pbg-roulette-spinning .pbg-roulette-outer { animation: pbg-roulette-glow 0.5s ease-in-out infinite; }
    .pbg-gift-icon { font-size: 32px; transition: transform 0.3s; }
    .pbg-gift-box:hover .pbg-gift-icon { transform: rotate(-10deg) scale(1.1); }
    .pbg-gift-label { font-size: 9px; color: #a1a1aa; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .pbg-gift-keys {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      color: #f5ae00; font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
      margin-top: 16px; text-transform: uppercase;
    }
    @keyframes pbg-chest-shake { 0%,100%{transform:translateY(0) rotate(0)} 20%{transform:translateY(-3px) rotate(-2deg)} 40%{transform:translateY(-5px) rotate(2deg)} 60%{transform:translateY(-3px) rotate(-1deg)} 80%{transform:translateY(-1px) rotate(1deg)} }
    .pbg-chest-shaking { animation: pbg-chest-shake 0.5s ease-in-out; }

    /* Store — Redesign v2 (matching reference) */
    .pbg-store-filters { display: flex; gap: 6px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 2px; }
    .pbg-store-filters::-webkit-scrollbar { display: none; }
    .pbg-store-filter {
      padding: 7px 14px; border-radius: 20px; font-size: 10px; font-weight: 700;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      color: #a1a1aa; cursor: pointer; white-space: nowrap; transition: all 0.2s; font-family: inherit;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .pbg-store-filter:hover { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.2); }
    .pbg-store-filter.active { background: linear-gradient(135deg, #8b5cf6, #6366f1); border-color: transparent; color: #fff; }
    .pbg-store-section { display: flex; align-items: center; gap: 10px; margin: 20px 0 12px; }
    .pbg-store-section-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
    .pbg-store-section-title { font-size: 15px; font-weight: 700; color: #f1f1f1; flex: 1; }
    .pbg-store-section-more { font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; white-space: nowrap; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 10px; background: none; font-family: inherit; }
    .pbg-store-section-more:hover { color: #a1a1aa; border-color: rgba(255,255,255,0.2); }
    .pbg-store-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; padding-top: 6px; scroll-snap-type: x mandatory; }
    .pbg-store-scroll::-webkit-scrollbar { display: none; }
    .pbg-store-item {
      border-radius: 12px; overflow: hidden; cursor: pointer; flex-shrink: 0;
      width: 155px; transition: transform 0.15s, box-shadow 0.2s; position: relative;
      scroll-snap-align: start;
    }
    .pbg-store-item:hover { transform: translateY(-3px); }
    /* Coins card — orange tint */
    .pbg-store-item.pbg-store-coins {
      background: linear-gradient(165deg, rgba(246,106,0,0.15) 0%, rgba(246,106,0,0.05) 50%, rgba(10,10,18,0.95) 100%);
      border: 1.5px solid rgba(255,155,80,0.35);
      box-shadow: 0 2px 12px rgba(246,106,0,0.1);
    }
    .pbg-store-item.pbg-store-coins:hover { box-shadow: 0 6px 24px rgba(246,106,0,0.2); border-color: rgba(255,155,80,0.55); }
    /* Diamonds card — cyan tint */
    .pbg-store-item.pbg-store-diamonds {
      background: linear-gradient(165deg, rgba(0,201,255,0.12) 0%, rgba(0,201,255,0.04) 50%, rgba(10,10,18,0.95) 100%);
      border: 1.5px solid rgba(0,201,255,0.3);
      box-shadow: 0 2px 12px rgba(0,201,255,0.08);
    }
    .pbg-store-item.pbg-store-diamonds:hover { box-shadow: 0 6px 24px rgba(0,201,255,0.18); border-color: rgba(0,201,255,0.5); }
    /* Gems card — green tint */
    .pbg-store-item.pbg-store-gems {
      background: linear-gradient(165deg, rgba(131,245,57,0.12) 0%, rgba(131,245,57,0.04) 50%, rgba(10,10,18,0.95) 100%);
      border: 1.5px solid rgba(129,255,161,0.3);
      box-shadow: 0 2px 12px rgba(131,245,57,0.08);
    }
    .pbg-store-item.pbg-store-gems:hover { box-shadow: 0 6px 24px rgba(131,245,57,0.18); border-color: rgba(129,255,161,0.5); }
    .pbg-store-item.greyed { opacity: 0.45; }
    .pbg-store-item-img {
      width: 100%; height: 110px; display: flex; align-items: center; justify-content: center;
      padding: 12px;
    }
    .pbg-store-item-img img { max-width: 90px; max-height: 90px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); }
    .pbg-store-item-discount {
      position: absolute; top: 8px; right: 8px; padding: 3px 8px; border-radius: 5px;
      font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
      background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff;
      box-shadow: 0 2px 6px rgba(220,38,38,0.4);
    }
    .pbg-store-item-body { padding: 8px 10px 10px; }
    .pbg-store-item-name { font-size: 12px; font-weight: 700; color: #f1f1f1; margin: 0 0 3px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pbg-store-item-desc { font-size: 9px; color: #8a8a96; margin: 0 0 8px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .pbg-store-item-footer { display: flex; align-items: center; gap: 6px; }
    .pbg-store-item-price {
      flex: 1; display: flex; align-items: center; gap: 4px; padding: 5px 8px;
      border-radius: 6px; min-width: 0;
    }
    .pbg-store-item-price.pbg-store-price-coins { background: rgba(246,106,0,0.18); color: rgb(255,155,80); }
    .pbg-store-item-price.pbg-store-price-diamonds { background: rgba(0,201,255,0.15); color: rgb(0,201,255); }
    .pbg-store-item-price.pbg-store-price-gems { background: rgba(131,245,57,0.15); color: rgb(129,255,161); }
    .pbg-store-item-price-val { font-size: 11px; font-weight: 800; white-space: nowrap; }
    .pbg-store-item-price-lbl { font-size: 8px; font-weight: 700; text-transform: uppercase; }
    .pbg-store-item-price-old { font-size: 9px; font-weight: 600; text-decoration: line-through; opacity: 0.5; }
    .pbg-store-cart-btn {
      width: 32px; height: 32px; border-radius: 8px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 30% 30%, #FF704A, #FF3400); color: #fff;
      transition: filter 0.2s, transform 0.15s; flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(255,52,0,0.35);
    }
    .pbg-store-cart-btn:hover { filter: brightness(1.15); transform: scale(1.08); }
    .pbg-store-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

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

    /* Referral / Indique e Ganhe */
    .pbg-ref-banner { background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1)); border: 1px solid rgba(139,92,246,0.2); border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 12px; }
    .pbg-ref-banner-title { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .pbg-ref-banner-desc { font-size: 12px; color: #a1a1aa; line-height: 1.5; }
    .pbg-ref-rewards-row { display: flex; gap: 8px; margin: 16px 0 12px; }
    .pbg-ref-reward-card { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 8px; text-align: center; }
    .pbg-ref-reward-card-label { font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600; }
    .pbg-ref-reward-card-value { font-size: 18px; font-weight: 800; line-height: 1; }
    .pbg-ref-reward-card-type { font-size: 10px; color: #a1a1aa; margin-top: 4px; }
    .pbg-ref-code-box { background: rgba(0,0,0,0.3); border: 1px dashed rgba(139,92,246,0.4); border-radius: 12px; padding: 14px; margin: 12px 0; position: relative; }
    .pbg-ref-code-label { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 600; }
    .pbg-ref-code-value { font-size: 20px; font-weight: 800; color: #8b5cf6; letter-spacing: 2px; font-family: 'JetBrains Mono', monospace; }
    .pbg-ref-link-box { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .pbg-ref-link-text { flex: 1; font-size: 11px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono', monospace; }
    .pbg-ref-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s; font-family: inherit; }
    .pbg-ref-btn-primary { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; width: 100%; }
    .pbg-ref-btn-primary:hover { transform: scale(1.02); box-shadow: 0 4px 16px rgba(139,92,246,0.4); }
    .pbg-ref-btn-outline { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #d4d4d8; }
    .pbg-ref-btn-outline:hover { background: rgba(255,255,255,0.1); }
    .pbg-ref-btn-sm { padding: 6px 10px; font-size: 11px; }
    .pbg-ref-share-btns { display: flex; gap: 6px; margin: 8px 0; }
    .pbg-ref-share-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; color: #fff; transition: transform 0.15s; font-family: inherit; }
    .pbg-ref-share-btn:hover { transform: scale(1.03); }
    .pbg-ref-share-whatsapp { background: #25D366; }
    .pbg-ref-share-telegram { background: #0088cc; }
    .pbg-ref-share-copy { background: rgba(255,255,255,0.1); color: #d4d4d8; }
    .pbg-ref-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0; }
    .pbg-ref-stat { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px 8px; text-align: center; }
    .pbg-ref-stat-val { font-size: 20px; font-weight: 800; color: #fff; line-height: 1; }
    .pbg-ref-stat-lbl { font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .pbg-ref-tier { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; margin-bottom: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); transition: all 0.15s; }
    .pbg-ref-tier.completed { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.05); }
    .pbg-ref-tier.claimable { border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.08); animation: pbg-pulse-border 2s infinite; }
    @keyframes pbg-pulse-border { 0%,100%{border-color:rgba(139,92,246,0.3)} 50%{border-color:rgba(139,92,246,0.6)} }
    .pbg-ref-tier-progress { flex: 1; }
    .pbg-ref-tier-label { font-size: 11px; color: #d4d4d8; font-weight: 600; }
    .pbg-ref-tier-bar { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-top: 4px; }
    .pbg-ref-tier-fill { height: 100%; border-radius: 2px; transition: width 0.4s; }
    .pbg-ref-referral-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .pbg-ref-referral-item:last-child { border-bottom: none; }
    .pbg-ref-referral-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(139,92,246,0.15); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #8b5cf6; flex-shrink: 0; }
    .pbg-ref-referral-info { flex: 1; min-width: 0; }
    .pbg-ref-referral-cpf { font-size: 12px; font-weight: 600; color: #d4d4d8; font-family: 'JetBrains Mono', monospace; }
    .pbg-ref-referral-date { font-size: 10px; color: #52525b; }
    .pbg-ref-status { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
    .pbg-ref-status-completed { background: rgba(52,211,153,0.15); color: #34d399; }
    .pbg-ref-status-pending { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .pbg-ref-status-deposit { background: rgba(96,165,250,0.15); color: #60a5fa; }
    .pbg-ref-terms { font-size: 10px; color: #52525b; line-height: 1.5; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 8px; margin-top: 8px; }
    .pbg-ref-copied { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); background: #22c55e; color: #fff; padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 700; z-index: 999999; animation: pbg-fade-in 0.2s ease; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }

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
    gem: '<svg viewBox="0 0 31 30" fill="none"><path d="M11.56 5.28L9.68 1.75h10.98l-1.89 3.53h-7.21z" fill="#5CAE39"/><path d="M9.68 1.75L1.91 9.18l4.56.56 5.09-4.46L9.68 1.75z" fill="#3C972A"/><path d="M6.47 16.73l-4.56 4.08 7.77 7.44 1.88-7.05-5.09-4.47z" fill="#3C972A"/><path d="M11.56 21.2L9.68 28.25h10.98l-1.89-7.05h-7.21z" fill="#1D801B"/><path d="M23.87 16.73l4.55 4.08-7.76 7.44-1.89-7.05 5.1-4.47z" fill="#3C972A"/><path d="M23.87 9.75l4.55-.56v11.63l-4.55-4.08V9.75z" fill="#3C972A"/><path d="M20.66 1.75l-1.89 3.53 5.1 4.47 4.55-.56-7.76-7.44z" fill="#6EC839"/><path d="M6.47 9.75L1.91 9.18v11.63l4.56-4.08V9.75z" fill="#1D801B"/><path d="M18.49 5.06h-6.53c-.27 0-.54.1-.75.28l-4.5 3.95a1.03 1.03 0 00-.39.87v6.09c0 .34.14.66.4.88l4.5 3.95c.2.18.47.28.74.28h6.53c.28 0 .54-.1.75-.28l4.5-3.95c.25-.22.4-.53.4-.87v-6.09c0-.34-.14-.66-.4-.88l-4.5-3.95a1.06 1.06 0 00-.75-.28z" fill="#80E239"/><path d="M18.91 5.06l-.07.06L6.43 16.76v-6.73c.03-.29.17-.52.38-.71l4.5-3.95c.21-.18.47-.28.75-.28h6.85z" fill="#B3F539"/></svg>',
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
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="12" y2="8"/><circle cx="12" cy="14" r="8"/></svg>',
    hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
    diamond: '<svg viewBox="0 0 31 30" fill="none"><path d="M21.12 14.48L15.5 29.74c.54 0 1.07-.26 1.38-.78l9.44-15.87c.3-.5.44-1.07.43-1.62l-5.63 3.01z" fill="#0C80E3"/><path d="M26.75 11.47l-5.63 3.01L15.5.25c.79 0 1.57.3 2.17.9l8.17 8.19c.58.58.89 1.34.9 2.13z" fill="#12C0F1"/><path d="M21.12 14.48H9.88l.28-.71L15.5.25l2.05 5.2 3.57 9.03z" fill="#12C0F1"/><path d="M9.88 14.48L15.5 29.75l5.62-15.27H9.88z" fill="#12C0F1"/><path d="M15.5.25L9.88 14.48 4.25 11.47c.01-.78.32-1.55.9-2.13L13.33 1.15c.6-.6 1.39-.9 2.17-.9z" fill="#0C80E3"/><path d="M9.88 14.48L15.5 29.74c-.54 0-1.07-.26-1.38-.78L4.68 13.09c-.3-.5-.44-1.07-.43-1.62l5.63 3.01z" fill="#0C80E3"/><path d="M4.25 11.47c.01-.78.32-1.55.9-2.13l8.18-8.19c.6-.6 1.39-.9 2.17-.9l-5.62 14.23-5.63-3.01z" fill="#0C80E3"/><path d="M26.75 11.47c0 .56-.14 1.12-.43 1.62L16.88 28.96c-.29.49-.78.75-1.28.78-.57.03-1.15-.23-1.48-.78L4.68 13.09c-.3-.5-.44-1.06-.43-1.62l.03-.35c.07.25.05.77.19 1L14.11 26.61c.33.53.92.78 1.49.75.5-.03 1-.29 1.29-.75l9.7-14.74c.14-.23.06-.52.13-.77l.03.37z" fill="#0269B7"/></svg>',
    cartPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/><line x1="16" y1="9" x2="16" y2="15"/><line x1="13" y1="12" x2="19" y2="12"/></svg>',
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
    try {
      // Send ref code along with data request so API can auto-register
      const refCode = (function() {
        try { return localStorage.getItem('__pbr_ref_code') || localStorage.getItem('codigo_indicacao') || ''; } catch(e) { return ''; }
      })();
      data = await apiCall('data', refCode ? { ref_code: refCode } : {});
      // If widget is hidden for this player (segment restriction), hide everything
      if (data?._widget_hidden) {
        const fab = document.getElementById('pbg-fab');
        if (fab) fab.style.display = 'none';
        const panel = document.getElementById('pbg-widget-panel');
        if (panel) panel.style.display = 'none';
        return;
      }
      // Clear ref code if API confirmed registration
      if (data?._ref_registered) {
        try { localStorage.removeItem('__pbr_ref_code'); } catch(e) {}
      }
      updateFab();
      renderContent();
      // Auto-check referral qualification (deposit + bet)
      if (PLAYER_CPF && !window.__pbg_ref_checked) {
        window.__pbg_ref_checked = true;
        apiCall('referral_check').catch(() => {});
      }
    } catch (e) { console.error('[PBG Widget]', e); }
  }

  // ---- LEVEL HELPERS ----
  // Supports both old schema (level_number/min_xp) and new schema (level/xp_required)
  function getLevelNumber(lvl) { return lvl.level_number !== undefined ? lvl.level_number : lvl.level; }
  function getLevelXp(lvl) { return lvl.min_xp !== undefined ? lvl.min_xp : lvl.xp_required; }

  function getLevelInfo() {
    if (!data?.wallet || !data?.levels?.length) return null;
    const w = data.wallet;
    const levels = [...data.levels].sort((a,b) => getLevelNumber(a) - getLevelNumber(b));
    let current = levels[0];
    let next = levels.length > 1 ? levels[1] : null;
    for (let i = 0; i < levels.length; i++) {
      if (w.xp >= getLevelXp(levels[i])) { current = levels[i]; next = levels[i+1] || null; }
    }
    const xpInLevel = w.xp - getLevelXp(current);
    const xpForNext = next ? getLevelXp(next) - getLevelXp(current) : 1;
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

  function getDayName(dateStr) {
    if (!dateStr) {
      const days = ['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];
      return days[new Date().getDay()];
    }
    const days = ['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];
    return days[new Date(dateStr).getDay()];
  }

  function getCountdown(endDate) {
    if (!endDate) return '';
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return '00:00:00';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function getMissionRewardLabel(m) {
    const labels = { bonus: fmt(m.reward_value), free_bet: fmt(m.reward_value), cartelas: `${m.reward_value} Cartelas`, coins: `${String(m.reward_value).padStart(2,'0')} Fichas Douradas`, xp: `${m.reward_value} XP`, diamonds: `${m.reward_value} Diamantes`, spins: `${m.reward_value} Giros na Roleta` };
    return labels[m.reward_type] || `${m.reward_value} ${m.reward_type}`;
  }

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
      const mTarget = progress?.target || Number(m.condition_value) || 1;
      const mProgress = progress?.progress || 0;
      const pct = Math.min(100, Math.round((mProgress / mTarget) * 100));
      const isCompleted = progress?.completed;
      const isOptedIn = progress?.opted_in;
      const isClaimed = progress?.claimed;
      const color = typeColors[m.type] || '#8b5cf6';
      const dashOffset = circumference - (circumference * pct / 100);

      return `
        <div class="pbg-m-detail">
          <button onclick="window.__pbg('closeMission')" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#a1a1aa;font-size:13px;cursor:pointer;font-family:inherit;padding:6px 14px;margin:0 12px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;max-width:calc(100% - 24px)">← Voltar</button>

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
                <div style="flex:1">
                  <div class="pbg-m-detail-progress-bar">
                    <div class="pbg-m-detail-progress-fill" style="width:${pct}%;background:${isCompleted ? '#34d399' : `linear-gradient(90deg, ${color}, ${color}cc)`}"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px">
                    <span style="color:#71717a">${pct}%</span>
                    <span style="color:#fff;font-weight:700">${Math.min(mProgress, mTarget)} / ${mTarget}</span>
                  </div>
                </div>
              </div>
              <div class="pbg-m-detail-stats">
                <div class="pbg-m-detail-stat">
                  <div class="pbg-m-detail-stat-value" style="color:${color}">${Math.min(mProgress, mTarget)}</div>
                  <div class="pbg-m-detail-stat-label">Progresso</div>
                </div>
                <div class="pbg-m-detail-stat">
                  <div class="pbg-m-detail-stat-value">${mTarget}</div>
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

    // Separate missions into available (not participating) and participating (opted_in or has progress)
    const available = data.missions.filter(m => {
      const p = getMissionProgress(m.id);
      return !p?.opted_in && !p?.completed;
    });
    const participating = data.missions.filter(m => {
      const p = getMissionProgress(m.id);
      return p?.opted_in && !p?.completed;
    });
    const completed = data.missions.filter(m => {
      const p = getMissionProgress(m.id);
      return p?.completed;
    });

    let html = '';

    // --- DISPONÍVEIS section ---
    if (available.length > 0) {
      html += `
        <div class="pbg-m-section-header">
          <div class="pbg-m-section-left">
            <div class="pbg-m-section-icon">${inlIcon('target',18)}</div>
            <div class="pbg-m-section-title">Disponíveis</div>
          </div>
          <button class="pbg-m-section-more">VER MAIS</button>
        </div>
        <div class="pbg-m-scroll">
      `;
      available.forEach((m, _i) => {
        const globalIdx = data.missions.indexOf(m);
        const countdown = getCountdown(m.end_date);
        const rewardLabel = getMissionRewardLabel(m);
        const defaultImg = 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
        const timerSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.681 7.526C12.681 10.39 10.37 12.711 7.52 12.711C4.669 12.711 2.358 10.39 2.358 7.526C2.358 4.663 4.669 2.341 7.52 2.341C10.37 2.341 12.681 4.663 12.681 7.526ZM14.089 7.526C14.089 11.17 11.148 14.125 7.52 14.125C3.892 14.125 0.95 11.17 0.95 7.526C0.95 3.882 3.892 0.927 7.52 0.927C11.148 0.927 14.089 3.882 14.089 7.526ZM8.223 4.227C8.223 3.836 7.908 3.52 7.52 3.52C7.131 3.52 6.816 3.836 6.816 4.227V7.526C6.816 7.749 6.92 7.958 7.097 8.092L8.974 9.506C9.285 9.74 9.726 9.677 9.96 9.364C10.193 9.052 10.13 8.609 9.819 8.374L8.223 7.173V4.227Z" fill="#A1A1AA"/></svg>';
        const timeDisplay = countdown || (m.time_limit_hours ? String(m.time_limit_hours).padStart(2,'0') + ':00:00' : '--:--:--');
        const iconBase = 'https://backofficepixbingobr.vercel.app/widget';
        const chestSvg = `<img src="${iconBase}/chest-icon.svg" width="28" height="30" alt="" style="display:block"/>`;
        const boltSvg = `<img src="${iconBase}/bolt-icon.svg" width="21" height="25" alt="" style="display:block"/>`;
        const trophySvg = `<img src="${iconBase}/trophy-icon.svg" width="28" height="25" alt="" style="display:block"/>`;

        html += `
          <div class="pbg-m-part-card" onclick="window.__pbg('openMission',${globalIdx})">
            <div class="pbg-m-badge-emalta"><span>EM ALTA</span></div>
            <div class="pbg-m-part-top">
              <div class="pbg-m-part-img-wrap">
                <img src="${m.icon_url || defaultImg}" alt="" onerror="this.src='${defaultImg}'"/>
              </div>
              <div class="pbg-m-part-info">
                <div class="pbg-m-part-name">${m.name}</div>
                <div class="pbg-m-part-desc">${m.description || conditionText(m.condition_type, m.condition_value)}</div>
              </div>
            </div>
            <div class="pbg-m-part-duration">
              <span class="pbg-m-part-duration-label">DURAÇÃO</span>
              <div class="pbg-m-part-duration-time">${timerSvg}<span>${timeDisplay}</span></div>
            </div>
            <div class="pbg-m-part-prize-row">
              ${chestSvg}
              <div class="pbg-m-part-prize-text">${rewardLabel}</div>
            </div>
            <div class="pbg-m-part-progress-wrap">
              <div class="pbg-m-part-progress-inner">
                <div class="pbg-m-part-progress-icon">${boltSvg}</div>
                <div class="pbg-m-part-progress-bar-wrap">
                  <div class="pbg-m-part-progress-bar">
                    <div class="pbg-m-part-progress-fill" style="width:0%"></div>
                  </div>
                  <span class="pbg-m-part-progress-pct">0%</span>
                </div>
                <div class="pbg-m-part-progress-icon">${trophySvg}</div>
              </div>
            </div>
            ${m.require_optin && PLAYER_CPF ? `
              <button class="pbg-m-claim-btn" onclick="event.stopPropagation();window.__pbg('missionOptin','${m.id}')">${inlIcon('hand',12)} Participar</button>
            ` : ''}
            <div class="pbg-m-part-games" onclick="event.stopPropagation();window.__pbg('openMission',${globalIdx})">
              <img class="pbg-m-part-games-thumb" src="${m.icon_url || defaultImg}" alt="" onerror="this.style.display='none'"/>
              Jogos Elegíveis
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    // --- PARTICIPANDO section ---
    if (participating.length > 0) {
      html += `
        <div class="pbg-m-section-header" style="margin-top:20px">
          <div class="pbg-m-section-left">
            <div class="pbg-m-section-icon">${inlIcon('chart',18)}</div>
            <div class="pbg-m-section-title">Participando</div>
          </div>
          <button class="pbg-m-section-more">VER MAIS</button>
        </div>
        <div class="pbg-m-scroll">
      `;
      participating.forEach((m) => {
        const globalIdx = data.missions.indexOf(m);
        const progress = getMissionProgress(m.id);
        const pct = progress ? Math.min(100, Math.round((progress.progress / progress.target) * 100)) : 0;
        const isClaimed = progress?.claimed;
        const countdown = getCountdown(m.end_date);
        const rewardLabel = getMissionRewardLabel(m);
        const defaultImg = 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
        const timerSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.681 7.526C12.681 10.39 10.37 12.711 7.52 12.711C4.669 12.711 2.358 10.39 2.358 7.526C2.358 4.663 4.669 2.341 7.52 2.341C10.37 2.341 12.681 4.663 12.681 7.526ZM14.089 7.526C14.089 11.17 11.148 14.125 7.52 14.125C3.892 14.125 0.95 11.17 0.95 7.526C0.95 3.882 3.892 0.927 7.52 0.927C11.148 0.927 14.089 3.882 14.089 7.526ZM8.223 4.227C8.223 3.836 7.908 3.52 7.52 3.52C7.131 3.52 6.816 3.836 6.816 4.227V7.526C6.816 7.749 6.92 7.958 7.097 8.092L8.974 9.506C9.285 9.74 9.726 9.677 9.96 9.364C10.193 9.052 10.13 8.609 9.819 8.374L8.223 7.173V4.227Z" fill="#A1A1AA"/></svg>';
        const timeDisplay = countdown || (m.time_limit_hours ? String(m.time_limit_hours).padStart(2,'0') + ':00:00' : '--:--:--');
        const iconBase = 'https://backofficepixbingobr.vercel.app/widget';
        const chestSvg = `<img src="${iconBase}/chest-icon.svg" width="28" height="30" alt="" style="display:block"/>`;
        const boltSvg = `<img src="${iconBase}/bolt-icon.svg" width="21" height="25" alt="" style="display:block"/>`;
        const trophySvg = `<img src="${iconBase}/trophy-icon.svg" width="28" height="25" alt="" style="display:block"/>`;

        html += `
          <div class="pbg-m-part-card" onclick="window.__pbg('openMission',${globalIdx})">
            <div class="pbg-m-badge-emalta"><span>EM ALTA</span></div>
            <div class="pbg-m-part-top">
              <div class="pbg-m-part-img-wrap">
                <img src="${m.icon_url || defaultImg}" alt="" onerror="this.src='${defaultImg}'"/>
              </div>
              <div class="pbg-m-part-info">
                <div class="pbg-m-part-name">${m.name}</div>
                <div class="pbg-m-part-desc">${m.description || conditionText(m.condition_type, m.condition_value)}</div>
              </div>
            </div>
            <div class="pbg-m-part-duration">
              <span class="pbg-m-part-duration-label">DURAÇÃO</span>
              <div class="pbg-m-part-duration-time">${timerSvg}<span>${timeDisplay}</span></div>
            </div>
            <div class="pbg-m-part-prize-row">
              ${chestSvg}
              <div class="pbg-m-part-prize-text">${rewardLabel}</div>
            </div>
            <div class="pbg-m-part-progress-wrap">
              <div class="pbg-m-part-progress-inner">
                <div class="pbg-m-part-progress-icon">${boltSvg}</div>
                <div class="pbg-m-part-progress-bar-wrap">
                  <div class="pbg-m-part-progress-bar">
                    <div class="pbg-m-part-progress-fill" style="width:${pct}%"></div>
                  </div>
                  <span class="pbg-m-part-progress-pct">${pct}%</span>
                </div>
                <div class="pbg-m-part-progress-icon">${trophySvg}</div>
              </div>
            </div>
            ${progress?.completed && m.manual_claim && !isClaimed && PLAYER_CPF ? `
              <button class="pbg-m-claim-btn" onclick="event.stopPropagation();window.__pbg('claimMission','${m.id}')">${inlIcon('gift',12)} Resgatar</button>
            ` : ''}
            <div class="pbg-m-part-games" onclick="event.stopPropagation();window.__pbg('openMission',${globalIdx})">
              <img class="pbg-m-part-games-thumb" src="${m.icon_url || defaultImg}" alt="" onerror="this.style.display='none'"/>
              Jogos Elegíveis
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    // --- COMPLETAS section ---
    if (completed.length > 0) {
      html += `
        <div class="pbg-m-section-header" style="margin-top:20px">
          <div class="pbg-m-section-left">
            <div class="pbg-m-section-icon">${inlIcon('check',18)}</div>
            <div class="pbg-m-section-title">Completas</div>
          </div>
          <span style="font-size:10px;color:#52525b;font-weight:600">${completed.length}</span>
        </div>
        <div class="pbg-m-scroll">
      `;
      completed.forEach((m) => {
        const globalIdx = data.missions.indexOf(m);
        const progress = getMissionProgress(m.id);
        const isClaimed = progress?.claimed;
        const rewardLabel = getMissionRewardLabel(m);
        const defaultImg = 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
        const iconBase = 'https://backofficepixbingobr.vercel.app/widget';
        const chestSvg = `<img src="${iconBase}/chest-icon.svg" width="28" height="30" alt="" style="display:block"/>`;
        const boltSvg = `<img src="${iconBase}/bolt-icon.svg" width="21" height="25" alt="" style="display:block"/>`;
        const trophySvg = `<img src="${iconBase}/trophy-icon.svg" width="28" height="25" alt="" style="display:block"/>`;

        html += `
          <div class="pbg-m-part-card" style="opacity:0.6" onclick="window.__pbg('openMission',${globalIdx})">
            <div style="padding:10px 12px 6px;text-align:center"><span class="pbg-m-tag pbg-m-complete-tag">${inlIcon('check',10)} COMPLETA</span></div>
            <div class="pbg-m-part-top">
              <div class="pbg-m-part-img-wrap">
                <img src="${m.icon_url || defaultImg}" alt="" onerror="this.src='${defaultImg}'"/>
              </div>
              <div class="pbg-m-part-info">
                <div class="pbg-m-part-name">${m.name}</div>
                <div class="pbg-m-part-desc">${m.description || conditionText(m.condition_type, m.condition_value)}</div>
              </div>
            </div>
            <div class="pbg-m-part-prize-row">
              ${chestSvg}
              <div class="pbg-m-part-prize-text" style="color:#34d399">${rewardLabel}</div>
            </div>
            <div class="pbg-m-part-progress-wrap">
              <div class="pbg-m-part-progress-inner">
                <div class="pbg-m-part-progress-icon">${boltSvg}</div>
                <div class="pbg-m-part-progress-bar-wrap">
                  <div class="pbg-m-part-progress-bar">
                    <div class="pbg-m-part-progress-fill" style="width:100%;background:linear-gradient(90deg,#10b981,#059669)"></div>
                  </div>
                  <span class="pbg-m-part-progress-pct" style="color:#34d399">100%</span>
                </div>
                <div class="pbg-m-part-progress-icon">${trophySvg}</div>
              </div>
            </div>
            ${!isClaimed && m.manual_claim && PLAYER_CPF ? `
              <button class="pbg-m-claim-btn" onclick="event.stopPropagation();window.__pbg('claimMission','${m.id}')">${inlIcon('gift',12)} Resgatar</button>
            ` : ''}
            <div class="pbg-m-part-games" onclick="event.stopPropagation();window.__pbg('openMission',${globalIdx})">
              <img class="pbg-m-part-games-thumb" src="${m.icon_url || defaultImg}" alt="" onerror="this.style.display='none'"/>
              Jogos Elegíveis
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    // If no missions match any category, show a fallback for missions that don't require opt-in (auto-tracked)
    if (!available.length && !participating.length && !completed.length) {
      // All missions - show them as available
      html += `
        <div class="pbg-m-section-header">
          <div class="pbg-m-section-left">
            <div class="pbg-m-section-icon">${inlIcon('target',18)}</div>
            <div class="pbg-m-section-title">Disponíveis</div>
          </div>
        </div>
        <div class="pbg-m-scroll">
      `;
      data.missions.forEach((m) => {
        const globalIdx = data.missions.indexOf(m);
        const countdown = getCountdown(m.end_date);
        const rewardLabel = getMissionRewardLabel(m);
        const defaultImg = 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
        const timerSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.681 7.526C12.681 10.39 10.37 12.711 7.52 12.711C4.669 12.711 2.358 10.39 2.358 7.526C2.358 4.663 4.669 2.341 7.52 2.341C10.37 2.341 12.681 4.663 12.681 7.526ZM14.089 7.526C14.089 11.17 11.148 14.125 7.52 14.125C3.892 14.125 0.95 11.17 0.95 7.526C0.95 3.882 3.892 0.927 7.52 0.927C11.148 0.927 14.089 3.882 14.089 7.526ZM8.223 4.227C8.223 3.836 7.908 3.52 7.52 3.52C7.131 3.52 6.816 3.836 6.816 4.227V7.526C6.816 7.749 6.92 7.958 7.097 8.092L8.974 9.506C9.285 9.74 9.726 9.677 9.96 9.364C10.193 9.052 10.13 8.609 9.819 8.374L8.223 7.173V4.227Z" fill="#A1A1AA"/></svg>';
        const timeDisplay = countdown || (m.time_limit_hours ? String(m.time_limit_hours).padStart(2,'0') + ':00:00' : '--:--:--');
        const iconBase = 'https://backofficepixbingobr.vercel.app/widget';
        const chestSvg = `<img src="${iconBase}/chest-icon.svg" width="28" height="30" alt="" style="display:block"/>`;
        const boltSvg = `<img src="${iconBase}/bolt-icon.svg" width="21" height="25" alt="" style="display:block"/>`;
        const trophySvg = `<img src="${iconBase}/trophy-icon.svg" width="28" height="25" alt="" style="display:block"/>`;

        html += `
          <div class="pbg-m-part-card" onclick="window.__pbg('openMission',${globalIdx})">
            <div class="pbg-m-badge-emalta"><span>EM ALTA</span></div>
            <div class="pbg-m-part-top">
              <div class="pbg-m-part-img-wrap">
                <img src="${m.icon_url || defaultImg}" alt="" onerror="this.src='${defaultImg}'"/>
              </div>
              <div class="pbg-m-part-info">
                <div class="pbg-m-part-name">${m.name}</div>
                <div class="pbg-m-part-desc">${m.description || conditionText(m.condition_type, m.condition_value)}</div>
              </div>
            </div>
            <div class="pbg-m-part-duration">
              <span class="pbg-m-part-duration-label">DURAÇÃO</span>
              <div class="pbg-m-part-duration-time">${timerSvg}<span>${timeDisplay}</span></div>
            </div>
            <div class="pbg-m-part-prize-row">
              ${chestSvg}
              <div class="pbg-m-part-prize-text">${rewardLabel}</div>
            </div>
            <div class="pbg-m-part-progress-wrap">
              <div class="pbg-m-part-progress-inner">
                <div class="pbg-m-part-progress-icon">${boltSvg}</div>
                <div class="pbg-m-part-progress-bar-wrap">
                  <div class="pbg-m-part-progress-bar">
                    <div class="pbg-m-part-progress-fill" style="width:0%"></div>
                  </div>
                  <span class="pbg-m-part-progress-pct">0%</span>
                </div>
                <div class="pbg-m-part-progress-icon">${trophySvg}</div>
              </div>
            </div>
            <div class="pbg-m-part-games" onclick="event.stopPropagation();window.__pbg('openMission',${globalIdx})">
              <img class="pbg-m-part-games-thumb" src="${m.icon_url || defaultImg}" alt="" onerror="this.style.display='none'"/>
              Jogos Elegíveis
            </div>
          </div>
        `;
      });
      html += `</div>`;
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
            <div class="pbg-t-title" style="font-size:16px;text-align:left">${t.name}</div>
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

    // --- Tournament list with hero + filters + sections ---
    const allT = data.tournaments;
    const entries = data.tournament_entries || [];
    const now = Date.now();

    // Categorize
    const available = allT.filter(t => new Date(t.end_date) > now && !entries.find(e => e.tournament_id === t.id));
    const joined = allT.filter(t => new Date(t.end_date) > now && entries.find(e => e.tournament_id === t.id));
    const ended = allT.filter(t => new Date(t.end_date) <= now);
    const active = allT.filter(t => new Date(t.end_date) > now);

    // Filter state
    const tFilter = window.__pbg_t_filter || 'all';
    let filtered;
    if (tFilter === 'available') filtered = available;
    else if (tFilter === 'joined') filtered = joined;
    else if (tFilter === 'ended') filtered = ended;
    else filtered = allT;

    // Hero — first active tournament
    const hero = active[0];
    const heroIdx = hero ? allT.indexOf(hero) : -1;
    const heroCd = hero ? getCountdown(hero.end_date) : null;
    const heroPool = hero ? (hero.prizes||[]).reduce((s,p) => s + Number(p.value||0), 0) : 0;

    // Type label
    const typeLabel = (t) => {
      if (t.recurrence === 'daily') return '<span class="pbg-t-type-badge pbg-t-type-daily">DIÁRIO</span>';
      if (t.recurrence === 'weekly') return '<span class="pbg-t-type-badge pbg-t-type-weekly">SEMANAL</span>';
      if (t.recurrence === 'monthly') return '<span class="pbg-t-type-badge pbg-t-type-monthly">MENSAL</span>';
      return '';
    };

    // Render card
    const renderCard = (t, idx) => {
      const prizes = t.prizes || [];
      const pool = prizes.reduce((s,p) => s + Number(p.value||0), 0);
      const lb = data.leaderboards?.[t.id] || [];
      const cd = getCountdown(t.end_date);
      const top3 = prizes.slice(0, 3);
      const realIdx = allT.indexOf(t);

      return `
        <div class="pbg-t-card" onclick="window.__pbg('openTournament',${realIdx})">
          <div class="pbg-t-banner">
            ${t.image_url ? `<img src="${t.image_url}" alt="">` : ''}
            <div class="pbg-t-banner-overlay"></div>
            <div class="pbg-t-banner-content">
              ${typeLabel(t)}
              <div class="pbg-t-players-badge">${inlIcon('users',10)} ${lb.length.toLocaleString('pt-BR')}</div>
            </div>
          </div>
          <div class="pbg-t-body">
            <div class="pbg-t-title">${t.name}</div>
            <div class="pbg-t-top3">
              ${top3.map((p,i) => `<span class="pbg-t-top3-item">${inlIcon(['gold','silver','bronze'][i],12)} ${fmt(p.value)}</span>`).join('')}
            </div>
            <div class="pbg-t-card-footer">
              <div class="pbg-t-pool-badge">
                <div class="pbg-t-pool-lbl">PRÊMIO TOTAL</div>
                <div class="pbg-t-pool-val">${fmt(pool)}</div>
              </div>
              ${cd.total > 0 ? `<button class="pbg-t-part-btn" onclick="event.stopPropagation();window.__pbg('openTournament',${realIdx})">PARTICIPAR →</button>` : `<span style="font-size:9px;color:#71717a;font-weight:600">ENCERRADO</span>`}
            </div>
          </div>
        </div>
      `;
    };

    // Build sections for "all" filter
    const buildSections = () => {
      let html = '';
      if (available.length + joined.length > 0) {
        html += `<div class="pbg-t-section"><div class="pbg-t-section-icon">${inlIcon('trophy',18)}</div><div class="pbg-t-section-title">Disponíveis</div></div>`;
        html += `<div class="pbg-t-grid">${[...joined, ...available].map(t => renderCard(t)).join('')}</div>`;
      }
      if (ended.length > 0) {
        html += `<div class="pbg-t-section"><div class="pbg-t-section-icon" style="background:rgba(113,113,122,0.1)">${inlIcon('trophy',18)}</div><div class="pbg-t-section-title">Finalizados</div></div>`;
        html += `<div class="pbg-t-grid">${ended.map(t => renderCard(t)).join('')}</div>`;
      }
      return html;
    };

    return `
      ${hero ? `
        <div class="pbg-t-hero" onclick="window.__pbg('openTournament',${heroIdx})" style="cursor:pointer">
          ${hero.image_url ? `<img class="pbg-t-hero-img" src="${hero.image_url}" alt="">` : `<div class="pbg-t-hero-img" style="background:linear-gradient(135deg,rgba(139,92,246,0.3),rgba(6,182,212,0.15))"></div>`}
          <div class="pbg-t-hero-grad"></div>
          <div class="pbg-t-hero-body">
            <div class="pbg-t-hero-info">
              <div class="pbg-t-hero-name">${hero.name}</div>
              <div class="pbg-t-hero-prize">Prêmio total <span>${fmt(heroPool)}</span></div>
            </div>
            <div class="pbg-t-hero-right">
              <div class="pbg-t-hero-cd">
                <div><div class="pbg-t-hero-cd-num">${String(heroCd.d).padStart(2,'0')}</div><div class="pbg-t-hero-cd-lbl">DIAS</div></div>
                <div><div class="pbg-t-hero-cd-num">${String(heroCd.h).padStart(2,'0')}</div><div class="pbg-t-hero-cd-lbl">HORAS</div></div>
                <div><div class="pbg-t-hero-cd-num">${String(heroCd.m).padStart(2,'0')}</div><div class="pbg-t-hero-cd-lbl">MINS</div></div>
                <div><div class="pbg-t-hero-cd-num">${String(heroCd.s).padStart(2,'0')}</div><div class="pbg-t-hero-cd-lbl">SEGS</div></div>
              </div>
              <button class="pbg-t-hero-btn" onclick="event.stopPropagation();window.__pbg('openTournament',${heroIdx})">PARTICIPAR →</button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="pbg-t-filters">
        <button class="pbg-t-filter ${tFilter === 'all' ? 'active' : ''}" onclick="window.__pbg_t_filter='all';window.__pbg('tab','tournaments')">Todos</button>
        <button class="pbg-t-filter ${tFilter === 'available' ? 'active' : ''}" onclick="window.__pbg_t_filter='available';window.__pbg('tab','tournaments')">Disponíveis</button>
        <button class="pbg-t-filter ${tFilter === 'joined' ? 'active' : ''}" onclick="window.__pbg_t_filter='joined';window.__pbg('tab','tournaments')">Participando</button>
        <button class="pbg-t-filter ${tFilter === 'ended' ? 'active' : ''}" onclick="window.__pbg_t_filter='ended';window.__pbg('tab','tournaments')">Finalizados</button>
      </div>

      ${tFilter === 'all' ? buildSections() : `
        <div class="pbg-t-grid">${filtered.map(t => renderCard(t)).join('')}</div>
        ${filtered.length === 0 ? `<div style="text-align:center;padding:30px;color:#52525b;font-size:12px">Nenhum torneio nesta categoria</div>` : ''}
      `}
    `;
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

    // Bulbs — use percentage positioning so they scale with container
    const numBulbs = Math.max(24, n * 3);
    let bulbsHtml = '';
    for (let i = 0; i < numBulbs; i++) {
      const a = (i / numBulbs) * 2 * Math.PI - Math.PI / 2;
      const bxPct = 50 + 47.5 * Math.cos(a);
      const byPct = 50 + 47.5 * Math.sin(a);
      bulbsHtml += `<div class="pbg-bulb ${i % 2 === 0 ? 'pbg-bulb-on' : 'pbg-bulb-off'}" style="left:${bxPct}%;top:${byPct}%;transform:translate(-50%,-50%)"></div>`;
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
      const freeAtt = game.free_attempts_per_day ?? 1;
      const isFree = attToday < freeAtt;
      const maxReached = maxAtt > 0 && attToday >= maxAtt;
      const typeIcons = { scratch_card: inlIcon('card',20), gift_box: inlIcon('giftbox',20), prize_drop: inlIcon('target',20) };
      const typeLabels = { scratch_card: 'Raspadinha', gift_box: 'Caixa Surpresa', prize_drop: 'Prize Drop' };

      // Split game name for highlight styling (e.g., "FICHAS DOURADAS" → "FICHAS" white + "DOURADAS" gold)
      const nameParts = game.name.split(' ');
      const nameFirst = nameParts[0] || '';
      const nameRest = nameParts.slice(1).join(' ');
      const isChestGame = game.type === 'gift_box';
      const isRouletteGame = game.name && game.name.toLowerCase().includes('roleta');

      let html = `
        <button onclick="window.__pbg('closeMiniGame')" style="background:none;border:none;color:#a1a1aa;font-size:13px;cursor:pointer;font-family:inherit;padding:0;margin-bottom:10px">← Voltar</button>
        <div style="text-align:center;margin-bottom:16px">
          ${isChestGame ? `
            <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">${nameFirst}</div>
            ${nameRest ? `<div style="font-size:22px;font-weight:900;color:#f5ae00;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">${nameRest}</div>` : ''}
          ` : `
            <div style="font-size:36px;margin-bottom:6px">${typeIcons[game.type] || inlIcon('gamepad',36)}</div>
            <div style="font-size:16px;font-weight:700;color:#fff">${game.name}</div>
            ${game.description ? `<div style="font-size:12px;color:#71717a;margin-top:4px">${game.description}</div>` : ''}
          `}
        </div>
      `;

      // Keys remaining + Possible Prizes (always on top)
      if (isChestGame) {
        const topPurchased = att?.purchased_attempts || 0;
        const topKeysLeft = Math.max(0, freeAtt - attToday) + topPurchased;
        const topLabel = isRouletteGame ? 'GIROS RESTANTES' : 'CHAVES RESTANTES';
        html += `<div class="pbg-gift-keys" style="margin-bottom:6px">${inlIcon('key',14)} <span>${topKeysLeft} ${topLabel}</span></div>`;

        if (gamePrizes.length > 0 && !isRouletteGame) {
          const isDiamondGame = game.name && game.name.toLowerCase().includes('diamante');
          const prizeIcon = isDiamondGame ? inlIcon('diamond',36) : inlIcon('gem',36);
          const prizeGlow = isDiamondGame ? 'rgba(34,211,238,0.5)' : 'rgba(131,245,57,0.5)';
          const prizeBorder = isDiamondGame ? 'rgba(34,211,238,0.35)' : 'rgba(131,245,57,0.35)';
          const prizeBg = isDiamondGame ? 'rgba(34,211,238,0.08)' : 'rgba(131,245,57,0.08)';
          const prizeTextColor = isDiamondGame ? '#22d3ee' : '#81ff61';
          const validPrizes = gamePrizes.filter(p=>p.type!=='nothing');
          html += `
            <div style="text-align:center;margin-bottom:12px">
              <button onclick="var el=document.getElementById('pbg-prizes-popup-${game.id}');el.style.display=el.style.display==='flex'?'none':'flex'" style="background:linear-gradient(135deg,${prizeBg},rgba(255,255,255,0.03));border:1px solid ${prizeBorder};color:${prizeTextColor};font-size:12px;font-weight:700;letter-spacing:0.08em;cursor:pointer;font-family:inherit;text-transform:uppercase;padding:8px 20px;border-radius:10px;transition:all 0.2s">
                ${inlIcon('gift',14)} POSSÍVEIS PRÊMIOS
              </button>
              <div id="pbg-prizes-popup-${game.id}" style="display:none;flex-direction:column;margin-top:14px;background:rgba(15,15,20,0.97);border:1.5px solid ${prizeBorder};border-radius:16px;padding:20px 16px;box-shadow:0 8px 40px rgba(0,0,0,0.6),0 0 30px ${prizeGlow}22">
                <div style="font-size:16px;font-weight:900;color:#fff;margin-bottom:16px;letter-spacing:0.03em">Possíveis prêmios</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                  ${validPrizes.map(p => `
                    <div style="background:linear-gradient(145deg,rgba(30,30,40,0.95),rgba(20,20,28,0.9));border:1px solid ${prizeBorder};border-radius:12px;padding:14px 6px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative;overflow:hidden">
                      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${prizeTextColor},transparent);opacity:0.6"></div>
                      <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;color:${prizeTextColor};filter:drop-shadow(0 0 8px ${prizeGlow})">${prizeIcon}</div>
                      <div style="font-size:12px;font-weight:800;color:#fff;text-align:center;line-height:1.3">${p.label}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>`;
        }
      }

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

        // ROULETTE GAME — premium spinning wheel
        if (isRouletteGame && game.type === 'gift_box' && miniGameResult.game_data?.boxes) {
          const isDiamondRoulette = game.name.toLowerCase().includes('diamante');
          const rColors = isDiamondRoulette
            ? ['#0891b2','#06b6d4','#0e7490','#22d3ee','#0c4a6e','#0ea5e9','#155e75','#38bdf8','#164e63','#67e8f9']
            : ['#15803d','#22c55e','#166534','#4ade80','#065f46','#34d399','#047857','#6ee7b7','#064e3b','#86efac'];
          const rCenterSvg = isDiamondRoulette ? inlIcon('diamond',22) : inlIcon('gem',22);
          const rGlow = isDiamondRoulette ? 'rgba(34,211,238,0.5)' : 'rgba(131,245,57,0.5)';
          const rTextColor = isDiamondRoulette ? '#22d3ee' : '#81ff61';
          const rPrizes = gamePrizes.filter(p => p.type !== 'nothing');
          const segments = rPrizes.length > 0 ? rPrizes : [{label:'1 Gema'},{label:'2 Gemas'},{label:'3 Gemas'},{label:'4 Gemas'},{label:'5 Gemas'},{label:'6 Gemas'},{label:'7 Gemas'},{label:'8 Gemas'}];
          const n = segments.length;
          const segAngle = 360 / n;

          // Build SVG wheel with gradients and separators
          const R = 130; const cx = 130; const cy = 130;
          let svgDefs = '<defs>';
          for (let i = 0; i < n; i++) {
            const c = rColors[i % rColors.length];
            svgDefs += `<linearGradient id="pbg-seg-${i}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c}"/><stop offset="100%" stop-color="${c}aa"/></linearGradient>`;
          }
          svgDefs += `<filter id="pbg-inner-shadow"><feFlood flood-color="rgba(0,0,0,0.3)"/><feComposite in2="SourceAlpha" operator="in"/><feGaussianBlur stdDeviation="4"/><feComposite in2="SourceAlpha" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
          let svgSegments = '';
          for (let i = 0; i < n; i++) {
            const sa = (i * segAngle - 90) * Math.PI / 180;
            const ea = ((i + 1) * segAngle - 90) * Math.PI / 180;
            const x1 = cx + R * Math.cos(sa); const y1 = cy + R * Math.sin(sa);
            const x2 = cx + R * Math.cos(ea); const y2 = cy + R * Math.sin(ea);
            svgSegments += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${segAngle>180?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="url(#pbg-seg-${i})" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>`;
            // Separator line
            svgSegments += `<line x1="${cx}" y1="${cy}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;
            // Text label with icon
            const ma = ((i+0.5)*segAngle-90)*Math.PI/180;
            const tx = cx + R*0.62*Math.cos(ma); const ty = cy + R*0.62*Math.sin(ma);
            const rot = (i+0.5)*segAngle;
            const gemIconSvg = isDiamondRoulette
              ? '<svg viewBox="0 0 31 30" width="16" height="16" fill="none"><path d="M21.12 14.48L15.5 29.74c.54 0 1.07-.26 1.38-.78l9.44-15.87c.3-.5.44-1.07.43-1.62l-5.63 3.01z" fill="#0C80E3"/><path d="M26.75 11.47l-5.63 3.01L15.5.25c.79 0 1.57.3 2.17.9l8.17 8.19c.58.58.89 1.34.9 2.13z" fill="#12C0F1"/><path d="M21.12 14.48H9.88l.28-.71L15.5.25l2.05 5.2 3.57 9.03z" fill="#12C0F1"/><path d="M9.88 14.48L15.5 29.75l5.62-15.27H9.88z" fill="#12C0F1"/><path d="M15.5.25L9.88 14.48 4.25 11.47c.01-.78.32-1.55.9-2.13L13.33 1.15c.6-.6 1.39-.9 2.17-.9z" fill="#0C80E3"/><path d="M9.88 14.48L15.5 29.74c-.54 0-1.07-.26-1.38-.78L4.68 13.09c-.3-.5-.44-1.07-.43-1.62l5.63 3.01z" fill="#0C80E3"/><path d="M4.25 11.47c.01-.78.32-1.55.9-2.13l8.18-8.19c.6-.6 1.39-.9 2.17-.9l-5.62 14.23-5.63-3.01z" fill="#0C80E3"/><path d="M26.75 11.47c0 .56-.14 1.12-.43 1.62L16.88 28.96c-.29.49-.78.75-1.28.78-.57.03-1.15-.23-1.48-.78L4.68 13.09c-.3-.5-.44-1.06-.43-1.62l.03-.35c.07.25.05.77.19 1L14.11 26.61c.33.53.92.78 1.49.75.5-.03 1-.29 1.29-.75l9.7-14.74c.14-.23.06-.52.13-.77l.03.37z" fill="#0269B7"/></svg>'
              : '<svg viewBox="0 0 31 30" width="16" height="16" fill="none"><path d="M11.56 5.28L9.68 1.75h10.98l-1.89 3.53h-7.21z" fill="#5CAE39"/><path d="M9.68 1.75L1.91 9.18l4.56.56 5.09-4.46L9.68 1.75z" fill="#3C972A"/><path d="M6.47 16.73l-4.56 4.08 7.77 7.44 1.88-7.05-5.09-4.47z" fill="#3C972A"/><path d="M11.56 21.2L9.68 28.25h10.98l-1.89-7.05h-7.21z" fill="#1D801B"/><path d="M23.87 16.73l4.55 4.08-7.76 7.44-1.89-7.05 5.1-4.47z" fill="#3C972A"/><path d="M23.87 9.75l4.55-.56v11.63l-4.55-4.08V9.75z" fill="#3C972A"/><path d="M20.66 1.75l-1.89 3.53 5.1 4.47 4.55-.56-7.76-7.44z" fill="#6EC839"/><path d="M6.47 9.75L1.91 9.18v11.63l4.56-4.08V9.75z" fill="#1D801B"/><path d="M18.49 5.06h-6.53c-.27 0-.54.1-.75.28l-4.5 3.95a1.03 1.03 0 00-.39.87v6.09c0 .34.14.66.4.88l4.5 3.95c.2.18.47.28.74.28h6.53c.28 0 .54-.1.75-.28l4.5-3.95c.25-.22.4-.53.4-.87v-6.09c0-.34-.14-.66-.4-.88l-4.5-3.95a1.06 1.06 0 00-.75-.28z" fill="#80E239"/><path d="M18.91 5.06l-.07.06L6.43 16.76v-6.73c.03-.29.17-.52.38-.71l4.5-3.95c.21-.18.47-.28.75-.28h6.85z" fill="#B3F539"/></svg>';
            const ix = cx + R*0.38*Math.cos(ma); const iy = cy + R*0.38*Math.sin(ma);
            svgSegments += `<foreignObject x="${(ix-8).toFixed(1)}" y="${(iy-8).toFixed(1)}" width="16" height="16" transform="rotate(${rot},${ix.toFixed(1)},${iy.toFixed(1)})">${gemIconSvg}</foreignObject>`;
            svgSegments += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#fff" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot},${tx.toFixed(1)},${ty.toFixed(1)})" style="text-shadow:0 1px 4px rgba(0,0,0,0.8);letter-spacing:0.5px">${segments[i].label}</text>`;
          }
          // Inner circle overlay for depth
          svgSegments += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="3" filter="url(#pbg-inner-shadow)"/>`;

          // Bulbs
          const numBulbs = 24;
          let bulbsHtml = '';
          for (let i = 0; i < numBulbs; i++) {
            const a = (i * (360/numBulbs)) * Math.PI / 180;
            const bx = 50 + 48.5 * Math.cos(a); const by = 50 + 48.5 * Math.sin(a);
            bulbsHtml += `<div class="pbg-roulette-bulb ${i%2?'alt':''}" style="left:${bx}%;top:${by}%;transform:translate(-50%,-50%)"></div>`;
          }

          const wheelSvg = `<svg viewBox="0 0 260 260" width="260" height="260">${svgDefs}${svgSegments}</svg>`;
          const spinPhase = window.__pbg_roulette_phase || 0;
          const isSpinning = spinPhase === 1;

          html += `<div style="display:flex;flex-direction:column;align-items:center;padding:16px 0;min-height:320px;justify-content:center">`;

          // Always render the wheel, use JS to animate
          const currentDeg = spinPhase >= 1 ? (window.__pbg_roulette_deg || 0) : 0;
          html += `
            <div class="pbg-roulette-container ${isSpinning ? 'pbg-roulette-spinning' : ''}" ${spinPhase === 0 ? `onclick="window.__pbg('spinRoulette','${game.id}')" style="cursor:pointer"` : ''}>
              <div class="pbg-roulette-outer"><div class="pbg-roulette-outer-inner">
                <div class="pbg-roulette-wheel" id="pbg-roulette-wheel" style="transform:rotate(${spinPhase >= 2 ? currentDeg : 0}deg)">${wheelSvg}</div>
              </div></div>
              <div class="pbg-roulette-pointer"></div>
              <div class="pbg-roulette-center" style="color:${rTextColor}">${rCenterSvg}</div>
              <div class="pbg-roulette-bulbs">${bulbsHtml}</div>
            </div>
          `;

          if (spinPhase === 0) {
            html += `<div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:20px;font-weight:600">Toque na roleta para girar</div>`;
          } else if (spinPhase === 1) {
            html += `<div style="font-size:15px;color:#fbbf24;margin-top:20px;font-weight:700;animation:pbg-glow-pulse 0.8s ease-in-out infinite">✨ Girando...</div>`;
          } else if (spinPhase >= 2) {
            const prizeLabel = miniGameResult.prize?.label || '';
            const prizeType = miniGameResult.prize?.type || '';
            const revealIcon = isDiamondRoulette ? inlIcon('diamond',44) : inlIcon('gem',44);
            if (prizeType !== 'nothing') {
              html += `
                <div class="pbg-prize-text" style="margin-top:20px;background:linear-gradient(145deg,rgba(20,20,30,0.97),rgba(10,10,18,0.95));border:2px solid ${rGlow};border-radius:16px;padding:18px 28px;box-shadow:0 4px 30px ${rGlow}44,0 0 60px ${rGlow}18;display:flex;flex-direction:column;align-items:center;gap:10px;animation:pbg-prize-reveal 0.6s ease-out">
                  <div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;color:${rTextColor};filter:drop-shadow(0 0 14px ${rGlow});animation:pbg-glow-pulse 2s ease-in-out infinite">${revealIcon}</div>
                  <div style="font-size:24px;font-weight:900;color:#fff;text-shadow:0 0 24px ${rGlow}">${prizeLabel}!</div>
                  <div style="font-size:11px;color:${rTextColor};font-weight:600;text-transform:uppercase;letter-spacing:0.1em">${isDiamondRoulette ? 'Diamantes' : 'Gemas'} adicionados à carteira</div>
                </div>`;
            } else {
              html += `<div style="font-size:20px;font-weight:700;color:rgba(255,255,255,0.5);margin-top:20px">Tente novamente!</div>`;
            }
          }
          html += `</div>`;

        }

        // Gift box game — Chest style matching reference
        else if (game.type === 'gift_box' && miniGameResult.game_data?.boxes) {
          const boxes = miniGameResult.game_data.boxes.slice(0, 3);
          const CHEST_IMG_URL = game.config?.chest_image || 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
          const glowColor = game.config?.color || 'rgba(255,215,0,0.7)';
          const isPurchaseOnlyGame = freeAtt <= 0 && game.attempt_cost_coins <= 0;
          const CHEST_SVG = `<img src="${CHEST_IMG_URL}" width="100" height="100" style="filter:saturate(0) brightness(0.55) contrast(1.2);object-fit:contain;transition:transform 0.3s" alt="chest"/>`;
          const CHEST_OPEN_SVG = `<img src="${CHEST_IMG_URL}" width="100" height="100" style="filter:saturate(0.8) brightness(1.1) drop-shadow(0 0 18px ${glowColor});object-fit:contain;transition:transform 0.3s" alt="chest open"/>`;

          if (isPurchaseOnlyGame) {
            // Single chest with opening animation
            const isOpened = giftBoxOpened !== null;
            const animPhase = window.__pbg_chest_phase || 0; // 0=idle, 1=shaking, 2=burst, 3=revealed

            html += `<div style="display:flex;flex-direction:column;align-items:center;padding:16px 0;min-height:200px;justify-content:center">`;

            if (animPhase === 0 && !isOpened) {
              // Idle — tap to open
              html += `
                <div onclick="window.__pbg('animateChest',0)" style="cursor:pointer;transition:transform 0.2s">
                  <img src="${CHEST_IMG_URL}" width="130" height="130" style="filter:saturate(0) brightness(0.55) contrast(1.2);object-fit:contain;transition:transform 0.3s" alt="chest"/>
                </div>
                <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:12px">Toque no baú para abrir</div>
              `;
            } else if (animPhase === 1) {
              // Phase 1 — Shaking
              html += `
                <div style="position:relative">
                  <img src="${CHEST_IMG_URL}" width="130" height="130" class="pbg-chest-opening" style="object-fit:contain" alt="chest"/>
                </div>
              `;
            } else if (animPhase === 2) {
              // Phase 2 — Burst open with rays
              html += `
                <div style="position:relative;display:flex;align-items:center;justify-content:center">
                  <div class="pbg-chest-rays-el" style="position:absolute;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,${glowColor} 0%,${glowColor}66 20%,${glowColor}22 45%,transparent 70%);pointer-events:none"></div>
                  <div style="position:absolute;pointer-events:none">
                    ${[0,60,120,180,240,300].map(deg => `<div style="position:absolute;width:3px;height:30px;background:linear-gradient(to top,${glowColor},transparent);transform:rotate(${deg}deg) translateY(-60px);opacity:0;animation:pbg-chest-sparkle 1s ${deg/600}s ease-out forwards"></div>`).join('')}
                  </div>
                  <img src="${CHEST_IMG_URL}" width="130" height="130" class="pbg-chest-burst" style="object-fit:contain;position:relative;z-index:2" alt="chest"/>
                </div>
              `;
            } else if (animPhase >= 3 || isOpened) {
              // Phase 3 — Prize revealed with popup style
              const prizeLabel = miniGameResult.prize?.label || '';
              const prizeType = miniGameResult.prize?.type || '';
              const prizeColor = prizeType === 'nothing' ? 'rgba(255,255,255,0.5)' : glowColor;
              const isDiamondPrize = game.name && game.name.toLowerCase().includes('diamante');
              const revealIcon = isDiamondPrize ? inlIcon('diamond',44) : inlIcon('gem',44);
              const revealIconColor = isDiamondPrize ? '#22d3ee' : '#81ff61';
              const revealGlow = isDiamondPrize ? 'rgba(34,211,238,0.5)' : 'rgba(131,245,57,0.5)';
              html += `
                <div style="position:relative;display:flex;align-items:center;justify-content:center">
                  <div style="position:absolute;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,${glowColor}55 0%,${glowColor}18 50%,transparent 70%);animation:pbg-glow-pulse 2s ease-in-out infinite"></div>
                  <img src="${CHEST_IMG_URL}" width="110" height="110" style="filter:saturate(0.8) brightness(1.1) drop-shadow(0 0 24px ${glowColor});object-fit:contain;position:relative;z-index:2" alt="chest open"/>
                </div>
                ${prizeType !== 'nothing' ? `
                <div class="pbg-prize-text" style="margin-top:18px;background:linear-gradient(145deg,rgba(20,20,30,0.97),rgba(10,10,18,0.95));border:1.5px solid ${revealGlow};border-radius:16px;padding:18px 24px;box-shadow:0 4px 30px ${revealGlow}44,0 0 60px ${revealGlow}18;display:flex;flex-direction:column;align-items:center;gap:10px;animation:pbg-prize-reveal 0.6s ease-out">
                  <div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;color:${revealIconColor};filter:drop-shadow(0 0 12px ${revealGlow});animation:pbg-glow-pulse 2s ease-in-out infinite">${revealIcon}</div>
                  <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.03em;text-shadow:0 0 20px ${revealGlow}">${prizeLabel}!</div>
                  <div style="font-size:11px;color:${revealIconColor};font-weight:600;text-transform:uppercase;letter-spacing:0.1em">${isDiamondPrize ? 'Diamantes' : 'Gemas'} adicionados à sua carteira</div>
                </div>
                ` : `
                <div class="pbg-prize-text" style="font-size:20px;font-weight:700;color:${prizeColor};margin-top:16px;letter-spacing:0.03em">
                  Tente novamente!
                </div>
                `}
              `;
            }
            html += `</div>`;
          } else {
            // Classic 3-chest mode for free games
            html += `<div class="pbg-gift-grid">`;
            boxes.forEach((box, i) => {
              const opened = giftBoxOpened === i;
              const otherOpened = giftBoxOpened !== null && giftBoxOpened !== i;
              const isWin = box.winning;
              html += `
                <div class="pbg-gift-box ${opened ? 'opened' : ''} ${opened && isWin ? 'won' : ''} ${otherOpened ? 'opened' : ''}"
                     onclick="${giftBoxOpened === null ? `window.__pbg('openGiftBox',${i})` : ''}"
                     style="border:none;background:transparent;width:auto;height:auto">
                  ${opened && isWin
                    ? `<div style="position:relative;display:flex;align-items:center;justify-content:center">
                        <div style="position:absolute;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(255,215,0,0.4) 0%,rgba(255,165,0,0.15) 50%,transparent 70%);animation:pbg-glow-pulse 1.5s ease-in-out infinite"></div>
                        ${CHEST_OPEN_SVG}
                      </div>`
                    : opened
                      ? `<div style="opacity:0.4">${CHEST_SVG}</div>`
                      : (otherOpened ? `<div style="opacity:0.3">${CHEST_SVG}</div>` : CHEST_SVG)
                  }
                </div>
              `;
            });
            html += `</div>`;

            // Result message (centered below chests)
            if (giftBoxOpened !== null && giftBoxOpened >= 0 && giftBoxOpened < boxes.length) {
              const box = boxes[giftBoxOpened];
              html += `<div style="text-align:center;width:100%;font-size:20px;font-weight:800;color:${box.winning ? '#f5ae00' : 'rgba(255,255,255,0.7)'};margin:20px 0 8px;letter-spacing:0.02em">${box.winning ? `${miniGameResult.prize?.label}!` : 'Tente novamente'}</div>`;
            }
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
        const hasPurchasedPlays = (att?.purchased_attempts || 0) > 0;
        const canPlayAgain = isFree || hasPurchasedPlays || (game.attempt_cost_coins > 0 && coins >= game.attempt_cost_coins);
        html += `
          <div style="text-align:center;margin-top:16px">
            <button class="pbg-modal-btn" ${maxReached || !canPlayAgain ? 'disabled' : ''}
                    onclick="window.__pbg('playMiniGame','${game.id}')">
              ${maxReached ? 'Limite atingido' : !canPlayAgain ? 'Sem aberturas' : inlIcon('refresh',14)+' '+(game.name&&game.name.toLowerCase().includes('roleta')?'Girar Roleta':'Abrir Baú')}
            </button>
          </div>
        `;
      } else if (!miniGamePlaying) {
        // Show play button (initial state)
        if (isRouletteGame && isChestGame) {
          // Roulette initial state — show static wheel with play button
          const isDiamondR2 = game.name.toLowerCase().includes('diamante');
          const r2Colors = isDiamondR2
            ? ['#0e7490','#155e75','#164e63','#0c4a6e','#075985','#0369a1','#0284c7','#0ea5e9','#22d3ee','#06b6d4']
            : ['#166534','#15803d','#16a34a','#22c55e','#4ade80','#065f46','#047857','#059669','#10b981','#34d399'];
          const r2CenterSvg = isDiamondR2 ? inlIcon('diamond',22) : inlIcon('gem',22);
          const r2TextColor = isDiamondR2 ? '#22d3ee' : '#81ff61';
          const r2Prizes = gamePrizes.filter(p => p.type !== 'nothing');
          const r2Segments = r2Prizes.length > 0 ? r2Prizes : [{label:'1 Gema'},{label:'2 Gemas'},{label:'3 Gemas'},{label:'4 Gemas'},{label:'5 Gemas'},{label:'6 Gemas'},{label:'7 Gemas'},{label:'8 Gemas'}];
          const r2n = r2Segments.length;
          const r2Angle = 360 / r2n;
          const R2 = 130; const cx2 = 130; const cy2 = 130;
          let r2Defs = '<defs>';
          for (let i = 0; i < r2n; i++) {
            const c = r2Colors[i % r2Colors.length];
            r2Defs += `<linearGradient id="pbg-iseg-${i}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c}"/><stop offset="100%" stop-color="${c}aa"/></linearGradient>`;
          }
          r2Defs += '</defs>';
          let r2Svg = '';
          const r2GemIcon = isDiamondR2
            ? '<svg viewBox="0 0 31 30" width="16" height="16" fill="none"><path d="M21.12 14.48L15.5 29.74c.54 0 1.07-.26 1.38-.78l9.44-15.87c.3-.5.44-1.07.43-1.62l-5.63 3.01z" fill="#0C80E3"/><path d="M26.75 11.47l-5.63 3.01L15.5.25c.79 0 1.57.3 2.17.9l8.17 8.19c.58.58.89 1.34.9 2.13z" fill="#12C0F1"/><path d="M21.12 14.48H9.88l.28-.71L15.5.25l2.05 5.2 3.57 9.03z" fill="#12C0F1"/><path d="M9.88 14.48L15.5 29.75l5.62-15.27H9.88z" fill="#12C0F1"/><path d="M15.5.25L9.88 14.48 4.25 11.47c.01-.78.32-1.55.9-2.13L13.33 1.15c.6-.6 1.39-.9 2.17-.9z" fill="#0C80E3"/><path d="M9.88 14.48L15.5 29.74c-.54 0-1.07-.26-1.38-.78L4.68 13.09c-.3-.5-.44-1.07-.43-1.62l5.63 3.01z" fill="#0C80E3"/><path d="M4.25 11.47c.01-.78.32-1.55.9-2.13l8.18-8.19c.6-.6 1.39-.9 2.17-.9l-5.62 14.23-5.63-3.01z" fill="#0C80E3"/><path d="M26.75 11.47c0 .56-.14 1.12-.43 1.62L16.88 28.96c-.29.49-.78.75-1.28.78-.57.03-1.15-.23-1.48-.78L4.68 13.09c-.3-.5-.44-1.06-.43-1.62l.03-.35c.07.25.05.77.19 1L14.11 26.61c.33.53.92.78 1.49.75.5-.03 1-.29 1.29-.75l9.7-14.74c.14-.23.06-.52.13-.77l.03.37z" fill="#0269B7"/></svg>'
            : '<svg viewBox="0 0 31 30" width="16" height="16" fill="none"><path d="M11.56 5.28L9.68 1.75h10.98l-1.89 3.53h-7.21z" fill="#5CAE39"/><path d="M9.68 1.75L1.91 9.18l4.56.56 5.09-4.46L9.68 1.75z" fill="#3C972A"/><path d="M6.47 16.73l-4.56 4.08 7.77 7.44 1.88-7.05-5.09-4.47z" fill="#3C972A"/><path d="M11.56 21.2L9.68 28.25h10.98l-1.89-7.05h-7.21z" fill="#1D801B"/><path d="M23.87 16.73l4.55 4.08-7.76 7.44-1.89-7.05 5.1-4.47z" fill="#3C972A"/><path d="M23.87 9.75l4.55-.56v11.63l-4.55-4.08V9.75z" fill="#3C972A"/><path d="M20.66 1.75l-1.89 3.53 5.1 4.47 4.55-.56-7.76-7.44z" fill="#6EC839"/><path d="M6.47 9.75L1.91 9.18v11.63l4.56-4.08V9.75z" fill="#1D801B"/><path d="M18.49 5.06h-6.53c-.27 0-.54.1-.75.28l-4.5 3.95a1.03 1.03 0 00-.39.87v6.09c0 .34.14.66.4.88l4.5 3.95c.2.18.47.28.74.28h6.53c.28 0 .54-.1.75-.28l4.5-3.95c.25-.22.4-.53.4-.87v-6.09c0-.34-.14-.66-.4-.88l-4.5-3.95a1.06 1.06 0 00-.75-.28z" fill="#80E239"/><path d="M18.91 5.06l-.07.06L6.43 16.76v-6.73c.03-.29.17-.52.38-.71l4.5-3.95c.21-.18.47-.28.75-.28h6.85z" fill="#B3F539"/></svg>';
          for (let i = 0; i < r2n; i++) {
            const sa = (i * r2Angle - 90) * Math.PI / 180;
            const ea = ((i + 1) * r2Angle - 90) * Math.PI / 180;
            const x1 = cx2 + R2 * Math.cos(sa); const y1 = cy2 + R2 * Math.sin(sa);
            const x2 = cx2 + R2 * Math.cos(ea); const y2 = cy2 + R2 * Math.sin(ea);
            r2Svg += `<path d="M${cx2},${cy2} L${x1.toFixed(1)},${y1.toFixed(1)} A${R2},${R2} 0 ${r2Angle>180?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="url(#pbg-iseg-${i})" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>`;
            r2Svg += `<line x1="${cx2}" y1="${cy2}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;
            const ma = ((i+0.5)*r2Angle-90)*Math.PI/180;
            const ix = cx2+R2*0.38*Math.cos(ma); const iy = cy2+R2*0.38*Math.sin(ma);
            const tx = cx2+R2*0.62*Math.cos(ma); const ty = cy2+R2*0.62*Math.sin(ma);
            const rot = (i+0.5)*r2Angle;
            r2Svg += `<foreignObject x="${(ix-8).toFixed(1)}" y="${(iy-8).toFixed(1)}" width="16" height="16" transform="rotate(${rot},${ix.toFixed(1)},${iy.toFixed(1)})">${r2GemIcon}</foreignObject>`;
            r2Svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#fff" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot},${tx.toFixed(1)},${ty.toFixed(1)})" style="text-shadow:0 1px 4px rgba(0,0,0,0.8)">${r2Segments[i].label}</text>`;
          }
          let r2Bulbs = '';
          for (let i = 0; i < 24; i++) {
            const a = (i*(360/24))*Math.PI/180;
            r2Bulbs += `<div class="pbg-roulette-bulb ${i%2?'alt':''}" style="left:${50+48.5*Math.cos(a)}%;top:${50+48.5*Math.sin(a)}%;transform:translate(-50%,-50%)"></div>`;
          }
          const initPurchased2 = att?.purchased_attempts || 0;
          const initKeysLeft2 = Math.max(0, freeAtt - attToday) + initPurchased2;
          const initCanPlay2 = initKeysLeft2 > 0 || (game.attempt_cost_coins > 0 && coins >= game.attempt_cost_coins);
          html += `
            <div style="text-align:center;padding:10px 0 16px;display:flex;flex-direction:column;align-items:center">
              <div class="pbg-roulette-container" style="opacity:0.65;filter:saturate(0.4) brightness(0.8)">
                <div class="pbg-roulette-outer"><div class="pbg-roulette-outer-inner">
                  <div class="pbg-roulette-wheel"><svg viewBox="0 0 260 260" width="260" height="260">${r2Defs}${r2Svg}</svg></div>
                </div></div>
                <div class="pbg-roulette-pointer"></div>
                <div class="pbg-roulette-center" style="color:${r2TextColor}">${r2CenterSvg}</div>
                <div class="pbg-roulette-bulbs">${r2Bulbs}</div>
              </div>
              <div style="margin-top:16px">
                <button class="pbg-modal-btn" ${!PLAYER_CPF || maxReached || !initCanPlay2 ? 'disabled' : ''}
                        onclick="window.__pbg('playMiniGame','${game.id}')">
                  ${!PLAYER_CPF ? 'Faça login' : maxReached ? 'Limite atingido' : !initCanPlay2 ? 'Compre na Loja' : inlIcon('refresh',14)+' Girar Roleta'}
                </button>
              </div>
            </div>
          `;
        } else if (isChestGame) {
          const initChestImg = game.config?.chest_image || 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
          const INIT_CHEST_SVG = `<img src="${initChestImg}" width="100" height="100" style="filter:saturate(0) brightness(0.55) contrast(1.2);object-fit:contain;cursor:pointer;transition:transform 0.3s" alt="chest"/>`;
          const initPurchased = att?.purchased_attempts || 0;
          const initKeysLeft = Math.max(0, freeAtt - attToday) + initPurchased;
          const initCanPlay = initKeysLeft > 0 || (game.attempt_cost_coins > 0 && coins >= game.attempt_cost_coins);
          const initIsPurchaseOnly = freeAtt <= 0 && game.attempt_cost_coins <= 0;
          html += `
            <div style="text-align:center;padding:10px 0 16px">
              <div style="display:flex;justify-content:center;gap:12px;margin-bottom:16px">
                ${initIsPurchaseOnly ? INIT_CHEST_SVG : `${INIT_CHEST_SVG}${INIT_CHEST_SVG}${INIT_CHEST_SVG}`}
              </div>
              <div style="margin-top:16px">
                <button class="pbg-modal-btn" ${!PLAYER_CPF || maxReached || !initCanPlay ? 'disabled' : ''}
                        onclick="window.__pbg('playMiniGame','${game.id}')">
                  ${!PLAYER_CPF ? 'Faça login' : maxReached ? 'Limite atingido' : !initCanPlay ? 'Compre na Loja' : inlIcon('key',14)+' Abrir Baú'}
                </button>
              </div>
              ${!isFree && game.attempt_cost_coins > 0 && !maxReached ? `<div style="font-size:11px;color:#fbbf24;margin-top:8px">${inlIcon('coin',12)} Custo: ${game.attempt_cost_coins} moedas</div>` : ''}
            </div>
          `;
        } else {
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
        }
      } else {
        // Loading / playing
        html += `<div style="text-align:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div><div style="font-size:12px;color:#71717a;margin-top:12px">Jogando...</div></div>`;
      }

      // Attempts info — chest style for gift_box, classic for others
      if (!isChestGame) {
        html += `
          <div style="display:flex;justify-content:center;gap:12px;margin-top:12px">
            <span class="pbg-spin-tag" style="color:${isFree ? '#34d399' : '#f87171'}">${inlIcon('ticket',12)} Grátis: ${Math.max(0, freeAtt - attToday)}/${freeAtt}</span>
            ${maxAtt > 0 ? `<span class="pbg-spin-tag" style="color:${maxReached ? '#f87171' : '#a1a1aa'}">${inlIcon('dice',12)} ${attToday}/${maxAtt}</span>` : ''}
            ${coins > 0 ? `<span class="pbg-spin-tag" style="color:#fbbf24">${inlIcon('coin',12)} ${coins}</span>` : ''}
          </div>
        `;
      }

      return html;
    }

    // Game selection grid — reference design with chest image & action buttons
    const CHEST_IMG = 'https://d146b4m7rkvjkw.cloudfront.net/62ee214dd40e7486ffd929-image7761.webp';
    const OPEN_ICON_SVG = '<svg width="12" height="9" viewBox="0 0 23 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.36797 0.236328L11.168 1.37919L19.968 0.236328L22.168 4.80776L19.968 5.46133L14.468 7.09347L12.488 3.6649L11.168 1.37919L9.84797 3.6649L7.86797 7.09347L2.36797 5.46133L0.167969 4.80776L2.36797 0.236328ZM2.36797 13.9506V6.65061L7.56547 8.19347L8.37672 8.43276L8.80984 7.68276L11.1302 3.6649H11.2058L13.5261 7.68276L13.9592 8.43276L14.7705 8.19347L19.968 6.65061V13.9506L11.168 16.2363L2.36797 13.9506Z" fill="white"/></svg>';
    const typeLabels = { scratch_card: 'Raspadinha', gift_box: 'Baú de Fichas Douradas', prize_drop: 'Prize Drop' };

    let html = '<div class="pbg-mg-grid">';
    games.forEach(game => {
      const att = attempts.find(a => a.game_id === game.id);
      const attToday = (att && att.last_attempt_date === today) ? att.attempts_today : 0;
      const maxAtt = game.max_attempts_per_day || 1;
      const freeAtt = game.free_attempts_per_day ?? 1;
      const freeLeft = Math.max(0, freeAtt - attToday);
      const purchasedLeft = att?.purchased_attempts || 0;
      const totalAvailable = freeLeft + purchasedLeft;
      const maxReached = maxAtt > 0 && attToday >= maxAtt;
      const isPurchaseOnly = freeAtt <= 0 && game.attempt_cost_coins <= 0;

      // Hide purchase-only games when player has no purchased attempts
      if (isPurchaseOnly && purchasedLeft <= 0) return;

      const isChest = game.type === 'gift_box';
      const customImg = game.config?.chest_image;
      const imgSrc = isChest ? (customImg || CHEST_IMG) : '';

      html += `
        <div class="pbg-mg-card ${maxReached ? 'greyed' : ''}" onclick="window.__pbg('openMiniGame','${game.id}')">
          ${isChest
            ? `<img class="pbg-mg-card-img" src="${imgSrc}" alt="${game.name}" draggable="false" loading="lazy" />`
            : `<div class="pbg-mg-icon">${game.type === 'scratch_card' ? inlIcon('card',36) : game.type === 'prize_drop' ? inlIcon('target',36) : inlIcon('gamepad',36)}</div>`
          }
          <div class="pbg-mg-name">${game.name}</div>
          <div class="pbg-mg-type">${game.description || typeLabels[game.type] || game.type}</div>
          <div class="pbg-mg-actions">
            ${freeLeft > 0 ? `<button class="pbg-mg-btn-free" onclick="event.stopPropagation();window.__pbg('openMiniGame','${game.id}')">GRÁTIS</button>` : ''}
            <button class="pbg-mg-btn-open" onclick="event.stopPropagation();window.__pbg('openMiniGame','${game.id}')">
              ${OPEN_ICON_SVG}
              <span>ABRIR (${totalAvailable})</span>
            </button>
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
    const sFilter = window.__pbg_store_filter || 'all';

    // Determine primary currency for each item
    const getCurrency = (item) => {
      if (item.price_diamonds > 0 && !item.price_coins) return 'diamonds';
      if (item.price_xp > 0 && !item.price_coins && !item.price_diamonds) return 'gems';
      return 'coins';
    };

    // Check if item has a discount (original prices stored in description or reward_description)
    const getDiscount = (item) => {
      if (item.discount_percent) return item.discount_percent;
      return 0;
    };

    // Filter items
    let filtered = items;
    if (sFilter === 'offers') filtered = items.filter(i => getDiscount(i) > 0);
    else if (sFilter === 'coins') filtered = items.filter(i => getCurrency(i) === 'coins');
    else if (sFilter === 'diamonds') filtered = items.filter(i => getCurrency(i) === 'diamonds');
    else if (sFilter === 'gems') filtered = items.filter(i => getCurrency(i) === 'gems');

    // Group by currency
    const groups = { coins: [], diamonds: [], gems: [] };
    filtered.forEach(i => { const c = getCurrency(i); if (groups[c]) groups[c].push(i); });

    // Promotional items (with discount)
    const promos = filtered.filter(i => getDiscount(i) > 0);

    // Render a single card
    const renderCard = (item) => {
      const idx = items.indexOf(item);
      const canAffordCoins = !item.price_coins || coins >= item.price_coins;
      const canAffordDiamonds = !item.price_diamonds || walletDiamonds >= item.price_diamonds;
      const canBuy = canAffordCoins && canAffordDiamonds;
      const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
      const disc = getDiscount(item);
      const cur = getCurrency(item);
      const priceClasses = { coins: 'pbg-store-price-coins', diamonds: 'pbg-store-price-diamonds', gems: 'pbg-store-price-gems' };
      const curLabels = { coins: 'COINS', diamonds: 'DIAMONDS', gems: 'GEMS' };
      const curIcons = { coins: inlIcon('coin',13), diamonds: inlIcon('diamond',13), gems: inlIcon('gem',13) };
      const price = item.price_coins || item.price_diamonds || item.price_xp || 0;
      const origPrice = disc > 0 ? Math.round(price / (1 - disc / 100)) : 0;

      return `
        <div class="pbg-store-item pbg-store-${cur} ${!canBuy || outOfStock ? 'greyed' : ''}" onclick="window.__pbg('openStore',${idx})">
          ${disc > 0 ? `<div class="pbg-store-item-discount">DESCONTO ${String(disc).padStart(2,'0')}%</div>` : ''}
          <div class="pbg-store-item-img">
            ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" crossorigin="anonymous" onerror="this.onerror=null;fetch(this.src).then(r=>r.blob()).then(b=>{this.src=URL.createObjectURL(b)}).catch(()=>{this.style.display='none'})">` : '<div style="width:56px;height:56px;color:#a78bfa">' + ICONS.giftbox + '</div>'}
          </div>
          <div class="pbg-store-item-body">
            <div class="pbg-store-item-name">${item.name}</div>
            <div class="pbg-store-item-desc">${item.description || ''}</div>
            <div class="pbg-store-item-footer">
              <div class="pbg-store-item-price ${priceClasses[cur]}">
                ${curIcons[cur]}
                <div style="min-width:0">
                  ${disc > 0 ? `<div class="pbg-store-item-price-old">${origPrice.toLocaleString('pt-BR')}</div>` : ''}
                  <div class="pbg-store-item-price-val">${price.toLocaleString('pt-BR')} <span class="pbg-store-item-price-lbl">${curLabels[cur]}</span></div>
                </div>
              </div>
              <button class="pbg-store-cart-btn" onclick="event.stopPropagation();window.__pbg('openStore',${idx})">${inlIcon('cartPlus',15)}</button>
            </div>
          </div>
        </div>
      `;
    };

    // Section renderer
    const sectionIcons = {
      coins: inlIcon('coin',22),
      diamonds: inlIcon('diamond',22),
      gems: inlIcon('gem',22),
      promos: inlIcon('zap',22),
    };
    const renderSection = (sectionKey, title, itemsList) => {
      if (!itemsList.length) return '';
      return `
        <div class="pbg-store-section">
          <div class="pbg-store-section-icon">${sectionIcons[sectionKey] || inlIcon('star',22)}</div>
          <div class="pbg-store-section-title">${title}</div>
          <button class="pbg-store-section-more" onclick="window.__pbg_store_filter='${sectionKey}';window.__pbg('tab','store')">VER MAIS</button>
        </div>
        <div class="pbg-store-scroll">${itemsList.map(i => renderCard(i)).join('')}</div>
      `;
    };

    let html = `
      <div class="pbg-store-filters">
        <button class="pbg-store-filter ${sFilter === 'all' ? 'active' : ''}" onclick="window.__pbg_store_filter='all';window.__pbg('tab','store')">Todos</button>
        <button class="pbg-store-filter ${sFilter === 'offers' ? 'active' : ''}" onclick="window.__pbg_store_filter='offers';window.__pbg('tab','store')">Ofertas</button>
        <button class="pbg-store-filter ${sFilter === 'coins' ? 'active' : ''}" onclick="window.__pbg_store_filter='coins';window.__pbg('tab','store')">Coins</button>
        <button class="pbg-store-filter ${sFilter === 'diamonds' ? 'active' : ''}" onclick="window.__pbg_store_filter='diamonds';window.__pbg('tab','store')">Diamantes</button>
        <button class="pbg-store-filter ${sFilter === 'gems' ? 'active' : ''}" onclick="window.__pbg_store_filter='gems';window.__pbg('tab','store')">Gemas</button>
      </div>
    `;

    if (sFilter === 'all') {
      if (promos.length > 0) html += renderSection('promos', 'Ofertas', promos);
      if (groups.coins.length > 0) html += renderSection('coins', 'Coins', groups.coins);
      if (groups.diamonds.length > 0) html += renderSection('diamonds', 'Diamonds', groups.diamonds);
      if (groups.gems.length > 0) html += renderSection('gems', 'Gems', groups.gems);
    } else {
      html += `<div class="pbg-store-scroll">${filtered.map(i => renderCard(i)).join('')}</div>`;
      if (!filtered.length) html += '<div style="text-align:center;padding:30px;color:#52525b;font-size:12px">Nenhum item nesta categoria</div>';
    }

    if (selectedStoreItem !== null) {
      const item = items[selectedStoreItem];
      if (item) {
        const cur = getCurrency(item);
        const price = item.price_coins || item.price_diamonds || item.price_xp || 0;
        const walletAmount = cur === 'coins' ? coins : cur === 'diamonds' ? walletDiamonds : (data?.wallet?.xp || 0);
        const canBuy = walletAmount >= price;
        const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
        const curColors = { coins: 'rgb(255,155,80)', diamonds: 'rgb(0,201,255)', gems: 'rgb(129,255,161)' };
        const curNames = { coins: 'Coins', diamonds: 'Diamonds', gems: 'Gems' };
        const curIconKeys = { coins: 'coin', diamonds: 'diamond', gems: 'star' };
        const insufficientMsg = curNames[cur] + ' insuficientes';
        html += `
          <div class="pbg-modal-overlay" onclick="window.__pbg('closeStore')">
            <div class="pbg-modal" onclick="event.stopPropagation()">
              ${item.image_url ? `<img src="${item.image_url}" crossorigin="anonymous" onerror="this.onerror=null;fetch(this.src).then(r=>r.blob()).then(b=>{this.src=URL.createObjectURL(b)}).catch(()=>{this.style.display='none'})" style="width:80px;height:80px;object-fit:contain;border-radius:12px;margin:0 auto 12px">` : '<div style="width:48px;height:48px;margin:0 auto 12px;color:#a78bfa">' + ICONS.giftbox + '</div>'}
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
                <span style="font-size:14px;font-weight:700;color:${curColors[cur]}">${inlIcon(curIconKeys[cur],14)} ${price.toLocaleString('pt-BR')} ${curNames[cur]}</span>
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

  function renderReferral() {
    if (!PLAYER_CPF) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.userPlus}</div><div style="font-size:13px">Faça login para acessar o programa de indicação</div></div>`;

    const cfg = data?.referral_config;
    if (!cfg) return `<div style="text-align:center;padding:40px;color:#52525b"><div style="width:40px;height:40px;margin:0 auto;opacity:0.5;color:#71717a">${ICONS.userPlus}</div><div style="font-size:13px">Programa de indicação indisponível</div></div>`;

    const code = data?.referral_code;
    const refs = data?.referrals || [];
    const completedRefs = refs.filter(r => r.status === 'completed');
    const pendingRefs = refs.filter(r => r.status !== 'completed');
    const totalEarned = refs.reduce((s, r) => s + (r.referrer_reward_amount || 0), 0);
    const tiers = cfg.tiers || [];

    const rewardTypeLabel = (type) => ({ coins: 'Moedas', xp: 'XP', diamonds: 'Diamantes', bonus: 'Bônus R$' }[type] || type);
    const rewardTypeColor = (type) => ({ coins: '#fbbf24', xp: '#8b5cf6', diamonds: '#22d3ee', bonus: '#34d399' }[type] || '#8b5cf6');
    const rewardIcon = (type) => ({ coins: inlIcon('coin',16), xp: inlIcon('star',16), diamonds: inlIcon('diamond',16), bonus: inlIcon('money',16) }[type] || inlIcon('gift',16));

    const siteUrl = 'https://pixbingobr.com';
    const refLink = code ? `${siteUrl}/registrar/${code.code}` : '';
    const statusLabel = (s) => ({ completed: 'Concluído', pending: 'Pendente', deposit_required: 'Aguardando depósito', bet_required: 'Aguardando aposta', expired: 'Expirado' }[s] || s);
    const statusClass = (s) => ({ completed: 'completed', pending: 'pending', deposit_required: 'deposit', bet_required: 'deposit' }[s] || 'pending');

    // Auto-generate code if player doesn't have one yet
    if (!code && !window.__pbg_ref_generating) {
      window.__pbg_ref_generating = true;
      apiCall('referral_generate').then(result => {
        window.__pbg_ref_generating = false;
        if (!result.error) fetchData();
      }).catch(() => { window.__pbg_ref_generating = false; });
    }

    let codeSection = '';
    if (!code) {
      codeSection = `
        <div style="text-align:center;padding:20px">
          <div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div>
          <div style="font-size:12px;color:#71717a;margin-top:8px">Gerando seu código...</div>
        </div>
      `;
    } else {
      codeSection = `
        <div class="pbg-ref-code-box">
          <div class="pbg-ref-code-label">Seu código</div>
          <div class="pbg-ref-code-value">${code.code}</div>
        </div>
        <div class="pbg-ref-link-box">
          <span style="color:#71717a;flex-shrink:0">${inlIcon('link',14)}</span>
          <span class="pbg-ref-link-text">${refLink}</span>
          <button class="pbg-ref-btn pbg-ref-btn-outline pbg-ref-btn-sm" onclick="window.__pbg('copyReferral','${refLink}')">
            ${inlIcon('copy',12)} Copiar
          </button>
        </div>
        <div class="pbg-ref-share-btns">
          <button class="pbg-ref-share-btn pbg-ref-share-whatsapp" onclick="window.open('https://wa.me/?text='+encodeURIComponent('Jogue na PixBingoBR e ganhe bônus! Use meu código: ${code.code}\\n${refLink}'),'_blank')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            WhatsApp
          </button>
          <button class="pbg-ref-share-btn pbg-ref-share-telegram" onclick="window.open('https://t.me/share/url?url='+encodeURIComponent('${refLink}')+'&text='+encodeURIComponent('Jogue na PixBingoBR! Use meu código ${code.code} e ganhe bônus!'),'_blank')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Telegram
          </button>
          <button class="pbg-ref-share-btn pbg-ref-share-copy" onclick="window.__pbg('copyReferral','${refLink}')">
            ${inlIcon('copy',12)} Copiar
          </button>
        </div>
      `;
    }

    // Stats section
    const statsSection = `
      <div class="pbg-ref-stats">
        <div class="pbg-ref-stat">
          <div class="pbg-ref-stat-val" style="color:#8b5cf6">${refs.length}</div>
          <div class="pbg-ref-stat-lbl">Indicados</div>
        </div>
        <div class="pbg-ref-stat">
          <div class="pbg-ref-stat-val" style="color:#34d399">${completedRefs.length}</div>
          <div class="pbg-ref-stat-lbl">Completos</div>
        </div>
        <div class="pbg-ref-stat">
          <div class="pbg-ref-stat-val" style="color:#fbbf24">${totalEarned}</div>
          <div class="pbg-ref-stat-lbl">Ganhos</div>
        </div>
      </div>
    `;

    // Tiers section
    let tiersHtml = '';
    if (tiers.length > 0) {
      tiersHtml = `
        <div class="pbg-section-title" style="margin-top:4px">${inlIcon('trophy',14)} Metas de Indicação</div>
        ${tiers.map((tier, idx) => {
          const pct = Math.min(100, (completedRefs.length / tier.min_referrals) * 100);
          const reached = completedRefs.length >= tier.min_referrals;
          const alreadyClaimed = (data?.activity_log || []).some(a => a.source === 'referral_tier_' + idx);
          const claimable = reached && !alreadyClaimed;
          return `
            <div class="pbg-ref-tier ${reached ? 'completed' : ''} ${claimable ? 'claimable' : ''}">
              <div style="width:28px;height:28px;border-radius:50%;background:${reached ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${reached ? '#34d399' : '#52525b'}">
                ${reached ? inlIcon('check',14) : inlIcon('target',14)}
              </div>
              <div class="pbg-ref-tier-progress">
                <div class="pbg-ref-tier-label">${tier.label}</div>
                <div class="pbg-ref-tier-bar"><div class="pbg-ref-tier-fill" style="width:${pct}%;background:${reached ? '#34d399' : '#8b5cf6'}"></div></div>
                <div style="font-size:9px;color:#52525b;margin-top:2px">${completedRefs.length}/${tier.min_referrals} indicações</div>
              </div>
              ${claimable ? `<button class="pbg-ref-btn pbg-ref-btn-primary pbg-ref-btn-sm" onclick="window.__pbg('claimTier',${idx})" style="flex-shrink:0;width:auto">Resgatar</button>` : ''}
              ${alreadyClaimed ? `<span style="font-size:10px;color:#34d399;font-weight:600;flex-shrink:0">${inlIcon('check',12)} Resgatado</span>` : ''}
            </div>
          `;
        }).join('')}
      `;
    }

    // Referrals list
    let referralsList = '';
    if (refs.length > 0) {
      referralsList = `
        <div class="pbg-section-title" style="margin-top:4px">${inlIcon('users',14)} Seus Indicados (${refs.length})</div>
        ${refs.slice(0, 20).map(r => `
          <div class="pbg-ref-referral-item">
            <div class="pbg-ref-referral-avatar">${(r.referred_cpf || '').slice(-2)}</div>
            <div class="pbg-ref-referral-info">
              <div class="pbg-ref-referral-cpf">${maskCpf(r.referred_cpf)}</div>
              <div class="pbg-ref-referral-date">${timeAgo(r.created_at)}</div>
            </div>
            <span class="pbg-ref-status pbg-ref-status-${statusClass(r.status)}">${statusLabel(r.status)}</span>
          </div>
        `).join('')}
      `;
    }

    return `
      <div class="pbg-ref-banner">
        <div style="font-size:28px;margin-bottom:6px">${inlIcon('gift',28)}</div>
        <div class="pbg-ref-banner-title">${cfg.title || 'Indique e Ganhe'}</div>
        <div class="pbg-ref-banner-desc">${cfg.description || 'Convide amigos e ganhe recompensas!'}</div>
        <div class="pbg-ref-rewards-row">
          <div class="pbg-ref-reward-card">
            <div class="pbg-ref-reward-card-label">Você ganha</div>
            <div class="pbg-ref-reward-card-value" style="color:${rewardTypeColor(cfg.referrer_reward_type)}">${rewardIcon(cfg.referrer_reward_type)} ${cfg.referrer_reward_value}</div>
            <div class="pbg-ref-reward-card-type">${rewardTypeLabel(cfg.referrer_reward_type)}</div>
          </div>
          <div class="pbg-ref-reward-card">
            <div class="pbg-ref-reward-card-label">Amigo ganha</div>
            <div class="pbg-ref-reward-card-value" style="color:${rewardTypeColor(cfg.referred_reward_type)}">${rewardIcon(cfg.referred_reward_type)} ${cfg.referred_reward_value}</div>
            <div class="pbg-ref-reward-card-type">${rewardTypeLabel(cfg.referred_reward_type)}</div>
          </div>
        </div>
      </div>

      ${codeSection}
      ${code ? statsSection : ''}
      ${code ? tiersHtml : ''}
      ${code ? referralsList : ''}

      ${cfg.require_deposit || cfg.require_bet ? `<div style="display:flex;align-items:flex-start;gap:6px;padding:8px 12px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.15);border-radius:8px;margin-top:8px">
        <span style="color:#60a5fa;flex-shrink:0;margin-top:1px">${inlIcon('zap',14)}</span>
        <span style="font-size:11px;color:#93c5fd;line-height:1.5">Seu amigo precisa${cfg.require_deposit ? ` depositar no mínimo R$ ${Number(cfg.min_deposit_amount).toFixed(2)}` : ''}${cfg.require_deposit && cfg.require_bet ? ' e' : ''}${cfg.require_bet ? ` apostar no mínimo R$ ${Number(cfg.min_bet_amount).toFixed(2)}` : ''} para completar a indicação</span>
      </div>` : ''}

      ${cfg.terms_text ? `<div class="pbg-ref-terms">${cfg.terms_text}</div>` : ''}
    `;
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

    const iconBase = 'https://backofficepixbingobr.vercel.app';
    const lvInfo = getLevelInfo();
    const sorted = [...levels].sort((a,b) => getLevelNumber(a) - getLevelNumber(b));
    const playerXp = data?.wallet?.xp || 0;

    // Resolve icon URL with base
    const resolveIcon = (url) => {
      if (!url) return '';
      if (url.startsWith('http')) return url;
      return iconBase + url;
    };

    // Group levels by tier
    const tierOrder = ['Iniciante','Bronze','Prata','Ouro','Titanio','Platina','Rubi','Diamante','Black','Elite','Lendario','Supremo'];
    const tierColors = { Iniciante:'#71717a', Bronze:'#cd7f32', Prata:'#c0c0c0', Ouro:'#ffd700', Titanio:'#878681', Platina:'#e5e4e2', Rubi:'#e0115f', Diamante:'#06b6d4', Black:'#1a1a2e', Elite:'#7c3aed', Lendario:'#f59e0b', Supremo:'#ef4444' };
    const tiers = {};
    sorted.forEach(lvl => {
      const t = lvl.tier || 'Outro';
      if (!tiers[t]) tiers[t] = [];
      tiers[t].push(lvl);
    });
    const tierKeys = tierOrder.filter(t => tiers[t]);
    // Add any tiers not in the predefined order
    Object.keys(tiers).forEach(t => { if (!tierKeys.includes(t)) tierKeys.push(t); });

    // Find current tier for auto-expand
    const currentTier = lvInfo?.current?.tier || '';

    // Selected level detail overlay
    let detailHtml = '';
    if (selectedLevel !== null) {
      const sl = sorted.find(l => getLevelNumber(l) === selectedLevel);
      if (sl) {
        const slXp = getLevelXp(sl);
        const isCompleted = playerXp >= slXp;
        const isCurrent = lvInfo && getLevelNumber(lvInfo.current) === getLevelNumber(sl);
        const isLocked = !isCompleted && !isCurrent;
        const col = sl.color || tierColors[sl.tier] || '#8b5cf6';
        const hasRewards = (sl.reward_coins > 0 || sl.reward_gems > 0 || sl.reward_diamonds > 0);

        detailHtml = `
          <div class="pbg-lvl-detail-overlay" onclick="if(event.target===this)window.__pbg('closeLevel')">
            <div class="pbg-lvl-detail-card">
              <button class="pbg-lvl-detail-close" onclick="window.__pbg('closeLevel')">${inlIcon('x',14)}</button>
              <div class="pbg-lvl-detail-icon"><img src="${resolveIcon(sl.icon_url)}" alt="" style="${isLocked ? 'filter:grayscale(1) brightness(0.5)' : 'filter:drop-shadow(0 2px 8px '+col+'80)'}"></div>
              <div class="pbg-lvl-detail-name">${sl.name}</div>
              <div class="pbg-lvl-detail-tier" style="color:${col}">${sl.tier}</div>
              <div class="pbg-lvl-detail-xp">${slXp.toLocaleString('pt-BR')} XP necessários</div>
              ${hasRewards ? `
                <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Recompensas</div>
                <div class="pbg-lvl-detail-rewards">
                  ${sl.reward_coins > 0 ? `<div class="pbg-lvl-detail-rwd"><div class="pbg-lvl-detail-rwd-val" style="color:#fbbf24">${sl.reward_coins}</div><div class="pbg-lvl-detail-rwd-lbl">Moedas</div></div>` : ''}
                  ${sl.reward_gems > 0 ? `<div class="pbg-lvl-detail-rwd"><div class="pbg-lvl-detail-rwd-val" style="color:#80e239">${sl.reward_gems}</div><div class="pbg-lvl-detail-rwd-lbl">Gemas</div></div>` : ''}
                  ${sl.reward_diamonds > 0 ? `<div class="pbg-lvl-detail-rwd"><div class="pbg-lvl-detail-rwd-val" style="color:#22d3ee">${sl.reward_diamonds}</div><div class="pbg-lvl-detail-rwd-lbl">Diamantes</div></div>` : ''}
                </div>
              ` : '<div style="font-size:11px;color:#52525b;margin-top:4px">Sem recompensas</div>'}
              <div class="pbg-lvl-detail-status" style="background:${isCompleted ? 'rgba(16,185,129,0.12);color:#10b981' : isCurrent ? 'rgba(139,92,246,0.12);color:#a78bfa' : 'rgba(255,255,255,0.04);color:#52525b'}">
                ${isCompleted ? '✓ Conquistado' : isCurrent ? '◆ Nível Atual' : '🔒 Bloqueado'}
              </div>
            </div>
          </div>
        `;
      }
    }

    // Tier sections
    let tierSections = '';
    tierKeys.forEach(tierName => {
      const tierLevels = tiers[tierName];
      const col = tierColors[tierName] || tierLevels[0]?.color || '#8b5cf6';
      const firstLvl = getLevelNumber(tierLevels[0]);
      const lastLvl = getLevelNumber(tierLevels[tierLevels.length - 1]);
      const rangeStr = firstLvl === lastLvl ? `Nv. ${firstLvl}` : `Nv. ${firstLvl}-${lastLvl}`;
      // Auto-expand current tier and adjacent, collapse others
      const isCurrentTier = tierName === currentTier;
      const currentTierIdx = tierKeys.indexOf(currentTier);
      const thisTierIdx = tierKeys.indexOf(tierName);
      const isNearCurrent = Math.abs(thisTierIdx - currentTierIdx) <= 1;
      const expanded = isCurrentTier || isNearCurrent || !lvInfo;

      tierSections += `
        <div class="pbg-lvl-tier-section">
          <div class="pbg-lvl-tier-header" onclick="var g=this.nextElementSibling;var a=this.querySelector('.pbg-lvl-tier-arrow');if(g.style.display==='none'){g.style.display='';a.classList.add('open')}else{g.style.display='none';a.classList.remove('open')}">
            <div class="pbg-lvl-tier-dot" style="background:${col};box-shadow:0 0 6px ${col}80"></div>
            <div class="pbg-lvl-tier-name" style="color:${col === '#1a1a2e' ? '#9ca3af' : col}">${tierName}</div>
            <div class="pbg-lvl-tier-range">${rangeStr}</div>
            <svg class="pbg-lvl-tier-arrow ${expanded ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="pbg-lvl-grid" style="${expanded ? '' : 'display:none'}">
            ${tierLevels.map(lvl => {
              const lvNum = getLevelNumber(lvl);
              const lvXp = getLevelXp(lvl);
              const isCurrent = lvInfo && getLevelNumber(lvInfo.current) === lvNum;
              const isCompleted = playerXp >= lvXp && !isCurrent;
              const isLocked = playerXp < lvXp && !isCurrent;
              const cellClass = isCurrent ? 'current' : isCompleted ? 'completed' : isLocked ? 'locked' : '';
              return `
                <div class="pbg-lvl-cell ${cellClass}" onclick="${isLocked ? '' : "window.__pbg('openLevel',"+lvNum+")"}">
                  ${isCompleted ? '<div class="pbg-lvl-cell-check"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>' : ''}
                  <img class="pbg-lvl-cell-icon" src="${resolveIcon(lvl.icon_url)}" alt="Lv ${lvNum}" onerror="this.style.display='none'">
                  <div class="pbg-lvl-cell-num">${lvNum}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    return `
      <div style="position:relative">
        ${lvInfo ? `
          <div class="pbg-lvl-current">
            <div class="pbg-lvl-current-badge"><img src="${resolveIcon(lvInfo.current.icon_url)}" alt="" style="filter:drop-shadow(0 4px 12px ${lvInfo.current.color || '#8b5cf6'}80)"></div>
            <div class="pbg-lvl-current-name">${lvInfo.current.name}</div>
            <div class="pbg-lvl-current-tier" style="color:${lvInfo.current.color || '#8b5cf6'}">${lvInfo.current.tier || ''}</div>
            <div class="pbg-lvl-xp-bar-wrap">
              <div class="pbg-lvl-xp-bar"><div class="pbg-lvl-xp-fill" style="width:${lvInfo.pct}%;background:linear-gradient(90deg,${lvInfo.current.color || '#8b5cf6'}cc,${lvInfo.current.color || '#8b5cf6'})"></div></div>
              <div class="pbg-lvl-xp-text">
                <span style="color:${lvInfo.current.color || '#8b5cf6'}">${lvInfo.xpInLevel.toLocaleString('pt-BR')}</span> / ${lvInfo.xpForNext.toLocaleString('pt-BR')} XP
                ${lvInfo.next ? ` · Próximo: <span style="color:#fff">${lvInfo.next.name}</span>` : ' · <span style="color:#10b981">Nível Máximo!</span>'}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="pbg-lvl-xp-info">
          <div class="pbg-lvl-xp-info-title">${inlIcon('zap',12)} Como ganhar XP</div>
          <div class="pbg-lvl-xp-info-row">
            <div class="pbg-lvl-xp-info-icon" style="background:rgba(139,92,246,0.15)"><span style="color:#a78bfa">${inlIcon('gamepad',16)}</span></div>
            <div class="pbg-lvl-xp-info-label">Apostas</div>
            <div class="pbg-lvl-xp-info-val" style="color:#a78bfa">1 XP / R$1</div>
          </div>
          <div class="pbg-lvl-xp-info-row">
            <div class="pbg-lvl-xp-info-icon" style="background:rgba(16,185,129,0.15)"><span style="color:#10b981">${inlIcon('money',16)}</span></div>
            <div class="pbg-lvl-xp-info-label">Depósitos</div>
            <div class="pbg-lvl-xp-info-val" style="color:#10b981">0.3 XP / R$1</div>
          </div>
          ${data?.wallet ? `
            <div class="pbg-lvl-xp-info-row" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">
              <div class="pbg-lvl-xp-info-icon" style="background:rgba(245,158,11,0.15)"><span style="color:#f59e0b">${inlIcon('star',16)}</span></div>
              <div class="pbg-lvl-xp-info-label">Seu XP Total</div>
              <div class="pbg-lvl-xp-info-val" style="color:#f59e0b">${(data.wallet.total_xp_earned || data.wallet.xp || 0).toLocaleString('pt-BR')} XP</div>
            </div>
          ` : ''}
        </div>

        <div class="pbg-section-title" style="margin-bottom:12px">${inlIcon('map',14)} Mapa de Níveis</div>
        ${tierSections}
        ${detailHtml}
      </div>
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
      const lvIconBase = 'https://backofficepixbingobr.vercel.app';
      const lvIcon = lvInfo.current.icon_url ? (lvInfo.current.icon_url.startsWith('http') ? lvInfo.current.icon_url : lvIconBase + lvInfo.current.icon_url) : '';
      if (levelRowEl) levelRowEl.innerHTML = `
        ${lvIcon
          ? `<img class="pbg-level-img" src="${lvIcon}" style="filter:drop-shadow(0 1px 4px ${col}99)">`
          : `<div style="width:22px;height:22px;border-radius:6px;background:${col}33;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${col}">${getLevelNumber(lvInfo.current)}</div>`}
        <span class="pbg-level-name-lbl">${lvInfo.current.name}</span>
      `;
      if (xpTrackEl) { xpTrackEl.style.display = 'block'; }
      if (xpFillEl) { xpFillEl.style.width = lvInfo.pct + '%'; xpFillEl.style.background = `linear-gradient(90deg,${col}cc,${col})`; }
      if (nextLvlEl) nextLvlEl.innerHTML = lvInfo.next
        ? `${lvInfo.xpInLevel.toLocaleString('pt-BR')} / ${lvInfo.xpForNext.toLocaleString('pt-BR')} · Próximo nível é <span>${lvInfo.next.name}</span>`
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
      const coinSvg = `<svg class="pbg-counter-coin-icon" viewBox="0 0 31 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30.07 15c0 1.83-.34 3.58-.97 5.18-2.07 5.3-7.23 9.06-13.26 9.06-5.71 0-10.63-3.36-12.9-8.2A14.47 14.47 0 011.59 15C1.6 7.13 7.97.76 15.83.76 23.7.76 30.07 7.14 30.07 15z" fill="#FFD01C"/><circle cx="15.83" cy="14.74" r="6.5" fill="#FFD01C"/><path d="M29.1 20.19c-2.07 5.3-7.23 9.05-13.27 9.05-5.7 0-10.63-3.36-12.9-8.2 3.54-3.02 8.34-4.87 13.62-4.87 4.76 0 9.14 1.5 12.55 4.02z" fill="#FFAE00"/><path d="M30.07 15c0 .16 0 .32-.01.48C29.81 7.84 23.54 1.72 15.83 1.72S1.86 7.84 1.61 15.48c-.01-.16-.01-.32-.01-.48C1.6 7.13 7.97.76 15.83.76S30.07 7.14 30.07 15z" fill="#FFFF6E"/><path d="M23.57 19.69a9.39 9.39 0 01-7.74 5.33c-5.07 0-9.18-4.36-9.18-9.73 0-4.83 3.92-8.75 8.75-8.75s8.75 3.92 8.75 8.75c0 1.82-.53 3.52-1.45 4.95-.09-.14.87-1.43.87-4.95 0-5.07-4.11-9.18-9.18-9.18s-9.18 4.11-9.18 9.18c0 1.82.53 3.52 1.45 4.95z" fill="#FB7B01"/></svg>`;
      const diamondSvg = `<svg class="pbg-counter-diamond-icon" viewBox="0 0 31 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.12 14.48L15.5 29.74c.54 0 1.07-.26 1.38-.78l9.44-15.87c.3-.5.44-1.07.43-1.62l-5.63 3.01z" fill="#0C80E3"/><path d="M26.75 11.47l-5.63 3.01L15.5.25c.79 0 1.57.3 2.17.9l8.17 8.19c.58.58.89 1.34.9 2.13z" fill="#12C0F1"/><path d="M21.12 14.48H9.88l.28-.71L15.5.25l2.05 5.2 3.57 9.03z" fill="#12C0F1"/><path d="M9.88 14.48L15.5 29.75l5.62-15.27H9.88z" fill="#12C0F1"/><path d="M15.5.25L9.88 14.48 4.25 11.47c.01-.78.32-1.55.9-2.13L13.33 1.15c.6-.6 1.39-.9 2.17-.9z" fill="#0C80E3"/><path d="M9.88 14.48L15.5 29.74c-.54 0-1.07-.26-1.38-.78L4.68 13.09c-.3-.5-.44-1.07-.43-1.62l5.63 3.01z" fill="#0C80E3"/><path d="M4.25 11.47c.01-.78.32-1.55.9-2.13l8.18-8.19c.6-.6 1.39-.9 2.17-.9l-5.62 14.23-5.63-3.01z" fill="#0C80E3"/><path d="M26.75 11.47c0 .56-.14 1.12-.43 1.62L16.88 28.96c-.29.49-.78.75-1.28.78-.57.03-1.15-.23-1.48-.78L4.68 13.09c-.3-.5-.44-1.06-.43-1.62l.03-.35c.07.25.05.77.19 1L14.11 26.61c.33.53.92.78 1.49.75.5-.03 1-.29 1.29-.75l9.7-14.74c.14-.23.06-.52.13-.77l.03.37z" fill="#0269B7"/></svg>`;
      const gemSvg = `<svg class="pbg-counter-gem-icon" viewBox="0 0 31 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.56 5.28L9.68 1.75h10.98l-1.89 3.53h-7.21z" fill="#5CAE39"/><path d="M9.68 1.75L1.91 9.18l4.56.56 5.09-4.46L9.68 1.75z" fill="#3C972A"/><path d="M6.47 16.73l-4.56 4.08 7.77 7.44 1.88-7.05-5.09-4.47z" fill="#3C972A"/><path d="M11.56 21.2L9.68 28.25h10.98l-1.89-7.05h-7.21z" fill="#1D801B"/><path d="M23.87 16.73l4.55 4.08-7.76 7.44-1.89-7.05 5.1-4.47z" fill="#3C972A"/><path d="M23.87 9.75l4.55-.56v11.63l-4.55-4.08V9.75z" fill="#3C972A"/><path d="M20.66 1.75l-1.89 3.53 5.1 4.47 4.55-.56-7.76-7.44z" fill="#6EC839"/><path d="M6.47 9.75L1.91 9.18v11.63l4.56-4.08V9.75z" fill="#1D801B"/><path d="M18.49 5.06h-6.53c-.27 0-.54.1-.75.28l-4.5 3.95a1.03 1.03 0 00-.39.87v6.09c0 .34.14.66.4.88l4.5 3.95c.2.18.47.28.74.28h6.53c.28 0 .54-.1.75-.28l4.5-3.95c.25-.22.4-.53.4-.87v-6.09c0-.34-.14-.66-.4-.88l-4.5-3.95a1.06 1.06 0 00-.75-.28z" fill="#80E239"/><path d="M18.91 5.06l-.07.06L6.43 16.76v-6.73c.03-.29.17-.52.38-.71l4.5-3.95c.21-.18.47-.28.75-.28h6.85z" fill="#B3F539"/></svg>`;
      const arrowSvg = `<svg class="pbg-counters-arrow" viewBox="0 0 448 512" fill="currentColor"><path d="M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>`;
      countersEl.innerHTML = `
        <div class="pbg-counter-chip">
          ${coinSvg}
          <div><div class="pbg-counter-val" style="color:#fbbf24">${fmt1k(coins)}</div><div class="pbg-counter-lbl">COINS</div></div>
        </div>
        <div class="pbg-counter-chip">
          ${diamondSvg}
          <div><div class="pbg-counter-val" style="color:#22d3ee">${fmt1k(diamonds)}</div><div class="pbg-counter-lbl">DIAMONDS</div></div>
        </div>
        <div class="pbg-counter-chip">
          ${gemSvg}
          <div><div class="pbg-counter-val" style="color:#4ade80">${fmt1k(xp)}</div><div class="pbg-counter-lbl">GEMS</div></div>
        </div>
        ${arrowSvg}
      `;

      // Dropdown is populated on-click via refreshWalletDropdown()
      const ddEl = document.getElementById('pbg-wallet-dropdown');
      if (ddEl) {
        const coinSvgLg = coinSvg.replace('pbg-counter-coin-icon', 'pbg-counter-coin-icon" style="width:28px;height:28px');
        const diamondSvgLg = diamondSvg.replace('pbg-counter-diamond-icon', 'pbg-counter-diamond-icon" style="width:22px;height:28px');
        const gemSvgLg = gemSvg.replace('pbg-counter-gem-icon', 'pbg-counter-gem-icon" style="width:28px;height:28px');
        // Store SVGs for reuse in refreshWalletDropdown
        window.__pbg_dd_svgs = { coinSvgLg, diamondSvgLg, gemSvgLg };
        ddEl.innerHTML = `
          <div class="pbg-wallet-dd-item" id="pbg-dd-saldo-real">
            <div class="pbg-wallet-dd-icon" style="font-size:18px;font-weight:800;color:#10b981">R$</div>
            <div class="pbg-wallet-dd-info">
              <div class="pbg-wallet-dd-val">R$ 0,00</div>
              <div class="pbg-wallet-dd-lbl">SALDO REAL</div>
            </div>
          </div>
          <div class="pbg-wallet-dd-item" id="pbg-dd-saldo-bonus">
            <div class="pbg-wallet-dd-icon" style="font-size:18px;font-weight:800;color:#f59e0b">B$</div>
            <div class="pbg-wallet-dd-info">
              <div class="pbg-wallet-dd-val">B$ 0,00</div>
              <div class="pbg-wallet-dd-lbl">SALDO BÔNUS</div>
            </div>
          </div>
          <div class="pbg-wallet-dd-item" id="pbg-dd-coins">
            <div class="pbg-wallet-dd-icon">${coinSvgLg}</div>
            <div class="pbg-wallet-dd-info">
              <div class="pbg-wallet-dd-val" style="color:#fbbf24">${coins.toLocaleString('pt-BR')}</div>
              <div class="pbg-wallet-dd-lbl">COINS</div>
            </div>
          </div>
          <div class="pbg-wallet-dd-item" id="pbg-dd-diamonds">
            <div class="pbg-wallet-dd-icon">${diamondSvgLg}</div>
            <div class="pbg-wallet-dd-info">
              <div class="pbg-wallet-dd-val" style="color:#22d3ee">${diamonds.toLocaleString('pt-BR')}</div>
              <div class="pbg-wallet-dd-lbl">DIAMONDS</div>
            </div>
          </div>
          <div class="pbg-wallet-dd-item" id="pbg-dd-gems">
            <div class="pbg-wallet-dd-icon">${gemSvgLg}</div>
            <div class="pbg-wallet-dd-info">
              <div class="pbg-wallet-dd-val" style="color:#4ade80">${xp.toLocaleString('pt-BR')}</div>
              <div class="pbg-wallet-dd-lbl">GEMS</div>
            </div>
          </div>
        `;
      }
    }
  }

  // ---- MAIN RENDER ----
  function renderContent() {
    const el = document.getElementById('pbg-widget-content');
    if (!el) return;
    if (!data) { el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div style="width:24px;height:24px;border:2px solid #8b5cf6;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'; return; }

    const renderers = { missions: renderMissions, achievements: renderAchievements, tournaments: renderTournaments, wheel: renderWheel, games: renderMiniGames, store: renderStore, referral: renderReferral, levels: renderLevels, history: renderHistory };
    el.innerHTML = (renderers[activeTab] || renderMissions)();
    el.classList.toggle('pbg-no-pad', activeTab === 'wheel');
    el.scrollTop = 0;

    // Live countdown timer for wheel tab
    if (window.__pbg_wheel_timer) { clearInterval(window.__pbg_wheel_timer); window.__pbg_wheel_timer = null; }
    if (activeTab === 'wheel') {
      window.__pbg_wheel_timer = setInterval(() => {
        const timerEl = document.querySelector('.pbg-wheel-timer-countdown');
        if (!timerEl) return;
        const now = new Date();
        const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
        const ms = midnight - now;
        const hrs = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        const blocks = timerEl.querySelectorAll('.pbg-timer-num');
        if (blocks.length === 3) {
          blocks[0].textContent = String(hrs).padStart(2, '0');
          blocks[1].textContent = String(mins).padStart(2, '0');
          blocks[2].textContent = String(secs).padStart(2, '0');
        }
      }, 1000);
    }

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
        <div class="pbg-counters-wrapper">
          <div class="pbg-counters-row" id="pbg-counters-row" onclick="window.__pbg('toggleWallet')"></div>
          <div class="pbg-wallet-dropdown" id="pbg-wallet-dropdown"></div>
        </div>
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
        ${data?.referral_config ? `<div class="pbg-nav-item" data-tab="referral" onclick="window.__pbg('tab','referral')">
          <div class="pbg-nav-icon">${inlIcon('userPlus',20)}</div><span class="pbg-nav-lbl">Indicar</span>
        </div>` : ''}
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

    // Close wallet dropdown when clicking outside
    panel.addEventListener('click', (e) => {
      const countersRow = document.getElementById('pbg-counters-row');
      const dd = document.getElementById('pbg-wallet-dropdown');
      if (countersRow && dd && !countersRow.contains(e.target) && !dd.contains(e.target)) {
        countersRow.classList.remove('open');
        dd.classList.remove('open');
      }
    });

    // Pre-fetch data so FAB shows level ring immediately (skip if already loaded by checkSegmentAndInit)
    if (PLAYER_CPF && !data) fetchData();
    else if (data) { updateFab(); renderContent(); }

    // Global handler
    window.__pbg = async (action, arg) => {
      if (action === 'toggleWallet') {
        const cr = document.getElementById('pbg-counters-row');
        const dd = document.getElementById('pbg-wallet-dropdown');
        if (cr && dd) {
          const opening = !dd.classList.contains('open');
          cr.classList.toggle('open');
          dd.classList.toggle('open');
          if (opening) {
            // Fetch platform balance from API
            let sReal = window.__pbg_platform_saldo || 'R$ 0,00';
            let sBonus = window.__pbg_platform_bonus || 'B$ 0,00';
            if (PLAYER_CPF) {
              apiCall('platform_balance').then(res => {
                if (res && !res.error) {
                  const fmtBRL = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  window.__pbg_platform_saldo = 'R$ ' + fmtBRL(res.saldo || 0);
                  window.__pbg_platform_bonus = 'B$ ' + fmtBRL(res.bonus || 0);
                  const realEl = document.querySelector('#pbg-dd-saldo-real .pbg-wallet-dd-val');
                  const bonusEl = document.querySelector('#pbg-dd-saldo-bonus .pbg-wallet-dd-val');
                  if (realEl) realEl.textContent = window.__pbg_platform_saldo;
                  if (bonusEl) bonusEl.textContent = window.__pbg_platform_bonus;
                }
              }).catch(() => {});
            }
            // Update dropdown values
            const realEl = dd.querySelector('#pbg-dd-saldo-real .pbg-wallet-dd-val');
            const bonusEl = dd.querySelector('#pbg-dd-saldo-bonus .pbg-wallet-dd-val');
            if (realEl) realEl.textContent = sReal;
            if (bonusEl) bonusEl.textContent = sBonus;
            // Update coins/diamonds/gems from data
            if (data?.wallet) {
              const ddCoins = dd.querySelector('#pbg-dd-coins .pbg-wallet-dd-val');
              const ddDiam = dd.querySelector('#pbg-dd-diamonds .pbg-wallet-dd-val');
              const ddGems = dd.querySelector('#pbg-dd-gems .pbg-wallet-dd-val');
              if (ddCoins) ddCoins.textContent = (data.wallet.coins || 0).toLocaleString('pt-BR');
              if (ddDiam) ddDiam.textContent = (data.wallet.diamonds || 0).toLocaleString('pt-BR');
              if (ddGems) ddGems.textContent = (data.wallet.xp || 0).toLocaleString('pt-BR');
            }
          }
        }
        return;
      }
      else if (action === 'toggle') toggle(arg);
      else if (action === 'tab') { activeTab = arg; selectedStoreItem = null; storeMessage = null; selectedTournament = null; selectedMission = null; selectedMiniGame = null; miniGameResult = null; miniGamePlaying = false; scratchRevealed = []; giftBoxOpened = null; selectedLevel = null; renderContent(); }
      else if (action === 'spin') spinWheel();
      else if (action === 'openTournament') { selectedTournament = arg; renderContent(); }
      else if (action === 'closeTournament') { selectedTournament = null; renderContent(); }
      else if (action === 'openMission') { selectedMission = arg; renderContent(); }
      else if (action === 'closeMission') { selectedMission = null; renderContent(); }
      else if (action === 'openLevel') { selectedLevel = arg; renderContent(); }
      else if (action === 'closeLevel') { selectedLevel = null; renderContent(); }
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
        selectedMiniGame = null; miniGameResult = null; miniGamePlaying = false; scratchRevealed = []; giftBoxOpened = null; window.__pbg_chest_phase = 0; window.__pbg_roulette_phase = 0; window.__pbg_roulette_deg = 0; renderContent();
      }
      else if (action === 'playMiniGame') {
        miniGameResult = null; miniGamePlaying = true; scratchRevealed = []; giftBoxOpened = null; window.__pbg_chest_phase = 0; window.__pbg_roulette_phase = 0; window.__pbg_roulette_deg = 0; renderContent();
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
      else if (action === 'animateChest') {
        // Animated chest opening: phase 1=shake, 2=burst, 3=reveal
        window.__pbg_chest_phase = 1;
        renderContent();
        setTimeout(() => {
          window.__pbg_chest_phase = 2;
          renderContent();
          setTimeout(() => {
            window.__pbg_chest_phase = 3;
            giftBoxOpened = 0;
            renderContent();
          }, 900);
        }, 1000);
      }
      else if (action === 'spinRoulette') {
        // Spin roulette: calculate target angle based on prize
        if (!miniGameResult || !miniGameResult.prize) return;
        const game = games.find(g => g.id === arg);
        const rPrizes = prizes.filter(p => p.game_id === arg && p.type !== 'nothing');
        const segments = rPrizes.length > 0 ? rPrizes : [{label:'1'},{label:'2'},{label:'3'},{label:'4'},{label:'5'},{label:'6'},{label:'7'},{label:'8'}];
        const n = segments.length;
        const segAngle = 360 / n;
        // Find winning segment index
        let winIdx = 0;
        const prizeLabel = miniGameResult.prize?.label || '';
        for (let i = 0; i < segments.length; i++) {
          if (segments[i].label === prizeLabel || segments[i].id === miniGameResult.prize?.prize_id) { winIdx = i; break; }
        }
        // The pointer is at top (0°/360°). Segment 0 starts at top-center.
        // To land on segment winIdx, the wheel must rotate so that segment's midpoint aligns with top.
        // Segment midpoint angle = (winIdx + 0.5) * segAngle
        // We need to rotate: -(midAngle) + N*360 for multiple full spins
        const midAngle = (winIdx + 0.5) * segAngle;
        const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full spins
        const targetDeg = fullSpins * 360 + (360 - midAngle);
        window.__pbg_roulette_phase = 1;
        window.__pbg_roulette_deg = targetDeg;
        renderContent();
        // Apply rotation AFTER DOM render so CSS transition works
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const wheelEl = document.getElementById('pbg-roulette-wheel');
            if (wheelEl) {
              wheelEl.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
              wheelEl.style.transform = `rotate(${targetDeg}deg)`;
            }
          });
        });
        // After spin animation completes, show result
        setTimeout(() => {
          window.__pbg_roulette_phase = 2;
          giftBoxOpened = 0;
          renderContent();
        }, 4400);
      }
      else if (action === 'openGiftBox') {
        if (giftBoxOpened === null) {
          giftBoxOpened = Number(arg);
          renderContent();
        }
      }
      else if (action === 'generateReferral') {
        try {
          const result = await apiCall('referral_generate');
          if (result.error) { alert(result.error); }
          else { await fetchData(); }
        } catch (e) { alert('Erro ao gerar código'); }
      }
      else if (action === 'copyReferral') {
        try {
          await navigator.clipboard.writeText(arg);
          // Show toast
          const toast = document.createElement('div');
          toast.className = 'pbg-ref-copied';
          toast.textContent = 'Link copiado!';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        } catch { alert('Erro ao copiar link'); }
      }
      else if (action === 'claimTier') {
        try {
          const result = await apiCall('referral_claim_tier', { tier: arg });
          if (result.error) { alert(result.error); }
          else {
            const toast = document.createElement('div');
            toast.className = 'pbg-ref-copied';
            toast.textContent = 'Recompensa resgatada!';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
            await fetchData();
          }
        } catch (e) { alert('Erro ao resgatar tier'); }
      }
    };
    // Legacy compat
    window.__pbgToggle = (s) => toggle(s);

    fetchData();
    setInterval(fetchData, 120_000);
  }

  async function checkSegmentAndInit() {
    PLAYER_CPF = getPlayerCpf();
    // If segment specified in script tag, check via dedicated endpoint
    if (SEGMENT_ID) {
      if (!PLAYER_CPF) return false;
      try {
        const res = await apiCall('check_segment');
        if (!res || !res.belongs) return true; // not in segment = stop polling, don't show
      } catch { return false; }
    }
    // Always pre-fetch data to check server-side widget_segment restriction
    if (PLAYER_CPF) {
      try {
        const refCode = (function() {
          try { return localStorage.getItem('__pbr_ref_code') || localStorage.getItem('codigo_indicacao') || ''; } catch(e) { return ''; }
        })();
        data = await apiCall('data', refCode ? { ref_code: refCode } : {});
        if (data?._widget_hidden) return true; // server says hide widget = stop polling, don't show
        if (data?._ref_registered) {
          try { localStorage.removeItem('__pbr_ref_code'); } catch(e) {}
        }
      } catch { return false; }
    }
    initWidget();
    return true;
  }

  function init() {
    // Keep polling until widget is initialized or segment check completes
    const tryInit = async () => {
      if (widgetInitialized) return true;
      if (!isUserLoggedIn()) return false;
      return await checkSegmentAndInit();
    };
    tryInit().then(done => {
      if (!done) {
        const chk = setInterval(() => {
          tryInit().then(d => { if (d) clearInterval(chk); });
        }, 3000);
      }
    });
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
      levelNum = getLevelNumber(lvInfo.current);
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
