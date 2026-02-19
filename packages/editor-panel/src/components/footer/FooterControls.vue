<script setup>
/**
 * FooterControls - Footer bar with zoom, undo/redo, layers, theme toggle
 *
 * Replaces getFooterControlsHTML() from core/toolbar.js
 * Outputs the EXACT same HTML structure as the legacy function.
 */
import { computed, ref, onMounted } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';
import { getHistory } from '../../composables/useHistory.js';
import { getPresentationMode } from '../../composables/usePresentationMode.js';

const { state } = getEditorState();
const history = getHistory();
const presentation = getPresentationMode();

const emit = defineEmits(['toggle-layers', 'show-help']);

// Zoom display - reactive
const zoomPercent = computed(() => Math.round(state.zoom * 100) + '%');

// Presentation mode playback
const hasPresentationRecording = computed(() => presentation.hasRecording.value);
const isPresentationPlaying = computed(() => state.isPresentationPlayback);

// Check if preview is active (video overlay is showing)
const isPreviewActive = computed(() => presentation.isPreviewVisible.value);
const presentationProgress = computed(() => {
  if (state.presentationDuration === 0) return 0;
  return (state.presentationTime / state.presentationDuration) * 100;
});

function handlePresentationSeek(e) {
  const percent = parseFloat(e.target.value);
  const time = (percent / 100) * state.presentationDuration;
  presentation.seekTo(time);
}

// Zoom functions
function zoomIn() {
  state.zoom = Math.min(state.zoom * 1.2, 10);
  if (typeof window.render === 'function') window.render();
}

function zoomOut() {
  state.zoom = Math.max(state.zoom / 1.2, 0.1);
  if (typeof window.render === 'function') window.render();
}

function resetZoom() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  if (typeof window.render === 'function') window.render();
}

// Theme toggle
function toggleTheme() {
  state.darkMode = !state.darkMode;
  document.documentElement.classList.toggle('dark', state.darkMode);
  document.body.classList.toggle('dark', state.darkMode);
  if (typeof window.render === 'function') window.render();
}

// Undo/Redo
function undo() {
  history.undo();
}

function redo() {
  history.redo();
}

// Layers toggle
function toggleLayers() {
  emit('toggle-layers');
}

// Help
function showHelp() {
  emit('show-help');
}

// File input refs
const importFileInput = ref(null);
const imageFileInput = ref(null);

// Handle file imports
function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (typeof window.loadProject === 'function') {
        window.loadProject(data);
      }
    } catch (err) {
      console.error('Failed to parse JSON:', err);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset for re-upload
}

function handleImageFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (typeof window.addImageToCanvas === 'function') {
    window.addImageToCanvas(file);
  }
  e.target.value = ''; // Reset for re-upload
}

// Note: Scroll to content button is now handled by App.vue

// Expose elements and functions globally for legacy compatibility
onMounted(() => {
  // Expose zoom functions
  window.zoomIn = zoomIn;
  window.zoomOut = zoomOut;
  window.resetZoom = resetZoom;

  // Update zoom display function (called by legacy code)
  window.updateZoomDisplay = () => {
    // Vue reactivity handles this automatically via zoomPercent computed
  };
});
</script>

<template>
  <div class="footer-controls" :class="{ 'preview-mode': isPreviewActive }">
    <!-- Zoom Controls (hidden during preview) -->
    <div v-if="!isPreviewActive" class="floating-panel-alt flex items-center gap-1 px-2 py-1.5">
      <button
        id="zoom-out"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold text-lg"
        @click="zoomOut"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>
      </button>
      <span
        id="zoom-display"
        class="px-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer min-w-[50px] text-center"
        @click="resetZoom"
      >{{ zoomPercent }}</span>
      <button
        id="zoom-in"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold text-lg"
        @click="zoomIn"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      </button>
    </div>

    <!-- History Controls (hidden during preview) -->
    <div v-if="!isPreviewActive" class="floating-panel-alt flex items-center gap-1 px-2 py-1.5">
      <button
        id="undo-btn"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Undo (Ctrl+Z)"
        @click="undo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
      </button>
      <button
        id="redo-btn"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Redo (Ctrl+Y)"
        @click="redo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
      </button>
    </div>

    <!-- Layers & Theme Controls (hidden during preview) -->
    <div v-if="!isPreviewActive" class="floating-panel-alt flex items-center gap-1 px-2 py-1.5">
      <button
        data-toggle="layers"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Layers"
        @click="toggleLayers"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
      </button>
      <button
        id="theme-toggle"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Toggle theme"
        @click="toggleTheme"
      >
        <svg class="w-4 h-4 dark:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <svg class="w-4 h-4 hidden dark:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      </button>
    </div>

    <!-- Help Button (hidden during preview) -->
    <div v-if="!isPreviewActive" class="floating-panel-alt flex items-center gap-1 px-2 py-1.5">
      <button
        id="help-btn"
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Keyboard shortcuts (?)"
        @click="showHelp"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      </button>
    </div>

    <!-- Presentation Playback Controls (shown after presentation recording) -->
    <div v-if="hasPresentationRecording" class="floating-panel-alt flex items-center gap-2 px-3 py-1.5 presentation-playback">
      <!-- Play/Pause Button -->
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        :title="isPresentationPlaying ? 'Pause' : 'Play'"
        @click="presentation.togglePlayback()"
      >
        <!-- Play icon -->
        <svg v-if="!isPresentationPlaying" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <!-- Pause icon -->
        <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>

      <!-- Progress Slider -->
      <input
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="presentationProgress"
        class="presentation-progress-slider"
        @input="handlePresentationSeek"
      />

      <!-- Time Display -->
      <span class="text-xs text-gray-500 dark:text-gray-400 min-w-[70px] text-center whitespace-nowrap">
        {{ presentation.formattedCurrentTime.value }} / {{ presentation.formattedDuration.value }}
      </span>

      <!-- Exit Presentation Mode Button -->
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
        title="Exit presentation mode"
        @click="presentation.exitPresentationMode(); presentation.clearRecording()"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Note: Scroll back to content button is now handled by App.vue for both canvas and video modes -->

  <!-- Hidden file inputs -->
  <input
    ref="importFileInput"
    type="file"
    id="import-file-input"
    accept=".json"
    style="display: none;"
    @change="handleImportFile"
  >
  <input
    ref="imageFileInput"
    type="file"
    id="image-file-input"
    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
    style="display: none;"
    @change="handleImageFile"
  >

  <!-- Inline text editor -->
  <div contenteditable id="text-editor" style="display: none;"></div>

  <!-- Frame name editor -->
  <input type="text" id="frame-name-editor" style="display: none;">
</template>

<style scoped>
/* Presentation playback progress slider */
.presentation-progress-slider {
  width: 120px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--divider, rgba(85, 85, 85, 0.5));
  border-radius: 2px;
  cursor: pointer;
}

.presentation-progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--accent, #6366f1);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 150ms ease;
}

.presentation-progress-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.presentation-progress-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--accent, #6366f1);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

/* Presentation playback panel styling */
.presentation-playback {
  background: var(--panel-bg, rgba(26, 26, 26, 0.95));
  border: 1px solid var(--accent, #6366f1);
}

.dark .presentation-playback {
  background: var(--panel-bg, rgba(26, 26, 26, 0.95));
}

/* Preview mode - ensure controls are centered when only playback shows */
.footer-controls.preview-mode {
  z-index: 200; /* Higher z-index during preview to float above preview container */
}
</style>
