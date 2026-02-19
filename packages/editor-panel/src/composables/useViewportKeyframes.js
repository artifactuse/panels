// composables/useViewportKeyframes.js
// Viewport keyframe management for camera animation during video playback
// Viewport keyframes are now stored as shapes with type: 'viewportKeyframe'

import { computed } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getVideoState } from './useVideoState.js';
import { generateId } from '../utils/shapes.js';

/**
 * Apply easing function to progress value
 * @param {number} t - Progress (0 to 1)
 * @param {string} easing - Easing type
 * @returns {number} Eased progress
 */
export function applyEasing(t, easing) {
  // Clamp t to 0-1
  t = Math.max(0, Math.min(1, t));

  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'ease':
      // CSS ease equivalent
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}

/**
 * Convert a viewport keyframe shape to the format used by interpolation
 * @param {Object} shape - Shape with type 'viewportKeyframe'
 * @returns {Object} Keyframe data { time, duration, zoom, panX, panY, easing }
 */
function shapeToKeyframe(shape) {
  return {
    time: shape.startTime || 0,
    duration: shape.duration || 0.5,
    zoom: shape.zoom ?? 1,
    panX: shape.panX ?? 0,
    panY: shape.panY ?? 0,
    easing: shape.easing || 'ease-in-out'
  };
}

/**
 * Interpolate viewport at given time
 * With duration support: viewport holds during keyframe duration,
 * then interpolates to the next keyframe
 * @param {Array} keyframes - Array of viewport keyframe data (not shapes)
 * @param {number} time - Current time in seconds
 * @param {number} defaultDuration - Default duration for keyframes without one
 * @returns {Object} Interpolated viewport { zoom, panX, panY }
 */
export function interpolateViewportAtTime(keyframes, time, defaultDuration = 0.5) {
  // No keyframes - return default viewport
  if (!keyframes || keyframes.length === 0) {
    return null;
  }

  // Helper to get keyframe end time
  const getKfEnd = (kf) => kf.time + (kf.duration || defaultDuration);

  // Single keyframe - return its values
  if (keyframes.length === 1) {
    return {
      zoom: keyframes[0].zoom,
      panX: keyframes[0].panX,
      panY: keyframes[0].panY
    };
  }

  // Before first keyframe
  if (time < keyframes[0].time) {
    return {
      zoom: keyframes[0].zoom,
      panX: keyframes[0].panX,
      panY: keyframes[0].panY
    };
  }

  // Check if we're within any keyframe's duration (hold viewport)
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const kfEnd = getKfEnd(kf);
    if (time >= kf.time && time <= kfEnd) {
      // Within this keyframe's duration - hold its viewport
      return {
        zoom: kf.zoom,
        panX: kf.panX,
        panY: kf.panY
      };
    }
  }

  // After last keyframe's end
  const lastKf = keyframes[keyframes.length - 1];
  const lastKfEnd = getKfEnd(lastKf);
  if (time >= lastKfEnd) {
    return {
      zoom: lastKf.zoom,
      panX: lastKf.panX,
      panY: lastKf.panY
    };
  }

  // We're in a gap between keyframes - find which gap and interpolate
  for (let i = 0; i < keyframes.length - 1; i++) {
    const prevKf = keyframes[i];
    const nextKf = keyframes[i + 1];
    const prevKfEnd = getKfEnd(prevKf);

    // Check if time is between end of prevKf and start of nextKf
    if (time > prevKfEnd && time < nextKf.time) {
      // Interpolate between prevKf's values and nextKf's values
      const gapDuration = nextKf.time - prevKfEnd;
      if (gapDuration <= 0) {
        return {
          zoom: prevKf.zoom,
          panX: prevKf.panX,
          panY: prevKf.panY
        };
      }

      const rawProgress = (time - prevKfEnd) / gapDuration;
      const easedProgress = applyEasing(rawProgress, prevKf.easing || 'ease-in-out');

      return {
        zoom: prevKf.zoom + (nextKf.zoom - prevKf.zoom) * easedProgress,
        panX: prevKf.panX + (nextKf.panX - prevKf.panX) * easedProgress,
        panY: prevKf.panY + (nextKf.panY - prevKf.panY) * easedProgress
      };
    }
  }

  // Fallback - return first keyframe values
  return {
    zoom: keyframes[0].zoom,
    panX: keyframes[0].panX,
    panY: keyframes[0].panY
  };
}

/**
 * Viewport keyframes composable
 * Manages camera animation keyframes for video playback
 * Keyframes are stored as shapes with type: 'viewportKeyframe'
 */
export function useViewportKeyframes() {
  const { state, config } = getEditorState();

  // Computed: get all viewport keyframe shapes sorted by startTime
  const viewportKeyframes = computed(() => {
    return state.shapes
      .filter(s => s.type === 'viewportKeyframe')
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  });

  // Computed: check if we have keyframes
  const hasViewportKeyframes = computed(() => {
    return viewportKeyframes.value.length > 0;
  });

  // Computed: currently selected viewport keyframe (if any)
  const activeKeyframe = computed(() => {
    if (state.selectedIndices.length !== 1) return null;
    const shape = state.shapes[state.selectedIndices[0]];
    return shape?.type === 'viewportKeyframe' ? shape : null;
  });

  /**
   * Add a viewport keyframe shape
   * @param {Object} keyframeData - Keyframe data (optional, defaults to current viewport/time)
   * @returns {number} Index of added shape
   */
  function addViewportKeyframe(keyframeData = null) {
    const defaultDuration = config.viewportKeyframes?.clipDuration || 0.5;
    const startTime = keyframeData?.time ?? state.currentTime;
    const duration = keyframeData?.duration ?? defaultDuration;

    // Check if keyframe already exists at this time (within tolerance)
    const tolerance = 0.01; // 10ms
    const existingShape = state.shapes.find(
      s => s.type === 'viewportKeyframe' && Math.abs((s.startTime || 0) - startTime) < tolerance
    );

    if (existingShape) {
      // Update existing keyframe at this time
      existingShape.zoom = keyframeData?.zoom ?? state.zoom ?? 1;
      existingShape.panX = keyframeData?.panX ?? state.panX ?? 0;
      existingShape.panY = keyframeData?.panY ?? state.panY ?? 0;
      existingShape.easing = keyframeData?.easing ?? config.viewportKeyframes?.defaultEasing ?? 'ease-in-out';

      // Select it
      const existingIndex = state.shapes.indexOf(existingShape);
      state.selectedIndices = [existingIndex];
      state.selectedFrameChildren = [];

      if (typeof window.render === 'function') {
        window.render();
      }
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }

      return existingIndex;
    }

    // Find available track
    const videoState = getVideoState();
    const trackId = videoState.findAvailableTrack(startTime, duration);

    // Create new viewport keyframe shape
    const shape = {
      id: generateId(),
      type: 'viewportKeyframe',
      name: 'Zoom/Pan',
      startTime: startTime,
      duration: duration,
      trackId: trackId,
      zoom: keyframeData?.zoom ?? state.zoom ?? 1,
      panX: keyframeData?.panX ?? state.panX ?? 0,
      panY: keyframeData?.panY ?? state.panY ?? 0,
      easing: keyframeData?.easing ?? config.viewportKeyframes?.defaultEasing ?? 'ease-in-out'
    };

    // Add to shapes
    state.shapes.push(shape);
    const newIndex = state.shapes.length - 1;

    // Select the new keyframe
    state.selectedIndices = [newIndex];
    state.selectedFrameChildren = [];

    // Re-render canvas to clear selection box
    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }
    if (typeof window.saveState === 'function') {
      window.saveState();
    }

    return newIndex;
  }

  /**
   * Get interpolated viewport at current time
   * @returns {Object|null} Interpolated viewport or null if no keyframes
   */
  function getViewportAtCurrentTime() {
    const keyframes = viewportKeyframes.value.map(shapeToKeyframe);
    return interpolateViewportAtTime(keyframes, state.currentTime);
  }

  /**
   * Get interpolated viewport at specific time
   * @param {number} time - Time in seconds
   * @returns {Object|null} Interpolated viewport or null if no keyframes
   */
  function getViewportAtTime(time) {
    const keyframes = viewportKeyframes.value.map(shapeToKeyframe);
    return interpolateViewportAtTime(keyframes, time);
  }

  /**
   * Clear all viewport keyframes
   */
  function clearAllKeyframes() {
    // Remove all viewport keyframe shapes
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      if (state.shapes[i].type === 'viewportKeyframe') {
        state.shapes.splice(i, 1);
      }
    }
    state.selectedIndices = [];

    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
    if (typeof window.saveState === 'function') {
      window.saveState();
    }
  }

  /**
   * Jump to keyframe time and apply its viewport
   * @param {Object} keyframeShape - The viewport keyframe shape
   */
  function jumpToKeyframe(keyframeShape) {
    if (!keyframeShape || keyframeShape.type !== 'viewportKeyframe') {
      return;
    }

    state.currentTime = keyframeShape.startTime || 0;
    state.zoom = keyframeShape.zoom ?? 1;
    state.panX = keyframeShape.panX ?? 0;
    state.panY = keyframeShape.panY ?? 0;

    // Select the keyframe
    const index = state.shapes.indexOf(keyframeShape);
    if (index >= 0) {
      state.selectedIndices = [index];
    }

    // Trigger seek if playback module available
    if (typeof window.seekTo === 'function') {
      window.seekTo(keyframeShape.startTime || 0);
    }
    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  return {
    // Computed
    viewportKeyframes,
    hasViewportKeyframes,
    activeKeyframe,

    // Methods
    addViewportKeyframe,
    getViewportAtCurrentTime,
    getViewportAtTime,
    clearAllKeyframes,
    jumpToKeyframe,

    // Expose utilities for external use
    interpolateViewportAtTime: (time) => {
      const keyframes = viewportKeyframes.value.map(shapeToKeyframe);
      return interpolateViewportAtTime(keyframes, time);
    },
    applyEasing
  };
}

// Singleton instance
let viewportKeyframesInstance = null;

/**
 * Get singleton instance of viewport keyframes composable
 */
export function getViewportKeyframes() {
  if (!viewportKeyframesInstance) {
    viewportKeyframesInstance = useViewportKeyframes();
  }
  return viewportKeyframesInstance;
}

export default useViewportKeyframes;
