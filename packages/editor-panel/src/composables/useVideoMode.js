// editor/composables/useVideoMode.js
// Video mode initialization composable
// Replaces initVideoMode() from extensions.js

import { ref, onMounted, onUnmounted } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getTimeline } from './useTimeline.js';
import { getPlayback } from './usePlayback.js';
import { getInteractions } from './useInteractions.js';

/**
 * Video mode composable for initialization and workspace setup
 */
export function useVideoMode() {
  const { state, config } = getEditorState();

  // Video mode state
  const isInitialized = ref(false);
  const currentPreset = ref(config.video?.defaultPreset || '1080p');

  // Screen presets
  const screenPresets = {
    '1080p': { width: 1920, height: 1080, label: '1080p (16:9)' },
    '720p': { width: 1280, height: 720, label: '720p (16:9)' },
    '4K': { width: 3840, height: 2160, label: '4K UHD (16:9)' },
    'Square': { width: 1080, height: 1080, label: 'Square (1:1)' },
    'Vertical HD': { width: 1080, height: 1920, label: 'Vertical HD (9:16)' },
    'Instagram Portrait': { width: 1080, height: 1350, label: 'Instagram (4:5)' },
  };

  /**
   * Initialize video mode
   * Note: Workspace and timeline creation is handled by App.vue's initVideoWorkspace()
   * This composable only provides coordinate and text editor overrides
   */
  function initVideoMode() {
    if (!state.videoMode) return;
    if (isInitialized.value) return;

    // Override screenToCanvas to handle display scaling
    overrideScreenToCanvas();

    // Override text editor positioning
    overrideTextEditorPosition();

    // NOTE: createVideoWorkspace() is NOT called here anymore
    // App.vue handles workspace creation in its onMounted() hook
    // This prevents duplicate #docked-timeline containers

    isInitialized.value = true;
  }

  /**
   * Override screenToCanvas to handle display scaling in video mode
   */
  function overrideScreenToCanvas() {
    const originalScreenToCanvas = window.screenToCanvas;

    window.screenToCanvas = function(clientX, clientY) {
      const canvas = document.getElementById('drawing-canvas');
      if (!canvas) {
        return originalScreenToCanvas ? originalScreenToCanvas(clientX, clientY) : { x: 0, y: 0 };
      }

      const rect = canvas.getBoundingClientRect();

      // Get the display scale factor
      const displayScale = canvas.width / rect.width;

      // Convert screen position to canvas position, accounting for display scale
      const canvasX = (clientX - rect.left) * displayScale;
      const canvasY = (clientY - rect.top) * displayScale;

      // Then apply pan and zoom
      return {
        x: (canvasX - state.panX) / state.zoom,
        y: (canvasY - state.panY) / state.zoom
      };
    };
  }

  /**
   * Override text editor positioning to account for display scale
   */
  function overrideTextEditorPosition() {
    const originalShowTextEditor = window.showTextEditor;

    if (originalShowTextEditor) {
      window.showTextEditor = function(shape, editIndex = -1) {
        originalShowTextEditor(shape, editIndex);
        fixTextEditorPosition(shape);
      };
    }

    const originalUpdateTextEditorPosition = window.updateTextEditorPosition;

    if (originalUpdateTextEditorPosition) {
      window.updateTextEditorPosition = function() {
        if (state.textEditingIndex < 0) {
          originalUpdateTextEditorPosition();
          return;
        }

        const shape = state.shapes[state.textEditingIndex];
        if (shape) {
          fixTextEditorPosition(shape);
        }
      };
    }
  }

  /**
   * Fix text editor position accounting for display scale
   */
  function fixTextEditorPosition(shape) {
    const editor = document.getElementById('text-editor');
    if (!editor || !shape) return;

    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const displayScale = rect.width / canvas.width;

    const fontSize = shape.fontSize || 20;
    const bounds = typeof window.getShapeBounds === 'function' ? window.getShapeBounds(shape) : null;
    const canvasX = bounds ? bounds.x : shape.x;
    const canvasY = bounds ? bounds.y : shape.y;

    // Convert canvas coords to screen coords with display scale
    const screenX = rect.left + (canvasX * state.zoom + state.panX) * displayScale;
    const screenY = rect.top + (canvasY * state.zoom + state.panY) * displayScale;

    // Scaled font size
    const scaledSize = fontSize * state.zoom * displayScale;

    editor.style.left = screenX + 'px';
    editor.style.top = screenY + 'px';
    editor.style.fontSize = scaledSize + 'px';

    // Handle text alignment
    const align = shape.align || 'left';
    if ((align === 'center' || align === 'right') && bounds && bounds.width > 0) {
      editor.style.width = (bounds.width * state.zoom * displayScale) + 'px';
    }

    // Handle rotation
    const rotation = shape.rotation || 0;
    if (rotation) {
      const rotationDeg = rotation * (180 / Math.PI);
      const boundsWidth = bounds ? bounds.width * state.zoom * displayScale : 50;
      const boundsHeight = bounds ? bounds.height * state.zoom * displayScale : scaledSize * 1.2;
      editor.style.transformOrigin = boundsWidth / 2 + 'px ' + boundsHeight / 2 + 'px';
      editor.style.transform = 'rotate(' + rotationDeg + 'deg)';
    } else {
      editor.style.transform = 'none';
      editor.style.transformOrigin = '';
    }
  }

  /**
   * Create video workspace layout
   */
  function createVideoWorkspace() {
    const body = document.body;

    // Check if already created
    if (document.querySelector('.video-workspace')) {
      return;
    }

    // Add video workspace class
    body.classList.add('video-mode');

    // Find or create wrapper
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      wrapper.classList.add('video-canvas-wrapper');
    }

    // Create docked timeline container if not exists
    let dockedTimeline = document.getElementById('docked-timeline');
    if (!dockedTimeline) {
      dockedTimeline = document.createElement('div');
      dockedTimeline.id = 'docked-timeline';
      dockedTimeline.className = 'docked-timeline';
      body.appendChild(dockedTimeline);
    }

    // Create video workspace wrapper
    const existingWorkspace = document.querySelector('.video-workspace');
    if (!existingWorkspace) {
      const workspace = document.createElement('div');
      workspace.className = 'video-workspace';
      if (!state.darkMode) {
        workspace.classList.add('light-mode');
      }

      // Move canvas wrapper into workspace
      if (wrapper) {
        workspace.appendChild(wrapper);
      }

      // Insert workspace before docked timeline
      body.insertBefore(workspace, dockedTimeline);
    }
  }

  /**
   * Apply screen preset
   */
  function applyScreenPreset(presetName) {
    const preset = screenPresets[presetName] || screenPresets['1080p'];

    currentPreset.value = presetName;
    state.currentPreset = presetName;

    // Update canvas size
    const canvas = document.getElementById('drawing-canvas');
    if (canvas) {
      canvas.width = preset.width;
      canvas.height = preset.height;

      // Store in state
      state.canvasWidth = preset.width;
      state.canvasHeight = preset.height;
    }

    // Update config
    if (window.CONFIG) {
      window.CONFIG.canvas = window.CONFIG.canvas || {};
      window.CONFIG.canvas.width = preset.width;
      window.CONFIG.canvas.height = preset.height;
    }

    // Resize canvas to fit viewport
    resizeCanvasToFit();

    // Update connected arrow endpoints
    const interactions = getInteractions();
    if (interactions?.updateAllConnectedArrows) {
      interactions.updateAllConnectedArrows();
    }

    // Re-render
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Apply custom size
   */
  function applyCustomSize(width, height) {
    currentPreset.value = 'Custom';
    state.currentPreset = 'Custom';

    const canvas = document.getElementById('drawing-canvas');
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      state.canvasWidth = width;
      state.canvasHeight = height;
    }

    if (window.CONFIG) {
      window.CONFIG.canvas = window.CONFIG.canvas || {};
      window.CONFIG.canvas.width = width;
      window.CONFIG.canvas.height = height;
    }

    resizeCanvasToFit();

    // Update connected arrow endpoints
    const interactions = getInteractions();
    if (interactions?.updateAllConnectedArrows) {
      interactions.updateAllConnectedArrows();
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Resize canvas to fit viewport
   */
  function resizeCanvasToFit() {
    const canvas = document.getElementById('drawing-canvas');
    const wrapper = document.getElementById('canvas-wrapper');
    if (!canvas || !wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasAspect = canvas.width / canvas.height;
    const wrapperAspect = wrapperRect.width / wrapperRect.height;

    let displayWidth, displayHeight;

    if (canvasAspect > wrapperAspect) {
      // Canvas is wider - fit to width
      displayWidth = wrapperRect.width * 0.95;
      displayHeight = displayWidth / canvasAspect;
    } else {
      // Canvas is taller - fit to height
      displayHeight = wrapperRect.height * 0.95;
      displayWidth = displayHeight * canvasAspect;
    }

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    // Update canvas display scale - critical for coordinate conversion
    state.canvasDisplayScale = displayWidth / canvas.width;

    // Reset zoom and pan
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
  }

  /**
   * Apply dark mode for video mode
   */
  function applyVideoDarkMode(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);

    const workspace = document.querySelector('.video-workspace');
    if (workspace) {
      workspace.classList.toggle('light-mode', !isDark);
    }

    // Update theme icons
    if (typeof window.updateToolbarThemeIcons === 'function') {
      window.updateToolbarThemeIcons();
    }
    if (typeof window.updateDarkModeIcons === 'function') {
      window.updateDarkModeIcons();
    }
  }

  /**
   * Toggle dark mode
   */
  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    applyVideoDarkMode(state.darkMode);
  }

  /**
   * Toggle timeline collapse
   */
  function toggleTimelineCollapse() {
    const dockedTimeline = document.getElementById('docked-timeline');
    if (dockedTimeline) {
      dockedTimeline.classList.toggle('collapsed');
    }
  }

  /**
   * Update time display
   */
  function updateTimeDisplay() {
    const currentEl = document.getElementById('time-current');
    const totalEl = document.getElementById('time-total');

    if (currentEl) {
      currentEl.textContent = formatTimeMMSS(state.currentTime);
    }
    if (totalEl) {
      totalEl.textContent = formatTimeMMSS(state.projectDuration || 60);
    }
  }

  /**
   * Format time as MM:SS.m
   */
  function formatTimeMMSS(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }

  /**
   * Update play button state
   */
  function updatePlayButton() {
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');

    if (playIcon && pauseIcon) {
      playIcon.style.display = state.isPlaying ? 'none' : 'block';
      pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
    }
  }

  // Expose functions globally
  window.initVideoMode = initVideoMode;
  window.applyScreenPreset = applyScreenPreset;
  window.applyCustomSize = applyCustomSize;
  window.resizeCanvasToFit = resizeCanvasToFit;
  window.toggleDarkMode = toggleDarkMode;
  window.applyVideoDarkMode = applyVideoDarkMode;
  window.toggleTimelineCollapse = toggleTimelineCollapse;
  window.updateTimeDisplay = updateTimeDisplay;
  window.updatePlayButton = updatePlayButton;

  return {
    // State
    isInitialized,
    currentPreset,
    screenPresets,

    // Methods
    initVideoMode,
    createVideoWorkspace,
    applyScreenPreset,
    applyCustomSize,
    resizeCanvasToFit,
    applyVideoDarkMode,
    toggleDarkMode,
    toggleTimelineCollapse,
    updateTimeDisplay,
    updatePlayButton,
    formatTimeMMSS,
  };
}

// Singleton instance
let videoModeInstance = null;

/**
 * Get or create video mode instance
 */
export function getVideoMode() {
  if (!videoModeInstance) {
    videoModeInstance = useVideoMode();
  }
  return videoModeInstance;
}

export default useVideoMode;
