// editor/composables/useRenderer.js
// Canvas rendering composable - Full implementation replacing legacy getRendererScript()

import { ref, watch } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getShapeBounds, getResizeHandles, getRotationHandle, getTiltXHandle, getTiltYHandle, getMultiSelectionBounds } from '../utils/geometry.js';

// Import shape renderers
import { drawRect, drawDiamond, drawTriangle } from '../renderer/shapes/rect.js';
import { drawEllipse, drawCircle } from '../renderer/shapes/ellipse.js';
import { drawLine, drawArrow } from '../renderer/shapes/arrow.js';
import { drawText } from '../renderer/shapes/text.js';
import { drawImage, drawVideo } from '../renderer/shapes/media.js';
import { drawFreehand } from '../renderer/shapes/freehand.js';
import { drawPath } from '../renderer/shapes/path.js';
import { drawFrame } from '../renderer/shapes/frame.js';
import { drawGroup } from '../renderer/shapes/group.js';
import { drawCursor } from '../renderer/shapes/cursor.js';
import { drawScreenCapture, drawWebcamCapture } from '../renderer/shapes/capture.js';
import { drawPencilCursor } from '../renderer/shapes/pencil.js';

/**
 * Renderer composable for canvas drawing
 * Full implementation with Rough.js support
 */
export function useRenderer(canvasRef = null) {
  const { state, config } = getEditorState();

  // Canvas context refs
  const ctx = ref(null);
  const rc = ref(null); // Rough.js canvas
  const recordingRc = ref(null); // Rough.js canvas for recording context

  // Preview seed for consistent sketchy rendering during drag (prevents jittering)
  let previewSeed = 1;

  // Animation frame ID for cleanup
  let animationFrameId = null;

  /**
   * Initialize the renderer
   */
  function init() {
    const canvas = canvasRef?.value || document.getElementById('drawing-canvas');
    if (!canvas) {
      console.warn('Canvas not found for renderer initialization');
      return false;
    }

    ctx.value = canvas.getContext('2d');

    // Initialize Rough.js if available
    try {
      if (typeof window.rough !== 'undefined') {
        rc.value = window.rough.canvas(canvas);
      }
    } catch (e) {
      console.warn('Rough.js not available, using precise rendering');
    }

    return true;
  }

  /**
   * Main render function
   */
  function render() {
    if (!ctx.value) {
      if (!init()) return;
    }

    const canvas = ctx.value.canvas;
    const c = ctx.value;

    // Clear entire canvas first
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = state.backgroundColor;
    c.fillRect(0, 0, canvas.width, canvas.height);

    // Apply pan and zoom transform
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);

    // Check if we should hide the shape being vector edited
    const hideVectorEditShape = state.isVectorEditing &&
      (state.vectorEditIndex >= 0 ||
       (state.vectorEditGroupIndex >= 0 && state.vectorEditChildIndex >= 0) ||
       (state.vectorEditFrameIndex >= 0 && state.vectorEditFrameChildIndex >= 0)) &&
      config.vectorEdit?.showOriginalShape !== true;

    // Draw all shapes (skip shape being edited in text editor or vector edit mode)
    state.shapes.forEach((shape, i) => {
      // Skip effect/filter/transition clips - they're applied separately
      if (shape.type === 'effect' || shape.type === 'filter' || shape.type === 'transition') {
        return;
      }
      if (shape.visible !== false && i !== state.textEditingIndex) {
        // For vector edit mode: draw overlay in place of the shape to respect z-order
        if (hideVectorEditShape && i === state.vectorEditIndex) {
          if (state.vectorEditPath) {
            drawVectorEditOverlay();
          }
          return;
        }
        // For group child vector edit: draw the group but we'll overlay the edit handles on top
        drawShape(shape, state.selectedIndices.includes(i));
      }
    });

    // Draw vector edit overlay for group children (after the group is drawn)
    if (hideVectorEditShape && state.vectorEditGroupIndex >= 0 && state.vectorEditChildIndex >= 0) {
      if (state.vectorEditPath) {
        drawVectorEditOverlay();
      }
    }

    // Draw vector edit overlay for frame children (after the frame is drawn)
    if (hideVectorEditShape && state.vectorEditFrameIndex >= 0 && state.vectorEditFrameChildIndex >= 0) {
      if (state.vectorEditPath) {
        drawVectorEditOverlay();
      }
    }

    // Apply active filters and effects (video mode only)
    if (state.videoMode) {
      applyActiveFiltersAndEffects();
    }

    // Skip UI overlays during export (selection boxes, canvas bounds, etc.)
    if (state.isExporting) {
      return;
    }

    // Draw multi-selection bounding box with handles
    if (state.selectedIndices.length > 1) {
      drawMultiSelectionBox();
    }

    // Draw frame drop target highlight during dragging
    if (state.isDragging && state.dropTargetFrameIndex >= 0) {
      drawDropTargetHighlight();
    }

    // Draw arrow connection highlight
    if (state.connectionHighlightShapeId != null) {
      drawConnectionHighlight();
    }

    // Draw selection box (drag to select)
    if (state.isSelecting && state.selectionBoxStart) {
      drawSelectionRect();
    }

    // Draw crop mode overlay
    if (state.isCropping && (state.cropImageIndex >= 0 || state.cropFrameChild || state.cropGroupChild)) {
      drawCropOverlay();
    }

    // Draw selection box for selected frame children
    // Skip if the frame child is in vector edit mode or crop mode
    if (state.selectedFrameChildren && state.selectedFrameChildren.length > 0) {
      state.selectedFrameChildren.forEach(sel => {
        // Skip if this child is being vector edited
        if (state.isVectorEditing && state.vectorEditFrameIndex === sel.frameIndex &&
            state.vectorEditFrameChildIndex === sel.childIndex) {
          return;
        }
        // Skip if this child is being cropped
        if (state.isCropping && state.cropFrameChild &&
            state.cropFrameChild.frameIndex === sel.frameIndex &&
            state.cropFrameChild.childIndex === sel.childIndex) {
          return;
        }
        const frame = state.shapes[sel.frameIndex];
        if (frame && frame.children && frame.children[sel.childIndex]) {
          const child = frame.children[sel.childIndex];
          const parentRotation = frame.rotation || 0;
          drawSelectionBox(child, true, parentRotation);
        }
      });
    }

    // Draw selection box for selected group children (when in group mode)
    // Skip if the group child is in vector edit mode or crop mode
    if (state.selectedGroupChildren && state.selectedGroupChildren.length > 0) {
      state.selectedGroupChildren.forEach(sel => {
        // Skip if this child is being vector edited
        if (state.isVectorEditing && state.vectorEditGroupIndex === sel.groupIndex &&
            state.vectorEditChildIndex === sel.childIndex) {
          return;
        }
        // Skip if this child is being cropped
        if (state.isCropping && state.cropGroupChild &&
            state.cropGroupChild.groupIndex === sel.groupIndex &&
            state.cropGroupChild.childIndex === sel.childIndex) {
          return;
        }
        const group = state.shapes[sel.groupIndex];
        if (group && group.children && group.children[sel.childIndex]) {
          const child = group.children[sel.childIndex];
          const parentRotation = group.rotation || 0;
          drawSelectionBox(child, true, parentRotation);
        }
      });
    }

    // Draw snap guides
    if ((state.isDragging || state.isResizing) && isSnappingEnabled()) {
      drawSnapGuides();
    }

    // Draw canvas bounds indicator in video mode (shows safe area)
    if (state.videoMode) {
      drawCanvasBounds();
    }

    // Draw dimension labels during resize
    if (state.isResizing && config.snap?.showDimensions !== false) {
      drawDimensionLabel();
    }

    // Sync canvas selection to timeline (video mode only)
    if (state.videoMode && typeof window.syncSelectionToTimeline === 'function') {
      window.syncSelectionToTimeline();
    }

    // Render to recording canvas if dual-canvas recording is active
    // This provides clean output (no selection boxes) while user sees selection boxes
    // Render synchronously to ensure tool previews are captured in the same frame
    if (state.isRecording && state.hideSelectionInRecording && state.recordingCtx) {
      renderToRecordingCanvas();
    }
  }

  /**
   * Check if snapping is enabled
   */
  function isSnappingEnabled() {
    return state.snapEnabled !== false && config.snap?.enabled !== false;
  }

  /**
   * Calculate per-clip fade opacity based on fadeIn/fadeOut properties
   * Returns opacity multiplier (0-1)
   */
  function calculateClipFadeOpacity(shape) {
    if (!state.videoMode) return 1;

    const currentTime = state.currentTime || 0;
    const startTime = shape.startTime || 0;
    const duration = shape.duration || config.video?.defaultClipDuration || 5;
    const endTime = startTime + duration;

    // Check if shape has fade properties
    const fadeIn = shape.fadeIn || 0;
    const fadeOut = shape.fadeOut || 0;

    let opacity = 1;

    // Calculate fade-in (at start of clip)
    if (fadeIn > 0) {
      const timeIntoClip = currentTime - startTime;
      if (timeIntoClip < fadeIn) {
        opacity = Math.max(0, Math.min(1, timeIntoClip / fadeIn));
      }
    }

    // Calculate fade-out (at end of clip)
    if (fadeOut > 0) {
      const timeUntilEnd = endTime - currentTime;
      if (timeUntilEnd < fadeOut) {
        opacity = Math.min(opacity, Math.max(0, Math.min(1, timeUntilEnd / fadeOut)));
      }
    }

    return opacity;
  }

  /**
   * Calculate per-clip FX animation transforms
   * Returns { opacity, translateX, translateY, scale, rotation } or null if no animation
   */
  function calculateClipAnimation(shape, bounds) {
    if (!state.videoMode || !shape.fx || !Array.isArray(shape.fx)) return null;

    const currentTime = state.currentTime || 0;
    const startTime = shape.startTime || 0;
    const duration = shape.duration || config.video?.defaultClipDuration || 5;
    const endTime = startTime + duration;

    // Find animation FX
    const animationFx = shape.fx.find(fx => fx.type === 'animation');
    if (!animationFx) return null;

    const animDuration = animationFx.duration || 0.5;
    const position = animationFx.position || 'in'; // 'in', 'out', or 'both'
    const easing = animationFx.easing || 'ease-in-out';
    const name = animationFx.name;

    let progress = null;
    let isIn = true;

    // Calculate progress based on position
    // For "in": animation plays at clip start (0 -> 1 = hidden -> visible)
    // For "out": animation plays at clip end (1 -> 0 = visible -> hidden)
    // For "both": "in" and "out" play back-to-back within animDuration

    const timeIntoClip = currentTime - startTime;
    const timeUntilEnd = endTime - currentTime;

    // For "both", split the duration between in and out
    const effectiveDuration = position === 'both' ? animDuration / 2 : animDuration;

    if (position === 'in' || position === 'both') {
      // "in" plays from clip start
      if (timeIntoClip >= 0 && timeIntoClip <= effectiveDuration) {
        progress = timeIntoClip / effectiveDuration;
        isIn = true;
      }
    }

    if (position === 'out' || position === 'both') {
      // "out" plays at clip end
      if (timeUntilEnd >= 0 && timeUntilEnd <= effectiveDuration && progress === null) {
        progress = timeUntilEnd / effectiveDuration;
        isIn = false;
      }
    }

    if (progress === null) return null;

    // Apply easing
    progress = applyEasing(progress, easing);

    // Calculate transform values based on animation type
    const result = { opacity: 1, translateX: 0, translateY: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 };
    const width = bounds?.width || 100;
    const height = bounds?.height || 100;

    // For slide animations, direction should be opposite for 'out' vs 'in'
    // 'In' = element enters from off-screen, 'Out' = element exits to off-screen
    const directionMultiplier = isIn ? 1 : -1;

    switch (name) {
      case 'fade':
        result.opacity = progress;
        break;

      case 'slideLeft':
        // In: slides in from the left (starts at -width, ends at 0)
        // Out: slides out to the left (starts at 0, ends at -width)
        result.translateX = (1 - progress) * -width * directionMultiplier;
        break;

      case 'slideRight':
        // In: slides in from the right (starts at +width, ends at 0)
        // Out: slides out to the right (starts at 0, ends at +width)
        result.translateX = (1 - progress) * width * directionMultiplier;
        break;

      case 'slideUp':
        // In: slides in from the top (starts at -height, ends at 0)
        // Out: slides out to the top (starts at 0, ends at -height)
        result.translateY = (1 - progress) * -height * directionMultiplier;
        break;

      case 'slideDown':
        // In: slides in from the bottom (starts at +height, ends at 0)
        // Out: slides out to the bottom (starts at 0, ends at +height)
        result.translateY = (1 - progress) * height * directionMultiplier;
        break;

      case 'zoom':
      case 'zoomIn':
        // In: zooms from small to normal, Out: zooms from normal to small
        const zoomInScale = animationFx.scale || 0.5;
        if (isIn) {
          result.scale = zoomInScale + (1 - zoomInScale) * progress;
        } else {
          result.scale = 1 - (1 - zoomInScale) * (1 - progress);
        }
        break;

      case 'zoomOut':
        // In: zooms from large to normal, Out: zooms from normal to large
        const zoomOutScale = animationFx.scale || 1.5;
        if (isIn) {
          result.scale = zoomOutScale + (1 - zoomOutScale) * progress;
        } else {
          result.scale = 1 + (zoomOutScale - 1) * (1 - progress);
        }
        break;

      case 'wipe':
        // Wipe reveals/hides the shape from a direction
        const wipeDirection = animationFx.direction || 'left';
        // For 'in' animation: wipe reveals (clip grows)
        // For 'out' animation: wipe hides (clip shrinks)
        result.clip = {
          direction: wipeDirection,
          progress: progress // 0 = fully hidden, 1 = fully visible
        };
        break;

      case 'dissolve':
        result.opacity = progress;
        // Add slight scale for dissolve effect
        result.scale = 0.98 + 0.02 * progress;
        break;

      case 'spin':
        // In: spins into view, Out: spins out of view (opposite direction)
        const spinRotation = animationFx.rotation || 360;
        result.rotation = (1 - progress) * spinRotation * (Math.PI / 180) * directionMultiplier;
        break;

      case 'flip':
        // In: flips into view, Out: flips out of view (opposite direction)
        const flipRotation = animationFx.rotation || 180;
        result.rotation = (1 - progress) * flipRotation * (Math.PI / 180) * directionMultiplier;
        result.scale = Math.abs(Math.cos((1 - progress) * Math.PI));
        break;

      case 'bounce':
        // In: bounces into view from above, Out: bounces out downward
        const bounceProgress = applyBounceEasing(progress);
        result.scale = bounceProgress;
        result.translateY = (1 - bounceProgress) * -height * 0.3 * directionMultiplier;
        break;

      case 'elastic':
        // Elastic has an overshoot effect
        const elasticProgress = applyElasticEasing(progress);
        result.scale = elasticProgress;
        break;

      case 'crossZoom':
        // Cross zoom: zoom with cross-fade effect
        const crossZoomScale = animationFx.scale || 1.2;
        if (isIn) {
          result.scale = crossZoomScale + (1 - crossZoomScale) * progress;
        } else {
          result.scale = 1 + (crossZoomScale - 1) * (1 - progress);
        }
        result.opacity = progress;
        break;

      case 'blur':
        // Blur animation: fade with blur
        const blurAnimIntensity = animationFx.intensity || 20;
        result.opacity = progress;
        result.blur = (1 - progress) * blurAnimIntensity;
        break;

      case 'rotate3d': {
        // Get rotation parameters (degrees)
        const rotX = animationFx.rotateX || 0;
        const rotY = animationFx.rotateY || 90;
        const rotZ = animationFx.rotateZ || 0;
        const perspective = animationFx.perspective || 800;

        // Calculate interpolated angles based on progress
        // 'in': starts at full rotation, ends at 0
        // 'out': starts at 0, ends at full rotation
        let p = 1 - progress;

        const currentRotX = rotX * p * directionMultiplier;
        const currentRotY = rotY * p * directionMultiplier;
        const currentRotZ = rotZ * p * directionMultiplier;

        // Convert to radians for Z rotation
        result.rotation = currentRotZ * (Math.PI / 180);

        // Perspective modifier: lower perspective = more dramatic effect
        const perspectiveMod = 1 + (1 - perspective / 2000) * 0.3;

        // Y rotation (turn left/right) affects horizontal scale
        const yAngle = currentRotY * Math.PI / 180;
        const scaleX = Math.max(0.01, Math.abs(Math.cos(yAngle)) * perspectiveMod);

        // X rotation (tilt forward/back) affects vertical scale
        const xAngle = currentRotX * Math.PI / 180;
        const scaleY = Math.max(0.01, Math.abs(Math.cos(xAngle)) * perspectiveMod);

        // Store separate X/Y scales for proper 3D effect
        result.scaleX = scaleX;
        result.scaleY = scaleY;

        // Skew creates the perspective trapezoid effect
        result.skewX = Math.sin(xAngle) * 0.4;
        result.skewY = Math.sin(yAngle) * 0.4;

        // Backface hiding: hide when rotated past 90 degrees on X or Y
        if (Math.abs(currentRotY) > 90 || Math.abs(currentRotX) > 90) {
          result.opacity = 0;
        }
        break;
      }
    }

    return result;
  }

  /**
   * Apply easing function to progress value
   */
  function applyEasing(t, easing) {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default:
        return t;
    }
  }

  /**
   * Bounce easing function
   */
  function applyBounceEasing(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }

  /**
   * Elastic easing function
   */
  function applyElasticEasing(t) {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    const s = p / 4;
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
  }

  /**
   * Build CSS filter string from per-clip FX
   */
  function buildClipFilterString(shape) {
    if (!shape.fx || !Array.isArray(shape.fx)) return '';

    let filterString = '';

    shape.fx.forEach(fx => {
      if (fx.type !== 'filter') return;

      const value = fx.value !== undefined ? fx.value : 100;

      switch (fx.name) {
        case 'brightness':
          filterString += `brightness(${value / 100}) `;
          break;
        case 'contrast':
          filterString += `contrast(${value / 100}) `;
          break;
        case 'saturation':
          filterString += `saturate(${value / 100}) `;
          break;
        case 'hue':
        case 'hueRotate':
          filterString += `hue-rotate(${value}deg) `;
          break;
        case 'grayscale':
          filterString += `grayscale(${value / 100}) `;
          break;
        case 'sepia':
          filterString += `sepia(${value / 100}) `;
          break;
        case 'invert':
          filterString += `invert(${value / 100}) `;
          break;
        case 'blur':
          // Support both 'value' (from OptionsBar) and 'radius' (legacy)
          const blurRadius = fx.value !== undefined ? fx.value : (fx.radius !== undefined ? fx.radius : 5);
          filterString += `blur(${blurRadius}px) `;
          break;
        case 'temperature':
          const tempValue = value - 100;
          if (tempValue > 0) {
            filterString += `sepia(${tempValue / 200}) saturate(${1 + tempValue / 200}) `;
          } else if (tempValue < 0) {
            filterString += `hue-rotate(${tempValue / 2}deg) saturate(${1 + tempValue / 400}) `;
          }
          break;
      }
    });

    return filterString.trim();
  }

  /**
   * Draw a single shape
   */
  function drawShape(shape, isSelected = false) {
    if (!ctx.value) return;

    const c = ctx.value;
    c.save();

    // Calculate per-clip fade opacity (video mode only)
    const fadeOpacity = calculateClipFadeOpacity(shape);

    // Get shape bounds for effects
    const bounds = getShapeBounds(shape, config, c);

    // Calculate per-clip FX animation (video mode only)
    const animation = calculateClipAnimation(shape, bounds);

    // Apply animation transforms if active
    if (animation && bounds) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // Apply translation
      if (animation.translateX !== 0 || animation.translateY !== 0) {
        c.translate(animation.translateX, animation.translateY);
      }

      // Apply scale, rotation, and skew around center
      const hasScale = animation.scale !== 1 || animation.scaleX !== 1 || animation.scaleY !== 1;
      const hasSkew = animation.skewX || animation.skewY;
      if (hasScale || animation.rotation !== 0 || hasSkew) {
        c.translate(centerX, centerY);

        // Apply skew for 3D effect
        if (hasSkew) {
          c.transform(1, animation.skewY || 0, animation.skewX || 0, 1, 0, 0);
        }

        // Apply scale (use separate X/Y if available, otherwise uniform)
        if (animation.scaleX !== 1 || animation.scaleY !== 1) {
          c.scale(animation.scaleX, animation.scaleY);
        } else if (animation.scale !== 1) {
          c.scale(animation.scale, animation.scale);
        }

        if (animation.rotation !== 0) {
          c.rotate(animation.rotation);
        }
        c.translate(-centerX, -centerY);
      }

      // Apply clip path for wipe animation
      if (animation.clip) {
        const clip = animation.clip;
        const p = clip.progress;
        c.beginPath();
        switch (clip.direction) {
          case 'left':
            // Reveals from left edge
            c.rect(bounds.x, bounds.y, bounds.width * p, bounds.height);
            break;
          case 'right':
            // Reveals from right edge
            c.rect(bounds.x + bounds.width * (1 - p), bounds.y, bounds.width * p, bounds.height);
            break;
          case 'up':
            // Reveals from top edge
            c.rect(bounds.x, bounds.y, bounds.width, bounds.height * p);
            break;
          case 'down':
            // Reveals from bottom edge
            c.rect(bounds.x, bounds.y + bounds.height * (1 - p), bounds.width, bounds.height * p);
            break;
        }
        c.clip();
      }
    }

    // Apply rotation if shape has rotation
    if (shape.rotation) {
      if (bounds) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        c.translate(centerX, centerY);
        c.rotate(shape.rotation);
        c.translate(-centerX, -centerY);
      }
    }

    // Apply flip (scaleX/scaleY) if shape is flipped
    if (shape.scaleX === -1 || shape.scaleY === -1) {
      if (bounds) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        c.translate(centerX, centerY);
        c.scale(shape.scaleX || 1, shape.scaleY || 1);
        c.translate(-centerX, -centerY);
      }
    }

    // Apply 3D tilt transforms (permanent shape properties)
    if ((shape.tiltX || shape.tiltY) && bounds) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      c.translate(centerX, centerY);

      // TiltX (pitch - forward/backward tilt) affects vertical scale and horizontal skew
      // TiltY (yaw - left/right tilt) affects horizontal scale and vertical skew
      const tiltX = shape.tiltX || 0;
      const tiltY = shape.tiltY || 0;

      // Calculate perspective-like scale based on tilt angles
      // When tilted, the dimension perpendicular to the tilt axis compresses
      const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
      const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));

      // Apply skew for 3D perspective effect
      // TiltX creates horizontal skew (top/bottom edges shift)
      // TiltY creates vertical skew (left/right edges shift)
      const skewX = Math.sin(tiltX) * 0.5;
      const skewY = Math.sin(tiltY) * 0.5;

      // Apply transforms: skew first, then scale
      if (skewX !== 0 || skewY !== 0) {
        c.transform(1, skewY, skewX, 1, 0, 0);
      }
      c.scale(scaleFromTiltY, scaleFromTiltX);

      c.translate(-centerX, -centerY);
    }

    // Build and apply per-clip CSS filters
    const clipFilterString = buildClipFilterString(shape);
    if (clipFilterString) {
      c.filter = clipFilterString;
    }

    // Calculate rendering options
    const strokeColor = shape.color || '#1e1e1e';
    let fillColor = shape.fillColor;
    if (fillColor === undefined && shape.fill === true) {
      fillColor = shape.color || '#1e1e1e';
    }

    const lineWidth = shape.lineWidth || 2;
    const roughness = shape.roughness ?? config.tools?.defaultRoughness ?? 1;
    const seed = shape.seed || 1;
    const isSketchy = rc.value && config.tools?.renderMode === 'sketchy' && roughness > 0;
    const hasStroke = strokeColor && strokeColor !== 'transparent';

    // Handle stroke style (solid, dashed, dotted)
    const strokeStyle = shape.strokeStyle || 'solid';
    let strokeLineDash = undefined;
    if (strokeStyle === 'dashed') {
      strokeLineDash = [12, 6];
    } else if (strokeStyle === 'dotted') {
      strokeLineDash = [3, 6];
    }

    // Handle opacity - combine shape opacity with fade opacity and animation opacity
    let baseOpacity = shape.opacity !== undefined ? shape.opacity / 100 : 1;
    let animationOpacity = animation ? animation.opacity : 1;
    c.globalAlpha = baseOpacity * fadeOpacity * animationOpacity;

    // Handle blur animation effect
    if (animation && animation.blur && animation.blur > 0) {
      c.filter = `blur(${animation.blur}px)`;
    }

    // Rough.js options
    const roughOptions = {
      seed: seed,
      roughness: roughness,
      stroke: hasStroke ? strokeColor : 'transparent',
      strokeWidth: hasStroke ? lineWidth : 0,
      fill: (fillColor && fillColor !== 'transparent') ? fillColor : undefined,
      fillStyle: 'solid',
      strokeLineDash: strokeLineDash,
    };

    // Handle edge style for precise mode
    const edgeStyle = shape.edgeStyle || 'sharp';

    // Rendering options to pass to shape renderers
    const options = {
      isSketchy,
      roughOptions,
      strokeLineDash,
      edgeStyle,
      hasStroke,
      fillColor,
      strokeColor,
      lineWidth
    };

    // Draw based on type
    switch (shape.type) {
      case 'circle':
        drawCircle(c, rc.value, shape, options);
        break;
      case 'ellipse':
        drawEllipse(c, rc.value, shape, options);
        break;
      case 'rect':
        drawRect(c, rc.value, shape, options);
        break;
      case 'diamond':
        drawDiamond(c, rc.value, shape, options);
        break;
      case 'triangle':
        drawTriangle(c, rc.value, shape, options);
        break;
      case 'line':
        drawLine(c, rc.value, shape, options);
        break;
      case 'arrow':
        drawArrow(c, rc.value, shape, options);
        break;
      case 'text':
        drawText(c, shape, config);
        break;
      case 'image':
        drawImage(c, shape, options);
        break;
      case 'video':
        drawVideo(c, shape, options);
        break;
      case 'freehand':
        drawFreehand(c, shape, options);
        break;
      case 'path':
        drawPath(c, rc.value, shape, options);
        break;
      case 'frame':
        // Frame needs special handling for recursive child drawing
        drawFrame(c, shape, options, (child) => drawShape(child, false), state, config);
        break;
      case 'group': {
        // When vector editing or cropping a group child, skip drawing that child (it's replaced by the overlay)
        let skipChildIndex = -1;
        if (state.isVectorEditing && state.vectorEditGroupIndex >= 0 &&
            state.shapes[state.vectorEditGroupIndex] === shape) {
          skipChildIndex = state.vectorEditChildIndex;
        } else if (state.isCropping && state.cropGroupChild &&
                   state.shapes[state.cropGroupChild.groupIndex] === shape) {
          skipChildIndex = state.cropGroupChild.childIndex;
        }
        drawGroup(c, shape, options, (child, childIndex) => {
          if (childIndex === skipChildIndex) return; // Skip child being edited
          drawShape(child, false);
        });
        break;
      }
      case 'cursor':
        // Pass selectedKeyframeIndex only if this cursor is the selected shape
        const selectedKfIndex = isSelected ? (state.selectedCursorKeyframeIndex ?? -1) : -1;
        drawCursor(c, shape, { isSelected, selectedKeyframeIndex: selectedKfIndex }, { currentTime: state.currentTime || 0, isExporting: state.isExporting || false, zoom: state.zoom || 1, displayScale: state.canvasDisplayScale || 1 });
        break;
      case 'screenCapture':
        drawScreenCapture(c, shape, options, state);
        break;
      case 'webcamCapture':
        drawWebcamCapture(c, shape, options, state);
        break;
    }

    // Reset filter
    if (clipFilterString) {
      c.filter = 'none';
    }

    c.restore();

    // Reset any state modified by Rough.js before drawing selection
    c.globalAlpha = 1;
    c.setLineDash([]);

    // Draw selection box for selected shapes (skip during export)
    if (isSelected && !state.isExporting) {
      const singleSelection = state.selectedIndices.length === 1;
      drawSelectionBox(shape, singleSelection);
    }
  }

  /**
   * Draw selection box around a shape
   */
  function drawSelectionBox(shape, showHandles = true, parentRotation = 0) {
    if (!ctx.value) return;

    const bounds = getShapeBounds(shape, config, ctx.value);
    if (!bounds) return;

    const c = ctx.value;
    const selConfig = config.selection || {};
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // Calculate display scale factor for consistent UI
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / state.zoom / displayScale;

    const padding = 6 * uiScale;
    const selColor = selConfig.color || '#6366f1';
    const selLineWidth = (selConfig.lineWidth || 1) * uiScale;
    const selLineDash = (selConfig.lineDash || [5, 5]).map(v => v * uiScale);
    const handleSize = (selConfig.handleSize || 8) * uiScale;
    const handleFill = selConfig.handleFill || '#ffffff';
    const handleStroke = selConfig.handleStroke || selColor;
    const handleStyle = selConfig.handleStyle || 'square';

    c.save();
    c.globalAlpha = 1;
    c.setLineDash([]);

    // Apply clip animation transforms (video mode only)
    const animation = calculateClipAnimation(shape, bounds);
    if (animation) {
      // Apply translation
      if (animation.translateX !== 0 || animation.translateY !== 0) {
        c.translate(animation.translateX, animation.translateY);
      }

      // Apply scale, rotation, and skew around center (matches shape rendering)
      const hasScale = animation.scale !== 1 || animation.scaleX !== 1 || animation.scaleY !== 1;
      const hasSkew = animation.skewX || animation.skewY;
      if (hasScale || animation.rotation !== 0 || hasSkew) {
        c.translate(centerX, centerY);

        // Apply skew for 3D effect
        if (hasSkew) {
          c.transform(1, animation.skewY || 0, animation.skewX || 0, 1, 0, 0);
        }

        // Apply scale (use separate X/Y if available, otherwise uniform)
        if (animation.scaleX !== 1 || animation.scaleY !== 1) {
          c.scale(animation.scaleX, animation.scaleY);
        } else if (animation.scale !== 1) {
          c.scale(animation.scale, animation.scale);
        }

        if (animation.rotation !== 0) {
          c.rotate(animation.rotation);
        }
        c.translate(-centerX, -centerY);
      }

      // Apply opacity to selection box
      if (animation.opacity !== 1) {
        c.globalAlpha = animation.opacity;
      }
    }

    // Calculate total rotation
    const totalRotation = (shape.rotation || 0) + (parentRotation || 0);

    // Apply rotation to selection box
    if (totalRotation) {
      if (parentRotation) {
        // Get frame bounds for rotation center
        const frameIndex = state.selectedFrameChildren?.[0]?.frameIndex;
        if (frameIndex !== undefined) {
          const frame = state.shapes[frameIndex];
          if (frame) {
            const frameCenterX = frame.x + frame.width / 2;
            const frameCenterY = frame.y + frame.height / 2;
            c.translate(frameCenterX, frameCenterY);
            c.rotate(parentRotation);
            c.translate(-frameCenterX, -frameCenterY);
          }
        }
        if (shape.rotation) {
          c.translate(centerX, centerY);
          c.rotate(shape.rotation);
          c.translate(-centerX, -centerY);
        }
      } else {
        c.translate(centerX, centerY);
        c.rotate(shape.rotation);
        c.translate(-centerX, -centerY);
      }
    }

    // Apply tilt transforms to selection box (matches shape rendering)
    if (shape.tiltX || shape.tiltY) {
      const tiltX = shape.tiltX || 0;
      const tiltY = shape.tiltY || 0;

      c.translate(centerX, centerY);

      // Same transform as shape rendering
      const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
      const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
      const skewX = Math.sin(tiltX) * 0.5;
      const skewY = Math.sin(tiltY) * 0.5;

      if (skewX !== 0 || skewY !== 0) {
        c.transform(1, skewY, skewX, 1, 0, 0);
      }
      c.scale(scaleFromTiltY, scaleFromTiltX);

      c.translate(-centerX, -centerY);
    }

    // For lines/arrows, only draw endpoint handles (no selection box or corner handles)
    const isLineOrArrow = shape.type === 'line' || shape.type === 'arrow';

    if (!isLineOrArrow) {
      // Draw selection box for non-line shapes
      c.strokeStyle = selColor;
      c.lineWidth = selLineWidth;
      if (selLineDash.length > 0) {
        c.setLineDash(selLineDash);
      }
      c.strokeRect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2);
    }

    // Only draw handles for single selection
    if (showHandles) {
      // Draw corner/edge handles and rotation handle for non-line shapes
      if (!isLineOrArrow) {
        c.setLineDash([]);
        c.fillStyle = handleFill;
        c.strokeStyle = handleStroke;
        c.lineWidth = selLineWidth;
        const handles = getResizeHandles(bounds, padding);
        const showMiddleHandles = selConfig.showMiddleHandles !== false;
        const middleHandleNames = ['n', 's', 'e', 'w'];

        Object.entries(handles).forEach(([name, h]) => {
          if (!showMiddleHandles && middleHandleNames.includes(name)) {
            return;
          }

          if (handleStyle === 'circle') {
            c.beginPath();
            c.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
            c.fill();
            c.stroke();
          } else {
            c.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            c.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          }
        });

        // Draw rotation handle (but not for frames)
        if (shape.type !== 'frame') {
          const rotHandle = getRotationHandle(bounds, padding, selConfig.rotationHandleOffset || 25);
          const showRotationLine = selConfig.showRotationLine !== false;

          if (showRotationLine) {
            c.beginPath();
            c.setLineDash([]);
            c.strokeStyle = selColor;
            c.lineWidth = selLineWidth;
            c.moveTo(centerX, bounds.y - padding);
            c.lineTo(rotHandle.x, rotHandle.y);
            c.stroke();
          }

          c.beginPath();
          c.arc(rotHandle.x, rotHandle.y, 5 * uiScale, 0, Math.PI * 2);
          c.fillStyle = handleFill;
          c.fill();
          c.strokeStyle = handleStroke;
          c.lineWidth = selLineWidth;
          c.stroke();

          // Draw tilt handles (TiltX on left, TiltY on bottom)
          const tiltHandleOffset = selConfig.rotationHandleOffset || 25;
          const tiltXHandle = getTiltXHandle(bounds, padding, tiltHandleOffset);
          const tiltYHandle = getTiltYHandle(bounds, padding, tiltHandleOffset);

          // Get tilt handle styles from config
          const tiltHandleSize = (selConfig.tiltHandleSize || 5) * uiScale;
          const tiltXStroke = selConfig.tiltXHandleStroke || '#ef4444';
          const tiltXFill = selConfig.tiltXHandleFill || '#fecaca';
          const tiltYStroke = selConfig.tiltYHandleStroke || '#3b82f6';
          const tiltYFill = selConfig.tiltYHandleFill || '#bfdbfe';

          // TiltX handle (left side - for X-axis tilt)
          // Draw connecting line
          c.beginPath();
          c.setLineDash([]);
          c.strokeStyle = tiltXStroke;
          c.lineWidth = selLineWidth;
          c.moveTo(bounds.x - padding, centerY);
          c.lineTo(tiltXHandle.x, tiltXHandle.y);
          c.stroke();

          // Draw TiltX handle circle
          c.beginPath();
          c.arc(tiltXHandle.x, tiltXHandle.y, tiltHandleSize, 0, Math.PI * 2);
          c.fillStyle = tiltXFill;
          c.fill();
          c.strokeStyle = tiltXStroke;
          c.lineWidth = selLineWidth;
          c.stroke();

          // TiltY handle (bottom side - for Y-axis tilt)
          // Draw connecting line
          c.beginPath();
          c.setLineDash([]);
          c.strokeStyle = tiltYStroke;
          c.lineWidth = selLineWidth;
          c.moveTo(centerX, bounds.y + bounds.height + padding);
          c.lineTo(tiltYHandle.x, tiltYHandle.y);
          c.stroke();

          // Draw TiltY handle circle
          c.beginPath();
          c.arc(tiltYHandle.x, tiltYHandle.y, tiltHandleSize, 0, Math.PI * 2);
          c.fillStyle = tiltYFill;
          c.fill();
          c.strokeStyle = tiltYStroke;
          c.lineWidth = selLineWidth;
          c.stroke();
        }
      }

      // Draw endpoint handles and control point for lines/arrows
      if (isLineOrArrow) {
        // Always draw control point handle (at midpoint if not set)
        drawControlPointHandle(shape, uiScale, selLineWidth);
        // Draw endpoint handles for connection dragging
        drawArrowEndpointHandles(shape, uiScale, selLineWidth, handleFill, handleStroke, handleSize);
      }
    }

    c.restore();
  }

  /**
   * Draw endpoint handles for arrows/lines
   * Uses selection config for styling
   */
  function drawArrowEndpointHandles(shape, uiScale, selLineWidth, handleFill, handleStroke, handleSize) {
    const c = ctx.value;
    const selConfig = config.selection || {};
    // handleSize is already scaled by uiScale when passed, so use it directly
    // Only apply uiScale if falling back to raw config value
    const endpointHandleSize = handleSize || (selConfig.handleSize || 10) * uiScale;
    const connectedFill = config.theme?.colors?.connected || '#10b981';
    const connectedStroke = config.theme?.colors?.connectedStroke || '#059669';

    // Draw start endpoint handle
    c.beginPath();
    c.arc(shape.x1, shape.y1, endpointHandleSize / 2, 0, Math.PI * 2);
    c.fillStyle = shape.startConnection ? connectedFill : handleFill;
    c.fill();
    c.strokeStyle = shape.startConnection ? connectedStroke : handleStroke;
    c.lineWidth = selLineWidth;
    c.stroke();

    // Draw end endpoint handle
    c.beginPath();
    c.arc(shape.x2, shape.y2, endpointHandleSize / 2, 0, Math.PI * 2);
    c.fillStyle = shape.endConnection ? connectedFill : handleFill;
    c.fill();
    c.strokeStyle = shape.endConnection ? connectedStroke : handleStroke;
    c.lineWidth = selLineWidth;
    c.stroke();
  }

  /**
   * Draw control point handle for curved lines/arrows
   */
  function drawControlPointHandle(shape, uiScale, selLineWidth) {
    const c = ctx.value;
    const cpConfig = config.controlPoint || {};
    const cpHandleSize = (cpConfig.handleSize || 8) * uiScale;
    const cpHandleFill = cpConfig.handleFill || '#ffffff';
    const cpHandleStroke = cpConfig.handleStroke || '#6366f1';
    const cpLineColor = cpConfig.lineColor || '#6366f1';
    const cpLineWidth = (cpConfig.lineWidth || 1) * uiScale;
    const cpLineDash = (cpConfig.lineDash || [4, 4]).map(v => v * uiScale);

    // Use existing control point or calculate midpoint
    const cp = shape.controlPoint || {
      x: (shape.x1 + shape.x2) / 2,
      y: (shape.y1 + shape.y2) / 2
    };

    // Draw dashed lines connecting control point to endpoints
    c.strokeStyle = cpLineColor;
    c.lineWidth = cpLineWidth;
    c.setLineDash(cpLineDash);

    c.beginPath();
    c.moveTo(shape.x1, shape.y1);
    c.lineTo(cp.x, cp.y);
    c.stroke();

    c.beginPath();
    c.moveTo(cp.x, cp.y);
    c.lineTo(shape.x2, shape.y2);
    c.stroke();

    // Draw control point handle
    c.setLineDash([]);
    c.fillStyle = cpHandleFill;
    c.strokeStyle = cpHandleStroke;
    c.lineWidth = selLineWidth;
    c.beginPath();
    c.arc(cp.x, cp.y, cpHandleSize / 2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  /**
   * Check if a shape type is an FX clip (no canvas representation)
   */
  function isFxClipType(type) {
    return type === 'effect' || type === 'filter' || type === 'transition';
  }

  /**
   * Draw multi-selection bounding box
   */
  function drawMultiSelectionBox() {
    if (!ctx.value || state.selectedIndices.length < 2) return;

    // Filter out FX clips - they have no canvas representation
    const canvasIndices = state.selectedIndices.filter(i => {
      const shape = state.shapes[i];
      return shape && !isFxClipType(shape.type);
    });

    if (canvasIndices.length < 2) return;

    const bounds = getMultiSelectionBounds(state.shapes, canvasIndices, config, ctx.value);
    if (!bounds) return;

    const c = ctx.value;
    const selConfig = config.selection || {};
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / state.zoom / displayScale;

    const padding = 6 * uiScale;
    const selColor = selConfig.color || '#6366f1';
    const selLineWidth = (selConfig.lineWidth || 1) * uiScale;
    const selLineDash = (selConfig.lineDash || [5, 5]).map(v => v * uiScale);
    const handleSize = (selConfig.handleSize || 8) * uiScale;
    const handleFill = selConfig.handleFill || '#ffffff';
    const handleStroke = selConfig.handleStroke || selColor;
    const handleStyle = selConfig.handleStyle || 'square';

    c.save();
    c.globalAlpha = 1;
    c.setLineDash([]);

    // Draw bounding box
    c.strokeStyle = selColor;
    c.lineWidth = selLineWidth;
    if (selLineDash.length > 0) {
      c.setLineDash(selLineDash);
    }
    c.strokeRect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2);

    // Draw resize handles
    c.setLineDash([]);
    c.fillStyle = handleFill;
    c.strokeStyle = handleStroke;
    c.lineWidth = selLineWidth;
    const handles = getResizeHandles(bounds, padding);
    const showMiddleHandles = selConfig.showMiddleHandles !== false;
    const middleHandleNames = ['n', 's', 'e', 'w'];

    Object.entries(handles).forEach(([name, h]) => {
      if (!showMiddleHandles && middleHandleNames.includes(name)) {
        return;
      }

      if (handleStyle === 'circle') {
        c.beginPath();
        c.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else {
        c.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        c.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      }
    });

    // Draw rotation handle
    const rotHandle = getRotationHandle(bounds, padding, selConfig.rotationHandleOffset || 25);
    const showRotationLine = selConfig.showRotationLine !== false;

    if (showRotationLine) {
      c.beginPath();
      c.strokeStyle = selColor;
      c.lineWidth = selLineWidth;
      c.moveTo(centerX, bounds.y - padding);
      c.lineTo(rotHandle.x, rotHandle.y);
      c.stroke();
    }

    c.beginPath();
    c.arc(rotHandle.x, rotHandle.y, 5 * uiScale, 0, Math.PI * 2);
    c.fillStyle = handleFill;
    c.fill();
    c.strokeStyle = handleStroke;
    c.lineWidth = selLineWidth;
    c.stroke();

    c.restore();
  }

  /**
   * Draw selection rectangle during drag-select
   */
  function drawSelectionRect() {
    if (!ctx.value || !state.selectionBoxStart) return;

    const c = ctx.value;
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;

    c.save();
    c.strokeStyle = config.theme?.colors?.accent || '#6366f1';
    c.fillStyle = config.theme?.colors?.accentLight || 'rgba(99, 102, 241, 0.1)';
    c.lineWidth = 1 * uiScale;
    c.setLineDash([5 * uiScale, 3 * uiScale]);

    const x = Math.min(state.selectionBoxStart.x, state.lastX);
    const y = Math.min(state.selectionBoxStart.y, state.lastY);
    const w = Math.abs(state.lastX - state.selectionBoxStart.x);
    const h = Math.abs(state.lastY - state.selectionBoxStart.y);

    c.fillRect(x, y, w, h);
    c.strokeRect(x, y, w, h);
    c.restore();
  }

  /**
   * Draw drop target highlight for frames
   */
  function drawDropTargetHighlight() {
    if (!ctx.value) return;

    const frame = state.shapes[state.dropTargetFrameIndex];
    if (!frame || frame.type !== 'frame') return;

    const c = ctx.value;
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;

    c.save();
    c.strokeStyle = config.theme?.colors?.accent || '#6366f1';
    c.fillStyle = config.theme?.colors?.accentLight || 'rgba(99, 102, 241, 0.1)';
    c.lineWidth = 3 * uiScale;
    c.setLineDash([]);
    c.fillRect(frame.x, frame.y, frame.width, frame.height);
    c.strokeRect(frame.x, frame.y, frame.width, frame.height);
    c.restore();
  }

  /**
   * Draw connection highlight for arrow endpoint snap target
   */
  function drawConnectionHighlight() {
    if (!ctx.value) return;

    // Find the shape to highlight (could be top-level or group child)
    const shapeId = state.connectionHighlightShapeId;
    let targetShape = null;

    // First check top-level shapes
    for (let i = 0; i < state.shapes.length; i++) {
      const shape = state.shapes[i];
      if (shape && (shape.id === shapeId || i === shapeId)) {
        targetShape = shape;
        break;
      }
    }

    // If not found at top level, search inside groups
    if (!targetShape) {
      for (const shape of state.shapes) {
        if (shape?.type === 'group' && shape.children) {
          const child = shape.children.find(c => c && c.id === shapeId);
          if (child) {
            targetShape = child;
            break;
          }
        }
      }
    }

    if (!targetShape) return;

    const c = ctx.value;
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;
    const bounds = getShapeBounds(targetShape, config, c);

    if (!bounds) return;

    c.save();

    // Use config colors for connection highlight (defaults to emerald/green)
    const colors = config.theme?.colors || {};
    c.strokeStyle = colors.connectionHighlight || '#10b981';
    c.fillStyle = colors.connectionHighlightFill || 'rgba(16, 185, 129, 0.15)';
    c.lineWidth = 3 * uiScale;
    c.setLineDash([]);

    // Draw highlight based on shape type
    if (targetShape.type === 'circle') {
      c.beginPath();
      c.arc(targetShape.x, targetShape.y, targetShape.radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (targetShape.type === 'ellipse') {
      c.beginPath();
      c.ellipse(targetShape.x, targetShape.y, targetShape.radiusX, targetShape.radiusY, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (targetShape.type === 'diamond') {
      // Draw diamond outline
      const cx = targetShape.x;
      const cy = targetShape.y;
      const hw = (targetShape.width || 60) / 2;
      const hh = (targetShape.height || 60) / 2;
      c.beginPath();
      c.moveTo(cx, cy - hh);
      c.lineTo(cx + hw, cy);
      c.lineTo(cx, cy + hh);
      c.lineTo(cx - hw, cy);
      c.closePath();
      c.fill();
      c.stroke();
    } else if (targetShape.type === 'triangle') {
      // Draw triangle outline
      let vertices;
      if (targetShape.x1 !== undefined) {
        vertices = [
          { x: targetShape.x1, y: targetShape.y1 },
          { x: targetShape.x2, y: targetShape.y2 },
          { x: targetShape.x3, y: targetShape.y3 }
        ];
      } else {
        const ts = targetShape.size || 60;
        const th = ts * Math.sqrt(3) / 2;
        vertices = [
          { x: targetShape.x, y: targetShape.y - th * 2 / 3 },
          { x: targetShape.x - ts / 2, y: targetShape.y + th / 3 },
          { x: targetShape.x + ts / 2, y: targetShape.y + th / 3 }
        ];
      }
      c.beginPath();
      c.moveTo(vertices[0].x, vertices[0].y);
      c.lineTo(vertices[1].x, vertices[1].y);
      c.lineTo(vertices[2].x, vertices[2].y);
      c.closePath();
      c.fill();
      c.stroke();
    } else if (targetShape.type === 'path' && targetShape.segments && targetShape.segments.length >= 2) {
      // Draw path outline using bezier curves
      // Path segments use point: [x, y], handleIn: [x, y], handleOut: [x, y]
      c.beginPath();
      const segments = targetShape.segments;
      c.moveTo(segments[0].point[0], segments[0].point[1]);

      for (let i = 0; i < segments.length - 1; i++) {
        const s1 = segments[i];
        const s2 = segments[i + 1];

        // Calculate control points (handleOut from s1, handleIn from s2)
        const cp1x = s1.handleOut ? s1.point[0] + s1.handleOut[0] : s1.point[0];
        const cp1y = s1.handleOut ? s1.point[1] + s1.handleOut[1] : s1.point[1];
        const cp2x = s2.handleIn ? s2.point[0] + s2.handleIn[0] : s2.point[0];
        const cp2y = s2.handleIn ? s2.point[1] + s2.handleIn[1] : s2.point[1];

        c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, s2.point[0], s2.point[1]);
      }

      // Close path if needed
      if (targetShape.closed) {
        const s1 = segments[segments.length - 1];
        const s2 = segments[0];
        const cp1x = s1.handleOut ? s1.point[0] + s1.handleOut[0] : s1.point[0];
        const cp1y = s1.handleOut ? s1.point[1] + s1.handleOut[1] : s1.point[1];
        const cp2x = s2.handleIn ? s2.point[0] + s2.handleIn[0] : s2.point[0];
        const cp2y = s2.handleIn ? s2.point[1] + s2.handleIn[1] : s2.point[1];
        c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, s2.point[0], s2.point[1]);
        c.closePath();
      }

      c.fill();
      c.stroke();
    } else {
      // For rects, images, videos, text, frames - use bounding box
      c.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      c.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    c.restore();
  }

  /**
   * Draw canvas bounds indicator for video mode
   * Shows a subtle border around the export frame area
   */
  function drawCanvasBounds() {
    if (!ctx.value) return;

    const canvas = ctx.value.canvas;
    const c = ctx.value;
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;

    // Canvas dimensions - the export frame is the internal canvas resolution
    // These are in canvas coordinates (the zoom transform is already applied by render())
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    c.save();

    // Calculate visible viewport bounds in canvas coordinates
    // This ensures the overlay covers the entire visible area, not just a fixed padding
    const zoom = state.zoom || 1;
    const panX = state.panX || 0;
    const panY = state.panY || 0;

    // Visible area in canvas coords (inverse of the zoom/pan transform)
    const visibleLeft = -panX / zoom;
    const visibleTop = -panY / zoom;
    const visibleRight = (canvas.width / displayScale - panX) / zoom;
    const visibleBottom = (canvas.height / displayScale - panY) / zoom;

    // Add extra padding to ensure full coverage
    const padding = 1000;
    const overlayLeft = Math.min(-padding, visibleLeft - padding);
    const overlayTop = Math.min(-padding, visibleTop - padding);
    const overlayRight = Math.max(canvasWidth + padding, visibleRight + padding);
    const overlayBottom = Math.max(canvasHeight + padding, visibleBottom + padding);

    // Draw outer "unsafe" area overlay (very subtle)
    // This shows as a slight darkening outside the canvas bounds
    c.fillStyle = 'rgba(0, 0, 0, 0.15)';

    // Top area (from overlay top to canvas top)
    c.fillRect(overlayLeft, overlayTop, overlayRight - overlayLeft, -overlayTop);
    // Bottom area (from canvas bottom to overlay bottom)
    c.fillRect(overlayLeft, canvasHeight, overlayRight - overlayLeft, overlayBottom - canvasHeight);
    // Left area (from overlay left to canvas left, between top and bottom of canvas)
    c.fillRect(overlayLeft, 0, -overlayLeft, canvasHeight);
    // Right area (from canvas right to overlay right, between top and bottom of canvas)
    c.fillRect(canvasWidth, 0, overlayRight - canvasWidth, canvasHeight);

    // Draw canvas border (export frame indicator)
    c.strokeStyle = state.darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';
    c.lineWidth = 1 * uiScale;
    c.setLineDash([]);
    c.strokeRect(0, 0, canvasWidth, canvasHeight);

    // Draw corner markers for better visibility
    const cornerSize = 20 * uiScale;
    c.strokeStyle = config.theme?.colors?.accent || '#6366f1';
    c.lineWidth = 2 * uiScale;

    // Top-left corner
    c.beginPath();
    c.moveTo(0, cornerSize);
    c.lineTo(0, 0);
    c.lineTo(cornerSize, 0);
    c.stroke();

    // Top-right corner
    c.beginPath();
    c.moveTo(canvasWidth - cornerSize, 0);
    c.lineTo(canvasWidth, 0);
    c.lineTo(canvasWidth, cornerSize);
    c.stroke();

    // Bottom-left corner
    c.beginPath();
    c.moveTo(0, canvasHeight - cornerSize);
    c.lineTo(0, canvasHeight);
    c.lineTo(cornerSize, canvasHeight);
    c.stroke();

    // Bottom-right corner
    c.beginPath();
    c.moveTo(canvasWidth - cornerSize, canvasHeight);
    c.lineTo(canvasWidth, canvasHeight);
    c.lineTo(canvasWidth, canvasHeight - cornerSize);
    c.stroke();

    c.restore();
  }

  /**
   * Draw snap guides
   */
  function drawSnapGuides() {
    if (!ctx.value) return;

    const c = ctx.value;
    const guideStyle = config.snap?.guideStyle || {};
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;

    c.save();
    c.strokeStyle = guideStyle.color || '#f472b6';
    c.lineWidth = (guideStyle.lineWidth || 1) * uiScale;
    c.setLineDash(guideStyle.lineDash || []);

    // Draw vertical guides
    state.activeSnapLines?.vertical?.forEach(x => {
      c.beginPath();
      c.moveTo(x, -10000);
      c.lineTo(x, 10000);
      c.stroke();
    });

    // Draw horizontal guides
    state.activeSnapLines?.horizontal?.forEach(y => {
      c.beginPath();
      c.moveTo(-10000, y);
      c.lineTo(10000, y);
      c.stroke();
    });

    c.restore();
  }

  /**
   * Draw dimension label during resize
   */
  function drawDimensionLabel() {
    if (!ctx.value) return;

    let bounds = null;
    if (state.isResizingFrameChild && state.selectedFrameChildren?.length === 1) {
      const sel = state.selectedFrameChildren[0];
      const frame = state.shapes[sel.frameIndex];
      const child = frame?.children?.[sel.childIndex];
      if (child) bounds = getShapeBounds(child, config, ctx.value);
    } else if (state.selectedIndices.length === 1) {
      bounds = getShapeBounds(state.shapes[state.selectedIndices[0]], config, ctx.value);
    } else if (state.selectedIndices.length > 1) {
      bounds = getMultiSelectionBounds(state.shapes, state.selectedIndices, config, ctx.value);
    }

    if (!bounds) return;

    const c = ctx.value;
    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / state.zoom / displayScale;

    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    const text = `${width} × ${height}`;

    c.save();
    c.font = `${12 * uiScale}px sans-serif`;
    const textWidth = c.measureText(text).width;
    const padding = 4 * uiScale;
    const labelHeight = 16 * uiScale;

    const labelX = bounds.x + bounds.width / 2 - textWidth / 2 - padding;
    const labelY = bounds.y + bounds.height + 8 * uiScale;

    // Background
    c.fillStyle = 'rgba(0, 0, 0, 0.75)';
    c.beginPath();
    c.roundRect(labelX, labelY, textWidth + padding * 2, labelHeight, 4 * uiScale);
    c.fill();

    // Text
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillText(text, bounds.x + bounds.width / 2, labelY + labelHeight / 2);

    c.restore();
  }

  /**
   * Draw crop overlay
   */
  function drawCropOverlay() {
    if (!ctx.value) return;

    // Get the shape being cropped
    let shape;
    if (state.cropGroupChild) {
      const { groupIndex, childIndex } = state.cropGroupChild;
      const group = state.shapes[groupIndex];
      shape = group?.children?.[childIndex];
    } else if (state.cropFrameChild) {
      const { frameIndex, childIndex } = state.cropFrameChild;
      const frame = state.shapes[frameIndex];
      shape = frame?.children?.[childIndex];
    } else if (state.cropImageIndex >= 0) {
      shape = state.shapes[state.cropImageIndex];
    }

    const isImage = shape?.type === 'image' && shape?.imageElement;
    const isVideo = shape?.type === 'video' && shape?.videoElement;
    if (!shape || (!isImage && !isVideo)) return;

    const mediaElement = isImage ? shape.imageElement : shape.videoElement;
    const naturalWidth = isImage ? mediaElement.naturalWidth : (mediaElement.videoWidth || shape.width);
    const naturalHeight = isImage ? mediaElement.naturalHeight : (mediaElement.videoHeight || shape.height);

    const cropBounds = state.cropBounds;
    const imgBounds = state.cropImageBounds;
    if (!cropBounds || !imgBounds) return;

    const c = ctx.value;
    const cropConfig = config.crop || {};
    const handleStyle = cropConfig.handleStyle || 'lshape';

    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;
    const handleSize = (cropConfig.handleSize || 16) / state.zoom * uiScale;
    const handleColor = cropConfig.handleColor || '#ffffff';
    const handleBorderColor = cropConfig.handleBorderColor || '#6366f1';

    c.save();

    // Apply rotation and tilt transforms if present
    const cropRotation = state.cropRotation || 0;
    const cropTiltX = state.cropTiltX || 0;
    const cropTiltY = state.cropTiltY || 0;

    if (cropRotation || cropTiltX || cropTiltY) {
      const centerX = imgBounds.x + imgBounds.width / 2;
      const centerY = imgBounds.y + imgBounds.height / 2;

      c.translate(centerX, centerY);

      // Apply rotation first
      if (cropRotation) {
        c.rotate(cropRotation);
      }

      // Apply tilt (same transform order as in drawShape)
      if (cropTiltX || cropTiltY) {
        const skewX = Math.sin(cropTiltX) * 0.5;
        const skewY = Math.sin(cropTiltY) * 0.5;
        const scaleFromTiltX = Math.max(0.1, Math.cos(cropTiltX));
        const scaleFromTiltY = Math.max(0.1, Math.cos(cropTiltY));
        c.transform(1, skewY, skewX, 1, 0, 0);
        c.scale(scaleFromTiltY, scaleFromTiltX);
      }

      c.translate(-centerX, -centerY);
    }

    // Draw full original media (faded)
    c.globalAlpha = 0.35;
    c.drawImage(mediaElement, imgBounds.x, imgBounds.y, imgBounds.width, imgBounds.height);

    // Draw dark overlay on hidden parts
    c.globalAlpha = 0.5;
    c.fillStyle = '#000';

    // Top strip
    if (cropBounds.y > imgBounds.y) {
      c.fillRect(imgBounds.x, imgBounds.y, imgBounds.width, cropBounds.y - imgBounds.y);
    }
    // Bottom strip
    const cropBottom = cropBounds.y + cropBounds.height;
    const imgBottom = imgBounds.y + imgBounds.height;
    if (cropBottom < imgBottom) {
      c.fillRect(imgBounds.x, cropBottom, imgBounds.width, imgBottom - cropBottom);
    }
    // Left strip
    if (cropBounds.x > imgBounds.x) {
      c.fillRect(imgBounds.x, Math.max(cropBounds.y, imgBounds.y), cropBounds.x - imgBounds.x, Math.min(cropBounds.height, imgBounds.height));
    }
    // Right strip
    const cropRight = cropBounds.x + cropBounds.width;
    const imgRight = imgBounds.x + imgBounds.width;
    if (cropRight < imgRight) {
      c.fillRect(cropRight, Math.max(cropBounds.y, imgBounds.y), imgRight - cropRight, Math.min(cropBounds.height, imgBounds.height));
    }

    // Draw crop area at full brightness
    c.globalAlpha = 1;

    // Calculate source rect in original media coordinates
    const scaleX = naturalWidth / imgBounds.width;
    const scaleY = naturalHeight / imgBounds.height;

    const srcX = (cropBounds.x - imgBounds.x) * scaleX;
    const srcY = (cropBounds.y - imgBounds.y) * scaleY;
    const srcW = cropBounds.width * scaleX;
    const srcH = cropBounds.height * scaleY;

    c.drawImage(mediaElement, srcX, srcY, srcW, srcH, cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height);

    // Draw original media border (dashed, subtle)
    c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    c.lineWidth = 1 / state.zoom;
    c.setLineDash([4 / state.zoom, 4 / state.zoom]);
    c.strokeRect(imgBounds.x, imgBounds.y, imgBounds.width, imgBounds.height);
    c.setLineDash([]);

    // Draw crop border
    c.strokeStyle = '#fff';
    c.lineWidth = 2 / state.zoom;
    c.strokeRect(cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height);

    c.strokeStyle = handleBorderColor;
    c.lineWidth = 1 / state.zoom;
    c.strokeRect(cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height);

    // Draw handles based on style
    if (handleStyle === 'lshape') {
      drawLShapeCropHandles(cropBounds, handleSize, handleColor, handleBorderColor);
    } else {
      drawSquareCropHandles(cropBounds, handleSize, handleColor, handleBorderColor);
    }

    c.restore();
  }

  /**
   * Draw L-shaped crop handles
   */
  function drawLShapeCropHandles(bounds, size, fillColor, strokeColor) {
    const c = ctx.value;
    const thickness = size / 4;
    const length = size;

    c.fillStyle = fillColor;
    c.strokeStyle = strokeColor;
    c.lineWidth = 1.5 / state.zoom;

    function drawL(x, y, flipH, flipV) {
      c.save();
      c.translate(x, y);
      c.scale(flipH ? -1 : 1, flipV ? -1 : 1);

      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(length, 0);
      c.lineTo(length, thickness);
      c.lineTo(thickness, thickness);
      c.lineTo(thickness, length);
      c.lineTo(0, length);
      c.closePath();

      c.fill();
      c.stroke();
      c.restore();
    }

    // Four corners
    drawL(bounds.x, bounds.y, false, false);
    drawL(bounds.x + bounds.width, bounds.y, true, false);
    drawL(bounds.x, bounds.y + bounds.height, false, true);
    drawL(bounds.x + bounds.width, bounds.y + bounds.height, true, true);

    // Edge handles
    const edgeSize = size / 2;
    const edgeThickness = thickness;

    // Top edge
    c.fillRect(bounds.x + bounds.width / 2 - edgeSize / 2, bounds.y, edgeSize, edgeThickness);
    c.strokeRect(bounds.x + bounds.width / 2 - edgeSize / 2, bounds.y, edgeSize, edgeThickness);

    // Bottom edge
    c.fillRect(bounds.x + bounds.width / 2 - edgeSize / 2, bounds.y + bounds.height - edgeThickness, edgeSize, edgeThickness);
    c.strokeRect(bounds.x + bounds.width / 2 - edgeSize / 2, bounds.y + bounds.height - edgeThickness, edgeSize, edgeThickness);

    // Left edge
    c.fillRect(bounds.x, bounds.y + bounds.height / 2 - edgeSize / 2, edgeThickness, edgeSize);
    c.strokeRect(bounds.x, bounds.y + bounds.height / 2 - edgeSize / 2, edgeThickness, edgeSize);

    // Right edge
    c.fillRect(bounds.x + bounds.width - edgeThickness, bounds.y + bounds.height / 2 - edgeSize / 2, edgeThickness, edgeSize);
    c.strokeRect(bounds.x + bounds.width - edgeThickness, bounds.y + bounds.height / 2 - edgeSize / 2, edgeThickness, edgeSize);
  }

  /**
   * Draw square crop handles
   */
  function drawSquareCropHandles(bounds, size, fillColor, strokeColor) {
    const c = ctx.value;
    const handleSize = size / 2;

    c.fillStyle = fillColor;
    c.strokeStyle = strokeColor;
    c.lineWidth = 1.5 / state.zoom;

    const handles = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width / 2, y: bounds.y },
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height / 2 },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    ];

    handles.forEach(h => {
      c.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      c.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    });
  }

  /**
   * Convert Paper.js segments to SVG path string for Rough.js
   */
  function segmentsToSvgPath(segments, closed) {
    if (!segments || segments.length === 0) return '';

    let d = '';
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const point = seg.point;

      if (i === 0) {
        d += `M ${point.x} ${point.y} `;
      } else {
        const prevSeg = segments[i - 1];
        const prevPoint = prevSeg.point;
        const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut.x !== 0 || prevSeg.handleOut.y !== 0);
        const hasHandleIn = seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0);

        if (hasHandleOut || hasHandleIn) {
          const cp1x = prevPoint.x + (prevSeg.handleOut?.x || 0);
          const cp1y = prevPoint.y + (prevSeg.handleOut?.y || 0);
          const cp2x = point.x + (seg.handleIn?.x || 0);
          const cp2y = point.y + (seg.handleIn?.y || 0);
          d += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${point.x} ${point.y} `;
        } else {
          d += `L ${point.x} ${point.y} `;
        }
      }
    }

    // Handle closing the path
    if (closed && segments.length > 2) {
      const lastSeg = segments[segments.length - 1];
      const firstSeg = segments[0];
      const hasHandleOut = lastSeg.handleOut && (lastSeg.handleOut.x !== 0 || lastSeg.handleOut.y !== 0);
      const hasHandleIn = firstSeg.handleIn && (firstSeg.handleIn.x !== 0 || firstSeg.handleIn.y !== 0);

      if (hasHandleOut || hasHandleIn) {
        const cp1x = lastSeg.point.x + (lastSeg.handleOut?.x || 0);
        const cp1y = lastSeg.point.y + (lastSeg.handleOut?.y || 0);
        const cp2x = firstSeg.point.x + (firstSeg.handleIn?.x || 0);
        const cp2y = firstSeg.point.y + (firstSeg.handleIn?.y || 0);
        d += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstSeg.point.x} ${firstSeg.point.y} `;
      }
      d += 'Z';
    }

    return d;
  }

  /**
   * Draw vector edit overlay
   */
  function drawVectorEditOverlay() {
    if (!ctx.value || !state.vectorEditPath || !state.vectorEditPath.segments) return;

    const c = ctx.value;
    const vecConfig = config.vectorEdit || {};

    const displayScale = state.canvasDisplayScale || 1;
    const uiScale = 1 / displayScale;
    const anchorSize = (vecConfig.anchorSize || 8) / state.zoom * uiScale;
    const anchorFill = vecConfig.anchorFill || '#ffffff';
    const anchorStroke = vecConfig.anchorStroke || '#6366f1';
    const anchorSelectedFill = vecConfig.anchorSelectedFill || '#6366f1';
    const handleSize = (vecConfig.handleSize || 6) / state.zoom * uiScale;
    const handleFill = vecConfig.handleFill || '#ffffff';
    const handleStroke = vecConfig.handleStroke || '#6366f1';
    const handleLineColor = vecConfig.handleLineColor || '#6366f1';
    const handleLineWidth = (vecConfig.handleLineWidth || 1) / state.zoom * uiScale;

    // Get original shape colors and roughness (from main shape, group child, or frame child)
    let originalShape;
    if (state.vectorEditIndex >= 0) {
      originalShape = state.shapes[state.vectorEditIndex];
    } else if (state.vectorEditFrameIndex >= 0 && state.vectorEditFrameChildIndex >= 0) {
      const frame = state.shapes[state.vectorEditFrameIndex];
      originalShape = frame?.children?.[state.vectorEditFrameChildIndex];
    } else if (state.vectorEditGroupIndex >= 0 && state.vectorEditChildIndex >= 0) {
      const group = state.shapes[state.vectorEditGroupIndex];
      originalShape = group?.children?.[state.vectorEditChildIndex];
    }
    const shapeStrokeColor = originalShape?.color || anchorStroke;
    const shapeFillColor = originalShape?.fillColor;
    const shapeLineWidth = originalShape?.lineWidth || 2;
    const roughness = originalShape?.roughness ?? config.tools?.defaultRoughness ?? 1;

    // Get stroke style for dashed/dotted lines
    const strokeStyle = originalShape?.strokeStyle || 'solid';
    let strokeLineDash = [];
    if (strokeStyle === 'dashed') {
      strokeLineDash = [12, 6];
    } else if (strokeStyle === 'dotted') {
      strokeLineDash = [3, 6];
    }

    // Check if sketchy mode should be used (disable for dashed/dotted strokes as Rough.js doesn't support them)
    const hasDashPattern = strokeLineDash.length > 0;
    const isSketchy = rc.value && config.tools?.renderMode === 'sketchy' && roughness > 0 && !hasDashPattern;

    c.save();

    // Apply rotation and tilt transforms if needed
    const vecRotation = state.vectorEditRotation || 0;
    const vecTiltX = state.vectorEditTiltX || 0;
    const vecTiltY = state.vectorEditTiltY || 0;

    if ((vecRotation || vecTiltX || vecTiltY) && state.vectorEditCenter) {
      const center = state.vectorEditCenter;
      c.translate(center.x, center.y);

      // Apply rotation first
      if (vecRotation) {
        c.rotate(vecRotation);
      }

      // Apply tilt (same transform order as in drawShape)
      if (vecTiltX || vecTiltY) {
        const skewX = Math.sin(vecTiltX) * 0.5;
        const skewY = Math.sin(vecTiltY) * 0.5;
        const scaleFromTiltX = Math.max(0.1, Math.cos(vecTiltX));
        const scaleFromTiltY = Math.max(0.1, Math.cos(vecTiltY));
        c.transform(1, skewY, skewX, 1, 0, 0);
        c.scale(scaleFromTiltY, scaleFromTiltX);
      }

      c.translate(-center.x, -center.y);
    }

    const hasStroke = shapeStrokeColor && shapeStrokeColor !== 'transparent';
    const hasFill = shapeFillColor && shapeFillColor !== 'transparent';
    const segments = state.vectorEditPath.segments;

    // Draw the path using Rough.js if in sketchy mode, otherwise use precise rendering
    if (isSketchy) {
      // Use Rough.js for sketchy rendering
      const svgPath = segmentsToSvgPath(segments, state.vectorEditPath.closed);
      if (svgPath) {
        rc.value.path(svgPath, {
          seed: originalShape?.seed || 1,
          roughness: roughness,
          stroke: hasStroke ? shapeStrokeColor : 'transparent',
          strokeWidth: hasStroke ? shapeLineWidth : 0,
          fill: hasFill ? shapeFillColor : undefined,
          fillStyle: 'solid'
        });
      }

      // If no stroke, draw a dashed outline for editing visibility
      if (!hasStroke) {
        c.strokeStyle = anchorStroke;
        c.lineWidth = 1 / state.zoom;
        c.setLineDash([4 / state.zoom, 4 / state.zoom]);
        c.beginPath();
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const point = seg.point;
          if (i === 0) {
            c.moveTo(point.x, point.y);
          } else {
            const prevSeg = segments[i - 1];
            const prevPoint = prevSeg.point;
            const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut.x !== 0 || prevSeg.handleOut.y !== 0);
            const hasHandleIn = seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0);
            if (hasHandleOut || hasHandleIn) {
              const cp1x = prevPoint.x + (prevSeg.handleOut?.x || 0);
              const cp1y = prevPoint.y + (prevSeg.handleOut?.y || 0);
              const cp2x = point.x + (seg.handleIn?.x || 0);
              const cp2y = point.y + (seg.handleIn?.y || 0);
              c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, point.x, point.y);
            } else {
              c.lineTo(point.x, point.y);
            }
          }
        }
        if (state.vectorEditPath.closed) c.closePath();
        c.stroke();
        c.setLineDash([]);
      }
    } else {
      // Use precise canvas rendering
      c.strokeStyle = hasStroke ? shapeStrokeColor : anchorStroke;
      c.fillStyle = hasFill ? shapeFillColor : 'transparent';
      c.lineWidth = hasStroke ? shapeLineWidth / state.zoom : 2 / state.zoom;
      // Apply stroke dash pattern (scaled by zoom for consistent appearance)
      c.setLineDash(strokeLineDash.map(v => v / state.zoom));

      c.beginPath();
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const point = seg.point;

        if (i === 0) {
          c.moveTo(point.x, point.y);
        } else {
          const prevSeg = segments[i - 1];
          const prevPoint = prevSeg.point;

          const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut.x !== 0 || prevSeg.handleOut.y !== 0);
          const hasHandleIn = seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0);

          if (hasHandleOut || hasHandleIn) {
            const cp1x = prevPoint.x + (prevSeg.handleOut?.x || 0);
            const cp1y = prevPoint.y + (prevSeg.handleOut?.y || 0);
            const cp2x = point.x + (seg.handleIn?.x || 0);
            const cp2y = point.y + (seg.handleIn?.y || 0);
            c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, point.x, point.y);
          } else {
            c.lineTo(point.x, point.y);
          }
        }
      }

      // Close path if needed
      if (state.vectorEditPath.closed && segments.length > 2) {
        const lastSeg = segments[segments.length - 1];
        const firstSeg = segments[0];

        const hasHandleOut = lastSeg.handleOut && (lastSeg.handleOut.x !== 0 || lastSeg.handleOut.y !== 0);
        const hasHandleIn = firstSeg.handleIn && (firstSeg.handleIn.x !== 0 || firstSeg.handleIn.y !== 0);

        if (hasHandleOut || hasHandleIn) {
          const cp1x = lastSeg.point.x + (lastSeg.handleOut?.x || 0);
          const cp1y = lastSeg.point.y + (lastSeg.handleOut?.y || 0);
          const cp2x = firstSeg.point.x + (firstSeg.handleIn?.x || 0);
          const cp2y = firstSeg.point.y + (firstSeg.handleIn?.y || 0);
          c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, firstSeg.point.x, firstSeg.point.y);
        } else {
          c.closePath();
        }
      }

      if (hasFill) {
        c.fill();
      }
      if (hasStroke) {
        c.stroke();
      } else {
        c.strokeStyle = anchorStroke;
        c.lineWidth = 1 / state.zoom;
        c.setLineDash([4 / state.zoom, 4 / state.zoom]);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // Draw handles and anchor points
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const point = seg.point;
      const isSelected = i === state.activeSegmentIndex;

      // Draw handle lines and circles
      if (seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0)) {
        const handleInPos = { x: point.x + seg.handleIn.x, y: point.y + seg.handleIn.y };

        c.strokeStyle = handleLineColor;
        c.lineWidth = handleLineWidth;
        c.beginPath();
        c.moveTo(point.x, point.y);
        c.lineTo(handleInPos.x, handleInPos.y);
        c.stroke();

        c.fillStyle = (isSelected && state.activeHandleType === 'handleIn') ? anchorSelectedFill : handleFill;
        c.strokeStyle = handleStroke;
        c.lineWidth = 1 / state.zoom;
        c.beginPath();
        c.arc(handleInPos.x, handleInPos.y, handleSize / 2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }

      if (seg.handleOut && (seg.handleOut.x !== 0 || seg.handleOut.y !== 0)) {
        const handleOutPos = { x: point.x + seg.handleOut.x, y: point.y + seg.handleOut.y };

        c.strokeStyle = handleLineColor;
        c.lineWidth = handleLineWidth;
        c.beginPath();
        c.moveTo(point.x, point.y);
        c.lineTo(handleOutPos.x, handleOutPos.y);
        c.stroke();

        c.fillStyle = (isSelected && state.activeHandleType === 'handleOut') ? anchorSelectedFill : handleFill;
        c.strokeStyle = handleStroke;
        c.lineWidth = 1 / state.zoom;
        c.beginPath();
        c.arc(handleOutPos.x, handleOutPos.y, handleSize / 2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }

      // Draw anchor point (square)
      const halfSize = anchorSize / 2;
      c.fillStyle = (isSelected && state.activeHandleType === 'point') ? anchorSelectedFill : anchorFill;
      c.strokeStyle = anchorStroke;
      c.lineWidth = 1.5 / state.zoom;
      c.fillRect(point.x - halfSize, point.y - halfSize, anchorSize, anchorSize);
      c.strokeRect(point.x - halfSize, point.y - halfSize, anchorSize, anchorSize);
    }

    c.restore();
  }

  // ==================== VIDEO MODE EFFECTS ====================

  /**
   * Get active clips of a specific type at a given time
   * Uses _allShapesForEffects if available (set during video mode temporal filtering)
   * to ensure filters/effects are found even when shapes array is temporarily filtered
   */
  function getActiveClipsOfType(type, time) {
    // In video mode, shapes may be temporarily filtered for rendering
    // Use the full shapes array stored in _allShapesForEffects to find effects/filters
    const shapesToSearch = state._allShapesForEffects || state.shapes;

    return shapesToSearch.filter(shape => {
      if (shape.type !== type) return false;
      if (shape.visible === false) return false;
      const startTime = shape.startTime || 0;
      const endTime = startTime + (shape.duration || 0);
      return time >= startTime && time < endTime;
    });
  }

  /**
   * Apply active filters and effects (video mode only)
   */
  function applyActiveFiltersAndEffects() {
    if (!ctx.value) return;

    const currentTime = state.currentTime || 0;

    const activeFilters = getActiveClipsOfType('filter', currentTime);
    const activeEffects = getActiveClipsOfType('effect', currentTime);
    const activeTransitions = getActiveClipsOfType('transition', currentTime);

    if (activeFilters.length === 0 && activeEffects.length === 0 && activeTransitions.length === 0) {
      return;
    }

    const canvas = ctx.value.canvas;
    const c = ctx.value;

    // Get canvas dimensions in world coordinates
    const canvasWidth = canvas.width / state.zoom;
    const canvasHeight = canvas.height / state.zoom;
    const offsetX = -state.panX / state.zoom;
    const offsetY = -state.panY / state.zoom;

    // Apply transitions first
    activeTransitions.forEach(transition => {
      const progress = getTransitionProgress(transition, currentTime);
      applyTransition(transition, progress, offsetX, offsetY, canvasWidth, canvasHeight);
    });

    // Build CSS filter string
    let filterString = '';
    activeFilters.forEach(filter => {
      const value = filter.value !== undefined ? filter.value : 100;
      const subtype = filter.subtype;

      switch (subtype) {
        case 'brightness':
          filterString += `brightness(${value / 100}) `;
          break;
        case 'contrast':
          filterString += `contrast(${value / 100}) `;
          break;
        case 'saturation':
          filterString += `saturate(${value / 100}) `;
          break;
        case 'hue':
          filterString += `hue-rotate(${value}deg) `;
          break;
        case 'grayscale':
          filterString += `grayscale(${value / 100}) `;
          break;
        case 'sepia':
          filterString += `sepia(${value / 100}) `;
          break;
        case 'invert':
          filterString += `invert(${value / 100}) `;
          break;
        case 'blur':
          const blurRadius = filter.radius !== undefined ? filter.radius : 5;
          filterString += `blur(${blurRadius}px) `;
          break;
        case 'temperature':
          // Temperature is simulated with sepia + hue-rotate combination
          // value: 0 = cold (blue tint), 100 = neutral, 200 = warm (orange/yellow tint)
          const tempValue = value - 100; // -100 to +100 range
          if (tempValue > 0) {
            // Warm: add sepia and slight saturation boost
            filterString += `sepia(${tempValue / 200}) saturate(${1 + tempValue / 200}) `;
          } else if (tempValue < 0) {
            // Cool: use hue-rotate toward blue and reduce saturation slightly
            filterString += `hue-rotate(${tempValue / 2}deg) saturate(${1 + tempValue / 400}) `;
          }
          break;
      }
    });

    // Apply CSS filters
    if (filterString) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.drawImage(canvas, 0, 0);

      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = state.backgroundColor;
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.filter = filterString.trim();
      c.drawImage(tempCanvas, 0, 0);
      c.filter = 'none';

      c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
    }

    // Apply effects (overlays)
    activeEffects.forEach(effect => {
      const intensity = (effect.intensity !== undefined ? effect.intensity : 100) / 100;
      const subtype = effect.subtype;

      c.save();

      switch (subtype) {
        case 'vignette':
          drawVignetteEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity, effect.radius || 50);
          break;
        case 'grain':
          drawGrainEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity, effect.amount || 30);
          break;
        case 'glow':
          drawGlowEffect(intensity, effect.radius || 10, effect.color || '#ffffff');
          break;
        case 'dropShadow':
          drawDropShadowEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity, effect.offsetX || 5, effect.offsetY || 5, effect.blur || 10, effect.color || 'rgba(0,0,0,0.5)');
          break;
        case 'blur':
          drawBlurEffect(intensity, effect.radius || 10);
          break;
        case 'glitch':
          drawGlitchEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity, effect.amount || 10);
          break;
        case 'chromatic':
          drawChromaticAberrationEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity, effect.offset || 5);
          break;
        case 'pixelate':
          drawPixelateEffect(intensity, effect.size || 10);
          break;
        case 'outline':
          drawOutlineEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity, effect.width || 2, effect.color || '#000000');
          break;
        case 'sharpen':
          drawSharpenEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity);
          break;
        case 'emboss':
          drawEmbossEffect(offsetX, offsetY, canvasWidth, canvasHeight, intensity);
          break;
      }

      c.restore();
    });
  }

  /**
   * Get transition progress with easing
   */
  function getTransitionProgress(transition, currentTime) {
    const startTime = transition.startTime || 0;
    const duration = transition.duration || 1;
    const elapsed = currentTime - startTime;
    let progress = Math.max(0, Math.min(1, elapsed / duration));

    const easing = transition.easing || 'ease-in-out';
    return applyEasing(progress, easing);
  }

  /**
   * Apply easing function
   */
  function applyEasing(t, easing) {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return t * (2 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default:
        return t;
    }
  }

  /**
   * Apply transition effect
   */
  function applyTransition(transition, progress, x, y, width, height) {
    if (!ctx.value) return;

    const canvas = ctx.value.canvas;
    const c = ctx.value;
    const subtype = transition.subtype;

    // Create temp canvas with current content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    // Reset main canvas
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = state.backgroundColor;
    c.fillRect(0, 0, canvas.width, canvas.height);

    c.save();

    switch (subtype) {
      case 'fade':
      case 'dissolve':
        c.globalAlpha = progress;
        c.drawImage(tempCanvas, 0, 0);
        break;

      case 'wipeLeft':
        const wipeLeftX = canvas.width * (1 - progress);
        c.drawImage(tempCanvas, 0, 0, canvas.width - wipeLeftX, canvas.height, 0, 0, canvas.width - wipeLeftX, canvas.height);
        break;

      case 'wipeRight':
        const wipeRightX = canvas.width * progress;
        c.drawImage(tempCanvas, wipeRightX, 0, canvas.width - wipeRightX, canvas.height, wipeRightX, 0, canvas.width - wipeRightX, canvas.height);
        break;

      case 'wipeUp':
        const wipeUpY = canvas.height * (1 - progress);
        c.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height - wipeUpY, 0, 0, canvas.width, canvas.height - wipeUpY);
        break;

      case 'wipeDown':
        const wipeDownY = canvas.height * progress;
        c.drawImage(tempCanvas, 0, wipeDownY, canvas.width, canvas.height - wipeDownY, 0, wipeDownY, canvas.width, canvas.height - wipeDownY);
        break;

      case 'slideLeft':
        const slideLeftDist = (transition.distance ?? 100) / 100;
        const slideLeftOffset = canvas.width * slideLeftDist * (1 - progress);
        c.drawImage(tempCanvas, slideLeftOffset, 0);
        break;

      case 'slideRight':
        const slideRightDist = (transition.distance ?? 100) / 100;
        const slideRightOffset = -canvas.width * slideRightDist * (1 - progress);
        c.drawImage(tempCanvas, slideRightOffset, 0);
        break;

      case 'slideUp':
        const slideUpDist = (transition.distance ?? 100) / 100;
        const slideUpOffset = canvas.height * slideUpDist * (1 - progress);
        c.drawImage(tempCanvas, 0, slideUpOffset);
        break;

      case 'slideDown':
        const slideDownDist = (transition.distance ?? 100) / 100;
        const slideDownOffset = -canvas.height * slideDownDist * (1 - progress);
        c.drawImage(tempCanvas, 0, slideDownOffset);
        break;

      case 'zoomIn':
        // Camera push: starts at 100% and zooms into focal point
        // scale = starting scale (1.0 = 100% normal view)
        // zoomLevel = target zoom percentage (e.g., 150 = 150% = 1.5x zoom)
        const zoomInStartScale = transition.scale ?? 1.0;
        const zoomInEndScale = (transition.zoomLevel ?? 150) / 100;
        const zoomInScale = zoomInStartScale + ((zoomInEndScale - zoomInStartScale) * progress);
        // Calculate focal point (0-100% converted to 0-1)
        let zoomInFocalX = 0.5, zoomInFocalY = 0.5;
        if (transition.focalPoint === 'custom') {
          zoomInFocalX = (transition.focalX ?? 50) / 100;
          zoomInFocalY = (transition.focalY ?? 50) / 100;
        } else {
          // Preset focal points (matching UI names from OptionsBar.vue)
          switch (transition.focalPoint) {
            case 'top-left': zoomInFocalX = 0; zoomInFocalY = 0; break;
            case 'top': case 'top-center': zoomInFocalX = 0.5; zoomInFocalY = 0; break;
            case 'top-right': zoomInFocalX = 1; zoomInFocalY = 0; break;
            case 'left': case 'middle-left': zoomInFocalX = 0; zoomInFocalY = 0.5; break;
            case 'center': zoomInFocalX = 0.5; zoomInFocalY = 0.5; break;
            case 'right': case 'middle-right': zoomInFocalX = 1; zoomInFocalY = 0.5; break;
            case 'bottom-left': zoomInFocalX = 0; zoomInFocalY = 1; break;
            case 'bottom': case 'bottom-center': zoomInFocalX = 0.5; zoomInFocalY = 1; break;
            case 'bottom-right': zoomInFocalX = 1; zoomInFocalY = 1; break;
            default: zoomInFocalX = 0.5; zoomInFocalY = 0.5;
          }
        }
        // For scale > 1, we need to crop/offset into the image (camera push effect)
        // Calculate source rect to crop from the scaled image
        const zoomInCropW = canvas.width / zoomInScale;
        const zoomInCropH = canvas.height / zoomInScale;
        const zoomInCropX = (canvas.width - zoomInCropW) * zoomInFocalX;
        const zoomInCropY = (canvas.height - zoomInCropH) * zoomInFocalY;
        c.drawImage(tempCanvas, zoomInCropX, zoomInCropY, zoomInCropW, zoomInCropH, 0, 0, canvas.width, canvas.height);
        break;

      case 'zoomOut':
        // Camera pull: starts zoomed in and pulls back to normal view
        // zoomLevel = starting zoom percentage (e.g., 150 = 150% = 1.5x zoom)
        // scale = ending scale (1.0 = 100% normal view)
        const zoomOutStartScale = (transition.zoomLevel ?? 150) / 100;
        const zoomOutEndScale = transition.scale ?? 1.0;
        const zoomOutScale = zoomOutStartScale - ((zoomOutStartScale - zoomOutEndScale) * progress);
        // Calculate focal point (0-100% converted to 0-1)
        let zoomOutFocalX = 0.5, zoomOutFocalY = 0.5;
        if (transition.focalPoint === 'custom') {
          zoomOutFocalX = (transition.focalX ?? 50) / 100;
          zoomOutFocalY = (transition.focalY ?? 50) / 100;
        } else {
          // Preset focal points (matching UI names from OptionsBar.vue)
          switch (transition.focalPoint) {
            case 'top-left': zoomOutFocalX = 0; zoomOutFocalY = 0; break;
            case 'top': case 'top-center': zoomOutFocalX = 0.5; zoomOutFocalY = 0; break;
            case 'top-right': zoomOutFocalX = 1; zoomOutFocalY = 0; break;
            case 'left': case 'middle-left': zoomOutFocalX = 0; zoomOutFocalY = 0.5; break;
            case 'center': zoomOutFocalX = 0.5; zoomOutFocalY = 0.5; break;
            case 'right': case 'middle-right': zoomOutFocalX = 1; zoomOutFocalY = 0.5; break;
            case 'bottom-left': zoomOutFocalX = 0; zoomOutFocalY = 1; break;
            case 'bottom': case 'bottom-center': zoomOutFocalX = 0.5; zoomOutFocalY = 1; break;
            case 'bottom-right': zoomOutFocalX = 1; zoomOutFocalY = 1; break;
            default: zoomOutFocalX = 0.5; zoomOutFocalY = 0.5;
          }
        }
        // For scale > 1, we crop from the source (camera pull effect)
        const zoomOutCropW = canvas.width / zoomOutScale;
        const zoomOutCropH = canvas.height / zoomOutScale;
        const zoomOutCropX = (canvas.width - zoomOutCropW) * zoomOutFocalX;
        const zoomOutCropY = (canvas.height - zoomOutCropH) * zoomOutFocalY;
        c.drawImage(tempCanvas, zoomOutCropX, zoomOutCropY, zoomOutCropW, zoomOutCropH, 0, 0, canvas.width, canvas.height);
        break;

      case 'crossZoom':
        // Cross zoom: starts at one zoom level and transitions to another
        // scale = starting scale (e.g., 1.0 = 100%)
        // zoomLevel = target zoom percentage (e.g., 150 = 150% = 1.5x zoom)
        const crossZoomStartScale = transition.scale ?? 1.0;
        const crossZoomEndScale = (transition.zoomLevel ?? 150) / 100;
        const crossZoomScale = crossZoomStartScale + ((crossZoomEndScale - crossZoomStartScale) * progress);
        // Calculate focal point (0-100% converted to 0-1)
        let crossZoomFocalX = 0.5, crossZoomFocalY = 0.5;
        if (transition.focalPoint === 'custom') {
          crossZoomFocalX = (transition.focalX ?? 50) / 100;
          crossZoomFocalY = (transition.focalY ?? 50) / 100;
        } else {
          // Preset focal points (matching UI names from OptionsBar.vue)
          switch (transition.focalPoint) {
            case 'top-left': crossZoomFocalX = 0; crossZoomFocalY = 0; break;
            case 'top': case 'top-center': crossZoomFocalX = 0.5; crossZoomFocalY = 0; break;
            case 'top-right': crossZoomFocalX = 1; crossZoomFocalY = 0; break;
            case 'left': case 'middle-left': crossZoomFocalX = 0; crossZoomFocalY = 0.5; break;
            case 'center': crossZoomFocalX = 0.5; crossZoomFocalY = 0.5; break;
            case 'right': case 'middle-right': crossZoomFocalX = 1; crossZoomFocalY = 0.5; break;
            case 'bottom-left': crossZoomFocalX = 0; crossZoomFocalY = 1; break;
            case 'bottom': case 'bottom-center': crossZoomFocalX = 0.5; crossZoomFocalY = 1; break;
            case 'bottom-right': crossZoomFocalX = 1; crossZoomFocalY = 1; break;
            default: crossZoomFocalX = 0.5; crossZoomFocalY = 0.5;
          }
        }
        // Crop from source for camera-style zoom
        const crossZoomCropW = canvas.width / crossZoomScale;
        const crossZoomCropH = canvas.height / crossZoomScale;
        const crossZoomCropX = (canvas.width - crossZoomCropW) * crossZoomFocalX;
        const crossZoomCropY = (canvas.height - crossZoomCropH) * crossZoomFocalY;
        c.drawImage(tempCanvas, crossZoomCropX, crossZoomCropY, crossZoomCropW, crossZoomCropH, 0, 0, canvas.width, canvas.height);
        break;

      case 'kenBurns':
        // Ken Burns effect: slow zoom with pan from start focal point to end focal point
        // Creates cinematic documentary-style movement
        // startZoom = starting zoom level (e.g., 100 = 100%)
        // endZoom = ending zoom level (e.g., 120 = 120%)
        // startFocalPoint/endFocalPoint = where to focus at start/end
        const kbStartZoom = (transition.startZoom ?? 100) / 100;
        const kbEndZoom = (transition.endZoom ?? 120) / 100;
        const kbCurrentZoom = kbStartZoom + ((kbEndZoom - kbStartZoom) * progress);

        // Calculate start focal point
        let kbStartFocalX = 0.5, kbStartFocalY = 0.5;
        if (transition.startFocalPoint === 'custom') {
          kbStartFocalX = (transition.startFocalX ?? 50) / 100;
          kbStartFocalY = (transition.startFocalY ?? 50) / 100;
        } else {
          switch (transition.startFocalPoint) {
            case 'top-left': kbStartFocalX = 0; kbStartFocalY = 0; break;
            case 'top': case 'top-center': kbStartFocalX = 0.5; kbStartFocalY = 0; break;
            case 'top-right': kbStartFocalX = 1; kbStartFocalY = 0; break;
            case 'left': case 'middle-left': kbStartFocalX = 0; kbStartFocalY = 0.5; break;
            case 'center': kbStartFocalX = 0.5; kbStartFocalY = 0.5; break;
            case 'right': case 'middle-right': kbStartFocalX = 1; kbStartFocalY = 0.5; break;
            case 'bottom-left': kbStartFocalX = 0; kbStartFocalY = 1; break;
            case 'bottom': case 'bottom-center': kbStartFocalX = 0.5; kbStartFocalY = 1; break;
            case 'bottom-right': kbStartFocalX = 1; kbStartFocalY = 1; break;
            default: kbStartFocalX = 0.5; kbStartFocalY = 0.5;
          }
        }

        // Calculate end focal point
        let kbEndFocalX = 0.5, kbEndFocalY = 0.5;
        if (transition.endFocalPoint === 'custom') {
          kbEndFocalX = (transition.endFocalX ?? 50) / 100;
          kbEndFocalY = (transition.endFocalY ?? 50) / 100;
        } else {
          switch (transition.endFocalPoint) {
            case 'top-left': kbEndFocalX = 0; kbEndFocalY = 0; break;
            case 'top': case 'top-center': kbEndFocalX = 0.5; kbEndFocalY = 0; break;
            case 'top-right': kbEndFocalX = 1; kbEndFocalY = 0; break;
            case 'left': case 'middle-left': kbEndFocalX = 0; kbEndFocalY = 0.5; break;
            case 'center': kbEndFocalX = 0.5; kbEndFocalY = 0.5; break;
            case 'right': case 'middle-right': kbEndFocalX = 1; kbEndFocalY = 0.5; break;
            case 'bottom-left': kbEndFocalX = 0; kbEndFocalY = 1; break;
            case 'bottom': case 'bottom-center': kbEndFocalX = 0.5; kbEndFocalY = 1; break;
            case 'bottom-right': kbEndFocalX = 1; kbEndFocalY = 1; break;
            default: kbEndFocalX = 0.5; kbEndFocalY = 0.5;
          }
        }

        // Interpolate focal point between start and end
        const kbCurrentFocalX = kbStartFocalX + ((kbEndFocalX - kbStartFocalX) * progress);
        const kbCurrentFocalY = kbStartFocalY + ((kbEndFocalY - kbStartFocalY) * progress);

        // Calculate crop region for current zoom and focal point
        const kbCropW = canvas.width / kbCurrentZoom;
        const kbCropH = canvas.height / kbCurrentZoom;
        const kbCropX = (canvas.width - kbCropW) * kbCurrentFocalX;
        const kbCropY = (canvas.height - kbCropH) * kbCurrentFocalY;
        c.drawImage(tempCanvas, kbCropX, kbCropY, kbCropW, kbCropH, 0, 0, canvas.width, canvas.height);
        break;

      case 'blur':
      case 'blurTransition':
        // Blur transition: blur decreases over time using intensity property
        const blurIntensity = transition.intensity ?? 10;
        const blurAmount = blurIntensity * (1 - progress);
        c.filter = `blur(${blurAmount}px)`;
        c.drawImage(tempCanvas, 0, 0);
        c.filter = 'none';
        break;

      case 'spin':
        // Spin: rotates around center using rotation and direction properties
        const spinRotationDeg = transition.rotation ?? 360;
        const spinDirection = transition.direction === 'ccw' ? -1 : 1;
        const spinAngle = (1 - progress) * (spinRotationDeg * Math.PI / 180) * spinDirection;
        c.translate(canvas.width / 2, canvas.height / 2);
        c.rotate(spinAngle);
        c.translate(-canvas.width / 2, -canvas.height / 2);
        c.drawImage(tempCanvas, 0, 0);
        break;

      case 'flip':
        // Flip: flip with scale using axis property (horizontal or vertical)
        const flipAxis = transition.axis ?? 'horizontal';
        const flipScale = Math.abs(Math.cos((1 - progress) * Math.PI));
        c.translate(canvas.width / 2, canvas.height / 2);
        if (flipAxis === 'vertical') {
          c.scale(1, flipScale);
        } else {
          c.scale(flipScale, 1);
        }
        c.translate(-canvas.width / 2, -canvas.height / 2);
        c.drawImage(tempCanvas, 0, 0);
        break;

      case 'bounce':
        // Bounce: scale with bounce easing using intensity and bounces properties
        const bounceIntensity = transition.intensity ?? 0.5;
        const bounceCount = transition.bounces ?? 2;
        const bounceT = 1 - progress;
        const bounceScale = 1 - Math.abs(Math.sin(bounceT * Math.PI * bounceCount) * (1 - progress) * bounceIntensity);
        const bounceOffsetX = (canvas.width * (1 - bounceScale)) / 2;
        const bounceOffsetY = (canvas.height * (1 - bounceScale)) / 2;
        c.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height, bounceOffsetX, bounceOffsetY, canvas.width * bounceScale, canvas.height * bounceScale);
        break;

      case 'elastic':
        // Elastic: overshoot and settle effect using elasticity property
        const elasticity = transition.elasticity ?? 0.5;
        const elasticT = progress;
        const elasticAmplitude = 1 + elasticity; // 1.1 to 2.0 range
        const elasticScale = elasticT === 0 ? 0 : elasticT === 1 ? 1 :
          Math.pow(2, -10 * elasticT) * Math.sin((elasticT * 10 - 0.75) * ((2 * Math.PI) / 3)) * elasticAmplitude + 1;
        const elasticOffsetX = (canvas.width * (1 - elasticScale)) / 2;
        const elasticOffsetY = (canvas.height * (1 - elasticScale)) / 2;
        c.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height, elasticOffsetX, elasticOffsetY, canvas.width * elasticScale, canvas.height * elasticScale);
        break;

      default:
        c.drawImage(tempCanvas, 0, 0);
    }

    c.restore();

    // Restore transform
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
  }

  /**
   * Draw vignette effect
   */
  function drawVignetteEffect(x, y, width, height, intensity, radius) {
    if (!ctx.value) return;

    const c = ctx.value;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const maxRadius = Math.sqrt(width * width + height * height) / 2;
    const innerRadius = maxRadius * (radius / 100);

    const gradient = c.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, maxRadius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity * 0.8})`);

    c.fillStyle = gradient;
    c.fillRect(x, y, width, height);
  }

  /**
   * Draw grain effect
   */
  function drawGrainEffect(x, y, width, height, intensity, amount) {
    if (!ctx.value) return;

    const c = ctx.value;
    const grainAlpha = intensity * (amount / 100) * 0.3;
    const patternSize = 4;

    for (let py = 0; py < height; py += patternSize) {
      for (let px = 0; px < width; px += patternSize) {
        if (Math.random() > 0.5) {
          const brightness = Math.random() > 0.5 ? 255 : 0;
          c.fillStyle = `rgba(${brightness},${brightness},${brightness},${grainAlpha * Math.random()})`;
          c.fillRect(x + px, y + py, patternSize, patternSize);
        }
      }
    }
  }

  /**
   * Draw glow effect
   */
  function drawGlowEffect(intensity, radius, color) {
    if (!ctx.value) return;

    const c = ctx.value;
    const canvas = c.canvas;

    c.globalCompositeOperation = 'screen';
    c.globalAlpha = intensity * 0.3;
    c.fillStyle = color;

    const canvasWidth = canvas.width / state.zoom;
    const canvasHeight = canvas.height / state.zoom;
    const offsetX = -state.panX / state.zoom;
    const offsetY = -state.panY / state.zoom;

    c.fillRect(offsetX, offsetY, canvasWidth, canvasHeight);

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  /**
   * Draw drop shadow effect
   * Creates an inner shadow/vignette-like darkening offset from edges
   */
  function drawDropShadowEffect(x, y, width, height, intensity, offX, offY, blur, color) {
    if (!ctx.value) return;

    const c = ctx.value;
    const canvas = c.canvas;

    // Calculate shadow parameters
    const shadowOffsetX = offX * intensity;
    const shadowOffsetY = offY * intensity;
    const shadowBlur = Math.max(5, blur * intensity);
    const shadowSpread = shadowBlur * 6; // Increased spread for more visible shadow

    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);

    // Create inner shadow by drawing gradients from edges
    c.globalAlpha = intensity * 0.5;

    // Top shadow
    const topGradient = c.createLinearGradient(0, shadowOffsetY, 0, shadowOffsetY + shadowSpread);
    topGradient.addColorStop(0, color);
    topGradient.addColorStop(1, 'transparent');
    c.fillStyle = topGradient;
    c.fillRect(0, 0, canvas.width, shadowSpread + shadowOffsetY);

    // Left shadow
    const leftGradient = c.createLinearGradient(shadowOffsetX, 0, shadowOffsetX + shadowSpread, 0);
    leftGradient.addColorStop(0, color);
    leftGradient.addColorStop(1, 'transparent');
    c.fillStyle = leftGradient;
    c.fillRect(0, 0, shadowSpread + shadowOffsetX, canvas.height);

    // Bottom shadow (lighter, offset up)
    if (shadowOffsetY < 0) {
      const bottomGradient = c.createLinearGradient(0, canvas.height + shadowOffsetY, 0, canvas.height + shadowOffsetY - shadowSpread);
      bottomGradient.addColorStop(0, color);
      bottomGradient.addColorStop(1, 'transparent');
      c.fillStyle = bottomGradient;
      c.fillRect(0, canvas.height - shadowSpread, canvas.width, shadowSpread);
    }

    // Right shadow (lighter, offset left)
    if (shadowOffsetX < 0) {
      const rightGradient = c.createLinearGradient(canvas.width + shadowOffsetX, 0, canvas.width + shadowOffsetX - shadowSpread, 0);
      rightGradient.addColorStop(0, color);
      rightGradient.addColorStop(1, 'transparent');
      c.fillStyle = rightGradient;
      c.fillRect(canvas.width - shadowSpread, 0, shadowSpread, canvas.height);
    }

    c.globalAlpha = 1;
    c.restore();
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
  }

  /**
   * Draw blur effect (overall blur)
   */
  function drawBlurEffect(intensity, radius) {
    if (!ctx.value) return;

    const c = ctx.value;
    const canvas = c.canvas;

    // Create temp canvas with current content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    // Apply blur
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = state.backgroundColor;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.filter = `blur(${radius * intensity}px)`;
    c.drawImage(tempCanvas, 0, 0);
    c.filter = 'none';
    c.restore();
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
  }

  /**
   * Draw glitch effect
   */
  function drawGlitchEffect(x, y, width, height, intensity, amount) {
    if (!ctx.value) return;

    const c = ctx.value;
    const canvas = c.canvas;

    // Create temp canvas with current content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);

    // Draw glitch slices
    const sliceCount = Math.floor(5 + amount * intensity / 10);
    const sliceHeight = canvas.height / sliceCount;

    for (let i = 0; i < sliceCount; i++) {
      if (Math.random() < intensity * 0.5) {
        const offsetX = (Math.random() - 0.5) * amount * intensity * 2;
        const sy = i * sliceHeight;
        c.drawImage(
          tempCanvas,
          0, sy, canvas.width, sliceHeight,
          offsetX, sy, canvas.width, sliceHeight
        );
      }
    }

    // Add RGB split for more glitchy look
    if (intensity > 0.3) {
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = intensity * 0.2;

      // Red channel offset
      c.fillStyle = 'rgba(255, 0, 0, 0.1)';
      c.drawImage(tempCanvas, -amount * intensity * 0.5, 0);

      // Blue channel offset
      c.fillStyle = 'rgba(0, 0, 255, 0.1)';
      c.drawImage(tempCanvas, amount * intensity * 0.5, 0);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.restore();
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
  }

  /**
   * Draw chromatic aberration effect (RGB split)
   * Uses pixel manipulation to separate RGB channels
   */
  function drawChromaticAberrationEffect(x, y, width, height, intensity, offset) {
    if (!ctx.value) return;

    const c = ctx.value;
    const canvas = c.canvas;
    const pixelOffset = Math.round(offset * intensity);

    if (pixelOffset < 1) return; // No visible effect

    // Get current image data
    const imageData = c.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width2 = canvas.width;
    const height2 = canvas.height;

    // Create output buffer
    const output = new Uint8ClampedArray(data.length);

    // Copy original as base (for green channel and alpha)
    output.set(data);

    for (let y2 = 0; y2 < height2; y2++) {
      for (let x2 = 0; x2 < width2; x2++) {
        const i = (y2 * width2 + x2) * 4;

        // Red channel - offset left
        const redX = Math.min(width2 - 1, Math.max(0, x2 + pixelOffset));
        const redI = (y2 * width2 + redX) * 4;
        output[i] = data[redI]; // Red

        // Green channel stays in place (already copied)

        // Blue channel - offset right
        const blueX = Math.min(width2 - 1, Math.max(0, x2 - pixelOffset));
        const blueI = (y2 * width2 + blueX) * 4;
        output[i + 2] = data[blueI + 2]; // Blue
      }
    }

    // Put the modified image back
    const outputImageData = new ImageData(output, width2, height2);
    c.putImageData(outputImageData, 0, 0);
  }

  /**
   * Draw pixelate effect
   */
  function drawPixelateEffect(intensity, size) {
    if (!ctx.value) return;

    const c = ctx.value;
    const canvas = c.canvas;

    const pixelSize = Math.max(1, Math.floor(size * intensity));

    // Create temp canvas with current content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);

    // Scale down then up for pixelation
    const smallWidth = Math.ceil(canvas.width / pixelSize);
    const smallHeight = Math.ceil(canvas.height / pixelSize);

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = smallWidth;
    smallCanvas.height = smallHeight;
    const smallCtx = smallCanvas.getContext('2d');
    smallCtx.imageSmoothingEnabled = false;
    smallCtx.drawImage(tempCanvas, 0, 0, smallWidth, smallHeight);

    // Draw back scaled up with no smoothing
    c.imageSmoothingEnabled = false;
    c.fillStyle = state.backgroundColor;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(smallCanvas, 0, 0, canvas.width, canvas.height);
    c.imageSmoothingEnabled = true;

    c.restore();
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
  }

  /**
   * Draw outline effect (border around entire canvas content)
   */
  function drawOutlineEffect(x, y, width, height, intensity, lineWidth, color) {
    if (!ctx.value) return;

    const c = ctx.value;

    c.save();
    c.strokeStyle = color;
    c.lineWidth = lineWidth * intensity;
    c.globalAlpha = intensity;
    c.strokeRect(x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth);
    c.restore();
  }

  /**
   * Draw sharpen effect (edge enhancement overlay)
   */
  function drawSharpenEffect(x, y, width, height, intensity) {
    if (!ctx.value) return;

    const c = ctx.value;

    c.save();
    c.globalAlpha = intensity * 0.15;

    // Light edge highlight
    c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    c.lineWidth = 1;
    c.strokeRect(x + 1, y + 1, width - 2, height - 2);

    // Dark edge for contrast
    c.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    c.strokeRect(x, y, width, height);

    c.restore();
  }

  /**
   * Draw emboss effect (3D raised appearance)
   */
  function drawEmbossEffect(x, y, width, height, intensity) {
    if (!ctx.value) return;

    const c = ctx.value;

    c.save();
    c.globalAlpha = intensity * 0.3;

    // Light from top-left
    c.fillStyle = 'rgba(255, 255, 255, 0.4)';
    c.fillRect(x, y, width, 3);
    c.fillRect(x, y, 3, height);

    // Shadow from bottom-right
    c.fillStyle = 'rgba(0, 0, 0, 0.4)';
    c.fillRect(x, y + height - 3, width, 3);
    c.fillRect(x + width - 3, y, 3, height);

    c.restore();
  }

  /**
   * Request an animation frame for rendering
   */
  function requestRender() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Resize canvas to fill container
   */
  function resizeCanvas() {
    const canvas = canvasRef?.value || document.getElementById('drawing-canvas');
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
  }

  /**
   * Set up watchers for reactive rendering
   */
  function setupWatchers() {
    watch(
      () => [
        state.shapes.length,
        state.selectedIndices.length,
        state.zoom,
        state.panX,
        state.panY,
        state.backgroundColor
      ],
      () => {
        requestRender();
      },
      { deep: false }
    );
  }

  /**
   * Clean up on unmount
   */
  function cleanup() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  }

  /**
   * Get the current active zoom transition transform parameters
   * Returns null if no zoom transition is active, or an object with transform info
   * Used by interactions to adjust screen-to-canvas coordinate conversion
   */
  function getActiveZoomTransform() {
    if (!ctx.value || !state.videoMode) return null;

    const currentTime = state.currentTime || 0;
    const canvas = ctx.value.canvas;

    // Find active zoom transitions
    const shapesToSearch = state._allShapesForEffects || state.shapes;
    const activeZoomTransitions = shapesToSearch.filter(shape => {
      if (shape.type !== 'transition') return false;
      const subtype = shape.subtype;
      if (subtype !== 'zoomIn' && subtype !== 'zoomOut' && subtype !== 'crossZoom' && subtype !== 'kenBurns') return false;

      const startTime = shape.startTime || 0;
      const duration = shape.duration || 1;
      return currentTime >= startTime && currentTime < startTime + duration;
    });

    if (activeZoomTransitions.length === 0) return null;

    // Use the first active zoom transition (typically there's only one)
    const transition = activeZoomTransitions[0];
    const progress = getTransitionProgress(transition, currentTime);
    const subtype = transition.subtype;

    let scale = 1;
    let focalX = 0.5, focalY = 0.5;

    // Calculate scale and focal point based on transition type
    if (subtype === 'zoomIn') {
      const startScale = transition.scale ?? 1.0;
      const endScale = (transition.zoomLevel ?? 150) / 100;
      scale = startScale + ((endScale - startScale) * progress);
    } else if (subtype === 'zoomOut') {
      const startScale = (transition.zoomLevel ?? 150) / 100;
      const endScale = transition.scale ?? 1.0;
      scale = startScale - ((startScale - endScale) * progress);
    } else if (subtype === 'crossZoom') {
      const startScale = transition.scale ?? 1.0;
      const endScale = (transition.zoomLevel ?? 150) / 100;
      scale = startScale + ((endScale - startScale) * progress);
    } else if (subtype === 'kenBurns') {
      const startZoom = (transition.startZoom ?? 100) / 100;
      const endZoom = (transition.endZoom ?? 120) / 100;
      scale = startZoom + ((endZoom - startZoom) * progress);

      // Ken Burns has separate start/end focal points
      let startFocalX = 0.5, startFocalY = 0.5;
      let endFocalX = 0.5, endFocalY = 0.5;

      if (transition.startFocalPoint === 'custom') {
        startFocalX = (transition.startFocalX ?? 50) / 100;
        startFocalY = (transition.startFocalY ?? 50) / 100;
      } else {
        const fp = getFocalPointValues(transition.startFocalPoint);
        startFocalX = fp.x;
        startFocalY = fp.y;
      }

      if (transition.endFocalPoint === 'custom') {
        endFocalX = (transition.endFocalX ?? 50) / 100;
        endFocalY = (transition.endFocalY ?? 50) / 100;
      } else {
        const fp = getFocalPointValues(transition.endFocalPoint);
        endFocalX = fp.x;
        endFocalY = fp.y;
      }

      focalX = startFocalX + ((endFocalX - startFocalX) * progress);
      focalY = startFocalY + ((endFocalY - startFocalY) * progress);
    }

    // Get focal point for non-kenBurns transitions
    if (subtype !== 'kenBurns') {
      if (transition.focalPoint === 'custom') {
        focalX = (transition.focalX ?? 50) / 100;
        focalY = (transition.focalY ?? 50) / 100;
      } else {
        const fp = getFocalPointValues(transition.focalPoint);
        focalX = fp.x;
        focalY = fp.y;
      }
    }

    // Calculate crop region (same as in applyTransition)
    const cropW = canvas.width / scale;
    const cropH = canvas.height / scale;
    const cropX = (canvas.width - cropW) * focalX;
    const cropY = (canvas.height - cropH) * focalY;

    return {
      scale,
      focalX,
      focalY,
      cropX,
      cropY,
      cropW,
      cropH,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    };
  }

  /**
   * Helper to get focal point values from preset name
   */
  function getFocalPointValues(focalPoint) {
    switch (focalPoint) {
      case 'top-left': return { x: 0, y: 0 };
      case 'top': case 'top-center': return { x: 0.5, y: 0 };
      case 'top-right': return { x: 1, y: 0 };
      case 'left': case 'middle-left': return { x: 0, y: 0.5 };
      case 'center': return { x: 0.5, y: 0.5 };
      case 'right': case 'middle-right': return { x: 1, y: 0.5 };
      case 'bottom-left': return { x: 0, y: 1 };
      case 'bottom': case 'bottom-center': return { x: 0.5, y: 1 };
      case 'bottom-right': return { x: 1, y: 1 };
      default: return { x: 0.5, y: 0.5 };
    }
  }

  // Expose functions globally for legacy code compatibility
  window.render = render;
  window.resizeCanvas = resizeCanvas;
  window.drawShape = drawShape;
  window.drawSelectionBox = drawSelectionBox;
  window.drawVectorEditOverlay = drawVectorEditOverlay;
  window.getActiveZoomTransform = getActiveZoomTransform;
  window.calculateClipAnimation = calculateClipAnimation;

  /**
   * Render to recording canvas (clean output without UI overlays)
   * Used for dual-canvas recording where user sees selection boxes
   * but the recording output is clean.
   */
  function renderToRecordingCanvas() {
    const recordingCtx = state.recordingCtx;
    const recordingCanvas = state.recordingCanvas;
    const recordingCtxNoWebcam = state.recordingCtxNoWebcam;
    const recordingCanvasNoWebcam = state.recordingCanvasNoWebcam;

    if (!state.isRecording) {
      return;
    }

    // Render to both canvases if they exist
    // Canvas 1: With webcam (for direct export)
    if (recordingCtx && recordingCanvas) {
      renderToTargetCanvas(recordingCtx, recordingCanvas, false);
    }

    // Canvas 2: Without webcam (for Video Mode export)
    if (recordingCtxNoWebcam && recordingCanvasNoWebcam) {
      renderToTargetCanvas(recordingCtxNoWebcam, recordingCanvasNoWebcam, true);
    }
  }

  /**
   * Render shapes to a target canvas
   * @param {CanvasRenderingContext2D} c - Target context
   * @param {HTMLCanvasElement} canvas - Target canvas
   * @param {boolean} excludeWebcam - Whether to exclude webcamCapture shapes
   */
  function renderToTargetCanvas(c, canvas, excludeWebcam = false) {
    // Clear and setup - same as main render
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = state.backgroundColor;
    c.fillRect(0, 0, canvas.width, canvas.height);

    // Apply pan and zoom transform
    c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);

    // Always create fresh Rough.js canvas for the current recording canvas
    // This is necessary because a new recording canvas is created each time recording starts,
    // and the old Rough.js instance would be bound to the previous (garbage-collected) canvas
    if (canvas && typeof window.rough !== 'undefined') {
      try {
        recordingRc.value = window.rough.canvas(canvas);
      } catch (e) {
        // Rough.js not available for this canvas
      }
    }

    // Draw all shapes WITHOUT selection boxes
    state.shapes.forEach((shape, i) => {
      // Skip effect/filter/transition clips
      if (shape.type === 'effect' || shape.type === 'filter' || shape.type === 'transition') {
        return;
      }

      // Skip webcamCapture shapes if excludeWebcam is true (for Video Mode export)
      if (excludeWebcam && shape.type === 'webcamCapture') {
        return;
      }

      // Skip invisible shapes and text being edited
      if (shape.visible !== false && i !== state.textEditingIndex) {
        // Draw shape to recording context with RoughJS support (pass false for isSelected = no selection box)
        drawShapeToContext(c, recordingRc.value, shape, false);
      }
    });

    // Draw in-progress text editing to recording canvas
    // This captures the live typing animation that normally only appears in the HTML overlay
    const textEditor = document.getElementById('text-editor');
    if (textEditor && textEditor.style.display !== 'none') {
      const currentText = textEditor.innerText || '';

      if (state.textEditingIndex >= 0 && state.shapes[state.textEditingIndex]) {
        // Editing existing text - use the shape as base
        const editingShape = state.shapes[state.textEditingIndex];
        const tempShape = {
          ...editingShape,
          text: currentText
        };
        drawShapeToContext(c, recordingRc.value, tempShape, false);
      } else if (currentText) {
        // Creating new text - build temporary shape from editor position/style
        // Parse position from editor style (which is in screen coordinates)
        const editorStyle = textEditor.style;
        const fontSize = parseFloat(editorStyle.fontSize) || 20;

        // Convert screen position back to canvas coordinates
        const screenX = parseFloat(editorStyle.left) || 0;
        const screenY = parseFloat(editorStyle.top) || 0;
        const canvas = document.getElementById('drawing-canvas');
        const canvasRect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
        const displayScale = state.canvasDisplayScale || 1;
        const effectiveZoom = state.zoom * displayScale;

        // Reverse the transform: screenPos = canvasPos * effectiveZoom + panX * displayScale + canvasRect
        const canvasX = (screenX - canvasRect.left - state.panX * displayScale) / effectiveZoom;
        const canvasY = (screenY - canvasRect.top - state.panY * displayScale) / effectiveZoom;

        const tempShape = {
          type: 'text',
          x: canvasX,
          y: canvasY,
          text: currentText,
          color: state.currentColor || '#1e1e1e',
          fontSize: fontSize / (state.zoom * displayScale), // Convert back to canvas size
          fontFamily: editorStyle.fontFamily || 'Sans-serif',
          lineHeight: parseFloat(editorStyle.lineHeight) || 1.3,
          bold: editorStyle.fontWeight === 'bold',
          italic: editorStyle.fontStyle === 'italic',
          underline: editorStyle.textDecoration === 'underline',
          align: editorStyle.textAlign || 'left',
          opacity: state.currentOpacity || 100
        };
        drawShapeToContext(c, recordingRc.value, tempShape, false);
      }
    }

    // NO UI overlays: no selection boxes, snap guides, crop overlays, etc.

    // Draw tool preview if user is actively drawing a shape
    // This captures the drawing animation in the recording
    // Use drawEndX/drawEndY which are the snapped coordinates set by handleDrawingMove
    if (state.isDrawing && state.currentTool !== 'pen' && state.currentTool !== 'eraser') {
      drawToolPreviewToContext(c, recordingRc.value, state.startX, state.startY, state.drawEndX, state.drawEndY);
    }

    // Draw in-progress freehand stroke (pen tool)
    // This is not yet in state.shapes, so we draw it separately using state.currentFreehand
    if (state.currentFreehand && state.currentFreehand.points && state.currentFreehand.points.length > 1) {
      drawFreehandPreviewToContext(c, state.currentFreehand);
    }

    // Draw animated pencil cursor during ANY drawing (shape tools AND pen/eraser)
    // Only on recording canvas, not on main editing canvas
    if (state.isDrawing && state.showDrawingPencil) {
      drawPencilCursor(
        c,
        state.drawEndX,
        state.drawEndY,
        state.drawingPencilStyle,
        state.drawingPencilScale
      );
    }

    // Draw export watermark on recording canvas
    // Save/restore to not affect subsequent rendering
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (typeof window.drawExportWatermark === 'function') {
      window.drawExportWatermark(c, canvas.width, canvas.height);
    }
    c.restore();
  }

  /**
   * Build a temporary shape object for tool preview
   * Uses current tool settings (color, fill, roughness, etc.)
   */
  function buildPreviewShape(tool, x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    const baseShape = {
      color: state.currentColor,
      fillColor: state.currentFill,
      lineWidth: state.currentSize,
      opacity: state.currentOpacity,
      roughness: state.currentRoughness ?? config.tools?.defaultRoughness ?? 1,
      seed: previewSeed, // Use stable seed during drag
      strokeStyle: state.currentStrokeStyle || 'solid',
    };

    switch (tool) {
      case 'rect':
        return { ...baseShape, type: 'rect', x: minX, y: minY, width, height };

      case 'ellipse':
      case 'circle': {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = width / 2;
        const ry = height / 2;
        return { ...baseShape, type: tool, x: cx, y: cy, width: rx * 2, height: ry * 2, radiusX: rx, radiusY: ry };
      }

      case 'diamond': {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        return { ...baseShape, type: 'diamond', x: cx, y: cy, width, height };
      }

      case 'triangle': {
        // Triangle points: top-center, bottom-right, bottom-left
        return {
          ...baseShape,
          type: 'triangle',
          x1: minX + width / 2, y1: minY,  // top center
          x2: minX + width, y2: minY + height,  // bottom right
          x3: minX, y3: minY + height  // bottom left
        };
      }

      case 'line':
        return { ...baseShape, type: 'line', x1, y1, x2, y2 };

      case 'arrow':
        return { ...baseShape, type: 'arrow', x1, y1, x2, y2, arrowHead: 'end' };

      default:
        return null;
    }
  }

  /**
   * Reset preview seed - call on mousedown to get a new sketchy variation
   */
  function resetPreviewSeed() {
    previewSeed = Math.floor(Math.random() * 10000);
  }

  /**
   * Draw tool preview to a specific context with RoughJS support
   * @param {CanvasRenderingContext2D} c - Target context
   * @param {Object} targetRc - Rough.js canvas for this context (or null for precise)
   * @param {number} x1, y1, x2, y2 - Drawing coordinates
   */
  function drawToolPreviewToContext(c, targetRc, x1, y1, x2, y2) {
    if (!c) return;

    const tool = state.currentTool;

    // Frame tool doesn't use RoughJS - handle separately
    if (tool === 'frame') {
      c.save();
      const fx = Math.min(x1, x2), fy = Math.min(y1, y2);
      const fw = Math.abs(x2 - x1), fh = Math.abs(y2 - y1);
      c.strokeStyle = config.theme?.colors?.frameStroke || '#6366f1';
      c.lineWidth = 2;
      c.setLineDash([]);
      c.strokeRect(fx, fy, fw, fh);
      c.restore();
      return;
    }

    // Build temporary shape
    const previewShape = buildPreviewShape(tool, x1, y1, x2, y2);
    if (!previewShape) return;

    // Calculate roughOptions
    const roughness = previewShape.roughness || 1;
    const hasStroke = previewShape.color && previewShape.color !== 'transparent';
    const isSketchy = targetRc && config.tools?.renderMode === 'sketchy' && roughness > 0;

    // Handle stroke style
    let strokeLineDash;
    if (previewShape.strokeStyle === 'dashed') {
      strokeLineDash = [12, 6];
    } else if (previewShape.strokeStyle === 'dotted') {
      strokeLineDash = [3, 6];
    }

    const options = {
      isSketchy,
      roughOptions: {
        seed: previewShape.seed,
        roughness: roughness,
        stroke: hasStroke ? previewShape.color : 'transparent',
        strokeWidth: hasStroke ? previewShape.lineWidth : 0,
        fill: (previewShape.fillColor && previewShape.fillColor !== 'transparent')
          ? previewShape.fillColor : undefined,
        fillStyle: 'solid',
        strokeLineDash: strokeLineDash,
      },
      strokeLineDash,
      hasStroke,
      fillColor: previewShape.fillColor,
      strokeColor: previewShape.color,
      lineWidth: previewShape.lineWidth
    };

    c.save();
    c.globalAlpha = (previewShape.opacity || 100) / 100;

    // Draw using existing shape renderers
    switch (previewShape.type) {
      case 'rect':
        drawRect(c, targetRc, previewShape, options);
        break;
      case 'diamond':
        drawDiamond(c, targetRc, previewShape, options);
        break;
      case 'triangle':
        drawTriangle(c, targetRc, previewShape, options);
        break;
      case 'ellipse':
        drawEllipse(c, targetRc, previewShape, options);
        break;
      case 'circle':
        drawCircle(c, targetRc, previewShape, options);
        break;
      case 'line':
        drawLine(c, targetRc, previewShape, options);
        break;
      case 'arrow':
        drawArrow(c, targetRc, previewShape, options);
        break;
    }

    c.restore();
  }

  /**
   * Draw freehand preview to a specific context (for recording canvas)
   * Draws the in-progress freehand stroke that's not yet committed to state.shapes
   */
  function drawFreehandPreviewToContext(c, freehand) {
    if (!c || !freehand.points || freehand.points.length < 2) return;

    c.save();
    c.strokeStyle = freehand.color || state.currentColor;
    c.lineWidth = freehand.lineWidth || state.currentSize;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalAlpha = (freehand.opacity || state.currentOpacity) / 100;

    c.beginPath();
    c.moveTo(freehand.points[0].x, freehand.points[0].y);
    for (let i = 1; i < freehand.points.length; i++) {
      c.lineTo(freehand.points[i].x, freehand.points[i].y);
    }
    c.stroke();
    c.restore();
  }

  /**
   * Draw a shape to a specific context (for dual-canvas rendering)
   * @param {CanvasRenderingContext2D} targetCtx - Target canvas context
   * @param {Object} targetRc - Rough.js canvas for this context (or null for precise)
   * @param {Object} shape - Shape to draw
   * @param {boolean} isSelected - Whether shape is selected (for selection box)
   */
  function drawShapeToContext(targetCtx, targetRc, shape, isSelected = false) {
    if (!targetCtx) return;

    const c = targetCtx;
    c.save();

    // Get bounds for transformations
    const bounds = getShapeBounds(shape, config, c);

    // Apply rotation if shape has rotation
    if (shape.rotation && bounds) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      c.translate(centerX, centerY);
      c.rotate(shape.rotation);
      c.translate(-centerX, -centerY);
    }

    // Apply flip if shape is flipped
    if ((shape.scaleX === -1 || shape.scaleY === -1) && bounds) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      c.translate(centerX, centerY);
      c.scale(shape.scaleX || 1, shape.scaleY || 1);
      c.translate(-centerX, -centerY);
    }

    // Handle opacity
    const baseOpacity = shape.opacity !== undefined ? shape.opacity / 100 : 1;
    c.globalAlpha = baseOpacity;

    // Calculate rendering options WITH RoughJS support
    const strokeColor = shape.color || '#1e1e1e';
    let fillColor = shape.fillColor;
    if (fillColor === undefined && shape.fill === true) {
      fillColor = shape.color || '#1e1e1e';
    }

    const lineWidth = shape.lineWidth || 2;
    const roughness = shape.roughness ?? config.tools?.defaultRoughness ?? 1;
    const seed = shape.seed || 1;
    const isSketchy = targetRc && config.tools?.renderMode === 'sketchy' && roughness > 0;
    const hasStroke = strokeColor && strokeColor !== 'transparent';

    // Handle stroke style
    const strokeStyle = shape.strokeStyle || 'solid';
    let strokeLineDash;
    if (strokeStyle === 'dashed') {
      strokeLineDash = [12, 6];
    } else if (strokeStyle === 'dotted') {
      strokeLineDash = [3, 6];
    }

    // Rough.js options
    const roughOptions = {
      seed: seed,
      roughness: roughness,
      stroke: hasStroke ? strokeColor : 'transparent',
      strokeWidth: hasStroke ? lineWidth : 0,
      fill: (fillColor && fillColor !== 'transparent') ? fillColor : undefined,
      fillStyle: 'solid',
      strokeLineDash: strokeLineDash,
    };

    const options = {
      isSketchy,
      roughOptions,
      strokeColor: hasStroke ? strokeColor : 'transparent',
      fillColor: fillColor,
      lineWidth: lineWidth,
      strokeLineDash: strokeLineDash,
      isSelected: false, // Never show selection in recording
    };

    // Draw based on shape type - now with RoughJS support
    switch (shape.type) {
      case 'rect':
        drawRect(c, targetRc, shape, options);
        break;
      case 'diamond':
        drawDiamond(c, targetRc, shape, options);
        break;
      case 'triangle':
        drawTriangle(c, targetRc, shape, options);
        break;
      case 'ellipse':
        drawEllipse(c, targetRc, shape, options);
        break;
      case 'circle':
        drawCircle(c, targetRc, shape, options);
        break;
      case 'line':
        drawLine(c, targetRc, shape, options);
        break;
      case 'arrow':
        drawArrow(c, targetRc, shape, options);
        break;
      case 'text':
        drawText(c, shape, options);
        break;
      case 'image':
        drawImage(c, shape, options);
        break;
      case 'video':
        drawVideo(c, shape, options, state);
        break;
      case 'freehand':
        drawFreehand(c, shape, options);
        break;
      case 'path':
        drawPath(c, targetRc, shape, options);
        break;
      case 'frame':
        // drawFrame(ctx, shape, options, drawShapeFn, state, config)
        drawFrame(c, shape, options, (s) => drawShapeToContext(c, targetRc, s, false), state, config);
        break;
      case 'group':
        // drawGroup(ctx, shape, options, drawShapeFn)
        drawGroup(c, shape, options, (s) => drawShapeToContext(c, targetRc, s, false));
        break;
      case 'cursor':
        drawCursor(c, shape, options, state);
        break;
      case 'screenCapture':
        drawScreenCapture(c, shape, options, state);
        break;
      case 'webcamCapture':
        drawWebcamCapture(c, shape, options, state);
        break;
    }

    c.restore();
    c.globalAlpha = 1;
    c.setLineDash([]);

    // NO selection box drawing for recording canvas
  }

  return {
    // Refs
    ctx,
    rc,

    // Methods
    init,
    render,
    renderToRecordingCanvas,
    requestRender,
    resizeCanvas,
    drawShape,
    drawShapeToContext,
    drawSelectionBox,
    drawMultiSelectionBox,
    drawSnapGuides,
    drawCropOverlay,
    drawVectorEditOverlay,
    applyActiveFiltersAndEffects,
    setupWatchers,
    cleanup,
    // RoughJS preview support
    drawToolPreviewToContext,
    resetPreviewSeed
  };
}

// Singleton instance
let rendererInstance = null;

/**
 * Get or create renderer instance
 */
export function getRenderer() {
  if (!rendererInstance) {
    rendererInstance = useRenderer();
  }
  return rendererInstance;
}

export default useRenderer;
