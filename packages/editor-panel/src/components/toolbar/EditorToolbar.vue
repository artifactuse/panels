<script setup>
/**
 * EditorToolbar - Main floating toolbar for the editor
 *
 * IMPORTANT: This component outputs the EXACT same HTML as getToolbarHTML()
 * in core/toolbar.js. The structure is:
 *
 * <div class="toolbar floating-panel flex items-center gap-1 px-2 py-1.5">
 *   <!-- Menu button -->
 *   <button data-toggle="menu" class="toolbar-btn text-gray-600 dark:text-gray-300" title="Menu">
 *     <svg>...</svg>
 *   </button>
 *   <div class="toolbar-divider"></div>
 *   <!-- Hand tool -->
 *   <button data-tool="hand" class="toolbar-btn text-gray-600 dark:text-gray-300" title="Hand (H)">...</button>
 *   <!-- Select tool (active by default) -->
 *   <button data-tool="select" class="toolbar-btn active text-gray-600 dark:text-gray-300" title="Select (V)">...</button>
 *   <!-- Shape tools group -->
 *   <div class="toolbar-divider"></div>
 *   <div class="tool-group" data-group="shapes">...</div>
 *   <!-- Drawing tools group -->
 *   <div class="toolbar-divider"></div>
 *   <div class="tool-group" data-group="drawing">...</div>
 *   <!-- Text, Image, Eraser -->
 *   <div class="toolbar-divider"></div>
 *   <button data-tool="text">...</button>
 *   <button data-tool="image">...</button>
 *   <button data-tool="eraser">...</button>
 *   <!-- FX group (video mode only) -->
 * </div>
 */
import { computed } from 'vue';
import { useEditorState } from '../../composables/useEditorState.js';
import { getClipManagement } from '../../composables/useClipManagement.js';
import { SHORTCUTS } from '../../composables/useKeyboard.js';
import { getRecording } from '../../composables/useRecording.js';
import { getPresentationMode } from '../../composables/usePresentationMode.js';
import ToolButton from './ToolButton.vue';
import ToolGroup from './ToolGroup.vue';
import MCPStatus from '../mcp/Status.vue';

const { state, config, setTool } = useEditorState();
const recording = getRecording();
const presentationMode = getPresentationMode();
const clipManagement = getClipManagement();

const emit = defineEmits(['toggle-menu']);

// Config for tool visibility
const toolbarConfig = computed(() => config.toolbar || {});
const videoConfig = computed(() => config.video || {});
const showShapeTools = computed(() => toolbarConfig.value.showShapeTools !== false);
const showDrawingTools = computed(() => toolbarConfig.value.showDrawingTools !== false);
const showTextTool = computed(() => toolbarConfig.value.showTextTool !== false);
const showImageTool = computed(() => toolbarConfig.value.showImageTool !== false);
const showEraserTool = computed(() => toolbarConfig.value.showEraserTool !== false);

// Video mode - check state.videoMode (set by entry point) rather than config
const isVideoMode = computed(() => state.videoMode === true);

// Presentation mode recording state
// Note: Presentation mode uses state.isRecording (from useEditorState), not recording.state.isRecording
const isPresentationRecording = computed(() => {
  return state.isPresentationMode && state.isRecording;
});

// Video mode recording state
const isVideoRecording = computed(() => {
  return state.videoMode && recording.state.isRecording;
});

// Format recording duration as MM:SS
const recordingTime = computed(() => {
  const seconds = recording.state.recordingDuration || 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
});

// Recording paused state
const isRecordingPaused = computed(() => recording.state.isPaused);

// Hide pan/hand tool in video mode if config option is set
const showPanTool = computed(() => {
  if (isVideoMode.value && videoConfig.value.hidePanTool !== false) {
    return false;
  }
  return true;
});
const effectsConfig = computed(() => config.effects || {});
const filtersConfig = computed(() => config.filters || {});
const transitionsConfig = computed(() => config.transitions || {});
const showFxGroup = computed(() => {
  return isVideoMode.value && (
    effectsConfig.value.enabled !== false ||
    filtersConfig.value.enabled !== false ||
    transitionsConfig.value.enabled !== false
  );
});

// Tool definitions with icons - EXACT same icons as legacy toolbar.js
const shapeTools = [
  {
    id: 'rect',
    name: 'Rectangle',
    shortcut: 'R',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"></rect>'
  },
  {
    id: 'diamond',
    name: 'Diamond',
    shortcut: 'D',
    icon: '<path d="M12 2L22 12L12 22L2 12L12 2z"></path>'
  },
  {
    id: 'ellipse',
    name: 'Ellipse',
    shortcut: 'O',
    icon: '<ellipse cx="12" cy="12" rx="10" ry="7"></ellipse>'
  },
  {
    id: 'triangle',
    name: 'Triangle',
    shortcut: 'T',
    icon: '<path d="M12 3L22 21H2L12 3z"></path>'
  }
];

const drawingTools = [
  {
    id: 'arrow',
    name: 'Arrow',
    shortcut: 'A',
    icon: '<line x1="5" y1="12" x2="19" y2="12"></line><line x1="15" y1="16" x2="19" y2="12"></line><line x1="15" y1="8" x2="19" y2="12"></line>'
  },
  {
    id: 'line',
    name: 'Line',
    shortcut: 'L',
    icon: '<line x1="5" y1="19" x2="19" y2="5"></line>'
  },
  {
    id: 'pen',
    name: 'Draw',
    shortcut: 'P',
    icon: '<path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>'
  }
];

// Icon definitions - EXACT same paths as legacy toolbar.js
const icons = {
  menu: '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>',
  select: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path>',
  text: '<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  eraser: '<path d="M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.82 0L20 9.59a2 2 0 0 1 0 2.82L9 22"></path>',
  fx: '<path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>',
  record: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>',
  // Media icons for video mode
  media: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  video: '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/>',
  audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  // Cursor tool for animated cursors (video mode)
  cursor: '<path d="M4 4l6 16 2-6 6-2L4 4z"/><line x1="14" y1="14" x2="20" y2="20"/>',
  // Dark mode toggle icons (moon for dark, sun for light)
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
  sun: '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',
  help: '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>'
};

// Media tools for video mode - replaces single image button with Image/Video/Audio group
const mediaTools = [
  {
    id: 'image',
    name: 'Image',
    shortcut: SHORTCUTS.media.image,
    icon: icons.image
  },
  {
    id: 'video',
    name: 'Video',
    shortcut: SHORTCUTS.media.video,
    icon: icons.video
  },
  {
    id: 'audio',
    name: 'Audio',
    shortcut: SHORTCUTS.media.audio,
    icon: icons.audio
  }
];

// FX tools for video mode
const fxTools = computed(() => {
  const tools = [];

  if (effectsConfig.value.enabled !== false && effectsConfig.value.items) {
    effectsConfig.value.items.forEach(item => {
      tools.push({
        id: `effect-${item.id}`,
        name: item.name,
        type: 'effect',
        icon: getEffectIcon(item.id)
      });
    });
  }

  if (filtersConfig.value.enabled !== false && filtersConfig.value.items) {
    filtersConfig.value.items.forEach(item => {
      tools.push({
        id: `filter-${item.id}`,
        name: item.name,
        type: 'filter',
        icon: getFilterIcon(item.id)
      });
    });
  }

  if (transitionsConfig.value.enabled !== false && transitionsConfig.value.items) {
    transitionsConfig.value.items.forEach(item => {
      tools.push({
        id: `transition-${item.id}`,
        name: item.name,
        type: 'transition',
        icon: getTransitionIcon(item.id)
      });
    });
  }

  return tools;
});

// Icon helpers - EXACT same as legacy toolbar.js
function getEffectIcon(id) {
  const iconMap = {
    dropShadow: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="8" y="8" width="12" height="12" rx="2" opacity="0.3"/>',
    glow: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="8" opacity="0.3"/><circle cx="12" cy="12" r="10" opacity="0.1"/>',
    vignette: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6" fill="none"/>',
    blur: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6" opacity="0.5"/><circle cx="12" cy="12" r="9" opacity="0.2"/>',
    grain: '<rect x="3" y="3" width="18" height="18"/><circle cx="7" cy="7" r="1"/><circle cx="12" cy="9" r="1"/><circle cx="17" cy="7" r="1"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="15" r="1"/>',
    glitch: '<rect x="3" y="5" width="18" height="4"/><rect x="5" y="10" width="18" height="4"/><rect x="2" y="15" width="18" height="4"/>',
    chromatic: '<circle cx="10" cy="12" r="6" stroke="red" fill="none"/><circle cx="12" cy="12" r="6" stroke="green" fill="none"/><circle cx="14" cy="12" r="6" stroke="blue" fill="none"/>',
    pixelate: '<rect x="3" y="3" width="6" height="6"/><rect x="9" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="15" y="9" width="6" height="6"/>',
  };
  return iconMap[id] || '<circle cx="12" cy="12" r="8"/>';
}

function getFilterIcon(id) {
  const iconMap = {
    brightness: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20" fill="currentColor"/>',
    saturation: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    hue: '<circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20" opacity="0.3"/>',
    grayscale: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="3" y="3" width="9" height="18" fill="currentColor" opacity="0.5"/>',
    sepia: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 3h18v18H3z" fill="#704214" opacity="0.3"/>',
    invert: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20" fill="currentColor"/>',
    temperature: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>',
  };
  return iconMap[id] || '<circle cx="12" cy="12" r="8"/>';
}

function getTransitionIcon(id) {
  const iconMap = {
    fade: '<rect x="3" y="4" width="7" height="16" opacity="0.8"/><rect x="10" y="4" width="4" height="16" opacity="0.4"/><rect x="14" y="4" width="7" height="16" opacity="0.8"/>',
    dissolve: '<rect x="3" y="4" width="8" height="16"/><rect x="13" y="4" width="8" height="16"/><circle cx="12" cy="8" r="2" opacity="0.5"/><circle cx="11" cy="14" r="2" opacity="0.5"/>',
    wipeLeft: '<rect x="3" y="4" width="8" height="16"/><rect x="13" y="4" width="8" height="16" opacity="0.3"/><path d="M11 8l4 4-4 4"/>',
    wipeRight: '<rect x="3" y="4" width="8" height="16" opacity="0.3"/><rect x="13" y="4" width="8" height="16"/><path d="M13 8l-4 4 4 4"/>',
    wipeUp: '<rect x="3" y="4" width="18" height="8"/><rect x="3" y="12" width="18" height="8" opacity="0.3"/><path d="M8 14l4-4 4 4"/>',
    wipeDown: '<rect x="3" y="4" width="18" height="8" opacity="0.3"/><rect x="3" y="12" width="18" height="8"/><path d="M8 10l4 4 4-4"/>',
    slideLeft: '<rect x="3" y="4" width="8" height="16"/><rect x="15" y="4" width="8" height="16"/><path d="M11 12h4"/>',
    slideRight: '<rect x="3" y="4" width="8" height="16"/><rect x="15" y="4" width="8" height="16"/><path d="M9 12h4"/>',
    zoomIn: '<rect x="5" y="6" width="14" height="12" rx="1"/><rect x="8" y="9" width="8" height="6" rx="1"/>',
    zoomOut: '<rect x="8" y="9" width="8" height="6" rx="1"/><rect x="5" y="6" width="14" height="12" rx="1"/>',
    crossZoom: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6" opacity="0.5"/><circle cx="12" cy="12" r="9" opacity="0.2"/>',
    blur: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="7" opacity="0.4"/><circle cx="12" cy="12" r="10" opacity="0.2"/>',
  };
  return iconMap[id] || '<rect x="3" y="4" width="8" height="16"/><rect x="13" y="4" width="8" height="16"/>';
}

function handleToolClick(toolId) {
  // Special handling for image tool in canvas mode - trigger file picker directly
  if (toolId === 'image' && !isVideoMode.value) {
    // Create dynamic file input (same approach as video mode)
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        if (typeof window.addImageToCanvas === 'function') {
          window.addImageToCanvas(e.target.files[0]);
        }
      }
    };
    input.click();
    return;
  }

  // Update Vue state
  setTool(toolId);
  // Also call legacy setTool for UI updates (button states, cursor, etc.)
  if (typeof window.setTool === 'function') {
    window.setTool(toolId);
  }
}

function handleMenuClick() {
  // Emit event to parent App.vue to toggle menu panel
  emit('toggle-menu');
}

function handleFxClick(fxId) {
  // Handle FX tool clicks - these add clips to timeline, not change active tool
  clipManagement.addFxClip(fxId);
}

function handleMediaToolClick(toolId) {
  // Handle media tool clicks in video mode
  // These trigger file pickers for the appropriate media type
  if (toolId === 'image') {
    // Trigger image file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        if (typeof window.addImageToCanvas === 'function') {
          window.addImageToCanvas(e.target.files[0]);
        } else if (typeof window.handleImageUpload === 'function') {
          window.handleImageUpload(e.target.files[0]);
        }
      }
    };
    input.click();
  } else if (toolId === 'video') {
    // Trigger video file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        if (typeof window.addVideoToCanvas === 'function') {
          window.addVideoToCanvas(e.target.files[0]);
        } else if (typeof window.addVideoToTimeline === 'function') {
          window.addVideoToTimeline(e.target.files[0]);
        }
      }
    };
    input.click();
  } else if (toolId === 'audio') {
    // Trigger audio file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        if (typeof window.addAudioToTimeline === 'function') {
          window.addAudioToTimeline(e.target.files[0]);
        } else if (typeof window.handleAudioUpload === 'function') {
          window.handleAudioUpload(e.target.files[0]);
        }
      }
    };
    input.click();
  }
}

function handleThemeToggle() {
  // Toggle dark mode in state
  state.darkMode = !state.darkMode;

  // Apply the theme change - DON'T call toggleDarkMode as it also toggles state.darkMode
  // Instead call the apply functions directly
  if (typeof window.applyVideoDarkMode === 'function') {
    window.applyVideoDarkMode(state.darkMode);
  } else if (typeof window.applyDarkMode === 'function') {
    window.applyDarkMode(state.darkMode);
  }

  // Update shortcuts modal if it exists
  const shortcutsModal = document.querySelector('.shortcuts-modal');
  if (shortcutsModal) {
    shortcutsModal.classList.toggle('light-mode', !state.darkMode);
  }

  // Re-render canvas
  if (typeof window.render === 'function') {
    window.render();
  }
}

function handleHelpClick() {
  // Show keyboard shortcuts modal
  if (typeof window.showHelp === 'function') {
    window.showHelp();
  } else if (typeof window.showShortcutsModal === 'function') {
    window.showShortcutsModal();
  }
}

function handleRecordClick() {
  // Open recording dialog
  recording.openRecordingDialog();
}

function handlePresentationRecordClick() {
  // Enter presentation mode (opens recording dialog for canvas mode)
  presentationMode.enterPresentationMode();
}

async function stopPresentationRecording() {
  // Stop the presentation recording (handles canvas recorder, webcam, shows export modal)
  await presentationMode.stopCanvasRecording();

  // Remove webcam capture shape
  const webcamCaptureIndex = state.shapes.findIndex(
    s => s.type === 'webcamCapture' && s.isRecording
  );
  if (webcamCaptureIndex !== -1) {
    state.shapes.splice(webcamCaptureIndex, 1);
  }

  // Re-render
  if (typeof window.render === 'function') window.render();
}

async function stopVideoRecording() {
  // Stop recording and get blobs
  const blobs = await recording.stopRecording();

  // Dispatch event to App.vue with the recorded blobs
  window.dispatchEvent(new CustomEvent('toolbar:stop-video-recording', {
    detail: blobs
  }));
}

// Toggle pause/resume for recording (works for both presentation and video mode)
function toggleRecordingPause() {
  if (recording.state.isPaused) {
    recording.resumeRecording();
    // Resume playback in video mode
    if (state.videoMode && typeof window.play === 'function') {
      window.play();
    }
  } else {
    recording.pauseRecording();
    // Pause playback in video mode
    if (state.videoMode && typeof window.pause === 'function') {
      window.pause();
    }
  }
}
</script>

<template>
  <!-- EXACT same structure as legacy getToolbarHTML() -->
  <div class="toolbar floating-panel flex items-center gap-1 px-2 py-1.5">
    <!-- Menu button -->
    <button
      data-toggle="menu"
      class="toolbar-btn text-gray-600 dark:text-gray-300"
      title="Menu"
      @click="handleMenuClick"
    >
      <svg
        class="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        v-html="icons.menu"
      />
    </button>

    <div class="toolbar-divider" />

    <!-- Hand tool (hidden in video mode if config.video.hidePanTool is true) -->
    <ToolButton
      v-if="showPanTool"
      tool="hand"
      title="Hand"
      shortcut="H"
      :icon="icons.hand"
      :active="state.currentTool === 'hand'"
      @click="handleToolClick"
    />

    <!-- Select tool (active by default in legacy) -->
    <ToolButton
      tool="select"
      title="Select"
      shortcut="V"
      :icon="icons.select"
      :active="state.currentTool === 'select'"
      @click="handleToolClick"
    />

    <!-- Shape tools group -->
    <template v-if="showShapeTools">
      <div class="toolbar-divider" />
      <ToolGroup
        group-name="shapes"
        :tools="shapeTools"
        :active-tool="state.currentTool"
        @select="handleToolClick"
      />
    </template>

    <!-- Drawing tools group -->
    <template v-if="showDrawingTools">
      <div class="toolbar-divider" />
      <ToolGroup
        group-name="drawing"
        :tools="drawingTools"
        :active-tool="state.currentTool"
        @select="handleToolClick"
      />
    </template>

    <!-- Text, Image/Media, Eraser -->
    <template v-if="showTextTool || showImageTool || showEraserTool">
      <div class="toolbar-divider" />

      <ToolButton
        v-if="showTextTool"
        tool="text"
        title="Text"
        shortcut="X"
        :icon="icons.text"
        :active="state.currentTool === 'text'"
        @click="handleToolClick"
      />

      <!-- Canvas mode: single Image button -->
      <ToolButton
        v-if="showImageTool && !isVideoMode"
        tool="image"
        title="Image"
        shortcut="I"
        :icon="icons.image"
        :active="state.currentTool === 'image'"
        @click="handleToolClick"
      />

      <!-- Video mode: Media tool group (Image/Video/Audio) -->
      <ToolGroup
        v-if="showImageTool && isVideoMode"
        group-name="media"
        :tools="mediaTools"
        :active-tool="state.currentTool"
        :group-icon="icons.media"
        @select="handleMediaToolClick"
      />

      <ToolButton
        v-if="showEraserTool"
        tool="eraser"
        title="Eraser"
        shortcut="E"
        :icon="icons.eraser"
        :active="state.currentTool === 'eraser'"
        @click="handleToolClick"
      />

      <!-- Presentation Recording: Record button OR inline controls -->
      <template v-if="!isVideoMode">
        <!-- When NOT recording: show record button -->
        <button
          v-if="!isPresentationRecording"
          class="toolbar-btn text-gray-600 dark:text-gray-300 presentation-record-btn"
          title="Record Presentation (Shift+P)"
          @click="handlePresentationRecordClick"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="0"
            v-html="icons.record"
          />
        </button>

        <!-- When recording: show inline controls (indicator + timer + pause + stop) -->
        <div v-else class="presentation-recording-controls">
          <!-- Pulsing red indicator -->
          <span class="recording-indicator" :class="{ paused: isRecordingPaused }" />
          <!-- Timer display -->
          <span class="recording-timer">{{ recordingTime }}</span>
          <!-- Pause/Resume button -->
          <button
            class="recording-pause-btn"
            :title="isRecordingPaused ? 'Resume' : 'Pause'"
            @click="toggleRecordingPause"
          >
            <svg v-if="isRecordingPaused" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
          <!-- Stop button -->
          <button
            class="recording-stop-btn"
            title="Stop Recording"
            @click="stopPresentationRecording"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        </div>
      </template>

      <!-- Cursor tool (video mode only) - for animated cursor tutorials -->
      <ToolButton
        v-if="isVideoMode"
        tool="cursor"
        title="Cursor"
        :shortcut="SHORTCUTS.tools.cursor"
        :icon="icons.cursor"
        :active="state.currentTool === 'cursor'"
        class="video-mode-tool"
        @click="handleToolClick"
      />

      <!-- Video Recording: Record button OR inline controls -->
      <template v-if="isVideoMode">
        <!-- When NOT recording: show record button -->
        <button
          v-if="!isVideoRecording"
          class="toolbar-btn text-gray-600 dark:text-gray-300 video-mode-tool record-btn"
          title="Record (Shift+R)"
          @click="handleRecordClick"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="0"
            v-html="icons.record"
          />
        </button>

        <!-- When recording: show inline controls (indicator + timer + pause + stop) -->
        <div v-else class="video-recording-controls video-mode-tool">
          <!-- Pulsing red indicator -->
          <span class="recording-indicator" :class="{ paused: isRecordingPaused }" />
          <!-- Timer display -->
          <span class="recording-timer">{{ recordingTime }}</span>
          <!-- Pause/Resume button -->
          <button
            class="recording-pause-btn"
            :title="isRecordingPaused ? 'Resume' : 'Pause'"
            @click="toggleRecordingPause"
          >
            <svg v-if="isRecordingPaused" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
          <!-- Stop button -->
          <button
            class="recording-stop-btn"
            title="Stop Recording"
            @click="stopVideoRecording"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        </div>
      </template>
    </template>

    <!-- FX group (video mode only) -->
    <template v-if="showFxGroup && fxTools.length > 0">
      <div class="toolbar-divider video-mode-tool" />
      <ToolGroup
        group-name="fx"
        :tools="fxTools"
        :active-tool="''"
        :group-icon="icons.fx"
        class="video-mode-tool"
        @select="handleFxClick"
      />
    </template>

    <!-- Dark mode toggle and Help button (video mode only) -->
    <template v-if="isVideoMode">
      <div class="toolbar-divider video-mode-tool" />

      <!-- Theme toggle -->
      <button
        id="toolbar-theme-toggle"
        class="toolbar-btn text-gray-600 dark:text-gray-300 video-mode-tool"
        title="Toggle dark mode"
        @click="handleThemeToggle"
      >
        <!-- Moon icon (shown in dark mode) -->
        <svg
          class="w-5 h-5 dark-icon"
          :style="{ display: state.darkMode ? 'block' : 'none' }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          v-html="icons.moon"
        />
        <!-- Sun icon (shown in light mode) -->
        <svg
          class="w-5 h-5 light-icon"
          :style="{ display: state.darkMode ? 'none' : 'block' }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          v-html="icons.sun"
        />
      </button>

      <!-- Help button -->
      <button
        id="toolbar-help-btn"
        class="toolbar-btn text-gray-600 dark:text-gray-300 video-mode-tool"
        title="Keyboard shortcuts (?)"
        @click="handleHelpClick"
      >
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          v-html="icons.help"
        />
      </button>
    </template>

    <!-- MCP Status indicator -->
    <!-- <div class="toolbar-divider" /> -->
    <MCPStatus />

  </div>
</template>

<style>
/*
 * EditorToolbar uses global CSS classes from styles/index.css
 * Classes used:
 *   .toolbar - main container
 *   .floating-panel - panel styling
 *   .toolbar-btn - button styling
 *   .toolbar-divider - separator styling
 * Tailwind: flex, items-center, gap-1, px-2, py-1.5, text-gray-600, dark:text-gray-300
 * NO scoped styles - must use global CSS for consistency with legacy
 */

/* Video mode specific tools - hidden by default */
.video-mode-tool {
  display: none;
}

.video-mode .video-mode-tool {
  display: flex;
}

/* Record button styles */
.record-btn svg {
  color: #ef4444;
}

.record-btn:hover svg {
  color: #dc2626;
}

.record-btn.recording svg {
  animation: record-pulse 1s ease-in-out infinite;
}

@keyframes record-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Presentation record button styles (canvas mode) */
.presentation-record-btn svg {
  color: #ef4444;
}

.presentation-record-btn:hover svg {
  color: #dc2626;
}

/* Inline presentation recording controls */
.presentation-recording-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
}

.recording-indicator {
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  animation: record-pulse 1s ease-in-out infinite;
}

.recording-indicator.paused {
  animation: none;
  opacity: 0.5;
}

.recording-timer {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #ef4444;
  min-width: 42px;
}

.recording-stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #ef4444;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background 150ms ease;
}

.recording-stop-btn:hover {
  background: #dc2626;
}

.recording-pause-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #ef4444;
  cursor: pointer;
  transition: background 150ms ease;
}

.recording-pause-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.dark .presentation-recording-controls {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
}

/* Video mode inline recording controls (same styling as presentation) */
.video-recording-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
}

.dark .video-recording-controls {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
}
</style>
