// editor/composables/useVectorEdit.js
// Vector editing composable - handles direct path manipulation using Paper.js

import { ref, computed } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getShapeBounds } from '../utils/geometry.js';
import { generateId } from '../utils/shapes.js';
import { applyInverseTiltTransform } from '../utils/hitTesting.js';

// Shape types that support vector editing
const vectorEditableTypes = ['rect', 'circle', 'ellipse', 'diamond', 'triangle', 'path', 'freehand'];

// Paper.js initialization state
let paperInitialized = false;

/**
 * Vector editing composable
 * Provides direct path point/handle manipulation using Paper.js
 */
export function useVectorEdit() {
  const { state, config } = getEditorState();
  const { saveState } = getHistory();

  // Local state refs
  const isEditing = ref(false);
  const editIndex = ref(-1);
  const editPath = ref(null);
  const activeSegmentIndex = ref(-1);
  const activeHandleType = ref(null);
  const isDragging = ref(false);

  // Group child editing state
  const editGroupIndex = ref(-1);
  const editChildIndex = ref(-1);

  // Frame child editing state
  const editFrameIndex = ref(-1);
  const editFrameChildIndex = ref(-1);

  // Drag state
  let dragStart = null;
  let dragOriginal = null;
  let editRotation = 0;
  let editCenter = null;
  let editTiltX = 0;
  let editTiltY = 0;

  /**
   * Initialize Paper.js (called once)
   */
  function initPaper() {
    if (paperInitialized || typeof paper === 'undefined') return false;
    paper.setup(document.createElement('canvas'));
    paperInitialized = true;
    return true;
  }

  /**
   * Check if a shape type supports vector editing
   */
  function isVectorEditable(shapeType) {
    return vectorEditableTypes.includes(shapeType);
  }

  /**
   * Get shape center for rotation calculations
   */
  function getShapeCenter(shape) {
    const bounds = getShapeBounds(shape, config);
    if (bounds) {
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      };
    }
    return { x: 0, y: 0 };
  }

  /**
   * Convert a shape to a Paper.js Path
   */
  function shapeToPaperPath(shape) {
    if (!initPaper() && !paperInitialized) return null;

    let path;

    switch (shape.type) {
      case 'rect':
        path = new paper.Path.Rectangle({
          point: [shape.x, shape.y],
          size: [shape.width, shape.height]
        });
        break;

      case 'circle':
        path = new paper.Path.Circle({
          center: [shape.x, shape.y],
          radius: shape.radius
        });
        break;

      case 'ellipse':
        path = new paper.Path.Ellipse({
          center: [shape.x, shape.y],
          radius: [shape.radiusX || shape.radius, shape.radiusY || shape.radius]
        });
        break;

      case 'diamond': {
        const dw = shape.width / 2;
        const dh = shape.height / 2;
        path = new paper.Path({
          segments: [
            [shape.x, shape.y - dh],
            [shape.x + dw, shape.y],
            [shape.x, shape.y + dh],
            [shape.x - dw, shape.y]
          ],
          closed: true
        });
        break;
      }

      case 'triangle':
        if (shape.x1 !== undefined) {
          path = new paper.Path({
            segments: [
              [shape.x1, shape.y1],
              [shape.x2, shape.y2],
              [shape.x3, shape.y3]
            ],
            closed: true
          });
        }
        break;

      case 'path':
        path = new paper.Path();
        if (shape.segments) {
          shape.segments.forEach(seg => {
            if (seg.handleIn && seg.handleOut) {
              path.add(new paper.Segment(
                new paper.Point(seg.point[0], seg.point[1]),
                new paper.Point(seg.handleIn[0], seg.handleIn[1]),
                new paper.Point(seg.handleOut[0], seg.handleOut[1])
              ));
            } else {
              path.add(new paper.Point(seg.point[0], seg.point[1]));
            }
          });
          path.closed = shape.closed !== false;
        }
        break;

      case 'freehand':
        if (shape.points) {
          path = new paper.Path();
          shape.points.forEach(p => {
            path.add(new paper.Point(p.x, p.y));
          });
          path.smooth({ type: 'catmull-rom', factor: 0.5 });
        }
        break;

      default:
        return null;
    }

    return path;
  }

  /**
   * Convert a Paper.js Path back to a shape
   */
  function paperPathToShape(paperPath, sourceShape) {
    if (!paperPath || paperPath.isEmpty()) {
      return null;
    }

    // Handle CompoundPath (result of subtract/exclude with holes)
    if (paperPath.className === 'CompoundPath') {
      const children = [];
      paperPath.children.forEach(childPath => {
        if (childPath.segments && childPath.segments.length > 0) {
          const segments = [];
          childPath.segments.forEach(seg => {
            const segData = {
              point: [seg.point.x, seg.point.y]
            };
            if (seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0)) {
              segData.handleIn = [seg.handleIn.x, seg.handleIn.y];
            }
            if (seg.handleOut && (seg.handleOut.x !== 0 || seg.handleOut.y !== 0)) {
              segData.handleOut = [seg.handleOut.x, seg.handleOut.y];
            }
            segments.push(segData);
          });
          children.push({
            segments: segments,
            closed: childPath.closed
          });
        }
      });

      if (children.length === 0) return null;

      return {
        id: generateId(),
        type: 'path',
        name: 'Path',
        children: children,
        isCompound: true,
        color: sourceShape.color || '#1e1e1e',
        fillColor: sourceShape.fillColor || sourceShape.color || '#1e1e1e',
        lineWidth: sourceShape.lineWidth || 2,
        opacity: sourceShape.opacity || 100,
        visible: true,
        strokeStyle: sourceShape.strokeStyle || 'solid',
        roughness: sourceShape.roughness ?? 1,
        seed: sourceShape.seed || 1,
        edgeStyle: sourceShape.edgeStyle || 'sharp'
      };
    }

    // Handle simple Path
    if (!paperPath.segments || paperPath.segments.length === 0) {
      return null;
    }

    const segments = [];
    paperPath.segments.forEach(seg => {
      const segData = {
        point: [seg.point.x, seg.point.y]
      };
      if (seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0)) {
        segData.handleIn = [seg.handleIn.x, seg.handleIn.y];
      }
      if (seg.handleOut && (seg.handleOut.x !== 0 || seg.handleOut.y !== 0)) {
        segData.handleOut = [seg.handleOut.x, seg.handleOut.y];
      }
      segments.push(segData);
    });

    return {
      id: generateId(),
      type: 'path',
      name: 'Path',
      segments: segments,
      closed: paperPath.closed,
      color: sourceShape.color || '#1e1e1e',
      fillColor: sourceShape.fillColor || sourceShape.color || '#1e1e1e',
      lineWidth: sourceShape.lineWidth || 2,
      opacity: sourceShape.opacity || 100,
      visible: true,
      strokeStyle: sourceShape.strokeStyle || 'solid',
      roughness: sourceShape.roughness ?? 1,
      seed: sourceShape.seed || 1,
      edgeStyle: sourceShape.edgeStyle || 'sharp'
    };
  }

  /**
   * Enter vector edit mode for a shape
   */
  function enterVectorEditMode(shapeIndex) {
    const shape = state.shapes[shapeIndex];
    if (!shape || !isVectorEditable(shape.type)) return false;

    if (!initPaper() && !paperInitialized) {
      console.warn('Paper.js not available for vector editing');
      return false;
    }

    // Convert shape to Paper.js path
    const paperPath = shapeToPaperPath(shape);
    if (!paperPath) {
      return false;
    }

    // Update state
    isEditing.value = true;
    editIndex.value = shapeIndex;
    editPath.value = paperPath;
    editRotation = shape.rotation || 0;
    editTiltX = shape.tiltX || 0;
    editTiltY = shape.tiltY || 0;
    editCenter = getShapeCenter(shape);
    activeSegmentIndex.value = -1;
    activeHandleType.value = null;

    // Update global state
    state.isVectorEditing = true;
    state.vectorEditIndex = shapeIndex;
    state.vectorEditPath = paperPath;
    state.vectorEditRotation = editRotation;
    state.vectorEditTiltX = editTiltX;
    state.vectorEditTiltY = editTiltY;
    state.vectorEditCenter = editCenter;
    state.activeSegmentIndex = -1;
    state.activeHandleType = null;
    state.selectedIndices = [shapeIndex];

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Enter vector edit mode for a group child
   */
  function enterVectorEditModeForGroupChild(groupIndex, childIndex) {
    const group = state.shapes[groupIndex];
    const child = group?.children?.[childIndex];
    if (!child || !isVectorEditable(child.type)) return false;

    if (!initPaper() && !paperInitialized) {
      console.warn('Paper.js not available for vector editing');
      return false;
    }

    // Convert child shape to Paper.js path
    const paperPath = shapeToPaperPath(child);
    if (!paperPath) {
      return false;
    }

    // Update state
    isEditing.value = true;
    editIndex.value = -1; // Not a top-level shape
    editGroupIndex.value = groupIndex;
    editChildIndex.value = childIndex;
    editPath.value = paperPath;
    editRotation = (child.rotation || 0) + (group.rotation || 0);
    editTiltX = (child.tiltX || 0) + (group.tiltX || 0);
    editTiltY = (child.tiltY || 0) + (group.tiltY || 0);
    editCenter = getShapeCenter(child);
    activeSegmentIndex.value = -1;
    activeHandleType.value = null;

    // Update global state
    state.isVectorEditing = true;
    state.vectorEditIndex = -1;
    state.vectorEditGroupIndex = groupIndex;
    state.vectorEditChildIndex = childIndex;
    state.vectorEditPath = paperPath;
    state.vectorEditRotation = editRotation;
    state.vectorEditTiltX = editTiltX;
    state.vectorEditTiltY = editTiltY;
    state.vectorEditCenter = editCenter;
    state.activeSegmentIndex = -1;
    state.activeHandleType = null;

    // Keep the group child selected
    state.selectedGroupChildren = [{ groupIndex, childIndex }];

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Enter vector edit mode for a frame child
   */
  function enterVectorEditModeForFrameChild(frameIndex, childIndex) {
    const frame = state.shapes[frameIndex];
    const child = frame?.children?.[childIndex];
    if (!child || !isVectorEditable(child.type)) return false;

    if (!initPaper() && !paperInitialized) {
      console.warn('Paper.js not available for vector editing');
      return false;
    }

    // Convert child shape to Paper.js path
    const paperPath = shapeToPaperPath(child);
    if (!paperPath) {
      return false;
    }

    // Update state
    isEditing.value = true;
    editIndex.value = -1; // Not a top-level shape
    editFrameIndex.value = frameIndex;
    editFrameChildIndex.value = childIndex;
    editGroupIndex.value = -1;
    editChildIndex.value = -1;
    editPath.value = paperPath;
    editRotation = (child.rotation || 0) + (frame.rotation || 0);
    editTiltX = (child.tiltX || 0) + (frame.tiltX || 0);
    editTiltY = (child.tiltY || 0) + (frame.tiltY || 0);
    editCenter = getShapeCenter(child);
    activeSegmentIndex.value = -1;
    activeHandleType.value = null;

    // Update global state
    state.isVectorEditing = true;
    state.vectorEditIndex = -1;
    state.vectorEditFrameIndex = frameIndex;
    state.vectorEditFrameChildIndex = childIndex;
    state.vectorEditGroupIndex = -1;
    state.vectorEditChildIndex = -1;
    state.vectorEditPath = paperPath;
    state.vectorEditRotation = editRotation;
    state.vectorEditTiltX = editTiltX;
    state.vectorEditTiltY = editTiltY;
    state.vectorEditCenter = editCenter;
    state.activeSegmentIndex = -1;
    state.activeHandleType = null;

    // Keep the frame child selected
    state.selectedFrameChildren = [{ frameIndex, childIndex }];

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Exit vector edit mode
   */
  function exitVectorEditMode(saveChanges = true) {
    if (!isEditing.value) return;

    // Check if editing a frame child
    if (editFrameIndex.value >= 0 && editFrameChildIndex.value >= 0 && saveChanges) {
      const frame = state.shapes[editFrameIndex.value];
      const originalChild = frame?.children?.[editFrameChildIndex.value];
      if (originalChild) {
        const newShape = paperPathToShape(editPath.value, originalChild);
        if (newShape) {
          newShape.id = originalChild.id;
          newShape.name = originalChild.name || 'Path';
          newShape.rotation = originalChild.rotation;
          newShape.tiltX = originalChild.tiltX;
          newShape.tiltY = originalChild.tiltY;
          frame.children[editFrameChildIndex.value] = newShape;
          saveState();
        }
      }
    }

    // Check if editing a group child
    if (editGroupIndex.value >= 0 && editChildIndex.value >= 0) {
      if (saveChanges && editPath.value) {
        const group = state.shapes[editGroupIndex.value];
        const originalChild = group?.children?.[editChildIndex.value];
        if (originalChild) {
          const newShape = paperPathToShape(editPath.value, originalChild);
          if (newShape) {
            newShape.id = originalChild.id;
            newShape.name = originalChild.name || 'Path';
            newShape.rotation = originalChild.rotation;
            newShape.tiltX = originalChild.tiltX;
            newShape.tiltY = originalChild.tiltY;
            group.children[editChildIndex.value] = newShape;
            saveState();
          }
        }
      }

      // Clean up Paper.js path
      if (editPath.value) {
        editPath.value.remove();
      }

      // Reset local state
      isEditing.value = false;
      editIndex.value = -1;
      editGroupIndex.value = -1;
      editChildIndex.value = -1;
      editFrameIndex.value = -1;
      editFrameChildIndex.value = -1;
      editPath.value = null;
      editRotation = 0;
      editTiltX = 0;
      editTiltY = 0;
      editCenter = null;
      activeSegmentIndex.value = -1;
      activeHandleType.value = null;
      isDragging.value = false;

      // Reset global state
      state.isVectorEditing = false;
      state.vectorEditIndex = -1;
      state.vectorEditGroupIndex = -1;
      state.vectorEditChildIndex = -1;
      state.vectorEditFrameIndex = -1;
      state.vectorEditFrameChildIndex = -1;
      state.vectorEditPath = null;
      state.vectorEditRotation = 0;
      state.vectorEditTiltX = 0;
      state.vectorEditTiltY = 0;
      state.vectorEditCenter = null;
      state.activeSegmentIndex = -1;
      state.activeHandleType = null;
      state.isDraggingVectorPoint = false;

      if (typeof window.render === 'function') {
        window.render();
      }
      if (typeof window.renderLayersList === 'function') {
        window.renderLayersList();
      }
      return;
    }

    if (saveChanges && editPath.value && editIndex.value >= 0) {
      // Convert Paper.js path back to shape format
      const originalShape = state.shapes[editIndex.value];
      const newShape = paperPathToShape(editPath.value, originalShape);

      if (newShape) {
        // Preserve original shape properties
        newShape.id = originalShape.id;
        newShape.name = originalShape.name || 'Path';
        newShape.rotation = originalShape.rotation;
        newShape.tiltX = originalShape.tiltX;
        newShape.tiltY = originalShape.tiltY;
        state.shapes[editIndex.value] = newShape;
        saveState();
      }
    }

    // Clean up Paper.js path
    if (editPath.value) {
      editPath.value.remove();
    }

    // Reset local state
    isEditing.value = false;
    editIndex.value = -1;
    editGroupIndex.value = -1;
    editChildIndex.value = -1;
    editFrameIndex.value = -1;
    editFrameChildIndex.value = -1;
    editPath.value = null;
    editRotation = 0;
    editTiltX = 0;
    editTiltY = 0;
    editCenter = null;
    activeSegmentIndex.value = -1;
    activeHandleType.value = null;
    isDragging.value = false;

    // Reset global state
    state.isVectorEditing = false;
    state.vectorEditIndex = -1;
    state.vectorEditGroupIndex = -1;
    state.vectorEditChildIndex = -1;
    state.vectorEditFrameIndex = -1;
    state.vectorEditFrameChildIndex = -1;
    state.vectorEditPath = null;
    state.vectorEditRotation = 0;
    state.vectorEditTiltX = 0;
    state.vectorEditTiltY = 0;
    state.vectorEditCenter = null;
    state.activeSegmentIndex = -1;
    state.activeHandleType = null;
    state.isDraggingVectorPoint = false;

    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  /**
   * Hit test for vector edit points and handles
   * Returns { segmentIndex, type } or null
   */
  function hitTestVectorEdit(x, y) {
    if (!isEditing.value || !editPath.value) return null;

    const tolerance = (config.vectorEdit?.hitTolerance || 10) / state.zoom;

    // Transform the test point - apply inverse transforms in reverse order
    let testX = x, testY = y;

    if (editCenter) {
      // 1. Tilt inverse FIRST (applied last in forward)
      if (editTiltX || editTiltY) {
        const transformed = applyInverseTiltTransform(testX, testY, editCenter.x, editCenter.y, editTiltX, editTiltY);
        testX = transformed.x;
        testY = transformed.y;
      }

      // 2. Rotation inverse
      if (editRotation) {
        const angle = -editRotation;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = testX - editCenter.x;
        const dy = testY - editCenter.y;
        testX = editCenter.x + dx * cos - dy * sin;
        testY = editCenter.y + dx * sin + dy * cos;
      }
    }

    // Check each segment
    for (let i = 0; i < editPath.value.segments.length; i++) {
      const seg = editPath.value.segments[i];

      // Check handleIn (if it exists and is not zero)
      if (seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0)) {
        const handleInPos = seg.point.add(seg.handleIn);
        if (Math.abs(testX - handleInPos.x) <= tolerance && Math.abs(testY - handleInPos.y) <= tolerance) {
          return { segmentIndex: i, type: 'handleIn' };
        }
      }

      // Check handleOut (if it exists and is not zero)
      if (seg.handleOut && (seg.handleOut.x !== 0 || seg.handleOut.y !== 0)) {
        const handleOutPos = seg.point.add(seg.handleOut);
        if (Math.abs(testX - handleOutPos.x) <= tolerance && Math.abs(testY - handleOutPos.y) <= tolerance) {
          return { segmentIndex: i, type: 'handleOut' };
        }
      }

      // Check anchor point (check this last so handles take priority when overlapping)
      if (Math.abs(testX - seg.point.x) <= tolerance && Math.abs(testY - seg.point.y) <= tolerance) {
        return { segmentIndex: i, type: 'point' };
      }
    }

    // Check if clicking on the path curve itself (to add a point)
    const hitResult = editPath.value.hitTest(new paper.Point(testX, testY), {
      stroke: true,
      curves: true,
      tolerance: tolerance
    });

    if (hitResult && hitResult.type === 'curve') {
      return { type: 'curve', location: hitResult.location };
    }

    return null;
  }

  /**
   * Add a point to the path at a curve location
   */
  function addVectorPoint(location) {
    if (!isEditing.value || !editPath.value || !location) return;

    const newSegment = editPath.value.divideAt(location);
    if (newSegment) {
      activeSegmentIndex.value = newSegment.index;
      activeHandleType.value = 'point';
      state.activeSegmentIndex = newSegment.index;
      state.activeHandleType = 'point';

      if (typeof window.render === 'function') {
        window.render();
      }
    }
  }

  /**
   * Delete the selected segment
   */
  function deleteVectorPoint() {
    if (!isEditing.value || !editPath.value || activeSegmentIndex.value < 0) return;

    // Don't delete if path would have less than 2 points
    if (editPath.value.segments.length <= 2) return;

    editPath.value.segments[activeSegmentIndex.value].remove();
    activeSegmentIndex.value = -1;
    activeHandleType.value = null;
    state.activeSegmentIndex = -1;
    state.activeHandleType = null;

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Start dragging a vector point or handle
   */
  function startVectorDrag(x, y, hit) {
    isDragging.value = true;
    activeSegmentIndex.value = hit.segmentIndex;
    activeHandleType.value = hit.type;
    dragStart = { x, y };

    // Store original positions for smooth dragging
    const seg = editPath.value.segments[hit.segmentIndex];
    dragOriginal = {
      point: { x: seg.point.x, y: seg.point.y },
      handleIn: seg.handleIn ? { x: seg.handleIn.x, y: seg.handleIn.y } : null,
      handleOut: seg.handleOut ? { x: seg.handleOut.x, y: seg.handleOut.y } : null
    };

    // Update global state
    state.isDraggingVectorPoint = true;
    state.activeSegmentIndex = hit.segmentIndex;
    state.activeHandleType = hit.type;
    state.vectorDragStart = dragStart;
    state.vectorDragOriginal = dragOriginal;
  }

  /**
   * Update vector point/handle position during drag
   */
  function updateVectorDrag(x, y) {
    if (!isDragging.value || !editPath.value || activeSegmentIndex.value < 0) return;

    const seg = editPath.value.segments[activeSegmentIndex.value];
    let dx = x - dragStart.x;
    let dy = y - dragStart.y;

    // Transform the delta - apply inverse transforms in reverse order
    // 1. Tilt inverse FIRST (applied last in forward)
    if (editTiltX || editTiltY) {
      // Apply inverse tilt to the delta (transform from screen space to local space)
      const scaleX = Math.max(0.1, Math.cos(editTiltX));
      const scaleY = Math.max(0.1, Math.cos(editTiltY));
      const skewX = Math.sin(editTiltX) * 0.5;
      const skewY = Math.sin(editTiltY) * 0.5;

      // Combined matrix inverse for delta
      const a = scaleY, b = skewX * scaleX, c = skewY * scaleY, d = scaleX;
      const det = a * d - b * c;
      if (Math.abs(det) > 0.001) {
        const invDet = 1 / det;
        const newDx = invDet * (d * dx - b * dy);
        const newDy = invDet * (-c * dx + a * dy);
        dx = newDx;
        dy = newDy;
      }
    }

    // 2. Rotation inverse
    if (editRotation) {
      const angle = -editRotation;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotatedDx = dx * cos - dy * sin;
      const rotatedDy = dx * sin + dy * cos;
      dx = rotatedDx;
      dy = rotatedDy;
    }

    switch (activeHandleType.value) {
      case 'point':
        seg.point.x = dragOriginal.point.x + dx;
        seg.point.y = dragOriginal.point.y + dy;
        break;

      case 'handleIn':
        seg.handleIn.x = dragOriginal.handleIn.x + dx;
        seg.handleIn.y = dragOriginal.handleIn.y + dy;
        break;

      case 'handleOut':
        seg.handleOut.x = dragOriginal.handleOut.x + dx;
        seg.handleOut.y = dragOriginal.handleOut.y + dy;
        break;
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * End vector drag
   */
  function endVectorDrag() {
    isDragging.value = false;
    dragStart = null;
    dragOriginal = null;

    state.isDraggingVectorPoint = false;
    state.vectorDragStart = null;
    state.vectorDragOriginal = null;
  }

  /**
   * Convert smooth point to corner point (remove handles)
   */
  function convertToCorner() {
    if (!isEditing.value || !editPath.value || activeSegmentIndex.value < 0) return;

    const seg = editPath.value.segments[activeSegmentIndex.value];
    seg.handleIn = new paper.Point(0, 0);
    seg.handleOut = new paper.Point(0, 0);

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Convert corner point to smooth point (add handles)
   */
  function convertToSmooth() {
    if (!isEditing.value || !editPath.value || activeSegmentIndex.value < 0) return;

    const seg = editPath.value.segments[activeSegmentIndex.value];
    seg.smooth({ type: 'catmull-rom' });

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  // Expose globally for legacy compatibility
  if (typeof window !== 'undefined') {
    window.enterVectorEditMode = enterVectorEditMode;
    window.enterVectorEditModeForFrameChild = enterVectorEditModeForFrameChild;
    window.enterVectorEditModeForGroupChild = enterVectorEditModeForGroupChild;
    window.exitVectorEditMode = exitVectorEditMode;
    window.hitTestVectorEdit = hitTestVectorEdit;
    window.addVectorPoint = addVectorPoint;
    window.deleteVectorPoint = deleteVectorPoint;
    window.startVectorDrag = startVectorDrag;
    window.updateVectorDrag = updateVectorDrag;
    window.endVectorDrag = endVectorDrag;
    window.convertToCorner = convertToCorner;
    window.convertToSmooth = convertToSmooth;
    window.shapeToPaperPath = shapeToPaperPath;
    window.paperPathToShape = paperPathToShape;
    window.initPaper = initPaper;
  }

  return {
    // State refs
    isEditing,
    editIndex,
    editGroupIndex,
    editChildIndex,
    editPath,
    activeSegmentIndex,
    activeHandleType,
    isDragging,

    // Methods
    initPaper,
    isVectorEditable,
    enterVectorEditMode,
    enterVectorEditModeForGroupChild,
    enterVectorEditModeForFrameChild,
    exitVectorEditMode,
    hitTestVectorEdit,
    addVectorPoint,
    deleteVectorPoint,
    startVectorDrag,
    updateVectorDrag,
    endVectorDrag,
    convertToCorner,
    convertToSmooth,
    shapeToPaperPath,
    paperPathToShape
  };
}

// Singleton instance
let vectorEditInstance = null;

/**
 * Get or create vector edit instance
 */
export function getVectorEdit() {
  if (!vectorEditInstance) {
    vectorEditInstance = useVectorEdit();
  }
  return vectorEditInstance;
}

export default useVectorEdit;
