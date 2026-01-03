// Vue Preview Panel
// Renders Vue SFC code directly in the panel (no iframe needed)

import { createBridge } from '@artifactuse/shared/bridge';

const appElement = document.getElementById('app');
let currentCode = '';
let currentApp = null;
let bridge = null;

/**
 * Parse and render Vue SFC code
 */
function renderVue(code) {
  if (!code || !code.trim()) {
    appElement.innerHTML = '<div class="loading">No code to preview</div>';
    return;
  }

  try {
    // Unmount previous app if exists
    if (currentApp) {
      currentApp.unmount();
      currentApp = null;
    }
    
    // Clear previous content
    appElement.innerHTML = '';
    
    // Check if Vue is loaded
    if (typeof Vue === 'undefined') {
      throw new Error('Vue is not loaded. Please check your internet connection.');
    }
    
    // Parse the SFC
    const { template, script, style } = parseSFC(code);
    
    // Inject styles if present
    injectStyles(style);
    
    // Create component options
    const componentOptions = parseScript(script);
    
    // Add template
    if (template) {
      componentOptions.template = template;
    }
    
    // Create and mount Vue app
    const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } = Vue;
    
    currentApp = createApp(componentOptions);
    currentApp.mount(appElement);
    
  } catch (error) {
    console.error('Vue preview error:', error);
    appElement.innerHTML = `
      <div class="error">
        <div class="error-title">Preview Error</div>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Parse Vue SFC into template, script, and style sections
 */
function parseSFC(code) {
  const trimmed = code.trim();
  
  // Extract template
  const templateMatch = trimmed.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const template = templateMatch ? templateMatch[1].trim() : null;
  
  // Extract script
  const scriptMatch = trimmed.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const script = scriptMatch ? scriptMatch[1].trim() : '';
  
  // Extract style
  const styleMatch = trimmed.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const style = styleMatch ? styleMatch[1].trim() : '';
  
  // If no template tag, treat the whole thing as a template (simple case)
  if (!templateMatch && !scriptMatch) {
    return {
      template: trimmed,
      script: '',
      style: ''
    };
  }
  
  return { template, script, style };
}

/**
 * Parse script section into component options
 */
function parseScript(script) {
  if (!script) {
    return {};
  }
  
  // Check for script setup (not fully supported in runtime)
  if (/<script\s+setup/.test(script)) {
    console.warn('Script setup is not fully supported in runtime compilation');
  }
  
  // Extract export default object
  const exportMatch = script.match(/export\s+default\s+({[\s\S]*})\s*;?\s*$/);
  
  if (exportMatch) {
    try {
      // Create a function to evaluate the object with Vue composition API available
      const { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRef, toRefs } = Vue;
      
      const evalFn = new Function(
        'ref', 'reactive', 'computed', 'watch', 'onMounted', 'onUnmounted', 'nextTick', 'toRef', 'toRefs',
        `return ${exportMatch[1]}`
      );
      
      return evalFn(ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRef, toRefs);
    } catch (e) {
      console.error('Failed to parse script:', e);
      throw new Error(`Script parsing error: ${e.message}`);
    }
  }
  
  // Try to find defineComponent usage
  const defineMatch = script.match(/defineComponent\s*\(\s*({[\s\S]*})\s*\)/);
  if (defineMatch) {
    try {
      const { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRef, toRefs } = Vue;
      
      const evalFn = new Function(
        'ref', 'reactive', 'computed', 'watch', 'onMounted', 'onUnmounted', 'nextTick', 'toRef', 'toRefs',
        `return ${defineMatch[1]}`
      );
      
      return evalFn(ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRef, toRefs);
    } catch (e) {
      throw new Error(`defineComponent parsing error: ${e.message}`);
    }
  }
  
  // If script starts with {, treat it as an options object
  if (script.trim().startsWith('{')) {
    try {
      const { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRef, toRefs } = Vue;
      
      const evalFn = new Function(
        'ref', 'reactive', 'computed', 'watch', 'onMounted', 'onUnmounted', 'nextTick', 'toRef', 'toRefs',
        `return ${script}`
      );
      
      return evalFn(ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRef, toRefs);
    } catch (e) {
      throw new Error(`Script evaluation error: ${e.message}`);
    }
  }
  
  return {};
}

/**
 * Inject styles into document
 */
let styleElement = null;

function injectStyles(css) {
  // Remove previous styles
  if (styleElement) {
    styleElement.remove();
  }
  
  if (!css) return;
  
  styleElement = document.createElement('style');
  styleElement.setAttribute('data-vue-preview', 'true');
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Handle link clicks - open in new tab
 */
function handleLinkClick(e) {
  const link = e.target.closest('a');
  if (link && link.href && !link.href.startsWith('javascript:')) {
    e.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Initialize the preview panel
 */
function init() {
  // Set up bridge communication
  bridge = createBridge({
    onMessage: (msg) => {
      if (msg.type === 'setCode' || msg.action === 'setContent') {
        currentCode = msg.data?.code || msg.data?.content || '';
        renderVue(currentCode);
      }
    }
  });
  
  // Signal ready
  bridge.send({ type: 'ready' });
  
  // Dev mode: load mock data if no data provided
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev && !currentCode) {
    import('@artifactuse/shared').then((mod) => {
      if (mod.getMockData) {
        const mockVue = mod.getMockData('vue');
        if (mockVue) {
          currentCode = mockVue;
          renderVue(currentCode);
          console.log('[Vue Preview] Loaded mock data for development');
        }
      }
    }).catch(() => {});
  }
  
  // Handle link clicks
  document.addEventListener('click', handleLinkClick);
  
  console.log('[Vue Preview] Initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
