<script setup>
/**
 * App.vue - Main Vue overlay component for the editor
 *
 * This overlay provides:
 * - EditorToolbar (floating toolbar at top)
 * - MenuPanel (popup panel toggled from toolbar menu button)
 * - LayersPanel (popup panel toggled from footer)
 * - ContextMenu (right-click menu)
 * - OptionsBar (shape properties bar when elements selected)
 * - TimelinePanel (video mode only - docked at bottom)
 * - TimelineContextMenu (video mode only - right-click on clips/tracks)
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { getEditorState } from './composables/useEditorState.js';
import { getClipboard } from './composables/useClipboard.js';
import { getRenderer } from './composables/useRenderer.js';
import { getInteractions } from './composables/useInteractions.js';
import { getKeyboard } from './composables/useKeyboard.js';
import { getTimeline } from './composables/useTimeline.js';
import { getPlayback } from './composables/usePlayback.js';
import { getVideoState } from './composables/useVideoState.js';
import EditorToolbar from './components/toolbar/EditorToolbar.vue';
import MenuPanel from './components/panels/MenuPanel.vue';
import LayersPanel from './components/panels/LayersPanel.vue';
import KeyboardShortcutsModal from './components/panels/KeyboardShortcutsModal.vue';
import ContextMenu from './components/context-menu/ContextMenu.vue';
import OptionsBar from './components/options-bar/OptionsBar.vue';
import TextEditor from './components/text-editor/TextEditor.vue';
import FooterControls from './components/footer/FooterControls.vue';
import TimelinePanel from './components/video/TimelinePanel.vue';
import TimelineContextMenu from './components/video/TimelineContextMenu.vue';
import RecordingDialog from './components/recording/RecordingDialog.vue';
import PresentationExport from './components/modals/PresentationExport.vue';
import PresentationPreview from './components/modals/PresentationPreview.vue';
import { getRecording } from './composables/useRecording.js';
import { getPresentationMode } from './composables/usePresentationMode.js';
import { registerStreamElement, registerMediaElement } from './utils/media.js';

const { state, config } = getEditorState();
const recording = getRecording();
const presentation = getPresentationMode();
const clipboard = getClipboard();

// Handle clipboard keyboard shortcuts with Vue composable
// This ensures proper media element handling
function handleKeyDown(e) {
  // Only handle clipboard shortcuts, let other keys pass through to legacy handler
  if (!(e.ctrlKey || e.metaKey)) return;

  // Don't intercept if user is typing in an input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    return;
  }

  switch (e.key.toLowerCase()) {
    case 'c':
      e.preventDefault();
      e.stopPropagation();
      clipboard.copySelected();
      break;
    case 'x':
      e.preventDefault();
      e.stopPropagation();
      clipboard.cutSelected();
      break;
    case 'v':
      e.preventDefault();
      e.stopPropagation();
      clipboard.pasteClipboard();
      break;
  }
}

// Check if we're in video mode
const isVideoMode = computed(() => state.videoMode === true);

// Check if we're in presentation mode (canvas recording)
const isPresentationMode = computed(() => state.isPresentationMode === true);

// Helper: Check if a shape is visible at a given time (for video mode temporal filtering)
function isShapeVisibleAtTime(shape, time) {
  // Shapes without startTime are always visible (legacy canvas mode shapes)
  if (shape.startTime === undefined) return true;

  const startTime = shape.startTime || 0;
  const duration = shape.duration || 5;
  const endTime = startTime + duration;

  return time >= startTime && time < endTime;
}

// Check if view mode is active (hides UI)
const isViewMode = computed(() => state.viewModeActive === true);

// Scroll to content button visibility
const showScrollButton = ref(false);

/**
 * Check if content is off-screen and update scroll button visibility
 */
function updateScrollToContentButton() {
  const canvas = document.getElementById('drawing-canvas');
  if (!canvas) {
    showScrollButton.value = false;
    return;
  }

  const rect = canvas.getBoundingClientRect();

  // In video mode, "content" is the export frame (canvas internal dimensions)
  // In canvas mode, "content" is the bounding box of all shapes
  let bounds = null;

  if (state.videoMode) {
    // Video mode: the export frame is from (0,0) to (canvas.width, canvas.height)
    // These are the internal canvas coordinates (e.g., 1920x1080)
    bounds = {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };
  } else {
    // Canvas mode: use shape bounds
    if (state.shapes.length === 0) {
      showScrollButton.value = false;
      return;
    }

    if (typeof window.getContentBounds === 'function') {
      bounds = window.getContentBounds();
    }

    // Fallback: calculate bounds manually if getContentBounds not available or returned null
    if (!bounds) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      state.shapes.forEach(shape => {
        if (shape.visible === false) return;
        const shapeBounds = typeof window.getShapeBounds === 'function'
          ? window.getShapeBounds(shape)
          : { x: shape.x || 0, y: shape.y || 0, width: shape.width || 100, height: shape.height || 100 };
        if (shapeBounds) {
          minX = Math.min(minX, shapeBounds.x);
          minY = Math.min(minY, shapeBounds.y);
          maxX = Math.max(maxX, shapeBounds.x + shapeBounds.width);
          maxY = Math.max(maxY, shapeBounds.y + shapeBounds.height);
        }
      });
      if (minX !== Infinity) {
        bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
    }
  }

  if (!bounds) {
    showScrollButton.value = false;
    return;
  }

  // In video mode, we need to account for the display scale
  const displayScale = state.canvasDisplayScale || 1;

  // Viewport size (CSS pixels for the canvas container)
  const viewportWidth = rect.width;
  const viewportHeight = rect.height;

  // Convert content bounds to screen coordinates (CSS pixels)
  let contentScreenX, contentScreenY, contentScreenWidth, contentScreenHeight;

  if (state.videoMode) {
    // In video mode:
    // 1. Internal canvas coords are transformed: x' = x * zoom + panX
    // 2. Then CSS scales the whole canvas by displayScale: screenX = x' * displayScale
    // So: screenX = (x * zoom + panX) * displayScale
    const zoom = state.zoom || 1;
    contentScreenX = (bounds.x * zoom + state.panX) * displayScale;
    contentScreenY = (bounds.y * zoom + state.panY) * displayScale;
    contentScreenWidth = bounds.width * zoom * displayScale;
    contentScreenHeight = bounds.height * zoom * displayScale;
  } else {
    // For canvas mode: standard coordinate conversion
    contentScreenX = bounds.x * state.zoom + state.panX;
    contentScreenY = bounds.y * state.zoom + state.panY;
    contentScreenWidth = bounds.width * state.zoom;
    contentScreenHeight = bounds.height * state.zoom;
  }

  // Check if content is visible in the canvas viewport
  const isVisible = (
    contentScreenX + contentScreenWidth > 0 &&
    contentScreenX < viewportWidth &&
    contentScreenY + contentScreenHeight > 0 &&
    contentScreenY < viewportHeight
  );

  showScrollButton.value = !isVisible;
}

/**
 * Scroll canvas to center content
 * In video mode: centers the export frame (canvas dimensions)
 * In canvas mode: centers the bounding box of all shapes
 */
function scrollToContent() {
  const canvas = document.getElementById('drawing-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();

  // In video mode, "content" is the export frame (canvas internal dimensions)
  // In canvas mode, "content" is the bounding box of all shapes
  let bounds = null;

  if (state.videoMode) {
    // Video mode: the export frame is from (0,0) to (canvas.width, canvas.height)
    // These are the internal canvas coordinates (e.g., 1920x1080)
    bounds = {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };
  } else {
    // Canvas mode: use shape bounds
    if (state.shapes.length === 0) return;

    if (typeof window.getContentBounds === 'function') {
      bounds = window.getContentBounds();
    }

    // Fallback: calculate bounds manually if getContentBounds not available or returned null
    if (!bounds) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      state.shapes.forEach(shape => {
        if (shape.visible === false) return;
        const shapeBounds = typeof window.getShapeBounds === 'function'
          ? window.getShapeBounds(shape)
          : { x: shape.x || 0, y: shape.y || 0, width: shape.width || 100, height: shape.height || 100 };
        if (shapeBounds) {
          minX = Math.min(minX, shapeBounds.x);
          minY = Math.min(minY, shapeBounds.y);
          maxX = Math.max(maxX, shapeBounds.x + shapeBounds.width);
          maxY = Math.max(maxY, shapeBounds.y + shapeBounds.height);
        }
      });
      if (minX !== Infinity) {
        bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
    }
  }

  if (!bounds) return;

  // In video mode, we need to account for the display scale
  // The canvas internal resolution (e.g., 1920x1080) is displayed at a smaller CSS size
  const displayScale = state.canvasDisplayScale || 1;

  // Viewport size (CSS pixels for the canvas container)
  const viewportWidth = rect.width;
  const viewportHeight = rect.height;

  // Calculate center of content in canvas coordinates
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  // Convert to screen coordinates and calculate pan to center
  // The transform operates in internal canvas coordinates:
  // A point (x,y) maps to (x*zoom + panX, y*zoom + panY)
  // To center content, we want contentCenter to map to viewport center
  if (state.videoMode) {
    // In video mode, viewport center in internal coords = canvas center
    // (since the canvas fills the viewport via CSS scaling)
    // We want: canvas.width/2 = contentCenterX * zoom + panX
    // => panX = canvas.width/2 - contentCenterX * zoom
    const viewportCenterInternalX = canvas.width / 2;
    const viewportCenterInternalY = canvas.height / 2;
    state.panX = viewportCenterInternalX - contentCenterX * (state.zoom || 1);
    state.panY = viewportCenterInternalY - contentCenterY * (state.zoom || 1);
  } else {
    // For canvas mode: standard pan calculation
    state.panX = viewportWidth / 2 - contentCenterX * state.zoom;
    state.panY = viewportHeight / 2 - contentCenterY * state.zoom;
  }

  // Re-render
  if (typeof window.render === 'function') {
    window.render();
  }

  // Hide button after scrolling
  showScrollButton.value = false;
}

/**
 * Initialize video workspace layout
 * Creates the video workspace structure and moves canvas into it
 */
function initVideoWorkspace() {
  const body = document.body;
  const existingContent = Array.from(body.children);

  // Create workspace container
  const workspace = document.createElement('div');
  workspace.className = 'video-workspace';
  workspace.innerHTML = `
    <div class="workspace-content" id="workspace-content">
      <div class="canvas-frame" id="canvas-frame">
        <!-- Canvas wrapper will be moved here -->
      </div>
    </div>

    <!-- Docked Timeline -->
    <div class="docked-timeline" id="docked-timeline">
      <!-- Timeline content provided by TimelinePanel.vue via Teleport -->
    </div>
  `;

  body.insertBefore(workspace, body.firstChild);

  // Move canvas wrapper into frame
  const canvasFrame = document.getElementById('canvas-frame');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  if (canvasWrapper && canvasFrame) {
    canvasFrame.appendChild(canvasWrapper);
  }

  // Move other elements after workspace
  existingContent.forEach(el => {
    if (el !== workspace && el.id !== 'canvas-wrapper' && !el.classList.contains('toolbar')) {
      body.appendChild(el);
    }
  });

  // Hide footer controls (video mode has controls in timeline header)
  const footerControls = document.querySelector('.footer-controls');
  if (footerControls) {
    footerControls.style.display = 'none';
  }

  // Hide help text in video mode
  const helpText = document.querySelector('.help-text');
  if (helpText) {
    helpText.style.display = 'none';
  }

  // Apply initial screen preset and resize canvas after a frame to ensure layout is complete
  // Use config.video.defaultPreset as fallback (defaults to '720p' in defaults.js)
  requestAnimationFrame(() => {
    applyScreenPreset(state.currentPreset || config.video?.defaultPreset || '1080p');
  });

  // Initialize vis-timeline after TimelinePanel has rendered #timeline-container
  // TimelinePanel uses Teleport which needs #docked-timeline to exist first,
  // then Vue needs to re-render to create #timeline-container
  // So we poll until the container exists
  const waitForTimelineContainer = () => {
    const container = document.getElementById('timeline-container');
    if (container) {
      const timeline = getTimeline();
      timeline.initTimeline('timeline-container');

      // Get playback composable to expose its functions
      getPlayback();

      // Resize canvas again after timeline is rendered (workspace height changes)
      requestAnimationFrame(() => {
        resizeCanvasToFit();
      });
    } else {
      // Container not ready yet, check again
      setTimeout(waitForTimelineContainer, 50);
    }
  };

  // Start checking after a brief delay for initial Vue render
  setTimeout(waitForTimelineContainer, 50);
}

/**
 * Apply a screen preset (resolution) for video mode
 */
function applyScreenPreset(presetName) {
  // Try to get preset from CONFIG first (matches legacy behavior)
  const configPresets = window.CONFIG?.screenPresets;
  let preset = configPresets?.[presetName];

  // Fallback to hardcoded presets if not in config
  if (!preset) {
    const fallbackPresets = {
      '4k': { width: 3840, height: 2160 },
      '4K': { width: 3840, height: 2160 },
      '1440p': { width: 2560, height: 1440 },
      'hd1080': { width: 1920, height: 1080 },
      '1080p': { width: 1920, height: 1080 },
      'hd720': { width: 1280, height: 720 },
      '720p': { width: 1280, height: 720 },
      'square': { width: 1080, height: 1080 },
      'Square': { width: 1080, height: 1080 },
      'portrait': { width: 1080, height: 1920 },
      'Vertical HD': { width: 1080, height: 1920 },
      'story': { width: 1080, height: 1920 },
      'instagram': { width: 1080, height: 1350 },
      'Instagram Portrait': { width: 1080, height: 1350 },
      'Cinematic': { width: 2560, height: 1080 },
      'Twitter': { width: 1280, height: 720 },
      'Facebook Cover': { width: 820, height: 312 },
    };
    preset = fallbackPresets[presetName] || { width: 1920, height: 1080 };
  }

  // Get old dimensions for shape scaling
  const oldWidth = window.CONFIG?.canvas?.width || 1920;
  const oldHeight = window.CONFIG?.canvas?.height || 1080;
  const newWidth = preset.width;
  const newHeight = preset.height;

  // Update state and CONFIG first
  state.currentPreset = presetName;
  state.canvasWidth = newWidth;
  state.canvasHeight = newHeight;
  if (window.CONFIG?.canvas) {
    window.CONFIG.canvas.width = newWidth;
    window.CONFIG.canvas.height = newHeight;
  }

  // Scale all shapes proportionally if dimensions changed
  if (oldWidth !== newWidth || oldHeight !== newHeight) {
    scaleAllShapes(oldWidth, oldHeight, newWidth, newHeight);
  }

  // Resize canvas to fit in the workspace
  resizeCanvasToFit();

  // Save state for undo
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

/**
 * Apply custom canvas size (width x height)
 */
function applyCustomSize(width, height) {
  if (!width || !height || width <= 0 || height <= 0) return;

  // Get old dimensions for shape scaling
  const oldWidth = window.CONFIG?.canvas?.width || 1920;
  const oldHeight = window.CONFIG?.canvas?.height || 1080;

  // Scale all shapes proportionally if dimensions changed
  if (oldWidth !== width || oldHeight !== height) {
    scaleAllShapes(oldWidth, oldHeight, width, height);
  }

  state.currentPreset = 'custom';

  // Update CONFIG
  if (window.CONFIG?.canvas) {
    window.CONFIG.canvas.width = width;
    window.CONFIG.canvas.height = height;
  }

  // Set canvas size
  const canvas = document.getElementById('drawing-canvas');
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }

  // Resize to fit in the available space
  resizeCanvasToFit();

  // Save state for undo
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

/**
 * Scale all shapes proportionally when canvas size changes
 * Matches legacy scaleAllShapes() from extensions.js
 */
function scaleAllShapes(oldWidth, oldHeight, newWidth, newHeight) {
  if (oldWidth === newWidth && oldHeight === newHeight) return;
  if (!state.shapes || state.shapes.length === 0) return;

  const scaleX = newWidth / oldWidth;
  const scaleY = newHeight / oldHeight;

  state.shapes.forEach(shape => {
    scaleShape(shape, scaleX, scaleY);
  });

  // Update connected arrow endpoints after scaling
  // This recalculates endpoint positions based on their connected shapes
  const interactions = getInteractions();
  if (interactions?.updateAllConnectedArrows) {
    interactions.updateAllConnectedArrows();
  }

  // Render and update timeline (matches legacy behavior)
  if (typeof window.render === 'function') {
    window.render();
  }
  if (typeof window.updateTimelineItems === 'function') {
    window.updateTimelineItems();
  }
}

/**
 * Adjust shape position when canvas size changes
 * Elements maintain their size and aspect ratio, only position is adjusted
 * so they remain in the same relative location on the canvas
 */
function scaleShape(shape, scaleX, scaleY) {
  if (!shape) return;

  // AUDIO - no canvas representation, only timeline
  if (shape.type === 'audio') {
    return;
  }

  // For all shapes: adjust position only, maintain size
  // This keeps elements at their relative position on canvas

  // Position-based shapes (rect, ellipse, image, video, text, frame, etc.)
  if (shape.x !== undefined) shape.x *= scaleX;
  if (shape.y !== undefined) shape.y *= scaleY;

  // Line/arrow endpoints - adjust positions to maintain relative placement
  if (shape.x1 !== undefined) shape.x1 *= scaleX;
  if (shape.y1 !== undefined) shape.y1 *= scaleY;
  if (shape.x2 !== undefined) shape.x2 *= scaleX;
  if (shape.y2 !== undefined) shape.y2 *= scaleY;

  // Triangle vertices
  if (shape.x3 !== undefined) shape.x3 *= scaleX;
  if (shape.y3 !== undefined) shape.y3 *= scaleY;

  // Control points for curved lines
  if (shape.controlPoint) {
    shape.controlPoint.x *= scaleX;
    shape.controlPoint.y *= scaleY;
  }

  // Arrow endpoints (legacy format)
  if (shape.endX !== undefined) shape.endX *= scaleX;
  if (shape.endY !== undefined) shape.endY *= scaleY;

  // Path points (for freehand, pen tool, etc.) - adjust all point positions
  if (shape.points && Array.isArray(shape.points)) {
    shape.points = shape.points.map(pt => {
      if (Array.isArray(pt)) {
        return [pt[0] * scaleX, pt[1] * scaleY];
      } else if (pt && typeof pt === 'object') {
        return {
          ...pt,
          x: (pt.x || 0) * scaleX,
          y: (pt.y || 0) * scaleY
        };
      }
      return pt;
    });
  }

  // Path segments (for boolean operation results) - adjust positions
  if (shape.segments && Array.isArray(shape.segments)) {
    shape.segments = shape.segments.map(seg => ({
      ...seg,
      point: [seg.point[0] * scaleX, seg.point[1] * scaleY],
      handleIn: seg.handleIn ? [seg.handleIn[0] * scaleX, seg.handleIn[1] * scaleY] : undefined,
      handleOut: seg.handleOut ? [seg.handleOut[0] * scaleX, seg.handleOut[1] * scaleY] : undefined
    }));
  }

  // SVG path data - adjust coordinates
  if (shape.pathData) {
    shape.pathData = scalePathData(shape.pathData, scaleX, scaleY);
  }

  // NOTE: We do NOT scale these properties to maintain aspect ratio:
  // - width, height (shape dimensions)
  // - radiusX, radiusY, radius (ellipse/circle size)
  // - fontSize (text size)
  // - strokeWidth, lineWidth (line thickness)
  // - cropX, cropY, cropWidth, cropHeight (source coordinates)

  // Frame children - adjust their positions too
  if (shape.children && Array.isArray(shape.children)) {
    shape.children.forEach(child => {
      scaleShape(child, scaleX, scaleY);
    });
  }

  // Group children
  if (shape.type === 'group' && shape.shapes && Array.isArray(shape.shapes)) {
    shape.shapes.forEach(child => {
      scaleShape(child, scaleX, scaleY);
    });
  }
}

/**
 * Scale SVG path data string coordinates
 */
function scalePathData(pathData, scaleX, scaleY) {
  return pathData.replace(
    /(-?[\d.]+)\s*,?\s*(-?[\d.]+)/g,
    (_match, x, y) => {
      const newX = parseFloat(x) * scaleX;
      const newY = parseFloat(y) * scaleY;
      return newX + ',' + newY;
    }
  );
}

/**
 * Resize canvas to fit in the canvas-frame container (video mode)
 * Matches legacy resizeCanvasToFit() from extensions.js
 */
function resizeCanvasToFit() {
  const content = document.getElementById('workspace-content');
  const frame = document.getElementById('canvas-frame');
  const canvas = document.getElementById('drawing-canvas');
  const wrapper = document.getElementById('canvas-wrapper');

  if (!content || !frame || !canvas) return;

  const padding = 40;

  // Get available space from workspace-content (not canvas-frame)
  const availableWidth = content.clientWidth - padding * 2;
  const availableHeight = content.clientHeight - padding * 2;

  // Don't resize if no space available
  if (availableWidth <= 0 || availableHeight <= 0) return;

  // Get canvas internal resolution from CONFIG
  const canvasWidth = window.CONFIG?.canvas?.width || canvas.width || 1920;
  const canvasHeight = window.CONFIG?.canvas?.height || canvas.height || 1080;
  const aspectRatio = canvasWidth / canvasHeight;

  // Calculate display size maintaining aspect ratio
  let displayWidth = availableWidth;
  let displayHeight = displayWidth / aspectRatio;

  if (displayHeight > availableHeight) {
    displayHeight = availableHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  // Set frame size (this is key - legacy sets frame size, not just canvas)
  frame.style.width = displayWidth + 'px';
  frame.style.height = displayHeight + 'px';

  // Set canvas internal resolution
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Set canvas display size to exact pixel values (NOT percentages)
  // Using '100%' inside a flex container with 'width: auto' can cause the actual
  // rendered size to differ from displayWidth, breaking coordinate conversion
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';

  // Set wrapper to fill frame
  if (wrapper) {
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
  }

  // CRITICAL: Store scale for mouse coordinate conversion and UI element scaling
  state.canvasDisplayScale = displayWidth / canvasWidth;

  // Reset pan to center the canvas content
  state.panX = 0;
  state.panY = 0;
  state.zoom = 1;

  // Update zoom UI to reflect the reset zoom (matches legacy behavior)
  if (typeof window.updateZoomSlider === 'function') {
    window.updateZoomSlider();
  }
  if (typeof window.updateZoomDisplay === 'function') {
    window.updateZoomDisplay();
  }

  // Re-render
  if (typeof window.render === 'function') {
    window.render();
  }
}

// Component visibility state
const showMenuPanel = ref(false);
const showLayersPanel = ref(false);
const showShortcutsModal = ref(false);
const contextMenuRef = ref(null);
const textEditorRef = ref(null);

// Sync dark mode class to document (needed for CSS variables)
watch(() => state.darkMode, (isDark) => {
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
  // Also toggle video-workspace light-mode class
  const workspace = document.querySelector('.video-workspace');
  if (workspace) {
    workspace.classList.toggle('light-mode', !isDark);
  }
}, { immediate: true });

// Watch view mode to hide/show legacy UI elements
watch(() => state.viewModeActive, (viewModeOn) => {
  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    // Footer controls and help text are only for canvas mode
    const footerControls = document.querySelector('.footer-controls');
    const helpText = document.querySelector('.help-text');
    // Hide legacy toolbar if it exists (shouldn't, but just in case)
    const legacyToolbar = document.querySelector('.toolbar:not(#vue-overlay-root .toolbar)');

    if (viewModeOn) {
      // Use inline style for reliable hiding (hidden class may not be defined)
      if (footerControls) footerControls.style.display = 'none';
      if (helpText) helpText.style.display = 'none';
      if (legacyToolbar) legacyToolbar.style.display = 'none';
      // Note: Timeline hiding is handled by TimelinePanel component via :hidden prop
      // This preserves vis-timeline's internal state
    } else {
      // Only restore footer-controls and help-text in canvas mode (not video mode)
      if (!state.videoMode) {
        if (footerControls) footerControls.style.display = '';
        if (helpText) helpText.style.display = '';
      }
      // Don't restore legacy toolbar - it should stay hidden (Vue toolbar is used)
    }
  });
});

// Keep webcamCapture shape on top during recording
// When new shapes are added during recording, move webcam to front
watch(() => state.shapes.length, () => {
  // Find any recording webcamCapture shape
  const webcamIndex = state.shapes.findIndex(s => s.type === 'webcamCapture' && s.isRecording);
  if (webcamIndex !== -1 && webcamIndex !== state.shapes.length - 1) {
    // Move webcam to end (top) of shapes array
    const webcamShape = state.shapes.splice(webcamIndex, 1)[0];
    state.shapes.push(webcamShape);
    // Update selectedIndices if webcam was selected
    if (state.selectedIndices.includes(webcamIndex)) {
      state.selectedIndices = state.selectedIndices.map(i => {
        if (i === webcamIndex) return state.shapes.length - 1;
        if (i > webcamIndex) return i - 1;
        return i;
      });
    } else {
      // Adjust other selected indices
      state.selectedIndices = state.selectedIndices.map(i => i > webcamIndex ? i - 1 : i);
    }
  }
});

// Position a panel below a button (fallback if legacy function not available)
function positionPanel(panel, btn, align = 'left', preferAbove = false) {
  if (!panel || !btn) return;

  const btnRect = btn.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const padding = 8;

  let top, left;

  if (align === 'right') {
    left = btnRect.right - panelRect.width;
  } else {
    left = btnRect.left;
  }

  // Keep panel on screen horizontally
  if (left < padding) left = padding;
  if (left + panelRect.width > window.innerWidth - padding) {
    left = window.innerWidth - panelRect.width - padding;
  }

  if (preferAbove) {
    top = btnRect.top - panelRect.height - padding;
    if (top < padding) top = btnRect.bottom + padding;
  } else {
    top = btnRect.bottom + padding;
    if (top + panelRect.height > window.innerHeight - padding) {
      top = btnRect.top - panelRect.height - padding;
    }
  }

  panel.style.top = top + 'px';
  panel.style.left = left + 'px';
}

// Toggle menu panel - exposed globally for toolbar menu button
async function toggleMenuPanel() {
  // IMPORTANT: Query inside #vue-overlay-root to get Vue button, not legacy button (which is display:none)
  const btn = document.querySelector('#vue-overlay-root [data-toggle="menu"]');

  if (!showMenuPanel.value) {
    // Opening the panel
    justOpenedMenu = true; // Prevent handleClickOutside from immediately closing

    if (btn) {
      btn.classList.add('active');
    }

    // Make visible first
    showMenuPanel.value = true;

    // Wait for Vue to render the panel, then position it
    await nextTick();
    requestAnimationFrame(() => {
      const panel = document.querySelector('#vue-overlay-root #menu-panel');
      if (panel && btn) {
        const btnRect = btn.getBoundingClientRect();
        const padding = 8;

        // Position panel below button, aligned to left edge
        let left = btnRect.left;
        let top = btnRect.bottom + padding;

        // Ensure panel stays on screen
        const panelWidth = 256;
        if (left + panelWidth > window.innerWidth - padding) {
          left = window.innerWidth - panelWidth - padding;
        }
        if (left < padding) {
          left = padding;
        }

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
      }
    });

  } else {
    // Closing the panel
    showMenuPanel.value = false;
    if (btn) {
      btn.classList.remove('active');
    }
  }
}

function hideMenuPanel() {
  showMenuPanel.value = false;
  const btn = document.querySelector('#vue-overlay-root [data-toggle="menu"]');
  if (btn) {
    btn.classList.remove('active');
  }
}

// Toggle layers panel - exposed globally for legacy footer button
async function toggleLayersPanel() {
  // Query for the Vue button first (inside #vue-overlay-root), fall back to any button
  const btn = document.querySelector('#vue-overlay-root [data-toggle="layers"]')
    || document.querySelector('[data-toggle="layers"]');

  if (!showLayersPanel.value) {
    // Opening the panel
    justOpenedLayers = true; // Prevent handleClickOutside from immediately closing
    showLayersPanel.value = true;

    if (btn) {
      btn.classList.add('active');
    }

    // Wait for Vue to render the visible class, then position
    await nextTick();
    requestAnimationFrame(() => {
      const panel = document.querySelector('#vue-overlay-root #layers-panel');
      if (panel && btn) {
        // Use legacy function if available, otherwise use our fallback
        if (typeof window.positionPanelBelowButton === 'function') {
          window.positionPanelBelowButton(panel, btn, 'right', true);
        } else {
          positionPanel(panel, btn, 'right', true);
        }
      }
    });
  } else {
    // Closing the panel
    showLayersPanel.value = false;
    if (btn) {
      btn.classList.remove('active');
    }
  }
}

function hideLayersPanel() {
  showLayersPanel.value = false;
  // Query for the Vue button first (inside #vue-overlay-root), fall back to any button
  const btn = document.querySelector('#vue-overlay-root [data-toggle="layers"]')
    || document.querySelector('[data-toggle="layers"]');
  if (btn) {
    btn.classList.remove('active');
  }
}

// Context menu handlers
function showContextMenu(x, y, canvasX = null, canvasY = null) {
  if (contextMenuRef.value) {
    contextMenuRef.value.show(x, y, canvasX, canvasY);
  }
}

function hideContextMenu() {
  if (contextMenuRef.value) {
    contextMenuRef.value.hide();
  }
}

// Handle right-click on canvas
function handleContextMenu(e) {
  // Only handle if clicking on canvas or its container
  if (e.target.closest('#canvas') || e.target.closest('.canvas-container')) {
    e.preventDefault();

    // Convert to canvas coordinates for "Paste here" functionality
    let canvasX = null, canvasY = null;
    if (typeof window.screenToCanvas === 'function') {
      const pos = window.screenToCanvas(e.clientX, e.clientY);
      canvasX = pos.x;
      canvasY = pos.y;

      // Perform hit test and select element under cursor (matches legacy behavior)
      if (typeof window.hitTest === 'function') {
        const hit = window.hitTest(pos.x, pos.y);
        if (hit >= 0 && !state.selectedIndices.includes(hit)) {
          state.selectedIndices = [hit];
          if (typeof window.render === 'function') window.render();
          if (typeof window.renderLayersList === 'function') window.renderLayersList();
        }
      }
    }

    showContextMenu(e.clientX, e.clientY, canvasX, canvasY);
  }
}

// Track if we just opened a panel (to avoid immediate close from same click)
let justOpenedMenu = false;
let justOpenedLayers = false;

// Handle clicks outside panels to close them
function handleClickOutside(e) {
  // Close menu panel if clicking outside
  if (showMenuPanel.value) {
    // Skip if we just opened this panel (same click event)
    if (justOpenedMenu) {
      justOpenedMenu = false;
      return;
    }
    const panel = document.querySelector('#vue-overlay-root #menu-panel');
    const btn = document.querySelector('#vue-overlay-root [data-toggle="menu"]');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      hideMenuPanel();
    }
  }

  // Close layers panel if clicking outside
  if (showLayersPanel.value) {
    // Skip if we just opened this panel (same click event)
    if (justOpenedLayers) {
      justOpenedLayers = false;
      return;
    }
    const panel = document.querySelector('#vue-overlay-root #layers-panel');
    // Query for the Vue button first (inside #vue-overlay-root), fall back to any button
    const btn = document.querySelector('#vue-overlay-root [data-toggle="layers"]')
      || document.querySelector('[data-toggle="layers"]');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      hideLayersPanel();
    }
  }
}

/**
 * Add image to canvas from a File object
 * @param {File} file - The image file to add
 * @param {number|null} dropX - Optional X position (canvas coordinates)
 * @param {number|null} dropY - Optional Y position (canvas coordinates)
 */
function addImageToCanvas(file, dropX = null, dropY = null) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      // Create image shape at center of canvas or drop position
      const canvas = document.getElementById('drawing-canvas');
      const canvasWidth = canvas?.width || 1920;
      const canvasHeight = canvas?.height || 1080;

      // Scale image if too large
      let width = img.width;
      let height = img.height;
      const maxSize = Math.min(canvasWidth, canvasHeight) * 0.8;
      if (width > maxSize || height > maxSize) {
        const scale = maxSize / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Use drop position if provided, otherwise center
      let x, y;
      if (dropX !== null && dropY !== null) {
        x = dropX - width / 2;
        y = dropY - height / 2;
      } else {
        // Center position accounting for pan/zoom
        x = (canvasWidth / 2 - state.panX) / state.zoom - width / 2;
        y = (canvasHeight / 2 - state.panY) / state.zoom - height / 2;
      }

      const shape = {
        id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
        type: 'image',
        x,
        y,
        width,
        height,
        src: evt.target.result,
        originalWidth: img.width,
        originalHeight: img.height,
        rotation: 0,
        opacity: 100,
        visible: true,
        locked: false,
        name: file.name.replace(/\.[^.]+$/, ''),
        // CRITICAL: Set the imageElement for the renderer to use
        imageElement: img
      };

      // Add video mode timing if applicable
      if (state.videoMode) {
        const startTime = state.currentTime || 0;
        const duration = 5;

        // Use composable to find available track (handles overlap detection and track creation)
        // Images go on video tracks, not audio tracks
        const videoState = getVideoState();
        const trackId = videoState.findAvailableTrack(startTime, duration, 'video');

        shape.trackId = trackId;
        shape.startTime = startTime;
        shape.duration = duration;

        // Update timeline groups in case a new track was created
        if (typeof window.updateTimelineGroups === 'function') {
          window.updateTimelineGroups();
        }
      }

      // Register the image element in the media registry
      // Register the image element (4-arg signature: shapeId, element, src, type)
      if (typeof window.registerMediaElement === 'function') {
        window.registerMediaElement(shape.id, img, shape.src, 'image');
      }

      state.shapes.push(shape);
      state.selectedIndices = [state.shapes.length - 1];

      if (typeof window.render === 'function') window.render();
      if (typeof window.saveState === 'function') window.saveState();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();
      if (typeof window.updateTimelineItems === 'function') window.updateTimelineItems();
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);

  // Switch back to select tool
  state.currentTool = 'select';
}

/**
 * Handle image file upload from input event
 */
function handleImageUpload(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;

  addImageToCanvas(file);

  // Reset input so same file can be selected again
  if (e.target) e.target.value = '';
}

/**
 * Add video to canvas from a File object
 * @param {File} file - The video file to add
 * @param {number|null} dropX - Optional X position (canvas coordinates)
 * @param {number|null} dropY - Optional Y position (canvas coordinates)
 */
function addVideoToCanvas(file, dropX = null, dropY = null) {
  if (!file) return;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;

  video.onloadedmetadata = () => {
    const canvas = document.getElementById('drawing-canvas');
    const canvasWidth = canvas?.width || 1920;
    const canvasHeight = canvas?.height || 1080;

    // Scale video if too large
    let width = video.videoWidth;
    let height = video.videoHeight;
    const maxSize = Math.min(canvasWidth, canvasHeight) * 0.6;
    if (width > maxSize || height > maxSize) {
      const scale = maxSize / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Use drop position if provided, otherwise center
    let x, y;
    if (dropX !== null && dropY !== null) {
      x = dropX - width / 2;
      y = dropY - height / 2;
    } else {
      x = (canvasWidth / 2 - state.panX) / state.zoom - width / 2;
      y = (canvasHeight / 2 - state.panY) / state.zoom - height / 2;
    }

    // Calculate timing for track placement
    const startTime = state.currentTime || 0;
    const duration = Math.min(video.duration || 5, 30);

    // Find an available track (handles overlap detection and creates new track if needed)
    const videoState = getVideoState();
    const trackId = videoState.findAvailableTrack(startTime, duration, 'video');

    const shape = {
      id: 'vid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      type: 'video',
      x,
      y,
      width,
      height,
      src: url,
      originalWidth: video.videoWidth,
      originalHeight: video.videoHeight,
      rotation: 0,
      opacity: 100,
      visible: true,
      locked: false,
      name: file.name.replace(/\.[^.]+$/, ''),
      videoElement: video,
      videoDuration: video.duration || 5,
      volume: 100,
      muted: false,
      playbackRate: 1,
      startTime: startTime,
      duration: duration,
      trackId: trackId,
    };

    // Add to hidden container
    const container = document.getElementById('hidden-media-container') || (() => {
      const div = document.createElement('div');
      div.id = 'hidden-media-container';
      div.style.cssText = 'position: absolute; left: -9999px; top: -9999px; visibility: hidden;';
      document.body.appendChild(div);
      return div;
    })();
    container.appendChild(video);

    // Register the video element (4-arg signature: shapeId, element, src, type)
    if (typeof window.registerMediaElement === 'function') {
      window.registerMediaElement(shape.id, video, url, 'video');
    }

    state.shapes.push(shape);
    state.selectedIndices = [state.shapes.length - 1];

    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.updateTimelineItems === 'function') window.updateTimelineItems();
  };

  video.src = url;
  state.currentTool = 'select';
}

/**
 * Add audio to timeline from a File object
 * @param {File} file - The audio file to add
 */
function addAudioToTimeline(file) {
  if (!file) return;

  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';

  audio.onloadedmetadata = () => {
    // Calculate timing for track placement
    const startTime = state.currentTime || 0;
    const duration = audio.duration || 5;

    // Find an available audio track (handles overlap detection and creates new track if needed)
    const videoState = getVideoState();
    const trackId = videoState.findAvailableTrack(startTime, duration, 'audio');

    const shape = {
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      type: 'audio',
      src: url,
      name: file.name.replace(/\.[^.]+$/, ''),
      audioElement: audio,
      audioDuration: audio.duration || 5,
      volume: 100,
      muted: false,
      playbackRate: 1,
      startTime: startTime,
      duration: duration,
      trackId: trackId,
      visible: true,
      locked: false,
      isTimelineOnly: true,
    };

    // Add to hidden container
    const container = document.getElementById('hidden-media-container') || (() => {
      const div = document.createElement('div');
      div.id = 'hidden-media-container';
      div.style.cssText = 'position: absolute; left: -9999px; top: -9999px; visibility: hidden;';
      document.body.appendChild(div);
      return div;
    })();
    container.appendChild(audio);

    // Register the audio element (4-arg signature: shapeId, element, src, type)
    if (typeof window.registerMediaElement === 'function') {
      window.registerMediaElement(shape.id, audio, url, 'audio');
    }

    state.shapes.push(shape);
    state.selectedIndices = [state.shapes.length - 1];

    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.updateTimelineItems === 'function') window.updateTimelineItems();
  };

  audio.src = url;
  state.currentTool = 'select';
}

/**
 * Handle recording start - creates capture shapes on canvas
 * @param {Object} streams - { screen: MediaStream, webcam: MediaStream, audio: MediaStream }
 */
function handleRecordingStart(streams) {
  const canvas = document.getElementById('drawing-canvas');
  const canvasWidth = canvas?.width || 1920;
  const canvasHeight = canvas?.height || 1080;

  // Close the dialog
  recording.closeRecordingDialog();

  // Create screen capture shape (full canvas size)
  if (streams.screen) {
    const screenShape = {
      id: 'screen-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      type: 'screenCapture',
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      cornerRadius: 0,
      opacity: 100,
      visible: true,
      locked: false,
      name: 'Screen Capture',
      isRecording: true,
      startTime: state.currentTime || 0,
      duration: 60, // Will be updated when recording stops
    };

    // Find available track
    const videoState = getVideoState();
    screenShape.trackId = videoState.findAvailableTrack(screenShape.startTime, screenShape.duration, 'video');

    // Register stream
    registerStreamElement(screenShape.id, streams.screen);
    recording.registerStreamWithShape(screenShape.id, streams.screen, 'screen');

    state.shapes.push(screenShape);
  }

  // Create webcam capture shape (PiP in corner)
  // Viewport-fixed: uses viewportMarginRight/Bottom for positioning
  // Can be selected, rotated, resized, cropped like a video shape
  if (streams.webcam) {
    const webcamConfig = config.recording?.webcamShape || {};
    const webcamWidth = webcamConfig.width || 320;
    const webcamHeight = webcamConfig.height || 240;
    const margin = webcamConfig.margin || 24;

    const webcamShape = {
      id: 'webcam-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      type: 'webcamCapture',
      // Viewport-fixed positioning (margins from bottom-right corner)
      viewportMarginRight: margin,
      viewportMarginBottom: margin,
      // x/y computed dynamically from viewport margins during render
      x: 0,
      y: 0,
      width: webcamWidth,
      height: webcamHeight,
      rotation: 0,
      cornerRadius: webcamConfig.cornerRadius || 16, // Rounded by default
      strokeColor: webcamConfig.strokeColor || null,
      lineWidth: webcamConfig.lineWidth || 2,
      opacity: 100,
      visible: true,
      locked: false,
      name: 'Webcam',
      isRecording: true,
      startTime: state.currentTime || 0,
      duration: 60,
    };

    // Find available track
    const videoState = getVideoState();
    webcamShape.trackId = videoState.findAvailableTrack(webcamShape.startTime, webcamShape.duration, 'video');

    // Register stream
    registerStreamElement(webcamShape.id, streams.webcam);
    recording.registerStreamWithShape(webcamShape.id, streams.webcam, 'webcam');

    state.shapes.push(webcamShape);
  }

  // Set canvas dimensions for cursor recording coordinate conversion
  recording.setCanvasDimensions(canvasWidth, canvasHeight);

  // Start the actual recording
  recording.startRecording();

  // Start playback automatically in video mode so timeline plays along with recording
  if (state.videoMode && typeof window.play === 'function') {
    // Small delay to ensure streams are ready and shapes are rendered
    setTimeout(() => {
      window.play();
    }, 100);
  }

  // Attach mouse event listeners for cursor recording
  if (recording.state.recordCursor) {
    // Reset debug counters
    mouseEventCount = 0;
    lastMouseLogTime = 0;

    // Check if extension is available for cursor tracking
    if (recording.state.extensionAvailable) {
      // For browser tab recording, tell extension to detect and track only the active tab
      // For window/monitor recording, track all tabs (user might switch between tabs)
      const isBrowserTab = recording.state.recordingDisplaySurface === 'browser';

      recording.startExtensionRecording(isBrowserTab).then(started => {
        if (started) {
        } else {
          console.warn('[Recording] Extension cursor recording failed to start');
          // Fall back to local tracking
          document.addEventListener('mousemove', handleRecordingMouseMove);
          document.addEventListener('mousedown', handleRecordingMouseDown);
        }
      });
      // Don't attach local listeners when extension is handling tracking
      // Extension captures from the ACTUAL recorded tab, not the editor page
    } else {
      // No extension - use local tracking (only works when mouse is over editor page)
      if (recording.state.recordingDisplaySurface !== 'browser') {
        console.warn('[Recording] Install the Artifactuse Cursor Recorder extension for accurate cursor tracking.');
      }

      document.addEventListener('mousemove', handleRecordingMouseMove);
      document.addEventListener('mousedown', handleRecordingMouseDown);
    }
  } 

  // Clear selection - recording clips should be unselected by default
  state.selectedIndices = [];

  // Render and update
  if (typeof window.render === 'function') window.render();
  if (typeof window.saveState === 'function') window.saveState();
  if (typeof window.updateTimelineItems === 'function') window.updateTimelineItems();
}

// Debug: track how many mouse events we've received
let mouseEventCount = 0;
let lastMouseLogTime = 0;

/**
 * Handle mouse move during recording for cursor tracking
 *
 * For browser tab recording (displaySurface === 'browser'):
 * The browser captures the tab's visual content. The mouse position (clientX/Y)
 * is relative to the viewport. When the video is displayed on the canvas,
 * it gets stretched to fill the canvas dimensions.
 *
 * The key insight: The cursor position as a PERCENTAGE of the viewport
 * should map to the same PERCENTAGE of the canvas.
 *
 * Example: If cursor is at 50% width of viewport, it should be at 50% width of canvas.
 * This works because the video content (viewport) is stretched to fill the canvas.
 */
function handleRecordingMouseMove(e) {
  if (!recording.state.isRecording) return;

  mouseEventCount++;

  // Get viewport (window) dimensions - this is the coordinate space for clientX/Y
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Get canvas dimensions (where the video will be displayed)
  const canvasWidth = recording.state.canvasWidth || 1280;
  const canvasHeight = recording.state.canvasHeight || 720;

  // Use percentage-based mapping:
  // cursor position as % of viewport = cursor position as % of canvas
  // This works because the video is stretched to fill the canvas
  const percentX = e.clientX / viewportWidth;
  const percentY = e.clientY / viewportHeight;

  const canvasX = percentX * canvasWidth;
  const canvasY = percentY * canvasHeight;

  // Log every second to avoid spam
  const now = Date.now();
  if (now - lastMouseLogTime > 1000) {
    lastMouseLogTime = now;
  }

  // Record position - cursor mirrors OS cursor in the recorded video
  recording.recordMousePosition(canvasX, canvasY);
}

/**
 * Handle mouse down during recording for click tracking
 */
function handleRecordingMouseDown(e) {
  if (!recording.state.isRecording) return;

  // Get viewport (window) dimensions
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Get canvas dimensions (where the video will be displayed)
  const canvasWidth = recording.state.canvasWidth || 1280;
  const canvasHeight = recording.state.canvasHeight || 720;

  // Use percentage-based mapping (same as mouse move)
  const percentX = e.clientX / viewportWidth;
  const percentY = e.clientY / viewportHeight;

  const canvasX = percentX * canvasWidth;
  const canvasY = percentY * canvasHeight;

  // Record the click - viewport will zoom/pan to this position
  recording.recordClick(canvasX, canvasY, e.button);
}

/**
 * Handle toolbar stop recording event (wrapper for inline controls)
 * Extracts blobs from CustomEvent detail and passes to handleRecordingStop
 */
function handleToolbarStopRecording(event) {
  const blobs = event.detail;
  handleRecordingStop(blobs);
}

/**
 * Handle recording stop - finalizes capture shapes and converts to video
 * @param {{screen: Blob|null, webcam: Blob|null}} recordedBlobs - The recorded video blobs
 */
async function handleRecordingStop(recordedBlobs) {
  // Stop playback and reset playhead to start (playback was started with recording in video mode)
  if (state.videoMode) {
    if (typeof window.pause === 'function') {
      window.pause();
    }
    if (typeof window.seekTo === 'function') {
      window.seekTo(0);
    }
  }

  // Remove mouse event listeners
  document.removeEventListener('mousemove', handleRecordingMouseMove);
  document.removeEventListener('mousedown', handleRecordingMouseDown);

  // Stop extension recording and get final cursor data
  if (recording.state.extensionAvailable && recording.state.recordCursor) {
    const extensionEvents = await recording.stopExtensionRecording();

    // Merge extension events into the buffer
    for (const evt of extensionEvents) {
      if (evt.eventType === 'move') {
        recording.state.cursorBuffer.push({
          time: evt.time,
          x: evt.x,
          y: evt.y
        });
      } else if (evt.eventType === 'click') {
        recording.state.clickBuffer.push({
          time: evt.time,
          x: evt.x,
          y: evt.y,
          button: evt.button || 0
        });
      }
    }
  }

  // Get duration from recording state
  const duration = recording.state.recordingDuration;

  if (!recordedBlobs || (!recordedBlobs.screen && !recordedBlobs.webcam)) {
    console.warn('No recorded blobs available');
    // Just update shapes without converting
    state.shapes.forEach(shape => {
      if ((shape.type === 'screenCapture' || shape.type === 'webcamCapture') && shape.isRecording) {
        shape.isRecording = false;
      }
    });
    if (typeof window.render === 'function') window.render();
    return;
  }

  // Convert screen capture to video shape
  if (recordedBlobs.screen) {
    const screenBlobUrl = URL.createObjectURL(recordedBlobs.screen);

    const screenCaptureIndex = state.shapes.findIndex(
      s => s.type === 'screenCapture' && s.isRecording
    );

    if (screenCaptureIndex !== -1) {
      const screenShape = state.shapes[screenCaptureIndex];

      // Create video element for the recorded content
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.src = screenBlobUrl;

      // Convert screen capture to video shape
      const videoShape = {
        id: screenShape.id,
        type: 'video',
        x: screenShape.x,
        y: screenShape.y,
        width: screenShape.width,
        height: screenShape.height,
        cornerRadius: screenShape.cornerRadius || 0,
        opacity: screenShape.opacity || 100,
        visible: true,
        locked: false,
        name: 'Screen Recording',
        src: screenBlobUrl,
        videoElement: video,
        startTime: screenShape.startTime || 0,
        duration: duration || screenShape.duration,
        trackId: screenShape.trackId,
        // Video playback properties
        videoStartOffset: 0,
        videoSpeed: 1,
        volume: 100,
        muted: false,
      };

      // Register in media registry
      registerMediaElement(videoShape.id, video, screenBlobUrl, 'video');

      // Replace shape
      state.shapes[screenCaptureIndex] = videoShape;

      // Trigger render when video is ready
      video.onloadeddata = () => {
        if (typeof window.render === 'function') window.render();
      };
      video.load();
    }
  } else {
    // Remove screen capture shape if no recording
    const screenCaptureIndex = state.shapes.findIndex(
      s => s.type === 'screenCapture' && s.isRecording
    );
    if (screenCaptureIndex !== -1) {
      state.shapes.splice(screenCaptureIndex, 1);
    }
  }

  let pendingWebcamShape = null;
  // Convert webcam capture to video shape
  if (recordedBlobs.webcam) {
    const webcamBlobUrl = URL.createObjectURL(recordedBlobs.webcam);

    const webcamCaptureIndex = state.shapes.findIndex(
      s => s.type === 'webcamCapture' && s.isRecording
    );

    if (webcamCaptureIndex !== -1) {
      const webcamShape = state.shapes[webcamCaptureIndex];

      // Create video element for the webcam content
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.src = webcamBlobUrl;

      // Convert webcam capture to video shape
      // x/y were computed dynamically from viewport margins, so use current values
      const videoShape = {
        id: webcamShape.id,
        type: 'video',
        x: webcamShape.x,
        y: webcamShape.y,
        width: webcamShape.width,
        height: webcamShape.height,
        rotation: webcamShape.rotation || 0,
        cornerRadius: webcamShape.cornerRadius || 0,
        strokeColor: webcamShape.strokeColor,
        lineWidth: webcamShape.lineWidth,
        opacity: webcamShape.opacity || 100,
        visible: true,
        locked: false,
        name: 'Webcam Recording',
        src: webcamBlobUrl,
        videoElement: video,
        startTime: webcamShape.startTime || 0,
        duration: duration || webcamShape.duration,
        trackId: webcamShape.trackId,
        // Video playback properties
        videoStartOffset: 0,
        videoSpeed: 1,
        volume: 0, // Webcam typically muted to avoid audio feedback
        muted: true,
      };

      // Register in media registry
      registerMediaElement(videoShape.id, video, webcamBlobUrl, 'video');

      // Replace shape
      //state.shapes[webcamCaptureIndex] = videoShape;
      pendingWebcamShape = videoShape;
      state.shapes.splice(webcamCaptureIndex, 1); // Remove the capture placeholder

      // Trigger render when video is ready
      video.onloadeddata = () => {
        if (typeof window.render === 'function') window.render();
      };
      video.load();
    }
  } else {
    // Remove webcam capture shape if no recording
    const webcamCaptureIndex = state.shapes.findIndex(
      s => s.type === 'webcamCapture' && s.isRecording
    );
    if (webcamCaptureIndex !== -1) {
      state.shapes.splice(webcamCaptureIndex, 1);
    }
  }

  // Generate cursor shape and viewport keyframes from recorded mouse data
  const startTime = state.currentTime || 0;
  const cursorData = recording.getRecordedCursorData(startTime);
  const videoState = getVideoState();

  // Add cursor shape if recorded - give it its own dedicated track
  if (cursorData.cursor) {
    // Create a dedicated track for the cursor to avoid overlap with viewport keyframes
    const cursorTrack = videoState.addTrack('video');
    cursorTrack.name = 'Cursor';
    cursorData.cursor.trackId = cursorTrack.id;
    state.shapes.push(cursorData.cursor);
  }

  // Then after adding cursor and viewport keyframes:
  if (pendingWebcamShape) {
    state.shapes.push(pendingWebcamShape);
  }

  // Add viewport keyframes if auto-zoom was enabled
  // Viewport keyframes can share a track since they don't overlap in time with each other
  if (cursorData.viewportKeyframes && cursorData.viewportKeyframes.length > 0) {
    // Create a dedicated track for viewport keyframes
    const viewportTrack = videoState.addTrack('video');
    viewportTrack.name = 'Viewport';

    for (const vpKeyframe of cursorData.viewportKeyframes) {
      vpKeyframe.trackId = viewportTrack.id;
      state.shapes.push(vpKeyframe);
    }
  }

  // Clear selection - clips should be unselected by default after recording
  state.selectedIndices = [];

  // Render and update timeline
  if (typeof window.render === 'function') window.render();
  if (typeof window.saveState === 'function') window.saveState();
  if (typeof window.updateTimelineItems === 'function') window.updateTimelineItems();
}

/**
 * Handle presentation mode recording start
 * For canvas mode - records canvas content directly (no screen share needed)
 * @param {Object} streams - { webcam: MediaStream, audio: MediaStream }
 */
async function handlePresentationRecordingStart(streams) {
  // Close the dialog
  recording.closeRecordingDialog();

  const canvas = document.getElementById('drawing-canvas');
  const canvasWidth = canvas?.width || 1920;
  const canvasHeight = canvas?.height || 1080;

  // Create webcam capture shape (PiP in corner) if webcam enabled
  // Viewport-fixed: uses viewportMarginRight/Bottom for positioning
  // Can be selected, rotated, resized, cropped like a video shape
  if (streams.webcam) {
    const webcamConfig = config.recording?.webcamShape || {};
    const webcamWidth = webcamConfig.width || 320;
    const webcamHeight = webcamConfig.height || 240;
    const margin = webcamConfig.margin || 24;

    const webcamShape = {
      id: 'webcam-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      type: 'webcamCapture',
      // Viewport-fixed positioning (margins from bottom-right corner)
      viewportMarginRight: margin,
      viewportMarginBottom: margin,
      // x/y computed dynamically from viewport margins during render
      x: 0,
      y: 0,
      width: webcamWidth,
      height: webcamHeight,
      rotation: 0,
      cornerRadius: webcamConfig.cornerRadius || 16, // Rounded by default
      strokeColor: webcamConfig.strokeColor || null,
      lineWidth: webcamConfig.lineWidth || 2,
      opacity: 100,
      visible: true,
      locked: false,
      name: 'Webcam',
      isRecording: true,
    };

    // Register stream
    registerStreamElement(webcamShape.id, streams.webcam);
    recording.registerStreamWithShape(webcamShape.id, streams.webcam, 'webcam');

    state.shapes.push(webcamShape);
  }

  // Set canvas dimensions for cursor recording coordinate conversion
  recording.setCanvasDimensions(canvasWidth, canvasHeight);

  // Start canvas recording through presentation mode composable
  await presentation.startCanvasRecording();

  // Render
  if (typeof window.render === 'function') window.render();
}

/**
 * Handle JSON file import
 * This is placed here (not FooterControls) because FooterControls is hidden in video mode
 */
function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (typeof window.loadProject === 'function') {
        window.loadProject(data);
      } else if (typeof window.importFromJson === 'function') {
        window.importFromJson(data);
      }
    } catch (err) {
      console.error('Failed to parse JSON:', err);
    }
  };
  reader.readAsText(file);

  // Reset input so the same file can be re-imported
  e.target.value = '';
}

/**
 * Trigger image upload (called when image tool is clicked)
 */
function triggerImageUpload() {
  const input = document.getElementById('image-file-input');
  if (input) input.click();
}

/**
 * Show keyboard shortcuts help modal
 */
function showHelp() {
  showShortcutsModal.value = true;
}

/**
 * Hide keyboard shortcuts help modal
 */
function hideShortcutsModal() {
  showShortcutsModal.value = false;
}

onMounted(() => {
  // Expose functions globally for legacy code
  window.toggleMenuPanel = toggleMenuPanel;
  window.hideMenuPanel = hideMenuPanel;
  window.vueToggleLayersPanel = toggleLayersPanel;
  window.toggleLayersPanel = toggleLayersPanel;  // Also expose without prefix for legacy setup.js
  window.triggerImageUpload = triggerImageUpload;
  window.addImageToCanvas = addImageToCanvas;  // Accepts File object
  window.handleImageUpload = handleImageUpload;  // Accepts event object
  window.scrollToContent = scrollToContent;
  window.updateScrollToContentButton = updateScrollToContentButton;
  window.showHelp = showHelp;
  window.showShortcutsModal = showHelp;
  window.vueHideLayersPanel = hideLayersPanel;
  window.hideLayersPanel = hideLayersPanel;  // Also expose without prefix for legacy code
  // Video mode functions - expose early so TimelinePanel can use them
  window.applyScreenPreset = applyScreenPreset;
  window.applyCustomSize = applyCustomSize;
  window.resizeCanvasToFit = resizeCanvasToFit;
  window.resizeCanvas = resizeCanvasToFit;
  // Media adding functions
  window.addVideoToCanvas = addVideoToCanvas;
  window.addAudioToTimeline = addAudioToTimeline;

  // Footer controls are now handled by FooterControls.vue
  // Only expose applyDarkMode for other components
  window.applyDarkMode = (isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
  };

  // renderLayersList is a no-op since Vue LayersPanel uses reactive state
  // Legacy code and composables call this, but Vue handles re-rendering automatically
  window.renderLayersList = () => {
    // No-op: Vue LayersPanel watches state.shapes reactively
  };

  // Override legacy context menu functions after legacy code has run
  // Using requestAnimationFrame to ensure this runs after legacy script execution
  requestAnimationFrame(() => {
    window.showContextMenu = showContextMenu;
    window.hideContextMenu = hideContextMenu;

    // Override legacy renderer with Vue composable renderer
    // This ensures the Vue composable's render() is used instead of legacy getRendererScript()
    const renderer = getRenderer();
    renderer.init();

    // Initialize interactions composable to set up event listeners
    // This replaces legacy getInteractionsScript() event handling
    const interactions = getInteractions();
    interactions.init();

    // Initialize keyboard composable for shortcut handling
    const keyboard = getKeyboard();
    keyboard.init();

    // Set up window.render FIRST, before any code that might call it
    // For video mode, wrap the Vue render with temporal filtering
    if (state.videoMode) {
      const vueRender = renderer.render;
      window.render = function() {
        // Get indices of shapes visible at current time
        const visibleIndices = [];
        state.shapes.forEach((shape, i) => {
          if (isShapeVisibleAtTime(shape, state.currentTime)) {
            visibleIndices.push(i);
          }
        });

        // Temporarily filter shapes for rendering
        const allShapes = state.shapes;
        const allSelected = state.selectedIndices;
        const allVectorEditIndex = state.vectorEditIndex;
        const allCropImageIndex = state.cropImageIndex;
        const allTextEditingIndex = state.textEditingIndex;

        // Store allShapes reference for filters/effects lookup
        // The renderer needs to access ALL shapes to find active filters/effects
        state._allShapesForEffects = allShapes;

        // Map selected indices to filtered array
        const filteredShapes = visibleIndices.map(i => allShapes[i]);
        const filteredSelected = allSelected
          .filter(i => visibleIndices.includes(i))
          .map(i => visibleIndices.indexOf(i));

        // Map vectorEditIndex to filtered array
        const filteredVectorEditIndex = visibleIndices.includes(allVectorEditIndex)
          ? visibleIndices.indexOf(allVectorEditIndex)
          : -1;

        // Map cropImageIndex to filtered array
        const filteredCropImageIndex = visibleIndices.includes(allCropImageIndex)
          ? visibleIndices.indexOf(allCropImageIndex)
          : -1;

        // Map textEditingIndex to filtered array
        const filteredTextEditingIndex = visibleIndices.includes(allTextEditingIndex)
          ? visibleIndices.indexOf(allTextEditingIndex)
          : -1;

        // Swap
        state.shapes = filteredShapes;
        state.selectedIndices = filteredSelected;
        state.vectorEditIndex = filteredVectorEditIndex;
        state.cropImageIndex = filteredCropImageIndex;
        state.textEditingIndex = filteredTextEditingIndex;

        // Render with Vue composable
        vueRender();

        // Restore
        state.shapes = allShapes;
        state.selectedIndices = allSelected;
        state.vectorEditIndex = allVectorEditIndex;
        state.cropImageIndex = allCropImageIndex;
        state.textEditingIndex = allTextEditingIndex;
        state._allShapesForEffects = null;

        // Sync canvas selection to timeline
        if (typeof window.syncSelectionToTimeline === 'function') {
          window.syncSelectionToTimeline();
        }
      };
    } else {
      // Canvas mode - use Vue renderer directly
      window.render = renderer.render;
    }

    // Also expose other renderer functions
    window.drawShape = renderer.drawShape;
    window.drawSelectionBox = renderer.drawSelectionBox;
    window.drawVectorEditOverlay = renderer.drawVectorEditOverlay;

    // Initialize canvas sizing based on mode
    if (state.videoMode) {
      // Video mode: Create video workspace layout
      initVideoWorkspace();
      // Set up resize handler for video mode
      window.addEventListener('resize', resizeCanvasToFit);
      // Apply initial light/dark mode to workspace
      const workspace = document.querySelector('.video-workspace');
      if (workspace) {
        workspace.classList.toggle('light-mode', !state.darkMode);
      }
    } else {
      // Canvas mode: Resize canvas to fill viewport
      renderer.resizeCanvas();
      // Also expose globally and set up resize handler
      window.resizeCanvas = renderer.resizeCanvas;
      window.addEventListener('resize', renderer.resizeCanvas);
    }

    // Force initial render with new renderer
    window.render();
  });

  // Note: Legacy layers panel toggle is no longer needed.
  // FooterControls.vue emits 'toggle-layers' which is handled by @toggle-layers="toggleLayersPanel"
  // The duplicate handler was causing the panel to open then immediately close (toggle twice)

  // Add context menu listener
  document.addEventListener('contextmenu', handleContextMenu);

  // Add click outside listener
  document.addEventListener('click', handleClickOutside);

  // Add keyboard listener for clipboard shortcuts (capture phase to run before legacy)
  document.addEventListener('keydown', handleKeyDown, true);

  // Hide legacy elements that Vue now handles
  // Use more specific selectors to find elements NOT inside vue-overlay-root
  requestAnimationFrame(() => {
    // Hide legacy toolbar (the one not inside our Vue overlay)
    document.querySelectorAll('.toolbar').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Hide legacy menu panel
    document.querySelectorAll('#menu-panel').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Hide legacy layers panel
    document.querySelectorAll('#layers-panel').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Hide legacy context menu
    document.querySelectorAll('#context-menu').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Hide legacy options bar
    document.querySelectorAll('#options-bar').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Hide legacy option popups
    document.querySelectorAll('.opt-popup').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Hide legacy text editor
    document.querySelectorAll('#text-editor').forEach(el => {
      if (!el.closest('#vue-overlay-root')) {
        el.style.display = 'none';
      }
    });

    // Video mode: Don't hide the docked-timeline container!
    // Vue TimelinePanel uses Teleport to render INTO #docked-timeline.
    // We just need to ensure its content is provided by Vue (the legacy
    // createFloatingTimeline skips HTML injection when vue-overlay-root exists).
  });

  // Listen for toolbar stop recording event (inline controls)
  window.addEventListener('toolbar:stop-video-recording', handleToolbarStopRecording);
});

onUnmounted(() => {
  document.removeEventListener('contextmenu', handleContextMenu);
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeyDown, true);
  window.removeEventListener('toolbar:stop-video-recording', handleToolbarStopRecording);
  // Clean up resize handlers
  if (state.videoMode) {
    window.removeEventListener('resize', resizeCanvasToFit);
  } else {
    const renderer = getRenderer();
    window.removeEventListener('resize', renderer.resizeCanvas);
  }
});
</script>

<template>
  <div class="vue-overlay">
    <!-- Main floating toolbar (hidden in view mode) -->
    <EditorToolbar v-if="!isViewMode" @toggle-menu="toggleMenuPanel" />

    <!-- Menu panel (toggled from toolbar menu button) -->
    <MenuPanel
      v-if="!isViewMode"
      :visible="showMenuPanel"
      @close="hideMenuPanel"
      @show-help="showHelp"
    />

    <!-- Layers panel (toggled from footer) -->
    <LayersPanel
      v-if="!isViewMode"
      :visible="showLayersPanel"
      @close="hideLayersPanel"
    />

    <!-- Keyboard shortcuts modal -->
    <KeyboardShortcutsModal
      :visible="showShortcutsModal"
      :video-mode="isVideoMode"
      :dark-mode="state.darkMode"
      @close="hideShortcutsModal"
    />

    <!-- Context menu (right-click) - always available -->
    <ContextMenu ref="contextMenuRef" />

    <!-- Options bar (shape properties) - hidden in view mode -->
    <OptionsBar v-if="!isViewMode" />

    <!-- Inline text editor -->
    <TextEditor ref="textEditorRef" />

    <!-- Footer controls (zoom, undo/redo, layers toggle, theme, help) -->
    <!-- Also includes hidden file inputs and text/frame editors -->
    <FooterControls
      v-if="!isViewMode && !isVideoMode"
      @toggle-layers="toggleLayersPanel"
      @show-help="showHelp"
    />

    <!-- Video mode: Timeline panel (docked at bottom) -->
    <!-- Keep mounted to preserve vis-timeline state, pass viewMode to hide content -->
    <TimelinePanel v-if="isVideoMode" :hidden="isViewMode" />

    <!-- Video mode: Timeline context menu (right-click on clips/tracks) -->
    <TimelineContextMenu v-if="isVideoMode" />

    <!-- Recording dialog (video mode - device selection) -->
    <RecordingDialog
      v-if="isVideoMode && recording.state.showRecordingDialog"
      :dark-mode="state.darkMode"
      @start="handleRecordingStart"
      @cancel="recording.closeRecordingDialog()"
    />

    <!-- Recording dialog (presentation mode - device selection, no screen capture) -->
    <RecordingDialog
      v-if="isPresentationMode && !isVideoMode && recording.state.showRecordingDialog"
      :dark-mode="state.darkMode"
      :presentation-mode="true"
      @start="handlePresentationRecordingStart"
      @cancel="recording.closeRecordingDialog(); presentation.exitPresentationMode()"
    />

    <!-- Recording controls are now inline in EditorToolbar for both video and presentation modes -->

    <!-- Presentation export modal (shown after recording) -->
    <PresentationExport
      v-if="state.showPresentationExport"
      :dark-mode="state.darkMode"
      :duration="state.presentationDuration"
      @export-video="presentation.downloadVideo(); state.showPresentationExport = false"
      @edit-in-video-mode="presentation.openInVideoMode()"
      @preview="presentation.previewPresentation()"
      @close="state.showPresentationExport = false; presentation.exitPresentationMode()"
    />

    <!-- Presentation preview (fullscreen video playback) -->
    <PresentationPreview
      :visible="presentation.isPreviewVisible.value"
      :video-blob="state.presentationBlobs?.canvas"
      @close="presentation.hidePreview()"
    />

    <!-- Scroll back to content button (shown when content is off-screen) -->
    <!-- This button appears in both canvas and video modes when content is off-screen -->
    <button
      v-if="!isViewMode"
      id="scroll-to-content"
      class="scroll-to-content-btn"
      :class="{ hidden: !showScrollButton }"
      @click="scrollToContent"
    >
      Scroll back to content
    </button>

    <!-- Hidden file inputs (always available for menu panel import) -->
    <!-- Note: In non-video mode, FooterControls also has these, but having duplicates with same IDs is fine -->
    <input
      type="file"
      id="import-file-input"
      accept=".json"
      style="display: none;"
      @change="handleImportFile"
    >
    <input
      type="file"
      id="image-file-input"
      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
      style="display: none;"
      @change="handleImageUpload"
    >
  </div>
</template>

<style>


</style>
