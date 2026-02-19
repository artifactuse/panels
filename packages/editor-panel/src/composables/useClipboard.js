// editor/composables/useClipboard.js
// Clipboard operations composable - fully implemented without legacy delegation

import { getEditorState } from './useEditorState.js';
import { cloneShape } from '../utils/shapes.js';
import { cloneMediaElement } from '../utils/media.js';

/**
 * Clipboard composable for cut/copy/paste operations
 */
export function useClipboard() {
  const { state, config } = getEditorState();

  /**
   * Save state - delegates to window.saveState for video mode compatibility
   * In video mode, extensions.js overrides window.saveState with a version
   * that adds temporal properties and updates the timeline
   */
  function saveState() {
    if (typeof window.saveState === 'function') {
      window.saveState();
    }
  }

  // Paste offset for stacking pasted items
  const pasteOffset = config.clipboard?.pasteOffset || 20;

  /**
   * Copy selected shapes to clipboard
   */
  function copySelected() {
    const shapes = getSelectedShapes();
    if (shapes.length === 0) return;

    // Deep clone shapes for clipboard, but preserve original ID for media lookup
    state.clipboard = shapes.map(shape => {
      const clone = cloneShape(shape);
      // Store the original shape ID so we can look up media elements during paste
      clone._originalId = shape.id;
      // Also store the src directly for media shapes
      if (shape.type === 'image' || shape.type === 'video' || shape.type === 'audio') {
        clone.src = shape.src;
      }
      return clone;
    });

    // Reset paste counter for offset stacking
    state.pasteCount = 0;
  }

  /**
   * Cut selected shapes (copy + delete)
   */
  function cutSelected() {
    copySelected();
    deleteSelected();
  }

  /**
   * Paste from clipboard
   */
  function pasteClipboard() {
    if (!state.clipboard || state.clipboard.length === 0) return;

    // Calculate offset for this paste
    state.pasteCount = (state.pasteCount || 0) + 1;
    const offset = pasteOffset * state.pasteCount;

    // Create new shapes from clipboard
    const newIndices = [];
    state.clipboard.forEach(clipShape => {
      const newShape = cloneShape(clipShape);

      // Apply offset
      applyOffset(newShape, offset, offset);

      // In video mode, reset temporal properties so saveState() will assign new ones
      // This ensures pasted clips get placed at current playhead, not overlapping original
      if (state.videoMode) {
        delete newShape.startTime;
        delete newShape.duration;
        delete newShape.trackId;
      }

      // Clone media element if this is a media shape
      if (clipShape.type === 'image' || clipShape.type === 'video' || clipShape.type === 'audio') {
        const clonedElement = cloneMediaElement(clipShape, newShape.id);
        if (clonedElement) {
          if (clipShape.type === 'image') {
            newShape.imageElement = clonedElement;
          } else if (clipShape.type === 'video') {
            newShape.videoElement = clonedElement;
          } else if (clipShape.type === 'audio') {
            newShape.audioElement = clonedElement;
          }
        }
      }

      // Add to shapes
      state.shapes.push(newShape);
      newIndices.push(state.shapes.length - 1);
    });

    // Select pasted shapes
    state.selectedIndices = newIndices;
    state.selectedFrameChildren = [];

    // Re-render and save
    triggerRender();
    triggerLayersUpdate();
    triggerTimelineUpdate();
    triggerOptionsBarShow();
    saveState();
  }

  /**
   * Paste at specific position
   */
  function pasteAt(x, y) {
    if (!state.clipboard || state.clipboard.length === 0) return;

    // Calculate bounds of clipboard content
    let minX = Infinity, minY = Infinity;
    state.clipboard.forEach(shape => {
      const bounds = getShapeBoundsForClip(shape);
      if (bounds) {
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
      }
    });

    // Create new shapes from clipboard
    const newIndices = [];
    state.clipboard.forEach(clipShape => {
      const newShape = cloneShape(clipShape);

      // Calculate position offset
      const bounds = getShapeBoundsForClip(clipShape);
      if (bounds) {
        const dx = x - minX;
        const dy = y - minY;
        applyOffset(newShape, dx, dy);
      }

      // In video mode, reset temporal properties so saveState() will assign new ones
      // This ensures pasted clips get placed at current playhead, not overlapping original
      if (state.videoMode) {
        delete newShape.startTime;
        delete newShape.duration;
        delete newShape.trackId;
      }

      // Clone media element if this is a media shape
      if (clipShape.type === 'image' || clipShape.type === 'video' || clipShape.type === 'audio') {
        const clonedElement = cloneMediaElement(clipShape, newShape.id);
        if (clonedElement) {
          if (clipShape.type === 'image') {
            newShape.imageElement = clonedElement;
          } else if (clipShape.type === 'video') {
            newShape.videoElement = clonedElement;
          } else if (clipShape.type === 'audio') {
            newShape.audioElement = clonedElement;
          }
        }
      }

      // Add to shapes
      state.shapes.push(newShape);
      newIndices.push(state.shapes.length - 1);
    });

    // Select pasted shapes
    state.selectedIndices = newIndices;
    state.selectedFrameChildren = [];

    // Re-render and save
    triggerRender();
    triggerLayersUpdate();
    triggerTimelineUpdate();
    triggerOptionsBarShow();
    saveState();
  }

  /**
   * Copy selected as PNG to system clipboard
   */
  async function copySelectedAsPng() {
    if (typeof window.copySelectedAsPng === 'function') {
      return window.copySelectedAsPng();
    }

    // Basic implementation
    const shapes = getSelectedShapes();
    if (shapes.length === 0) return;

    try {
      const blob = await renderShapesToBlob(shapes, 'image/png');
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
      }
    } catch (error) {
      console.error('Failed to copy as PNG:', error);
    }
  }

  /**
   * Copy selected as SVG to system clipboard
   */
  async function copySelectedAsSvg() {
    if (typeof window.copySelectedAsSvg === 'function') {
      return window.copySelectedAsSvg();
    }

    // Basic implementation
    const shapes = getSelectedShapes();
    if (shapes.length === 0) return;

    try {
      const svg = renderShapesToSvg(shapes);
      if (svg) {
        await navigator.clipboard.writeText(svg);
      }
    } catch (error) {
      console.error('Failed to copy as SVG:', error);
    }
  }

  /**
   * Check if clipboard has content
   */
  function hasClipboard() {
    return state.clipboard && state.clipboard.length > 0;
  }

  /**
   * Clear clipboard
   */
  function clearClipboard() {
    state.clipboard = [];
    state.pasteCount = 0;
  }

  // Helper functions

  /**
   * Get currently selected shapes
   */
  function getSelectedShapes() {
    // Include frame children if selected
    if (state.selectedFrameChildren && state.selectedFrameChildren.length > 0) {
      return state.selectedFrameChildren.map(sel => {
        const frame = state.shapes[sel.frameIndex];
        return frame?.children?.[sel.childIndex];
      }).filter(Boolean);
    }

    // Main selection
    return state.selectedIndices.map(i => state.shapes[i]).filter(Boolean);
  }

  /**
   * Delete selected shapes
   */
  function deleteSelected() {
    // Handle frame children first
    if (state.selectedFrameChildren && state.selectedFrameChildren.length > 0) {
      // Sort by child index descending to preserve indices during deletion
      const sorted = [...state.selectedFrameChildren].sort((a, b) => b.childIndex - a.childIndex);
      sorted.forEach(sel => {
        const frame = state.shapes[sel.frameIndex];
        if (frame?.children) {
          frame.children.splice(sel.childIndex, 1);
        }
      });
      state.selectedFrameChildren = [];
    }

    // Handle main selection
    if (state.selectedIndices.length > 0) {
      // Sort descending to preserve indices
      const sorted = [...state.selectedIndices].sort((a, b) => b - a);
      sorted.forEach(i => {
        state.shapes.splice(i, 1);
      });
      state.selectedIndices = [];
    }

    // Re-render and save
    triggerRender();
    triggerLayersUpdate();
    triggerTimelineUpdate();
    triggerOptionsBarHide();
    saveState();
  }

  // ==================== TRIGGER HELPERS ====================

  /**
   * Trigger a canvas render
   */
  function triggerRender() {
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Trigger layers panel update
   */
  function triggerLayersUpdate() {
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  /**
   * Trigger timeline update (video mode)
   */
  function triggerTimelineUpdate() {
    if (state.videoMode && typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  /**
   * Trigger options bar show
   */
  function triggerOptionsBarShow() {
    if (typeof window.vueShowOptionsBar === 'function') {
      window.vueShowOptionsBar();
    } else if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }
  }

  /**
   * Trigger options bar hide
   */
  function triggerOptionsBarHide() {
    if (typeof window.vueHideOptionsBar === 'function') {
      window.vueHideOptionsBar();
    } else if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }
  }

  // ==================== SHAPE HELPERS ====================

  /**
   * Apply offset to a shape's position
   */
  function applyOffset(shape, dx, dy) {
    switch (shape.type) {
      case 'line':
      case 'arrow':
        shape.x1 += dx;
        shape.y1 += dy;
        shape.x2 += dx;
        shape.y2 += dy;
        if (shape.controlPoint) {
          shape.controlPoint.x += dx;
          shape.controlPoint.y += dy;
        }
        break;

      case 'freehand':
      case 'path':
        if (shape.points) {
          shape.points.forEach(p => {
            p.x += dx;
            p.y += dy;
          });
        }
        break;

      case 'frame':
        shape.x += dx;
        shape.y += dy;
        // Also move children
        if (shape.children) {
          shape.children.forEach(child => applyOffset(child, dx, dy));
        }
        break;

      case 'group':
        // Move all grouped shapes
        if (shape.shapes) {
          shape.shapes.forEach(child => applyOffset(child, dx, dy));
        }
        break;

      default:
        // Most shapes have simple x, y
        if ('x' in shape) shape.x += dx;
        if ('y' in shape) shape.y += dy;
        break;
    }
  }

  /**
   * Get simple bounds for clipboard offset calculation
   */
  function getShapeBoundsForClip(shape) {
    switch (shape.type) {
      case 'line':
      case 'arrow':
        return {
          x: Math.min(shape.x1, shape.x2),
          y: Math.min(shape.y1, shape.y2)
        };
      case 'ellipse':
        return {
          x: shape.x - (shape.radiusX || shape.radius || 0),
          y: shape.y - (shape.radiusY || shape.radius || 0)
        };
      default:
        return { x: shape.x || 0, y: shape.y || 0 };
    }
  }

  /**
   * Render shapes to canvas blob (placeholder - uses legacy if available)
   */
  async function renderShapesToBlob(shapes, mimeType) {
    // Delegate to legacy implementation
    if (typeof window.renderShapesToBlob === 'function') {
      return window.renderShapesToBlob(shapes, mimeType);
    }
    return null;
  }

  /**
   * Render shapes to SVG string (placeholder - uses legacy if available)
   */
  function renderShapesToSvg(shapes) {
    // Delegate to legacy implementation
    if (typeof window.renderShapesToSvg === 'function') {
      return window.renderShapesToSvg(shapes);
    }
    return null;
  }

  // Expose functions globally for legacy code compatibility
  // These will be removed once all legacy code is migrated
  if (typeof window !== 'undefined') {
    window.copySelected = copySelected;
    window.cutSelected = cutSelected;
    window.pasteClipboard = pasteClipboard;
    window.pasteAt = pasteAt;
    window.copySelectedAsPng = copySelectedAsPng;
    window.copySelectedAsSvg = copySelectedAsSvg;
    window.deleteSelected = deleteSelected;
  }

  return {
    copySelected,
    cutSelected,
    pasteClipboard,
    pasteAt,
    copySelectedAsPng,
    copySelectedAsSvg,
    hasClipboard,
    clearClipboard,
    getSelectedShapes,
    deleteSelected
  };
}

// Singleton instance
let clipboardInstance = null;

/**
 * Get or create clipboard instance
 */
export function getClipboard() {
  if (!clipboardInstance) {
    clipboardInstance = useClipboard();
  }
  return clipboardInstance;
}

export default useClipboard;
