/**
 * pencil.js
 * Render animated pencil/pen cursors on the recording canvas during drawing
 *
 * Supports 6 styles: pencil, mechanical, pen, marker, stylus, chalk
 * Each style is drawn procedurally using canvas paths (no external images)
 *
 * Pencil type definitions (dimensions, colors, UI metadata) are centralized
 * in config/defaults.js under `pencilTypes` to avoid duplication.
 */

import { defaultConfig } from '../../config/defaults.js';

// Reference to pencil types from centralized config
const pencilTypes = defaultConfig.pencilTypes;

/**
 * Get pencil type definition by name
 */
export function getPencilType(style) {
  return pencilTypes[style] || pencilTypes.pencil;
}

/**
 * Draw a wooden pencil
 */
function drawWoodenPencil(ctx, scale) {
  const p = pencilTypes.pencil;
  const w = p.bodyWidth * scale;
  const hw = w / 2;

  // Total lengths
  const tipLen = p.tipLength * scale;
  const woodLen = p.woodLength * scale;
  const bodyLen = p.bodyLength * scale;
  const ferruleLen = p.ferruleLength * scale;
  const eraserLen = p.eraserLength * scale;

  // Y positions (tip at 0, body extends upward in negative Y)
  let y = 0;

  // 1. Graphite tip (triangle)
  ctx.beginPath();
  ctx.moveTo(0, y);                    // Tip point
  ctx.lineTo(-hw * 0.3, y - tipLen);   // Left edge of tip
  ctx.lineTo(hw * 0.3, y - tipLen);    // Right edge of tip
  ctx.closePath();
  ctx.fillStyle = p.colors.tip;
  ctx.fill();
  y -= tipLen;

  // 2. Exposed wood (tapered trapezoid)
  ctx.beginPath();
  ctx.moveTo(-hw * 0.3, y);            // Bottom left
  ctx.lineTo(-hw, y - woodLen);        // Top left
  ctx.lineTo(hw, y - woodLen);         // Top right
  ctx.lineTo(hw * 0.3, y);             // Bottom right
  ctx.closePath();
  ctx.fillStyle = p.colors.wood;
  ctx.fill();
  ctx.strokeStyle = p.colors.wood;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();
  y -= woodLen;

  // 3. Yellow body (hexagonal-ish rectangle)
  ctx.beginPath();
  ctx.moveTo(-hw, y);
  ctx.lineTo(-hw, y - bodyLen);
  ctx.lineTo(hw, y - bodyLen);
  ctx.lineTo(hw, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.body;
  ctx.fill();
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  // Add subtle hexagonal facets (lines on body)
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.5, y);
  ctx.lineTo(-hw * 0.5, y - bodyLen);
  ctx.moveTo(hw * 0.5, y);
  ctx.lineTo(hw * 0.5, y - bodyLen);
  ctx.stroke();
  ctx.globalAlpha = 1;
  y -= bodyLen;

  // 4. Metal ferrule (band)
  ctx.beginPath();
  ctx.moveTo(-hw, y);
  ctx.lineTo(-hw, y - ferruleLen);
  ctx.lineTo(hw, y - ferruleLen);
  ctx.lineTo(hw, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.ferrule;
  ctx.fill();
  ctx.strokeStyle = p.colors.ferruleStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();

  // Ferrule ridges
  ctx.strokeStyle = p.colors.ferruleStroke;
  ctx.lineWidth = 0.5 * scale;
  for (let i = 1; i <= 3; i++) {
    const ry = y - (ferruleLen * i / 4);
    ctx.beginPath();
    ctx.moveTo(-hw, ry);
    ctx.lineTo(hw, ry);
    ctx.stroke();
  }
  y -= ferruleLen;

  // 5. Pink eraser (rounded rectangle)
  ctx.beginPath();
  ctx.moveTo(-hw, y);
  ctx.lineTo(-hw, y - eraserLen + hw);
  ctx.quadraticCurveTo(-hw, y - eraserLen, 0, y - eraserLen);
  ctx.quadraticCurveTo(hw, y - eraserLen, hw, y - eraserLen + hw);
  ctx.lineTo(hw, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.eraser;
  ctx.fill();
  ctx.strokeStyle = p.colors.eraserStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();
}

/**
 * Draw a mechanical pencil
 */
function drawMechanicalPencil(ctx, scale) {
  const p = pencilTypes.mechanical;
  const w = p.bodyWidth * scale;
  const hw = w / 2;

  const tipLen = p.tipLength * scale;
  const gripLen = p.gripLength * scale;
  const bodyLen = p.bodyLength * scale;

  let y = 0;

  // 1. Metal tip cone
  ctx.beginPath();
  ctx.moveTo(0, y);                    // Point
  ctx.lineTo(-hw * 0.5, y - tipLen);
  ctx.lineTo(hw * 0.5, y - tipLen);
  ctx.closePath();
  ctx.fillStyle = p.colors.tip;
  ctx.fill();
  ctx.strokeStyle = p.colors.tipStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();
  y -= tipLen;

  // 2. Rubber grip (textured)
  ctx.beginPath();
  ctx.moveTo(-hw * 0.5, y);
  ctx.lineTo(-hw * 0.8, y - gripLen);
  ctx.lineTo(hw * 0.8, y - gripLen);
  ctx.lineTo(hw * 0.5, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.grip;
  ctx.fill();

  // Grip ridges
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1 * scale;
  for (let i = 1; i < 6; i++) {
    const gy = y - (gripLen * i / 6);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.7, gy);
    ctx.lineTo(hw * 0.7, gy);
    ctx.stroke();
  }
  y -= gripLen;

  // 3. Main body
  ctx.beginPath();
  ctx.moveTo(-hw * 0.8, y);
  ctx.lineTo(-hw, y - bodyLen);
  ctx.lineTo(hw, y - bodyLen);
  ctx.lineTo(hw * 0.8, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.body;
  ctx.fill();
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();

  // Clip
  ctx.beginPath();
  ctx.moveTo(hw, y - bodyLen * 0.2);
  ctx.lineTo(hw + 3 * scale, y - bodyLen * 0.2);
  ctx.lineTo(hw + 3 * scale, y - bodyLen * 0.6);
  ctx.lineTo(hw, y - bodyLen * 0.6);
  ctx.fillStyle = p.colors.clip;
  ctx.fill();
  y -= bodyLen;

  // 4. Click button
  ctx.beginPath();
  ctx.arc(0, y - 5 * scale, hw * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = p.colors.button;
  ctx.fill();
}

/**
 * Draw a ballpoint pen
 */
function drawBallpointPen(ctx, scale) {
  const p = pencilTypes.pen;
  const w = p.bodyWidth * scale;
  const hw = w / 2;

  const tipLen = p.tipLength * scale;
  const bodyLen = p.bodyLength * scale;

  let y = 0;

  // 1. Metal tip
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(-hw * 0.3, y - tipLen);
  ctx.lineTo(hw * 0.3, y - tipLen);
  ctx.closePath();
  ctx.fillStyle = p.colors.tip;
  ctx.fill();

  // Ball point
  ctx.beginPath();
  ctx.arc(0, y - 1 * scale, 1.5 * scale, 0, Math.PI * 2);
  ctx.fillStyle = p.colors.tipBall;
  ctx.fill();
  y -= tipLen;

  // 2. Body (tapers slightly at top)
  ctx.beginPath();
  ctx.moveTo(-hw * 0.3, y);
  ctx.lineTo(-hw, y - 10 * scale);
  ctx.lineTo(-hw, y - bodyLen);
  ctx.lineTo(hw, y - bodyLen);
  ctx.lineTo(hw, y - 10 * scale);
  ctx.lineTo(hw * 0.3, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.body;
  ctx.fill();
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();

  // Clip
  ctx.beginPath();
  ctx.moveTo(hw, y - bodyLen * 0.1);
  ctx.lineTo(hw + 2 * scale, y - bodyLen * 0.1);
  ctx.lineTo(hw + 2 * scale, y - bodyLen * 0.5);
  ctx.lineTo(hw + 1 * scale, y - bodyLen * 0.55);
  ctx.lineTo(hw, y - bodyLen * 0.5);
  ctx.fillStyle = p.colors.clip;
  ctx.fill();
  ctx.strokeStyle = p.colors.clipStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();
}

/**
 * Draw a felt-tip marker
 */
function drawMarker(ctx, scale) {
  const p = pencilTypes.marker;
  const w = p.bodyWidth * scale;
  const hw = w / 2;

  const tipLen = p.tipLength * scale;
  const bodyLen = p.bodyLength * scale;
  const capLen = p.capLength * scale;

  let y = 0;

  // 1. Felt tip (chisel shape)
  ctx.beginPath();
  ctx.moveTo(-hw * 0.3, y);
  ctx.lineTo(-hw * 0.6, y - tipLen);
  ctx.lineTo(hw * 0.6, y - tipLen);
  ctx.lineTo(hw * 0.3, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.tip;
  ctx.fill();
  y -= tipLen;

  // 2. Body
  ctx.beginPath();
  ctx.moveTo(-hw * 0.6, y);
  ctx.lineTo(-hw, y - 5 * scale);
  ctx.lineTo(-hw, y - bodyLen);
  ctx.lineTo(hw, y - bodyLen);
  ctx.lineTo(hw, y - 5 * scale);
  ctx.lineTo(hw * 0.6, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.body;
  ctx.fill();
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  // White label area
  ctx.fillStyle = p.colors.label;
  ctx.fillRect(-hw + 2 * scale, y - bodyLen * 0.6, w - 4 * scale, bodyLen * 0.3);
  y -= bodyLen;

  // 3. Cap
  ctx.beginPath();
  ctx.moveTo(-hw, y);
  ctx.lineTo(-hw, y - capLen + hw);
  ctx.quadraticCurveTo(-hw, y - capLen, 0, y - capLen);
  ctx.quadraticCurveTo(hw, y - capLen, hw, y - capLen + hw);
  ctx.lineTo(hw, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.cap;
  ctx.fill();
}

/**
 * Draw a digital stylus
 */
function drawStylus(ctx, scale) {
  const p = pencilTypes.stylus;
  const w = p.bodyWidth * scale;
  const hw = w / 2;

  const tipLen = p.tipLength * scale;
  const neckLen = p.neckLength * scale;
  const bodyLen = p.bodyLength * scale;

  let y = 0;

  // 1. Rubber tip (rounded)
  ctx.beginPath();
  ctx.arc(0, y - tipLen / 2, tipLen / 2, 0, Math.PI * 2);
  ctx.fillStyle = p.colors.tip;
  ctx.fill();
  y -= tipLen;

  // 2. Tapered neck
  ctx.beginPath();
  ctx.moveTo(-tipLen / 2, y);
  ctx.lineTo(-hw * 0.7, y - neckLen);
  ctx.lineTo(hw * 0.7, y - neckLen);
  ctx.lineTo(tipLen / 2, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.neck;
  ctx.fill();
  y -= neckLen;

  // 3. Main body
  ctx.beginPath();
  ctx.moveTo(-hw * 0.7, y);
  ctx.lineTo(-hw, y - 5 * scale);
  ctx.lineTo(-hw, y - bodyLen);
  ctx.lineTo(hw, y - bodyLen);
  ctx.lineTo(hw, y - 5 * scale);
  ctx.lineTo(hw * 0.7, y);
  ctx.closePath();
  ctx.fillStyle = p.colors.body;
  ctx.fill();
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();

  // Blue accent ring
  ctx.strokeStyle = p.colors.accent;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-hw, y - 8 * scale);
  ctx.lineTo(hw, y - 8 * scale);
  ctx.stroke();

  // Side button
  ctx.fillStyle = p.colors.button;
  ctx.fillRect(hw, y - bodyLen * 0.4, 2 * scale, bodyLen * 0.2);
  ctx.strokeStyle = p.colors.buttonStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.strokeRect(hw, y - bodyLen * 0.4, 2 * scale, bodyLen * 0.2);
}

/**
 * Draw a chalk stick
 */
function drawChalk(ctx, scale) {
  const p = pencilTypes.chalk;
  const w = p.bodyWidth * scale;
  const hw = w / 2;

  const tipLen = p.tipLength * scale;
  const bodyLen = p.bodyLength * scale;

  let y = 0;

  // Chalk is irregular - add some randomness to edges
  ctx.beginPath();
  ctx.moveTo(0, y);  // Worn tip
  ctx.lineTo(-hw * 0.5, y - tipLen);
  ctx.lineTo(-hw * 0.8, y - tipLen * 1.5);
  ctx.lineTo(-hw, y - bodyLen * 0.1);
  ctx.lineTo(-hw * 1.1, y - bodyLen * 0.5);  // Slight bulge
  ctx.lineTo(-hw, y - bodyLen);
  ctx.lineTo(hw * 0.9, y - bodyLen);
  ctx.lineTo(hw, y - bodyLen * 0.4);
  ctx.lineTo(hw * 0.9, y - bodyLen * 0.1);
  ctx.lineTo(hw * 0.6, y - tipLen * 1.2);
  ctx.lineTo(hw * 0.4, y - tipLen);
  ctx.closePath();
  ctx.fillStyle = p.colors.body;
  ctx.fill();
  ctx.strokeStyle = p.colors.bodyStroke;
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();

  // Dust particles (small dots around tip)
  ctx.fillStyle = p.colors.dust;
  for (let i = 0; i < 5; i++) {
    const dx = (Math.random() - 0.5) * w * 2;
    const dy = -Math.random() * tipLen * 2;
    ctx.beginPath();
    ctx.arc(dx, dy, scale * (0.5 + Math.random()), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Main function: Draw pencil cursor at position
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Drawing point X (world coordinates)
 * @param {number} y - Drawing point Y (world coordinates)
 * @param {string} style - Pencil style name
 * @param {number} scale - Size multiplier (default from config)
 * @param {number} angle - Rotation angle in radians (default from config ~23° tilt)
 */
export function drawPencilCursor(ctx, x, y, style = 'pencil', scale = defaultConfig.pencilCursor.defaultScale, angle = defaultConfig.pencilCursor.defaultAngle) {
  const pencil = getPencilType(style);
  if (!pencil) return;

  ctx.save();

  // Move to cursor position
  ctx.translate(x, y);

  // Rotate to natural writing angle
  ctx.rotate(angle);

  // Draw the appropriate pencil style
  switch (style) {
    case 'pencil':
      drawWoodenPencil(ctx, scale);
      break;
    case 'mechanical':
      drawMechanicalPencil(ctx, scale);
      break;
    case 'pen':
      drawBallpointPen(ctx, scale);
      break;
    case 'marker':
      drawMarker(ctx, scale);
      break;
    case 'stylus':
      drawStylus(ctx, scale);
      break;
    case 'chalk':
      drawChalk(ctx, scale);
      break;
    default:
      drawWoodenPencil(ctx, scale);
  }

  ctx.restore();
}

/**
 * Get list of available pencil styles for UI
 */
export function getPencilStyles() {
  return Object.entries(pencilTypes).map(([key, value]) => ({
    value: key,
    label: value.name
  }));
}

export default {
  drawPencilCursor,
  getPencilType,
  getPencilStyles,
  pencilTypes
};
