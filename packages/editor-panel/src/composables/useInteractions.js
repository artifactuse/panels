// editor/composables/useInteractions.js
// Mouse and touch event handling composable - Full implementation

import { ref, onMounted, onUnmounted } from 'vue';
import { getEditorState, getEditorComposable } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getTools } from './useTools.js';
import { getSnapGuides } from './useSnapGuides.js';
import { getVectorEdit } from './useVectorEdit.js';
import { getCropMode } from './useCropMode.js';
import { getFrameChildren } from './useFrameChildren.js';
import { getVideoState } from './useVideoState.js';
import { getRenderer } from './useRenderer.js';
import { screenToCanvas, rotatePoint } from '../utils/coordinates.js';
import { getShapeBounds, getMultiSelectionBounds, pointInRect } from '../utils/geometry.js';
import { hitTest, hitTestHandle, hitTestHandleForBounds, hitTestControlPoint, hitTestArrowEndpoint, findNearestPointOnShape, getRelativeEdgePosition, getAbsoluteFromRelativeEdge, isPointInsideShape, isPointNearShape } from '../utils/hitTesting.js';
import { generateId } from '../utils/shapes.js';

/**
 * Interactions composable for mouse/touch handling
 * Full implementation replacing legacy getInteractionsScript()
 */
export function useInteractions(canvasRef = null) {
  const { state, config } = getEditorState();
  const { setTool } = getEditorComposable();
  const { saveState } = getHistory();
  const tools = getTools();
  const snapGuides = getSnapGuides();
  const vectorEdit = getVectorEdit();
  const cropMode = getCropMode();
  const frameChildren = getFrameChildren();

  // Local interaction state
  const isDragging = ref(false);
  const isPanning = ref(false);
  const isResizing = ref(false);
  const isRotating = ref(false);
  const isTiltingX = ref(false);
  const isTiltingY = ref(false);
  const isSelecting = ref(false);
  const isDrawing = ref(false);

  // Arrow connection state
  let isDraggingArrowEndpoint = false;
  let draggingEndpoint = null; // 'start' or 'end'
  let potentialConnection = null; // { shapeId, x, y } - shape being hovered for connection
  let connectionHighlightShapeId = null; // ID of shape currently highlighted for connection

  // References
  let wrapper = null;
  let canvas = null;
  let ctx = null;

  // Double-click detection
  let lastClickTime = 0;
  let lastClickIndex = -1;
  let lastClickResult = null; // For group child double-click detection

  // Touch gesture state
  let lastTouchDist = 0;
  let lastTouchCenter = null;

  /**
   * Initialize interactions
   */
  function init() {
    canvas = canvasRef?.value || document.getElementById('drawing-canvas');
    wrapper = document.getElementById('canvas-wrapper');
    ctx = canvas?.getContext('2d');

    if (!wrapper || !canvas) {
      console.warn('Canvas or wrapper not found for interactions');
      return false;
    }

    setupEventListeners();
    return true;
  }

  /**
   * Start tracking mouse on document level during active operations
   * This ensures mouseup is captured even if cursor leaves the canvas
   */
  function startDocumentTracking() {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Stop document-level mouse tracking
   */
  function stopDocumentTracking() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    if (!wrapper) return;

    // Mouse events
    wrapper.addEventListener('mousedown', handleMouseDown);
    wrapper.addEventListener('mousemove', handleMouseMove);
    wrapper.addEventListener('mouseup', handleMouseUp);
    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('contextmenu', handleContextMenu);

    // Touch events
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);

    // Drag and drop events for media files
    wrapper.addEventListener('dragover', handleDragOver);
    wrapper.addEventListener('dragleave', handleDragLeave);
    wrapper.addEventListener('drop', handleDrop);

    // NOTE: Keyboard events are handled by useKeyboard composable
    // Only register keyup for space key panning state management
    document.addEventListener('keyup', handleKeyUp);

    // Setup timeline drop handlers for video mode
    if (state.videoMode) {
      setupTimelineDropHandlers();
    }
  }

  /**
   * Remove event listeners
   */
  function removeEventListeners() {
    if (!wrapper) return;

    wrapper.removeEventListener('mousedown', handleMouseDown);
    wrapper.removeEventListener('mousemove', handleMouseMove);
    wrapper.removeEventListener('mouseup', handleMouseUp);
    wrapper.removeEventListener('wheel', handleWheel);
    wrapper.removeEventListener('contextmenu', handleContextMenu);
    wrapper.removeEventListener('touchstart', handleTouchStart);
    wrapper.removeEventListener('touchmove', handleTouchMove);
    wrapper.removeEventListener('touchend', handleTouchEnd);
    wrapper.removeEventListener('dragover', handleDragOver);
    wrapper.removeEventListener('dragleave', handleDragLeave);
    wrapper.removeEventListener('drop', handleDrop);
    // NOTE: keydown handled by useKeyboard
    document.removeEventListener('keyup', handleKeyUp);
  }

  /**
   * Render helper
   */
  function render() {
    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Update layers list
   */
  function renderLayersList() {
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  /**
   * Check if a shape is visible at the current time (for video mode)
   * Shapes not in their time range should not be interactive
   */
  function isShapeVisibleAtTime(shape, time) {
    // Check if shape is explicitly hidden
    if (shape.visible === false) return false;

    // Shapes without temporal properties are always visible (canvas mode or legacy)
    if (shape.startTime === undefined) return true;

    const startTime = shape.startTime;
    const endTime = startTime + (shape.duration || config.video?.defaultClipDuration || 5);

    return time >= startTime && time < endTime;
  }

  /**
   * Get the visibility check function for video mode
   * Returns null in canvas mode (no temporal filtering needed)
   */
  function getVisibilityCheck() {
    return state.videoMode ? isShapeVisibleAtTime : null;
  }

  /**
   * Handle mouse down
   */
  function handleMouseDown(e) {
    // Skip if canvas not initialized yet
    if (!canvas) return;

    // Skip if clicking on UI elements
    if (e.target.closest('.floating-panel, .popup-panel, .toolbar, #text-editor')) {
      return;
    }

    // Hide context menu and menu panel
    if (typeof window.hideContextMenu === 'function') window.hideContextMenu();
    if (typeof window.hideMenuPanel === 'function') window.hideMenuPanel();

    // Right click handled by context menu
    if (e.button === 2) return;

    // View mode - only allow panning
    if (state.viewModeActive) {
      if (e.button === 1 || (e.button === 0 && (state.spacePressed || state.currentTool === 'hand'))) {
        if (config.pan?.enableGestures !== false) {
          startPanning(e);
        }
      }
      return;
    }

    // Middle click or space+click for panning
    if (e.button === 1 || (e.button === 0 && (state.spacePressed || state.currentTool === 'hand'))) {
      if (config.pan?.enableGestures !== false) {
        startPanning(e);
      }
      return;
    }

    const pos = screenToCanvas(e.clientX, e.clientY, state, canvas);
    state.startX = state.lastX = pos.x;
    state.startY = state.lastY = pos.y;
    // Initialize drawEndX/drawEndY for recording canvas to use
    state.drawEndX = pos.x;
    state.drawEndY = pos.y;

    // Handle vector edit mode interactions
    if (state.isVectorEditing) {
      const hit = vectorEdit.hitTestVectorEdit(pos.x, pos.y);
      if (hit) {
        if (hit.type === 'curve') {
          vectorEdit.addVectorPoint(hit.location);
        } else {
          vectorEdit.startVectorDrag(pos.x, pos.y, hit);
        }
        return;
      } else {
        vectorEdit.exitVectorEditMode(true);
      }
    }

    // Double-click detection for vector edit mode and crop mode
    const now = Date.now();
    const clickedResult = hitTest(pos.x, pos.y, state, config, ctx, getVisibilityCheck());
    const vectorEditEnabled = config.vectorEdit?.enabled !== false;

    // Handle double-click on group child (when in group mode)
    if (typeof clickedResult === 'object' && clickedResult.isGroupChild &&
        now - lastClickTime < 300 && lastClickResult?.isGroupChild &&
        clickedResult.groupIndex === lastClickResult.groupIndex &&
        clickedResult.childIndex === lastClickResult.childIndex) {
      const group = state.shapes[clickedResult.groupIndex];
      const child = group?.children?.[clickedResult.childIndex];
      if (child) {
        // Double-click on vector-editable child enters vector edit mode
        if (vectorEditEnabled && vectorEdit.isVectorEditable(child.type)) {
          vectorEdit.enterVectorEditModeForGroupChild(clickedResult.groupIndex, clickedResult.childIndex);
          lastClickTime = 0;
          lastClickResult = null;
          return;
        }
        // Double-click on image/video child enters crop mode
        if (cropMode.isCroppable(child)) {
          cropMode.enterCropModeForGroupChild(clickedResult.groupIndex, clickedResult.childIndex);
          lastClickTime = 0;
          lastClickResult = null;
          return;
        }
        // Double-click on text child enters text edit mode
        if (child.type === 'text') {
          if (typeof window.editGroupChildText === 'function') {
            window.editGroupChildText(clickedResult.groupIndex, clickedResult.childIndex);
          }
          lastClickTime = 0;
          lastClickResult = null;
          return;
        }
      }
    }

    // Handle double-click on frame child (when clicking inside a frame)
    if (typeof clickedResult === 'object' && clickedResult.isFrameChild &&
        now - lastClickTime < 300 && lastClickResult?.isFrameChild &&
        clickedResult.frameIndex === lastClickResult.frameIndex &&
        clickedResult.childIndex === lastClickResult.childIndex) {
      const frame = state.shapes[clickedResult.frameIndex];
      const child = frame?.children?.[clickedResult.childIndex];
      if (child) {
        // Double-click on vector-editable child enters vector edit mode
        if (vectorEditEnabled && vectorEdit.isVectorEditable(child.type)) {
          vectorEdit.enterVectorEditModeForFrameChild(clickedResult.frameIndex, clickedResult.childIndex);
          lastClickTime = 0;
          lastClickResult = null;
          return;
        }
        // Double-click on image/video child enters crop mode
        if (cropMode.isCroppable(child)) {
          cropMode.enterFrameChildCropMode(clickedResult.frameIndex, clickedResult.childIndex);
          lastClickTime = 0;
          lastClickResult = null;
          return;
        }
        // Double-click on text child enters text edit mode
        if (child.type === 'text') {
          if (typeof window.editFrameChildText === 'function') {
            window.editFrameChildText(clickedResult.frameIndex, clickedResult.childIndex);
          }
          lastClickTime = 0;
          lastClickResult = null;
          return;
        }
      }
    }

    const clickedIndex = typeof clickedResult === 'number' ? clickedResult : -1;
    const isGroupChildClick = typeof clickedResult === 'object' && clickedResult.isGroupChild;

    if (now - lastClickTime < 300 && clickedIndex === lastClickIndex && clickedIndex >= 0) {
      const shape = state.shapes[clickedIndex];
      if (shape) {
        // Double-click on vector-editable shape enters vector edit mode
        if (vectorEditEnabled && vectorEdit.isVectorEditable(shape.type)) {
          vectorEdit.enterVectorEditMode(clickedIndex);
          lastClickTime = 0;
          lastClickIndex = -1;
          return;
        }
        // Double-click on image/video enters crop mode
        if (cropMode.isCroppable(shape)) {
          cropMode.enterCropMode(clickedIndex);
          lastClickTime = 0;
          lastClickIndex = -1;
          return;
        }
        // Double-click on text enters text edit mode
        if (shape.type === 'text') {
          if (typeof window.editTextAtIndex === 'function') {
            window.editTextAtIndex(clickedIndex);
          }
          lastClickTime = 0;
          lastClickIndex = -1;
          return;
        }
        // Double-click on frame edits frame name
        if (shape.type === 'frame') {
          if (typeof window.editFrameName === 'function') {
            window.editFrameName(clickedIndex);
          }
          lastClickTime = 0;
          lastClickIndex = -1;
          return;
        }
        // Double-click on cursor adds a new keyframe at click position
        if (shape.type === 'cursor') {
          // Only add keyframe if not clicking directly on an existing keyframe
          const cursorHit = hitTestCursorPath(pos.x, pos.y, shape);
          if (!cursorHit) {
            addCursorKeyframe(shape, pos.x, pos.y);
          }
          lastClickTime = 0;
          lastClickIndex = -1;
          return;
        }
        // Double-click on group enters group mode to select children
        if (shape.type === 'group' && shape.children?.length > 0) {
          enterGroupMode(clickedIndex);
          lastClickTime = 0;
          lastClickIndex = -1;
          return;
        }
      }
    } else if (now - lastClickTime < 300 && clickedIndex < 0 && lastClickIndex < 0 && !isGroupChildClick) {
      // Double-click on empty canvas creates a new text element (but not when clicking on group children)
      const newTextShape = {
        x: pos.x,
        y: pos.y,
        text: '',
        fontSize: state.currentFontSize || 20,
        fontFamily: state.currentFontFamily || config.text?.defaultFont || 'Sans-serif',
        color: state.currentColor,
        align: 'left',
        bold: false,
        italic: false,
        underline: false,
        rotation: 0
      };

      if (typeof window.showTextEditor === 'function') {
        window.showTextEditor(newTextShape, -1);
      }
      lastClickTime = 0;
      lastClickIndex = -1;
      return;
    }

    lastClickTime = now;
    lastClickIndex = typeof clickedIndex === 'number' ? clickedIndex : -1;
    lastClickResult = clickedResult; // Store full result for group child detection

    // Handle crop mode interactions
    if (cropMode.isCropping.value) {
      const cropHandle = cropMode.hitTestCropHandle(pos.x, pos.y);
      if (cropHandle) {
        cropMode.startCropDrag(pos.x, pos.y, cropHandle);
        return;
      } else if (cropMode.isPointInCropArea(pos.x, pos.y)) {
        cropMode.startCropDrag(pos.x, pos.y, 'move');
        return;
      } else {
        cropMode.exitCropMode(true);
        return;
      }
    }

    // Handle based on current tool
    switch (state.currentTool) {
      case 'select':
        handleSelectToolDown(pos, e);
        break;
      case 'rect':
      case 'ellipse':
      case 'diamond':
      case 'triangle':
      case 'circle':
      case 'frame':
        handleShapeToolDown(pos);
        break;
      case 'line':
      case 'arrow':
        handleLineToolDown(pos);
        break;
      case 'pen':
        handlePenToolDown(pos);
        break;
      case 'text':
        handleTextToolDown(pos);
        break;
      case 'eraser':
        handleEraserToolDown(pos);
        break;
      case 'cursor':
        handleCursorToolDown(pos, e);
        break;
    }
  }

  /**
   * Start panning
   */
  function startPanning(e) {
    state.isPanning = true;
    isPanning.value = true;
    state.lastPanX = e.clientX;
    state.lastPanY = e.clientY;
    wrapper?.classList.add('panning');
  }

  /**
   * Handle select tool mouse down
   */
  function handleSelectToolDown(pos, e) {
    // Check for control point handles on curved lines/arrows in frame children first
    if (state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      const child = frame?.children?.[sel.childIndex];

      if (child && (child.type === 'line' || child.type === 'arrow') && child.controlPoint) {
        const cpHit = hitTestControlPoint(pos.x, pos.y, child, sel.frameIndex, state, config);
        if (cpHit) {
          state.isDraggingControlPoint = true;
          state.isDraggingFrameChildControlPoint = true;
          state.activeControlPoint = cpHit;
          state.controlPointStartPos = { x: pos.x, y: pos.y };
          wrapper?.classList.add('dragging');
          startDocumentTracking();
          return;
        }
      }

      // Check for resize handles on selected frame children
      if (child) {
        const childBounds = getShapeBounds(child, config, ctx);
        if (childBounds) {
          const handle = hitTestHandleForBounds(pos.x, pos.y, childBounds, child.rotation, sel.frameIndex, state, config, child);

          if (handle === 'rotate') {
            startFrameChildRotation(pos, sel, childBounds, child);
            return;
          }

          // Handle tilt X for frame child
          if (handle === 'tiltX') {
            startFrameChildTiltX(pos, sel, childBounds, child);
            return;
          }

          // Handle tilt Y for frame child
          if (handle === 'tiltY') {
            startFrameChildTiltY(pos, sel, childBounds, child);
            return;
          }

          if (handle) {
            startFrameChildResize(pos, sel, childBounds, child, handle);
            return;
          }
        }
      }
    }

    // Check for resize/rotate handles on selected group children (when in group mode)
    if (state.selectedGroupChildren?.length === 1) {
      const sel = state.selectedGroupChildren[0];
      const group = state.shapes[sel.groupIndex];
      const child = group?.children?.[sel.childIndex];

      if (child) {
        const childBounds = getShapeBounds(child, config, ctx);
        if (childBounds) {
          const handle = hitTestHandleForBounds(pos.x, pos.y, childBounds, child.rotation, -1, state, config, child);

          if (handle === 'rotate') {
            startGroupChildRotation(pos, sel, childBounds, child);
            return;
          }

          // Handle tilt X for group child
          if (handle === 'tiltX') {
            startGroupChildTiltX(pos, sel, childBounds, child);
            return;
          }

          // Handle tilt Y for group child
          if (handle === 'tiltY') {
            startGroupChildTiltY(pos, sel, childBounds, child);
            return;
          }

          if (handle) {
            startGroupChildResize(pos, sel, childBounds, child, handle);
            return;
          }
        }
      }
    }

    // Check for control point handles on lines/arrows (always visible now)
    if (state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      if (!shape) {
        // Shape was deleted but selection wasn't cleared - clear it now
        state.selectedIndices = [];
        return;
      }
      if (shape.type === 'line' || shape.type === 'arrow') {
        const cpHit = hitTestControlPoint(pos.x, pos.y, shape, -1, state, config);
        if (cpHit) {
          // Create control point at midpoint if it doesn't exist
          if (!shape.controlPoint) {
            shape.controlPoint = {
              x: (shape.x1 + shape.x2) / 2,
              y: (shape.y1 + shape.y2) / 2
            };
          }
          state.isDraggingControlPoint = true;
          state.activeControlPoint = cpHit;
          state.controlPointStartPos = { x: pos.x, y: pos.y };
          wrapper?.classList.add('dragging');
          startDocumentTracking();
          return;
        }
      }

      // Check for cursor keyframe/control point handles
      if (shape?.type === 'cursor') {
        const cursorHit = hitTestCursorPath(pos.x, pos.y, shape);
        if (cursorHit) {
          state.isDraggingCursorKeyframe = true;
          state.cursorDragTarget = cursorHit;
          state.dragStartPos = { x: pos.x, y: pos.y };
          // Track selected cursor keyframe for delete functionality
          if (cursorHit.type === 'keyframe') {
            state.selectedCursorKeyframeIndex = cursorHit.index;
            // Open cursor popup to show keyframe controls
            if (typeof window.openOptionsPopup === 'function') {
              window.openOptionsPopup('cursor');
            }
          } else if (cursorHit.type === 'controlIn' || cursorHit.type === 'controlOut') {
            state.selectedCursorKeyframeIndex = cursorHit.keyframeIndex;
          }
          wrapper?.classList.add('dragging');
          startDocumentTracking();
          return;
        }
      }
    }

    // Check for arrow endpoint handles first (takes priority over regular handles)
    if (state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      if (shape && (shape.type === 'line' || shape.type === 'arrow')) {
        const endpoint = hitTestArrowEndpoint(pos.x, pos.y, shape, state, config);
        if (endpoint) {
          // Start resize with the appropriate corner handle
          const handle = endpoint === 'start' ? 'nw' : 'se';
          startResize(pos, handle);
          return;
        }
      }
    }

    // Check for resize/rotate handles
    const handle = hitTestHandle(pos.x, pos.y, state, config, ctx);

    // Handle rotation
    if (handle === 'rotate' && state.selectedIndices.length >= 1) {
      const hasFrame = state.selectedIndices.some(i => state.shapes[i]?.type === 'frame');
      if (hasFrame) return;

      startRotation(pos);
      return;
    }

    // Handle tilt X (left handle - tilts forward/backward)
    if (handle === 'tiltX' && state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      if (shape && shape.type !== 'frame') {
        startTiltX(pos);
        return;
      }
    }

    // Handle tilt Y (bottom handle - tilts left/right)
    if (handle === 'tiltY' && state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      if (shape && shape.type !== 'frame') {
        startTiltY(pos);
        return;
      }
    }

    // Handle resize
    if (handle && state.selectedIndices.length >= 1) {
      startResize(pos, handle);
      return;
    }

    // Check if clicking inside multi-selection bounding box
    if (state.selectedIndices.length > 1) {
      const multiBounds = getMultiSelectionBounds(state.shapes, state.selectedIndices, config, ctx);
      if (multiBounds && pointInRect(pos.x, pos.y, multiBounds, 6)) {
        startDragging(pos, multiBounds);
        return;
      }
    }

    // Hit test for shapes
    const hitResult = hitTest(pos.x, pos.y, state, config, ctx, getVisibilityCheck());

    // Check if we hit a group child (when in group mode)
    if (typeof hitResult === 'object' && hitResult.isGroupChild) {
      handleGroupChildClick(hitResult.groupIndex, hitResult.childIndex, e);

      // Start dragging the group child
      const group = state.shapes[hitResult.groupIndex];
      const child = group.children[hitResult.childIndex];
      const b = getShapeBounds(child, config, ctx);

      state.isDragging = true;
      isDragging.value = true;
      state.isDraggingGroupChild = true;
      state.snapPoints = getSnapPoints();
      state.dragOffsetX = pos.x - b.x;
      state.dragOffsetY = pos.y - b.y;
      wrapper?.classList.add('dragging');
      startDocumentTracking();
      return;
    }

    // Check if we hit a frame child
    if (typeof hitResult === 'object' && hitResult.isFrameChild) {
      handleFrameChildClick(pos, hitResult, e);
      return;
    }

    // Regular shape hit test
    const hitI = typeof hitResult === 'number' ? hitResult : -1;

    if (hitI >= 0) {
      handleShapeClick(pos, hitI, e);
    } else {
      // Start selection box
      handleEmptyClick(pos, e);
    }

    render();
    renderLayersList();
  }

  /**
   * Handle clicking on a frame child
   */
  function handleFrameChildClick(pos, hitResult, e) {
    state.highlightedFrameIndex = -1;
    state.selectedIndices = [];

    frameChildren.selectFrameChild(hitResult.frameIndex, hitResult.childIndex, e.shiftKey || e.ctrlKey || e.metaKey);

    // Get the child shape for drag offset calculation
    const frame = state.shapes[hitResult.frameIndex];
    const child = frame.children[hitResult.childIndex];
    const b = getShapeBounds(child, config, ctx);

    state.isDragging = true;
    isDragging.value = true;
    state.isDraggingFrameChild = true;
    frameChildren.isDraggingFrameChild.value = true;
    state.snapPoints = getSnapPoints();
    state.dragOffsetX = pos.x - b.x;
    state.dragOffsetY = pos.y - b.y;
    wrapper?.classList.add('dragging');
    startDocumentTracking();

    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }

    render();
    renderLayersList();
  }

  /**
   * Handle clicking on a main shape
   */
  function handleShapeClick(pos, hitI, e) {
    const hitShape = state.shapes[hitI];

    // Check if shape is on a locked track (video mode only)
    const isLocked = typeof window.isShapeOnLockedTrack === 'function' && window.isShapeOnLockedTrack(hitShape);

    // Clear frame children selection
    state.highlightedFrameIndex = -1;
    state.selectedFrameChildren = [];
    frameChildren.clearFrameChildrenSelection();

    // Exit group mode when clicking on a different shape (not the active group)
    if (state.activeGroupIndex >= 0 && hitI !== state.activeGroupIndex) {
      state.activeGroupIndex = -1;
      state.selectedGroupChildren = [];
    }

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const idx = state.selectedIndices.indexOf(hitI);
      if (idx >= 0) {
        state.selectedIndices.splice(idx, 1);
      } else {
        state.selectedIndices.push(hitI);
      }
    } else if (!state.selectedIndices.includes(hitI)) {
      state.selectedIndices = [hitI];
    }

    // Only allow dragging if not locked
    if (!isLocked) {
      const b = getShapeBounds(hitShape, config, ctx);
      state.isDragging = true;
      isDragging.value = true;
      state.isDraggingFrameChild = false;
      state.snapPoints = getSnapPoints();
      state.dragOffsetX = pos.x - b.x;
      state.dragOffsetY = pos.y - b.y;
      wrapper?.classList.add('dragging');
      startDocumentTracking();
    }

    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }
  }

  /**
   * Enter group mode - allows selecting individual children within a group
   */
  function enterGroupMode(groupIndex) {
    state.activeGroupIndex = groupIndex;
    state.selectedIndices = [groupIndex]; // Keep group in selection
    state.selectedGroupChildren = [];
    render();
  }

  /**
   * Exit group mode - returns to normal selection
   */
  function exitGroupMode() {
    state.activeGroupIndex = -1;
    state.selectedGroupChildren = [];
    render();
  }

  /**
   * Handle clicking on a group child when in group mode
   */
  function handleGroupChildClick(groupIndex, childIndex, e) {
    const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey;

    if (addToSelection) {
      // Toggle selection
      const idx = state.selectedGroupChildren.findIndex(
        s => s.groupIndex === groupIndex && s.childIndex === childIndex
      );
      if (idx >= 0) {
        state.selectedGroupChildren.splice(idx, 1);
      } else {
        state.selectedGroupChildren.push({ groupIndex, childIndex });
      }
    } else {
      // Single selection
      state.selectedGroupChildren = [{ groupIndex, childIndex }];
    }

    render();
  }

  /**
   * Handle clicking on empty area
   */
  function handleEmptyClick(pos, e) {
    state.highlightedFrameIndex = -1;
    state.selectedFrameChildren = [];
    frameChildren.clearFrameChildrenSelection();

    // If in group mode, exit it first
    if (state.activeGroupIndex >= 0) {
      exitGroupMode();
      return;
    }

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      state.selectedIndices = [];
    }

    state.isSelecting = true;
    isSelecting.value = true;
    state.selectionBoxStart = { x: pos.x, y: pos.y };
    wrapper?.classList.add('selecting');
    startDocumentTracking();

    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }
  }

  /**
   * Start rotation
   */
  function startRotation(pos) {
    state.isRotating = true;
    isRotating.value = true;
    wrapper?.classList.add('rotating');
    startDocumentTracking();

    let bounds;
    if (state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      bounds = getShapeBounds(shape, config, ctx);
      state.rotationShapeStartAngle = shape.rotation || 0;
    } else {
      bounds = getMultiSelectionBounds(state.shapes, state.selectedIndices, config, ctx);
      state.rotationShapeStartAngle = 0;
      state.multiRotateStart = state.selectedIndices.map(i => {
        const shape = state.shapes[i];
        const b = getShapeBounds(shape, config, ctx);
        return {
          index: i,
          centerX: b.x + b.width / 2,
          centerY: b.y + b.height / 2,
          rotation: shape.rotation || 0
        };
      });
    }

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    state.rotationCenterX = centerX;
    state.rotationCenterY = centerY;
    state.rotationStartAngle = Math.atan2(pos.y - centerY, pos.x - centerX);
  }

  /**
   * Start tilt X (forward/backward tilt using left handle)
   */
  function startTiltX(pos) {
    state.isTiltingX = true;
    isTiltingX.value = true;
    wrapper?.classList.add('tilting-x');
    startDocumentTracking();

    const shape = state.shapes[state.selectedIndices[0]];
    const bounds = getShapeBounds(shape, config, ctx);

    state.tiltStartY = pos.y;
    state.tiltStartValue = shape.tiltX || 0;
    state.tiltCenterY = bounds.y + bounds.height / 2;
  }

  /**
   * Start tilt Y (left/right tilt using bottom handle)
   */
  function startTiltY(pos) {
    state.isTiltingY = true;
    isTiltingY.value = true;
    wrapper?.classList.add('tilting-y');
    startDocumentTracking();

    const shape = state.shapes[state.selectedIndices[0]];
    const bounds = getShapeBounds(shape, config, ctx);

    state.tiltStartX = pos.x;
    state.tiltStartValue = shape.tiltY || 0;
    state.tiltCenterX = bounds.x + bounds.width / 2;
  }

  /**
   * Start resize
   */
  function startResize(pos, handle) {
    state.isResizing = true;
    isResizing.value = true;
    state.resizeHandle = handle;
    wrapper?.classList.add('resizing-' + handle);
    startDocumentTracking();

    // Check if we're dragging an arrow/line endpoint
    isDraggingArrowEndpoint = false;
    draggingEndpoint = null;

    if (state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      state.resizeStartBounds = { ...getShapeBounds(shape, config, ctx) };
      state.resizeStartShapes = {};

      // Check if this is an arrow/line and we're clicking near an endpoint
      if (shape.type === 'line' || shape.type === 'arrow') {
        const endpoint = hitTestArrowEndpoint(pos.x, pos.y, shape, state, config);
        if (endpoint) {
          isDraggingArrowEndpoint = true;
          draggingEndpoint = endpoint;
        }
      }

      // Store shape-specific data for resize
      storeResizeStartData(shape, state.resizeStartShapes);
    } else {
      state.resizeStartBounds = { ...getMultiSelectionBounds(state.shapes, state.selectedIndices, config, ctx) };
      state.multiResizeStart = state.selectedIndices.map(i => {
        const shape = state.shapes[i];
        const b = getShapeBounds(shape, config, ctx);
        // Store shape-specific resize data for each shape (for paths, lines, freehand, etc.)
        const startShapeData = {};
        storeResizeStartData(shape, startShapeData);
        return {
          index: i,
          bounds: b ? { ...b } : { x: 0, y: 0, width: 0, height: 0 },
          shape: JSON.parse(JSON.stringify(shape)),
          startShapeData
        };
      });
    }

    state.resizeStartPos = { x: pos.x, y: pos.y };
  }

  /**
   * Start frame child rotation
   */
  function startFrameChildRotation(pos, sel, childBounds, child) {
    state.isRotating = true;
    isRotating.value = true;
    state.isRotatingFrameChild = true;
    startDocumentTracking();

    const centerX = childBounds.x + childBounds.width / 2;
    const centerY = childBounds.y + childBounds.height / 2;
    state.rotationShapeStartAngle = child.rotation || 0;
    state.rotationCenterX = centerX;
    state.rotationCenterY = centerY;
    state.rotationStartAngle = Math.atan2(pos.y - centerY, pos.x - centerX);
  }

  /**
   * Start frame child resize
   */
  function startFrameChildResize(pos, sel, childBounds, child, handle) {
    state.isResizing = true;
    isResizing.value = true;
    state.isResizingFrameChild = true;
    state.resizeHandle = handle;
    wrapper?.classList.add('resizing-' + handle);
    startDocumentTracking();
    state.resizeStartBounds = { ...childBounds };
    state.resizeStartShapes = {};

    storeResizeStartData(child, state.resizeStartShapes);
    state.resizeStartPos = { x: pos.x, y: pos.y };
  }

  /**
   * Start group child rotation
   */
  function startGroupChildRotation(pos, sel, childBounds, child) {
    state.isRotating = true;
    isRotating.value = true;
    state.isRotatingGroupChild = true;
    startDocumentTracking();

    const centerX = childBounds.x + childBounds.width / 2;
    const centerY = childBounds.y + childBounds.height / 2;
    state.rotationShapeStartAngle = child.rotation || 0;
    state.rotationCenterX = centerX;
    state.rotationCenterY = centerY;
    state.rotationStartAngle = Math.atan2(pos.y - centerY, pos.x - centerX);
  }

  /**
   * Start group child resize
   */
  function startGroupChildResize(pos, sel, childBounds, child, handle) {
    state.isResizing = true;
    isResizing.value = true;
    state.isResizingGroupChild = true;
    state.resizeHandle = handle;
    wrapper?.classList.add('resizing-' + handle);
    startDocumentTracking();
    state.resizeStartBounds = { ...childBounds };
    state.resizeStartShapes = {};

    storeResizeStartData(child, state.resizeStartShapes);
    state.resizeStartPos = { x: pos.x, y: pos.y };
  }

  /**
   * Start frame child tilt X (forward/backward tilt)
   */
  function startFrameChildTiltX(pos, sel, childBounds, child) {
    state.isTiltingX = true;
    isTiltingX.value = true;
    state.isTiltingFrameChild = true;
    wrapper?.classList.add('tilting-x');
    startDocumentTracking();

    state.tiltStartY = pos.y;
    state.tiltStartValue = child.tiltX || 0;
    state.tiltCenterY = childBounds.y + childBounds.height / 2;
  }

  /**
   * Start frame child tilt Y (left/right tilt)
   */
  function startFrameChildTiltY(pos, sel, childBounds, child) {
    state.isTiltingY = true;
    isTiltingY.value = true;
    state.isTiltingFrameChild = true;
    wrapper?.classList.add('tilting-y');
    startDocumentTracking();

    state.tiltStartX = pos.x;
    state.tiltStartValue = child.tiltY || 0;
    state.tiltCenterX = childBounds.x + childBounds.width / 2;
  }

  /**
   * Start group child tilt X (forward/backward tilt)
   */
  function startGroupChildTiltX(pos, sel, childBounds, child) {
    state.isTiltingX = true;
    isTiltingX.value = true;
    state.isTiltingGroupChild = true;
    wrapper?.classList.add('tilting-x');
    startDocumentTracking();

    state.tiltStartY = pos.y;
    state.tiltStartValue = child.tiltX || 0;
    state.tiltCenterY = childBounds.y + childBounds.height / 2;
  }

  /**
   * Start group child tilt Y (left/right tilt)
   */
  function startGroupChildTiltY(pos, sel, childBounds, child) {
    state.isTiltingY = true;
    isTiltingY.value = true;
    state.isTiltingGroupChild = true;
    wrapper?.classList.add('tilting-y');
    startDocumentTracking();

    state.tiltStartX = pos.x;
    state.tiltStartValue = child.tiltY || 0;
    state.tiltCenterX = childBounds.x + childBounds.width / 2;
  }

  /**
   * Store resize start data for a shape
   */
  function storeResizeStartData(shape, startShapes) {
    if (shape.type === 'line' || shape.type === 'arrow') {
      startShapes.origX1 = shape.x1;
      startShapes.origY1 = shape.y1;
      startShapes.origX2 = shape.x2;
      startShapes.origY2 = shape.y2;
      if (shape.controlPoint) {
        startShapes.origControlPoint = { ...shape.controlPoint };
      }
    }
    if (shape.type === 'triangle' && shape.x1 !== undefined) {
      startShapes.origX1 = shape.x1;
      startShapes.origY1 = shape.y1;
      startShapes.origX2 = shape.x2;
      startShapes.origY2 = shape.y2;
      startShapes.origX3 = shape.x3;
      startShapes.origY3 = shape.y3;
    }
    if (shape.type === 'text') {
      startShapes.origX = shape.x;
      startShapes.origY = shape.y;
      startShapes.origFontSize = shape.fontSize || 16;
      startShapes.origAlign = shape.align || 'left';
      startShapes.hasWidth = shape.width && shape.width > 0;
      startShapes.origWidth = shape.width;
      startShapes.origHeight = shape.height;
    }
    if (shape.points) {
      startShapes.origPoints = shape.points.map(p => ({ ...p }));
    }
    if (shape.type === 'path') {
      if (shape.segments) {
        startShapes.origPath = {
          segments: shape.segments.map(seg => ({
            point: [...seg.point],
            handleIn: seg.handleIn ? [...seg.handleIn] : undefined,
            handleOut: seg.handleOut ? [...seg.handleOut] : undefined
          }))
        };
      }
      // Handle compound paths with children
      if (shape.isCompound && shape.children) {
        startShapes.origPath = {
          isCompound: true,
          children: shape.children.map(child => ({
            segments: child.segments.map(seg => ({
              point: [...seg.point],
              handleIn: seg.handleIn ? [...seg.handleIn] : undefined,
              handleOut: seg.handleOut ? [...seg.handleOut] : undefined
            })),
            closed: child.closed
          }))
        };
      }
    }
    if (shape.type === 'cursor' && shape.cursorKeyframes) {
      startShapes.origCursorKeyframes = shape.cursorKeyframes.map(kf => ({
        ...kf,
        controlIn: kf.controlIn ? { ...kf.controlIn } : undefined,
        controlOut: kf.controlOut ? { ...kf.controlOut } : undefined
      }));
      startShapes.origCursorScale = shape.cursorScale || 1.0;
    }
    if (shape.type === 'group' && shape.children) {
      // Deep clone children for group resize
      startShapes.origChildren = shape.children.map(child => {
        const clone = { ...child };
        if (child.points) clone.points = child.points.map(p => ({ ...p }));
        if (child.segments) clone.segments = child.segments.map(seg => ({
          point: [...seg.point],
          handleIn: seg.handleIn ? [...seg.handleIn] : undefined,
          handleOut: seg.handleOut ? [...seg.handleOut] : undefined
        }));
        if (child.controlPoint) clone.controlPoint = { ...child.controlPoint };
        if (child.isCompound && child.children) {
          clone.children = child.children.map(path => ({
            segments: path.segments.map(seg => ({
              point: [...seg.point],
              handleIn: seg.handleIn ? [...seg.handleIn] : undefined,
              handleOut: seg.handleOut ? [...seg.handleOut] : undefined
            })),
            closed: path.closed
          }));
        }
        return clone;
      });
    }
  }

  /**
   * Start dragging
   */
  function startDragging(pos, bounds) {
    state.isDragging = true;
    isDragging.value = true;
    state.snapPoints = getSnapPoints();
    state.dragOffsetX = pos.x - bounds.x;
    state.dragOffsetY = pos.y - bounds.y;
    wrapper?.classList.add('dragging');
    startDocumentTracking();
  }

  /**
   * Handle shape tool mouse down
   */
  function handleShapeToolDown(pos) {
    state.isDrawing = true;
    isDrawing.value = true;
    state.snapPoints = getSnapPoints();
    startDocumentTracking();

    // Reset preview seed for new sketchy variation
    const renderer = getRenderer();
    if (renderer && renderer.resetPreviewSeed) {
      renderer.resetPreviewSeed();
    }

    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }
  }

  /**
   * Handle line/arrow tool mouse down
   */
  function handleLineToolDown(pos) {
    state.isDrawing = true;
    isDrawing.value = true;
    state.snapPoints = getSnapPoints();
    startDocumentTracking();

    // Reset preview seed for new sketchy variation
    const renderer = getRenderer();
    if (renderer && renderer.resetPreviewSeed) {
      renderer.resetPreviewSeed();
    }
  }

  /**
   * Handle pen tool mouse down
   */
  function handlePenToolDown(pos) {
    state.isDrawing = true;
    isDrawing.value = true;
    startDocumentTracking();
    state.currentFreehand = {
      id: generateId(),
      type: 'freehand',
      name: 'Draw',
      visible: true,
      points: [{ x: pos.x, y: pos.y }],
      color: state.currentColor,
      lineWidth: state.currentSize,
      opacity: state.currentOpacity
    };
  }

  /**
   * Handle text tool mouse down
   */
  function handleTextToolDown(pos) {
    const newTextShape = {
      x: pos.x,
      y: pos.y,
      text: '',
      fontSize: state.currentFontSize || 20,
      fontFamily: state.currentFontFamily || config.text?.defaultFont || 'Sans-serif',
      color: state.currentColor,
      align: 'left',
      bold: false,
      italic: false,
      underline: false,
      rotation: 0
    };

    if (typeof window.showTextEditor === 'function') {
      window.showTextEditor(newTextShape, -1);
    }

    setTool('select');
  }

  /**
   * Handle eraser tool mouse down
   */
  function handleEraserToolDown(pos) {
    state.isDrawing = true;
    isDrawing.value = true;
    const hit = hitTest(pos.x, pos.y, state, config, ctx, getVisibilityCheck());
    if (typeof hit === 'number' && hit >= 0) {
      state.shapes.splice(hit, 1);
      render();
      renderLayersList();
    }
  }

  /**
   * Handle cursor tool mouse down
   * Creates a new cursor shape or edits existing cursor path
   */
  function handleCursorToolDown(pos, e) {
    // Check if clicking on an existing cursor shape's keyframe or control point
    if (state.selectedIndices.length === 1) {
      const selectedShape = state.shapes[state.selectedIndices[0]];
      if (selectedShape?.type === 'cursor') {
        const hitResult = hitTestCursorPath(pos.x, pos.y, selectedShape);
        if (hitResult) {
          // Start dragging keyframe or control point
          state.isDraggingCursorKeyframe = true;
          state.cursorDragTarget = hitResult;
          state.dragStartPos = { x: pos.x, y: pos.y };
          // Track selected cursor keyframe for delete functionality
          if (hitResult.type === 'keyframe') {
            state.selectedCursorKeyframeIndex = hitResult.index;
            // Open cursor popup to show keyframe controls
            if (typeof window.openOptionsPopup === 'function') {
              window.openOptionsPopup('cursor');
            }
          } else if (hitResult.type === 'controlIn' || hitResult.type === 'controlOut') {
            state.selectedCursorKeyframeIndex = hitResult.keyframeIndex;
          }
          startDocumentTracking();
          return;
        }

        // Double-click to add new keyframe
        if (e.detail === 2) {
          addCursorKeyframe(selectedShape, pos.x, pos.y);
          return;
        }
      }
    }

    // Create a new cursor shape
    const startTime = state.currentTime || 0;
    const duration = 5;

    // Find available track that doesn't overlap with existing clips or keyframes
    const videoState = getVideoState();
    const trackId = state.videoMode ? videoState.findAvailableTrack(startTime, duration) : null;

    const newCursor = {
      id: generateId(),
      type: 'cursor',
      name: 'Cursor',
      visible: true,
      cursorType: 'pointer',
      // Use standard fill/stroke properties for options bar compatibility
      fillColor: '#ffffff',
      color: '#000000',
      cursorScale: 1.0,
      opacity: 100,
      showPath: true,
      pathColor: '#6366f1',
      pathOpacity: 50,
      cursorKeyframes: [
        { time: 0, x: pos.x, y: pos.y, easing: 'ease-out', holdTime: config.cursorPath?.defaultHoldTime ?? 0 }
      ],
      clicks: [],
      startTime,
      duration,
      trackId
    };

    state.shapes.push(newCursor);
    state.selectedIndices = [state.shapes.length - 1];

    if (typeof window.saveState === 'function') {
      window.saveState();
    }
    render();
    renderLayersList();

    // Show options bar for editing cursor properties
    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }

    // Update timeline in video mode
    if (state.videoMode && typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    // Auto-switch back to select tool
    if (config.tools?.autoSwitchToSelect !== false) {
      setTool('select');
      if (typeof window.setTool === 'function') {
        window.setTool('select');
      }
    }
  }

  /**
   * Hit test for cursor path elements (keyframes, control points)
   */
  function hitTestCursorPath(x, y, cursor) {
    // Scale threshold with zoom for consistent hit testing
    const displayScale = state.canvasDisplayScale || 1;
    const zoom = state.zoom || 1;
    const baseThreshold = config.cursorPath?.hitThreshold || 12;
    const threshold = baseThreshold / zoom / displayScale;
    const { cursorKeyframes = [] } = cursor;

    // Transform click position to cursor's local space if rotated
    let localX = x;
    let localY = y;
    if (cursor.rotation) {
      // Get cursor center from bounds
      const bounds = getShapeBounds(cursor);
      if (bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        // Apply inverse rotation to get local coordinates (rotation is in radians)
        const local = rotatePoint(x, y, -cursor.rotation, cx, cy);
        localX = local.x;
        localY = local.y;
      }
    }

    for (let i = 0; i < cursorKeyframes.length; i++) {
      const kf = cursorKeyframes[i];

      // Check keyframe point
      const distToKf = Math.sqrt((localX - kf.x) ** 2 + (localY - kf.y) ** 2);
      if (distToKf < threshold) {
        return { type: 'keyframe', index: i };
      }

      // Check control points
      if (kf.controlIn) {
        const distToIn = Math.sqrt((localX - kf.controlIn.x) ** 2 + (localY - kf.controlIn.y) ** 2);
        if (distToIn < threshold) {
          return { type: 'controlIn', keyframeIndex: i };
        }
      }
      if (kf.controlOut) {
        const distToOut = Math.sqrt((localX - kf.controlOut.x) ** 2 + (localY - kf.controlOut.y) ** 2);
        if (distToOut < threshold) {
          return { type: 'controlOut', keyframeIndex: i };
        }
      }
    }

    return null;
  }

  /**
   * Calculate total cumulative duration of all cursor keyframes
   */
  function calculateCursorTotalDuration(cursorKeyframes) {
    let total = 0;
    for (const kf of cursorKeyframes) {
      total += (kf.time || 0) + (kf.holdTime || 0);
    }
    return total;
  }

  /**
   * Add a new cursorKeyframe to cursor path
   */
  function addCursorKeyframe(cursor, x, y) {
    const gap = config.cursorPath?.defaultKeyframeGap ?? 1;
    // In cumulative model, time = travel duration to this keyframe
    // First keyframe has time 0 (cursor starts there), subsequent keyframes have time = gap
    const isFirstKeyframe = cursor.cursorKeyframes.length === 0;
    const newTime = isFirstKeyframe ? 0 : gap;

    // Transform to local coordinates if cursor is rotated
    let localX = x;
    let localY = y;
    if (cursor.rotation) {
      const bounds = getShapeBounds(cursor);
      if (bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const local = rotatePoint(x, y, -cursor.rotation, cx, cy);
        localX = local.x;
        localY = local.y;
      }
    }

    const defaultHoldTime = config.cursorPath?.defaultHoldTime ?? 0;
    cursor.cursorKeyframes.push({
      time: newTime,
      x: localX,
      y: localY,
      easing: 'ease-out',
      holdTime: defaultHoldTime
    });

    // Auto-extend duration based on cumulative total
    const totalTime = calculateCursorTotalDuration(cursor.cursorKeyframes);
    if (cursor.duration < totalTime + 0.5) {
      cursor.duration = totalTime + 0.5;
      // Update timeline to reflect new duration
      if (state.videoMode && typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
    }

    if (typeof window.saveState === 'function') {
      window.saveState();
    }
    render();
  }

  /**
   * Add click event to cursor at position
   */
  function addCursorClick(cursor, time, effect = 'ripple') {
    cursor.clicks.push({
      time: time,
      effect: effect,
      color: '#4a90d9',
      size: 40,
      duration: 0.4
    });

    if (typeof window.saveState === 'function') {
      window.saveState();
    }
    render();
  }

  /**
   * Delete a cursor keyframe at the specified index
   * @param {object} cursor - Cursor shape object
   * @param {number} keyframeIndex - Index of keyframe to delete
   * @returns {boolean} True if deleted, false if cannot delete (only 1 keyframe remaining)
   */
  function deleteCursorKeyframe(cursor, keyframeIndex) {
    if (!cursor || cursor.type !== 'cursor' || !cursor.cursorKeyframes) {
      return false;
    }

    // Cannot delete if only 1 keyframe remains
    if (cursor.cursorKeyframes.length <= 1) {
      return false;
    }

    // Validate index
    if (keyframeIndex < 0 || keyframeIndex >= cursor.cursorKeyframes.length) {
      return false;
    }

    // Remove the keyframe
    cursor.cursorKeyframes.splice(keyframeIndex, 1);

    // Recalculate cursor duration based on cumulative total
    if (cursor.cursorKeyframes.length > 0) {
      const totalTime = calculateCursorTotalDuration(cursor.cursorKeyframes);
      cursor.duration = Math.max(cursor.duration, totalTime + 0.5);
    }

    // Update timeline if in video mode
    if (state.videoMode && typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }

    if (typeof window.saveState === 'function') {
      window.saveState();
    }
    render();

    return true;
  }

  /**
   * Handle cursor keyframe/control point dragging
   */
  function handleCursorKeyframeDrag(pos) {
    if (state.selectedIndices.length !== 1) return;

    const cursor = state.shapes[state.selectedIndices[0]];
    if (!cursor || cursor.type !== 'cursor') return;

    const target = state.cursorDragTarget;
    if (!target) return;

    // Transform to local coordinates if cursor is rotated
    let localX = pos.x;
    let localY = pos.y;
    if (cursor.rotation) {
      const bounds = getShapeBounds(cursor);
      if (bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const local = rotatePoint(pos.x, pos.y, -cursor.rotation, cx, cy);
        localX = local.x;
        localY = local.y;
      }
    }

    if (target.type === 'keyframe') {
      // Drag keyframe position
      const kf = cursor.cursorKeyframes[target.index];
      if (kf) {
        kf.x = localX;
        kf.y = localY;
      }
    } else if (target.type === 'controlIn') {
      // Drag control in handle
      const kf = cursor.cursorKeyframes[target.keyframeIndex];
      if (kf) {
        if (!kf.controlIn) kf.controlIn = { x: localX, y: localY };
        kf.controlIn.x = localX;
        kf.controlIn.y = localY;
      }
    } else if (target.type === 'controlOut') {
      // Drag control out handle
      const kf = cursor.cursorKeyframes[target.keyframeIndex];
      if (kf) {
        if (!kf.controlOut) kf.controlOut = { x: localX, y: localY };
        kf.controlOut.x = localX;
        kf.controlOut.y = localY;
      }
    }

    render();
  }

  /**
   * Handle mouse move
   */
  function handleMouseMove(e) {
    // Skip if canvas not initialized yet
    if (!canvas) return;

    // Skip move handling for UI elements if not actively dragging
    if (!state.isPanning && !state.isDrawing && !state.isDragging && !state.isResizing && !state.isSelecting && !state.isRotating && !state.cropHandle && !state.isDraggingVectorPoint) {
      if (e.target.closest('.floating-panel, .popup-panel, .toolbar, #text-editor')) return;
    }

    const pos = screenToCanvas(e.clientX, e.clientY, state, canvas);

    // Panning
    if (state.isPanning) {
      handlePanning(e);
      return;
    }

    // Vector edit mode dragging
    if (state.isDraggingVectorPoint) {
      vectorEdit.updateVectorDrag(pos.x, pos.y);
      return;
    }

    // Vector edit mode cursor update
    if (state.isVectorEditing) {
      const hit = vectorEdit.hitTestVectorEdit(pos.x, pos.y);
      wrapper.style.cursor = hit ? (hit.type === 'curve' ? 'cell' : 'move') : 'default';
    }

    // Crop mode dragging
    if (cropMode.cropHandle.value) {
      cropMode.updateCropDrag(pos.x, pos.y);
      return;
    }

    // Crop mode cursor update
    if (cropMode.isCropping.value) {
      updateCropCursor(pos);
      return;
    }

    // Control point dragging
    if (state.isDraggingControlPoint) {
      handleControlPointDrag(pos);
      return;
    }

    // Selection box
    if (state.isSelecting) {
      handleSelectionBoxMove(pos);
      return;
    }

    // Rotation
    if (state.isRotating) {
      handleRotationMove(pos, e);
      return;
    }

    // Tilt X (forward/backward)
    if (state.isTiltingX) {
      handleTiltXMove(pos, e);
      return;
    }

    // Tilt Y (left/right)
    if (state.isTiltingY) {
      handleTiltYMove(pos, e);
      return;
    }

    // Cursor keyframe/control point dragging
    if (state.isDraggingCursorKeyframe && state.cursorDragTarget) {
      handleCursorKeyframeDrag(pos);
      return;
    }

    // Resize
    if (state.isResizing) {
      handleResizeMove(pos);
      return;
    }

    // Dragging
    if (state.isDragging) {
      handleDragMove(pos, e);
      return;
    }

    // Drawing
    if (state.isDrawing) {
      handleDrawingMove(pos);
      return;
    }

    // Update cursor for select tool
    if (state.currentTool === 'select') {
      updateSelectCursor(pos);
    }

    state.lastX = pos.x;
    state.lastY = pos.y;
  }

  /**
   * Handle panning
   */
  function handlePanning(e) {
    const displayScale = state.canvasDisplayScale || 1;
    const deltaX = (e.clientX - state.lastPanX) / displayScale;
    const deltaY = (e.clientY - state.lastPanY) / displayScale;

    state.panX += deltaX;
    state.panY += deltaY;
    state.lastPanX = e.clientX;
    state.lastPanY = e.clientY;

    // In video mode when zoomed in, constrain pan to export frame boundaries
    if (state.videoMode && state.zoom > 1 && canvas) {
      const minPanX = canvas.width - canvas.width * state.zoom;
      const maxPanX = 0;
      const minPanY = canvas.height - canvas.height * state.zoom;
      const maxPanY = 0;

      state.panX = Math.max(minPanX, Math.min(maxPanX, state.panX));
      state.panY = Math.max(minPanY, Math.min(maxPanY, state.panY));
    }

    render();

    if (typeof window.updateScrollToContentButton === 'function') {
      window.updateScrollToContentButton();
    }
    if (typeof window.updateTextEditorPosition === 'function') {
      window.updateTextEditorPosition();
    }
  }

  /**
   * Handle control point drag
   */
  function handleControlPointDrag(pos) {
    let shape;
    if (state.isDraggingFrameChildControlPoint && state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      shape = frame?.children?.[sel.childIndex];
    } else if (state.selectedIndices.length === 1) {
      shape = state.shapes[state.selectedIndices[0]];
    }

    if (shape && shape.controlPoint) {
      shape.controlPoint.x = pos.x;
      shape.controlPoint.y = pos.y;
      render();
    }
  }

  /**
   * Handle selection box move
   */
  function handleSelectionBoxMove(pos) {
    state.lastX = pos.x;
    state.lastY = pos.y;
    state.selectedIndices = getShapesInRect(state.selectionBoxStart.x, state.selectionBoxStart.y, pos.x, pos.y);
    render();
  }

  /**
   * Handle rotation move
   */
  function handleRotationMove(pos, e) {
    const currentAngle = Math.atan2(pos.y - state.rotationCenterY, pos.x - state.rotationCenterX);
    let angleDelta = currentAngle - state.rotationStartAngle;

    // Snap to 15 degree increments when holding Shift
    if (e.shiftKey) {
      const snapAngle = Math.PI / 12;
      angleDelta = Math.round(angleDelta / snapAngle) * snapAngle;
    }

    if (state.isRotatingFrameChild && state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      const child = frame?.children?.[sel.childIndex];
      if (child) {
        child.rotation = state.rotationShapeStartAngle + angleDelta;
      }
    } else if (state.isRotatingGroupChild && state.selectedGroupChildren?.length === 1) {
      const sel = state.selectedGroupChildren[0];
      const group = state.shapes[sel.groupIndex];
      const child = group?.children?.[sel.childIndex];
      if (child) {
        child.rotation = state.rotationShapeStartAngle + angleDelta;
      }
    } else if (state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      shape.rotation = state.rotationShapeStartAngle + angleDelta;
    } else if (state.multiRotateStart) {
      // Multi-selection rotation
      state.multiRotateStart.forEach(startData => {
        const shape = state.shapes[startData.index];
        const dx = startData.centerX - state.rotationCenterX;
        const dy = startData.centerY - state.rotationCenterY;
        const cos = Math.cos(angleDelta);
        const sin = Math.sin(angleDelta);
        const newCenterX = state.rotationCenterX + dx * cos - dy * sin;
        const newCenterY = state.rotationCenterY + dx * sin + dy * cos;

        const bounds = getShapeBounds(shape, config, ctx);
        const offsetX = newCenterX - (bounds.x + bounds.width / 2);
        const offsetY = newCenterY - (bounds.y + bounds.height / 2);

        tools.moveShape(startData.index, offsetX, offsetY);
        shape.rotation = startData.rotation + angleDelta;
      });
    }

    render();
  }

  /**
   * Handle tilt X move (forward/backward tilt)
   * Dragging up tilts forward, dragging down tilts backward
   */
  function handleTiltXMove(pos, e) {
    // Get the target shape (main shape, frame child, or group child)
    let shape = null;

    if (state.isTiltingFrameChild && state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      shape = frame?.children?.[sel.childIndex];
    } else if (state.isTiltingGroupChild && state.selectedGroupChildren?.length === 1) {
      const sel = state.selectedGroupChildren[0];
      const group = state.shapes[sel.groupIndex];
      shape = group?.children?.[sel.childIndex];
    } else if (state.selectedIndices.length === 1) {
      shape = state.shapes[state.selectedIndices[0]];
    }

    if (!shape) return;

    // Calculate tilt based on vertical mouse movement
    // Moving up (negative deltaY) tilts forward (positive tiltX)
    const deltaY = pos.y - state.tiltStartY;
    const sensitivity = 0.005; // Radians per pixel
    let tiltDelta = -deltaY * sensitivity;

    // Apply tilt
    let newTilt = state.tiltStartValue + tiltDelta;

    // Snap to 15° increments when holding Shift
    if (e.shiftKey) {
      const snapAngle = Math.PI / 12; // 15 degrees
      newTilt = Math.round(newTilt / snapAngle) * snapAngle;
    }

    // Clamp tilt to ±60° (roughly ±1.05 radians)
    const maxTilt = Math.PI / 3;
    newTilt = Math.max(-maxTilt, Math.min(maxTilt, newTilt));

    shape.tiltX = newTilt;
    render();
  }

  /**
   * Handle tilt Y move (left/right tilt)
   * Dragging left tilts left, dragging right tilts right
   */
  function handleTiltYMove(pos, e) {
    // Get the target shape (main shape, frame child, or group child)
    let shape = null;

    if (state.isTiltingFrameChild && state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      shape = frame?.children?.[sel.childIndex];
    } else if (state.isTiltingGroupChild && state.selectedGroupChildren?.length === 1) {
      const sel = state.selectedGroupChildren[0];
      const group = state.shapes[sel.groupIndex];
      shape = group?.children?.[sel.childIndex];
    } else if (state.selectedIndices.length === 1) {
      shape = state.shapes[state.selectedIndices[0]];
    }

    if (!shape) return;

    // Calculate tilt based on horizontal mouse movement
    const deltaX = pos.x - state.tiltStartX;
    const sensitivity = 0.005; // Radians per pixel
    let tiltDelta = deltaX * sensitivity;

    // Apply tilt
    let newTilt = state.tiltStartValue + tiltDelta;

    // Snap to 15° increments when holding Shift
    if (e.shiftKey) {
      const snapAngle = Math.PI / 12; // 15 degrees
      newTilt = Math.round(newTilt / snapAngle) * snapAngle;
    }

    // Clamp tilt to ±60° (roughly ±1.05 radians)
    const maxTilt = Math.PI / 3;
    newTilt = Math.max(-maxTilt, Math.min(maxTilt, newTilt));

    shape.tiltY = newTilt;
    render();
  }

  /**
   * Handle resize move
   */
  function handleResizeMove(pos) {
    const dx = pos.x - state.resizeStartPos.x;
    const dy = pos.y - state.resizeStartPos.y;

    if (state.isResizingFrameChild && state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      resizeFrameChild(sel.frameIndex, sel.childIndex, state.resizeHandle, dx, dy);
    } else if (state.isResizingGroupChild && state.selectedGroupChildren?.length === 1) {
      const sel = state.selectedGroupChildren[0];
      resizeGroupChild(sel.groupIndex, sel.childIndex, state.resizeHandle, dx, dy);
    } else if (state.selectedIndices.length === 1) {
      // Handle arrow endpoint dragging separately - direct position update
      if (isDraggingArrowEndpoint) {
        const shape = state.shapes[state.selectedIndices[0]];
        if (shape && (shape.type === 'line' || shape.type === 'arrow')) {
          // Directly set the endpoint position to follow the mouse
          if (draggingEndpoint === 'start') {
            shape.x1 = pos.x;
            shape.y1 = pos.y;
          } else {
            shape.x2 = pos.x;
            shape.y2 = pos.y;
          }

          // Clear previous connection highlight
          connectionHighlightShapeId = null;
          potentialConnection = null;

          // Check all shapes for potential connection (skip lines, arrows, and the current shape)
          // Iterate backward so topmost shapes (highest z-index) are checked first
          // Get the current endpoint position once
          const endpointX = draggingEndpoint === 'start' ? shape.x1 : shape.x2;
          const endpointY = draggingEndpoint === 'start' ? shape.y1 : shape.y2;
          const threshold = 5 / (state.zoom || 1);

          // Helper to check and set connection for a target shape
          const checkShapeConnection = (targetShape, shapeIndex, groupIndex, childIndex) => {
            if (!targetShape || targetShape.type === 'line' || targetShape.type === 'arrow') return false;

            if (isPointNearShape(endpointX, endpointY, targetShape, config, ctx, threshold)) {
              const isInside = isPointInsideShape(endpointX, endpointY, targetShape, config, ctx);

              if (isInside) {
                // Inside shape - connect without snapping
                connectionHighlightShapeId = targetShape.id || shapeIndex;
                potentialConnection = {
                  shapeId: targetShape.id || shapeIndex,
                  shapeIndex: shapeIndex,
                  groupIndex: groupIndex,
                  childIndex: childIndex,
                  x: endpointX,
                  y: endpointY,
                  inside: true
                };
                return true;
              } else {
                // Near edge - snap to edge
                const nearestPoint = findNearestPointOnShape(endpointX, endpointY, targetShape, config, ctx);
                if (nearestPoint) {
                  connectionHighlightShapeId = targetShape.id || shapeIndex;
                  potentialConnection = {
                    shapeId: targetShape.id || shapeIndex,
                    shapeIndex: shapeIndex,
                    groupIndex: groupIndex,
                    childIndex: childIndex,
                    x: nearestPoint.x,
                    y: nearestPoint.y
                  };
                  // Snap the arrow endpoint
                  if (draggingEndpoint === 'start') {
                    shape.x1 = nearestPoint.x;
                    shape.y1 = nearestPoint.y;
                  } else {
                    shape.x2 = nearestPoint.x;
                    shape.y2 = nearestPoint.y;
                  }
                  return true;
                }
              }
            }
            return false;
          };

          // Check shapes (top-level and group children)
          outerLoop: for (let i = state.shapes.length - 1; i >= 0; i--) {
            if (i === state.selectedIndices[0]) continue;
            const targetShape = state.shapes[i];
            if (!targetShape) continue;

            // Check group children first (they render on top of the group)
            if (targetShape.type === 'group' && targetShape.children?.length > 0) {
              for (let j = targetShape.children.length - 1; j >= 0; j--) {
                const child = targetShape.children[j];
                if (checkShapeConnection(child, i, i, j)) {
                  break outerLoop;
                }
              }
            }

            // Check the shape itself (skip groups - only their children are connectable)
            if (targetShape.type !== 'group') {
              if (checkShapeConnection(targetShape, i, undefined, undefined)) {
                break;
              }
            }
          }

          // Store highlight shape ID in state for renderer to use
          state.connectionHighlightShapeId = connectionHighlightShapeId;
        }
      } else {
        // Standard resize for other shapes
        tools.resizeShape(state.selectedIndices[0], state.resizeHandle, dx, dy);
      }
    } else {
      resizeMultiSelection(dx, dy);
    }

    render();
  }

  /**
   * Resize a frame child
   */
  function resizeFrameChild(frameIndex, childIndex, handle, dx, dy) {
    const frame = state.shapes[frameIndex];
    if (!frame || !frame.children) return;

    const child = frame.children[childIndex];
    if (!child) return;

    const bounds = state.resizeStartBounds;
    if (!bounds) return;

    let newX = bounds.x, newY = bounds.y;
    let newW = bounds.width, newH = bounds.height;

    // Calculate new dimensions based on handle
    if (handle.includes('w')) { newX = bounds.x + dx; newW = bounds.width - dx; }
    if (handle.includes('e')) { newW = bounds.width + dx; }
    if (handle.includes('n')) { newY = bounds.y + dy; newH = bounds.height - dy; }
    if (handle.includes('s')) { newH = bounds.height + dy; }

    // Prevent negative dimensions
    const minSize = 10;
    if (newW < minSize) { newW = minSize; if (handle.includes('w')) newX = bounds.x + bounds.width - minSize; }
    if (newH < minSize) { newH = minSize; if (handle.includes('n')) newY = bounds.y + bounds.height - minSize; }

    // Apply resize based on shape type
    applyResizeToShape(child, newX, newY, newW, newH, bounds);
  }

  /**
   * Resize a group child
   */
  function resizeGroupChild(groupIndex, childIndex, handle, dx, dy) {
    const group = state.shapes[groupIndex];
    if (!group || !group.children) return;

    const child = group.children[childIndex];
    if (!child) return;

    const bounds = state.resizeStartBounds;
    if (!bounds) return;

    let newX = bounds.x, newY = bounds.y;
    let newW = bounds.width, newH = bounds.height;

    // Calculate new dimensions based on handle
    if (handle.includes('w')) { newX = bounds.x + dx; newW = bounds.width - dx; }
    if (handle.includes('e')) { newW = bounds.width + dx; }
    if (handle.includes('n')) { newY = bounds.y + dy; newH = bounds.height - dy; }
    if (handle.includes('s')) { newH = bounds.height + dy; }

    // Prevent negative dimensions
    const minSize = 10;
    if (newW < minSize) { newW = minSize; if (handle.includes('w')) newX = bounds.x + bounds.width - minSize; }
    if (newH < minSize) { newH = minSize; if (handle.includes('n')) newY = bounds.y + bounds.height - minSize; }

    // Apply resize based on shape type
    applyResizeToShape(child, newX, newY, newW, newH, bounds);
  }

  /**
   * Resize multi-selection
   */
  function resizeMultiSelection(dx, dy) {
    if (!state.multiResizeStart || state.selectedIndices.length < 2) return;

    const bounds = state.resizeStartBounds;
    const handle = state.resizeHandle;

    let newX = bounds.x, newY = bounds.y;
    let newW = bounds.width, newH = bounds.height;

    if (handle.includes('w')) { newX = bounds.x + dx; newW = bounds.width - dx; }
    if (handle.includes('e')) { newW = bounds.width + dx; }
    if (handle.includes('n')) { newY = bounds.y + dy; newH = bounds.height - dy; }
    if (handle.includes('s')) { newH = bounds.height + dy; }

    const minSize = 20;
    if (newW < minSize) { newW = minSize; if (handle.includes('w')) newX = bounds.x + bounds.width - minSize; }
    if (newH < minSize) { newH = minSize; if (handle.includes('n')) newY = bounds.y + bounds.height - minSize; }

    const scaleX = bounds.width > 0 ? newW / bounds.width : 1;
    const scaleY = bounds.height > 0 ? newH / bounds.height : 1;

    state.multiResizeStart.forEach(startData => {
      const shape = state.shapes[startData.index];
      if (!shape) return;

      const relX = startData.bounds.x - bounds.x;
      const relY = startData.bounds.y - bounds.y;
      const shapeCenterX = newX + relX * scaleX + startData.bounds.width * scaleX / 2;
      const shapeCenterY = newY + relY * scaleY + startData.bounds.height * scaleY / 2;

      const newShapeW = startData.bounds.width * scaleX;
      const newShapeH = startData.bounds.height * scaleY;
      const newShapeX = shapeCenterX - newShapeW / 2;
      const newShapeY = shapeCenterY - newShapeH / 2;

      applyResizeToShape(shape, newShapeX, newShapeY, newShapeW, newShapeH, startData.bounds, startData.startShapeData);
    });
  }

  /**
   * Apply resize to a shape
   * @param {object} shape - The shape to resize
   * @param {number} newX - New X position
   * @param {number} newY - New Y position
   * @param {number} newW - New width
   * @param {number} newH - New height
   * @param {object} originalBounds - Original bounding box
   * @param {object} startShapeData - Optional stored shape data (for multi-selection)
   */
  function applyResizeToShape(shape, newX, newY, newW, newH, originalBounds, startShapeData = null) {
    // Use provided startShapeData or fall back to state.resizeStartShapes (for single selection)
    const resizeData = startShapeData || state.resizeStartShapes;

    switch (shape.type) {
      case 'rect':
      case 'image':
      case 'video':
      case 'text':
        shape.x = newX;
        shape.y = newY;
        shape.width = newW;
        shape.height = newH;
        break;

      case 'frame': {
        const labelHeight = (config.frame?.labelFontSize || 12) +
                           (config.frame?.labelPadding || 4) * 2 +
                           (config.frame?.labelOffset || 2);
        shape.x = newX;
        shape.y = newY + labelHeight;
        shape.width = newW;
        shape.height = newH - labelHeight;
        break;
      }

      case 'ellipse':
        shape.radiusX = newW / 2;
        shape.radiusY = newH / 2;
        shape.x = newX + newW / 2;
        shape.y = newY + newH / 2;
        break;

      case 'circle':
        shape.radius = Math.max(newW, newH) / 2;
        shape.x = newX + newW / 2;
        shape.y = newY + newH / 2;
        break;

      case 'diamond':
        shape.width = newW;
        shape.height = newH;
        shape.x = newX + newW / 2;
        shape.y = newY + newH / 2;
        break;

      case 'line':
      case 'arrow': {
        const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
        const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

        if (resizeData) {
          shape.x1 = newX + (resizeData.origX1 - originalBounds.x) * scaleX;
          shape.y1 = newY + (resizeData.origY1 - originalBounds.y) * scaleY;
          shape.x2 = newX + (resizeData.origX2 - originalBounds.x) * scaleX;
          shape.y2 = newY + (resizeData.origY2 - originalBounds.y) * scaleY;

          if (shape.controlPoint && resizeData.origControlPoint) {
            shape.controlPoint.x = newX + (resizeData.origControlPoint.x - originalBounds.x) * scaleX;
            shape.controlPoint.y = newY + (resizeData.origControlPoint.y - originalBounds.y) * scaleY;
          }
        }
        break;
      }

      case 'freehand': {
        if (shape.points && resizeData?.origPoints) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          shape.points = resizeData.origPoints.map(p => ({
            x: newX + (p.x - originalBounds.x) * scaleX,
            y: newY + (p.y - originalBounds.y) * scaleY
          }));
        }
        break;
      }

      case 'triangle': {
        if (shape.x1 !== undefined && resizeData) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          shape.x1 = newX + (resizeData.origX1 - originalBounds.x) * scaleX;
          shape.y1 = newY + (resizeData.origY1 - originalBounds.y) * scaleY;
          shape.x2 = newX + (resizeData.origX2 - originalBounds.x) * scaleX;
          shape.y2 = newY + (resizeData.origY2 - originalBounds.y) * scaleY;
          shape.x3 = newX + (resizeData.origX3 - originalBounds.x) * scaleX;
          shape.y3 = newY + (resizeData.origY3 - originalBounds.y) * scaleY;
        } else {
          shape.x = newX;
          shape.y = newY;
          shape.width = newW;
          shape.height = newH;
        }
        break;
      }

      case 'path': {
        if (resizeData?.origPath) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          // Handle compound paths with children
          if (resizeData.origPath.isCompound && shape.children) {
            shape.children = resizeData.origPath.children.map(origChild => ({
              segments: origChild.segments.map(seg => ({
                point: [
                  newX + (seg.point[0] - originalBounds.x) * scaleX,
                  newY + (seg.point[1] - originalBounds.y) * scaleY
                ],
                handleIn: seg.handleIn ? [seg.handleIn[0] * scaleX, seg.handleIn[1] * scaleY] : undefined,
                handleOut: seg.handleOut ? [seg.handleOut[0] * scaleX, seg.handleOut[1] * scaleY] : undefined
              })),
              closed: origChild.closed
            }));
          } else if (shape.segments && resizeData.origPath.segments) {
            // Handle simple paths
            shape.segments = resizeData.origPath.segments.map(seg => ({
              point: [
                newX + (seg.point[0] - originalBounds.x) * scaleX,
                newY + (seg.point[1] - originalBounds.y) * scaleY
              ],
              handleIn: seg.handleIn ? [seg.handleIn[0] * scaleX, seg.handleIn[1] * scaleY] : undefined,
              handleOut: seg.handleOut ? [seg.handleOut[0] * scaleX, seg.handleOut[1] * scaleY] : undefined
            }));
          }
        }
        break;
      }

      case 'cursor': {
        if (resizeData?.origCursorKeyframes) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;
          const uniformScale = (scaleX + scaleY) / 2;

          shape.cursorKeyframes = resizeData.origCursorKeyframes.map(kf => {
            const newKf = {
              ...kf,
              x: newX + (kf.x - originalBounds.x) * scaleX,
              y: newY + (kf.y - originalBounds.y) * scaleY
            };
            if (kf.controlIn) {
              newKf.controlIn = {
                x: newX + (kf.controlIn.x - originalBounds.x) * scaleX,
                y: newY + (kf.controlIn.y - originalBounds.y) * scaleY
              };
            }
            if (kf.controlOut) {
              newKf.controlOut = {
                x: newX + (kf.controlOut.x - originalBounds.x) * scaleX,
                y: newY + (kf.controlOut.y - originalBounds.y) * scaleY
              };
            }
            return newKf;
          });

          // Scale cursor icon proportionally
          const origScale = resizeData.origCursorScale || 1.0;
          shape.cursorScale = Math.max(0.1, origScale * uniformScale);
        }
        break;
      }
    }
  }

  /**
   * Handle drag move
   */
  function handleDragMove(pos, e = null) {
    // Check if Alt key is held (allows off-canvas placement in video mode)
    const allowOffCanvas = e?.altKey || false;

    // Frame child dragging
    if (state.isDraggingFrameChild && state.selectedFrameChildren?.length > 0) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      const child = frame?.children?.[sel.childIndex];
      if (!child) return;

      const b = getShapeBounds(child, config, ctx);
      if (!b) return;

      let dx = pos.x - state.dragOffsetX - b.x;
      let dy = pos.y - state.dragOffsetY - b.y;

      if (isSnappingEnabled() && state.snapPoints) {
        const snap = findSnapOffset({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height }, state.snapPoints);
        dx += snap.dx;
        dy += snap.dy;
      }

      frameChildren.moveFrameChild(sel.frameIndex, sel.childIndex, dx, dy);
      frameChildren.updateDropTargetFrame(pos.x, pos.y);
      render();
      return;
    }

    // Group child dragging
    if (state.isDraggingGroupChild && state.selectedGroupChildren?.length > 0) {
      const sel = state.selectedGroupChildren[0];
      const group = state.shapes[sel.groupIndex];
      const child = group?.children?.[sel.childIndex];
      if (!child) return;

      const b = getShapeBounds(child, config, ctx);
      if (!b) return;

      let dx = pos.x - state.dragOffsetX - b.x;
      let dy = pos.y - state.dragOffsetY - b.y;

      if (isSnappingEnabled() && state.snapPoints) {
        const snap = findSnapOffset({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height }, state.snapPoints);
        dx += snap.dx;
        dy += snap.dy;
      }

      // Move all selected group children
      state.selectedGroupChildren.forEach(s => {
        const g = state.shapes[s.groupIndex];
        const c = g?.children?.[s.childIndex];
        if (c) {
          tools.moveShapeObj(c, dx, dy);
        }
      });

      render();
      return;
    }

    // Main shape dragging
    if (state.selectedIndices.length > 0) {
      const b = state.selectedIndices.length > 1
        ? getMultiSelectionBounds(state.shapes, state.selectedIndices, config, ctx)
        : getShapeBounds(state.shapes[state.selectedIndices[0]], config, ctx);
      if (!b) return;

      let dx = pos.x - state.dragOffsetX - b.x;
      let dy = pos.y - state.dragOffsetY - b.y;

      if (isSnappingEnabled() && state.snapPoints) {
        const snap = findSnapOffset({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
        dx += snap.dx;
        dy += snap.dy;
      }

      // Apply boundary constraints in video mode (unless Alt is held)
      // Note: Canvas bounds stay the same regardless of zoom - zoom just affects which portion is visible
      if (state.videoMode && !allowOffCanvas && canvas) {
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // Calculate new position after move
        const newX = b.x + dx;
        const newY = b.y + dy;

        // Constrain to keep shape within canvas bounds
        // Allow partial off-screen but keep at least some part visible
        const minVisible = 20; // Keep at least 20px visible

        // Constrain left edge (shape can't go too far left)
        if (newX + b.width < minVisible) {
          dx = minVisible - b.width - b.x;
        }
        // Constrain right edge (shape can't go too far right)
        if (newX > canvasWidth - minVisible) {
          dx = canvasWidth - minVisible - b.x;
        }
        // Constrain top edge
        if (newY + b.height < minVisible) {
          dy = minVisible - b.height - b.y;
        }
        // Constrain bottom edge
        if (newY > canvasHeight - minVisible) {
          dy = canvasHeight - minVisible - b.y;
        }
      }

      state.selectedIndices.forEach(i => {
        tools.moveShape(i, dx, dy);
      });

      // Update connected arrows when shapes are moved
      updateConnectedArrows();

      frameChildren.updateDropTargetFrame(pos.x, pos.y);
      render();
    }
  }

  /**
   * Update arrow endpoints that are connected to moved shapes
   */
  function updateConnectedArrows() {
    // Get IDs of all currently selected/moving shapes (including groups)
    const movingShapeIds = new Set();
    const movingGroupIndices = new Set();
    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      if (shape) {
        movingShapeIds.add(shape.id || i);
        // If it's a group, track its index so we can update arrows connected to its children
        if (shape.type === 'group') {
          movingGroupIndices.add(i);
        }
      }
    });

    // Check all arrows/lines for connections to moving shapes
    state.shapes.forEach((shape) => {
      if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) return;

      // Helper to check if a connection target is moving
      const isConnectionMoving = (conn) => {
        if (!conn) return false;
        // Check if connected to a group child and the group is moving
        if (conn.groupIndex !== undefined && movingGroupIndices.has(conn.groupIndex)) {
          return true;
        }
        // Check if the shape itself is moving (top-level)
        return movingShapeIds.has(conn.shapeId);
      };

      // Check start connection
      if (shape.startConnection && isConnectionMoving(shape.startConnection)) {
        const conn = shape.startConnection;
        const connectedShape = findShapeById(conn.shapeId, conn.groupIndex, conn.childIndex);
        if (connectedShape) {
          // Check for inside connection or edge connection
          const hasRelativePos = conn.inside ||
            (conn.edge !== undefined && conn.t !== undefined);
          if (hasRelativePos) {
            const absolutePos = getAbsoluteFromRelativeEdge(conn, connectedShape, config, ctx);
            if (absolutePos) {
              shape.x1 = absolutePos.x;
              shape.y1 = absolutePos.y;
            }
          } else {
            // Fallback: calculate nearest point from other endpoint (for old connections without edge data)
            const nearestPoint = findNearestPointOnShape(shape.x2, shape.y2, connectedShape, config, ctx);
            if (nearestPoint) {
              shape.x1 = nearestPoint.x;
              shape.y1 = nearestPoint.y;
            }
          }
        }
      }

      // Check end connection
      if (shape.endConnection && isConnectionMoving(shape.endConnection)) {
        const conn = shape.endConnection;
        const connectedShape = findShapeById(conn.shapeId, conn.groupIndex, conn.childIndex);
        if (connectedShape) {
          // Check for inside connection or edge connection
          const hasRelativePos = conn.inside ||
            (conn.edge !== undefined && conn.t !== undefined);
          if (hasRelativePos) {
            const absolutePos = getAbsoluteFromRelativeEdge(conn, connectedShape, config, ctx);
            if (absolutePos) {
              shape.x2 = absolutePos.x;
              shape.y2 = absolutePos.y;
            }
          } else {
            // Fallback: calculate nearest point from other endpoint (for old connections without edge data)
            const nearestPoint = findNearestPointOnShape(shape.x1, shape.y1, connectedShape, config, ctx);
            if (nearestPoint) {
              shape.x2 = nearestPoint.x;
              shape.y2 = nearestPoint.y;
            }
          }
        }
      }
    });
  }

  /**
   * Update ALL connected arrow endpoints (used when canvas size changes or shapes are bulk-modified)
   */
  function updateAllConnectedArrows() {
    // Get fresh canvas context in case canvas was resized
    const currentCanvas = document.getElementById('drawing-canvas');
    const currentCtx = currentCanvas?.getContext('2d') || ctx;

    state.shapes.forEach((shape) => {
      if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) return;

      // Update start connection
      if (shape.startConnection) {
        const conn = shape.startConnection;
        const connectedShape = findShapeById(conn.shapeId, conn.groupIndex, conn.childIndex);
        if (connectedShape) {
          // Check for inside connection or edge connection
          const hasRelativePos = conn.inside ||
            (conn.edge !== undefined && conn.t !== undefined);
          if (hasRelativePos) {
            const absolutePos = getAbsoluteFromRelativeEdge(conn, connectedShape, config, currentCtx);
            if (absolutePos) {
              shape.x1 = absolutePos.x;
              shape.y1 = absolutePos.y;
            }
          } else {
            const nearestPoint = findNearestPointOnShape(shape.x2, shape.y2, connectedShape, config, currentCtx);
            if (nearestPoint) {
              shape.x1 = nearestPoint.x;
              shape.y1 = nearestPoint.y;
            }
          }
        }
      }

      // Update end connection
      if (shape.endConnection) {
        const conn = shape.endConnection;
        const connectedShape = findShapeById(conn.shapeId, conn.groupIndex, conn.childIndex);
        if (connectedShape) {
          // Check for inside connection or edge connection
          const hasRelativePos = conn.inside ||
            (conn.edge !== undefined && conn.t !== undefined);
          if (hasRelativePos) {
            const absolutePos = getAbsoluteFromRelativeEdge(conn, connectedShape, config, currentCtx);
            if (absolutePos) {
              shape.x2 = absolutePos.x;
              shape.y2 = absolutePos.y;
            }
          } else {
            const nearestPoint = findNearestPointOnShape(shape.x1, shape.y1, connectedShape, config, currentCtx);
            if (nearestPoint) {
              shape.x2 = nearestPoint.x;
              shape.y2 = nearestPoint.y;
            }
          }
        }
      }
    });
  }

  /**
   * Find shape by ID, optionally within a group
   * @param {string|number} shapeId - Shape ID or index
   * @param {number} groupIndex - Optional group index for group children
   * @param {number} childIndex - Optional child index within the group
   */
  function findShapeById(shapeId, groupIndex, childIndex) {
    // If group info provided, get child directly
    if (groupIndex !== undefined && childIndex !== undefined) {
      const group = state.shapes[groupIndex];
      return group?.children?.[childIndex] || null;
    }

    // If shapeId is a number, it might be an index
    if (typeof shapeId === 'number') {
      return state.shapes[shapeId] || null;
    }

    // Search top-level shapes first
    const topLevel = state.shapes.find(s => s && s.id === shapeId);
    if (topLevel) return topLevel;

    // Search inside groups
    for (const shape of state.shapes) {
      if (shape?.type === 'group' && shape.children) {
        const child = shape.children.find(c => c && c.id === shapeId);
        if (child) return child;
      }
    }

    return null;
  }

  /**
   * Handle drawing move
   */
  function handleDrawingMove(pos) {
    if (state.currentTool === 'pen') {
      if (state.currentFreehand) {
        state.currentFreehand.points.push({ x: pos.x, y: pos.y });
        // Track end position for animated pencil cursor on recording canvas
        state.drawEndX = pos.x;
        state.drawEndY = pos.y;
        render();
        // Draw the in-progress freehand stroke
        drawFreehandPreview(state.currentFreehand);
      }
    } else if (state.currentTool === 'eraser') {
      // Track end position for animated pencil cursor on recording canvas
      state.drawEndX = pos.x;
      state.drawEndY = pos.y;
      const hit = hitTest(pos.x, pos.y, state, config, ctx, getVisibilityCheck());
      if (typeof hit === 'number' && hit >= 0) {
        state.shapes.splice(hit, 1);
        render();
        renderLayersList();
      } else if (state.isRecording && state.showDrawingPencil) {
        // Still render to show pencil cursor following eraser movement
        render();
      }
    } else {
      // Shape preview
      // Calculate snapped end coordinates BEFORE render() so recording canvas can use them
      let endX = pos.x, endY = pos.y;
      if (isSnappingEnabled() && state.snapPoints) {
        state.activeSnapLines = { vertical: [], horizontal: [] };
        for (const p of state.snapPoints.vertical) {
          if (Math.abs(pos.x - p.x) <= (state.snapThreshold || 8)) {
            endX = p.x;
            state.activeSnapLines.vertical.push(p.x);
            break;
          }
        }
        for (const p of state.snapPoints.horizontal) {
          if (Math.abs(pos.y - p.y) <= (state.snapThreshold || 8)) {
            endY = p.y;
            state.activeSnapLines.horizontal.push(p.y);
            break;
          }
        }
        // Snap guides are drawn automatically by render()
      }

      // Store snapped end coordinates for recording canvas to use
      // This must be set BEFORE render() so renderToRecordingCanvas() has current values
      state.drawEndX = endX;
      state.drawEndY = endY;

      render();
      drawToolPreview(state.startX, state.startY, endX, endY);
    }
  }

  /**
   * Draw freehand preview stroke
   */
  function drawFreehandPreview(freehand) {
    if (!ctx || !freehand.points || freehand.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = freehand.color || state.currentColor;
    ctx.lineWidth = freehand.lineWidth || state.currentSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = (freehand.opacity || state.currentOpacity) / 100;

    ctx.beginPath();
    ctx.moveTo(freehand.points[0].x, freehand.points[0].y);
    for (let i = 1; i < freehand.points.length; i++) {
      ctx.lineTo(freehand.points[i].x, freehand.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Update crop cursor
   */
  function updateCropCursor(pos) {
    const cropHandle = cropMode.hitTestCropHandle(pos.x, pos.y);
    if (cropHandle === 'nw' || cropHandle === 'se') {
      wrapper.style.cursor = 'nwse-resize';
    } else if (cropHandle === 'ne' || cropHandle === 'sw') {
      wrapper.style.cursor = 'nesw-resize';
    } else if (cropHandle === 'n' || cropHandle === 's') {
      wrapper.style.cursor = 'ns-resize';
    } else if (cropHandle === 'e' || cropHandle === 'w') {
      wrapper.style.cursor = 'ew-resize';
    } else if (cropMode.isPointInCropArea(pos.x, pos.y)) {
      wrapper.style.cursor = 'move';
    } else {
      wrapper.style.cursor = 'default';
    }
  }

  /**
   * Update select cursor
   */
  function updateSelectCursor(pos) {
    if (state.selectedIndices.length >= 1) {
      const handle = hitTestHandle(pos.x, pos.y, state, config, ctx);
      if (handle) {
        // Use special cursor classes for tilt handles
        if (handle === 'tiltX') {
          wrapper.className = 'mode-select tilting-x';
        } else if (handle === 'tiltY') {
          wrapper.className = 'mode-select tilting-y';
        } else {
          wrapper.className = 'mode-select resizing-' + handle;
        }
      } else if (state.selectedIndices.length > 1) {
        const multiBounds = getMultiSelectionBounds(state.shapes, state.selectedIndices, config, ctx);
        if (multiBounds && pointInRect(pos.x, pos.y, multiBounds, 6)) {
          wrapper.className = 'mode-select moving';
        } else {
          wrapper.className = 'mode-select';
        }
      } else {
        wrapper.className = 'mode-select';
      }
    }
  }

  /**
   * Handle mouse up
   */
  function handleMouseUp(e) {
    // Always stop document tracking - handles mouseup outside canvas
    stopDocumentTracking();

    // Skip if canvas not initialized yet
    if (!canvas) return;

    state.activeSnapLines = { vertical: [], horizontal: [] };
    state.activeSnapPoints = [];

    // Panning
    if (state.isPanning) {
      state.isPanning = false;
      isPanning.value = false;
      wrapper?.classList.remove('panning');
      return;
    }

    // Vector edit mode
    if (state.isDraggingVectorPoint) {
      vectorEdit.endVectorDrag();
      return;
    }

    // Crop mode
    if (cropMode.cropHandle.value) {
      cropMode.endCropDrag();
      return;
    }

    // Cursor keyframe drag
    if (state.isDraggingCursorKeyframe) {
      state.isDraggingCursorKeyframe = false;
      state.cursorDragTarget = null;
      state.dragStartPos = null;
      wrapper?.classList.remove('dragging');
      if (typeof window.saveState === 'function') {
        window.saveState();
      }
      render();
      return;
    }

    // Control point drag
    if (state.isDraggingControlPoint) {
      state.isDraggingControlPoint = false;
      state.isDraggingFrameChildControlPoint = false;
      state.activeControlPoint = null;
      state.controlPointStartPos = null;
      wrapper?.classList.remove('dragging');
      saveState();
      render();
      return;
    }

    // Rotation
    if (state.isRotating) {
      state.isRotating = false;
      isRotating.value = false;
      state.isRotatingFrameChild = false;
      state.isRotatingGroupChild = false;
      wrapper?.classList.remove('rotating');
      saveState();
      return;
    }

    // Tilt X
    if (state.isTiltingX) {
      state.isTiltingX = false;
      isTiltingX.value = false;
      state.isTiltingFrameChild = false;
      state.isTiltingGroupChild = false;
      wrapper?.classList.remove('tilting-x');
      saveState();
      return;
    }

    // Tilt Y
    if (state.isTiltingY) {
      state.isTiltingY = false;
      isTiltingY.value = false;
      state.isTiltingFrameChild = false;
      state.isTiltingGroupChild = false;
      wrapper?.classList.remove('tilting-y');
      saveState();
      return;
    }

    // Selection
    if (state.isSelecting) {
      state.isSelecting = false;
      isSelecting.value = false;
      wrapper?.classList.remove('selecting');

      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const newSel = getShapesInRect(state.selectionBoxStart.x, state.selectionBoxStart.y, state.lastX, state.lastY);
        newSel.forEach(i => {
          if (!state.selectedIndices.includes(i)) state.selectedIndices.push(i);
        });
      }

      state.selectionBoxStart = null;
      render();
      renderLayersList();

      if (state.selectedIndices.length > 0 && typeof window.showOptionsBar === 'function') {
        window.showOptionsBar();
      }
      return;
    }

    // Resize
    if (state.isResizing) {
      // Handle arrow endpoint connections
      if (isDraggingArrowEndpoint && state.selectedIndices.length === 1) {
        const shape = state.shapes[state.selectedIndices[0]];
        if (shape && (shape.type === 'line' || shape.type === 'arrow')) {
          if (potentialConnection) {
            // Find the connected shape to calculate relative position
            const connectedShape = findShapeById(potentialConnection.shapeId, potentialConnection.groupIndex, potentialConnection.childIndex);
            const endpointX = draggingEndpoint === 'start' ? shape.x1 : shape.x2;
            const endpointY = draggingEndpoint === 'start' ? shape.y1 : shape.y2;

            let connectionData;

            if (potentialConnection.inside && connectedShape) {
              // Inside connection - store relative position within shape bounds
              const bounds = getShapeBounds(connectedShape, config, ctx);
              if (bounds && bounds.width > 0 && bounds.height > 0) {
                connectionData = {
                  shapeId: potentialConnection.shapeId,
                  shapeIndex: potentialConnection.shapeIndex,
                  groupIndex: potentialConnection.groupIndex,
                  childIndex: potentialConnection.childIndex,
                  inside: true,
                  relativeX: (endpointX - bounds.x) / bounds.width,
                  relativeY: (endpointY - bounds.y) / bounds.height
                };
              }
            }

            if (!connectionData) {
              // Edge connection - store relative edge position
              const relativePos = connectedShape ? getRelativeEdgePosition(endpointX, endpointY, connectedShape, config, ctx) : null;
              connectionData = {
                shapeId: potentialConnection.shapeId,
                shapeIndex: potentialConnection.shapeIndex,
                groupIndex: potentialConnection.groupIndex,
                childIndex: potentialConnection.childIndex,
                edge: relativePos?.edge,
                t: relativePos?.t
              };
            }

            // Store the new connection on the appropriate endpoint
            if (draggingEndpoint === 'start') {
              shape.startConnection = connectionData;
            } else {
              shape.endConnection = connectionData;
            }
          } else {
            // No connection made - clear any existing connection on this endpoint
            if (draggingEndpoint === 'start') {
              delete shape.startConnection;
            } else {
              delete shape.endConnection;
            }
          }
        }
      }

      // Clear arrow endpoint dragging state
      isDraggingArrowEndpoint = false;
      draggingEndpoint = null;
      potentialConnection = null;
      connectionHighlightShapeId = null;
      state.connectionHighlightShapeId = null;

      state.isResizing = false;
      isResizing.value = false;
      state.isResizingFrameChild = false;
      state.isResizingGroupChild = false;
      state.resizeHandle = null;
      state.resizeStartBounds = null;
      state.resizeStartPos = null;
      state.resizeStartShapes = null;
      wrapper.className = 'mode-select';
      saveState();
      renderLayersList();
      return;
    }

    const pos = screenToCanvas(e.clientX, e.clientY, state, canvas);

    // Dragging
    if (state.isDragging) {
      state.isDragging = false;
      isDragging.value = false;
      wrapper?.classList.remove('dragging');
      state.snapPoints = null;
      state.dropTargetFrameIndex = -1;

      // Check if any dragged lines/arrows should be disconnected
      // (when moved away from their connected shapes)
      for (const idx of state.selectedIndices) {
        const shape = state.shapes[idx];
        if (shape && (shape.type === 'line' || shape.type === 'arrow')) {
          const connectionThreshold = config.connection?.threshold || 20;

          // Check start connection
          if (shape.startConnection) {
            const conn = shape.startConnection;
            const connectedShape = findShapeById(conn.shapeId, conn.groupIndex, conn.childIndex);
            if (connectedShape) {
              const isNear = isPointNearShape(shape.x1, shape.y1, connectedShape, config, ctx, connectionThreshold);
              if (!isNear) {
                delete shape.startConnection;
              }
            } else {
              // Connected shape no longer exists
              delete shape.startConnection;
            }
          }

          // Check end connection
          if (shape.endConnection) {
            const conn = shape.endConnection;
            const connectedShape = findShapeById(conn.shapeId, conn.groupIndex, conn.childIndex);
            if (connectedShape) {
              const isNear = isPointNearShape(shape.x2, shape.y2, connectedShape, config, ctx, connectionThreshold);
              if (!isNear) {
                delete shape.endConnection;
              }
            } else {
              // Connected shape no longer exists
              delete shape.endConnection;
            }
          }
        }
      }

      if (state.isDraggingFrameChild && state.selectedFrameChildren?.length > 0) {
        frameChildren.handleFrameChildDragDrop(pos.x, pos.y);
        state.isDraggingFrameChild = false;
        frameChildren.isDraggingFrameChild.value = false;
      } else if (state.isDraggingGroupChild && state.selectedGroupChildren?.length > 0) {
        // End group child dragging
        state.isDraggingGroupChild = false;
      } else {
        frameChildren.handleFrameDragDrop();
      }

      saveState();
      render();
      renderLayersList();
      return;
    }

    // Drawing
    if (state.isDrawing) {
      state.isDrawing = false;
      isDrawing.value = false;
      state.snapPoints = null;

      let endX = pos.x, endY = pos.y;
      if (isSnappingEnabled()) {
        const sp = getSnapPoints();
        for (const p of sp.vertical) {
          if (Math.abs(pos.x - p) <= state.snapThreshold) { endX = p; break; }
        }
        for (const p of sp.horizontal) {
          if (Math.abs(pos.y - p) <= state.snapThreshold) { endY = p; break; }
        }
      }

      createShape(state.startX, state.startY, endX, endY);
    }
  }

  /**
   * Handle context menu
   */
  function handleContextMenu(e) {
    e.preventDefault();
    if (!canvas) return;
    if (e.target.closest('.floating-panel, .popup-panel, .toolbar')) return;

    const pos = screenToCanvas(e.clientX, e.clientY, state, canvas);
    const hit = hitTest(pos.x, pos.y, state, config, ctx, getVisibilityCheck());

    if (typeof hit === 'number' && hit >= 0 && !state.selectedIndices.includes(hit)) {
      state.selectedIndices = [hit];
      render();
      renderLayersList();
    }

    if (typeof window.showContextMenu === 'function') {
      window.showContextMenu(e.clientX, e.clientY);
    }
  }

  // ==================== DRAG AND DROP ====================

  /**
   * Handle dragover events for file drops
   */
  function handleDragOver(e) {
    // Only handle if dragging files
    if (!e.dataTransfer.types.includes('Files')) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';

    // Add visual feedback to wrapper and canvas-frame (video mode)
    if (wrapper) {
      wrapper.classList.add('drag-over');
    }
    const canvasFrame = document.getElementById('canvas-frame');
    if (canvasFrame) {
      canvasFrame.classList.add('drag-over');
    }
  }

  /**
   * Handle dragleave events
   */
  function handleDragLeave(e) {
    e.preventDefault();

    // Only remove class if actually leaving the wrapper
    if (wrapper && !wrapper.contains(e.relatedTarget)) {
      wrapper.classList.remove('drag-over');
    }
    const canvasFrame = document.getElementById('canvas-frame');
    if (canvasFrame && !canvasFrame.contains(e.relatedTarget)) {
      canvasFrame.classList.remove('drag-over');
    }
  }

  /**
   * Handle drop events for files (images, videos, audio)
   */
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // Remove visual feedback
    if (wrapper) {
      wrapper.classList.remove('drag-over');
    }
    const canvasFrame = document.getElementById('canvas-frame');
    if (canvasFrame) {
      canvasFrame.classList.remove('drag-over');
    }

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Get canvas position for drop
    const pos = screenToCanvas(e.clientX, e.clientY, state, canvas);

    // Process each file
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Add image to canvas (supported in both canvas and video modes)
        if (typeof window.addImageToCanvas === 'function') {
          window.addImageToCanvas(file, pos.x, pos.y);
        }
      } else if (file.type.startsWith('video/') && state.videoMode) {
        // Video only supported in video mode (requires timeline)
        if (typeof window.addVideoToCanvas === 'function') {
          window.addVideoToCanvas(file, pos.x, pos.y);
        }
      } else if (file.type.startsWith('audio/') && state.videoMode) {
        // Audio only supported in video mode - add to timeline
        if (typeof window.addAudioToTimeline === 'function') {
          window.addAudioToTimeline(file);
        }
      }
    }
  }

  /**
   * Setup timeline drop handlers for video mode
   */
  function setupTimelineDropHandlers() {
    // Wait for timeline to be created
    const setupHandlers = () => {
      const timelineBody = document.getElementById('timeline-body');
      const timelineContainer = document.getElementById('timeline-container');

      if (!timelineBody && !timelineContainer) {
        // Retry after a short delay
        setTimeout(setupHandlers, 100);
        return;
      }

      // Add drop handlers to timeline body
      if (timelineBody) {
        timelineBody.addEventListener('dragover', handleTimelineDragOver, true);
        timelineBody.addEventListener('dragleave', handleTimelineDragLeave, true);
        timelineBody.addEventListener('drop', handleTimelineDrop, true);
      }

      // Also add to timeline container for better coverage
      if (timelineContainer) {
        timelineContainer.addEventListener('dragover', handleTimelineDragOver, true);
        timelineContainer.addEventListener('drop', handleTimelineDrop, true);
      }
    };

    // Start checking after a short delay for timeline to render
    setTimeout(setupHandlers, 200);
  }

  /**
   * Handle timeline dragover
   */
  function handleTimelineDragOver(e) {
    if (!e.dataTransfer.types.includes('Files')) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';

    const timelineBody = document.getElementById('timeline-body');
    if (timelineBody) {
      timelineBody.classList.add('drag-over');
    }
  }

  /**
   * Handle timeline dragleave
   */
  function handleTimelineDragLeave(e) {
    // Only remove class if leaving the timeline body entirely
    const timelineBody = document.getElementById('timeline-body');
    if (timelineBody && !e.relatedTarget?.closest('#timeline-body')) {
      timelineBody.classList.remove('drag-over');
    }
  }

  /**
   * Handle timeline drop
   */
  function handleTimelineDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const timelineBody = document.getElementById('timeline-body');
    if (timelineBody) {
      timelineBody.classList.remove('drag-over');
    }

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Get time position from drop location using vis-timeline
    let dropTime = state.currentTime;
    let dropTrackId = null;

    if (state.timelineInstance) {
      try {
        const props = state.timelineInstance.getEventProperties(e);
        if (props.time) {
          dropTime = props.time.getTime() / 1000;
        }
        if (props.group) {
          dropTrackId = props.group;
        }
      } catch (err) {
        console.warn('Could not get timeline drop position:', err);
      }
    }

    // Process each file
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Images dropped on timeline get centered on canvas
        if (typeof window.addImageToCanvas === 'function') {
          window.addImageToCanvas(file, null, null);
        }
      } else if (file.type.startsWith('video/')) {
        // Videos get placed at drop time
        if (typeof window.addVideoToCanvas === 'function') {
          window.addVideoToCanvas(file, null, null);
          // Note: addVideoToCanvas in App.vue handles timeline placement via state.currentTime
        }
      } else if (file.type.startsWith('audio/')) {
        // Audio goes to timeline only
        if (typeof window.addAudioToTimeline === 'function') {
          window.addAudioToTimeline(file);
        }
      }
    }
  }

  /**
   * Handle wheel events
   */
  function handleWheel(e) {
    if (!canvas) return;
    if (e.target.closest('.floating-panel, .popup-panel, .toolbar')) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      if (config.zoom?.enableGestures === false) return;

      if (typeof window.setZoom === 'function') {
        window.setZoom(
          state.zoom + (e.deltaY > 0 ? -(config.zoom?.step || 0.05) : (config.zoom?.step || 0.05)),
          e.clientX,
          e.clientY
        );
      }

      if (typeof window.updateTextEditorPosition === 'function') {
        window.updateTextEditorPosition();
      }
    } else {
      // Scroll/pan
      if (config.scroll?.enableGestures === false) return;

      // In video mode, allow scroll when zoomed in beyond 1x, otherwise check config
      const allowVideoModeScroll = state.videoMode && state.zoom > 1;
      if (state.videoMode && !allowVideoModeScroll && config.video?.disableScroll !== false) return;

      const displayScale = state.canvasDisplayScale || 1;
      state.panX -= e.deltaX / displayScale;
      state.panY -= e.deltaY / displayScale;

      // In video mode when zoomed in, constrain pan to export frame boundaries
      if (state.videoMode && state.zoom > 1) {
        const minPanX = canvas.width - canvas.width * state.zoom;
        const maxPanX = 0;
        const minPanY = canvas.height - canvas.height * state.zoom;
        const maxPanY = 0;

        state.panX = Math.max(minPanX, Math.min(maxPanX, state.panX));
        state.panY = Math.max(minPanY, Math.min(maxPanY, state.panY));
      }

      render();

      if (typeof window.updateScrollToContentButton === 'function') {
        window.updateScrollToContentButton();
      }
      if (typeof window.updateTextEditorPosition === 'function') {
        window.updateTextEditorPosition();
      }
    }
  }

  // NOTE: handleKeyDown removed - now handled by useKeyboard composable

  /**
   * Handle key up
   */
  function handleKeyUp(e) {
    if (e.code === 'Space') {
      state.spacePressed = false;
      wrapper?.classList.remove('mode-hand');
    }
  }

  /**
   * Handle touch start
   */
  function handleTouchStart(e) {
    if (!canvas) return;
    if (e.target.closest('.floating-panel, .popup-panel, .toolbar')) return;

    if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      if (config.pan?.enableGestures !== false || config.scroll?.enableGestures !== false) {
        state.isPanning = true;
        isPanning.value = true;
      }
    } else if (e.touches.length === 1) {
      handleMouseDown({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        button: 0,
        target: e.target,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false
      });
    }
  }

  /**
   * Handle touch move
   */
  function handleTouchMove(e) {
    if (!canvas) return;
    if (e.target.closest('.floating-panel, .popup-panel, .toolbar')) return;
    e.preventDefault();

    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      // Pinch zoom
      if (lastTouchDist && config.zoom?.enableGestures !== false) {
        if (typeof window.setZoom === 'function') {
          window.setZoom(state.zoom * (1 + (dist / lastTouchDist - 1) * 0.3), cx, cy);
        }
      }

      // Two-finger pan
      if (lastTouchCenter && config.scroll?.enableGestures !== false) {
        const displayScale = state.canvasDisplayScale || 1;
        state.panX += (cx - lastTouchCenter.x) / displayScale;
        state.panY += (cy - lastTouchCenter.y) / displayScale;

        // In video mode when zoomed in, constrain pan to export frame boundaries
        if (state.videoMode && state.zoom > 1 && canvas) {
          const minPanX = canvas.width - canvas.width * state.zoom;
          const maxPanX = 0;
          const minPanY = canvas.height - canvas.height * state.zoom;
          const maxPanY = 0;

          state.panX = Math.max(minPanX, Math.min(maxPanX, state.panX));
          state.panY = Math.max(minPanY, Math.min(maxPanY, state.panY));
        }

        render();
      }

      lastTouchDist = dist;
      lastTouchCenter = { x: cx, y: cy };
    } else if (e.touches.length === 1) {
      handleMouseMove({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        target: e.target
      });
    }
  }

  /**
   * Handle touch end
   */
  function handleTouchEnd(e) {
    if (!canvas) return;
    if (e.touches.length < 2) {
      state.isPanning = false;
      isPanning.value = false;
      lastTouchDist = 0;
      lastTouchCenter = null;
    }
    if (e.touches.length === 0) {
      handleMouseUp({ clientX: state.lastX, clientY: state.lastY });
    }
  }

  // Helper functions

  /**
   * Get snap points - uses snapGuides composable
   */
  function getSnapPoints() {
    return snapGuides.getSnapPoints(state.selectedIndices);
  }

  /**
   * Check if snapping is enabled
   */
  function isSnappingEnabled() {
    return state.snapEnabled !== false && config.snap?.enabled !== false;
  }

  /**
   * Find snap offset - uses snapGuides composable
   */
  function findSnapOffset(bounds) {
    const result = snapGuides.findSnapOffset(bounds, state.selectedIndices);
    // Update state with active snap lines for rendering
    state.activeSnapLines = result.snapLines;
    return { dx: result.dx, dy: result.dy };
  }

  /**
   * Get shapes in selection rectangle
   */
  function getShapesInRect(x1, y1, x2, y2) {
    if (typeof window.getShapesInRect === 'function') {
      return window.getShapesInRect(x1, y1, x2, y2);
    }

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const result = [];

    state.shapes.forEach((shape, i) => {
      if (shape.visible === false) return;
      const b = getShapeBounds(shape, config, ctx);
      if (b && b.x >= minX && b.x + b.width <= maxX && b.y >= minY && b.y + b.height <= maxY) {
        result.push(i);
      }
    });

    return result;
  }

  /**
   * Draw tool preview with RoughJS support
   * Uses the renderer's drawToolPreviewToContext for consistent sketchy rendering
   */
  function drawToolPreview(x1, y1, x2, y2) {
    if (!ctx) return;

    // Get the renderer instance to access RoughJS canvas and preview function
    const renderer = getRenderer();
    if (renderer && renderer.drawToolPreviewToContext) {
      // Use the RoughJS-aware preview function from renderer
      // Pass rc.value for sketchy rendering on main canvas
      renderer.drawToolPreviewToContext(ctx, renderer.rc.value, x1, y1, x2, y2);
    }
  }

  /**
   * Create shape from drawing
   */
  function createShape(x1, y1, x2, y2) {
    const tool = state.currentTool;

    // Skip if too small
    const minSize = 5;
    if (tool !== 'line' && tool !== 'arrow') {
      if (Math.abs(x2 - x1) < minSize && Math.abs(y2 - y1) < minSize) return;
    }

    let shape = null;

    switch (tool) {
      case 'rect':
        shape = {
          id: generateId(),
          type: 'rect',
          name: 'Rectangle',
          visible: true,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          color: state.currentColor,
          fillColor: state.currentFill,
          lineWidth: state.currentSize,
          opacity: state.currentOpacity,
          roughness: state.currentRoughness || 1,
          strokeStyle: state.currentStrokeStyle || 'solid',
          edgeStyle: state.currentEdgeStyle || 'sharp',
          seed: Math.floor(Math.random() * 2147483647)
        };
        break;

      case 'ellipse':
      case 'circle':
        shape = {
          id: generateId(),
          type: 'ellipse',
          name: 'Ellipse',
          visible: true,
          x: (x1 + x2) / 2,
          y: (y1 + y2) / 2,
          radiusX: Math.abs(x2 - x1) / 2,
          radiusY: Math.abs(y2 - y1) / 2,
          color: state.currentColor,
          fillColor: state.currentFill,
          lineWidth: state.currentSize,
          opacity: state.currentOpacity,
          roughness: state.currentRoughness || 1,
          strokeStyle: state.currentStrokeStyle || 'solid',
          seed: Math.floor(Math.random() * 2147483647)
        };
        break;

      case 'diamond':
        shape = {
          id: generateId(),
          type: 'diamond',
          name: 'Diamond',
          visible: true,
          x: (x1 + x2) / 2,
          y: (y1 + y2) / 2,
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          color: state.currentColor,
          fillColor: state.currentFill,
          lineWidth: state.currentSize,
          opacity: state.currentOpacity,
          roughness: state.currentRoughness || 1,
          strokeStyle: state.currentStrokeStyle || 'solid',
          seed: Math.floor(Math.random() * 2147483647)
        };
        break;

      case 'triangle':
        shape = {
          id: generateId(),
          type: 'triangle',
          name: 'Triangle',
          visible: true,
          x1: (Math.min(x1, x2) + Math.max(x1, x2)) / 2,
          y1: Math.min(y1, y2),
          x2: Math.max(x1, x2),
          y2: Math.max(y1, y2),
          x3: Math.min(x1, x2),
          y3: Math.max(y1, y2),
          color: state.currentColor,
          fillColor: state.currentFill,
          lineWidth: state.currentSize,
          opacity: state.currentOpacity,
          roughness: state.currentRoughness || 1,
          strokeStyle: state.currentStrokeStyle || 'solid',
          seed: Math.floor(Math.random() * 2147483647)
        };
        break;

      case 'line':
        shape = {
          id: generateId(),
          type: 'line',
          name: 'Line',
          visible: true,
          x1, y1, x2, y2,
          color: state.currentColor,
          lineWidth: state.currentSize,
          opacity: state.currentOpacity,
          roughness: state.currentRoughness || 1,
          strokeStyle: state.currentStrokeStyle || 'solid',
          curveType: state.currentCurveType || 'straight',
          seed: Math.floor(Math.random() * 2147483647)
        };
        // Add control point for curved lines
        if (state.currentCurveType === 'curved') {
          shape.controlPoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        }
        break;

      case 'arrow':
        shape = {
          id: generateId(),
          type: 'arrow',
          name: 'Arrow',
          visible: true,
          x1, y1, x2, y2,
          color: state.currentColor,
          lineWidth: state.currentSize,
          opacity: state.currentOpacity,
          roughness: state.currentRoughness || 1,
          strokeStyle: state.currentStrokeStyle || 'solid',
          curveType: state.currentCurveType || 'straight',
          arrowType: state.currentArrowType || 'single',
          arrowHeadStyle: state.currentArrowHeadStyle || 'triangle',
          arrowHeadSize: state.currentArrowHeadSize || 'medium',
          seed: Math.floor(Math.random() * 2147483647)
        };
        if (state.currentCurveType === 'curved') {
          shape.controlPoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        }
        break;

      case 'pen':
        if (state.currentFreehand && state.currentFreehand.points.length > 1) {
          shape = state.currentFreehand;
          state.currentFreehand = null;
        }
        break;

      case 'frame':
        shape = {
          id: generateId(),
          type: 'frame',
          name: 'Frame',
          visible: true,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1) || config.frame?.defaultWidth || 400,
          height: Math.abs(y2 - y1) || config.frame?.defaultHeight || 300,
          children: [],
          clipContent: config.frame?.clipContent !== false
        };
        break;
    }

    if (shape) {
      // In video mode, assign track and timing using the composable
      if (state.videoMode) {
        const startTime = state.currentTime || 0;
        const duration = config.video?.defaultClipDuration || 5;

        // Use composable to find available track (handles overlap detection and track creation)
        const videoState = getVideoState();
        const trackId = videoState.findAvailableTrack(startTime, duration);

        shape.trackId = trackId;
        shape.startTime = startTime;
        shape.duration = duration;

        // Update timeline groups in case a new track was created
        if (typeof window.updateTimelineGroups === 'function') {
          window.updateTimelineGroups();
        }
      }

      state.shapes.push(shape);
      state.selectedIndices = [state.shapes.length - 1];

      saveState();
      render();
      renderLayersList();

      if (typeof window.showOptionsBar === 'function') {
        window.showOptionsBar();
      }

      // Update timeline in video mode
      if (state.videoMode && typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }

      // Auto-switch back to select tool
      if (config.tools?.autoSwitchToSelect !== false && tool !== 'pen') {
        setTool('select');
      }
    }
  }

  // Lifecycle hooks
  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    removeEventListeners();
  });

  // Expose globally for legacy compatibility
  if (typeof window !== 'undefined') {
    window.handleMouseDown = handleMouseDown;
    window.handleMouseMove = handleMouseMove;
    window.handleMouseUp = handleMouseUp;
    window.handleContextMenu = handleContextMenu;
    window.handleWheel = handleWheel;
    window.handleKeyUp = handleKeyUp;
    window.handleTouchStart = handleTouchStart;
    window.handleTouchMove = handleTouchMove;
    window.handleTouchEnd = handleTouchEnd;

    // Expose screenToCanvas for context menu and other UI components
    window.screenToCanvas = (clientX, clientY) => {
      const canvas = document.getElementById('drawing-canvas');
      return screenToCanvas(clientX, clientY, state, canvas);
    };

    // Expose cursor keyframe functions
    window.deleteCursorKeyframe = deleteCursorKeyframe;
  }

  return {
    // State refs
    isDragging,
    isPanning,
    isResizing,
    isRotating,
    isSelecting,
    isDrawing,

    // Methods
    init,
    setupEventListeners,
    removeEventListeners,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    setupTimelineDropHandlers,
    updateAllConnectedArrows,
    deleteCursorKeyframe
  };
}

// Singleton instance
let interactionsInstance = null;

/**
 * Get or create interactions instance
 */
export function getInteractions() {
  if (!interactionsInstance) {
    interactionsInstance = useInteractions();
  }
  return interactionsInstance;
}

export default useInteractions;
