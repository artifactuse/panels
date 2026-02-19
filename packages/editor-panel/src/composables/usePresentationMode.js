/**
 * usePresentationMode.js
 * Composable for Presentation Mode - recording canvas presentations with webcam
 *
 * Presentation Mode allows users to record themselves explaining their canvas work.
 * Features:
 * - Webcam PiP overlay during recording
 * - Canvas content recording (via captureStream)
 * - Cursor/click tracking for viewport keyframes
 * - Minimal playback UI (play/pause/scrub)
 * - Export to video or edit in Video Mode
 */

import { computed, ref } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getRecording } from './useRecording.js';
import { interpolateViewportAtTime } from './useViewportKeyframes.js';
import { getExport } from './useExport.js';

// Singleton instance
let presentationInstance = null;

// Animation frame for playback
let animationFrame = null;
let startTimestamp = null;

// Canvas stream recorders
let canvasRecorder = null;        // Records canvas WITH webcam (for direct export)
let canvasChunks = [];
let canvasRecorderNoWebcam = null; // Records canvas WITHOUT webcam (for Video Mode)
let canvasChunksNoWebcam = [];
let audioRecorder = null;         // Records audio-only (for MP4 export)
let audioChunks = [];

// Raw PCM capture for MP4 export (bypasses WebM decoding issues in Chrome)
let pcmAudioContext = null;
let pcmScriptProcessor = null;
let pcmChunks = [];

/**
 * Get viewport keyframes from shapes array
 */
function getViewportKeyframesFromShapes(shapes) {
  return shapes
    .filter(s => s.type === 'viewportKeyframe')
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
    .map(s => ({
      time: s.startTime || 0,
      duration: s.duration || 0.5,
      zoom: s.zoom ?? 1,
      panX: s.panX ?? 0,
      panY: s.panY ?? 0,
      easing: s.easing || 'ease-in-out'
    }));
}

/**
 * Create presentation mode composable
 */
function createPresentationMode() {
  const { state } = getEditorState();
  const recording = getRecording();

  // Computed: whether we have a presentation recording
  const hasRecording = computed(() => {
    return state.presentationBlobs !== null && state.presentationDuration > 0;
  });

  // Reactive ref: whether preview video overlay is visible
  // This is watched by PresentationPreview.vue component
  const isPreviewVisible = ref(false);

  // Computed: formatted current time
  const formattedCurrentTime = computed(() => {
    return formatTime(state.presentationTime);
  });

  // Computed: formatted duration
  const formattedDuration = computed(() => {
    return formatTime(state.presentationDuration);
  });

  /**
   * Format time as MM:SS
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Enter presentation mode
   * Opens recording dialog for device selection
   */
  function enterPresentationMode() {
    state.isPresentationMode = true;
    // Open recording dialog to let user configure webcam/mic
    recording.openRecordingDialog();
  }

  /**
   * Exit presentation mode
   * Returns to normal canvas mode
   */
  function exitPresentationMode() {
    // Stop playback if active
    if (state.isPresentationPlayback) {
      pause();
    }

    // Hide preview
    isPreviewVisible.value = false;

    state.isPresentationMode = false;
    state.isPresentationPlayback = false;
    state.showPresentationExport = false;
  }

  /**
   * Start recording the canvas presentation
   * Called after user configures recording options in dialog
   *
   * Creates TWO recording canvases:
   * 1. recordingCanvas - includes webcam (for direct video export)
   * 2. recordingCanvasNoWebcam - excludes webcam (for Video Mode editing)
   */
  async function startCanvasRecording() {
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) {
      console.error('[Presentation] Canvas not found');
      return false;
    }

    try {
      // Determine MIME type
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      // Check if webcam is enabled by looking for webcamCapture shapes in state
      // This is more reliable than checking recording.state.webcamStream which may not be set yet
      // The webcamCapture shape is added by App.vue before calling startCanvasRecording
      const hasWebcamShape = state.shapes.some(s => s.type === 'webcamCapture');
      const hasWebcam = hasWebcamShape || (recording.state.webcamEnabled && recording.state.webcamStream);

      // === Canvas 1: WITH webcam (for direct export) ===
      let recordingSource = canvas;

      if (state.hideSelectionInRecording) {
        state.recordingCanvas = document.createElement('canvas');
        state.recordingCanvas.width = canvas.width;
        state.recordingCanvas.height = canvas.height;
        state.recordingCtx = state.recordingCanvas.getContext('2d');
        recordingSource = state.recordingCanvas;
      }

      // Capture stream from canvas 1
      const canvasStream = recordingSource.captureStream(30);

      // Add audio if microphone is enabled
      if (recording.state.audioStream) {
        const audioTrack = recording.state.audioStream.getAudioTracks()[0];
        if (audioTrack) {
          canvasStream.addTrack(audioTrack);

          // Create separate audio-only recorder for MP4 export
          // Chrome can't decode WebM audio directly, so we record audio separately
          const audioMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';
          audioChunks = [];
          audioRecorder = new MediaRecorder(recording.state.audioStream, {
            mimeType: audioMimeType,
            audioBitsPerSecond: 128_000
          });
          audioRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };
          audioRecorder.onerror = (event) => {
            console.error('[Presentation] Audio MediaRecorder error:', event.error);
          };

          // Set up raw PCM capture for MP4 export
          // This bypasses Chrome's inability to decode WebM audio with decodeAudioData()
          try {
            // Use default sample rate (matches hardware) to avoid resampling issues
            pcmAudioContext = new AudioContext();
            const source = pcmAudioContext.createMediaStreamSource(recording.state.audioStream);

            // Check how many channels the microphone has (usually mono)
            const inputChannels = recording.state.audioStream.getAudioTracks()[0]?.getSettings?.()?.channelCount || 1;
            console.log('[Presentation] PCM capture: mic channels =', inputChannels, ', sample rate =', pcmAudioContext.sampleRate);

            // ScriptProcessorNode is deprecated but widely supported; AudioWorklet requires more setup
            // Use 1 input channel for mono microphones, output as stereo
            pcmScriptProcessor = pcmAudioContext.createScriptProcessor(4096, inputChannels, 2);
            pcmChunks = [];

            pcmScriptProcessor.onaudioprocess = (e) => {
              // Copy the audio data (getChannelData returns a reference that gets reused)
              const left = new Float32Array(e.inputBuffer.getChannelData(0));
              // For mono input, duplicate to right channel; for stereo, use channel 1
              const right = e.inputBuffer.numberOfChannels > 1
                ? new Float32Array(e.inputBuffer.getChannelData(1))
                : new Float32Array(left);
              pcmChunks.push({ left, right });
            };

            source.connect(pcmScriptProcessor);
            // Connect to destination to keep the processor running (muted output)
            pcmScriptProcessor.connect(pcmAudioContext.destination);
            console.log('[Presentation] PCM audio capture initialized');
          } catch (pcmErr) {
            console.warn('[Presentation] Failed to set up PCM capture:', pcmErr);
          }
        }
      }

      // Create MediaRecorder for canvas 1 (with webcam)
      canvasChunks = [];
      canvasRecorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 128_000
      });

      canvasRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          canvasChunks.push(event.data);
        }
      };

      canvasRecorder.onerror = (event) => {
        console.error('[Presentation] MediaRecorder error:', event.error);
      };

      // === Canvas 2: WITHOUT webcam (for Video Mode export) ===
      if (hasWebcam && state.hideSelectionInRecording) {
        state.recordingCanvasNoWebcam = document.createElement('canvas');
        state.recordingCanvasNoWebcam.width = canvas.width;
        state.recordingCanvasNoWebcam.height = canvas.height;
        state.recordingCtxNoWebcam = state.recordingCanvasNoWebcam.getContext('2d');

        // Capture stream from canvas 2
        const canvasStreamNoWebcam = state.recordingCanvasNoWebcam.captureStream(30);

        // Add audio to no-webcam stream too (audio stays in both)
        if (recording.state.audioStream) {
          const audioTrack = recording.state.audioStream.getAudioTracks()[0];
          if (audioTrack) {
            canvasStreamNoWebcam.addTrack(audioTrack.clone());
          }
        }

        // Create MediaRecorder for canvas 2 (without webcam)
        canvasChunksNoWebcam = [];
        canvasRecorderNoWebcam = new MediaRecorder(canvasStreamNoWebcam, {
          mimeType,
          videoBitsPerSecond: 5_000_000,
          audioBitsPerSecond: 128_000
        });

        canvasRecorderNoWebcam.ondataavailable = (event) => {
          if (event.data.size > 0) {
            canvasChunksNoWebcam.push(event.data);
          }
        };

        canvasRecorderNoWebcam.onerror = (event) => {
          console.error('[Presentation] MediaRecorder (no webcam) error:', event.error);
        };

        // Start second recorder
        canvasRecorderNoWebcam.start(1000);
      }

      // Mark recording state (enables dual-canvas rendering in useRenderer)
      state.isRecording = true;

      // Start main recorder
      canvasRecorder.start(1000);

      // Start audio-only recorder (for MP4 export)
      if (audioRecorder) {
        audioRecorder.start(1000);
      }

      // Start webcam recording through useRecording (if webcam enabled)
      // The recording composable will handle webcam separately
      // It also starts the duration timer
      recording.startRecording();

      // Start a render loop to ensure canvas is updating during recording
      // This is critical for captureStream to have frames to record
      startRenderLoop();

      return true;
    } catch (err) {
      console.error('[Presentation] Failed to start canvas recording:', err);
      return false;
    }
  }

  // Render loop for presentation recording
  let renderLoopActive = false;
  let renderLoopFrame = null;
  let renderFrameCount = 0;

  function startRenderLoop() {
    renderLoopActive = true;
    renderFrameCount = 0;
    renderLoopFrame = requestAnimationFrame(renderTick);
  }

  function stopRenderLoop() {
    renderLoopActive = false;
    if (renderLoopFrame) {
      cancelAnimationFrame(renderLoopFrame);
      renderLoopFrame = null;
    }
  }

  function renderTick() {
    if (!renderLoopActive) return;

    renderFrameCount++;

    // Force canvas re-render to ensure frames are being captured
    // captureStream(30) captures at 30fps but needs the canvas to change
    // BUT: Don't call render() while user is actively drawing - this would erase
    // the tool preview that drawToolPreview() draws after render()
    if (typeof window.render === 'function' && !state.isDrawing) {
      window.render();
    }

    // Also force a minimal canvas operation to ensure the stream has new frames
    // This helps when the canvas content is static (no user interaction)
    const canvas = document.getElementById('drawing-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      // Save and restore forces a frame even if nothing visually changes
      ctx.save();
      ctx.restore();
    }

    renderLoopFrame = requestAnimationFrame(renderTick);
  }

  /**
   * Add webcam recording as a video shape on the canvas
   * This allows the webcam PiP to be visible during preview/export
   */
  function addWebcamShapeToCanvas(webcamBlob) {
    // Create blob URL for the webcam video
    const webcamUrl = URL.createObjectURL(webcamBlob);

    // Get canvas dimensions for positioning - use viewport coordinates
    const canvas = document.getElementById('drawing-canvas');
    // Position in viewport space (bottom-right corner of visible area)
    const viewportWidth = canvas?.clientWidth || window.innerWidth;
    const viewportHeight = canvas?.clientHeight || window.innerHeight;

    // Default webcam size (200x150) positioned in bottom-right corner
    const webcamWidth = 200;
    const webcamHeight = 150;
    const margin = 20;

    // Convert viewport position to canvas coordinates (accounting for zoom and pan)
    const x = (viewportWidth - webcamWidth - margin - state.panX) / state.zoom;
    const y = (viewportHeight - webcamHeight - margin - 60 - state.panY) / state.zoom; // 60px for footer

    // Create video element for the shape
    const videoElement = document.createElement('video');
    videoElement.src = webcamUrl;
    videoElement.muted = true;
    videoElement.loop = true;
    videoElement.playsInline = true;
    videoElement.crossOrigin = 'anonymous';

    // Wait for video metadata to load
    videoElement.addEventListener('loadedmetadata', () => {
      // Start playing the video
      videoElement.play().catch(() => {});
      // Render to show the webcam
      if (typeof window.render === 'function') {
        window.render();
      }
    });

    videoElement.addEventListener('error', (e) => {
      console.error('[Presentation] Webcam video error:', e);
    });

    // Create video shape for webcam
    const webcamShape = {
      id: 'presentation-webcam-' + Date.now(),
      type: 'video',
      x: x,
      y: y,
      width: webcamWidth,
      height: webcamHeight,
      src: webcamUrl,
      videoElement: videoElement, // Important: attach the video element
      opacity: 100,
      visible: true,
      locked: false,
      // Presentation-specific properties
      isPresentationWebcam: true,
      duration: state.presentationDuration,
      startTime: 0,
      // Border radius for rounded webcam
      borderRadius: 12
    };

    // Add to shapes
    state.shapes.push(webcamShape);

    // Trigger video load
    videoElement.load();

    // Save state (don't save videoElement - it's not serializable)
    if (typeof window.saveState === 'function') {
      window.saveState();
    }
  }

  /**
   * Stop recording and process results
   * Stops both MediaRecorders and collects all blobs
   */
  async function stopCanvasRecording() {
    // Stop the render loop
    stopRenderLoop();

    // Clear recording state (stops dual-canvas rendering)
    state.isRecording = false;

    // Clean up off-screen recording canvases
    if (state.recordingCanvas) {
      state.recordingCanvas = null;
      state.recordingCtx = null;
    }
    if (state.recordingCanvasNoWebcam) {
      state.recordingCanvasNoWebcam = null;
      state.recordingCtxNoWebcam = null;
    }

    return new Promise((resolve) => {
      const results = {
        canvas: null,           // With webcam (for direct export)
        canvasNoWebcam: null,   // Without webcam (for Video Mode)
        webcam: null,
        audio: null
      };

      let completedCount = 0;
      // Count expected completions: main canvas + webcam/useRecording + optionally no-webcam canvas
      const hasNoWebcamRecorder = canvasRecorderNoWebcam && canvasRecorderNoWebcam.state !== 'inactive';
      const expectedCount = hasNoWebcamRecorder ? 3 : 2;

      function checkComplete() {
        completedCount++;
        if (completedCount >= expectedCount) {
          // Store blobs in state
          state.presentationBlobs = results;
          state.presentationDuration = recording.state.recordingDuration;
          state.presentationTime = 0;

          // Show export modal
          state.showPresentationExport = true;

          resolve(results);
        }
      }

      // Stop audio-only recorder (doesn't count toward completion, just collects blob)
      if (audioRecorder && audioRecorder.state !== 'inactive') {
        audioRecorder.onstop = () => {
          const audioMimeType = audioRecorder.mimeType || 'audio/webm';
          results.audio = new Blob(audioChunks, { type: audioMimeType });
          audioChunks = [];
          audioRecorder = null;
          console.log('[Presentation] Audio blob ready:', results.audio.size, 'bytes');
        };
        audioRecorder.stop();
      }

      // Collect raw PCM audio data for MP4 export
      // This bypasses Chrome's inability to decode WebM audio
      if (pcmChunks.length > 0 && pcmAudioContext) {
        try {
          const totalSamples = pcmChunks.reduce((sum, chunk) => sum + chunk.left.length, 0);
          const sampleRate = pcmAudioContext.sampleRate;
          console.log('[Presentation] Collecting PCM audio:', totalSamples, 'samples @', sampleRate, 'Hz');

          // Combine all chunks into single Float32Arrays
          const leftChannel = new Float32Array(totalSamples);
          const rightChannel = new Float32Array(totalSamples);
          let offset = 0;
          for (const chunk of pcmChunks) {
            leftChannel.set(chunk.left, offset);
            rightChannel.set(chunk.right, offset);
            offset += chunk.left.length;
          }

          results.pcmAudio = {
            left: leftChannel,
            right: rightChannel,
            sampleRate: sampleRate,
            numberOfChannels: 2,
            length: totalSamples
          };
          console.log('[Presentation] PCM audio ready:', totalSamples, 'samples,', (totalSamples / sampleRate).toFixed(2) + 's');
        } catch (pcmErr) {
          console.warn('[Presentation] Failed to collect PCM audio:', pcmErr);
        }
      } else if (pcmChunks.length > 0) {
        console.warn('[Presentation] PCM chunks exist but AudioContext is gone');
      }

      // Clean up PCM capture
      pcmChunks = [];
      if (pcmScriptProcessor) {
        pcmScriptProcessor.disconnect();
        pcmScriptProcessor = null;
      }
      if (pcmAudioContext) {
        pcmAudioContext.close().catch(() => {});
        pcmAudioContext = null;
      }

      // Stop main canvas recorder (with webcam)
      if (canvasRecorder && canvasRecorder.state !== 'inactive') {
        const originalOnStop = canvasRecorder.onstop;
        canvasRecorder.onstop = () => {
          if (originalOnStop) originalOnStop();
          const mimeType = canvasRecorder.mimeType || 'video/webm';
          results.canvas = new Blob(canvasChunks, { type: mimeType });
          canvasChunks = [];
          canvasRecorder = null;
          checkComplete();
        };
        canvasRecorder.stop();
      } else {
        checkComplete();
      }

      // Stop no-webcam canvas recorder (if exists)
      if (hasNoWebcamRecorder) {
        const originalOnStop = canvasRecorderNoWebcam.onstop;
        canvasRecorderNoWebcam.onstop = () => {
          if (originalOnStop) originalOnStop();
          const mimeType = canvasRecorderNoWebcam.mimeType || 'video/webm';
          results.canvasNoWebcam = new Blob(canvasChunksNoWebcam, { type: mimeType });
          canvasChunksNoWebcam = [];
          canvasRecorderNoWebcam = null;
          checkComplete();
        };
        canvasRecorderNoWebcam.stop();
      }

      // Stop useRecording (webcam/screen)
      recording.stopRecording().then((recBlobs) => {
        results.webcam = recBlobs?.webcam || null;
        checkComplete();
      });
    });
  }

  /**
   * Show video preview overlay
   * Sets the reactive state that PresentationPreview.vue component watches
   */
  function showPreview() {
    if (!state.presentationBlobs?.canvas) {
      return;
    }
    isPreviewVisible.value = true;
  }

  /**
   * Hide video preview overlay
   */
  function hidePreview() {
    isPreviewVisible.value = false;
  }

  /**
   * Start playback of recorded presentation
   */
  function play() {
    if (!hasRecording.value) return;

    // Show the preview overlay
    showPreview();

    state.isPresentationPlayback = true;
  }

  /**
   * Pause playback
   */
  function pause() {
    state.isPresentationPlayback = false;

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  /**
   * Toggle play/pause
   */
  function togglePlayback() {
    if (state.isPresentationPlayback) {
      pause();
    } else {
      play();
    }
  }

  /**
   * Seek to specific time
   */
  function seekTo(time) {
    state.presentationTime = Math.max(0, Math.min(time, state.presentationDuration));

    // Apply viewport keyframes at this time
    applyViewportAtTime(state.presentationTime);

    // Re-render
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Playback tick function (for viewport keyframe animation - not used when video preview is active)
   */
  function tick() {
    if (!state.isPresentationPlayback) return;

    const elapsed = (performance.now() - startTimestamp) / 1000;
    state.presentationTime = Math.min(elapsed, state.presentationDuration);

    // Apply viewport keyframes during playback
    applyViewportAtTime(state.presentationTime);

    // Re-render canvas
    if (typeof window.render === 'function') {
      window.render();
    }

    // Continue or stop
    if (state.presentationTime < state.presentationDuration) {
      animationFrame = requestAnimationFrame(tick);
    } else {
      // End of playback
      pause();
      state.presentationTime = state.presentationDuration;
    }
  }

  /**
   * Apply viewport keyframes at a specific time
   */
  function applyViewportAtTime(time) {
    const keyframes = getViewportKeyframesFromShapes(state.shapes);
    if (keyframes.length === 0) return;

    const viewport = interpolateViewportAtTime(keyframes, time);
    if (viewport) {
      state.zoom = viewport.zoom;
      state.panX = viewport.panX;
      state.panY = viewport.panY;
    }
  }

  /**
   * Clear presentation recording
   */
  function clearRecording() {
    // Hide preview
    isPreviewVisible.value = false;

    // Clear state
    state.presentationBlobs = null;
    state.presentationDuration = 0;
    state.presentationTime = 0;
    state.isPresentationPlayback = false;
  }

  /**
   * Export presentation using the export modal (WebM or MP4)
   */
  function downloadVideo() {
    if (!state.presentationBlobs) {
      alert('No recording available. Please record a presentation first.');
      return;
    }

    if (!state.presentationBlobs.canvas) {
      alert('Canvas recording not available. The recording may have failed.');
      return;
    }

    const blob = state.presentationBlobs.canvas;

    if (blob.size === 0) {
      alert('The recorded video is empty. Please try recording again.');
      return;
    }

    // Use the export composable to show export modal
    const exportComposable = getExport();
    exportComposable.exportPresentationVideo(
      state.presentationBlobs.canvas,
      state.presentationBlobs.webcam,
      state.presentationDuration,
      {
        audioBlob: state.presentationBlobs.audio,
        pcmAudio: state.presentationBlobs.pcmAudio
      }
    );
  }

  /**
   * Open in video mode for advanced editing
   * Uses IndexedDB to persist blobs across page navigation
   */
  async function openInVideoMode() {
    if (!state.presentationBlobs) {
      return;
    }

    const blobs = state.presentationBlobs;

    // Store blobs in IndexedDB (blob URLs don't survive page navigation)
    try {
      await storePresentationBlobsInDB(blobs, state.presentationDuration, {
        viewportKeyframes: state.shapes
          .filter(s => s.type === 'viewportKeyframe')
          .map(s => ({ ...s })),
        cursorShape: state.shapes.find(s => s.type === 'cursor')
      });

      // Open video mode in a new tab (preserves canvas mode session)
      window.open('video?import=presentation', '_blank');
    } catch (err) {
      console.error('[Presentation] Failed to store blobs in IndexedDB:', err);
      alert('Failed to prepare data for Video Mode. Please try again.');
    }
  }

  /**
   * Store presentation blobs in IndexedDB for cross-page access
   * For Video Mode: uses canvasNoWebcam (without webcam baked in) so webcam can be edited separately
   */
  function storePresentationBlobsInDB(blobs, duration, extras) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PresentationDB', 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['recordings'], 'readwrite');
        const store = transaction.objectStore('recordings');

        // For Video Mode: use canvasNoWebcam if available (webcam excluded from canvas)
        // This allows the webcam to be added as a separate editable track in Video Mode
        // Fall back to regular canvas blob if no-webcam version doesn't exist
        const canvasBlobForVideoMode = blobs.canvasNoWebcam || blobs.canvas;

        const data = {
          id: 'presentationImport',
          canvasBlob: canvasBlobForVideoMode,
          webcamBlob: blobs.webcam,
          duration: duration,
          viewportKeyframes: extras.viewportKeyframes || [],
          cursorShape: extras.cursorShape || null,
          timestamp: Date.now()
        };

        const putRequest = store.put(data);
        putRequest.onsuccess = () => {
          db.close();
          resolve();
        };
        putRequest.onerror = () => {
          db.close();
          reject(putRequest.error);
        };
      };
    });
  }

  /**
   * Preview the presentation (dismiss export modal, show preview and auto-play)
   */
  function previewPresentation() {
    state.showPresentationExport = false;

    // Show preview and start playback
    showPreview();

    // Auto-play after a short delay to ensure video is loaded
    setTimeout(() => {
      state.isPresentationPlayback = true;
    }, 100);
  }

  return {
    // State accessors
    hasRecording,
    isPreviewVisible,
    formattedCurrentTime,
    formattedDuration,

    // Mode control
    enterPresentationMode,
    exitPresentationMode,

    // Recording
    startCanvasRecording,
    stopCanvasRecording,
    clearRecording,

    // Playback
    play,
    pause,
    togglePlayback,
    seekTo,

    // Preview control
    showPreview,
    hidePreview,

    // Export
    downloadVideo,
    openInVideoMode,
    previewPresentation,

    // Utilities
    formatTime,
    applyViewportAtTime
  };
}

/**
 * Get singleton instance of presentation mode composable
 */
export function getPresentationMode() {
  if (!presentationInstance) {
    presentationInstance = createPresentationMode();
  }
  return presentationInstance;
}

/**
 * Hook for Vue components
 */
export function usePresentationMode() {
  return getPresentationMode();
}

// Expose globally for canvas mode access
if (typeof window !== 'undefined') {
  window.getPresentationMode = getPresentationMode;
}

export default usePresentationMode;
