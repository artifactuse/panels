// renderer/shapes/index.js
// Barrel export for all shape renderers

export { drawRect, drawDiamond, drawTriangle } from './rect.js';
export { drawEllipse, drawCircle } from './ellipse.js';
export { drawLine, drawArrow, drawArrowHead } from './arrow.js';
export { drawText } from './text.js';
export { drawImage, drawVideo } from './media.js';
export { drawFreehand } from './freehand.js';
export { drawPath } from './path.js';
export { drawFrame } from './frame.js';
export { drawGroup, getGroupBounds } from './group.js';
export { drawCursor, interpolateCursorPosition } from './cursor.js';
export { drawScreenCapture, drawWebcamCapture } from './capture.js';

// Import all draw functions for the lookup map
import { drawRect, drawDiamond, drawTriangle } from './rect.js';
import { drawEllipse, drawCircle } from './ellipse.js';
import { drawLine, drawArrow } from './arrow.js';
import { drawText } from './text.js';
import { drawImage, drawVideo } from './media.js';
import { drawFreehand } from './freehand.js';
import { drawPath } from './path.js';
import { drawFrame } from './frame.js';
import { drawGroup } from './group.js';
import { drawCursor } from './cursor.js';
import { drawScreenCapture, drawWebcamCapture } from './capture.js';

/**
 * Map of shape types to their draw functions
 */
const drawFunctions = {
  rect: drawRect,
  diamond: drawDiamond,
  triangle: drawTriangle,
  ellipse: drawEllipse,
  circle: drawCircle,
  line: drawLine,
  arrow: drawArrow,
  text: drawText,
  image: drawImage,
  video: drawVideo,
  freehand: drawFreehand,
  path: drawPath,
  frame: drawFrame,
  group: drawGroup,
  cursor: drawCursor,
  screenCapture: drawScreenCapture,
  webcamCapture: drawWebcamCapture
};

/**
 * Get the appropriate draw function for a shape type
 * @param {string} type - Shape type
 * @returns {Function|null} Draw function or null if not found
 */
export function getDrawFunction(type) {
  return drawFunctions[type] || null;
}

/**
 * Shape type categories for UI and logic
 */
export const shapeCategories = {
  geometric: ['rect', 'ellipse', 'circle', 'diamond', 'triangle'],
  drawing: ['line', 'arrow', 'freehand', 'path'],
  media: ['image', 'video'],
  text: ['text'],
  container: ['frame', 'group'],
  animation: ['cursor'],
  capture: ['screenCapture', 'webcamCapture']
};

/**
 * Check if a shape type requires Rough.js for sketchy rendering
 * @param {string} type - Shape type
 * @returns {boolean} True if shape supports sketchy mode
 */
export function supportsSketchy(type) {
  // Freehand, text, image, video, cursor, capture don't use Rough.js
  const nonSketchyTypes = ['freehand', 'text', 'image', 'video', 'frame', 'group', 'cursor', 'screenCapture', 'webcamCapture'];
  return !nonSketchyTypes.includes(type);
}

/**
 * Check if a shape type supports fill
 * @param {string} type - Shape type
 * @returns {boolean} True if shape supports fill color
 */
export function supportsFill(type) {
  const fillableTypes = ['rect', 'ellipse', 'circle', 'diamond', 'triangle', 'freehand', 'path'];
  return fillableTypes.includes(type);
}

/**
 * Check if a shape type is a container (has children)
 * @param {string} type - Shape type
 * @returns {boolean} True if shape can contain children
 */
export function isContainer(type) {
  return type === 'frame' || type === 'group';
}

export default {
  getDrawFunction,
  shapeCategories,
  supportsSketchy,
  supportsFill,
  isContainer
};
