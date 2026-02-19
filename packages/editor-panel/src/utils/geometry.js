// editor/utils/geometry.js
// Geometry calculation utilities - pure functions

import { defaultConfig } from '../config/defaults.js';

/**
 * Get bounding box for a shape
 * @param {object} shape - Shape object
 * @param {object} config - Editor config (for frame label sizing)
 * @param {CanvasRenderingContext2D} ctx - Canvas context (for text measurement)
 * @returns {{x: number, y: number, width: number, height: number}|null} Bounds or null
 */
export function getShapeBounds(shape, config = {}, ctx = null) {
  if (shape.type === 'group' && shape.children) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    shape.children.forEach(c => {
      const b = getShapeBounds(c, config, ctx);
      if (b) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
    });
    return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // Frame bounds - include label area
  if (shape.type === 'frame') {
    const labelHeight = (config.frame?.labelFontSize || 12) + (config.frame?.labelPadding || 4) * 2 + (config.frame?.labelOffset || 2);
    return {
      x: shape.x,
      y: shape.y - labelHeight,
      width: shape.width,
      height: shape.height + labelHeight
    };
  }

  switch (shape.type) {
    case 'circle':
      return {
        x: shape.x - shape.radius,
        y: shape.y - shape.radius,
        width: shape.radius * 2,
        height: shape.radius * 2
      };

    case 'ellipse': {
      const rx = shape.radiusX ?? shape.radius ?? 50;
      const ry = shape.radiusY ?? shape.radius ?? 30;
      return { x: shape.x - rx, y: shape.y - ry, width: rx * 2, height: ry * 2 };
    }

    case 'rect':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };

    case 'diamond': {
      const dw = shape.width ?? shape.size ?? 60;
      const dh = shape.height ?? shape.size ?? 60;
      return { x: shape.x - dw / 2, y: shape.y - dh / 2, width: dw, height: dh };
    }

    case 'triangle':
      if (shape.x1 !== undefined) {
        const minX = Math.min(shape.x1, shape.x2, shape.x3);
        const maxX = Math.max(shape.x1, shape.x2, shape.x3);
        const minY = Math.min(shape.y1, shape.y2, shape.y3);
        const maxY = Math.max(shape.y1, shape.y2, shape.y3);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      } else {
        const ts = shape.size || 60;
        const th = ts * Math.sqrt(3) / 2;
        return { x: shape.x - ts / 2, y: shape.y - th * 2 / 3, width: ts, height: th };
      }

    case 'line':
    case 'arrow':
      // Include control point in bounds calculation for curved lines
      if (shape.controlPoint) {
        const minX = Math.min(shape.x1, shape.x2, shape.controlPoint.x);
        const maxX = Math.max(shape.x1, shape.x2, shape.controlPoint.x);
        const minY = Math.min(shape.y1, shape.y2, shape.controlPoint.y);
        const maxY = Math.max(shape.y1, shape.y2, shape.controlPoint.y);
        return { x: minX, y: minY, width: Math.max(maxX - minX, 10), height: Math.max(maxY - minY, 10) };
      }
      return {
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        width: Math.abs(shape.x2 - shape.x1) || 10,
        height: Math.abs(shape.y2 - shape.y1) || 10
      };

    case 'text': {
      const fontSize = shape.fontSize || 16;

      // If we have a canvas context, measure text properly
      if (ctx) {
        // If text has explicit width and height (text box mode)
        if (shape.width && shape.width > 0) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          let fontStyle = '';
          if (shape.italic) fontStyle += 'italic ';
          if (shape.bold) fontStyle += 'bold ';
          ctx.font = `${fontStyle}${fontSize}px ${shape.fontFamily || 'sans-serif'}`;

          const lineHeight = fontSize * 1.3;
          const words = (shape.text || '').split(' ');
          let line = '';
          let lineCount = 1;

          for (let i = 0; i < words.length; i++) {
            const testLine = line + (line ? ' ' : '') + words[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > shape.width && line !== '') {
              lineCount++;
              line = words[i];
            } else {
              line = testLine;
            }
          }
          ctx.restore();

          const height = shape.height || Math.max(lineCount * lineHeight, fontSize * 1.3);
          return { x: shape.x, y: shape.y, width: shape.width, height: height };
        }

        // Single line text (no width defined)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        let fontStyle = '';
        if (shape.italic) fontStyle += 'italic ';
        if (shape.bold) fontStyle += 'bold ';
        ctx.font = `${fontStyle}${fontSize}px ${shape.fontFamily || 'sans-serif'}`;

        const metrics = ctx.measureText(shape.text || '');
        const textWidth = metrics.width || 50;
        ctx.restore();

        // Account for text alignment
        let textX = shape.x;
        if (shape.align === 'center') {
          textX = shape.x - textWidth / 2;
        } else if (shape.align === 'right') {
          textX = shape.x - textWidth;
        }

        return { x: textX, y: shape.y, width: textWidth, height: fontSize * 1.2 };
      }

      // Fallback without context - estimate
      const estimatedWidth = (shape.text || '').length * fontSize * 0.6;
      return { x: shape.x, y: shape.y, width: shape.width || estimatedWidth || 50, height: fontSize * 1.2 };
    }

    case 'image': {
      const imgWidth = shape.width || (shape.imageElement?.naturalWidth) || 100;
      const imgHeight = shape.height || (shape.imageElement?.naturalHeight) || 100;
      return { x: shape.x, y: shape.y, width: imgWidth, height: imgHeight };
    }

    case 'video': {
      const vidWidth = shape.width || shape.originalWidth || 640;
      const vidHeight = shape.height || shape.originalHeight || 360;
      return { x: shape.x, y: shape.y, width: vidWidth, height: vidHeight };
    }

    case 'screenCapture': {
      const scWidth = shape.width || 1920;
      const scHeight = shape.height || 1080;
      return { x: shape.x, y: shape.y, width: scWidth, height: scHeight };
    }

    case 'webcamCapture': {
      const wcWidth = shape.width || 320;
      const wcHeight = shape.height || 240;
      return { x: shape.x, y: shape.y, width: wcWidth, height: wcHeight };
    }

    case 'audio':
      // Audio shapes don't have canvas bounds - they're timeline only
      return null;

    case 'cursor':
      // Cursor bounds are calculated from all cursorKeyframes + control points
      if (shape.cursorKeyframes?.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shape.cursorKeyframes.forEach(kf => {
          minX = Math.min(minX, kf.x);
          minY = Math.min(minY, kf.y);
          maxX = Math.max(maxX, kf.x);
          maxY = Math.max(maxY, kf.y);
          // Include control points in bounds
          if (kf.controlIn) {
            minX = Math.min(minX, kf.controlIn.x);
            minY = Math.min(minY, kf.controlIn.y);
            maxX = Math.max(maxX, kf.controlIn.x);
            maxY = Math.max(maxY, kf.controlIn.y);
          }
          if (kf.controlOut) {
            minX = Math.min(minX, kf.controlOut.x);
            minY = Math.min(minY, kf.controlOut.y);
            maxX = Math.max(maxX, kf.controlOut.x);
            maxY = Math.max(maxY, kf.controlOut.y);
          }
        });
        // Get cursor bounds from config
        const cursorScale = shape.cursorScale || 1;
        const cursorType = shape.cursorType || 'pointer';
        const cursorTypes = defaultConfig.cursorTypes || {};
        const cursorDef = cursorTypes[cursorType] || cursorTypes.pointer || {};
        const baseScale = cursorDef.baseScale || 1;
        const totalScale = baseScale * cursorScale;
        // Hotspot is where the "click point" is - cursor is drawn at (pos - hotspot)
        const hotspotX = (cursorDef.hotspotX || 0) * totalScale;
        const hotspotY = (cursorDef.hotspotY || 0) * totalScale;
        // Bounds define the cursor path extents (before scaling)
        const bounds = cursorDef.bounds || { offsetX: 0, offsetY: 0, extendX: 11, extendY: 19 };
        const extendX = bounds.extendX * totalScale;
        const extendY = bounds.extendY * totalScale;
        // Small padding for selection handles
        const handlePadding = 40;
        // Selection box must encompass:
        // - All keyframes (minX to maxX, minY to maxY)
        // - The cursor icon at each keyframe position (offset by -hotspot, extends by extendX/Y)
        return {
          x: minX - hotspotX - handlePadding,
          y: minY - hotspotY - handlePadding,
          width: (maxX - minX) + extendX + handlePadding * 2,
          height: (maxY - minY) + extendY + handlePadding * 2
        };
      }
      return null;

    case 'freehand':
      if (shape.points?.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shape.points.forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        return { x: minX, y: minY, width: maxX - minX || 10, height: maxY - minY || 10 };
      }
      return null;

    case 'path':
      // Handle compound paths (with children)
      if (shape.isCompound && shape.children) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shape.children.forEach(child => {
          if (child.segments) {
            child.segments.forEach(seg => {
              const p = seg.point;
              minX = Math.min(minX, p[0]);
              minY = Math.min(minY, p[1]);
              maxX = Math.max(maxX, p[0]);
              maxY = Math.max(maxY, p[1]);
            });
          }
        });
        if (minX === Infinity) return null;
        return { x: minX, y: minY, width: maxX - minX || 10, height: maxY - minY || 10 };
      }
      // Simple path
      if (shape.segments?.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shape.segments.forEach(seg => {
          const p = seg.point;
          minX = Math.min(minX, p[0]);
          minY = Math.min(minY, p[1]);
          maxX = Math.max(maxX, p[0]);
          maxY = Math.max(maxY, p[1]);
          // Also consider handles for curves
          if (seg.handleIn) {
            minX = Math.min(minX, p[0] + seg.handleIn[0]);
            minY = Math.min(minY, p[1] + seg.handleIn[1]);
            maxX = Math.max(maxX, p[0] + seg.handleIn[0]);
            maxY = Math.max(maxY, p[1] + seg.handleIn[1]);
          }
          if (seg.handleOut) {
            minX = Math.min(minX, p[0] + seg.handleOut[0]);
            minY = Math.min(minY, p[1] + seg.handleOut[1]);
            maxX = Math.max(maxX, p[0] + seg.handleOut[0]);
            maxY = Math.max(maxY, p[1] + seg.handleOut[1]);
          }
        });
        return { x: minX, y: minY, width: maxX - minX || 10, height: maxY - minY || 10 };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Get the center point of a shape
 * @param {object} shape - Shape object
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {{x: number, y: number}|null} Center point or null
 */
export function getShapeCenter(shape, config = {}, ctx = null) {
  const bounds = getShapeBounds(shape, config, ctx);
  if (!bounds) return null;
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

/**
 * Get frame content bounds (without label)
 * @param {object} frame - Frame shape
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function getFrameContentBounds(frame) {
  if (frame.type !== 'frame') return null;
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}

/**
 * Get resize handle positions for a bounding box
 * @param {object} bounds - Bounding box
 * @param {number} padding - Padding from edges
 * @returns {object} Handle positions
 */
export function getResizeHandles(bounds, padding = 6) {
  const p = padding;
  return {
    nw: { x: bounds.x - p, y: bounds.y - p },
    n: { x: bounds.x + bounds.width / 2, y: bounds.y - p },
    ne: { x: bounds.x + bounds.width + p, y: bounds.y - p },
    w: { x: bounds.x - p, y: bounds.y + bounds.height / 2 },
    e: { x: bounds.x + bounds.width + p, y: bounds.y + bounds.height / 2 },
    sw: { x: bounds.x - p, y: bounds.y + bounds.height + p },
    s: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height + p },
    se: { x: bounds.x + bounds.width + p, y: bounds.y + bounds.height + p }
  };
}

/**
 * Get rotation handle position
 * @param {object} bounds - Bounding box
 * @param {number} padding - Padding from edges
 * @param {number} offset - Distance from top of bounding box
 * @returns {{x: number, y: number}} Rotation handle position
 */
export function getRotationHandle(bounds, padding = 6, offset = 25) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y - padding - offset
  };
}

/**
 * Get tilt X handle position (left side, vertically centered)
 * Used for tilting shapes forward/backward (pitch)
 * @param {object} bounds - Bounding box
 * @param {number} padding - Padding from edges
 * @param {number} offset - Distance from left of bounding box
 * @returns {{x: number, y: number}} Tilt X handle position
 */
export function getTiltXHandle(bounds, padding = 6, offset = 25) {
  return {
    x: bounds.x - padding - offset,
    y: bounds.y + bounds.height / 2
  };
}

/**
 * Get tilt Y handle position (bottom side, horizontally centered)
 * Used for tilting shapes left/right (yaw)
 * @param {object} bounds - Bounding box
 * @param {number} padding - Padding from edges
 * @param {number} offset - Distance from bottom of bounding box
 * @returns {{x: number, y: number}} Tilt Y handle position
 */
export function getTiltYHandle(bounds, padding = 6, offset = 25) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height + padding + offset
  };
}

/**
 * Get combined bounds of multiple shapes
 * @param {array} shapes - Array of shape objects
 * @param {array} indices - Indices of shapes to include
 * @param {object} config - Editor config
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function getMultiSelectionBounds(shapes, indices, config = {}, ctx = null) {
  if (indices.length < 1) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  indices.forEach(i => {
    const shape = shapes[i];
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

/**
 * Check if a point is inside a rectangle
 * @param {number} x - Point X
 * @param {number} y - Point Y
 * @param {object} rect - Rectangle {x, y, width, height}
 * @param {number} tolerance - Hit tolerance
 * @returns {boolean}
 */
export function pointInRect(x, y, rect, tolerance = 0) {
  return x >= rect.x - tolerance &&
         x <= rect.x + rect.width + tolerance &&
         y >= rect.y - tolerance &&
         y <= rect.y + rect.height + tolerance;
}

/**
 * Calculate distance between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Distance
 */
export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get point on quadratic bezier curve at parameter t
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} cpX - Control point X
 * @param {number} cpY - Control point Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {number} t - Parameter (0-1)
 * @returns {{x: number, y: number}}
 */
export function getQuadraticBezierPoint(x1, y1, cpX, cpY, x2, y2, t) {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * x1 + 2 * oneMinusT * t * cpX + t * t * x2,
    y: oneMinusT * oneMinusT * y1 + 2 * oneMinusT * t * cpY + t * t * y2
  };
}

/**
 * Get default control point position for a curved line
 * Places it perpendicular to the line at its midpoint
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @returns {{x: number, y: number}}
 */
export function getDefaultControlPoint(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // Calculate perpendicular offset (30% of line length)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const offset = length * 0.3;

  // Perpendicular direction (rotate 90 degrees)
  const perpX = -dy / length;
  const perpY = dx / length;

  return {
    x: midX + perpX * offset,
    y: midY + perpY * offset
  };
}

/**
 * Get tangent angle at start of quadratic bezier curve
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} cpX - Control point X
 * @param {number} cpY - Control point Y
 * @param {number} _x2 - End X (unused but kept for API consistency)
 * @param {number} _y2 - End Y (unused but kept for API consistency)
 * @returns {number} Angle in radians
 */
export function getQuadraticBezierStartAngle(x1, y1, cpX, cpY, _x2, _y2) {
  // Tangent at t=0 is direction from start to control point
  return Math.atan2(cpY - y1, cpX - x1);
}

/**
 * Get tangent angle at end of quadratic bezier curve
 * @param {number} _x1 - Start X (unused but kept for API consistency)
 * @param {number} _y1 - Start Y (unused but kept for API consistency)
 * @param {number} cpX - Control point X
 * @param {number} cpY - Control point Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @returns {number} Angle in radians
 */
export function getQuadraticBezierEndAngle(_x1, _y1, cpX, cpY, x2, y2) {
  // Tangent at t=1 is direction from control point to end
  return Math.atan2(y2 - cpY, x2 - cpX);
}

export default {
  getShapeBounds,
  getShapeCenter,
  getFrameContentBounds,
  getResizeHandles,
  getRotationHandle,
  getTiltXHandle,
  getTiltYHandle,
  getMultiSelectionBounds,
  pointInRect,
  distance,
  getQuadraticBezierPoint,
  getDefaultControlPoint,
  getQuadraticBezierStartAngle,
  getQuadraticBezierEndAngle
};
