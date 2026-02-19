<script setup>
/**
 * MenuPanel - File menu with export/import options and canvas settings
 *
 * IMPORTANT: This component outputs the EXACT same HTML as getMenuPanelHTML()
 * in core/toolbar.js:
 *
 * <div id="menu-panel" class="popup-panel w-64">
 *   <div class="py-2">
 *     <!-- Canvas Background -->
 *     <div class="px-4 py-3 border-b ...">
 *       <label>Canvas background</label>
 *       <input type="color" id="canvas-bg-color">
 *       <input type="text" id="canvas-bg-hex">
 *     </div>
 *     <!-- Project Duration (video mode only) -->
 *     <div id="menu-duration-section" class="video-mode-only ...">...</div>
 *     <!-- File Operations -->
 *     <button class="menu-item" id="menu-export-png">...</button>
 *     ...
 *   </div>
 * </div>
 */
import { ref, computed, watch } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';
import { getPresentationMode } from '../../composables/usePresentationMode.js';

const { state } = getEditorState();
const presentation = getPresentationMode();

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close','show-help']);

// Explicit computed for class binding
const panelClasses = computed(() => ({
  visible: props.visible
}));

// Canvas background color (synced with state)
const bgColorHex = ref(state.backgroundColor || '#ffffff');

// Sync hex input with color picker
watch(() => state.backgroundColor, (newColor) => {
  if (newColor) {
    bgColorHex.value = newColor;
  }
});

function onColorPickerChange(e) {
  const color = e.target.value;
  bgColorHex.value = color;
  updateBackgroundColor(color);
}

function onHexInputChange(e) {
  let hex = e.target.value.trim();
  // Add # if missing
  if (hex && !hex.startsWith('#')) {
    hex = '#' + hex;
  }
  // Validate hex color
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    bgColorHex.value = hex;
    updateBackgroundColor(hex);
  }
}

function updateBackgroundColor(color) {
  state.backgroundColor = color;
  if (typeof window.render === 'function') {
    window.render();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

// Menu actions
function exportPNG() {
  if (typeof window.exportPNG === 'function') {
    window.exportPNG();
  }
  emit('close');
}

function exportSVG() {
  if (typeof window.exportSVG === 'function') {
    window.exportSVG();
  }
  emit('close');
}

function exportVideo() {
  if (typeof window.exportVideo === 'function') {
    window.exportVideo();
  }
  emit('close');
}

function exportJSON() {
  if (typeof window.exportJSON === 'function') {
    window.exportJSON();
  }
  emit('close');
}

function importJSON() {
  // Trigger file input - the change handler in setup.js will call window.importJSON with the file
  const input = document.getElementById('import-file-input');
  if (input) {
    input.click();
  }
  emit('close');
}

function clearCanvas() {
  if (typeof window.clearCanvas === 'function') {
    window.clearCanvas();
  } else {
    // Fallback
    if (confirm('Clear all shapes from the canvas?')) {
      state.shapes = [];
      state.selectedIndices = [];
      if (typeof window.render === 'function') {
        window.render();
      }
      if (typeof window.saveState === 'function') {
        window.saveState();
      }
    }
  }
  emit('close');
}

function showHelp() {
  emit('close');
  emit('show-help');
}

// Check if in video mode
const isVideoMode = computed(() => state.videoMode);

// Check if we have a presentation recording available
const hasPresentationRecording = computed(() => presentation.hasRecording.value);

// Export presentation video (downloads the recorded blob directly)
function exportPresentationVideo() {
  presentation.downloadVideo();
  emit('close');
}

// Open presentation recording in Video Mode for editing
function editInVideoMode() {
  presentation.openInVideoMode();
  emit('close');
}
</script>

<template>
  <!-- EXACT same structure as legacy getMenuPanelHTML() -->
  <div id="menu-panel" class="popup-panel w-64" :class="panelClasses">
    <div class="py-2">
      <!-- Canvas Background -->
      <div class="px-4 py-3">
        <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Canvas background</label>
        <div class="flex items-center gap-2 mt-2">
          <input
            type="color"
            id="canvas-bg-color"
            :value="bgColorHex"
            class="w-8 h-8"
            @input="onColorPickerChange"
          >
          <input
            type="text"
            id="canvas-bg-hex"
            :value="bgColorHex"
            class="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            @change="onHexInputChange"
          >
        </div>
      </div>

      <div class="menu-divider"></div>

      <!-- File Operations -->
      <button
        v-if="!isVideoMode"
        id="menu-export-png"
        class="menu-item"
        @click="exportPNG"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        Export as PNG
        <span class="shortcut">⌘⇧E</span>
      </button>

      <button
        v-if="!isVideoMode"
        id="menu-export-svg"
        class="menu-item"
        @click="exportSVG"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        Export as SVG
      </button>

      <button
        v-if="isVideoMode"
        id="menu-export-video"
        class="menu-item"
        @click="exportVideo"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        Export Video
        <span class="shortcut">⌘⇧E</span>
      </button>

      <!-- Export Presentation Video (canvas mode with recording) -->
      <button
        v-if="!isVideoMode && hasPresentationRecording"
        id="menu-export-presentation"
        class="menu-item"
        @click="exportPresentationVideo"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        Export Presentation
        <span class="shortcut">⌘⇧E</span>
      </button>

      <!-- Edit Presentation in Video Mode (canvas mode with recording) -->
      <button
        v-if="!isVideoMode && hasPresentationRecording"
        id="menu-edit-in-video-mode"
        class="menu-item"
        @click="editInVideoMode"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
          <line x1="7" y1="2" x2="7" y2="22"/>
          <line x1="17" y1="2" x2="17" y2="22"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <line x1="2" y1="7" x2="7" y2="7"/>
          <line x1="2" y1="17" x2="7" y2="17"/>
          <line x1="17" y1="7" x2="22" y2="7"/>
          <line x1="17" y1="17" x2="22" y2="17"/>
        </svg>
        Edit in Video Mode
      </button>

      <div class="menu-divider"></div>

      <button
        id="menu-export-json"
        class="menu-item"
        @click="exportJSON"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Save as JSON
        <span class="shortcut">⌘S</span>
      </button>

      <button
        id="menu-import-json"
        class="menu-item"
        @click="importJSON"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Import JSON
        <span class="shortcut">⌘O</span>
      </button>

      <div class="menu-divider"></div>

      <button
        id="menu-clear"
        class="menu-item"
        @click="showHelp"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Help
        <span class="shortcut">?</span>
      </button>

      <button
        id="menu-clear"
        class="menu-item"
        @click="clearCanvas"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Clear canvas
      </button>

      <div class="menu-divider"></div>

      <a href="https://artifactuse.com" target="_blank" rel="noopener noreferrer" class="menu-item">
        <svg class="w-4 h-4" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.6667 41.6673V10.4173C16.6667 9.86478 16.4472 9.33488 16.0565 8.94418C15.6658 8.55348 15.1359 8.33398 14.5833 8.33398H4.16667C3.0616 8.33398 2.00179 8.77297 1.22039 9.55437C0.438987 10.3358 0 11.3956 0 12.5007V37.5006C0 38.6057 0.438987 39.6655 1.22039 40.4469C2.00179 41.2283 3.0616 41.6673 4.16667 41.6673H29.1667C30.2717 41.6673 31.3315 41.2283 32.1129 40.4469C32.8943 39.6655 33.3333 38.6057 33.3333 37.5006V27.084C33.3333 26.5314 33.1138 26.0015 32.7231 25.6108C32.3324 25.2201 31.8025 25.0007 31.25 25.0007H0" fill="#5F51C8"></path><path d="M39.5833 0H27.0833C25.9327 0 25 0.93274 25 2.08333V14.5833C25 15.7339 25.9327 16.6667 27.0833 16.6667H39.5833C40.7339 16.6667 41.6667 15.7339 41.6667 14.5833V2.08333C41.6667 0.93274 40.7339 0 39.5833 0Z" fill="#695AE0"></path></svg>
        <span>Artifactuse</span>
      </a>

      <a href="https://artifactuse.com/docs" target="_blank" rel="noopener noreferrer" class="menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>

        <span>Docs</span>
      </a>


      <a href="https://x.com/artifactusehq" target="_blank" rel="noopener noreferrer" class="menu-item">
        <svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.25"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M4 4l11.733 16h4.267l-11.733 -16z"></path><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path></g></svg>
        <span>Follow us</span>
      </a>

      
    </div>
  </div>
</template>

<style>
/*
 * MenuPanel uses global CSS classes from styles/index.css
 * Classes used:
 *   .popup-panel - panel base styling
 *   .menu-item - menu button styling
 *   .menu-divider - divider between menu sections
 *   .shortcut - keyboard shortcut display
 * NO scoped styles - must use global CSS for consistency with legacy
 */
</style>
