// renderer/shapes/rect.js
// Rectangle, diamond, and triangle shape rendering

/**
 * Draw a rectangle shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options (isSketchy, roughOptions, etc.)
 */
export function drawRect(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash, edgeStyle } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  // Support individual corner radii or uniform radius
  // Priority: shape.cornerRadii > shape.cornerRadius > edgeStyle
  const maxRadius = Math.min(shape.width / 2, shape.height / 2);
  let radii = null;

  if (shape.cornerRadii) {
    // Individual corner radii: { tl, tr, br, bl }
    radii = {
      tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
      tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
      br: Math.min(shape.cornerRadii.br || 0, maxRadius),
      bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
    };
  } else if (typeof shape.cornerRadius === 'number' && shape.cornerRadius > 0) {
    // Uniform corner radius
    const r = Math.min(shape.cornerRadius, maxRadius);
    radii = { tl: r, tr: r, br: r, bl: r };
  } else if (edgeStyle === 'round') {
    // Legacy: edgeStyle 'round' with auto-calculated radius
    const r = Math.min(10, shape.width / 4, shape.height / 4);
    radii = { tl: r, tr: r, br: r, bl: r };
  }

  const hasCornerRadius = radii && (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0);

  if (isSketchy && rc && !hasCornerRadius) {
    // Rough.js doesn't support rounded corners, so only use it for sharp corners
    rc.rectangle(shape.x, shape.y, shape.width, shape.height, roughOptions);
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor || 'transparent';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = edgeStyle === 'round' ? 'round' : 'butt';
    ctx.lineJoin = edgeStyle === 'round' ? 'round' : 'miter';
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);

    if (hasCornerRadius) {
      drawRoundedRect(ctx, shape.x, shape.y, shape.width, shape.height, radii, fillColor, hasStroke);
    } else {
      if (fillColor && fillColor !== 'transparent') {
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
      }
      if (hasStroke) ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    }
  }
}

/**
 * Draw a diamond shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawDiamond(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  const dw = shape.width ?? shape.size ?? 60;
  const dh = shape.height ?? shape.size ?? 60;
  const diamondPoints = [
    [shape.x, shape.y - dh / 2],
    [shape.x + dw / 2, shape.y],
    [shape.x, shape.y + dh / 2],
    [shape.x - dw / 2, shape.y]
  ];

  if (isSketchy && rc) {
    rc.polygon(diamondPoints, roughOptions);
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor || 'transparent';
    ctx.lineWidth = lineWidth;
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);
    ctx.beginPath();
    ctx.moveTo(diamondPoints[0][0], diamondPoints[0][1]);
    diamondPoints.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (hasStroke) ctx.stroke();
  }
}

/**
 * Draw a triangle shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawTriangle(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';

  let triPoints;
  if (shape.x1 !== undefined) {
    triPoints = [[shape.x1, shape.y1], [shape.x2, shape.y2], [shape.x3, shape.y3]];
  } else {
    const ts = shape.size || 60;
    const th = ts * Math.sqrt(3) / 2;
    triPoints = [
      [shape.x, shape.y - th * 2 / 3],
      [shape.x + ts / 2, shape.y + th / 3],
      [shape.x - ts / 2, shape.y + th / 3]
    ];
  }

  if (isSketchy && rc) {
    rc.polygon(triPoints, roughOptions);
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor || 'transparent';
    ctx.lineWidth = lineWidth;
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);
    ctx.beginPath();
    ctx.moveTo(triPoints[0][0], triPoints[0][1]);
    triPoints.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (hasStroke) ctx.stroke();
  }
}

/**
 * Helper function for rounded rectangles
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {number|object} r - Radius (number for uniform, or { tl, tr, br, bl } for individual corners)
 * @param {string} fillColor - Fill color
 * @param {boolean} hasStroke - Whether to stroke
 */
function drawRoundedRect(ctx, x, y, w, h, r, fillColor, hasStroke = true) {
  // Support both uniform radius (number) and individual radii (object)
  const radii = typeof r === 'number'
    ? { tl: r, tr: r, br: r, bl: r }
    : { tl: r.tl || 0, tr: r.tr || 0, br: r.br || 0, bl: r.bl || 0 };

  ctx.beginPath();
  ctx.moveTo(x + radii.tl, y);
  ctx.lineTo(x + w - radii.tr, y);
  if (radii.tr > 0) {
    ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
  }
  ctx.lineTo(x + w, y + h - radii.br);
  if (radii.br > 0) {
    ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
  }
  ctx.lineTo(x + radii.bl, y + h);
  if (radii.bl > 0) {
    ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
  }
  ctx.lineTo(x, y + radii.tl);
  if (radii.tl > 0) {
    ctx.quadraticCurveTo(x, y, x + radii.tl, y);
  }
  ctx.closePath();
  if (fillColor && fillColor !== 'transparent') ctx.fill();
  if (hasStroke !== false) ctx.stroke();
}

export default { drawRect, drawDiamond, drawTriangle };
