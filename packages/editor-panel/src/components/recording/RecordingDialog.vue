<script setup>
/**
 * RecordingDialog - Device selection dialog for screen/webcam recording
 * 
 * UPDATED: Now includes tab selection for reliable cursor tracking
 *
 * Usage:
 * <RecordingDialog
 *   v-if="showRecordingDialog"
 *   :dark-mode="state.darkMode"
 *   @start="handleStartRecording"
 *   @cancel="showRecordingDialog = false"
 * />
 *
 * Events:
 * - start: Emitted with { screen: MediaStream, webcam: MediaStream, audio: MediaStream } when user starts
 * - cancel: Emitted when user cancels or closes the dialog
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { getRecording } from '../../composables/useRecording.js';
import { getEditorState } from '../../composables/useEditorState.js';
import { defaultConfig } from '../../config/defaults.js';

const props = defineProps({
  darkMode: {
    type: Boolean,
    default: true
  },
  presentationMode: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['start', 'cancel']);

// Get recording composable
const recording = getRecording();

// Get editor state (for hideSelectionInRecording toggle)
const { state: editorState } = getEditorState();

// Local state
const step = ref('devices'); // 'devices' | 'preview' | 'tab-select'
const isLoading = ref(false);
const error = ref('');

// Extension state
const extensionChecked = ref(false);
const extensionAvailable = computed(() => recording.state.extensionAvailable);
const extensionConnected = computed(() => recording.state.extensionConnected);
const extensionId = ref('');

// LocalStorage key for extension ID
const EXTENSION_ID_STORAGE_KEY = 'artifactuse-cursor-extension-id';

// Tab selection state (NEW)
const availableTabs = ref([]);
const selectedTabId = ref(null);
const selectedTabInfo = ref(null);
const recordAllTabs = ref(false);
const loadingTabs = ref(false);

// Device selections
const selectedScreenSource = ref('screen'); // 'screen' | 'window' | 'tab'
const selectedCamera = ref(null);
const selectedMic = ref(null);
const includeWebcam = ref(true);
const includeMic = ref(true);

// Interaction recording options (parent toggle for cursor + auto-zoom)
const interactionRecording = ref(false);
const recordCursor = ref(false);
const autoZoomOnClick = ref(false);
const zoomLevel = ref(2.0);

// Pencil cursor styles for presentation mode (from centralized config)
const pencilStyles = computed(() =>
  Object.entries(defaultConfig.pencilTypes).map(([key, config]) => ({
    value: key,
    label: config.name,
    emoji: config.emoji,
  }))
);

// Preview streams
const screenPreviewRef = ref(null);
const webcamPreviewRef = ref(null);
const hasScreenPreview = ref(false);
const hasWebcamPreview = ref(false);

// Computed device lists
const videoDevices = computed(() => recording.state.availableVideoDevices);
const audioDevices = computed(() => recording.state.availableAudioDevices);

// Check if recording is supported
const isSupported = computed(() => recording.isRecordingSupported());

// Check if we need tab selection (browser tab recording with interaction recording + extension)
const needsTabSelection = computed(() => {
  return interactionRecording.value &&
         extensionConnected.value &&
         hasScreenPreview.value &&
         recording.state.recordingDisplaySurface === 'browser';
});

// Initialize devices on mount
onMounted(async () => {
  if (!isSupported.value) {
    error.value = 'Recording is not supported in this browser';
    return;
  }

  document.addEventListener('keydown', handleKeydown);

  // Load saved extension ID from localStorage
  const savedExtensionId = localStorage.getItem(EXTENSION_ID_STORAGE_KEY);
  if (savedExtensionId) {
    extensionId.value = savedExtensionId;
    recording.setExtensionId(savedExtensionId);
  }

  isLoading.value = true;
  try {
    await recording.getAvailableDevices();

    // Set defaults
    if (videoDevices.value.length > 0) {
      selectedCamera.value = videoDevices.value[0].id;
    }
    if (audioDevices.value.length > 0) {
      selectedMic.value = audioDevices.value[0].id;
    }

    // Check for extension availability
    extensionChecked.value = true;
    await recording.checkExtension();
  } catch (err) {
    error.value = 'Failed to get available devices';
  } finally {
    isLoading.value = false;
  }
});

// Save extension ID and test connection
async function saveExtensionId() {
  if (!extensionId.value) return;

  // Save to localStorage for persistence
  localStorage.setItem(EXTENSION_ID_STORAGE_KEY, extensionId.value);

  recording.setExtensionId(extensionId.value);
  await nextTick();
  await recording.checkExtension();
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  cleanupPreviews();
});

// Handle escape key
function handleKeydown(e) {
  if (e.key === 'Escape') {
    handleCancel();
  }
}

// Handle backdrop click
function handleBackdropClick(e) {
  if (e.target === e.currentTarget) {
    handleCancel();
  }
}

// Request screen capture preview
async function requestScreenPreview() {
  error.value = '';
  isLoading.value = true;

  try {
    // Set interaction recording option BEFORE requesting screen capture
    // This ensures cursor: 'never' is applied if interaction recording is enabled
    // (we want to hide OS cursor when capturing clicks for zoom even without cursor overlay)
    recording.setRecordInteractions(interactionRecording.value);

    const stream = await recording.requestScreenCapture();
    if (stream && screenPreviewRef.value) {
      screenPreviewRef.value.srcObject = stream;
      hasScreenPreview.value = true;
    }
  } catch (err) {
    error.value = recording.state.error || 'Failed to capture screen';
  } finally {
    isLoading.value = false;
  }
}

// Request webcam preview
async function requestWebcamPreview() {
  if (!includeWebcam.value || !selectedCamera.value) return;

  try {
    const stream = await recording.requestWebcamCapture(selectedCamera.value);
    if (stream && webcamPreviewRef.value) {
      webcamPreviewRef.value.srcObject = stream;
      hasWebcamPreview.value = true;
    }
  } catch (err) {
    // Don't show error for webcam, just disable it
    includeWebcam.value = false;
  }
}

// Cleanup preview streams
function cleanupPreviews() {
  if (screenPreviewRef.value) {
    screenPreviewRef.value.srcObject = null;
  }
  if (webcamPreviewRef.value) {
    webcamPreviewRef.value.srcObject = null;
  }
  hasScreenPreview.value = false;
  hasWebcamPreview.value = false;
}

// Proceed to preview step
async function proceedToPreview() {
  step.value = 'preview';
  await requestScreenPreview();
  if (includeWebcam.value) {
    await requestWebcamPreview();
  }
}

// Load available tabs from extension (NEW)
async function loadAvailableTabs() {
  loadingTabs.value = true;
  error.value = '';
  
  try {
    const tabs = await recording.getExtensionTabs();
    availableTabs.value = tabs;
    
    // Check if there's already a recorded tab set
    const { recordedTabId, tabInfo } = await recording.getRecordedTab();
    if (recordedTabId) {
      selectedTabId.value = recordedTabId;
      selectedTabInfo.value = tabInfo;
    }
  } catch (err) {
    error.value = 'Failed to load browser tabs';
    console.error('[RecordingDialog] Failed to load tabs:', err);
  } finally {
    loadingTabs.value = false;
  }
}

// Proceed to tab selection step (NEW)
async function proceedToTabSelect() {
  step.value = 'tab-select';
  await loadAvailableTabs();
}

// Select a tab for recording (NEW)
function selectTab(tab) {
  selectedTabId.value = tab.id;
  selectedTabInfo.value = tab;
  recordAllTabs.value = false;
}

// Handle "record all tabs" toggle (NEW)
function handleRecordAllChange() {
  if (recordAllTabs.value) {
    selectedTabId.value = null;
    selectedTabInfo.value = null;
  }
}

// Confirm tab selection and proceed to start (NEW)
async function confirmTabSelection() {
  const tabId = recordAllTabs.value ? null : selectedTabId.value;
  
  // Set the recorded tab in the extension
  const result = await recording.setRecordedTab(tabId);
  
  if (result.ok || recordAllTabs.value) {
    // Proceed to start recording
    await handleStart();
  } else {
    error.value = `Failed to set recorded tab: ${result.error}`;
  }
}

// Go back from tab selection to preview (NEW)
function backToPreview() {
  step.value = 'preview';
}

// Focus on the selected tab (NEW)
async function focusSelectedTab() {
  if (selectedTabId.value) {
    await recording.setRecordedTab(selectedTabId.value);
    await recording.focusRecordedTab();
  }
}

// Truncate URL for display (NEW)
function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.substring(0, 30) + '...' : u.pathname;
    return u.hostname + path;
  } catch {
    return url.substring(0, 50) + (url.length > 50 ? '...' : '');
  }
}

// Handle camera selection change
async function handleCameraChange() {
  if (hasWebcamPreview.value && recording.state.webcamStream) {
    recording.state.webcamStream.getTracks().forEach(t => t.stop());
  }
  if (includeWebcam.value && selectedCamera.value) {
    await requestWebcamPreview();
  }
}

// Handle start recording
async function handleStart() {
  // In presentation mode, we don't need screen capture (canvas is recorded directly)
  if (!props.presentationMode && !hasScreenPreview.value) {
    error.value = 'Please select a screen to share';
    return;
  }

  // Request microphone if enabled
  if (includeMic.value && selectedMic.value) {
    await recording.requestMicrophoneCapture(selectedMic.value);
  }

  // Set recording options before starting
  // recordInteractions = master toggle for cursor/click data capture
  // recordCursor = whether to show cursor overlay in output
  // autoZoomOnClick = whether to generate viewport keyframes for zoom
  recording.setRecordInteractions(interactionRecording.value);
  recording.setRecordCursor(recordCursor.value);
  recording.setAutoZoomOnClick(autoZoomOnClick.value);
  recording.setZoomLevel(zoomLevel.value);

  // Start extension recording if interaction recording is enabled and extension is connected
  if (interactionRecording.value && extensionConnected.value) {
    // The recorded tab should already be set via confirmTabSelection() or setRecordedTab()
    await recording.startExtensionRecording();
  }

  emit('start', {
    screen: props.presentationMode ? null : recording.state.screenStream,
    webcam: includeWebcam.value ? recording.state.webcamStream : null,
    audio: includeMic.value ? recording.state.audioStream : null
  });
}

// Handle start for presentation mode (skip screen capture)
async function handlePresentationStart() {
  // Request webcam if enabled
  if (includeWebcam.value && selectedCamera.value) {
    await recording.requestWebcamCapture(selectedCamera.value);
  }

  // Request microphone if enabled
  if (includeMic.value && selectedMic.value) {
    await recording.requestMicrophoneCapture(selectedMic.value);
  }

  emit('start', {
    screen: null, // No screen capture in presentation mode
    webcam: includeWebcam.value ? recording.state.webcamStream : null,
    audio: includeMic.value ? recording.state.audioStream : null
  });
}

// Handle "Start Recording" click from preview step
async function handleStartClick() {
  // If we need tab selection, go to that step first
  if (needsTabSelection.value) {
    await proceedToTabSelect();
  } else {
    // Otherwise start directly
    // For non-browser recordings with extension, set to record all tabs
    if (interactionRecording.value && extensionConnected.value) {
      await recording.setRecordedTab(null); // Record all tabs
    }
    await handleStart();
  }
}

// Handle cancel
function handleCancel() {
  cleanupPreviews();
  recording.stopAllStreams();
  emit('cancel');
}

// Watch for webcam toggle
watch(includeWebcam, async (enabled) => {
  if (step.value === 'preview') {
    if (enabled && selectedCamera.value) {
      await requestWebcamPreview();
    } else if (!enabled && recording.state.webcamStream) {
      recording.state.webcamStream.getTracks().forEach(t => t.stop());
      hasWebcamPreview.value = false;
    }
  }
});

// Watch for interaction recording toggle - need to re-request screen capture to apply cursor: 'never'
watch(interactionRecording, async (enabled) => {
  if (step.value === 'preview' && hasScreenPreview.value) {
    // Stop existing screen stream
    if (recording.state.screenStream) {
      recording.state.screenStream.getTracks().forEach(t => t.stop());
    }
    hasScreenPreview.value = false;

    // Re-request with new cursor setting
    recording.setRecordInteractions(enabled);
    await requestScreenPreview();
  }

  // When parent is disabled, disable both children
  if (!enabled) {
    recordCursor.value = false;
    autoZoomOnClick.value = false;
  }
});
</script>

<template>
  <div
    class="recording-dialog"
    :class="{ 'light-mode': !darkMode }"
    @click="handleBackdropClick"
  >
    <div class="recording-dialog-content">
      <!-- Header -->
      <div class="recording-dialog-header">
        <h3 class="recording-dialog-title">
          {{ step === 'tab-select' ? 'Select Tab to Record' : (presentationMode ? 'Record Presentation' : 'Record Video') }}
        </h3>
        <button class="recording-dialog-close" @click="handleCancel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Not Supported Message -->
      <div v-if="!isSupported" class="recording-error">
        Recording is not supported in this browser. Please use Chrome, Firefox, or Edge.
      </div>

      <!-- Device Selection Step -->
      <template v-else-if="step === 'devices'">
        <!-- Presentation mode info -->
        <div v-if="presentationMode" class="recording-info" style="margin-bottom: 16px;">
          Record yourself explaining your canvas work. The canvas content will be captured automatically.
        </div>

        <!-- Hide Selection Boxes in Recording (presentation mode only) -->
        <div v-if="presentationMode" class="recording-source-section">
          <div class="recording-source-header">
            <label class="recording-source-label">Hide Selection Boxes</label>
            <label class="recording-toggle">
              <input type="checkbox" v-model="editorState.hideSelectionInRecording" />
              <span class="recording-toggle-slider"></span>
            </label>
          </div>
          <div v-if="editorState.hideSelectionInRecording" class="recording-option-desc">
            Selection boxes will be visible to you but hidden in the recording output
          </div>
          <div v-else class="recording-disabled-text">
            Selection boxes will appear in the recording
          </div>
        </div>

        <!-- Drawing Pencil Cursor (presentation mode only) -->
        <div v-if="presentationMode" class="recording-source-section">
          <div class="recording-source-header">
            <label class="recording-source-label">Drawing Pencil</label>
            <label class="recording-toggle">
              <input type="checkbox" v-model="editorState.showDrawingPencil" />
              <span class="recording-toggle-slider"></span>
            </label>
          </div>
          <div v-if="editorState.showDrawingPencil" class="recording-option-desc">
            Show an animated pencil following your cursor while drawing
          </div>
          <div v-else class="recording-disabled-text">
            No pencil cursor in recording
          </div>

          <!-- Pencil style selector (only when pencil is enabled) -->
          <div v-if="editorState.showDrawingPencil" class="recording-pencil-style">
            <label class="recording-pencil-style-label">Style</label>
            <div class="recording-pencil-options">
              <button
                v-for="style in pencilStyles"
                :key="style.value"
                class="recording-pencil-btn"
                :class="{ active: editorState.drawingPencilStyle === style.value }"
                @click="editorState.drawingPencilStyle = style.value"
                :title="style.label"
              >
                {{ style.emoji }}
              </button>
            </div>
          </div>
        </div>

        <!-- Screen Source (hidden in presentation mode - canvas is recorded directly) -->
        <div v-if="!presentationMode" class="recording-source-section">
          <label class="recording-source-label">Screen Source</label>
          <div class="recording-source-options">
            <button
              class="recording-source-btn"
              :class="{ active: selectedScreenSource === 'screen' }"
              @click="selectedScreenSource = 'screen'"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <span>Entire Screen</span>
            </button>
          </div>
        </div>

        <!-- Camera Selection -->
        <div class="recording-source-section">
          <div class="recording-source-header">
            <label class="recording-source-label">Camera</label>
            <label class="recording-toggle">
              <input type="checkbox" v-model="includeWebcam" />
              <span class="recording-toggle-slider"></span>
            </label>
          </div>
          <select
            v-if="includeWebcam"
            class="recording-source-select"
            v-model="selectedCamera"
          >
            <option v-for="device in videoDevices" :key="device.id" :value="device.id">
              {{ device.label }}
            </option>
          </select>
          <div v-else class="recording-disabled-text">Camera disabled</div>
        </div>

        <!-- Microphone Selection -->
        <div class="recording-source-section">
          <div class="recording-source-header">
            <label class="recording-source-label">Microphone</label>
            <label class="recording-toggle">
              <input type="checkbox" v-model="includeMic" />
              <span class="recording-toggle-slider"></span>
            </label>
          </div>
          <select
            v-if="includeMic"
            class="recording-source-select"
            v-model="selectedMic"
          >
            <option v-for="device in audioDevices" :key="device.id" :value="device.id">
              {{ device.label }}
            </option>
          </select>
          <div v-else class="recording-disabled-text">Microphone disabled</div>
        </div>

        <!-- Interaction Recording (Parent Section for Cursor + Auto-Zoom) - hidden in presentation mode -->
        <div v-if="!presentationMode" class="recording-source-section">
          <div class="recording-source-header">
            <label class="recording-source-label">Interaction Recording</label>
            <label class="recording-toggle">
              <input type="checkbox" v-model="interactionRecording" />
              <span class="recording-toggle-slider"></span>
            </label>
          </div>

          <div v-if="interactionRecording" class="recording-option-desc">
            Record mouse movements and clicks for cursor overlay and zoom effects
          </div>
          <div v-else class="recording-disabled-text">Mouse interactions not recorded</div>

          <!-- Nested options (only visible when parent is enabled) -->
          <div v-if="interactionRecording" class="recording-sub-option">
            <!-- Cursor Overlay Toggle -->
            <div class="recording-nested-row">
              <label class="recording-nested-label">Show Cursor Overlay</label>
              <label class="recording-toggle recording-toggle-small">
                <input type="checkbox" v-model="recordCursor" />
                <span class="recording-toggle-slider"></span>
              </label>
            </div>
            <div class="recording-nested-desc">
              Creates an animated cursor clip that follows your mouse
            </div>

            <!-- Auto-Zoom Toggle -->
            <div class="recording-nested-row recording-nested-row-spaced">
              <label class="recording-nested-label">Auto-Zoom on Clicks</label>
              <label class="recording-toggle recording-toggle-small">
                <input type="checkbox" v-model="autoZoomOnClick" />
                <span class="recording-toggle-slider"></span>
              </label>
            </div>
            <div class="recording-nested-desc">
              Automatically zoom to click locations
            </div>

            <!-- Zoom Level Slider (only when auto-zoom enabled) -->
            <div v-if="autoZoomOnClick" class="recording-zoom-option">
              <label class="recording-zoom-label">Zoom Level</label>
              <div class="recording-slider-row">
                <input
                  type="range"
                  min="1.5"
                  max="4"
                  step="0.5"
                  v-model.number="zoomLevel"
                  class="recording-slider"
                />
                <span class="recording-slider-value">{{ zoomLevel }}x</span>
              </div>
            </div>
          </div>

          <!-- Extension Status (shown when interaction recording enabled) -->
          <div v-if="interactionRecording && extensionChecked" class="recording-extension-status">
            <div v-if="extensionConnected" class="recording-extension-connected">
              <svg class="recording-extension-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Extension connected - global cursor tracking enabled</span>
            </div>
            <div v-else class="recording-extension-setup">
              <div class="recording-extension-info">
                <svg class="recording-extension-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span>For tracking cursor on external windows, install the extension</span>
              </div>
              <div class="recording-extension-id-input">
                <input
                  v-model="extensionId"
                  type="text"
                  placeholder="Extension ID (from chrome://extensions)"
                  class="recording-extension-input"
                  @blur="saveExtensionId"
                  @keyup.enter="saveExtensionId"
                />
                <button
                  v-if="extensionId && !extensionConnected"
                  class="recording-extension-test-btn"
                  @click="saveExtensionId"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="recording-error">{{ error }}</div>

        <!-- Actions -->
        <div class="recording-dialog-actions">
          <button class="recording-dialog-btn cancel" @click="handleCancel">Cancel</button>
          <!-- In presentation mode, start directly (no screen preview needed) -->
          <button
            v-if="presentationMode"
            class="recording-dialog-btn start"
            :disabled="isLoading"
            @click="handlePresentationStart"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            {{ isLoading ? 'Loading...' : 'Start Recording' }}
          </button>
          <!-- In video mode, continue to preview -->
          <button
            v-else
            class="recording-dialog-btn continue"
            :disabled="isLoading"
            @click="proceedToPreview"
          >
            {{ isLoading ? 'Loading...' : 'Continue' }}
          </button>
        </div>
      </template>

      <!-- Preview Step -->
      <template v-else-if="step === 'preview'">
        <!-- Screen Preview -->
        <div class="recording-preview-container">
          <div
            class="recording-preview"
            :class="{ active: hasScreenPreview, clickable: !hasScreenPreview && !isLoading }"
            @click="!hasScreenPreview && !isLoading && requestScreenPreview()"
          >
            <video
              ref="screenPreviewRef"
              autoplay
              muted
              playsinline
            ></video>
            <div v-if="!hasScreenPreview" class="recording-preview-placeholder">
              <svg v-if="!isLoading" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <span v-if="isLoading">Requesting screen access...</span>
              <span v-else>Click to select screen</span>
            </div>
          </div>

          <!-- Webcam Preview (PiP) -->
          <div
            v-if="includeWebcam"
            class="recording-webcam-preview"
            :class="{ active: hasWebcamPreview }"
          >
            <video
              ref="webcamPreviewRef"
              autoplay
              muted
              playsinline
            ></video>
            <div v-if="!hasWebcamPreview" class="recording-preview-placeholder">
              Camera
            </div>
          </div>
        </div>

        <!-- Camera Selection (in preview) -->
        <div v-if="includeWebcam && videoDevices.length > 1" class="recording-source-section compact">
          <label class="recording-source-label">Camera</label>
          <select
            class="recording-source-select"
            v-model="selectedCamera"
            @change="handleCameraChange"
          >
            <option v-for="device in videoDevices" :key="device.id" :value="device.id">
              {{ device.label }}
            </option>
          </select>
        </div>

        <!-- Interaction recording warning for external windows -->
        <div v-if="interactionRecording && hasScreenPreview && recording.state.recordingDisplaySurface !== 'browser' && !extensionConnected" class="recording-warning">
          <strong>Note:</strong> You're recording an external {{ recording.state.recordingDisplaySurface === 'window' ? 'window' : 'screen' }}.
          Mouse interactions will be tracked on THIS page, not the recorded content.
          For best results, record this browser tab instead or connect the cursor recorder extension.
        </div>

        <!-- Extension active notice for external windows -->
        <div v-if="interactionRecording && hasScreenPreview && recording.state.recordingDisplaySurface !== 'browser' && extensionConnected" class="recording-success">
          <strong>Extension active!</strong> Mouse interactions will be tracked across all browser tabs.
          Interactions on external apps won't be captured.
        </div>

        <!-- Browser tab with extension - will go to tab selection -->
        <div v-if="needsTabSelection" class="recording-info">
          <strong>Next step:</strong> You'll select which browser tab to track mouse interactions from.
          This ensures accurate positioning for cursor overlay and zoom effects.
        </div>

        <!-- Success message when recording current tab without extension -->
        <div v-if="interactionRecording && hasScreenPreview && recording.state.recordingDisplaySurface === 'browser' && !extensionConnected" class="recording-success">
          <strong>Perfect!</strong> You're recording this browser tab.
          Mouse interactions will be accurately captured.
        </div>

        <!-- OS cursor visibility warning -->
        <div v-if="interactionRecording && hasScreenPreview && recording.state.recordingDisplaySurface" class="recording-info">
          <strong>Tip:</strong> The OS cursor may still appear in the recording depending on your browser.
          You can hide the OS cursor shape in the layers panel or delete it after recording.
        </div>

        <!-- Error -->
        <div v-if="error" class="recording-error">{{ error }}</div>

        <!-- Actions -->
        <div class="recording-dialog-actions">
          <button class="recording-dialog-btn cancel" @click="step = 'devices'">Back</button>
          <button
            class="recording-dialog-btn start"
            :disabled="!hasScreenPreview || isLoading"
            @click="handleStartClick"
          >
            <svg v-if="!needsTabSelection" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            {{ needsTabSelection ? 'Select Tab →' : 'Start Recording' }}
          </button>
        </div>
      </template>

      <!-- Tab Selection Step (NEW) -->
      <template v-else-if="step === 'tab-select'">
        <div class="recording-tab-select-info">
          Choose which browser tab you want to capture cursor movements from.
          This should match the tab you selected for screen recording.
        </div>

        <!-- Tab List -->
        <div v-if="loadingTabs" class="recording-loading-tabs">
          Loading browser tabs...
        </div>
        
        <div v-else-if="availableTabs.length > 0" class="recording-tab-list">
          <button
            v-for="tab in availableTabs"
            :key="tab.id"
            class="recording-tab-item"
            :class="{ 
              selected: selectedTabId === tab.id && !recordAllTabs,
              active: tab.active
            }"
            @click="selectTab(tab)"
          >
            <img 
              v-if="tab.favIconUrl" 
              :src="tab.favIconUrl" 
              class="recording-tab-favicon"
              @error="$event.target.style.display='none'"
            />
            <div v-else class="recording-tab-favicon-placeholder">🌐</div>
            
            <div class="recording-tab-info">
              <div class="recording-tab-title">
                {{ tab.title }}
                <span v-if="tab.active" class="recording-tab-badge active">Active</span>
              </div>
              <div class="recording-tab-url">{{ truncateUrl(tab.url) }}</div>
            </div>
            
            <div v-if="selectedTabId === tab.id && !recordAllTabs" class="recording-tab-check">✓</div>
          </button>
        </div>

        <div v-else class="recording-no-tabs">
          No browser tabs found. Make sure the extension has permission to access tabs.
        </div>

        <!-- Record all tabs option -->
        <!-- <div class="recording-all-tabs-option">
          <label class="recording-checkbox-label">
            <input 
              type="checkbox" 
              v-model="recordAllTabs"
              @change="handleRecordAllChange"
            />
            <span>Record cursor from all tabs (for window/screen recording)</span>
          </label>
        </div> -->

        <!-- Selected tab indicator -->
        <div v-if="selectedTabInfo && !recordAllTabs" class="recording-selected-tab">
          <strong>Selected:</strong> {{ selectedTabInfo.title }}
          <button class="recording-focus-btn" @click="focusSelectedTab" title="Go to this tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>

        <!-- Error -->
        <div v-if="error" class="recording-error">{{ error }}</div>

        <!-- Actions -->
        <div class="recording-dialog-actions">
          <button class="recording-dialog-btn cancel" @click="backToPreview">Back</button>
          <button
            class="recording-dialog-btn start"
            :disabled="!selectedTabId && !recordAllTabs"
            @click="confirmTabSelection"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            Start Recording
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.recording-dialog {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}

.recording-dialog-content {
  background: var(--panel-bg, #1a1a1a);
  color: var(--text-primary, #e5e7eb);
  border-radius: 16px;
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.recording-dialog.light-mode .recording-dialog-content {
  background: var(--panel-bg, #f9fafc);
  color: var(--text-primary, #374151);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

/* Header */
.recording-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.recording-dialog-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.recording-dialog-close {
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

.recording-dialog-close:hover {
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  color: var(--accent, #6366f1);
}

/* Source sections */
.recording-source-section {
  margin-bottom: 16px;
}

.recording-source-section.compact {
  margin-bottom: 12px;
}

.recording-source-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.recording-source-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.recording-dialog.light-mode .recording-source-label {
  color: var(--text-secondary, #6b7280);
}

/* Toggle switch */
.recording-toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.recording-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.recording-toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: var(--divider, rgba(85, 85, 85, 0.5));
  transition: 150ms;
  border-radius: 22px;
}

.recording-toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 150ms;
  border-radius: 50%;
}

.recording-toggle input:checked + .recording-toggle-slider {
  background-color: var(--accent, #6366f1);
}

.recording-toggle input:checked + .recording-toggle-slider:before {
  transform: translateX(18px);
}

/* Source options */
.recording-source-options {
  display: flex;
  gap: 8px;
}

.recording-source-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 2px solid var(--panel-border, rgba(85, 85, 85, 0.3));
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  transition: all 150ms ease;
}

.recording-dialog.light-mode .recording-source-btn {
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
  color: var(--text-secondary, #6b7280);
}

.recording-source-btn:hover {
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
}

.recording-source-btn.active {
  border-color: var(--accent, #6366f1);
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  color: var(--accent, #6366f1);
}

.recording-source-btn span {
  font-size: 12px;
  font-weight: 500;
}

/* Select dropdown */
.recording-source-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.3));
  border-radius: 8px;
  background: var(--panel-bg, #1a1a1a);
  color: var(--text-primary, #e5e7eb);
  font-size: 14px;
  cursor: pointer;
}

.recording-dialog.light-mode .recording-source-select {
  background: var(--panel-bg, #f9fafc);
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
  color: var(--text-primary, #374151);
}

.recording-source-select:focus {
  outline: none;
  border-color: var(--accent, #6366f1);
}

/* Disabled text */
.recording-disabled-text {
  font-size: 13px;
  color: var(--text-muted, #6b7280);
  font-style: italic;
}


/* Preview */
.recording-preview-container {
  position: relative;
  margin-bottom: 16px;
}

.recording-preview {
  position: relative;
  width: 100%;
  height: 240px;
  background: #0f0f0f;
  border-radius: 8px;
  overflow: hidden;
}

.recording-preview video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.recording-preview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted, #6b7280);
  font-size: 14px;
}

.recording-preview.clickable {
  cursor: pointer;
}

.recording-preview.clickable:hover {
  background: #1a1a1a;
}

.recording-preview.clickable:hover .recording-preview-placeholder {
  color: var(--accent, #6366f1);
}

.recording-webcam-preview {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 120px;
  height: 90px;
  background: #0f0f0f;
  border-radius: 8px;
  border: 2px solid var(--accent, #6366f1);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recording-webcam-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.recording-webcam-preview .recording-preview-placeholder {
  font-size: 12px;
  gap: 4px;
}

.recording-webcam-preview .recording-preview-placeholder svg {
  display: none;
}

/* Error */
.recording-error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 16px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
}

/* Actions */
.recording-dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

.recording-dialog-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.recording-dialog-btn.cancel {
  background: transparent;
  color: var(--text-secondary, #9ca3af);
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.3));
}

.recording-dialog.light-mode .recording-dialog-btn.cancel {
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
  color: var(--text-secondary, #6b7280);
}

.recording-dialog-btn.cancel:hover {
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  color: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
}

.recording-dialog-btn.continue,
.recording-dialog-btn.start {
  background: var(--accent, #6366f1);
  color: white;
}

.recording-dialog-btn.continue:hover,
.recording-dialog-btn.start:hover {
  background: var(--accent-hover, #4f46e5);
}

.recording-dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recording-dialog-btn.start svg {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Cursor recording options */
.recording-option-desc {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  line-height: 1.4;
}

.recording-sub-option {
  margin-top: 12px;
  padding: 12px;
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.2));
  border-radius: 8px;
}

.recording-dialog.light-mode .recording-sub-option {
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.05));
}

.recording-zoom-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 8px;
}

.recording-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recording-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--divider, rgba(85, 85, 85, 0.5));
  border-radius: 2px;
  cursor: pointer;
}

.recording-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent, #6366f1);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 150ms ease;
}

.recording-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.recording-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--accent, #6366f1);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.recording-slider-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent, #6366f1);
  min-width: 36px;
  text-align: right;
}

/* Nested row for grouped options */
.recording-nested-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.recording-nested-row-spaced {
  margin-top: 12px;
}

.recording-nested-label {
  font-size: 13px;
  color: var(--text-primary, #e5e7eb);
}

.recording-dialog.light-mode .recording-nested-label {
  color: var(--text-primary, #374151);
}

.recording-nested-desc {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  margin-top: 4px;
}

/* Small toggle for nested options */
.recording-toggle-small {
  width: 34px;
  height: 18px;
}

.recording-toggle-small .recording-toggle-slider:before {
  width: 12px;
  height: 12px;
}

.recording-toggle-small input:checked + .recording-toggle-slider:before {
  transform: translateX(16px);
}

/* Zoom option within nested section */
.recording-zoom-option {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--divider, rgba(85, 85, 85, 0.3));
}

.recording-dialog.light-mode .recording-zoom-option {
  border-top-color: var(--divider, rgba(0, 0, 0, 0.1));
}

/* Warning message */
.recording-warning {
  color: #f59e0b;
  font-size: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 6px;
  border-left: 3px solid #f59e0b;
  line-height: 1.4;
}

.recording-warning strong {
  color: #f59e0b;
}

/* Success message */
.recording-success {
  color: #22c55e;
  font-size: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 6px;
  border-left: 3px solid #22c55e;
  line-height: 1.4;
}

.recording-success strong {
  color: #22c55e;
}

/* Info message */
.recording-info {
  color: var(--text-secondary, #9ca3af);
  font-size: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.2));
  border-radius: 6px;
  line-height: 1.4;
}

.recording-dialog.light-mode .recording-info {
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.05));
}

.recording-info strong {
  color: var(--text-primary, #e5e7eb);
}

.recording-dialog.light-mode .recording-info strong {
  color: var(--text-primary, #374151);
}

/* Extension status styles */
.recording-extension-status {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.2));
  border-radius: 6px;
}

.recording-dialog.light-mode .recording-extension-status {
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.05));
}

.recording-extension-connected {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #22c55e;
  font-size: 12px;
}

.recording-extension-icon {
  flex-shrink: 0;
}

.recording-extension-setup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recording-extension-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted, #9ca3af);
  font-size: 12px;
}

.recording-extension-id-input {
  display: flex;
  gap: 8px;
}

.recording-extension-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.3));
  border-radius: 6px;
  background: var(--panel-bg, #1a1a1a);
  color: var(--text-primary, #e5e7eb);
  font-size: 12px;
  font-family: monospace;
}

.recording-dialog.light-mode .recording-extension-input {
  background: var(--panel-bg, #f9fafc);
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
  color: var(--text-primary, #374151);
}

.recording-extension-input::placeholder {
  color: var(--text-muted, #6b7280);
  font-family: inherit;
}

.recording-extension-input:focus {
  outline: none;
  border-color: var(--accent, #6366f1);
}

.recording-extension-test-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent, #6366f1);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease;
}

.recording-extension-test-btn:hover {
  background: var(--accent-hover, #4f46e5);
}

/* ==========================================
   TAB SELECTION STYLES (NEW)
   ========================================== */

.recording-tab-select-info {
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 16px;
  line-height: 1.5;
}

.recording-loading-tabs {
  padding: 40px;
  text-align: center;
  color: var(--text-muted, #6b7280);
  font-size: 14px;
}

.recording-tab-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 16px;
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.3));
  border-radius: 8px;
}

.recording-dialog.light-mode .recording-tab-list {
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
}

.recording-tab-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: none;
  border-bottom: 1px solid var(--panel-border, rgba(85, 85, 85, 0.2));
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  color: var(--text-primary, #e5e7eb);
}

.recording-dialog.light-mode .recording-tab-item {
  border-bottom-color: var(--panel-border, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #374151);
}

.recording-tab-item:last-child {
  border-bottom: none;
}

.recording-tab-item:hover {
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
}

.recording-tab-item.selected {
  background: var(--accent-light, rgba(99, 102, 241, 0.15));
  border-left: 3px solid var(--accent, #6366f1);
}

.recording-tab-favicon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
}

.recording-tab-favicon-placeholder {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.recording-tab-info {
  flex: 1;
  min-width: 0;
}

.recording-tab-title {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 8px;
}

.recording-tab-url {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recording-tab-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: normal;
}

.recording-tab-badge.active {
  background: #4caf50;
  color: white;
}

.recording-tab-check {
  color: var(--accent, #6366f1);
  font-weight: bold;
  font-size: 18px;
  flex-shrink: 0;
}

.recording-no-tabs {
  padding: 40px;
  text-align: center;
  color: var(--text-muted, #6b7280);
  font-size: 14px;
}

.recording-all-tabs-option {
  padding: 12px;
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.2));
  border-radius: 8px;
  margin-bottom: 12px;
}

.recording-dialog.light-mode .recording-all-tabs-option {
  background: var(--panel-bg-secondary, rgba(0, 0, 0, 0.05));
}

.recording-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
}

.recording-checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent, #6366f1);
}

.recording-selected-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary, #e5e7eb);
  margin-bottom: 12px;
}

.recording-dialog.light-mode .recording-selected-tab {
  color: var(--text-primary, #374151);
}

.recording-selected-tab strong {
  color: var(--accent, #6366f1);
}

.recording-focus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--accent, #6366f1);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  margin-left: auto;
  transition: background 150ms ease;
}

.recording-focus-btn:hover {
  background: var(--accent-hover, #4f46e5);
}

/* Pencil cursor style selector */
.recording-pencil-style {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--divider, rgba(85, 85, 85, 0.3));
}

.recording-dialog.light-mode .recording-pencil-style {
  border-top-color: var(--divider, rgba(0, 0, 0, 0.1));
}

.recording-pencil-style-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 8px;
}

.recording-pencil-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.recording-pencil-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--panel-border, rgba(85, 85, 85, 0.3));
  border-radius: 10px;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  transition: all 150ms ease;
}

.recording-dialog.light-mode .recording-pencil-btn {
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
}

.recording-pencil-btn:hover {
  border-color: var(--accent, #6366f1);
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
  transform: scale(1.05);
}

.recording-pencil-btn.active {
  border-color: var(--accent, #6366f1);
  background: var(--accent-light, rgba(99, 102, 241, 0.15));
  box-shadow: 0 0 0 2px var(--accent-light, rgba(99, 102, 241, 0.2));
}
</style>