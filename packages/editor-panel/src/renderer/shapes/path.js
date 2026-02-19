// renderer/shapes/path.js
// Vector path rendering (SVG-like paths from boolean operations)

/**
 * Convert path segments to SVG path string for Rough.js
 * @param {Array} segments - Path segments array
 * @param {boolean} closed - Whether path is closed
 * @returns {string} SVG path string
 */
function segmentsToSvgPath(segments, closed) {
  if (!segments || segments.length === 0) return '';

  let d = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const point = seg.point;

    if (i === 0) {
      d += `M ${point[0]} ${point[1]} `;
    } else {
      const prevSeg = segments[i - 1];
      const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut[0] !== 0 || prevSeg.handleOut[1] !== 0);
      const hasHandleIn = seg.handleIn && (seg.handleIn[0] !== 0 || seg.handleIn[1] !== 0);

      if (hasHandleOut || hasHandleIn) {
        const cp1x = prevSeg.point[0] + (prevSeg.handleOut ? prevSeg.handleOut[0] : 0);
        const cp1y = prevSeg.point[1] + (prevSeg.handleOut ? prevSeg.handleOut[1] : 0);
        const cp2x = point[0] + (seg.handleIn ? seg.handleIn[0] : 0);
        const cp2y = point[1] + (seg.handleIn ? seg.handleIn[1] : 0);
        d += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${point[0]} ${point[1]} `;
      } else {
        d += `L ${point[0]} ${point[1]} `;
      }
    }
  }

  // Handle closing curve
  if (closed && segments.length > 2) {
    const lastSeg = segments[segments.length - 1];
    const firstSeg = segments[0];
    const hasHandleOut = lastSeg.handleOut && (lastSeg.handleOut[0] !== 0 || lastSeg.handleOut[1] !== 0);
    const hasHandleIn = firstSeg.handleIn && (firstSeg.handleIn[0] !== 0 || firstSeg.handleIn[1] !== 0);

    if (hasHandleOut || hasHandleIn) {
      const cp1x = lastSeg.point[0] + (lastSeg.handleOut ? lastSeg.handleOut[0] : 0);
      const cp1y = lastSeg.point[1] + (lastSeg.handleOut ? lastSeg.handleOut[1] : 0);
      const cp2x = firstSeg.point[0] + (firstSeg.handleIn ? firstSeg.handleIn[0] : 0);
      const cp2y = firstSeg.point[1] + (firstSeg.handleIn ? firstSeg.handleIn[1] : 0);
      d += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstSeg.point[0]} ${firstSeg.point[1]} `;
    }
    d += 'Z';
  }

  return d;
}

/**
 * Draw path segments using canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} segments - Path segments array
 * @param {boolean} closed - Whether path is closed
 */
function drawPathSegments(ctx, segments, closed) {
  if (!segments || segments.length === 0) return;

  ctx.beginPath();

  segments.forEach((seg, i) => {
    const point = seg.point;

    if (i === 0) {
      ctx.moveTo(point[0], point[1]);
    } else {
      const prevSeg = segments[i - 1];

      // Check if we need to draw a curve
      if ((prevSeg.handleOut && (prevSeg.handleOut[0] !== 0 || prevSeg.handleOut[1] !== 0)) ||
          (seg.handleIn && (seg.handleIn[0] !== 0 || seg.handleIn[1] !== 0))) {
        // Bezier curve
        const cp1x = prevSeg.point[0] + (prevSeg.handleOut ? prevSeg.handleOut[0] : 0);
        const cp1y = prevSeg.point[1] + (prevSeg.handleOut ? prevSeg.handleOut[1] : 0);
        const cp2x = point[0] + (seg.handleIn ? seg.handleIn[0] : 0);
        const cp2y = point[1] + (seg.handleIn ? seg.handleIn[1] : 0);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, point[0], point[1]);
      } else {
        // Straight line
        ctx.lineTo(point[0], point[1]);
      }
    }
  });

  // Close path if needed
  if (closed && segments.length > 2) {
    const lastSeg = segments[segments.length - 1];
    const firstSeg = segments[0];

    if ((lastSeg.handleOut && (lastSeg.handleOut[0] !== 0 || lastSeg.handleOut[1] !== 0)) ||
        (firstSeg.handleIn && (firstSeg.handleIn[0] !== 0 || firstSeg.handleIn[1] !== 0))) {
      const cp1x = lastSeg.point[0] + (lastSeg.handleOut ? lastSeg.handleOut[0] : 0);
      const cp1y = lastSeg.point[1] + (lastSeg.handleOut ? lastSeg.handleOut[1] : 0);
      const cp2x = firstSeg.point[0] + (firstSeg.handleIn ? firstSeg.handleIn[0] : 0);
      const cp2y = firstSeg.point[1] + (firstSeg.handleIn ? firstSeg.handleIn[1] : 0);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, firstSeg.point[0], firstSeg.point[1]);
    }
    ctx.closePath();
  }
}

/**
 * Draw a path shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} rc - Rough.js canvas instance (optional)
 * @param {Object} shape - Shape data
 * @param {Object} options - Rendering options
 */
export function drawPath(ctx, rc, shape, options = {}) {
  const { isSketchy, roughOptions, strokeLineDash } = options;
  const strokeColor = shape.color || '#1e1e1e';
  const fillColor = shape.fillColor;
  const lineWidth = shape.lineWidth || 2;
  const hasStroke = strokeColor && strokeColor !== 'transparent';
  const hasFill = fillColor && fillColor !== 'transparent';

  // Check if compound path (has holes) - compound paths don't support Rough.js
  if (shape.isCompound && shape.children) {
    // For compound paths, use canvas rendering with evenodd fill rule
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor || 'transparent';
    ctx.lineWidth = lineWidth;
    if (strokeLineDash) ctx.setLineDash(strokeLineDash);

    ctx.beginPath();
    shape.children.forEach(child => {
      if (child.segments && child.segments.length > 0) {
        const segments = child.segments;

        segments.forEach((seg, i) => {
          const point = seg.point;

          if (i === 0) {
            ctx.moveTo(point[0], point[1]);
          } else {
            const prevSeg = segments[i - 1];

            if ((prevSeg.handleOut && (prevSeg.handleOut[0] !== 0 || prevSeg.handleOut[1] !== 0)) ||
                (seg.handleIn && (seg.handleIn[0] !== 0 || seg.handleIn[1] !== 0))) {
              const cp1x = prevSeg.point[0] + (prevSeg.handleOut ? prevSeg.handleOut[0] : 0);
              const cp1y = prevSeg.point[1] + (prevSeg.handleOut ? prevSeg.handleOut[1] : 0);
              const cp2x = point[0] + (seg.handleIn ? seg.handleIn[0] : 0);
              const cp2y = point[1] + (seg.handleIn ? seg.handleIn[1] : 0);
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, point[0], point[1]);
            } else {
              ctx.lineTo(point[0], point[1]);
            }
          }
        });

        if (child.closed) {
          ctx.closePath();
        }
      }
    });

    if (hasFill) ctx.fill('evenodd');
    if (hasStroke) ctx.stroke();
  } else if (shape.segments && shape.segments.length > 0) {
    // Simple path - can use Rough.js if sketchy mode is enabled
    if (isSketchy && rc) {
      // Use Rough.js for sketchy rendering
      const svgPath = segmentsToSvgPath(shape.segments, shape.closed);
      if (svgPath) {
        rc.path(svgPath, roughOptions);
      }
    } else {
      // Use precise canvas rendering
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor || 'transparent';
      ctx.lineWidth = lineWidth;
      if (strokeLineDash) ctx.setLineDash(strokeLineDash);

      drawPathSegments(ctx, shape.segments, shape.closed);
      if (hasFill) ctx.fill();
      if (hasStroke) ctx.stroke();
    }
  }
}

export default { drawPath };
