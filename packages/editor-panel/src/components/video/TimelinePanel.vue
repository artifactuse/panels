<script setup>
/**
 * TimelinePanel - Docked timeline panel for video mode
 *
 * This component manages the entire timeline UI including:
 * - Unified timeline header with controls, playback, zoom
 * - Timeline body with vis-timeline container
 *
 * The component is teleported into #docked-timeline which is created by legacy code.
 * The vis-timeline is initialized by legacy code into #timeline-container.
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';
import { getVideoState } from '../../composables/useVideoState.js';
import { getViewportKeyframes } from '../../composables/useViewportKeyframes.js';
import PlaybackControls from './PlaybackControls.vue';

// Props
const props = defineProps({
  hidden: {
    type: Boolean,
    default: false
  }
});

const { state, config } = getEditorState();
const videoState = getVideoState();
const viewportKeyframes = getViewportKeyframes();

// Refs for DOM elements
const dropdownRef = ref(null);
const presetBtnRef = ref(null);
const timelineBodyRef = ref(null);
const resizeHandleRef = ref(null);

// Dropdown position for teleported element
const dropdownPosition = ref({ top: 0, left: 0 });

// Check if docked-timeline container exists for Teleport
const dockedTimelineExists = ref(false);

// UI state
const isCollapsed = ref(false);
const dropdownOpen = ref(false);
const isTimelineLoading = ref(true);

// Resize state
const isResizing = ref(false);
const timelineHeight = ref(250); // Default timeline height in pixels
const minTimelineHeight = 150;
const maxTimelineHeight = 500;

// Zoom state
const canvasZoom = ref(100);

// Screen presets from config - use window.CONFIG for correct keys (matches legacy behavior)
const screenPresets = computed(() => {
  // CRITICAL: Use window.CONFIG.screenPresets first to ensure matching keys with applyScreenPreset
  return window.CONFIG?.screenPresets || config.screenPresets || videoState.screenPresets || {
    '1080p': { width: 1920, height: 1080, label: '1080p (16:9)' },
    '720p': { width: 1280, height: 720, label: '720p (16:9)' },
    '4K': { width: 3840, height: 2160, label: '4K UHD (16:9)' },
    'Square': { width: 1080, height: 1080, label: 'Square (1:1)' },
    'Vertical HD': { width: 1080, height: 1920, label: 'Vertical HD (9:16)' },
    'Instagram Portrait': { width: 1080, height: 1350, label: 'Instagram (4:5)' },
  };
});

const currentPresetLabel = computed(() => {
  const presets = screenPresets.value;
  const preset = presets[state.currentPreset];
  return preset?.label?.split(' ')[0] || state.currentPreset || config.video?.defaultPreset || '1080p';
});

// Toggle timeline collapse
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  // Also update the docked-timeline container class and height
  const container = document.getElementById('docked-timeline');
  if (container) {
    container.classList.toggle('collapsed', isCollapsed.value);
    if (isCollapsed.value) {
      // When collapsed, let the container auto-size to just the header
      container.style.height = 'auto';
    } else {
      // When expanded, restore the stored height
      container.style.height = timelineHeight.value + 'px';
    }
  }
  // Trigger canvas resize after collapse animation
  setTimeout(() => {
    if (typeof window.resizeCanvasToFit === 'function') {
      window.resizeCanvasToFit();
    }
  }, 50);
}

// Timeline resize handlers
function startResize(e) {
  e.preventDefault();
  isResizing.value = true;

  const container = document.getElementById('docked-timeline');
  if (!container) return;

  const startY = e.clientY;
  const startHeight = container.offsetHeight;

  // Add dragging class to resize handle
  const handle = container.querySelector('.timeline-resize-handle');
  if (handle) handle.classList.add('dragging');

  function onMouseMove(moveEvent) {
    const deltaY = startY - moveEvent.clientY;
    const newHeight = Math.min(maxTimelineHeight, Math.max(minTimelineHeight, startHeight + deltaY));

    timelineHeight.value = newHeight;
    container.style.height = newHeight + 'px';

    // Resize canvas to fit new available space
    if (typeof window.resizeCanvasToFit === 'function') {
      window.resizeCanvasToFit();
    }

    // Redraw vis-timeline to fit new container height
    if (state.timelineInstance) {
      state.timelineInstance.redraw();
    }

    // Update playhead height to match new timeline height
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }
  }

  function onMouseUp() {
    isResizing.value = false;
    if (handle) handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // Final canvas resize
    if (typeof window.resizeCanvasToFit === 'function') {
      window.resizeCanvasToFit();
    }

    // Redraw timeline if needed
    if (state.timelineInstance) {
      state.timelineInstance.redraw();
    }

    // Update playhead height after resize completes
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Preset dropdown handlers - use teleport for positioning
function togglePresetDropdown(e) {
  e.stopPropagation();

  if (!dropdownOpen.value) {
    // Opening - calculate position based on button
    const btn = presetBtnRef.value;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      // Position above the button (since timeline is at bottom of screen)
      dropdownPosition.value = {
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8
      };
    }
  }

  dropdownOpen.value = !dropdownOpen.value;
}

function selectPreset(presetName) {
  if (typeof window.applyScreenPreset === 'function') {
    window.applyScreenPreset(presetName);
  } else {
    videoState.applyScreenPreset(presetName);
  }
  dropdownOpen.value = false;
}

// Custom size
const customWidth = ref(1920);
const customHeight = ref(1080);

function applyCustomSize() {
  if (typeof window.applyCustomSize === 'function') {
    window.applyCustomSize(customWidth.value, customHeight.value);
  }
  dropdownOpen.value = false;
}

// Layers panel toggle - position and toggle visibility directly (video mode)
function handleLayersClick(e) {
  e.stopPropagation();
  e.preventDefault();

  // Find the layers panel (Vue component in #vue-overlay-root)
  const layersPanel = document.querySelector('#vue-overlay-root #layers-panel');
  if (!layersPanel) {
    console.warn('[TimelinePanel] Layers panel not found');
    return;
  }

  // Get button position for panel placement
  const btn = e.currentTarget;
  const btnRect = btn.getBoundingClientRect();

  // Position panel above the button (since timeline is at the bottom)
  layersPanel.style.position = 'fixed';
  layersPanel.style.bottom = (window.innerHeight - btnRect.top + 8) + 'px';
  layersPanel.style.left = btnRect.left + 'px';
  layersPanel.style.top = 'auto';
  layersPanel.style.right = 'auto';
  layersPanel.style.zIndex = '2000';

  // Toggle visibility
  layersPanel.classList.toggle('visible');

  // Render layers list if panel is now visible
  if (layersPanel.classList.contains('visible') && typeof window.renderLayersList === 'function') {
    window.renderLayersList();
  }
}

// Canvas zoom handlers - use legacy setZoom for proper behavior
function handleZoomIn() {
  const step = config.zoom?.step || 0.1;
  if (typeof window.setZoom === 'function') {
    window.setZoom(state.zoom + step);
  } else {
    state.zoom = Math.min(2, state.zoom + step);
  }
  updateZoomDisplay();
  if (typeof window.render === 'function') window.render();
}

function handleZoomOut() {
  const step = config.zoom?.step || 0.1;
  if (typeof window.setZoom === 'function') {
    window.setZoom(state.zoom - step);
  } else {
    state.zoom = Math.max(0.1, state.zoom - step);
  }
  updateZoomDisplay();
  if (typeof window.render === 'function') window.render();
}

function handleResetZoom() {
  if (typeof window.setZoom === 'function') {
    window.setZoom(1);
  } else {
    state.zoom = 1;
  }
  updateZoomDisplay();
  if (typeof window.render === 'function') window.render();
}

function updateZoomDisplay() {
  canvasZoom.value = Math.round(state.zoom * 100);
}

// Undo/Redo handlers
function handleUndo(e) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof window.undo === 'function') {
    window.undo();
  }
}

function handleRedo(e) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof window.redo === 'function') {
    window.redo();
  }
}

// Add keyframe at current time
function handleAddKeyframe(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  viewportKeyframes.addViewportKeyframe({ time: state.currentTime });
}

// Loop toggle
function handleLoopToggle() {
  if (typeof window.toggleLoop === 'function') {
    window.toggleLoop();
  } else {
    state.loopPlayback = !state.loopPlayback;
  }
}

// Computed for loop state
const isLooping = computed(() => state.loopPlayback || false);

// Split tool - use legacy function
function handleSplit() {
  if (typeof window.splitSelectedAtPlayhead === 'function') {
    window.splitSelectedAtPlayhead();
  }
}

// Add track
function handleAddTrack() {
  if (typeof window.addTrack === 'function') {
    window.addTrack();
  } else {
    videoState.addTrack('video');
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }
}

// Timeline zoom handlers - call vis-timeline methods
function handleTimelineZoomIn() {
  if (state.timelineInstance) {
    state.timelineInstance.zoomIn(0.5);
  }
}

function handleTimelineZoomOut() {
  if (state.timelineInstance) {
    state.timelineInstance.zoomOut(0.5);
  }
}

function handleTimelineFit() {
  if (state.timelineInstance) {
    state.timelineInstance.fit();
  }
}

// Sync zoom slider with state
watch(() => state.zoom, (newZoom) => {
  canvasZoom.value = Math.round(newZoom * 100);
}, { immediate: true });

// Watch hidden prop - hide/show timeline container and redraw when becoming visible
watch(() => props.hidden, (isHidden, wasHidden) => {
  const dockedTimeline = document.getElementById('docked-timeline');

  if (isHidden) {
    // Hide the entire docked-timeline container
    // Use visibility + height:0 to preserve vis-timeline state
    if (dockedTimeline) {
      dockedTimeline.style.visibility = 'hidden';
      dockedTimeline.style.height = '0';
      dockedTimeline.style.overflow = 'hidden';
      dockedTimeline.style.pointerEvents = 'none';
      dockedTimeline.style.borderTop = 'none';
    }
  } else {
    // Restore the container
    if (dockedTimeline) {
      dockedTimeline.style.visibility = '';
      dockedTimeline.style.height = '';
      dockedTimeline.style.overflow = '';
      dockedTimeline.style.pointerEvents = '';
      dockedTimeline.style.borderTop = '';
    }

    // When transitioning from hidden to visible, redraw timeline
    if (wasHidden) {
      // Use nextTick + RAF to ensure DOM is ready
      nextTick(() => {
        requestAnimationFrame(() => {
          // Redraw vis-timeline if it exists
          if (state.timelineInstance) {
            state.timelineInstance.redraw();
          }
          // Also re-position playhead if function exists
          if (typeof window.updatePlayheadPosition === 'function') {
            window.updatePlayheadPosition();
          }
        });
      });
    }
  }
}, { immediate: true });

// Click outside handler for dropdowns
function handleClickOutside(e) {
  // Close preset dropdown
  if (dropdownOpen.value) {
    const selector = document.getElementById('tl-screen-size-selector');
    const dropdown = document.getElementById('tl-screen-size-dropdown');
    // Check if click is outside both the button and the teleported dropdown
    const isOutsideSelector = selector && !selector.contains(e.target);
    const isOutsideDropdown = dropdown && !dropdown.contains(e.target);
    if (isOutsideSelector && isOutsideDropdown) {
      dropdownOpen.value = false;
    }
  }
}

// Check if docked-timeline exists and prepare for Vue content
function setupTimelineContainer() {
  const dockedTimeline = document.getElementById('docked-timeline');
  if (dockedTimeline) {
    dockedTimelineExists.value = true;

    // Set initial height for resize functionality
    if (!dockedTimeline.style.height) {
      dockedTimeline.style.height = timelineHeight.value + 'px';
    } else {
      // Sync ref with existing height
      timelineHeight.value = dockedTimeline.offsetHeight;
    }

    // Clear any legacy content and let Vue take over completely
    // The legacy createFloatingTimeline should skip when Vue is active,
    // but in case there's any leftover content, clear it
    const legacyElements = dockedTimeline.querySelectorAll(':scope > :not(.vue-timeline-content):not(.timeline-resize-handle)');
    legacyElements.forEach(el => {
      el.style.display = 'none';
    });
  }
}

// Watch for timeline loading state - wait for all timeline elements to be ready
function checkTimelineLoaded() {

  // Check 1: timeline instance exists
  if (!state.timelineInstance) {
    return false;
  }

  // Check 2: vis-timeline has rendered its content area
  const timelineContainer = document.getElementById('timeline-container');
  const visContent = timelineContainer?.querySelector('.vis-content');
  if (!visContent) {
    return false;
  }

  // Check 3: playhead element exists and is visible
  const playhead = document.getElementById('custom-playhead');
  const playheadVisible = playhead && playhead.style.display !== 'none';
  if (!playheadVisible) {
    return false;
  }

  // Check 4: playhead layout is ready (set by useTimeline.js updatePlayheadPosition())
  if (!state._playheadLayoutReady) {
    return false;
  }

  // Check 5: track toggles are ready (set by useTimeline.js after injectTrackToggles)
  if (!state._trackTogglesReady) {
    return false;
  }

  // All checks passed! Add delay to ensure everything is painted and CSS transitions complete
  setTimeout(() => {
    isTimelineLoading.value = false;
  }, 1000);
  return true;
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);

  // Initialize from state
  canvasZoom.value = Math.round((state.zoom || 1) * 100);

  // Setup timeline container after App.vue's initVideoWorkspace creates #docked-timeline
  // The container is created in App.vue's onMounted -> requestAnimationFrame -> initVideoWorkspace
  // So we need to keep checking until it exists

  // Initial check
  setupTimelineContainer();

  // Keep checking for container until found (App.vue creates it async)
  const containerCheckInterval = setInterval(() => {
    if (!dockedTimelineExists.value) {
      setupTimelineContainer();
    } else {
      clearInterval(containerCheckInterval);
      // Once container exists, check for timeline loaded state
      checkTimelineLoaded();
    }
  }, 50);

  // Clear interval after 3 seconds max
  setTimeout(() => clearInterval(containerCheckInterval), 3000);

  // Watch for timeline to be fully rendered (not just instance created)
  const checkInterval = setInterval(() => {
    if (checkTimelineLoaded()) {
      clearInterval(checkInterval);
    }
  }, 100);

  // Clear interval after 5 seconds max
  setTimeout(() => clearInterval(checkInterval), 5000);

  // Expose timeline zoom functions globally for legacy code
  window.timelineZoomIn = handleTimelineZoomIn;
  window.timelineZoomOut = handleTimelineZoomOut;
  window.timelineFitAll = handleTimelineFit;
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <!--
    Teleport the entire timeline UI into the docked-timeline container.
    This replaces the legacy HTML generation.
    Only render when the target exists to avoid Vue errors.
  -->
  <Teleport v-if="dockedTimelineExists" to="#docked-timeline">
    <!-- Resize handle at the top of the timeline -->
    <div
      ref="resizeHandleRef"
      class="timeline-resize-handle"
      @mousedown="startResize"
    ></div>

    <div class="vue-timeline-content">
      <!-- Unified Timeline Header -->
      <div class="timeline-header">
        <!-- Left section: Collapse, Preset, Layers, Loop, Split, Add Track -->
        <div class="header-left">
          <!-- Collapse/Expand button -->
          <button
            class="header-icon-btn"
            id="btn-collapse-timeline"
            title="Collapse Timeline"
            @click="toggleCollapse"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              :style="{ transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }"
            >
              <polyline points="6 15 12 9 18 15"/>
            </svg>
          </button>

          <div class="header-divider"></div>

          <!-- Canvas Preset Selector -->
          <div class="preset-selector" id="tl-screen-size-selector">
            <button
              ref="presetBtnRef"
              class="preset-btn"
              id="tl-screen-size-btn"
              @click="togglePresetDropdown"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span>{{ currentPresetLabel }}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>

          <!-- Teleported Preset Dropdown (renders above timeline) -->
          <Teleport to="body">
            <div
              v-show="dropdownOpen"
              ref="dropdownRef"
              class="preset-dropdown preset-dropdown-teleported"
              :class="{ open: dropdownOpen, 'light-mode': !state.darkMode }"
              id="tl-screen-size-dropdown"
              :style="{
                left: dropdownPosition.left + 'px',
                bottom: dropdownPosition.bottom + 'px'
              }"
            >
              <div
                v-for="(preset, key) in screenPresets"
                :key="key"
                class="preset-option"
                :data-preset="key"
                @click="selectPreset(key)"
              >
                <span>{{ preset.label }}</span>
                <span class="preset-dims">{{ preset.width }}×{{ preset.height }}</span>
              </div>
              <div class="preset-divider"></div>
              <div class="preset-custom" @click.stop>
                <input type="number" id="tl-custom-width" placeholder="W" v-model="customWidth">
                <span>×</span>
                <input type="number" id="tl-custom-height" placeholder="H" v-model="customHeight">
                <button class="preset-apply" id="tl-apply-custom-size" @click="applyCustomSize">Apply</button>
              </div>
            </div>
          </Teleport>

          <!-- Layers Button -->
          <button
            id="tl-layers-btn"
            class="header-icon-btn"
            title="Layers"
            @click="handleLayersClick"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </button>

          <div class="header-divider"></div>

          <!-- Loop button -->
          <button
            class="header-icon-btn"
            :class="{ active: isLooping }"
            id="btn-loop"
            title="Loop (L)"
            @click="handleLoopToggle"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </button>

          <div class="header-divider"></div>

          <!-- Split Tool Button -->
          <button
            class="header-text-btn"
            id="btn-split-tool"
            title="Split at Playhead (S)"
            @click="handleSplit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="6" cy="6" r="3"/>
              <path d="M8.12 8.12 12 12"/>
              <path d="M20 4 8.12 15.88"/>
              <circle cx="6" cy="18" r="3"/>
              <path d="M14.8 14.8 20 20"/>
            </svg>
            <span>Split</span>
          </button>

          <!-- Add Track -->
          <button
            v-if="config.timeline?.showAddTrackButton !== false"
            class="header-text-btn"
            id="btn-add-track"
            title="Add Track"
            @click="handleAddTrack"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Add Track</span>
          </button>
        </div>

        <!-- Center section: Playback Controls -->
        <div class="header-center">
          <PlaybackControls />
        </div>

        <!-- Right section: Canvas Zoom, Undo/Redo, Timeline Zoom -->
        <div class="header-right">
          <!-- Canvas Zoom -->
          <div class="header-btn-group">
            <button
              class="header-icon-btn"
              id="tl-zoom-out"
              title="Zoom Out Canvas"
              @click="handleZoomOut"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <span
              class="zoom-display"
              id="tl-zoom-display"
              title="Click to reset zoom"
              @click="handleResetZoom"
            >{{ canvasZoom }}%</span>
            <button
              class="header-icon-btn"
              id="tl-zoom-in"
              title="Zoom In Canvas"
              @click="handleZoomIn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
          </div>

          <div class="header-divider"></div>

          <!-- Undo/Redo -->
          <div class="header-btn-group">
            <button
              class="header-icon-btn"
              id="tl-undo-btn"
              title="Undo (Ctrl+Z)"
              @click="handleUndo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7v6h6"/>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
            </button>
            <button
              class="header-icon-btn"
              id="tl-redo-btn"
              title="Redo (Ctrl+Y)"
              @click="handleRedo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 7v6h-6"/>
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
              </svg>
            </button>
          </div>

          <div class="header-divider"></div>

          <!-- Add Keyframe -->
          <div class="header-btn-group">
            <button
              class="header-icon-btn keyframe-btn"
              id="btn-add-keyframe"
              title="Add Camera Keyframe (K)"
              @click="handleAddKeyframe"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L22 12L12 22L2 12Z"/>
              </svg>
            </button>
          </div>

          <div class="header-divider"></div>

          <!-- Timeline Zoom Controls -->
          <div class="header-btn-group">
            <button
              class="header-icon-btn"
              id="btn-tl-zoom-out"
              title="Zoom Out Timeline"
              @click="handleTimelineZoomOut"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button
              class="header-icon-btn"
              id="btn-tl-zoom-in"
              title="Zoom In Timeline"
              @click="handleTimelineZoomIn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button
              class="header-icon-btn"
              id="btn-tl-fit"
              title="Fit All"
              @click="handleTimelineFit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Timeline Body -->
      <div class="timeline-body-wrapper" :class="{ collapsed: isCollapsed }">
        <div
          ref="timelineBodyRef"
          class="timeline-body bg-gray-100 dark:bg-gray-900"
          id="timeline-body"
        >
          <!-- Loading indicator with fade transition -->
          <Transition name="fade">
            <div v-if="isTimelineLoading" id="timeline-loader" class="timeline-loader">
              <div class="timeline-loader-spinner"></div>
              <span>Loading timeline...</span>
            </div>
          </Transition>
          <!-- vis-timeline renders here -->
          <div id="timeline-container"></div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<!-- Styles moved to src/styles/index.css - Vue Timeline Content section -->