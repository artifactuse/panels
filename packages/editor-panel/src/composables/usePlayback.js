// editor/composables/usePlayback.js
// Video playback engine composable

import { ref, watch, onUnmounted } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getVideoState } from './useVideoState.js';
import { getViewportKeyframes } from './useViewportKeyframes.js';

/**
 * Playback composable for video mode animation/playback
 */
export function usePlayback() {
  const { state, config } = getEditorState();
  const videoState = getVideoState();
  const viewportKeyframesComposable = getViewportKeyframes();

  // Playback state
  const isPlaying = ref(false);
  const playbackRate = ref(1);
  const loopEnabled = ref(false);

  // Animation frame tracking
  let animationFrameId = null;
  let lastFrameTime = 0;

  // Saved viewport state (restored when playback stops if keyframes were applied)
  let savedViewport = null;

  /**
   * Start playback
   */
  function play() {
    if (!state.videoMode) return;
    if (isPlaying.value) return;

    // Save current viewport if we have keyframes (will be restored on pause)
    if (viewportKeyframesComposable.hasViewportKeyframes.value) {
      savedViewport = {
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY
      };
    }

    isPlaying.value = true;
    state.isPlaying = true;
    lastFrameTime = performance.now();

    // Start all visible media elements
    startMediaElements();

    // Start animation loop
    animationFrameId = requestAnimationFrame(playbackLoop);
  }

  /**
   * Pause playback
   */
  function pause() {
    isPlaying.value = false;
    state.isPlaying = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Restore viewport if we saved it (keyframes were active)
    if (savedViewport) {
      state.zoom = savedViewport.zoom;
      state.panX = savedViewport.panX;
      state.panY = savedViewport.panY;
      savedViewport = null;

      // Re-render with restored viewport
      if (typeof window.render === 'function') {
        window.render();
      }
    }

    // Pause all media elements
    pauseMediaElements();
  }

  /**
   * Toggle play/pause
   */
  function togglePlayPause() {
    if (isPlaying.value) {
      pause();
    } else {
      play();
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  function stop() {
    pause();
    state.currentTime = 0;
    syncAllMediaToPlayhead();
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Seek to specific time
   */
  function seekTo(time) {
    const duration = state.projectDuration || 60;
    state.currentTime = Math.max(0, Math.min(time, duration));
    syncAllMediaToPlayhead();
    if (typeof window.render === 'function') {
      window.render();
    }
    // Update time display
    if (typeof window.updateTimeDisplay === 'function') {
      window.updateTimeDisplay();
    }
    // Update timeline playhead position (legacy function name)
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }
  }

  /**
   * Skip forward by seconds
   */
  function skipForward(seconds = 5) {
    seekTo(state.currentTime + seconds);
  }

  /**
   * Skip backward by seconds
   */
  function skipBackward(seconds = 5) {
    seekTo(state.currentTime - seconds);
  }

  /**
   * Go to next frame
   */
  function nextFrame() {
    const fps = state.fps || config.video?.fps || 30;
    seekTo(state.currentTime + (1 / fps));
  }

  /**
   * Go to previous frame
   */
  function previousFrame() {
    const fps = state.fps || config.video?.fps || 30;
    seekTo(state.currentTime - (1 / fps));
  }

  /**
   * Set playback rate
   */
  function setPlaybackRate(rate) {
    playbackRate.value = Math.max(0.25, Math.min(4, rate));

    // Update media element playback rates
    state.shapes.forEach(shape => {
      if (shape.type === 'video' || shape.type === 'audio') {
        const element = getMediaElement(shape);
        if (element) {
          element.playbackRate = playbackRate.value * (shape.playbackRate || 1);
        }
      }
    });
  }

  /**
   * Toggle loop mode
   */
  function toggleLoop() {
    loopEnabled.value = !loopEnabled.value;
    // Sync with state for UI reactivity
    state.loopPlayback = loopEnabled.value;
  }

  /**
   * Get the end time of the last clip (content duration)
   * Returns the end time of the furthest clip, or 0 if no clips
   */
  function getContentDuration() {
    if (!state.shapes || state.shapes.length === 0) {
      return state.projectDuration || 60;
    }

    let maxEndTime = 0;
    state.shapes.forEach(shape => {
      if (shape.startTime !== undefined) {
        const endTime = (shape.startTime || 0) + (shape.duration || 0);
        if (endTime > maxEndTime) {
          maxEndTime = endTime;
        }
      }
    });

    // Return content duration, or project duration if no clips with timing
    return maxEndTime > 0 ? maxEndTime : (state.projectDuration || 60);
  }

  /**
   * Main playback loop
   */
  function playbackLoop(currentFrameTime) {
    if (!isPlaying.value) return;

    // Calculate delta time
    const deltaTime = (currentFrameTime - lastFrameTime) / 1000;
    lastFrameTime = currentFrameTime;

    // Advance time - stop at end of content, not end of timeline
    const newTime = state.currentTime + (deltaTime * playbackRate.value);
    const contentDuration = getContentDuration();

    if (newTime >= contentDuration) {
      if (loopEnabled.value) {
        state.currentTime = 0;
        syncAllMediaToPlayhead();
      } else {
        state.currentTime = contentDuration;
        pause();
        return;
      }
    } else {
      state.currentTime = newTime;
    }

    // Sync media elements to current time
    syncPlayingMedia();

    // Apply viewport keyframes (camera animation)
    if (viewportKeyframesComposable.hasViewportKeyframes.value) {
      const viewport = viewportKeyframesComposable.getViewportAtTime(state.currentTime);
      if (viewport) {
        state.zoom = viewport.zoom;
        state.panX = viewport.panX;
        state.panY = viewport.panY;
      }
    }

    // Re-render canvas
    if (typeof window.render === 'function') {
      window.render();
    }

    // Update timeline playhead
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }

    // Update time display
    if (typeof window.updateTimeDisplay === 'function') {
      window.updateTimeDisplay();
    }

    // Continue loop
    animationFrameId = requestAnimationFrame(playbackLoop);
  }

  /**
   * Start media elements that should be playing at current time
   */
  function startMediaElements() {
    state.shapes.forEach(shape => {
      if (shape.type !== 'video' && shape.type !== 'audio') return;
      if (shape.visible === false) return;

      const startTime = shape.startTime || 0;
      const duration = shape.duration || 5;
      const endTime = startTime + duration;

      // Check if clip is active at current time
      if (state.currentTime >= startTime && state.currentTime < endTime) {
        const element = getMediaElement(shape);
        if (element) {
          // Calculate offset within clip
          const clipOffset = state.currentTime - startTime;
          const mediaOffset = (shape.mediaStartOffset || 0) + clipOffset;

          // Check if element is ready to play (readyState >= 2 means HAVE_CURRENT_DATA)
          // Also check if play is a function (element might be invalid if blob URL failed)
          if (typeof element.play !== 'function' || element.readyState < 2) {
            // Element not ready or invalid - skip
            return;
          }

          element.currentTime = mediaOffset;
          element.playbackRate = playbackRate.value * (shape.playbackRate || 1);

          // Apply volume with fade in/out
          const baseVolume = (shape.volume || 100) / 100;
          const fadeIn = shape.fadeIn || 0;
          const fadeOut = shape.fadeOut || 0;
          const fadeMultiplier = calculateFadeVolume(clipOffset, duration, fadeIn, fadeOut);
          element.volume = baseVolume * fadeMultiplier;
          element.muted = shape.muted || false;

          element.play().catch(e => {
            // Autoplay might be blocked or media not loaded
            console.warn('Could not autoplay media:', e.message);
          });
        }
      }
    });
  }

  /**
   * Pause all media elements
   */
  function pauseMediaElements() {
    state.shapes.forEach(shape => {
      if (shape.type !== 'video' && shape.type !== 'audio') return;

      const element = getMediaElement(shape);
      if (element && !element.paused) {
        element.pause();
      }
    });
  }

  /**
   * Sync all media elements to current playhead position
   */
  function syncAllMediaToPlayhead() {
    state.shapes.forEach(shape => {
      if (shape.type !== 'video' && shape.type !== 'audio') return;

      syncMediaToPlayhead(shape);
    });
  }

  /**
   * Sync a single media element to playhead
   */
  function syncMediaToPlayhead(shape) {
    if (shape.type !== 'video' && shape.type !== 'audio') return;

    const element = getMediaElement(shape);
    if (!element) return;

    const startTime = shape.startTime || 0;
    const endTime = startTime + (shape.duration || 5);

    // Check if clip is active at current time
    if (state.currentTime >= startTime && state.currentTime < endTime) {
      const clipOffset = state.currentTime - startTime;
      const mediaOffset = (shape.mediaStartOffset || 0) + clipOffset;
      element.currentTime = mediaOffset;
    }
  }

  /**
   * Seek a single video element and wait for it to be ready
   * Returns a promise that resolves when the video frame is available
   * @param {HTMLVideoElement} video - Video element to seek
   * @param {number} targetTime - Target time in seconds
   * @param {number} timeout - Maximum wait time in ms (default 500ms)
   * @returns {Promise<boolean>} True if seek succeeded
   */
  function seekVideoAndWait(video, targetTime, timeout = 500) {
    return new Promise((resolve) => {
      if (!video || video.readyState < 1) {
        resolve(false);
        return;
      }

      // If already at the right time and ready, resolve immediately
      if (Math.abs(video.currentTime - targetTime) < 0.02 && video.readyState >= 2) {
        resolve(true);
        return;
      }

      let resolved = false;
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('canplay', onCanPlay);
      };

      const onSeeked = () => {
        if (!resolved && video.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve(true);
        }
      };

      const onCanPlay = () => {
        if (!resolved && video.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve(true);
        }
      };

      video.addEventListener('seeked', onSeeked);
      video.addEventListener('canplay', onCanPlay);

      // Set the target time
      video.currentTime = Math.max(0, Math.min(targetTime, video.duration || targetTime));

      // Fallback timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          // Resolve true if readyState is sufficient, false otherwise
          resolve(video.readyState >= 2);
        }
      }, timeout);
    });
  }

  /**
   * Sync all video elements to playhead and wait for all seeks to complete
   * This is essential for export to ensure video frames are ready before rendering
   * @returns {Promise<void>}
   */
  async function syncAllMediaToPlayheadAsync() {
    const seekPromises = [];

    state.shapes.forEach(shape => {
      if (shape.type !== 'video') return;
      if (shape.visible === false) return;

      const element = getMediaElement(shape);
      if (!element) return;

      const startTime = shape.startTime || 0;
      const duration = shape.duration || 5;
      const endTime = startTime + duration;

      // Check if clip is active at current time
      if (state.currentTime >= startTime && state.currentTime < endTime) {
        const clipOffset = state.currentTime - startTime;
        const mediaOffset = (shape.mediaStartOffset || 0) + clipOffset;

        seekPromises.push(seekVideoAndWait(element, mediaOffset));
      }
    });

    // Wait for all seeks to complete
    if (seekPromises.length > 0) {
      await Promise.all(seekPromises);
    }

    // Also sync audio (doesn't need to wait)
    state.shapes.forEach(shape => {
      if (shape.type !== 'audio') return;
      syncMediaToPlayhead(shape);
    });
  }

  /**
   * Calculate fade volume multiplier based on clip position
   * @param {number} clipOffset - Current position within the clip (seconds)
   * @param {number} duration - Total clip duration (seconds)
   * @param {number} fadeIn - Fade in duration (seconds)
   * @param {number} fadeOut - Fade out duration (seconds)
   * @returns {number} Volume multiplier (0-1)
   */
  function calculateFadeVolume(clipOffset, duration, fadeIn, fadeOut) {
    let fadeMultiplier = 1;

    // Apply fade in
    if (fadeIn > 0 && clipOffset < fadeIn) {
      fadeMultiplier = clipOffset / fadeIn;
    }

    // Apply fade out
    const fadeOutStart = duration - fadeOut;
    if (fadeOut > 0 && clipOffset > fadeOutStart) {
      const fadeOutProgress = (clipOffset - fadeOutStart) / fadeOut;
      fadeMultiplier = Math.min(fadeMultiplier, 1 - fadeOutProgress);
    }

    // Clamp to valid range
    return Math.max(0, Math.min(1, fadeMultiplier));
  }

  /**
   * Sync media elements during playback
   */
  function syncPlayingMedia() {
    state.shapes.forEach(shape => {
      if (shape.type !== 'video' && shape.type !== 'audio') return;
      if (shape.visible === false) return;

      const element = getMediaElement(shape);
      if (!element) return;

      const startTime = shape.startTime || 0;
      const duration = shape.duration || 5;
      const endTime = startTime + duration;
      const isActive = state.currentTime >= startTime && state.currentTime < endTime;

      if (isActive) {
        // Calculate clip offset (position within the clip)
        const clipOffset = state.currentTime - startTime;

        // Should be playing
        if (element.paused) {
          const mediaOffset = (shape.mediaStartOffset || 0) + clipOffset;
          element.currentTime = mediaOffset;
          element.play().catch(() => {});
        }

        // Apply volume with fade in/out
        const baseVolume = (shape.volume || 100) / 100;
        const fadeIn = shape.fadeIn || 0;
        const fadeOut = shape.fadeOut || 0;
        const fadeMultiplier = calculateFadeVolume(clipOffset, duration, fadeIn, fadeOut);
        element.volume = baseVolume * fadeMultiplier;
        element.muted = shape.muted || false;
      } else {
        // Should be paused
        if (!element.paused) {
          element.pause();
        }
      }
    });
  }

  /**
   * Get media element for a shape
   */
  function getMediaElement(shape) {
    // Try shape's direct reference first
    if (shape.videoElement) return shape.videoElement;
    if (shape.audioElement) return shape.audioElement;

    // Try registry
    if (typeof window.getMediaElement === 'function') {
      return window.getMediaElement(shape.id);
    }

    return null;
  }

  /**
   * Format time as MM:SS.mmm
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Format time as MM:SS (short format)
   */
  function formatTimeShort(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Go to start of project
   */
  function goToStart() {
    pause();
    seekTo(0);
  }

  /**
   * Go to end of project
   */
  function goToEnd() {
    pause();
    const duration = state.projectDuration || 60;
    seekTo(duration);
  }

  /**
   * Go to start of current/next clip
   */
  function goToNextClip() {
    const currentTime = state.currentTime;

    // Find next clip start after current time
    const clipStarts = state.shapes
      .filter(s => s.startTime !== undefined)
      .map(s => s.startTime)
      .filter(t => t > currentTime + 0.01)
      .sort((a, b) => a - b);

    if (clipStarts.length > 0) {
      seekTo(clipStarts[0]);
    } else {
      // Go to end if no next clip
      goToEnd();
    }
  }

  /**
   * Go to start of previous clip
   */
  function goToPreviousClip() {
    const currentTime = state.currentTime;

    // Find previous clip start before current time
    const clipStarts = state.shapes
      .filter(s => s.startTime !== undefined)
      .map(s => s.startTime)
      .filter(t => t < currentTime - 0.01)
      .sort((a, b) => b - a);

    if (clipStarts.length > 0) {
      seekTo(clipStarts[0]);
    } else {
      // Go to start if no previous clip
      goToStart();
    }
  }

  /**
   * Get current playback progress (0-1)
   */
  function getProgress() {
    const duration = state.projectDuration || 60;
    return duration > 0 ? state.currentTime / duration : 0;
  }

  /**
   * Set playback progress (0-1)
   */
  function setProgress(progress) {
    const duration = state.projectDuration || 60;
    const time = Math.max(0, Math.min(1, progress)) * duration;
    seekTo(time);
  }

  /**
   * Get remaining time
   */
  function getRemainingTime() {
    const duration = state.projectDuration || 60;
    return Math.max(0, duration - state.currentTime);
  }

  // Clean up on unmount
  onUnmounted(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    pauseMediaElements();
  });

  // Expose functions globally for UI components and timeline
  window.play = play;
  window.pause = pause;
  window.togglePlayPause = togglePlayPause;
  window.stop = stop;
  window.seekTo = seekTo;
  window.skipForward = skipForward;
  window.skipBackward = skipBackward;
  window.nextFrame = nextFrame;
  window.previousFrame = previousFrame;
  window.setPlaybackRate = setPlaybackRate;
  window.toggleLoop = toggleLoop;
  window.syncAllMediaToPlayhead = syncAllMediaToPlayhead;
  window.syncAllMediaToPlayheadAsync = syncAllMediaToPlayheadAsync;
  window.goToStart = goToStart;
  window.goToEnd = goToEnd;
  window.goToNextClip = goToNextClip;
  window.goToPreviousClip = goToPreviousClip;
  window.formatTime = formatTime;
  window.getContentDuration = getContentDuration;

  return {
    // State
    isPlaying,
    playbackRate,
    loopEnabled,

    // Methods
    play,
    pause,
    togglePlayPause,
    stop,
    seekTo,
    skipForward,
    skipBackward,
    nextFrame,
    previousFrame,
    setPlaybackRate,
    toggleLoop,
    syncAllMediaToPlayhead,
    syncAllMediaToPlayheadAsync,
    syncMediaToPlayhead,
    formatTime,
    formatTimeShort,
    goToStart,
    goToEnd,
    goToNextClip,
    goToPreviousClip,
    getProgress,
    setProgress,
    getRemainingTime,
    getContentDuration
  };
}

// Singleton instance
let playbackInstance = null;

/**
 * Get or create playback instance
 */
export function getPlayback() {
  if (!playbackInstance) {
    playbackInstance = usePlayback();
  }
  return playbackInstance;
}

export default usePlayback;
