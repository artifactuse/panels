// editor/bridge/legacyBridge.js
// Bridge layer: exposes Vue reactive state as global objects
//
// Phase K: Migration complete. This bridge now only:
// 1. Exposes state/config globally for window.state access
// 2. Injects remaining legacy scripts (setup.js, extensions.js)
//
// The core functionality (renderer, tools, interactions, clipboard, export, etc.)
// is now fully implemented in Vue composables.

import { watch } from 'vue';

/**
 * Create a bridge that exposes Vue reactive state to global scope
 * This allows legacy setup scripts and any external code to access state
 */
export function createLegacyBridge(editorState, config) {
  const { state } = editorState;

  // Expose state globally - Vue's reactive proxy handles get/set
  window.state = state;

  // Expose config globally
  window.CONFIG = config;

  // Watch for dark mode changes and update DOM
  watch(
    () => state.darkMode,
    (dark) => {
      document.body.classList.toggle('dark', dark);
    },
    { immediate: true }
  );

  // Cleanup function
  function cleanup() {
    delete window.state;
    delete window.CONFIG;
  }

  return { state, config, cleanup };
}

/**
 * Inject legacy scripts into the DOM
 * Used for setup.js and extensions.js which provide init() and UI helpers
 */
export function injectLegacyScripts(scripts) {
  if (!scripts || !scripts.trim()) return null;
  const scriptEl = document.createElement('script');
  scriptEl.textContent = scripts;
  document.body.appendChild(scriptEl);
  return scriptEl;
}

/**
 * @deprecated Use CSS import instead: import './styles/index.css'
 */
export function injectLegacyStyles(stylesHtml) {
  console.warn('injectLegacyStyles is deprecated. Use CSS import.');
  return null;
}

export default {
  createLegacyBridge,
  injectLegacyScripts,
};
