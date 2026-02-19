// renderer/shapes/media.js
// Image and video shape rendering

// Cache for last valid video frames (used when video is seeking/not ready)
// Map<shapeId, { canvas: OffscreenCanvas, width: number, height: number, time: number, cropX, cropY, cropWidth, cropHeight }>
const videoFrameCache = new Map();

/**
 * Cache the current video frame for a shape
 * @param {string} shapeId - Shape ID
 * @param {HTMLVideoElement} video - Video element
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @param {number} [cropX] - Crop X offset in source coordinates
 * @param {number} [cropY] - Crop Y offset in source coordinates
 * @param {number} [cropWidth] - Crop width in source coordinates
 * @param {number} [cropHeight] - Crop height in source coordinates
 */
function cacheVideoFrame(shapeId, video, width, height, cropX, cropY, cropWidth, cropHeight) {
  try {
    let cached = videoFrameCache.get(shapeId);

    // Check if cache needs to be invalidated (size changed OR crop params changed)
    const needsNewCanvas = !cached ||
      cached.width !== width ||
      cached.height !== height ||
      cached.cropX !== cropX ||
      cached.cropY !== cropY ||
      cached.cropWidth !== cropWidth ||
      cached.cropHeight !== cropHeight;

    if (needsNewCanvas) {
      // Use OffscreenCanvas if available, fallback to regular canvas
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas');
      if (!(canvas instanceof OffscreenCanvas)) {
        canvas.width = width;
        canvas.height = height;
      }
      cached = {
        canvas, width, height, time: -1,
        cropX, cropY, cropWidth, cropHeight
      };
      videoFrameCache.set(shapeId, cached);
    }

    // Only update if video time changed significantly (avoid redundant copies)
    if (Math.abs(video.currentTime - cached.time) > 0.01) {
      const cacheCtx = cached.canvas.getContext('2d');
      if (cropX !== undefined && cropWidth !== undefined) {
        // Cache the cropped region, scaled to display size
        cacheCtx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
      } else {
        cacheCtx.drawImage(video, 0, 0, width, height);
      }
      cached.time = video.currentTime;
    }
  } catch (e) {
    // Silently fail - caching is optional optimization
  }
}

/**
 * Get cached video frame for a shape
 * @param {string} shapeId - Shape ID
 * @returns {OffscreenCanvas|HTMLCanvasElement|null} Cached canvas or null
 */
function getCachedVideoFrame(shapeId) {
  const cached = videoFrameCache.get(shapeId);
  return cached ? cached.canvas : null;
}

/**
 * Clear cached video frame for a shape
 * @param {string} shapeId - Shape ID
 */
export function clearVideoFrameCache(shapeId) {
  videoFrameCache.delete(shapeId);
}

/**
 * Clear all cached video frames
 */
export function clearAllVideoFrameCache() {
  videoFrameCache.clear();
}

/**
 * Copy cached video frame from one shape to another
 * Useful when splitting clips to avoid loading placeholder on new clip
 * @param {string} sourceId - Source shape ID
 * @param {string} targetId - Target shape ID
 */
export function copyVideoFrameCache(sourceId, targetId) {
  const cached = videoFrameCache.get(sourceId);
  if (cached) {
    // Create a copy of the cached canvas for the new shape
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(cached.width, cached.height)
      : document.createElement('canvas');
    if (!(canvas instanceof OffscreenCanvas)) {
      canvas.width = cached.width;
      canvas.height = cached.height;
    }
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cached.canvas, 0, 0);
    videoFrameCache.set(targetId, {
      canvas,
      width: cached.width,
      height: cached.height,
      time: cached.time,
      cropX: cached.cropX,
      cropY: cached.cropY,
      cropWidth: cached.cropWidth,
      cropHeight: cached.cropHeight
    });
  }
}

/**
 * Get corner radii for a shape, supporting both uniform and individual corners
 * @param {Object} shape - Shape data
 * @param {number} maxRadius - Maximum allowed radius
 * @returns {Object|null} Radii object { tl, tr, br, bl } or null if no radius
 */
function getCornerRadii(shape, maxRadius) {
  if (shape.cornerRadii) {
    return {
      tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
      tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
      br: Math.min(shape.cornerRadii.br || 0, maxRadius),
      bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
    };
  } else if (typeof shape.cornerRadius === 'number' && shape.cornerRadius > 0) {
    const r = Math.min(shape.cornerRadius, maxRadius);
    return { tl: r, tr: r, br: r, bl: r };
  }
  return null;
}

/**
 * Create a rounded rectangle path for clipping
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {Object} radii - Corner radii { tl, tr, br, bl }
 */
function createRoundedRectPath(ctx, x, y, w, h, radii) {
  ctx.beginPath();
  ctx.moveTo(x + radii.tl, y);
  ctx.lineTo(x + w - radii.tr, y);
  if (radii.tr > 0) {
    ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
  }
  ctx.lineTo(x + w, y + h - radii.br);
  if (radii.br > 0) {
    ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
  }
  ctx.lineTo(x + radii.bl, y + h);
  if (radii.bl > 0) {
    ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
  }
  ctx.lineTo(x, y + radii.tl);
  if (radii.tl > 0) {
    ctx.quadraticCurveTo(x, y, x + radii.tl, y);
  }
  ctx.closePath();
}

/**
 * Draw an image shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawImage(ctx, shape, options = {}) {
  const { strokeLineDash } = options;

  if (shape.imageElement && shape.imageElement.complete) {
    const imgWidth = shape.width || shape.imageElement.naturalWidth;
    const imgHeight = shape.height || shape.imageElement.naturalHeight;

    // Check for corner radius
    const maxRadius = Math.min(imgWidth / 2, imgHeight / 2);
    const radii = getCornerRadii(shape, maxRadius);
    const hasCornerRadius = radii && (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0);

    if (hasCornerRadius) {
      ctx.save();
      createRoundedRectPath(ctx, shape.x, shape.y, imgWidth, imgHeight, radii);
      ctx.clip();
    }

    // Check if image has crop applied
    if (shape.cropX !== undefined && shape.cropWidth !== undefined) {
      // Draw cropped image
      ctx.drawImage(
        shape.imageElement,
        shape.cropX, shape.cropY, shape.cropWidth, shape.cropHeight,
        shape.x, shape.y, imgWidth, imgHeight
      );
    } else {
      // Draw full image
      ctx.drawImage(shape.imageElement, shape.x, shape.y, imgWidth, imgHeight);
    }

    if (hasCornerRadius) {
      ctx.restore();
    }

    // Only draw border if shape explicitly has a stroke color set
    if (shape.strokeColor && shape.strokeColor !== 'transparent') {
      ctx.strokeStyle = shape.strokeColor;
      ctx.lineWidth = shape.lineWidth || 1;
      if (strokeLineDash) ctx.setLineDash(strokeLineDash);
      if (hasCornerRadius) {
        createRoundedRectPath(ctx, shape.x, shape.y, imgWidth, imgHeight, radii);
        ctx.stroke();
      } else {
        ctx.strokeRect(shape.x, shape.y, imgWidth, imgHeight);
      }
    }
  } else if (shape.src) {
    // Image not loaded yet, draw placeholder
    const imgWidth = shape.width || 100;
    const imgHeight = shape.height || 100;

    // Check for corner radius on placeholder too
    const maxRadius = Math.min(imgWidth / 2, imgHeight / 2);
    const radii = getCornerRadii(shape, maxRadius);
    const hasCornerRadius = radii && (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0);

    if (hasCornerRadius) {
      ctx.save();
      createRoundedRectPath(ctx, shape.x, shape.y, imgWidth, imgHeight, radii);
      ctx.clip();
    }

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(shape.x, shape.y, imgWidth, imgHeight);

    if (hasCornerRadius) {
      ctx.restore();
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      createRoundedRectPath(ctx, shape.x, shape.y, imgWidth, imgHeight, radii);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.strokeRect(shape.x, shape.y, imgWidth, imgHeight);
    }

    // Loading text
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading...', shape.x + imgWidth / 2, shape.y + imgHeight / 2);
  }
}

/**
 * Draw a video loading placeholder with spinner
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {string} message - Loading message
 * @param {Object} radii - Optional corner radii { tl, tr, br, bl }
 */
function drawVideoLoadingPlaceholder(ctx, x, y, width, height, message = 'Loading...', radii = null) {
  const hasCornerRadius = radii && (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0);

  if (hasCornerRadius) {
    ctx.save();
    createRoundedRectPath(ctx, x, y, width, height, radii);
    ctx.clip();
  }

  // Dark background
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x, y, width, height);

  if (hasCornerRadius) {
    ctx.restore();
    // Border with rounded corners
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    createRoundedRectPath(ctx, x, y, width, height, radii);
    ctx.stroke();
  } else {
    // Border
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }

  const cx = x + width / 2;
  const cy = y + height / 2;

  // Draw spinning loader animation
  const spinnerRadius = Math.min(width, height) * 0.1;
  const spinnerLineWidth = Math.max(2, spinnerRadius * 0.3);
  const time = Date.now() / 1000;
  const startAngle = (time * 2) % (Math.PI * 2); // Rotate based on time

  // Draw spinner arc
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = spinnerLineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy - 15, spinnerRadius, startAngle, startAngle + Math.PI * 1.5);
  ctx.stroke();

  // Draw loading text below spinner
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${Math.max(10, Math.min(14, width * 0.05))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(message, cx, cy + spinnerRadius + 10);

  // Request re-render for animation
  if (typeof window.requestAnimationFrame === 'function' && typeof window.render === 'function') {
    // Only schedule if not already playing (to avoid excessive renders)
    if (!window._videoLoadingAnimationScheduled) {
      window._videoLoadingAnimationScheduled = true;
      requestAnimationFrame(() => {
        window._videoLoadingAnimationScheduled = false;
        if (typeof window.render === 'function') {
          window.render();
        }
      });
    }
  }
}

/**
 * Draw a video shape (single frame)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawVideo(ctx, shape, options = {}) {
  const { strokeLineDash } = options;

  if (shape.videoElement) {
    const vidWidth = shape.width || shape.videoElement.videoWidth || 100;
    const vidHeight = shape.height || shape.videoElement.videoHeight || 100;

    // Check for corner radius
    const maxRadius = Math.min(vidWidth / 2, vidHeight / 2);
    const radii = getCornerRadii(shape, maxRadius);
    const hasCornerRadius = radii && (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0);

    // Check if video is ready to draw
    const readyState = shape.videoElement.readyState;
    const isVideoReady = readyState >= 2; // HAVE_CURRENT_DATA or better

    // Determine what to draw: live video frame, cached frame, or placeholder
    let frameSource = null;
    let useCachedFrame = false;

    if (isVideoReady) {
      // Video is ready - use it directly and cache the frame
      frameSource = shape.videoElement;
      // Cache this frame for future use when seeking (supports cropped videos)
      if (shape.id) {
        cacheVideoFrame(
          shape.id,
          shape.videoElement,
          vidWidth,
          vidHeight,
          shape.cropX,
          shape.cropY,
          shape.cropWidth,
          shape.cropHeight
        );
      }
    } else if (shape.id) {
      // Video not ready - try to use cached frame
      frameSource = getCachedVideoFrame(shape.id);
      useCachedFrame = !!frameSource;
    }

    if (frameSource) {
      if (hasCornerRadius) {
        ctx.save();
        createRoundedRectPath(ctx, shape.x, shape.y, vidWidth, vidHeight, radii);
        ctx.clip();
      }

      if (useCachedFrame) {
        // Draw from cache (already at correct size)
        ctx.drawImage(frameSource, shape.x, shape.y, vidWidth, vidHeight);
      } else if (shape.cropX !== undefined && shape.cropWidth !== undefined) {
        // Draw cropped video
        ctx.drawImage(
          frameSource,
          shape.cropX, shape.cropY, shape.cropWidth, shape.cropHeight,
          shape.x, shape.y, vidWidth, vidHeight
        );
      } else {
        // Draw full video frame
        ctx.drawImage(frameSource, shape.x, shape.y, vidWidth, vidHeight);
      }

      if (hasCornerRadius) {
        ctx.restore();
      }

      // Only draw border if shape explicitly has a stroke color set
      if (shape.strokeColor && shape.strokeColor !== 'transparent') {
        ctx.strokeStyle = shape.strokeColor;
        ctx.lineWidth = shape.lineWidth || 1;
        if (strokeLineDash) ctx.setLineDash(strokeLineDash);
        if (hasCornerRadius) {
          createRoundedRectPath(ctx, shape.x, shape.y, vidWidth, vidHeight, radii);
          ctx.stroke();
        } else {
          ctx.strokeRect(shape.x, shape.y, vidWidth, vidHeight);
        }
      }
    } else {
      // No video frame available (neither live nor cached) - show loading placeholder
      drawVideoLoadingPlaceholder(ctx, shape.x, shape.y, vidWidth, vidHeight, 'Loading video...', radii);
    }
  } else if (shape.src) {
    // Video element not created yet, draw loading placeholder
    const vidWidth = shape.width || 100;
    const vidHeight = shape.height || 100;

    // Check for corner radius on placeholder too
    const maxRadius = Math.min(vidWidth / 2, vidHeight / 2);
    const radii = getCornerRadii(shape, maxRadius);

    drawVideoLoadingPlaceholder(ctx, shape.x, shape.y, vidWidth, vidHeight, 'Loading video...', radii);
  }
}

export default { drawImage, drawVideo, clearVideoFrameCache, clearAllVideoFrameCache, copyVideoFrameCache };
