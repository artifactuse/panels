// Video Editor entry point
// Vue 3 Composition API with composables (Phase K complete)
import { createApp, h, ref, onMounted } from 'vue';
import { createBridgeReceiver, applyTheme, detectTheme, setupArtifactListeners, initMCPBridge } from '@artifactuse/shared';

// External libraries
import rough from 'roughjs';
import paper from 'paper';
import { Timeline, DataSet } from 'vis-timeline/standalone';
import Peaks from 'peaks.js';

// vis-timeline CSS
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';

// Expose libraries globally
window.rough = rough;
window.paper = paper;
window.vis = { Timeline, DataSet };
window.Peaks = Peaks;

// CSS stylesheet
import './styles/index.css';

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
import { getVideoState } from './composables/useVideoState.js';
import { getPlayback } from './composables/usePlayback.js';
import { getTimeline } from './composables/useTimeline.js';
import { getClipManagement } from './composables/useClipManagement.js';
import { getMediaRegistry } from './composables/useMediaRegistry.js';
import { getCropMode } from './composables/useCropMode.js';
import { getVideoMode } from './composables/useVideoMode.js';
import { getEditorState } from './composables/useEditorState.js';

import { createLegacyBridge } from './bridge/legacyBridge.js';

// Vue components
import AppOverlay from './App.vue';
import CanvasWrapper from './components/canvas/CanvasWrapper.vue';

// Utility bridge (replaces legacy utils.js)
import { initUtilsBridge } from './bridge/utilsBridge.js';

// Video mode config - defaultPreset is set in config/defaults.js
const VIDEO_MODE = {
  video: {
    enabled: true,
    fps: 30,
    defaultDuration: 60,
    defaultClipDuration: 5,
  },
};

// Initialize theme
const theme = detectTheme();
applyTheme(theme);

// Initialize bridge
const bridge = createBridgeReceiver({ debug: true });

setupArtifactListeners({
  type: 'video',
  bridge,
  getExport: () => getExport(),
  getEditorState: () => getEditorState(),
});

/**
 * Handle import from Presentation Mode
 * Loads canvas recording, webcam, and viewport keyframes from IndexedDB
 */
function handlePresentationImport() {
  // Wait for editor to be fully initialized
  setTimeout(() => {
    loadPresentationFromDB()
      .then(data => {
        if (!data) {
          console.warn('[VideoMode] No presentation import data found in IndexedDB');
          return;
        }

        console.log('[VideoMode] Importing presentation data from IndexedDB');
        console.log('[VideoMode] Data keys:', Object.keys(data));
        console.log('[VideoMode] canvasBlob size:', data.canvasBlob?.size || 'none');
        console.log('[VideoMode] webcamBlob size:', data.webcamBlob?.size || 'none');
        console.log('[VideoMode] duration:', data.duration);

        const { canvasBlob, webcamBlob, duration, viewportKeyframes, cursorShape } = data;

        // Get editor state
        const state = window.state;
        if (!state) {
          console.error('[VideoMode] Editor state not available');
          return;
        }

        // Set project duration from presentation
        if (duration) {
          state.projectDuration = duration;
        }

        // Ensure we have at least 2 video tracks for canvas and webcam
        if (!state.tracks || state.tracks.length < 2) {
          // Get existing tracks or create default structure
          const existingTracks = state.tracks || [];
          const videoTracks = existingTracks.filter(t => t.type === 'video');

          // Add tracks if needed
          while (videoTracks.length < 2) {
            const newTrack = {
              id: 'track-' + (existingTracks.length + 1),
              name: 'Video ' + (videoTracks.length + 1),
              type: 'video',
              locked: false,
              visible: true,
              muted: false
            };
            existingTracks.push(newTrack);
            videoTracks.push(newTrack);
          }
          state.tracks = existingTracks;
        }

        // Get first two video track IDs for canvas and webcam
        const videoTracks = state.tracks.filter(t => t.type === 'video' && !t.isFxTrack);
        const canvasTrackId = videoTracks[0]?.id || 'track-1';
        const webcamTrackId = videoTracks[1]?.id || 'track-2';
        console.log('[VideoMode] Using tracks - canvas:', canvasTrackId, 'webcam:', webcamTrackId);

        // Get Video Mode canvas dimensions for scaling
        const targetWidth = state.canvasWidth || 1920;
        const targetHeight = state.canvasHeight || 1080;
        console.log('[VideoMode] Target canvas size:', targetWidth, 'x', targetHeight);

        // Import canvas recording as a video clip
        if (canvasBlob && canvasBlob.size > 0) {
          const canvasUrl = URL.createObjectURL(canvasBlob);
          const canvasVideo = document.createElement('video');
          canvasVideo.muted = true;
          canvasVideo.playsInline = true;
          canvasVideo.preload = 'auto';

          // Use loadeddata event (fires once when first frame is available)
          let canvasVideoAdded = false;
          canvasVideo.onloadeddata = () => {
            if (canvasVideoAdded) return; // Prevent duplicate additions
            canvasVideoAdded = true;

            // Handle Infinity duration (common with WebM from MediaRecorder)
            let videoDuration = canvasVideo.duration;
            if (!isFinite(videoDuration) || videoDuration <= 0) {
              videoDuration = duration || 60;
              console.log('[VideoMode] Canvas video duration is Infinity, using presentation duration:', videoDuration);
            }

            const videoWidth = canvasVideo.videoWidth || 1920;
            const videoHeight = canvasVideo.videoHeight || 1080;
            console.log('[VideoMode] Canvas video ready:', videoWidth, 'x', videoHeight, 'duration:', videoDuration, 'readyState:', canvasVideo.readyState);

            // Scale video to fit Video Mode canvas (maintain aspect ratio, fit to cover)
            let scaledWidth = targetWidth;
            let scaledHeight = targetHeight;
            let offsetX = 0;
            let offsetY = 0;

            const videoAspect = videoWidth / videoHeight;
            const targetAspect = targetWidth / targetHeight;

            if (videoAspect > targetAspect) {
              // Video is wider - fit to height, center horizontally
              scaledHeight = targetHeight;
              scaledWidth = targetHeight * videoAspect;
              offsetX = (targetWidth - scaledWidth) / 2;
            } else {
              // Video is taller - fit to width, center vertically
              scaledWidth = targetWidth;
              scaledHeight = targetWidth / videoAspect;
              offsetY = (targetHeight - scaledHeight) / 2;
            }

            console.log('[VideoMode] Scaled canvas recording to:', scaledWidth, 'x', scaledHeight, 'offset:', offsetX, offsetY);

            // Add video to hidden container (keeps video element active in DOM)
            const container = document.getElementById('hidden-media-container') || (() => {
              const div = document.createElement('div');
              div.id = 'hidden-media-container';
              div.style.cssText = 'position: absolute; left: -9999px; top: -9999px; visibility: hidden;';
              document.body.appendChild(div);
              return div;
            })();
            container.appendChild(canvasVideo);

            // Add as video shape on first track (scaled to fit canvas)
            const canvasShape = {
              id: 'presentation-canvas-' + Date.now(),
              type: 'video',
              name: 'Canvas Recording',
              x: offsetX,
              y: offsetY,
              width: scaledWidth,
              height: scaledHeight,
              videoElement: canvasVideo,
              src: canvasUrl,
              startTime: 0,
              duration: videoDuration,
              volume: 100,
              opacity: 100,
              trackId: canvasTrackId,  // Assign to first video track
            };

            state.shapes.push(canvasShape);
            console.log('[VideoMode] Added canvas recording as video shape (scaled)');

            // Re-render
            if (window.render) window.render();

            // Update timeline items to sync shapes
            if (typeof window.updateTimelineItems === 'function') {
              window.updateTimelineItems();
              console.log('[VideoMode] Timeline updated with canvas recording');
            }
          };

          canvasVideo.onerror = (e) => {
            console.error('[VideoMode] Failed to load canvas video:', e);
          };

          // Set src last to trigger load
          canvasVideo.src = canvasUrl;
        }

        // Import webcam recording as a separate video clip (PiP overlay)
        if (webcamBlob && webcamBlob.size > 0) {
          const webcamUrl = URL.createObjectURL(webcamBlob);
          const webcamVideo = document.createElement('video');
          webcamVideo.muted = true;
          webcamVideo.playsInline = true;
          webcamVideo.preload = 'auto';

          // Use loadeddata event (fires once when first frame is available)
          let webcamVideoAdded = false;
          webcamVideo.onloadeddata = () => {
            if (webcamVideoAdded) return; // Prevent duplicate additions
            webcamVideoAdded = true;

            // Handle Infinity duration
            let videoDuration = webcamVideo.duration;
            if (!isFinite(videoDuration) || videoDuration <= 0) {
              videoDuration = duration || 60;
              console.log('[VideoMode] Webcam video duration is Infinity, using presentation duration:', videoDuration);
            }

            console.log('[VideoMode] Webcam video ready:', webcamVideo.videoWidth, 'x', webcamVideo.videoHeight, 'duration:', videoDuration, 'readyState:', webcamVideo.readyState);

            // Add video to hidden container (keeps video element active in DOM)
            const container = document.getElementById('hidden-media-container') || (() => {
              const div = document.createElement('div');
              div.id = 'hidden-media-container';
              div.style.cssText = 'position: absolute; left: -9999px; top: -9999px; visibility: hidden;';
              document.body.appendChild(div);
              return div;
            })();
            container.appendChild(webcamVideo);

            // Add as video shape on second track (positioned in corner like PiP)
            const webcamShape = {
              id: 'presentation-webcam-' + Date.now(),
              type: 'video',
              name: 'Webcam Recording',
              x: (state.canvasWidth || 1920) - 340,
              y: (state.canvasHeight || 1080) - 260,
              width: 320,
              height: 240,
              videoElement: webcamVideo,
              src: webcamUrl,
              startTime: 0,
              duration: videoDuration,
              volume: 0, // Mute webcam (audio is in canvas recording)
              opacity: 100,
              cornerRadius: 16,
              trackId: webcamTrackId,  // Assign to second video track
            };

            state.shapes.push(webcamShape);
            console.log('[VideoMode] Added webcam recording as video shape');

            // Ensure webcam is on top of canvas recording (move to end of shapes array)
            // Find the webcam shape we just added and move it to the end
            const webcamIndex = state.shapes.findIndex(s => s.id === webcamShape.id);
            const canvasIndex = state.shapes.findIndex(s => s.name === 'Canvas Recording');
            if (webcamIndex !== -1 && canvasIndex !== -1 && webcamIndex < canvasIndex) {
              // Webcam was added before canvas, move it to end
              const [removed] = state.shapes.splice(webcamIndex, 1);
              state.shapes.push(removed);
              console.log('[VideoMode] Moved webcam shape to top (z-order)');
            }

            // Re-render
            if (window.render) window.render();

            // Update timeline items to sync shapes
            if (typeof window.updateTimelineItems === 'function') {
              window.updateTimelineItems();
              console.log('[VideoMode] Timeline updated with webcam recording');
            }
          };

          webcamVideo.onerror = (e) => {
            console.error('[VideoMode] Failed to load webcam video:', e);
          };

          // Set src last to trigger load
          webcamVideo.src = webcamUrl;
        }

        // Import viewport keyframes
        if (viewportKeyframes && viewportKeyframes.length > 0) {
          viewportKeyframes.forEach(kf => {
            state.shapes.push({
              ...kf,
              id: kf.id || ('viewport-kf-' + Date.now() + '-' + Math.random()),
              type: 'viewportKeyframe',
            });
          });
          console.log('[VideoMode] Added', viewportKeyframes.length, 'viewport keyframes');
        }

        // Import cursor shape
        if (cursorShape) {
          state.shapes.push({
            ...cursorShape,
            id: cursorShape.id || ('cursor-' + Date.now()),
            type: 'cursor',
          });
          console.log('[VideoMode] Added cursor shape');
        }

        console.log('[VideoMode] Presentation import complete');

        // Update playhead to extend to all tracks after import
        if (typeof window.updatePlayheadPosition === 'function') {
          // Small delay to ensure timeline has finished rendering
          setTimeout(() => {
            window.updatePlayheadPosition();
            console.log('[VideoMode] Playhead position updated');
          }, 100);
        }

        // Clean up IndexedDB after import
        clearPresentationFromDB();
      })
      .catch(err => {
        console.error('[VideoMode] Failed to import presentation:', err);
      });
  }, 500); // Wait for editor initialization
}

/**
 * Load presentation data from IndexedDB
 */
function loadPresentationFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PresentationDB', 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Check if object store exists
      if (!db.objectStoreNames.contains('recordings')) {
        db.close();
        resolve(null);
        return;
      }

      const transaction = db.transaction(['recordings'], 'readonly');
      const store = transaction.objectStore('recordings');
      const getRequest = store.get('presentationImport');

      getRequest.onsuccess = () => {
        db.close();
        resolve(getRequest.result || null);
      };

      getRequest.onerror = () => {
        db.close();
        reject(getRequest.error);
      };
    };
  });
}

/**
 * Clear presentation data from IndexedDB after import
 */
function clearPresentationFromDB() {
  const request = indexedDB.open('PresentationDB', 1);

  request.onsuccess = (event) => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains('recordings')) {
      db.close();
      return;
    }

    const transaction = db.transaction(['recordings'], 'readwrite');
    const store = transaction.objectStore('recordings');
    store.delete('presentationImport');

    transaction.oncomplete = () => {
      db.close();
      console.log('[VideoMode] Cleared presentation data from IndexedDB');
    };
  };
}

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

      // Check for presentation mode import
      const importType = params.get('import');
      if (importType === 'presentation') {
        handlePresentationImport();
      }
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

  // Use new config module with video mode (Phase 1 migration)
  const config = mergeConfig({ ...data?.config, ...VIDEO_MODE });

  // Prepare initial data for state
  const initialData = {
    backgroundColor: data?.backgroundColor || config.canvas.backgroundColor,
    shapes: data?.shapes || [],
    darkMode: data?.darkMode ?? config.theme.darkMode,
    videoMode: true,
    projectDuration: data?.projectDuration || config.video?.defaultDuration || 60,
    fps: data?.fps || config.video?.fps || 30,
    currentPreset: data?.currentPreset || config.video?.defaultPreset || '1080p',
    tracks: data?.tracks || null,
  };

  // Initialize Vue reactive state (Phase 1 migration)
  const editorState = initEditorState(config, initialData);

  // Create legacy bridge to expose state globally for legacy code
  createLegacyBridge(editorState, config);

  // Initialize composables (Phases 2-9)
  // These set up global functions that the legacy code can call
  getHistory();
  getRenderer();
  getTools();
  getClipboard();
  getExport();
  getSnapGuides();

  // Interactions and keyboard (Phases F-G)
  getInteractions();
  getKeyboard();

  // Video mode composables (Phase 9)
  const videoState = getVideoState();
  // Expose getVideoState globally for shared handler and Vue components
  window.getVideoState = () => videoState;
  getPlayback();
  getTimeline();
  getClipManagement();
  getMediaRegistry();
  getCropMode();

  // Video mode initialization composable
  const videoMode = getVideoMode();

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

    // Initialize video mode (replaces legacy extensions.js initVideoMode)
    videoMode.initVideoMode();

    // Mount Vue App overlay after canvas is ready
    // This creates a separate Vue app for Vue components that overlay the canvas
    // App.vue handles:
    //   1. Creating video workspace layout (initVideoWorkspace)
    //   2. Creating #docked-timeline container
    //   3. Initializing vis-timeline (timeline.initTimeline)
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'vue-overlay-root';
    document.body.appendChild(overlayContainer);
    const overlayApp = createApp(AppOverlay);
    overlayApp.mount(overlayContainer);

    // Initialize MCP bridge for AI agent communication
    initMCPBridge({ 
      editorType: 'video',
      onConnect: () => console.log('[video] MCP connected'),
    });
    // NOTE: Timeline initialization is handled by App.vue's initVideoWorkspace()
    // Do NOT duplicate the initialization here
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
window.parent?.postMessage({ type: 'ready', source: 'video-editor' }, '*');
