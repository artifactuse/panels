<script setup>
/**
 * ExportModal - Video export dialog with format and FPS selection
 *
 * Usage:
 * <ExportModal
 *   v-if="showExport"
 *   :dark-mode="state.darkMode"
 *   :export-config="config.export"
 *   :mp4-supported="isMP4Supported"
 *   @select="handleFormatSelect"
 *   @cancel="showExport = false"
 * />
 *
 * Events:
 * - select: Emitted with { format: 'mp4'|'webm', fps: number } when user selects a format
 * - cancel: Emitted when user cancels or closes the modal
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  darkMode: {
    type: Boolean,
    default: true
  },
  exportConfig: {
    type: Object,
    default: () => ({})
  },
  mp4Supported: {
    type: Boolean,
    default: true
  },
  // When true, show only progress section (no format selection)
  showProgressOnly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select', 'cancel', 'close']);

// Compute FPS options from config
const fpsOptions = computed(() => props.exportConfig.fpsOptions || [24, 30, 60]);
const defaultFps = computed(() => props.exportConfig.defaultFps || 60);

// Selected FPS state
const selectedFps = ref(defaultFps.value);

// Export state
const showFormatSelection = ref(!props.showProgressOnly);
const showProgress = ref(props.showProgressOnly);
const progressStatus = ref('Preparing...');
const progressPercent = ref(0);
const showDownloadButton = ref(false);
const downloadUrl = ref('');
const downloadFilename = ref('video.mp4');
const errorMessage = ref('');

// Handle FPS button click
function selectFps(fps) {
  selectedFps.value = fps;
}

// Handle format selection
function selectFormat(format) {
  showFormatSelection.value = false;
  showProgress.value = true;
  emit('select', { format, fps: selectedFps.value });
}

// Handle cancel
function handleCancel() {
  emit('cancel');
}

// Handle close (after download ready or error)
function handleClose() {
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
  }
  emit('close');
}

// Handle click on backdrop
function handleBackdropClick(e) {
  if (e.target === e.currentTarget) {
    // Only allow closing by backdrop click if not exporting
    if (!showProgress.value || showDownloadButton.value || errorMessage.value) {
      handleCancel();
    }
  }
}

// Exposed methods for parent to control progress
function updateStatus(status) {
  progressStatus.value = status;
}

function updateProgress(percent) {
  progressPercent.value = percent;
}

function showDownload(url, filename) {
  showDownloadButton.value = true;
  downloadUrl.value = url;
  downloadFilename.value = filename;
  progressStatus.value = 'Export complete!';
  progressPercent.value = 100;
}

function showError(message) {
  errorMessage.value = message;
  progressStatus.value = 'Error: ' + message;
}

// Expose methods for parent component
defineExpose({
  updateStatus,
  updateProgress,
  showDownload,
  showError
});

// Close on Escape key
function handleKeydown(e) {
  if (e.key === 'Escape') {
    // Only allow ESC to close if not in progress or if complete/error
    if (!showProgress.value || showDownloadButton.value || errorMessage.value) {
      handleCancel();
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  // Clean up download URL if component unmounts
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
  }
});
</script>

<template>
  <div
    class="export-modal"
    :class="{ 'light-mode': !darkMode }"
    @click="handleBackdropClick"
  >
    <div class="export-modal-content">
      <!-- Format Selection Section -->
      <div v-if="showFormatSelection" class="export-format-selection">
        <h3>Export Video</h3>

        <!-- FPS Settings -->
        <div class="export-settings-row">
          <label class="export-settings-label">Frame Rate</label>
          <div class="export-fps-options">
            <button
              v-for="fps in fpsOptions"
              :key="fps"
              class="export-fps-btn"
              :class="{ active: fps === selectedFps }"
              @click="selectFps(fps)"
            >
              {{ fps }} FPS
            </button>
          </div>
        </div>

        <!-- Format Description -->
        <p class="export-format-desc">Choose your preferred format:</p>

        <!-- Format Options -->
        <div class="export-format-options">
          <button
            class="export-format-btn"
            data-format="webm"
            @click="selectFormat('webm')"
          >
            <span class="format-name">WebM</span>
            <span class="format-desc">Fast export, good quality</span>
            <span class="format-compat">Chrome, Firefox, Edge</span>
          </button>
          <button
            class="export-format-btn"
            :class="{ disabled: !mp4Supported }"
            :disabled="!mp4Supported"
            data-format="mp4"
            @click="mp4Supported && selectFormat('mp4')"
          >
            <span class="format-name">MP4</span>
            <span class="format-desc">Universal compatibility</span>
            <span class="format-compat">{{ mp4Supported ? 'All devices & platforms' : 'Not supported in this browser' }}</span>
          </button>
        </div>

        <!-- Actions -->
        <div class="export-actions">
          <button class="export-cancel-btn" @click="handleCancel">Cancel</button>
        </div>
      </div>

      <!-- Progress Section -->
      <div v-if="showProgress" class="export-progress-section">
        <h3>Export Video</h3>

        <div class="export-progress">
          <div class="export-status">{{ progressStatus }}</div>
          <div v-if="!errorMessage" class="export-progress-bar">
            <div class="export-progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div v-if="!errorMessage" class="export-progress-text">{{ Math.round(progressPercent) }}%</div>
        </div>

        <!-- Actions -->
        <div class="export-actions">
          <!-- During export -->
          <button
            v-if="!showDownloadButton && !errorMessage"
            class="export-cancel-btn"
            @click="handleCancel"
          >
            Cancel
          </button>

          <!-- Export complete -->
          <template v-if="showDownloadButton">
            <a
              :href="downloadUrl"
              :download="downloadFilename"
              class="export-download-btn"
            >
              Download Video
            </a>
            <button class="export-close-btn" @click="handleClose">Close</button>
          </template>

          <!-- Error state -->
          <button
            v-if="errorMessage"
            class="export-close-btn"
            @click="handleClose"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Use CSS variables from theme config (defined in styles/index.css) */
.export-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.export-modal-content {
  background: var(--panel-bg, #1a1a1a);
  color: var(--text-primary, #e5e7eb);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 90vw;
  box-shadow: var(--popup-shadow, 0 8px 30px rgba(0, 0, 0, 0.4));
  border: 1px solid var(--panel-border, rgba(85, 85, 85, 0.1));
}

.export-modal.light-mode .export-modal-content {
  background: var(--panel-bg, #f9fafc);
  color: var(--text-primary, #374151);
  box-shadow: var(--popup-shadow, 0 8px 30px rgba(0, 0, 0, 0.2));
  border-color: var(--panel-border, rgba(0, 0, 0, 0.1));
}

.export-modal h3 {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
}

/* Status and progress */
.export-status {
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--text-secondary, #9ca3af);
}

.export-modal.light-mode .export-status {
  color: var(--text-secondary, #6b7280);
}

.export-progress-bar {
  height: 8px;
  background: var(--divider, rgba(85, 85, 85, 0.3));
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.export-modal.light-mode .export-progress-bar {
  background: var(--divider, rgba(0, 0, 0, 0.1));
}

.export-progress-fill {
  height: 100%;
  background: var(--accent, #6366f1);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.export-progress-text {
  font-size: 12px;
  text-align: right;
  color: var(--text-muted, #6b7280);
}

/* Actions */
.export-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.export-cancel-btn,
.export-close-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--divider, rgba(85, 85, 85, 0.3));
  background: transparent;
  color: var(--text-primary, #e5e7eb);
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s ease;
}

.export-modal.light-mode .export-cancel-btn,
.export-modal.light-mode .export-close-btn {
  border-color: var(--divider, rgba(0, 0, 0, 0.1));
  color: var(--text-primary, #374151);
}

.export-cancel-btn:hover,
.export-close-btn:hover {
  background: var(--divider, rgba(85, 85, 85, 0.2));
}

.export-modal.light-mode .export-cancel-btn:hover,
.export-modal.light-mode .export-close-btn:hover {
  background: var(--divider, rgba(0, 0, 0, 0.05));
}

.export-download-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background: var(--accent, #6366f1);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
  display: inline-block;
  transition: background 0.15s ease;
}

.export-download-btn:hover {
  background: var(--accent-hover, #4f46e5);
}

/* Format selection styles */
.export-format-desc {
  font-size: 14px;
  color: var(--text-secondary, #9ca3af);
  margin: 0 0 16px;
}

.export-modal.light-mode .export-format-desc {
  color: var(--text-secondary, #6b7280);
}

.export-format-options {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.export-format-btn {
  flex: 1;
  padding: 16px;
  border: 2px solid var(--divider, rgba(85, 85, 85, 0.3));
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary, #e5e7eb);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, background 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.export-modal.light-mode .export-format-btn {
  border-color: var(--divider, rgba(0, 0, 0, 0.1));
  color: var(--text-primary, #374151);
}

.export-format-btn:hover:not(.disabled) {
  border-color: var(--accent, #6366f1);
  background: var(--accent-light, rgba(99, 102, 241, 0.1));
}

.export-format-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-format-btn .format-name {
  font-size: 16px;
  font-weight: 600;
}

.export-format-btn .format-desc {
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
}

.export-modal.light-mode .export-format-btn .format-desc {
  color: var(--text-secondary, #6b7280);
}

.export-format-btn .format-compat {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  margin-top: 4px;
}

.export-modal.light-mode .export-format-btn .format-compat {
  color: var(--text-muted, #9ca3af);
}

/* FPS settings styles */
.export-settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--divider, rgba(85, 85, 85, 0.3));
}

.export-modal.light-mode .export-settings-row {
  border-color: var(--divider, rgba(0, 0, 0, 0.1));
}

.export-settings-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary, #9ca3af);
  min-width: 80px;
}

.export-modal.light-mode .export-settings-label {
  color: var(--text-secondary, #6b7280);
}

.export-fps-options {
  display: flex;
  gap: 8px;
}

.export-fps-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--divider, rgba(85, 85, 85, 0.3));
  background: transparent;
  color: var(--text-primary, #e5e7eb);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.export-modal.light-mode .export-fps-btn {
  border-color: var(--divider, rgba(0, 0, 0, 0.1));
  /* color: var(--text-primary, #ffffff); */
}

.export-fps-btn:hover {
  border-color: var(--accent, #6366f1);
}

.export-fps-btn.active {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
  color: #fff;
}
</style>
