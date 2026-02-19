// editor/composables/useKeyboard.js
// Keyboard shortcut handling composable

import { onMounted, onUnmounted } from 'vue';
import { getEditorState, getEditorComposable } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getTools } from './useTools.js';
import { getViewportKeyframes } from './useViewportKeyframes.js';
import { getRecording } from './useRecording.js';

/**
 * Centralized keyboard shortcuts configuration
 * All shortcuts should be defined here for consistency across the app
 */
export const SHORTCUTS = {
  // Drawing tools (single key, no modifiers)
  tools: {
    select: 'V',
    hand: 'H',
    rect: 'R',
    diamond: 'D',
    ellipse: 'O',
    triangle: 'T',
    arrow: 'A',
    line: 'L',
    pen: 'P',
    text: 'X',
    image: 'I',
    eraser: 'E',
    frame: 'F',
    cursor: 'C',  // Animated cursor for tutorials/demos (video mode)
  },

  // Media tools (video mode only)
  media: {
    image: 'I',
    video: 'U',
    audio: 'M',  // M for Music/Media
  },

  // Video mode playback (overrides some tool shortcuts)
  videoPlayback: {
    skipBackward: 'J',  // Skip backward 5 seconds (overrides audio in playback context)
    playPause: 'K',
    skipForward: 'L',   // Skip forward 5 seconds
    split: 'S',         // Split at playhead
    previousFrame: ',',
    nextFrame: '.',
    addCameraKeyframe: 'Shift+K',  // Add viewport keyframe at current time
    record: 'Shift+R',  // Open recording dialog
  },

  // Modifier shortcuts (Ctrl/Cmd + key)
  ctrl: {
    undo: 'Z',
    redo: 'Y',          // Also Ctrl+Shift+Z
    selectAll: 'A',
    copy: 'C',
    cut: 'X',
    paste: 'V',
    duplicate: 'D',
    group: 'G',         // Ctrl+Shift+G to ungroup
    save: 'S',
    open: 'O',
    exportPng: 'Shift+E',
    sendBackward: '[',
    bringForward: ']',
    sendToBack: 'Shift+[',
    bringToFront: 'Shift+]',
    zoomIn: '+',
    zoomOut: '-',
    resetZoom: '0',
    zoomToFit: '1',
  },

  // Other shortcuts
  other: {
    delete: 'Delete',
    escape: 'Escape',
    help: '?',
    nudge: 'Arrow keys',
    nudgeFast: 'Shift+Arrow keys',
  }
};

/**
 * Get tool shortcut map (lowercase key -> tool name)
 * Used internally by keyboard handler
 */
export function getToolShortcutMap() {
  const map = {};
  for (const [tool, key] of Object.entries(SHORTCUTS.tools)) {
    map[key.toLowerCase()] = tool;
  }
  return map;
}

/**
 * Keyboard shortcuts composable
 * Handles all keyboard interactions for the editor
 */
export function useKeyboard() {
  const { state, config } = getEditorState();
  const { setTool, selectShape, clearSelection } = getEditorComposable();
  const { undo, redo, saveState } = getHistory();
  const tools = getTools();

  // Tool shortcut mapping (derived from centralized config)
  const toolShortcuts = getToolShortcutMap();

  /**
   * Initialize keyboard handlers
   */
  function init() {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
  }

  /**
   * Clean up keyboard handlers
   */
  function cleanup() {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
  }

  /**
   * Handle key down events
   */
  function handleKeyDown(e) {
    // Skip if in text input
    if (isTextInputFocused()) {
      // Allow Escape to exit text editing
      if (e.key === 'Escape') {
        if (typeof window.exitTextEditMode === 'function') {
          window.exitTextEditMode();
        }
      }
      return;
    }

    // Space key handling
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();

      // In video mode, space toggles play/pause
      if (state.videoMode) {
        if (typeof window.togglePlayPause === 'function') {
          window.togglePlayPause();
        }
        return;
      }

      // In canvas mode, space enables panning
      state.spacePressed = true;
      document.getElementById('canvas-wrapper')?.classList.add('mode-hand');
      return;
    }

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    // Ctrl/Cmd shortcuts
    if (ctrl) {
      handleCtrlShortcut(key, shift, alt, e);
      return;
    }

    // Video mode shift shortcuts
    if (state.videoMode && shift && !alt) {
      switch (key) {
        case 'k':
          // Add camera keyframe at current time (Shift+K)
          e.preventDefault();
          try {
            const { addViewportKeyframe } = getViewportKeyframes();
            addViewportKeyframe();
          } catch (err) {
            console.warn('Could not add viewport keyframe:', err);
          }
          return;

        case 'r':
          // Open recording dialog (Shift+R)
          e.preventDefault();
          try {
            const recording = getRecording();
            recording.openRecordingDialog();
          } catch (err) {
            console.warn('Could not open recording dialog:', err);
          }
          return;
      }
    }

    // Video mode specific shortcuts (before tool shortcuts)
    if (state.videoMode && !shift && !alt) {
      switch (key) {
        case 's':
          // Split at playhead
          e.preventDefault();
          if (typeof window.splitSelectedAtPlayhead === 'function') {
            window.splitSelectedAtPlayhead();
          }
          return;

        case 'j':
          // Skip backward 5 seconds
          e.preventDefault();
          if (typeof window.skipBackward === 'function') {
            window.skipBackward(5);
          } else if (typeof window.seekTo === 'function') {
            window.seekTo(Math.max(0, state.currentTime - 5));
          }
          return;

        case 'k':
          // Toggle play/pause (alternative to space)
          e.preventDefault();
          if (typeof window.togglePlayPause === 'function') {
            window.togglePlayPause();
          }
          return;

        case 'l':
          // Skip forward 5 seconds
          e.preventDefault();
          if (typeof window.skipForward === 'function') {
            window.skipForward(5);
          } else if (typeof window.seekTo === 'function') {
            window.seekTo(Math.min(state.projectDuration || 60, state.currentTime + 5));
          }
          return;

        case ',':
          // Previous frame
          e.preventDefault();
          if (typeof window.previousFrame === 'function') {
            window.previousFrame();
          }
          return;

        case '.':
          // Next frame
          e.preventDefault();
          if (typeof window.nextFrame === 'function') {
            window.nextFrame();
          }
          return;

        case 'home':
          // Go to start
          e.preventDefault();
          if (typeof window.seekTo === 'function') {
            window.seekTo(0);
          }
          return;

        case 'end':
          // Go to end
          e.preventDefault();
          if (typeof window.seekTo === 'function') {
            window.seekTo(state.projectDuration || 60);
          }
          return;
      }
    }

    // Media tool shortcuts (I, U, J) - trigger file pickers
    // These are special because they open dialogs rather than switching tool mode
    if (!shift && !alt) {
      // Image (I) - works in both canvas and video mode
      if (key === 'i') {
        e.preventDefault();
        if (typeof window.triggerImageUpload === 'function') {
          window.triggerImageUpload();
        }
        return;
      }

      // Video mode only: Video (U) and Audio (M)
      if (state.videoMode) {
        if (key === 'u') {
          e.preventDefault();
          // Trigger video file picker
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/*';
          input.onchange = (evt) => {
            if (evt.target.files[0] && typeof window.addVideoToCanvas === 'function') {
              window.addVideoToCanvas(evt.target.files[0]);
            }
          };
          input.click();
          return;
        }

        if (key === 'm') {
          e.preventDefault();
          // Trigger audio file picker
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.onchange = (evt) => {
            if (evt.target.files[0] && typeof window.addAudioToTimeline === 'function') {
              window.addAudioToTimeline(evt.target.files[0]);
            }
          };
          input.click();
          return;
        }
      }
    }

    // Tool shortcuts (single key, no modifiers)
    // Note: In video mode, 's', 'l', 'j' are handled above for playback controls
    // Note: 'i' is handled above for image upload
    if (!shift && !alt && toolShortcuts[key]) {
      // Skip tool shortcuts that are overridden in video mode or handled specially
      if (state.videoMode && (key === 's' || key === 'l' || key === 'j')) {
        return;
      }
      // Skip 'i' since it's handled above for image upload
      if (key === 'i') {
        return;
      }
      e.preventDefault();
      setTool(toolShortcuts[key]);
      return;
    }

    // Other shortcuts
    switch (key) {
      case 'escape':
        handleEscape();
        break;

      case 'enter':
        // Apply crop when in crop mode
        if (state.isCropping && typeof window.exitCropMode === 'function') {
          e.preventDefault();
          window.exitCropMode(true);
        }
        // Apply vector edit when in vector edit mode
        else if (state.isVectorEditing && typeof window.exitVectorEditMode === 'function') {
          e.preventDefault();
          window.exitVectorEditMode(true);
        }
        break;

      case 'delete':
      case 'backspace':
        e.preventDefault();
        deleteSelected();
        break;

      case 'arrowup':
        e.preventDefault();
        nudgeSelection(0, shift ? -10 : -1);
        break;

      case 'arrowdown':
        e.preventDefault();
        nudgeSelection(0, shift ? 10 : 1);
        break;

      case 'arrowleft':
        e.preventDefault();
        nudgeSelection(shift ? -10 : -1, 0);
        break;

      case 'arrowright':
        e.preventDefault();
        nudgeSelection(shift ? 10 : 1, 0);
        break;

      case '[':
        e.preventDefault();
        tools.sendBackward();
        break;

      case ']':
        e.preventDefault();
        tools.bringForward();
        break;

      case '?':
        // Show keyboard shortcuts help
        if (typeof window.showKeyboardShortcutsModal === 'function') {
          window.showKeyboardShortcutsModal();
        }
        break;

      case '+':
      case '=':
        e.preventDefault();
        zoomIn();
        break;

      case '-':
        e.preventDefault();
        zoomOut();
        break;

      case '0':
        e.preventDefault();
        resetZoom();
        break;

      case '1':
        e.preventDefault();
        zoomToFit();
        break;
    }
  }

  /**
   * Handle Ctrl/Cmd shortcuts
   */
  function handleCtrlShortcut(key, shift, alt, e) {
    switch (key) {
      case 'z':
        e.preventDefault();
        if (shift) {
          redo();
        } else {
          undo();
        }
        break;

      case 'y':
        e.preventDefault();
        redo();
        break;

      case 'a':
        e.preventDefault();
        selectAll();
        break;

      case 'c':
        e.preventDefault();
        copySelected();
        break;

      case 'x':
        e.preventDefault();
        cutSelected();
        break;

      case 'v':
        e.preventDefault();
        pasteClipboard();
        break;

      case 'd':
        e.preventDefault();
        tools.duplicateSelected();
        break;

      case 'g':
        e.preventDefault();
        if (shift) {
          tools.ungroupSelected();
        } else {
          tools.groupSelected();
        }
        break;

      case 's':
        e.preventDefault();
        if (typeof window.saveAsJson === 'function') {
          window.saveAsJson();
        }
        break;

      case 'o':
        e.preventDefault();
        if (typeof window.triggerImport === 'function') {
          window.triggerImport();
        }
        break;

      case 'e':
        if (shift) {
          e.preventDefault();
          if (typeof window.exportAsPng === 'function') {
            window.exportAsPng();
          }
        }
        break;

      case '[':
        e.preventDefault();
        if (shift) {
          tools.sendToBack();
        } else {
          tools.sendBackward();
        }
        break;

      case ']':
        e.preventDefault();
        if (shift) {
          tools.bringToFront();
        } else {
          tools.bringForward();
        }
        break;

      case '+':
      case '=':
        e.preventDefault();
        zoomIn();
        break;

      case '-':
        e.preventDefault();
        zoomOut();
        break;

      case '0':
        e.preventDefault();
        resetZoom();
        break;

      case '1':
        e.preventDefault();
        zoomToFit();
        break;
    }

    // Boolean operations (Ctrl+Alt)
    if (alt) {
      switch (key) {
        case 'u':
          e.preventDefault();
          if (typeof window.booleanOperation === 'function') {
            window.booleanOperation('union');
          }
          break;
        case 's':
          e.preventDefault();
          if (typeof window.booleanOperation === 'function') {
            window.booleanOperation('subtract');
          }
          break;
        case 'i':
          e.preventDefault();
          if (typeof window.booleanOperation === 'function') {
            window.booleanOperation('intersect');
          }
          break;
        case 'e':
          e.preventDefault();
          if (typeof window.booleanOperation === 'function') {
            window.booleanOperation('exclude');
          }
          break;
      }
    }
  }

  /**
   * Handle key up events
   */
  function handleKeyUp(e) {
    if (e.key === ' ' || e.code === 'Space') {
      state.spacePressed = false;
      // Only remove mode-hand class if we're not actively panning
      // The class will be removed when panning ends
      if (!state.isPanning) {
        document.getElementById('canvas-wrapper')?.classList.remove('mode-hand');
      }
    }
  }

  /**
   * Handle Escape key
   */
  function handleEscape() {
    // Exit various modes
    if (state.isCropping && typeof window.exitCropMode === 'function') {
      window.exitCropMode(false);
      return;
    }

    if (state.isVectorEditing && typeof window.exitVectorEditMode === 'function') {
      window.exitVectorEditMode(false);
      return;
    }

    if (state.textEditingIndex >= 0 && typeof window.exitTextEditMode === 'function') {
      window.exitTextEditMode();
      return;
    }

    // Exit group mode if active
    if (state.activeGroupIndex >= 0) {
      state.activeGroupIndex = -1;
      state.selectedGroupChildren = [];
      if (typeof window.render === 'function') {
        window.render();
      }
      return;
    }

    // Clear selection
    clearSelection();

    // Hide options bar
    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }

    // Re-render
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Check if text input is focused
   */
  function isTextInputFocused() {
    const active = document.activeElement;
    if (!active) return false;

    const tagName = active.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' ||
           active.contentEditable === 'true' ||
           active.id === 'text-editor' ||
           active.id === 'frame-name-editor';
  }

  /**
   * Delete selected shapes
   */
  function deleteSelected() {
    // Check if a cursor keyframe is selected for deletion
    if (state.selectedCursorKeyframeIndex >= 0 && state.selectedIndices.length === 1) {
      const selectedShape = state.shapes[state.selectedIndices[0]];
      if (selectedShape?.type === 'cursor' && typeof window.deleteCursorKeyframe === 'function') {
        const deleted = window.deleteCursorKeyframe(selectedShape, state.selectedCursorKeyframeIndex);
        if (deleted) {
          state.selectedCursorKeyframeIndex = -1;
          return;
        }
      }
    }

    if (state.selectedIndices.length > 0) {
      // In video mode, use deleteClip to properly update timeline
      if (state.videoMode && typeof window.deleteClip === 'function') {
        // Delete in reverse order to maintain correct indices
        const indicesToDelete = [...state.selectedIndices].sort((a, b) => b - a);
        indicesToDelete.forEach(index => {
          window.deleteClip(index);
        });
      } else {
        tools.deleteShapes([...state.selectedIndices]);
      }
    } else if (state.selectedFrameChildren && state.selectedFrameChildren.length > 0) {
      // Delete frame children
      if (typeof window.deleteSelectedFrameChildren === 'function') {
        window.deleteSelectedFrameChildren();
      }
    }
  }

  /**
   * Nudge selection by delta
   */
  function nudgeSelection(dx, dy) {
    if (state.selectedIndices.length === 0) return;

    state.selectedIndices.forEach(index => {
      const shape = state.shapes[index];
      if (typeof window.moveShapeObj === 'function') {
        window.moveShapeObj(shape, dx, dy);
      }
    });

    saveState();
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Select all shapes
   */
  function selectAll() {
    state.selectedIndices = state.shapes
      .map((_, i) => i)
      .filter(i => state.shapes[i].visible !== false);
    state.selectedFrameChildren = [];

    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }
  }

  /**
   * Copy selected to clipboard
   */
  function copySelected() {
    if (typeof window.copySelected === 'function') {
      window.copySelected();
    }
  }

  /**
   * Cut selected to clipboard
   */
  function cutSelected() {
    if (typeof window.cutSelected === 'function') {
      window.cutSelected();
    }
  }

  /**
   * Paste from clipboard
   */
  function pasteClipboard() {
    if (typeof window.pasteClipboard === 'function') {
      window.pasteClipboard();
    }
  }

  /**
   * Zoom in
   */
  function zoomIn() {
    const step = config.zoom?.step || 0.1;
    const max = config.zoom?.max || 10;
    state.zoom = Math.min(max, state.zoom + step);
    if (typeof window.updateZoomDisplay === 'function') {
      window.updateZoomDisplay();
    }
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Zoom out
   */
  function zoomOut() {
    const step = config.zoom?.step || 0.1;
    const min = config.zoom?.min || 0.1;
    state.zoom = Math.max(min, state.zoom - step);
    if (typeof window.updateZoomDisplay === 'function') {
      window.updateZoomDisplay();
    }
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Reset zoom to 100%
   */
  function resetZoom() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    if (typeof window.updateZoomDisplay === 'function') {
      window.updateZoomDisplay();
    }
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Zoom to fit content
   */
  function zoomToFit() {
    if (typeof window.zoomToFit === 'function') {
      window.zoomToFit();
    }
  }

  // Lifecycle hooks
  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    cleanup();
  });

  // NOTE: Global exports removed in Phase E.2
  // Legacy scripts (interactions.js, extensions.js) provide the actual implementations

  return {
    init,
    cleanup,
    handleKeyDown,
    handleKeyUp,
    handleEscape,
    deleteSelected,
    nudgeSelection,
    selectAll,
    copySelected,
    cutSelected,
    pasteClipboard,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomToFit
  };
}

// Singleton instance
let keyboardInstance = null;

/**
 * Get or create keyboard instance
 */
export function getKeyboard() {
  if (!keyboardInstance) {
    keyboardInstance = useKeyboard();
  }
  return keyboardInstance;
}

export default useKeyboard;
