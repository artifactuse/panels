// editor/composables/useFrameChildren.js
// Frame children composable - handles interactions with shapes inside frames

import { ref, computed } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getShapeBounds } from '../utils/geometry.js';
import { worldToFrameLocal } from '../utils/coordinates.js';

/**
 * Frame children composable
 * Provides selection, dragging, and management of shapes inside frames
 */
export function useFrameChildren() {
  const { state, config } = getEditorState();
  const { saveState } = getHistory();

  // Local state refs
  const selectedFrameChildren = ref([]);
  const highlightedFrameIndex = ref(-1);
  const dropTargetFrameIndex = ref(-1);
  const isDraggingFrameChild = ref(false);
  const isResizingFrameChild = ref(false);
  const isRotatingFrameChild = ref(false);

  /**
   * Check if point is inside frame content area (not label)
   */
  function isPointInFrameContent(x, y, frame) {
    if (frame.type !== 'frame') return false;

    // Handle rotated frames
    if (frame.rotation) {
      const localPoint = worldToFrameLocal(x, y, frame);
      return localPoint.x >= frame.x && localPoint.x <= frame.x + frame.width &&
             localPoint.y >= frame.y && localPoint.y <= frame.y + frame.height;
    }

    return x >= frame.x && x <= frame.x + frame.width &&
           y >= frame.y && y <= frame.y + frame.height;
  }

  /**
   * Find if a shape is inside any frame's children
   */
  function findShapeInFrame(shape) {
    for (let i = 0; i < state.shapes.length; i++) {
      const s = state.shapes[i];
      if (s.type === 'frame' && s.children) {
        const childIndex = s.children.findIndex(c => c.id === shape.id);
        if (childIndex >= 0) {
          return { frame: s, frameIndex: i, childIndex };
        }
        // Check nested frames
        for (const child of s.children) {
          if (child.type === 'frame' && child.children) {
            const nestedIndex = child.children.findIndex(c => c.id === shape.id);
            if (nestedIndex >= 0) {
              return { frame: child, parentFrame: s, childIndex: nestedIndex };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Remove a shape from a frame's children
   */
  function removeShapeFromFrame(shape, frame) {
    if (!frame.children) return false;
    const index = frame.children.findIndex(c => c.id === shape.id);
    if (index >= 0) {
      frame.children.splice(index, 1);
      delete shape.parentFrameId;
      return true;
    }
    return false;
  }

  /**
   * Add a shape to a frame's children
   */
  function addShapeToFrame(shape, frame) {
    if (!frame.children) frame.children = [];
    shape.parentFrameId = frame.id;
    frame.children.push(shape);
  }

  /**
   * Select a frame child
   */
  function selectFrameChild(frameIndex, childIndex, addToSelection = false) {
    // Clear regular selection
    state.selectedIndices = [];

    const selection = { frameIndex, childIndex };

    if (addToSelection) {
      // Check if already selected
      const existingIdx = selectedFrameChildren.value.findIndex(
        s => s.frameIndex === frameIndex && s.childIndex === childIndex
      );
      if (existingIdx >= 0) {
        // Toggle off
        selectedFrameChildren.value.splice(existingIdx, 1);
      } else {
        // Add to selection
        selectedFrameChildren.value.push(selection);
      }
    } else {
      // Replace selection
      selectedFrameChildren.value = [selection];
    }

    // Update global state
    state.selectedFrameChildren = [...selectedFrameChildren.value];
    highlightedFrameIndex.value = -1;
    state.highlightedFrameIndex = -1;
  }

  /**
   * Clear frame children selection
   */
  function clearFrameChildrenSelection() {
    selectedFrameChildren.value = [];
    state.selectedFrameChildren = [];
    highlightedFrameIndex.value = -1;
    state.highlightedFrameIndex = -1;
  }

  /**
   * Get the selected frame children shapes
   */
  function getSelectedFrameChildrenShapes() {
    return selectedFrameChildren.value.map(sel => {
      const frame = state.shapes[sel.frameIndex];
      return frame?.children?.[sel.childIndex];
    }).filter(Boolean);
  }

  /**
   * Delete selected frame children
   */
  function deleteSelectedFrameChildren() {
    if (selectedFrameChildren.value.length === 0) return;

    // Sort by childIndex descending so we don't mess up indices when deleting
    const sorted = [...selectedFrameChildren.value].sort((a, b) => b.childIndex - a.childIndex);
    sorted.forEach(sel => {
      const frame = state.shapes[sel.frameIndex];
      if (frame && frame.children && frame.children[sel.childIndex]) {
        frame.children.splice(sel.childIndex, 1);
      }
    });

    selectedFrameChildren.value = [];
    state.selectedFrameChildren = [];

    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }
    if (typeof window.render === 'function') {
      window.render();
    }
    saveState();
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  /**
   * Update drop target frame for visual feedback during dragging
   */
  function updateDropTargetFrame(x, y) {
    // Only show drop target if dragging non-frame shapes
    const isDraggingFrames = state.selectedIndices.some(i =>
      state.shapes[i]?.type === 'frame'
    );

    if (isDraggingFrames) {
      dropTargetFrameIndex.value = -1;
      state.dropTargetFrameIndex = -1;
      return;
    }

    // Find topmost frame under cursor
    let targetFrameIndex = -1;
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const shape = state.shapes[i];
      if (shape.type === 'frame' &&
          !state.selectedIndices.includes(i) &&
          isPointInFrameContent(x, y, shape)) {
        targetFrameIndex = i;
        break;
      }
    }

    dropTargetFrameIndex.value = targetFrameIndex;
    state.dropTargetFrameIndex = targetFrameIndex;
  }

  /**
   * Handle drag and drop of main shapes into/out of frames
   */
  function handleFrameDragDrop() {
    if (state.selectedIndices.length === 0) return;

    // Get the shapes being dragged (excluding frames being dragged)
    const draggedShapes = state.selectedIndices
      .map(i => ({ index: i, shape: state.shapes[i] }))
      .filter(({ shape }) => shape && shape.type !== 'frame');

    if (draggedShapes.length === 0) return;

    // Find all frames (potential drop targets)
    const frames = state.shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape, index }) =>
        shape.type === 'frame' &&
        !state.selectedIndices.includes(index)
      );

    // Check each dragged shape
    draggedShapes.forEach(({ index, shape }) => {
      const bounds = getShapeBounds(shape, config);
      if (!bounds) return;

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // Check if shape is currently in a frame
      const currentFrameInfo = findShapeInFrame(shape);

      // Find if center is inside any frame
      let targetFrame = null;
      let targetFrameIndex = -1;

      // Check frames from top to bottom (reverse order) to get topmost frame
      for (let i = frames.length - 1; i >= 0; i--) {
        const { shape: frame, index: frameIdx } = frames[i];
        if (isPointInFrameContent(centerX, centerY, frame)) {
          // For nested frames, check if this frame is in the current selection
          if (!state.selectedIndices.includes(frameIdx)) {
            targetFrame = frame;
            targetFrameIndex = frameIdx;
            break;
          }
        }
      }

      // If shape was in a frame and is now outside all frames, remove it
      if (currentFrameInfo && !targetFrame) {
        removeShapeFromFrame(shape, currentFrameInfo.frame);
        // Add back to main shapes array
        state.shapes.push(shape);
      }
      // If shape was in a different frame, move it
      else if (currentFrameInfo && targetFrame && currentFrameInfo.frame !== targetFrame) {
        removeShapeFromFrame(shape, currentFrameInfo.frame);
        addShapeToFrame(shape, targetFrame);
      }
      // If shape was not in a frame and is now inside one, add it
      else if (!currentFrameInfo && targetFrame) {
        // Remove from main shapes array
        const mainIndex = state.shapes.indexOf(shape);
        if (mainIndex >= 0) {
          state.shapes.splice(mainIndex, 1);
          // Update selected indices
          state.selectedIndices = state.selectedIndices
            .filter(i => i !== mainIndex)
            .map(i => i > mainIndex ? i - 1 : i);
        }
        addShapeToFrame(shape, targetFrame);
      }
    });
  }

  /**
   * Handle drag and drop of frame children (moving within frame or out of frame)
   */
  function handleFrameChildDragDrop(dropX, dropY) {
    if (selectedFrameChildren.value.length === 0) return;

    const sel = selectedFrameChildren.value[0];
    const sourceFrame = state.shapes[sel.frameIndex];
    if (!sourceFrame || !sourceFrame.children) return;

    const child = sourceFrame.children[sel.childIndex];
    if (!child) return;

    const bounds = getShapeBounds(child, config);
    if (!bounds) return;

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // Find if the child is now over a different frame or outside all frames
    let targetFrame = null;
    let targetFrameIndex = -1;

    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const shape = state.shapes[i];
      if (shape.type === 'frame' && isPointInFrameContent(centerX, centerY, shape)) {
        targetFrame = shape;
        targetFrameIndex = i;
        break;
      }
    }

    // If child is still in the same frame, just reposition (already done during drag)
    if (targetFrame === sourceFrame) {
      return;
    }

    // Remove child from source frame
    sourceFrame.children.splice(sel.childIndex, 1);
    delete child.parentFrameId;

    if (targetFrame && targetFrame !== sourceFrame) {
      // Move to different frame
      addShapeToFrame(child, targetFrame);
      // Update selection to point to new location
      const newChildIndex = targetFrame.children.length - 1;
      selectedFrameChildren.value = [{
        frameIndex: targetFrameIndex,
        childIndex: newChildIndex
      }];
      state.selectedFrameChildren = [...selectedFrameChildren.value];
    } else {
      // Move out of frame to main canvas
      state.shapes.push(child);
      // Clear frame child selection and select as regular shape
      selectedFrameChildren.value = [];
      state.selectedFrameChildren = [];
      state.selectedIndices = [state.shapes.length - 1];
    }
  }

  /**
   * Move a frame child by delta
   */
  function moveFrameChild(frameIndex, childIndex, dx, dy) {
    const frame = state.shapes[frameIndex];
    if (!frame || !frame.children) return;

    const child = frame.children[childIndex];
    if (!child) return;

    // Use the moveShapeObj function if available
    if (typeof window.moveShapeObj === 'function') {
      window.moveShapeObj(child, dx, dy);
    } else {
      // Basic move implementation
      switch (child.type) {
        case 'rect':
        case 'ellipse':
        case 'text':
        case 'image':
        case 'video':
        case 'diamond':
          child.x = (child.x || 0) + dx;
          child.y = (child.y || 0) + dy;
          break;
        case 'line':
        case 'arrow':
          child.x1 = (child.x1 || 0) + dx;
          child.y1 = (child.y1 || 0) + dy;
          child.x2 = (child.x2 || 0) + dx;
          child.y2 = (child.y2 || 0) + dy;
          if (child.controlPoint) {
            child.controlPoint.x += dx;
            child.controlPoint.y += dy;
          }
          break;
        case 'triangle':
          if (child.x1 !== undefined) {
            child.x1 += dx; child.y1 += dy;
            child.x2 += dx; child.y2 += dy;
            child.x3 += dx; child.y3 += dy;
          }
          break;
        case 'freehand':
        case 'path':
          if (child.points) {
            child.points.forEach(p => { p.x += dx; p.y += dy; });
          }
          if (child.segments) {
            child.segments.forEach(seg => {
              seg.point[0] += dx;
              seg.point[1] += dy;
            });
          }
          break;
      }
    }
  }

  /**
   * Resize a frame child
   */
  function resizeFrameChild(frameIndex, childIndex, handle, dx, dy) {
    // Delegate to legacy function if available
    if (typeof window.resizeFrameChild === 'function') {
      window.resizeFrameChild(frameIndex, childIndex, handle, dx, dy);
    }
  }

  /**
   * Duplicate selected frame children
   */
  function duplicateSelectedFrameChildren() {
    if (selectedFrameChildren.value.length === 0) return;

    const newSelections = [];

    selectedFrameChildren.value.forEach(sel => {
      const frame = state.shapes[sel.frameIndex];
      if (!frame || !frame.children) return;

      const child = frame.children[sel.childIndex];
      if (!child) return;

      // Deep clone the child
      const clone = JSON.parse(JSON.stringify(child));
      clone.id = 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      clone.name = (clone.name || child.type) + ' copy';

      // Offset the clone
      moveFrameChild(sel.frameIndex, frame.children.length, 0, 0); // no-op, just for consistency
      if (clone.x !== undefined) { clone.x += 20; clone.y += 20; }
      if (clone.x1 !== undefined) {
        clone.x1 += 20; clone.y1 += 20;
        clone.x2 += 20; clone.y2 += 20;
        if (clone.controlPoint) {
          clone.controlPoint.x += 20;
          clone.controlPoint.y += 20;
        }
      }

      // Add to frame
      frame.children.push(clone);
      newSelections.push({
        frameIndex: sel.frameIndex,
        childIndex: frame.children.length - 1
      });
    });

    // Update selection to point to clones
    selectedFrameChildren.value = newSelections;
    state.selectedFrameChildren = [...newSelections];

    saveState();
    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  // Expose globally for legacy compatibility
  if (typeof window !== 'undefined') {
    window.handleFrameDragDrop = handleFrameDragDrop;
    window.handleFrameChildDragDrop = handleFrameChildDragDrop;
    window.updateDropTargetFrame = updateDropTargetFrame;
    window.deleteSelectedFrameChildren = deleteSelectedFrameChildren;
  }

  return {
    // State refs
    selectedFrameChildren,
    highlightedFrameIndex,
    dropTargetFrameIndex,
    isDraggingFrameChild,
    isResizingFrameChild,
    isRotatingFrameChild,

    // Methods
    isPointInFrameContent,
    findShapeInFrame,
    removeShapeFromFrame,
    addShapeToFrame,
    selectFrameChild,
    clearFrameChildrenSelection,
    getSelectedFrameChildrenShapes,
    deleteSelectedFrameChildren,
    updateDropTargetFrame,
    handleFrameDragDrop,
    handleFrameChildDragDrop,
    moveFrameChild,
    resizeFrameChild,
    duplicateSelectedFrameChildren
  };
}

// Singleton instance
let frameChildrenInstance = null;

/**
 * Get or create frame children instance
 */
export function getFrameChildren() {
  if (!frameChildrenInstance) {
    frameChildrenInstance = useFrameChildren();
  }
  return frameChildrenInstance;
}

export default useFrameChildren;
