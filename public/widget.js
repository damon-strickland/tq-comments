(function () {
  if (window.__TQC_INSTALLED__) return;
  window.__TQC_INSTALLED__ = true;

  const scriptTag = document.currentScript;

  // Bake your Supabase project URL + anon key here, OR pass them as
  // data-supabase-url / data-supabase-key on the script tag.
  const SUPABASE_URL =
    (scriptTag && scriptTag.dataset.supabaseUrl) || "https://mvxdviqqtcvdtkenjvrc.supabase.co";
  const SUPABASE_ANON_KEY =
    (scriptTag && scriptTag.dataset.supabaseKey) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eGR2aXFxdGN2ZHRrZW5qdnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMzQ2OTQsImV4cCI6MjA5NDcxMDY5NH0.w-lTzfgHduo0Jtb9WMYDJT7oICQbPmIKmbaNSxHXZZc";

  if (SUPABASE_URL.startsWith("REPLACE_") || SUPABASE_ANON_KEY.startsWith("REPLACE_")) {
    console.warn(
      "[tq-comments] Missing Supabase URL or anon key. Edit widget.js or pass data-supabase-url / data-supabase-key on the script tag."
    );
    return;
  }

  const SB_HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const state = {
    comments: [],
    commentMode: false,
    activePinId: null,
    sidebarOpen: false,
    pinsVisible: true,
    expandedThreads: new Set(),
    deletingId: null,
    filter: "open",
    editingProfile: false,
    editingFigma: false,
    figmaLink: "",
    author: localStorage.getItem("tqc-author") || "",
    userColor: localStorage.getItem("tqc-author-color") || "#2563eb",
    theme: localStorage.getItem("tqc-theme") || "light",
  };

  let pinsRoot, fixedRoot, sidebar, button, popover, inlineComposer, commentBanner;
  let popoverHovered = false;
  let popoverScrolledAt = 0;

  function iconSvg(paths, size = 15) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }
  const ICONS = {
    resolve: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    reopen:  '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    trash:   '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon:    '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    pencil:  '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    smilePlus: '<path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c1.5 0 2.9.4 4.2 1"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M9 14s.5 1 3 1 3-1 3-1"/><path d="M20 6v6"/><path d="M17 9h6"/>',
  };
  const REACTION_EMOJIS = ["👍", "❤️", "🎉", "🔥", "😂", "😮"];
  const USER_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#dc2626", "#a855f7", "#0891b2", "#db2777", "#65a30d"];

  function colorForComment(c) {
    if (c.author_color) return c.author_color;
    const name = c.author || "";
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  }
  function initialFor(c) {
    return (c.author || "?")[0].toUpperCase();
  }
  function authorsInThread(parent, replies) {
    const seen = new Map();
    const add = (c) => {
      if (!seen.has(c.author)) seen.set(c.author, { author: c.author, color: colorForComment(c), initial: initialFor(c) });
    };
    add(parent);
    replies.forEach(add);
    return Array.from(seen.values());
  }

  function getPageUrl() {
    return window.location.origin + window.location.pathname;
  }
  function getFigmaLink() { return state.figmaLink || ""; }
  function setFigmaLink(url) {
    state.figmaLink = url || "";
    saveSettings({ figma_link: url || null });
  }
  async function fetchSettings() {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/prototype_settings?url=eq.${encodeURIComponent(getPageUrl())}&select=*`,
      { headers: SB_HEADERS }
    );
    if (!r.ok) return;
    const rows = await r.json();
    if (rows.length > 0) {
      state.figmaLink = rows[0].figma_link || "";
      render();
    }
  }
  async function saveSettings(updates) {
    await fetch(`${SUPABASE_URL}/rest/v1/prototype_settings`, {
      method: "POST",
      headers: {
        ...SB_HEADERS,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({ url: getPageUrl(), ...updates }),
    });
  }

  // ---- API (Supabase REST / PostgREST) ----
  function normalize(c) {
    return {
      ...c,
      created_at: new Date(c.created_at).getTime(),
      updated_at: new Date(c.updated_at).getTime(),
      resolved: c.resolved ? 1 : 0,
      reactions: Array.isArray(c.reactions) ? c.reactions : [],
    };
  }

  async function fetchComments() {
    const url = `${SUPABASE_URL}/rest/v1/comments?url=eq.${encodeURIComponent(getPageUrl())}&order=created_at.asc`;
    const r = await fetch(url, { headers: SB_HEADERS });
    if (!r.ok) return;
    const rows = await r.json();
    state.comments = rows.map(normalize);
    const active = document.activeElement;
    const typing = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.contentEditable === "true");
    const popoverInUse = popover && (popoverHovered || Date.now() - popoverScrolledAt < 5000);
    if (!typing && !popoverInUse) render();
  }

  async function postComment(payload) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/comments`, {
      method: "POST",
      headers: {
        ...SB_HEADERS,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        url: getPageUrl(),
        author: state.author,
        author_color: state.userColor,
        ...payload,
      }),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const c = normalize(rows[0]);
    state.comments.push(c);
    render();
    return c;
  }

  async function patchComment(id, updates) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/comments?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        ...SB_HEADERS,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    });
    if (!r.ok) return;
    const rows = await r.json();
    const c = normalize(rows[0]);
    const idx = state.comments.findIndex((x) => x.id === id);
    if (idx >= 0) state.comments[idx] = c;
    render();
  }

  async function deleteComment(id) {
    // ON DELETE CASCADE on parent_id auto-removes replies.
    await fetch(`${SUPABASE_URL}/rest/v1/comments?id=eq.${id}`, {
      method: "DELETE",
      headers: SB_HEADERS,
    });
    state.comments = state.comments.filter((c) => c.id !== id && c.parent_id !== id);
    render();
  }

  // ---- Helpers ----
  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    const path = [];
    let node = el;
    while (node && node.parentElement && path.length < 6) {
      let sel = node.nodeName.toLowerCase();
      if (node.id) {
        sel += `#${CSS.escape(node.id)}`;
        path.unshift(sel);
        break;
      }
      let nth = 1,
        sib = node;
      while ((sib = sib.previousElementSibling)) {
        if (sib.nodeName === node.nodeName) nth++;
      }
      sel += `:nth-of-type(${nth})`;
      path.unshift(sel);
      node = node.parentElement;
    }
    return path.join(" > ");
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h`;
    return new Date(ts).toLocaleDateString();
  }

  function ensureAuthor() {
    if (state.author) return true;
    const name = prompt("Your name (so others know who left this comment):");
    if (!name || !name.trim()) return false;
    state.author = name.trim();
    localStorage.setItem("tqc-author", state.author);
    return true;
  }

  function topLevel() {
    return state.comments
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.created_at - b.created_at);
  }
  function repliesFor(id) {
    return state.comments
      .filter((c) => c.parent_id === id)
      .sort((a, b) => a.created_at - b.created_at);
  }

  // ---- UI ----
  function mountUI() {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";
    document.head.appendChild(fontLink);

    const styles = document.createElement("style");
    styles.textContent = `
      .tqc-pins-root, .tqc-fixed-root, .tqc-pins-root *, .tqc-fixed-root *, .tqc-popover, .tqc-popover *, .tqc-banner, .tqc-banner * {
        box-sizing: border-box;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .tqc-time, .tqc-reply-count, .tqc-button-count {
        font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        font-feature-settings: "tnum" 1;
        letter-spacing: -0.02em;
      }
      .tqc-pins-root { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483640; pointer-events: none; }
      .tqc-fixed-root { position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483641; pointer-events: none; }
      .tqc-button {
        position: fixed; bottom: 20px; right: 20px;
        background: #111; color: white; border: 0; border-radius: 999px;
        padding: 10px 16px; font-size: 14px; font-weight: 500; line-height: 1;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25); cursor: pointer;
        pointer-events: auto;
        display: inline-flex; align-items: center; gap: 8px;
      }
      .tqc-button:hover { background: #222; }
      .tqc-button.active { background: #dc2626; }
      .tqc-button-count {
        background: rgba(255,255,255,0.22); padding: 2px 7px; border-radius: 999px; font-size: 12px; font-weight: 600;
      }
      html.tqc-comment-mode, html.tqc-comment-mode * { cursor: crosshair !important; }
      .tqc-banner {
        position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
        background: #2563eb; color: white; padding: 10px 14px 10px 18px;
        border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        pointer-events: auto;
        display: inline-flex; align-items: center; gap: 12px;
        font-size: 14px; font-weight: 500; line-height: 1;
        z-index: 2147483646;
      }
      .tqc-banner button {
        background: rgba(255,255,255,0.22); color: white; border: 0;
        border-radius: 999px; padding: 5px 12px; cursor: pointer; font: inherit;
        font-size: 13px; font-weight: 500;
      }
      .tqc-banner button:hover { background: rgba(255,255,255,0.32); }
      .tqc-pin {
        position: absolute;
        background: white;
        border-radius: 16px 16px 16px 4px;
        padding: 3px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        cursor: pointer; pointer-events: auto;
        display: inline-flex; align-items: center;
        transition: transform 0.1s;
        transform-origin: 0 100%;
      }
      .tqc-pin:hover { transform: scale(1.08); }
      .tqc-pin::after {
        content: ''; position: absolute; bottom: -6px; left: 0;
        width: 8px; height: 8px; background: white;
        clip-path: polygon(0 0, 100% 0, 0 100%);
        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.15));
      }
      .tqc-pin.resolved { opacity: 0.55; }
      .tqc-pin-avatars { display: inline-flex; }
      .tqc-pin-avatar {
        width: 22px; height: 22px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        color: white; font-size: 11px; font-weight: 600;
        margin-left: -6px; border: 2px solid white;
        box-sizing: content-box; flex-shrink: 0;
      }
      .tqc-pin-avatar:first-child { margin-left: 0; }
      .tqc-pin-avatar.tqc-pin-avatar-more {
        background: #6b7280; font-size: 10px;
      }
      .tqc-popover {
        position: absolute; width: 320px; background: white;
        border-radius: 10px; box-shadow: 0 12px 36px rgba(0,0,0,0.2);
        pointer-events: auto; padding: 12px; color: #111; font-size: 14px; line-height: 1.4;
      }
      .tqc-popover { padding: 0; }
      .tqc-popover-header {
        height: 48px; display: flex; align-items: center; justify-content: space-between;
        padding: 0 12px 0 16px;
        border-bottom: 1px solid #e5e7eb;
        font-weight: 600; font-size: 14px;
      }
      .tqc-popover-actions { display: flex; gap: 2px; }
      .tqc-popover-header .tqc-icon-btn { display: inline-flex; }
      .tqc-thread { max-height: 340px; overflow-y: auto; padding: 8px 12px; }
      .tqc-popover .tqc-composer { padding: 8px 12px 12px; position: relative; }
      .tqc-popover .tqc-composer textarea {
        resize: none; min-height: 70px;
        padding: 8px 44px 8px 10px;
      }
      .tqc-send-btn {
        position: absolute; bottom: 18px; right: 20px;
        width: 28px; height: 28px; border-radius: 50%; border: 0;
        background: #e5e7eb; color: #9ca3af;
        cursor: not-allowed;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s, transform 0.1s;
        padding: 0;
      }
      .tqc-send-btn.active { background: #2563eb; color: white; cursor: pointer; }
      .tqc-send-btn.active:hover { background: #1d4ed8; transform: scale(1.05); }
      .tqc-dark .tqc-popover-header { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-send-btn { background: #1f1f1f; color: #6b7280; }
      .tqc-dark .tqc-send-btn.active { background: #2563eb; color: white; }
      .tqc-comment { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
      .tqc-comment:last-child { border-bottom: 0; }
      .tqc-comment-head {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;
      }
      .tqc-author { font-weight: 600; font-size: 14px; }
      .tqc-time { color: #6b7280; font-size: 12px; opacity: 0.65; }
      .tqc-body { white-space: pre-wrap; word-wrap: break-word; }
      .tqc-thread-item > .tqc-body { font-size: 14px; }
      .tqc-composer { display: flex; flex-direction: column; gap: 8px; }
      .tqc-composer textarea {
        width: 100%; min-height: 64px;
        border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px;
        font: inherit; resize: vertical; color: #111; background: white;
      }
      .tqc-composer textarea:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
      .tqc-popover textarea.tqc-composer-input {
        width: 100%; min-height: 70px;
        border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px;
        font: inherit; resize: vertical; color: #111; background: white;
      }
      .tqc-popover textarea.tqc-composer-input:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
      .tqc-composer-row { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
      .tqc-btn {
        padding: 6px 12px; border-radius: 6px; border: 0; font: inherit; font-size: 13px; cursor: pointer; line-height: 1.2;
        text-decoration: none;
      }
      .tqc-btn-primary { background: #2563eb; color: white; }
      .tqc-btn-primary:hover { background: #1d4ed8; }
      .tqc-btn-secondary { background: #f3f4f6; color: #111; }
      .tqc-btn-secondary:hover { background: #e5e7eb; }
      .tqc-btn-ghost { background: transparent; color: #6b7280; padding: 6px 8px; }
      .tqc-btn-ghost:hover { color: #111; background: #f3f4f6; }
      .tqc-sidebar {
        position: fixed; top: 0; right: 0; bottom: 0; width: 360px;
        background-color: white;
        background-image: radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px);
        background-size: 18px 18px;
        box-shadow: -2px 0 16px rgba(0,0,0,0.12);
        pointer-events: auto; color: #111;
        transform: translateX(100%); transition: transform 0.2s ease;
        display: flex; flex-direction: column;
      }
      .tqc-sidebar.open { transform: translateX(0); }
      .tqc-sidebar-head {
        padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
        display: flex; justify-content: space-between; align-items: center;
        font-weight: 600; font-size: 15px;
      }
      .tqc-count-chip {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 22px; height: 20px; padding: 0 6px;
        border-radius: 2px; background: #f3f4f6; color: #6b7280;
        font-size: 12px; font-weight: 500; margin-left: 6px;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
      }
      .tqc-dark .tqc-count-chip { background: #1f1f1f; color: #9ca3af; }
      .tqc-tabs { display: flex; gap: 2px; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
      .tqc-tab {
        padding: 4px 10px; border-radius: 6px; border: 0; font: inherit; font-size: 13px;
        cursor: pointer; background: none; color: #6b7280; transition: background 0.1s, color 0.1s;
      }
      .tqc-tab:hover { background: #f3f4f6; color: #374151; }
      .tqc-tab.active { background: #111; color: white; font-weight: 500; }
      .tqc-sidebar-add {
        padding: 10px 16px; border-bottom: 1px solid #e5e7eb;
        display: flex; gap: 8px; align-items: center;
      }
      .tqc-sidebar-add .tqc-icon-btn { display: inline-flex; }
      .tqc-sidebar-add input {
        flex: 1; padding: 6px 10px;
        border: 1px solid #d1d5db; border-radius: 6px;
        font: inherit; font-size: 13px; color: #111; background: white;
        box-sizing: border-box; outline: none;
      }
      .tqc-sidebar-add input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
      .tqc-figma-btn {
        display: inline-flex; align-items: center; gap: 6px;
      }
      .tqc-dark .tqc-sidebar-add input { background: #0f0f0f; color: #f3f4f6; border-color: #1f1f1f; }
      .tqc-dark .tqc-sidebar-add input:focus { border-color: #2563eb; }
      .tqc-sidebar-list { flex: 1; overflow-y: auto; }
      .tqc-thread-item {
        padding: 12px 16px; border-bottom: 1px solid #f3f4f6; cursor: pointer;
      }
      .tqc-thread-item:hover { background: #f9fafb; }
      .tqc-thread-item.resolved .tqc-body { color: #6b7280; }
      .tqc-thread-item.resolved .tqc-thread-num { background: #6b7280; }
      .tqc-thread-num {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 50%; background: #2563eb; color: white;
        font-size: 12px; font-weight: 600; margin-right: 8px;
      }
      .tqc-general-composer { position: relative; padding: 10px 12px 18px; border-top: 1px solid #e5e7eb; }
      .tqc-general-composer textarea {
        width: 100%; min-height: 56px; resize: none;
        border: 0; border-radius: 8px;
        padding: 8px 44px 8px 10px; font: inherit; color: #111; background: transparent;
        box-sizing: border-box; outline: none;
      }
      .tqc-general-composer .tqc-send-btn { bottom: 18px; right: 20px; }
      .tqc-dark .tqc-general-composer { border-top-color: #1f1f1f; }
      .tqc-dark .tqc-general-composer textarea { background: transparent; color: #f3f4f6; }
      .tqc-user-footer { padding: 10px 12px; border-top: 1px solid #e5e7eb; }
      .tqc-user-pill {
        display: flex; align-items: center; gap: 10px;
        padding: 4px 6px; border-radius: 8px; cursor: pointer;
        transition: background 0.1s;
      }
      .tqc-user-pill:hover { background: #f3f4f6; }
      .tqc-user-avatar {
        width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: 600; font-size: 13px; flex-shrink: 0;
      }
      .tqc-user-name { font-size: 14px; font-weight: 500; color: #111; flex: 1; }
      .tqc-user-name.empty { color: #9ca3af; font-weight: 400; }
      .tqc-user-editor { display: flex; flex-direction: column; gap: 10px; padding: 4px; }
      .tqc-user-editor input {
        width: 100%; padding: 6px 8px;
        border: 1px solid #d1d5db; border-radius: 6px;
        font: inherit; color: #111; background: white;
      }
      .tqc-user-editor input:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
      .tqc-color-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
      .tqc-swatch {
        width: 24px; height: 24px; border-radius: 50%;
        border: 2px solid transparent; cursor: pointer; padding: 0;
        transition: transform 0.1s;
      }
      .tqc-swatch:hover { transform: scale(1.1); }
      .tqc-swatch.selected { border-color: #111; }
      .tqc-user-editor-row { display: flex; gap: 6px; justify-content: flex-end; }
      .tqc-empty { padding: 40px 20px; color: #6b7280; text-align: center; font-size: 14px; }
      .tqc-reply-count { font-size: 12px; color: #6b7280; margin-top: 4px; }
      .tqc-head-right { display: flex; align-items: center; gap: 2px; }
      .tqc-icon-btn {
        background: none; border: 0; padding: 3px; cursor: pointer; color: #9ca3af;
        border-radius: 4px; display: none; align-items: center; justify-content: center;
        transition: color 0.1s, background 0.1s; flex-shrink: 0;
      }
      .tqc-thread-item:hover .tqc-head-right .tqc-icon-btn,
      .tqc-reply-item:hover .tqc-head-right .tqc-icon-btn,
      .tqc-comment:hover .tqc-head-right .tqc-icon-btn { display: inline-flex; }
      .tqc-thread-item:hover .tqc-head-right .tqc-time,
      .tqc-reply-item:hover .tqc-head-right .tqc-time,
      .tqc-comment:hover .tqc-head-right .tqc-time { display: none; }
      .tqc-icon-btn:hover { color: #374151; background: #f3f4f6; }
      .tqc-icon-btn.tqc-icon-danger:hover { color: #dc2626; background: #fef2f2; }
      .tqc-icon-btn.tqc-icon-resolved { color: #16a34a; }
      @keyframes tqc-fade-out {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(12px); }
      }
      .tqc-deleting { animation: tqc-fade-out 0.2s ease-out forwards; pointer-events: none; }
      .tqc-delete-confirm { padding: 8px 0 4px; display: flex; flex-direction: column; gap: 8px; }
      .tqc-delete-confirm p { margin: 0; font-size: 13px; color: #374151; }
      .tqc-delete-confirm-row { display: flex; gap: 6px; justify-content: flex-end; }
      .tqc-body[contenteditable] { cursor: text; border-radius: 4px; padding: 2px 4px; margin: 0 -4px; outline: none; transition: background 0.1s; }
      .tqc-body[contenteditable]:hover { background: #f3f4f6; }
      .tqc-body[contenteditable]:focus { background: #eff6ff; box-shadow: 0 0 0 2px #bfdbfe; }
      .tqc-replies-toggle {
        background: none; border: 0; padding: 0; cursor: pointer; color: #6b7280;
        font: inherit; font-size: 12px; font-family: "IBM Plex Mono", ui-monospace, monospace;
        margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;
      }
      .tqc-replies-toggle:hover { color: #111; }
      .tqc-replies-tree {
        margin-top: 8px; border-left: 2px solid #e5e7eb; padding-left: 12px;
        display: flex; flex-direction: column;
      }
      .tqc-reply-item { padding: 6px 0; border-bottom: 1px solid #f9fafb; }
      .tqc-reply-item:last-child { border-bottom: 0; padding-bottom: 2px; }
      .tqc-reply-item .tqc-comment-head { margin-bottom: 2px; }
      .tqc-reply-item .tqc-body { font-size: 13px; color: #374151; }

      .tqc-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
      .tqc-reaction-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 999px;
        border: 0; background: #f9fafb;
        cursor: pointer; font-size: 12px; color: #6b7280;
        line-height: 1.2;
      }
      .tqc-reaction-chip:hover { background: #f3f4f6; }
      .tqc-reaction-chip.mine { background: #e5e7eb; color: #374151; }
      .tqc-reaction-count { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11px; }
      .tqc-reaction-add-wrap { position: relative; display: inline-flex; }
      .tqc-reaction-picker {
        position: absolute; top: calc(100% + 4px); right: 0;
        display: flex; gap: 2px; padding: 4px;
        background: white; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.18);
        z-index: 2147483648;
      }
      .tqc-reaction-picker button {
        background: none; border: 0; padding: 4px 6px;
        font-size: 18px; cursor: pointer; border-radius: 4px;
      }
      .tqc-reaction-picker button:hover { background: #f3f4f6; }
      .tqc-dark .tqc-reaction-chip { background: #1a1a1a; color: #9ca3af; }
      .tqc-dark .tqc-reaction-chip:hover { background: #262626; }
      .tqc-dark .tqc-reaction-chip.mine { background: #262626; color: #f3f4f6; }
      .tqc-dark .tqc-reaction-picker { background: #1a1a1a; box-shadow: 0 6px 18px rgba(0,0,0,0.6); }
      .tqc-dark .tqc-reaction-picker button:hover { background: #262626; }

      .tqc-theme-btn {
        background: none; border: 0; padding: 6px; cursor: pointer; color: #6b7280;
        border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
        transition: background 0.1s, color 0.1s; flex-shrink: 0;
      }
      .tqc-theme-btn:hover { background: #f3f4f6; color: #111; }

      /* Dark theme */
      .tqc-dark .tqc-sidebar {
        background-color: #080808; color: #f3f4f6;
        background-image: radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
        box-shadow: -2px 0 16px rgba(0,0,0,0.5);
      }
      .tqc-dark .tqc-sidebar-head { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-sidebar-add { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-tabs { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-tab { color: #9ca3af; }
      .tqc-dark .tqc-tab:hover { background: #1a1a1a; color: #f3f4f6; }
      .tqc-dark .tqc-tab.active { background: #f3f4f6; color: #111; }
      .tqc-dark .tqc-thread-item { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-thread-item:hover { background: #141414; }
      .tqc-dark .tqc-reply-item { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-replies-tree { border-left-color: #1f1f1f; }
      .tqc-dark .tqc-reply-item .tqc-body { color: #d1d5db; }
      .tqc-dark .tqc-popover { background: #080808; color: #f3f4f6; box-shadow: 0 12px 36px rgba(0,0,0,0.6); }
      .tqc-dark .tqc-pin { background: #080808; box-shadow: 0 4px 14px rgba(0,0,0,0.5); }
      .tqc-dark .tqc-pin::after { background: #080808; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
      .tqc-dark .tqc-pin-avatar { border-color: #080808; }
      .tqc-dark .tqc-comment { border-bottom-color: #1f1f1f; }
      .tqc-dark .tqc-time, .tqc-dark .tqc-reply-count { color: #9ca3af; }
      .tqc-dark .tqc-empty { color: #9ca3af; }
      .tqc-dark .tqc-author { color: #f3f4f6; }
      .tqc-dark .tqc-replies-toggle { color: #9ca3af; }
      .tqc-dark .tqc-replies-toggle:hover { color: #f3f4f6; }
      .tqc-dark .tqc-body[contenteditable]:hover { background: #1a1a1a; }
      .tqc-dark .tqc-body[contenteditable]:focus { background: rgba(37,99,235,0.18); box-shadow: 0 0 0 2px #2563eb; }
      .tqc-dark .tqc-composer textarea,
      .tqc-dark .tqc-popover textarea.tqc-composer-input,
      .tqc-dark .tqc-user-editor input { background: #0f0f0f; color: #f3f4f6; border-color: #1f1f1f; }
      .tqc-dark .tqc-icon-btn { color: #6b7280; }
      .tqc-dark .tqc-icon-btn:hover { background: #1a1a1a; color: #f3f4f6; }
      .tqc-dark .tqc-icon-btn.tqc-icon-danger:hover { background: #2a0e0e; color: #f87171; }
      .tqc-dark .tqc-btn-secondary { background: #1a1a1a; color: #f3f4f6; }
      .tqc-dark .tqc-btn-secondary:hover { background: #262626; }
      .tqc-dark .tqc-btn-ghost { color: #9ca3af; }
      .tqc-dark .tqc-btn-ghost:hover { background: #1a1a1a; color: #f3f4f6; }
      .tqc-dark .tqc-user-footer { border-top-color: #1f1f1f; }
      .tqc-dark .tqc-user-pill:hover { background: #1a1a1a; }
      .tqc-dark .tqc-user-name { color: #f3f4f6; }
      .tqc-dark .tqc-user-name.empty { color: #6b7280; }
      .tqc-dark .tqc-swatch.selected { border-color: #f3f4f6; }
      .tqc-dark .tqc-delete-confirm p { color: #d1d5db; }
      .tqc-dark .tqc-theme-btn { color: #9ca3af; }
      .tqc-dark .tqc-theme-btn:hover { background: #1a1a1a; color: #f3f4f6; }

      .tqc-user-footer-row { display: flex; align-items: center; gap: 6px; }
      .tqc-user-footer-row .tqc-user-pill { flex: 1; }
    `;
    document.head.appendChild(styles);

    pinsRoot = document.createElement("div");
    pinsRoot.className = "tqc-pins-root";
    document.body.appendChild(pinsRoot);

    fixedRoot = document.createElement("div");
    fixedRoot.className = "tqc-fixed-root";
    document.body.appendChild(fixedRoot);

    button = document.createElement("button");
    button.className = "tqc-button";
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.commentMode) {
        toggleCommentMode(false);
      } else {
        state.sidebarOpen = !state.sidebarOpen;
        render();
      }
    });
    fixedRoot.appendChild(button);

    sidebar = document.createElement("div");
    sidebar.className = "tqc-sidebar";
    fixedRoot.appendChild(sidebar);
  }

  function toggleCommentMode(on) {
    if (on && !ensureAuthor()) return;
    state.commentMode = on;
    state.activePinId = null;
    if (inlineComposer) {
      inlineComposer.remove();
      inlineComposer = null;
    }
    if (on) {
      document.documentElement.classList.add("tqc-comment-mode");
      if (!commentBanner) {
        commentBanner = document.createElement("div");
        commentBanner.className = "tqc-banner";
        commentBanner.innerHTML = `<span>Click anywhere to leave a comment</span>`;
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleCommentMode(false);
        });
        commentBanner.appendChild(cancelBtn);
        fixedRoot.appendChild(commentBanner);
      }
      document.addEventListener("click", onCommentClickCapture, true);
    } else {
      document.documentElement.classList.remove("tqc-comment-mode");
      if (commentBanner) {
        commentBanner.remove();
        commentBanner = null;
      }
      document.removeEventListener("click", onCommentClickCapture, true);
    }
    render();
  }

  function onCommentClickCapture(e) {
    if (
      e.target.closest(".tqc-button, .tqc-banner, .tqc-popover, .tqc-pin, .tqc-sidebar")
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    if (!ensureAuthor()) return;

    const docW = document.documentElement.scrollWidth;
    const docH = document.documentElement.scrollHeight;
    const px = e.clientX + window.scrollX;
    const py = e.clientY + window.scrollY;
    const x = px / docW;
    const y = py / docH;
    const selector = e.target ? cssPath(e.target) : null;

    toggleCommentMode(false);
    showInlineComposer({ x, y, selector }, px, py);
  }

  function openPin(id) {
    state.activePinId = id;
    state.commentMode = false;
    render();
  }

  function toggleReaction(comment, emoji) {
    if (!ensureAuthor()) return;
    const current = comment.reactions || [];
    const idx = current.findIndex((r) => r.author === state.author && r.emoji === emoji);
    let next;
    if (idx >= 0) {
      next = current.filter((_, i) => i !== idx);
    } else {
      next = [...current, {
        author: state.author,
        color: state.userColor,
        emoji,
        created_at: Date.now(),
      }];
    }
    const stateIdx = state.comments.findIndex((c) => c.id === comment.id);
    if (stateIdx >= 0) {
      state.comments[stateIdx] = { ...state.comments[stateIdx], reactions: next };
      render();
    }
    patchComment(comment.id, { reactions: next });
  }

  function buildReactionsRow(comment) {
    const reactions = comment.reactions || [];
    if (reactions.length === 0) return null;

    const row = document.createElement("div");
    row.className = "tqc-reactions";
    row.addEventListener("click", (e) => e.stopPropagation());

    const groups = new Map();
    for (const r of reactions) {
      if (!groups.has(r.emoji)) groups.set(r.emoji, []);
      groups.get(r.emoji).push(r);
    }

    groups.forEach((list, emoji) => {
      const chip = document.createElement("button");
      chip.className = "tqc-reaction-chip";
      if (list.some((r) => r.author === state.author)) chip.classList.add("mine");
      chip.innerHTML = `<span>${emoji}</span><span class="tqc-reaction-count">${list.length}</span>`;
      chip.title = list.map((r) => r.author).join(", ");
      chip.addEventListener("click", () => toggleReaction(comment, emoji));
      row.appendChild(chip);
    });

    return row;
  }

  function buildReactionAddIcon(comment) {
    const wrap = document.createElement("span");
    wrap.className = "tqc-reaction-add-wrap";

    const addBtn = document.createElement("button");
    addBtn.className = "tqc-icon-btn";
    addBtn.title = "Add reaction";
    addBtn.innerHTML = iconSvg(ICONS.smilePlus, 14);
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = wrap.querySelector(".tqc-reaction-picker");
      if (existing) { existing.remove(); return; }

      const picker = document.createElement("div");
      picker.className = "tqc-reaction-picker";
      REACTION_EMOJIS.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.textContent = emoji;
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          toggleReaction(comment, emoji);
          picker.remove();
        });
        picker.appendChild(btn);
      });
      wrap.appendChild(picker);

      setTimeout(() => {
        const onOutside = (ev) => {
          if (!picker.contains(ev.target) && !addBtn.contains(ev.target)) {
            picker.remove();
            document.removeEventListener("click", onOutside, true);
          }
        };
        document.addEventListener("click", onOutside, true);
      }, 0);
    });
    wrap.appendChild(addBtn);
    return wrap;
  }

  function makeDeleteConfirm(id, label) {
    const wrap = document.createElement("div");
    wrap.className = "tqc-delete-confirm";
    wrap.addEventListener("click", (e) => e.stopPropagation());
    const msg = document.createElement("p");
    msg.textContent = label;
    const row = document.createElement("div");
    row.className = "tqc-delete-confirm-row";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "tqc-btn tqc-btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => { state.deletingId = null; render(); });
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "tqc-btn tqc-btn-primary";
    deleteBtn.style.background = "#dc2626";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async (e) => {
      state.deletingId = null;
      const item = e.target.closest(".tqc-thread-item, .tqc-reply-item");
      if (item) {
        item.classList.add("tqc-deleting");
        await new Promise((res) => item.addEventListener("animationend", res, { once: true }));
      }
      await deleteComment(id);
    });
    row.appendChild(cancelBtn);
    row.appendChild(deleteBtn);
    wrap.appendChild(msg);
    wrap.appendChild(row);
    return wrap;
  }

  function makeEditable(el, commentId) {
    el.contentEditable = "true";
    el.spellcheck = true;
    let original = el.textContent;
    el.addEventListener("focus", () => { original = el.textContent; });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { el.textContent = original; el.blur(); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
    });
    el.addEventListener("blur", () => {
      const newText = el.textContent.trim();
      if (!newText) { el.textContent = original; return; }
      if (newText !== original.trim()) patchComment(commentId, { body: newText });
    });
  }

  function render() {
    if (!pinsRoot) return;
    document.documentElement.classList.toggle("tqc-dark", state.theme === "dark");

    const tops = topLevel();
    const unresolved = tops.filter((c) => !c.resolved).length;

    // Button
    button.classList.toggle("active", state.commentMode);
    if (state.commentMode) {
      button.innerHTML = `<span>Cancel</span>`;
    } else {
      button.innerHTML =
        `<span>${state.sidebarOpen ? "Hide" : "Comments"}</span>` +
        (unresolved ? `<span class="tqc-button-count">${unresolved}</span>` : "");
    }

    // Pins
    const docW = document.documentElement.scrollWidth;
    const docH = document.documentElement.scrollHeight;
    pinsRoot.innerHTML = "";
    if (state.pinsVisible) {
      tops.forEach((c) => {
        if (c.x == null || c.y == null) return; // general comment, no pin
        const pin = document.createElement("div");
        pin.className = "tqc-pin" + (c.resolved ? " resolved" : "");
        pin.style.left = `${c.x * docW}px`;
        pin.style.top = `${c.y * docH - 38}px`;

        const authors = authorsInThread(c, repliesFor(c.id));
        const shown = authors.slice(0, 3);
        const overflow = authors.length - shown.length;
        const avatars = shown
          .map((a) => `<div class="tqc-pin-avatar" style="background:${c.resolved ? "#9ca3af" : a.color}">${a.initial}</div>`)
          .join("");
        const more = overflow > 0
          ? `<div class="tqc-pin-avatar tqc-pin-avatar-more">+${overflow}</div>`
          : "";
        pin.innerHTML = `<div class="tqc-pin-avatars">${avatars}${more}</div>`;

        pin.addEventListener("click", (e) => {
          e.stopPropagation();
          openPin(c.id);
        });
        pinsRoot.appendChild(pin);
      });
    }

    // Popover — preserve scroll position when re-rendering the same pin
    let savedScrollTop = 0;
    let savedScrollPinId = null;
    if (popover) {
      const oldThread = popover.querySelector(".tqc-thread");
      if (oldThread) {
        savedScrollTop = oldThread.scrollTop;
        savedScrollPinId = popover.dataset.pinId;
      }
      popover.remove();
      popover = null;
    }
    if (state.activePinId) {
      const c = state.comments.find((x) => x.id === state.activePinId);
      if (c) {
        renderPopover(c, tops.findIndex((t) => t.id === c.id) + 1);
        if (popover && savedScrollPinId === state.activePinId && savedScrollTop > 0) {
          const newThread = popover.querySelector(".tqc-thread");
          if (newThread) newThread.scrollTop = savedScrollTop;
        }
      }
    }

    // Sidebar
    sidebar.classList.toggle("open", state.sidebarOpen);
    sidebar.innerHTML = "";
    const head = document.createElement("div");
    head.className = "tqc-sidebar-head";
    head.innerHTML = `<span>Comments <span class="tqc-count-chip">${tops.length}</span></span>`;
    const pinToggleBtn = document.createElement("button");
    pinToggleBtn.className = "tqc-btn tqc-btn-ghost";
    pinToggleBtn.textContent = state.pinsVisible ? "Hide pins" : "Show pins";
    pinToggleBtn.style.fontSize = "12px";
    pinToggleBtn.style.marginLeft = "auto";
    pinToggleBtn.addEventListener("click", () => {
      state.pinsVisible = !state.pinsVisible;
      render();
    });
    const closeBtn = document.createElement("button");
    closeBtn.className = "tqc-btn tqc-btn-ghost";
    closeBtn.textContent = "×";
    closeBtn.style.fontSize = "20px";
    closeBtn.addEventListener("click", () => {
      state.sidebarOpen = false;
      render();
    });
    head.appendChild(pinToggleBtn);
    head.appendChild(closeBtn);
    sidebar.appendChild(head);

    // Tabs
    const openCount = tops.filter((c) => !c.resolved).length;
    const resolvedCount = tops.filter((c) => c.resolved).length;
    const tabsRow = document.createElement("div");
    tabsRow.className = "tqc-tabs";
    [
      { label: "All", value: "all", count: tops.length },
      { label: "Open", value: "open", count: openCount },
      { label: "Resolved", value: "resolved", count: resolvedCount },
    ].forEach(({ label, value, count }) => {
      const tab = document.createElement("button");
      tab.className = "tqc-tab" + (state.filter === value ? " active" : "");
      tab.textContent = count ? `${label} ${count}` : label;
      tab.addEventListener("click", () => { state.filter = value; render(); });
      tabsRow.appendChild(tab);
    });
    sidebar.appendChild(tabsRow);

    const addRow = document.createElement("div");
    addRow.className = "tqc-sidebar-add";

    if (state.editingFigma) {
      // Editing the Figma link — replaces the whole row, hides + Add comment
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "https://www.figma.com/...";
      input.value = getFigmaLink();

      const saveBtn = document.createElement("button");
      saveBtn.className = "tqc-btn tqc-btn-primary";
      saveBtn.textContent = "Save";
      const save = () => {
        setFigmaLink(input.value.trim());
        state.editingFigma = false;
        render();
      };
      saveBtn.addEventListener("click", save);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "tqc-btn tqc-btn-ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        state.editingFigma = false;
        render();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        else if (e.key === "Escape") { state.editingFigma = false; render(); }
      });

      addRow.appendChild(input);
      addRow.appendChild(saveBtn);
      addRow.appendChild(cancelBtn);
      setTimeout(() => input.focus(), 0);
    } else {
      const addBtn = document.createElement("button");
      addBtn.className = "tqc-btn tqc-btn-primary";
      addBtn.textContent = "+ Add comment";
      addBtn.addEventListener("click", () => {
        state.sidebarOpen = false;
        toggleCommentMode(true);
      });
      addRow.appendChild(addBtn);

      const figmaLink = getFigmaLink();
      if (figmaLink) {
        const openBtn = document.createElement("a");
        openBtn.className = "tqc-btn tqc-btn-secondary tqc-figma-btn";
        openBtn.href = figmaLink;
        openBtn.target = "_blank";
        openBtn.rel = "noopener noreferrer";
        openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" viewBox="0 0 38 57" style="flex-shrink:0"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF"/></svg><span>Open in Figma</span>`;
        addRow.appendChild(openBtn);

        const editBtn = document.createElement("button");
        editBtn.className = "tqc-icon-btn";
        editBtn.title = "Edit Figma link";
        editBtn.innerHTML = iconSvg(ICONS.pencil, 14);
        editBtn.addEventListener("click", () => {
          state.editingFigma = true;
          render();
        });
        addRow.appendChild(editBtn);
      } else {
        const addLinkBtn = document.createElement("button");
        addLinkBtn.className = "tqc-btn tqc-btn-secondary";
        addLinkBtn.textContent = "Add Figma Link";
        addLinkBtn.addEventListener("click", () => {
          state.editingFigma = true;
          render();
        });
        addRow.appendChild(addLinkBtn);
      }
    }
    sidebar.appendChild(addRow);

    const filtered = tops.filter((c) =>
      state.filter === "all" ? true :
      state.filter === "open" ? !c.resolved :
      c.resolved
    );

    const list = document.createElement("div");
    list.className = "tqc-sidebar-list";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tqc-empty";
      empty.textContent = state.filter === "all"
        ? "No comments yet. Click + Add comment to leave one."
        : state.filter === "open" ? "No open comments." : "No resolved comments.";
      list.appendChild(empty);
    } else {
      filtered.forEach((c) => {
        const i = tops.indexOf(c);
        const item = document.createElement("div");
        item.className = "tqc-thread-item" + (c.resolved ? " resolved" : "");
        const replies = repliesFor(c.id);

        // Header with inline icon actions
        const headRow = document.createElement("div");
        headRow.className = "tqc-comment-head";

        const headLeft = document.createElement("div");
        headLeft.style.flex = "1";
        headLeft.style.display = "flex";
        headLeft.style.alignItems = "center";
        const isPinned = c.x != null && c.y != null;
        if (isPinned) headLeft.style.cursor = "pointer";
        headLeft.innerHTML = `<span class="tqc-thread-num" style="background:${c.resolved ? "#9ca3af" : colorForComment(c)}">${initialFor(c)}</span><span class="tqc-author">${escapeHtml(c.author)}</span>`;
        if (isPinned) {
          headLeft.addEventListener("click", () => {
            openPin(c.id);
            const py = c.y * document.documentElement.scrollHeight;
            window.scrollTo({ top: Math.max(0, py - window.innerHeight / 3), behavior: "smooth" });
          });
        }

        const headRight = document.createElement("div");
        headRight.className = "tqc-head-right";
        headRight.innerHTML = `<span class="tqc-time">${formatTime(c.created_at)}</span>`;

        const resolveIcon = document.createElement("button");
        resolveIcon.className = "tqc-icon-btn" + (c.resolved ? " tqc-icon-resolved" : "");
        resolveIcon.title = c.resolved ? "Reopen" : "Resolve";
        resolveIcon.innerHTML = iconSvg(c.resolved ? ICONS.reopen : ICONS.resolve);
        resolveIcon.addEventListener("click", (e) => { e.stopPropagation(); patchComment(c.id, { resolved: !c.resolved }); });

        const deleteIcon = document.createElement("button");
        deleteIcon.className = "tqc-icon-btn tqc-icon-danger";
        deleteIcon.title = "Delete";
        deleteIcon.innerHTML = iconSvg(ICONS.trash);
        deleteIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          state.deletingId = c.id;
          render();
        });

        headRight.appendChild(buildReactionAddIcon(c));
        headRight.appendChild(resolveIcon);
        headRight.appendChild(deleteIcon);
        headRow.appendChild(headLeft);
        headRow.appendChild(headRight);
        item.appendChild(headRow);

        if (state.deletingId === c.id) {
          item.appendChild(makeDeleteConfirm(c.id, "Delete this comment and all replies?"));
          list.appendChild(item);
          return;
        }

        // Body — inline editable
        const body = document.createElement("div");
        body.className = "tqc-body";
        body.textContent = c.body;
        makeEditable(body, c.id);
        item.appendChild(body);

        // Reactions row (only if there are any)
        const cReactions = buildReactionsRow(c);
        if (cReactions) item.appendChild(cReactions);

        // Resolved badge (no replies case)
        if (c.resolved && !replies.length) {
          const meta = document.createElement("div");
          meta.className = "tqc-reply-count";
          meta.textContent = "resolved";
          item.appendChild(meta);
        }

        // Collapsible replies tree
        if (replies.length) {
          const isExpanded = state.expandedThreads.has(c.id);
          const toggle = document.createElement("button");
          toggle.className = "tqc-replies-toggle";
          toggle.innerHTML = `${isExpanded ? "▾" : "▸"} ${replies.length} repl${replies.length === 1 ? "y" : "ies"}${c.resolved ? " · resolved" : ""}`;
          toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            state.expandedThreads.has(c.id)
              ? state.expandedThreads.delete(c.id)
              : state.expandedThreads.add(c.id);
            render();
          });
          item.appendChild(toggle);

          if (isExpanded) {
            const tree = document.createElement("div");
            tree.className = "tqc-replies-tree";
            replies.forEach((r) => {
              const ri = document.createElement("div");
              ri.className = "tqc-reply-item";

              const rHead = document.createElement("div");
              rHead.className = "tqc-comment-head";

              const rLeft = document.createElement("span");
              rLeft.style.display = "inline-flex";
              rLeft.style.alignItems = "center";
              rLeft.innerHTML = `<span class="tqc-thread-num" style="width:18px;height:18px;font-size:10px;background:${colorForComment(r)}">${initialFor(r)}</span><span class="tqc-author">${escapeHtml(r.author)}</span>`;

              const rRight = document.createElement("div");
              rRight.className = "tqc-head-right";

              const rTime = document.createElement("span");
              rTime.className = "tqc-time";
              rTime.textContent = formatTime(r.created_at);

              const rDeleteIcon = document.createElement("button");
              rDeleteIcon.className = "tqc-icon-btn tqc-icon-danger";
              rDeleteIcon.title = "Delete reply";
              rDeleteIcon.innerHTML = iconSvg(ICONS.trash);
              rDeleteIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                state.deletingId = r.id;
                render();
              });

              rRight.appendChild(rTime);
              rRight.appendChild(buildReactionAddIcon(r));
              rRight.appendChild(rDeleteIcon);
              rHead.appendChild(rLeft);
              rHead.appendChild(rRight);

              ri.appendChild(rHead);

              if (state.deletingId === r.id) {
                ri.appendChild(makeDeleteConfirm(r.id, "Delete this reply?"));
                tree.appendChild(ri);
                return;
              }

              const rBody = document.createElement("div");
              rBody.className = "tqc-body";
              rBody.textContent = r.body;
              makeEditable(rBody, r.id);
              ri.appendChild(rBody);
              const rReactions = buildReactionsRow(r);
              if (rReactions) ri.appendChild(rReactions);
              tree.appendChild(ri);
            });
            item.appendChild(tree);
          }
        }



        list.appendChild(item);
      });
    }
    sidebar.appendChild(list);

    // General comment composer (unpinned comments — no x/y)
    const generalComposer = document.createElement("div");
    generalComposer.className = "tqc-general-composer";

    const genTa = document.createElement("textarea");
    genTa.placeholder = "Add a general comment…";
    generalComposer.appendChild(genTa);

    const genSend = document.createElement("button");
    genSend.className = "tqc-send-btn";
    genSend.title = "Post comment";
    genSend.innerHTML = iconSvg(ICONS.arrowUp, 16);
    const submitGeneral = async () => {
      if (!genSend.classList.contains("active")) return;
      const body = genTa.value.trim();
      if (!body) return;
      if (!ensureAuthor()) return;
      genTa.value = "";
      genSend.classList.remove("active");
      await postComment({ body });
    };
    genSend.addEventListener("click", submitGeneral);
    genTa.addEventListener("input", () => {
      genSend.classList.toggle("active", genTa.value.trim().length > 0);
    });
    genTa.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitGeneral();
      }
    });
    generalComposer.appendChild(genSend);
    sidebar.appendChild(generalComposer);

    // User footer
    const footer = document.createElement("div");
    footer.className = "tqc-user-footer";
    if (state.editingProfile) {
      const editor = document.createElement("div");
      editor.className = "tqc-user-editor";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Your name";
      nameInput.value = state.author || "";

      const swatches = document.createElement("div");
      swatches.className = "tqc-color-swatches";
      USER_COLORS.forEach((color) => {
        const sw = document.createElement("button");
        sw.className = "tqc-swatch" + (state.userColor === color ? " selected" : "");
        sw.style.background = color;
        sw.addEventListener("click", () => {
          state.userColor = color;
          localStorage.setItem("tqc-author-color", color);
          render();
        });
        swatches.appendChild(sw);
      });

      const row = document.createElement("div");
      row.className = "tqc-user-editor-row";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "tqc-btn tqc-btn-ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        state.editingProfile = false;
        render();
      });

      const doneBtn = document.createElement("button");
      doneBtn.className = "tqc-btn tqc-btn-primary";
      doneBtn.textContent = "Done";
      const save = () => {
        const newName = nameInput.value.trim();
        if (newName) {
          state.author = newName;
          localStorage.setItem("tqc-author", newName);
        }
        state.editingProfile = false;
        render();
      };
      doneBtn.addEventListener("click", save);
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        else if (e.key === "Escape") { state.editingProfile = false; render(); }
      });

      row.appendChild(cancelBtn);
      row.appendChild(doneBtn);
      editor.appendChild(nameInput);
      editor.appendChild(swatches);
      editor.appendChild(row);
      footer.appendChild(editor);
      setTimeout(() => nameInput.focus(), 0);
    } else {
      const row = document.createElement("div");
      row.className = "tqc-user-footer-row";

      const pill = document.createElement("div");
      pill.className = "tqc-user-pill";
      pill.addEventListener("click", () => { state.editingProfile = true; render(); });

      const avatar = document.createElement("div");
      avatar.className = "tqc-user-avatar";
      avatar.style.background = state.userColor;
      avatar.textContent = state.author ? state.author[0].toUpperCase() : "?";

      const name = document.createElement("span");
      name.className = "tqc-user-name" + (state.author ? "" : " empty");
      name.textContent = state.author || "Set your name";

      pill.appendChild(avatar);
      pill.appendChild(name);
      row.appendChild(pill);

      const themeBtn = document.createElement("button");
      themeBtn.className = "tqc-theme-btn";
      themeBtn.title = state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      themeBtn.innerHTML = iconSvg(state.theme === "dark" ? ICONS.sun : ICONS.moon, 16);
      themeBtn.addEventListener("click", () => {
        state.theme = state.theme === "dark" ? "light" : "dark";
        localStorage.setItem("tqc-theme", state.theme);
        render();
      });
      row.appendChild(themeBtn);

      footer.appendChild(row);
    }
    sidebar.appendChild(footer);
  }

  function renderPopover(c, num) {
    popover = document.createElement("div");
    popover.className = "tqc-popover";
    popover.dataset.pinId = c.id;
    popover.addEventListener("click", (e) => e.stopPropagation());
    popover.addEventListener("mouseenter", () => { popoverHovered = true; });
    popover.addEventListener("mouseleave", () => { popoverHovered = false; });

    const docW = document.documentElement.scrollWidth;
    const docH = document.documentElement.scrollHeight;
    const px = (c.x || 0) * docW;
    const py = (c.y || 0) * docH;
    let left = px + 18;
    const maxLeft = window.scrollX + window.innerWidth - 332;
    if (left > maxLeft) left = px - 332;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${py - 10}px`;

    // If pending delete confirmation, replace popover content entirely
    if (state.deletingId === c.id) {
      const wrap = document.createElement("div");
      wrap.style.padding = "28px 20px 20px";
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "16px";

      const msg = document.createElement("p");
      msg.style.margin = "0";
      msg.style.fontSize = "14px";
      msg.style.lineHeight = "1.4";
      msg.textContent = "Delete this comment and all replies?";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.justifyContent = "flex-end";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "tqc-btn tqc-btn-secondary";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => { state.deletingId = null; render(); });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "tqc-btn tqc-btn-primary";
      deleteBtn.style.background = "#dc2626";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        state.deletingId = null;
        state.activePinId = null;
        await deleteComment(c.id);
      });

      row.appendChild(cancelBtn);
      row.appendChild(deleteBtn);
      wrap.appendChild(msg);
      wrap.appendChild(row);
      popover.appendChild(wrap);
      pinsRoot.appendChild(popover);
      return;
    }

    // Header — title + icon actions, 48px tall, border-bottom
    const header = document.createElement("div");
    header.className = "tqc-popover-header";

    const title = document.createElement("span");
    title.textContent = c.resolved ? "Comments · resolved" : "Comments";
    header.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "tqc-popover-actions";

    const resolveIcon = document.createElement("button");
    resolveIcon.className = "tqc-icon-btn" + (c.resolved ? " tqc-icon-resolved" : "");
    resolveIcon.title = c.resolved ? "Reopen" : "Resolve";
    resolveIcon.innerHTML = iconSvg(c.resolved ? ICONS.reopen : ICONS.resolve);
    resolveIcon.addEventListener("click", () => patchComment(c.id, { resolved: !c.resolved }));

    const deleteIcon = document.createElement("button");
    deleteIcon.className = "tqc-icon-btn tqc-icon-danger";
    deleteIcon.title = "Delete";
    deleteIcon.innerHTML = iconSvg(ICONS.trash);
    deleteIcon.addEventListener("click", () => {
      state.deletingId = c.id;
      render();
    });

    actions.appendChild(resolveIcon);
    actions.appendChild(deleteIcon);
    header.appendChild(actions);
    popover.appendChild(header);

    // Thread
    const thread = document.createElement("div");
    thread.className = "tqc-thread";
    thread.addEventListener("scroll", () => { popoverScrolledAt = Date.now(); });
    const all = [c, ...repliesFor(c.id)];
    all.forEach((item) => {
      const div = document.createElement("div");
      div.className = "tqc-comment";

      const head = document.createElement("div");
      head.className = "tqc-comment-head";

      const left = document.createElement("span");
      left.style.display = "inline-flex";
      left.style.alignItems = "center";
      left.innerHTML = `<span class="tqc-thread-num" style="background:${item.resolved ? "#9ca3af" : colorForComment(item)}">${initialFor(item)}</span><span class="tqc-author">${escapeHtml(item.author)}</span>`;

      const right = document.createElement("div");
      right.className = "tqc-head-right";

      const time = document.createElement("span");
      time.className = "tqc-time";
      time.textContent = formatTime(item.created_at);
      right.appendChild(time);
      right.appendChild(buildReactionAddIcon(item));

      head.appendChild(left);
      head.appendChild(right);
      div.appendChild(head);

      const body = document.createElement("div");
      body.className = "tqc-body";
      body.textContent = item.body;
      div.appendChild(body);

      const reactions = buildReactionsRow(item);
      if (reactions) div.appendChild(reactions);

      thread.appendChild(div);
    });
    popover.appendChild(thread);

    // Composer with send button pinned inside
    const composer = document.createElement("div");
    composer.className = "tqc-composer";

    const ta = document.createElement("textarea");
    ta.placeholder = "Reply…";
    composer.appendChild(ta);

    const sendBtn = document.createElement("button");
    sendBtn.className = "tqc-send-btn";
    sendBtn.title = "Send reply";
    sendBtn.innerHTML = iconSvg(ICONS.arrowUp, 16);

    const sendReply = async () => {
      if (!sendBtn.classList.contains("active")) return;
      const body = ta.value.trim();
      if (!body) return;
      if (!ensureAuthor()) return;
      ta.value = "";
      sendBtn.classList.remove("active");
      await postComment({ parent_id: c.id, body });
    };
    sendBtn.addEventListener("click", sendReply);
    ta.addEventListener("input", () => {
      sendBtn.classList.toggle("active", ta.value.trim().length > 0);
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendReply();
      }
    });

    composer.appendChild(sendBtn);
    popover.appendChild(composer);

    pinsRoot.appendChild(popover);
  }

  function showInlineComposer({ x, y, selector }, px, py) {
    if (inlineComposer) inlineComposer.remove();
    const composer = document.createElement("div");
    inlineComposer = composer;
    composer.className = "tqc-popover";
    let left = px + 18;
    const maxLeft = window.scrollX + window.innerWidth - 332;
    if (left > maxLeft) left = px - 332;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    const top = Math.max(window.scrollY + 8, py - 10);
    composer.style.left = `${left}px`;
    composer.style.top = `${top}px`;
    composer.style.zIndex = "2147483647";
    composer.style.padding = "12px";
    composer.addEventListener("click", (e) => e.stopPropagation());

    const ta = document.createElement("textarea");
    ta.className = "tqc-composer-input";
    ta.placeholder = "Leave a comment…";

    const row = document.createElement("div");
    row.className = "tqc-composer-row";
    row.style.marginTop = "8px";

    const cancel = document.createElement("button");
    cancel.className = "tqc-btn tqc-btn-ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      composer.remove();
      inlineComposer = null;
    });

    const submit = document.createElement("button");
    submit.className = "tqc-btn tqc-btn-primary";
    submit.textContent = "Comment";
    submit.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body) return;
      composer.remove();
      inlineComposer = null;
      const c = await postComment({ x, y, selector, body });
      if (c) openPin(c.id);
    });

    row.appendChild(cancel);
    row.appendChild(submit);
    composer.appendChild(ta);
    composer.appendChild(row);
    document.body.appendChild(composer);
    setTimeout(() => ta.focus(), 0);
  }

  function onDocClick(e) {
    if (
      state.activePinId &&
      !e.target.closest(".tqc-popover") &&
      !e.target.closest(".tqc-pin") &&
      !e.target.closest(".tqc-sidebar")
    ) {
      state.activePinId = null;
      render();
    }
  }

  function init() {
    mountUI();
    document.addEventListener("click", onDocClick);
    window.addEventListener("resize", render);
    fetchComments();
    fetchSettings();
    setInterval(fetchComments, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
