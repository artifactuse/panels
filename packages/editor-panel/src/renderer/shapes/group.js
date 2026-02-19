// renderer/shapes/group.js
// Group shape rendering - renders children with group transform

/**
 * Draw a group shape by rendering all its children with the group's transform applied
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} shape - Group shape data
 * @param {Object} options - Rendering options
 * @param {Function} drawShapeFn - Function to draw child shapes
 */
export function drawGroup(ctx, shape, options, drawShapeFn) {
  if (!shape.children || shape.children.length === 0) return;

  ctx.save();

  // Apply group transform if it has position offset
  if (shape.x !== undefined && shape.y !== undefined) {
    ctx.translate(shape.x, shape.y);
  }

  // Apply group rotation if present
  if (shape.rotation) {
    // Get group center for rotation
    const bounds = getGroupBounds(shape);
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((shape.rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }

  // Apply group scale if present
  if (shape.scaleX !== undefined || shape.scaleY !== undefined) {
    ctx.scale(shape.scaleX || 1, shape.scaleY || 1);
  }

  // Apply group opacity if present
  if (shape.opacity !== undefined && shape.opacity < 100) {
    ctx.globalAlpha = ctx.globalAlpha * (shape.opacity / 100);
  }

  // Draw all children (skip hidden ones)
  shape.children.forEach((child, index) => {
    if (child.visible === false) return;
    drawShapeFn(child, index);
  });

  ctx.restore();
}

/**
 * Get the bounding box of a group based on its children
 * @param {Object} group - Group shape with children
 * @returns {Object} Bounds {x, y, width, height}
 */
export function getGroupBounds(group) {
  if (!group.children || group.children.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  group.children.forEach(child => {
    const bounds = getChildBounds(child);
    if (bounds) {
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }
  });

  return {
    x: minX === Infinity ? 0 : minX,
    y: minY === Infinity ? 0 : minY,
    width: maxX === -Infinity ? 0 : maxX - minX,
    height: maxY === -Infinity ? 0 : maxY - minY
  };
}

/**
 * Get bounds for a child shape
 * @param {Object} shape - Child shape
 * @returns {Object|null} Bounds {x, y, width, height}
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
    case 'diamond':
    case 'triangle':
      const size = shape.size || 60;
      return {
        x: shape.x - size / 2,
        y: shape.y - size / 2,
        width: size,
        height: size
      };
    case 'line':
    case 'arrow':
      return {
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        width: Math.abs(shape.x2 - shape.x1) || 1,
        height: Math.abs(shape.y2 - shape.y1) || 1
      };
    case 'freehand':
    case 'path':
      if (!shape.points || shape.points.length === 0) return null;
      let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
      shape.points.forEach(p => {
        pMinX = Math.min(pMinX, p.x);
        pMinY = Math.min(pMinY, p.y);
        pMaxX = Math.max(pMaxX, p.x);
        pMaxY = Math.max(pMaxY, p.y);
      });
      return {
        x: pMinX,
        y: pMinY,
        width: pMaxX - pMinX || 1,
        height: pMaxY - pMinY || 1
      };
    case 'group':
      return getGroupBounds(shape);
    default:
      return null;
  }
}

export default { drawGroup, getGroupBounds };
