// editor/composables/useEditorState.js
// Core reactive state management using Vue 3 Composition API
// Phase E.3: Full migration from legacy state.js

import { reactive, computed } from 'vue';
import { defaultConfig } from '../config/defaults.js';

/**
 * Create the editor state with all properties
 */
function createEditorState(config = defaultConfig) {
  return reactive({
    // Canvas background
    backgroundColor: config.canvas.backgroundColor,

    // Tool state
    currentTool: config.tools.defaultTool,
    currentColor: config.theme.colors.defaultStroke,
    currentFill: config.theme.colors.defaultFill,
    currentSize: config.tools.defaultStrokeWidth,
    currentOpacity: 100,

    // Stroke and edge styles
    currentStrokeStyle: config.tools.defaultStrokeStyle || 'solid',
    currentEdgeStyle: config.tools.defaultEdgeStyle || 'sharp',
    currentRoughness: config.tools.defaultRoughness ?? 1,

    // Arrow options
    currentArrowType: config.tools.defaultArrowType || 'single',
    currentArrowHeadStyle: config.tools.defaultArrowHeadStyle || 'triangle',
    currentArrowHeadSize: config.tools.defaultArrowHeadSize || 'medium',

    // Curve options for lines and arrows
    currentCurveType: config.tools.defaultCurveType || 'straight',

    // Text options
    currentLineHeight: config.text?.defaultLineHeight || 1.3,
    currentFontFamily: config.text?.defaultFont || 'Inter',
    currentFontSize: config.text?.defaultSize || 16,

    // Control point dragging state
    isDraggingControlPoint: false,
    activeControlPoint: null,
    controlPointStartPos: null,

    // Shapes
    shapes: [],
    selectedIndices: [],

    // Frame child selection - tracks selected children inside frames
    selectedFrameChildren: [],

    // Frame child interaction flags
    isDraggingFrameChild: false,
    isResizingFrameChild: false,
    isRotatingFrameChild: false,
    isDraggingFrameChildControlPoint: false,

    // Group child selection - tracks selected children inside groups
    selectedGroupChildren: [],  // Array of { groupIndex, childIndex }
    activeGroupIndex: -1,       // Currently "entered" group (-1 = none)

    // Group child interaction flags
    isDraggingGroupChild: false,
    isResizingGroupChild: false,
    isRotatingGroupChild: false,

    // Interaction flags
    isDrawing: false,
    isDragging: false,
    isPanning: false,
    isResizing: false,
    isSelecting: false,
    isRotating: false,
    isExporting: false, // Set during video export to hide UI overlays

    // Drag/resize state
    resizeHandle: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    drawEndX: 0, // Snapped end coordinates for drawing preview (used by recording canvas)
    drawEndY: 0,
    selectionBoxStart: null,
    resizeStartBounds: null,
    resizeStartPos: null,
    resizeStartShapes: null,

    // Rotation state
    rotationStartAngle: 0,
    rotationShapeStartAngle: 0,
    rotationCenterX: 0,
    rotationCenterY: 0,

    // Multi-selection transform state
    multiResizeStart: null,
    multiRotateStart: null,

    // Pan/Zoom
    zoom: config.zoom.default,
    panX: 0,
    panY: 0,
    lastPanX: 0,
    lastPanY: 0,
    spacePressed: false,

    // History (undo/redo)
    history: [],
    historyIndex: -1,

    // Clipboard
    clipboard: [],
    clipboardSource: 'main',
    clipboardFrameIndex: -1,

    // Snap guides
    snapEnabled: config.snap.enabled,
    snapThreshold: config.snap.threshold,
    activeSnapLines: { vertical: [], horizontal: [] },
    activeSnapPoints: [],
    snapPoints: null,
    snapToGuides: true,
    snapToObjects: true,

    // Current freehand drawing
    currentFreehand: null,

    // Text editing - index of shape being edited (-1 if none)
    textEditingIndex: -1,

    // Frame children highlight
    highlightedFrameIndex: -1,

    // Frame drop target
    dropTargetFrameIndex: -1,

    // Image cropping
    isCropping: false,
    cropImageIndex: -1,
    cropFrameChild: null,
    cropGroupChild: null,
    cropBounds: null,
    cropHandle: null,
    cropStartBounds: null,
    cropStartPos: null,
    cropImageBounds: null,
    cropRotation: 0,

    // Text editing frame child
    textEditingFrameChild: null,

    // Vector edit mode
    isVectorEditing: false,
    vectorEditIndex: -1,
    vectorEditGroupIndex: -1,
    vectorEditChildIndex: -1,
    vectorEditPath: null,
    vectorEditRotation: 0,
    vectorEditCenter: null,
    activeSegmentIndex: -1,
    activeHandleType: null,
    isDraggingVectorPoint: false,
    vectorDragStart: null,
    vectorDragOriginal: null,

    // Cursor keyframe selection (for delete functionality)
    selectedCursorKeyframeIndex: -1,

    // Theme
    darkMode: config.theme.darkMode,

    // Video editor state
    videoMode: config.video?.enabled || false,
    currentTime: 0,
    isPlaying: false,
    projectDuration: config.video?.defaultDuration || 60,
    fps: config.video?.fps || 30,
    loopPlayback: false,
    currentPreset: config.video?.defaultPreset || '1080p',
    canvasDisplayScale: 1,

    // Tracks (video mode)
    tracks: [],

    // Timeline state
    timelineInstance: null,
    peaksInstance: null,

    // Media elements cache
    mediaElements: {},

    // View mode (hides UI when active)
    viewModeActive: false,

    // Presentation mode state (canvas recording)
    isPresentationMode: false,       // Whether in presentation mode
    presentationDuration: 0,         // Duration of presentation recording (seconds)
    presentationTime: 0,             // Current playback time (seconds)
    isPresentationPlayback: false,   // Whether playing back presentation
    presentationBlobs: null,         // { canvas, webcam, audio } blobs after recording
    showPresentationExport: false,   // Whether to show export modal

    // Dual-canvas recording state (for clean recordings without selection boxes)
    recordingCanvas: null,           // Off-screen canvas for clean recording (with webcam)
    recordingCtx: null,              // Its 2D context
    recordingCanvasNoWebcam: null,   // Off-screen canvas for Video Mode (without webcam)
    recordingCtxNoWebcam: null,      // Its 2D context
    hideSelectionInRecording: true,  // Toggle: hide selection boxes in recording output
    isRecording: false,              // Whether currently recording (synced from useRecording)

    // Animated pencil cursor for recording
    showDrawingPencil: false,        // Enable pencil cursor in recordings
    drawingPencilStyle: 'pencil',    // 'pencil', 'mechanical', 'pen', 'marker', 'stylus', 'chalk'
    drawingPencilScale: 1.0,         // Size multiplier for pencil
  });
}

// Singleton instance for app-wide use
let editorStateInstance = null;
let configInstance = null;

// Canvas refs (set during canvas setup)
let canvasRef = null;
let ctxRef = null;
let wrapperRef = null;

/**
 * Initialize editor state with config and optional initial data
 */
/**
 * Sync config theme colors to CSS variables
 * This ensures CSS and JS use the same theme values
 */
function syncThemeToCssVariables(config) {
  const root = document.documentElement;
  const colors = config.theme?.colors || {};

  // Sync accent colors
  if (colors.accent) {
    root.style.setProperty('--accent', colors.accent);
  }
  if (colors.accentHover) {
    root.style.setProperty('--accent-hover', colors.accentHover);
  }
  if (colors.accentLight) {
    root.style.setProperty('--accent-light', colors.accentLight);
  }

  // Sync selection color (falls back to accent)
  if (colors.selection) {
    root.style.setProperty('--selection', colors.selection);
  }
}

export function initEditorState(config = defaultConfig, initialData = {}) {
  configInstance = config;

  // Sync theme colors to CSS variables
  syncThemeToCssVariables(config);

  const state = createEditorState(config);

  // Apply initial data
  if (initialData.backgroundColor) {
    state.backgroundColor = initialData.backgroundColor;
  }
  if (initialData.shapes) {
    state.shapes = initialData.shapes;
  }
  if (initialData.darkMode !== undefined) {
    state.darkMode = initialData.darkMode;
  }
  if (initialData.videoMode !== undefined) {
    state.videoMode = initialData.videoMode;
  }
  if (initialData.projectDuration !== undefined) {
    state.projectDuration = initialData.projectDuration;
  }
  if (initialData.fps !== undefined) {
    state.fps = initialData.fps;
  }
  if (initialData.currentPreset !== undefined) {
    state.currentPreset = initialData.currentPreset;
  }
  if (initialData.tracks) {
    state.tracks = initialData.tracks;
  }

  // Initialize default tracks for video mode if not provided
  if (state.videoMode && state.tracks.length === 0 && config.tracks?.defaultTracks) {
    state.tracks = config.tracks.defaultTracks.map(t => ({
      ...t,
      muted: false,
      locked: false,
      visible: true,
    }));
  }

  editorStateInstance = {
    state,
    config: configInstance,
  };

  return editorStateInstance;
}

/**
 * Get the editor state (creates default if not initialized)
 * Returns { state, config } - for full composable with methods, use useEditorState()
 */
export function getEditorState() {
  if (!editorStateInstance) {
    editorStateInstance = initEditorState();
  }
  return editorStateInstance;
}

// Singleton for the full composable
let composableInstance = null;

/**
 * Get the full editor composable with all methods (singleton pattern)
 * Use this when you need setTool, setColor, etc.
 */
export function getEditorComposable() {
  if (!composableInstance) {
    composableInstance = useEditorState();
  }
  return composableInstance;
}

/**
 * Setup canvas references - called after DOM is ready
 */
export function setupCanvas() {
  const canvas = document.getElementById('drawing-canvas');
  const wrapper = document.getElementById('canvas-wrapper');

  if (!canvas || !wrapper) {
    console.warn('Canvas or wrapper element not found');
    return null;
  }

  const ctx = canvas.getContext('2d');

  canvasRef = canvas;
  ctxRef = ctx;
  wrapperRef = wrapper;

  // Expose globally for legacy code
  window.canvas = canvas;
  window.ctx = ctx;
  window.wrapper = wrapper;

  return { canvas, ctx, wrapper };
}

/**
 * Get canvas refs
 */
export function getCanvasRefs() {
  return {
    canvas: canvasRef,
    ctx: ctxRef,
    wrapper: wrapperRef,
  };
}

/**
 * Resize canvas to fill viewport
 */
export function resizeCanvas() {
  if (!canvasRef) return;

  canvasRef.width = window.innerWidth;
  canvasRef.height = window.innerHeight;

  // Trigger render if available
  if (typeof window.render === 'function') {
    window.render();
  }
}

/**
 * History management - save current state
 */
export function saveState() {
  const { state, config } = getEditorState();

  // Truncate any redo history
  state.history = state.history.slice(0, state.historyIndex + 1);

  // Create snapshot
  const snapshot = JSON.stringify({
    shapes: state.shapes,
    backgroundColor: state.backgroundColor
  });

  state.history.push(snapshot);

  // Limit history size
  const maxStates = config?.history?.maxStates || 50;
  if (state.history.length > maxStates) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
}

/**
 * History management - undo
 */
export function undo() {
  const { state } = getEditorState();

  if (state.historyIndex > 0) {
    state.historyIndex--;
    const snapshot = JSON.parse(state.history[state.historyIndex]);
    state.shapes = snapshot.shapes;
    state.backgroundColor = snapshot.backgroundColor;
    state.selectedIndices = [];
    state.selectedFrameChildren = [];

    // Re-link media elements if registry exists
    if (typeof window.relinkMediaElements === 'function') {
      window.relinkMediaElements();
    }

    // Reload image elements
    if (typeof window.reloadShapeImages === 'function') {
      window.reloadShapeImages();
    }

    // Clean up orphaned media
    if (typeof window.cleanupOrphanedMedia === 'function') {
      window.cleanupOrphanedMedia();
    }

    // Hide options bar since nothing is selected
    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }

    // Update background color UI
    updateBackgroundColorUI();

    // Trigger render
    if (typeof window.render === 'function') {
      window.render();
    }

    // Update layers list
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }

    // Update timeline if in video mode
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }
}

/**
 * History management - redo
 */
export function redo() {
  const { state } = getEditorState();

  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const snapshot = JSON.parse(state.history[state.historyIndex]);
    state.shapes = snapshot.shapes;
    state.backgroundColor = snapshot.backgroundColor;
    state.selectedIndices = [];
    state.selectedFrameChildren = [];

    // Re-link media elements if registry exists
    if (typeof window.relinkMediaElements === 'function') {
      window.relinkMediaElements();
    }

    // Reload image elements
    if (typeof window.reloadShapeImages === 'function') {
      window.reloadShapeImages();
    }

    // Clean up orphaned media
    if (typeof window.cleanupOrphanedMedia === 'function') {
      window.cleanupOrphanedMedia();
    }

    // Hide options bar since nothing is selected
    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }

    // Update background color UI
    updateBackgroundColorUI();

    // Trigger render
    if (typeof window.render === 'function') {
      window.render();
    }

    // Update layers list
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }

    // Update timeline if in video mode
    if (typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }
}

/**
 * Check if undo is available
 */
export function canUndo() {
  const { state } = getEditorState();
  return state.historyIndex > 0;
}

/**
 * Check if redo is available
 */
export function canRedo() {
  const { state } = getEditorState();
  return state.historyIndex < state.history.length - 1;
}

/**
 * Update background color UI elements
 */
export function updateBackgroundColorUI() {
  const { state } = getEditorState();
  const bgColorInput = document.getElementById('canvas-bg-color');
  const bgHexInput = document.getElementById('canvas-bg-hex');
  if (bgColorInput) bgColorInput.value = state.backgroundColor;
  if (bgHexInput) bgHexInput.value = state.backgroundColor;
}

/**
 * Main composable for editor state
 */
export function useEditorState() {
  const { state, config } = getEditorState();

  // Computed properties
  const selectedShapes = computed(() =>
    state.selectedIndices.map(i => state.shapes[i]).filter(Boolean)
  );

  const hasSelection = computed(() =>
    state.selectedIndices.length > 0 || state.selectedFrameChildren.length > 0
  );

  const isInteracting = computed(() =>
    state.isDrawing ||
    state.isDragging ||
    state.isPanning ||
    state.isResizing ||
    state.isSelecting ||
    state.isRotating ||
    state.isDraggingControlPoint ||
    state.isDraggingVectorPoint
  );

  const selectedShape = computed(() =>
    state.selectedIndices.length === 1 ? state.shapes[state.selectedIndices[0]] : null
  );

  // Methods
  function setTool(tool) {
    const prevTool = state.currentTool;
    state.currentTool = tool;

    // Update wrapper class for tool-specific cursors
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      // Remove previous tool mode class
      if (prevTool) {
        wrapper.classList.remove(`mode-${prevTool}`);
      }
      // Add new tool mode class
      wrapper.classList.add(`mode-${tool}`);
    }
  }

  function setColor(color) {
    state.currentColor = color;
  }

  function setFill(fill) {
    state.currentFill = fill;
  }

  function setSize(size) {
    state.currentSize = size;
  }

  function setOpacity(opacity) {
    state.currentOpacity = opacity;
  }

  function selectShape(index, addToSelection = false) {
    if (addToSelection) {
      if (!state.selectedIndices.includes(index)) {
        state.selectedIndices.push(index);
      }
    } else {
      state.selectedIndices = [index];
      state.selectedFrameChildren = [];
      state.selectedGroupChildren = [];
      state.activeGroupIndex = -1;
    }
    state.selectedCursorKeyframeIndex = -1;
  }

  function selectShapes(indices) {
    state.selectedIndices = [...indices];
    state.selectedFrameChildren = [];
    state.selectedGroupChildren = [];
    state.activeGroupIndex = -1;
    state.selectedCursorKeyframeIndex = -1;
  }

  function clearSelection() {
    state.selectedIndices = [];
    state.selectedFrameChildren = [];
    state.selectedGroupChildren = [];
    state.activeGroupIndex = -1;
    state.selectedCursorKeyframeIndex = -1;
  }

  function addShape(shape) {
    state.shapes.push(shape);
    return state.shapes.length - 1;
  }

  function removeShape(index) {
    state.shapes.splice(index, 1);
    // Adjust selected indices
    state.selectedIndices = state.selectedIndices
      .filter(i => i !== index)
      .map(i => (i > index ? i - 1 : i));
  }

  function updateShape(index, updates) {
    if (state.shapes[index]) {
      Object.assign(state.shapes[index], updates);
    }
  }

  function setBackgroundColor(color) {
    state.backgroundColor = color;
  }

  function setZoom(zoom) {
    state.zoom = Math.max(config.zoom.min, Math.min(config.zoom.max, zoom));
  }

  function setPan(x, y) {
    state.panX = x;
    state.panY = y;
  }

  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    document.documentElement.classList.toggle('dark', state.darkMode);
    document.body.classList.toggle('dark', state.darkMode);
  }

  function setDarkMode(dark) {
    state.darkMode = dark;
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
  }

  // Video mode methods
  function setCurrentTime(time) {
    state.currentTime = Math.max(0, Math.min(time, state.projectDuration));
  }

  function play() {
    state.isPlaying = true;
  }

  function pause() {
    state.isPlaying = false;
  }

  function togglePlayback() {
    state.isPlaying = !state.isPlaying;
  }

  function setProjectDuration(duration) {
    state.projectDuration = Math.max(1, duration);
  }

  return {
    // State
    state,
    config,

    // Computed
    selectedShapes,
    selectedShape,
    hasSelection,
    isInteracting,

    // Tool methods
    setTool,
    setColor,
    setFill,
    setSize,
    setOpacity,

    // Selection methods
    selectShape,
    selectShapes,
    clearSelection,

    // Shape methods
    addShape,
    removeShape,
    updateShape,

    // Canvas methods
    setBackgroundColor,
    setZoom,
    setPan,

    // Theme methods
    toggleDarkMode,
    setDarkMode,

    // Video methods
    setCurrentTime,
    play,
    pause,
    togglePlayback,
    setProjectDuration,

    // History methods (also exported as standalone functions)
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,

    // Canvas methods (also exported as standalone functions)
    setupCanvas,
    resizeCanvas,
    getCanvasRefs,
  };
}

/**
 * Initialize and expose global functions that legacy code and Vue components need
 * Called once during app initialization
 */
export function exposeGlobalFunctions() {
  const { setTool, setColor, setFill, setSize, setBackgroundColor, setDarkMode } = getEditorComposable();

  // Expose tool methods globally for Vue components and legacy compatibility
  window.setTool = setTool;
  window.setColor = setColor;
  window.setFill = setFill;
  window.setStrokeWidth = setSize;
  window.setBackgroundColor = setBackgroundColor;
  window.applyDarkMode = setDarkMode;

  // Expose theme sync for runtime updates
  window.syncThemeToCssVariables = () => {
    if (configInstance) {
      syncThemeToCssVariables(configInstance);
    }
  };
}

export default useEditorState;
