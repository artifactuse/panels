<script setup>
/**
 * RecordingControls - Floating control bar during recording
 *
 * Usage:
 * <RecordingControls
 *   v-if="isRecording"
 *   :dark-mode="state.darkMode"
 *   :duration="recordingDuration"
 *   :is-paused="isPaused"
 *   @pause="handlePause"
 *   @resume="handleResume"
 *   @stop="handleStop"
 * />
 */
import { computed } from 'vue';
import { getRecording } from '../../composables/useRecording.js';

const props = defineProps({
  darkMode: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['pause', 'resume', 'stop']);

// Get recording composable
const recording = getRecording();

// Computed state
const isRecording = computed(() => recording.state.isRecording);
const isPaused = computed(() => recording.state.isPaused);
const duration = computed(() => recording.state.recordingDuration);

// Format duration as HH:MM:SS
const formattedDuration = computed(() => {
  return recording.formatDuration(duration.value);
});

// Handlers
function handlePauseResume() {
  if (isPaused.value) {
    recording.resumeRecording();
    emit('resume');
  } else {
    recording.pauseRecording();
    emit('pause');
  }
}

async function handleStop() {
  const blob = await recording.stopRecording();
  emit('stop', blob);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isRecording"
      class="recording-controls"
      :class="{ 'light-mode': !darkMode }"
    >
      <!-- Recording indicator -->
      <div class="recording-indicator" :class="{ paused: isPaused }"></div>

      <!-- Timer -->
      <div class="recording-timer">{{ formattedDuration }}</div>

      <!-- Divider -->
      <div class="recording-divider"></div>

      <!-- Pause/Resume button -->
      <button
        class="recording-btn"
        :title="isPaused ? 'Resume' : 'Pause'"
        @click="handlePauseResume"
      >
        <svg v-if="isPaused" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21" />
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>

      <!-- Stop button -->
      <button
        class="recording-btn stop"
        title="Stop Recording"
        @click="handleStop"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.recording-controls {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel-bg, #1a1a1a);
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.1));
  border-radius: 12px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--popup-shadow, 0 8px 30px rgba(0, 0, 0, 0.4));
  z-index: 10000;
  pointer-events: auto;
}

.recording-controls.light-mode {
  background: var(--panel-bg, #f9fafc);
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
  box-shadow: var(--popup-shadow, 0 8px 30px rgba(0, 0, 0, 0.2));
}

.recording-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
  animation: recording-blink 1s ease-in-out infinite;
}

.recording-indicator.paused {
  animation: none;
  opacity: 0.5;
}

@keyframes recording-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.recording-timer {
  font-family: monospace;
  font-size: 14px;
  color: var(--text-primary, #e5e7eb);
  min-width: 70px;
}

.recording-controls.light-mode .recording-timer {
  color: var(--text-primary, #374151);
}

.recording-divider {
  width: 1px;
  height: 20px;
  background: var(--divider, rgba(85, 85, 85, 0.3));
}

.recording-controls.light-mode .recording-divider {
  background: var(--divider, rgba(0, 0, 0, 0.1));
}

.recording-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  transition: all 150ms ease;
}

.recording-controls.light-mode .recording-btn {
  color: var(--text-secondary, #6b7280);
}

.recording-btn:hover {
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  color: var(--accent, #6366f1);
}

.recording-btn.stop {
  background: #ef4444;
  color: white;
}

.recording-btn.stop:hover {
  background: #dc2626;
}
</style>
