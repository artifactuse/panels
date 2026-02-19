// renderer/shapes/freehand.js
// Freehand stroke rendering

/**
 * Draw a freehand shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawFreehand(ctx, shape, options = {}) {
  const { strokeLineDash } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const lineWidth = shape.lineWidth || 2;

  if (!shape.points || shape.points.length <= 1) return;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (strokeLineDash) ctx.setLineDash(strokeLineDash);

  // Freehand is always precise (rough.js curve would look odd)
  ctx.beginPath();
  ctx.moveTo(shape.points[0].x, shape.points[0].y);
  for (let i = 1; i < shape.points.length; i++) {
    ctx.lineTo(shape.points[i].x, shape.points[i].y);
  }
  ctx.stroke();
}

export default { drawFreehand };
