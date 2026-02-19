<script setup>
/**
 * PresentationPreview - Fullscreen video preview overlay for presentation recordings
 *
 * Shows the recorded canvas video with playback controls in footer.
 * Can be closed via close button, escape key, or footer controls.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';
import { getPresentationMode } from '../../composables/usePresentationMode.js';

const { state } = getEditorState();
const presentation = getPresentationMode();

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  videoBlob: {
    type: Blob,
    default: null
  }
});

const emit = defineEmits(['close']);

// Video element ref
const videoRef = ref(null);
let videoUrl = null;

// Handle close
function handleClose() {
  if (videoRef.value) {
    videoRef.value.pause();
  }
  state.isPresentationPlayback = false;
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
    e.preventDefault();
    e.stopPropagation();
    handleClose();
  }
}

// Toggle play/pause on video click
function handleVideoClick() {
  presentation.togglePlayback();
}

// Setup video when visible and blob is available
function setupVideo() {
  if (!props.visible || !props.videoBlob) return;

  // Create blob URL
  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
  }
  videoUrl = URL.createObjectURL(props.videoBlob);

  // Set video source after next tick
  setTimeout(() => {
    if (videoRef.value) {
      videoRef.value.src = videoUrl;
      videoRef.value.currentTime = state.presentationTime;

      // Auto-play if playback state is already true
      if (state.isPresentationPlayback) {
        videoRef.value.play().catch(() => {});
      }
    }
  }, 0);
}

// Watch for visibility changes to set up video
watch(() => props.visible, (visible) => {
  if (visible) {
    setupVideo();
  }
}, { immediate: true });

// Also watch for videoBlob changes (may arrive after visibility is set)
watch(() => props.videoBlob, (blob) => {
  if (blob && props.visible) {
    setupVideo();
  }
});

// Sync video time with state
watch(() => state.isPresentationPlayback, (isPlaying) => {
  if (!videoRef.value) return;

  if (isPlaying) {
    videoRef.value.play().catch(() => {});
  } else {
    videoRef.value.pause();
  }
});

// Update state time as video plays
function handleTimeUpdate() {
  if (videoRef.value && state.isPresentationPlayback) {
    state.presentationTime = videoRef.value.currentTime;
  }
}

// Handle video end
function handleVideoEnded() {
  state.isPresentationPlayback = false;
  state.presentationTime = state.presentationDuration;
}

// Seek video when state time changes (from footer scrubber)
watch(() => state.presentationTime, (newTime) => {
  if (videoRef.value && Math.abs(videoRef.value.currentTime - newTime) > 0.5) {
    videoRef.value.currentTime = newTime;
  }
});

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
    videoUrl = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="presentation-preview-overlay"
      :style="{ backgroundColor: state.backgroundColor || '#ffffff' }"
      @click="handleBackdropClick"
    >
      <!-- Video -->
      <video
        ref="videoRef"
        class="presentation-preview-video"
        @click="handleVideoClick"
        @timeupdate="handleTimeUpdate"
        @ended="handleVideoEnded"
      />

      <!-- Close Button -->
      <button
        class="presentation-preview-close"
        title="Close preview (Esc)"
        @click="handleClose"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.presentation-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  /* Background color is set dynamically via :style binding to match canvas */
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.presentation-preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: pointer;
}

.presentation-preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  background:  var(--panel-bg);
  color: var(--text-primary);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  z-index: 10;
}

.presentation-preview-close:hover {
  background: var(--panel-workspace);
}
</style>
