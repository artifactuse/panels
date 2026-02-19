// editor/bridge/utilsBridge.js
// Bridge layer that exposes ES6 utility functions to window using global state
// This replaces the legacy utils.js script injection

// Import all ES6 utility functions
import {
  generateId,
  generateFrameName,
  getShapeName,
  getShapeIcon,
  isShapeInFrame as _isShapeInFrame,
  findParentFrame as _findParentFrame,
  getFrameByIndex as _getFrameByIndex,
  getShapesInRect as _getShapesInRect,
} from '../utils/shapes.js';

import {
  getShapeBounds as _getShapeBounds,
  getFrameContentBounds,
  getResizeHandles,
  getRotationHandle as _getRotationHandle,
  getMultiSelectionBounds as _getMultiSelectionBounds,
  getQuadraticBezierPoint,
  getDefaultControlPoint,
  getQuadraticBezierStartAngle,
  getQuadraticBezierEndAngle,
} from '../utils/geometry.js';

import {
  screenToCanvas as _screenToCanvas,
  worldToFrameLocal,
  frameLocalToWorld,
  worldDeltaToFrameLocal,
  getTotalRotation,
} from '../utils/coordinates.js';

import {
  isPointInFrame,
  hitTest as _hitTest,
  hitTestSimple as _hitTestSimple,
  hitTestFrameLabel as _hitTestFrameLabel,
  hitTestHandle as _hitTestHandle,
  hitTestHandleForBounds as _hitTestHandleForBounds,
  hitTestControlPoint as _hitTestControlPoint,
} from '../utils/hitTesting.js';

/**
 * Initialize the utility bridge
 * Exposes all utility functions to window using global state/config/ctx
 * Must be called AFTER window.state, window.CONFIG, and window.ctx are set up
 */
export function initUtilsBridge() {
  // Direct exports (no state dependency)
  window.generateId = generateId;
  window.generateFrameName = generateFrameName;
  window.getShapeName = getShapeName;
  window.getShapeIcon = getShapeIcon;
  window.getFrameContentBounds = getFrameContentBounds;
  window.worldToFrameLocal = worldToFrameLocal;
  window.frameLocalToWorld = frameLocalToWorld;
  window.worldDeltaToFrameLocal = worldDeltaToFrameLocal;
  window.getTotalRotation = getTotalRotation;
  window.isPointInFrame = isPointInFrame;
  window.getQuadraticBezierPoint = getQuadraticBezierPoint;
  window.getDefaultControlPoint = getDefaultControlPoint;
  window.getQuadraticBezierStartAngle = getQuadraticBezierStartAngle;
  window.getQuadraticBezierEndAngle = getQuadraticBezierEndAngle;
  window.getResizeHandles = getResizeHandles;

  // Wrapped exports (use window globals)

  // screenToCanvas - uses window.state and window.canvas
  window.screenToCanvas = function(clientX, clientY) {
    return _screenToCanvas(clientX, clientY, window.state, window.canvas);
  };

  // getShapeBounds - uses window.CONFIG and window.ctx
  window.getShapeBounds = function(shape) {
    return _getShapeBounds(shape, window.CONFIG || {}, window.ctx);
  };

  // getRotationHandle - uses window.CONFIG
  window.getRotationHandle = function(bounds, padding = 6) {
    const offset = window.CONFIG?.selection?.rotationHandleOffset || 25;
    return _getRotationHandle(bounds, padding, offset);
  };

  // getMultiSelectionBounds - uses window.state, window.CONFIG, window.ctx
  window.getMultiSelectionBounds = function() {
    const state = window.state;
    if (!state || state.selectedIndices.length < 2) return null;
    return _getMultiSelectionBounds(state.shapes, state.selectedIndices, window.CONFIG || {}, window.ctx);
  };

  // isShapeInFrame - uses window.getShapeBounds
  window.isShapeInFrame = function(shape, frame) {
    return _isShapeInFrame(shape, frame, window.getShapeBounds);
  };

  // findParentFrame - uses window.state.shapes
  window.findParentFrame = function(shape) {
    return _findParentFrame(shape, window.state?.shapes || []);
  };

  // getFrameByIndex - uses window.state.shapes
  window.getFrameByIndex = function(frameIndex) {
    return _getFrameByIndex(frameIndex, window.state?.shapes || []);
  };

  // getShapesInRect - uses window.state.shapes and window.getShapeBounds
  window.getShapesInRect = function(x1, y1, x2, y2) {
    return _getShapesInRect(x1, y1, x2, y2, window.state?.shapes || [], window.getShapeBounds);
  };

  // hitTest - uses window.state, window.CONFIG, window.ctx
  window.hitTest = function(x, y) {
    return _hitTest(x, y, window.state, window.CONFIG || {}, window.ctx, window.isShapeVisibleAtTime);
  };

  // hitTestSimple - uses window.state, window.CONFIG, window.ctx
  window.hitTestSimple = function(x, y) {
    return _hitTestSimple(x, y, window.state, window.CONFIG || {}, window.ctx, window.isShapeVisibleAtTime);
  };

  // hitTestFrameLabel - uses window.state, window.CONFIG, window.ctx
  window.hitTestFrameLabel = function(x, y) {
    return _hitTestFrameLabel(x, y, window.state, window.CONFIG || {}, window.ctx);
  };

  // hitTestHandle - uses window.state, window.CONFIG, window.ctx
  window.hitTestHandle = function(x, y) {
    return _hitTestHandle(x, y, window.state, window.CONFIG || {}, window.ctx);
  };

  // hitTestHandleForBounds - uses window.state, window.CONFIG
  window.hitTestHandleForBounds = function(x, y, bounds, childRotation = 0, frameIndex = -1) {
    return _hitTestHandleForBounds(x, y, bounds, childRotation, frameIndex, window.state, window.CONFIG || {});
  };

  // hitTestControlPoint - uses window.state, window.CONFIG
  window.hitTestControlPoint = function(x, y, shape, frameIndex = -1) {
    return _hitTestControlPoint(x, y, shape, frameIndex, window.state, window.CONFIG || {});
  };
}

export default { initUtilsBridge };
