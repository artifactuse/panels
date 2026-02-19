// editor/composables/useSnapGuides.js
// Snap guides composable for alignment assistance

import { getEditorState } from './useEditorState.js';
import { getShapeBounds } from '../utils/geometry.js';

/**
 * Snap guides composable for alignment during drag/resize
 */
export function useSnapGuides() {
  const { state, config } = getEditorState();

  // Snap configuration
  const snapThreshold = config.snap?.threshold || 8;

  /**
   * Check if snap to guides is enabled (reads from state, falls back to config)
   */
  function isSnapToGuidesEnabled() {
    return state.snapToGuides !== false && config.snap?.snapToGuides !== false;
  }

  /**
   * Check if snap to objects is enabled (reads from state, falls back to config)
   */
  function isSnapToObjectsEnabled() {
    return state.snapToObjects !== false && config.snap?.snapToObjects !== false;
  }

  /**
   * Get all snap points from shapes (excluding selected)
   */
  function getSnapPoints(excludeIndices = []) {
    const points = { vertical: [], horizontal: [] };

    // Canvas edges
    if (isSnapToGuidesEnabled()) {
      const canvas = document.getElementById('drawing-canvas');
      if (canvas) {
        // Canvas center
        const centerX = canvas.width / 2 / state.zoom - state.panX / state.zoom;
        const centerY = canvas.height / 2 / state.zoom - state.panY / state.zoom;
        points.vertical.push({ x: centerX, type: 'center' });
        points.horizontal.push({ y: centerY, type: 'center' });
      }
    }

    // Shape edges and centers
    if (isSnapToObjectsEnabled()) {
      state.shapes.forEach((shape, index) => {
        if (excludeIndices.includes(index)) return;
        if (shape.visible === false) return;

        const bounds = getShapeBounds(shape, config);
        if (!bounds) return;

        // Vertical snap points (x positions)
        points.vertical.push(
          { x: bounds.x, type: 'left', shapeIndex: index },
          { x: bounds.x + bounds.width / 2, type: 'center', shapeIndex: index },
          { x: bounds.x + bounds.width, type: 'right', shapeIndex: index }
        );

        // Horizontal snap points (y positions)
        points.horizontal.push(
          { y: bounds.y, type: 'top', shapeIndex: index },
          { y: bounds.y + bounds.height / 2, type: 'center', shapeIndex: index },
          { y: bounds.y + bounds.height, type: 'bottom', shapeIndex: index }
        );
      });
    }

    return points;
  }

  /**
   * Find snap offset for a moving shape
   */
  function findSnapOffset(bounds, excludeIndices = []) {
    if (!state.snapEnabled) {
      return { dx: 0, dy: 0, snapLines: { vertical: [], horizontal: [] } };
    }

    const snapPoints = getSnapPoints(excludeIndices);
    let dx = 0;
    let dy = 0;
    const activeLines = { vertical: [], horizontal: [] };

    // Shape snap points
    const shapePoints = {
      left: bounds.x,
      centerX: bounds.x + bounds.width / 2,
      right: bounds.x + bounds.width,
      top: bounds.y,
      centerY: bounds.y + bounds.height / 2,
      bottom: bounds.y + bounds.height
    };

    // Find vertical snaps
    let bestVerticalDist = snapThreshold;
    snapPoints.vertical.forEach(point => {
      // Check each shape edge
      ['left', 'centerX', 'right'].forEach(edge => {
        const dist = Math.abs(shapePoints[edge] - point.x);
        if (dist < bestVerticalDist) {
          bestVerticalDist = dist;
          dx = point.x - shapePoints[edge];
          activeLines.vertical = [point.x];
        } else if (dist === bestVerticalDist && Math.abs(dx) > 0) {
          activeLines.vertical.push(point.x);
        }
      });
    });

    // Find horizontal snaps
    let bestHorizontalDist = snapThreshold;
    snapPoints.horizontal.forEach(point => {
      // Check each shape edge
      ['top', 'centerY', 'bottom'].forEach(edge => {
        const dist = Math.abs(shapePoints[edge] - point.y);
        if (dist < bestHorizontalDist) {
          bestHorizontalDist = dist;
          dy = point.y - shapePoints[edge];
          activeLines.horizontal = [point.y];
        } else if (dist === bestHorizontalDist && Math.abs(dy) > 0) {
          activeLines.horizontal.push(point.y);
        }
      });
    });

    return { dx, dy, snapLines: activeLines };
  }

  /**
   * Find snap for resizing
   */
  function findResizeSnap(x, y, handle, bounds, excludeIndices = []) {
    if (!state.snapEnabled) {
      return { x, y, snapLines: { vertical: [], horizontal: [] } };
    }

    const snapPoints = getSnapPoints(excludeIndices);
    let snappedX = x;
    let snappedY = y;
    const activeLines = { vertical: [], horizontal: [] };

    // Snap X if handle affects horizontal position
    if (handle.includes('w') || handle.includes('e')) {
      let bestDist = snapThreshold;
      snapPoints.vertical.forEach(point => {
        const dist = Math.abs(x - point.x);
        if (dist < bestDist) {
          bestDist = dist;
          snappedX = point.x;
          activeLines.vertical = [point.x];
        }
      });
    }

    // Snap Y if handle affects vertical position
    if (handle.includes('n') || handle.includes('s')) {
      let bestDist = snapThreshold;
      snapPoints.horizontal.forEach(point => {
        const dist = Math.abs(y - point.y);
        if (dist < bestDist) {
          bestDist = dist;
          snappedY = point.y;
          activeLines.horizontal = [point.y];
        }
      });
    }

    return { x: snappedX, y: snappedY, snapLines: activeLines };
  }

  /**
   * Draw snap guides on canvas
   */
  function drawSnapGuides(ctx) {
    if (!state.activeSnapLines) return;

    const guideStyle = config.snap?.guideStyle || {};
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;

    ctx.save();
    ctx.strokeStyle = guideStyle.color || '#f472b6';
    ctx.lineWidth = (guideStyle.lineWidth || 1) * uiScale;
    ctx.setLineDash(guideStyle.lineDash || []);

    // Draw vertical guides
    state.activeSnapLines.vertical?.forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, -10000);
      ctx.lineTo(x, 10000);
      ctx.stroke();
    });

    // Draw horizontal guides
    state.activeSnapLines.horizontal?.forEach(y => {
      ctx.beginPath();
      ctx.moveTo(-10000, y);
      ctx.lineTo(10000, y);
      ctx.stroke();
    });

    ctx.restore();
  }

  /**
   * Clear active snap lines
   */
  function clearSnapLines() {
    state.activeSnapLines = { vertical: [], horizontal: [] };
  }

  /**
   * Toggle snap to guides
   */
  function toggleSnapToGuides() {
    state.snapToGuides = state.snapToGuides === false ? true : false;
  }

  /**
   * Toggle snap to objects
   */
  function toggleSnapToObjects() {
    state.snapToObjects = state.snapToObjects === false ? true : false;
  }

  /**
   * Toggle all snapping
   */
  function toggleSnap() {
    state.snapEnabled = !state.snapEnabled;
  }

  /**
   * Apply snap during drag
   */
  function applySnapDuringDrag(dx, dy, excludeIndices = []) {
    if (!state.snapEnabled) {
      state.activeSnapLines = { vertical: [], horizontal: [] };
      return { dx, dy };
    }

    // Get bounds of selected shapes
    const shapes = excludeIndices.map(i => state.shapes[i]).filter(Boolean);
    if (shapes.length === 0) return { dx, dy };

    // Calculate combined bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    shapes.forEach(shape => {
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        minX = Math.min(minX, bounds.x + dx);
        minY = Math.min(minY, bounds.y + dy);
        maxX = Math.max(maxX, bounds.x + bounds.width + dx);
        maxY = Math.max(maxY, bounds.y + bounds.height + dy);
      }
    });

    const bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };

    const snap = findSnapOffset(bounds, excludeIndices);
    state.activeSnapLines = snap.snapLines;

    return {
      dx: dx + snap.dx,
      dy: dy + snap.dy
    };
  }

  // NOTE: Global exports removed in Phase E.2
  // Legacy scripts (snapGuides.js) provide the actual implementations

  return {
    getSnapPoints,
    findSnapOffset,
    findResizeSnap,
    drawSnapGuides,
    clearSnapLines,
    toggleSnapToGuides,
    toggleSnapToObjects,
    toggleSnap,
    applySnapDuringDrag
  };
}

// Singleton instance
let snapGuidesInstance = null;

/**
 * Get or create snap guides instance
 */
export function getSnapGuides() {
  if (!snapGuidesInstance) {
    snapGuidesInstance = useSnapGuides();
  }
  return snapGuidesInstance;
}

export default useSnapGuides;
