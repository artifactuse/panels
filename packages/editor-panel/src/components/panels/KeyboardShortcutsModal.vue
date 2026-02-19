<script setup>
/**
 * KeyboardShortcutsModal - Displays keyboard shortcuts for the editor
 *
 * Usage:
 * <KeyboardShortcutsModal
 *   :visible="showShortcuts"
 *   :video-mode="state.videoMode"
 *   :dark-mode="state.darkMode"
 *   @close="showShortcuts = false"
 * />
 */
import { computed, watch, onMounted, onUnmounted } from 'vue';
import { SHORTCUTS } from '../../composables/useKeyboard.js';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  videoMode: {
    type: Boolean,
    default: false
  },
  darkMode: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['close']);

// Destructure shortcuts for template use
const { tools, media, videoPlayback, ctrl } = SHORTCUTS;

// Tool shortcuts (shown in both modes)
const toolShortcuts = computed(() => [
  { key: tools.select, label: 'Select' },
  { key: tools.hand, label: 'Hand (Pan)' },
  { key: tools.rect, label: 'Rectangle' },
  { key: tools.ellipse, label: 'Ellipse' },
  { key: tools.arrow, label: 'Arrow' },
  { key: tools.line, label: 'Line' },
  { key: tools.pen, label: 'Pen (Freehand)' },
  { key: tools.text, label: 'Text' },
  { key: tools.image, label: 'Image' },
  { key: tools.eraser, label: 'Eraser' }
]);

// Edit shortcuts
const editShortcuts = computed(() => [
  { key: `Ctrl+${ctrl.copy}`, label: 'Copy' },
  { key: `Ctrl+${ctrl.cut}`, label: 'Cut' },
  { key: `Ctrl+${ctrl.paste}`, label: 'Paste' },
  { key: `Ctrl+${ctrl.duplicate}`, label: 'Duplicate' },
  { key: `Ctrl+${ctrl.undo}`, label: 'Undo' },
  { key: `Ctrl+${ctrl.redo}`, label: 'Redo' },
  { key: 'Del', label: 'Delete' },
  { key: 'Esc', label: 'Deselect / Cancel' },
  { key: 'Enter', label: 'Apply Crop / Vector Edit' },
]);

// View shortcuts
const viewShortcuts = computed(() => [
  { key: `Ctrl+${ctrl.zoomIn}`, label: 'Zoom In' },
  { key: `Ctrl+${ctrl.zoomOut}`, label: 'Zoom Out' },
  { key: `Ctrl+${ctrl.resetZoom}`, label: 'Reset Zoom' },
  { key: 'Space+Drag', label: 'Pan Canvas' },
]);

const presentationShortcuts = computed(() => [
  { key: 'Cmd+Shift+P', label: 'Enter Presentation Mode' },
]);

// Video mode tool shortcuts
const videoToolShortcuts = computed(() => [
  { key: tools.cursor, label: 'Cursor (Animated)' },
  { key: media.video, label: 'Video' },
  { key: media.audio, label: 'Audio' },
]);

// Video playback shortcuts
const playbackShortcuts = computed(() => [
  { key: 'Space', label: 'Play / Pause' },
  { key: videoPlayback.skipBackward, label: 'Skip Backward 5s' },
  { key: videoPlayback.playPause, label: 'Play / Pause' },
  { key: videoPlayback.skipForward, label: 'Skip Forward 5s' },
  { key: 'Home', label: 'Go to Start' },
  { key: 'End', label: 'Go to End' },
  { key: videoPlayback.previousFrame, label: 'Previous Frame' },
  { key: videoPlayback.nextFrame, label: 'Next Frame' },
]);

// Timeline shortcuts
const timelineShortcuts = computed(() => [
  { key: videoPlayback.split, label: 'Split Clip at Playhead' },
  { key: videoPlayback.addCameraKeyframe, label: 'Add Camera Keyframe' },
  { key: videoPlayback.record, label: 'Open Recording Dialog' },
  { key: 'Scroll', label: 'Zoom Timeline' },
]);

// File shortcuts (canvas mode only)
const fileShortcuts = computed(() => [
  { key: `Ctrl+${ctrl.save}`, label: 'Save (JSON)' },
  { key: `Ctrl+${ctrl.open}`, label: 'Open (JSON)' },
  { key: `Ctrl+${ctrl.exportPng}`, label: 'Export PNG' },
]);

// Handle close
function handleClose() {
  emit('close');
}

// Handle backdrop click
function handleBackdropClick(e) {
  if (e.target === e.currentTarget) {
    handleClose();
  }
}

// Handle escape key
function handleKeydown(e) {
  if (e.key === 'Escape' && props.visible) {
    handleClose();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="shortcuts-modal"
      :class="{ 'light-mode': !darkMode, visible: visible }"
      @click="handleBackdropClick"
    >
      <div class="shortcuts-content">
        <!-- Header -->
        <div class="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <span class="shortcuts-mode-badge">
            {{ videoMode ? 'Video Mode' : 'Canvas Mode' }}
          </span>
          <button class="shortcuts-close" @click="handleClose">&times;</button>
        </div>

        <!-- Body -->
        <div class="shortcuts-body">
          <!-- Video Mode Sections (shown first in video mode) -->
          <template v-if="videoMode">
            <!-- Video Tools -->
            <div class="shortcuts-section">
              <h4>Video Tools</h4>
              <div
                v-for="shortcut in videoToolShortcuts"
                :key="shortcut.key"
                class="shortcut-row"
              >
                <span class="shortcut-key">{{ shortcut.key }}</span>
                {{ shortcut.label }}
              </div>
            </div>

            <!-- Playback -->
            <div class="shortcuts-section">
              <h4>Playback</h4>
              <div
                v-for="shortcut in playbackShortcuts"
                :key="shortcut.key"
                class="shortcut-row"
              >
                <span class="shortcut-key">{{ shortcut.key }}</span>
                {{ shortcut.label }}
              </div>
            </div>

            <!-- Timeline -->
            <div class="shortcuts-section">
              <h4>Timeline</h4>
              <div
                v-for="shortcut in timelineShortcuts"
                :key="shortcut.key"
                class="shortcut-row"
              >
                <span class="shortcut-key">{{ shortcut.key }}</span>
                {{ shortcut.label }}
              </div>
            </div>
          </template>

           <!-- Canvas Mode Only: File -->
          <template v-if="!videoMode">
            <div class="shortcuts-section">
              <h4>Presentation</h4>
              <div
                v-for="shortcut in presentationShortcuts"
                :key="shortcut.key"
                class="shortcut-row"
              >
                <span class="shortcut-key">{{ shortcut.key }}</span>
                {{ shortcut.label }}
              </div>
            </div>
          </template>

          <!-- Common Sections -->
          <!-- Tools -->
          <div class="shortcuts-section">
            <h4>Tools</h4>
            <div
              v-for="shortcut in toolShortcuts"
              :key="shortcut.key"
              class="shortcut-row"
            >
              <span class="shortcut-key">{{ shortcut.key }}</span>
              {{ shortcut.label }}
            </div>
          </div>

          <!-- Edit -->
          <div class="shortcuts-section">
            <h4>Edit</h4>
            <div
              v-for="shortcut in editShortcuts"
              :key="shortcut.key"
              class="shortcut-row"
            >
              <span class="shortcut-key">{{ shortcut.key }}</span>
              {{ shortcut.label }}
            </div>
          </div>

          <!-- View -->
          <div class="shortcuts-section">
            <h4>View</h4>
            <div
              v-for="shortcut in viewShortcuts"
              :key="shortcut.key"
              class="shortcut-row"
            >
              <span class="shortcut-key">{{ shortcut.key }}</span>
              {{ shortcut.label }}
            </div>
          </div>

          <!-- Canvas Mode Only: File -->
          <template v-if="!videoMode">
            <div class="shortcuts-section">
              <h4>File</h4>
              <div
                v-for="shortcut in fileShortcuts"
                :key="shortcut.key"
                class="shortcut-row"
              >
                <span class="shortcut-key">{{ shortcut.key }}</span>
                {{ shortcut.label }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Modal styles use global CSS from styles/index.css */
/* Only component-specific overrides here if needed */
</style>
