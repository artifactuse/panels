<script setup>
/**
 * PlaybackControls - Compact transport bar with play/pause, seek, time display, and volume
 *
 * This component provides the UI but delegates to legacy functions in extensions.js
 * for actual playback control. The legacy code handles media sync, playhead updates, etc.
 */
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';

const { state } = getEditorState();

// Local reactive refs for UI
const currentTimeDisplay = ref('00:00.00');
const totalTimeDisplay = ref('00:00.00');

// Frame button hold state
let frameHoldInterval = null;
let frameHoldTimeout = null;
let isHolding = false;

// Volume state
const volumePopupVisible = ref(false);
const masterVolume = ref(100);
const isMuted = ref(false);
const volumeBtnRef = ref(null);
const volumePopupRef = ref(null);
const volumePopupPosition = ref({ left: 0, bottom: 0 });

// Format time as MM:SS.ff (two decimals for precision) - sleeker format
function formatTimeDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

// Update time displays
function updateTimeDisplays() {
  currentTimeDisplay.value = formatTimeDisplay(state.currentTime || 0);
  totalTimeDisplay.value = formatTimeDisplay(state.projectDuration || 60);
}

// Watch for time changes
watch(() => state.currentTime, updateTimeDisplays, { immediate: true });
watch(() => state.projectDuration, updateTimeDisplays, { immediate: true });

// Play/Pause toggle - delegate to legacy togglePlayPause
// If at end of timeline and not playing, reset to start before playing
function handlePlayPause() {
  // If at or past the end and not currently playing, reset to start first
  const duration = state.projectDuration || 60;
  if (!state.isPlaying && state.currentTime >= duration) {
    if (typeof window.seekTo === 'function') {
      window.seekTo(0);
    } else {
      state.currentTime = 0;
    }
  }

  if (typeof window.togglePlayPause === 'function') {
    window.togglePlayPause();
  }
}

// Debounce helper to prevent rapid-fire calls
let seekDebounceTimer = null;
function debouncedSeek(time) {
  if (seekDebounceTimer) {
    clearTimeout(seekDebounceTimer);
  }
  seekDebounceTimer = setTimeout(() => {
    if (typeof window.seekTo === 'function') {
      window.seekTo(time);
    }
    seekDebounceTimer = null;
  }, 16); // One frame at 60fps
}

// Frame back button handlers (click = go to start, hold = frame back)
function handleFrameBackMouseDown() {
  isHolding = false;
  frameHoldTimeout = setTimeout(() => {
    isHolding = true;
    // Start frame stepping
    frameHoldInterval = setInterval(() => {
      if (typeof window.frameBackward === 'function') {
        window.frameBackward();
      } else if (typeof window.seekTo === 'function') {
        window.seekTo(state.currentTime - 1 / (state.fps || 30));
      }
    }, 100);
  }, 300);
}

function handleFrameBackMouseUp() {
  if (frameHoldTimeout) {
    clearTimeout(frameHoldTimeout);
    frameHoldTimeout = null;
  }
  if (frameHoldInterval) {
    clearInterval(frameHoldInterval);
    frameHoldInterval = null;
  }
  if (!isHolding) {
    // Click - go to start (use direct seekTo for immediate response)
    if (typeof window.seekTo === 'function') {
      window.seekTo(0);
    }
  }
  isHolding = false;
}

// Cancel hold on mouse leave (without seeking)
function handleFrameBackMouseLeave() {
  if (frameHoldTimeout) {
    clearTimeout(frameHoldTimeout);
    frameHoldTimeout = null;
  }
  if (frameHoldInterval) {
    clearInterval(frameHoldInterval);
    frameHoldInterval = null;
  }
  isHolding = false;
}

// Frame forward button handlers (click = go to end, hold = frame forward)
function handleFrameForwardMouseDown() {
  isHolding = false;
  frameHoldTimeout = setTimeout(() => {
    isHolding = true;
    // Start frame stepping
    frameHoldInterval = setInterval(() => {
      if (typeof window.frameForward === 'function') {
        window.frameForward();
      } else if (typeof window.seekTo === 'function') {
        window.seekTo(state.currentTime + 1 / (state.fps || 30));
      }
    }, 100);
  }, 300);
}

function handleFrameForwardMouseUp() {
  if (frameHoldTimeout) {
    clearTimeout(frameHoldTimeout);
    frameHoldTimeout = null;
  }
  if (frameHoldInterval) {
    clearInterval(frameHoldInterval);
    frameHoldInterval = null;
  }
  if (!isHolding) {
    // Click - go to end (use direct seekTo for immediate response)
    if (typeof window.seekTo === 'function') {
      window.seekTo(state.projectDuration || 60);
    }
  }
  isHolding = false;
}

// Cancel hold on mouse leave (without seeking)
function handleFrameForwardMouseLeave() {
  if (frameHoldTimeout) {
    clearTimeout(frameHoldTimeout);
    frameHoldTimeout = null;
  }
  if (frameHoldInterval) {
    clearInterval(frameHoldInterval);
    frameHoldInterval = null;
  }
  isHolding = false;
}

// Volume handlers
function handleVolumeClick(e) {
  e.stopPropagation();

  if (!volumePopupVisible.value) {
    // Opening - calculate position based on button
    const btn = volumeBtnRef.value;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      // Position above the button (since playback controls are at bottom)
      volumePopupPosition.value = {
        left: rect.left + rect.width / 2 - 24, // Center the popup (48px wide / 2)
        bottom: window.innerHeight - rect.top + 8
      };
    }
  }

  volumePopupVisible.value = !volumePopupVisible.value;
}

function handleVolumeChange(e) {
  masterVolume.value = parseInt(e.target.value);
  state.masterVolume = masterVolume.value;
  isMuted.value = false;
  state.isMuted = false;
  applyMasterVolume();

  // Update volume icon via legacy function if available
  if (typeof window.updateVolumeIcon === 'function') {
    window.updateVolumeIcon(masterVolume.value);
  }
}

function toggleMute(e) {
  e.preventDefault();
  isMuted.value = !isMuted.value;
  state.isMuted = isMuted.value;
  if (isMuted.value) {
    state.volumeBeforeMute = masterVolume.value;
  } else {
    masterVolume.value = state.volumeBeforeMute || 100;
    state.masterVolume = masterVolume.value;
  }
  applyMasterVolume();
}

function applyMasterVolume() {
  // Use legacy function if available
  if (typeof window.applyMasterVolume === 'function') {
    window.applyMasterVolume();
    return;
  }

  // Fallback implementation
  const vol = (isMuted.value ? 0 : masterVolume.value) / 100;
  state.shapes.forEach(shape => {
    let mediaElement = shape.videoElement || shape.audioElement;
    if (!mediaElement && shape.id && typeof window.getMediaElement === 'function') {
      mediaElement = window.getMediaElement(shape.id);
    }
    if (mediaElement) {
      const shapeVolume = (shape.volume !== undefined ? shape.volume : 100) / 100;
      mediaElement.volume = shapeVolume * vol;
    }
  });
}

const volumeIcon = computed(() => {
  if (isMuted.value || masterVolume.value === 0) {
    // Muted icon
    return '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else if (masterVolume.value < 50) {
    // Low volume
    return '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  } else {
    // High volume
    return '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  }
});

// Click outside handler for volume popup
function handleClickOutside(e) {
  if (volumePopupVisible.value) {
    const btn = volumeBtnRef.value;
    const popup = volumePopupRef.value;
    if (btn && !btn.contains(e.target) && (!popup || !popup.contains(e.target))) {
      volumePopupVisible.value = false;
    }
  }
}

onMounted(() => {
  updateTimeDisplays();
  document.addEventListener('click', handleClickOutside);

  // Initialize from state
  masterVolume.value = state.masterVolume !== undefined ? state.masterVolume : 100;
  isMuted.value = state.isMuted || false;

  const slider = document.querySelector('.volume-slider');

slider.addEventListener('input', e => {
  const percent = (e.target.value / e.target.max) * 100;
  e.target.style.setProperty('--value', `${percent}%`);
});

});

onUnmounted(() => {
  if (frameHoldInterval) {
    clearInterval(frameHoldInterval);
  }
  if (frameHoldTimeout) {
    clearTimeout(frameHoldTimeout);
  }
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="playback-controls">
    <!-- Skip to start -->
    <button
      class="transport-icon-btn"
      title="Go to Start (hold for Frame Back)"
      @mousedown="handleFrameBackMouseDown"
      @mouseup="handleFrameBackMouseUp"
      @mouseleave="handleFrameBackMouseLeave"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="19 20 9 12 19 4 19 20"/>
        <line x1="5" y1="4" x2="5" y2="20"/>
      </svg>
    </button>

    <!-- Play/Pause button -->
    <button
      class="play-btn"
      :class="{ playing: state.isPlaying }"
      title="Play/Pause (Space)"
      @click="handlePlayPause"
    >
      <!-- Play icon -->
      <svg
        v-if="!state.isPlaying"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <polygon points="6 3 20 12 6 21 6 3"/>
      </svg>
      <!-- Pause icon -->
      <svg
        v-else
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <rect x="5" y="4" width="5" height="16"/>
        <rect x="14" y="4" width="5" height="16"/>
      </svg>
    </button>

    <!-- Skip to end -->
    <button
      class="transport-icon-btn"
      title="Go to End (hold for Frame Forward)"
      @mousedown="handleFrameForwardMouseDown"
      @mouseup="handleFrameForwardMouseUp"
      @mouseleave="handleFrameForwardMouseLeave"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 4 15 12 5 20 5 4"/>
        <line x1="19" y1="4" x2="19" y2="20"/>
      </svg>
    </button>

    <!-- Time display -->
    <div class="time-display">
      <span class="time-current">{{ currentTimeDisplay }}</span>
      <span class="time-separator">/</span>
      <span class="time-total">{{ totalTimeDisplay }}</span>
    </div>

    <!-- Volume button with popup -->
    <div class="volume-wrapper">
      <button
        ref="volumeBtnRef"
        class="transport-icon-btn"
        title="Volume (double-click to mute)"
        @click="handleVolumeClick"
        @dblclick="toggleMute"
        @contextmenu="toggleMute"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="volumeIcon"></svg>
      </button>

      <!-- Teleported Volume popup (renders above timeline) -->
      <Teleport to="body">
        <div
          v-show="volumePopupVisible"
          ref="volumePopupRef"
          class="volume-popup vue-volume-popup volume-popup-teleported"
          :class="{ 'light-mode': !state.darkMode }"
          :style="{
            left: volumePopupPosition.left + 'px',
            bottom: volumePopupPosition.bottom + 'px'
          }"
          @click.stop
        >
          <div class="volume-popup-content">
            <input
              type="range"
              class="volume-slider"
              min="0"
              max="100"
              :value="isMuted ? 0 : masterVolume"
              orient="vertical"
              @input="handleVolumeChange"
            >
            <span class="volume-value">{{ isMuted ? 0 : masterVolume }}%</span>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>
