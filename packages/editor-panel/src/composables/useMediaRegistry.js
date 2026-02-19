// editor/composables/useMediaRegistry.js
// Media registry composable for managing video/audio/image elements

import { ref } from 'vue';
import { getEditorState } from './useEditorState.js';
import { clearVideoFrameCache, copyVideoFrameCache } from '../renderer/shapes/media.js';

/**
 * Media registry composable
 * Manages lifecycle of media elements (video, audio, image) for shapes
 */
export function useMediaRegistry() {
  const { state } = getEditorState();

  // Media element registry
  const registry = ref(new Map());

  /**
   * Register a media element for a shape
   * @param {string} shapeId - Shape ID
   * @param {HTMLElement} element - Media element (video, audio, img)
   * @param {string} src - Source URL (for blob URL cleanup)
   * @param {string} type - Media type ('video', 'audio', 'image')
   */
  function registerMediaElement(shapeId, element, src, type) {
    if (!shapeId || !element) return false;

    // Handle legacy 3-arg calls: (shapeId, element, type)
    // vs new 4-arg calls: (shapeId, element, src, type)
    let actualSrc = src;
    let actualType = type;
    if (typeof src === 'string' && !type) {
      // 3-arg call: src is actually type
      actualType = src;
      actualSrc = element.src || '';
    }

    registry.value.set(shapeId, {
      element,
      src: actualSrc,
      type: actualType,
      registeredAt: Date.now(),
    });

    // Also set on shape for direct access
    const shape = state.shapes.find(s => s.id === shapeId);
    if (shape) {
      if (actualType === 'video') {
        shape.videoElement = element;
        shape.src = actualSrc;
      } else if (actualType === 'audio') {
        shape.audioElement = element;
        shape.src = actualSrc;
      } else if (actualType === 'image') {
        shape.imageElement = element;
        shape.src = actualSrc;
      }
    }

    return true;
  }

  /**
   * Get media element for a shape
   */
  function getMediaElement(shapeId) {
    // Check registry first
    const entry = registry.value.get(shapeId);
    if (entry) {
      return entry.element;
    }

    // Fall back to shape properties
    const shape = state.shapes.find(s => s.id === shapeId);
    if (shape) {
      return shape.videoElement || shape.audioElement || shape.imageElement || null;
    }

    return null;
  }

  /**
   * Unregister media element for a shape
   */
  function unregisterMediaElement(shapeId) {
    const entry = registry.value.get(shapeId);
    if (entry) {
      // Clean up the element
      const element = entry.element;
      if (element) {
        if (element.pause) {
          element.pause();
        }
        if (element.src) {
          // Revoke blob URLs
          if (element.src.startsWith('blob:')) {
            URL.revokeObjectURL(element.src);
          }
          element.src = '';
        }
        element.remove?.();
      }

      registry.value.delete(shapeId);
    }

    // Clear video frame cache for this shape
    clearVideoFrameCache(shapeId);

    // Also clear from shape
    const shape = state.shapes.find(s => s.id === shapeId);
    if (shape) {
      delete shape.videoElement;
      delete shape.audioElement;
      delete shape.imageElement;
    }

    return true;
  }

  /**
   * Relink media elements after undo/redo or JSON import
   */
  function relinkMediaElements() {
    state.shapes.forEach(shape => {
      if (shape.type === 'video' || shape.type === 'audio' || shape.type === 'image') {
        const element = getMediaElement(shape.id);

        if (!element && shape.src) {
          // Recreate element from source
          createMediaElement(shape);
        } else if (element) {
          // Update shape reference
          if (shape.type === 'video') {
            shape.videoElement = element;
          } else if (shape.type === 'audio') {
            shape.audioElement = element;
          } else if (shape.type === 'image') {
            shape.imageElement = element;
          }
        }
      }
    });
  }

  /**
   * Create media element from shape source
   */
  function createMediaElement(shape) {
    if (!shape.src) return null;

    let element = null;

    if (shape.type === 'video') {
      element = document.createElement('video');
      element.src = shape.src;
      element.crossOrigin = 'anonymous';
      element.preload = 'auto';
      element.muted = shape.muted || false;
      element.volume = (shape.volume ?? 100) / 100;
      element.playbackRate = shape.playbackRate || 1;

      // Add to hidden container
      const container = getMediaContainer();
      container.appendChild(element);

      shape.videoElement = element;

    } else if (shape.type === 'audio') {
      element = document.createElement('audio');
      element.src = shape.src;
      element.crossOrigin = 'anonymous';
      element.preload = 'auto';
      element.muted = shape.muted || false;
      element.volume = (shape.volume ?? 100) / 100;
      element.playbackRate = shape.playbackRate || 1;

      // Add to hidden container
      const container = getMediaContainer();
      container.appendChild(element);

      shape.audioElement = element;

    } else if (shape.type === 'image') {
      element = new Image();
      element.src = shape.src;
      element.crossOrigin = 'anonymous';

      shape.imageElement = element;
    }

    if (element) {
      registerMediaElement(shape.id, element, shape.src, shape.type);
    }

    return element;
  }

  /**
   * Clone media element for shape duplication
   */
  function cloneMediaElement(sourceShape, newShapeId) {
    const sourceElement = getMediaElement(sourceShape.id);
    if (!sourceElement) return null;

    let clonedElement = null;

    if (sourceShape.type === 'video') {
      clonedElement = document.createElement('video');
      clonedElement.src = sourceElement.src || sourceShape.src;
      clonedElement.crossOrigin = 'anonymous';
      clonedElement.preload = 'auto';
      clonedElement.muted = sourceShape.muted || false;
      clonedElement.volume = (sourceShape.volume ?? 100) / 100;
      clonedElement.playbackRate = sourceShape.playbackRate || 1;

      // Add to hidden container
      const container = getMediaContainer();
      container.appendChild(clonedElement);

    } else if (sourceShape.type === 'audio') {
      clonedElement = document.createElement('audio');
      clonedElement.src = sourceElement.src || sourceShape.src;
      clonedElement.crossOrigin = 'anonymous';
      clonedElement.preload = 'auto';
      clonedElement.muted = sourceShape.muted || false;
      clonedElement.volume = (sourceShape.volume ?? 100) / 100;
      clonedElement.playbackRate = sourceShape.playbackRate || 1;

      // Add to hidden container
      const container = getMediaContainer();
      container.appendChild(clonedElement);

    } else if (sourceShape.type === 'image') {
      clonedElement = new Image();
      clonedElement.src = sourceElement.src || sourceShape.src;
      clonedElement.crossOrigin = 'anonymous';
    }

    if (clonedElement) {
      const src = clonedElement.src || sourceShape.src;
      registerMediaElement(newShapeId, clonedElement, src, sourceShape.type);
    }

    return clonedElement;
  }

  /**
   * Get or create hidden media container
   */
  function getMediaContainer() {
    let container = document.getElementById('hidden-media-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'hidden-media-container';
      container.style.cssText = 'position: absolute; left: -9999px; top: -9999px; visibility: hidden; pointer-events: none;';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Cleanup orphaned media elements (not referenced by any shape)
   */
  function cleanupOrphanedMedia() {
    const shapeIds = new Set(state.shapes.map(s => s.id));
    const orphanedIds = [];

    registry.value.forEach((entry, shapeId) => {
      if (!shapeIds.has(shapeId)) {
        orphanedIds.push(shapeId);
      }
    });

    orphanedIds.forEach(id => {
      unregisterMediaElement(id);
    });

    return orphanedIds.length;
  }

  /**
   * Pause all media elements
   */
  function pauseAllMedia() {
    registry.value.forEach((entry) => {
      if (entry.element && entry.element.pause) {
        entry.element.pause();
      }
    });

    // Also check shape references
    state.shapes.forEach(shape => {
      if (shape.videoElement && shape.videoElement.pause) {
        shape.videoElement.pause();
      }
      if (shape.audioElement && shape.audioElement.pause) {
        shape.audioElement.pause();
      }
    });
  }

  /**
   * Preload all media elements
   */
  function preloadAllMedia() {
    const promises = [];

    state.shapes.forEach(shape => {
      if (shape.type === 'video' || shape.type === 'audio' || shape.type === 'image') {
        const element = getMediaElement(shape.id);
        if (element) {
          if (shape.type === 'image') {
            if (!element.complete) {
              promises.push(new Promise(resolve => {
                element.onload = resolve;
                element.onerror = resolve;
              }));
            }
          } else {
            // Video/audio
            if (element.readyState < 3) {
              promises.push(new Promise(resolve => {
                element.oncanplay = resolve;
                element.onerror = resolve;
              }));
            }
          }
        }
      }
    });

    return Promise.all(promises);
  }

  /**
   * Get media duration for a shape
   */
  function getMediaDuration(shapeId) {
    const element = getMediaElement(shapeId);
    if (!element) return 0;

    if (element.duration && isFinite(element.duration)) {
      return element.duration;
    }

    // Check shape properties
    const shape = state.shapes.find(s => s.id === shapeId);
    if (shape) {
      return shape.videoDuration || shape.audioDuration || 0;
    }

    return 0;
  }

  /**
   * Get current time of media element
   */
  function getMediaCurrentTime(shapeId) {
    const element = getMediaElement(shapeId);
    if (!element || !element.currentTime) return 0;
    return element.currentTime;
  }

  /**
   * Set current time of media element
   */
  function setMediaCurrentTime(shapeId, time) {
    const element = getMediaElement(shapeId);
    if (!element) return false;

    try {
      element.currentTime = time;
      return true;
    } catch (e) {
      console.warn('Failed to seek media:', e);
      return false;
    }
  }

  /**
   * Get registry size
   */
  function getRegistrySize() {
    return registry.value.size;
  }

  /**
   * Get all registered shape IDs
   */
  function getRegisteredShapeIds() {
    return Array.from(registry.value.keys());
  }

  // Expose functions globally for legacy code and other composables
  window.registerMediaElement = registerMediaElement;
  window.getMediaElement = getMediaElement;
  window.unregisterMediaElement = unregisterMediaElement;
  window.relinkMediaElements = relinkMediaElements;
  window.createMediaElement = createMediaElement;
  window.cloneMediaElement = cloneMediaElement;
  window.cleanupOrphanedMedia = cleanupOrphanedMedia;
  window.copyVideoFrameCache = copyVideoFrameCache;
  window._mediaRegistry = registry;

  return {
    // State
    registry,

    // Methods
    registerMediaElement,
    getMediaElement,
    unregisterMediaElement,
    relinkMediaElements,
    createMediaElement,
    cloneMediaElement,
    getMediaContainer,
    cleanupOrphanedMedia,
    pauseAllMedia,
    preloadAllMedia,
    getMediaDuration,
    getMediaCurrentTime,
    setMediaCurrentTime,
    getRegistrySize,
    getRegisteredShapeIds,
  };
}

// Singleton instance
let mediaRegistryInstance = null;

/**
 * Get or create media registry instance
 */
export function getMediaRegistry() {
  if (!mediaRegistryInstance) {
    mediaRegistryInstance = useMediaRegistry();
  }
  return mediaRegistryInstance;
}

export default useMediaRegistry;
