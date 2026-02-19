// renderer/shapes/arrow.js
// Arrow and line shape rendering with curve support

/**
 * Calculate angle at the end of a quadratic bezier curve
 */
function getQuadraticBezierEndAngle(x1, y1, cpX, cpY, x2, y2) {
  // The tangent at t=1 is the vector from control point to end point
  return Math.atan2(y2 - cpY, x2 - cpX);
}

/**
 * Calculate angle at the start of a quadratic bezier curve
 */
function getQuadraticBezierStartAngle(x1, y1, cpX, cpY, x2, y2) {
  // The tangent at t=0 is the vector from start point to control point
  return Math.atan2(cpY - y1, cpX - x1);
}

/**
 * Draw an arrow head
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {number} x - X position of arrow tip
 * @param {number} y - Y position of arrow tip
 * @param {number} angle - Angle of the arrow
 * @param {number} size - Size of the arrow head
 * @param {string} style - Arrow head style (triangle, open, diamond, circle)
 * @param {string} color - Arrow color
 * @param {number} lineWidth - Line width
 * @param {boolean} isSketchy - Use rough.js rendering
 * @param {number} seed - Random seed for rough.js
 */
export function drawArrowHead(ctx, rc, x, y, angle, size, style, color, lineWidth, isSketchy, seed) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  switch (style) {
    case 'triangle':
      if (isSketchy && rc) {
        const points = [
          [x, y],
          [x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6)],
          [x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6)]
        ];
        rc.polygon(points, { seed: seed, roughness: 0.5, fill: color, stroke: color, strokeWidth: 1 });
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
      break;

    case 'open':
      if (isSketchy && rc) {
        rc.line(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6), x, y, { seed: seed, roughness: 0.5, stroke: color, strokeWidth: lineWidth });
        rc.line(x, y, x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6), { seed: seed + 1, roughness: 0.5, stroke: color, strokeWidth: lineWidth });
      } else {
        ctx.beginPath();
        ctx.moveTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x, y);
        ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      break;

    case 'diamond': {
      const dSize = size * 0.7;
      const diamondPoints = [
        [x, y],
        [x - dSize * Math.cos(angle) - dSize * 0.5 * Math.cos(angle - Math.PI / 2),
          y - dSize * Math.sin(angle) - dSize * 0.5 * Math.sin(angle - Math.PI / 2)],
        [x - dSize * 2 * Math.cos(angle), y - dSize * 2 * Math.sin(angle)],
        [x - dSize * Math.cos(angle) + dSize * 0.5 * Math.cos(angle - Math.PI / 2),
          y - dSize * Math.sin(angle) + dSize * 0.5 * Math.sin(angle - Math.PI / 2)]
      ];
      if (isSketchy && rc) {
        rc.polygon(diamondPoints, { seed: seed, roughness: 0.5, fill: color, stroke: color, strokeWidth: 1 });
      } else {
        ctx.beginPath();
        ctx.moveTo(diamondPoints[0][0], diamondPoints[0][1]);
        diamondPoints.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'circle': {
      const cRadius = size * 0.4;
      const cx = x - cRadius * Math.cos(angle);
      const cy = y - cRadius * Math.sin(angle);
      if (isSketchy && rc) {
        rc.circle(cx, cy, cRadius * 2, { seed: seed, roughness: 0.5, fill: color, stroke: color, strokeWidth: 1 });
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, cRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}

/**
 * Draw a line shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawLine(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash, edgeStyle } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  if (!hasStroke) return;

  if (shape.controlPoint) {
    // Curved line with control point
    const cp = shape.controlPoint;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = edgeStyle === 'round' ? 'round' : 'butt';
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.quadraticCurveTo(cp.x, cp.y, shape.x2, shape.y2);
    ctx.stroke();
  } else {
    // Straight line
    if (isSketchy && rc) {
      rc.line(shape.x1, shape.y1, shape.x2, shape.y2, roughOptions);
    } else {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = edgeStyle === 'round' ? 'round' : 'butt';
      if (strokeLineDash) ctx.setLineDash(strokeLineDash);
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    }
  }
}

/**
 * Draw an arrow shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawArrow(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash, edgeStyle } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  if (!hasStroke) return;

  const arrowType = shape.arrowType || 'single';
  const arrowHeadStyle = shape.arrowHeadStyle || 'triangle';
  const arrowHeadSize = shape.arrowHeadSize || 'medium';

  const sizeMap = { small: 0.6, medium: 1, large: 1.5 };
  const sizeMult = sizeMap[arrowHeadSize] || 1;
  const hs = (shape.headSize || 12) * sizeMult;
  const seed = shape.seed || 1;

  if (shape.controlPoint) {
    // Curved arrow with control point
    const cp = shape.controlPoint;

    // Calculate tangent angles at endpoints for arrowheads
    const angle = getQuadraticBezierEndAngle(shape.x1, shape.y1, cp.x, cp.y, shape.x2, shape.y2);
    const angle2 = getQuadraticBezierStartAngle(shape.x1, shape.y1, cp.x, cp.y, shape.x2, shape.y2) + Math.PI;

    // Draw the curved line
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = edgeStyle === 'round' ? 'round' : 'butt';
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.quadraticCurveTo(cp.x, cp.y, shape.x2, shape.y2);
    ctx.stroke();

    // Draw arrow heads
    ctx.setLineDash([]);
    if (arrowType !== 'none') {
      drawArrowHead(ctx, rc, shape.x2, shape.y2, angle, hs, arrowHeadStyle, strokeColor, lineWidth, false, seed);
    }
    if (arrowType === 'double') {
      drawArrowHead(ctx, rc, shape.x1, shape.y1, angle2, hs, arrowHeadStyle, strokeColor, lineWidth, false, seed + 1);
    }
  } else {
    // Straight arrow
    const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
    const angle2 = Math.atan2(shape.y1 - shape.y2, shape.x1 - shape.x2);

    // Draw the line
    if (isSketchy && rc) {
      rc.line(shape.x1, shape.y1, shape.x2, shape.y2, roughOptions);
    } else {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = edgeStyle === 'round' ? 'round' : 'butt';
      if (strokeLineDash) ctx.setLineDash(strokeLineDash);
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    }

    // Draw arrow heads (always precise for clarity)
    ctx.setLineDash([]);
    if (arrowType !== 'none') {
      drawArrowHead(ctx, rc, shape.x2, shape.y2, angle, hs, arrowHeadStyle, strokeColor, lineWidth, isSketchy, seed);
    }
    if (arrowType === 'double') {
      drawArrowHead(ctx, rc, shape.x1, shape.y1, angle2, hs, arrowHeadStyle, strokeColor, lineWidth, isSketchy, seed + 1);
    }
  }
}

export default { drawLine, drawArrow, drawArrowHead };
