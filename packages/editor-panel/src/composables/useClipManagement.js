// editor/composables/useClipManagement.js
// Clip management composable for video timeline operations

import { getEditorState } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getVideoState } from './useVideoState.js';
import { generateId } from '../utils/shapes.js';

/**
 * Clip management composable
 * Provides clip operations: split, duplicate, trim, delete, etc.
 */
export function useClipManagement() {
  const { state, config } = getEditorState();
  const { saveState } = getHistory();

  /**
   * Split clip at current playhead position
   */
  function splitClipAtPlayhead(shapeIdOrIndex) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return null;

    const splitTime = state.currentTime;
    const startTime = shape.startTime || 0;
    const endTime = startTime + (shape.duration || 5);

    // Check if playhead is within the clip
    if (splitTime <= startTime || splitTime >= endTime) {
      console.warn('Playhead is not within the clip');
      return null;
    }

    const newId = generateId();

    // Calculate durations for both halves
    const firstDuration = splitTime - startTime;
    const secondDuration = endTime - splitTime;

    // Create second half
    const secondHalf = JSON.parse(JSON.stringify(shape));
    secondHalf.id = newId;
    secondHalf.name = (shape.name || shape.type) + ' (split)';
    secondHalf.startTime = splitTime;
    secondHalf.duration = secondDuration;

    // Adjust media start offset for the second half (for video/audio)
    if (shape.type === 'video' || shape.type === 'audio') {
      secondHalf.mediaStartOffset = (shape.mediaStartOffset || 0) + firstDuration;
    }

    // Clone media element if needed
    if (shape.type === 'video' || shape.type === 'audio' || shape.type === 'image') {
      if (typeof window.cloneMediaElement === 'function') {
        const clonedElement = window.cloneMediaElement(shape, newId);
        if (clonedElement) {
          if (shape.type === 'video') {
            secondHalf.videoElement = clonedElement;
            // Copy video frame cache to avoid loading placeholder on new clip
            if (typeof window.copyVideoFrameCache === 'function') {
              window.copyVideoFrameCache(shape.id, newId);
            }
          } else if (shape.type === 'audio') {
            secondHalf.audioElement = clonedElement;
          } else if (shape.type === 'image') {
            secondHalf.imageElement = clonedElement;
          }
        }
      }
    }

    // Modify first half
    shape.duration = firstDuration;

    // Add second half to shapes
    state.shapes.push(secondHalf);

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }

    return state.shapes.length - 1;
  }

  /**
   * Duplicate a clip
   */
  function duplicateClip(shapeIdOrIndex) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return null;

    const newId = generateId();

    // Clone the shape
    const newShape = JSON.parse(JSON.stringify(shape));
    newShape.id = newId;
    newShape.name = (shape.name || shape.type) + ' copy';

    // Place after original
    const newStartTime = (shape.startTime || 0) + (shape.duration || 5);
    const newDuration = shape.duration || 5;
    newShape.startTime = newStartTime;

    // Check for overlap on the same track and find available track if needed
    if (shape.trackId) {
      const hasOverlap = checkClipOverlap(newStartTime, newDuration, shape.trackId);
      if (hasOverlap) {
        // Find an available track using useVideoState's function
        const videoState = getVideoState();
        newShape.trackId = videoState.findAvailableTrack(newStartTime, newDuration, shape.type);
      }
    }

    // Clone media element if needed
    if (shape.type === 'video' || shape.type === 'audio' || shape.type === 'image') {
      if (typeof window.cloneMediaElement === 'function') {
        const clonedElement = window.cloneMediaElement(shape, newId);
        if (clonedElement) {
          if (shape.type === 'video') {
            newShape.videoElement = clonedElement;
          } else if (shape.type === 'audio') {
            newShape.audioElement = clonedElement;
          } else if (shape.type === 'image') {
            newShape.imageElement = clonedElement;
          }
        }
      }
    }

    state.shapes.push(newShape);

    // Select the new clip
    state.selectedIndices = [state.shapes.length - 1];

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Update playhead height to extend to new tracks
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }

    return state.shapes.length - 1;
  }

  /**
   * Delete a clip
   */
  function deleteClip(shapeIdOrIndex) {
    const index = typeof shapeIdOrIndex === 'number'
      ? shapeIdOrIndex
      : state.shapes.findIndex(s => s.id === shapeIdOrIndex);

    if (index < 0) return false;

    const shape = state.shapes[index];

    // Unregister media element if needed
    if (shape && (shape.type === 'video' || shape.type === 'audio' || shape.type === 'image')) {
      if (typeof window.unregisterMediaElement === 'function') {
        window.unregisterMediaElement(shape.id);
      }
    }

    // Remove from shapes
    state.shapes.splice(index, 1);

    // Update selection
    state.selectedIndices = state.selectedIndices
      .filter(i => i !== index)
      .map(i => i > index ? i - 1 : i);

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Clean up empty tracks after deletion
    if (typeof window.cleanUpEmptyTracks === 'function') {
      window.cleanUpEmptyTracks();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }

    return true;
  }

  /**
   * Trim clip start (set in-point)
   */
  function trimClipStart(shapeIdOrIndex, newStartTime) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    const currentStart = shape.startTime || 0;
    const currentEnd = currentStart + (shape.duration || 5);

    // Ensure new start is valid
    newStartTime = Math.max(0, Math.min(newStartTime, currentEnd - 0.1));

    // Calculate duration change
    const durationChange = newStartTime - currentStart;

    // Update shape
    shape.startTime = newStartTime;
    shape.duration = (shape.duration || 5) - durationChange;

    // For media clips, adjust media start offset
    if (shape.type === 'video' || shape.type === 'audio') {
      shape.mediaStartOffset = (shape.mediaStartOffset || 0) + durationChange;
    }

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Trim clip end (set out-point)
   */
  function trimClipEnd(shapeIdOrIndex, newEndTime) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    const currentStart = shape.startTime || 0;
    const maxDuration = state.projectDuration || 60;

    // Ensure new end is valid
    newEndTime = Math.max(currentStart + 0.1, Math.min(newEndTime, maxDuration));

    // Update duration
    shape.duration = newEndTime - currentStart;

    // For media clips, clamp to source duration
    if (shape.type === 'video' && shape.videoDuration) {
      const availableDuration = shape.videoDuration - (shape.mediaStartOffset || 0);
      shape.duration = Math.min(shape.duration, availableDuration);
    }
    if (shape.type === 'audio' && shape.audioDuration) {
      const availableDuration = shape.audioDuration - (shape.mediaStartOffset || 0);
      shape.duration = Math.min(shape.duration, availableDuration);
    }

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Move clip to new start time
   */
  function moveClipToTime(shapeIdOrIndex, newStartTime) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    const duration = shape.duration || 5;

    // Don't clamp to projectDuration - allow extending the timeline
    shape.startTime = Math.max(0, newStartTime);

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Move clip to different track
   */
  function moveClipToTrack(shapeIdOrIndex, trackId) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    // Verify track exists
    const trackExists = state.tracks.some(t => t.id === trackId);
    if (!trackExists) return false;

    shape.trackId = trackId;

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    saveState();

    return true;
  }

  /**
   * Set clip duration
   */
  function setClipDuration(shapeIdOrIndex, newDuration) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    // Don't clamp to projectDuration - allow extending the timeline
    shape.duration = Math.max(0.1, newDuration);

    // For media clips, respect source duration
    if (shape.type === 'video' && shape.videoDuration) {
      const availableDuration = shape.videoDuration - (shape.mediaStartOffset || 0);
      shape.duration = Math.min(shape.duration, availableDuration);
    }
    if (shape.type === 'audio' && shape.audioDuration) {
      const availableDuration = shape.audioDuration - (shape.mediaStartOffset || 0);
      shape.duration = Math.min(shape.duration, availableDuration);
    }

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Set clip speed/rate
   */
  function setClipSpeed(shapeIdOrIndex, speed) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    // Clamp speed to valid range and store as playbackRate
    shape.playbackRate = Math.max(0.1, Math.min(10, speed));

    // Update media element if playing
    if (shape.type === 'video' && shape.videoElement) {
      shape.videoElement.playbackRate = shape.playbackRate;
    }
    if (shape.type === 'audio' && shape.audioElement) {
      shape.audioElement.playbackRate = shape.playbackRate;
    }

    saveState();

    return true;
  }

  /**
   * Set clip volume
   */
  function setClipVolume(shapeIdOrIndex, volume) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    // Clamp volume to valid range (0-100)
    shape.volume = Math.max(0, Math.min(100, volume));

    // Update media element
    if (shape.type === 'video' && shape.videoElement) {
      shape.videoElement.volume = shape.volume / 100;
    }
    if (shape.type === 'audio' && shape.audioElement) {
      shape.audioElement.volume = shape.volume / 100;
    }

    saveState();

    return true;
  }

  /**
   * Toggle clip mute
   */
  function toggleClipMute(shapeIdOrIndex) {
    const shape = typeof shapeIdOrIndex === 'number'
      ? state.shapes[shapeIdOrIndex]
      : state.shapes.find(s => s.id === shapeIdOrIndex);

    if (!shape) return false;

    shape.muted = !shape.muted;

    // Update media element
    if (shape.type === 'video' && shape.videoElement) {
      shape.videoElement.muted = shape.muted;
    }
    if (shape.type === 'audio' && shape.audioElement) {
      shape.audioElement.muted = shape.muted;
    }

    saveState();

    return shape.muted;
  }

  /**
   * Get clips at a specific time
   */
  function getClipsAtTime(time) {
    return state.shapes.filter(shape => {
      if (shape.startTime === undefined) return false;

      const startTime = shape.startTime;
      const endTime = startTime + (shape.duration || 5);

      return time >= startTime && time < endTime;
    });
  }

  /**
   * Get clips on a specific track
   */
  function getClipsOnTrack(trackId) {
    return state.shapes.filter(shape => shape.trackId === trackId);
  }

  /**
   * Check for clip overlap
   */
  function checkClipOverlap(startTime, duration, trackId, excludeShapeId = null) {
    const endTime = startTime + duration;

    return state.shapes.some(shape => {
      if (shape.trackId !== trackId) return false;
      if (shape.id === excludeShapeId) return false;
      if (shape.startTime === undefined) return false;

      const shapeStart = shape.startTime;
      const shapeEnd = shapeStart + (shape.duration || 5);

      return startTime < shapeEnd && endTime > shapeStart;
    });
  }

  /**
   * Find available slot for clip on track
   */
  function findAvailableSlot(duration, trackId, preferredStartTime = 0) {
    const clipsOnTrack = getClipsOnTrack(trackId)
      .filter(s => s.startTime !== undefined)
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

    // Try preferred start time first
    if (!checkClipOverlap(preferredStartTime, duration, trackId)) {
      return preferredStartTime;
    }

    // Find gap between clips
    let currentTime = 0;
    for (const clip of clipsOnTrack) {
      const clipStart = clip.startTime || 0;
      const clipEnd = clipStart + (clip.duration || 5);

      if (clipStart - currentTime >= duration) {
        return currentTime;
      }

      currentTime = Math.max(currentTime, clipEnd);
    }

    // Return position after last clip
    return currentTime;
  }

  /**
   * Ripple delete - removes clip and shifts following clips
   */
  function rippleDeleteClip(shapeIdOrIndex) {
    const index = typeof shapeIdOrIndex === 'number'
      ? shapeIdOrIndex
      : state.shapes.findIndex(s => s.id === shapeIdOrIndex);

    if (index < 0) return false;

    const shape = state.shapes[index];
    if (!shape || shape.startTime === undefined) {
      return deleteClip(index);
    }

    const deletedStart = shape.startTime;
    const deletedDuration = shape.duration || 5;
    const deletedTrack = shape.trackId;

    // Delete the clip
    deleteClip(index);

    // Shift following clips on same track backward
    state.shapes.forEach(s => {
      if (s.trackId === deletedTrack && s.startTime !== undefined && s.startTime > deletedStart) {
        s.startTime -= deletedDuration;
      }
    });

    // Update timeline
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Recalculate project duration after shifting clips
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    saveState();

    return true;
  }

  /**
   * Get default track for FX type (effect, filter, transition)
   * FX clips go on dedicated FX tracks
   */
  function getDefaultTrackForType(type, startTime, duration) {
    // Effects, filters, and transitions go on a dedicated FX track
    if (type === 'effect' || type === 'filter' || type === 'transition') {
      // Get all FX tracks
      const fxTracks = state.tracks.filter(t => t.isFxTrack === true);

      // Find an FX track without overlap at the given time range
      const endTime = startTime + duration;

      for (const track of fxTracks) {
        let hasOverlap = false;

        for (const shape of state.shapes) {
          if (shape.trackId !== track.id) continue;
          if (shape.startTime === undefined) continue;

          const shapeEnd = shape.startTime + (shape.duration || 5);

          // Check for overlap
          if (startTime < shapeEnd && endTime > shape.startTime) {
            hasOverlap = true;
            break;
          }
        }

        if (!hasOverlap) {
          return track.id;
        }
      }

      // No available FX track, create a new one
      const fxTrackNumber = fxTracks.length + 1;
      const newFxTrack = {
        id: 'track-fx-' + Date.now(),
        name: fxTrackNumber === 1 ? 'Effects' : 'Effects ' + fxTrackNumber,
        isFxTrack: true,
        muted: false,
        locked: false,
        visible: true
      };

      // Add at the beginning (top of timeline)
      state.tracks.unshift(newFxTrack);

      // Update timeline UI
      if (typeof window.updateTimelineGroups === 'function') {
        window.updateTimelineGroups();
      }
      if (typeof window.updateTimelineHeight === 'function') {
        window.updateTimelineHeight();
      }

      return newFxTrack.id;
    }

    // For other types (video, audio, image, shapes), use findAvailableTrack from useVideoState
    const videoState = getVideoState();
    return videoState.findAvailableTrack(startTime, duration, type);
  }

  /**
   * Get default properties for a tool type
   */
  function getDefaultPropertiesForTool(type, id, itemConfig) {
    if (type === 'filter') {
      // Filters have value properties
      return {
        value: itemConfig?.default ?? 100,
        min: itemConfig?.min ?? 0,
        max: itemConfig?.max ?? 100,
      };
    } else if (type === 'effect') {
      // Effects have intensity and other properties
      return {
        intensity: 100,
        // Effect-specific defaults
        ...(id === 'dropShadow' ? { offsetX: 5, offsetY: 5, blur: 10, color: 'rgba(0,0,0,0.5)' } : {}),
        ...(id === 'glow' ? { radius: 10, color: '#ffffff' } : {}),
        ...(id === 'vignette' ? { intensity: 50, radius: 50 } : {}),
        ...(id === 'blur' ? { radius: 5 } : {}),
        ...(id === 'grain' ? { amount: 30 } : {}),
        ...(id === 'glitch' ? { intensity: 50, frequency: 10 } : {}),
        ...(id === 'chromatic' ? { offset: 5 } : {}),
        ...(id === 'pixelate' ? { size: 10 } : {}),
      };
    } else if (type === 'transition') {
      // Transitions have easing and direction properties
      return {
        easing: 'ease-in-out',
        direction: id.includes('Left') ? 'left' : id.includes('Right') ? 'right' :
                   id.includes('Up') ? 'up' : id.includes('Down') ? 'down' : 'none',
      };
    }
    return {};
  }

  /**
   * Add an FX clip (effect, filter, or transition)
   * @param {string} fxType - Type in format "effect-dropShadow", "filter-blur", etc.
   */
  function addFxClip(fxType) {
    // Parse type and ID (e.g., "effect-dropShadow" -> {type: "effect", id: "dropShadow"})
    const [type, id] = fxType.split('-');

    if (!id || !type) return null;

    // Get config for this type
    const configKey = type + 's'; // 'effect' -> 'effects', 'filter' -> 'filters', 'transition' -> 'transitions'
    const fxConfig = config[configKey] || {};
    const itemConfig = (fxConfig.items || []).find(item => item.id === id);

    // Create clip at current playhead position
    const clipDuration = fxConfig.defaultDuration || 5;
    const startTime = state.currentTime || 0;

    // Create the clip shape
    const clip = {
      id: generateId(),
      type: type,
      subtype: id,
      name: itemConfig?.name || id,
      startTime: startTime,
      duration: clipDuration,
      trackId: getDefaultTrackForType(type, startTime, clipDuration),

      // Type-specific default properties
      ...getDefaultPropertiesForTool(type, id, itemConfig),
    };

    // Add to shapes
    state.shapes.push(clip);

    // Select the new clip
    state.selectedIndices = [state.shapes.length - 1];

    // Update timeline and render
    saveState();
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }

    return state.shapes.length - 1;
  }

  /**
   * Split all selected clips at playhead
   * Used by the split tool button in the timeline header
   * Viewport keyframes are now shapes with type: 'viewportKeyframe', so they
   * are handled by the regular splitClipAtPlayhead function
   */
  function splitSelectedAtPlayhead() {
    // Get clips that are selected OR at the playhead position
    const currentTime = state.currentTime;
    let clipsToSplit = [];

    // First check if there are selected clips at the playhead
    if (state.selectedIndices.length > 0) {
      clipsToSplit = state.selectedIndices.filter(index => {
        const shape = state.shapes[index];
        if (!shape || shape.startTime === undefined) return false;
        const startTime = shape.startTime || 0;
        const endTime = startTime + (shape.duration || 5);
        return currentTime > startTime && currentTime < endTime;
      });
    }

    // If no selected clips at playhead, find all clips at playhead (including viewport keyframes)
    if (clipsToSplit.length === 0) {
      state.shapes.forEach((shape, index) => {
        if (shape.startTime === undefined) return;
        const startTime = shape.startTime || 0;
        const endTime = startTime + (shape.duration || 5);
        if (currentTime > startTime && currentTime < endTime) {
          clipsToSplit.push(index);
        }
      });
    }

    if (clipsToSplit.length === 0) {
      return;
    }

    // Split each clip (in reverse order to maintain indices)
    clipsToSplit.sort((a, b) => b - a);
    clipsToSplit.forEach(index => {
      splitClipAtPlayhead(index);
    });
  }

  // Expose functions globally for legacy code and UI components
  window.addFxClip = addFxClip;
  window.splitClipAtPlayhead = splitClipAtPlayhead;
  window.splitSelectedAtPlayhead = splitSelectedAtPlayhead;
  window.duplicateClip = duplicateClip;
  window.deleteClip = deleteClip;
  window.trimClipStart = trimClipStart;
  window.trimClipEnd = trimClipEnd;
  window.moveClipToTime = moveClipToTime;
  window.moveClipToTrack = moveClipToTrack;
  window.setClipDuration = setClipDuration;
  window.getClipsAtTime = getClipsAtTime;

  return {
    // Methods
    generateId,
    splitClipAtPlayhead,
    splitSelectedAtPlayhead,
    duplicateClip,
    deleteClip,
    trimClipStart,
    trimClipEnd,
    moveClipToTime,
    moveClipToTrack,
    setClipDuration,
    setClipSpeed,
    setClipVolume,
    toggleClipMute,
    getClipsAtTime,
    getClipsOnTrack,
    checkClipOverlap,
    findAvailableSlot,
    rippleDeleteClip,
    addFxClip,
    getDefaultTrackForType,
    getDefaultPropertiesForTool,
  };
}

// Singleton instance
let clipManagementInstance = null;

/**
 * Get or create clip management instance
 */
export function getClipManagement() {
  if (!clipManagementInstance) {
    clipManagementInstance = useClipManagement();
  }
  return clipManagementInstance;
}

export default useClipManagement;
