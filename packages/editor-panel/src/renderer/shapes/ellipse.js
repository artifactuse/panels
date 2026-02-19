// renderer/shapes/ellipse.js
// Ellipse and circle shape rendering

/**
 * Draw an ellipse shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawEllipse(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  const rx = shape.radiusX ?? shape.radius ?? 50;
  const ry = shape.radiusY ?? shape.radius ?? 30;

  if (isSketchy && rc) {
    rc.ellipse(shape.x, shape.y, rx * 2, ry * 2, roughOptions);
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor || 'transparent';
    ctx.lineWidth = lineWidth;
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);
    ctx.beginPath();
    ctx.ellipse(shape.x, shape.y, rx, ry, 0, 0, Math.PI * 2);
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (hasStroke) ctx.stroke();
  }
}

/**
 * Draw a circle shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawCircle(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  if (isSketchy && rc) {
    rc.circle(shape.x, shape.y, shape.radius * 2, roughOptions);
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor || 'transparent';
    ctx.lineWidth = lineWidth;
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (hasStroke) ctx.stroke();
  }
}

export default { drawEllipse, drawCircle };
