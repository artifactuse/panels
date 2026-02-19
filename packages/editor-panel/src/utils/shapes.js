// editor/utils/shapes.js
// Shape utility functions - pure functions

let shapeIdCounter = 0;
let frameCounter = 0;

/**
 * Generate a unique shape ID
 * @returns {string} Unique ID
 */
export function generateId() {
  return 'shape_' + (++shapeIdCounter);
}

/**
 * Reset the ID counter (useful for testing)
 * @param {number} value - Value to reset to
 */
export function resetIdCounter(value = 0) {
  shapeIdCounter = value;
}

/**
 * Generate a frame name
 * @returns {string} Frame name
 */
export function generateFrameName() {
  return 'Frame ' + (++frameCounter);
}

/**
 * Reset the frame counter (useful for testing)
 * @param {number} value - Value to reset to
 */
export function resetFrameCounter(value = 0) {
  frameCounter = value;
}

/**
 * Get human-readable name for a shape
 * @param {object} shape - Shape object
 * @returns {string} Shape name
 */
export function getShapeName(shape) {
  const names = {
    circle: 'Circle',
    rect: 'Rectangle',
    diamond: 'Diamond',
    line: 'Line',
    arrow: 'Arrow',
    ellipse: 'Ellipse',
    text: 'Text',
    freehand: 'Draw',
    group: 'Group',
    triangle: 'Triangle',
    image: 'Image',
    frame: shape.name || 'Frame',
    video: 'Video',
    audio: 'Audio',
    path: 'Path',
    effect: 'Effect',
    filter: 'Filter',
    transition: 'Transition',
    cursor: 'Cursor',
    screenCapture: 'Screen',
    webcamCapture: 'Webcam'
  };
  return names[shape.type] || 'Shape';
}

/**
 * Get SVG icon markup for a shape type
 * @param {string} type - Shape type
 * @returns {string} SVG path/elements
 */
export function getShapeIcon(type) {
  const icons = {
    circle: '<circle cx="12" cy="12" r="8"></circle>',
    ellipse: '<ellipse cx="12" cy="12" rx="10" ry="6"></ellipse>',
    rect: '<rect x="4" y="4" width="16" height="16" rx="2"></rect>',
    diamond: '<path d="M12 2L22 12L12 22L2 12L12 2z"></path>',
    triangle: '<path d="M12 4L20 18H4L12 4z"></path>',
    line: '<line x1="5" y1="19" x2="19" y2="5"></line>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
    text: '<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="12" y1="4" x2="12" y2="20"></line>',
    freehand: '<path d="M3 17c0-2 1-4 3-4s3 2 5 2 3-2 5-2 3 2 3 4"></path>',
    group: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    video: '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><polygon points="10 8 16 12 10 16 10 8"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    frame: '<rect x="3" y="6" width="18" height="15" rx="1" stroke-dasharray="3 2"></rect><line x1="3" y1="3" x2="10" y2="3"></line>',
    path: '<path d="M4 16 Q8 4 12 12 T20 8"></path>',
    effect: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    transition: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    cursor: '<path d="M4 4l6 16 2-6 6-2L4 4z"/><line x1="14" y1="14" x2="20" y2="20"/>',
    screenCapture: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    webcamCapture: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'
  };
  return icons[type] || '<rect x="4" y="4" width="16" height="16"></rect>';
}

/**
 * Check if a shape is inside a frame's bounds
 * @param {object} shape - Shape to check
 * @param {object} frame - Frame shape
 * @param {function} getShapeBounds - Bounds getter function
 * @returns {boolean}
 */
export function isShapeInFrame(shape, frame, getShapeBounds) {
  if (frame.type !== 'frame' || shape === frame) return false;
  const bounds = getShapeBounds(shape);
  if (!bounds) return false;

  // Check if shape's center is inside frame
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return centerX >= frame.x &&
         centerX <= frame.x + frame.width &&
         centerY >= frame.y &&
         centerY <= frame.y + frame.height;
}

/**
 * Find which frame a shape belongs to
 * @param {object} shape - Shape to find
 * @param {array} shapes - All shapes
 * @returns {{frame: object, index: number}|null}
 */
export function findParentFrame(shape, shapes) {
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (s.type === 'frame' && s.children) {
      if (s.children.some(c => c.id === shape.id)) {
        return { frame: s, index: i };
      }
    }
  }
  return null;
}

/**
 * Get frame by index with safety check
 * @param {number} frameIndex - Index of frame
 * @param {array} shapes - All shapes
 * @returns {object|null} Frame or null
 */
export function getFrameByIndex(frameIndex, shapes) {
  if (frameIndex < 0 || frameIndex >= shapes.length) return null;
  const shape = shapes[frameIndex];
  return shape?.type === 'frame' ? shape : null;
}

/**
 * Get shapes that are fully inside a rectangular selection
 * @param {number} x1 - Selection start X
 * @param {number} y1 - Selection start Y
 * @param {number} x2 - Selection end X
 * @param {number} y2 - Selection end Y
 * @param {array} shapes - All shapes
 * @param {function} getShapeBounds - Bounds getter function
 * @returns {array} Array of shape indices
 */
export function getShapesInRect(x1, y1, x2, y2, shapes, getShapeBounds) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);

  return shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => {
      if (s.visible === false) return false;
      const b = getShapeBounds(s);
      return b && b.x >= left && b.x + b.width <= right && b.y >= top && b.y + b.height <= bottom;
    })
    .map(({ i }) => i);
}

/**
 * Deep clone a shape (for copy/paste)
 * @param {object} shape - Shape to clone
 * @returns {object} Cloned shape
 */
export function cloneShape(shape) {
  const clone = JSON.parse(JSON.stringify(shape));
  clone.id = generateId();
  return clone;
}

/**
 * Create a default shape of given type
 * @param {string} type - Shape type
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {object} defaults - Default values from config
 * @returns {object} New shape object
 */
export function createDefaultShape(type, x, y, defaults = {}) {
  const base = {
    id: generateId(),
    type,
    visible: true,
    color: defaults.strokeColor || '#1e1e1e',
    lineWidth: defaults.strokeWidth || 2,
    opacity: defaults.opacity ?? 100,
  };

  switch (type) {
    case 'rect':
      return { ...base, x, y, width: 100, height: 80 };

    case 'ellipse':
      return { ...base, x, y, radiusX: 50, radiusY: 35 };

    case 'diamond':
      return { ...base, x, y, width: 80, height: 80 };

    case 'triangle':
      return { ...base, x, y, size: 80 };

    case 'line':
      return { ...base, x1: x, y1: y, x2: x + 100, y2: y };

    case 'arrow':
      return { ...base, x1: x, y1: y, x2: x + 100, y2: y, arrowType: 'single' };

    case 'text':
      return {
        ...base,
        x,
        y,
        text: 'Text',
        fontSize: defaults.fontSize || 20,
        fontFamily: defaults.fontFamily || 'Sans-serif',
      };

    case 'frame':
      return {
        ...base,
        x,
        y,
        width: 400,
        height: 300,
        name: generateFrameName(),
        children: [],
        color: defaults.frameStroke || '#6366f1',
      };

    case 'cursor':
      return {
        ...base,
        cursorType: 'pointer',
        // Use standard fill/stroke properties for consistency with options bar
        fillColor: '#ffffff',
        color: '#000000',
        cursorScale: 1.0,
        opacity: 100,
        showPath: true,
        pathColor: '#6366f1',
        pathOpacity: 50,
        cursorKeyframes: [
          { time: 0, x, y, easing: 'ease-out' }
        ],
        clicks: [],
        // Video mode timing (will be set when added to timeline)
        startTime: defaults.startTime || 0,
        duration: defaults.duration || 5,
      };

    case 'screenCapture':
      return {
        ...base,
        x,
        y,
        width: defaults.width || 1920,
        height: defaults.height || 1080,
        cornerRadius: defaults.cornerRadius || 0,
        streamId: null,
        isRecording: false,
        // Video mode timing
        startTime: defaults.startTime || 0,
        duration: defaults.duration || 60,
      };

    case 'webcamCapture':
      return {
        ...base,
        // Viewport-fixed positioning (margins from bottom-right corner)
        viewportMarginRight: defaults.viewportMarginRight ?? 24,
        viewportMarginBottom: defaults.viewportMarginBottom ?? 24,
        // x/y computed dynamically from viewport margins during render
        x: 0,
        y: 0,
        width: defaults.width || 320,
        height: defaults.height || 240,
        rotation: defaults.rotation || 0,
        cornerRadius: defaults.cornerRadius || 16, // Rounded by default like video PiP
        // Stroke styling (like video shape)
        strokeColor: defaults.strokeColor || null,
        lineWidth: defaults.lineWidth || 2,
        streamId: null,
        isRecording: false,
        // Video mode timing
        startTime: defaults.startTime || 0,
        duration: defaults.duration || 60,
      };

    default:
      return { ...base, x, y };
  }
}

export default {
  generateId,
  resetIdCounter,
  generateFrameName,
  resetFrameCounter,
  getShapeName,
  getShapeIcon,
  isShapeInFrame,
  findParentFrame,
  getFrameByIndex,
  getShapesInRect,
  cloneShape,
  createDefaultShape
};
