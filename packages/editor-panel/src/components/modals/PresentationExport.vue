<script setup>
/**
 * PresentationExport - Modal shown after canvas presentation recording completes
 *
 * Provides three options:
 * - Export as Video: Download the recording as a video file
 * - Edit in Video Mode: Open the recording in the full video editor
 * - Preview: Dismiss modal and preview the recording with playback controls
 */
import { computed } from 'vue';

const props = defineProps({
  darkMode: {
    type: Boolean,
    default: true
  },
  duration: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['export-video', 'edit-in-video-mode', 'preview', 'close']);

// Format duration as MM:SS
const formattedDuration = computed(() => {
  const mins = Math.floor(props.duration / 60);
  const secs = Math.floor(props.duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
});

function handleBackdropClick(e) {
  if (e.target === e.currentTarget) {
    emit('close');
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close');
  }
}
</script>

<template>
  <div
    class="presentation-export-modal"
    :class="{ 'light-mode': !darkMode }"
    @click="handleBackdropClick"
    @keydown="handleKeydown"
  >
    <div class="presentation-export-content">
      <!-- Header -->
      <div class="presentation-export-header">
        <div class="presentation-export-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 class="presentation-export-title">Presentation Complete</h3>
        <p class="presentation-export-duration">Duration: {{ formattedDuration }}</p>
      </div>

      <!-- Export Options -->
      <div class="presentation-export-options">
        <!-- Export as Video -->
        <button class="presentation-export-btn primary" @click="emit('export-video')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export as Video</span>
          <span class="btn-desc">Download file</span>
        </button>

        <!-- Edit in Video Mode -->
        <button class="presentation-export-btn secondary" @click="emit('edit-in-video-mode')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span>Refine Recording</span>
          <span class="btn-desc">Open in timeline editor</span>
        </button>

        <!-- Preview -->
        <button class="presentation-export-btn tertiary" @click="emit('preview')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Preview</span>
          <span class="btn-desc">Watch before exporting</span>
        </button>
      </div>

      <!-- Close button -->
      <button class="presentation-export-close" @click="emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.presentation-export-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}

.presentation-export-content {
  position: relative;
  background: var(--panel-bg, #1a1a1a);
  color: var(--text-primary, #e5e7eb);
  border-radius: 16px;
  width: 400px;
  max-width: 90vw;
  padding: 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.presentation-export-modal.light-mode .presentation-export-content {
  background: var(--panel-bg, #f9fafc);
  color: var(--text-primary, #374151);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

/* Header */
.presentation-export-header {
  text-align: center;
  margin-bottom: 24px;
}

.presentation-export-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 50%;
  margin-bottom: 16px;
  color: #22c55e;
}

.presentation-export-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px;
}

.presentation-export-duration {
  font-size: 14px;
  color: var(--text-secondary, #9ca3af);
  margin: 0;
}

.presentation-export-modal.light-mode .presentation-export-duration {
  color: var(--text-secondary, #6b7280);
}

/* Export Options */
.presentation-export-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.presentation-export-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 150ms ease;
  text-align: left;
}

.presentation-export-btn svg {
  flex-shrink: 0;
}

.presentation-export-btn span:first-of-type {
  font-size: 14px;
  font-weight: 500;
}

.presentation-export-btn .btn-desc {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.7;
}

/* Primary button (Export) */
.presentation-export-btn.primary {
  background: var(--accent, #6366f1);
  color: white;
}

.presentation-export-btn.primary:hover {
  background: var(--accent-hover, #4f46e5);
}

/* Secondary button (Edit in Video Mode) */
.presentation-export-btn.secondary {
  background: var(--panel-bg-secondary, rgba(255, 255, 255, 0.05));
  color: var(--text-primary, #e5e7eb);
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.3));
}

.presentation-export-modal.light-mode .presentation-export-btn.secondary {
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.03));
  color: var(--text-primary, #374151);
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
}

.presentation-export-btn.secondary:hover {
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
}

/* Tertiary button (Preview) */
.presentation-export-btn.tertiary {
  background: transparent;
  color: var(--text-secondary, #9ca3af);
}

.presentation-export-modal.light-mode .presentation-export-btn.tertiary {
  color: var(--text-secondary, #6b7280);
}

.presentation-export-btn.tertiary:hover {
  background: var(--panel-bg-secondary, rgba(255, 255, 255, 0.05));
  color: var(--text-primary, #e5e7eb);
}

.presentation-export-modal.light-mode .presentation-export-btn.tertiary:hover {
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.03));
  color: var(--text-primary, #374151);
}

/* Close button */
.presentation-export-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  border-radius: 8px;
  transition: all 150ms ease;
}

.presentation-export-close:hover {
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  color: var(--accent, #6366f1);
}
</style>
