// renderer/shapes/text.js
// Text shape rendering with font support

/**
 * Draw a text shape
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} shape - Shape data
 * @param {Object} config - Editor configuration
 */
export function drawText(ctx, shape, config = {}) {
  const fontSize = shape.fontSize || 16;
  const fontFamily = shape.fontFamily || 'sans-serif';

  let fontStyle = '';
  if (shape.italic) fontStyle += 'italic ';
  if (shape.bold) fontStyle += 'bold ';
  ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;

  ctx.fillStyle = shape.color || '#1e1e1e';
  ctx.textBaseline = 'top';

  if (shape.align === 'center') {
    ctx.textAlign = 'center';
  } else if (shape.align === 'right') {
    ctx.textAlign = 'right';
  } else {
    ctx.textAlign = 'left';
  }

  const lineHeight = fontSize * (shape.lineHeight || config.text?.defaultLineHeight || 1.3);

  // Check if text has a defined width (text box mode)
  if (shape.width && shape.width > 0) {
    // Word wrap text within the bounding box
    const textContent = shape.text || '';

    // First split by newlines to preserve explicit line breaks
    const paragraphs = textContent.split('\n');
    let lines = [];

    for (let p = 0; p < paragraphs.length; p++) {
      const words = paragraphs[p].split(' ');
      let line = '';

      for (let i = 0; i < words.length; i++) {
        const testLine = line + (line ? ' ' : '') + words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > shape.width && line !== '') {
          lines.push(line);
          line = words[i];
        } else {
          line = testLine;
        }
      }
      lines.push(line);
    }

    // Draw each line
    let textX = shape.x;
    if (shape.align === 'center') {
      textX = shape.x + shape.width / 2;
    } else if (shape.align === 'right') {
      textX = shape.x + shape.width;
    }

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], textX, shape.y + i * lineHeight);

      // Draw underline for each line
      if (shape.underline) {
        drawUnderline(ctx, lines[i], textX, shape.y + i * lineHeight, fontSize, shape.align, shape.color);
      }
    }
  } else {
    // Text without defined width - still handle newlines
    const textContent = shape.text || '';
    const lines = textContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], shape.x, shape.y + i * lineHeight);

      // Draw underline for each line
      if (shape.underline) {
        drawUnderline(ctx, lines[i], shape.x, shape.y + i * lineHeight, fontSize, shape.align, shape.color);
      }
    }
  }
}

/**
 * Draw underline for text
 */
function drawUnderline(ctx, text, x, y, fontSize, align, color) {
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  let underlineX = x;

  if (align === 'center') {
    underlineX = x - textWidth / 2;
  } else if (align === 'right') {
    underlineX = x - textWidth;
  }

  const underlineY = y + fontSize + 2;
  ctx.strokeStyle = color || '#1e1e1e';
  ctx.lineWidth = Math.max(1, fontSize / 12);
  ctx.beginPath();
  ctx.moveTo(underlineX, underlineY);
  ctx.lineTo(underlineX + textWidth, underlineY);
  ctx.stroke();
}

export default { drawText };
