/**
 * capture.js
 * Render live screen/webcam capture shapes on canvas
 */

import { getStreamElement } from '../../utils/media.js';
import { getEditorState } from '../../composables/useEditorState.js';

// Helper to get config from editor state
function getConfig() {
  const { config } = getEditorState();
  return config;
}

// Video element cache for stream rendering
const videoElementCache = new Map();

/**
 * Get or create a video element for a stream
 */
export function getVideoElement(shapeId) {
  if (videoElementCache.has(shapeId)) {
    return videoElementCache.get(shapeId);
  }

  const stream = getStreamElement(shapeId);
  if (!stream) return null;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.play().catch(() => {});

  videoElementCache.set(shapeId, video);
  return video;
}

/**
 * Remove cached video element
 */
export function removeCachedVideoElement(shapeId) {
  const video = videoElementCache.get(shapeId);
  if (video) {
    video.srcObject = null;
    videoElementCache.delete(shapeId);
  }
}

/**
 * Draw "No Signal" placeholder
 */
function drawPlaceholder(ctx, x, y, width, height, label = 'No Signal') {
  ctx.save();

  // Background
  ctx.fillStyle = '#374151';
  ctx.fillRect(x, y, width, height);

  // Text
  ctx.fillStyle = '#9ca3af';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + width / 2, y + height / 2);

  ctx.restore();
}

/**
 * Draw recording indicator (red dot)
 */
function drawRecordingIndicator(ctx, x, y, size = 12) {
  ctx.save();

  // Glow
  ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
  ctx.shadowBlur = 8;

  // Dot
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();

  ctx.restore();
}

/**
 * Draw screen capture shape
 */
export function drawScreenCapture(ctx, shape, options = {}, state = {}) {
  const {
    x = 0,
    y = 0,
    width = 1920,
    height = 1080,
    cornerRadius = 0,
    opacity = 100,
    isRecording = false,
  } = shape;

  const isSelected = options.isSelected || false;
  const config = getConfig();

  ctx.save();
  ctx.globalAlpha = opacity / 100;

  // Create clipping path for corner radius
  if (cornerRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, cornerRadius);
    ctx.clip();
  }

  // Get video element
  const video = getVideoElement(shape.id);

  if (video && video.readyState >= 2) {
    // Draw video frame
    ctx.drawImage(video, x, y, width, height);
  } else {
    // Draw placeholder
    drawPlaceholder(ctx, x, y, width, height, 'Waiting for screen share...');
  }

  ctx.restore();

  // Draw border when selected
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = config.theme?.colors?.selection || '#6366f1';
    ctx.lineWidth = 2;
    if (cornerRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, cornerRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
    ctx.restore();
  }

  // Draw recording indicator
  if (isRecording) {
    const indicatorSize = config.recording?.indicatorSize || 12;
    drawRecordingIndicator(ctx, x + 20, y + 20, indicatorSize);
  }
}

/**
 * Compute viewport-fixed position for webcam capture
 * Converts viewportMarginRight/Bottom to world coordinates based on current zoom/pan
 * @param {Object} shape - Webcam shape with viewportMarginRight/Bottom
 * @param {Object} state - Editor state with zoom, panX, panY
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {{x: number, y: number}} Computed world coordinates
 */
function computeViewportFixedPosition(shape, state, ctx) {
  const canvas = ctx.canvas;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const zoom = state.zoom || 1;
  const panX = state.panX || 0;
  const panY = state.panY || 0;
  const displayScale = state.canvasDisplayScale || 1;

  const width = shape.width || 320;
  const height = shape.height || 240;
  const marginRight = shape.viewportMarginRight ?? 24;
  const marginBottom = shape.viewportMarginBottom ?? 24;

  // Account for display scale - margins are in screen pixels
  const scaledMarginRight = marginRight * displayScale;
  const scaledMarginBottom = marginBottom * displayScale;
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;

  // Screen position (pixels from bottom-right corner of canvas)
  const screenX = canvasWidth - scaledWidth - scaledMarginRight;
  const screenY = canvasHeight - scaledHeight - scaledMarginBottom;

  // Convert screen position to world coordinates
  // Screen = World * zoom + pan
  // World = (Screen - pan) / zoom
  const worldX = (screenX - panX) / zoom;
  const worldY = (screenY - panY) / zoom;

  return { x: worldX, y: worldY };
}

/**
 * Draw webcam capture shape
 * Viewport-fixed: stays in same screen position regardless of pan/zoom.
 * Selectable, rotatable, croppable like a normal video shape.
 * Uses viewportMarginRight/Bottom for positioning relative to viewport edge.
 */
export function drawWebcamCapture(ctx, shape, options = {}, state = {}) {
  const {
    width = 320,
    height = 240,
    cornerRadius = 0,
    opacity = 100,
    isRecording = false,
    rotation = 0,
  } = shape;

  const config = getConfig();

  // Compute viewport-fixed position and update shape's x/y for hit-testing
  if (shape.viewportMarginRight !== undefined || shape.viewportMarginBottom !== undefined) {
    const pos = computeViewportFixedPosition(shape, state, ctx);
    shape.x = pos.x;
    shape.y = pos.y;
  }

  const x = shape.x ?? 0;
  const y = shape.y ?? 0;

  ctx.save();
  ctx.globalAlpha = opacity / 100;

  // Apply rotation around center (like video shape)
  if (rotation) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.translate(-centerX, -centerY);
  }

  // Create clipping path for corner radius
  if (cornerRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, cornerRadius);
    ctx.clip();
  }

  // Get video element from stream
  const video = getVideoElement(shape.id);

  if (video && video.readyState >= 2) {
    // Draw video frame (handle crop if specified)
    if (shape.cropX !== undefined && shape.cropWidth !== undefined) {
      ctx.drawImage(
        video,
        shape.cropX, shape.cropY, shape.cropWidth, shape.cropHeight,
        x, y, width, height
      );
    } else {
      ctx.drawImage(video, x, y, width, height);
    }
  } else {
    // Draw placeholder
    drawPlaceholder(ctx, x, y, width, height, 'Waiting for camera...');
  }

  ctx.restore();

  // Draw stroke if specified (like video shape)
  if (shape.strokeColor && shape.strokeColor !== 'transparent') {
    ctx.save();
    if (rotation) {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      ctx.translate(-centerX, -centerY);
    }
    ctx.strokeStyle = shape.strokeColor;
    ctx.lineWidth = shape.lineWidth || 1;
    if (cornerRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, cornerRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
    ctx.restore();
  }

}

export default {
  drawScreenCapture,
  drawWebcamCapture,
  removeCachedVideoElement,
  getVideoElement,
};
