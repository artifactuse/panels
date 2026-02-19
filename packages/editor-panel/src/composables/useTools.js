// editor/composables/useTools.js
// Shape manipulation tools composable - Full implementation

import { getEditorState } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getShapeBounds, getMultiSelectionBounds } from '../utils/geometry.js';
import { generateId, cloneShape } from '../utils/shapes.js';

/**
 * Tools composable for shape manipulation
 */
export function useTools() {
  const { state, config } = getEditorState();
  const { saveState } = getHistory();

  /**
   * Move a shape by index
   * @param {number} i - Shape index
   * @param {number} dx - Delta X
   * @param {number} dy - Delta Y
   */
  function moveShape(i, dx, dy) {
    const s = state.shapes[i];
    if (!s) return;

    if (s.type === 'group' && s.children) {
      s.children.forEach(c => moveShapeObj(c, dx, dy));
    } else if (s.type === 'frame') {
      // Move frame and its children together
      moveShapeObj(s, dx, dy);
      if (s.children) {
        s.children.forEach(c => moveShapeObj(c, dx, dy));
      }
    } else {
      moveShapeObj(s, dx, dy);
    }
  }

  /**
   * Move a shape object (internal helper)
   * @param {object} s - Shape object
   * @param {number} dx - Delta X
   * @param {number} dy - Delta Y
   */
  function moveShapeObj(s, dx, dy) {
    switch (s.type) {
      case 'circle':
      case 'ellipse':
      case 'rect':
      case 'text':
      case 'diamond':
      case 'image':
      case 'video':
      case 'webcamCapture':
      case 'screenCapture':
      case 'frame':
        s.x += dx;
        s.y += dy;
        break;

      case 'triangle':
        if (s.x1 !== undefined) {
          s.x1 += dx; s.y1 += dy;
          s.x2 += dx; s.y2 += dy;
          s.x3 += dx; s.y3 += dy;
        } else {
          s.x += dx;
          s.y += dy;
        }
        break;

      case 'line':
      case 'arrow':
        s.x1 += dx;
        s.y1 += dy;
        s.x2 += dx;
        s.y2 += dy;
        // Also move control point if it exists
        if (s.controlPoint) {
          s.controlPoint.x += dx;
          s.controlPoint.y += dy;
        }
        break;

      case 'freehand':
        if (s.points) {
          s.points.forEach(p => { p.x += dx; p.y += dy; });
        }
        break;

      case 'path':
        // Move path segments
        if (s.segments) {
          s.segments.forEach(seg => {
            seg.point[0] += dx;
            seg.point[1] += dy;
          });
        }
        // Move compound path children
        if (s.isCompound && s.children) {
          s.children.forEach(child => {
            if (child.segments) {
              child.segments.forEach(seg => {
                seg.point[0] += dx;
                seg.point[1] += dy;
              });
            }
          });
        }
        break;

      case 'group':
        if (s.children) {
          s.children.forEach(c => moveShapeObj(c, dx, dy));
        }
        break;

      case 'cursor':
        // Move all cursorKeyframes and control points
        if (s.cursorKeyframes) {
          s.cursorKeyframes.forEach(kf => {
            kf.x += dx;
            kf.y += dy;
            if (kf.controlIn) {
              kf.controlIn.x += dx;
              kf.controlIn.y += dy;
            }
            if (kf.controlOut) {
              kf.controlOut.x += dx;
              kf.controlOut.y += dy;
            }
          });
        }
        break;
    }
  }

  /**
   * Resize a shape
   * @param {number} i - Shape index
   * @param {string} handle - Resize handle ('nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w')
   * @param {number} dx - Delta X from start
   * @param {number} dy - Delta Y from start
   */
  function resizeShape(i, handle, dx, dy) {
    const shape = state.shapes[i];
    const bounds = state.resizeStartBounds;
    if (!shape || !bounds) return;

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
    applyResize(shape, newX, newY, newW, newH, bounds);
  }

  /**
   * Apply resize to a shape
   */
  function applyResize(shape, newX, newY, newW, newH, originalBounds) {
    switch (shape.type) {
      case 'rect':
        shape.x = newX;
        shape.y = newY;
        shape.width = newW;
        shape.height = newH;
        break;

      case 'frame': {
        // For frames, account for the label offset in bounds calculation
        const labelHeight = (config.frame?.labelFontSize || 12) +
                           (config.frame?.labelPadding || 4) * 2 +
                           (config.frame?.labelOffset || 2);
        shape.x = newX;
        shape.y = newY + labelHeight;
        shape.width = newW;
        shape.height = newH - labelHeight;
        break;
      }

      case 'circle':
        shape.radius = Math.max(newW, newH) / 2;
        shape.x = newX + newW / 2;
        shape.y = newY + newH / 2;
        break;

      case 'ellipse':
        shape.radiusX = newW / 2;
        shape.radiusY = newH / 2;
        shape.x = newX + newW / 2;
        shape.y = newY + newH / 2;
        break;

      case 'diamond':
        shape.width = newW;
        shape.height = newH;
        shape.x = newX + newW / 2;
        shape.y = newY + newH / 2;
        break;

      case 'image':
      case 'video':
      case 'webcamCapture':
      case 'screenCapture':
        shape.x = newX;
        shape.y = newY;
        shape.width = newW;
        shape.height = newH;
        break;

      case 'text': {
        // Check if using a diagonal (corner) handle for text
        const handle = state.resizeHandle || '';
        const isTextDiagonalHandle = (handle.includes('n') || handle.includes('s')) &&
                                     (handle.includes('e') || handle.includes('w'));

        if (isTextDiagonalHandle && state.resizeStartShapes) {
          // Diagonal handle: scale fontSize proportionally
          const origFontSize = state.resizeStartShapes.origFontSize || 16;
          const scaleFactorX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleFactorY = originalBounds.height > 0 ? newH / originalBounds.height : 1;
          const scaleFactor = Math.max(scaleFactorX, scaleFactorY);
          const newFontSize = Math.max(8, Math.round(origFontSize * scaleFactor));

          const textAlign = state.resizeStartShapes.origAlign || 'left';
          if (textAlign === 'left') {
            shape.x = newX;
          } else if (textAlign === 'center') {
            shape.x = newX + newW / 2;
          } else if (textAlign === 'right') {
            shape.x = newX + newW;
          }
          shape.y = newY;
          shape.fontSize = newFontSize;

          // If text has width/height (text-box mode), scale them too
          if (state.resizeStartShapes.hasWidth) {
            shape.width = Math.max(20, newW);
            shape.height = Math.max(20, newH);
          }
        } else {
          // Middle handle (n, s, e, w) - resize text box without changing font size
          shape.x = newX;
          shape.y = newY;
          shape.width = Math.max(20, newW);
          shape.height = Math.max(20, newH);
        }
        break;
      }

      case 'line':
      case 'arrow': {
        // Scale line endpoints
        const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
        const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

        if (state.resizeStartShapes) {
          shape.x1 = newX + (state.resizeStartShapes.origX1 - originalBounds.x) * scaleX;
          shape.y1 = newY + (state.resizeStartShapes.origY1 - originalBounds.y) * scaleY;
          shape.x2 = newX + (state.resizeStartShapes.origX2 - originalBounds.x) * scaleX;
          shape.y2 = newY + (state.resizeStartShapes.origY2 - originalBounds.y) * scaleY;

          if (shape.controlPoint && state.resizeStartShapes.origCpX !== undefined) {
            shape.controlPoint.x = newX + (state.resizeStartShapes.origCpX - originalBounds.x) * scaleX;
            shape.controlPoint.y = newY + (state.resizeStartShapes.origCpY - originalBounds.y) * scaleY;
          }
        }
        break;
      }

      case 'freehand': {
        if (shape.points && state.resizeStartShapes?.origPoints) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          shape.points = state.resizeStartShapes.origPoints.map(p => ({
            x: newX + (p.x - originalBounds.x) * scaleX,
            y: newY + (p.y - originalBounds.y) * scaleY
          }));
        }
        break;
      }

      case 'triangle': {
        if (shape.x1 !== undefined && state.resizeStartShapes) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          shape.x1 = newX + (state.resizeStartShapes.origX1 - originalBounds.x) * scaleX;
          shape.y1 = newY + (state.resizeStartShapes.origY1 - originalBounds.y) * scaleY;
          shape.x2 = newX + (state.resizeStartShapes.origX2 - originalBounds.x) * scaleX;
          shape.y2 = newY + (state.resizeStartShapes.origY2 - originalBounds.y) * scaleY;
          shape.x3 = newX + (state.resizeStartShapes.origX3 - originalBounds.x) * scaleX;
          shape.y3 = newY + (state.resizeStartShapes.origY3 - originalBounds.y) * scaleY;
        } else {
          shape.size = Math.max(newW, newH);
          shape.x = newX + newW / 2;
          shape.y = newY + newH / 2;
        }
        break;
      }

      case 'path': {
        if (state.resizeStartShapes?.origPath) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          if (shape.isCompound && shape.children && state.resizeStartShapes.origPath.children) {
            // Resize compound path children
            shape.children = state.resizeStartShapes.origPath.children.map(origChild => ({
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
          } else if (shape.segments && state.resizeStartShapes.origPath.segments) {
            // Resize simple path
            shape.segments = state.resizeStartShapes.origPath.segments.map(seg => ({
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

      case 'group': {
        // Scale all children proportionally
        if (shape.children && state.resizeStartShapes?.origChildren) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;

          shape.children.forEach((child, idx) => {
            const origChild = state.resizeStartShapes.origChildren[idx];
            if (!origChild) return;

            // Scale child based on type
            switch (child.type) {
              case 'rect':
              case 'image':
              case 'video':
              case 'webcamCapture':
              case 'screenCapture':
                child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                child.width = origChild.width * scaleX;
                child.height = origChild.height * scaleY;
                break;

              case 'circle':
                child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                child.radius = origChild.radius * Math.max(scaleX, scaleY);
                break;

              case 'ellipse':
                child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                child.radiusX = origChild.radiusX * scaleX;
                child.radiusY = origChild.radiusY * scaleY;
                break;

              case 'diamond':
                child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                child.width = origChild.width * scaleX;
                child.height = origChild.height * scaleY;
                break;

              case 'text':
                child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                // Scale font size proportionally
                child.fontSize = Math.max(8, Math.round((origChild.fontSize || 16) * Math.max(scaleX, scaleY)));
                if (origChild.width) child.width = origChild.width * scaleX;
                if (origChild.height) child.height = origChild.height * scaleY;
                break;

              case 'line':
              case 'arrow':
                child.x1 = newX + (origChild.x1 - originalBounds.x) * scaleX;
                child.y1 = newY + (origChild.y1 - originalBounds.y) * scaleY;
                child.x2 = newX + (origChild.x2 - originalBounds.x) * scaleX;
                child.y2 = newY + (origChild.y2 - originalBounds.y) * scaleY;
                if (origChild.controlPoint) {
                  child.controlPoint = {
                    x: newX + (origChild.controlPoint.x - originalBounds.x) * scaleX,
                    y: newY + (origChild.controlPoint.y - originalBounds.y) * scaleY
                  };
                }
                break;

              case 'triangle':
                if (origChild.x1 !== undefined) {
                  child.x1 = newX + (origChild.x1 - originalBounds.x) * scaleX;
                  child.y1 = newY + (origChild.y1 - originalBounds.y) * scaleY;
                  child.x2 = newX + (origChild.x2 - originalBounds.x) * scaleX;
                  child.y2 = newY + (origChild.y2 - originalBounds.y) * scaleY;
                  child.x3 = newX + (origChild.x3 - originalBounds.x) * scaleX;
                  child.y3 = newY + (origChild.y3 - originalBounds.y) * scaleY;
                } else {
                  child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                  child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                  child.size = origChild.size * Math.max(scaleX, scaleY);
                }
                break;

              case 'freehand':
                if (origChild.points) {
                  child.points = origChild.points.map(p => ({
                    x: newX + (p.x - originalBounds.x) * scaleX,
                    y: newY + (p.y - originalBounds.y) * scaleY
                  }));
                }
                break;

              case 'path':
                if (origChild.segments) {
                  child.segments = origChild.segments.map(seg => ({
                    point: [
                      newX + (seg.point[0] - originalBounds.x) * scaleX,
                      newY + (seg.point[1] - originalBounds.y) * scaleY
                    ],
                    handleIn: seg.handleIn ? [seg.handleIn[0] * scaleX, seg.handleIn[1] * scaleY] : undefined,
                    handleOut: seg.handleOut ? [seg.handleOut[0] * scaleX, seg.handleOut[1] * scaleY] : undefined
                  }));
                }
                if (origChild.isCompound && origChild.children) {
                  child.children = origChild.children.map(origPath => ({
                    segments: origPath.segments.map(seg => ({
                      point: [
                        newX + (seg.point[0] - originalBounds.x) * scaleX,
                        newY + (seg.point[1] - originalBounds.y) * scaleY
                      ],
                      handleIn: seg.handleIn ? [seg.handleIn[0] * scaleX, seg.handleIn[1] * scaleY] : undefined,
                      handleOut: seg.handleOut ? [seg.handleOut[0] * scaleX, seg.handleOut[1] * scaleY] : undefined
                    })),
                    closed: origPath.closed
                  }));
                }
                break;

              default:
                // Fallback for other types - try basic x, y, width, height
                if (origChild.x !== undefined) {
                  child.x = newX + (origChild.x - originalBounds.x) * scaleX;
                }
                if (origChild.y !== undefined) {
                  child.y = newY + (origChild.y - originalBounds.y) * scaleY;
                }
                if (origChild.width !== undefined) {
                  child.width = origChild.width * scaleX;
                }
                if (origChild.height !== undefined) {
                  child.height = origChild.height * scaleY;
                }
                break;
            }
          });
        }
        break;
      }

      case 'cursor': {
        // Scale all cursorKeyframes and control points proportionally
        if (state.resizeStartShapes?.origCursorKeyframes) {
          const scaleX = originalBounds.width > 0 ? newW / originalBounds.width : 1;
          const scaleY = originalBounds.height > 0 ? newH / originalBounds.height : 1;
          // Use uniform scale for cursor icon (average of X and Y)
          const uniformScale = (scaleX + scaleY) / 2;

          shape.cursorKeyframes = state.resizeStartShapes.origCursorKeyframes.map(kf => {
            const newKf = {
              ...kf,
              x: newX + (kf.x - originalBounds.x) * scaleX,
              y: newY + (kf.y - originalBounds.y) * scaleY
            };
            // Scale control points if they exist
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

          // Scale cursor icon size proportionally
          const origScale = state.resizeStartShapes.origCursorScale || 1.0;
          shape.cursorScale = Math.max(0.1, origScale * uniformScale);
        }
        break;
      }
    }
  }

  /**
   * Rotate a shape
   * @param {number} i - Shape index
   * @param {number} angle - New rotation angle in radians
   */
  function rotateShape(i, angle) {
    const shape = state.shapes[i];
    if (!shape) return;
    shape.rotation = angle;
  }

  /**
   * Delete shapes by indices
   * @param {array} indices - Array of shape indices to delete
   */
  function deleteShapes(indices) {
    if (!indices || indices.length === 0) return;

    // Sort indices in descending order to delete from end first
    const sorted = [...indices].sort((a, b) => b - a);
    sorted.forEach(i => {
      if (i >= 0 && i < state.shapes.length) {
        state.shapes.splice(i, 1);
      }
    });

    state.selectedIndices = [];
    state.selectedFrameChildren = [];
    saveState();

    // Trigger render
    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  /**
   * Delete selected shapes
   */
  function deleteSelected() {
    if (state.selectedIndices.length > 0) {
      deleteShapes(state.selectedIndices);
    } else if (state.selectedFrameChildren.length > 0) {
      // Delete frame children
      state.selectedFrameChildren.forEach(sel => {
        const frame = state.shapes[sel.frameIndex];
        if (frame?.children) {
          frame.children.splice(sel.childIndex, 1);
        }
      });
      state.selectedFrameChildren = [];
      saveState();

      if (typeof window.render === 'function') window.render();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();
    }
  }

  /**
   * Duplicate selected shapes
   */
  function duplicateSelected() {
    if (state.selectedIndices.length === 0) return;

    const offset = 20;
    const newIndices = [];

    state.selectedIndices.forEach(i => {
      const original = state.shapes[i];
      if (!original) return;

      const copy = cloneShape(original);

      // Clone media elements for image/video/audio shapes
      if (original.type === 'video' || original.type === 'audio' || original.type === 'image') {
        if (typeof window.cloneMediaElement === 'function') {
          const clonedElement = window.cloneMediaElement(original, copy.id);
          if (clonedElement) {
            if (original.type === 'video') {
              copy.videoElement = clonedElement;
            } else if (original.type === 'audio') {
              copy.audioElement = clonedElement;
            } else if (original.type === 'image') {
              copy.imageElement = clonedElement;
            }
          }
        }
      }

      // Offset the copy
      moveShapeObj(copy, offset, offset);

      // In video mode, place duplicated clip on a different track
      if (state.videoMode && copy.trackId !== undefined && copy.startTime !== undefined) {
        const duration = copy.duration || 5;
        let newTrackId = null;

        // Find a track that doesn't overlap and is different from original
        for (const track of state.tracks) {
          if (track.id === original.trackId) continue;
          if (track.isFxTrack && copy.type !== 'effect' && copy.type !== 'filter' && copy.type !== 'transition') continue;

          let hasOverlap = false;
          for (const shape of state.shapes) {
            if (shape.trackId !== track.id) continue;
            if (shape.startTime === undefined) continue;

            const shapeEnd = shape.startTime + (shape.duration || 5);
            if (copy.startTime < shapeEnd && (copy.startTime + duration) > shape.startTime) {
              hasOverlap = true;
              break;
            }
          }

          if (!hasOverlap) {
            newTrackId = track.id;
            break;
          }
        }

        // If no available track, create a new one
        if (!newTrackId && typeof window.addTrack === 'function') {
          window.addTrack();
          newTrackId = state.tracks[state.tracks.length - 1].id;
        }

        if (newTrackId) {
          copy.trackId = newTrackId;
        }
      }

      state.shapes.push(copy);
      newIndices.push(state.shapes.length - 1);
    });

    state.selectedIndices = newIndices;
    saveState();

    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (state.videoMode && typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  /**
   * Bring selected shapes to front
   */
  function bringToFront() {
    if (state.selectedIndices.length === 0) return;

    const sorted = [...state.selectedIndices].sort((a, b) => a - b);
    const shapes = sorted.map(i => state.shapes[i]);

    // Remove from current positions
    sorted.reverse().forEach(i => state.shapes.splice(i, 1));

    // Add to end
    shapes.forEach(s => state.shapes.push(s));

    // Update selection
    state.selectedIndices = shapes.map((_, idx) => state.shapes.length - shapes.length + idx);

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  /**
   * Send selected shapes to back
   */
  function sendToBack() {
    if (state.selectedIndices.length === 0) return;

    const sorted = [...state.selectedIndices].sort((a, b) => b - a);
    const shapes = sorted.map(i => state.shapes[i]);

    // Remove from current positions
    sorted.forEach(i => state.shapes.splice(i, 1));

    // Add to beginning
    shapes.reverse().forEach(s => state.shapes.unshift(s));

    // Update selection
    state.selectedIndices = shapes.map((_, idx) => idx);

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  /**
   * Group selected shapes
   */
  function groupSelected() {
    if (state.selectedIndices.length < 2) return;

    const sorted = [...state.selectedIndices].sort((a, b) => a - b);
    const children = sorted.map(i => state.shapes[i]);

    // Create group
    const group = {
      id: generateId(),
      type: 'group',
      visible: true,
      children: children
    };

    // Remove original shapes
    sorted.reverse().forEach(i => state.shapes.splice(i, 1));

    // Add group
    state.shapes.push(group);
    state.selectedIndices = [state.shapes.length - 1];

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  /**
   * Ungroup selected group
   */
  function ungroupSelected() {
    if (state.selectedIndices.length !== 1) return;

    const group = state.shapes[state.selectedIndices[0]];
    if (group.type !== 'group' || !group.children) return;

    const groupIndex = state.selectedIndices[0];
    const children = group.children;

    // Remove group
    state.shapes.splice(groupIndex, 1);

    // Add children at the end
    const startIndex = state.shapes.length;
    children.forEach(c => {
      c.id = generateId();
      state.shapes.push(c);
    });

    // Select all ungrouped shapes (they are at the end of the array)
    state.selectedIndices = children.map((_, i) => startIndex + i);

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  /**
   * Toggle shape visibility
   * @param {number} i - Shape index
   */
  function toggleVisibility(i) {
    const shape = state.shapes[i];
    if (!shape) return;
    shape.visible = shape.visible === false ? true : false;

    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  // ==================== ALIGNMENT OPERATIONS ====================

  /**
   * Align selected shapes to the left
   */
  function alignLeft() {
    if (state.selectedIndices.length < 2) return;

    let minX = Infinity;
    state.selectedIndices.forEach(i => {
      const bounds = getShapeBounds(state.shapes[i], config);
      if (bounds) minX = Math.min(minX, bounds.x);
    });

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        const dx = minX - bounds.x;
        moveShapeObj(shape, dx, 0);
      }
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Align selected shapes to the right
   */
  function alignRight() {
    if (state.selectedIndices.length < 2) return;

    let maxX = -Infinity;
    state.selectedIndices.forEach(i => {
      const bounds = getShapeBounds(state.shapes[i], config);
      if (bounds) maxX = Math.max(maxX, bounds.x + bounds.width);
    });

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        const dx = maxX - (bounds.x + bounds.width);
        moveShapeObj(shape, dx, 0);
      }
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Align selected shapes to the top
   */
  function alignTop() {
    if (state.selectedIndices.length < 2) return;

    let minY = Infinity;
    state.selectedIndices.forEach(i => {
      const bounds = getShapeBounds(state.shapes[i], config);
      if (bounds) minY = Math.min(minY, bounds.y);
    });

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        const dy = minY - bounds.y;
        moveShapeObj(shape, 0, dy);
      }
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Align selected shapes to the bottom
   */
  function alignBottom() {
    if (state.selectedIndices.length < 2) return;

    let maxY = -Infinity;
    state.selectedIndices.forEach(i => {
      const bounds = getShapeBounds(state.shapes[i], config);
      if (bounds) maxY = Math.max(maxY, bounds.y + bounds.height);
    });

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        const dy = maxY - (bounds.y + bounds.height);
        moveShapeObj(shape, 0, dy);
      }
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Align selected shapes to horizontal center
   */
  function alignCenterH() {
    if (state.selectedIndices.length < 2) return;

    // Get the combined bounds center
    const combinedBounds = getMultiSelectionBounds(state.shapes, state.selectedIndices, config);
    if (!combinedBounds) return;
    const centerX = combinedBounds.x + combinedBounds.width / 2;

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        const shapeCenterX = bounds.x + bounds.width / 2;
        const dx = centerX - shapeCenterX;
        moveShapeObj(shape, dx, 0);
      }
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Align selected shapes to vertical center
   */
  function alignCenterV() {
    if (state.selectedIndices.length < 2) return;

    // Get the combined bounds center
    const combinedBounds = getMultiSelectionBounds(state.shapes, state.selectedIndices, config);
    if (!combinedBounds) return;
    const centerY = combinedBounds.y + combinedBounds.height / 2;

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      const bounds = getShapeBounds(shape, config);
      if (bounds) {
        const shapeCenterY = bounds.y + bounds.height / 2;
        const dy = centerY - shapeCenterY;
        moveShapeObj(shape, 0, dy);
      }
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  // ==================== DISTRIBUTION OPERATIONS ====================

  /**
   * Distribute selected shapes horizontally with equal spacing
   */
  function distributeHorizontal() {
    if (state.selectedIndices.length < 3) return;

    // Get bounds for all shapes and sort by x position
    const shapeData = state.selectedIndices.map(i => ({
      index: i,
      shape: state.shapes[i],
      bounds: getShapeBounds(state.shapes[i], config)
    })).filter(d => d.bounds);

    shapeData.sort((a, b) => a.bounds.x - b.bounds.x);

    // Calculate total width and spacing
    const totalShapeWidth = shapeData.reduce((sum, d) => sum + d.bounds.width, 0);
    const leftMost = shapeData[0].bounds.x;
    const rightMost = shapeData[shapeData.length - 1].bounds.x + shapeData[shapeData.length - 1].bounds.width;
    const totalSpace = rightMost - leftMost - totalShapeWidth;
    const spacing = totalSpace / (shapeData.length - 1);

    // Position shapes
    let currentX = leftMost;
    shapeData.forEach((d, i) => {
      if (i > 0) {
        const dx = currentX - d.bounds.x;
        moveShapeObj(d.shape, dx, 0);
      }
      currentX += d.bounds.width + spacing;
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Distribute selected shapes vertically with equal spacing
   */
  function distributeVertical() {
    if (state.selectedIndices.length < 3) return;

    // Get bounds for all shapes and sort by y position
    const shapeData = state.selectedIndices.map(i => ({
      index: i,
      shape: state.shapes[i],
      bounds: getShapeBounds(state.shapes[i], config)
    })).filter(d => d.bounds);

    shapeData.sort((a, b) => a.bounds.y - b.bounds.y);

    // Calculate total height and spacing
    const totalShapeHeight = shapeData.reduce((sum, d) => sum + d.bounds.height, 0);
    const topMost = shapeData[0].bounds.y;
    const bottomMost = shapeData[shapeData.length - 1].bounds.y + shapeData[shapeData.length - 1].bounds.height;
    const totalSpace = bottomMost - topMost - totalShapeHeight;
    const spacing = totalSpace / (shapeData.length - 1);

    // Position shapes
    let currentY = topMost;
    shapeData.forEach((d, i) => {
      if (i > 0) {
        const dy = currentY - d.bounds.y;
        moveShapeObj(d.shape, 0, dy);
      }
      currentY += d.bounds.height + spacing;
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  // ==================== Z-ORDER OPERATIONS ====================

  /**
   * Move selected shape one layer forward
   */
  function bringForward() {
    if (state.selectedIndices.length !== 1) return;
    const i = state.selectedIndices[0];
    if (i >= state.shapes.length - 1) return;

    [state.shapes[i], state.shapes[i + 1]] = [state.shapes[i + 1], state.shapes[i]];
    state.selectedIndices = [i + 1];

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  /**
   * Move selected shape one layer backward
   */
  function sendBackward() {
    if (state.selectedIndices.length !== 1) return;
    const i = state.selectedIndices[0];
    if (i <= 0) return;

    [state.shapes[i], state.shapes[i - 1]] = [state.shapes[i - 1], state.shapes[i]];
    state.selectedIndices = [i - 1];

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  // ==================== FLIP OPERATIONS ====================

  /**
   * Flip selected shapes horizontally
   */
  function flipHorizontal() {
    if (state.selectedIndices.length === 0) return;

    state.selectedIndices.forEach(i => {
      flipShapeHorizontal(state.shapes[i]);
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Flip selected shapes vertically
   */
  function flipVertical() {
    if (state.selectedIndices.length === 0) return;

    state.selectedIndices.forEach(i => {
      flipShapeVertical(state.shapes[i]);
    });

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Flip a single shape horizontally
   */
  function flipShapeHorizontal(shape) {
    const bounds = getShapeBounds(shape, config);
    if (!bounds) return;

    const centerX = bounds.x + bounds.width / 2;

    switch (shape.type) {
      case 'line':
      case 'arrow':
        shape.x1 = 2 * centerX - shape.x1;
        shape.x2 = 2 * centerX - shape.x2;
        if (shape.controlPoint) {
          shape.controlPoint.x = 2 * centerX - shape.controlPoint.x;
        }
        break;

      case 'triangle':
        if (shape.x1 !== undefined) {
          shape.x1 = 2 * centerX - shape.x1;
          shape.x2 = 2 * centerX - shape.x2;
          shape.x3 = 2 * centerX - shape.x3;
        }
        break;

      case 'freehand':
        if (shape.points) {
          shape.points = shape.points.map(p => ({
            x: 2 * centerX - p.x,
            y: p.y
          }));
        }
        break;

      case 'path':
        if (shape.isCompound && shape.children) {
          shape.children.forEach(child => {
            if (child.segments) {
              child.segments.forEach(seg => {
                seg.point[0] = 2 * centerX - seg.point[0];
                if (seg.handleIn) seg.handleIn[0] = -seg.handleIn[0];
                if (seg.handleOut) seg.handleOut[0] = -seg.handleOut[0];
              });
            }
          });
        } else if (shape.segments) {
          shape.segments.forEach(seg => {
            seg.point[0] = 2 * centerX - seg.point[0];
            if (seg.handleIn) seg.handleIn[0] = -seg.handleIn[0];
            if (seg.handleOut) seg.handleOut[0] = -seg.handleOut[0];
          });
        }
        break;

      case 'text':
      case 'image':
      case 'video':
      case 'webcamCapture':
      case 'screenCapture':
        if (!shape.scaleX) shape.scaleX = 1;
        shape.scaleX *= -1;
        break;

      case 'group':
      case 'frame':
        if (shape.children) {
          shape.children.forEach(child => flipShapeHorizontal(child));
        }
        break;

      default:
        if (!shape.scaleX) shape.scaleX = 1;
        shape.scaleX *= -1;
        break;
    }
  }

  /**
   * Flip a single shape vertically
   */
  function flipShapeVertical(shape) {
    const bounds = getShapeBounds(shape, config);
    if (!bounds) return;

    const centerY = bounds.y + bounds.height / 2;

    switch (shape.type) {
      case 'line':
      case 'arrow':
        shape.y1 = 2 * centerY - shape.y1;
        shape.y2 = 2 * centerY - shape.y2;
        if (shape.controlPoint) {
          shape.controlPoint.y = 2 * centerY - shape.controlPoint.y;
        }
        break;

      case 'triangle':
        if (shape.x1 !== undefined) {
          shape.y1 = 2 * centerY - shape.y1;
          shape.y2 = 2 * centerY - shape.y2;
          shape.y3 = 2 * centerY - shape.y3;
        }
        break;

      case 'freehand':
        if (shape.points) {
          shape.points = shape.points.map(p => ({
            x: p.x,
            y: 2 * centerY - p.y
          }));
        }
        break;

      case 'path':
        if (shape.isCompound && shape.children) {
          shape.children.forEach(child => {
            if (child.segments) {
              child.segments.forEach(seg => {
                seg.point[1] = 2 * centerY - seg.point[1];
                if (seg.handleIn) seg.handleIn[1] = -seg.handleIn[1];
                if (seg.handleOut) seg.handleOut[1] = -seg.handleOut[1];
              });
            }
          });
        } else if (shape.segments) {
          shape.segments.forEach(seg => {
            seg.point[1] = 2 * centerY - seg.point[1];
            if (seg.handleIn) seg.handleIn[1] = -seg.handleIn[1];
            if (seg.handleOut) seg.handleOut[1] = -seg.handleOut[1];
          });
        }
        break;

      case 'text':
      case 'image':
      case 'video':
      case 'webcamCapture':
      case 'screenCapture':
        if (!shape.scaleY) shape.scaleY = 1;
        shape.scaleY *= -1;
        break;

      case 'group':
      case 'frame':
        if (shape.children) {
          shape.children.forEach(child => flipShapeVertical(child));
        }
        break;

      default:
        if (!shape.scaleY) shape.scaleY = 1;
        shape.scaleY *= -1;
        break;
    }
  }

  // ==================== FRAME OPERATIONS ====================

  /**
   * Generate a unique frame name
   */
  function generateFrameName() {
    let count = 1;
    const existingNames = state.shapes
      .filter(s => s.type === 'frame')
      .map(s => s.name);

    while (existingNames.includes(`Frame ${count}`)) {
      count++;
    }
    return `Frame ${count}`;
  }

  /**
   * Wrap selected shapes in a new frame
   */
  function wrapSelectionInFrame() {
    if (state.selectedIndices.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const selectedShapes = [];

    state.selectedIndices.forEach(i => {
      const shape = state.shapes[i];
      if (!shape || shape.type === 'frame') return;

      const b = getShapeBounds(shape, config);
      if (b) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        selectedShapes.push({ shape, index: i });
      }
    });

    if (selectedShapes.length === 0) return;

    const padding = 20;
    const frame = {
      id: generateId(),
      type: 'frame',
      name: generateFrameName(),
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
      color: config.theme?.colors?.frameStroke || '#6366f1',
      fillColor: config.theme?.colors?.frameFill || 'transparent',
      visible: true,
      children: [],
      clipContent: true
    };

    // Remove shapes from main array and add to frame
    selectedShapes.sort((a, b) => b.index - a.index);
    selectedShapes.forEach(({ shape, index }) => {
      state.shapes.splice(index, 1);
      shape.parentFrameId = frame.id;
      frame.children.push(shape);
    });

    state.shapes.push(frame);
    state.selectedIndices = [state.shapes.length - 1];

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  /**
   * Toggle clip content for selected frame
   */
  function toggleFrameClipContent() {
    if (state.selectedIndices.length !== 1) return;

    const frame = state.shapes[state.selectedIndices[0]];
    if (frame.type !== 'frame') return;

    frame.clipContent = !frame.clipContent;

    saveState();
    if (typeof window.render === 'function') window.render();
  }

  /**
   * Remove all elements from selected frame (extract them)
   */
  function removeAllFromFrame() {
    if (state.selectedIndices.length !== 1) return;

    const frameIndex = state.selectedIndices[0];
    const frame = state.shapes[frameIndex];
    if (frame.type !== 'frame' || !frame.children?.length) return;

    // Extract children from frame to main shapes array
    frame.children.forEach(child => {
      delete child.parentFrameId;
      state.shapes.push(child);
    });

    frame.children = [];
    state.highlightedFrameIndex = -1;
    state.selectedIndices = [frameIndex];

    saveState();
    if (typeof window.render === 'function') window.render();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
  }

  // ==================== ZOOM OPERATIONS ====================

  /**
   * Zoom in
   */
  function zoomIn() {
    setZoom(state.zoom + (config.zoom?.step || 0.1));
  }

  /**
   * Zoom out
   */
  function zoomOut() {
    setZoom(state.zoom - (config.zoom?.step || 0.1));
  }

  /**
   * Reset zoom to default
   */
  function resetZoom() {
    state.zoom = config.zoom?.default || 1;
    state.panX = 0;
    state.panY = 0;

    if (typeof window.updateZoomDisplay === 'function') window.updateZoomDisplay();
    if (typeof window.render === 'function') window.render();
    if (typeof window.updateScrollToContentButton === 'function') window.updateScrollToContentButton();
  }

  /**
   * Set zoom level
   * @param {number} newZ - New zoom level
   * @param {number} cx - Optional center X for zoom (screen coordinates)
   * @param {number} cy - Optional center Y for zoom (screen coordinates)
   */
  function setZoom(newZ, cx, cy) {
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) return;

    const oldZoom = state.zoom;
    const minZoom = config.zoom?.min || 0.1;
    const maxZoom = config.zoom?.max || 5;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, newZ));

    if (newZoom === oldZoom) return;

    const rect = canvas.getBoundingClientRect();
    const displayScale = state.canvasDisplayScale || 1;

    // In video mode, zoom from mouse position (if provided) or viewport center
    // This allows panning within the zoomed export frame
    if (state.videoMode) {
      // Zoom from mouse position if provided, otherwise from viewport center
      const zoomCenterX = (cx !== undefined) ? (cx - rect.left) / displayScale : canvas.width / 2;
      const zoomCenterY = (cy !== undefined) ? (cy - rect.top) / displayScale : canvas.height / 2;

      // Calculate the canvas coordinate under the zoom center
      const canvasX = (zoomCenterX - state.panX) / oldZoom;
      const canvasY = (zoomCenterY - state.panY) / oldZoom;

      state.zoom = newZoom;

      // Calculate new pan to keep the same canvas point under the zoom center
      state.panX = zoomCenterX - canvasX * newZoom;
      state.panY = zoomCenterY - canvasY * newZoom;

      // Constrain pan to keep the view within the export frame boundaries when zoomed in
      if (newZoom > 1) {
        // Calculate the visible viewport size in canvas coordinates
        const viewportWidth = canvas.width / newZoom;
        const viewportHeight = canvas.height / newZoom;

        // Calculate current viewport position in canvas coordinates
        const viewportLeft = -state.panX / newZoom;
        const viewportTop = -state.panY / newZoom;

        // Constrain so the viewport stays within the export frame (0,0) to (canvas.width, canvas.height)
        const minPanX = canvas.width - canvas.width * newZoom; // leftmost pan (right edge of frame at right edge of viewport)
        const maxPanX = 0; // rightmost pan (left edge of frame at left edge of viewport)
        const minPanY = canvas.height - canvas.height * newZoom; // topmost pan
        const maxPanY = 0; // bottommost pan

        state.panX = Math.max(minPanX, Math.min(maxPanX, state.panX));
        state.panY = Math.max(minPanY, Math.min(maxPanY, state.panY));
      } else {
        // When zoomed out (zoom <= 1), center the export frame
        const frameCenterX = canvas.width / 2;
        const frameCenterY = canvas.height / 2;
        state.panX = frameCenterX * (1 - newZoom);
        state.panY = frameCenterY * (1 - newZoom);
      }
    } else if (cx !== undefined && cy !== undefined) {
      // Canvas mode: zoom from mouse position
      const mouseX = cx - rect.left;
      const mouseY = cy - rect.top;

      const canvasX = (mouseX - state.panX) / oldZoom;
      const canvasY = (mouseY - state.panY) / oldZoom;

      state.zoom = newZoom;

      state.panX = mouseX - canvasX * newZoom;
      state.panY = mouseY - canvasY * newZoom;
    } else {
      // Canvas mode: zoom from center of viewport
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const canvasX = (centerX - state.panX) / oldZoom;
      const canvasY = (centerY - state.panY) / oldZoom;

      state.zoom = newZoom;

      state.panX = centerX - canvasX * newZoom;
      state.panY = centerY - canvasY * newZoom;
    }

    if (typeof window.updateZoomDisplay === 'function') window.updateZoomDisplay();
    if (typeof window.render === 'function') window.render();
    if (typeof window.updateScrollToContentButton === 'function') window.updateScrollToContentButton();
  }

  // ==================== SELECT ALL ====================

  /**
   * Select all shapes
   */
  function selectAll() {
    if (state.shapes.length > 0) {
      state.selectedIndices = state.shapes.map((_, i) => i);
      if (typeof window.render === 'function') window.render();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();
      if (typeof window.showOptionsBar === 'function') window.showOptionsBar();
    }
  }

  // ==================== CLEAR CANVAS ====================

  /**
   * Clear all shapes from canvas
   */
  function clearCanvas() {
    if (confirm('Clear the canvas? This cannot be undone.')) {
      state.shapes = [];
      state.selectedIndices = [];
      state.selectedFrameChildren = [];
      if (typeof window.render === 'function') window.render();
      saveState();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();
      if (typeof window.hideMenuPanel === 'function') window.hideMenuPanel();
      if (typeof window.hideOptionsBar === 'function') window.hideOptionsBar();

      // Update timeline in video mode
      if (state.videoMode && typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
    }
  }

  // ==================== VIEW MODE ====================

  /**
   * Toggle view mode (hide all UI for presentation)
   */
  function toggleViewMode() {
    const viewMode = state.viewModeActive || false;

    const footerControls = document.querySelector('.footer-controls');
    const helpText = document.querySelector('.help-text');

    if (viewMode) {
      state.selectedIndices = [];
      if (typeof window.render === 'function') window.render();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();

      if (footerControls) footerControls.style.display = 'none';
      if (helpText) helpText.style.display = 'none';

      if (typeof window.hideOptionsBar === 'function') window.hideOptionsBar();
      if (typeof window.hideMenuPanel === 'function') window.hideMenuPanel();
      if (typeof window.hideLayersPanel === 'function') window.hideLayersPanel();
    } else {
      if (!state.videoMode) {
        if (footerControls) footerControls.style.display = '';
        if (helpText) helpText.style.display = '';
      }
    }
  }

  /**
   * Handle crop for frame child images via context menu
   */
  function handleContextCropImage() {
    // Check if frame child image/video is selected
    if (state.selectedFrameChildren && state.selectedFrameChildren.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      const child = frame?.children?.[sel.childIndex];
      if (child?.type === 'image' || child?.type === 'video') {
        if (typeof window.enterFrameChildCropMode === 'function') {
          window.enterFrameChildCropMode(sel.frameIndex, sel.childIndex);
        }
        return;
      }
    }

    // Otherwise check main selection
    if (state.selectedIndices.length === 1) {
      const shape = state.shapes[state.selectedIndices[0]];
      if (shape?.type === 'image' || shape?.type === 'video') {
        if (typeof window.enterCropMode === 'function') {
          window.enterCropMode(state.selectedIndices[0]);
        }
      }
    }
  }

  /**
   * Handle removing frame children from frame
   */
  function handleRemoveFromFrame() {
    // If frame children are selected, remove them from frame
    if (state.selectedFrameChildren && state.selectedFrameChildren.length > 0) {
      const shapesToMove = [];

      // Collect shapes to move (in reverse order to preserve indices)
      const sorted = [...state.selectedFrameChildren].sort((a, b) => b.childIndex - a.childIndex);
      sorted.forEach(sel => {
        const frame = state.shapes[sel.frameIndex];
        if (frame && frame.children && frame.children[sel.childIndex]) {
          const child = frame.children.splice(sel.childIndex, 1)[0];
          shapesToMove.unshift(child); // Add to beginning to maintain order
        }
      });

      // Add shapes to main canvas
      const newIndices = [];
      shapesToMove.forEach(shape => {
        state.shapes.push(shape);
        newIndices.push(state.shapes.length - 1);
      });

      // Update selection
      state.selectedFrameChildren = [];
      state.selectedIndices = newIndices;

      if (typeof window.render === 'function') window.render();
      saveState();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();
      if (newIndices.length > 0 && typeof window.showOptionsBar === 'function') {
        window.showOptionsBar();
      }
      return;
    }

    // If a frame is selected, remove all children from it
    if (state.selectedIndices.length === 1) {
      const frame = state.shapes[state.selectedIndices[0]];
      if (frame?.type === 'frame' && frame.children?.length > 0) {
        const newIndices = [];
        while (frame.children.length > 0) {
          const child = frame.children.shift();
          state.shapes.push(child);
          newIndices.push(state.shapes.length - 1);
        }

        state.selectedIndices = newIndices;
        if (typeof window.render === 'function') window.render();
        saveState();
        if (typeof window.renderLayersList === 'function') window.renderLayersList();
        if (newIndices.length > 0 && typeof window.showOptionsBar === 'function') {
          window.showOptionsBar();
        }
      }
    }
  }

  /**
   * Select all elements inside a selected frame
   */
  function selectAllFrameElements() {
    if (state.selectedIndices.length !== 1) return;

    const frame = state.shapes[state.selectedIndices[0]];
    if (frame?.type !== 'frame' || !frame.children?.length) return;

    // Create frame child selection for all children
    state.selectedFrameChildren = frame.children.map((_, childIndex) => ({
      frameIndex: state.selectedIndices[0],
      childIndex
    }));

    if (typeof window.render === 'function') window.render();
    if (typeof window.showOptionsBar === 'function') window.showOptionsBar();
  }

  // Expose functions globally for UI components
  window.deleteSelected = deleteSelected;
  window.duplicateSelected = duplicateSelected;
  window.bringToFront = bringToFront;
  window.sendToBack = sendToBack;
  window.bringForward = bringForward;
  window.sendBackward = sendBackward;
  window.groupSelected = groupSelected;
  window.ungroupSelected = ungroupSelected;
  window.alignLeft = alignLeft;
  window.alignRight = alignRight;
  window.alignTop = alignTop;
  window.alignBottom = alignBottom;
  window.alignCenterH = alignCenterH;
  window.alignCenterV = alignCenterV;
  window.distributeHorizontal = distributeHorizontal;
  window.distributeVertical = distributeVertical;
  window.flipHorizontal = flipHorizontal;
  window.flipVertical = flipVertical;
  window.flipSelectedHorizontal = flipHorizontal;  // Alias for context menu
  window.flipSelectedVertical = flipVertical;      // Alias for context menu
  window.wrapSelectionInFrame = wrapSelectionInFrame;
  window.selectAll = selectAll;
  window.setZoom = setZoom;
  window.zoomIn = zoomIn;
  window.zoomOut = zoomOut;
  window.resetZoom = resetZoom;
  window.clearCanvas = clearCanvas;
  window.toggleViewMode = toggleViewMode;
  window.toggleFrameClipContent = toggleFrameClipContent;
  window.handleContextCropImage = handleContextCropImage;
  window.handleRemoveFromFrame = handleRemoveFromFrame;
  window.selectAllFrameElements = selectAllFrameElements;

  return {
    // Movement
    moveShape,
    moveShapeObj,

    // Transform
    resizeShape,
    rotateShape,

    // Delete
    deleteShapes,
    deleteSelected,

    // Duplicate
    duplicateSelected,

    // Z-order
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,

    // Grouping
    groupSelected,
    ungroupSelected,

    // Visibility
    toggleVisibility,

    // Alignment
    alignLeft,
    alignRight,
    alignTop,
    alignBottom,
    alignCenterH,
    alignCenterV,

    // Distribution
    distributeHorizontal,
    distributeVertical,

    // Flip
    flipHorizontal,
    flipVertical,
    flipShapeHorizontal,
    flipShapeVertical,

    // Frame operations
    wrapSelectionInFrame,
    toggleFrameClipContent,
    removeAllFromFrame,
    generateFrameName,
    handleRemoveFromFrame,
    selectAllFrameElements,

    // Crop
    handleContextCropImage,

    // Zoom
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,

    // Selection
    selectAll,

    // Clear
    clearCanvas,

    // View mode
    toggleViewMode
  };
}

// Singleton instance
let toolsInstance = null;

/**
 * Get or create tools instance
 */
export function getTools() {
  if (!toolsInstance) {
    toolsInstance = useTools();
  }
  return toolsInstance;
}

export default useTools;
