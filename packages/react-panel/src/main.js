// React Preview Panel
// Renders JSX code directly in the panel (no iframe needed)

import { createBridge } from '@artifactuse/shared/bridge';

const rootElement = document.getElementById('root');
let currentCode = '';
let bridge = null;

/**
 * Transform and render JSX code
 */
function renderJsx(jsx) {
  if (!jsx || !jsx.trim()) {
    rootElement.innerHTML = '<div class="loading">No code to preview</div>';
    return;
  }

  try {
    // Clear previous content
    rootElement.innerHTML = '';
    
    // Check if Babel is loaded
    if (typeof Babel === 'undefined') {
      throw new Error('Babel is not loaded. Please check your internet connection.');
    }
    
    // Wrap the JSX code appropriately
    const wrappedCode = wrapReactCode(jsx);
    
    // Transform JSX to JavaScript using Babel
    const transformed = Babel.transform(wrappedCode, {
      presets: ['react'],
      filename: 'component.jsx'
    }).code;
    
    // Create a function that has access to React globals
    const executeCode = new Function(
      'React',
      'ReactDOM',
      'useState',
      'useEffect',
      'useRef',
      'useMemo',
      'useCallback',
      'useContext',
      'useReducer',
      'createContext',
      'Fragment',
      'rootElement',
      transformed
    );
    
    // Execute with React globals
    executeCode(
      React,
      ReactDOM,
      React.useState,
      React.useEffect,
      React.useRef,
      React.useMemo,
      React.useCallback,
      React.useContext,
      React.useReducer,
      React.createContext,
      React.Fragment,
      rootElement
    );
    
  } catch (error) {
    console.error('React preview error:', error);
    rootElement.innerHTML = `
      <div class="error">
        <div class="error-title">Preview Error</div>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Wrap React code to make it executable
 */
function wrapReactCode(jsx) {
  const trimmed = jsx.trim();
  
  // Check if it's a complete component with export
  const hasDefaultExport = /export\s+default/.test(trimmed);
  const hasNamedExport = /export\s+(function|const|class|let|var)\s+/.test(trimmed);
  const hasFunctionDeclaration = /^(function|const|let|var)\s+\w+/.test(trimmed);
  const hasClassDeclaration = /^class\s+\w+/.test(trimmed);
  
  if (hasDefaultExport || hasNamedExport) {
    // Remove exports and find component name
    let code = trimmed
      .replace(/export\s+default\s+/g, '')
      .replace(/export\s+/g, '');
    
    // Find the component name
    const funcMatch = code.match(/(?:function|const|let|var)\s+(\w+)/);
    const classMatch = code.match(/class\s+(\w+)/);
    const componentName = funcMatch?.[1] || classMatch?.[1] || 'App';
    
    return `
      ${code}
      const root = ReactDOM.createRoot(rootElement);
      root.render(React.createElement(${componentName}));
    `;
  }
  
  if (hasFunctionDeclaration || hasClassDeclaration) {
    // It's a component declaration without export
    const funcMatch = trimmed.match(/(?:function|const|let|var)\s+(\w+)/);
    const classMatch = trimmed.match(/class\s+(\w+)/);
    const componentName = funcMatch?.[1] || classMatch?.[1] || 'App';
    
    return `
      ${trimmed}
      const root = ReactDOM.createRoot(rootElement);
      root.render(React.createElement(${componentName}));
    `;
  }
  
  // It's just JSX - wrap in a component
  return `
    function App() {
      return (${trimmed});
    }
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
  `;
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
        renderJsx(currentCode);
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
        const mockReact = mod.getMockData('react');
        if (mockReact) {
          currentCode = mockReact;
          renderJsx(currentCode);
          console.log('[React Preview] Loaded mock data for development');
        }
      }
    }).catch(() => {});
  }
  
  // Handle link clicks
  document.addEventListener('click', handleLinkClick);
  
  console.log('[React Preview] Initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
