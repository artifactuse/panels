<template>
  <div class="preview-container" :class="{ 'markdown-mode': isMarkdown, 'iframe-mode': !isMarkdown }">
    <div v-if="error" class="error">
      <div class="error-title">Preview Error</div>
      <pre>{{ error }}</pre>
    </div>

   <iframe
      v-else-if="iframeSrc"
      :key="iframeKey"
      :src="iframeSrc"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      allow="camera; microphone; fullscreen; geolocation; display-capture; autoplay; clipboard-write; encrypted-media; gyroscope; accelerometer; picture-in-picture"
      @error="handleIframeError"
    ></iframe>

    <!-- Artifact arrived empty, or nothing ever arrived -->
    <div v-else-if="hasArtifact || waitedTooLong" class="empty">{{ emptyMessage }}</div>

    <!-- Still waiting for an artifact -->
    <div v-else class="loading">
      <div class="spinner"></div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { marked } from 'marked';
import {
  createBridge,
  setupArtifactListeners,
  applyTheme,
  detectTheme,
} from '@artifactuse/shared';
import { parseColor } from '@artifactuse/shared/theme';

// Configure marked for GFM (tables, strikethrough, task lists)
marked.use({ gfm: true, breaks: true });

const props = defineProps({
  code: { type: String, default: '' },
  language: { type: String, default: 'html' }
});

const code = ref(props.code);
const language = ref(props.language);
const error = ref(null);
const iframeKey = ref(0);
const iframeSrc = ref('');
const theme = ref('dark');

// Distinguishes "no artifact yet" (spinner) from "artifact with empty content"
// (empty state). Without this an empty artifact spins forever.
const hasArtifact = ref(false);

// Nothing arrived within ARTIFACT_WAIT_MS. Either the panel was opened
// standalone (no parent to send content — bridge.send() no-ops when
// window.parent === window) or the handshake failed. Without this the spinner
// runs forever with no explanation.
const ARTIFACT_WAIT_MS = 5000;
const waitedTooLong = ref(false);
let waitTimer = null;

const isMarkdown = computed(() => {
  const lang = language.value.toLowerCase();
  return lang === 'markdown' || lang === 'md';
});

// Shown in place of the spinner once we know no content is coming
const emptyMessage = computed(() => {
  return hasArtifact.value ? 'Nothing to preview' : 'No content received';
});


// Handle iframe load error (e.g. blob URL revoked, memory pressure)
function handleIframeError() {
  error.value = 'Failed to load preview content';
  iframeSrc.value = '';
}

// Handle link clicks in the panel itself - navigate top
function handleLinkClick(e) {
  const link = e.target.closest('a');
  if (link && link.href && !link.href.startsWith('javascript:')) {
    e.preventDefault();
    window.top.location.href = link.href;
  }
}

// Handle navigation requests from the sandboxed blob iframe via postMessage
function handleNavigateMessage(e) {
  if (e.data && e.data.type === 'artifactuse:navigate' && e.data.url) {
    window.top.location.href = e.data.url;
  }
}

// Handle console messages from the sandboxed blob iframe and relay to SDK via bridge
function handleConsoleMessage(e) {
  if (e.data && e.data.type === 'artifactuse:console' && e.data.entry) {
    if (bridge) bridge.send('console:log', { entry: e.data.entry });
  }
}


// Script injected into blob iframe to intercept link clicks and programmatic navigations
// Sends the URL to the parent panel via postMessage (the panel then navigates top)
const LINK_INTERCEPT_SCRIPT = `<script>
(function() {
  function nav(url) {
    window.parent.postMessage({ type: 'artifactuse:navigate', url: url }, '*');
  }

  // 1. Intercept <a> clicks
  document.addEventListener('click', function(e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    e.preventDefault();
    nav(a.href);
  });

  // 2. Intercept programmatic navigation (location.href=, location.assign, etc.)
  //    Navigation API (Chrome/Edge 102+) catches location.href setter
  if (window.navigation) {
    window.navigation.addEventListener('navigate', function(e) {
      if (e.hashChange || !e.destination.url || e.destination.url.startsWith('blob:')) return;
      e.preventDefault();
      nav(e.destination.url);
    });
  }

  // 3. Override location.assign / location.replace (all browsers)
  location.assign = function(url) { nav(new URL(url, location.href).href); };
  location.replace = function(url) { nav(new URL(url, location.href).href); };

  // 4. Intercept window.open
  var _open = window.open;
  window.open = function(url) {
    if (url) { nav(new URL(url, location.href).href); }
    return null;
  };
})();
<\/script>`;

// Script injected into blob iframe to capture console output and runtime errors
// Sends entries to the parent panel via postMessage (the panel relays to SDK via bridge)
const CONSOLE_CAPTURE_SCRIPT = `<script>
(function() {
  var MAX_ENTRIES = 200;
  var count = 0;

  function serialize(args) {
    return Array.prototype.slice.call(args).map(function(a) {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); }
        catch(e) { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  function send(type, content, stack) {
    if (count >= MAX_ENTRIES) return;
    count++;
    var entry = { type: type, content: content, timestamp: Date.now() };
    if (stack) entry.stack = stack;
    window.parent.postMessage({ type: 'artifactuse:console', entry: entry }, '*');
  }

  var _log = console.log, _warn = console.warn, _error = console.error, _info = console.info;
  console.log = function() { send('log', serialize(arguments)); _log.apply(console, arguments); };
  console.warn = function() { send('warn', serialize(arguments)); _warn.apply(console, arguments); };
  console.error = function() { send('error', serialize(arguments)); _error.apply(console, arguments); };
  console.info = function() { send('info', serialize(arguments)); _info.apply(console, arguments); };

  window.onerror = function(msg, src, line, col, err) {
    var stack = err && err.stack ? err.stack : (src + ':' + line + ':' + col);
    send('error', String(msg), stack);
  };

  window.addEventListener('unhandledrejection', function(e) {
    var r = e.reason;
    var content = r instanceof Error ? r.message : String(r);
    var stack = r instanceof Error ? r.stack : undefined;
    send('error', 'Unhandled Promise Rejection: ' + content, stack);
  });
})();
<\/script>`;

// Inject the console capture script into <head> for early capture
function injectConsoleScript(html) {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, '$&' + CONSOLE_CAPTURE_SCRIPT);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, '$&<head>' + CONSOLE_CAPTURE_SCRIPT + '</head>');
  }
  return CONSOLE_CAPTURE_SCRIPT + html;
}

// Inject the link-interception script into HTML content
function injectLinkScript(html) {
  // Try to inject before </body> or </html>, otherwise append
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, LINK_INTERCEPT_SCRIPT + '</body>');
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, LINK_INTERCEPT_SCRIPT + '</html>');
  }
  return html + LINK_INTERCEPT_SCRIPT;
}

// Panel colours, mirroring the `--color-*` values in @artifactuse/shared's
// styles.css — the neutral gray that form-panel, code-panel and the SDK's own
// panel chrome all render. Deliberately NOT DEFAULT_COLORS from shared/theme.js,
// which is a divergent blue-gray palette (17,24,39) no other panel uses.
// Must define EVERY key DEFAULT_COLORS does — applyTheme merges as
// { ...DEFAULT_COLORS[theme], ...customColors }, so any key omitted here falls
// back to the blue-gray palette and lands inline on <html>, overriding the
// :root fallbacks below.
const PANEL_COLORS = {
  dark: {
    primary: '99, 102, 241',
    primaryHover: '79, 70, 229',
    background: '40, 40, 40',
    surface: '40, 40, 40',
    surfaceHover: '55, 65, 81',
    text: '243, 244, 246',
    textSecondary: '156, 163, 175',
    textMuted: '107, 114, 128',
    border: '52, 56, 60',
    borderLight: '55, 65, 81',
    success: '34, 197, 94',
    warning: '234, 179, 8',
    error: '239, 68, 68',
    info: '59, 130, 246',
  },
  light: {
    primary: '79, 70, 229',
    primaryHover: '67, 56, 202',
    background: '255, 255, 255',
    surface: '249, 250, 251',
    surfaceHover: '243, 244, 246',
    text: '40, 40, 40',
    textSecondary: '52, 56, 60',
    textMuted: '156, 163, 175',
    border: '229, 231, 235',
    borderLight: '243, 244, 246',
    success: '22, 163, 74',
    warning: '202, 138, 4',
    error: '220, 38, 38',
    info: '37, 99, 235',
  },
};

// The markdown renders inside a sandboxed blob iframe, which cannot see this
// component's stylesheet. Everything the prose needs must be baked into the
// generated document, so colours are resolved to literals here rather than
// referencing CSS variables.
function buildProsePalette(themeName) {
  const c = PANEL_COLORS[themeName] || PANEL_COLORS.dark;
  const rgb = (triplet) => `rgb(${triplet})`;

  return {
    background: rgb(c.background),
    text: rgb(c.text),
    heading: rgb(c.text),
    muted: rgb(c.textMuted),
    link: rgb(c.primary),
    border: rgb(c.border),
    // In the gray palette surface === background, so a raised tint has to be
    // derived rather than taken from a token, or code/table headers vanish.
    surface: `rgba(${c.text}, 0.06)`,
    // Code blocks stay dark in both themes, as most docs sites do
    codeBackground: '#1e1e1e',
    codeText: '#d4d4d4',
  };
}

// Typography for the generated markdown document. These rules used to live in
// this component's <style> block prefixed with `.markdown-mode`, where they
// never applied — the content is in an iframe.
function buildMarkdownStyles(themeName) {
  const p = buildProsePalette(themeName);

  return `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
      color: ${p.text};
      background: ${p.background};
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 0.2em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.3;
      color: ${p.heading};
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em;}
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    h5 { font-size: 0.875em; }
    h6 { font-size: 0.85em; color: ${p.muted}; }

    p { margin: 1em 0; }

    a { color: ${p.link}; text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      background: ${p.surface};
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 0.9em;
    }

    pre {
      background: ${p.codeBackground};
      color: ${p.codeText};
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1em 0;
    }
    pre code { background: none; padding: 0; color: inherit; font-size: 0.875em; }

    ul, ol { padding-left: 2em; margin: 1em 0; }
    li { margin: 0.25em 0; }

    blockquote {
      border-left: 4px solid ${p.border};
      margin: 1em 0;
      padding: 0.5em 1em;
      color: ${p.muted};
      background: ${p.surface};
    }

    hr { border: none; border-top: 1px solid ${p.border}; margin: 2em 0; }

    img { max-width: 100%; height: auto; border-radius: 4px; }

    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid ${p.border}; padding: 8px 12px; text-align: left; }
    th { background: ${p.surface}; font-weight: 600; }
  `;
}

// Process content and create blob URL
function updateIframeSrc(content) {
  iframeKey.value++;

  if (!content) {
    iframeSrc.value = '';
    return;
  }

  // Revoke previous blob URL to prevent memory leak
  if (iframeSrc.value && iframeSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(iframeSrc.value);
  }

  try {
    error.value = null;

    let html = content;

    // If markdown, convert to HTML with wrapper
    if (isMarkdown.value) {
      const parsedContent = marked.parse(content);
      html = `<!DOCTYPE html>
<html data-artifactuse-theme="${theme.value}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="${theme.value}">
  <style>${buildMarkdownStyles(theme.value)}</style>
${CONSOLE_CAPTURE_SCRIPT}
</head>
<body>${parsedContent}${LINK_INTERCEPT_SCRIPT}</body>
</html>`;
    } else {
      // Raw HTML — inject scripts
      html = injectConsoleScript(html);
      html = injectLinkScript(html);
    }

    // Create blob URL
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    iframeSrc.value = URL.createObjectURL(blob);

  } catch (e) {
    console.error('Failed to create iframe content:', e);
    error.value = e.message;
    iframeSrc.value = '';
  }
}


// Bridge for parent communication
let bridge = null;

// ?accent= from the panel URL, re-applied on every theme change
let accentOverride = null;

// OS theme listener, only registered when the host hasn't pinned a theme
let systemThemeQuery = null;
let handleSystemTheme = null;

// Single path for adopting a theme, so the chrome and the markdown blob always
// agree. PANEL_COLORS is spread last so it wins over whatever palette the
// caller (or the SDK's pushed colors) would otherwise supply.
function applyPanelTheme(name) {
  const next = name === 'light' ? 'light' : 'dark';
  theme.value = next;
  applyTheme(next, {
    ...PANEL_COLORS[next],
    ...(accentOverride ? { primary: accentOverride } : {}),
  });
}

// Content arrived — stop waiting, and cancel the pending timeout so a late
// firing can't flip the panel into the "no content" state
function markArtifactReceived() {
  hasArtifact.value = true;
  waitedTooLong.value = false;
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

onMounted(() => {
  // Get URL params first
  const params = new URLSearchParams(window.location.search);
  const urlType = params.get('type');
  if (urlType === 'md' || urlType === 'markdown') {
    language.value = 'markdown';
  }

  // Theme: ?theme= → prefers-color-scheme → 'dark'. The SDK always sends
  // ?theme= and ?accent= on the panel URL.
  const accent = parseColor(params.get('accent'));
  accentOverride = accent ? accent.replace(/ /g, ', ') : null;
  applyPanelTheme(detectTheme());

  // Initialize bridge
  bridge = createBridge({ debug: import.meta.env?.DEV });

  setupArtifactListeners({
    type: 'html',
    acceptedLanguages: ['html', 'htm', 'markdown', 'md'],  // Also accepts markdown
    bridge,
    onArtifact: (artifact, lang, displayName) => {
      // Raw code - no parsing needed
      code.value = artifact.code || '';
      language.value = lang === 'md' ? 'markdown' : lang;
      markArtifactReceived();
      return true;
    },
  });

  // Something should arrive shortly after signalReady(); if it doesn't, stop
  // spinning and say so
  waitTimer = setTimeout(() => {
    waitTimer = null;
    if (!hasArtifact.value) waitedTooLong.value = true;
  }, ARTIFACT_WAIT_MS);

  // The SDK pushes this on setTheme(). It's the only live channel: its CSS
  // variables don't cross the iframe boundary, and the URL's ?theme= is fixed
  // at mount, so without this the panel keeps its original theme until reload.
  bridge.on('theme:change', (data) => {
    if (data?.theme) applyPanelTheme(data.theme);
  });

  // Follow OS changes only when the host hasn't pinned a theme via ?theme=,
  // otherwise an OS flip would silently override the SDK.
  if (!params.get('theme')) {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    handleSystemTheme = (e) => applyPanelTheme(e.matches ? 'dark' : 'light');
    systemThemeQuery.addEventListener('change', handleSystemTheme);
  }

  bridge.signalReady();
  
  // Dev mode: load mock data if no data provided
  // if (!code.value && (import.meta.env?.DEV || window.location.hostname === 'localhost')) {
  //   import('@artifactuse/shared').then((mod) => {
  //     if (mod.getMockData) {
  //       const type = params.get('type') || 'html';
  //       const mockContent = mod.getMockData(type === 'md' || type === 'markdown' ? 'markdown' : 'html');
  //       if (mockContent) {
  //         code.value = mockContent;
  //         language.value = type === 'md' || type === 'markdown' ? 'markdown' : 'html';
  //         console.log(`[HTML Preview] Loaded ${language.value} mock data for development`);
  //       }
  //     }
  //   }).catch(() => {});
  // }
  
  // Handle link clicks (for any links in the panel itself)
  document.addEventListener('click', handleLinkClick);

  // Handle navigation requests from the blob iframe
  window.addEventListener('message', handleNavigateMessage);

  // Handle console messages from the blob iframe
  window.addEventListener('message', handleConsoleMessage);
});

onUnmounted(() => {
   if (iframeSrc.value && iframeSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(iframeSrc.value);
  }
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  if (systemThemeQuery && handleSystemTheme) {
    systemThemeQuery.removeEventListener('change', handleSystemTheme);
    systemThemeQuery = null;
    handleSystemTheme = null;
  }
  document.removeEventListener('click', handleLinkClick);
  window.removeEventListener('message', handleNavigateMessage);
  window.removeEventListener('message', handleConsoleMessage);
  bridge?.destroy();
});

watch(() => props.code, (v) => { code.value = v; markArtifactReceived(); });
watch(() => props.language, (v) => { language.value = v; });


// Watch for code changes
watch(code, (newCode) => {
  updateIframeSrc(newCode);
}, { immediate: true });

// Also watch language changes (in case switching between html/markdown)
watch(isMarkdown, () => {
  updateIframeSrc(code.value);
});

// The markdown palette is baked into the blob at generation time, so a theme
// change means rebuilding the document
watch(theme, () => {
  updateIframeSrc(code.value);
});

</script>

<style>
/* Fallbacks so the panel is styled before applyTheme() runs on mount.
   applyTheme writes these same variables inline on <html>, which wins.
   Values mirror PANEL_COLORS.dark / shared's --color-* gray palette. */
:root {
  --artifactuse-primary: 99, 102, 241;
  --artifactuse-background: 40, 40, 40;
  --artifactuse-surface: 40, 40, 40;
  --artifactuse-text: 243, 244, 246;
  --artifactuse-text-muted: 107, 114, 128;
  --artifactuse-border: 52, 56, 60;
  --artifactuse-error: 239, 68, 68;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

@keyframes artifactuse-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Loading spinner */
.loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--artifactuse-surface), 0.85);
  z-index: 5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(var(--artifactuse-text), 0.1);
  border-top-color: rgb(var(--artifactuse-primary));
  border-radius: 50%;
  animation: artifactuse-spin 0.8s linear infinite;
}

/* Artifact received, but it carried no content */
.empty {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--artifactuse-background));
  color: rgb(var(--artifactuse-text-muted));
  font-size: 14px;
  z-index: 5;
}

/* .loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #666;
} */

.preview-container {
  width: 100%;
  min-height: 100vh;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: rgb(var(--artifactuse-text));
  background: rgb(var(--artifactuse-background));
}

.preview-container.markdown-mode {
  max-width: 800px;
  margin: 0 auto;
  /* padding: 24px; */
  padding: 0px;
}

.preview-container.markdown-mode iframe {
  width: 100%;
  border: none;
  height: 100vh;
}

.preview-container.iframe-mode {
  padding: 0;
  min-height: 100vh;
}
 
.iframe-mode iframe {
  width: 100%;
  height: 100vh;
  border: none;
  display: block;
}

/* Error display */
.error {
  padding: 20px;
  background: rgba(var(--artifactuse-error), 0.1);
  color: rgb(var(--artifactuse-error));
  border-radius: 8px;
}

.error-title {
  font-weight: bold;
  margin-bottom: 8px;
}

.error pre {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
}
</style>
