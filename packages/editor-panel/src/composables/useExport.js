// editor/composables/useExport.js
// Export functionality composable - Full implementation

import { createApp, h } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getShapeBounds } from '../utils/geometry.js';
import { getVideoState } from './useVideoState.js';
import { getViewportKeyframes } from './useViewportKeyframes.js';
import ExportModal from '../components/export/ExportModal.vue';

/**
 * Get best supported MIME type for video recording (WebM)
 * @returns {string} Best supported MIME type
 */
function getBestMimeType() {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm;codecs=h264',
    'video/webm'
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

/**
 * Check if WebCodecs API is available for MP4 export
 * @returns {boolean} Whether MP4 export is supported
 */
function isMP4ExportSupported() {
  return typeof VideoEncoder !== 'undefined' &&
         typeof VideoEncoder.isConfigSupported === 'function';
}

// mp4-muxer instances (loaded on demand)
let Muxer = null;
let ArrayBufferTarget = null;

/**
 * Convert a blob URL to base64 data URL
 * @param {string} blobUrl - The blob: URL to convert
 * @returns {Promise<string|null>} Base64 data URL or null if conversion fails
 */
async function blobUrlToBase64(blobUrl) {
  if (!blobUrl || !blobUrl.startsWith('blob:')) {
    return blobUrl; // Return as-is if not a blob URL
  }

  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      console.warn('[Export] Failed to fetch blob URL:', blobUrl);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[Export] Error converting blob to base64:', e.message);
    return null;
  }
}

/**
 * Process shapes and convert blob URLs to base64
 * @param {Array} shapes - Array of shapes to process
 * @returns {Promise<Array>} Shapes with blob URLs converted to base64
 */
async function convertShapeBlobsToBase64(shapes) {
  const processedShapes = [];

  for (const shape of shapes) {
    const processedShape = { ...shape };

    // Convert video/image/audio src if it's a blob URL
    if (processedShape.src && processedShape.src.startsWith('blob:')) {
      const base64 = await blobUrlToBase64(processedShape.src);
      if (base64) {
        processedShape.src = base64;
        console.log('[Export] Converted blob to base64 for shape:', processedShape.id, processedShape.type);
      } else {
        // Clear invalid blob URL to prevent errors on import
        console.warn('[Export] Clearing invalid blob URL for shape:', processedShape.id);
        processedShape.src = null;
      }
    }

    // Remove non-serializable properties (they'll be recreated on import)
    delete processedShape.videoElement;
    delete processedShape.audioElement;
    delete processedShape.imageElement;

    // Handle frame children
    if (processedShape.type === 'frame' && processedShape.children) {
      processedShape.children = await convertShapeBlobsToBase64(processedShape.children);
    }

    processedShapes.push(processedShape);
  }

  return processedShapes;
}

/**
 * Load mp4-muxer library from CDN
 * @returns {Promise<{Muxer: Object, ArrayBufferTarget: Object}>} Muxer and ArrayBufferTarget classes
 */
async function loadMP4Muxer() {
  if (Muxer && ArrayBufferTarget) return { Muxer, ArrayBufferTarget };

  const module = await import(
    /* webpackIgnore: true */
    'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm'
  );
  Muxer = module.Muxer;
  ArrayBufferTarget = module.ArrayBufferTarget;
  return { Muxer, ArrayBufferTarget };
}

/**
 * Show export modal with format selection and progress UI
 * Uses Vue ExportModal component mounted programmatically
 * @param {boolean} darkMode - Whether dark mode is enabled
 * @param {boolean} showFormatSelection - Whether to show format selection (default: true)
 * @param {Object} exportConfig - Export configuration from defaults
 * @returns {Object} Modal control object with format selection promise
 */
function showExportModal(darkMode, showFormatSelection = true, exportConfig = {}) {
  // Remove existing modal container if any
  const existing = document.getElementById('export-modal-container');
  if (existing) existing.remove();

  // Create container for Vue app
  const container = document.createElement('div');
  container.id = 'export-modal-container';
  document.body.appendChild(container);

  // Track app and exposed component methods
  let app = null;
  let resolveFormat = null;
  let exposedMethods = null;

  // Format selection promise
  const formatPromise = showFormatSelection ? new Promise((resolve) => {
    resolveFormat = resolve;
  }) : Promise.resolve(null);

  // Cleanup function
  const cleanup = () => {
    if (app) {
      app.unmount();
      app = null;
    }
    if (container.parentNode) {
      container.remove();
    }
  };

  // Create and mount Vue app with ExportModal
  app = createApp({
    setup() {
      // Handle format selection
      const handleSelect = (selection) => {
        if (resolveFormat) {
          resolveFormat(selection);
        }
      };

      // Handle cancel
      const handleCancel = () => {
        window.exportCancelled = true;
        if (resolveFormat) resolveFormat(null);
        cleanup();
      };

      // Handle close (after download or error)
      const handleClose = () => {
        cleanup();
      };

      return () => h(ExportModal, {
        ref: (el) => {
          // Capture exposed methods when component mounts
          if (el) {
            exposedMethods = el;
          }
        },
        darkMode,
        exportConfig,
        mp4Supported: isMP4ExportSupported(),
        showProgressOnly: !showFormatSelection,
        onSelect: handleSelect,
        onCancel: handleCancel,
        onClose: handleClose
      });
    }
  });

  // Mount the app
  app.mount(container);

  return {
    waitForFormat: () => formatPromise,
    updateStatus: (status) => {
      if (exposedMethods?.updateStatus) {
        exposedMethods.updateStatus(status);
      }
    },
    updateProgress: (percent) => {
      if (exposedMethods?.updateProgress) {
        exposedMethods.updateProgress(percent);
      }
    },
    close: () => cleanup(),
    showDownload: (url, filename) => {
      if (exposedMethods?.showDownload) {
        exposedMethods.showDownload(url, filename);
      }
    },
    showError: (message) => {
      if (exposedMethods?.showError) {
        exposedMethods.showError(message);
      }
    }
  };
}

/**
 * Export composable for PNG, SVG, and JSON export/import
 */
export function useExport() {
  const { state, config } = getEditorState();

  /**
   * Draw export watermark to canvas context
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} width - Content area width
   * @param {number} height - Content area height
   * @param {number} offsetX - X offset for content area origin (default: 0)
   * @param {number} offsetY - Y offset for content area origin (default: 0)
   */
  function drawExportWatermark(ctx, width, height, offsetX = 0, offsetY = 0) {
    const watermarkConfig = config.exportWatermark;
    if (!watermarkConfig?.enabled) return;

    const {
      text = 'Made on videodraw.app',
      icon = null,
      iconViewBox = '0 0 24 24',
      iconSize = 14,
      iconGap = 6,
      position = 'bottom-right',
      fontSize = 14,
      fontFamily = 'Inter, system-ui, sans-serif',
      color = 'rgba(255, 255, 255, 0.8)',
      backgroundColor = 'rgba(0, 0, 0, 0.5)',
      padding = { x: 12, y: 6 },
      margin = { x: 16, y: 16 },
      borderRadius = 16,
      opacity = 1.0,
    } = watermarkConfig;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Set font and measure text
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;

    // Calculate content width (icon + gap + text if icon exists)
    const hasIcon = icon && typeof icon === 'string';
    const contentWidth = hasIcon
      ? iconSize + iconGap + textWidth
      : textWidth;

    // Calculate pill dimensions
    const pillWidth = contentWidth + padding.x * 2;
    const pillHeight = Math.max(fontSize, iconSize) + padding.y * 2;

    // Calculate position based on alignment, with offset for content area origin
    let x, y;
    switch (position) {
      case 'top-left':
        x = offsetX + margin.x;
        y = offsetY + margin.y;
        break;
      case 'top-right':
        x = offsetX + width - pillWidth - margin.x;
        y = offsetY + margin.y;
        break;
      case 'bottom-left':
        x = offsetX + margin.x;
        y = offsetY + height - pillHeight - margin.y;
        break;
      case 'bottom-right':
      default:
        x = offsetX + width - pillWidth - margin.x;
        y = offsetY + height - pillHeight - margin.y;
    }

    // Draw background pill
    ctx.fillStyle = backgroundColor;
    ctx.beginPath();
    ctx.roundRect(x, y, pillWidth, pillHeight, borderRadius);
    ctx.fill();

    // Current X position for content
    let contentX = x + padding.x;
    const centerY = y + pillHeight / 2;

    // Draw icon if provided
    if (hasIcon) {
      // Parse viewBox to get original dimensions
      const vbParts = iconViewBox.split(' ').map(Number);
      const vbWidth = vbParts[2] || 24;
      const vbHeight = vbParts[3] || 24;
      const scale = iconSize / Math.max(vbWidth, vbHeight);

      ctx.save();
      ctx.translate(contentX, centerY - iconSize / 2);
      ctx.scale(scale, scale);

      // Create path from SVG path data and fill
      const path = new Path2D(icon);
      ctx.fillStyle = color;
      ctx.fill(path);
      ctx.restore();

      contentX += iconSize + iconGap;
    }

    // Draw text
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, contentX, centerY);

    ctx.restore();
  }

  /**
   * Generate SVG watermark element string
   * @param {number} width - SVG width
   * @param {number} height - SVG height
   * @param {number} offsetX - ViewBox X offset (default: 0)
   * @param {number} offsetY - ViewBox Y offset (default: 0)
   * @returns {string} SVG element string
   */
  function getSvgWatermark(width, height, offsetX = 0, offsetY = 0) {
    const watermarkConfig = config.exportWatermark;
    if (!watermarkConfig?.enabled) return '';

    const {
      text = 'Made on videodraw.app',
      icon = null,
      iconViewBox = '0 0 24 24',
      iconSize = 14,
      iconGap = 6,
      position = 'bottom-right',
      fontSize = 14,
      fontFamily = 'Inter, system-ui, sans-serif',
      color = 'rgba(255, 255, 255, 0.8)',
      backgroundColor = 'rgba(0, 0, 0, 0.5)',
      padding = { x: 12, y: 6 },
      margin = { x: 16, y: 16 },
      borderRadius = 16,
      opacity = 1.0,
    } = watermarkConfig;

    // Check if icon is provided
    const hasIcon = icon && typeof icon === 'string';

    // Estimate text width (approximate)
    const textWidth = text.length * fontSize * 0.6;
    const contentWidth = hasIcon
      ? iconSize + iconGap + textWidth
      : textWidth;

    const pillWidth = contentWidth + padding.x * 2;
    const pillHeight = Math.max(fontSize, iconSize) + padding.y * 2;

    // Calculate position (offset is the viewBox origin)
    let x, y;
    switch (position) {
      case 'top-left':
        x = offsetX + margin.x;
        y = offsetY + margin.y;
        break;
      case 'top-right':
        x = offsetX + width - pillWidth - margin.x;
        y = offsetY + margin.y;
        break;
      case 'bottom-left':
        x = offsetX + margin.x;
        y = offsetY + height - pillHeight - margin.y;
        break;
      default: // bottom-right
        x = offsetX + width - pillWidth - margin.x;
        y = offsetY + height - pillHeight - margin.y;
    }

    // Build icon SVG if provided
    let iconSvg = '';
    if (hasIcon) {
      const iconX = x + padding.x;
      const iconY = y + (pillHeight - iconSize) / 2;
      iconSvg = `
    <svg x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" viewBox="${iconViewBox}">
      <g fill="${color}">${icon}</g>
    </svg>`;
    }

    // Calculate text position (after icon if present)
    const textX = x + padding.x + (hasIcon ? iconSize + iconGap : 0);
    const textY = y + pillHeight / 2 + fontSize * 0.35;

    return `
  <g opacity="${opacity}">
    <rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}"
          rx="${borderRadius}" fill="${backgroundColor}"/>
    ${iconSvg}
    <text x="${textX}" y="${textY}"
          font-size="${fontSize}" font-family="${fontFamily}" fill="${color}">${text}</text>
  </g>`;
  }

  /**
   * Export canvas as PNG
   */
  async function exportAsPng(options = {}) {
    try {
      const canvas = document.getElementById('drawing-canvas');
      if (!canvas) return;

      // Create offscreen canvas for export
      const exportCanvas = document.createElement('canvas');
      const scale = options.scale || config.export?.defaultScale || 2;

      // Calculate bounds of all shapes
      const bounds = getContentBounds();
      if (!bounds) return;

      const padding = options.padding ?? config.export?.padding ?? 0;
      exportCanvas.width = (bounds.width + padding * 2) * scale;
      exportCanvas.height = (bounds.height + padding * 2) * scale;

      const ctx = exportCanvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.translate(-bounds.x + padding, -bounds.y + padding);

      // Fill background
      if (options.transparent !== true) {
        ctx.fillStyle = state.backgroundColor;
        ctx.fillRect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2);
      }

      // Draw shapes (use legacy renderer if available)
      if (typeof window.renderShapesToContext === 'function') {
        window.renderShapesToContext(ctx, state.shapes);
      }

      // Draw watermark in content coordinate space (same transform as shapes)
      // The translate offset positions content at (bounds.x - padding, bounds.y - padding)
      // So we pass the content area dimensions and let the watermark position itself
      drawExportWatermark(ctx, bounds.width + padding * 2, bounds.height + padding * 2, bounds.x - padding, bounds.y - padding);

      // Download
      const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
      downloadBlob(blob, options.filename || 'canvas.png');

    } catch (error) {
      console.error('Failed to export as PNG:', error);
    }
  }

  /**
   * Export canvas as SVG
   */
  function exportAsSvg(options = {}) {
    try {
      const bounds = getContentBoundsWithStroke();
      if (!bounds) return;

      const padding = options.padding ?? config.export?.padding ?? 0;
      const width = bounds.width + padding * 2;
      const height = bounds.height + padding * 2;

      // Create rough.js SVG generator if available (for sketchy shapes)
      let roughSvg = null;
      try {
        if (typeof rough !== 'undefined') {
          // Create a temporary SVG element for rough.js
          const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          roughSvg = rough.svg(tempSvg);
        }
      } catch (e) {
        console.warn('Failed to initialize rough.js for SVG export:', e);
      }

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.x - padding} ${bounds.y - padding} ${width} ${height}">\n`;

      // Add defs for arrow markers
      svg += `<defs>\n`;
      svg += `  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">\n`;
      svg += `    <polygon points="0 0, 10 3.5, 0 7" fill="currentColor"/>\n`;
      svg += `  </marker>\n`;
      svg += `  <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">\n`;
      svg += `    <polygon points="10 0, 0 3.5, 10 7" fill="currentColor"/>\n`;
      svg += `  </marker>\n`;
      svg += `</defs>\n`;

      // Background
      if (options.transparent !== true) {
        svg += `<rect x="${bounds.x - padding}" y="${bounds.y - padding}" width="${width}" height="${height}" fill="${state.backgroundColor}"/>\n`;
      }

      // Shapes
      state.shapes.forEach(shape => {
        if (shape.visible !== false) {
          svg += shapeToSvg(shape, roughSvg);
        }
      });

      // Add watermark (use viewBox coordinates)
      svg += getSvgWatermark(width, height, bounds.x - padding, bounds.y - padding);

      svg += '</svg>';

      // Download
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      downloadBlob(blob, options.filename || 'canvas.svg');

      return svg;
    } catch (error) {
      console.error('Failed to export as SVG:', error);
    }
  }

  /**
   * Export project as JSON
   * Converts blob URLs to base64 for portability
   */
  async function exportAsJson(options = {}) {
    try {
      // Get canvas dimensions from state or DOM
      const canvas = document.getElementById('drawing-canvas');
      const width = state.canvasWidth || canvas?.width || config.canvas?.width || 1920;
      const height = state.canvasHeight || canvas?.height || config.canvas?.height || 1080;

      // Convert blob URLs to base64 for portable JSON export
      console.log('[Export] Converting blob URLs to base64...');
      const processedShapes = await convertShapeBlobsToBase64(state.shapes);
      console.log('[Export] Conversion complete, processed', processedShapes.length, 'shapes');

      const data = {
        version: '1.0',
        width: width,
        height: height,
        backgroundColor: state.backgroundColor,
        shapes: processedShapes,
        // Video mode specific
        ...(config.video?.enabled && {
          duration: state.duration,
          currentTime: state.currentTime,
          tracks: state.tracks,
          currentPreset: state.currentPreset,
          projectDuration: state.projectDuration
        })
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      downloadBlob(blob, options.filename || 'project.json');

      return json;
    } catch (error) {
      console.error('Failed to export as JSON:', error);
    }
  }

  /**
   * Import project from JSON (alias: loadProject)
   * Handles both JSON string and parsed object
   */
  function importFromJson(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

      // Restore background color
      if (data.backgroundColor) {
        state.backgroundColor = data.backgroundColor;
      }

      // Restore canvas size if provided
      if (data.width && data.height) {
        // Store dimensions in state for reference/export
        state.canvasWidth = data.width;
        state.canvasHeight = data.height;

        // Only apply to DOM canvas in video mode (fixed export frame)
        // In canvas mode, the canvas is "infinite" so fixed dimensions don't apply
        if (state.videoMode) {
          const canvas = document.getElementById('drawing-canvas');
          if (canvas) {
            canvas.width = data.width;
            canvas.height = data.height;

            // Update CONFIG if it exists
            if (window.CONFIG) {
              window.CONFIG.canvas = window.CONFIG.canvas || {};
              window.CONFIG.canvas.width = data.width;
              window.CONFIG.canvas.height = data.height;
            }
          }

          // Restore preset name if provided
          if (data.currentPreset) {
            state.currentPreset = data.currentPreset;
          } else {
            // Try to match dimensions to a known preset
            const presets = window.CONFIG?.screenPresets || {
              '1080p': { width: 1920, height: 1080 },
              '720p': { width: 1280, height: 720 },
              '4K': { width: 3840, height: 2160 },
              'Square': { width: 1080, height: 1080 },
              'Portrait': { width: 1080, height: 1920 },
              'Story': { width: 1080, height: 1920 },
            };
            let matchedPreset = 'Custom';
            for (const [name, preset] of Object.entries(presets)) {
              if (preset.width === data.width && preset.height === data.height) {
                matchedPreset = name;
                break;
              }
            }
            state.currentPreset = matchedPreset;
          }

          // Resize canvas to fit viewport after setting dimensions
          if (typeof window.resizeCanvasToFit === 'function') {
            setTimeout(() => window.resizeCanvasToFit(), 50);
          }
        }
      }

      // Check if we're importing canvas-mode data into video mode
      // Canvas mode data won't have tracks or shapes with startTime/trackId
      const isCanvasModeData = !data.tracks && data.shapes?.some(s => s.startTime === undefined);
      const needsVideoNormalization = state.videoMode && isCanvasModeData;

      // Get video state for track assignment if needed
      const videoState = needsVideoNormalization ? getVideoState() : null;

      // Restore video mode specific state first (before shapes, so tracks exist)
      if (data.duration !== undefined) {
        state.duration = data.duration;
      }
      // Use explicit projectDuration if available, otherwise fall back to duration
      if (data.projectDuration !== undefined) {
        state.projectDuration = data.projectDuration;
      } else if (data.duration !== undefined) {
        state.projectDuration = data.duration;
      }
      if (data.tracks) {
        state.tracks = data.tracks;
      } else if (needsVideoNormalization) {
        // Initialize default tracks for canvas-mode imports
        state.tracks = [
          { id: 'track-1', name: 'Track 1', type: 'video' },
          { id: 'track-2', name: 'Track 2', type: 'video' },
          { id: 'audio-1', name: 'Audio 1', type: 'audio' },
        ];
      } else if (state.videoMode && !data.tracks) {
        // Video mode JSON without tracks (backwards compatibility)
        // Build tracks from shape trackIds, plus ensure enough tracks for auto-assignment
        const trackIds = new Set();
        let shapesWithoutTrack = 0;
        data.shapes?.forEach(s => {
          if (s.trackId) {
            trackIds.add(s.trackId);
          } else if (s.startTime !== undefined) {
            shapesWithoutTrack++;
          }
        });

        // Create tracks from explicit trackIds
        const tracks = Array.from(trackIds).sort().map(id => ({
          id,
          name: id.replace('track-', 'Track ').replace('audio-', 'Audio '),
          type: id.includes('audio') ? 'audio' : 'video'
        }));

        // Ensure at least 2 video tracks for auto-assignment of shapes without trackId
        const videoTrackCount = tracks.filter(t => t.type === 'video').length;
        const neededVideoTracks = Math.max(2, Math.min(shapesWithoutTrack + videoTrackCount, 5));
        let trackNum = 1;
        while (tracks.filter(t => t.type === 'video').length < neededVideoTracks) {
          const trackId = `track-${trackNum}`;
          if (!trackIds.has(trackId)) {
            tracks.push({ id: trackId, name: `Track ${trackNum}`, type: 'video' });
          }
          trackNum++;
        }

        // Ensure at least one audio track
        if (!tracks.some(t => t.type === 'audio')) {
          tracks.push({ id: 'audio-1', name: 'Audio 1', type: 'audio' });
        }

        // Sort tracks: video tracks first (sorted), then audio tracks
        state.tracks = tracks.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
          return a.id.localeCompare(b.id, undefined, { numeric: true });
        });
      }

      // Restore shapes with proper initialization
      if (data.shapes) {
        // Track current time offset for staggering shapes on timeline
        let currentTimeOffset = 0;

        state.shapes = data.shapes.map((s) => {
          const shape = {
            ...s,
            id: s.id || generateShapeId(),
            visible: s.visible !== false,
            name: s.name || getShapeName(s)
          };

          // Normalize for video mode if importing canvas-mode data
          if (needsVideoNormalization && shape.startTime === undefined) {
            // Determine default duration based on shape type
            let defaultDuration = 5; // Default for most shapes
            if (shape.type === 'video') {
              defaultDuration = Math.min(shape.videoDuration || 5, 30);
            } else if (shape.type === 'audio') {
              defaultDuration = shape.audioDuration || 5;
            }

            // Determine track type
            const trackType = shape.type === 'audio' ? 'audio' : 'video';

            // Find available track at current offset
            const trackId = videoState.findAvailableTrack(currentTimeOffset, defaultDuration, trackType);

            // Assign video mode properties
            shape.startTime = currentTimeOffset;
            shape.duration = defaultDuration;
            shape.trackId = trackId;

            // For media types, ensure playback properties exist
            if (shape.type === 'video' || shape.type === 'audio') {
              shape.volume = shape.volume ?? 100;
              shape.muted = shape.muted ?? false;
              shape.playbackRate = shape.playbackRate ?? 1;
              shape.fadeIn = shape.fadeIn ?? 0;
              shape.fadeOut = shape.fadeOut ?? 0;
            }

            // Stagger non-audio shapes so they don't all start at 0
            // Audio shapes can overlap, but visual elements should be sequential by default
            if (trackType === 'video') {
              currentTimeOffset += defaultDuration;
            }
          }

          // Load image elements
          if (shape.type === 'image' && shape.src) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              shape.imageElement = img;
              if (typeof window.render === 'function') {
                window.render();
              }
            };
            img.src = shape.src;
          }

          // Load video elements
          if (shape.type === 'video' && shape.src) {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.playsInline = true;
            video.onloadedmetadata = () => {
              shape.videoElement = video;
              // Update duration if we didn't have it before
              if (!shape.videoDuration) {
                shape.videoDuration = video.duration;
                if (needsVideoNormalization && shape.duration === 5) {
                  shape.duration = Math.min(video.duration, 30);
                }
              }
              if (typeof window.registerMediaElement === 'function') {
                window.registerMediaElement(shape.id, video);
              }
              if (typeof window.render === 'function') {
                window.render();
              }
              // Update timeline after media loads
              if (state.videoMode && typeof window.updateTimelineItems === 'function') {
                window.updateTimelineItems();
              }
            };
            video.src = shape.src;
          }

          // Load audio elements
          if (shape.type === 'audio' && shape.src) {
            const audio = document.createElement('audio');
            audio.crossOrigin = 'anonymous';
            audio.preload = 'auto';
            audio.onloadedmetadata = () => {
              shape.audioElement = audio;
              // Update duration if we didn't have it before
              if (!shape.audioDuration) {
                shape.audioDuration = audio.duration;
                if (needsVideoNormalization && shape.duration === 5) {
                  shape.duration = audio.duration;
                }
              }
              if (typeof window.registerMediaElement === 'function') {
                window.registerMediaElement(shape.id, audio);
              }
              // Update timeline after media loads
              if (state.videoMode && typeof window.updateTimelineItems === 'function') {
                window.updateTimelineItems();
              }
            };
            audio.src = shape.src;
          }

          // Handle frame children
          if (shape.type === 'frame' && shape.children) {
            shape.children = shape.children.map(child => {
              if (child.type === 'image' && child.src) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  child.imageElement = img;
                  if (typeof window.render === 'function') {
                    window.render();
                  }
                };
                img.src = child.src;
              }
              return child;
            });
          }

          return shape;
        });

        // Update project duration if we added shapes beyond current duration
        if (needsVideoNormalization && currentTimeOffset > (state.projectDuration || 60)) {
          state.projectDuration = currentTimeOffset + 5; // Add a little buffer
        }
      }

      // Clear selection
      state.selectedIndices = [];
      state.selectedFrameChildren = [];

      // Re-render
      if (typeof window.render === 'function') {
        window.render();
      }
      if (typeof window.renderLayersList === 'function') {
        window.renderLayersList();
      }

      // Update timeline if in video mode
      if (state.videoMode) {
        // Update timeline groups in case new tracks were created
        if (typeof window.updateTimelineGroups === 'function') {
          window.updateTimelineGroups();
        }
        if (typeof window.updateTimelineItems === 'function') {
          window.updateTimelineItems();
        }
        // Update timeline range if duration changed
        if (typeof window.updateTimelineRange === 'function') {
          window.updateTimelineRange();
        }
        // Re-position playhead after track labels update (labels may have changed width)
        // Use setTimeout to allow timeline to re-render first
        setTimeout(() => {
          if (typeof window.updatePlayheadPosition === 'function') {
            window.updatePlayheadPosition();
          }
        }, 100);
      }

      // Save state for undo
      if (typeof window.saveState === 'function') {
        window.saveState();
      }

      return true;
    } catch (error) {
      console.error('Failed to import JSON:', error);
      return false;
    }
  }

  /**
   * Helper to generate shape IDs
   */
  function generateShapeId() {
    return 'shape-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Helper to get shape name based on type
   */
  function getShapeName(shape) {
    const typeNames = {
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      diamond: 'Diamond',
      triangle: 'Triangle',
      line: 'Line',
      arrow: 'Arrow',
      text: 'Text',
      image: 'Image',
      video: 'Video',
      audio: 'Audio',
      freehand: 'Freehand',
      path: 'Path',
      frame: 'Frame',
      group: 'Group'
    };
    return typeNames[shape.type] || 'Shape';
  }

  /**
   * Trigger file import dialog
   */
  function triggerImport() {
    const input = document.getElementById('import-file-input');
    if (input) {
      input.click();
    }
  }

  /**
   * Render a single frame to an offscreen canvas context
   * @param {CanvasRenderingContext2D} ctx - Target context
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  async function renderFrameToCanvas(ctx, width, height) {
    // Clear canvas with background color
    ctx.fillStyle = config.canvas?.backgroundColor || state.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Get shapes visible at current time, sorted by z-index
    const visibleShapes = state.shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => {
        if (shape.visible === false) return false;
        // Audio shapes don't render visually
        if (shape.type === 'audio') return false;
        // Check time-based visibility for video mode
        if (shape.startTime !== undefined) {
          const start = shape.startTime;
          const end = start + (shape.duration || 5);
          return state.currentTime >= start && state.currentTime < end;
        }
        return true;
      })
      .sort((a, b) => a.index - b.index);

    // Render each shape
    for (const { shape } of visibleShapes) {
      await renderShapeForExport(ctx, shape);
    }

    // Draw watermark on top of all shapes
    drawExportWatermark(ctx, width, height);
  }

  /**
   * Draw rounded rect path with individual corner radii
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} w - Width
   * @param {number} h - Height
   * @param {Object} radii - Corner radii { tl, tr, br, bl }
   */
  function drawRoundedRectPath(ctx, x, y, w, h, radii) {
    ctx.moveTo(x + radii.tl, y);
    ctx.lineTo(x + w - radii.tr, y);
    if (radii.tr > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
    ctx.lineTo(x + w, y + h - radii.br);
    if (radii.br > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
    ctx.lineTo(x + radii.bl, y + h);
    if (radii.bl > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
    ctx.lineTo(x, y + radii.tl);
    if (radii.tl > 0) ctx.quadraticCurveTo(x, y, x + radii.tl, y);
    ctx.closePath();
  }

  /**
   * Render a shape to context for export
   * @param {CanvasRenderingContext2D} ctx - Target context
   * @param {Object} shape - Shape to render
   */
  async function renderShapeForExport(ctx, shape) {
    ctx.save();

    // Apply opacity
    ctx.globalAlpha = shape.opacity !== undefined ? shape.opacity / 100 : 1;

    // Apply rotation
    if (shape.rotation) {
      const bounds = getShapeBoundsForExport(shape);
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(shape.rotation);
      ctx.translate(-cx, -cy);
    }

    // Apply flip (scaleX/scaleY)
    if (shape.scaleX === -1 || shape.scaleY === -1) {
      const bounds = getShapeBoundsForExport(shape);
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(shape.scaleX || 1, shape.scaleY || 1);
      ctx.translate(-cx, -cy);
    }

    // Apply 3D tilt transforms
    if (shape.tiltX || shape.tiltY) {
      const bounds = getShapeBoundsForExport(shape);
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const tiltX = shape.tiltX || 0;
      const tiltY = shape.tiltY || 0;
      const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
      const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
      const skewX = Math.sin(tiltX) * 0.5;
      const skewY = Math.sin(tiltY) * 0.5;

      ctx.translate(cx, cy);
      if (skewX !== 0 || skewY !== 0) {
        ctx.transform(1, skewY, skewX, 1, 0, 0);
      }
      ctx.scale(scaleFromTiltY, scaleFromTiltX);
      ctx.translate(-cx, -cy);
    }

    const stroke = shape.color || '#1e1e1e';
    const fill = shape.fillColor || 'transparent';
    const lineWidth = shape.lineWidth || shape.strokeWidth || 2;

    // Apply stroke style
    if (shape.strokeStyle === 'dashed') {
      ctx.setLineDash([12, 6]);
    } else if (shape.strokeStyle === 'dotted') {
      ctx.setLineDash([3, 6]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shape.type) {
      case 'rect': {
        const w = shape.width || 100;
        const h = shape.height || 100;
        const maxRadius = Math.min(w / 2, h / 2);

        ctx.beginPath();
        if (shape.cornerRadii) {
          // Individual corner radii
          const radii = {
            tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
            tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
            br: Math.min(shape.cornerRadii.br || 0, maxRadius),
            bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
          };
          drawRoundedRectPath(ctx, shape.x, shape.y, w, h, radii);
        } else if (shape.cornerRadius && ctx.roundRect) {
          const r = Math.min(shape.cornerRadius, maxRadius);
          ctx.roundRect(shape.x, shape.y, w, h, r);
        } else {
          ctx.rect(shape.x, shape.y, w, h);
        }
        if (fill && fill !== 'transparent') ctx.fill();
        if (stroke && stroke !== 'transparent') ctx.stroke();
        break;
      }

      case 'ellipse': {
        const rx = shape.radiusX || shape.width / 2 || 50;
        const ry = shape.radiusY || shape.height / 2 || 50;
        const cx = shape.x + (shape.width ? shape.width / 2 : 0);
        const cy = shape.y + (shape.height ? shape.height / 2 : 0);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fill && fill !== 'transparent') ctx.fill();
        if (stroke && stroke !== 'transparent') ctx.stroke();
        break;
      }

      case 'diamond': {
        // Diamond uses x,y as CENTER point (consistent with SVG export and bounds calculation)
        const w = shape.width || 60;
        const h = shape.height || 60;
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y - h / 2);       // Top
        ctx.lineTo(shape.x + w / 2, shape.y);       // Right
        ctx.lineTo(shape.x, shape.y + h / 2);       // Bottom
        ctx.lineTo(shape.x - w / 2, shape.y);       // Left
        ctx.closePath();
        if (fill && fill !== 'transparent') ctx.fill();
        if (stroke && stroke !== 'transparent') ctx.stroke();
        break;
      }

      case 'triangle': {
        ctx.beginPath();
        if (shape.x1 !== undefined) {
          ctx.moveTo(shape.x1, shape.y1);
          ctx.lineTo(shape.x2, shape.y2);
          ctx.lineTo(shape.x3, shape.y3);
        } else {
          const w = shape.width || 60;
          const h = shape.height || 60;
          ctx.moveTo(shape.x + w / 2, shape.y);
          ctx.lineTo(shape.x + w, shape.y + h);
          ctx.lineTo(shape.x, shape.y + h);
        }
        ctx.closePath();
        if (fill && fill !== 'transparent') ctx.fill();
        if (stroke && stroke !== 'transparent') ctx.stroke();
        break;
      }

      case 'line':
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(shape.x1, shape.y1);
        if (shape.controlPoint) {
          ctx.quadraticCurveTo(shape.controlPoint.x, shape.controlPoint.y, shape.x2, shape.y2);
        } else if (shape.controlPoint1 && shape.controlPoint2) {
          ctx.bezierCurveTo(
            shape.controlPoint1.x, shape.controlPoint1.y,
            shape.controlPoint2.x, shape.controlPoint2.y,
            shape.x2, shape.y2
          );
        } else {
          ctx.lineTo(shape.x2, shape.y2);
        }
        ctx.stroke();

        // Draw arrowhead for arrow type
        if (shape.type === 'arrow') {
          const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
          const headLen = Math.max(10, lineWidth * 4);

          ctx.save();
          ctx.translate(shape.x2, shape.y2);
          ctx.rotate(angle);
          ctx.fillStyle = stroke;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-headLen, -headLen * 0.5);
          ctx.lineTo(-headLen, headLen * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Double arrow
          if (shape.arrowType === 'double') {
            ctx.save();
            ctx.translate(shape.x1, shape.y1);
            ctx.rotate(angle + Math.PI);
            ctx.fillStyle = stroke;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-headLen, -headLen * 0.5);
            ctx.lineTo(-headLen, headLen * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        break;

      case 'text': {
        let fontStr = '';
        if (shape.italic) fontStr += 'italic ';
        if (shape.bold) fontStr += 'bold ';
        fontStr += (shape.fontSize || 20) + 'px ';
        fontStr += shape.fontFamily || 'Inter, sans-serif';

        ctx.font = fontStr;
        ctx.fillStyle = stroke;
        ctx.textBaseline = 'top';
        ctx.textAlign = shape.align || 'left';

        const lines = (shape.text || 'Text').split('\n');
        const lineHeight = (shape.fontSize || 20) * 1.2;
        const textX = shape.align === 'center' ? shape.x + (shape.width || 0) / 2 :
                      shape.align === 'right' ? shape.x + (shape.width || 0) : shape.x;

        lines.forEach((line, i) => {
          ctx.fillText(line, textX, shape.y + i * lineHeight);

          if (shape.underline) {
            const metrics = ctx.measureText(line);
            ctx.beginPath();
            ctx.moveTo(textX, shape.y + i * lineHeight + (shape.fontSize || 20));
            ctx.lineTo(textX + metrics.width, shape.y + i * lineHeight + (shape.fontSize || 20));
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
        break;
      }

      case 'image': {
        if (shape.imageElement && shape.imageElement.complete) {
          const imgW = shape.width || 100;
          const imgH = shape.height || 100;
          const hasCornerRadius = shape.cornerRadius || shape.cornerRadii;

          if (hasCornerRadius) {
            // Clip to rounded rect for border radius
            ctx.save();
            ctx.beginPath();
            const maxRadius = Math.min(imgW / 2, imgH / 2);
            if (shape.cornerRadii) {
              const radii = {
                tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
                tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
                br: Math.min(shape.cornerRadii.br || 0, maxRadius),
                bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
              };
              drawRoundedRectPath(ctx, shape.x, shape.y, imgW, imgH, radii);
            } else if (ctx.roundRect) {
              const r = Math.min(shape.cornerRadius, maxRadius);
              ctx.roundRect(shape.x, shape.y, imgW, imgH, r);
            }
            ctx.clip();
            ctx.drawImage(shape.imageElement, shape.x, shape.y, imgW, imgH);
            ctx.restore();
          } else {
            ctx.drawImage(shape.imageElement, shape.x, shape.y, imgW, imgH);
          }
        }
        break;
      }

      case 'video': {
        let video = shape.videoElement;
        if (!video && shape.id && typeof window.getMediaElement === 'function') {
          video = window.getMediaElement(shape.id);
        }

        if (video && video.readyState >= 2) {
          // Calculate video time based on clip position
          const clipStart = shape.startTime || 0;
          const mediaOffset = shape.mediaStartOffset || 0;
          const videoTime = (state.currentTime - clipStart) + mediaOffset;

          // Seek video to correct time if needed
          if (Math.abs(video.currentTime - videoTime) > 0.05) {
            video.currentTime = Math.max(0, Math.min(videoTime, video.duration));
            // Wait for seek to complete
            await new Promise(resolve => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              // Timeout fallback
              setTimeout(resolve, 100);
            });
          }

          const vidW = shape.width || 100;
          const vidH = shape.height || 100;
          const hasCornerRadius = shape.cornerRadius || shape.cornerRadii;

          if (hasCornerRadius) {
            // Clip to rounded rect for border radius
            ctx.save();
            ctx.beginPath();
            const maxRadius = Math.min(vidW / 2, vidH / 2);
            if (shape.cornerRadii) {
              const radii = {
                tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
                tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
                br: Math.min(shape.cornerRadii.br || 0, maxRadius),
                bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
              };
              drawRoundedRectPath(ctx, shape.x, shape.y, vidW, vidH, radii);
            } else if (ctx.roundRect) {
              const r = Math.min(shape.cornerRadius, maxRadius);
              ctx.roundRect(shape.x, shape.y, vidW, vidH, r);
            }
            ctx.clip();
            ctx.drawImage(video, shape.x, shape.y, vidW, vidH);
            ctx.restore();
          } else {
            ctx.drawImage(video, shape.x, shape.y, vidW, vidH);
          }
        }
        break;
      }

      case 'freehand':
      case 'pen':
        if (shape.points && shape.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
          }
          ctx.stroke();
        }
        break;

      case 'frame':
        // Draw frame background
        if (fill && fill !== 'transparent') {
          ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        }
        // Draw children
        if (shape.children) {
          ctx.save();
          if (shape.clipContent) {
            ctx.beginPath();
            ctx.rect(shape.x, shape.y, shape.width, shape.height);
            ctx.clip();
          }
          for (const child of shape.children) {
            if (child.visible !== false) {
              await renderShapeForExport(ctx, child);
            }
          }
          ctx.restore();
        }
        // Draw frame border
        if (stroke && stroke !== 'transparent') {
          ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        }
        break;

      case 'group':
        if (shape.children) {
          for (const child of shape.children) {
            if (child.visible !== false) {
              await renderShapeForExport(ctx, child);
            }
          }
        }
        break;

      case 'path':
        if (shape.segments && shape.segments.length > 0) {
          ctx.beginPath();
          const segments = shape.segments;
          ctx.moveTo(segments[0].point[0], segments[0].point[1]);

          for (let i = 1; i < segments.length; i++) {
            const seg = segments[i];
            const prevSeg = segments[i - 1];

            const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut[0] !== 0 || prevSeg.handleOut[1] !== 0);
            const hasHandleIn = seg.handleIn && (seg.handleIn[0] !== 0 || seg.handleIn[1] !== 0);

            if (hasHandleOut || hasHandleIn) {
              const cp1x = prevSeg.point[0] + (prevSeg.handleOut ? prevSeg.handleOut[0] : 0);
              const cp1y = prevSeg.point[1] + (prevSeg.handleOut ? prevSeg.handleOut[1] : 0);
              const cp2x = seg.point[0] + (seg.handleIn ? seg.handleIn[0] : 0);
              const cp2y = seg.point[1] + (seg.handleIn ? seg.handleIn[1] : 0);
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, seg.point[0], seg.point[1]);
            } else {
              ctx.lineTo(seg.point[0], seg.point[1]);
            }
          }

          if (shape.closed) ctx.closePath();
          if (fill && fill !== 'transparent') ctx.fill();
          if (stroke && stroke !== 'transparent') ctx.stroke();
        }
        break;
    }

    ctx.restore();
  }

  /**
   * Calculate export parameters (shared between WebM and MP4 export)
   */
  function getExportParams(options) {
    const fps = options.fps || state.fps || 30;

    // Calculate actual content duration based on last clip end time
    let contentEndTime = 0;
    state.shapes.forEach(shape => {
      if (shape.startTime !== undefined && shape.duration !== undefined) {
        const clipEnd = shape.startTime + shape.duration;
        if (clipEnd > contentEndTime) {
          contentEndTime = clipEnd;
        }
      }
    });

    // Use content end time, or fall back to project duration, or default to 10s
    const duration = options.duration || (contentEndTime > 0 ? contentEndTime : state.projectDuration) || 10;
    const totalFrames = Math.ceil(duration * fps);

    return { fps, duration, totalFrames };
  }

  /**
   * Prepare canvas for export by resetting zoom/pan and resizing to project dimensions
   * Returns restore function to revert changes after export
   */
  function prepareCanvasForExport(canvas) {
    // Save current state
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    const originalZoom = state.zoom;
    const originalPanX = state.panX;
    const originalPanY = state.panY;

    // Get project dimensions (the actual export size we want)
    const projectWidth = state.canvasWidth || config.canvas?.width || 1920;
    const projectHeight = state.canvasHeight || config.canvas?.height || 1080;

    // Reset zoom and pan for export (render at 1:1 with no offset)
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;

    // Resize canvas to project dimensions
    canvas.width = projectWidth;
    canvas.height = projectHeight;

    // Return restore function
    return function restoreCanvas() {
      // Restore original canvas size
      canvas.width = originalWidth;
      canvas.height = originalHeight;

      // Restore zoom and pan
      state.zoom = originalZoom;
      state.panX = originalPanX;
      state.panY = originalPanY;

      // Re-render with restored settings
      if (typeof window.render === 'function') {
        window.render();
      }
    };
  }

  /**
   * Get all audio clips from the project
   * @returns {Array} Array of audio clip shapes
   */
  function getAudioClips() {
    return state.shapes.filter(shape =>
      (shape.type === 'audio' || shape.type === 'video') &&
      shape.src &&
      !shape.muted
    );
  }

  /**
   * Create an offline audio context and render audio mix for export
   * @param {number} duration - Duration in seconds
   * @param {number} sampleRate - Sample rate (default 48000)
   * @returns {Promise<AudioBuffer|null>} Rendered audio buffer or null if no audio
   */
  async function renderAudioMix(duration, sampleRate = 48000) {
    const audioClips = getAudioClips();
    if (audioClips.length === 0) return null;

    // Create offline audio context
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

    // Load and decode all audio sources
    const loadPromises = audioClips.map(async (clip) => {
      try {
        // Fetch the audio file
        const response = await fetch(clip.src);
        if (!response.ok) {
          console.warn(`Failed to fetch audio: ${clip.src}`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

        return {
          clip,
          buffer: audioBuffer
        };
      } catch (err) {
        console.warn(`Failed to load audio clip: ${clip.src}`, err);
        return null;
      }
    });

    const loadedAudio = (await Promise.all(loadPromises)).filter(a => a !== null);

    if (loadedAudio.length === 0) return null;

    // Schedule all audio clips
    loadedAudio.forEach(({ clip, buffer }) => {
      const startTime = clip.startTime || 0;
      const clipDuration = Math.min(clip.duration || buffer.duration, buffer.duration);
      const volume = (clip.volume ?? 100) / 100;
      const fadeIn = clip.fadeIn || 0;
      const fadeOut = clip.fadeOut || 0;
      const endTime = startTime + clipDuration;

      // Create source node
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      // Create gain node for volume and fades
      const gainNode = offlineCtx.createGain();

      // Set initial gain (before clip starts, should be 0 or will be set at start)
      // Initialize to 0 at time 0, then set appropriately at clip start
      gainNode.gain.setValueAtTime(0, 0);

      if (fadeIn > 0) {
        // Start at 0, ramp to volume over fadeIn duration
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + fadeIn);
      } else {
        // No fade in, jump to volume at start
        gainNode.gain.setValueAtTime(volume, startTime);
      }

      // Maintain volume until fade out (if we have one)
      if (fadeOut > 0 && endTime - fadeOut > startTime + fadeIn) {
        // Set volume at the point where fade out begins
        gainNode.gain.setValueAtTime(volume, endTime - fadeOut);
        gainNode.gain.linearRampToValueAtTime(0, endTime);
      }

      // After clip ends, ensure gain is 0
      gainNode.gain.setValueAtTime(0, endTime + 0.001);

      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      // Start playback at the clip's start time
      // Use offset if the clip should start from a different point in the audio
      const audioOffset = clip.audioOffset || 0;
      source.start(startTime, audioOffset, clipDuration);
    });

    // Render the audio
    return await offlineCtx.startRendering();
  }

  /**
   * Convert AudioBuffer to Float32 arrays for encoding
   * @param {AudioBuffer} audioBuffer - Audio buffer to convert
   * @returns {{left: Float32Array, right: Float32Array}} Stereo channel data
   */
  function audioBufferToFloat32(audioBuffer) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : audioBuffer.getChannelData(0);
    return { left, right };
  }

  /**
   * Create a MediaStream from an AudioBuffer for real-time playback
   * @param {AudioBuffer} audioBuffer - Rendered audio buffer
   * @returns {Promise<{stream: MediaStreamAudioDestinationNode, context: AudioContext, source: AudioBufferSourceNode}>}
   */
  async function createAudioStreamFromBuffer(audioBuffer) {
    // Use standard sample rate for better compatibility
    const audioCtx = new AudioContext({ sampleRate: 48000 });

    // Resume context if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);

    return {
      stream: destination,
      context: audioCtx,
      source
    };
  }

  /**
   * Export video as WebM using MediaRecorder
   */
  async function exportVideoAsWebM(modal, options = {}) {
    const { fps, duration, totalFrames } = getExportParams(options);

    // Set export mode to skip UI overlays during rendering
    state.isExporting = true;

    // Get canvas
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Prepare canvas for export (reset zoom/pan, resize to project dimensions)
    const restoreCanvas = prepareCanvasForExport(canvas);

    // Choose best codec for video+audio
    let mimeType = getBestMimeType();
    modal.updateStatus('Preparing audio mix...');

    // Render audio mix
    let audioBuffer = null;
    let audioStream = null;
    let audioContext = null;
    let audioSource = null;

    try {
      audioBuffer = await renderAudioMix(duration);
      if (audioBuffer) {
        modal.updateStatus('Audio mix ready. Preparing recording...');
        const audioSetup = await createAudioStreamFromBuffer(audioBuffer);
        audioStream = audioSetup.stream;
        audioContext = audioSetup.context;
        audioSource = audioSetup.source;
      }
    } catch (err) {
      console.warn('Failed to render audio mix:', err);
      // Continue without audio
    }

    modal.updateStatus('Preparing WebM recording...');

    // Create video stream from canvas
    const videoStream = canvas.captureStream(fps);

    // Combine video and audio streams
    const combinedStream = new MediaStream();

    // Add video tracks
    videoStream.getVideoTracks().forEach(track => {
      combinedStream.addTrack(track);
    });

    // Add audio tracks if available
    if (audioStream) {
      audioStream.stream.getAudioTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
    }

    // Select mime type that supports audio if we have audio
    if (audioStream) {
      // Prefer codecs that handle audio well
      const audioVideoTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,vorbis',
        'video/webm;codecs=vp8,vorbis',
        'video/webm'
      ];
      mimeType = audioVideoTypes.find(t => MediaRecorder.isTypeSupported(t)) || mimeType;
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: options.bitrate || 5_000_000, // 5 Mbps
      audioBitsPerSecond: 128000 // 128 kbps audio
    });

    const chunks = [];
    const originalTime = state.currentTime;

    // Handle data
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Create promise for completion
    const recordingComplete = new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        try {
          // Cleanup audio resources
          if (audioSource) {
            try { audioSource.stop(); } catch (e) { /* ignore */ }
          }
          if (audioContext) {
            audioContext.close();
          }

          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);

          modal.updateStatus('Export complete!');
          modal.updateProgress(100);
          modal.showDownload(url, options.filename || 'video.webm');

          // Restore original time and exit export mode
          state.isExporting = false;
          state.currentTime = originalTime;
          restoreCanvas();

          resolve();
        } catch (err) {
          reject(err);
        }
      };

      mediaRecorder.onerror = (e) => {
        // Cleanup audio resources on error
        if (audioSource) {
          try { audioSource.stop(); } catch (e) { /* ignore */ }
        }
        if (audioContext) {
          audioContext.close();
        }
        // Exit export mode on error
        state.isExporting = false;
        restoreCanvas();
        reject(e.error || new Error('Recording failed'));
      };
    });

    // Start audio playback synchronized with recording
    if (audioSource) {
      audioSource.start(0);
    }

    // Start recording
    mediaRecorder.start(100);
    modal.updateStatus(audioBuffer ? 'Recording video with audio (WebM)...' : 'Recording video (WebM)...');

    // Playback loop - using async loop instead of setInterval to properly wait for video seeks
    let frameCount = 0;
    const frameInterval = 1000 / fps;

    await new Promise(async (resolve) => {
      const processFrame = async () => {
        if (window.exportCancelled) {
          mediaRecorder.stop();
          modal.close();
          // Exit export mode on cancel
          state.isExporting = false;
          state.currentTime = originalTime;
          restoreCanvas();
          resolve();
          return;
        }

        state.currentTime = frameCount / fps;

        // Apply viewport keyframes for this frame (camera animation)
        const viewportKeyframesComposable = getViewportKeyframes();
        if (viewportKeyframesComposable.hasViewportKeyframes.value) {
          const viewport = viewportKeyframesComposable.getViewportAtTime(state.currentTime);
          if (viewport) {
            state.zoom = viewport.zoom;
            state.panX = viewport.panX;
            state.panY = viewport.panY;
          }
        }

        // Sync media elements and wait for video seeks to complete
        if (typeof window.syncAllMediaToPlayheadAsync === 'function') {
          await window.syncAllMediaToPlayheadAsync();
        } else if (typeof window.syncAllMediaToPlayhead === 'function') {
          window.syncAllMediaToPlayhead();
        }
        if (typeof window.render === 'function') window.render();

        // Draw watermark to main canvas for video capture
        const ctx = canvas.getContext('2d');
        drawExportWatermark(ctx, canvas.width, canvas.height);

        const progress = (frameCount / totalFrames) * 100;
        modal.updateProgress(progress);
        modal.updateStatus(`Recording frame ${frameCount + 1} of ${totalFrames}...`);

        frameCount++;

        if (frameCount >= totalFrames) {
          modal.updateStatus('Finalizing video...');
          modal.updateProgress(100);
          mediaRecorder.stop();
          resolve();
        } else {
          // Schedule next frame with proper timing
          setTimeout(processFrame, frameInterval);
        }
      };

      // Start processing frames
      processFrame();
    });

    await recordingComplete;
  }

  /**
   * Export video as MP4 using WebCodecs + mp4-muxer
   */
  async function exportVideoAsMP4(modal, options = {}) {
    const { fps, duration, totalFrames } = getExportParams(options);

    // Set export mode to skip UI overlays during rendering
    state.isExporting = true;

    // Get canvas
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Prepare canvas for export (reset zoom/pan, resize to project dimensions)
    const restoreCanvas = prepareCanvasForExport(canvas);

    // H.264 requires even dimensions - round down to nearest even number
    const width = Math.floor(canvas.width / 2) * 2;
    const height = Math.floor(canvas.height / 2) * 2;
    const originalTime = state.currentTime;

    modal.updateStatus('Preparing audio mix...');

    // Render audio mix
    const sampleRate = 48000;
    let audioBuffer = null;
    try {
      audioBuffer = await renderAudioMix(duration, sampleRate);
      if (audioBuffer) {
        //console.log(`MP4 Export: Audio mix rendered (${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels)`);
      }
    } catch (err) {
      console.warn('Failed to render audio mix for MP4:', err);
      // Continue without audio
    }

    modal.updateStatus('Loading MP4 encoder...');

    // Load mp4-muxer
    const { Muxer: MuxerClass, ArrayBufferTarget: ArrayBufferTargetClass } = await loadMP4Muxer();

    // Check WebCodecs support and find supported codec
    // H.264 codec strings: avc1.PPCCLL where PP=profile, CC=constraints, LL=level
    // Common profiles: 42=Baseline, 4D=Main, 64=High
    // Levels: 1f=3.1 (720p30), 28=4.0 (1080p30), 29=4.1 (1080p30), 32=5.0 (1080p60), 33=5.1 (4K)
    const allCodecConfigs = [
      // High profile - best quality, good compression
      { codec: 'avc1.640032', name: 'H.264 High 5.0' },       // Up to 4K
      { codec: 'avc1.64002a', name: 'H.264 High 4.2' },       // Up to 1080p60
      { codec: 'avc1.640029', name: 'H.264 High 4.1' },       // Up to 1080p30
      { codec: 'avc1.640028', name: 'H.264 High 4.0' },       // Up to 1080p30
      { codec: 'avc1.64001f', name: 'H.264 High 3.1' },       // Up to 720p30
      // Main profile - good compatibility
      { codec: 'avc1.4d0032', name: 'H.264 Main 5.0' },
      { codec: 'avc1.4d002a', name: 'H.264 Main 4.2' },
      { codec: 'avc1.4d0029', name: 'H.264 Main 4.1' },
      { codec: 'avc1.4d0028', name: 'H.264 Main 4.0' },
      { codec: 'avc1.4d001f', name: 'H.264 Main 3.1' },
      // Baseline profile - most compatible but less efficient
      { codec: 'avc1.420032', name: 'H.264 Baseline 5.0' },
      { codec: 'avc1.42002a', name: 'H.264 Baseline 4.2' },
      { codec: 'avc1.420029', name: 'H.264 Baseline 4.1' },
      { codec: 'avc1.420028', name: 'H.264 Baseline 4.0' },
      { codec: 'avc1.42001f', name: 'H.264 Baseline 3.1' },
      { codec: 'avc1.42001e', name: 'H.264 Baseline 3.0' },
    ];

    // Filter codecs by resolution to avoid Level errors at encode time
    // Level limits: 3.1 = 921600px (1280x720), 4.0 = 2073600px (1920x1080), 5.0+ = higher
    const codedArea = width * height;
    const getMinLevel = (area) => {
      if (area > 2073600) return 0x32;  // > 1920×1080 → need Level 5.0 (0x32)
      if (area > 921600) return 0x28;   // > 1280×720 → need Level 4.0 (0x28)
      return 0x1e;                       // Level 3.0 (0x1e) is fine for smaller
    };
    const minLevel = getMinLevel(codedArea);

    // Filter to only test codecs with sufficient level
    const codecConfigs = allCodecConfigs.filter(c => {
      // Extract level from codec string (last 2 hex chars)
      const levelHex = parseInt(c.codec.slice(-2), 16);
      return levelHex >= minLevel;
    });

    let supportedCodec = null;
    let supportedCodecName = '';
    for (const codecConfig of codecConfigs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: codecConfig.codec,
          width,
          height,
          bitrate: options.bitrate || 5_000_000,
          framerate: fps,
        });
        if (support.supported) {
          supportedCodec = codecConfig.codec;
          supportedCodecName = codecConfig.name;
          break;
        }
      } catch (e) {
        // Try next codec
      }
    }

    if (!supportedCodec) {
      // Log what we tried for debugging
      console.error(`MP4 Export failed: No codec supports ${width}x${height} @ ${fps}fps`);
      restoreCanvas();
      throw new Error(`MP4 export not supported for ${width}x${height} resolution. Try WebM instead.`);
    }

    modal.updateStatus('Preparing MP4 recording...');

    // Create target for muxer output
    const target = new ArrayBufferTargetClass();

    // Configure muxer with video and optional audio
    const muxerConfig = {
      target,
      video: {
        codec: 'avc',
        width,
        height,
      },
      fastStart: 'in-memory',
    };

    // Add audio configuration if we have audio
    // Note: mp4-muxer supports AAC audio, but WebCodecs AudioEncoder for AAC
    // is not universally supported. We'll use raw PCM audio chunks with mp4-muxer.
    let hasAudio = false;
    let audioData = null;
    if (audioBuffer) {
      hasAudio = true;
      // mp4-muxer can accept raw audio samples
      muxerConfig.audio = {
        codec: 'aac',
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
      };
      // Get audio channel data
      audioData = audioBufferToFloat32(audioBuffer);
    }

    // Create muxer
    const muxer = new MuxerClass(muxerConfig);

    // Create encoder
    let encodedFrames = 0;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
        encodedFrames++;
      },
      error: (e) => {
        console.error('VideoEncoder error:', e);
      },
    });

    encoder.configure({
      codec: supportedCodec,
      width,
      height,
      bitrate: options.bitrate || 5_000_000,
      framerate: fps,
    });

    modal.updateStatus('Recording video (MP4)...');

    // Render frames
    let frameCount = 0;

    // Create offscreen canvas for frame capture (using adjusted even dimensions)
    const offscreen = new OffscreenCanvas(width, height);
    const offCtx = offscreen.getContext('2d');

    while (frameCount < totalFrames && !window.exportCancelled) {
      // Advance time
      state.currentTime = frameCount / fps;

      // Apply viewport keyframes for this frame (camera animation)
      const viewportKeyframesComposable = getViewportKeyframes();
      if (viewportKeyframesComposable.hasViewportKeyframes.value) {
        const viewport = viewportKeyframesComposable.getViewportAtTime(state.currentTime);
        if (viewport) {
          state.zoom = viewport.zoom;
          state.panX = viewport.panX;
          state.panY = viewport.panY;
        }
      }

      // Sync media elements and wait for video seeks to complete
      // This is critical - video seeking is async and we must wait for frames to be ready
      if (typeof window.syncAllMediaToPlayheadAsync === 'function') {
        await window.syncAllMediaToPlayheadAsync();
      } else if (typeof window.syncAllMediaToPlayhead === 'function') {
        window.syncAllMediaToPlayhead();
      }

      // Render frame to main canvas
      if (typeof window.render === 'function') window.render();

      // Copy to offscreen canvas (crop to even dimensions if needed)
      offCtx.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);

      // Create VideoFrame from offscreen canvas
      const frame = new VideoFrame(offscreen, {
        timestamp: frameCount * (1_000_000 / fps), // microseconds
        duration: 1_000_000 / fps,
      });

      // Encode frame
      const keyFrame = frameCount % (fps * 2) === 0; // Keyframe every 2 seconds
      encoder.encode(frame, { keyFrame });
      frame.close();

      // Update progress (0-80% for rendering)
      const progress = (frameCount / totalFrames) * 80;
      modal.updateProgress(progress);
      modal.updateStatus(`Encoding frame ${frameCount + 1} of ${totalFrames}...`);

      frameCount++;

      // Yield to UI periodically
      if (frameCount % 5 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (window.exportCancelled) {
      encoder.close();
      // Exit export mode on cancel
      state.isExporting = false;
      state.currentTime = originalTime;
      restoreCanvas();
      return;
    }

    modal.updateStatus('Finalizing video...');
    modal.updateProgress(80);

    // Flush video encoder
    await encoder.flush();
    encoder.close();

    modal.updateProgress(85);

    // Add audio if available
    if (hasAudio && audioData && audioBuffer) {
      modal.updateStatus('Encoding audio...');

      // Check if AudioEncoder is available for AAC encoding
      if (typeof AudioEncoder !== 'undefined') {
        try {
          // Create interleaved audio data for encoding
          const numberOfChannels = audioBuffer.numberOfChannels;
          const totalSamples = audioBuffer.length;

          // Create AudioEncoder for AAC
          let audioEncodedChunks = [];
          const audioEncoder = new AudioEncoder({
            output: (chunk, meta) => {
              muxer.addAudioChunk(chunk, meta);
              audioEncodedChunks.push(chunk);
            },
            error: (e) => {
              console.error('AudioEncoder error:', e);
            },
          });

          // Configure AAC encoder
          const audioEncoderConfig = {
            codec: 'mp4a.40.2', // AAC-LC
            numberOfChannels,
            sampleRate: audioBuffer.sampleRate,
            bitrate: 128000, // 128 kbps
          };

          const audioSupport = await AudioEncoder.isConfigSupported(audioEncoderConfig);
          if (audioSupport.supported) {
            audioEncoder.configure(audioEncoderConfig);

            // Process audio in chunks
            const samplesPerChunk = 1024; // AAC frame size
            const totalChunks = Math.ceil(totalSamples / samplesPerChunk);

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
              const startSample = chunkIndex * samplesPerChunk;
              const endSample = Math.min(startSample + samplesPerChunk, totalSamples);
              const chunkSamples = endSample - startSample;

              // Create planar AudioData (each channel's samples are contiguous)
              // For f32-planar: [ch0_sample0, ch0_sample1, ..., ch1_sample0, ch1_sample1, ...]
              const audioDataBuffer = new Float32Array(chunkSamples * numberOfChannels);

              // Copy channels in planar format
              for (let ch = 0; ch < numberOfChannels; ch++) {
                const channelData = audioBuffer.getChannelData(ch);
                const channelOffset = ch * chunkSamples;
                for (let i = 0; i < chunkSamples; i++) {
                  audioDataBuffer[channelOffset + i] = channelData[startSample + i];
                }
              }

              const audioDataFrame = new AudioData({
                format: 'f32-planar',
                sampleRate: audioBuffer.sampleRate,
                numberOfFrames: chunkSamples,
                numberOfChannels,
                timestamp: (startSample / audioBuffer.sampleRate) * 1_000_000, // microseconds
                data: audioDataBuffer,
              });

              audioEncoder.encode(audioDataFrame);
              audioDataFrame.close();

              // Update progress (85-95% for audio encoding)
              const audioProgress = 85 + (chunkIndex / totalChunks) * 10;
              modal.updateProgress(audioProgress);

              // Yield to UI periodically
              if (chunkIndex % 50 === 0) {
                await new Promise(r => setTimeout(r, 0));
              }
            }

            // Flush audio encoder
            await audioEncoder.flush();
            audioEncoder.close();
          } else {
            console.warn('AAC audio encoding not supported, exporting without audio');
          }
        } catch (audioErr) {
          console.warn('Audio encoding failed, exporting without audio:', audioErr);
        }
      } else {
        console.warn('AudioEncoder not available, exporting without audio');
      }
    }

    modal.updateProgress(95);

    // Finalize muxer
    muxer.finalize();

    modal.updateProgress(98);

    // Get output buffer from the target we created
    const buffer = target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    // Restore original time and exit export mode
    state.isExporting = false;
    state.currentTime = originalTime;
    restoreCanvas();

    modal.updateStatus('Export complete!');
    modal.updateProgress(100);
    modal.showDownload(url, options.filename || 'video.mp4');
  }

  /**
   * Export video (for video mode)
   * Shows format selection dialog and exports to WebM or MP4
   */
  async function exportVideo(options = {}) {
    // Pause playback if playing
    if (state.isPlaying && typeof window.pause === 'function') {
      window.pause();
    }

    // Get export config from defaults
    const exportConfig = config.export || {};
    const modal = showExportModal(state.darkMode, true, exportConfig);
    window.exportCancelled = false;

    try {
      // Wait for format selection - now returns { format, fps }
      const selection = await modal.waitForFormat();

      // User cancelled
      if (!selection || window.exportCancelled) {
        return;
      }

      const { format, fps } = selection;
      const exportOptions = { ...options, fps };

      // Check basic browser support
      if (typeof MediaRecorder === 'undefined' ||
          typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
        throw new Error('Video export is not supported in this browser. Please use Chrome, Firefox, Safari 14.1+, or Edge.');
      }

      // Route to appropriate export function
      if (format === 'mp4') {
        if (!isMP4ExportSupported()) {
          throw new Error('MP4 export requires WebCodecs API, which is not available in this browser.');
        }
        await exportVideoAsMP4(modal, exportOptions);
      } else {
        await exportVideoAsWebM(modal, exportOptions);
      }

    } catch (error) {
      console.error('Video export error:', error);
      // Ensure export mode is cleared on error
      state.isExporting = false;
      modal.showError(error.message || 'Export failed');
    }
  }

  /**
   * Export presentation recording (for canvas presentation mode)
   * Uses the recorded canvas blob and optionally converts to MP4
   * @param {Blob} canvasBlob - The recorded canvas video blob
   * @param {Blob} webcamBlob - Optional webcam overlay blob
   * @param {number} duration - Recording duration in seconds
   * @param {Object} options - Export options
   */
  async function exportPresentationVideo(canvasBlob, webcamBlob, duration, options = {}) {
    console.log('[Export] exportPresentationVideo called', {
      canvasBlob: canvasBlob?.size,
      webcamBlob: webcamBlob?.size,
      audioBlob: options.audioBlob?.size,
      pcmAudio: options.pcmAudio ? `${options.pcmAudio.length} samples @ ${options.pcmAudio.sampleRate}Hz` : null,
      duration
    });

    if (!canvasBlob || canvasBlob.size === 0) {
      alert('No presentation recording available.');
      return;
    }

    // Get export config from defaults
    const exportConfig = config.export || {};
    const modal = showExportModal(state.darkMode, true, exportConfig);
    window.exportCancelled = false;

    try {
      // Wait for format selection
      const selection = await modal.waitForFormat();

      // User cancelled
      if (!selection || window.exportCancelled) {
        return;
      }

      const { format, fps } = selection;
      const filename = options.filename || `presentation-${Date.now()}`;

      if (format === 'webm') {
        // Direct download of WebM blob
        modal.updateStatus('Processing WebM...');
        modal.updateProgress(50);

        // The canvas blob is already WebM, download directly
        const url = URL.createObjectURL(canvasBlob);
        modal.updateProgress(100);
        modal.showDownload(url, `${filename}.webm`);

      } else if (format === 'mp4') {
        // Convert WebM to MP4 using WebCodecs
        if (!isMP4ExportSupported()) {
          throw new Error('MP4 export requires WebCodecs API, which is not available in this browser.');
        }

        modal.updateStatus('Converting to MP4...');
        modal.updateProgress(10);

        // Load mp4-muxer
        const { Muxer: MP4Muxer, ArrayBufferTarget: ABTarget } = await loadMP4Muxer();
        modal.updateProgress(20);

        // Create video element to decode WebM
        const video = document.createElement('video');
        video.src = URL.createObjectURL(canvasBlob);
        video.muted = true;

        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () => reject(new Error('Failed to load video'));
        });

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        // Use the passed duration parameter instead of video.duration
        // because WebM from MediaRecorder often has Infinity duration
        const videoDuration = (duration && isFinite(duration) && duration > 0) ? duration : video.duration;

        if (!isFinite(videoDuration) || videoDuration <= 0) {
          throw new Error('Cannot determine video duration. Please try WebM export instead.');
        }

        console.log('[Export] Video dimensions:', videoWidth, 'x', videoHeight, 'duration:', videoDuration + 's');

        // Extract audio - prefer raw PCM data (bypasses Chrome's WebM decoding issues)
        let audioBuffer = null;

        if (options.pcmAudio && options.pcmAudio.length > 0) {
          // Use raw PCM audio captured during recording
          // This bypasses Chrome's inability to decode WebM audio with decodeAudioData()
          try {
            const pcm = options.pcmAudio;
            const audioCtx = new AudioContext({ sampleRate: pcm.sampleRate });
            audioBuffer = audioCtx.createBuffer(pcm.numberOfChannels, pcm.length, pcm.sampleRate);
            audioBuffer.getChannelData(0).set(pcm.left);
            if (pcm.numberOfChannels > 1) {
              audioBuffer.getChannelData(1).set(pcm.right);
            }
            await audioCtx.close();
            console.log('[Export] Using raw PCM audio:', audioBuffer.numberOfChannels, 'channels,', audioBuffer.sampleRate, 'Hz,', (audioBuffer.length / audioBuffer.sampleRate).toFixed(2) + 's');
          } catch (pcmErr) {
            console.warn('[Export] Failed to create AudioBuffer from PCM:', pcmErr.message);
          }
        }

        // Fallback: try to decode audio from blob (may fail in Chrome for WebM)
        if (!audioBuffer) {
          const audioSource = options.audioBlob || canvasBlob;
          try {
            const audioCtx = new AudioContext();
            const arrayBuffer = await audioSource.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            await audioCtx.close();
            console.log('[Export] Extracted audio from blob:', audioBuffer.numberOfChannels, 'channels,', audioBuffer.sampleRate, 'Hz,', audioBuffer.duration.toFixed(2) + 's');
          } catch (e) {
            console.warn('[Export] Could not decode audio from blob:', e.message);
          }
        }

        const hasAudio = audioBuffer && audioBuffer.length > 0;
        if (!hasAudio) {
          console.warn('[Export] No audio available - MP4 will be exported without audio');
        }

        // H264 requires even dimensions - pad to even if needed
        const width = videoWidth % 2 === 0 ? videoWidth : videoWidth + 1;
        const height = videoHeight % 2 === 0 ? videoHeight : videoHeight + 1;

        if (width !== videoWidth || height !== videoHeight) {
          console.log('[Export] Padding video dimensions for H264:', videoWidth, 'x', videoHeight, '->', width, 'x', height);
        }

        modal.updateStatus(`Converting ${Math.round(videoDuration)}s video to MP4...`);

        // Create canvas for frame extraction (with even dimensions)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        // Fill with black first (for padding pixels if dimensions were adjusted)
        tempCtx.fillStyle = '#000000';
        tempCtx.fillRect(0, 0, width, height);

        // Find a supported codec based on resolution
        // H.264 levels have max pixel limits: 3.1=921600, 4.0=2073600, 5.0+=higher
        const allCodecConfigs = [
          { codec: 'avc1.640032', name: 'H.264 High 5.0' },
          { codec: 'avc1.640028', name: 'H.264 High 4.0' },
          { codec: 'avc1.64001f', name: 'H.264 High 3.1' },
          { codec: 'avc1.4d0032', name: 'H.264 Main 5.0' },
          { codec: 'avc1.4d0028', name: 'H.264 Main 4.0' },
          { codec: 'avc1.4d001f', name: 'H.264 Main 3.1' },
          { codec: 'avc1.420032', name: 'H.264 Baseline 5.0' },
          { codec: 'avc1.420028', name: 'H.264 Baseline 4.0' },
          { codec: 'avc1.42001f', name: 'H.264 Baseline 3.1' },
        ];

        // Filter codecs by resolution to avoid Level errors at encode time
        const codedArea = width * height;
        const getMinLevel = (area) => {
          if (area > 2073600) return 0x32;  // > 1920×1080 → need Level 5.0
          if (area > 921600) return 0x28;   // > 1280×720 → need Level 4.0
          return 0x1f;                       // Level 3.1 is fine for smaller
        };
        const minLevel = getMinLevel(codedArea);

        const codecConfigs = allCodecConfigs.filter(c => {
          const levelHex = parseInt(c.codec.slice(-2), 16);
          return levelHex >= minLevel;
        });

        let supportedCodec = null;
        for (const codecConfig of codecConfigs) {
          try {
            const support = await VideoEncoder.isConfigSupported({
              codec: codecConfig.codec,
              width,
              height,
              bitrate: 5_000_000,
              framerate: fps,
            });
            if (support.supported) {
              supportedCodec = codecConfig.codec;
              console.log('[Export] Using codec:', codecConfig.name);
              break;
            }
          } catch (e) {
            // Try next codec
          }
        }

        if (!supportedCodec) {
          throw new Error(`MP4 export not supported for ${width}x${height} resolution. Try WebM instead.`);
        }

        // Setup muxer
        const target = new ABTarget();
        const muxerConfig = {
          target,
          video: {
            codec: 'avc',
            width,
            height
          },
          fastStart: 'in-memory'
        };

        // Add audio track if audio is available
        if (hasAudio) {
          muxerConfig.audio = {
            codec: 'aac',
            numberOfChannels: audioBuffer.numberOfChannels,
            sampleRate: audioBuffer.sampleRate
          };
        }

        const muxer = new MP4Muxer(muxerConfig);

        // Setup video encoder
        const encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: (e) => {
            console.error('VideoEncoder error:', e);
          }
        });

        await encoder.configure({
          codec: supportedCodec,
          width,
          height,
          bitrate: 5_000_000,
          framerate: fps
        });

        // Extract and encode frames
        const totalFrames = Math.ceil(videoDuration * fps);
        let frameIndex = 0;

        for (let time = 0; time < videoDuration; time += 1 / fps) {
          if (window.exportCancelled) {
            encoder.close();
            throw new Error('Export cancelled');
          }

          video.currentTime = time;
          await new Promise(resolve => {
            video.onseeked = resolve;
          });

          // Clear with black (important if dimensions were padded)
          tempCtx.fillStyle = '#000000';
          tempCtx.fillRect(0, 0, width, height);
          // Draw video frame
          tempCtx.drawImage(video, 0, 0, videoWidth, videoHeight);

          const frame = new VideoFrame(tempCanvas, {
            timestamp: time * 1_000_000
          });

          encoder.encode(frame);
          frame.close();

          frameIndex++;
          const progress = 20 + (frameIndex / totalFrames) * 70;
          modal.updateProgress(progress);
          modal.updateStatus(`Encoding frame ${frameIndex}/${totalFrames}...`);
        }

        await encoder.flush();
        encoder.close();

        // Add audio if available
        if (hasAudio && audioBuffer) {
          modal.updateStatus('Encoding audio...');
          modal.updateProgress(92);

          if (typeof AudioEncoder !== 'undefined') {
            try {
              const audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: (e) => console.error('AudioEncoder error:', e)
              });

              const audioEncoderConfig = {
                codec: 'mp4a.40.2', // AAC-LC
                numberOfChannels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate,
                bitrate: 128000
              };

              const audioSupport = await AudioEncoder.isConfigSupported(audioEncoderConfig);
              if (audioSupport.supported) {
                audioEncoder.configure(audioEncoderConfig);

                // Process audio in 1024-sample chunks (AAC frame size)
                const samplesPerChunk = 1024;
                const totalSamples = audioBuffer.length;
                const numberOfChannels = audioBuffer.numberOfChannels;

                for (let startSample = 0; startSample < totalSamples; startSample += samplesPerChunk) {
                  const endSample = Math.min(startSample + samplesPerChunk, totalSamples);
                  const chunkSamples = endSample - startSample;

                  // Create planar audio data
                  const audioDataBuffer = new Float32Array(chunkSamples * numberOfChannels);
                  for (let ch = 0; ch < numberOfChannels; ch++) {
                    const channelData = audioBuffer.getChannelData(ch);
                    const channelOffset = ch * chunkSamples;
                    for (let i = 0; i < chunkSamples; i++) {
                      audioDataBuffer[channelOffset + i] = channelData[startSample + i];
                    }
                  }

                  const audioDataFrame = new AudioData({
                    format: 'f32-planar',
                    sampleRate: audioBuffer.sampleRate,
                    numberOfFrames: chunkSamples,
                    numberOfChannels,
                    timestamp: (startSample / audioBuffer.sampleRate) * 1_000_000,
                    data: audioDataBuffer
                  });

                  audioEncoder.encode(audioDataFrame);
                  audioDataFrame.close();
                }

                await audioEncoder.flush();
                audioEncoder.close();
                console.log('[Export] Audio encoding complete');
              } else {
                console.warn('[Export] AAC audio encoding not supported');
              }
            } catch (audioErr) {
              console.warn('[Export] Audio encoding failed:', audioErr);
            }
          } else {
            console.warn('[Export] AudioEncoder not available');
          }
        }

        modal.updateProgress(95);
        modal.updateStatus('Finalizing MP4...');

        muxer.finalize();

        const buffer = target.buffer;
        const mp4Blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(mp4Blob);

        // Clean up video element
        URL.revokeObjectURL(video.src);

        modal.updateProgress(100);
        modal.showDownload(url, `${filename}.mp4`);
      }

    } catch (error) {
      console.error('Presentation export error:', error);
      modal.showError(error.message || 'Export failed');
    }
  }

  /**
   * Export frame as PNG
   */
  async function exportFrameAsPng(frameIndex, options = {}) {
    const frame = state.shapes[frameIndex];
    if (!frame || frame.type !== 'frame') {
      console.warn('Invalid frame index or not a frame');
      return;
    }

    try {
      const scale = options.scale || config.export?.defaultScale || 2;
      const padding = options.padding ?? 0; // Frames typically export without padding

      // Create offscreen canvas at frame dimensions
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = (frame.width + padding * 2) * scale;
      exportCanvas.height = (frame.height + padding * 2) * scale;

      const ctx = exportCanvas.getContext('2d');
      ctx.scale(scale, scale);

      // Translate so frame origin is at padding offset
      ctx.translate(-frame.x + padding, -frame.y + padding);

      // Fill background with frame fill or white
      const bgColor = frame.fillColor && frame.fillColor !== 'transparent'
        ? frame.fillColor
        : (options.transparent ? 'transparent' : '#ffffff');

      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(frame.x - padding, frame.y - padding, frame.width + padding * 2, frame.height + padding * 2);
      }

      // Setup clipping if frame clips content
      if (frame.clipContent) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(frame.x, frame.y, frame.width, frame.height);
        ctx.clip();
      }

      // Draw frame children
      let tempRc = null;
      try {
        if (typeof rough !== 'undefined') {
          tempRc = rough.canvas(exportCanvas);
        }
      } catch (e) {}

      if (frame.children && frame.children.length > 0) {
        if (typeof window.drawShapeToContext === 'function') {
          frame.children.forEach(child => {
            if (child.visible !== false) {
              window.drawShapeToContext(child, ctx, tempRc);
            }
          });
        }
      }

      // Restore clipping
      if (frame.clipContent) {
        ctx.restore();
      }

      // Draw watermark in content coordinate space (same transform as shapes)
      drawExportWatermark(ctx, frame.width + padding * 2, frame.height + padding * 2, frame.x - padding, frame.y - padding);

      // Download
      const filename = options.filename || `${frame.name || 'frame'}.png`;
      const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
      downloadBlob(blob, filename);

      return blob;
    } catch (error) {
      console.error('Failed to export frame as PNG:', error);
    }
  }

  /**
   * Export frame as SVG
   */
  function exportFrameAsSvg(frameIndex, options = {}) {
    const frame = state.shapes[frameIndex];
    if (!frame || frame.type !== 'frame') {
      console.warn('Invalid frame index or not a frame');
      return;
    }

    try {
      const padding = options.padding ?? 0;
      const width = frame.width + padding * 2;
      const height = frame.height + padding * 2;
      const viewBoxX = frame.x - padding;
      const viewBoxY = frame.y - padding;

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBoxX} ${viewBoxY} ${width} ${height}">\n`;

      // Add arrow marker definitions
      svg += `<defs>\n`;
      svg += `  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">\n`;
      svg += `    <polygon points="0 0, 10 3.5, 0 7" fill="currentColor"/>\n`;
      svg += `  </marker>\n`;
      svg += `  <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">\n`;
      svg += `    <polygon points="10 0, 0 3.5, 10 7" fill="currentColor"/>\n`;
      svg += `  </marker>\n`;

      // Add clipping path for frame if needed
      const clipId = 'frame-clip-' + Math.random().toString(36).slice(2, 11);
      if (frame.clipContent) {
        svg += `  <clipPath id="${clipId}">\n`;
        svg += `    <rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}"/>\n`;
        svg += `  </clipPath>\n`;
      }
      svg += `</defs>\n`;

      // Background
      const bgColor = frame.fillColor && frame.fillColor !== 'transparent'
        ? frame.fillColor
        : (options.transparent ? 'none' : '#ffffff');

      if (bgColor !== 'none') {
        svg += `<rect x="${viewBoxX}" y="${viewBoxY}" width="${width}" height="${height}" fill="${bgColor}"/>\n`;
      }

      // Frame children (with optional clipping)
      if (frame.children && frame.children.length > 0) {
        if (frame.clipContent) {
          svg += `<g clip-path="url(#${clipId})">\n`;
        }

        frame.children.forEach(child => {
          if (child.visible !== false) {
            svg += shapeToSvg(child);
          }
        });

        if (frame.clipContent) {
          svg += `</g>\n`;
        }
      }

      // Add watermark (use viewBox coordinates)
      svg += getSvgWatermark(width, height, viewBoxX, viewBoxY);

      svg += '</svg>';

      // Download
      const filename = options.filename || `${frame.name || 'frame'}.svg`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      downloadBlob(blob, filename);

      return svg;
    } catch (error) {
      console.error('Failed to export frame as SVG:', error);
    }
  }

  // Helper functions

  /**
   * Get bounding box of all content (accounting for transforms)
   */
  function getContentBounds() {
    if (state.shapes.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    state.shapes.forEach(shape => {
      if (shape.visible === false) return;

      const bounds = getShapeBoundsForExport(shape);
      if (!bounds) return;

      // Apply transforms (rotation, flip, tilt) to get actual bounding box
      const hasTransform = shape.rotation || shape.tiltX || shape.tiltY || shape.scaleX === -1 || shape.scaleY === -1;

      if (hasTransform) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const corners = [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height }
        ];

        corners.forEach(corner => {
          let tx = corner.x;
          let ty = corner.y;

          // Transform order (same as renderer): Rotation -> Flip -> Tilt

          // 1. Rotation
          if (shape.rotation) {
            const cos = Math.cos(shape.rotation);
            const sin = Math.sin(shape.rotation);
            const dx = tx - centerX;
            const dy = ty - centerY;
            tx = centerX + dx * cos - dy * sin;
            ty = centerY + dx * sin + dy * cos;
          }

          // 2. Flip
          if (shape.scaleX === -1 || shape.scaleY === -1) {
            tx = centerX + (tx - centerX) * (shape.scaleX || 1);
            ty = centerY + (ty - centerY) * (shape.scaleY || 1);
          }

          // 3. Tilt (skew + scale)
          if (shape.tiltX || shape.tiltY) {
            const tiltX = shape.tiltX || 0;
            const tiltY = shape.tiltY || 0;
            const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
            const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
            const skewX = Math.sin(tiltX) * 0.5;
            const skewY = Math.sin(tiltY) * 0.5;

            // Local coordinates
            const dx = tx - centerX;
            const dy = ty - centerY;

            // Apply scale first, then skew (matching renderer)
            const scaledX = dx * scaleFromTiltY;
            const scaledY = dy * scaleFromTiltX;
            tx = centerX + scaledX + skewX * scaledY;
            ty = centerY + skewY * scaledX + scaledY;
          }

          minX = Math.min(minX, tx);
          minY = Math.min(minY, ty);
          maxX = Math.max(maxX, tx);
          maxY = Math.max(maxY, ty);
        });
      } else {
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }
    });

    if (minX === Infinity) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Get bounding box of all content with stroke width accounted for
   * This prevents elements from being cut off at SVG edges
   */
  function getContentBoundsWithStroke() {
    if (state.shapes.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    state.shapes.forEach(shape => {
      if (shape.visible === false) return;

      // Get base bounds (accounting for rotation if the utility supports it)
      let bounds;
      if (typeof window.getShapeBounds === 'function') {
        bounds = window.getShapeBounds(shape);
      } else {
        bounds = getShapeBoundsForExport(shape);
      }
      if (!bounds) return;

      // Calculate stroke padding - half the stroke extends outside the shape bounds
      const strokeWidth = shape.lineWidth || 2;
      const strokePadding = strokeWidth / 2;

      // Additional padding for arrows (arrowheads extend beyond line endpoints)
      let arrowPadding = 0;
      if (shape.type === 'arrow') {
        arrowPadding = Math.max(10, strokeWidth * 4); // Match arrowhead size
      }

      // Apply transforms (rotation, flip, tilt) to get actual bounding box
      const hasTransform = shape.rotation || shape.tiltX || shape.tiltY || shape.scaleX === -1 || shape.scaleY === -1;

      if (hasTransform) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const totalPadding = strokePadding + arrowPadding;
        const corners = [
          { x: bounds.x - totalPadding, y: bounds.y - totalPadding },
          { x: bounds.x + bounds.width + totalPadding, y: bounds.y - totalPadding },
          { x: bounds.x + bounds.width + totalPadding, y: bounds.y + bounds.height + totalPadding },
          { x: bounds.x - totalPadding, y: bounds.y + bounds.height + totalPadding }
        ];

        corners.forEach(corner => {
          let tx = corner.x;
          let ty = corner.y;

          // Transform order (same as renderer): Rotation -> Flip -> Tilt

          // 1. Rotation
          if (shape.rotation) {
            const cos = Math.cos(shape.rotation);
            const sin = Math.sin(shape.rotation);
            const dx = tx - centerX;
            const dy = ty - centerY;
            tx = centerX + dx * cos - dy * sin;
            ty = centerY + dx * sin + dy * cos;
          }

          // 2. Flip
          if (shape.scaleX === -1 || shape.scaleY === -1) {
            tx = centerX + (tx - centerX) * (shape.scaleX || 1);
            ty = centerY + (ty - centerY) * (shape.scaleY || 1);
          }

          // 3. Tilt (skew + scale)
          if (shape.tiltX || shape.tiltY) {
            const tiltX = shape.tiltX || 0;
            const tiltY = shape.tiltY || 0;
            const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
            const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
            const skewX = Math.sin(tiltX) * 0.5;
            const skewY = Math.sin(tiltY) * 0.5;

            // Local coordinates
            const dx = tx - centerX;
            const dy = ty - centerY;

            // Apply scale first, then skew (matching renderer)
            const scaledX = dx * scaleFromTiltY;
            const scaledY = dy * scaleFromTiltX;
            tx = centerX + scaledX + skewX * scaledY;
            ty = centerY + skewY * scaledX + scaledY;
          }

          minX = Math.min(minX, tx);
          minY = Math.min(minY, ty);
          maxX = Math.max(maxX, tx);
          maxY = Math.max(maxY, ty);
        });
      } else {
        // No transforms, just add stroke and arrow padding
        const totalPadding = strokePadding + arrowPadding;
        minX = Math.min(minX, bounds.x - totalPadding);
        minY = Math.min(minY, bounds.y - totalPadding);
        maxX = Math.max(maxX, bounds.x + bounds.width + totalPadding);
        maxY = Math.max(maxY, bounds.y + bounds.height + totalPadding);
      }
    });

    if (minX === Infinity) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Get shape bounds for export
   */
  function getShapeBoundsForExport(shape) {
    // Use legacy if available
    if (typeof window.getShapeBounds === 'function') {
      return window.getShapeBounds(shape);
    }

    // Basic implementation
    switch (shape.type) {
      case 'rect':
      case 'image':
      case 'video':
        return {
          x: shape.x,
          y: shape.y,
          width: shape.width || 100,
          height: shape.height || 100
        };

      case 'frame':
      case 'group': {
        // Start with parent bounds (for frames) or initialize with first child (for groups)
        let minX, minY, maxX, maxY;

        if (shape.type === 'group') {
          // Groups don't have their own x/y/width/height, calculate from children
          if (shape.children?.length > 0) {
            const firstChild = getShapeBoundsForExport(shape.children[0]);
            if (firstChild) {
              minX = firstChild.x;
              minY = firstChild.y;
              maxX = firstChild.x + firstChild.width;
              maxY = firstChild.y + firstChild.height;
            } else {
              return { x: 0, y: 0, width: 1, height: 1 };
            }
          } else {
            return { x: 0, y: 0, width: 1, height: 1 };
          }
        } else {
          // Frame has its own bounds
          minX = shape.x;
          minY = shape.y;
          maxX = shape.x + (shape.width || 100);
          maxY = shape.y + (shape.height || 100);
        }

        // Include all children bounds (for both frames and groups)
        if (shape.children) {
          shape.children.forEach(child => {
            if (child.visible === false) return;
            const childBounds = getShapeBoundsForExport(child);
            if (childBounds) {
              minX = Math.min(minX, childBounds.x);
              minY = Math.min(minY, childBounds.y);
              maxX = Math.max(maxX, childBounds.x + childBounds.width);
              maxY = Math.max(maxY, childBounds.y + childBounds.height);
            }
          });
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }

      case 'ellipse':
        const rx = shape.radiusX || shape.radius || 50;
        const ry = shape.radiusY || shape.radius || 50;
        return {
          x: shape.x - rx,
          y: shape.y - ry,
          width: rx * 2,
          height: ry * 2
        };

      case 'line':
      case 'arrow': {
        let minX = Math.min(shape.x1, shape.x2);
        let maxX = Math.max(shape.x1, shape.x2);
        let minY = Math.min(shape.y1, shape.y2);
        let maxY = Math.max(shape.y1, shape.y2);

        // Include control points for curved lines
        if (shape.curveType === 'curved') {
          if (shape.controlPoint) {
            minX = Math.min(minX, shape.controlPoint.x);
            maxX = Math.max(maxX, shape.controlPoint.x);
            minY = Math.min(minY, shape.controlPoint.y);
            maxY = Math.max(maxY, shape.controlPoint.y);
          }
          if (shape.controlPoint1) {
            minX = Math.min(minX, shape.controlPoint1.x);
            maxX = Math.max(maxX, shape.controlPoint1.x);
            minY = Math.min(minY, shape.controlPoint1.y);
            maxY = Math.max(maxY, shape.controlPoint1.y);
          }
          if (shape.controlPoint2) {
            minX = Math.min(minX, shape.controlPoint2.x);
            maxX = Math.max(maxX, shape.controlPoint2.x);
            minY = Math.min(minY, shape.controlPoint2.y);
            maxY = Math.max(maxY, shape.controlPoint2.y);
          }
        }

        return {
          x: minX,
          y: minY,
          width: maxX - minX || 1, // Avoid zero width
          height: maxY - minY || 1  // Avoid zero height
        };
      }

      case 'text':
        // Approximate text bounds
        return {
          x: shape.x,
          y: shape.y,
          width: (shape.text?.length || 4) * (shape.fontSize || 16) * 0.6,
          height: shape.fontSize || 16
        };

      case 'freehand': {
        if (!shape.points || shape.points.length === 0) {
          return { x: shape.x || 0, y: shape.y || 0, width: 1, height: 1 };
        }
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        shape.points.forEach(pt => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        });
        return {
          x: minX,
          y: minY,
          width: maxX - minX || 1,
          height: maxY - minY || 1
        };
      }

      case 'path': {
        if (!shape.segments || shape.segments.length === 0) {
          return { x: shape.x || 0, y: shape.y || 0, width: 1, height: 1 };
        }
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        shape.segments.forEach(seg => {
          if (seg.point) {
            minX = Math.min(minX, seg.point[0]);
            maxX = Math.max(maxX, seg.point[0]);
            minY = Math.min(minY, seg.point[1]);
            maxY = Math.max(maxY, seg.point[1]);
          }
          // Include control handles
          if (seg.handleIn) {
            const hx = seg.point[0] + seg.handleIn[0];
            const hy = seg.point[1] + seg.handleIn[1];
            minX = Math.min(minX, hx);
            maxX = Math.max(maxX, hx);
            minY = Math.min(minY, hy);
            maxY = Math.max(maxY, hy);
          }
          if (seg.handleOut) {
            const hx = seg.point[0] + seg.handleOut[0];
            const hy = seg.point[1] + seg.handleOut[1];
            minX = Math.min(minX, hx);
            maxX = Math.max(maxX, hx);
            minY = Math.min(minY, hy);
            maxY = Math.max(maxY, hy);
          }
        });
        return {
          x: minX,
          y: minY,
          width: maxX - minX || 1,
          height: maxY - minY || 1
        };
      }

      case 'diamond': {
        // Diamond uses x,y as center point
        const dw = shape.width || shape.size || 60;
        const dh = shape.height || shape.size || 60;
        return {
          x: shape.x - dw / 2,
          y: shape.y - dh / 2,
          width: dw,
          height: dh
        };
      }

      case 'triangle':
        if (shape.x1 !== undefined) {
          // Triangle with explicit points - calculate from points
          const minX = Math.min(shape.x1, shape.x2, shape.x3);
          const maxX = Math.max(shape.x1, shape.x2, shape.x3);
          const minY = Math.min(shape.y1, shape.y2, shape.y3);
          const maxY = Math.max(shape.y1, shape.y2, shape.y3);
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        } else {
          // Triangle with center point - x,y is center
          const ts = shape.size || 60;
          const th = ts * Math.sqrt(3) / 2;
          return { x: shape.x - ts / 2, y: shape.y - th * 2 / 3, width: ts, height: th };
        }

      default:
        return { x: shape.x || 0, y: shape.y || 0, width: 100, height: 100 };
    }
  }

  /**
   * Generate rough.js SVG element using rough.svg()
   */
  function getRoughSvgElement(roughSvg, shapeType, shapeData, roughOptions) {
    if (!roughSvg) return null;

    try {
      let element;
      switch (shapeType) {
        case 'rect':
          element = roughSvg.rectangle(shapeData.x, shapeData.y, shapeData.width, shapeData.height, roughOptions);
          break;
        case 'circle':
          element = roughSvg.circle(shapeData.x, shapeData.y, shapeData.radius * 2, roughOptions);
          break;
        case 'ellipse':
          element = roughSvg.ellipse(shapeData.x, shapeData.y, shapeData.rx * 2, shapeData.ry * 2, roughOptions);
          break;
        case 'polygon':
          element = roughSvg.polygon(shapeData.points, roughOptions);
          break;
        case 'line':
          element = roughSvg.line(shapeData.x1, shapeData.y1, shapeData.x2, shapeData.y2, roughOptions);
          break;
        default:
          return null;
      }
      // Convert DOM element to string
      if (element) {
        const serializer = new XMLSerializer();
        return serializer.serializeToString(element);
      }
    } catch (e) {
      console.warn('Failed to generate rough SVG:', e);
    }
    return null;
  }

  /**
   * Build SVG path data for rounded rect with individual corner radii
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} w - Width
   * @param {number} h - Height
   * @param {Object} radii - Corner radii { tl, tr, br, bl }
   * @returns {string} SVG path data
   */
  function buildRoundedRectPath(x, y, w, h, radii) {
    const { tl, tr, br, bl } = radii;
    return `M ${x + tl} ${y} ` +
      `L ${x + w - tr} ${y} ` +
      (tr > 0 ? `Q ${x + w} ${y} ${x + w} ${y + tr} ` : '') +
      `L ${x + w} ${y + h - br} ` +
      (br > 0 ? `Q ${x + w} ${y + h} ${x + w - br} ${y + h} ` : '') +
      `L ${x + bl} ${y + h} ` +
      (bl > 0 ? `Q ${x} ${y + h} ${x} ${y + h - bl} ` : '') +
      `L ${x} ${y + tl} ` +
      (tl > 0 ? `Q ${x} ${y} ${x + tl} ${y} ` : '') +
      'Z';
  }

  /**
   * Convert shape to SVG element
   */
  function shapeToSvg(shape, roughSvg) {
    // Use legacy if available
    if (typeof window.shapeToSVG === 'function') {
      return window.shapeToSVG(shape);
    }

    const stroke = shape.color || '#1e1e1e';
    const fill = shape.fillColor || 'none';
    const strokeWidth = shape.lineWidth || 2;
    const opacity = (shape.opacity ?? 100) / 100;

    // Check if sketchy mode is enabled (use global config setting, same as canvas renderer)
    const roughness = shape.roughness ?? config.tools?.defaultRoughness ?? 1;
    const isSketchy = roughSvg && config.tools?.renderMode === 'sketchy' && roughness > 0;
    const seed = shape.seed || 1;
    const roughOptions = isSketchy ? {
      seed: seed,
      roughness: roughness,
      stroke: stroke !== 'transparent' ? stroke : undefined,
      strokeWidth: strokeWidth,
      fill: fill !== 'transparent' ? fill : undefined,
      fillStyle: 'solid'
    } : null;

    // Stroke dasharray for dashed/dotted lines (always set, even in sketchy mode
    // for shapes that can't use rough.js like those with corner radius)
    let strokeDasharray = '';
    if (shape.strokeStyle === 'dashed') {
      strokeDasharray = ' stroke-dasharray="12 6"';
    } else if (shape.strokeStyle === 'dotted') {
      strokeDasharray = ' stroke-dasharray="3 6"';
    }

    // Build combined transform for rotation, flip, and tilt
    let transform = '';
    const bounds = getShapeBounds(shape, config);
    if (bounds) {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const transforms = [];

      // 1. Rotation
      if (shape.rotation) {
        const degrees = shape.rotation * (180 / Math.PI);
        transforms.push(`rotate(${degrees} ${cx} ${cy})`);
      }

      // 2. Flip (scale around center)
      if (shape.scaleX === -1 || shape.scaleY === -1) {
        const sx = shape.scaleX || 1;
        const sy = shape.scaleY || 1;
        transforms.push(`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`);
      }

      // 3. Tilt (skew + scale around center)
      if (shape.tiltX || shape.tiltY) {
        const tiltX = shape.tiltX || 0;
        const tiltY = shape.tiltY || 0;
        const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
        const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
        const skewX = Math.sin(tiltX) * 0.5;
        const skewY = Math.sin(tiltY) * 0.5;

        // SVG matrix: matrix(a, b, c, d, e, f)
        // Combined skew + scale: matrix(scaleY, skewY*scaleX, skewX*scaleY, scaleX, 0, 0)
        const a = scaleFromTiltY;
        const b = skewY * scaleFromTiltX;
        const c = skewX * scaleFromTiltY;
        const d = scaleFromTiltX;
        transforms.push(`translate(${cx} ${cy}) matrix(${a} ${b} ${c} ${d} 0 0) translate(${-cx} ${-cy})`);
      }

      if (transforms.length > 0) {
        transform = ` transform="${transforms.join(' ')}"`;
      }
    }

    const strokeAttr = stroke === 'transparent' ? 'none' : stroke;
    const fillAttr = fill === 'transparent' ? 'none' : fill;
    const commonAttrs = `stroke="${strokeAttr}" fill="${fillAttr}" stroke-width="${strokeWidth}" opacity="${opacity}"${strokeDasharray}${transform}`;

    let svg = '';

    switch (shape.type) {
      case 'rect': {
        const w = shape.width || 100;
        const h = shape.height || 100;
        const maxRadius = Math.min(w / 2, h / 2);

        // Only use sketchy mode for rects without corner radius (rough.js doesn't support rounded corners)
        if (isSketchy && !shape.cornerRadius && !shape.cornerRadii) {
          const roughSvgStr = getRoughSvgElement(roughSvg, 'rect', { x: shape.x, y: shape.y, width: w, height: h }, roughOptions);
          if (roughSvgStr) {
            svg = `<g opacity="${opacity}"${transform}>${roughSvgStr}</g>\n`;
            break;
          }
        }

        if (shape.cornerRadii) {
          // Individual corner radii - must use path
          const radii = {
            tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
            tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
            br: Math.min(shape.cornerRadii.br || 0, maxRadius),
            bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
          };
          const pathData = buildRoundedRectPath(shape.x, shape.y, w, h, radii);
          svg = `<path d="${pathData}" ${commonAttrs}/>\n`;
        } else if (shape.cornerRadius) {
          // Uniform corner radius - use rx/ry
          const r = Math.min(shape.cornerRadius, maxRadius);
          svg = `<rect x="${shape.x}" y="${shape.y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${commonAttrs}/>\n`;
        } else {
          svg = `<rect x="${shape.x}" y="${shape.y}" width="${w}" height="${h}" ${commonAttrs}/>\n`;
        }
        break;
      }

      case 'circle':
        if (isSketchy) {
          const roughSvgStr = getRoughSvgElement(roughSvg, 'circle', { x: shape.x, y: shape.y, radius: shape.radius }, roughOptions);
          if (roughSvgStr) {
            svg = `<g opacity="${opacity}"${transform}>${roughSvgStr}</g>\n`;
            break;
          }
        }
        svg = `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.radius}" ${commonAttrs}/>\n`;
        break;

      case 'ellipse': {
        const rx = shape.radiusX || shape.radius || 50;
        const ry = shape.radiusY || shape.radius || 50;
        if (isSketchy) {
          const roughSvgStr = getRoughSvgElement(roughSvg, 'ellipse', { x: shape.x, y: shape.y, rx, ry }, roughOptions);
          if (roughSvgStr) {
            svg = `<g opacity="${opacity}"${transform}>${roughSvgStr}</g>\n`;
            break;
          }
        }
        svg = `<ellipse cx="${shape.x}" cy="${shape.y}" rx="${rx}" ry="${ry}" ${commonAttrs}/>\n`;
        break;
      }

      case 'diamond': {
        const dw = shape.width || shape.size || 60;
        const dh = shape.height || shape.size || 60;
        if (isSketchy) {
          const points = [
            [shape.x, shape.y - dh/2],
            [shape.x + dw/2, shape.y],
            [shape.x, shape.y + dh/2],
            [shape.x - dw/2, shape.y]
          ];
          const roughSvgStr = getRoughSvgElement(roughSvg, 'polygon', { points }, roughOptions);
          if (roughSvgStr) {
            svg = `<g opacity="${opacity}"${transform}>${roughSvgStr}</g>\n`;
            break;
          }
        }
        const diamondPath = `M ${shape.x} ${shape.y - dh/2} L ${shape.x + dw/2} ${shape.y} L ${shape.x} ${shape.y + dh/2} L ${shape.x - dw/2} ${shape.y} Z`;
        svg = `<path d="${diamondPath}" ${commonAttrs}/>\n`;
        break;
      }

      case 'triangle': {
        let triPath;
        let triPoints;
        if (shape.x1 !== undefined) {
          triPath = `M ${shape.x1} ${shape.y1} L ${shape.x2} ${shape.y2} L ${shape.x3} ${shape.y3} Z`;
          triPoints = [[shape.x1, shape.y1], [shape.x2, shape.y2], [shape.x3, shape.y3]];
        } else {
          const ts = shape.size || 60;
          const th = ts * Math.sqrt(3) / 2;
          triPath = `M ${shape.x} ${shape.y - th * 2/3} L ${shape.x + ts/2} ${shape.y + th/3} L ${shape.x - ts/2} ${shape.y + th/3} Z`;
          triPoints = [
            [shape.x, shape.y - th * 2/3],
            [shape.x + ts/2, shape.y + th/3],
            [shape.x - ts/2, shape.y + th/3]
          ];
        }
        if (isSketchy) {
          const roughSvgStr = getRoughSvgElement(roughSvg, 'polygon', { points: triPoints }, roughOptions);
          if (roughSvgStr) {
            svg = `<g opacity="${opacity}"${transform}>${roughSvgStr}</g>\n`;
            break;
          }
        }
        svg = `<path d="${triPath}" ${commonAttrs}/>\n`;
        break;
      }

      case 'line':
        if (isSketchy && shape.curveType !== 'curved') {
          const roughSvgStr = getRoughSvgElement(roughSvg, 'line', { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 }, roughOptions);
          if (roughSvgStr) {
            svg = `<g opacity="${opacity}"${transform}>${roughSvgStr}</g>\n`;
            break;
          }
        }
        if (shape.curveType === 'curved' && shape.controlPoint) {
          const linePath = `M ${shape.x1} ${shape.y1} Q ${shape.controlPoint.x} ${shape.controlPoint.y} ${shape.x2} ${shape.y2}`;
          svg = `<path d="${linePath}" fill="none" ${commonAttrs}/>\n`;
        } else if (shape.curveType === 'curved' && shape.controlPoint1 && shape.controlPoint2) {
          const linePath = `M ${shape.x1} ${shape.y1} C ${shape.controlPoint1.x} ${shape.controlPoint1.y} ${shape.controlPoint2.x} ${shape.controlPoint2.y} ${shape.x2} ${shape.y2}`;
          svg = `<path d="${linePath}" fill="none" ${commonAttrs}/>\n`;
        } else {
          svg = `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${commonAttrs}/>\n`;
        }
        break;

      case 'arrow': {
        const arrowType = shape.arrowType || 'single';
        let markers = '';
        if (arrowType === 'single' || arrowType === 'double') {
          markers += ' marker-end="url(#arrowhead)"';
        }
        if (arrowType === 'double') {
          markers += ' marker-start="url(#arrowhead-start)"';
        }

        if (shape.curveType === 'curved' && shape.controlPoint) {
          const arrowPath = `M ${shape.x1} ${shape.y1} Q ${shape.controlPoint.x} ${shape.controlPoint.y} ${shape.x2} ${shape.y2}`;
          svg = `<g color="${stroke}"><path d="${arrowPath}" fill="none" ${commonAttrs}${markers}/></g>\n`;
        } else if (shape.curveType === 'curved' && shape.controlPoint1 && shape.controlPoint2) {
          const arrowPath = `M ${shape.x1} ${shape.y1} C ${shape.controlPoint1.x} ${shape.controlPoint1.y} ${shape.controlPoint2.x} ${shape.controlPoint2.y} ${shape.x2} ${shape.y2}`;
          svg = `<g color="${stroke}"><path d="${arrowPath}" fill="none" ${commonAttrs}${markers}/></g>\n`;
        } else {
          svg = `<g color="${stroke}"><line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${commonAttrs}${markers}/></g>\n`;
        }
        break;
      }

      case 'text': {
        const fontSize = shape.fontSize || 16;
        const fontFamily = shape.fontFamily || 'sans-serif';
        let textAnchor = 'start';
        let textX = shape.x;
        if (shape.align === 'center') {
          textAnchor = 'middle';
          if (shape.width) textX = shape.x + shape.width / 2;
        } else if (shape.align === 'right') {
          textAnchor = 'end';
          if (shape.width) textX = shape.x + shape.width;
        }

        let fontStyle = '';
        if (shape.bold) fontStyle += ' font-weight="bold"';
        if (shape.italic) fontStyle += ' font-style="italic"';

        let textDecoration = '';
        if (shape.underline) textDecoration = ' text-decoration="underline"';

        svg = `<text x="${textX}" y="${shape.y + fontSize}" fill="${strokeAttr}" font-size="${fontSize}" font-family="${fontFamily}" text-anchor="${textAnchor}"${fontStyle}${textDecoration} opacity="${opacity}"${transform}>${escapeXml(shape.text || '')}</text>\n`;
        break;
      }

      case 'freehand':
        if (shape.points && shape.points.length > 1) {
          let pathData = `M ${shape.points[0].x} ${shape.points[0].y}`;
          for (let i = 1; i < shape.points.length; i++) {
            pathData += ` L ${shape.points[i].x} ${shape.points[i].y}`;
          }
          svg = `<path d="${pathData}" fill="none" stroke="${strokeAttr}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${strokeDasharray}${transform}/>\n`;
        }
        break;

      case 'image': {
        if (shape.src) {
          const imgWidth = shape.width || 100;
          const imgHeight = shape.height || 100;
          const hasCornerRadius = shape.cornerRadius || shape.cornerRadii;

          if (hasCornerRadius) {
            // Use clipPath for rounded corners on images
            const clipId = 'clip-' + Math.random().toString(36).slice(2, 11);
            const maxRadius = Math.min(imgWidth / 2, imgHeight / 2);

            svg = `<g${transform}>\n`;
            svg += `  <defs>\n`;
            svg += `    <clipPath id="${clipId}">\n`;

            if (shape.cornerRadii) {
              // Individual corner radii - use path
              const radii = {
                tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
                tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
                br: Math.min(shape.cornerRadii.br || 0, maxRadius),
                bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
              };
              const pathData = buildRoundedRectPath(shape.x, shape.y, imgWidth, imgHeight, radii);
              svg += `      <path d="${pathData}"/>\n`;
            } else {
              // Uniform corner radius - use rect with rx/ry
              const r = Math.min(shape.cornerRadius, maxRadius);
              svg += `      <rect x="${shape.x}" y="${shape.y}" width="${imgWidth}" height="${imgHeight}" rx="${r}" ry="${r}"/>\n`;
            }

            svg += `    </clipPath>\n`;
            svg += `  </defs>\n`;
            svg += `  <image href="${shape.src}" x="${shape.x}" y="${shape.y}" width="${imgWidth}" height="${imgHeight}" opacity="${opacity}" clip-path="url(#${clipId})" preserveAspectRatio="none"/>\n`;
            svg += `</g>\n`;
          } else {
            svg = `<image href="${shape.src}" x="${shape.x}" y="${shape.y}" width="${imgWidth}" height="${imgHeight}" opacity="${opacity}"${transform} preserveAspectRatio="none"/>\n`;
          }
        }
        break;
      }

      case 'path': {
        if (shape.isCompound && shape.children) {
          let pathData = '';
          shape.children.forEach(child => {
            if (child.segments && child.segments.length > 0) {
              pathData += buildSvgPathData(child.segments, child.closed) + ' ';
            }
          });
          svg = `<path d="${pathData.trim()}" fill-rule="evenodd" ${commonAttrs}/>\n`;
        } else if (shape.segments && shape.segments.length > 0) {
          const pathData = buildSvgPathData(shape.segments, shape.closed);
          svg = `<path d="${pathData}" ${commonAttrs}/>\n`;
        }
        break;
      }

      case 'frame': {
        const frameId = 'frame-' + Math.random().toString(36).slice(2, 11);

        if (shape.clipContent) {
          svg = `<g>\n`;
          svg += `  <defs><clipPath id="${frameId}"><rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"/></clipPath></defs>\n`;

          if (fillAttr !== 'none') {
            svg += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${fillAttr}" stroke="none" opacity="${opacity}"/>\n`;
          }

          svg += `  <g clip-path="url(#${frameId})">\n`;
          if (shape.children) {
            shape.children.forEach(child => {
              svg += '    ' + shapeToSvg(child);
            });
          }
          svg += `  </g>\n`;

          if (strokeAttr !== 'none') {
            svg += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="none" stroke="${strokeAttr}" stroke-width="${strokeWidth}" opacity="${opacity}"${strokeDasharray}/>\n`;
          }

          svg += `</g>\n`;
        } else {
          svg = `<g>\n`;

          if (fillAttr !== 'none') {
            svg += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${fillAttr}" stroke="none" opacity="${opacity}"/>\n`;
          }

          if (shape.children) {
            shape.children.forEach(child => {
              svg += '  ' + shapeToSvg(child);
            });
          }

          if (strokeAttr !== 'none') {
            svg += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="none" stroke="${strokeAttr}" stroke-width="${strokeWidth}" opacity="${opacity}"${strokeDasharray}/>\n`;
          }

          svg += `</g>\n`;
        }
        break;
      }

      case 'group':
        if (shape.children) {
          svg = `<g${transform}>\n`;
          shape.children.forEach(child => {
            svg += shapeToSvg(child);
          });
          svg += `</g>\n`;
        }
        break;
    }

    return svg;
  }

  /**
   * Build SVG path data from segments
   */
  function buildSvgPathData(segments, closed) {
    if (!segments || segments.length === 0) return '';

    let d = `M ${segments[0].point[0]} ${segments[0].point[1]}`;

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const prevSeg = segments[i - 1];

      const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut[0] !== 0 || prevSeg.handleOut[1] !== 0);
      const hasHandleIn = seg.handleIn && (seg.handleIn[0] !== 0 || seg.handleIn[1] !== 0);

      if (hasHandleOut || hasHandleIn) {
        const cp1x = prevSeg.point[0] + (prevSeg.handleOut ? prevSeg.handleOut[0] : 0);
        const cp1y = prevSeg.point[1] + (prevSeg.handleOut ? prevSeg.handleOut[1] : 0);
        const cp2x = seg.point[0] + (seg.handleIn ? seg.handleIn[0] : 0);
        const cp2y = seg.point[1] + (seg.handleIn ? seg.handleIn[1] : 0);
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${seg.point[0]} ${seg.point[1]}`;
      } else {
        d += ` L ${seg.point[0]} ${seg.point[1]}`;
      }
    }

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
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstSeg.point[0]} ${firstSeg.point[1]}`;
      }
      d += ' Z';
    }

    return d;
  }

  /**
   * Escape XML special characters
   */
  function escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Download blob as file
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get export bounds with transform support (rotation, flip, tilt)
   */
  function getExportBounds(shapes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    shapes.forEach(s => {
      if (s.visible === false) return;
      const b = getShapeBounds(s, config);
      if (!b) return;

      const hasTransform = s.rotation || s.tiltX || s.tiltY || s.scaleX === -1 || s.scaleY === -1;

      if (hasTransform) {
        const centerX = b.x + b.width / 2;
        const centerY = b.y + b.height / 2;
        const corners = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y },
          { x: b.x + b.width, y: b.y + b.height },
          { x: b.x, y: b.y + b.height }
        ];

        corners.forEach(corner => {
          let tx = corner.x;
          let ty = corner.y;

          // Transform order (same as renderer): Rotation -> Flip -> Tilt

          // 1. Rotation
          if (s.rotation) {
            const cos = Math.cos(s.rotation);
            const sin = Math.sin(s.rotation);
            const dx = tx - centerX;
            const dy = ty - centerY;
            tx = centerX + dx * cos - dy * sin;
            ty = centerY + dx * sin + dy * cos;
          }

          // 2. Flip
          if (s.scaleX === -1 || s.scaleY === -1) {
            tx = centerX + (tx - centerX) * (s.scaleX || 1);
            ty = centerY + (ty - centerY) * (s.scaleY || 1);
          }

          // 3. Tilt (skew + scale)
          if (s.tiltX || s.tiltY) {
            const tiltX = s.tiltX || 0;
            const tiltY = s.tiltY || 0;
            const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
            const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
            const skewX = Math.sin(tiltX) * 0.5;
            const skewY = Math.sin(tiltY) * 0.5;

            const dx = tx - centerX;
            const dy = ty - centerY;

            const scaledX = dx * scaleFromTiltY;
            const scaledY = dy * scaleFromTiltX;
            tx = centerX + scaledX + skewX * scaledY;
            ty = centerY + skewY * scaledX + scaledY;
          }

          minX = Math.min(minX, tx);
          minY = Math.min(minY, ty);
          maxX = Math.max(maxX, tx);
          maxY = Math.max(maxY, ty);
        });
      } else {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
    });

    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }

  /**
   * Copy selection as PNG to clipboard
   */
  async function copySelectionAsPng() {
    if (state.selectedIndices.length === 0) {
      console.warn('No shapes selected');
      return;
    }

    const selectedShapes = state.selectedIndices
      .map(i => state.shapes[i])
      .filter(s => s && s.visible !== false);

    if (selectedShapes.length === 0) return;

    const bounds = getExportBounds(selectedShapes);
    if (!bounds) return;

    const padding = 10;
    const { minX, minY, maxX, maxY } = bounds;
    const x = minX - padding;
    const y = minY - padding;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // Transparent background
    tempCtx.clearRect(0, 0, width, height);
    tempCtx.translate(-x, -y);

    // Use legacy renderer if available
    let tempRc = null;
    try {
      if (typeof rough !== 'undefined') {
        tempRc = rough.canvas(tempCanvas);
      }
    } catch (e) {}

    if (typeof window.drawShapeToContext === 'function') {
      selectedShapes.forEach(s => {
        window.drawShapeToContext(s, tempCtx, tempRc);
      });
    }

    try {
      const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  }

  /**
   * Copy selection as SVG to clipboard
   */
  async function copySelectionAsSvg() {
    if (state.selectedIndices.length === 0) {
      console.warn('No shapes selected');
      return;
    }

    const selectedShapes = state.selectedIndices
      .map(i => state.shapes[i])
      .filter(s => s && s.visible !== false);

    if (selectedShapes.length === 0) return;

    const bounds = getExportBounds(selectedShapes);
    if (!bounds) return;

    const padding = 10;
    const { minX, minY, maxX, maxY } = bounds;
    const x = minX - padding;
    const y = minY - padding;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">\n`;
    svg += `<defs>\n`;
    svg += `  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">\n`;
    svg += `    <polygon points="0 0, 10 3.5, 0 7" fill="currentColor"/>\n`;
    svg += `  </marker>\n`;
    svg += `  <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">\n`;
    svg += `    <polygon points="10 0, 0 3.5, 10 7" fill="currentColor"/>\n`;
    svg += `  </marker>\n`;
    svg += `</defs>\n`;

    selectedShapes.forEach(s => {
      svg += shapeToSvg(s);
    });

    svg += '</svg>';

    try {
      await navigator.clipboard.writeText(svg);
    } catch (err) {
      console.error('Failed to copy SVG:', err);
    }
  }

  /**
   * Render shapes to a given context (for export)
   */
  function renderShapesToContext(targetCtx, shapes) {
    let tempRc = null;
    try {
      if (typeof rough !== 'undefined') {
        tempRc = rough.canvas(targetCtx.canvas);
      }
    } catch (e) {}

    shapes.forEach(shape => {
      if (shape.visible === false) return;
      drawShapeToExportContext(shape, targetCtx, tempRc);
    });
  }

  /**
   * Draw a single shape to export context
   */
  function drawShapeToExportContext(shape, c, roughCanvas) {
    c.save();

    // Apply rotation if shape has rotation
    if (shape.rotation) {
      const bounds = getShapeBoundsForExport(shape);
      if (bounds) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        c.translate(centerX, centerY);
        c.rotate(shape.rotation);
        c.translate(-centerX, -centerY);
      }
    }

    // Apply flip (scaleX/scaleY)
    if (shape.scaleX === -1 || shape.scaleY === -1) {
      const bounds = getShapeBoundsForExport(shape);
      if (bounds) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        c.translate(centerX, centerY);
        c.scale(shape.scaleX || 1, shape.scaleY || 1);
        c.translate(-centerX, -centerY);
      }
    }

    // Apply 3D tilt transforms
    if (shape.tiltX || shape.tiltY) {
      const bounds = getShapeBoundsForExport(shape);
      if (bounds) {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const tiltX = shape.tiltX || 0;
        const tiltY = shape.tiltY || 0;
        const scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
        const scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
        const skewX = Math.sin(tiltX) * 0.5;
        const skewY = Math.sin(tiltY) * 0.5;

        c.translate(centerX, centerY);
        if (skewX !== 0 || skewY !== 0) {
          c.transform(1, skewY, skewX, 1, 0, 0);
        }
        c.scale(scaleFromTiltY, scaleFromTiltX);
        c.translate(-centerX, -centerY);
      }
    }

    // Apply opacity
    const opacity = (shape.opacity ?? 100) / 100;
    c.globalAlpha = opacity;

    const stroke = shape.color || '#1e1e1e';
    const fill = shape.fillColor || 'transparent';
    const lineWidth = shape.lineWidth || 2;

    // Check if sketchy mode is enabled (use global config setting, same as canvas renderer)
    const roughness = shape.roughness ?? config.tools?.defaultRoughness ?? 1;
    const isSketchy = roughCanvas && config.tools?.renderMode === 'sketchy' && roughness > 0;
    const seed = shape.seed || 1;
    const roughOptions = isSketchy ? {
      seed: seed,
      roughness: roughness,
      stroke: stroke !== 'transparent' ? stroke : undefined,
      strokeWidth: lineWidth,
      fill: fill !== 'transparent' ? fill : undefined,
      fillStyle: 'solid'
    } : null;

    // Always set canvas context styles (needed for shapes that don't use rough.js,
    // including shapes with corner radius in sketchy mode)
    if (shape.strokeStyle === 'dashed') {
      c.setLineDash([12, 6]);
    } else if (shape.strokeStyle === 'dotted') {
      c.setLineDash([3, 6]);
    } else {
      c.setLineDash([]);
    }

    c.strokeStyle = stroke;
    c.fillStyle = fill;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    switch (shape.type) {
      case 'rect': {
        const w = shape.width || 100;
        const h = shape.height || 100;
        const maxRadius = Math.min(w / 2, h / 2);
        const hasCornerRadius = shape.cornerRadius || shape.cornerRadii;

        // Only use sketchy for rects without corner radius (rough.js doesn't support rounded corners)
        if (isSketchy && !hasCornerRadius) {
          roughCanvas.rectangle(shape.x, shape.y, w, h, roughOptions);
        } else {
          c.beginPath();
          if (shape.cornerRadii) {
            // Individual corner radii
            const radii = {
              tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
              tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
              br: Math.min(shape.cornerRadii.br || 0, maxRadius),
              bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
            };
            drawRoundedRectPath(c, shape.x, shape.y, w, h, radii);
          } else if (shape.cornerRadius && c.roundRect) {
            const r = Math.min(shape.cornerRadius, maxRadius);
            c.roundRect(shape.x, shape.y, w, h, r);
          } else {
            c.rect(shape.x, shape.y, w, h);
          }
          if (fill !== 'transparent') c.fill();
          if (stroke !== 'transparent') c.stroke();
        }
        break;
      }

      case 'ellipse': {
        const rx = shape.radiusX || shape.radius || 50;
        const ry = shape.radiusY || shape.radius || 50;
        if (isSketchy) {
          roughCanvas.ellipse(shape.x, shape.y, rx * 2, ry * 2, roughOptions);
        } else {
          c.beginPath();
          c.ellipse(shape.x, shape.y, rx, ry, 0, 0, Math.PI * 2);
          if (fill !== 'transparent') c.fill();
          if (stroke !== 'transparent') c.stroke();
        }
        break;
      }

      case 'circle': {
        const r = shape.radius || 50;
        if (isSketchy) {
          roughCanvas.circle(shape.x, shape.y, r * 2, roughOptions);
        } else {
          c.beginPath();
          c.arc(shape.x, shape.y, r, 0, Math.PI * 2);
          if (fill !== 'transparent') c.fill();
          if (stroke !== 'transparent') c.stroke();
        }
        break;
      }

      case 'diamond': {
        // Diamond uses x,y as CENTER point (consistent with SVG export and bounds calculation)
        const hw = (shape.width || 60) / 2;
        const hh = (shape.height || 60) / 2;
        const diamondPoints = [
          [shape.x, shape.y - hh],    // Top
          [shape.x + hw, shape.y],    // Right
          [shape.x, shape.y + hh],    // Bottom
          [shape.x - hw, shape.y]     // Left
        ];
        if (isSketchy) {
          roughCanvas.polygon(diamondPoints, roughOptions);
        } else {
          c.beginPath();
          c.moveTo(diamondPoints[0][0], diamondPoints[0][1]);
          c.lineTo(diamondPoints[1][0], diamondPoints[1][1]);
          c.lineTo(diamondPoints[2][0], diamondPoints[2][1]);
          c.lineTo(diamondPoints[3][0], diamondPoints[3][1]);
          c.closePath();
          if (fill !== 'transparent') c.fill();
          if (stroke !== 'transparent') c.stroke();
        }
        break;
      }

      case 'triangle': {
        let triPoints;
        if (shape.x1 !== undefined) {
          triPoints = [
            [shape.x1, shape.y1],
            [shape.x2, shape.y2],
            [shape.x3, shape.y3]
          ];
        } else {
          const size = shape.size || 60;
          const height = size * Math.sqrt(3) / 2;
          triPoints = [
            [shape.x, shape.y - height * 2/3],
            [shape.x + size/2, shape.y + height/3],
            [shape.x - size/2, shape.y + height/3]
          ];
        }
        if (isSketchy) {
          roughCanvas.polygon(triPoints, roughOptions);
        } else {
          c.beginPath();
          c.moveTo(triPoints[0][0], triPoints[0][1]);
          c.lineTo(triPoints[1][0], triPoints[1][1]);
          c.lineTo(triPoints[2][0], triPoints[2][1]);
          c.closePath();
          if (fill !== 'transparent') c.fill();
          if (stroke !== 'transparent') c.stroke();
        }
        break;
      }

      case 'line':
      case 'arrow':
        if (isSketchy && shape.curveType !== 'curved') {
          // Rough.js line (straight only)
          roughCanvas.line(shape.x1, shape.y1, shape.x2, shape.y2, roughOptions);
        } else {
          c.beginPath();
          if (shape.curveType === 'curved' && shape.controlPoint) {
            c.moveTo(shape.x1, shape.y1);
            c.quadraticCurveTo(shape.controlPoint.x, shape.controlPoint.y, shape.x2, shape.y2);
          } else {
            c.moveTo(shape.x1, shape.y1);
            c.lineTo(shape.x2, shape.y2);
          }
          c.stroke();
        }

        // Draw arrowhead for arrow type (always with canvas API for precision)
        if (shape.type === 'arrow') {
          const arrowType = shape.arrowType || 'single';
          if (arrowType === 'single' || arrowType === 'double') {
            drawExportArrowhead(c, shape.x1, shape.y1, shape.x2, shape.y2, lineWidth, stroke);
          }
          if (arrowType === 'double') {
            drawExportArrowhead(c, shape.x2, shape.y2, shape.x1, shape.y1, lineWidth, stroke);
          }
        }
        break;

      case 'text':
        c.font = `${shape.bold ? 'bold ' : ''}${shape.italic ? 'italic ' : ''}${shape.fontSize || 16}px ${shape.fontFamily || 'sans-serif'}`;
        c.textBaseline = 'top';
        c.textAlign = shape.align || 'left';
        const textX = shape.align === 'center' ? shape.x + (shape.width || 0) / 2 :
                      shape.align === 'right' ? shape.x + (shape.width || 0) : shape.x;
        c.fillStyle = stroke;
        c.fillText(shape.text || '', textX, shape.y);
        break;

      case 'image': {
        if (shape.imageElement) {
          const imgW = shape.width || 100;
          const imgH = shape.height || 100;
          const hasCornerRadius = shape.cornerRadius || shape.cornerRadii;

          if (hasCornerRadius) {
            // Clip to rounded rect for border radius
            c.save();
            c.beginPath();
            const maxRadius = Math.min(imgW / 2, imgH / 2);
            if (shape.cornerRadii) {
              const radii = {
                tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
                tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
                br: Math.min(shape.cornerRadii.br || 0, maxRadius),
                bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
              };
              drawRoundedRectPath(c, shape.x, shape.y, imgW, imgH, radii);
            } else if (c.roundRect) {
              const r = Math.min(shape.cornerRadius, maxRadius);
              c.roundRect(shape.x, shape.y, imgW, imgH, r);
            }
            c.clip();
            c.drawImage(shape.imageElement, shape.x, shape.y, imgW, imgH);
            c.restore();
          } else {
            c.drawImage(shape.imageElement, shape.x, shape.y, imgW, imgH);
          }
        }
        break;
      }

      case 'video': {
        if (shape.videoElement) {
          const vidW = shape.width || 100;
          const vidH = shape.height || 100;
          const hasCornerRadius = shape.cornerRadius || shape.cornerRadii;

          if (hasCornerRadius) {
            // Clip to rounded rect for border radius
            c.save();
            c.beginPath();
            const maxRadius = Math.min(vidW / 2, vidH / 2);
            if (shape.cornerRadii) {
              const radii = {
                tl: Math.min(shape.cornerRadii.tl || 0, maxRadius),
                tr: Math.min(shape.cornerRadii.tr || 0, maxRadius),
                br: Math.min(shape.cornerRadii.br || 0, maxRadius),
                bl: Math.min(shape.cornerRadii.bl || 0, maxRadius)
              };
              drawRoundedRectPath(c, shape.x, shape.y, vidW, vidH, radii);
            } else if (c.roundRect) {
              const r = Math.min(shape.cornerRadius, maxRadius);
              c.roundRect(shape.x, shape.y, vidW, vidH, r);
            }
            c.clip();
            c.drawImage(shape.videoElement, shape.x, shape.y, vidW, vidH);
            c.restore();
          } else {
            c.drawImage(shape.videoElement, shape.x, shape.y, vidW, vidH);
          }
        }
        break;
      }

      case 'freehand':
        if (shape.points && shape.points.length > 1) {
          c.beginPath();
          c.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            c.lineTo(shape.points[i].x, shape.points[i].y);
          }
          c.stroke();
        }
        break;

      case 'path':
        if (shape.segments && shape.segments.length > 0) {
          c.beginPath();
          const segments = shape.segments;
          c.moveTo(segments[0].point[0], segments[0].point[1]);

          for (let i = 1; i < segments.length; i++) {
            const seg = segments[i];
            const prevSeg = segments[i - 1];

            const hasHandleOut = prevSeg.handleOut && (prevSeg.handleOut[0] !== 0 || prevSeg.handleOut[1] !== 0);
            const hasHandleIn = seg.handleIn && (seg.handleIn[0] !== 0 || seg.handleIn[1] !== 0);

            if (hasHandleOut || hasHandleIn) {
              const cp1x = prevSeg.point[0] + (prevSeg.handleOut ? prevSeg.handleOut[0] : 0);
              const cp1y = prevSeg.point[1] + (prevSeg.handleOut ? prevSeg.handleOut[1] : 0);
              const cp2x = seg.point[0] + (seg.handleIn ? seg.handleIn[0] : 0);
              const cp2y = seg.point[1] + (seg.handleIn ? seg.handleIn[1] : 0);
              c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, seg.point[0], seg.point[1]);
            } else {
              c.lineTo(seg.point[0], seg.point[1]);
            }
          }

          // Handle closing the path with curves
          if (shape.closed && segments.length > 2) {
            const lastSeg = segments[segments.length - 1];
            const firstSeg = segments[0];

            const hasHandleOut = lastSeg.handleOut && (lastSeg.handleOut[0] !== 0 || lastSeg.handleOut[1] !== 0);
            const hasHandleIn = firstSeg.handleIn && (firstSeg.handleIn[0] !== 0 || firstSeg.handleIn[1] !== 0);

            if (hasHandleOut || hasHandleIn) {
              const cp1x = lastSeg.point[0] + (lastSeg.handleOut ? lastSeg.handleOut[0] : 0);
              const cp1y = lastSeg.point[1] + (lastSeg.handleOut ? lastSeg.handleOut[1] : 0);
              const cp2x = firstSeg.point[0] + (firstSeg.handleIn ? firstSeg.handleIn[0] : 0);
              const cp2y = firstSeg.point[1] + (firstSeg.handleIn ? firstSeg.handleIn[1] : 0);
              c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, firstSeg.point[0], firstSeg.point[1]);
            }
            c.closePath();
          } else if (shape.closed) {
            c.closePath();
          }

          if (fill !== 'transparent') c.fill();
          if (stroke !== 'transparent') c.stroke();
        }
        break;

      case 'frame':
        // Draw frame background
        if (fill !== 'transparent') {
          c.fillRect(shape.x, shape.y, shape.width, shape.height);
        }
        // Draw children
        if (shape.children) {
          c.save();
          if (shape.clipContent) {
            c.beginPath();
            c.rect(shape.x, shape.y, shape.width, shape.height);
            c.clip();
          }
          shape.children.forEach(child => {
            if (child.visible !== false) {
              drawShapeToExportContext(child, c, roughCanvas);
            }
          });
          c.restore();
        }
        // Draw frame border
        if (stroke !== 'transparent') {
          c.strokeRect(shape.x, shape.y, shape.width, shape.height);
        }
        break;

      case 'group':
        if (shape.children) {
          shape.children.forEach(child => {
            if (child.visible !== false) {
              drawShapeToExportContext(child, c, roughCanvas);
            }
          });
        }
        break;
    }

    c.restore();
  }

  /**
   * Draw arrowhead helper for export
   */
  function drawExportArrowhead(c, x1, y1, x2, y2, lineWidth, color) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, lineWidth * 4);

    c.save();
    c.translate(x2, y2);
    c.rotate(angle);
    c.fillStyle = color;

    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-headLen, -headLen * 0.5);
    c.lineTo(-headLen, headLen * 0.5);
    c.closePath();
    c.fill();

    c.restore();
  }

  // Expose functions globally for MenuPanel and other UI components
  window.renderShapesToContext = renderShapesToContext;
  window.drawShapeToContext = drawShapeToExportContext;
  window.renderFrameToCanvas = renderFrameToCanvas;
  window.renderShapeForExport = renderShapeForExport;
  window.drawExportWatermark = drawExportWatermark;
  window.exportPNG = exportAsPng;
  window.exportSVG = exportAsSvg;
  window.exportJSON = exportAsJson;
  window.importJSON = triggerImport;
  window.exportAsPng = exportAsPng;
  window.exportAsSvg = exportAsSvg;
  window.saveAsJson = exportAsJson;
  window.importFromJson = importFromJson;
  window.loadProject = importFromJson; // Alias for FooterControls.vue
  window.exportVideo = exportVideo;
  window.exportPresentationVideo = exportPresentationVideo;
  window.exportFrameAsPng = exportFrameAsPng;
  window.exportFrameAsSvg = exportFrameAsSvg;
  window.copySelectedAsPng = copySelectionAsPng;
  window.copySelectedAsSvg = copySelectionAsSvg;
  window.getContentBounds = getContentBounds;
  window.getContentBoundsWithStroke = getContentBoundsWithStroke;

  return {
    exportAsPng,
    exportAsSvg,
    exportAsJson,
    importFromJson,
    triggerImport,
    exportVideo,
    exportPresentationVideo,
    exportFrameAsPng,
    exportFrameAsSvg,
    getContentBounds,
    getContentBoundsWithStroke,
    getExportBounds,
    copySelectionAsPng,
    copySelectionAsSvg,
    shapeToSvg,
    buildSvgPathData,
    renderFrameToCanvas,
    renderShapeForExport
  };
}

// Singleton instance
let exportInstance = null;

/**
 * Get or create export instance
 */
export function getExport() {
  if (!exportInstance) {
    exportInstance = useExport();
  }
  return exportInstance;
}

export default useExport;
