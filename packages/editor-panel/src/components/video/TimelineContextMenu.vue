<script setup>
/**
 * TimelineContextMenu - Context menu for timeline clips and tracks
 *
 * Shows different menu items based on what was right-clicked:
 * - Clip: Split, Duplicate, Copy, Cut, Delete
 * - Track label: Add Track Above/Below, Rename, Delete
 * - Empty area: Move Playhead, Add Track, Paste
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';

const { state, config } = getEditorState();

// Menu visibility and position
const visible = ref(false);
const position = ref({ x: 0, y: 0 });

// What was right-clicked: { type: 'clip'|'track'|'empty', id: string|null, time: number }
const contextTarget = ref(null);

// Menu items based on context
const menuItems = ref([]);

// Clipboard for copy/cut/paste
let clipboardData = null;

function hasClipboard() {
  return clipboardData !== null;
}

// Icons
const icons = {
  split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/></svg>',
  duplicate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  keyframe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L22 12L12 22L2 12Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  cleanup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  playhead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  fx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="6" y="17" font-size="12" font-weight="bold" fill="currentColor" stroke="none">FX</text></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  // FX icons - Filters
  brightness: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>',
  saturation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  grayscale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
  sepia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  blur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" opacity="0.3"/><circle cx="12" cy="12" r="6" opacity="0.5"/><circle cx="12" cy="12" r="9" opacity="0.7"/></svg>',
  hue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20"/><circle cx="12" cy="12" r="3"/></svg>',
  invert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M12 2a10 10 0 0 0 0 20" fill="currentColor"/></svg>',
  temperature: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
  // FX icons - Effects
  shadow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="12" height="12" rx="1"/><rect x="9" y="9" width="12" height="12" rx="1" opacity="0.4"/></svg>',
  glow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="7" opacity="0.5"/><circle cx="12" cy="12" r="10" opacity="0.3"/></svg>',
  outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1" stroke-dasharray="2 2"/></svg>',
  vignette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><ellipse cx="12" cy="12" rx="6" ry="6" opacity="0.5"/></svg>',
  grain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="7" cy="7" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="17" r="1"/><circle cx="12" cy="11" r="1"/></svg>',
  glitch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  chromatic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="12" r="6" opacity="0.5"/><circle cx="14" cy="12" r="6" opacity="0.5"/></svg>',
  pixelate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6"/><rect x="9" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="15" y="9" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="9" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/></svg>',
  sharpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 22 2 22"/></svg>',
  emboss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L2 12h5v9h10v-9h5z"/></svg>',
  // FX icons - Transitions
  fade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" opacity="0.3"/><rect x="6" y="6" width="12" height="12" rx="1" opacity="0.6"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
  slideLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M21 12H11M14 9l-3 3 3 3"/></svg>',
  slideRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="5" width="14" height="14" rx="2"/><path d="M3 12h10M10 9l3 3-3 3"/></svg>',
  slideUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="14" rx="2"/><path d="M12 21V11M9 14l3-3 3 3"/></svg>',
  slideDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="14" height="14" rx="2"/><path d="M12 3v10M9 10l3 3 3-3"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  wipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><path d="M12 3h9v18h-9" fill="currentColor" opacity="0.3"/></svg>',
  dissolve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2" opacity="0.3"/><circle cx="16" cy="8" r="2" opacity="0.6"/><circle cx="8" cy="16" r="2" opacity="0.6"/><circle cx="16" cy="16" r="2" opacity="0.3"/><circle cx="12" cy="12" r="2"/></svg>',
  spin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
  bounce: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="3"/><path d="M12 9v6"/><path d="M8 21c0-2 1.5-4 4-4s4 2 4 4"/></svg>',
  elastic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12s2-6 4-6 4 12 4 12 2-12 4-12 4 6 4 6"/></svg>',
  crossZoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  blurTransition: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3" opacity="0.4"/></svg>',
};

// Get icon by name with fallback
function getIcon(iconName) {
  return icons[iconName] || icons.fx;
}

// Get FX lists from config
const clipFilters = computed(() => {
  return config?.clipFx?.filters?.items || [
    { id: 'brightness', name: 'Brightness', icon: 'brightness' },
    { id: 'contrast', name: 'Contrast', icon: 'contrast' },
    { id: 'saturation', name: 'Saturation', icon: 'saturation' },
    { id: 'grayscale', name: 'Grayscale', icon: 'grayscale' },
    { id: 'sepia', name: 'Sepia', icon: 'sepia' },
    { id: 'blur', name: 'Blur', icon: 'blur' },
    { id: 'hueRotate', name: 'Hue Rotate', icon: 'hue' },
    { id: 'invert', name: 'Invert', icon: 'invert' },
    { id: 'temperature', name: 'Temperature', icon: 'temperature' },
  ];
});

const clipAnimations = computed(() => {
  return config?.clipFx?.animations?.items || [
    { id: 'fade', name: 'Fade', icon: 'fade' },
    { id: 'slideLeft', name: 'Slide Left', icon: 'slideLeft' },
    { id: 'slideRight', name: 'Slide Right', icon: 'slideRight' },
    { id: 'slideUp', name: 'Slide Up', icon: 'slideUp' },
    { id: 'slideDown', name: 'Slide Down', icon: 'slideDown' },
    { id: 'zoom', name: 'Zoom', icon: 'zoom' },
    { id: 'zoomIn', name: 'Zoom In', icon: 'zoomIn' },
    { id: 'zoomOut', name: 'Zoom Out', icon: 'zoomOut' },
    { id: 'wipe', name: 'Wipe', icon: 'wipe' },
    { id: 'dissolve', name: 'Dissolve', icon: 'dissolve' },
    { id: 'spin', name: 'Spin', icon: 'spin' },
    { id: 'flip', name: 'Flip', icon: 'flip' },
    { id: 'bounce', name: 'Bounce', icon: 'bounce' },
    { id: 'elastic', name: 'Elastic', icon: 'elastic' },
    { id: 'crossZoom', name: 'Cross Zoom', icon: 'crossZoom' },
    { id: 'blurTransition', name: 'Blur', icon: 'blurTransition' },
  ];
});

// Check if a clip has fade animations (legacy fadeIn/fadeOut properties)
function clipHasFade(shapeId, type) {
  const shape = state.shapes.find(s => s.id === shapeId);
  if (!shape) return false;
  if (type === 'in') return shape.fadeIn > 0;
  if (type === 'out') return shape.fadeOut > 0;
  return false;
}

// Check if a clip has a specific filter
function clipHasFilter(shapeId, filterName) {
  const shape = state.shapes.find(s => s.id === shapeId);
  if (!shape || !shape.fx || !Array.isArray(shape.fx)) return false;
  return shape.fx.some(fx => fx.type === 'filter' && fx.name === filterName);
}

// Check if a clip has a specific animation
function clipHasAnimation(shapeId, animationName) {
  const shape = state.shapes.find(s => s.id === shapeId);
  if (!shape || !shape.fx || !Array.isArray(shape.fx)) return false;
  return shape.fx.some(fx => fx.type === 'animation' && fx.name === animationName);
}

// Select a shape by ID (for FX editing via OptionsBar)
function selectShapeById(shapeId) {
  const index = state.shapes.findIndex(s => s.id === shapeId);
  if (index !== -1) {
    state.selectedIndices = [index];
    state.selectedFrameChildren = [];
    if (typeof window.render === 'function') {
      window.render();
    }
  }
}

// Build menu items for clip context
function getClipMenuItems() {
  const shapeId = contextTarget.value?.id;

  // Build filter submenu from config
  const filterSubmenu = clipFilters.value.map(filter => ({
    label: filter.name,
    action: `editFilter:${filter.id}`,
    icon: getIcon(filter.icon),
    checked: clipHasFilter(shapeId, filter.id),
  }));

  // Build animations submenu from config
  const animationsSubmenu = clipAnimations.value.map(anim => ({
    label: anim.name,
    action: `editAnimation:${anim.id}`,
    icon: getIcon(anim.icon),
    checked: clipHasAnimation(shapeId, anim.id),
  }));

  return [
    { label: 'Split at Playhead', action: 'split', icon: icons.split, shortcut: 'S' },
    { label: 'Duplicate', action: 'duplicate', icon: icons.duplicate, shortcut: 'Ctrl+D' },
    { divider: true },
    {
      label: 'Filters',
      icon: icons.brightness,
      submenu: filterSubmenu,
    },
    {
      label: 'Animations',
      icon: icons.fade,
      submenu: animationsSubmenu,
    },
    { divider: true },
    { label: 'Copy', action: 'copy', icon: icons.copy, shortcut: 'Ctrl+C' },
    { label: 'Cut', action: 'cut', icon: icons.cut, shortcut: 'Ctrl+X' },
    { divider: true },
    { label: 'Delete', action: 'delete', icon: icons.delete, shortcut: 'Del', danger: true },
  ];
}

// Build menu items for track label context
function getTrackMenuItems() {
  const canDelete = state.tracks && state.tracks.length > 1;
  return [
    { label: 'Add Track Above', action: 'addTrackAbove', icon: icons.add },
    { label: 'Add Track Below', action: 'addTrackBelow', icon: icons.add },
    { divider: true },
    { label: 'Rename Track', action: 'renameTrack', icon: icons.rename },
    { divider: true },
    { label: 'Delete Track', action: 'deleteTrack', icon: icons.delete, danger: true, disabled: !canDelete },
  ];
}

// Build menu items for empty area context
function getEmptyMenuItems() {
  // Check if there are any empty tracks
  const hasEmptyTracks = state.tracks?.some(
    track => !state.shapes.some(s => s.trackId === track.id)
  );

  return [
    { label: 'Move Playhead Here', action: 'movePlayhead', icon: icons.playhead },
    { divider: true },
    { label: 'Add Track', action: 'addTrack', icon: icons.add },
    { label: 'Clean Up Empty Tracks', action: 'cleanUpEmptyTracks', icon: icons.cleanup, disabled: !hasEmptyTracks },
    { divider: true },
    { label: 'Paste', action: 'paste', icon: icons.paste, shortcut: 'Ctrl+V', disabled: !hasClipboard() },
  ];
}

// Build menu items for viewport keyframe context
function getViewportKeyframeMenuItems() {
  return [
    { label: 'Jump to Keyframe', action: 'jumpToKeyframe', icon: icons.playhead },
    { divider: true },
    { label: 'Split Keyframe', action: 'splitKeyframe', icon: icons.split, shortcut: 'S' },
    { label: 'Duplicate Keyframe', action: 'duplicateKeyframe', icon: icons.duplicate, shortcut: 'Ctrl+D' },
    { divider: true },
    { label: 'Delete Keyframe', action: 'deleteKeyframe', icon: icons.delete, shortcut: 'Del', danger: true },
  ];
}

// Show the context menu
function show(x, y, target) {
  contextTarget.value = target;

  // Build appropriate menu items
  if (target.type === 'clip') {
    menuItems.value = getClipMenuItems();
  } else if (target.type === 'track') {
    menuItems.value = getTrackMenuItems();
  } else if (target.type === 'viewportKeyframe') {
    menuItems.value = getViewportKeyframeMenuItems();
  } else {
    menuItems.value = getEmptyMenuItems();
  }

  position.value = { x, y };
  visible.value = true;

  // Adjust position after render to stay on screen
  requestAnimationFrame(() => {
    const menu = document.querySelector('.timeline-context-menu.visible');
    if (menu) {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        position.value.x = x - rect.width;
      }
      if (rect.bottom > window.innerHeight) {
        position.value.y = y - rect.height;
      }
    }
  });
}

// Hide the context menu
function hide() {
  visible.value = false;
  contextTarget.value = null;
}

// Handle menu item click
function handleAction(action) {
  if (!contextTarget.value) return;

  const target = contextTarget.value;

  if (action.startsWith('editFilter:')) {
    const filterName = action.split(':')[1];
    hide();
    // Select the shape and open FX editor via OptionsBar
    selectShapeById(target.id);
    if (typeof window.openFxEdit === 'function') {
      window.openFxEdit('filter', filterName);
    }
    return;
  }
  if (action.startsWith('editAnimation:')) {
    const animationName = action.split(':')[1];
    hide();
    // Select the shape and open FX editor via OptionsBar
    selectShapeById(target.id);
    if (typeof window.openFxEdit === 'function') {
      window.openFxEdit('animation', animationName);
    }
    return;
  }

  switch (action) {
    case 'split':
      if (target.type === 'clip' && typeof window.splitClipAtPlayhead === 'function') {
        window.splitClipAtPlayhead(target.id);
      }
      break;

    case 'duplicate':
      if (target.type === 'clip' && typeof window.duplicateClip === 'function') {
        window.duplicateClip(target.id);
      }
      break;

    case 'copy':
      if (target.type === 'clip') {
        copyClip(target.id);
      }
      break;

    case 'cut':
      if (target.type === 'clip') {
        cutClip(target.id);
      }
      break;

    case 'delete':
      if (target.type === 'clip' && typeof window.deleteClip === 'function') {
        window.deleteClip(target.id);
      }
      break;

    case 'addTrack':
      if (typeof window.addTrack === 'function') {
        window.addTrack();
      }
      break;

    case 'addTrackAbove':
      if (typeof window.addTrackAt === 'function') {
        window.addTrackAt(target.id, 'above');
      }
      break;

    case 'addTrackBelow':
      if (typeof window.addTrackAt === 'function') {
        window.addTrackAt(target.id, 'below');
      }
      break;

    case 'renameTrack':
      if (typeof window.renameTrackPrompt === 'function') {
        window.renameTrackPrompt(target.id);
      }
      break;

    case 'deleteTrack':
      if (typeof window.deleteTrack === 'function') {
        window.deleteTrack(target.id);
      }
      break;

    case 'movePlayhead':
      if (target.time !== null && typeof window.seekTo === 'function') {
        window.seekTo(target.time);
      }
      break;

    case 'paste':
      pasteClip(target.time, target.id);
      break;

    case 'cleanUpEmptyTracks':
      if (typeof window.cleanUpEmptyTracks === 'function') {
        window.cleanUpEmptyTracks();
      }
      break;

    case 'jumpToKeyframe':
      // Jump to the keyframe time and apply its viewport
      if (target.shapeIndex >= 0 && state.shapes[target.shapeIndex]) {
        const shape = state.shapes[target.shapeIndex];
        state.currentTime = shape.startTime || 0;
        state.zoom = shape.zoom ?? 1;
        state.panX = shape.panX ?? 0;
        state.panY = shape.panY ?? 0;
        state.selectedIndices = [target.shapeIndex];
        state.selectedFrameChildren = [];
        if (typeof window.seekTo === 'function') {
          window.seekTo(shape.startTime || 0);
        }
        if (typeof window.render === 'function') {
          window.render();
        }
        if (typeof window.updateTimelineItems === 'function') {
          window.updateTimelineItems();
        }
      }
      break;

    case 'splitKeyframe':
      // Split the viewport keyframe at playhead (now uses regular splitClipAtPlayhead)
      if (target.shapeIndex >= 0 && typeof window.splitClipAtPlayhead === 'function') {
        state.selectedIndices = [target.shapeIndex];
        state.selectedFrameChildren = [];
        window.splitClipAtPlayhead(target.shapeIndex);
      }
      break;

    case 'duplicateKeyframe':
      // Duplicate the viewport keyframe (now uses regular duplicateClip)
      if (target.shapeIndex >= 0 && typeof window.duplicateClip === 'function') {
        window.duplicateClip(target.shapeIndex);
      }
      break;

    case 'deleteKeyframe':
      // Delete the viewport keyframe (now uses regular deleteClip)
      if (target.shapeIndex >= 0 && typeof window.deleteClip === 'function') {
        window.deleteClip(target.shapeIndex);
      }
      break;
  }

  hide();
}

// Clipboard operations
function copyClip(shapeId) {
  const shape = state.shapes.find(s => s.id === shapeId);
  if (shape) {
    clipboardData = { ...shape, id: null };
  }
}

function cutClip(shapeId) {
  copyClip(shapeId);
  if (typeof window.deleteClip === 'function') {
    window.deleteClip(shapeId);
  }
}

function pasteClip(time, trackId) {
  if (!clipboardData) return;

  const newShape = {
    ...clipboardData,
    id: 'shape-' + Date.now(),
    startTime: time || state.currentTime,
    trackId: trackId || (state.tracks && state.tracks[0]?.id),
  };

  state.shapes.push(newShape);

  if (typeof window.updateTimelineItems === 'function') {
    window.updateTimelineItems();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
  if (typeof window.render === 'function') {
    window.render();
  }
}

// Handle click outside to close menu
function handleClickOutside(e) {
  if (visible.value) {
    // Ignore right-clicks - they're handled by contextmenu event
    if (e.button === 2) return;

    const menu = document.querySelector('.timeline-context-menu');
    if (menu && !menu.contains(e.target)) {
      hide();
    }
  }
}

// Handle escape key to close menu
function handleKeydown(e) {
  if (e.key === 'Escape' && visible.value) {
    hide();
  }
}

// Handle right-click on timeline container
function handleTimelineContextMenu(e) {
  e.preventDefault();

  if (!state.timelineInstance) {
    return;
  }

  // Use vis-timeline's API to get what was clicked
  const props = state.timelineInstance.getEventProperties(e);

  // Get time at click position
  const time = props.time ? props.time.getTime() / 1000 : state.currentTime;

  if (props.item) {
    // Find the shape by ID
    const shapeIndex = state.shapes.findIndex(s => s.id === props.item);
    const shape = shapeIndex >= 0 ? state.shapes[shapeIndex] : null;

    // Check if it's a viewport keyframe shape
    if (shape && shape.type === 'viewportKeyframe') {
      show(e.clientX, e.clientY, { type: 'viewportKeyframe', shapeIndex, id: props.item, time });
      return;
    }
    // Right-clicked on a clip
    show(e.clientX, e.clientY, { type: 'clip', id: props.item, time });
  } else if (props.group) {
    // Right-clicked on a track
    const clickedLabel = e.target.closest('.vis-label');

    if (clickedLabel) {
      // Clicked on track label
      show(e.clientX, e.clientY, { type: 'track', id: props.group, time });
    } else {
      // Clicked on empty area within a track
      show(e.clientX, e.clientY, { type: 'empty', id: props.group, time });
    }
  } else {
    // Right-clicked on empty area (no group)
    show(e.clientX, e.clientY, {
      type: 'empty',
      id: state.tracks && state.tracks[0]?.id,
      time
    });
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);

  // Setup context menu listener on timeline container
  const setupListener = () => {
    const timelineContainer = document.getElementById('timeline-container');
    if (timelineContainer) {
      timelineContainer.addEventListener('contextmenu', handleTimelineContextMenu);
      return true;
    }
    return false;
  };

  // Try immediately, then retry if timeline not ready yet
  if (!setupListener()) {
    const interval = setInterval(() => {
      if (setupListener()) {
        clearInterval(interval);
      }
    }, 100);
    setTimeout(() => clearInterval(interval), 5000);
  }

  // Expose globally for legacy code compatibility
  window.showTimelineContextMenu = show;
  window.hideTimelineContextMenu = hide;
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);

  const timelineContainer = document.getElementById('timeline-container');
  if (timelineContainer) {
    timelineContainer.removeEventListener('contextmenu', handleTimelineContextMenu);
  }
});

// Expose methods for external use
defineExpose({ show, hide });
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      class="timeline-context-menu"
      :class="{ visible }"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
    >
      <template v-for="(item, index) in menuItems" :key="index">
        <div v-if="item.divider" class="timeline-context-menu-divider"></div>

        <!-- Item with submenu -->
        <div
          v-else-if="item.submenu"
          class="timeline-context-menu-item has-submenu"
        >
          <span v-if="item.icon" class="timeline-context-menu-icon" v-html="item.icon"></span>
          <span class="timeline-context-menu-label">{{ item.label }}</span>
          <span class="timeline-context-menu-arrow">›</span>

          <!-- Submenu -->
          <div class="timeline-context-submenu">
            <div
              v-for="(subitem, subindex) in item.submenu"
              :key="subindex"
              class="timeline-context-menu-item"
              :class="{ checked: subitem.checked }"
              @click.stop="handleAction(subitem.action)"
            >
              <span v-if="subitem.checked" class="timeline-context-menu-check" v-html="icons.check"></span>
              <span v-if="subitem.icon" class="timeline-context-menu-icon" v-html="subitem.icon"></span>
              <span v-else class="timeline-context-menu-check-placeholder"></span>
              <span class="timeline-context-menu-label">{{ subitem.label }}</span>
            </div>
          </div>
        </div>

        <!-- Regular item -->
        <div
          v-else
          class="timeline-context-menu-item"
          :class="{ disabled: item.disabled, danger: item.danger }"
          :data-action="item.action"
          @click="!item.disabled && handleAction(item.action)"
        >
          <span v-if="item.icon" class="timeline-context-menu-icon" v-html="item.icon"></span>
          <span class="timeline-context-menu-label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="timeline-context-menu-shortcut">{{ item.shortcut }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style>
/*
 * Timeline context menu styles are defined globally in styles/index.css
 * This component only needs the icon sizing override
 */
.timeline-context-menu-icon svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
