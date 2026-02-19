// Canvas Editor entry point
// Vue 3 Composition API with composables (Phase K complete)
import { createApp, h, ref, onMounted } from 'vue';
import { createBridgeReceiver, applyTheme, detectTheme, setupArtifactListeners, initMCPBridge } from '@artifactuse/shared';

// External libraries
import rough from 'roughjs';
import paper from 'paper';

// Expose libraries globally
window.rough = rough;
window.paper = paper;

// CSS stylesheet
import './styles/index.css';

// Vue components
import AppOverlay from './App.vue';
import CanvasWrapper from './components/canvas/CanvasWrapper.vue';

// Vue 3 composables (full implementations)
import { mergeConfig } from './config/defaults.js';
import { initEditorState, exposeGlobalFunctions, setupCanvas } from './composables/useEditorState.js';
import { getHistory } from './composables/useHistory.js';
import { getRenderer } from './composables/useRenderer.js';
import { getTools } from './composables/useTools.js';
import { getClipboard } from './composables/useClipboard.js';
import { getExport } from './composables/useExport.js';
import { getSnapGuides } from './composables/useSnapGuides.js';
import { getInteractions } from './composables/useInteractions.js';
import { getKeyboard } from './composables/useKeyboard.js';
import { getCropMode } from './composables/useCropMode.js';
import { getPresentationMode } from './composables/usePresentationMode.js';
import { getEditorState } from './composables/useEditorState.js';
import { createLegacyBridge } from './bridge/legacyBridge.js';

// Utility bridge (replaces legacy utils.js)
import { initUtilsBridge } from './bridge/utilsBridge.js';

// Canvas mode config
const CANVAS_MODE = {
  video: {
    enabled: false,
  },
};

// Initialize theme
const theme = detectTheme();
applyTheme(theme);

// Initialize bridge
const bridge = createBridgeReceiver({ debug: true });

setupArtifactListeners({
  editorType: 'canvas',
  bridge,
  getExport: () => getExport(),
  getEditorState: () => getEditorState(),
});


// App component that injects the editor
const App = {
  setup() {
    const containerRef = ref(null);
    const initialData = ref(null);

    onMounted(() => {
      // Get initial data from URL params or default
      const params = new URLSearchParams(window.location.search);
      const dataParam = params.get('data');
      if (dataParam) {
        try {
          initialData.value = JSON.parse(decodeURIComponent(dataParam));
        } catch (e) {
          console.warn('Failed to parse data param:', e);
        }
      }

      // Build and inject the editor
      injectEditor(containerRef.value, initialData.value);
    });

    return () => h('div', {
      ref: containerRef,
      id: 'editor-container',
      style: { width: '100%', height: '100%' }
    });
  },
};

function injectEditor(container, data = null) {
  // Parse data if string
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }

  // Use new config module (Phase 1 migration)
  const config = mergeConfig({ ...data?.config, ...CANVAS_MODE });

  // Prepare initial data for state
  const initialData = {
    backgroundColor: data?.backgroundColor || config.canvas.backgroundColor,
    shapes: data?.shapes || [],
    darkMode: data?.darkMode ?? config.theme.darkMode,
    videoMode: false,
  };

  // Initialize Vue reactive state (Phase 1 migration)
  const editorState = initEditorState(config, initialData);

  // Create legacy bridge to expose state globally for legacy code
  createLegacyBridge(editorState, config);

  // Initialize composables (Phases 2-8)
  // These set up global functions that the legacy code can call
  getHistory();
  getRenderer();
  getTools();
  getClipboard();
  getExport();
  getSnapGuides();
  getInteractions();
  getKeyboard();
  getCropMode();

  // Initialize presentation mode (canvas recording)
  const presentationMode = getPresentationMode();

  // Add keyboard shortcut for presentation mode (Shift+P)
  document.addEventListener('keydown', (e) => {
    // Cmd + Shift+P to enter presentation mode (only when not already recording or in presentation mode)
    if ( (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p' && !editorState.state.isPresentationMode) {
      e.preventDefault();
      presentationMode.enterPresentationMode();
    }
    // Escape to exit presentation mode (but not while recording is active)
    if (e.key === 'Escape' && editorState.state.isPresentationMode && !editorState.state.showPresentationExport && !editorState.state.isRecording) {
      e.preventDefault();
      presentationMode.exitPresentationMode();
    }
  });

  // Expose global functions for Vue components and legacy compatibility
  exposeGlobalFunctions();

  // Mount CanvasWrapper Vue component
  // This renders the canvas element and calls setupCanvas() on mount
  const canvasApp = createApp(CanvasWrapper);
  canvasApp.mount(container);

  // Wait for canvas to be ready before continuing initialization
  // setupCanvas() is called by CanvasWrapper.vue on mount
  requestAnimationFrame(() => {
    // Ensure canvas refs are set up (CanvasWrapper calls setupCanvas on mount)
    if (!window.canvas) {
      setupCanvas();
    }

    // Initialize utility bridge (ES6 utils exposed to window)
    initUtilsBridge();

    // Mount Vue App overlay after canvas is ready
    // This creates a separate Vue app for Vue components that overlay the canvas
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'vue-overlay-root';
    document.body.appendChild(overlayContainer);
    const overlayApp = createApp(AppOverlay);
    overlayApp.mount(overlayContainer);

    initMCPBridge({ 
      editorType: 'canvas',
      onConnect: () => console.log('[Canvas] MCP connected'),
    });


  });
}

// Create Vue app
const app = createApp(App);
app.mount('#app');

// Handle theme changes
bridge.on('theme:change', ({ theme: newTheme, colors }) => {
  applyTheme(newTheme, colors);
});

// Signal ready
window.parent?.postMessage({ type: 'ready', source: 'canvas-editor' }, '*');
