// editor/config/defaults.js
// Centralized configuration - proper ES module (no string generation)

export const defaultConfig = {
  // Canvas defaults
  canvas: {
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
  },

  // Theming
  theme: {
    darkMode: true,
    colors: {
      // Accent color (used for selection, active states)
      accent: '#6366f1',
      accentHover: '#4f46e5',
      accentLight: 'rgba(99, 102, 241, 0.1)',

      // Selection & guides
      selection: '#6366f1',
      snapGuide: '#f472b6',

      // Default shape colors
      defaultStroke: '#1e1e1e',
      defaultFill: '#d3f9d8',

      // Frame colors
      frameStroke: '#6366f1',
      frameFill: 'transparent',
      frameLabelBg: '#6366f1',
      frameLabelText: '#ffffff',

      // Stroke color palette
      strokePalette: [
        'transparent', // No stroke
        '#1e1e1e', // Black
        '#e03131', // Red
        '#2f9e44', // Green
        '#1971c2', // Blue
        '#f08c00', // Orange
        '#6741d9', // Purple
      ],

      // Fill color palette
      fillPalette: [
        'transparent',
        '#ffe8e8', // Light red
        '#d3f9d8', // Light green
        '#d0ebff', // Light blue
        '#fff3bf', // Light yellow
        '#e5dbff', // Light purple
        '#e03131', // Red
      ],

      // Arrow/line connection colors
      connected: '#6366f1',           // Connected endpoint handle fill
      connectedStroke: '#8688f4ff',     // Connected endpoint handle stroke
      connectionHighlight: '#6366f1', // Shape highlight stroke when dragging endpoint nearby
      connectionHighlightFill: 'rgba(16, 185, 129, 0.15)', // Shape highlight fill
    },
  },

  // Layers panel
  layers: {
    autoCloseOnClickOutside: true,
  },

  // Context menu options
  contextMenu: {
    viewportPadding: 20,
  },

  // Toolbar visibility options
  toolbar: {
    showLayersButton: true,
    showThemeToggle: true,
    showShapeTools: true,
    showDrawingTools: true,
    showTextTool: true,
    showImageTool: true,
    showEraserTool: true,
    showFrameTool: true,
  },

  // Frame options
  frame: {
    defaultWidth: 400,
    defaultHeight: 300,
    labelFontSize: 14,
    labelPadding: 4,
    labelOffset: 2,
    clipContent: true,
  },

  // Image crop options
  crop: {
    handleStyle: 'lshape',
    handleSize: 16,
    handleColor: '#ffffff',
    handleBorderColor: '#6366f1',
  },

  // Text/font options
  text: {
    fonts: [
      'Sans-serif',
      'Serif',
      'Monospace',
      'Cursive',
      'Arial',
      'Helvetica',
      'Georgia',
      'Times New Roman',
      'Courier New',
      'Verdana',
      'Trebuchet MS',
      'Impact',
      'Comic Sans MS',
      'Palatino',
      'Garamond',
      'Bookman',
      'Tahoma',
      'Lucida Console'
    ],
    defaultFont: 'Sans-serif',
    defaultSize: 20,
    defaultLineHeight: 1,
    allowBold: true,
    allowItalic: true,
    allowUnderline: true,
  },

  // Tool defaults
  tools: {
    defaultTool: 'select',
    defaultStrokeWidth: 2,
    strokeWidthOptions: [1, 2, 4],
    autoSwitchToSelect: true,
    renderMode: 'sketchy',
    roughnessLevels: [0, 1, 2],
    defaultRoughness: 1,
    strokeStyles: ['solid', 'dashed', 'dotted'],
    defaultStrokeStyle: 'solid',
    edgeStyles: ['sharp', 'round'],
    defaultEdgeStyle: 'sharp',
    arrowTypes: ['single', 'double', 'none'],
    defaultArrowType: 'single',
    arrowHeadStyles: ['triangle', 'open', 'diamond', 'circle'],
    defaultArrowHeadStyle: 'triangle',
    arrowHeadSizes: ['small', 'medium', 'large'],
    defaultArrowHeadSize: 'medium',
  },

  // Control point handle settings
  controlPoint: {
    handleSize: 8,
    handleFill: '#ffffff',
    handleStroke: '#6366f1',
    lineColor: '#6366f1',
    lineWidth: 1,
    lineDash: [4, 4],
  },

  // Cursor path settings (for animated cursor keyframes)
  cursorPath: {
    // Default time gap between cursor keyframes (seconds)
    defaultKeyframeGap: 1,
    // Default hold time at each keyframe (seconds) - cursor pauses at position
    defaultHoldTime: 0,
    // Path line
    lineWidth: 2,
    lineDash: [6, 4],
    // Keyframe handles
    keyframeSize: 5,
    keyframeActiveSize: 7,
    keyframeFill: '#6366f1',       // Uses pathColor by default
    keyframeActiveFill: '#ffffff',
    keyframeStroke: '#6366f1',     // Uses pathColor by default
    keyframeStrokeWidth: 2,
    // Selected keyframe highlight (uses theme selection color)
    keyframeSelectedSize: 9,
    keyframeSelectedFill: '#6366f1',
    keyframeSelectedStroke: '#ffffff',
    keyframeSelectedStrokeWidth: 3,
    keyframeSelectedGlow: true,
    keyframeSelectedGlowColor: '#6366f1',
    keyframeSelectedGlowBlur: 8,
    // Control point handles
    controlPointSize: 4,
    controlInColor: '#ff6b6b',
    controlOutColor: '#4ade80',
    controlLineWidth: 1,
    controlLineDash: [3, 3],
    // Click markers
    clickMarkerSize: 8,
    clickMarkerInnerSize: 3,
    clickMarkerStrokeWidth: 2,
    // Labels
    labelFontSize: 10,
    labelOffset: 12,
    // Hit testing
    hitThreshold: 12,
  },

  // Viewport keyframes (camera animation)
  viewportKeyframes: {
    enabled: true,
    defaultEasing: 'ease-in-out',
    clipDuration: 3,              // Duration in seconds for keyframe clips
    easingOptions: ['linear', 'ease-in', 'ease-out', 'ease-in-out'],
  },

  // Recording (screen/webcam capture)
  recording: {
    // Capture constraints
    defaultScreenConstraints: { video: { width: 1920, height: 1080, frameRate: 30 } },
    defaultWebcamConstraints: { video: { width: 640, height: 480, frameRate: 30 } },
    defaultAudioConstraints: { audio: { echoCancellation: true, noiseSuppression: true } },

    // Webcam shape defaults
    webcamShape: {
      width: 180,
      height: 140,
      circular: true,
      position: 'bottom-right',
      borderWidth: 4,
      margin: 24,
    },

    // Recording output
    format: 'video/webm;codecs=vp9,opus',
    videoBitrate: 5_000_000,
    audioBitrate: 128_000,

    // UI
    indicatorSize: 12,
    indicatorBlinkRate: 1000,
  },

  // Vector edit mode settings
  vectorEdit: {
    enabled: true,
    showOriginalShape: false,
    anchorSize: 8,
    anchorFill: '#ffffff',
    anchorStroke: '#6366f1',
    anchorSelectedFill: '#6366f1',
    handleSize: 6,
    handleFill: '#ffffff',
    handleStroke: '#6366f1',
    handleLineColor: '#6366f1',
    handleLineWidth: 1,
    hitTolerance: 10,
  },

  // Zoom settings
  zoom: {
    min: 0.1,
    max: 5,
    step: 0.05,
    default: 0.4,
    enableGestures: true,
  },

  // Pan settings
  pan: {
    enableGestures: true,
  },

  // Scroll settings
  scroll: {
    enableGestures: true,
  },

  // Snap settings
  snap: {
    enabled: true,
    threshold: 5,
    showInContextMenu: true,
    showSnapMarkers: true,
    showDimensions: true,
    guideStyle: {
      color: '#f472b6',
      lineWidth: 1,
      lineDash: [],
    },
    markerStyle: {
      color: '#f472b6',
      size: 8,
      lineWidth: 1.5,
    },
    dimensionStyle: {
      backgroundColor: 'rgba(244, 114, 182, 0.9)',
      textColor: '#ffffff',
      fontSize: 16,
      padding: 4,
    },
  },

  // Selection style settings
  selection: {
    color: '#6366f1',
    lineWidth: 1,
    lineDash: [5, 5],
    handleStyle: 'circle',
    handleSize: 10,
    handleFill: '#ffffff',
    handleStroke: '#6366f1',
    rotationHandleOffset: 25,
    showRotationLine: false,
    showMiddleHandles: false,
    // Tilt handles (3D perspective tilt)
    tiltHandleSize: 5,
    tiltXHandleStroke: '#ef4444',   // Red for X-axis tilt
    tiltXHandleFill: '#fecaca',     // Light red fill
    tiltYHandleStroke: '#3b82f6',   // Blue for Y-axis tilt
    tiltYHandleFill: '#bfdbfe',     // Light blue fill
  },

  // History settings
  history: {
    maxStates: 50,
  },

  // UI settings
  ui: {
    showHelpText: true,
    panelAnimationDuration: 150,
  },

  // Video editor extensions
  video: {
    enabled: false,
    defaultDuration: 60,
    fps: 30, //Used for playback preview in the editor (real-time canvas playback)
    defaultClipDuration: 5,
    defaultPreset: '720p',
    disableScroll: true, // Disable mouse wheel scrolling in video mode (panning still works)
    hidePanTool: false, // Hide the pan/hand tool in the toolbar in video mode
  },

  // Export settings
  export: {
    padding: 0,
    defaultFps: 60,           // Used for video export. Default export FPS (60 recommended for smooth cursor animation)
    fpsOptions: [24, 30, 60], // Available FPS options in export modal
    defaultFormat: 'mp4',     // Default export format ('mp4' or 'webm')
  },

  // Effects (video mode only)
  effects: {
    enabled: true,
    defaultDuration: 5,
    items: [
      { id: 'dropShadow', name: 'Drop Shadow', icon: 'shadow' },
      { id: 'glow', name: 'Glow', icon: 'glow' },
      { id: 'outline', name: 'Outline', icon: 'outline' },
      { id: 'vignette', name: 'Vignette', icon: 'vignette' },
      { id: 'blur', name: 'Blur', icon: 'blur' },
      { id: 'grain', name: 'Film Grain', icon: 'grain' },
      { id: 'glitch', name: 'Glitch', icon: 'glitch' },
      { id: 'chromatic', name: 'Chromatic Aberration', icon: 'chromatic' },
      { id: 'pixelate', name: 'Pixelate', icon: 'pixelate' },
      { id: 'sharpen', name: 'Sharpen', icon: 'sharpen' },
      { id: 'emboss', name: 'Emboss', icon: 'emboss' },
    ],
  },

  // Filters (video mode only)
  filters: {
    enabled: true,
    defaultDuration: 5,
    items: [
      { id: 'brightness', name: 'Brightness', icon: 'brightness', min: 0, max: 200, default: 100 },
      { id: 'contrast', name: 'Contrast', icon: 'contrast', min: 0, max: 200, default: 100 },
      { id: 'saturation', name: 'Saturation', icon: 'saturation', min: 0, max: 200, default: 100 },
      { id: 'hueRotate', name: 'Hue Rotate', icon: 'hue', min: 0, max: 360, default: 0 },
      { id: 'grayscale', name: 'Grayscale', icon: 'grayscale', min: 0, max: 100, default: 0 },
      { id: 'sepia', name: 'Sepia', icon: 'sepia', min: 0, max: 100, default: 0 },
      { id: 'invert', name: 'Invert', icon: 'invert', min: 0, max: 100, default: 0 },
      { id: 'temperature', name: 'Temperature', icon: 'temperature', min: -100, max: 100, default: 0 },
    ],
  },

  // Transitions (video mode only)
  transitions: {
    enabled: true,
    defaultDuration: 1,
    items: [
      { id: 'fade', name: 'Fade', icon: 'fade' },
      { id: 'dissolve', name: 'Dissolve', icon: 'dissolve' },
      { id: 'wipeLeft', name: 'Wipe Left', icon: 'wipe' },
      { id: 'wipeRight', name: 'Wipe Right', icon: 'wipe' },
      { id: 'wipeUp', name: 'Wipe Up', icon: 'wipe' },
      { id: 'wipeDown', name: 'Wipe Down', icon: 'wipe' },
      { id: 'slideLeft', name: 'Slide Left', icon: 'slide' },
      { id: 'slideRight', name: 'Slide Right', icon: 'slide' },
      { id: 'slideUp', name: 'Slide Up', icon: 'slide' },
      { id: 'slideDown', name: 'Slide Down', icon: 'slide' },
      { id: 'zoomIn', name: 'Zoom In', icon: 'zoom' },
      { id: 'zoomOut', name: 'Zoom Out', icon: 'zoom' },
      { id: 'crossZoom', name: 'Cross Zoom', icon: 'zoom' },
      { id: 'kenBurns', name: 'Ken Burns', icon: 'kenBurns' },
      { id: 'blur', name: 'Blur', icon: 'blur' },
      { id: 'spin', name: 'Spin', icon: 'spin' },
      { id: 'flip', name: 'Flip', icon: 'flip' },
      { id: 'bounce', name: 'Bounce', icon: 'bounce' },
      { id: 'elastic', name: 'Elastic', icon: 'elastic' },
    ],
  },

  // Per-clip FX (video mode - applied to individual clips/shapes)
  clipFx: {
    // Per-clip filters
    filters: {
      enabled: true,
      items: [
        { id: 'brightness', name: 'Brightness', icon: 'brightness', min: 0, max: 200, step: 1, unit: '%', default: 100 },
        { id: 'contrast', name: 'Contrast', icon: 'contrast', min: 0, max: 200, step: 1, unit: '%', default: 100 },
        { id: 'saturation', name: 'Saturation', icon: 'saturation', min: 0, max: 200, step: 1, unit: '%', default: 100 },
        { id: 'grayscale', name: 'Grayscale', icon: 'grayscale', min: 0, max: 100, step: 1, unit: '%', default: 0 },
        { id: 'sepia', name: 'Sepia', icon: 'sepia', min: 0, max: 100, step: 1, unit: '%', default: 0 },
        { id: 'blur', name: 'Blur', icon: 'blur', min: 0, max: 20, step: 1, unit: 'px', default: 0 },
        { id: 'hueRotate', name: 'Hue Rotate', icon: 'hue', min: 0, max: 360, step: 1, unit: '°', default: 0 },
        { id: 'invert', name: 'Invert', icon: 'invert', min: 0, max: 100, step: 1, unit: '%', default: 0 },
        { id: 'temperature', name: 'Temperature', icon: 'temperature', min: -100, max: 100, step: 1, unit: '', default: 0 },
      ],
    },
    // Per-clip animations (entrance/exit effects)
    animations: {
      enabled: true,
      defaultDuration: 0.5,
      items: [
        { id: 'fade', name: 'Fade', icon: 'fade' },
        { id: 'slideLeft', name: 'Slide Left', icon: 'slideLeft' },
        { id: 'slideRight', name: 'Slide Right', icon: 'slideRight' },
        { id: 'slideUp', name: 'Slide Up', icon: 'slideUp' },
        { id: 'slideDown', name: 'Slide Down', icon: 'slideDown' },
        { id: 'zoom', name: 'Zoom', icon: 'zoom' },
        { id: 'zoomIn', name: 'Zoom In', icon: 'zoomIn' },
        { id: 'zoomOut', name: 'Zoom Out', icon: 'zoomOut' },
        { id: 'crossZoom', name: 'Cross Zoom', icon: 'crossZoom' },
        { id: 'wipe', name: 'Wipe', icon: 'wipe' },
        { id: 'blur', name: 'Blur', icon: 'blur' },
        { id: 'dissolve', name: 'Dissolve', icon: 'dissolve' },
        { id: 'spin', name: 'Spin', icon: 'spin' },
        { id: 'flip', name: 'Flip', icon: 'flip' },
        { id: 'bounce', name: 'Bounce', icon: 'bounce' },
        { id: 'elastic', name: 'Elastic', icon: 'elastic' },
        { id: 'rotate3d', name: '3D Rotate', icon: 'rotate3d' },
      ],
    },
  },

  // Screen size presets
  screenPresets: {
    '1080p': { width: 1920, height: 1080, label: '1080p (16:9)' },
    '720p': { width: 1280, height: 720, label: '720p (16:9)' },
    '4K': { width: 3840, height: 2160, label: '4K UHD (16:9)' },
    'Vertical HD': { width: 1080, height: 1920, label: 'Vertical HD (9:16)' },
    'Square': { width: 1080, height: 1080, label: 'Square (1:1)' },
    'Instagram Portrait': { width: 1080, height: 1350, label: 'Instagram (4:5)' },
    'Cinematic': { width: 2560, height: 1080, label: 'Cinematic (21:9)' },
    'Twitter': { width: 1280, height: 720, label: 'Twitter (16:9)' },
    'Facebook Cover': { width: 820, height: 312, label: 'FB Cover' },
  },

  timeline: {
    playheadColor: '#6366f1',
    showTrackNames: false, // Show/hide track names in the timeline sidebar
    showAddTrackButton: false, // Show/hide the Add Track button in the toolbar
    // Timeline clip snapping settings
    snap: {
      enabled: true,
      threshold: 0.1,              // seconds (100ms) - how close clips need to be to snap
      showSnapLines: true,         // Show vertical snap lines across tracks
      snapLineColor: '#f472b6',    // Pink like canvas snap guides
      snapLineWidth: 1,
    },
    visTimeline: {
      orientation: 'top',
      stack: false,
      stackSubgroups: false,
      showMajorLabels: false,
      showMinorLabels: true,
      showCurrentTime: false,
      verticalScroll: true,
      zoomable: false,
      // Disable moveable to allow marquee selection on empty space
      // Users can still scroll horizontally with mouse wheel
      moveable: false,
      selectable: true,
      multiselect: true,
      multiselectPerGroup: true,
      groupHeightMode: 'fixed',
      margin: { item: { horizontal: 0, vertical: 4 } },
      itemsAlwaysDraggable: {
        item: true,
        range: true,
      },
      format: {
        minorLabels: {
          millisecond: 'mm:ss.SSS',
          second: 'mm:ss',
          minute: 'HH:mm',
          hour: 'HH:mm',
          weekday: 'HH:mm',
          day: 'HH:mm',
          week: 'HH:mm',
          month: 'HH:mm',
          year: 'HH:mm'
        },
        majorLabels: {
          millisecond: 'HH:mm:ss',
          second: 'HH:mm',
          minute: 'HH:mm',
          hour: 'HH:mm',
          weekday: 'HH:mm',
          day: 'HH:mm',
          week: 'HH:mm',
          month: 'HH:mm',
          year: 'HH:mm'
        }
      },
      editable: {
        add: false,
        updateTime: true,
        updateGroup: true,
        remove: false,
      },
    },
  },

  tracks: {
    defaultTracks: [
      { id: 'track-1', name: 'Track 1' },
      // { id: 'track-2', name: 'Track 2' },
    ],
  },

  // Cursor types configuration (video mode - animated cursors)
  cursorTypes: {
    pointer: {
      name: 'Pointer',
      // Rendering path points (scaled by baseScale)
      path: [
        { x: 0, y: 0 },
        { x: 0, y: 17 },
        { x: 4, y: 13 },
        { x: 7, y: 19 },
        { x: 9, y: 18 },
        { x: 6, y: 12 },
        { x: 11, y: 12 }
      ],
      closed: true,
      baseScale: 2.5,
      // Hotspot: where the "click point" is relative to keyframe position
      hotspotX: 0,
      hotspotY: 0,
      // Bounds: how far the cursor extends from keyframe point (for selection box)
      // offsetX/Y = how far left/up from keyframe, extendX/Y = how far right/down
      // Path extents: x=0-11, y=0-19 (before baseScale multiplied in geometry.js)
      bounds: { offsetX: 0, offsetY: 0, extendX: 11, extendY: 19 },
      // SVG icon for options bar (24x24 viewBox)
      icon: '<path d="M4 4l6 16 2-6 6-2L4 4z"/>'
    },
    hand: {
      name: 'Hand',
      path: [
        { x: 7, y: 0 },
        { x: 7, y: 6 },
        { x: 5, y: 6 },
        { x: 5, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: 6 },
        { x: 1, y: 6 },
        { x: 1, y: 8 },
        { x: 0, y: 8 },
        { x: 0, y: 15 },
        { x: 2, y: 17 },
        { x: 12, y: 17 },
        { x: 14, y: 15 },
        { x: 14, y: 8 },
        { x: 12, y: 6 },
        { x: 12, y: 4 },
        { x: 10, y: 4 },
        { x: 10, y: 6 },
        { x: 9, y: 6 },
        { x: 9, y: 0 }
      ],
      closed: true,
      baseScale: 2.5,
      hotspotX: 7,
      hotspotY: 0,
      bounds: { offsetX: 9, offsetY: 0, extendX: 9, extendY: 22 },
      icon: '<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
    },
    crosshair: {
      name: 'Crosshair',
      type: 'crosshair',
      size: 20,
      baseScale: 2.5,
      bounds: { offsetX: 0, offsetY: 0, extendX: 20, extendY: 20 },
      icon: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>'
    },
    grab: {
      name: 'Grab',
      path: [
        { x: 3, y: 5 },
        { x: 3, y: 3 },
        { x: 5, y: 3 },
        { x: 5, y: 5 },
        { x: 6, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 5 },
        { x: 9, y: 3 },
        { x: 11, y: 3 },
        { x: 11, y: 6 },
        { x: 12, y: 4 },
        { x: 14, y: 4 },
        { x: 14, y: 10 },
        { x: 13, y: 14 },
        { x: 10, y: 16 },
        { x: 4, y: 16 },
        { x: 1, y: 14 },
        { x: 0, y: 10 },
        { x: 0, y: 8 },
        { x: 1, y: 6 },
        { x: 3, y: 6 }
      ],
      closed: true,
      baseScale: 2.5,
      hotspotX: 7,
      hotspotY: 8,
      bounds: { offsetX: 8, offsetY: 10, extendX: 9, extendY: 9 },
      icon: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V7.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 10.5V8.5a1.5 1.5 0 0 1 3 0V12"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V9.5a1.5 1.5 0 0 1 3 0"/>'
    },
    grabbing: {
      name: 'Grabbing',
      path: [
        { x: 2, y: 6 },
        { x: 2, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 6 },
        { x: 5, y: 4 },
        { x: 7, y: 4 },
        { x: 7, y: 6 },
        { x: 8, y: 4 },
        { x: 10, y: 4 },
        { x: 10, y: 6 },
        { x: 11, y: 5 },
        { x: 13, y: 5 },
        { x: 13, y: 10 },
        { x: 12, y: 14 },
        { x: 9, y: 16 },
        { x: 4, y: 16 },
        { x: 1, y: 14 },
        { x: 0, y: 10 },
        { x: 0, y: 7 },
        { x: 2, y: 7 }
      ],
      closed: true,
      baseScale: 2.5,
      hotspotX: 7,
      hotspotY: 8,
      bounds: { offsetX: 10, offsetY: 10, extendX: 6, extendY: 10 },
      icon: '<path d="M8 14V10a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v0"/><path d="M12 12V9a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1"/><path d="M16 11a2 2 0 0 1 4 0v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v0"/>'
    }
  },

  // Pencil cursor settings for animated drawing cursor (recording canvas only)
  pencilCursor: {
    defaultAngle: 0.4,        // Default tilt angle in radians (~23° natural writing angle)
    defaultScale: 1.0,         // Default size multiplier
  },

  // Pencil types for animated drawing cursor (recording canvas only)
  // Contains both UI metadata (name, icon, emoji) and rendering details (dimensions, colors)
  pencilTypes: {
    pencil: {
      name: 'Wooden Pencil',
      emoji: '✏️',
      icon: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
      // Dimensions (tip at origin, body extends up-left at angle)
      tipLength: 8,
      woodLength: 15,
      bodyLength: 80,
      ferruleLength: 12,
      eraserLength: 15,
      bodyWidth: 8,
      colors: {
        tip: '#2c2c2c',           // Graphite
        wood: '#d4a574',          // Exposed wood
        body: '#f4d03f',          // Yellow body
        bodyStroke: '#c9a82c',    // Darker yellow outline
        ferrule: '#c0c0c0',       // Metal band
        ferruleStroke: '#888888',
        eraser: '#e75480',        // Pink eraser
        eraserStroke: '#c44569',
      }
    },
    mechanical: {
      name: 'Mechanical Pencil',
      emoji: '🖊️',
      icon: '<path d="m10 11 11 11"/><path d="m12 9 4 4"/><path d="M21 21v-6h-6"/><path d="M3 3v6h6"/>',
      tipLength: 12,
      gripLength: 25,
      bodyLength: 70,
      clipLength: 30,
      bodyWidth: 6,
      colors: {
        tip: '#555555',           // Metal tip
        tipStroke: '#333333',
        grip: '#333333',          // Rubber grip
        body: '#666666',          // Silver/gray body
        bodyStroke: '#444444',
        clip: '#888888',          // Metal clip
        button: '#222222',        // Click button
      }
    },
    pen: {
      name: 'Ballpoint Pen',
      emoji: '🖋️',
      icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      tipLength: 6,
      bodyLength: 90,
      capLength: 20,
      clipLength: 35,
      bodyWidth: 7,
      colors: {
        tip: '#333333',           // Metal tip
        tipBall: '#1a1a1a',       // Ball point
        body: '#1e3a5f',          // Dark blue body
        bodyStroke: '#152a45',
        clip: '#c0c0c0',          // Metal clip
        clipStroke: '#888888',
        cap: '#1e3a5f',           // Matching cap
      }
    },
    marker: {
      name: 'Marker',
      emoji: '🖍️',
      icon: '<path d="M9 11 6 6l2.5-4h7L18 6l-3 5"/><path d="M9 11V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-9"/>',
      tipLength: 10,
      bodyLength: 70,
      capLength: 25,
      bodyWidth: 12,
      colors: {
        tip: '#222222',           // Felt tip (takes stroke color)
        body: '#e74c3c',          // Red body
        bodyStroke: '#c0392b',
        cap: '#c0392b',           // Darker cap
        label: '#ffffff',         // White label area
      }
    },
    stylus: {
      name: 'Digital Stylus',
      emoji: '📱',
      icon: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
      tipLength: 4,
      neckLength: 15,
      bodyLength: 85,
      buttonLength: 20,
      bodyWidth: 8,
      colors: {
        tip: '#333333',           // Rubber tip
        neck: '#444444',          // Tapered neck
        body: '#1a1a1a',          // Matte black
        bodyStroke: '#000000',
        button: '#333333',        // Side button
        buttonStroke: '#222222',
        accent: '#4a90d9',        // Blue accent ring
      }
    },
    chalk: {
      name: 'Chalk',
      emoji: '🤍',
      icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/>',
      tipLength: 5,
      bodyLength: 60,
      bodyWidth: 10,
      colors: {
        body: '#f5f5f5',          // White chalk
        bodyStroke: '#e0e0e0',
        dust: 'rgba(255,255,255,0.3)', // Dust particles
      }
    }
  },

  // Export watermark settings (appears on exported videos, PNGs, and SVGs)
  exportWatermark: {
    enabled: false,                    // Show/hide watermark
    text: 'Made on videodraw.app',    // Watermark text
    // Optional icon (SVG path data) - set to null or false to hide
    icon: false,
    iconViewBox: '0 0 42 42',         // ViewBox for the icon SVG
    iconSize: 9,                     // Icon size in pixels
    position: 'bottom-right',         // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
    fontSize: 10,                     // Font size in pixels
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'rgba(255, 255, 255, 0.8)', // Text and icon color
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Background/pill color
    padding: { x: 6, y: 3 },         // Padding inside pill
    margin: { x: 6, y: 6 },         // Margin from canvas edge
    borderRadius: 10,                 // Pill border radius
    opacity: 1.0,                     // Overall opacity
    iconGap: 6,                       // Gap between icon and text
  },
};

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig = {}) {
  return deepMerge(defaultConfig, userConfig);
}

/**
 * Get default config
 */
export function getDefaultConfig() {
  return { ...defaultConfig };
}

export default { defaultConfig, mergeConfig, getDefaultConfig };
