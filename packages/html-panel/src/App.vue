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

    <!-- Loading spinner -->
    <div v-else class="loading">
      <div class="spinner"></div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { marked } from 'marked';
import { createBridge, setupArtifactListeners } from '@artifactuse/shared';

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

const isMarkdown = computed(() => {
  const lang = language.value.toLowerCase();
  return lang === 'markdown' || lang === 'md';
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
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
      color: #333;
    }
    /* Add your markdown styles here */
  </style>
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

onMounted(() => {
  // Get URL params first
  const params = new URLSearchParams(window.location.search);
  const urlType = params.get('type');
  if (urlType === 'md' || urlType === 'markdown') {
    language.value = 'markdown';
  }
  
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
      return true;
    },
  });
  
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
  document.removeEventListener('click', handleLinkClick);
  window.removeEventListener('message', handleNavigateMessage);
  window.removeEventListener('message', handleConsoleMessage);
  bridge?.destroy();
});

watch(() => props.code, (v) => { code.value = v; });
watch(() => props.language, (v) => { language.value = v; });


// Watch for code changes
watch(code, (newCode) => {
  updateIframeSrc(newCode);
}, { immediate: true });

// Also watch language changes (in case switching between html/markdown)
watch(isMarkdown, () => {
  updateIframeSrc(code.value);
});

</script>

<style>
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
  background: rgba(249, 250, 251, 0.85);
  z-index: 5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(17, 24, 39, 0.1);
  border-top-color: rgb(99, 102, 241);
  border-radius: 50%;
  animation: artifactuse-spin 0.8s linear infinite;
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
  color: #333;
  background: #fff;
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

.content {
  width: 100%;
}

/* Typography */
.markdown-mode h1,
.markdown-mode h2,
.markdown-mode h3,
.markdown-mode h4,
.markdown-mode h5,
.markdown-mode h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.3;
  color: #111;
}

.markdown-mode h1 {
  font-size: 2em;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.3em;
}

.markdown-mode h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.3em;
}

.markdown-mode h3 { font-size: 1.25em; }
.markdown-mode h4 { font-size: 1em; }
.markdown-mode h5 { font-size: 0.875em; }
.markdown-mode h6 { font-size: 0.85em; color: #666; }

.markdown-mode p {
  margin: 1em 0;
}

.markdown-mode a {
  color: #0066cc;
  text-decoration: none;
}

.markdown-mode a:hover {
  text-decoration: underline;
}

.markdown-mode code {
  background: #f4f4f4;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  font-size: 0.9em;
}

.markdown-mode pre {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.markdown-mode pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: 0.875em;
}

.markdown-mode ul,
.markdown-mode ol {
  padding-left: 2em;
  margin: 1em 0;
}

.markdown-mode li {
  margin: 0.25em 0;
}

.markdown-mode blockquote {
  border-left: 4px solid #ddd;
  margin: 1em 0;
  padding: 0.5em 1em;
  color: #666;
  background: #f9f9f9;
}

.markdown-mode hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 2em 0;
}

.markdown-mode img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.markdown-mode table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-mode th,
.markdown-mode td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.markdown-mode th {
  background: #f4f4f4;
  font-weight: 600;
}

/* Error display */
.error {
  padding: 20px;
  background: #fef2f2;
  color: #dc2626;
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
