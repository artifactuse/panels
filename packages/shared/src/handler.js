/**
 * Artifact Handler
 * 
 * Shared handler for loading code artifacts from any source
 * (postMessage bridge, MCP WebSocket, URL params, etc.)
 * 
 * Supports:
 *   - Full artifact loading (canvas, video, code, data)
 *   - Real-time crafting (incremental shape/clip additions)
 *   - Shape/clip editing (update, delete)
 * 
 * Events handled:
 *   - load:artifact                  - Legacy full artifact load
 *   - artifactuse:init:canvas        - Initialize canvas for crafting
 *   - artifactuse:add:shape          - Add single shape
 *   - artifactuse:add:shapes         - Add multiple shapes
 *   - artifactuse:update:shape       - Update existing shape
 *   - artifactuse:delete:shape       - Delete shape
 *   - artifactuse:clear:canvas       - Clear canvas
 *   - artifactuse:init:video         - Initialize video for crafting
 *   - artifactuse:add:clip           - Add single clip
 *   - artifactuse:add:clips          - Add multiple clips
 *   - artifactuse:update:clip        - Update existing clip
 *   - artifactuse:delete:clip        - Delete clip
 *   - artifactuse:clear:video        - Clear video
 *   - artifactuse:load:code          - Load code artifact
 *   - artifactuse:load:data          - Load data artifact
 * 
 * Usage:
 *   import { setupArtifactListeners } from '@artifactuse/shared/handler';
 *   
 *   setupArtifactListeners({
 *     editorType: 'canvas',  // or 'video'
 *     bridge,
 *     getExport: () => getExport(),
 *   });
 */

/**
 * Language type mappings and categories
 */
const LANGUAGE_MAP = {
  // Web languages
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  jsx: 'React JSX',
  tsx: 'React TSX',
  react: 'React',
  vue: 'Vue Component',
  
  // Backend languages
  python: 'Python',
  py: 'Python',
  java: 'Java',
  csharp: 'C#',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  
  // Query & scripting
  sql: 'SQL',
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  graphql: 'GraphQL',
  
  // Data formats
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  markdown: 'Markdown',
  md: 'Markdown',
  svg: 'SVG',
  
  // DevOps
  dockerfile: 'Dockerfile',
  docker: 'Docker',
  diff: 'Diff',
  patch: 'Patch',
  
  // Visual editors
  canvas: 'Canvas',
  video: 'Video Editor',
  videoeditor: 'Video Editor',
  timeline: 'Timeline',
  whiteboard: 'Whiteboard',
  drawing: 'Drawing',
  
  // Structured artifacts
  form: 'Form',
  social: 'Social Preview',
};

/**
 * Languages that require JSON parsing before use
 */
const NEEDS_JSON_PARSE = [
  'canvas', 'video', 'videoeditor', 'timeline', 'whiteboard', 'drawing',
  'form', 'social', 'diff', 'json',
];

/**
 * Languages that use raw code directly (no JSON parsing)
 */
const RAW_CODE_LANGUAGES = [
  'html', 'htm', 'markdown', 'md', 'svg', 'xml', 'yaml', 'yml',
  'react', 'jsx', 'tsx', 'vue',
  'javascript', 'js', 'typescript', 'ts', 'python', 'py',
  'css', 'java', 'csharp', 'cs', 'cpp', 'c', 'go', 'rust',
  'ruby', 'rb', 'php', 'swift', 'kotlin', 'scala', 'sql',
  'bash', 'shell', 'sh', 'powershell', 'ps1', 'graphql',
  'dockerfile', 'docker', 'patch',
];

/**
 * Categories for routing artifacts to the right handler
 */
const LANGUAGE_CATEGORIES = {
  visualEditor: ['canvas', 'video', 'videoeditor', 'timeline', 'whiteboard', 'drawing'],
  structured: ['form', 'social', 'diff'],
  renderable: ['react', 'jsx', 'tsx', 'vue', 'html', 'htm', 'svg'],
  runtime: ['javascript', 'js', 'typescript', 'ts', 'python', 'py'],
  data: ['json', 'xml', 'yaml', 'yml'],
  markup: ['markdown', 'md'],
  code: [
    'css', 'java', 'csharp', 'cs', 'cpp', 'c', 'go', 'rust',
    'ruby', 'rb', 'php', 'swift', 'kotlin', 'scala', 'sql', 'bash',
    'shell', 'sh', 'powershell', 'ps1', 'graphql', 'dockerfile', 'docker',
    'patch'
  ],
};

/**
 * Get the category of a language
 */
function getLanguageCategory(language) {
  const lang = language?.toLowerCase();
  for (const [category, languages] of Object.entries(LANGUAGE_CATEGORIES)) {
    if (languages.includes(lang)) return category;
  }
  return 'unknown';
}

/**
 * Get the display name for a language
 */
export function getLanguageDisplayName(language) {
  const lang = language?.toLowerCase();
  return LANGUAGE_MAP[lang] || language || 'Unknown';
}

/**
 * Check if a language is a visual editor type
 */
export function isVisualEditorLanguage(language) {
  return LANGUAGE_CATEGORIES.visualEditor.includes(language?.toLowerCase());
}

/**
 * Check if a language is a code type
 */
export function isCodeLanguage(language) {
  return LANGUAGE_CATEGORIES.code.includes(language?.toLowerCase());
}

/**
 * Check if a language is a data type
 */
export function isDataLanguage(language) {
  return LANGUAGE_CATEGORIES.data.includes(language?.toLowerCase());
}

/**
 * Check if a language requires JSON parsing
 */
export function needsJsonParse(language) {
  return NEEDS_JSON_PARSE.includes(normalizeLanguage(language));
}

/**
 * Check if a language uses raw code directly
 */
export function isRawCodeLanguage(language) {
  return RAW_CODE_LANGUAGES.includes(normalizeLanguage(language));
}

/**
 * Check if a language is renderable
 */
export function isRenderableLanguage(language) {
  return LANGUAGE_CATEGORIES.renderable.includes(normalizeLanguage(language));
}

/**
 * Check if a language is a runtime language
 */
export function isRuntimeLanguage(language) {
  return LANGUAGE_CATEGORIES.runtime.includes(normalizeLanguage(language));
}

/**
 * Normalize language aliases
 */
export function normalizeLanguage(language) {
  const lang = language?.toLowerCase();
  const aliases = {
    htm: 'html', js: 'javascript', ts: 'typescript', py: 'python',
    cs: 'csharp', rb: 'ruby', sh: 'shell', ps1: 'powershell',
    yml: 'yaml', md: 'markdown', videoeditor: 'video', docker: 'dockerfile',
  };
  return aliases[lang] || lang;
}

/**
 * Sanitize JSON code
 */
export function sanitizeJsonCode(code) {
  if (typeof code !== 'string') return code;
  return code.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });
}

/**
 * Generate unique shape ID
 */
function generateShapeId() {
  return `shape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get shape name from type
 */
function getShapeName(shape) {
  const typeNames = {
    rect: 'Rectangle', circle: 'Circle', ellipse: 'Ellipse',
    text: 'Text', image: 'Image', video: 'Video', audio: 'Audio',
    line: 'Line', arrow: 'Arrow', path: 'Path', frame: 'Frame',
    group: 'Group', diamond: 'Diamond', triangle: 'Triangle',
  };
  return shape.name || typeNames[shape.type] || shape.type || 'Shape';
}

/**
 * Find shape by ID in shapes array
 */
function findShapeById(shapes, id) {
  const index = shapes.findIndex(s => s.id === id);
  return { shape: shapes[index], index };
}

/**
 * Find shape by index in shapes array
 */
function findShapeByIndex(shapes, index) {
  if (index >= 0 && index < shapes.length) {
    return { shape: shapes[index], index };
  }
  return { shape: null, index: -1 };
}

/**
 * Setup real-time crafting event listeners
 * These handle incremental additions during AI-assisted design
 */
function setupCraftingListeners(options = {}) {
  const { editorType, getExport, getEditorState, getRenderer } = options;
  
  // Get state accessor (try multiple sources)
  const getState = () => {
    if (typeof getEditorState === 'function') {
      const result = getEditorState();
      return result?.state || result;
    }
    return window.state;
  };
  
  // Get renderer
  const render = () => {
    if (typeof getRenderer === 'function') {
      const renderer = getRenderer();
      if (renderer?.render) renderer.render();
    } else if (typeof window.render === 'function') {
      window.render();
    }
  };

  // Save state for undo/redo
  const saveState = () => {
    if (typeof window.saveState === 'function') {
      window.saveState();
    }
  };
  
  // Center view after major changes
  const centerView = () => {
    requestAnimationFrame(() => {
      if (typeof window.resizeCanvasToFit === 'function') {
        window.resizeCanvasToFit();
      } else if (typeof window.centerOnContent === 'function') {
        window.centerOnContent();
      }
    });
  };

  // === CANVAS CRAFTING EVENTS ===
  
  if (editorType === 'canvas') {
    // Initialize canvas
    window.addEventListener('artifactuse:init:canvas', (event) => {
      const { width, height, backgroundColor } = event.detail || {};
      const state = getState();
      if (!state) return;

      console.log(`[Handler] Init canvas: ${width}x${height}`);

      // Clear shapes
      state.shapes = [];
      state.selectedShapeIds = [];
      state.selectedIndices = [];

      // Store dimensions in state for reference/export
      // In canvas mode (infinite canvas), we don't resize the DOM canvas
      // since the canvas is unbounded - only video mode uses fixed dimensions
      if (width && height) {
        state.canvasWidth = width;
        state.canvasHeight = height;
      }

      // Set background
      if (backgroundColor) {
        state.backgroundColor = backgroundColor;
      }

      render();
      centerView();
      saveState();
    });
    
    // Add single shape
    window.addEventListener('artifactuse:add:shape', (event) => {
      const { shape } = event.detail || {};
      const state = getState();
      if (!state || !shape) return;
      
      console.log(`[Handler] Add shape: ${shape.type}`);
      
      // Normalize shape
      const normalizedShape = {
        ...shape,
        id: shape.id || generateShapeId(),
        visible: shape.visible !== false,
        name: getShapeName(shape),
      };
      
      state.shapes.push(normalizedShape);
      render();
      saveState();
    });
    
    // Add multiple shapes
    window.addEventListener('artifactuse:add:shapes', (event) => {
      const { shapes } = event.detail || {};
      const state = getState();
      if (!state || !shapes?.length) return;
      
      console.log(`[Handler] Add ${shapes.length} shapes`);
      
      shapes.forEach(shape => {
        const normalizedShape = {
          ...shape,
          id: shape.id || generateShapeId(),
          visible: shape.visible !== false,
          name: getShapeName(shape),
        };
        state.shapes.push(normalizedShape);
      });
      
      render();
      saveState();
    });

    // Update shape
    window.addEventListener('artifactuse:update:shape', (event) => {
      const { id, index, updates } = event.detail || {};
      const state = getState();
      if (!state || !updates) return;
      
      // Find the shape
      let found;
      if (id) {
        found = findShapeById(state.shapes, id);
      } else if (index !== undefined) {
        found = findShapeByIndex(state.shapes, index);
      }
      
      if (!found?.shape) {
        console.warn(`[Handler] Shape not found for update (id: ${id}, index: ${index})`);
        return;
      }
      
      console.log(`[Handler] Update shape: ${found.shape.id}`, updates);
      
      // Apply updates
      Object.assign(found.shape, updates);
      
      // Update name if type changed
      if (updates.type && !updates.name) {
        found.shape.name = getShapeName(found.shape);
      }
      
      render();
      saveState();
      
      // Update layers panel if available
      if (typeof window.renderLayersList === 'function') {
        window.renderLayersList();
      }
    });

    // Delete shape
    window.addEventListener('artifactuse:delete:shape', (event) => {
      const { id, index } = event.detail || {};
      const state = getState();
      if (!state) return;
      
      // Find the shape
      let foundIndex = -1;
      if (id) {
        foundIndex = state.shapes.findIndex(s => s.id === id);
      } else if (index !== undefined && index >= 0 && index < state.shapes.length) {
        foundIndex = index;
      }
      
      if (foundIndex === -1) {
        console.warn(`[Handler] Shape not found for delete (id: ${id}, index: ${index})`);
        return;
      }
      
      const deletedShape = state.shapes[foundIndex];
      console.log(`[Handler] Delete shape: ${deletedShape.id} (${deletedShape.type})`);
      
      // Remove from selection if selected
      if (state.selectedIndices) {
        state.selectedIndices = state.selectedIndices.filter(i => i !== foundIndex);
        // Adjust indices for shapes after the deleted one
        state.selectedIndices = state.selectedIndices.map(i => i > foundIndex ? i - 1 : i);
      }
      if (state.selectedShapeIds) {
        state.selectedShapeIds = state.selectedShapeIds.filter(sid => sid !== deletedShape.id);
      }
      
      // Remove the shape
      state.shapes.splice(foundIndex, 1);
      
      render();
      saveState();
      
      // Update layers panel if available
      if (typeof window.renderLayersList === 'function') {
        window.renderLayersList();
      }
      
      // Hide options bar if nothing selected
      if (state.selectedIndices?.length === 0) {
        if (typeof window.vueHideOptionsBar === 'function') {
          window.vueHideOptionsBar();
        } else if (typeof window.hideOptionsBar === 'function') {
          window.hideOptionsBar();
        }
      }
    });
    
    // Clear canvas
    window.addEventListener('artifactuse:clear:canvas', () => {
      const state = getState();
      if (!state) return;
      
      console.log('[Handler] Clear canvas');
      state.shapes = [];
      state.selectedShapeIds = [];
      state.selectedIndices = [];
      render();
      saveState();
    });
  }

  // === VIDEO CRAFTING EVENTS ===
  
  if (editorType === 'video') {
    // Initialize video
    window.addEventListener('artifactuse:init:video', (event) => {
      const { width, height, duration, backgroundColor } = event.detail || {};
      const state = getState();
      if (!state) return;
      
      console.log(`[Handler] Init video: ${width}x${height}, ${duration}s`);
      
      // Clear shapes/clips
      state.shapes = [];
      state.selectedShapeIds = [];
      state.selectedIndices = [];
      
      // Set dimensions
      if (width && height) {
        state.canvasWidth = width;
        state.canvasHeight = height;
      }
      
      // Set duration
      if (duration) {
        state.projectDuration = duration;
        state.duration = duration;
      }
      
      // Set background
      if (backgroundColor) {
        state.backgroundColor = backgroundColor;
      }
      
      // Ensure tracks exist
      if (!state.tracks || state.tracks.length === 0) {
        state.tracks = [
          { id: 'track-1', name: 'Track 1', type: 'video' },
          { id: 'track-2', name: 'Track 2', type: 'video' },
          { id: 'audio-1', name: 'Audio 1', type: 'audio' },
        ];
      }
      
      render();
      centerView();
      saveState();
      
      // Update timeline if available
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
    });
    
    // Add single clip
    window.addEventListener('artifactuse:add:clip', (event) => {
      const { clip } = event.detail || {};
      const state = getState();
      if (!state || !clip) return;

      const startTime = clip.startTime ?? 0;
      const duration = clip.duration ?? 5;

      console.log(`[Handler] Add clip: ${clip.type} at ${startTime}s`);

      // Use findAvailableTrack if available, otherwise default to track-1
      let trackId = clip.trackId;
      if (!trackId && typeof window.getVideoState === 'function') {
        const videoState = window.getVideoState();
        if (videoState && typeof videoState.findAvailableTrack === 'function') {
          const trackType = clip.type === 'audio' ? 'audio' : 'video';
          trackId = videoState.findAvailableTrack(startTime, duration, trackType);
        }
      }
      trackId = trackId || 'track-1';

      // Ensure track exists in state.tracks
      if (state.tracks && trackId && !state.tracks.find(t => t.id === trackId)) {
        const trackType = trackId.includes('audio') ? 'audio' : 'video';
        state.tracks.push({
          id: trackId,
          name: trackId.replace('track-', 'Track ').replace('audio-', 'Audio '),
          type: trackType
        });
      }

      // Normalize clip (clips are shapes with temporal properties)
      const normalizedClip = {
        ...clip,
        id: clip.id || generateShapeId(),
        visible: clip.visible !== false,
        name: getShapeName(clip),
        startTime,
        duration,
        trackId,
      };

      state.shapes.push(normalizedClip);
      render();
      saveState();

      // Update timeline
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
    });
    
    // Add multiple clips
    window.addEventListener('artifactuse:add:clips', (event) => {
      const { clips } = event.detail || {};
      const state = getState();
      if (!state || !clips?.length) return;

      console.log(`[Handler] Add ${clips.length} clips`);

      // Get video state for track assignment if available
      const videoState = typeof window.getVideoState === 'function' ? window.getVideoState() : null;
      const canFindTrack = videoState && typeof videoState.findAvailableTrack === 'function';

      clips.forEach(clip => {
        const startTime = clip.startTime ?? 0;
        const duration = clip.duration ?? 5;

        // Use findAvailableTrack if available, otherwise default to track-1
        let trackId = clip.trackId;
        if (!trackId && canFindTrack) {
          const trackType = clip.type === 'audio' ? 'audio' : 'video';
          trackId = videoState.findAvailableTrack(startTime, duration, trackType);
        }
        trackId = trackId || 'track-1';

        // Ensure track exists in state.tracks
        if (state.tracks && trackId && !state.tracks.find(t => t.id === trackId)) {
          const trackType = trackId.includes('audio') ? 'audio' : 'video';
          state.tracks.push({
            id: trackId,
            name: trackId.replace('track-', 'Track ').replace('audio-', 'Audio '),
            type: trackType
          });
        }

        const normalizedClip = {
          ...clip,
          id: clip.id || generateShapeId(),
          visible: clip.visible !== false,
          name: getShapeName(clip),
          startTime,
          duration,
          trackId,
        };
        state.shapes.push(normalizedClip);
      });

      render();
      saveState();

      // Update timeline
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
    });

    // Update clip
    window.addEventListener('artifactuse:update:clip', (event) => {
      const { id, index, updates } = event.detail || {};
      const state = getState();
      if (!state || !updates) return;
      
      // Find the clip
      let found;
      if (id) {
        found = findShapeById(state.shapes, id);
      } else if (index !== undefined) {
        found = findShapeByIndex(state.shapes, index);
      }
      
      if (!found?.shape) {
        console.warn(`[Handler] Clip not found for update (id: ${id}, index: ${index})`);
        return;
      }
      
      console.log(`[Handler] Update clip: ${found.shape.id}`, updates);
      
      // Apply updates
      Object.assign(found.shape, updates);
      
      // Update name if type changed
      if (updates.type && !updates.name) {
        found.shape.name = getShapeName(found.shape);
      }
      
      render();
      saveState();
      
      // Update timeline
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
      
      // Update layers panel if available
      if (typeof window.renderLayersList === 'function') {
        window.renderLayersList();
      }
    });

    // Delete clip
    window.addEventListener('artifactuse:delete:clip', (event) => {
      const { id, index } = event.detail || {};
      const state = getState();
      if (!state) return;
      
      // Find the clip
      let foundIndex = -1;
      if (id) {
        foundIndex = state.shapes.findIndex(s => s.id === id);
      } else if (index !== undefined && index >= 0 && index < state.shapes.length) {
        foundIndex = index;
      }
      
      if (foundIndex === -1) {
        console.warn(`[Handler] Clip not found for delete (id: ${id}, index: ${index})`);
        return;
      }
      
      const deletedClip = state.shapes[foundIndex];
      console.log(`[Handler] Delete clip: ${deletedClip.id} (${deletedClip.type})`);
      
      // Remove from selection if selected
      if (state.selectedIndices) {
        state.selectedIndices = state.selectedIndices.filter(i => i !== foundIndex);
        // Adjust indices for shapes after the deleted one
        state.selectedIndices = state.selectedIndices.map(i => i > foundIndex ? i - 1 : i);
      }
      if (state.selectedShapeIds) {
        state.selectedShapeIds = state.selectedShapeIds.filter(sid => sid !== deletedClip.id);
      }
      
      // Remove the clip
      state.shapes.splice(foundIndex, 1);
      
      render();
      saveState();
      
      // Update timeline
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
      
      // Update layers panel if available
      if (typeof window.renderLayersList === 'function') {
        window.renderLayersList();
      }
      
      // Hide options bar if nothing selected
      if (state.selectedIndices?.length === 0) {
        if (typeof window.vueHideOptionsBar === 'function') {
          window.vueHideOptionsBar();
        } else if (typeof window.hideOptionsBar === 'function') {
          window.hideOptionsBar();
        }
      }
    });
    
    // Clear video
    window.addEventListener('artifactuse:clear:video', () => {
      const state = getState();
      if (!state) return;
      
      console.log('[Handler] Clear video');
      state.shapes = [];
      state.selectedShapeIds = [];
      state.selectedIndices = [];
      render();
      saveState();
      
      // Update timeline
      if (typeof window.updateTimelineItems === 'function') {
        window.updateTimelineItems();
      }
    });
  }

  // === CODE/DATA EVENTS (both editors) ===
  
  // Load code artifact
  window.addEventListener('artifactuse:load:code', (event) => {
    const { language, code } = event.detail || {};
    console.log(`[Handler] Load code: ${language}`);
    
    // Dispatch for code viewers to handle
    window.dispatchEvent(new CustomEvent('artifactuse:code', {
      detail: { language, code }
    }));
  });
  
  // Load data artifact (may be canvas/video JSON)
  window.addEventListener('artifactuse:load:data', (event) => {
    const { language, code } = event.detail || {};
    console.log(`[Handler] Load data: ${language}`);
    
    // If JSON, try to import as canvas/video data
    if (language === 'json') {
      try {
        const data = typeof code === 'string' ? JSON.parse(code) : code;
        
        // Check if it's visual editor data
        if (data.shapes || data.width || data.backgroundColor) {
          const exportModule = typeof getExport === 'function' ? getExport() : null;
          if (exportModule?.importFromJson) {
            exportModule.importFromJson(data);
            centerView();
            return;
          }
        }
      } catch (e) {
        console.warn('[Handler] Failed to parse JSON data:', e);
      }
    }
    
    // Dispatch for data viewers
    window.dispatchEvent(new CustomEvent('artifactuse:data', {
      detail: { language, code }
    }));
  });
}



/**
 * Create the main artifact handler
 * (This handles full artifact loads, not incremental crafting)
 * 
 * @param {Object} options
 * @param {string} options.type - Editor type: 'canvas', 'video', 'json', 'markdown', etc.
 * @param {string[]} options.acceptedLanguages - Override accepted languages (optional)
 * @param {Function} options.getExport - Function that returns the export module (for visual editors)
 * @param {Function} options.onArtifact - Custom handler for all accepted artifacts
 * @param {Function} options.onSuccess - Optional callback on successful import
 * @param {Function} options.onError - Optional callback on error
 * @param {Function} options.onCodeArtifact - Optional handler for display-only code artifacts
 * @param {Function} options.onMarkupArtifact - Optional handler for markup artifacts
 * @param {Function} options.onDataArtifact - Optional handler for data artifacts
 * @param {Function} options.onStructuredArtifact - Optional handler for structured artifacts (form, diff)
 * @returns {Function} Handler function that accepts an artifact object
 */
export function createArtifactHandler(options = {}) {
  const {
    editorType,
    type, // alias for editorType
    getExport,
    onSuccess,
    onError,
    onArtifact,
    onCodeArtifact,
    onDataArtifact,
    onMarkupArtifact,
    onStructuredArtifact,
  } = options;

  const targetType = editorType || type;

  const centerView = () => {
    requestAnimationFrame(() => {
      if (typeof window.resizeCanvasToFit === 'function') {
        window.resizeCanvasToFit();
      } else if (typeof window.centerOnContent === 'function') {
        window.centerOnContent();
      }
    });
  };

  return function handleArtifact(artifact) {
    if (!artifact) {
      console.warn('[ArtifactHandler] No artifact provided');
      return false;
    }

    const { language, code } = artifact;
    if (!language || code === undefined) {
      console.warn('[ArtifactHandler] Invalid artifact - missing language or code');
      return false;
    }

    const normalizedLang = normalizeLanguage(language);
    const category = getLanguageCategory(normalizedLang);
    const displayName = getLanguageDisplayName(language);

    // If custom onArtifact handler is provided, use it
    if (typeof onArtifact === 'function') {
      try {
        // Only sanitize JSON-like content, not HTML/markup
        const isJsonContent = ['json', 'form', 'diff'].includes(normalizedLang) || 
                              category === 'data' || 
                              category === 'structured' ||
                              category === 'visualEditor';

        const processedCode = isJsonContent ? sanitizeJsonCode(code) : code;
        const result = onArtifact({ ...artifact, code: processedCode }, normalizedLang, displayName);
        
        if (result !== false) {
          dispatchArtifactEvent(artifact);
          if (onSuccess) onSuccess(artifact);
        }
        return result !== false;
      } catch (e) {
        console.error('[ArtifactHandler] Custom handler error:', e);
        if (onError) onError(e);
        return false;
      }
    }

    // Route based on category
    switch (category) {
      case 'visualEditor':
        return handleVisualEditorArtifact(artifact, normalizedLang);
      
      case 'renderable':
        return handleRenderableArtifact(artifact, normalizedLang, displayName);
      
      case 'runtime':
        return handleRuntimeArtifact(artifact, normalizedLang, displayName);
      
      case 'code':
        return handleCodeArtifact(artifact, normalizedLang, displayName);
      
      case 'markup':
        return handleMarkupArtifact(artifact, normalizedLang, displayName);
      
      case 'data':
        return handleDataArtifact(artifact, normalizedLang, displayName);
      
      case 'structured':
        return handleStructuredArtifact(artifact, normalizedLang, displayName);
      
      default:
        console.warn(`[ArtifactHandler] Unknown category: ${category}`);
        dispatchArtifactEvent(artifact);
        return false;
    }

    function handleVisualEditorArtifact(artifact, lang) {
      try {
        const sanitizedCode = sanitizeJsonCode(code);
        const data = typeof sanitizedCode === 'string' 
          ? JSON.parse(sanitizedCode) 
          : sanitizedCode;

        const exportModule = typeof getExport === 'function' ? getExport() : null;
        
        if (!exportModule?.importFromJson) {
          console.error('[ArtifactHandler] Export module not available');
          if (onError) onError(new Error('Export module not available'));
          return false;
        }

        const success = exportModule.importFromJson(data);

        if (success) {
          console.log(`[ArtifactHandler] Successfully imported ${lang} artifact`);
          centerView();
          if (onSuccess) onSuccess(data);
        } else {
          console.error('[ArtifactHandler] importFromJson returned false');
          if (onError) onError(new Error('Import failed'));
        }

        dispatchArtifactEvent(artifact);
        return success;

      } catch (e) {
        console.error('[ArtifactHandler] Failed to parse/import visual editor artifact:', e);
        if (onError) onError(e);
        return false;
      }
    }

    function handleRenderableArtifact(artifact, lang, displayName) {
      console.log(`[ArtifactHandler] Renderable artifact: ${displayName}`);
      
      if (typeof options.onRenderableArtifact === 'function') {
        return options.onRenderableArtifact(artifact, lang, displayName);
      }

      dispatchArtifactEvent(artifact);
      window.dispatchEvent(new CustomEvent('artifactuse:renderable', { 
        detail: { ...artifact, normalizedLanguage: lang, displayName } 
      }));

      return true;
    }

    function handleRuntimeArtifact(artifact, lang, displayName) {
      console.log(`[ArtifactHandler] Runtime artifact: ${displayName}`);
      
      if (typeof options.onRuntimeArtifact === 'function') {
        return options.onRuntimeArtifact(artifact, lang, displayName);
      }

      dispatchArtifactEvent(artifact);
      window.dispatchEvent(new CustomEvent('artifactuse:runtime', { 
        detail: { ...artifact, normalizedLanguage: lang, displayName } 
      }));

      return true;
    }

    function handleCodeArtifact(artifact, lang, displayName) {
      console.log(`[ArtifactHandler] Code artifact: ${displayName}`);
      
      if (typeof onCodeArtifact === 'function') {
        return onCodeArtifact(artifact, lang, displayName);
      }

      dispatchArtifactEvent(artifact);
      window.dispatchEvent(new CustomEvent('artifactuse:code', { 
        detail: { ...artifact, normalizedLanguage: lang, displayName } 
      }));

      return true;
    }

    function handleMarkupArtifact(artifact, lang, displayName) {
      console.log(`[ArtifactHandler] Markup artifact: ${displayName}`);
      
      if (typeof onMarkupArtifact === 'function') {
        return onMarkupArtifact(artifact, lang, displayName);
      }

      dispatchArtifactEvent(artifact);
      window.dispatchEvent(new CustomEvent('artifactuse:markup', { 
        detail: { ...artifact, normalizedLanguage: lang, displayName } 
      }));

      return true;
    }

    function handleDataArtifact(artifact, lang, displayName) {
      console.log(`[ArtifactHandler] Data artifact: ${displayName}`);
      
      if (typeof onDataArtifact === 'function') {
        return onDataArtifact(artifact, lang, displayName);
      }

      dispatchArtifactEvent(artifact);
      window.dispatchEvent(new CustomEvent('artifactuse:data', { 
        detail: { ...artifact, normalizedLanguage: lang, displayName } 
      }));

      return true;
    }

    function handleStructuredArtifact(artifact, lang, displayName) {
      console.log(`[ArtifactHandler] Structured artifact: ${displayName}`);
      
      if (typeof onStructuredArtifact === 'function') {
        return onStructuredArtifact(artifact, lang, displayName);
      }

      dispatchArtifactEvent(artifact);
      window.dispatchEvent(new CustomEvent('artifactuse:structured', { 
        detail: { ...artifact, normalizedLanguage: lang, displayName } 
      }));

      return true;
    }

    function dispatchArtifactEvent(artifact) {
      window.dispatchEvent(new CustomEvent('artifactuse:load', { detail: artifact }));
    }
  };
}

/**
 * Setup all artifact listeners for an editor
 * Now includes real-time crafting support with editing
 */
export function setupArtifactListeners(options = {}) {
  const { bridge, editorType, type, ...handlerOptions } = options;
  const targetType = editorType || type || 'canvas';
  
  // Create the handler for full artifact loads
  const handler = createArtifactHandler({ ...handlerOptions, editorType: targetType });

  // Listen to postMessage bridge
  if (bridge && typeof bridge.on === 'function') {
    bridge.on('load:artifact', handler);
  }

  // Listen to MCP WebSocket bridge (legacy event)
  window.addEventListener('artifactuse:mcp:artifact', (event) => {
    handler(event.detail);
  });

  // Setup real-time crafting listeners (now includes edit support)
  setupCraftingListeners({
    editorType: targetType,
    getExport: handlerOptions.getExport,
    getEditorState: handlerOptions.getEditorState,
    getRenderer: handlerOptions.getRenderer,
  });

  return handler;
}

// Export utilities
export {
  LANGUAGE_MAP,
  LANGUAGE_CATEGORIES,
  NEEDS_JSON_PARSE,
  RAW_CODE_LANGUAGES,
  getLanguageCategory,
};

export default createArtifactHandler;