// editor/composables/useVideoState.js
// Video mode state management composable

import { computed } from 'vue';
import { getEditorState } from './useEditorState.js';

// Unique ID counter to ensure track IDs are unique even when created in same millisecond
let trackIdCounter = 0;

/**
 * Video state composable for video mode specific state and operations
 */
export function useVideoState() {
  const { state, config } = getEditorState();

  // Video mode specific computed properties
  const isVideoMode = computed(() => state.videoMode === true);
  const currentTime = computed(() => state.currentTime || 0);
  const projectDuration = computed(() => state.projectDuration || config.video?.defaultDuration || 60);
  const fps = computed(() => state.fps || config.video?.fps || 30);
  const isPlaying = computed(() => state.isPlaying === true);

  // Screen presets
  const screenPresets = {
    '1080p': { width: 1920, height: 1080, label: '1080p (16:9)' },
    '720p': { width: 1280, height: 720, label: '720p (16:9)' },
    '4k': { width: 3840, height: 2160, label: '4K (16:9)' },
    'square': { width: 1080, height: 1080, label: 'Square (1:1)' },
    'portrait': { width: 1080, height: 1920, label: 'Portrait (9:16)' },
    'instagram': { width: 1080, height: 1350, label: 'Instagram (4:5)' },
  };

  /**
   * Get shapes visible at a specific time
   */
  function getShapesAtTime(time) {
    if (!isVideoMode.value) {
      return state.shapes;
    }

    return state.shapes.filter(shape => {
      // Shapes without timing are always visible
      if (shape.startTime === undefined && shape.duration === undefined) {
        return true;
      }

      const startTime = shape.startTime || 0;
      const endTime = startTime + (shape.duration || projectDuration.value);

      return time >= startTime && time < endTime;
    });
  }

  /**
   * Get timeline tracks
   */
  function getTracks() {
    if (!state.tracks) {
      state.tracks = [
        { id: 'track-1', name: 'Track 1', type: 'video' },
        { id: 'track-2', name: 'Track 2', type: 'video' },
        { id: 'audio-1', name: 'Audio 1', type: 'audio' },
      ];
    }
    return state.tracks;
  }

  /**
   * Add a new track
   */
  function addTrack(type = 'video') {
    const tracks = getTracks();
    const existingOfType = tracks.filter(t => t.type === type);
    const num = existingOfType.length + 1;
    const prefix = type === 'audio' ? 'Audio' : 'Track';

    const newTrack = {
      id: `${type}-${Date.now()}-${trackIdCounter++}`,
      name: `${prefix} ${num}`,
      type: type
    };

    tracks.push(newTrack);
    return newTrack;
  }

  /**
   * Remove a track
   */
  function removeTrack(trackId) {
    const tracks = getTracks();
    const index = tracks.findIndex(t => t.id === trackId);
    if (index > -1) {
      // Remove shapes on this track or reassign them
      state.shapes.forEach(shape => {
        if (shape.trackId === trackId) {
          shape.trackId = null;
        }
      });
      tracks.splice(index, 1);
    }
  }

  /**
   * Find an available track for a clip at given time and duration
   * @param {number} startTime - Start time in seconds
   * @param {number} duration - Duration in seconds
   * @param {string} type - Track type ('video' or 'audio'), optional
   * @returns {string} Track ID
   */
  function findAvailableTrack(startTime, duration, type = null) {
    const tracks = getTracks();
    const clipEnd = startTime + duration;

    for (const track of tracks) {
      // Skip locked tracks
      if (track.locked) continue;
      // Skip FX tracks (effects, filters, transitions go on FX tracks only)
      if (track.isFxTrack) continue;
      // If type specified, filter by track type
      if (type && track.type && track.type !== type) continue;

      // Check if any existing shape overlaps (including viewport keyframes which are now shapes)
      const hasOverlap = state.shapes.some(shape => {
        if (shape.trackId !== track.id) return false;
        if (shape.startTime === undefined) return false;

        const shapeStart = shape.startTime || 0;
        const shapeEnd = shapeStart + (shape.duration || 5);

        return !(clipEnd <= shapeStart || startTime >= shapeEnd);
      });

      if (!hasOverlap) {
        return track.id;
      }
    }

    // No available track, create a new one
    const newTrack = addTrack(type);
    return newTrack.id;
  }

  /**
   * Set current playback time
   */
  function setCurrentTime(time) {
    state.currentTime = Math.max(0, Math.min(time, projectDuration.value));

    // Sync media elements to new time
    if (typeof window.syncAllMediaToPlayhead === 'function') {
      window.syncAllMediaToPlayhead();
    }

    // Re-render
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Set project duration
   */
  function setProjectDuration(duration) {
    state.projectDuration = Math.max(1, duration);

    // Clamp current time if needed
    if (state.currentTime > state.projectDuration) {
      state.currentTime = state.projectDuration;
    }

    // Update timeline if available
    if (typeof window.updateTimelineRange === 'function') {
      window.updateTimelineRange();
    }
  }

  /**
   * Recalculate project duration based on clip positions
   * Auto-adjusts duration to match the furthest clip's end time
   */
  function recalculateProjectDuration() {
    // Find the furthest clip end time
    let maxEndTime = 0;

    for (const shape of state.shapes) {
      if (shape.startTime !== undefined) {
        const endTime = (shape.startTime || 0) + (shape.duration || 0);
        if (endTime > maxEndTime) {
          maxEndTime = endTime;
        }
      }
    }

    // Set minimum duration of 1 second if no clips
    const newDuration = Math.max(1, maxEndTime);

    if (newDuration !== state.projectDuration) {
      state.projectDuration = newDuration;

      // Clamp playhead if needed
      if (state.currentTime > newDuration) {
        state.currentTime = newDuration;
      }
    }

    // Update timeline UI with padding (always, even if projectDuration didn't change)
    // Timeline length = projectDuration + 30 seconds padding (minimum 60 seconds)
    const timelineLength = Math.max(60, newDuration + 30);
    if (typeof window.updateTimelineRange === 'function') {
      window.updateTimelineRange(timelineLength);
    }
  }

  // Expose recalculateProjectDuration globally
  window.recalculateProjectDuration = recalculateProjectDuration;

  /**
   * Apply a screen preset
   */
  function applyScreenPreset(presetName) {
    const preset = screenPresets[presetName];
    if (!preset) return;

    state.currentPreset = presetName;

    // Update canvas dimensions through config
    if (config.canvas) {
      config.canvas.width = preset.width;
      config.canvas.height = preset.height;
    }

    // Apply to canvas element
    if (typeof window.applyScreenPreset === 'function') {
      window.applyScreenPreset(presetName);
    }
  }

  /**
   * Get clip at specific time and track
   */
  function getClipAtTimeAndTrack(time, trackId) {
    return state.shapes.find(shape => {
      if (shape.trackId !== trackId) return false;

      const startTime = shape.startTime || 0;
      const endTime = startTime + (shape.duration || 5);

      return time >= startTime && time < endTime;
    });
  }

  /**
   * Move clip to new time
   */
  function moveClipToTime(shapeIndex, newStartTime) {
    const shape = state.shapes[shapeIndex];
    if (!shape) return;

    // Clamp to valid range
    const maxStart = projectDuration.value - (shape.duration || 5);
    shape.startTime = Math.max(0, Math.min(newStartTime, maxStart));

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  /**
   * Move clip to different track
   */
  function moveClipToTrack(shapeIndex, trackId) {
    const shape = state.shapes[shapeIndex];
    if (!shape) return;

    shape.trackId = trackId;

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  /**
   * Resize clip duration
   */
  function resizeClipDuration(shapeIndex, newDuration) {
    const shape = state.shapes[shapeIndex];
    if (!shape) return;

    // Clamp duration
    const startTime = shape.startTime || 0;
    const maxDuration = projectDuration.value - startTime;
    shape.duration = Math.max(0.1, Math.min(newDuration, maxDuration));

    // For media clips, also respect source duration
    if (shape.type === 'video' && shape.videoDuration) {
      shape.duration = Math.min(shape.duration, shape.videoDuration);
    }
    if (shape.type === 'audio' && shape.audioDuration) {
      shape.duration = Math.min(shape.duration, shape.audioDuration);
    }

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  /**
   * Split clip at current time
   */
  function splitClipAtTime(shapeIndex) {
    const shape = state.shapes[shapeIndex];
    if (!shape) return;

    const startTime = shape.startTime || 0;
    const endTime = startTime + (shape.duration || 5);

    // Can only split if playhead is within clip
    if (state.currentTime <= startTime || state.currentTime >= endTime) {
      return null;
    }

    // Calculate split point
    const firstDuration = state.currentTime - startTime;
    const secondDuration = endTime - state.currentTime;

    // Update first clip
    shape.duration = firstDuration;

    // Create second clip
    const secondClip = JSON.parse(JSON.stringify(shape));
    secondClip.id = 'shape_' + Date.now();
    secondClip.startTime = state.currentTime;
    secondClip.duration = secondDuration;

    // For media clips, adjust playback offset
    if (shape.type === 'video' || shape.type === 'audio') {
      secondClip.mediaStartOffset = (shape.mediaStartOffset || 0) + firstDuration;
    }

    state.shapes.push(secondClip);

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    if (typeof window.saveState === 'function') {
      window.saveState();
    }

    return state.shapes.length - 1;
  }

  /**
   * Get effect/filter defaults
   */
  function getEffectDefaults(type, id) {
    if (type === 'filter') {
      const defaults = {
        brightness: { min: 0, max: 200, default: 100 },
        contrast: { min: 0, max: 200, default: 100 },
        saturation: { min: 0, max: 200, default: 100 },
        hue: { min: 0, max: 360, default: 0 },
        grayscale: { min: 0, max: 100, default: 0 },
        sepia: { min: 0, max: 100, default: 0 },
        invert: { min: 0, max: 100, default: 0 },
        temperature: { min: -100, max: 100, default: 0 },
      };
      return defaults[id] || { min: 0, max: 100, default: 100 };
    }

    if (type === 'effect') {
      return {
        intensity: 100,
        ...(id === 'dropShadow' ? { offsetX: 5, offsetY: 5, blur: 10, color: 'rgba(0,0,0,0.5)' } : {}),
        ...(id === 'glow' ? { radius: 10, color: '#ffffff' } : {}),
        ...(id === 'vignette' ? { intensity: 50, radius: 50 } : {}),
        ...(id === 'blur' ? { radius: 5 } : {}),
        ...(id === 'grain' ? { amount: 30 } : {}),
        ...(id === 'glitch' ? { intensity: 50, frequency: 10 } : {}),
        ...(id === 'chromatic' ? { offset: 5 } : {}),
        ...(id === 'pixelate' ? { size: 10 } : {}),
      };
    }

    if (type === 'transition') {
      return {
        easing: 'ease-in-out',
        direction: id.includes('Left') ? 'left' : id.includes('Right') ? 'right' :
                   id.includes('Up') ? 'up' : id.includes('Down') ? 'down' : 'none',
      };
    }

    return {};
  }

  // NOTE: Global exports removed in Phase E.2
  // Legacy scripts (extensions.js) provide the actual implementations
  // with full video mode features

  return {
    // Computed
    isVideoMode,
    currentTime,
    projectDuration,
    fps,
    isPlaying,
    screenPresets,

    // Methods
    getShapesAtTime,
    getTracks,
    addTrack,
    removeTrack,
    findAvailableTrack,
    setCurrentTime,
    setProjectDuration,
    recalculateProjectDuration,
    applyScreenPreset,
    getClipAtTimeAndTrack,
    moveClipToTime,
    moveClipToTrack,
    resizeClipDuration,
    splitClipAtTime,
    getEffectDefaults
  };
}

// Singleton instance
let videoStateInstance = null;

/**
 * Get or create video state instance
 */
export function getVideoState() {
  if (!videoStateInstance) {
    videoStateInstance = useVideoState();
  }
  return videoStateInstance;
}

export default useVideoState;
