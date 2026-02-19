// editor/utils/media.js
// Media element registry and utilities
// Handles video, audio, and image elements that can't be serialized to JSON

/**
 * Media element registry
 * Stores media elements separately from shapes since DOM elements can't be serialized
 */
const mediaRegistry = new Map();

// Also expose on window for legacy code compatibility during migration
if (typeof window !== 'undefined') {
  window._mediaRegistry = mediaRegistry;

  // Expose cloneMediaElement globally so legacy duplicateSelected etc. use the improved version
  // This ensures onload handlers are added for re-rendering
  window.cloneMediaElement = function(shape, newShapeId) {
    // Import dynamically to avoid circular dependency issues
    const src = shape.src;
    if (!src) return null;

    const lookupId = shape._originalId || shape.id;

    if (shape.type === 'image') {
      const originalElement = shape.imageElement || mediaRegistry.get(lookupId)?.element;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (typeof window.render === 'function') {
          window.render();
        }
      };
      if (originalElement && originalElement.complete && originalElement.naturalWidth > 0) {
        img.src = originalElement.src || src;
      } else {
        img.src = src;
      }
      mediaRegistry.set(newShapeId, { element: img, src, type: 'image' });
      return img;
    }

    if (shape.type === 'video') {
      const originalElement = shape.videoElement || mediaRegistry.get(lookupId)?.element;
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.onloadeddata = () => {
        if (typeof window.render === 'function') {
          window.render();
        }
      };
      video.src = (originalElement && originalElement.currentSrc) || src;
      mediaRegistry.set(newShapeId, { element: video, src, type: 'video' });
      return video;
    }

    if (shape.type === 'audio') {
      const originalElement = shape.audioElement || mediaRegistry.get(lookupId)?.element;
      const audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.onloadeddata = () => {
        if (typeof window.render === 'function') {
          window.render();
        }
      };
      audio.src = (originalElement && originalElement.currentSrc) || src;
      mediaRegistry.set(newShapeId, { element: audio, src, type: 'audio' });
      return audio;
    }

    return null;
  };
}

/**
 * Register a media element for a shape
 * @param {string} shapeId - Shape ID
 * @param {HTMLElement} element - Media element (img, video, audio)
 * @param {string} src - Source URL
 * @param {string} type - Media type ('image', 'video', 'audio')
 */
export function registerMediaElement(shapeId, element, src, type) {
  mediaRegistry.set(shapeId, { element, src, type });
}

/**
 * Get a media element by shape ID
 * @param {string} shapeId - Shape ID
 * @returns {HTMLElement|null} Media element or null
 */
export function getMediaElement(shapeId) {
  const entry = mediaRegistry.get(shapeId);
  return entry ? entry.element : null;
}

/**
 * Get media entry by shape ID (includes src and type)
 * @param {string} shapeId - Shape ID
 * @returns {{element: HTMLElement, src: string, type: string}|null}
 */
export function getMediaEntry(shapeId) {
  return mediaRegistry.get(shapeId) || null;
}

/**
 * Unregister a media element
 * @param {string} shapeId - Shape ID
 */
export function unregisterMediaElement(shapeId) {
  const entry = mediaRegistry.get(shapeId);
  if (entry) {
    // Pause media if applicable
    if (entry.element && typeof entry.element.pause === 'function') {
      entry.element.pause();
    }
    // Revoke blob URL if applicable
    if (entry.src && entry.src.startsWith('blob:')) {
      URL.revokeObjectURL(entry.src);
    }
    mediaRegistry.delete(shapeId);
  }
}

/**
 * Re-link media elements to shapes after undo/redo
 * Restores element references from registry after JSON parse
 * @param {array} shapes - Array of shapes to relink
 */
export function relinkMediaElements(shapes) {
  shapes.forEach(shape => {
    if (shape.type === 'video' || shape.type === 'audio') {
      const entry = mediaRegistry.get(shape.id);
      if (entry) {
        if (shape.type === 'video') {
          shape.videoElement = entry.element;
          shape.src = entry.src;
        } else if (shape.type === 'audio') {
          shape.audioElement = entry.element;
          shape.src = entry.src;
        }
      }
    } else if (shape.type === 'image') {
      const entry = mediaRegistry.get(shape.id);
      if (entry) {
        shape.imageElement = entry.element;
        shape.src = entry.src;
      }
    }

    // Handle frame children
    if (shape.type === 'frame' && shape.children) {
      relinkMediaElements(shape.children);
    }
  });
}

/**
 * Check if an element is a valid HTMLImageElement
 * @param {*} el - Element to check
 * @returns {boolean}
 */
export function isValidImageElement(el) {
  return typeof HTMLImageElement !== 'undefined' && el instanceof HTMLImageElement;
}

/**
 * Reload images that have src but missing/invalid imageElement
 * Called after undo/redo or JSON import
 * @param {array} shapes - Array of shapes to check
 * @param {function} onRender - Callback to trigger render after load
 */
export function reloadShapeImages(shapes, onRender) {
  function reloadImage(shape) {
    if (shape.type === 'image' && shape.src && !isValidImageElement(shape.imageElement)) {
      const img = new Image();
      img.onload = () => {
        shape.imageElement = img;
        // Register in media registry
        registerMediaElement(shape.id, img, shape.src, 'image');
        if (onRender) onRender();
      };
      img.src = shape.src;
    }
  }

  shapes.forEach(shape => {
    reloadImage(shape);
    // Also check children (for frames and groups)
    if (shape.children) {
      shape.children.forEach(child => reloadImage(child));
    }
  });
}

/**
 * Clean up media elements that no longer have corresponding shapes
 * @param {array} shapes - Current array of shapes
 */
export function cleanupOrphanedMedia(shapes) {
  // Collect all shape IDs including children
  const collectIds = (shapeList) => {
    const ids = new Set();
    shapeList.forEach(shape => {
      ids.add(shape.id);
      if (shape.children) {
        shape.children.forEach(child => ids.add(child.id));
      }
    });
    return ids;
  };

  const currentShapeIds = collectIds(shapes);
  const orphanedIds = [];

  mediaRegistry.forEach((entry, shapeId) => {
    if (!currentShapeIds.has(shapeId)) {
      orphanedIds.push(shapeId);
    }
  });

  orphanedIds.forEach(id => {
    unregisterMediaElement(id);
  });
}

/**
 * Clone a media element for a duplicated shape
 * @param {object} shape - Original shape (may have _originalId from clipboard)
 * @param {string} newShapeId - New shape ID
 * @returns {HTMLElement|null} Cloned element or null
 */
export function cloneMediaElement(shape, newShapeId) {
  const src = shape.src;
  if (!src) return null;

  // Use _originalId if available (from clipboard), otherwise use shape.id
  const lookupId = shape._originalId || shape.id;

  if (shape.type === 'image') {
    // Try to get the original element from registry or shape
    const originalElement = shape.imageElement || getMediaElement(lookupId);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Add onload handler to trigger re-render when image loads
    img.onload = () => {
      if (typeof window.render === 'function') {
        window.render();
      }
    };

    // If we have a loaded original element, copy from it for immediate display
    if (originalElement && originalElement.complete && originalElement.naturalWidth > 0) {
      img.src = originalElement.src || src;
    } else {
      img.src = src;
    }

    // Register immediately so it's available for rendering
    registerMediaElement(newShapeId, img, src, 'image');

    return img;
  }

  if (shape.type === 'video') {
    // Try to get the original element from registry or shape
    const originalElement = shape.videoElement || getMediaElement(lookupId);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    // Add loadeddata handler to trigger re-render when video is ready
    video.onloadeddata = () => {
      if (typeof window.render === 'function') {
        window.render();
      }
    };

    // Use original element's currentSrc if available
    video.src = (originalElement && originalElement.currentSrc) || src;

    // Register immediately
    registerMediaElement(newShapeId, video, src, 'video');

    return video;
  }

  if (shape.type === 'audio') {
    // Try to get the original element from registry or shape
    const originalElement = shape.audioElement || getMediaElement(lookupId);

    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';

    // Add loadeddata handler (audio doesn't need render, but for consistency)
    audio.onloadeddata = () => {
      if (typeof window.render === 'function') {
        window.render();
      }
    };

    // Use original element's currentSrc if available
    audio.src = (originalElement && originalElement.currentSrc) || src;

    // Register immediately
    registerMediaElement(newShapeId, audio, src, 'audio');

    return audio;
  }

  return null;
}

/**
 * Get all registered media entries
 * @returns {Map} The media registry
 */
export function getMediaRegistry() {
  return mediaRegistry;
}

/**
 * Clear all media entries
 */
export function clearMediaRegistry() {
  mediaRegistry.forEach((entry, shapeId) => {
    unregisterMediaElement(shapeId);
  });
}

// ==================== Stream Registry ====================
// Separate registry for live MediaStream objects (screen/webcam capture)

const streamRegistry = new Map();

/**
 * Register a live MediaStream for a capture shape
 * @param {string} shapeId - Shape ID
 * @param {MediaStream} stream - Live MediaStream
 */
export function registerStreamElement(shapeId, stream) {
  streamRegistry.set(shapeId, stream);
}

/**
 * Get a live MediaStream by shape ID
 * @param {string} shapeId - Shape ID
 * @returns {MediaStream|null} MediaStream or null
 */
export function getStreamElement(shapeId) {
  return streamRegistry.get(shapeId) || null;
}

/**
 * Unregister a stream element and stop its tracks
 * @param {string} shapeId - Shape ID
 */
export function unregisterStreamElement(shapeId) {
  const stream = streamRegistry.get(shapeId);
  if (stream) {
    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
    streamRegistry.delete(shapeId);
  }
}

/**
 * Get all registered stream entries
 * @returns {Map} The stream registry
 */
export function getStreamRegistry() {
  return streamRegistry;
}

/**
 * Clear all stream entries
 */
export function clearStreamRegistry() {
  streamRegistry.forEach((stream, shapeId) => {
    unregisterStreamElement(shapeId);
  });
}

export default {
  registerMediaElement,
  getMediaElement,
  getMediaEntry,
  unregisterMediaElement,
  relinkMediaElements,
  reloadShapeImages,
  cleanupOrphanedMedia,
  cloneMediaElement,
  isValidImageElement,
  getMediaRegistry,
  clearMediaRegistry,
  // Stream registry
  registerStreamElement,
  getStreamElement,
  unregisterStreamElement,
  getStreamRegistry,
  clearStreamRegistry
};
