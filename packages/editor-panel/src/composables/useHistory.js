// editor/composables/useHistory.js
// Undo/redo history management - fully implemented without legacy delegation

import { getEditorState } from './useEditorState.js';
import { relinkMediaElements, reloadShapeImages, cleanupOrphanedMedia } from '../utils/media.js';

/**
 * History composable for undo/redo functionality
 */
export function useHistory() {
  const { state, config } = getEditorState();

  /**
   * Save current state to history
   * Call this after any state-changing operation
   */
  function saveState() {
    // Truncate any redo history
    state.history = state.history.slice(0, state.historyIndex + 1);

    // Create snapshot
    const snapshot = JSON.stringify({
      shapes: state.shapes,
      backgroundColor: state.backgroundColor
    });

    state.history.push(snapshot);

    // Limit history size
    const maxStates = config?.history?.maxStates || 50;
    if (state.history.length > maxStates) {
      state.history.shift();
    } else {
      state.historyIndex++;
    }
  }

  /**
   * Trigger a canvas render
   */
  function triggerRender() {
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Trigger UI updates after undo/redo
   */
  function triggerUIUpdates() {
    // Update layers list (Vue LayersPanel updates reactively, but legacy needs this)
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }

    // Update timeline if in video mode
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Hide options bar (nothing selected after undo/redo)
    if (typeof window.vueHideOptionsBar === 'function') {
      window.vueHideOptionsBar();
    } else if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }
  }

  /**
   * Undo the last operation
   */
  function undo() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      const snapshot = JSON.parse(state.history[state.historyIndex]);
      state.shapes = snapshot.shapes;
      state.backgroundColor = snapshot.backgroundColor;
      state.selectedIndices = [];
      state.selectedFrameChildren = [];

      // Re-link media elements from registry (using imported utility)
      relinkMediaElements(state.shapes);

      // Reload images that don't have valid elements
      reloadShapeImages(state.shapes, triggerRender);

      // Clean up orphaned media
      cleanupOrphanedMedia(state.shapes);

      // Update background color UI
      updateBackgroundColorUI();

      // Trigger render and UI updates
      triggerRender();
      triggerUIUpdates();
    }
  }

  /**
   * Redo the last undone operation
   */
  function redo() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      const snapshot = JSON.parse(state.history[state.historyIndex]);
      state.shapes = snapshot.shapes;
      state.backgroundColor = snapshot.backgroundColor;
      state.selectedIndices = [];
      state.selectedFrameChildren = [];

      // Re-link media elements from registry (using imported utility)
      relinkMediaElements(state.shapes);

      // Reload images that don't have valid elements
      reloadShapeImages(state.shapes, triggerRender);

      // Clean up orphaned media
      cleanupOrphanedMedia(state.shapes);

      // Update background color UI
      updateBackgroundColorUI();

      // Trigger render and UI updates
      triggerRender();
      triggerUIUpdates();
    }
  }

  /**
   * Check if undo is available
   */
  function canUndo() {
    return state.historyIndex > 0;
  }

  /**
   * Check if redo is available
   */
  function canRedo() {
    return state.historyIndex < state.history.length - 1;
  }

  /**
   * Clear all history
   */
  function clearHistory() {
    state.history = [];
    state.historyIndex = -1;
  }

  /**
   * Update background color UI elements
   */
  function updateBackgroundColorUI() {
    const bgColorInput = document.getElementById('canvas-bg-color');
    const bgHexInput = document.getElementById('canvas-bg-hex');
    if (bgColorInput) bgColorInput.value = state.backgroundColor;
    if (bgHexInput) bgHexInput.value = state.backgroundColor;
  }

  // Expose functions globally for legacy code compatibility
  // These will be removed once all legacy code is migrated
  if (typeof window !== 'undefined') {
    window.saveState = saveState;
    window.undo = undo;
    window.redo = redo;

    // renderLayersList is a no-op since Vue LayersPanel uses reactive state
    // Legacy code calls this, but Vue handles re-rendering automatically
    window.renderLayersList = () => {
      // No-op: Vue LayersPanel watches state.shapes reactively
    };

    // updateToolUI is a no-op since Vue EditorToolbar uses reactive state
    window.updateToolUI = () => {
      // No-op: Vue EditorToolbar watches state.currentTool reactively
    };

    // updateBackgroundColorUI updates the color inputs in MenuPanel
    window.updateBackgroundColorUI = updateBackgroundColorUI;
  }

  return {
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory
  };
}

// Singleton instance
let historyInstance = null;

/**
 * Get or create history instance
 */
export function getHistory() {
  if (!historyInstance) {
    historyInstance = useHistory();
  }
  return historyInstance;
}

export default useHistory;
