// editor/utils/coordinates.js
// Coordinate transformation utilities - pure functions

/**
 * Convert screen coordinates to canvas coordinates
 * @param {number} clientX - Screen X coordinate
 * @param {number} clientY - Screen Y coordinate
 * @param {object} state - Editor state with panX, panY, zoom
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {{x: number, y: number}} Canvas coordinates
 */
export function screenToCanvas(clientX, clientY, state, canvas) {
  // If no canvas provided, try to get it from DOM
  const canvasEl = canvas || document.getElementById('drawing-canvas');
  if (!canvasEl) {
    // Return origin if canvas not available yet
    return { x: 0, y: 0 };
  }
  const rect = canvasEl.getBoundingClientRect();

  // Get the display scale factor (for video mode where canvas may be scaled down)
  // rect.width is display size, canvas.width is internal resolution
  const displayScale = canvasEl.width / rect.width;

  // Convert screen position to canvas position, accounting for display scale
  let canvasX = (clientX - rect.left) * displayScale;
  let canvasY = (clientY - rect.top) * displayScale;

  // Account for active zoom transitions in video mode
  // The zoom transition crops from (cropX, cropY) with size (cropW, cropH) and draws to full canvas
  // So we need to reverse this: screen position maps back to original coordinate
  if (typeof window.getActiveZoomTransform === 'function') {
    const zoomTransform = window.getActiveZoomTransform();
    if (zoomTransform) {
      // Screen coords (0 to canvas.width/height) map to crop region (cropX to cropX+cropW)
      // Reverse: originalX = cropX + (screenX / canvasWidth) * cropW
      canvasX = zoomTransform.cropX + (canvasX / zoomTransform.canvasWidth) * zoomTransform.cropW;
      canvasY = zoomTransform.cropY + (canvasY / zoomTransform.canvasHeight) * zoomTransform.cropH;
    }
  }

  // Then apply pan and zoom
  return {
    x: (canvasX - state.panX) / state.zoom,
    y: (canvasY - state.panY) / state.zoom
  };
}

/**
 * Convert canvas coordinates to screen coordinates
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} state - Editor state with panX, panY, zoom
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {{x: number, y: number}} Screen coordinates
 */
export function canvasToScreen(x, y, state, canvas) {
  // If no canvas provided, try to get it from DOM
  const canvasEl = canvas || document.getElementById('drawing-canvas');
  if (!canvasEl) {
    // Return origin if canvas not available yet
    return { x: 0, y: 0 };
  }
  const rect = canvasEl.getBoundingClientRect();

  // Get the display scale factor (for video mode where canvas may be scaled down)
  // rect.width is display size, canvas.width is internal resolution
  const displayScale = rect.width / canvasEl.width;

  // Apply zoom and pan first (in canvas space)
  const canvasX = x * state.zoom + state.panX;
  const canvasY = y * state.zoom + state.panY;

  // Then convert to screen space with display scale
  return {
    x: rect.left + canvasX * displayScale,
    y: rect.top + canvasY * displayScale
  };
}

/**
 * Transform a point from world space to frame-local space
 * Takes into account frame's position and rotation
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @param {object} frame - Frame shape object
 * @returns {{x: number, y: number}} Frame-local coordinates
 */
export function worldToFrameLocal(x, y, frame) {
  if (!frame || frame.type !== 'frame') return { x, y };

  const frameRotation = frame.rotation || 0;
  if (!frameRotation) return { x, y };

  // Frame center (rotation pivot)
  const frameCenterX = frame.x + frame.width / 2;
  const frameCenterY = frame.y + frame.height / 2;

  // Rotate point around frame center by negative frame rotation
  const cos = Math.cos(-frameRotation);
  const sin = Math.sin(-frameRotation);
  const dx = x - frameCenterX;
  const dy = y - frameCenterY;

  return {
    x: frameCenterX + dx * cos - dy * sin,
    y: frameCenterY + dx * sin + dy * cos
  };
}

/**
 * Transform a point from frame-local space to world space
 * @param {number} x - Frame-local X coordinate
 * @param {number} y - Frame-local Y coordinate
 * @param {object} frame - Frame shape object
 * @returns {{x: number, y: number}} World coordinates
 */
export function frameLocalToWorld(x, y, frame) {
  if (!frame || frame.type !== 'frame') return { x, y };

  const frameRotation = frame.rotation || 0;
  if (!frameRotation) return { x, y };

  // Frame center (rotation pivot)
  const frameCenterX = frame.x + frame.width / 2;
  const frameCenterY = frame.y + frame.height / 2;

  // Rotate point around frame center by frame rotation
  const cos = Math.cos(frameRotation);
  const sin = Math.sin(frameRotation);
  const dx = x - frameCenterX;
  const dy = y - frameCenterY;

  return {
    x: frameCenterX + dx * cos - dy * sin,
    y: frameCenterY + dx * sin + dy * cos
  };
}

/**
 * Transform a delta (movement) from world space to frame-local space
 * @param {number} dx - World delta X
 * @param {number} dy - World delta Y
 * @param {object} frame - Frame shape object
 * @returns {{dx: number, dy: number}} Frame-local delta
 */
export function worldDeltaToFrameLocal(dx, dy, frame) {
  if (!frame || frame.type !== 'frame') return { dx, dy };

  const frameRotation = frame.rotation || 0;
  if (!frameRotation) return { dx, dy };

  // Rotate delta by negative frame rotation
  const cos = Math.cos(-frameRotation);
  const sin = Math.sin(-frameRotation);

  return {
    dx: dx * cos - dy * sin,
    dy: dx * sin + dy * cos
  };
}

/**
 * Get total rotation for a frame child (child rotation + frame rotation)
 * @param {object} child - Child shape
 * @param {object} frame - Parent frame
 * @returns {number} Total rotation in radians
 */
export function getTotalRotation(child, frame) {
  const childRotation = child?.rotation || 0;
  const frameRotation = frame?.rotation || 0;
  return childRotation + frameRotation;
}

/**
 * Rotate a point around a center point
 * @param {number} x - Point X
 * @param {number} y - Point Y
 * @param {number} angle - Rotation angle in radians
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @returns {{x: number, y: number}} Rotated point
 */
export function rotatePoint(x, y, angle, cx, cy) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos
  };
}

export default {
  screenToCanvas,
  canvasToScreen,
  worldToFrameLocal,
  frameLocalToWorld,
  worldDeltaToFrameLocal,
  getTotalRotation,
  rotatePoint
};
