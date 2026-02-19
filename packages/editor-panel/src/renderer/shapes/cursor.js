// renderer/shapes/cursor.js
// Cursor shape rendering with motion path and click effects

import { defaultConfig } from '../../config/defaults.js';

/**
 * Get cursor type definitions from config
 * Falls back to pointer if type not found
 */
function getCursorDef(cursorType) {
  const cursorTypes = defaultConfig.cursorTypes || {};
  return cursorTypes[cursorType] || cursorTypes.pointer || {
    path: [{ x: 0, y: 0 }, { x: 0, y: 17 }, { x: 4, y: 13 }, { x: 7, y: 19 }, { x: 9, y: 18 }, { x: 6, y: 12 }, { x: 11, y: 12 }],
    closed: true,
    baseScale: 1.5,
    hotspotX: 0,
    hotspotY: 0
  };
}

/**
 * Apply easing function to progress value
 * @param {number} t - Progress (0 to 1)
 * @param {string} easing - Easing type
 * @returns {number} Eased progress
 */
function applyEasing(t, easing) {
  // Clamp t to 0-1
  t = Math.max(0, Math.min(1, t));

  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'ease':
      // CSS ease equivalent (cubic-bezier(0.25, 0.1, 0.25, 1.0))
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}

/**
 * Evaluate cubic bezier curve at parameter t
 * @param {number} p0x - Start point X
 * @param {number} p0y - Start point Y
 * @param {number} c0x - Control point 1 X
 * @param {number} c0y - Control point 1 Y
 * @param {number} c1x - Control point 2 X
 * @param {number} c1y - Control point 2 Y
 * @param {number} p1x - End point X
 * @param {number} p1y - End point Y
 * @param {number} t - Parameter (0 to 1)
 * @returns {{x: number, y: number}} Point on curve
 */
function evaluateCubicBezier(p0x, p0y, c0x, c0y, c1x, c1y, p1x, p1y, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0x + 3 * mt2 * t * c0x + 3 * mt * t2 * c1x + t3 * p1x,
    y: mt3 * p0y + 3 * mt2 * t * c0y + 3 * mt * t2 * c1y + t3 * p1y
  };
}

/**
 * Interpolate cursor position between keyframes at given time
 * Supports linear interpolation, easing, and bezier curves
 * @param {object} shape - Cursor shape object
 * @param {number} currentTime - Current playback time
 * @returns {{x: number, y: number}} Interpolated position
 */
export function interpolateCursorPosition(shape, currentTime) {
  const { cursorKeyframes, startTime = 0 } = shape;
  // Default opacity comes from shape, fallback to 100 only if shape.opacity is not set
  const defaultOpacity = shape.opacity ?? 100;

  // If no cursorKeyframes, return shape position or origin
  if (!cursorKeyframes || cursorKeyframes.length === 0) {
    return { x: shape.x || 0, y: shape.y || 0, opacity: defaultOpacity };
  }

  // Time relative to clip start
  const clipTime = currentTime - startTime;

  // Before first keyframe's path time completes
  const firstKf = cursorKeyframes[0];
  if (clipTime <= (firstKf.time || 0)) {
    // Use keyframe opacity if explicitly set, otherwise use shape's opacity
    return { x: firstKf.x, y: firstKf.y, opacity: firstKf.opacity ?? defaultOpacity };
  }

  // Calculate total duration of all keyframes (for last keyframe check)
  let totalDuration = 0;
  for (const kf of cursorKeyframes) {
    totalDuration += (kf.time || 0) + (kf.holdTime || 0);
  }

  // After all keyframes complete
  const lastKf = cursorKeyframes[cursorKeyframes.length - 1];
  if (clipTime >= totalDuration) {
    return { x: lastKf.x, y: lastKf.y, opacity: lastKf.opacity ?? defaultOpacity };
  }

  // Build cumulative timeline
  // The timeline is: move to K1 → hold K1 → move to K2 → hold K2 → ...
  // K0.time = when cursor arrives at K0 (path time)
  // K0.holdTime = how long cursor stays at K0
  // Movement from K(i) to K(i+1) uses duration = K(i+1).time (the path time represents travel duration)

  // Calculate effective timeline positions
  // Timeline: [0, K0.time) = moving to K0, [K0.time, K0.time + K0.hold) = hold at K0, etc.
  // But K0.time is typically 0 for the first keyframe

  // Better model: treat keyframe.time as "path duration" (how long to travel TO this keyframe)
  // Timeline for each keyframe i:
  //   - arrivalTime[i] = sum of all previous (pathTime + holdTime) + this pathTime
  //   - holdEndTime[i] = arrivalTime[i] + holdTime[i]

  let cumulativeTime = 0;
  let prevKf = cursorKeyframes[0];
  let nextKf = cursorKeyframes[1];
  let moveStartTime = 0;
  let moveEndTime = 0;

  for (let i = 0; i < cursorKeyframes.length; i++) {
    const kf = cursorKeyframes[i];
    const pathTime = kf.time || 0;  // Time to travel TO this keyframe
    const holdTime = kf.holdTime || 0;

    // Calculate when we arrive at this keyframe
    const arrivalTime = cumulativeTime + pathTime;
    const holdEndTime = arrivalTime + holdTime;

    // Check if we're still traveling to this keyframe
    if (clipTime < arrivalTime && i > 0) {
      // We're in movement phase from previous keyframe to this one
      prevKf = cursorKeyframes[i - 1];
      nextKf = kf;
      moveStartTime = cumulativeTime;
      moveEndTime = arrivalTime;
      break;
    }

    // Check if we're in this keyframe's hold period
    if (clipTime >= arrivalTime && clipTime < holdEndTime) {
      return { x: kf.x, y: kf.y, opacity: kf.opacity ?? defaultOpacity };
    }

    // Move cumulative time past this keyframe
    cumulativeTime = holdEndTime;

    // If this is the last keyframe and we're past it
    if (i === cursorKeyframes.length - 1) {
      return { x: kf.x, y: kf.y, opacity: kf.opacity ?? defaultOpacity };
    }
  }

  // Calculate progress between keyframes
  const moveDuration = moveEndTime - moveStartTime;

  if (moveDuration <= 0) {
    return { x: prevKf.x, y: prevKf.y, opacity: prevKf.opacity ?? defaultOpacity };
  }

  // Clamp progress to [0,1] to avoid floating point precision issues
  const rawProgress = Math.max(0, Math.min(1, (clipTime - moveStartTime) / moveDuration));

  // Apply easing to progress
  const easedProgress = applyEasing(rawProgress, prevKf.easing || 'linear');

  // Check for bezier control points
  const hasControlPoints = prevKf.controlOut || nextKf.controlIn;

  // Interpolate opacity between keyframes (use shape opacity as fallback)
  const prevOpacity = prevKf.opacity ?? defaultOpacity;
  const nextOpacity = nextKf.opacity ?? defaultOpacity;
  const interpolatedOpacity = prevOpacity + (nextOpacity - prevOpacity) * easedProgress;

  if (hasControlPoints) {
    // Use cubic bezier interpolation
    const c0x = prevKf.controlOut?.x ?? prevKf.x + (nextKf.x - prevKf.x) * 0.33;
    const c0y = prevKf.controlOut?.y ?? prevKf.y;
    const c1x = nextKf.controlIn?.x ?? prevKf.x + (nextKf.x - prevKf.x) * 0.66;
    const c1y = nextKf.controlIn?.y ?? nextKf.y;

    const pos = evaluateCubicBezier(
      prevKf.x, prevKf.y,
      c0x, c0y,
      c1x, c1y,
      nextKf.x, nextKf.y,
      easedProgress
    );
    return { ...pos, opacity: interpolatedOpacity };
  }

  // Linear interpolation
  return {
    x: prevKf.x + (nextKf.x - prevKf.x) * easedProgress,
    y: prevKf.y + (nextKf.y - prevKf.y) * easedProgress,
    opacity: interpolatedOpacity
  };
}

/**
 * Get active click effects at current time
 * @param {object} shape - Cursor shape
 * @param {number} currentTime - Current playback time
 * @returns {Array} Array of active effects with progress
 */
function getActiveClickEffects(shape, currentTime) {
  const { clicks = [], startTime = 0 } = shape;
  const clipTime = currentTime - startTime;
  const activeEffects = [];

  for (const click of clicks) {
    const effectStart = click.time;
    const effectDuration = click.duration || 0.4;
    const effectEnd = effectStart + effectDuration;

    if (clipTime >= effectStart && clipTime < effectEnd) {
      const progress = (clipTime - effectStart) / effectDuration;
      // Get position at click time
      const pos = interpolateCursorPosition(shape, startTime + click.time);
      activeEffects.push({
        ...click,
        progress,
        x: pos.x,
        y: pos.y
      });
    }
  }

  return activeEffects;
}

/**
 * Draw click effect (ripple, highlight, pulse)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} effect - Effect object with position, type, progress
 */
function drawClickEffect(ctx, effect) {
  const { effect: effectType, color = '#4a90d9', size = 40, progress, x, y } = effect;

  ctx.save();

  switch (effectType) {
    case 'ripple':
      // Expanding circle that fades out
      const rippleRadius = size * (0.3 + progress * 0.7);
      const rippleOpacity = 1 - progress;
      ctx.beginPath();
      ctx.arc(x, y, rippleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 3 * (1 - progress * 0.7));
      ctx.globalAlpha = rippleOpacity;
      ctx.stroke();

      // Inner fill
      ctx.beginPath();
      ctx.arc(x, y, rippleRadius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = rippleOpacity * 0.3;
      ctx.fill();
      break;

    case 'highlight':
      // Solid circle that shrinks and fades
      const highlightRadius = size * (1 - progress * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, highlightRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5 * (1 - progress);
      ctx.fill();

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8 * (1 - progress);
      ctx.stroke();
      break;

    case 'pulse':
      // Multiple expanding rings
      for (let i = 0; i < 3; i++) {
        const ringDelay = i * 0.15;
        const ringProgress = Math.max(0, Math.min(1, (progress - ringDelay) / (1 - ringDelay * 2)));

        if (ringProgress > 0 && ringProgress < 1) {
          const ringRadius = size * (0.2 + ringProgress * 0.8);
          ctx.beginPath();
          ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, 2 * (1 - ringProgress));
          ctx.globalAlpha = (1 - ringProgress) * 0.6;
          ctx.stroke();
        }
      }
      break;

    default:
      // No effect or 'none'
      break;
  }

  ctx.restore();
}

/**
 * Draw the cursor icon at position
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {object} shape - Cursor shape properties
 */
function drawCursorIcon(ctx, x, y, shape) {
  const {
    cursorType = 'pointer',
    cursorScale = 1.0
  } = shape;
  // Use standard fill/stroke properties with fallback to cursor-specific properties
  const cursorColor = shape.fillColor ?? shape.cursorColor ?? '#ffffff';
  const cursorOutline = shape.color ?? shape.cursorOutline ?? '#000000';

  const cursorDef = getCursorDef(cursorType);
  const scale = (cursorDef.baseScale || 1) * cursorScale;

  ctx.save();

  // Translate to cursor position, accounting for hotspot
  const hotspotX = (cursorDef.hotspotX || 0) * scale;
  const hotspotY = (cursorDef.hotspotY || 0) * scale;
  ctx.translate(x - hotspotX, y - hotspotY);
  ctx.scale(scale, scale);

  if (cursorDef.type === 'ibeam') {
    // Draw I-beam text cursor
    const w = cursorDef.width;
    const h = cursorDef.height;

    ctx.strokeStyle = cursorOutline;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Outer stroke
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.stroke();

    // Inner stroke
    ctx.strokeStyle = cursorColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

  } else if (cursorDef.type === 'crosshair') {
    // Draw crosshair cursor
    const s = cursorDef.size;
    const half = s / 2;

    // Outer stroke
    ctx.strokeStyle = cursorOutline;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, half);
    ctx.lineTo(s, half);
    ctx.moveTo(half, 0);
    ctx.lineTo(half, s);
    ctx.stroke();

    // Inner stroke
    ctx.strokeStyle = cursorColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(half, half, 2, 0, Math.PI * 2);
    ctx.fillStyle = cursorColor;
    ctx.fill();

  } else if (cursorDef.type === 'spinner') {
    // Draw animated loading spinner
    const s = cursorDef.size;
    const half = s / 2;
    const rotation = ((Date.now() / 80) % 360) * (Math.PI / 180);

    ctx.translate(half, half);
    ctx.rotate(rotation);

    // Draw arc
    ctx.strokeStyle = cursorColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, half - 2, 0, Math.PI * 1.5);
    ctx.stroke();

    // Draw shadow/outline arc
    ctx.strokeStyle = cursorOutline;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, half - 2, Math.PI * 1.5, Math.PI * 2);
    ctx.stroke();

  } else if (cursorDef.path) {
    // Draw path-based cursor
    const path = cursorDef.path;
    const hasTransparentFill = cursorColor === 'transparent';

    // Draw shadow/outline first
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    if (cursorDef.closed) ctx.closePath();

    ctx.strokeStyle = cursorOutline;
    ctx.lineWidth = hasTransparentFill ? 2 : 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!hasTransparentFill) {
      ctx.fillStyle = cursorOutline;
      ctx.fill();
    }

    // Draw main cursor on top with slight offset for depth
    ctx.save();
    ctx.translate(-0.5, -0.5);

    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    if (cursorDef.closed) ctx.closePath();

    if (!hasTransparentFill) {
      ctx.fillStyle = cursorColor;
      ctx.fill();
    }

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draw motion path visualization (editor only, not during export)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} shape - Cursor shape
 * @param {number} currentTime - Current playback time
 * @param {number} uiScale - Scale factor for UI elements (1 / zoom / displayScale)
 * @param {number} selectedKeyframeIndex - Index of currently selected keyframe (-1 if none)
 */
function drawMotionPath(ctx, shape, currentTime, uiScale = 1, selectedKeyframeIndex = -1) {
  const {
    cursorKeyframes,
    showPath = true,
    pathColor = '#6366f1',
    pathOpacity = 50,
    startTime = 0
  } = shape;

  if (!showPath || !cursorKeyframes || cursorKeyframes.length < 2) return;

  // Get config values with fallbacks
  const pathConfig = defaultConfig.cursorPath || {};
  const lineWidth = (pathConfig.lineWidth || 2) * uiScale;
  const lineDash = (pathConfig.lineDash || [6, 4]).map(v => v * uiScale);
  const kfSize = (pathConfig.keyframeSize || 5) * uiScale;
  const kfActiveSize = (pathConfig.keyframeActiveSize || 7) * uiScale;
  const kfActiveFill = pathConfig.keyframeActiveFill || '#ffffff';
  const kfStrokeWidth = (pathConfig.keyframeStrokeWidth || 2) * uiScale;
  const cpSize = (pathConfig.controlPointSize || 4) * uiScale;
  const cpInColor = pathConfig.controlInColor || '#ff6b6b';
  const cpOutColor = pathConfig.controlOutColor || '#4ade80';
  const cpLineWidth = (pathConfig.controlLineWidth || 1) * uiScale;
  const cpLineDash = (pathConfig.controlLineDash || [3, 3]).map(v => v * uiScale);
  const clickSize = (pathConfig.clickMarkerSize || 8) * uiScale;
  const clickInnerSize = (pathConfig.clickMarkerInnerSize || 3) * uiScale;
  const clickStrokeWidth = (pathConfig.clickMarkerStrokeWidth || 2) * uiScale;
  const labelFontSize = Math.round((pathConfig.labelFontSize || 10) * uiScale);
  const labelOffset = (pathConfig.labelOffset || 12) * uiScale;

  ctx.save();
  ctx.globalAlpha = pathOpacity / 100;

  // Draw path line
  ctx.strokeStyle = pathColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(lineDash);

  ctx.beginPath();
  ctx.moveTo(cursorKeyframes[0].x, cursorKeyframes[0].y);

  for (let i = 1; i < cursorKeyframes.length; i++) {
    const prev = cursorKeyframes[i - 1];
    const curr = cursorKeyframes[i];

    if (prev.controlOut || curr.controlIn) {
      // Draw bezier curve
      const c0x = prev.controlOut?.x ?? prev.x + (curr.x - prev.x) * 0.33;
      const c0y = prev.controlOut?.y ?? prev.y;
      const c1x = curr.controlIn?.x ?? prev.x + (curr.x - prev.x) * 0.66;
      const c1y = curr.controlIn?.y ?? curr.y;

      ctx.bezierCurveTo(c0x, c0y, c1x, c1y, curr.x, curr.y);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Get selected keyframe config
  const kfSelectedSize = (pathConfig.keyframeSelectedSize || 9) * uiScale;
  const kfSelectedFill = pathConfig.keyframeSelectedFill || '#6366f1';
  const kfSelectedStroke = pathConfig.keyframeSelectedStroke || '#ffffff';
  const kfSelectedStrokeWidth = (pathConfig.keyframeSelectedStrokeWidth || 3) * uiScale;
  const kfSelectedGlow = pathConfig.keyframeSelectedGlow !== false;
  const kfSelectedGlowColor = pathConfig.keyframeSelectedGlowColor || '#6366f1';
  const kfSelectedGlowBlur = (pathConfig.keyframeSelectedGlowBlur || 8) * uiScale;

  // Draw keyframe markers
  const clipTime = currentTime - startTime;

  // Pre-calculate cumulative arrival times for each keyframe
  const arrivalTimes = [];
  let cumulativeTime = 0;
  for (const kf of cursorKeyframes) {
    const pathTime = kf.time || 0;
    const holdTime = kf.holdTime || 0;
    cumulativeTime += pathTime;
    arrivalTimes.push(cumulativeTime);
    cumulativeTime += holdTime;
  }

  cursorKeyframes.forEach((kf, i) => {
    const arrivalTime = arrivalTimes[i];
    const holdEnd = arrivalTime + (kf.holdTime || 0);
    const nextArrival = i < cursorKeyframes.length - 1 ? arrivalTimes[i + 1] : Infinity;
    // Keyframe is active if clipTime is between arrival and next arrival (or end of animation)
    const isActive = clipTime >= arrivalTime && clipTime < nextArrival;
    const isSelected = i === selectedKeyframeIndex;

    // Determine size and colors based on state
    let size, fillColor, strokeColor, strokeWidth;
    if (isSelected) {
      size = kfSelectedSize;
      fillColor = kfSelectedFill;
      strokeColor = kfSelectedStroke;
      strokeWidth = kfSelectedStrokeWidth;
    } else if (isActive) {
      size = kfActiveSize;
      fillColor = kfActiveFill;
      strokeColor = pathColor;
      strokeWidth = kfStrokeWidth;
    } else {
      size = kfSize;
      fillColor = pathColor;
      strokeColor = pathColor;
      strokeWidth = kfStrokeWidth;
    }

    // Draw selection glow effect
    if (isSelected && kfSelectedGlow) {
      ctx.save();
      ctx.shadowColor = kfSelectedGlowColor;
      ctx.shadowBlur = kfSelectedGlowBlur;
      ctx.beginPath();
      ctx.arc(kf.x, kf.y, size, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();
    }

    // Keyframe circle
    ctx.beginPath();
    ctx.arc(kf.x, kf.y, size, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();

    // Time label (bold if selected, show arrival time and hold time if present)
    ctx.fillStyle = isSelected ? kfSelectedStroke : pathColor;
    ctx.font = `${isSelected ? 'bold ' : ''}${labelFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    const holdTime = kf.holdTime || 0;
    // Show arrival time (cumulative), not just path duration
    const timeLabel = holdTime > 0
      ? `${arrivalTime.toFixed(1)}s (+${holdTime.toFixed(1)}s)`
      : `${arrivalTime.toFixed(1)}s`;
    ctx.fillText(timeLabel, kf.x, kf.y - labelOffset);

    // Draw control points and handles
    if (kf.controlIn) {
      // Control in handle
      ctx.beginPath();
      ctx.arc(kf.controlIn.x, kf.controlIn.y, cpSize, 0, Math.PI * 2);
      ctx.fillStyle = cpInColor;
      ctx.fill();

      // Handle line
      ctx.strokeStyle = cpInColor;
      ctx.lineWidth = cpLineWidth;
      ctx.setLineDash(cpLineDash);
      ctx.beginPath();
      ctx.moveTo(kf.x, kf.y);
      ctx.lineTo(kf.controlIn.x, kf.controlIn.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (kf.controlOut) {
      // Control out handle
      ctx.beginPath();
      ctx.arc(kf.controlOut.x, kf.controlOut.y, cpSize, 0, Math.PI * 2);
      ctx.fillStyle = cpOutColor;
      ctx.fill();

      // Handle line
      ctx.strokeStyle = cpOutColor;
      ctx.lineWidth = cpLineWidth;
      ctx.setLineDash(cpLineDash);
      ctx.beginPath();
      ctx.moveTo(kf.x, kf.y);
      ctx.lineTo(kf.controlOut.x, kf.controlOut.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // Draw click markers
  const { clicks = [] } = shape;

  clicks.forEach(click => {
    const clickPos = interpolateCursorPosition(shape, startTime + click.time);

    ctx.beginPath();
    ctx.arc(clickPos.x, clickPos.y, clickSize, 0, Math.PI * 2);
    ctx.strokeStyle = click.color || '#4a90d9';
    ctx.lineWidth = clickStrokeWidth;
    ctx.stroke();

    // Click icon (small circle inside)
    ctx.beginPath();
    ctx.arc(clickPos.x, clickPos.y, clickInnerSize, 0, Math.PI * 2);
    ctx.fillStyle = click.color || '#4a90d9';
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Main draw function for cursor shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} shape - Cursor shape object
 * @param {object} options - Drawing options (isSelected, selectedKeyframeIndex, etc.)
 * @param {object} state - Editor state (currentTime, isExporting, zoom, displayScale, etc.)
 */
export function drawCursor(ctx, shape, options = {}, state = {}) {
  const currentTime = state.currentTime || 0;
  const isExporting = state.isExporting || false;
  const isSelected = options.isSelected || false;
  const selectedKeyframeIndex = options.selectedKeyframeIndex ?? -1;

  // Calculate UI scale for zoom-independent handle sizes
  const zoom = state.zoom || 1;
  const displayScale = state.displayScale || 1;
  const uiScale = 1 / zoom / displayScale;

  // Check if cursor is visible at current time
  const clipStart = shape.startTime || 0;
  const clipEnd = clipStart + (shape.duration || 5);

  if (currentTime < clipStart || currentTime >= clipEnd) {
    // Cursor not visible at this time, but show path if selected in editor
    if (!isExporting && isSelected) {
      drawMotionPath(ctx, shape, currentTime, uiScale, selectedKeyframeIndex);
    }
    return;
  }

  // Get interpolated position
  const pos = interpolateCursorPosition(shape, currentTime);

  // Draw motion path in editor when selected (not during export)
  if (!isExporting && isSelected) {
    drawMotionPath(ctx, shape, currentTime, uiScale, selectedKeyframeIndex);
  }

  // Draw active click effects
  const activeEffects = getActiveClickEffects(shape, currentTime);
  activeEffects.forEach(effect => {
    drawClickEffect(ctx, effect);
  });

  // Draw cursor icon with interpolated opacity
  // pos.opacity comes from keyframe interpolation, falls back to shape.opacity
  ctx.save();
  ctx.globalAlpha = (pos.opacity ?? shape.opacity ?? 100) / 100;
  drawCursorIcon(ctx, pos.x, pos.y, shape);
  ctx.restore();
}

export default {
  drawCursor,
  interpolateCursorPosition
};
