// renderer/shapes/frame.js
// Frame container rendering

/**
 * Get corner radii for a shape, supporting both uniform and individual corners
 * @param {Object} shape - Shape data
 * @param {number} maxRadius - Maximum allowed radius
 * @returns {Object|null} Radii object { tl, tr, br, bl } or null if no radius
 */
function getCornerRadii(shape, maxRadius) {
  if (shape.cornerRadii) {
    return {
      tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
      tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
      br: Math.min(shape.cornerRadii.br || 0, maxRadius),
      bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
    };
  } else if (typeof shape.cornerRadius === 'number' && shape.cornerRadius > 0) {
    const r = Math.min(shape.cornerRadius, maxRadius);
    return { tl: r, tr: r, br: r, bl: r };
  }
  return null;
}

/**
 * Create a rounded rectangle path
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {Object} radii - Corner radii { tl, tr, br, bl }
 */
function createRoundedRectPath(ctx, x, y, w, h, radii) {
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
}

/**
 * Draw a frame shape with its children
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 * @param {Function} drawShapeFn - Function to draw child shapes
 * @param {Object} state - Editor state for highlighting
 * @param {Object} config - Editor configuration
 */
export function drawFrame(ctx, shape, options, drawShapeFn, state, config) {
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;

  // Frame configuration
  const frameLabelFontSize = config.frame?.labelFontSize || 12;
  const frameLabelPadding = config.frame?.labelPadding || 4;
  const frameLabelOffset = config.frame?.labelOffset || 2;
  const frameLabelBg = config.theme?.colors?.frameLabelBg || '#6366f1';
  const frameLabelText = config.theme?.colors?.frameLabelText || '#ffffff';

  // Check for corner radius
  const maxRadius = Math.min(shape.width / 2, shape.height / 2);
  const radii = getCornerRadii(shape, maxRadius);
  const hasCornerRadius = radii && (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0);

  // Check if this frame's children should be highlighted
  const frameIndex = state.shapes.indexOf(shape);
  const shouldHighlightChildren = state.highlightedFrameIndex >= 0 &&
    state.highlightedFrameIndex === frameIndex;

  // Draw frame background
  if (fillColor && fillColor !== 'transparent') {
    ctx.fillStyle = fillColor;
    if (hasCornerRadius) {
      createRoundedRectPath(ctx, shape.x, shape.y, shape.width, shape.height, radii);
      ctx.fill();
    } else {
      ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
    }
  }

  // Draw frame border (dashed)
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([6, 4]);
  if (hasCornerRadius) {
    createRoundedRectPath(ctx, shape.x, shape.y, shape.width, shape.height, radii);
    ctx.stroke();
  } else {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }
  ctx.setLineDash([]);

  // Draw frame label background
  ctx.font = `bold ${frameLabelFontSize}px sans-serif`;
  const frameLabelWidth = ctx.measureText(shape.name || 'Frame').width + frameLabelPadding * 2;
  const frameLabelHeight = frameLabelFontSize + frameLabelPadding * 2;
  const frameLabelX = shape.x;
  const frameLabelY = shape.y - frameLabelHeight - frameLabelOffset;

  ctx.fillStyle = frameLabelBg;
  ctx.beginPath();
  ctx.roundRect(frameLabelX, frameLabelY, frameLabelWidth, frameLabelHeight, 4);
  ctx.fill();

  // Draw frame label text
  ctx.fillStyle = frameLabelText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(shape.name || 'Frame', frameLabelX + frameLabelPadding, frameLabelY + frameLabelHeight / 2);

  // Draw clip indicator icon if clipping is enabled
  if (shape.clipContent) {
    const iconSize = frameLabelFontSize;
    const iconX = frameLabelX + frameLabelWidth + 4;
    const iconY = frameLabelY + (frameLabelHeight - iconSize) / 2;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Scissors icon
    ctx.moveTo(iconX + 2, iconY + 2);
    ctx.lineTo(iconX + iconSize - 2, iconY + iconSize - 2);
    ctx.moveTo(iconX + iconSize - 2, iconY + 2);
    ctx.lineTo(iconX + 2, iconY + iconSize - 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw children (with optional clipping)
  if (shape.children) {
    if (shape.clipContent) {
      ctx.save();
      if (hasCornerRadius) {
        createRoundedRectPath(ctx, shape.x, shape.y, shape.width, shape.height, radii);
      } else {
        ctx.beginPath();
        ctx.rect(shape.x, shape.y, shape.width, shape.height);
      }
      ctx.clip();
    }

    shape.children.forEach((child, childIdx) => {
      // Skip hidden children
      if (child.visible === false) return;

      // Skip child being edited in text editor, vector edit mode, or crop mode
      const isEditingThisChild = (state.textEditingFrameChild &&
        state.textEditingFrameChild.frameIndex === frameIndex &&
        state.textEditingFrameChild.childIndex === childIdx) ||
        (state.isVectorEditing && state.vectorEditFrameIndex === frameIndex &&
        state.vectorEditFrameChildIndex === childIdx) ||
        (state.isCropping && state.cropFrameChild &&
        state.cropFrameChild.frameIndex === frameIndex &&
        state.cropFrameChild.childIndex === childIdx);

      if (!isEditingThisChild) {
        drawShapeFn(child, false);
      }

      // Draw highlight around child if frame children are highlighted
      if (shouldHighlightChildren && !isEditingThisChild) {
        drawChildHighlight(ctx, child, state, config);
      }
    });

    if (shape.clipContent) {
      ctx.restore();
    }
  }
}

/**
 * Draw highlight around a frame child
 */
function drawChildHighlight(ctx, child, state, config) {
  // Import getShapeBounds dynamically to avoid circular dependency
  const bounds = getChildBounds(child);
  if (!bounds) return;

  // Calculate display scale factor for consistent UI size
  const displayScale = state.canvasDisplayScale || 1;
  const uiScale = 1 / state.zoom / displayScale;

  ctx.save();
  ctx.strokeStyle = config.theme?.colors?.accent || '#6366f1';
  ctx.fillStyle = config.theme?.colors?.accentLight || 'rgba(99, 102, 241, 0.15)';
  ctx.lineWidth = 2 * uiScale;
  ctx.setLineDash([]);

  const highlightPadding = 4 * uiScale;
  ctx.fillRect(
    bounds.x - highlightPadding,
    bounds.y - highlightPadding,
    bounds.width + highlightPadding * 2,
    bounds.height + highlightPadding * 2
  );
  ctx.strokeRect(
    bounds.x - highlightPadding,
    bounds.y - highlightPadding,
    bounds.width + highlightPadding * 2,
    bounds.height + highlightPadding * 2
  );
  ctx.restore();
}

/**
 * Get bounds for a child shape (simplified version)
 */
function getChildBounds(shape) {
  if (!shape) return null;

  switch (shape.type) {
    case 'rect':
    case 'image':
    case 'video':
    case 'text':
    case 'frame':
      return {
        x: shape.x,
        y: shape.y,
        width: shape.width || 100,
        height: shape.height || 100
      };
    case 'ellipse':
    case 'circle':
      const rx = shape.radiusX || shape.radius || 50;
      const ry = shape.radiusY || shape.radius || 50;
      return {
        x: shape.x - rx,
        y: shape.y - ry,
        width: rx * 2,
        height: ry * 2
      };
    case 'line':
    case 'arrow':
      return {
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1)
      };
    default:
      return null;
  }
}

export default { drawFrame };
