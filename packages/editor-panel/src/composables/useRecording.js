/**
 * useRecording.js
 * Singleton composable for screen/webcam recording functionality
 * Handles stream capture, MediaRecorder, and recording state
 * 
 * UPDATED: Now includes explicit tab selection for reliable cursor tracking
 */

import { reactive, readonly } from 'vue';
import { getEditorState } from './useEditorState.js';
import { registerStreamElement, unregisterStreamElement } from '../utils/media.js';

// Helper to get config from editor state
function getConfig() {
  return getEditorState().config;
}

// Singleton state
let recordingInstance = null;

/**
 * Recording state
 */
const state = reactive({
  // Recording status
  isRecording: false,
  isPaused: false,
  recordingStartTime: null,
  recordingDuration: 0,

  // Streams
  screenStream: null,
  webcamStream: null,
  audioStream: null,

  // Screen MediaRecorder
  screenRecorder: null,
  screenRecordedChunks: [],
  screenRecordedBlob: null,

  // Webcam MediaRecorder
  webcamRecorder: null,
  webcamRecordedChunks: [],
  webcamRecordedBlob: null,

  // Legacy (for backwards compat)
  recorder: null,
  recordedChunks: [],
  recordedBlob: null,

  // Device info
  availableVideoDevices: [],
  availableAudioDevices: [],
  selectedVideoDeviceId: null,
  selectedAudioDeviceId: null,

  // Shape references
  screenCaptureShapeId: null,
  webcamCaptureShapeId: null,

  // UI state
  showRecordingDialog: false,
  showRecordingControls: false,
  error: null,

  // Cursor/interaction recording
  recordInteractions: false,     // Master toggle: capture cursor/click data
  recordCursor: false,           // Show cursor overlay in output (off by default)
  cursorBuffer: [],              // Raw: [{ time, x, y }]
  clickBuffer: [],               // Raw: [{ time, x, y, button }]

  // Viewport recording (auto-zoom on click)
  autoZoomOnClick: false,        // Toggle in dialog
  zoomLevel: 2.0,                // Configurable 1.5x - 4x

  // Canvas dimensions for coordinate calculations
  canvasWidth: 1920,
  canvasHeight: 1080,

  // Video capture dimensions (actual resolution from getDisplayMedia)
  // These may differ from canvas dimensions
  captureWidth: null,
  captureHeight: null,

  // Display surface type from getDisplayMedia
  // 'browser' = current tab, 'window' = app window, 'monitor' = entire screen
  recordingDisplaySurface: null,

  // Extension integration for global cursor tracking
  extensionAvailable: false,     // Is the cursor recorder extension installed?
  extensionId: null,             // Extension ID for messaging
  extensionConnected: false,     // Is extension connected to this tab?
  
  // NEW: Explicit tab tracking
  recordedTabId: null,           // Tab ID being recorded (from extension)
  recordedTabInfo: null,         // Info about recorded tab {id, title, url, favIconUrl}

});

// Timer for duration updates
let durationTimer = null;

/**
 * Get available media devices
 */
async function getAvailableDevices() {
  try {
    // Request permission first to get device labels
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();

    state.availableVideoDevices = devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ id: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));

    state.availableAudioDevices = devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({ id: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));

    // Set defaults
    if (state.availableVideoDevices.length > 0 && !state.selectedVideoDeviceId) {
      state.selectedVideoDeviceId = state.availableVideoDevices[0].id;
    }
    if (state.availableAudioDevices.length > 0 && !state.selectedAudioDeviceId) {
      state.selectedAudioDeviceId = state.availableAudioDevices[0].id;
    }

    return { video: state.availableVideoDevices, audio: state.availableAudioDevices };
  } catch (err) {
    state.error = `Failed to enumerate devices: ${err.message}`;
    return { video: [], audio: [] };
  }
}

/**
 * Request screen capture stream
 * @param {boolean} hideCursor - If true, hide OS cursor from recording
 */
async function requestScreenCapture(hideCursor = false) {
  const config = getConfig();
  const constraints = config.recording?.defaultScreenConstraints || {
    video: { width: 1920, height: 1080, frameRate: 30 }
  };

  // Build video constraints
  const videoConstraints = { ...constraints.video };

  // Hide OS cursor if interaction recording is enabled
  // This allows our generated cursor clip to be the only cursor visible
  // and ensures clean zoom-to-click without OS cursor visible
  // NOTE: cursor: 'never' is a HINT, not a requirement - browsers may ignore it
  // Chrome/Edge support it, but Safari/Firefox may not
  if (hideCursor || state.recordInteractions) {
    videoConstraints.cursor = 'never';
  }

  try {
    const displayMediaOptions = {
      video: videoConstraints,
      audio: false // Screen audio handled separately if needed
    };

    state.screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

    // Check what type of source was selected
    const videoTrack = state.screenStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();

    // Detect if user is recording a different window/screen vs current tab
    // displaySurface: 'browser' = current tab, 'window' = app window, 'monitor' = entire screen
    state.recordingDisplaySurface = settings.displaySurface || 'unknown';

    // Store the actual capture dimensions for cursor coordinate mapping
    state.captureWidth = settings.width || null;
    state.captureHeight = settings.height || null;

    // Warn if cursor hiding might not work
    if (state.recordInteractions && settings.cursor !== 'never') {
      console.warn('[Recording] cursor: "never" was requested but browser reported cursor:', settings.cursor || 'not supported');
      console.warn('[Recording] OS cursor may still be visible in the recording');
    }

    // Handle stream end (user clicks "Stop sharing")
    videoTrack.onended = () => {
      stopAllStreams();
    };

    return state.screenStream;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      state.error = 'Screen sharing permission denied';
    } else {
      state.error = `Screen capture failed: ${err.message}`;
    }
    return null;
  }
}

/**
 * Request webcam capture stream
 */
async function requestWebcamCapture(deviceId = null) {
  const config = getConfig();
  const constraints = config.recording?.defaultWebcamConstraints || {
    video: { width: 640, height: 480, frameRate: 30 }
  };

  const videoConstraints = {
    ...constraints.video,
    deviceId: deviceId ? { exact: deviceId } : undefined
  };

  try {
    state.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });

    return state.webcamStream;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      state.error = 'Camera permission denied';
    } else {
      state.error = `Webcam capture failed: ${err.message}`;
    }
    return null;
  }
}

/**
 * Request microphone capture stream
 */
async function requestMicrophoneCapture(deviceId = null) {
  const config = getConfig();
  const constraints = config.recording?.defaultAudioConstraints || {
    audio: { echoCancellation: true, noiseSuppression: true }
  };

  const audioConstraints = {
    ...constraints.audio,
    deviceId: deviceId ? { exact: deviceId } : undefined
  };

  try {
    state.audioStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: audioConstraints
    });

    return state.audioStream;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      state.error = 'Microphone permission denied';
    } else {
      state.error = `Microphone capture failed: ${err.message}`;
    }
    return null;
  }
}

/**
 * Create a MediaRecorder for a stream
 * @param {MediaStream} stream - The stream to record
 * @param {string} type - 'screen' or 'webcam'
 * @returns {MediaRecorder|null}
 */
function createRecorder(stream, type) {
  if (!stream) return null;

  const config = getConfig();
  const format = config.recording?.format || 'video/webm;codecs=vp9,opus';
  const videoBitrate = type === 'screen'
    ? (config.recording?.videoBitrate || 5_000_000)
    : (config.recording?.webcamBitrate || 2_000_000);
  const audioBitrate = config.recording?.audioBitrate || 128_000;

  // Check codec support
  let mimeType = format;
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      return null;
    }
  }

  // Create stream with video track (and audio for screen if available)
  const tracks = [stream.getVideoTracks()[0]];

  // Add audio to screen recording only
  if (type === 'screen' && state.audioStream) {
    const audioTrack = state.audioStream.getAudioTracks()[0];
    if (audioTrack) tracks.push(audioTrack);
  }

  const recordStream = new MediaStream(tracks);

  try {
    const recorder = new MediaRecorder(recordStream, {
      mimeType,
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: audioBitrate
    });

    return recorder;
  } catch (err) {
    console.error(`Failed to create ${type} recorder:`, err);
    return null;
  }
}

/**
 * Start recording (separate recorders for screen and webcam)
 * Note: In presentation mode, canvas recording is handled separately by usePresentationMode.
 * This function may be called without screenStream/webcamStream - it will still start
 * the duration timer and set recording state for the footer controls.
 */
function startRecording() {
  // Reset cursor recording state
  state.cursorBuffer = [];
  state.clickBuffer = [];
  lastRecordedTime = 0;
  lastRecordedX = 0;
  lastRecordedY = 0;

  const config = getConfig();
  const format = config.recording?.format || 'video/webm;codecs=vp9,opus';
  let mimeType = format;
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  // Create screen recorder
  if (state.screenStream) {
    state.screenRecordedChunks = [];
    state.screenRecorder = createRecorder(state.screenStream, 'screen');

    if (state.screenRecorder) {
      state.screenRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          state.screenRecordedChunks.push(event.data);
        }
      };

      state.screenRecorder.onstop = () => {
        state.screenRecordedBlob = new Blob(state.screenRecordedChunks, { type: mimeType });
      };

      state.screenRecorder.onerror = (event) => {
        console.error('Screen recording error:', event.error);
      };

      state.screenRecorder.start(1000);
    }
  }

  // Create webcam recorder
  if (state.webcamStream) {
    state.webcamRecordedChunks = [];
    state.webcamRecorder = createRecorder(state.webcamStream, 'webcam');

    if (state.webcamRecorder) {
      state.webcamRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          state.webcamRecordedChunks.push(event.data);
        }
      };

      state.webcamRecorder.onstop = () => {
        state.webcamRecordedBlob = new Blob(state.webcamRecordedChunks, { type: mimeType });
      };

      state.webcamRecorder.onerror = (event) => {
        console.error('Webcam recording error:', event.error);
      };

      state.webcamRecorder.start(1000);
    }
  }

  state.isRecording = true;
  state.isPaused = false;
  state.recordingStartTime = Date.now();
  state.showRecordingControls = true;
  startDurationTimer();

  return true;
}

/**
 * Pause recording
 */
function pauseRecording() {
  if (state.isRecording && !state.isPaused) {
    if (state.screenRecorder?.state === 'recording') {
      state.screenRecorder.pause();
    }
    if (state.webcamRecorder?.state === 'recording') {
      state.webcamRecorder.pause();
    }
    state.isPaused = true;
    stopDurationTimer();
  }
}

/**
 * Resume recording
 */
function resumeRecording() {
  if (state.isRecording && state.isPaused) {
    if (state.screenRecorder?.state === 'paused') {
      state.screenRecorder.resume();
    }
    if (state.webcamRecorder?.state === 'paused') {
      state.webcamRecorder.resume();
    }
    state.isPaused = false;
    startDurationTimer();
  }
}

/**
 * Stop recording
 * @returns {Promise<{screen: Blob|null, webcam: Blob|null}>} Promise that resolves with recorded blobs
 */
function stopRecording() {
  return new Promise((resolve) => {
    const result = { screen: null, webcam: null };
    let pendingStops = 0;

    const checkComplete = () => {
      pendingStops--;
      if (pendingStops <= 0) {
        state.isRecording = false;
        state.isPaused = false;
        state.showRecordingControls = false;
        stopDurationTimer();
        stopAllStreams();

        // Update project duration to match the recording duration
        const editorState = getEditorState();
        if (editorState && state.recordingDuration > 0) {
          editorState.state.projectDuration = state.recordingDuration;

          // Update the timeline range and time display
          if (typeof window.updateTimelineRange === 'function') {
            window.updateTimelineRange(state.recordingDuration);
          }
          if (typeof window.updateTimeDisplay === 'function') {
            window.updateTimeDisplay();
          }
        }

        resolve(result);
      }
    };

    // Stop screen recorder
    if (state.screenRecorder && state.screenRecorder.state !== 'inactive') {
      pendingStops++;
      const originalOnStop = state.screenRecorder.onstop;
      state.screenRecorder.onstop = () => {
        if (originalOnStop) originalOnStop();
        result.screen = state.screenRecordedBlob;
        checkComplete();
      };
      state.screenRecorder.stop();
    }

    // Stop webcam recorder
    if (state.webcamRecorder && state.webcamRecorder.state !== 'inactive') {
      pendingStops++;
      const originalOnStop = state.webcamRecorder.onstop;
      state.webcamRecorder.onstop = () => {
        if (originalOnStop) originalOnStop();
        result.webcam = state.webcamRecordedBlob;
        checkComplete();
      };
      state.webcamRecorder.stop();
    }

    // If no recorders were active, resolve immediately
    if (pendingStops === 0) {
      state.isRecording = false;
      state.isPaused = false;
      state.showRecordingControls = false;
      stopAllStreams();

      // Update project duration to match the recording duration
      const editorState = getEditorState();
      if (editorState && state.recordingDuration > 0) {
        editorState.state.projectDuration = state.recordingDuration;

        // Update the timeline range and time display
        if (typeof window.updateTimelineRange === 'function') {
          window.updateTimelineRange(state.recordingDuration);
        }
        if (typeof window.updateTimeDisplay === 'function') {
          window.updateTimeDisplay();
        }
      }

      resolve(result);
    }
  });
}

/**
 * Stop all streams
 */
function stopAllStreams() {
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(track => track.stop());
    state.screenStream = null;
  }
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(track => track.stop());
    state.webcamStream = null;
  }
  if (state.audioStream) {
    state.audioStream.getTracks().forEach(track => track.stop());
    state.audioStream = null;
  }

  // Unregister from media registry
  if (state.screenCaptureShapeId) {
    unregisterStreamElement(state.screenCaptureShapeId);
    state.screenCaptureShapeId = null;
  }
  if (state.webcamCaptureShapeId) {
    unregisterStreamElement(state.webcamCaptureShapeId);
    state.webcamCaptureShapeId = null;
  }
}

/**
 * Duration timer management
 */
function startDurationTimer() {
  stopDurationTimer();
  durationTimer = setInterval(() => {
    if (state.recordingStartTime && !state.isPaused) {
      state.recordingDuration = Math.floor((Date.now() - state.recordingStartTime) / 1000);
    }
  }, 100);
}

function stopDurationTimer() {
  if (durationTimer) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
}

/**
 * Format duration as HH:MM:SS
 */
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get recorded blob
 */
function getRecordedBlob() {
  return state.recordedBlob;
}

/**
 * Clear recorded data
 */
function clearRecording() {
  state.recordedChunks = [];
  state.recordedBlob = null;
  state.recordingDuration = 0;
  state.recordingStartTime = null;
  // Clear cursor buffers
  state.cursorBuffer = [];
  state.clickBuffer = [];
}

// ============================================
// Extension Integration for Global Cursor Tracking
// ============================================
// 
// Supports explicit tab selection for reliable cursor tracking.
// The extension provides a list of tabs, user selects which one
// they're recording, and the extension only captures cursor events
// from that specific tab.
// ============================================

/**
 * Check if the cursor recorder extension is available
 * @returns {Promise<boolean>}
 */
async function checkExtension() {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    state.extensionAvailable = false;
    return false;
  }

  try {
    if (state.extensionId) {
      const response = await sendMessageToExtension({ type: 'PING' });
      if (response?.ok) {
        state.extensionAvailable = true;
        state.extensionConnected = true;
        // Store additional info from extension
        if (response.recordedTabId !== undefined) {
          state.recordedTabId = response.recordedTabId;
        }
        return true;
      }
    }

    state.extensionAvailable = false;
    return false;
  } catch (e) {
    console.warn('[Extension] Check failed:', e.message);
    state.extensionAvailable = false;
    return false;
  }
}

/**
 * Set the extension ID (from config or user input)
 * @param {string} extensionId
 */
function setExtensionId(extensionId) {
  state.extensionId = extensionId;
  checkExtension();
}

/**
 * Send a message to the extension
 * @param {Object} message - Message to send
 * @returns {Promise<any>}
 */
async function sendMessageToExtension(message) {
  if (!state.extensionId) {
    throw new Error('Extension ID not set');
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(state.extensionId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Get list of all browser tabs from extension
 * Used to let user explicitly select which tab to record
 * @returns {Promise<Array<{id: number, title: string, url: string, favIconUrl?: string, active: boolean}>>}
 */
async function getExtensionTabs() {
  if (!state.extensionAvailable || !state.extensionId) {
    console.warn('[Extension] Cannot get tabs - extension not available');
    return [];
  }

  try {
    const response = await sendMessageToExtension({ type: 'GET_TABS' });
    const tabs = response?.tabs || [];
    return tabs;
  } catch (e) {
    console.error('[Extension] Failed to get tabs:', e);
    return [];
  }
}

/**
 * Explicitly set which tab should be recorded for cursor tracking
 * This is the RELIABLE way to ensure we're tracking the right tab
 * @param {number|null} tabId - Tab ID to record, or null to record all tabs
 * @returns {Promise<{ok: boolean, tabInfo?: Object, error?: string}>}
 */
async function setRecordedTab(tabId) {
  if (!state.extensionAvailable || !state.extensionId) {
    console.warn('[Extension] Cannot set recorded tab - extension not available');
    return { ok: false, error: 'Extension not available' };
  }

  try {
    const response = await sendMessageToExtension({ 
      type: 'SET_RECORDED_TAB',
      tabId 
    });
    
    if (response?.ok) {
      state.recordedTabId = response.recordedTabId;
      state.recordedTabInfo = response.tabInfo || null;
      return { ok: true, tabInfo: response.tabInfo };
    }
    
    return { ok: false, error: response?.error || 'Unknown error' };
  } catch (e) {
    console.error('[Extension] Failed to set recorded tab:', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Get info about the currently recorded tab
 * @returns {Promise<{recordedTabId: number|null, tabInfo: Object|null}>}
 */
async function getRecordedTab() {
  if (!state.extensionAvailable || !state.extensionId) {
    return { recordedTabId: null, tabInfo: null };
  }

  try {
    const response = await sendMessageToExtension({ type: 'GET_RECORDED_TAB' });
    state.recordedTabId = response?.recordedTabId || null;
    state.recordedTabInfo = response?.tabInfo || null;
    return {
      recordedTabId: response?.recordedTabId || null,
      tabInfo: response?.tabInfo || null
    };
  } catch (e) {
    console.error('[Extension] Failed to get recorded tab:', e);
    return { recordedTabId: null, tabInfo: null };
  }
}

/**
 * Focus/switch to the recorded tab
 * Useful for helping user navigate to the tab they're recording
 * @returns {Promise<boolean>}
 */
async function focusRecordedTab() {
  if (!state.extensionAvailable || !state.extensionId) {
    return false;
  }

  try {
    const response = await sendMessageToExtension({ type: 'FOCUS_RECORDED_TAB' });
    return response?.ok || false;
  } catch (e) {
    console.error('[Extension] Failed to focus recorded tab:', e);
    return false;
  }
}

/**
 * Start extension cursor recording
 * The recorded tab should already be set via setRecordedTab() before calling this.
 * If you want to override, pass a specific tabId or null for all tabs.
 * @param {number|null|undefined} overrideTabId - Optional: override the recorded tab. undefined = use existing.
 * @returns {Promise<boolean>}
 */
async function startExtensionRecording(overrideTabId = undefined) {
  if (!state.extensionAvailable || !state.extensionId) {
    console.warn('[Extension] Cannot start - extension not available');
    return false;
  }

  try {
    const message = {
      type: 'START_RECORDING',
      sessionId: Date.now().toString()
    };
    
    // Only include recordedTabId if explicitly overriding
    // undefined = use whatever was set via SET_RECORDED_TAB
    // null = explicitly record all tabs
    // number = explicitly record specific tab
    if (overrideTabId !== undefined) {
      message.recordedTabId = overrideTabId;
    }
    
    const response = await sendMessageToExtension(message);

    if (response?.ok) {
      state.recordedTabId = response.recordedTabId;
      return true;
    }
    return false;
  } catch (e) {
    console.error('[Extension] Failed to start recording:', e);
    return false;
  }
}

/**
 * Stop extension cursor recording and get final buffer
 * @returns {Promise<Array>} Array of cursor events
 */
async function stopExtensionRecording() {
  if (!state.extensionAvailable || !state.extensionId) {
    return [];
  }

  try {
    const response = await sendMessageToExtension({ type: 'STOP_RECORDING' });
    const events = response?.events || [];
    return events;
  } catch (e) {
    console.error('[Extension] Failed to stop recording:', e);
    return [];
  }
}

/**
 * Setup listener for cursor batches from extension
 * The extension sends batches of cursor events during recording
 */
function setupExtensionListener() {
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window (content script posts to same window)
    if (event.source !== window) return;

    const message = event.data;

    if (message?.type === 'CURSOR_BATCH' && state.isRecording) {
      // Extension data is used for ALL recording types now:
      // - For browser tab recording: The extension content script runs ON the recorded tab,
      //   so it captures mouse events from where the user is actually interacting
      // - For window/screen recording: Extension captures from all tabs
      //
      // The extension is preferred over local tracking because local tracking only works
      // when the mouse is over the EDITOR page, not the recorded content.

      // Add events to our buffer
      const events = message.events || [];
      for (const evt of events) {
        // Use the capture dimensions (actual video resolution) if available,
        // otherwise fall back to window dimensions from the extension
        const sourceWidth = evt.windowWidth || state.captureWidth || 1920;
        const sourceHeight = evt.windowHeight || state.captureHeight || 1080;

        // Percentage-based mapping: cursor at X% of source = X% of canvas
        const percentX = evt.x / sourceWidth;
        const percentY = evt.y / sourceHeight;
        const canvasX = percentX * state.canvasWidth;
        const canvasY = percentY * state.canvasHeight;

        // Clamp to canvas bounds (cursor might be over scrollbar area which exceeds content)
        const clampedX = Math.max(0, Math.min(canvasX, state.canvasWidth));
        const clampedY = Math.max(0, Math.min(canvasY, state.canvasHeight));

        if (evt.eventType === 'move') {
          state.cursorBuffer.push({
            time: evt.time,
            x: clampedX,
            y: clampedY
          });
        } else if (evt.eventType === 'click') {
          state.clickBuffer.push({
            time: evt.time,
            x: clampedX,
            y: clampedY,
            button: evt.button || 0
          });
        }
      }

    }
    
    // Handle recorded tab closed notification
    if (message?.type === 'RECORDED_TAB_CLOSED') {
      console.warn('[Extension] Recorded tab was closed:', message.tabId);
      state.recordedTabId = null;
      state.recordedTabInfo = null;
      // Optionally emit an event or show a warning to the user
    }
  });
}

// Initialize extension listener on load
if (typeof window !== 'undefined') {
  setupExtensionListener();
}

// ============================================
// Cursor Recording Functions
// ============================================

// Track last recorded position for sampling optimization
let lastRecordedTime = 0;
let lastRecordedX = 0;
let lastRecordedY = 0;
const MIN_SAMPLE_INTERVAL = 0.033; // ~30fps max sampling rate (33ms) - allows smoother playback
const MIN_DISTANCE = 2; // Minimum 2 pixels movement to record
const MAX_STATIONARY_INTERVAL = 0.5; // Record position every 500ms even if stationary

/**
 * Record mouse position during recording
 * Called on document mousemove
 * @param {number} x - X position in canvas coordinates
 * @param {number} y - Y position in canvas coordinates
 */
function recordMousePosition(x, y) {
  if (!state.isRecording || !state.recordInteractions || state.isPaused) return;

  const time = (Date.now() - state.recordingStartTime) / 1000;

  // Basic throttling - don't record more than 30fps
  if (time - lastRecordedTime < MIN_SAMPLE_INTERVAL) return;

  // Check if cursor moved enough
  const dist = Math.hypot(x - lastRecordedX, y - lastRecordedY);
  const timeSinceLastRecord = time - lastRecordedTime;

  // Record if: cursor moved significantly, OR it's been a while since last record (for stationary periods)
  const hasMoved = dist >= MIN_DISTANCE;
  const isStationary = state.cursorBuffer.length > 0 && !hasMoved && timeSinceLastRecord >= MAX_STATIONARY_INTERVAL;

  if (!hasMoved && !isStationary && state.cursorBuffer.length > 0) {
    return; // Skip this point - hasn't moved enough and not time for stationary record
  }

  state.cursorBuffer.push({ time, x, y });

  lastRecordedTime = time;
  lastRecordedX = x;
  lastRecordedY = y;
}

/**
 * Record click event during recording
 * Called on document mousedown
 * @param {number} x - X position in canvas coordinates
 * @param {number} y - Y position in canvas coordinates
 * @param {number} button - Mouse button (0 = left, 1 = middle, 2 = right)
 */
function recordClick(x, y, button) {
  if (!state.isRecording || state.isPaused) return;
  const time = (Date.now() - state.recordingStartTime) / 1000;
  state.clickBuffer.push({ time, x, y, button });
}

/**
 * Set interaction recording enabled (master toggle for cursor/click capture)
 * @param {boolean} enabled
 */
function setRecordInteractions(enabled) {
  state.recordInteractions = enabled;
}

/**
 * Set cursor overlay display enabled
 * @param {boolean} enabled
 */
function setRecordCursor(enabled) {
  state.recordCursor = enabled;
}

/**
 * Set auto-zoom on click enabled
 * @param {boolean} enabled
 */
function setAutoZoomOnClick(enabled) {
  state.autoZoomOnClick = enabled;
}

/**
 * Set zoom level for auto-zoom
 * @param {number} level - Zoom multiplier (1.5 - 4.0)
 */
function setZoomLevel(level) {
  state.zoomLevel = Math.max(1.5, Math.min(4.0, level));
}

/**
 * Set canvas dimensions for coordinate calculations
 * @param {number} width
 * @param {number} height
 */
function setCanvasDimensions(width, height) {
  state.canvasWidth = width;
  state.canvasHeight = height;
}

// ============================================
// Buffer-to-Keyframe Conversion
// ============================================

// Configuration for cursor keyframe optimization
const CURSOR_MIN_SAMPLE_INTERVAL = 0.033;  // ~30fps minimum between keyframes (33ms)
const CURSOR_HOLD_THRESHOLD = 0.15;    // 150ms pause = holdTime
const CURSOR_DISTANCE_THRESHOLD = 3;   // pixels - ignore micro movements (lower = more keyframes)
const CURSOR_MAX_SPEED = 5000;         // pixels per second - filter out impossible jumps (e.g., tab switches)

/**
 * Convert raw cursor buffer to cursorKeyframes
 *
 * Each keyframe has:
 * - time: duration to travel FROM the previous keyframe TO this one
 * - x, y: position of this keyframe
 * - holdTime (optional): how long to stay at this position before moving to next
 *
 * The interpolation code uses cumulative timing:
 * Timeline: [travel to K0] -> [hold at K0] -> [travel to K1] -> [hold at K1] -> ...
 *
 * @returns {Array} Keyframes for cursor shape
 */
function processCursorBuffer() {
  const raw = state.cursorBuffer;
  if (raw.length < 2) return [];

  // Sort by time to ensure correct order (events may arrive out of order from batching)
  const sorted = [...raw].sort((a, b) => a.time - b.time);

  const keyframes = [];
  let lastKeyframeTime = 0;  // Track cumulative time for rate limiting

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];

    if (keyframes.length === 0) {
      const pointFirst = sorted[i+1];
      // First keyframe: cursor appears instantly at this position
      keyframes.push({
        time: 0,
        x: pointFirst.x,
        y: pointFirst.y,
        easing: 'linear'
      });
      lastKeyframeTime = point.time;
      continue;
    }

    const timeSinceLastKeyframe = point.time - lastKeyframeTime;
    const lastKf = keyframes[keyframes.length - 1];
    const dist = Math.hypot(point.x - lastKf.x, point.y - lastKf.y);

    // Skip if we haven't waited long enough since last keyframe (rate limiting)
    // This prevents too many keyframes when events come in faster than 30fps
    if (timeSinceLastKeyframe < CURSOR_MIN_SAMPLE_INTERVAL) {
      continue;
    }

    // Skip very close points (jitter) but keep time-spaced ones for holds
    if (dist < CURSOR_DISTANCE_THRESHOLD && timeSinceLastKeyframe < CURSOR_HOLD_THRESHOLD) {
      continue;
    }

    // If cursor barely moved but time passed, it's a hold - add holdTime to previous keyframe
    if (dist < CURSOR_DISTANCE_THRESHOLD && timeSinceLastKeyframe >= CURSOR_HOLD_THRESHOLD) {
      lastKf.holdTime = (lastKf.holdTime || 0) + timeSinceLastKeyframe;
      lastKeyframeTime = point.time;
      continue;
    }

    // Check for impossible speed (tab switch, window change, etc.)
    // Skip these jumps - they represent cursor appearing in a different location
    const speed = dist / Math.max(timeSinceLastKeyframe, 0.001);
    if (speed > CURSOR_MAX_SPEED) {
      // Instead of skipping, we can "teleport" by adding a hold to the previous keyframe
      // and then setting this as a new starting position
      lastKf.holdTime = (lastKf.holdTime || 0) + timeSinceLastKeyframe;
      // Add new keyframe at this position with time=0 (instant teleport after hold)
      keyframes.push({
        time: 0,
        x: point.x,
        y: point.y,
        easing: 'linear'
      });
      lastKeyframeTime = point.time;
      continue;
    }

    // Cursor moved significantly - create a new keyframe
    keyframes.push({
      time: timeSinceLastKeyframe,
      x: point.x,
      y: point.y,
      easing: 'linear'  // Use linear for recorded movement - it's the actual path
    });
    lastKeyframeTime = point.time;
  }
  // Validate total timeline
  if (keyframes.length > 0) {
    let totalTime = 0;
    for (const kf of keyframes) {
      totalTime += (kf.time || 0) + (kf.holdTime || 0);
    }
  }

  return keyframes;
}

/**
 * Process click buffer into cursor click effects
 * Filters out clicks that occurred after recording ended
 * @returns {Array} Click effects for cursor shape
 */
function processClickBuffer() {
  const duration = state.recordingDuration;
  // Add 1 second tolerance since recordingDuration is floored
  // A click at 13.5s is valid if recordingDuration is 13s (stopped around 13.x seconds)
  const tolerance = 1.0;
  const validClicks = state.clickBuffer.filter(click => click.time <= duration + tolerance);

  return validClicks.map(click => ({
    time: Math.min(click.time, duration),  // Clamp to duration for safety
    effect: 'ripple',
    color: '#4a90d9',
    size: 40,
    duration: 0.4
  }));
}

/**
 * Generate cursor shape from processed buffer
 * @param {number} startTime - Start time for the cursor clip (matches video)
 * @returns {Object|null} Cursor shape object or null if no data
 */
function generateCursorShape(startTime = 0) {
 
  if (state.cursorBuffer.length > 0) {
    // Log coordinate ranges
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of state.cursorBuffer) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  const keyframes = processCursorBuffer();

  if (keyframes.length < 2) {
    console.warn('[Cursor Recording] Not enough keyframes to generate cursor shape');
    return null;
  }

  const duration = state.recordingDuration;

  // Set initial position from first keyframe to avoid "floating" from (0,0)
  const firstKeyframe = keyframes[0];

  return {
    id: 'cursor-' + Date.now(),
    type: 'cursor',
    x: firstKeyframe.x,
    y: firstKeyframe.y,
    cursorType: 'pointer',
    fillColor: '#ffffff',
    color: '#000000',
    cursorScale: 0.75,
    opacity: 100,  // Fully visible - cursor appears at first keyframe position
    showPath: false,  // Hide path by default for recorded cursors
    pathColor: '#6366f1',
    pathOpacity: 50,
    cursorKeyframes: keyframes,
    clicks: processClickBuffer(),
    startTime: startTime,
    duration: duration,
    trackId: 'track-cursor',
    name: 'Recorded Cursor'
  };
}

// ============================================
// Viewport Keyframe Generation
// ============================================

const VIEWPORT_FOLLOW_INTERVAL = 0.2;  // 200ms between pan updates

/**
 * Calculate pan values to center a point on screen, clamped to keep viewport within canvas
 *
 * The renderer uses setTransform(zoom, 0, 0, zoom, panX, panY) which means:
 *   screenX = canvasX * zoom + panX
 *   screenY = canvasY * zoom + panY
 *
 * To center a target point at the screen center:
 *   screenCenter = target * zoom + pan
 *   pan = screenCenter - target * zoom
 *   pan = canvasSize/2 - target * zoom
 *
 * Pan constraints to keep zoomed content within screen:
 * - When zoomed, content is scaled up by zoom factor
 * - Maximum pan (panning left, showing right edge): 0
 * - Minimum pan (panning right, showing left edge): canvasSize - canvasSize * zoom
 *
 * @param {number} targetX - X coordinate to center on (in canvas coordinates)
 * @param {number} targetY - Y coordinate to center on (in canvas coordinates)
 * @param {number} zoom - Current zoom level
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @returns {{panX: number, panY: number}} Clamped pan values
 */
function calculateClampedPan(targetX, targetY, zoom, canvasWidth, canvasHeight) {
  // Calculate pan to center the target point on screen
  // screenCenter = target * zoom + pan  =>  pan = screenCenter - target * zoom
  let panX = (canvasWidth / 2) - (targetX * zoom);
  let panY = (canvasHeight / 2) - (targetY * zoom);

  // Clamp pan to keep viewport within canvas bounds
  // At zoom Z, the scaled content is canvasSize * Z pixels
  // Pan range: from (canvasSize - canvasSize*Z) to 0
  // - panX = 0: left edge of canvas at left edge of screen (showing left side)
  // - panX = canvasWidth - canvasWidth*zoom: right edge of canvas at right edge of screen (showing right side)
  const minPanX = canvasWidth - (canvasWidth * zoom);   // Most negative (showing right side)
  const maxPanX = 0;                                      // Most positive (showing left side)
  const minPanY = canvasHeight - (canvasHeight * zoom);
  const maxPanY = 0;

  panX = Math.max(minPanX, Math.min(panX, maxPanX));
  panY = Math.max(minPanY, Math.min(panY, maxPanY));

  return { panX, panY };
}

/**
 * Generate viewport keyframes with cursor following
 * Creates zoom keyframes at clicks and pan keyframes to follow cursor between clicks
 * @param {number} startTime - Start time for the viewport keyframes
 * @returns {Array} Array of viewport keyframe shapes
 */
function generateViewportKeyframes(startTime = 0) {
  if (!state.autoZoomOnClick) return [];

  const duration = state.recordingDuration;

  // Filter clicks to only include those within recording duration
  // Add 1 second tolerance since recordingDuration is floored
  const tolerance = 1.0;
  const validClicks = state.clickBuffer
    .filter(click => click.time <= duration + tolerance)
    .map(click => ({
      ...click,
      time: Math.min(click.time, duration)  // Clamp to duration for safety
    }));

  if (validClicks.length === 0) {
    return [];
  }

  const viewportKeyframes = [];
  const cursorData = state.cursorBuffer;
  const canvasWidth = state.canvasWidth;
  const canvasHeight = state.canvasHeight;

  // Add initial keyframe at zoom 1 (normal view) at the start
  const firstClickTime = validClicks[0].time;
  viewportKeyframes.push({
    id: 'viewport-initial-' + Date.now(),
    type: 'viewportKeyframe',
    startTime: startTime,
    duration: firstClickTime > 0.5 ? firstClickTime - 0.3 : Math.max(0.1, firstClickTime),
    zoom: 1,
    panX: 0,
    panY: 0,
    easing: 'linear',
    name: 'Initial View'
  });

  // Sort cursor data by time for proper iteration
  const sortedCursorData = [...cursorData].sort((a, b) => a.time - b.time);

  for (let i = 0; i < validClicks.length; i++) {
    const click = validClicks[i];
    const nextClick = validClicks[i + 1];
    // End time is either next click or end of recording
    const endTime = nextClick ? nextClick.time : duration;

    // Calculate clamped pan to center click point at zoom level
    const { panX, panY } = calculateClampedPan(click.x, click.y, state.zoomLevel, canvasWidth, canvasHeight);

    // Zoom-in keyframe at click
    viewportKeyframes.push({
      id: 'viewport-zoom-' + Date.now() + '-' + i,
      type: 'viewportKeyframe',
      startTime: startTime + click.time,
      duration: 0.5,  // Hold zoomed view for half a second
      zoom: state.zoomLevel,
      panX: panX,
      panY: panY,
      easing: 'ease-out',
      name: 'Zoom to Click'
    });

    // Follow cursor keyframes until next click (or end of recording)
    // Start following 0.5s after click (after zoom animation completes)
    let lastPanTime = click.time + 0.5;
    let panCount = 0;

    // Find cursor events in the time window between click+0.5s and endTime-0.3s
    const followStartTime = click.time + 0.5;
    const followEndTime = endTime - 0.3;

    for (const cursor of sortedCursorData) {
      // Skip cursor events before we start following
      if (cursor.time <= followStartTime) continue;
      // Stop following before next click or end of recording
      if (cursor.time >= followEndTime) break;
      // Only create pan keyframes at intervals to avoid too many keyframes
      if (cursor.time - lastPanTime < VIEWPORT_FOLLOW_INTERVAL) continue;

      // Calculate clamped pan for cursor following
      const { panX: followPanX, panY: followPanY } = calculateClampedPan(
        cursor.x, cursor.y, state.zoomLevel, canvasWidth, canvasHeight
      );

      viewportKeyframes.push({
        id: 'viewport-pan-' + Date.now() + '-' + viewportKeyframes.length,
        type: 'viewportKeyframe',
        startTime: startTime + cursor.time,
        duration: VIEWPORT_FOLLOW_INTERVAL,
        zoom: state.zoomLevel,  // Maintain zoom
        panX: followPanX,
        panY: followPanY,
        easing: 'linear',  // Smooth pan
        name: 'Follow Cursor'
      });

      lastPanTime = cursor.time;
      panCount++;
    }
    

    // After following, if there's no next click and we're not too close to end, zoom back out
    if (!nextClick && lastPanTime < duration - 0.5) {
      viewportKeyframes.push({
        id: 'viewport-zoomout-' + Date.now(),
        type: 'viewportKeyframe',
        startTime: startTime + lastPanTime + 0.3,
        duration: 0.5,
        zoom: 1,
        panX: 0,
        panY: 0,
        easing: 'ease-in-out',
        name: 'Zoom Out'
      });
    }
  }

  return viewportKeyframes;
}

/**
 * Get all generated shapes from recording (cursor + viewport keyframes)
 * @param {number} startTime - Start time for the shapes
 * @returns {Object} { cursor: Shape|null, viewportKeyframes: Shape[] }
 */
function getRecordedCursorData(startTime = 0) {
  return {
    cursor: state.recordCursor ? generateCursorShape(startTime) : null,
    viewportKeyframes: generateViewportKeyframes(startTime)
  };
}

/**
 * Open recording dialog
 */
function openRecordingDialog() {
  state.showRecordingDialog = true;
  state.error = null;
  getAvailableDevices();
}

/**
 * Close recording dialog
 */
function closeRecordingDialog() {
  state.showRecordingDialog = false;
}

/**
 * Check if recording is supported
 */
function isRecordingSupported() {
  return !!(navigator.mediaDevices?.getDisplayMedia && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/**
 * Set selected devices
 */
function setSelectedVideoDevice(deviceId) {
  state.selectedVideoDeviceId = deviceId;
}

function setSelectedAudioDevice(deviceId) {
  state.selectedAudioDeviceId = deviceId;
}

/**
 * Register stream with shape
 */
function registerStreamWithShape(shapeId, stream, type) {
  registerStreamElement(shapeId, stream);
  if (type === 'screen') {
    state.screenCaptureShapeId = shapeId;
  } else if (type === 'webcam') {
    state.webcamCaptureShapeId = shapeId;
  }
}

/**
 * Create and return the recording composable
 */
function useRecording() {
  return {
    // State (readonly)
    state: readonly(state),

    // Device enumeration
    getAvailableDevices,
    setSelectedVideoDevice,
    setSelectedAudioDevice,

    // Stream capture
    requestScreenCapture,
    requestWebcamCapture,
    requestMicrophoneCapture,
    stopAllStreams,

    // Recording control
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,

    // Recording data
    getRecordedBlob,
    clearRecording,

    // UI
    openRecordingDialog,
    closeRecordingDialog,
    formatDuration,

    // Utilities
    isRecordingSupported,
    registerStreamWithShape,

    // Cursor/interaction recording
    recordMousePosition,
    recordClick,
    setRecordInteractions,
    setRecordCursor,
    setAutoZoomOnClick,
    setZoomLevel,
    setCanvasDimensions,
    getRecordedCursorData,

    // Extension integration
    checkExtension,
    setExtensionId,
    startExtensionRecording,
    stopExtensionRecording,
    
    // Extension tab selection (NEW - for reliable cursor tracking)
    getExtensionTabs,
    setRecordedTab,
    getRecordedTab,
    focusRecordedTab,
  };
}

/**
 * Get singleton instance
 */
export function getRecording() {
  if (!recordingInstance) {
    recordingInstance = useRecording();
  }
  return recordingInstance;
}

// Expose to window for global access
if (typeof window !== 'undefined') {
  window.getRecording = getRecording;
}

export default useRecording;