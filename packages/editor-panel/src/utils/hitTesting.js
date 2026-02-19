// editor/utils/hitTesting.js
// Hit testing utilities - pure functions for detecting clicks on shapes

import { getShapeBounds, getResizeHandles, getRotationHandle, getTiltXHandle, getTiltYHandle } from './geometry.js';
import { worldToFrameLocal } from './coordinates.js';

/**
 * Apply inverse tilt transform to a point
 *
 * Canvas operations in renderer:
 *   c.translate(centerX, centerY)
 *   c.transform(1, skewY, skewX, 1, 0, 0)  // skew
 *   c.scale(scaleFromTiltY, scaleFromTiltX) // scale
 *   c.translate(-centerX, -centerY)
 *
 * Canvas transforms accumulate by post-multiplication, so when drawing point P:
 *   P' = T(center) * Skew * Scale * T(-center) * P
 *
 * Reading right-to-left (order applied to point):
 *   1. Translate by -center (move to local coords)
 *   2. Scale
 *   3. Skew
 *   4. Translate by +center (move back to world coords)
 *
 * So the combined 2x2 matrix is M = Skew * Scale (skew applied to scaled point):
 *   Skew = [1,     skewX]    Scale = [scaleY, 0     ]
 *          [skewY, 1    ]            [0,      scaleX]
 *
 *   M = Skew * Scale = [1,     skewX] * [scaleY, 0     ]
 *                      [skewY, 1    ]   [0,      scaleX]
 *
 *     = [scaleY,         skewX * scaleX]
 *       [skewY * scaleY, scaleX        ]
 *
 * @param {number} x - Input X coordinate (in transformed/screen space)
 * @param {number} y - Input Y coordinate (in transformed/screen space)
 * @param {number} centerX - Center X for transform
 * @param {number} centerY - Center Y for transform
 * @param {number} tiltX - Tilt X angle in radians
 * @param {number} tiltY - Tilt Y angle in radians
 * @returns {{x: number, y: number}} Transformed point (in original/untransformed space)
 */
export function applyInverseTiltTransform(x, y, centerX, centerY, tiltX, tiltY) {
  // Calculate the same values as rendering
  const scaleX = Math.max(0.1, Math.cos(tiltX)); // scaleFromTiltX - scales Y axis
  const scaleY = Math.max(0.1, Math.cos(tiltY)); // scaleFromTiltY - scales X axis
  const skewX = Math.sin(tiltX) * 0.5;
  const skewY = Math.sin(tiltY) * 0.5;

  // Translate to center-relative coordinates
  const localX = x - centerX;
  const localY = y - centerY;

  // Combined forward matrix: M = Skew * Scale
  // M = [scaleY,         skewX * scaleX]
  //     [skewY * scaleY, scaleX        ]
  const a = scaleY;
  const b = skewX * scaleX;
  const c = skewY * scaleY;
  const d = scaleX;

  // Determinant: det(M) = a*d - b*c
  const det = a * d - b * c;

  // Guard against near-zero determinant
  if (Math.abs(det) < 0.001) {
    return { x: localX + centerX, y: localY + centerY };
  }

  // Inverse matrix: M^(-1) = (1/det) * [d, -b; -c, a]
  // newX = (d * localX - b * localY) / det
  // newY = (-c * localX + a * localY) / det
  const invDet = 1 / det;
  const newX = invDet * (d * localX - b * localY);
  const newY = invDet * (-c * localX + a * localY);

  // Translate back to world coordinates
  return {
    x: newX + centerX,
    y: newY + centerY
  };
}

/**
 * Check if a point is near a line/arrow shape's actual stroke
 * @param {number} x - Test X coordinate
 * @param {number} y - Test Y coordinate
 * @param {object} shape - Line or arrow shape with x1,y1,x2,y2
 * @param {number} tolerance - Distance tolerance
 * @returns {boolean} True if point is within tolerance of the line stroke
 */
function isPointNearLineStroke(x, y, shape, tolerance) {
  // Handle curved lines with control point
  if (shape.controlPoint) {
    // Sample points along the bezier curve and check distance to each segment
    const cp = shape.controlPoint;
    const samples = 10;

    for (let i = 0; i < samples; i++) {
      const t1 = i / samples;
      const t2 = (i + 1) / samples;

      // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const p1 = getQuadraticBezierPoint(shape.x1, shape.y1, cp.x, cp.y, shape.x2, shape.y2, t1);
      const p2 = getQuadraticBezierPoint(shape.x1, shape.y1, cp.x, cp.y, shape.x2, shape.y2, t2);

      const nearest = nearestPointOnSegmentInternal(x, y, p1.x, p1.y, p2.x, p2.y);
      const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);

      if (dist <= tolerance) return true;
    }
    return false;
  }

  // Straight line - find nearest point on segment
  const nearest = nearestPointOnSegmentInternal(x, y, shape.x1, shape.y1, shape.x2, shape.y2);
  const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
  return dist <= tolerance;
}

/**
 * Get point on quadratic bezier curve at parameter t
 */
function getQuadraticBezierPoint(x0, y0, x1, y1, x2, y2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
    y: mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
  };
}

/**
 * Find nearest point on a line segment (internal helper)
 */
function nearestPointOnSegmentInternal(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return { x: x1, y: y1 };

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return {
    x: x1 + t * dx,
    y: y1 + t * dy
  };
}

/**
 * Apply inverse clip animation transform to test coordinates
 * This converts screen/canvas coordinates back to the shape's local space
 * @param {number} x - Test X coordinate
 * @param {number} y - Test Y coordinate
 * @param {object} shape - Shape to test
 * @param {object} bounds - Shape bounds
 * @returns {{x: number, y: number}} Transformed coordinates
 */
function applyInverseAnimationTransform(x, y, shape, bounds) {
  if (typeof window.calculateClipAnimation !== 'function') {
    return { x, y };
  }

  const animation = window.calculateClipAnimation(shape, bounds);
  if (!animation) {
    return { x, y };
  }

  let testX = x;
  let testY = y;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  // Reverse translation
  if (animation.translateX !== 0 || animation.translateY !== 0) {
    testX -= animation.translateX;
    testY -= animation.translateY;
  }

  // Reverse scale and rotation around center
  if (animation.scale !== 1 || animation.rotation !== 0) {
    // Translate to center
    testX -= centerX;
    testY -= centerY;

    // Reverse rotation
    if (animation.rotation !== 0) {
      const cos = Math.cos(-animation.rotation);
      const sin = Math.sin(-animation.rotation);
      const rx = testX * cos - testY * sin;
      const ry = testX * sin + testY * cos;
      testX = rx;
      testY = ry;
    }

    // Reverse scale
    if (animation.scale !== 1) {
      testX /= animation.scale;
      testY /= animation.scale;
    }

    // Translate back from center
    testX += centerX;
    testY += centerY;
  }

  return { x: testX, y: testY };
}

/**
 * Check if a point is inside a frame's content area (accounting for frame rotation)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @param {object} frame - Frame shape object
 * @returns {boolean} True if point is inside frame
 */
export function isPointInFrame(x, y, frame) {
  if (frame.type !== 'frame') return false;

  // Transform point to frame-local coordinates if frame is rotated
  const localPoint = worldToFrameLocal(x, y, frame);

  return localPoint.x >= frame.x && localPoint.x <= frame.x + frame.width &&
         localPoint.y >= frame.y && localPoint.y <= frame.y + frame.height;
}

/**
 * Hit test for shapes at a given point
 * Returns shape index, or object with frameIndex/childIndex for frame children
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} state - Editor state with shapes, zoom, canvasDisplayScale, videoMode, currentTime
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context (for text measurement)
 * @param {function} isShapeVisibleAtTime - Optional function to check visibility in video mode
 * @returns {number|{frameIndex: number, childIndex: number, isFrameChild: boolean}|-1}
 */
export function hitTest(x, y, state, config = {}, ctx = null, isShapeVisibleAtTime = null) {
  // Calculate scaled tolerance for consistent screen-space hit area
  const displayScale = state.canvasDisplayScale || 1;
  const zoomScale = 1 / (state.zoom || 1) / displayScale;
  const hitTolerance = 5 * zoomScale;

  // First check frame children (they should be on top of frame itself)
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const shape = state.shapes[i];
    if (shape.type === 'frame' && shape.children && shape.visible !== false) {
      // In video mode, skip frames not visible at current time
      if (state.videoMode && isShapeVisibleAtTime) {
        if (!isShapeVisibleAtTime(shape, state.currentTime)) continue;
      }

      // Transform test point to frame-local coordinates
      const localPoint = worldToFrameLocal(x, y, shape);

      // If clipContent is enabled, only allow hitting children if click is within frame bounds
      // This prevents selecting clipped/hidden parts of children that extend beyond the frame
      // Note: localPoint is in world coordinates (just rotated for frame rotation), not frame-local
      if (shape.clipContent) {
        const isInsideFrame = localPoint.x >= shape.x && localPoint.x <= shape.x + shape.width &&
                              localPoint.y >= shape.y && localPoint.y <= shape.y + shape.height;
        if (!isInsideFrame) {
          // Click is outside frame bounds, skip checking children for this frame
          continue;
        }
      }

      // Check children in reverse order (top to bottom)
      for (let j = shape.children.length - 1; j >= 0; j--) {
        const child = shape.children[j];
        if (child.visible === false) continue;
        const b = getShapeBounds(child, config, ctx);
        if (!b) continue;

        // Apply inverse transforms - when transforms share the same center and chain as
        // T(c) * X * T(-c) * T(c) * Y * T(-c) = T(c) * X * Y * T(-c), the inverse order is
        // the SAME as forward order: Rotation -> Flip -> Tilt
        let testX = localPoint.x, testY = localPoint.y;
        const centerX = b.x + b.width / 2;
        const centerY = b.y + b.height / 2;

        // 1. Rotation inverse FIRST
        if (child.rotation) {
          const cos = Math.cos(-child.rotation);
          const sin = Math.sin(-child.rotation);
          const dx = testX - centerX;
          const dy = testY - centerY;
          testX = centerX + dx * cos - dy * sin;
          testY = centerY + dx * sin + dy * cos;
        }

        // 2. Flip inverse (scale inverse is self-inverse for -1 values)
        if (child.scaleX === -1 || child.scaleY === -1) {
          testX = centerX + (testX - centerX) * (child.scaleX || 1);
          testY = centerY + (testY - centerY) * (child.scaleY || 1);
        }

        // 3. Tilt inverse LAST
        if (child.tiltX || child.tiltY) {
          const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, child.tiltX || 0, child.tiltY || 0);
          testX = transformed.x;
          testY = transformed.y;
        }

        // Special handling for line/arrow children - use stroke-based hit detection
        if (child.type === 'line' || child.type === 'arrow') {
          const strokeWidth = child.strokeWidth || 2;
          const lineTolerance = Math.max(hitTolerance, strokeWidth / 2 + hitTolerance);

          if (isPointNearLineStroke(testX, testY, child, lineTolerance)) {
            return { frameIndex: i, childIndex: j, isFrameChild: true };
          }
          continue; // Skip bounding box check for lines
        }

        // Bounding box check for other children
        if (testX >= b.x - hitTolerance && testX <= b.x + b.width + hitTolerance &&
            testY >= b.y - hitTolerance && testY <= b.y + b.height + hitTolerance) {
          // Return special indicator for frame child
          return { frameIndex: i, childIndex: j, isFrameChild: true };
        }
      }
    }
  }

  // Check group children if in group mode
  if (state.activeGroupIndex >= 0) {
    const group = state.shapes[state.activeGroupIndex];
    if (group?.type === 'group' && group.children) {
      // Check children in reverse order (top to bottom)
      for (let j = group.children.length - 1; j >= 0; j--) {
        const child = group.children[j];
        if (child.visible === false) continue;
        const b = getShapeBounds(child, config, ctx);
        if (!b) continue;

        // Apply inverse transforms - when transforms share the same center and chain as
        // T(c) * X * T(-c) * T(c) * Y * T(-c) = T(c) * X * Y * T(-c), the inverse order is
        // the SAME as forward order: Rotation -> Flip -> Tilt
        let testX = x, testY = y;
        const centerX = b.x + b.width / 2;
        const centerY = b.y + b.height / 2;

        // 1. Rotation inverse FIRST
        if (child.rotation) {
          const cos = Math.cos(-child.rotation);
          const sin = Math.sin(-child.rotation);
          const dx = testX - centerX;
          const dy = testY - centerY;
          testX = centerX + dx * cos - dy * sin;
          testY = centerY + dx * sin + dy * cos;
        }

        // 2. Flip inverse (scale inverse is self-inverse for -1 values)
        if (child.scaleX === -1 || child.scaleY === -1) {
          testX = centerX + (testX - centerX) * (child.scaleX || 1);
          testY = centerY + (testY - centerY) * (child.scaleY || 1);
        }

        // 3. Tilt inverse LAST
        if (child.tiltX || child.tiltY) {
          const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, child.tiltX || 0, child.tiltY || 0);
          testX = transformed.x;
          testY = transformed.y;
        }

        // Special handling for line/arrow children
        if (child.type === 'line' || child.type === 'arrow') {
          const strokeWidth = child.strokeWidth || 2;
          const lineTolerance = Math.max(hitTolerance, strokeWidth / 2 + hitTolerance);

          if (isPointNearLineStroke(testX, testY, child, lineTolerance)) {
            return { groupIndex: state.activeGroupIndex, childIndex: j, isGroupChild: true };
          }
          continue;
        }

        // Bounding box check
        if (testX >= b.x - hitTolerance && testX <= b.x + b.width + hitTolerance &&
            testY >= b.y - hitTolerance && testY <= b.y + b.height + hitTolerance) {
          return { groupIndex: state.activeGroupIndex, childIndex: j, isGroupChild: true };
        }
      }
    }
  }

  // Then check main shapes
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const shape = state.shapes[i];
    if (shape.visible === false) continue;

    // In video mode, skip shapes not visible at current time
    if (state.videoMode && isShapeVisibleAtTime) {
      if (!isShapeVisibleAtTime(shape, state.currentTime)) continue;
    }

    const b = getShapeBounds(shape, config, ctx);
    if (!b) continue;

    // Apply inverse transforms - when transforms share the same center and chain as
    // T(c) * X * T(-c) * T(c) * Y * T(-c) = T(c) * X * Y * T(-c), the inverse order is
    // the SAME as forward order: Rotation -> Flip -> Tilt (then Animation)
    let testX = x, testY = y;
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;

    // 1. Rotation inverse FIRST
    if (shape.rotation) {
      const cos = Math.cos(-shape.rotation);
      const sin = Math.sin(-shape.rotation);
      const dx = testX - centerX;
      const dy = testY - centerY;
      testX = centerX + dx * cos - dy * sin;
      testY = centerY + dx * sin + dy * cos;
    }

    // 2. Flip inverse (scale inverse is self-inverse for -1 values)
    if (shape.scaleX === -1 || shape.scaleY === -1) {
      testX = centerX + (testX - centerX) * (shape.scaleX || 1);
      testY = centerY + (testY - centerY) * (shape.scaleY || 1);
    }

    // 3. Tilt inverse LAST
    if (shape.tiltX || shape.tiltY) {
      const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, shape.tiltX || 0, shape.tiltY || 0);
      testX = transformed.x;
      testY = transformed.y;
    }

    // 4. Animation inverse (separate transform, applied first in forward)
    const animTransformed = applyInverseAnimationTransform(testX, testY, shape, b);
    testX = animTransformed.x;
    testY = animTransformed.y;

    // Special handling for line/arrow shapes - use stroke-based hit detection
    if (shape.type === 'line' || shape.type === 'arrow') {
      // Use larger tolerance for lines to account for stroke width
      const strokeWidth = shape.strokeWidth || 2;
      const lineTolerance = Math.max(hitTolerance, strokeWidth / 2 + hitTolerance);

      if (isPointNearLineStroke(testX, testY, shape, lineTolerance)) {
        return i;
      }
      continue; // Skip bounding box check for lines
    }

    // Bounding box check for other shapes
    if (testX >= b.x - hitTolerance && testX <= b.x + b.width + hitTolerance &&
        testY >= b.y - hitTolerance && testY <= b.y + b.height + hitTolerance) {
      return i;
    }
  }
  return -1;
}

/**
 * Simple hit test that only returns index (for backward compatibility)
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} state - Editor state
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {function} isShapeVisibleAtTime - Optional visibility function
 * @returns {number} Shape index or -1
 */
export function hitTestSimple(x, y, state, config = {}, ctx = null, isShapeVisibleAtTime = null) {
  const result = hitTest(x, y, state, config, ctx, isShapeVisibleAtTime);
  if (typeof result === 'object' && result.isFrameChild) {
    return result.frameIndex; // Return frame index if child is hit
  }
  return result;
}

/**
 * Hit test specifically for frame label (accounting for frame rotation)
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} state - Editor state with shapes
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context (for measuring label width)
 * @returns {number} Frame index or -1
 */
export function hitTestFrameLabel(x, y, state, config = {}, ctx = null) {
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const shape = state.shapes[i];
    if (shape.type !== 'frame' || shape.visible === false) continue;

    // Transform point to frame-local coordinates if frame is rotated
    const localPoint = worldToFrameLocal(x, y, shape);

    const labelFontSize = config.frame?.labelFontSize || 12;
    const labelPadding = config.frame?.labelPadding || 4;
    const labelOffset = config.frame?.labelOffset || 2;

    // Measure label width if context available
    let labelWidth = 100; // Default
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      labelWidth = ctx.measureText(shape.name || 'Frame').width + labelPadding * 2;
      ctx.restore();
    }

    const labelHeight = labelFontSize + labelPadding * 2;
    const labelX = shape.x;
    const labelY = shape.y - labelHeight - labelOffset;

    if (localPoint.x >= labelX && localPoint.x <= labelX + labelWidth &&
        localPoint.y >= labelY && localPoint.y <= labelY + labelHeight) {
      return i;
    }
  }
  return -1;
}

/**
 * Check if a shape type is an FX clip (no canvas representation)
 */
function isFxClipType(type) {
  return type === 'effect' || type === 'filter' || type === 'transition';
}

/**
 * Hit test for resize/rotate handles on selection
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} state - Editor state with selectedIndices, shapes
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {string|null} Handle name ('nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate') or null
 */
export function hitTestHandle(x, y, state, config = {}, ctx = null) {
  if (state.selectedIndices.length === 0) return null;

  // Filter out FX clips (effect/filter/transition) - they have no canvas representation
  const canvasIndices = state.selectedIndices.filter(i => {
    const shape = state.shapes[i];
    return shape && !isFxClipType(shape.type);
  });

  if (canvasIndices.length === 0) return null;

  let b, rotation = 0, shape = null;

  if (canvasIndices.length === 1) {
    shape = state.shapes[canvasIndices[0]];
    b = getShapeBounds(shape, config, ctx);
    rotation = shape.rotation || 0;
  } else {
    // Multi-selection - use combined bounds (filtered)
    b = getMultiSelectionBoundsFiltered(state, canvasIndices, config, ctx);
  }

  if (!b) return null;

  // Scale thresholds by zoom and display scale to keep consistent screen-space hit areas
  const displayScale = state.canvasDisplayScale || 1;
  const zoomScale = 1 / (state.zoom || 1) / displayScale;
  const handleThreshold = 8 * zoomScale;
  const cornerThreshold = 6 * zoomScale;
  const edgeThreshold = 8 * zoomScale;
  const padding = 6 * zoomScale;
  const rotationHandleOffset = config.selection?.rotationHandleOffset || 25;

  // Check rotation handle first
  const rotHandle = getRotationHandle(b, padding, rotationHandleOffset);

  // Apply inverse transforms - when transforms share the same center and chain as
  // T(c) * X * T(-c) * T(c) * Y * T(-c) = T(c) * X * Y * T(-c), the inverse order is
  // the SAME as forward order: Rotation -> Flip -> Tilt (then Animation)
  let testX = x, testY = y;
  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;

  // 1. Rotation inverse FIRST
  if (rotation) {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const dx = testX - centerX;
    const dy = testY - centerY;
    testX = centerX + dx * cos - dy * sin;
    testY = centerY + dx * sin + dy * cos;
  }

  // 2. Flip inverse (scale inverse is self-inverse for -1 values)
  if (shape && (shape.scaleX === -1 || shape.scaleY === -1)) {
    testX = centerX + (testX - centerX) * (shape.scaleX || 1);
    testY = centerY + (testY - centerY) * (shape.scaleY || 1);
  }

  // 3. Tilt inverse LAST
  if (shape && (shape.tiltX || shape.tiltY)) {
    const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, shape.tiltX || 0, shape.tiltY || 0);
    testX = transformed.x;
    testY = transformed.y;
  }

  // 4. Animation inverse (separate transform, applied first in forward)
  if (shape) {
    const animTransformed = applyInverseAnimationTransform(testX, testY, shape, b);
    testX = animTransformed.x;
    testY = animTransformed.y;
  }

  // Check rotation handle
  if (testX >= rotHandle.x - handleThreshold && testX <= rotHandle.x + handleThreshold &&
      testY >= rotHandle.y - handleThreshold && testY <= rotHandle.y + handleThreshold) {
    return 'rotate';
  }

  // Check tilt handles (only for single selection)
  if (canvasIndices.length === 1) {
    const tiltXHandle = getTiltXHandle(b, padding, rotationHandleOffset);
    const tiltYHandle = getTiltYHandle(b, padding, rotationHandleOffset);

    // TiltX handle (left side - tilts forward/backward)
    if (testX >= tiltXHandle.x - handleThreshold && testX <= tiltXHandle.x + handleThreshold &&
        testY >= tiltXHandle.y - handleThreshold && testY <= tiltXHandle.y + handleThreshold) {
      return 'tiltX';
    }

    // TiltY handle (bottom side - tilts left/right)
    if (testX >= tiltYHandle.x - handleThreshold && testX <= tiltYHandle.x + handleThreshold &&
        testY >= tiltYHandle.y - handleThreshold && testY <= tiltYHandle.y + handleThreshold) {
      return 'tiltY';
    }
  }

  // Check corner handles first (they take priority)
  const handles = getResizeHandles(b, padding);
  const corners = ['nw', 'ne', 'se', 'sw'];
  for (const name of corners) {
    const pos = handles[name];
    if (testX >= pos.x - cornerThreshold && testX <= pos.x + cornerThreshold &&
        testY >= pos.y - cornerThreshold && testY <= pos.y + cornerThreshold) return name;
  }

  // Check edges (entire side is draggable)
  const left = b.x - padding;
  const right = b.x + b.width + padding;
  const top = b.y - padding;
  const bottom = b.y + b.height + padding;

  // North edge (top)
  if (testY >= top - edgeThreshold && testY <= top + edgeThreshold &&
      testX >= left + edgeThreshold && testX <= right - edgeThreshold) {
    return 'n';
  }
  // South edge (bottom)
  if (testY >= bottom - edgeThreshold && testY <= bottom + edgeThreshold &&
      testX >= left + edgeThreshold && testX <= right - edgeThreshold) {
    return 's';
  }
  // West edge (left)
  if (testX >= left - edgeThreshold && testX <= left + edgeThreshold &&
      testY >= top + edgeThreshold && testY <= bottom - edgeThreshold) {
    return 'w';
  }
  // East edge (right)
  if (testX >= right - edgeThreshold && testX <= right + edgeThreshold &&
      testY >= top + edgeThreshold && testY <= bottom - edgeThreshold) {
    return 'e';
  }

  return null;
}

/**
 * Hit test handles for a given bounds (used for frame children)
 * Properly accounts for both child rotation and frame rotation
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} bounds - Bounding box
 * @param {number} childRotation - Child's own rotation
 * @param {number} frameIndex - Index of parent frame (-1 if not in frame)
 * @param {object} state - Editor state
 * @param {object} config - Editor config
 * @param {object} childShape - Optional child shape (for tilt support)
 * @returns {string|null} Handle name or null
 */
export function hitTestHandleForBounds(x, y, bounds, childRotation = 0, frameIndex = -1, state = {}, config = {}, childShape = null) {
  if (!bounds) return null;

  // Scale thresholds by zoom and display scale to keep consistent screen-space hit areas
  const displayScale = state.canvasDisplayScale || 1;
  const zoomScale = 1 / (state.zoom || 1) / displayScale;
  const handleThreshold = 8 * zoomScale;
  const cornerThreshold = 6 * zoomScale;
  const edgeThreshold = 8 * zoomScale;
  const padding = 6 * zoomScale;
  const rotationHandleOffset = config.selection?.rotationHandleOffset || 25;

  // Get frame rotation if frame index provided
  let frame = null;
  if (frameIndex >= 0 && state.shapes) {
    frame = state.shapes[frameIndex];
  }

  // Apply inverse transforms - when transforms share the same center and chain as
  // T(c) * X * T(-c) * T(c) * Y * T(-c) = T(c) * X * Y * T(-c), the inverse order is
  // the SAME as forward order: Rotation -> Flip -> Tilt (then Frame for frame children)
  let testX = x, testY = y;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  // 1. Child rotation inverse FIRST
  if (childRotation) {
    const cos = Math.cos(-childRotation);
    const sin = Math.sin(-childRotation);
    const dx = testX - centerX;
    const dy = testY - centerY;
    testX = centerX + dx * cos - dy * sin;
    testY = centerY + dx * sin + dy * cos;
  }

  // 2. Flip inverse (scale inverse is self-inverse for -1 values)
  if (childShape && (childShape.scaleX === -1 || childShape.scaleY === -1)) {
    testX = centerX + (testX - centerX) * (childShape.scaleX || 1);
    testY = centerY + (testY - centerY) * (childShape.scaleY || 1);
  }

  // 3. Tilt inverse
  if (childShape && (childShape.tiltX || childShape.tiltY)) {
    const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, childShape.tiltX || 0, childShape.tiltY || 0);
    testX = transformed.x;
    testY = transformed.y;
  }

  // 4. Frame transform inverse LAST (for frame children only)
  if (frame?.rotation) {
    const localPoint = worldToFrameLocal(testX, testY, frame);
    testX = localPoint.x;
    testY = localPoint.y;
  }

  // Check rotation handle
  const rotHandle = getRotationHandle(bounds, padding, rotationHandleOffset);
  if (testX >= rotHandle.x - handleThreshold && testX <= rotHandle.x + handleThreshold &&
      testY >= rotHandle.y - handleThreshold && testY <= rotHandle.y + handleThreshold) {
    return 'rotate';
  }

  // Check tilt handles
  const tiltXHandle = getTiltXHandle(bounds, padding, rotationHandleOffset);
  const tiltYHandle = getTiltYHandle(bounds, padding, rotationHandleOffset);

  // TiltX handle (left side - tilts forward/backward)
  if (testX >= tiltXHandle.x - handleThreshold && testX <= tiltXHandle.x + handleThreshold &&
      testY >= tiltXHandle.y - handleThreshold && testY <= tiltYHandle.y + handleThreshold) {
    return 'tiltX';
  }

  // TiltY handle (bottom side - tilts left/right)
  if (testX >= tiltYHandle.x - handleThreshold && testX <= tiltYHandle.x + handleThreshold &&
      testY >= tiltYHandle.y - handleThreshold && testY <= tiltYHandle.y + handleThreshold) {
    return 'tiltY';
  }

  // Check corner handles first (they take priority)
  const handles = getResizeHandles(bounds, padding);
  const corners = ['nw', 'ne', 'se', 'sw'];
  for (const name of corners) {
    const pos = handles[name];
    if (testX >= pos.x - cornerThreshold && testX <= pos.x + cornerThreshold &&
        testY >= pos.y - cornerThreshold && testY <= pos.y + cornerThreshold) return name;
  }

  // Check edges (entire side is draggable)
  const left = bounds.x - padding;
  const right = bounds.x + bounds.width + padding;
  const top = bounds.y - padding;
  const bottom = bounds.y + bounds.height + padding;

  // North edge (top)
  if (testY >= top - edgeThreshold && testY <= top + edgeThreshold &&
      testX >= left + edgeThreshold && testX <= right - edgeThreshold) {
    return 'n';
  }
  // South edge (bottom)
  if (testY >= bottom - edgeThreshold && testY <= bottom + edgeThreshold &&
      testX >= left + edgeThreshold && testX <= right - edgeThreshold) {
    return 's';
  }
  // West edge (left)
  if (testX >= left - edgeThreshold && testX <= left + edgeThreshold &&
      testY >= top + edgeThreshold && testY <= bottom - edgeThreshold) {
    return 'w';
  }
  // East edge (right)
  if (testX >= right - edgeThreshold && testX <= right + edgeThreshold &&
      testY >= top + edgeThreshold && testY <= bottom - edgeThreshold) {
    return 'e';
  }

  return null;
}

/**
 * Hit test for control point handles on curved lines
 * Properly accounts for frame rotation for frame children
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @param {object} shape - Line or arrow shape
 * @param {number} frameIndex - Index of parent frame (-1 if not in frame)
 * @param {object} state - Editor state
 * @param {object} config - Editor config
 * @returns {string|null} 'cp' if control point hit, null otherwise
 */
export function hitTestControlPoint(x, y, shape, frameIndex = -1, state = {}, config = {}) {
  if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) return null;

  // Transform test point if inside a rotated frame
  let testX = x, testY = y;
  if (frameIndex >= 0 && state.shapes) {
    const frame = state.shapes[frameIndex];
    if (frame?.rotation) {
      const localPoint = worldToFrameLocal(x, y, frame);
      testX = localPoint.x;
      testY = localPoint.y;
    }
  }

  // Also account for shape's own rotation
  if (shape.rotation) {
    const b = getShapeBounds(shape, config, null);
    if (b) {
      const centerX = b.x + b.width / 2;
      const centerY = b.y + b.height / 2;
      const cos = Math.cos(-shape.rotation);
      const sin = Math.sin(-shape.rotation);
      const dx = testX - centerX;
      const dy = testY - centerY;
      testX = centerX + dx * cos - dy * sin;
      testY = centerY + dx * sin + dy * cos;
    }
  }

  // Use existing control point or midpoint
  const cp = shape.controlPoint || {
    x: (shape.x1 + shape.x2) / 2,
    y: (shape.y1 + shape.y2) / 2
  };
  const handleSize = config.controlPoint?.handleSize || 8;

  // Scale tolerance by zoom and display scale for consistent screen-space hit area
  const displayScale = state.canvasDisplayScale || 1;
  const zoomScale = 1 / (state.zoom || 1) / displayScale;
  const tolerance = (handleSize + 4) * zoomScale;

  // Check if point is near control point
  const dist = Math.sqrt((testX - cp.x) * (testX - cp.x) + (testY - cp.y) * (testY - cp.y));
  if (dist <= tolerance) {
    return 'cp';
  }

  return null;
}

/**
 * Hit test arrow/line endpoints
 * Returns 'start' if near x1,y1 or 'end' if near x2,y2
 * @param {number} x - Test X coordinate
 * @param {number} y - Test Y coordinate
 * @param {object} shape - Arrow or line shape
 * @param {object} state - Editor state
 * @param {object} config - Editor config
 * @returns {string|null} 'start', 'end', or null
 */
export function hitTestArrowEndpoint(x, y, shape, state = {}, config = {}) {
  if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) return null;

  // Scale threshold by zoom and display scale
  const displayScale = state.canvasDisplayScale || 1;
  const zoomScale = 1 / (state.zoom || 1) / displayScale;
  // Use selection handle size from config for consistent hit area with visual size
  const selConfig = config.selection || {};
  const handleSize = selConfig.handleSize || 8;
  // Add a small buffer for easier hitting
  const threshold = (handleSize / 2 + 4) * zoomScale;

  // Check start point (x1, y1)
  const distStart = Math.sqrt((x - shape.x1) ** 2 + (y - shape.y1) ** 2);
  if (distStart <= threshold) return 'start';

  // Check end point (x2, y2)
  const distEnd = Math.sqrt((x - shape.x2) ** 2 + (y - shape.y2) ** 2);
  if (distEnd <= threshold) return 'end';

  return null;
}

/**
 * Find the nearest point on a shape's edge to a given point
 * @param {number} x - Test X coordinate
 * @param {number} y - Test Y coordinate
 * @param {object} shape - Target shape
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {object|null} { x, y, shapeId } or null
 */
export function findNearestPointOnShape(x, y, shape, config = {}, ctx = null) {
  if (!shape) return null;

  // Skip non-connectable shapes
  const nonConnectable = ['line', 'arrow', 'audio', 'effect', 'filter', 'transition', 'viewportKeyframe', 'cursor'];
  if (nonConnectable.includes(shape.type)) return null;

  const bounds = getShapeBounds(shape, config, ctx);
  if (!bounds) return null;

  // For different shape types, find nearest edge point
  switch (shape.type) {
    case 'rect':
    case 'image':
    case 'video':
    case 'text':
    case 'frame': {
      // Find nearest point on rectangle edges (4 line segments)
      const left = bounds.x;
      const right = bounds.x + bounds.width;
      const top = bounds.y;
      const bottom = bounds.y + bounds.height;

      // Define the 4 edges as line segments
      const edges = [
        { x1: left, y1: top, x2: right, y2: top },       // top edge
        { x1: right, y1: top, x2: right, y2: bottom },   // right edge
        { x1: right, y1: bottom, x2: left, y2: bottom }, // bottom edge
        { x1: left, y1: bottom, x2: left, y2: top }      // left edge
      ];

      // Find nearest point across all edges
      let nearestPoint = null;
      let minDist = Infinity;

      for (const edge of edges) {
        const nearest = nearestPointOnSegment(x, y, edge.x1, edge.y1, edge.x2, edge.y2);
        const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          nearestPoint = nearest;
        }
      }

      if (nearestPoint) {
        return { x: nearestPoint.x, y: nearestPoint.y, shapeId: shape.id };
      }
      return null;
    }

    case 'circle': {
      // Find nearest point on circle circumference
      const cx = shape.x;
      const cy = shape.y;
      const r = shape.radius;
      const angle = Math.atan2(y - cy, x - cx);
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        shapeId: shape.id
      };
    }

    case 'ellipse': {
      // Find nearest point on ellipse (approximate)
      const cx = shape.x;
      const cy = shape.y;
      const rx = shape.radiusX || shape.radius || 50;
      const ry = shape.radiusY || shape.radius || 30;
      const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
      return {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        shapeId: shape.id
      };
    }

    case 'diamond': {
      // Find nearest point on diamond edges
      const cx = shape.x;
      const cy = shape.y;
      const hw = (shape.width || 60) / 2;
      const hh = (shape.height || 60) / 2;

      // Diamond vertices: top, right, bottom, left
      const vertices = [
        { x: cx, y: cy - hh },     // top
        { x: cx + hw, y: cy },     // right
        { x: cx, y: cy + hh },     // bottom
        { x: cx - hw, y: cy }      // left
      ];

      // Find nearest point on diamond edges
      let nearestPoint = null;
      let minDist = Infinity;

      for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        const nearest = nearestPointOnSegment(x, y, v1.x, v1.y, v2.x, v2.y);
        const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          nearestPoint = nearest;
        }
      }

      if (nearestPoint) {
        return { x: nearestPoint.x, y: nearestPoint.y, shapeId: shape.id };
      }
      break;
    }

    case 'triangle': {
      let vertices;
      if (shape.x1 !== undefined) {
        vertices = [
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 },
          { x: shape.x3, y: shape.y3 }
        ];
      } else {
        // Default triangle
        const ts = shape.size || 60;
        const th = ts * Math.sqrt(3) / 2;
        vertices = [
          { x: shape.x, y: shape.y - th * 2 / 3 },
          { x: shape.x - ts / 2, y: shape.y + th / 3 },
          { x: shape.x + ts / 2, y: shape.y + th / 3 }
        ];
      }

      let nearestPoint = null;
      let minDist = Infinity;

      for (let i = 0; i < 3; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 3];
        const nearest = nearestPointOnSegment(x, y, v1.x, v1.y, v2.x, v2.y);
        const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          nearestPoint = nearest;
        }
      }

      if (nearestPoint) {
        return { x: nearestPoint.x, y: nearestPoint.y, shapeId: shape.id };
      }
      break;
    }

    case 'path': {
      // Path shapes have segments array with bezier control points
      // Format: segments[].point: [x, y], handleIn: [x, y], handleOut: [x, y]
      if (!shape.segments || shape.segments.length < 2) {
        // Fallback to bounding box edges
        return findNearestPointOnBounds(x, y, bounds, shape.id);
      }

      let nearestPoint = null;
      let minDist = Infinity;

      // Iterate through path segments
      for (let i = 0; i < shape.segments.length - 1; i++) {
        const s1 = shape.segments[i];
        const s2 = shape.segments[i + 1];

        // Sample points along the bezier curve for approximation
        const samples = 20;
        for (let s = 0; s < samples; s++) {
          const t1 = s / samples;
          const t2 = (s + 1) / samples;

          const p1 = getBezierPointFromSegments(s1, s2, t1);
          const p2 = getBezierPointFromSegments(s1, s2, t2);

          const nearest = nearestPointOnSegment(x, y, p1.x, p1.y, p2.x, p2.y);
          const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            nearestPoint = nearest;
          }
        }
      }

      // If path is closed, also check the closing segment
      if (shape.closed && shape.segments.length >= 2) {
        const s1 = shape.segments[shape.segments.length - 1];
        const s2 = shape.segments[0];

        const samples = 20;
        for (let s = 0; s < samples; s++) {
          const t1 = s / samples;
          const t2 = (s + 1) / samples;

          const p1 = getBezierPointFromSegments(s1, s2, t1);
          const p2 = getBezierPointFromSegments(s1, s2, t2);

          const nearest = nearestPointOnSegment(x, y, p1.x, p1.y, p2.x, p2.y);
          const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            nearestPoint = nearest;
          }
        }
      }

      if (nearestPoint) {
        return { x: nearestPoint.x, y: nearestPoint.y, shapeId: shape.id };
      }
      break;
    }

    case 'group':
    case 'freehand':
    case 'screenCapture':
    case 'webcamCapture': {
      // For these shapes, snap to bounding box edges (like rectangles)
      return findNearestPointOnBounds(x, y, bounds, shape.id);
    }

    default:
      // For other shapes, use center of bounds
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        shapeId: shape.id
      };
  }

  return null;
}

/**
 * Helper: Find nearest point on bounding box edges
 */
function findNearestPointOnBounds(x, y, bounds, shapeId) {
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;

  const edges = [
    { x1: left, y1: top, x2: right, y2: top },
    { x1: right, y1: top, x2: right, y2: bottom },
    { x1: right, y1: bottom, x2: left, y2: bottom },
    { x1: left, y1: bottom, x2: left, y2: top }
  ];

  let nearestPoint = null;
  let minDist = Infinity;

  for (const edge of edges) {
    const nearest = nearestPointOnSegment(x, y, edge.x1, edge.y1, edge.x2, edge.y2);
    const dist = Math.sqrt((x - nearest.x) ** 2 + (y - nearest.y) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearestPoint = nearest;
    }
  }

  return nearestPoint ? { x: nearestPoint.x, y: nearestPoint.y, shapeId } : null;
}

/**
 * Helper: Get point on cubic bezier curve at parameter t (for segments format)
 * Segments use point: [x, y], handleIn: [x, y], handleOut: [x, y]
 */
function getBezierPointFromSegments(s1, s2, t) {
  // s1 = start segment with handleOut, s2 = end segment with handleIn
  const p0 = { x: s1.point[0], y: s1.point[1] };
  const p1 = s1.handleOut ? { x: s1.point[0] + s1.handleOut[0], y: s1.point[1] + s1.handleOut[1] } : p0;
  const p3 = { x: s2.point[0], y: s2.point[1] };
  const p2 = s2.handleIn ? { x: s2.point[0] + s2.handleIn[0], y: s2.point[1] + s2.handleIn[1] } : p3;

  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

/**
 * Helper: Find nearest point on a line segment
 */
function nearestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return { x: x1, y: y1 };

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return {
    x: x1 + t * dx,
    y: y1 + t * dy
  };
}

/**
 * Get the relative edge position for a point on a shape
 * Returns edge identifier and t (0-1) position along that edge
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {object} shape - Target shape
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {object|null} { edge, t, shapeId } or null
 */
export function getRelativeEdgePosition(x, y, shape, config = {}, ctx = null) {
  if (!shape) return null;
  if (shape.type === 'line' || shape.type === 'arrow') return null;

  const bounds = getShapeBounds(shape, config, ctx);
  if (!bounds) return null;

  switch (shape.type) {
    case 'rect':
    case 'image':
    case 'video':
    case 'text':
    case 'frame':
    case 'group':
    case 'freehand':
    case 'screenCapture':
    case 'webcamCapture': {
      // For rectangular shapes and shapes with bounding boxes, use edge-based positioning
      const left = bounds.x;
      const right = bounds.x + bounds.width;
      const top = bounds.y;
      const bottom = bounds.y + bounds.height;

      const edges = [
        { name: 'top', x1: left, y1: top, x2: right, y2: top },
        { name: 'right', x1: right, y1: top, x2: right, y2: bottom },
        { name: 'bottom', x1: right, y1: bottom, x2: left, y2: bottom },
        { name: 'left', x1: left, y1: bottom, x2: left, y2: top }
      ];

      let bestEdge = null;
      let bestT = 0;
      let minDist = Infinity;

      for (const edge of edges) {
        const dx = edge.x2 - edge.x1;
        const dy = edge.y2 - edge.y1;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - edge.x1) * dx + (y - edge.y1) * dy) / lengthSq));
        const nearX = edge.x1 + t * dx;
        const nearY = edge.y1 + t * dy;
        const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);

        if (dist < minDist) {
          minDist = dist;
          bestEdge = edge.name;
          bestT = t;
        }
      }

      return { edge: bestEdge, t: bestT, shapeId: shape.id };
    }

    case 'circle': {
      const cx = shape.x;
      const cy = shape.y;
      const angle = Math.atan2(y - cy, x - cx);
      // Normalize angle to 0-1 range (0 = right, going counter-clockwise)
      const t = (angle + Math.PI) / (2 * Math.PI);
      return { edge: 'circumference', t, shapeId: shape.id };
    }

    case 'ellipse': {
      const cx = shape.x;
      const cy = shape.y;
      const rx = shape.radiusX || shape.radius || 50;
      const ry = shape.radiusY || shape.radius || 30;
      const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
      const t = (angle + Math.PI) / (2 * Math.PI);
      return { edge: 'circumference', t, shapeId: shape.id };
    }

    case 'diamond': {
      const cx = shape.x;
      const cy = shape.y;
      const hw = (shape.width || 60) / 2;
      const hh = (shape.height || 60) / 2;

      const vertices = [
        { x: cx, y: cy - hh },     // top
        { x: cx + hw, y: cy },     // right
        { x: cx, y: cy + hh },     // bottom
        { x: cx - hw, y: cy }      // left
      ];
      const edgeNames = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];

      let bestEdge = null;
      let bestT = 0;
      let minDist = Infinity;

      for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - v1.x) * dx + (y - v1.y) * dy) / lengthSq));
        const nearX = v1.x + t * dx;
        const nearY = v1.y + t * dy;
        const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);

        if (dist < minDist) {
          minDist = dist;
          bestEdge = edgeNames[i];
          bestT = t;
        }
      }

      return { edge: bestEdge, t: bestT, shapeId: shape.id };
    }

    case 'triangle': {
      let vertices;
      if (shape.x1 !== undefined) {
        vertices = [
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 },
          { x: shape.x3, y: shape.y3 }
        ];
      } else {
        const ts = shape.size || 60;
        const th = ts * Math.sqrt(3) / 2;
        vertices = [
          { x: shape.x, y: shape.y - th * 2 / 3 },
          { x: shape.x - ts / 2, y: shape.y + th / 3 },
          { x: shape.x + ts / 2, y: shape.y + th / 3 }
        ];
      }
      const edgeNames = ['edge-0', 'edge-1', 'edge-2'];

      let bestEdge = null;
      let bestT = 0;
      let minDist = Infinity;

      for (let i = 0; i < 3; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 3];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - v1.x) * dx + (y - v1.y) * dy) / lengthSq));
        const nearX = v1.x + t * dx;
        const nearY = v1.y + t * dy;
        const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);

        if (dist < minDist) {
          minDist = dist;
          bestEdge = edgeNames[i];
          bestT = t;
        }
      }

      return { edge: bestEdge, t: bestT, shapeId: shape.id };
    }

    case 'path': {
      // For path shapes, store segment index and t along that segment
      // Format: segments[].point: [x, y], handleIn: [x, y], handleOut: [x, y]
      if (!shape.segments || shape.segments.length < 2) {
        return { edge: 'bounds', t: 0.5, shapeId: shape.id };
      }

      let bestSegment = 0;
      let bestT = 0;
      let minDist = Infinity;

      // Check each segment
      const segmentCount = shape.closed ? shape.segments.length : shape.segments.length - 1;
      for (let i = 0; i < segmentCount; i++) {
        const s1 = shape.segments[i];
        const s2 = shape.segments[(i + 1) % shape.segments.length];

        // Sample points along the bezier curve
        const samples = 20;
        for (let s = 0; s <= samples; s++) {
          const segT = s / samples;
          const p = getBezierPointFromSegments(s1, s2, segT);
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            bestSegment = i;
            bestT = segT;
          }
        }
      }

      return { edge: `segment-${bestSegment}`, t: bestT, shapeId: shape.id };
    }

    default:
      return { edge: 'center', t: 0.5, shapeId: shape.id };
  }
}

/**
 * Convert a relative edge position back to absolute coordinates
 * @param {object} relPos - { edge, t, shapeId }
 * @param {object} shape - Target shape (current position)
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {object|null} { x, y } or null
 */
export function getAbsoluteFromRelativeEdge(relPos, shape, config = {}, ctx = null) {
  if (!relPos || !shape) return null;
  if (shape.type === 'line' || shape.type === 'arrow') return null;

  const bounds = getShapeBounds(shape, config, ctx);
  if (!bounds) return null;

  // Handle inside connections (endpoint dropped inside shape without snapping)
  if (relPos.inside) {
    return {
      x: bounds.x + relPos.relativeX * bounds.width,
      y: bounds.y + relPos.relativeY * bounds.height
    };
  }

  const { edge, t } = relPos;

  switch (shape.type) {
    case 'rect':
    case 'image':
    case 'video':
    case 'text':
    case 'frame':
    case 'group':
    case 'freehand':
    case 'screenCapture':
    case 'webcamCapture': {
      // For rectangular shapes and shapes with bounding boxes, use edge-based positioning
      const left = bounds.x;
      const right = bounds.x + bounds.width;
      const top = bounds.y;
      const bottom = bounds.y + bounds.height;

      const edges = {
        'top': { x1: left, y1: top, x2: right, y2: top },
        'right': { x1: right, y1: top, x2: right, y2: bottom },
        'bottom': { x1: right, y1: bottom, x2: left, y2: bottom },
        'left': { x1: left, y1: bottom, x2: left, y2: top }
      };

      const e = edges[edge];
      if (!e) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

      return {
        x: e.x1 + t * (e.x2 - e.x1),
        y: e.y1 + t * (e.y2 - e.y1)
      };
    }

    case 'circle': {
      const cx = shape.x;
      const cy = shape.y;
      const r = shape.radius;
      const angle = t * 2 * Math.PI - Math.PI;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle)
      };
    }

    case 'ellipse': {
      const cx = shape.x;
      const cy = shape.y;
      const rx = shape.radiusX || shape.radius || 50;
      const ry = shape.radiusY || shape.radius || 30;
      const angle = t * 2 * Math.PI - Math.PI;
      return {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle)
      };
    }

    case 'diamond': {
      const cx = shape.x;
      const cy = shape.y;
      const hw = (shape.width || 60) / 2;
      const hh = (shape.height || 60) / 2;

      const vertices = [
        { x: cx, y: cy - hh },     // top
        { x: cx + hw, y: cy },     // right
        { x: cx, y: cy + hh },     // bottom
        { x: cx - hw, y: cy }      // left
      ];
      const edgeMap = { 'top-right': 0, 'bottom-right': 1, 'bottom-left': 2, 'top-left': 3 };
      const i = edgeMap[edge] ?? 0;
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % 4];

      return {
        x: v1.x + t * (v2.x - v1.x),
        y: v1.y + t * (v2.y - v1.y)
      };
    }

    case 'triangle': {
      let vertices;
      if (shape.x1 !== undefined) {
        vertices = [
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 },
          { x: shape.x3, y: shape.y3 }
        ];
      } else {
        const ts = shape.size || 60;
        const th = ts * Math.sqrt(3) / 2;
        vertices = [
          { x: shape.x, y: shape.y - th * 2 / 3 },
          { x: shape.x - ts / 2, y: shape.y + th / 3 },
          { x: shape.x + ts / 2, y: shape.y + th / 3 }
        ];
      }
      const edgeMap = { 'edge-0': 0, 'edge-1': 1, 'edge-2': 2 };
      const i = edgeMap[edge] ?? 0;
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % 3];

      return {
        x: v1.x + t * (v2.x - v1.x),
        y: v1.y + t * (v2.y - v1.y)
      };
    }

    case 'path': {
      // Parse segment index from edge string (e.g., "segment-0", "segment-1")
      // Format: segments[].point: [x, y], handleIn: [x, y], handleOut: [x, y]
      if (!shape.segments || shape.segments.length < 2) {
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      }

      // Handle bounds fallback
      if (edge === 'bounds') {
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      }

      // Parse segment index
      const segmentMatch = edge.match(/^segment-(\d+)$/);
      if (!segmentMatch) {
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      }

      const segmentIndex = parseInt(segmentMatch[1], 10);
      const segmentCount = shape.closed ? shape.segments.length : shape.segments.length - 1;

      if (segmentIndex >= segmentCount) {
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      }

      const s1 = shape.segments[segmentIndex];
      const s2 = shape.segments[(segmentIndex + 1) % shape.segments.length];

      return getBezierPointFromSegments(s1, s2, t);
    }

    default:
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }
}

/**
 * Check if a point is strictly inside a shape (not just near it)
 * Used for arrow/line endpoints to determine if they should connect without snapping
 * @param {number} x - Test X coordinate
 * @param {number} y - Test Y coordinate
 * @param {object} shape - Shape to test
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {boolean}
 */
export function isPointInsideShape(x, y, shape, config = {}, ctx = null) {
  if (!shape) return false;

  // Skip non-connectable shapes
  if (shape.type === 'line' || shape.type === 'arrow') return false;
  if (shape.type === 'audio' || shape.type === 'effect' || shape.type === 'filter' ||
      shape.type === 'transition' || shape.type === 'viewportKeyframe' || shape.type === 'cursor') return false;

  const bounds = getShapeBounds(shape, config, ctx);
  if (!bounds) return false;

  // Handle rotation - transform test point to shape's local space
  let testX = x, testY = y;
  if (shape.rotation) {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const cos = Math.cos(-shape.rotation);
    const sin = Math.sin(-shape.rotation);
    const dx = x - centerX;
    const dy = y - centerY;
    testX = centerX + dx * cos - dy * sin;
    testY = centerY + dx * sin + dy * cos;
  }

  switch (shape.type) {
    case 'circle': {
      const cx = shape.x;
      const cy = shape.y;
      const r = shape.radius;
      const dist = Math.sqrt((testX - cx) ** 2 + (testY - cy) ** 2);
      return dist < r;
    }

    case 'ellipse': {
      const cx = shape.x;
      const cy = shape.y;
      const rx = shape.radiusX || shape.radius || 50;
      const ry = shape.radiusY || shape.radius || 30;
      // Ellipse equation: (x-cx)^2/rx^2 + (y-cy)^2/ry^2 < 1
      const normalized = ((testX - cx) ** 2) / (rx ** 2) + ((testY - cy) ** 2) / (ry ** 2);
      return normalized < 1;
    }

    case 'diamond': {
      const cx = shape.x;
      const cy = shape.y;
      const hw = (shape.width || 60) / 2;
      const hh = (shape.height || 60) / 2;
      // Point inside diamond if sum of normalized distances < 1
      const normalized = Math.abs(testX - cx) / hw + Math.abs(testY - cy) / hh;
      return normalized < 1;
    }

    case 'triangle': {
      let vertices;
      if (shape.x1 !== undefined) {
        vertices = [
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 },
          { x: shape.x3, y: shape.y3 }
        ];
      } else {
        const ts = shape.size || 60;
        const th = ts * Math.sqrt(3) / 2;
        vertices = [
          { x: shape.x, y: shape.y - th * 2 / 3 },
          { x: shape.x - ts / 2, y: shape.y + th / 3 },
          { x: shape.x + ts / 2, y: shape.y + th / 3 }
        ];
      }
      // Point-in-triangle using barycentric coordinates
      const [v0, v1, v2] = vertices;
      const denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
      const a = ((v1.y - v2.y) * (testX - v2.x) + (v2.x - v1.x) * (testY - v2.y)) / denom;
      const b = ((v2.y - v0.y) * (testX - v2.x) + (v0.x - v2.x) * (testY - v2.y)) / denom;
      const c = 1 - a - b;
      return a > 0 && b > 0 && c > 0;
    }

    default:
      // For rectangular shapes (rect, image, video, text, frame, etc.)
      return testX > bounds.x && testX < bounds.x + bounds.width &&
             testY > bounds.y && testY < bounds.y + bounds.height;
  }
}

/**
 * Check if a point is inside or near a shape (for connection detection)
 * @param {number} x - Test X coordinate
 * @param {number} y - Test Y coordinate
 * @param {object} shape - Shape to test
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} threshold - Distance threshold
 * @returns {boolean}
 */
export function isPointNearShape(x, y, shape, config = {}, ctx = null, threshold = 20) {
  if (!shape) return false;

  // Skip non-connectable shapes
  if (shape.type === 'line' || shape.type === 'arrow') return false;

  const bounds = getShapeBounds(shape, config, ctx);
  if (!bounds) return false;

  // Expand bounds by threshold
  const expandedBounds = {
    x: bounds.x - threshold,
    y: bounds.y - threshold,
    width: bounds.width + threshold * 2,
    height: bounds.height + threshold * 2
  };

  return x >= expandedBounds.x && x <= expandedBounds.x + expandedBounds.width &&
         y >= expandedBounds.y && y <= expandedBounds.y + expandedBounds.height;
}

/**
 * Helper: Get multi-selection bounds from state (with optional filtered indices)
 * @param {object} state - Editor state
 * @param {number[]} indices - Array of shape indices to include
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {object|null} Combined bounds
 */
function getMultiSelectionBoundsFiltered(state, indices, config = {}, ctx = null) {
  if (indices.length < 1) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  indices.forEach(i => {
    const shape = state.shapes[i];
    if (!shape) return;
    const b = getShapeBounds(shape, config, ctx);
    if (!b) return;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export default {
  isPointInFrame,
  hitTest,
  hitTestSimple,
  hitTestFrameLabel,
  hitTestHandle,
  hitTestHandleForBounds,
  hitTestControlPoint,
  hitTestArrowEndpoint,
  findNearestPointOnShape,
  getRelativeEdgePosition,
  getAbsoluteFromRelativeEdge,
  isPointInsideShape,
  isPointNearShape
};
