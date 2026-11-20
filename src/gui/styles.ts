/** Styles for the automation manager UI, injected once per window. */
const CSS_ID = "opencode-automation-manager-styles"

export function installStyles(): void {
  if (typeof document === "undefined") return
  let style = document.getElementById(CSS_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = CSS_ID
    document.head.appendChild(style)
  }
  style.textContent = CSS
}

export const CSS = `/* Automation Manager styles. Namespaced with am- to avoid host collisions. */

.am-root {
  --am-strong: var(--color-v2-text-text-contrast, var(--color-text-strong, currentColor));
  --am-muted: var(--color-v2-text-text-muted, var(--color-text-weak, color-mix(in srgb, currentColor 58%, transparent)));
  --am-faint: var(--color-v2-text-text-faint, color-mix(in srgb, currentColor 42%, transparent));
  --am-border: var(--color-v2-border-border-base, var(--color-border-weak-base, color-mix(in srgb, currentColor 12%, transparent)));
  --am-card: var(--color-v2-background-bg-base, var(--color-surface-base, #fff));
  --am-layer: var(--color-v2-background-bg-layer-01, #fafafa);
  --am-accent: #6d4aff;
  --am-accent-hover: #5b3be0;
  --am-green: #12805c;
  --am-amber: #a15c07;
  --am-red: #d92d20;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 4px 0 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--am-strong);
  font-size: 13px;
  line-height: 1.5;
}
.am-root *, .am-root *::before, .am-root *::after { box-sizing: border-box; }
.am-root button, .am-root select, .am-root input, .am-root textarea { font: inherit; color: inherit; }

/* ---- header ---- */
.am-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border: 1px solid var(--am-border);
  border-radius: 14px;
  background:
    radial-gradient(130% 200% at 0% 0%, color-mix(in srgb, var(--am-accent) 12%, transparent) 0%, transparent 58%),
    var(--am-card);
}
.am-hero h1 { margin: 0 0 4px; font-size: 17px; font-weight: 650; letter-spacing: .01em; }
.am-hero p { margin: 0; color: var(--am-muted); max-width: 62ch; }
.am-hero-stats { display: flex; align-items: center; gap: 10px; margin-top: 10px; color: var(--am-muted); }
.am-hero-stats b { color: var(--am-strong); font-weight: 650; }
.am-hero-tools { display: flex; gap: 8px; flex: none; }

/* ---- buttons ---- */
.am-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px; padding: 0 12px;
  border: 1px solid var(--am-border); border-radius: 8px;
  background: var(--am-card); color: var(--am-strong);
  cursor: pointer; white-space: nowrap;
  transition: background .12s ease, border-color .12s ease, opacity .12s ease;
}
.am-btn:hover:not(:disabled) { background: var(--am-layer); }
.am-btn:disabled { opacity: .5; cursor: default; }
.am-btn-primary { background: var(--am-accent); border-color: var(--am-accent); color: #fff; }
.am-btn-primary:hover:not(:disabled) { background: var(--am-accent-hover); border-color: var(--am-accent-hover); }
.am-btn-ghost { background: transparent; }
.am-btn-danger { color: var(--am-red); border-color: color-mix(in srgb, var(--am-red) 40%, var(--am-border)); }
.am-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--am-red) 9%, transparent); }
.am-btn-danger.am-armed { background: var(--am-red); border-color: var(--am-red); color: #fff; }
.am-btn-small { height: 26px; padding: 0 9px; font-size: 12px; border-radius: 7px; }

/* ---- toolbar ---- */
.am-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.am-tabs { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--am-border); border-radius: 9px; background: var(--am-layer); }
.am-tab { border: 0; background: transparent; color: var(--am-muted); height: 26px; padding: 0 11px; border-radius: 7px; cursor: pointer; }
.am-tab:hover { color: var(--am-strong); }
.am-tab.active { background: var(--am-card); color: var(--am-strong); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.am-toolbar-end { display: flex; align-items: center; gap: 8px; }

.am-filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.am-filter {
  display: inline-flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 10px;
  border: 1px solid var(--am-border); border-radius: 999px;
  background: transparent; color: var(--am-muted); cursor: pointer;
}
.am-filter:hover { color: var(--am-strong); }
.am-filter.active { background: color-mix(in srgb, var(--am-accent) 12%, transparent); border-color: color-mix(in srgb, var(--am-accent) 45%, var(--am-border)); color: var(--am-accent); }
.am-filter-count { font-variant-numeric: tabular-nums; opacity: .75; }

.am-input, .am-search, .am-textarea, .am-select {
  width: 100%; border: 1px solid var(--am-border); border-radius: 8px;
  background: var(--am-card); padding: 7px 10px; outline: none;
}
.am-input:focus, .am-search:focus, .am-textarea:focus, .am-select:focus {
  border-color: color-mix(in srgb, var(--am-accent) 55%, var(--am-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--am-accent) 14%, transparent);
}
.am-textarea { min-height: 120px; resize: vertical; line-height: 1.55; font-family: inherit; }
.am-textarea.mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 12px; }
.am-search { max-width: 240px; margin-left: auto; }

/* ---- cards ---- */
.am-list { display: flex; flex-direction: column; gap: 10px; }
.am-card {
  border: 1px solid var(--am-border); border-radius: 12px;
  background: var(--am-card); padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
  transition: border-color .12s ease;
}
.am-card:hover { border-color: color-mix(in srgb, var(--am-accent) 30%, var(--am-border)); }
.am-card.expanded { border-color: color-mix(in srgb, var(--am-accent) 42%, var(--am-border)); }
.am-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.am-card-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.am-name { font-weight: 640; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46ch; }
.am-card-actions { display: flex; align-items: center; gap: 6px; flex: none; }

.am-badge {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 8px; border-radius: 999px;
  font-size: 11.5px; font-weight: 600; border: 1px solid transparent; white-space: nowrap;
}
.am-badge::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .85; }
.am-status-active { color: var(--am-green); background: color-mix(in srgb, var(--am-green) 11%, transparent); border-color: color-mix(in srgb, var(--am-green) 26%, transparent); }
.am-status-paused { color: var(--am-amber); background: color-mix(in srgb, var(--am-amber) 11%, transparent); border-color: color-mix(in srgb, var(--am-amber) 26%, transparent); }
.am-status-done { color: var(--am-muted); background: var(--am-layer); border-color: var(--am-border); }
.am-tone-ok { color: var(--am-green); background: color-mix(in srgb, var(--am-green) 10%, transparent); border-color: color-mix(in srgb, var(--am-green) 24%, transparent); }
.am-tone-warn { color: var(--am-amber); background: color-mix(in srgb, var(--am-amber) 10%, transparent); border-color: color-mix(in srgb, var(--am-amber) 24%, transparent); }
.am-tone-bad { color: var(--am-red); background: color-mix(in srgb, var(--am-red) 10%, transparent); border-color: color-mix(in srgb, var(--am-red) 24%, transparent); }
.am-kind { color: var(--am-muted); border: 1px dashed var(--am-border); padding: 0 7px; height: 20px; display: inline-flex; align-items: center; border-radius: 6px; font-size: 11.5px; }

.am-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--am-muted); }
.am-sep { opacity: .45; }
.am-next { color: var(--am-strong); font-weight: 560; }
.am-last-output {
  margin: 0; padding: 7px 10px; border-radius: 8px; background: var(--am-layer);
  color: var(--am-muted); font-size: 12px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ---- detail ---- */
.am-detail { border-top: 1px dashed var(--am-border); padding-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.am-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 6px 18px; }
.am-kv-row { display: flex; gap: 8px; min-width: 0; }
.am-kv-key { color: var(--am-faint); flex: none; min-width: 62px; }
.am-kv-val { color: var(--am-muted); overflow-wrap: anywhere; }
.am-block { display: flex; flex-direction: column; gap: 5px; }
.am-block-title { color: var(--am-faint); font-size: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.am-pre {
  margin: 0; padding: 10px 12px; border-radius: 9px; background: var(--am-layer);
  border: 1px solid var(--am-border);
  white-space: pre-wrap; overflow-wrap: anywhere; max-height: 280px; overflow: auto;
  font-size: 12px; line-height: 1.6;
}

/* ---- history ---- */
.am-history { display: flex; flex-direction: column; gap: 8px; }
.am-run { border: 1px solid var(--am-border); border-radius: 9px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }
.am-run-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.am-run-index { font-weight: 600; }
.am-run-time { color: var(--am-muted); }
.am-run-text { margin: 0; color: var(--am-muted); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow: auto; }
.am-run-prompt { color: var(--am-faint); border-left: 2px solid var(--am-border); padding-left: 8px; }
.am-more { align-self: flex-start; }

/* ---- form ---- */
.am-form { display: flex; flex-direction: column; gap: 14px; }
.am-section {
  border: 1px solid var(--am-border); border-radius: 12px; background: var(--am-card);
  padding: 14px; display: flex; flex-direction: column; gap: 10px;
}
.am-section-title { font-weight: 640; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.am-section-hint { color: var(--am-faint); font-weight: 400; font-size: 12px; }
.am-field { display: flex; flex-direction: column; gap: 5px; }
.am-label { color: var(--am-muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }
.am-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.am-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.am-seg { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--am-border); border-radius: 9px; background: var(--am-layer); }
.am-seg button { border: 0; background: transparent; color: var(--am-muted); height: 28px; padding: 0 12px; border-radius: 7px; cursor: pointer; }
.am-seg button:hover { color: var(--am-strong); }
.am-seg button.active { background: var(--am-card); color: var(--am-strong); box-shadow: 0 1px 2px rgba(0,0,0,.08); }

.am-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.am-chip {
  border: 1px solid var(--am-border); background: transparent; color: var(--am-muted);
  height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; cursor: pointer;
}
.am-chip:hover { color: var(--am-accent); border-color: color-mix(in srgb, var(--am-accent) 40%, var(--am-border)); }

.am-note { color: var(--am-muted); font-size: 12px; }
.am-warn {
  border: 1px solid color-mix(in srgb, var(--am-amber) 30%, var(--am-border));
  background: color-mix(in srgb, var(--am-amber) 8%, transparent);
  color: var(--am-amber); border-radius: 9px; padding: 9px 11px; font-size: 12px;
}
.am-error {
  border: 1px solid color-mix(in srgb, var(--am-red) 30%, var(--am-border));
  background: color-mix(in srgb, var(--am-red) 8%, transparent);
  color: var(--am-red); border-radius: 9px; padding: 9px 11px; font-size: 12px;
  white-space: pre-wrap;
}
.am-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.am-actions-spacer { flex: 1; }

/* ---- empty / loading ---- */
.am-empty {
  border: 1px dashed var(--am-border); border-radius: 12px;
  padding: 34px 18px; text-align: center; color: var(--am-muted);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.am-empty-title { margin: 0; color: var(--am-strong); font-weight: 600; }
.am-empty-hint { margin: 0; font-size: 12px; }
.am-skeleton { height: 72px; border-radius: 12px; background: var(--am-layer); animation: am-pulse 1.4s ease-in-out infinite; }
@keyframes am-pulse { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) {
  .am-skeleton { animation: none; }
  .am-root *, .am-root *::before, .am-root *::after { transition: none !important; }
}
`
