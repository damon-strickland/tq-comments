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
    author: localStorage.getItem("tqc-author") || "",
  };

  let pinsRoot, fixedRoot, sidebar, button, popover, inlineComposer, commentBanner;

  function getPageUrl() {
    return window.location.origin + window.location.pathname;
  }

  // ---- API (Supabase REST / PostgREST) ----
  function normalize(c) {
    return {
      ...c,
      created_at: new Date(c.created_at).getTime(),
      updated_at: new Date(c.updated_at).getTime(),
      resolved: c.resolved ? 1 : 0,
    };
  }

  async function fetchComments() {
    const url = `${SUPABASE_URL}/rest/v1/comments?url=eq.${encodeURIComponent(getPageUrl())}&order=created_at.asc`;
    const r = await fetch(url, { headers: SB_HEADERS });
    if (!r.ok) return;
    const rows = await r.json();
    state.comments = rows.map(normalize);
    render();
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
      .tqc-pin-num, .tqc-time, .tqc-thread-num {
        font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        font-feature-settings: "tnum" 1;
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
        position: absolute; width: 28px; height: 28px;
        background: #2563eb; border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg); border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer; pointer-events: auto;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.1s;
      }
      .tqc-pin:hover { transform: rotate(-45deg) scale(1.08); }
      .tqc-pin.resolved { background: #6b7280; opacity: 0.55; }
      .tqc-pin.active { background: #1d4ed8; transform: rotate(-45deg) scale(1.15); }
      .tqc-pin-num {
        transform: rotate(45deg); font-size: 12px; font-weight: 600; color: white;
      }
      .tqc-popover {
        position: absolute; width: 320px; background: white;
        border-radius: 10px; box-shadow: 0 12px 36px rgba(0,0,0,0.2);
        pointer-events: auto; padding: 12px; color: #111; font-size: 14px; line-height: 1.4;
      }
      .tqc-thread { max-height: 240px; overflow-y: auto; margin-bottom: 8px; }
      .tqc-comment { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
      .tqc-comment:last-child { border-bottom: 0; }
      .tqc-comment-head {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;
      }
      .tqc-author { font-weight: 600; }
      .tqc-time { color: #6b7280; font-size: 12px; }
      .tqc-body { white-space: pre-wrap; word-wrap: break-word; }
      .tqc-composer { display: flex; flex-direction: column; gap: 8px; }
      .tqc-composer textarea {
        width: 100%; min-height: 64px;
        border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px;
        font: inherit; resize: vertical; color: #111; background: white;
      }
      .tqc-composer textarea:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
      .tqc-composer-row { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
      .tqc-btn {
        padding: 6px 12px; border-radius: 6px; border: 0; font: inherit; font-size: 13px; cursor: pointer; line-height: 1.2;
      }
      .tqc-btn-primary { background: #2563eb; color: white; }
      .tqc-btn-primary:hover { background: #1d4ed8; }
      .tqc-btn-secondary { background: #f3f4f6; color: #111; }
      .tqc-btn-secondary:hover { background: #e5e7eb; }
      .tqc-btn-ghost { background: transparent; color: #6b7280; padding: 6px 8px; }
      .tqc-btn-ghost:hover { color: #111; background: #f3f4f6; }
      .tqc-sidebar {
        position: fixed; top: 0; right: 0; bottom: 0; width: 360px;
        background: white; box-shadow: -2px 0 16px rgba(0,0,0,0.12);
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
      .tqc-sidebar-add {
        padding: 10px 16px; border-bottom: 1px solid #e5e7eb;
      }
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
      .tqc-empty { padding: 40px 20px; color: #6b7280; text-align: center; font-size: 14px; }
      .tqc-reply-count { font-size: 12px; color: #6b7280; margin-top: 4px; }
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

  function render() {
    if (!pinsRoot) return;

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
    tops.forEach((c, i) => {
      const pin = document.createElement("div");
      const isActive = c.id === state.activePinId;
      pin.className =
        "tqc-pin" + (c.resolved ? " resolved" : "") + (isActive ? " active" : "");
      pin.style.left = `${(c.x || 0) * docW - 14}px`;
      pin.style.top = `${(c.y || 0) * docH - 28}px`;
      pin.innerHTML = `<span class="tqc-pin-num">${i + 1}</span>`;
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        openPin(c.id);
      });
      pinsRoot.appendChild(pin);
    });

    // Popover
    if (popover) {
      popover.remove();
      popover = null;
    }
    if (state.activePinId) {
      const c = state.comments.find((x) => x.id === state.activePinId);
      if (c) renderPopover(c, tops.findIndex((t) => t.id === c.id) + 1);
    }

    // Sidebar
    sidebar.classList.toggle("open", state.sidebarOpen);
    sidebar.innerHTML = "";
    const head = document.createElement("div");
    head.className = "tqc-sidebar-head";
    head.innerHTML = `<span>Comments (${tops.length})</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "tqc-btn tqc-btn-ghost";
    closeBtn.textContent = "×";
    closeBtn.style.fontSize = "20px";
    closeBtn.addEventListener("click", () => {
      state.sidebarOpen = false;
      render();
    });
    head.appendChild(closeBtn);
    sidebar.appendChild(head);

    const addRow = document.createElement("div");
    addRow.className = "tqc-sidebar-add";
    const addBtn = document.createElement("button");
    addBtn.className = "tqc-btn tqc-btn-primary";
    addBtn.textContent = "+ Add comment";
    addBtn.addEventListener("click", () => {
      state.sidebarOpen = false;
      toggleCommentMode(true);
    });
    addRow.appendChild(addBtn);
    sidebar.appendChild(addRow);

    const list = document.createElement("div");
    list.className = "tqc-sidebar-list";
    if (tops.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tqc-empty";
      empty.textContent = "No comments yet. Click + Add comment to leave one.";
      list.appendChild(empty);
    } else {
      tops.forEach((c, i) => {
        const item = document.createElement("div");
        item.className = "tqc-thread-item" + (c.resolved ? " resolved" : "");
        const replies = repliesFor(c.id);
        item.innerHTML = `
          <div class="tqc-comment-head">
            <div><span class="tqc-thread-num">${i + 1}</span><span class="tqc-author">${escapeHtml(c.author)}</span></div>
            <span class="tqc-time">${formatTime(c.created_at)}</span>
          </div>
          <div class="tqc-body">${escapeHtml(c.body)}</div>
          ${replies.length ? `<div class="tqc-reply-count">${replies.length} repl${replies.length === 1 ? "y" : "ies"}${c.resolved ? " · resolved" : ""}</div>` : c.resolved ? `<div class="tqc-reply-count">resolved</div>` : ""}
        `;
        item.addEventListener("click", () => {
          state.sidebarOpen = false;
          openPin(c.id);
          const py = (c.y || 0) * document.documentElement.scrollHeight;
          window.scrollTo({
            top: Math.max(0, py - window.innerHeight / 3),
            behavior: "smooth",
          });
        });
        list.appendChild(item);
      });
    }
    sidebar.appendChild(list);
  }

  function renderPopover(c, num) {
    popover = document.createElement("div");
    popover.className = "tqc-popover";
    popover.addEventListener("click", (e) => e.stopPropagation());

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

    const thread = document.createElement("div");
    thread.className = "tqc-thread";
    const all = [c, ...repliesFor(c.id)];
    all.forEach((item) => {
      const div = document.createElement("div");
      div.className = "tqc-comment";
      div.innerHTML = `
        <div class="tqc-comment-head">
          <span><span class="tqc-author">${escapeHtml(item.author)}</span>${item === c ? ` <span class="tqc-time">· #${num}${c.resolved ? " · resolved" : ""}</span>` : ""}</span>
          <span class="tqc-time">${formatTime(item.created_at)}</span>
        </div>
        <div class="tqc-body">${escapeHtml(item.body)}</div>
      `;
      thread.appendChild(div);
    });
    popover.appendChild(thread);

    const composer = document.createElement("div");
    composer.className = "tqc-composer";
    const ta = document.createElement("textarea");
    ta.placeholder = "Reply…";
    composer.appendChild(ta);

    const row = document.createElement("div");
    row.className = "tqc-composer-row";

    const delBtn = document.createElement("button");
    delBtn.className = "tqc-btn tqc-btn-ghost";
    delBtn.textContent = "Delete";
    delBtn.style.marginRight = "auto";
    delBtn.addEventListener("click", async () => {
      if (confirm("Delete this comment and all replies?")) {
        state.activePinId = null;
        await deleteComment(c.id);
      }
    });

    const resolveBtn = document.createElement("button");
    resolveBtn.className = "tqc-btn tqc-btn-secondary";
    resolveBtn.textContent = c.resolved ? "Reopen" : "Resolve";
    resolveBtn.addEventListener("click", () =>
      patchComment(c.id, { resolved: !c.resolved })
    );

    const replyBtn = document.createElement("button");
    replyBtn.className = "tqc-btn tqc-btn-primary";
    replyBtn.textContent = "Reply";
    replyBtn.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body) return;
      if (!ensureAuthor()) return;
      ta.value = "";
      await postComment({ parent_id: c.id, body });
    });

    row.appendChild(delBtn);
    row.appendChild(resolveBtn);
    row.appendChild(replyBtn);
    composer.appendChild(row);
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
    composer.addEventListener("click", (e) => e.stopPropagation());

    const ta = document.createElement("textarea");
    ta.placeholder = "Leave a comment…";
    ta.style.width = "100%";
    ta.style.minHeight = "70px";
    ta.style.border = "1px solid #d1d5db";
    ta.style.borderRadius = "6px";
    ta.style.padding = "6px 8px";
    ta.style.font = "inherit";
    ta.style.resize = "vertical";

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
      !e.target.closest(".tqc-pin")
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
    setInterval(fetchComments, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
