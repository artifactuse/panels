<script setup>
/**
 * OptionsBar - Shape properties editing bar
 *
 * Appears when shapes are selected. Provides controls for:
 * - Stroke color
 * - Fill color
 * - Stroke options (width, style, edges, roughness)
 * - Arrow options (line style, arrow type, head, size)
 * - Opacity
 * - Volume/speed (for media)
 * - Font options (for text)
 * - Layers (z-order)
 * - Duplicate/Delete
 * - More options
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';
import { getRecording } from '../../composables/useRecording.js';

const { state, config } = getEditorState();
const recording = getRecording();

// Visibility
const visible = ref(false);
const currentPopup = ref(null);

// Get selected shape(s)
const selectedShapes = computed(() => {
  const shapes = [];
  // Check for selected group children first (when in group mode)
  if (state.selectedGroupChildren && state.selectedGroupChildren.length > 0) {
    state.selectedGroupChildren.forEach(sel => {
      const group = state.shapes[sel.groupIndex];
      if (group?.children?.[sel.childIndex]) {
        shapes.push(group.children[sel.childIndex]);
      }
    });
  } else if (state.selectedFrameChildren && state.selectedFrameChildren.length > 0) {
    state.selectedFrameChildren.forEach(sel => {
      const frame = state.shapes[sel.frameIndex];
      if (frame?.children?.[sel.childIndex]) {
        shapes.push(frame.children[sel.childIndex]);
      }
    });
  } else if (state.selectedIndices.length > 0) {
    state.selectedIndices.forEach(i => {
      if (state.shapes[i]) shapes.push(state.shapes[i]);
    });
  }
  return shapes;
});

// First selected shape for previews
const firstShape = computed(() => selectedShapes.value[0]);

// Shape type flags
const hasText = computed(() => selectedShapes.value.some(s => s?.type === 'text'));
const hasArrow = computed(() => selectedShapes.value.some(s => s?.type === 'arrow'));
const hasLine = computed(() => selectedShapes.value.some(s => s?.type === 'line'));
const hasLineOrArrow = computed(() => hasArrow.value || hasLine.value);
const hasFreehand = computed(() => selectedShapes.value.some(s => s?.type === 'freehand'));
const hasMedia = computed(() => selectedShapes.value.some(s => s?.type === 'video' || s?.type === 'audio'));
const hasRasterMedia = computed(() => selectedShapes.value.some(s => ['image', 'video', 'audio'].includes(s?.type)));
const hasAudioOnly = computed(() => selectedShapes.value.every(s => s?.type === 'audio'));
const hasEffect = computed(() => selectedShapes.value.some(s => s?.type === 'effect'));
const hasFilter = computed(() => selectedShapes.value.some(s => s?.type === 'filter'));
const hasTransition = computed(() => selectedShapes.value.some(s => s?.type === 'transition'));
const hasCursor = computed(() => selectedShapes.value.some(s => s?.type === 'cursor'));
const hasCapture = computed(() => selectedShapes.value.some(s => s?.type === 'screenCapture' || s?.type === 'webcamCapture'));
const hasWebcamCapture = computed(() => selectedShapes.value.some(s => s?.type === 'webcamCapture'));
const hasRect = computed(() => selectedShapes.value.some(s => s?.type === 'rect'));
const hasCornerRadiusSupport = computed(() => selectedShapes.value.some(s => ['rect', 'image', 'video', 'frame', 'webcamCapture', 'screenCapture'].includes(s?.type)));
// Check if selection is ONLY media (image/video) or frames - these don't support stroke width/style/roughness
const hasOnlyMediaOrFrame = computed(() => selectedShapes.value.length > 0 && selectedShapes.value.every(s => ['image', 'video', 'frame'].includes(s?.type)));

// Corner radius linking state (when true, all corners use same value)
const cornerRadiusLinked = ref(true);

// Cursor types from config
const cursorTypesConfig = computed(() => config?.cursorTypes || {});
const cursorTypesList = computed(() => Object.entries(cursorTypesConfig.value).map(([id, def]) => ({
  id,
  name: def.name || id,
  icon: def.icon || ''
})));

// Video mode - show FX button for any visual clip (not effect/filter/transition clip types)
const isVideoMode = computed(() => config?.video?.enabled === true);
const canHaveFx = computed(() => {
  if (!isVideoMode.value) return false;
  // Any clip that isn't an effect/filter/transition clip itself can have FX applied
  return selectedShapes.value.some(s => s && !['effect', 'filter', 'transition'].includes(s.type));
});

// Viewport keyframe selection - now checks if selected shape is a viewport keyframe
const hasViewportKeyframe = computed(() => {
  if (!isVideoMode.value) return false;
  if (state.selectedIndices.length !== 1) return false;
  const shape = state.shapes[state.selectedIndices[0]];
  return shape?.type === 'viewportKeyframe';
});
const activeKeyframe = computed(() => {
  if (!hasViewportKeyframe.value) return null;
  return state.shapes[state.selectedIndices[0]];
});

// Local keyframe editing values
const kfZoom = ref(1);
const kfPanX = ref(0);
const kfPanY = ref(0);
const kfEasing = ref('ease-in-out');

// Keyframe easing options
const kfEasingOptions = [
  { value: 'linear', label: 'Linear', path: 'M2 14 L22 2' },
  { value: 'ease-in', label: 'Ease In', path: 'M2 14 Q2 2 22 2' },
  { value: 'ease-out', label: 'Ease Out', path: 'M2 14 Q22 14 22 2' },
  { value: 'ease-in-out', label: 'Ease In/Out', path: 'M2 14 Q2 8 12 8 Q22 8 22 2' },
  { value: 'ease', label: 'Ease', path: 'M2 14 C2 8 22 8 22 2' },
];

// FX editing state
const currentFxType = ref(null); // 'filter', 'effect', 'animation'
const currentFxName = ref(null);
const localFx = ref({});

// Animation preview state
const isPreviewingAnimation = ref(false);
const previewTimeoutId = ref(null);
const previewDebounceId = ref(null);
const savedPlayheadPosition = ref(null);
const wasPlayingBeforePreview = ref(false);

// FX defaults for each type
const fxDefaults = {
  // Filters
  brightness: { value: 100 },
  contrast: { value: 100 },
  saturation: { value: 100 },
  grayscale: { value: 0 },
  sepia: { value: 0 },
  blur: { value: 0, duration: 0.5, easing: 'ease-in-out', position: 'in', intensity: 20 },
  hueRotate: { value: 0 },
  invert: { value: 0 },
  temperature: { value: 0 },
  // Effects
  dropShadow: { intensity: 50, offsetX: 5, offsetY: 5, blur: 10, color: '#000000' },
  glow: { intensity: 50, radius: 10, blur: 10, color: '#ffffff' },
  outline: { intensity: 100, width: 2, color: '#000000' },
  vignette: { intensity: 50, radius: 50 },
  grain: { intensity: 30 },
  glitch: { intensity: 50 },
  chromatic: { intensity: 50 },
  pixelate: { intensity: 100, radius: 10 },
  sharpen: { intensity: 50 },
  emboss: { intensity: 50 },
  // Animations (clip FX) - position defaults to 'in'
  fade: { duration: 0.5, easing: 'ease-in-out', position: 'in' },
  dissolve: { duration: 0.5, easing: 'ease-in-out', position: 'in' },
  // Wipe animations
  wipe: { duration: 0.5, easing: 'ease-in-out', position: 'in', direction: 'left' },
  // Slide animations
  slideLeft: { duration: 0.5, easing: 'ease-in-out', position: 'in' },
  slideRight: { duration: 0.5, easing: 'ease-in-out', position: 'in' },
  slideUp: { duration: 0.5, easing: 'ease-in-out', position: 'in' },
  slideDown: { duration: 0.5, easing: 'ease-in-out', position: 'in' },
  // Zoom animations
  zoom: { duration: 0.5, easing: 'ease-in-out', position: 'in', scale: 0.5 },
  zoomIn: { duration: 0.5, easing: 'ease-in-out', position: 'in', scale: 0.5 },
  zoomOut: { duration: 0.5, easing: 'ease-in-out', position: 'in', scale: 1.5 },
  crossZoom: { duration: 0.5, easing: 'ease-in-out', position: 'in', scale: 1.2 },
  // Rotation animations
  spin: { duration: 0.5, easing: 'ease-in-out', position: 'in', rotation: 360 },
  flip: { duration: 0.5, easing: 'ease-in-out', position: 'in', rotation: 180 },
  // Physics-based animations
  bounce: { duration: 0.5, easing: 'ease-out', position: 'in' },
  elastic: { duration: 0.5, easing: 'ease-out', position: 'in' },
  // 3D rotation animation
  rotate3d: { duration: 0.5, easing: 'ease-in-out', position: 'in', rotateX: 0, rotateY: 90, rotateZ: 0, perspective: 800 },
  // Transitions (timeline FX - not clip FX, keep separate defaults)
  wipeLeft: { duration: 0.5, easing: 'ease-in-out' },
  wipeRight: { duration: 0.5, easing: 'ease-in-out' },
  wipeUp: { duration: 0.5, easing: 'ease-in-out' },
  wipeDown: { duration: 0.5, easing: 'ease-in-out' },
  // Ken Burns effect (slow zoom with pan between two focal points)
  kenBurns: { duration: 3.0, easing: 'linear', startZoom: 100, endZoom: 120, startFocalPoint: 'center', endFocalPoint: 'center', startFocalX: 50, startFocalY: 50, endFocalX: 50, endFocalY: 50 },
};

// Filter config
const filterConfig = {
  brightness: { min: 0, max: 200, step: 1, unit: '%', label: 'Brightness' },
  contrast: { min: 0, max: 200, step: 1, unit: '%', label: 'Contrast' },
  saturation: { min: 0, max: 200, step: 1, unit: '%', label: 'Saturation' },
  grayscale: { min: 0, max: 100, step: 1, unit: '%', label: 'Grayscale' },
  sepia: { min: 0, max: 100, step: 1, unit: '%', label: 'Sepia' },
  blur: { min: 0, max: 20, step: 1, unit: 'px', label: 'Blur' },
  hueRotate: { min: 0, max: 360, step: 1, unit: '°', label: 'Hue Rotate' },
  invert: { min: 0, max: 100, step: 1, unit: '%', label: 'Invert' },
  temperature: { min: -100, max: 100, step: 1, unit: '', label: 'Temperature' },
};

// Easing options with SVG paths
const easingOptions = [
  { value: 'linear', label: 'Linear', path: 'M2 14 L22 2' },
  { value: 'ease-in', label: 'Ease In', path: 'M2 14 Q2 2 22 2' },
  { value: 'ease-out', label: 'Ease Out', path: 'M2 14 Q22 14 22 2' },
  { value: 'ease-in-out', label: 'Ease In/Out', path: 'M2 14 Q2 8 12 8 Q22 8 22 2' },
];

// Position options
const positionOptions = [
  { value: 'in', label: 'Start' },
  { value: 'out', label: 'End' },
  { value: 'both', label: 'Both' },
];

// FX icons (SVG paths)
const fxIcons = {
  // Filters
  brightness: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>',
  saturation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  grayscale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
  sepia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  blur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" opacity="0.3"/><circle cx="12" cy="12" r="6" opacity="0.5"/><circle cx="12" cy="12" r="9" opacity="0.7"/></svg>',
  hue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20"/><circle cx="12" cy="12" r="3"/></svg>',
  invert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M12 2a10 10 0 0 0 0 20" fill="currentColor"/></svg>',
  temperature: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
  // Effects
  shadow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="12" height="12" rx="1"/><rect x="9" y="9" width="12" height="12" rx="1" opacity="0.4"/></svg>',
  glow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="7" opacity="0.5"/><circle cx="12" cy="12" r="10" opacity="0.3"/></svg>',
  outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1" stroke-dasharray="2 2"/></svg>',
  vignette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><ellipse cx="12" cy="12" rx="6" ry="6" opacity="0.5"/></svg>',
  grain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="7" cy="7" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="17" r="1"/><circle cx="12" cy="11" r="1"/></svg>',
  pixelate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6"/><rect x="9" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="15" y="9" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="9" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/></svg>',
  sharpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 22 2 22"/></svg>',
  emboss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L2 12h5v9h10v-9h5z"/></svg>',
  glitch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/><path d="M7 9v6" stroke-dasharray="2 2"/><path d="M17 9v6" stroke-dasharray="2 2"/></svg>',
  chromatic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="12" r="6" opacity="0.5"/><circle cx="14" cy="12" r="6" opacity="0.5"/><circle cx="12" cy="10" r="6" opacity="0.5"/></svg>',
  // Transitions
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
  rotate3d: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l4-2 12 4-4 2z" opacity="0.3"/><path d="M4 8l4 2 12-4"/><path d="M8 10v8l12-4V6"/><path d="M4 8v8l4 2"/><path d="M18 4c1.5 0 2.5 1 2.5 2.5" stroke-width="1.5"/><path d="M19.5 4l1 2.5-2 .5" stroke-width="1.5"/></svg>',
  crossZoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="4"/></svg>',
  blurTransition: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3" opacity="0.4"/></svg>',
  kenBurns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9l4 3-4 3"/><circle cx="16" cy="12" r="2"/><path d="M3 12h2M19 12h2" stroke-dasharray="1 1"/></svg>',
};

// Get FX icon by id (checks both direct id and mapped icons)
function getFxIcon(iconId) {
  // Direct match
  if (fxIcons[iconId]) return fxIcons[iconId];
  // Map some config icon names to our icons
  const iconMap = {
    'hueRotate': 'hue',
    'dropShadow': 'shadow',
  };
  return fxIcons[iconMap[iconId]] || fxIcons[iconId] || '';
}

// Get FX lists from config (with fallbacks)
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
    { id: 'rotate3d', name: '3D Rotate', icon: 'rotate3d' },
  ];
});

// FX display names (built from config lists)
const fxDisplayNames = computed(() => {
  const names = {};
  clipFilters.value.forEach(f => names[f.id] = f.name);
  clipAnimations.value.forEach(a => names[a.id] = a.name);
  return names;
});

// Max animation duration based on clip duration
const maxAnimationDuration = computed(() => {
  if (!firstShape.value) return 3;
  const clipDuration = firstShape.value.duration || config.video?.defaultClipDuration || 5;
  return clipDuration;
});

// Check if shape has specific FX
function shapeHasFx(fxType, fxName) {
  if (!firstShape.value) return false;
  const fx = firstShape.value.fx;
  if (!fx || !Array.isArray(fx)) return false;
  return fx.some(f => f.type === fxType && f.name === fxName);
}

// Color palettes from config
const strokePalette = computed(() =>
  config?.theme?.colors?.strokePalette || ['transparent', '#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#6741d9']
);
const fillPalette = computed(() =>
  config?.theme?.colors?.fillPalette || ['transparent', '#ffe8e8', '#d3f9d8', '#d0ebff', '#fff3bf', '#e5dbff']
);
const shadowPalette = computed(() =>
  config?.theme?.colors?.shadowPalette || ['#000000', '#1e1e1e', '#374151', '#6b7280', '#e03131', '#1971c2', '#6741d9']
);

// Font options
const fonts = computed(() => config?.text?.fonts || ['Sans-serif', 'Serif', 'Monospace', 'Cursive']);
const allowBold = computed(() => config?.text?.allowBold !== false);
const allowItalic = computed(() => config?.text?.allowItalic !== false);
const allowUnderline = computed(() => config?.text?.allowUnderline !== false);

// Stroke hex input
const strokeHex = ref('1e1e1e');
const fillHex = ref('');
const shadowHex = ref('000000');

// Opacity slider
const opacityValue = ref(100);

// Volume controls
const volumeValue = ref(100);
const speedValue = ref(1);
const fadeInValue = ref(0);
const fadeOutValue = ref(0);

// Watch selection and update visibility (shapes)
watch([() => state.selectedIndices.length, () => state.selectedFrameChildren?.length], () => {
  const hasSelection = state.selectedIndices.length > 0 || (state.selectedFrameChildren && state.selectedFrameChildren.length > 0);
  if (hasSelection) {
    visible.value = true;
    updateFromSelection();
  } else if (!hasViewportKeyframe.value) {
    visible.value = false;
    hideAllPopups();
  }
}, { immediate: true });

// Watch viewport keyframe selection via hasViewportKeyframe computed
watch(hasViewportKeyframe, (hasKf) => {
  if (hasKf) {
    visible.value = true;
    updateFromKeyframe();
  }
}, { immediate: true });

// Update UI from selection
function updateFromSelection() {
  if (!firstShape.value) return;

  const shape = firstShape.value;

  // Update stroke hex
  const color = shape.color || '#1e1e1e';
  strokeHex.value = color === 'transparent' ? '' : color.replace('#', '');

  // Update fill hex
  const fill = shape.fillColor || 'transparent';
  fillHex.value = fill === 'transparent' ? '' : fill.replace('#', '');

  // Update opacity
  opacityValue.value = shape.opacity !== undefined ? shape.opacity : 100;

  // Update volume for media
  if (hasMedia.value) {
    volumeValue.value = shape.volume !== undefined ? shape.volume : 100;
    speedValue.value = shape.playbackRate !== undefined ? shape.playbackRate : 1;
    fadeInValue.value = shape.fadeIn !== undefined ? shape.fadeIn : 0;
    fadeOutValue.value = shape.fadeOut !== undefined ? shape.fadeOut : 0;
  }
}

// Update UI from keyframe
function updateFromKeyframe() {
  const kf = activeKeyframe.value;
  if (!kf) return;

  kfZoom.value = kf.zoom ?? 1;
  kfPanX.value = kf.panX ?? 0;
  kfPanY.value = kf.panY ?? 0;
  kfEasing.value = kf.easing ?? 'ease-in-out';
}

// Update keyframe property and apply to canvas in real-time
function updateKeyframe(updates) {
  const shape = activeKeyframe.value;
  if (!shape) return;

  Object.assign(shape, updates);

  // Apply viewport changes to canvas in real-time
  if ('zoom' in updates) state.zoom = shape.zoom;
  if ('panX' in updates) state.panX = shape.panX;
  if ('panY' in updates) state.panY = shape.panY;
  if (typeof window.render === 'function') {
    window.render();
  }

  // Update timeline
  if (typeof window.updateTimelineItems === 'function') {
    window.updateTimelineItems();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

// Keyframe input handlers
function onKfZoomInput(e) {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val >= 0.1 && val <= 10) {
    kfZoom.value = val;

    // Re-clamp pan values to new zoom limits
    const { minPanX, maxPanX, minPanY, maxPanY } = getPanLimits(val);
    const clampedPanX = Math.round(Math.max(minPanX, Math.min(maxPanX, kfPanX.value)));
    const clampedPanY = Math.round(Math.max(minPanY, Math.min(maxPanY, kfPanY.value)));

    kfPanX.value = clampedPanX;
    kfPanY.value = clampedPanY;
    updateKeyframe({ zoom: val, panX: clampedPanX, panY: clampedPanY });
  }
}

function onKfPanXInput(e) {
  const val = parseFloat(e.target.value);
  if (!isNaN(val)) {
    const zoom = kfZoom.value || 1;
    const { minPanX, maxPanX } = getPanLimits(zoom);
    const clamped = Math.round(Math.max(minPanX, Math.min(maxPanX, val)));
    kfPanX.value = clamped;
    updateKeyframe({ panX: clamped });
  }
}

function onKfPanYInput(e) {
  const val = parseFloat(e.target.value);
  if (!isNaN(val)) {
    const zoom = kfZoom.value || 1;
    const { minPanY, maxPanY } = getPanLimits(zoom);
    const clamped = Math.round(Math.max(minPanY, Math.min(maxPanY, val)));
    kfPanY.value = clamped;
    updateKeyframe({ panY: clamped });
  }
}

// Pan position picker state
const panPickerRef = ref(null);
const panPickerActive = ref(false);

// Get canvas dimensions for pan limits
function getCanvasDimensions() {
  const canvas = document.getElementById('main-canvas');
  const width = state.canvasWidth || canvas?.width || config.canvas?.width || 1920;
  const height = state.canvasHeight || canvas?.height || config.canvas?.height || 1080;
  return { width, height };
}

// Get canvas aspect ratio for picker styling
function getCanvasAspectRatio() {
  const { width, height } = getCanvasDimensions();
  return width / height;
}

// Get viewport box size as percentage of picker (shows where camera is looking)
function getViewportBoxStyle() {
  const zoom = kfZoom.value || 1;
  if (zoom <= 1) {
    // When zoomed out, viewport covers entire frame or more
    return { display: 'none' };
  }
  // Viewport size as percentage of frame
  const size = (1 / zoom) * 100;
  const pos = getPanPickerPosition();
  // Center the box on the handle position
  return {
    width: size + '%',
    height: size + '%',
    left: `calc(${pos.x}% - ${size / 2}%)`,
    top: `calc(${pos.y}% - ${size / 2}%)`
  };
}

// Calculate pan limits based on zoom and canvas size
// When zoomed in, the viewport is smaller than the frame, allowing pan movement
// Pan range: minPan to maxPan where viewport edges align with frame edges
function getPanLimits(zoom) {
  const { width, height } = getCanvasDimensions();
  // At zoom 1: viewport = frame, no pan allowed (min = max = 0)
  // At zoom > 1: viewport < frame, can pan within frame
  // At zoom < 1: viewport > frame, pan constrained differently

  if (zoom >= 1) {
    // Zoomed in: pan can move the smaller viewport within the frame
    // minPan = frame edge aligns with viewport right/bottom edge
    // maxPan = 0 (frame edge aligns with viewport left/top edge)
    const minPanX = width - width * zoom;
    const maxPanX = 0;
    const minPanY = height - height * zoom;
    const maxPanY = 0;
    return { minPanX, maxPanX, minPanY, maxPanY };
  } else {
    // Zoomed out: viewport larger than frame
    // Center the frame in viewport, limited pan allowed
    const extraWidth = (width * zoom - width) / 2;
    const extraHeight = (height * zoom - height) / 2;
    return {
      minPanX: extraWidth,
      maxPanX: -extraWidth,
      minPanY: extraHeight,
      maxPanY: -extraHeight
    };
  }
}

function startPanPicker(e) {
  e.preventDefault();
  panPickerActive.value = true;
  updatePanFromEvent(e);
  document.addEventListener('mousemove', onPanPickerMove);
  document.addEventListener('mouseup', onPanPickerEnd);
}

function onPanPickerMove(e) {
  if (!panPickerActive.value) return;
  updatePanFromEvent(e);
}

function updatePanFromEvent(e) {
  if (!panPickerRef.value) return;

  const rect = panPickerRef.value.getBoundingClientRect();
  // Calculate percentage position (0-100)
  let percentX = ((e.clientX - rect.left) / rect.width) * 100;
  let percentY = ((e.clientY - rect.top) / rect.height) * 100;

  // Clamp to 0-100
  percentX = Math.max(0, Math.min(100, percentX));
  percentY = Math.max(0, Math.min(100, percentY));

  // Get pan limits based on current keyframe zoom
  const zoom = kfZoom.value || 1;
  const { minPanX, maxPanX, minPanY, maxPanY } = getPanLimits(zoom);

  // Convert percentage to pan value within limits
  // 0% = maxPan (right/bottom edge), 100% = minPan (left/top edge)
  // 50% = center (0 when zoom = 1)
  const rangeX = maxPanX - minPanX;
  const rangeY = maxPanY - minPanY;

  let newPanX = maxPanX - (percentX / 100) * rangeX;
  let newPanY = maxPanY - (percentY / 100) * rangeY;

  // Clamp to limits
  newPanX = Math.round(Math.max(minPanX, Math.min(maxPanX, newPanX)));
  newPanY = Math.round(Math.max(minPanY, Math.min(maxPanY, newPanY)));

  kfPanX.value = newPanX;
  kfPanY.value = newPanY;
  updateKeyframe({ panX: newPanX, panY: newPanY });
}

function onPanPickerEnd() {
  panPickerActive.value = false;
  document.removeEventListener('mousemove', onPanPickerMove);
  document.removeEventListener('mouseup', onPanPickerEnd);
}

// Compute picker handle position from pan values
function getPanPickerPosition() {
  const zoom = kfZoom.value || 1;
  const { minPanX, maxPanX, minPanY, maxPanY } = getPanLimits(zoom);

  const rangeX = maxPanX - minPanX;
  const rangeY = maxPanY - minPanY;

  // Convert pan values to percentage
  // panX = maxPanX -> 0%, panX = minPanX -> 100%
  let percentX = rangeX !== 0 ? ((maxPanX - kfPanX.value) / rangeX) * 100 : 50;
  let percentY = rangeY !== 0 ? ((maxPanY - kfPanY.value) / rangeY) * 100 : 50;

  return {
    x: Math.max(0, Math.min(100, percentX)),
    y: Math.max(0, Math.min(100, percentY))
  };
}

function setKfEasing(easing) {
  kfEasing.value = easing;
  updateKeyframe({ easing });
}

// Reset keyframe from current canvas viewport
function resetKeyframeFromCanvas() {
  const shape = activeKeyframe.value;
  if (!shape) return;

  // Capture current canvas state
  const newZoom = state.zoom ?? 1;
  const newPanX = state.panX ?? 0;
  const newPanY = state.panY ?? 0;

  // Update local refs
  kfZoom.value = newZoom;
  kfPanX.value = newPanX;
  kfPanY.value = newPanY;

  // Update keyframe shape
  Object.assign(shape, {
    zoom: newZoom,
    panX: newPanX,
    panY: newPanY
  });

  // Update timeline
  if (typeof window.updateTimelineItems === 'function') {
    window.updateTimelineItems();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

// Delete selected keyframe (now uses regular deleteClip since keyframes are shapes)
function deleteKeyframe() {
  if (state.selectedIndices.length !== 1) return;
  const index = state.selectedIndices[0];
  const shape = state.shapes[index];
  if (!shape || shape.type !== 'viewportKeyframe') return;

  if (typeof window.deleteClip === 'function') {
    window.deleteClip(index);
  }
}

// Duplicate selected keyframe (now uses regular duplicateClip since keyframes are shapes)
function duplicateKeyframe() {
  if (state.selectedIndices.length !== 1) return;
  const index = state.selectedIndices[0];
  const shape = state.shapes[index];
  if (!shape || shape.type !== 'viewportKeyframe') return;

  if (typeof window.duplicateClip === 'function') {
    window.duplicateClip(index);
  }
}

// Popup positioning
async function togglePopup(name, event) {
  // Store button reference before any async operations
  const btn = event.currentTarget;

  if (currentPopup.value === name) {
    hideAllPopups();
    return;
  }

  hideAllPopups();
  currentPopup.value = name;

  // Wait for Vue to update the DOM with the visible class
  await nextTick();

  // Query within vue-overlay-root to find our popup (not legacy ones)
  const popup = document.querySelector(`#vue-overlay-root #opt-popup-${name}`);
  if (!popup || !btn) return;

  // Position off-screen first to get accurate dimensions (matches legacy/context menu approach)
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';

  // Wait for render to get accurate dimensions
  await new Promise(resolve => requestAnimationFrame(resolve));

  // Get button position
  const btnRect = btn.getBoundingClientRect();

  // Get popup dimensions
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;

  // Position to the right of the button
  let left = btnRect.right + 8;
  let top = btnRect.top;

  // Ensure popup doesn't go off screen right
  if (left + popupWidth > window.innerWidth - 8) {
    // Position to the left of the button instead
    left = btnRect.left - popupWidth - 8;
  }

  // Ensure popup doesn't go off screen left
  if (left < 8) {
    left = 8;
  }

  // Ensure popup doesn't go off screen bottom
  if (top + popupHeight > window.innerHeight - 8) {
    top = window.innerHeight - popupHeight - 8;
  }

  // Ensure popup doesn't go off screen top
  if (top < 8) {
    top = 8;
  }

  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
}

function hideAllPopups() {
  currentPopup.value = null;
}

// Open a popup programmatically (finds button by data attribute)
async function openPopup(name) {
  if (currentPopup.value === name) return; // Already open

  const btn = document.querySelector(`#vue-overlay-root [data-opt="${name}"]`);
  if (!btn) return;

  hideAllPopups();
  currentPopup.value = name;

  await nextTick();

  const popup = document.querySelector(`#vue-overlay-root #opt-popup-${name}`);
  if (!popup) return;

  // Position off-screen first to get accurate dimensions
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';

  await new Promise(resolve => requestAnimationFrame(resolve));

  const btnRect = btn.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;

  let left = btnRect.right + 8;
  let top = btnRect.top;

  if (left + popupWidth > window.innerWidth - 8) {
    left = btnRect.left - popupWidth - 8;
  }
  if (left < 8) left = 8;
  if (top + popupHeight > window.innerHeight - 8) {
    top = window.innerHeight - popupHeight - 8;
  }
  if (top < 8) top = 8;

  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
}

// Helper to trigger render after property changes
function renderAfterChange() {
  if (typeof window.render === 'function') window.render();
  if (typeof window.saveState === 'function') window.saveState();
  if (typeof window.updateTimelineItems === 'function') window.updateTimelineItems();
}

// Focal point drag state
let focalDragTarget = null; // 'focal', 'startFocal', 'endFocal'
let focalDragElement = null;

function startFocalDrag(e, target) {
  focalDragTarget = target;
  focalDragElement = e.currentTarget;

  // Handle both mouse and touch
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  updateFocalFromEvent(clientX, clientY);

  document.addEventListener('mousemove', onFocalDrag);
  document.addEventListener('mouseup', stopFocalDrag);
  document.addEventListener('touchmove', onFocalDrag, { passive: false });
  document.addEventListener('touchend', stopFocalDrag);
}

function onFocalDrag(e) {
  if (!focalDragTarget || !focalDragElement) return;

  e.preventDefault();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  updateFocalFromEvent(clientX, clientY);
}

function updateFocalFromEvent(clientX, clientY) {
  if (!focalDragElement || !firstShape.value) return;

  const rect = focalDragElement.getBoundingClientRect();
  let x = ((clientX - rect.left) / rect.width) * 100;
  let y = ((clientY - rect.top) / rect.height) * 100;

  // Clamp to 0-100
  x = Math.max(0, Math.min(100, Math.round(x)));
  y = Math.max(0, Math.min(100, Math.round(y)));

  const shape = firstShape.value;

  if (focalDragTarget === 'focal') {
    shape.focalX = x;
    shape.focalY = y;
    shape.focalPoint = 'custom';
  } else if (focalDragTarget === 'startFocal') {
    shape.startFocalX = x;
    shape.startFocalY = y;
    shape.startFocalPoint = 'custom';
  } else if (focalDragTarget === 'endFocal') {
    shape.endFocalX = x;
    shape.endFocalY = y;
    shape.endFocalPoint = 'custom';
  }

  if (typeof window.render === 'function') window.render();
}

function stopFocalDrag() {
  if (focalDragTarget) {
    if (typeof window.saveState === 'function') window.saveState();
  }
  focalDragTarget = null;
  focalDragElement = null;

  document.removeEventListener('mousemove', onFocalDrag);
  document.removeEventListener('mouseup', stopFocalDrag);
  document.removeEventListener('touchmove', onFocalDrag);
  document.removeEventListener('touchend', stopFocalDrag);
}

/**
 * Apply a property change to a shape and recursively to group children
 */
function applyToShapeAndChildren(shape, property, value) {
  // Apply to the shape itself (skip groups as they don't have these visual properties)
  if (shape.type !== 'group') {
    shape[property] = value;
  }
  // Recursively apply to group children
  if (shape.type === 'group' && shape.children) {
    shape.children.forEach(child => applyToShapeAndChildren(child, property, value));
  }
}

// Stroke color
function setStroke(color) {
  state.currentColor = color;
  strokeHex.value = color === 'transparent' ? '' : color.replace('#', '');

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => applyToShapeAndChildren(s, 'color', color));
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onStrokeHexInput(e) {
  let hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  strokeHex.value = hex;
  if (hex.length === 6) {
    setStroke('#' + hex);
  }
}

function onStrokePickerChange(e) {
  setStroke(e.target.value);
}

// Fill color
function setFill(color) {
  state.currentFill = color;
  fillHex.value = color === 'transparent' ? '' : color.replace('#', '');

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => applyToShapeAndChildren(s, 'fillColor', color));
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onFillHexInput(e) {
  let hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  fillHex.value = hex;
  if (hex.length === 6) {
    setFill('#' + hex);
  }
}

function onFillPickerChange(e) {
  setFill(e.target.value);
}

// Stroke width
function setStrokeWidth(width) {
  state.currentSize = parseInt(width);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => applyToShapeAndChildren(s, 'lineWidth', parseInt(width)));
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Stroke style (solid, dashed, dotted)
function setStrokeStyle(style) {
  state.currentStrokeStyle = style;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => applyToShapeAndChildren(s, 'strokeStyle', style));
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Corner radius (for rectangles, images, videos, frames, captures)
// Shape types that support corner radius
const cornerRadiusTypes = ['rect', 'image', 'video', 'frame', 'webcamCapture', 'screenCapture'];

function setCornerRadius(value, corner = null) {
  const radius = Math.max(0, parseInt(value) || 0);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (!cornerRadiusTypes.includes(s.type)) return;

      if (corner && !cornerRadiusLinked.value) {
        // Set individual corner
        if (!s.cornerRadii) {
          // Initialize from current uniform radius or 0
          const current = s.cornerRadius || 0;
          s.cornerRadii = { tl: current, tr: current, br: current, bl: current };
        }
        s.cornerRadii[corner] = radius;
        delete s.cornerRadius;
      } else {
        // Set uniform radius for all corners
        s.cornerRadius = radius;
        delete s.cornerRadii;
      }

      // Clear edgeStyle when using custom radius (for rects)
      if (radius > 0 && s.type === 'rect') {
        delete s.edgeStyle;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Toggle corner radius linking
function toggleCornerRadiusLink() {
  cornerRadiusLinked.value = !cornerRadiusLinked.value;

  // When linking, sync all corners to the max value
  if (cornerRadiusLinked.value && selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (!cornerRadiusTypes.includes(s.type) || !s.cornerRadii) return;
      const maxRadius = Math.max(s.cornerRadii.tl || 0, s.cornerRadii.tr || 0, s.cornerRadii.br || 0, s.cornerRadii.bl || 0);
      s.cornerRadius = maxRadius;
      delete s.cornerRadii;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Computed corner radius values for reactivity
const cornerRadiusAll = computed(() => {
  const shape = firstShape.value;
  if (!shape || !cornerRadiusTypes.includes(shape.type)) return 0;
  return shape.cornerRadius || 0;
});

const cornerRadiusTL = computed(() => {
  const shape = firstShape.value;
  if (!shape || !cornerRadiusTypes.includes(shape.type)) return 0;
  return shape.cornerRadii?.tl || shape.cornerRadius || 0;
});

const cornerRadiusTR = computed(() => {
  const shape = firstShape.value;
  if (!shape || !cornerRadiusTypes.includes(shape.type)) return 0;
  return shape.cornerRadii?.tr || shape.cornerRadius || 0;
});

const cornerRadiusBL = computed(() => {
  const shape = firstShape.value;
  if (!shape || !cornerRadiusTypes.includes(shape.type)) return 0;
  return shape.cornerRadii?.bl || shape.cornerRadius || 0;
});

const cornerRadiusBR = computed(() => {
  const shape = firstShape.value;
  if (!shape || !cornerRadiusTypes.includes(shape.type)) return 0;
  return shape.cornerRadii?.br || shape.cornerRadius || 0;
});

// Roughness
function setRoughness(level) {
  state.currentRoughness = parseInt(level);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => applyToShapeAndChildren(s, 'roughness', parseInt(level)));
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Arrow/line options
function setArrowType(type) {
  state.currentArrowType = type;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'arrow') s.arrowType = type;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setArrowHead(style) {
  state.currentArrowHeadStyle = style;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'arrow') s.arrowHeadStyle = style;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setArrowSize(size) {
  state.currentArrowHeadSize = size;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'arrow') s.arrowHeadSize = size;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Opacity
function onOpacityChange(e) {
  const val = parseInt(e.target.value);
  opacityValue.value = val;
  state.currentOpacity = val;

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => applyToShapeAndChildren(s, 'opacity', val));
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Volume
function onVolumeChange(e) {
  const val = parseInt(e.target.value);
  volumeValue.value = val;

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'video' || s.type === 'audio') {
        s.volume = val;
        // Try shape property first, then media registry
        let mediaEl = s.videoElement || s.audioElement;
        if (!mediaEl && typeof window.getMediaElement === 'function') {
          mediaEl = window.getMediaElement(s.id);
        }
        if (mediaEl) mediaEl.volume = val / 100;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function toggleMute() {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'video' || s.type === 'audio') {
        if (s.volume > 0) {
          s._prevVolume = s.volume;
          s.volume = 0;
        } else {
          s.volume = s._prevVolume || 100;
        }
        // Try shape property first, then media registry
        let mediaEl = s.videoElement || s.audioElement;
        if (!mediaEl && typeof window.getMediaElement === 'function') {
          mediaEl = window.getMediaElement(s.id);
        }
        if (mediaEl) mediaEl.volume = s.volume / 100;
      }
    });
    updateFromSelection();
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Speed
function onSpeedChange(e) {
  const val = parseFloat(e.target.value);
  speedValue.value = val;

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'video' || s.type === 'audio') {
        s.playbackRate = val;
        // Try shape property first, then media registry
        let mediaEl = s.videoElement || s.audioElement;
        if (!mediaEl && typeof window.getMediaElement === 'function') {
          mediaEl = window.getMediaElement(s.id);
        }
        if (mediaEl) mediaEl.playbackRate = val;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setSpeed(val) {
  speedValue.value = val;
  onSpeedChange({ target: { value: val } });
}

// Fade in/out
function onFadeInChange(e) {
  const val = parseFloat(e.target.value);
  fadeInValue.value = val;

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'video' || s.type === 'audio') {
        s.fadeIn = val;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onFadeOutChange(e) {
  const val = parseFloat(e.target.value);
  fadeOutValue.value = val;

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'video' || s.type === 'audio') {
        s.fadeOut = val;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Effect intensity
function onEffectIntensityChange(e) {
  const val = parseInt(e.target.value);

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') {
        s.intensity = val;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Filter value
function onFilterValueChange(e) {
  const val = parseInt(e.target.value);

  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'filter') {
        s.value = val;
      }
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Effect-specific property handlers
function onEffectOffsetChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.offset = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectSizeChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.size = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectRadiusChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.radius = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectAmountChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.amount = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectOffsetXChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.offsetX = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectOffsetYChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.offsetY = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectBlurChange(e) {
  const val = parseInt(e.target.value);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.blur = val;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onEffectColorChange(e) {
  const val = e.target.value;
  setShadowColor(val);
}

// Set shadow color (from palette or picker)
function setShadowColor(color) {
  shadowHex.value = color.replace('#', '');
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'effect') s.color = color;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onShadowHexInput(e) {
  let hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  shadowHex.value = hex;
  if (hex.length === 6) {
    setShadowColor('#' + hex);
  }
}

function onShadowPickerChange(e) {
  setShadowColor(e.target.value);
}

// Helper to convert rgba/color to hex for color picker
function getShadowColorHex() {
  const color = firstShape.value?.color || '#000000';
  // If already hex, return as-is
  if (color.startsWith('#')) return color.replace('#', '');
  // Parse rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `${r}${g}${b}`;
  }
  return '000000';
}

// Font options
function setFontFamily(e) {
  const family = e.target.value;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'text') s.fontFamily = family;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setFontSize(size) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'text') s.fontSize = parseInt(size);
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function toggleFontStyle(style) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'text') s[style] = !s[style];
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setTextAlign(align) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'text') s.align = align;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setLineHeight(height) {
  state.currentLineHeight = parseFloat(height);
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'text') s.lineHeight = parseFloat(height);
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Cursor options
function setCursorType(type) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'cursor') s.cursorType = type;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function setCursorScale(scale) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'cursor') s.cursorScale = scale;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function isCursorScale(scale) {
  if (!firstShape.value || firstShape.value.type !== 'cursor') return false;
  const current = firstShape.value.cursorScale || 1.0;
  return Math.abs(current - scale) < 0.01;
}

function setCursorShowPath(show) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'cursor') s.showPath = show;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

// Capture options
function setCaptureCircular(circular) {
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'webcamCapture') s.circular = circular;
    });
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
  }
}

function onCaptureBorderWidthInput(e) {
  const value = parseInt(e.target.value) || 0;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'webcamCapture') s.borderWidth = value;
    });
    if (typeof window.render === 'function') window.render();
  }
}

function onCaptureCornerRadiusInput(e) {
  const value = parseInt(e.target.value) || 0;
  if (selectedShapes.value.length > 0) {
    selectedShapes.value.forEach(s => {
      if (s.type === 'screenCapture' || s.type === 'webcamCapture') {
        s.cornerRadius = value;
      }
    });
    if (typeof window.render === 'function') window.render();
  }
}

// Recording state for capture shapes
const isCaptureRecording = computed(() => recording.state.isRecording);

const captureRecordingDuration = computed(() => {
  return recording.formatDuration(recording.state.recordingDuration);
});

function startCaptureRecording() {
  recording.startRecording();
}

function stopCaptureRecording() {
  recording.stopRecording();
}

// Cursor keyframe selection
const selectedCursorKeyframeIndex = computed(() => state.selectedCursorKeyframeIndex ?? -1);

const selectedCursorKeyframe = computed(() => {
  if (selectedCursorKeyframeIndex.value < 0) return null;
  const cursor = firstShape.value;
  if (!cursor || cursor.type !== 'cursor' || !cursor.cursorKeyframes) return null;
  return cursor.cursorKeyframes[selectedCursorKeyframeIndex.value] || null;
});

const hasSelectedKeyframe = computed(() => selectedCursorKeyframe.value !== null);

// Calculate total cumulative duration of all cursor keyframes
function calculateCursorTotalDuration(cursorKeyframes) {
  let total = 0;
  for (const kf of cursorKeyframes) {
    total += (kf.time || 0) + (kf.holdTime || 0);
  }
  return total;
}

function setKeyframeTime(newTime) {
  const cursor = firstShape.value;
  const kfIndex = selectedCursorKeyframeIndex.value;
  if (!cursor || cursor.type !== 'cursor' || !cursor.cursorKeyframes || kfIndex < 0) return;

  const kf = cursor.cursorKeyframes[kfIndex];
  if (!kf) return;

  // Parse and validate time (must be >= 0)
  const time = parseFloat(newTime);
  if (isNaN(time) || time < 0) return;

  // No restrictions - user has full control over timing
  kf.time = time;

  // Update cursor duration based on cumulative total
  const totalTime = calculateCursorTotalDuration(cursor.cursorKeyframes);
  if (cursor.duration < totalTime + 0.5) {
    cursor.duration = totalTime + 0.5;
    if (state.videoMode && typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  if (typeof window.render === 'function') window.render();
  if (typeof window.saveState === 'function') window.saveState();
}

function onKeyframeTimeInput(event) {
  setKeyframeTime(event.target.value);
}

function deleteSelectedKeyframe() {
  if (typeof window.deleteCursorKeyframe === 'function') {
    const cursor = firstShape.value;
    const kfIndex = selectedCursorKeyframeIndex.value;
    if (cursor && kfIndex >= 0) {
      const deleted = window.deleteCursorKeyframe(cursor, kfIndex);
      if (deleted) {
        state.selectedCursorKeyframeIndex = -1;
      }
    }
  }
}

function setKeyframeHoldTime(newHoldTime) {
  const cursor = firstShape.value;
  const kfIndex = selectedCursorKeyframeIndex.value;
  if (!cursor || cursor.type !== 'cursor' || !cursor.cursorKeyframes || kfIndex < 0) return;

  const kf = cursor.cursorKeyframes[kfIndex];
  if (!kf) return;

  // Parse and validate hold time (must be >= 0)
  let holdTime = parseFloat(newHoldTime);
  if (isNaN(holdTime) || holdTime < 0) return;

  // No constraint on hold time - user has full control
  kf.holdTime = holdTime;

  // Update cursor duration based on cumulative total
  const totalTime = calculateCursorTotalDuration(cursor.cursorKeyframes);
  if (cursor.duration < totalTime + 0.5) {
    cursor.duration = totalTime + 0.5;
    if (state.videoMode && typeof window.updateTimelineItems === 'function') {
      window.updateTimelineItems();
    }
  }

  if (typeof window.render === 'function') window.render();
  if (typeof window.saveState === 'function') window.saveState();
}

function onKeyframeHoldTimeInput(event) {
  setKeyframeHoldTime(event.target.value);
}

// Layers (z-order)
function sendToBack() {
  if (typeof window.sendToBack === 'function') {
    window.sendToBack();
  }
}

function sendBackward() {
  if (typeof window.sendBackward === 'function') {
    window.sendBackward();
  }
}

function bringForward() {
  if (typeof window.bringForward === 'function') {
    window.bringForward();
  }
}

function bringToFront() {
  if (typeof window.bringToFront === 'function') {
    window.bringToFront();
  }
}

// Duplicate
function duplicate() {
  if (typeof window.duplicateSelected === 'function') {
    window.duplicateSelected();
  }
}

// Delete
function deleteSelected() {
  if (typeof window.deleteSelected === 'function') {
    window.deleteSelected();
  }
}

// More options
function copyAsPNG() {
  if (typeof window.copySelectionAsPNG === 'function') {
    window.copySelectionAsPNG();
    hideAllPopups();
  }
}

function copyAsSVG() {
  if (typeof window.copySelectionAsSVG === 'function') {
    window.copySelectionAsSVG();
    hideAllPopups();
  }
}

function group() {
  if (typeof window.groupShapes === 'function') {
    window.groupShapes();
    hideAllPopups();
  }
}

function ungroup() {
  if (typeof window.ungroupShapes === 'function') {
    window.ungroupShapes();
    hideAllPopups();
  }
}

// Handle click outside popups
function handleClickOutside(e) {
  if (currentPopup.value) {
    // Query within vue-overlay-root to find our elements (not legacy ones)
    const popup = document.querySelector(`#vue-overlay-root #opt-popup-${currentPopup.value}`);
    const btn = document.querySelector(`#vue-overlay-root [data-opt="${currentPopup.value}"]`);
    if (popup && !popup.contains(e.target) && btn && !btn.contains(e.target)) {
      // Keep cursor popup open when clicking on canvas (for keyframe selection)
      if (currentPopup.value === 'cursor' && hasCursor.value) {
        const canvas = document.getElementById('drawing-canvas');
        const canvasFrame = document.getElementById('canvas-frame');
        if ((canvas && canvas.contains(e.target)) || (canvasFrame && canvasFrame.contains(e.target))) {
          return; // Don't close - user is interacting with cursor keyframes on canvas
        }
      }
      hideAllPopups();
    }
  }
}

// Expose functions globally for legacy code and composables
onMounted(() => {
  // Primary function names (used by composables)
  window.showOptionsBar = () => {
    visible.value = true;
    // Check if keyframe is selected vs regular shape
    if (hasViewportKeyframe.value) {
      updateFromKeyframe();
    } else {
      updateFromSelection();
    }
  };
  window.hideOptionsBar = () => { visible.value = false; hideAllPopups(); };
  window.updateOptionsBar = updateFromSelection;

  // Legacy vue-prefixed names (for backwards compatibility)
  window.vueShowOptionsBar = window.showOptionsBar;
  window.vueHideOptionsBar = window.hideOptionsBar;
  window.vueUpdateOptionsBar = window.updateOptionsBar;

  // Open a specific popup programmatically
  window.openOptionsPopup = openPopup;

  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  // Clean up animation preview
  stopAnimationPreview();
  if (previewDebounceId.value) {
    clearTimeout(previewDebounceId.value);
  }
});

// Helper to get property from shape, looking into first child if it's a group
function getShapeProperty(shape, property, defaultValue) {
  if (!shape) return defaultValue;
  // If it's a group, get property from first non-group child recursively
  if (shape.type === 'group' && shape.children && shape.children.length > 0) {
    return getShapeProperty(shape.children[0], property, defaultValue);
  }
  return shape[property] ?? defaultValue;
}

// Helper to check if a button is selected
function isSelected(type, value) {
  if (!firstShape.value) return false;
  const shape = firstShape.value;

  switch (type) {
    case 'width': return getShapeProperty(shape, 'lineWidth', 2) === parseInt(value);
    case 'stroke-style': return getShapeProperty(shape, 'strokeStyle', 'solid') === value;
    case 'edge-style': return getShapeProperty(shape, 'edgeStyle', 'sharp') === value;
    case 'roughness': return getShapeProperty(shape, 'roughness', 1) === parseInt(value);
    case 'arrow-type': return (shape.arrowType || 'single') === value;
    case 'arrow-head': return (shape.arrowHeadStyle || 'triangle') === value;
    case 'arrow-size': return (shape.arrowHeadSize || 'medium') === value;
    case 'fontsize': return (shape.fontSize || 20) === parseInt(value);
    case 'align': return (shape.align || 'left') === value;
    case 'lineheight': return (shape.lineHeight || 1.3) === parseFloat(value);
    case 'speed': return (shape.playbackRate || 1) === parseFloat(value);
    default: return false;
  }
}

function isFontStyleActive(style) {
  return firstShape.value?.type === 'text' && !!firstShape.value[style];
}

// ==================== FX Functions ====================

// Open FX edit popup for a specific filter/effect/transition
async function openFxEdit(fxType, fxName) {
  if (!firstShape.value) return;

  currentFxType.value = fxType;
  currentFxName.value = fxName;

  // Load existing FX values or defaults
  const existingFx = firstShape.value.fx?.find(fx => fx.type === fxType && fx.name === fxName);

  if (existingFx) {
    localFx.value = { ...existingFx };
  } else {
    localFx.value = {
      id: `fx-${Date.now()}`,
      type: fxType,
      name: fxName,
      ...fxDefaults[fxName],
    };
  }

  // Clamp animation duration to max allowed for clip
  if (fxType === 'animation' && localFx.value.duration !== undefined) {
    const clipDuration = firstShape.value.duration || config.video?.defaultClipDuration || 5;
    if (localFx.value.duration > clipDuration) {
      localFx.value.duration = clipDuration;
    }
  }

  // Switch to the fx-edit popup and position it
  currentPopup.value = 'fx-edit';

  // Position the popup relative to the FX button (same as clip-fx popup)
  await nextTick();

  const fxBtn = document.querySelector('#vue-overlay-root [data-opt="clip-fx"]');
  const popup = document.querySelector('#vue-overlay-root #opt-popup-fx-edit');
  if (!popup || !fxBtn) return;

  // Position off-screen first to get accurate dimensions
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';

  await new Promise(resolve => requestAnimationFrame(resolve));

  const btnRect = fxBtn.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;

  // Position to the right of the button
  let left = btnRect.right + 8;
  let top = btnRect.top;

  // Ensure popup doesn't go off screen right
  if (left + popupWidth > window.innerWidth - 8) {
    left = btnRect.left - popupWidth - 8;
  }

  // Ensure popup doesn't go off screen left
  if (left < 8) {
    left = 8;
  }

  // Ensure popup doesn't go off screen bottom
  if (top + popupHeight > window.innerHeight - 8) {
    top = window.innerHeight - popupHeight - 8;
  }

  // Ensure popup doesn't go off screen top
  if (top < 8) {
    top = 8;
  }

  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
}

// Close FX edit popup
function closeFxEdit() {
  // Stop any ongoing animation preview
  stopAnimationPreview();
  // Clear debounce timer
  if (previewDebounceId.value) {
    clearTimeout(previewDebounceId.value);
    previewDebounceId.value = null;
  }
  currentFxType.value = null;
  currentFxName.value = null;
  localFx.value = {};
  hideAllPopups();
}

// Apply FX changes (live update)
function applyFxChanges() {
  if (!firstShape.value || !currentFxType.value || !currentFxName.value) return;

  // Ensure shape has fx array
  if (!firstShape.value.fx) {
    firstShape.value.fx = [];
  }

  // For animations, only allow one at a time - remove any existing animation first
  if (currentFxType.value === 'animation') {
    firstShape.value.fx = firstShape.value.fx.filter(fx => fx.type !== 'animation');
    firstShape.value.fx.push({ ...localFx.value });
  } else {
    // For filters, allow multiple (find by type AND name)
    const existingIndex = firstShape.value.fx.findIndex(
      fx => fx.type === currentFxType.value && fx.name === currentFxName.value
    );

    if (existingIndex >= 0) {
      firstShape.value.fx[existingIndex] = { ...localFx.value };
    } else {
      firstShape.value.fx.push({ ...localFx.value });
    }
  }

  // Update timeline and render
  if (typeof window.updateTimelineItems === 'function') {
    window.updateTimelineItems();
  }
  if (typeof window.render === 'function') {
    window.render();
  }
}

/**
 * Preview animation by playing from the appropriate position
 * - "in" animations: play from clip start
 * - "out" animations: play from (end - duration)
 * - "both": play from clip start (shows "in" animation)
 */
function previewAnimation() {
  if (!firstShape.value || currentFxType.value !== 'animation') return;
  if (state.isPlaying && !isPreviewingAnimation.value) return; // Don't interrupt manual playback

  const shape = firstShape.value;
  const startTime = shape.startTime || 0;
  const clipDuration = shape.duration || config.video?.defaultClipDuration || 5;
  const endTime = startTime + clipDuration;
  const animDuration = localFx.value.duration || 0.5;
  const position = localFx.value.position || 'in';

  // Save current playhead position if not already previewing
  if (!isPreviewingAnimation.value) {
    savedPlayheadPosition.value = state.currentTime;
    wasPlayingBeforePreview.value = state.isPlaying;
  }

  // Clear any existing preview timeout
  if (previewTimeoutId.value) {
    clearTimeout(previewTimeoutId.value);
    previewTimeoutId.value = null;
  }

  // Determine preview start position
  let previewStart;
  let previewDuration;

  if (position === 'out') {
    // For "out" animations, start near the end
    previewStart = Math.max(startTime, endTime - animDuration - 0.1);
    previewDuration = animDuration + 0.2; // Small buffer
  } else {
    // For "in" or "both", start from clip beginning
    previewStart = startTime;
    previewDuration = animDuration + 0.2; // Small buffer
  }

  isPreviewingAnimation.value = true;

  // Seek to preview start and play
  if (typeof window.seekTo === 'function') {
    window.seekTo(previewStart);
  }

  // Small delay to let seek complete, then play
  setTimeout(() => {
    if (typeof window.play === 'function') {
      window.play();
    }

    // Auto-stop after animation duration
    previewTimeoutId.value = setTimeout(() => {
      stopAnimationPreview();
    }, previewDuration * 1000);
  }, 50);
}

/**
 * Stop animation preview and restore playhead position
 */
function stopAnimationPreview() {
  if (!isPreviewingAnimation.value) return;

  // Clear timeout
  if (previewTimeoutId.value) {
    clearTimeout(previewTimeoutId.value);
    previewTimeoutId.value = null;
  }

  // Pause playback
  if (typeof window.pause === 'function') {
    window.pause();
  }

  // Restore playhead position
  if (savedPlayheadPosition.value !== null && typeof window.seekTo === 'function') {
    window.seekTo(savedPlayheadPosition.value);
  }

  isPreviewingAnimation.value = false;
  savedPlayheadPosition.value = null;
}

/**
 * Debounced animation preview trigger
 * Called when animation parameters change
 */
function triggerAnimationPreview() {
  if (currentFxType.value !== 'animation') return;

  // Clear existing debounce
  if (previewDebounceId.value) {
    clearTimeout(previewDebounceId.value);
  }

  // Debounce: wait 300ms after last change before previewing
  previewDebounceId.value = setTimeout(() => {
    previewAnimation();
    previewDebounceId.value = null;
  }, 300);
}

// Remove FX from shape
function removeFx() {
  if (!firstShape.value || !firstShape.value.fx) {
    closeFxEdit();
    return;
  }

  const existingIndex = firstShape.value.fx.findIndex(
    fx => fx.type === currentFxType.value && fx.name === currentFxName.value
  );

  if (existingIndex >= 0) {
    firstShape.value.fx.splice(existingIndex, 1);
  }

  // Update timeline and render
  if (typeof window.updateTimelineItems === 'function') {
    window.updateTimelineItems();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
  if (typeof window.render === 'function') {
    window.render();
  }

  // Go back to FX menu instead of closing
  goBackToFxMenu();
}

// Reset FX to defaults
function resetFxToDefaults() {
  localFx.value = {
    id: localFx.value.id || `fx-${Date.now()}`,
    type: currentFxType.value,
    name: currentFxName.value,
    ...fxDefaults[currentFxName.value],
  };
  applyFxChanges();
}

// Done editing FX
function doneFxEdit() {
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
  closeFxEdit();
}

// Go back to FX menu from edit popup
async function goBackToFxMenu() {
  // Store position from fx-edit popup BEFORE changing anything
  const fxEditPopup = document.querySelector('#vue-overlay-root #opt-popup-fx-edit');
  const savedTop = fxEditPopup?.style.top;
  const savedLeft = fxEditPopup?.style.left;

  currentFxType.value = null;
  currentFxName.value = null;
  localFx.value = {};

  // Set popup to clip-fx - this triggers Vue to add 'visible' class
  currentPopup.value = 'clip-fx';

  // Wait for Vue to update the DOM
  await nextTick();

  // Get the popup and button
  const fxBtn = document.querySelector('#vue-overlay-root [data-opt="clip-fx"]');
  const popup = document.querySelector('#vue-overlay-root #opt-popup-clip-fx');

  if (!popup) return;

  // Use saved position from fx-edit popup (same location)
  if (savedTop && savedLeft) {
    popup.style.top = savedTop;
    popup.style.left = savedLeft;
    return;
  }

  // Fallback: position relative to FX button if available
  if (fxBtn) {
    const btnRect = fxBtn.getBoundingClientRect();
    let left = btnRect.right + 8;
    let top = btnRect.top;

    // Ensure popup doesn't go off screen
    if (left + 220 > window.innerWidth - 8) {
      left = btnRect.left - 220 - 8;
    }
    if (left < 8) left = 8;
    if (top + 400 > window.innerHeight - 8) {
      top = window.innerHeight - 400 - 8;
    }
    if (top < 8) top = 8;

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }
}

// Watch localFx for live preview
watch(localFx, () => {
  if (currentPopup.value === 'fx-edit' && currentFxType.value && currentFxName.value) {
    applyFxChanges();
    // Trigger animation preview when animation parameters change
    if (currentFxType.value === 'animation') {
      triggerAnimationPreview();
    }
  }
}, { deep: true });

// Check if current FX exists on shape
const currentFxExists = computed(() => {
  if (!firstShape.value || !currentFxType.value || !currentFxName.value) return false;
  return shapeHasFx(currentFxType.value, currentFxName.value);
});

// Expose openFxEdit globally for context menu integration
onMounted(() => {
  window.openFxEdit = openFxEdit;
});
</script>

<template>
  <div id="options-bar" class="options-bar" :class="{ visible }">
    <!-- Keyframe Settings (viewport keyframes only) -->
    <button
      v-if="hasViewportKeyframe"
      class="opt-btn"
      :class="{ active: currentPopup === 'keyframe' }"
      data-opt="keyframe"
      title="Keyframe settings"
      @click="togglePopup('keyframe', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L22 12L12 22L2 12Z"/>
      </svg>
    </button>

    <!-- Duplicate (viewport keyframes only) -->
    <button v-if="hasViewportKeyframe" class="opt-btn" id="opt-duplicate" title="Duplicate" @click="duplicateKeyframe">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
    </button>

    <!-- Delete (viewport keyframes only) -->
    <button v-if="hasViewportKeyframe" class="opt-btn" id="opt-delete" title="Delete" @click="deleteKeyframe">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>

    <!-- ========== SHAPE CONTROLS ========== -->
    <template v-if="!hasViewportKeyframe">
    <!-- Stroke Color (hide for raster media and video clip types) -->
    <button
      v-if="!hasRasterMedia && !hasEffect && !hasFilter && !hasTransition"
      class="opt-btn"
      :class="{ active: currentPopup === 'stroke' }"
      data-opt="stroke"
      title="Stroke color"
      @click="togglePopup('stroke', $event)"
    >
      <div
        id="opt-stroke-preview"
        class="opt-color-box"
        :style="{ background: firstShape?.color || '#1e1e1e' }"
      ></div>
    </button>

    <!-- Fill Color (hide for raster media and video clip types) -->
    <button
      v-if="!hasRasterMedia && !hasText && !hasFreehand && !hasLineOrArrow && !hasEffect && !hasFilter && !hasTransition"
      class="opt-btn"
      :class="{ active: currentPopup === 'fill' }"
      data-opt="fill"
      title="Fill color"
      @click="togglePopup('fill', $event)"
    >
      <div
        id="opt-fill-preview"
        class="opt-color-box"
        :class="{ 'opt-fill-empty': !firstShape?.fillColor || firstShape?.fillColor === 'transparent' }"
        :style="firstShape?.fillColor && firstShape?.fillColor !== 'transparent' ? { background: firstShape.fillColor } : {}"
      ></div>
    </button>

    <!-- Stroke Options (hide for raster media, text, video clip types, and cursor) -->
    <button
      v-if="!hasText && !hasEffect && !hasFilter && !hasTransition && !hasCursor"
      class="opt-btn"
      :class="{ active: currentPopup === 'stroke-options' }"
      data-opt="stroke-options"
      title="Stroke options"
      @click="togglePopup('stroke-options', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="4" y1="6" x2="20" y2="6" stroke-width="1"/><line x1="4" y1="12" x2="20" y2="12" stroke-width="2.5"/><line x1="4" y1="18" x2="20" y2="18" stroke-width="4"/></svg>
    </button>

    <!-- Arrow Options (line/arrow only) -->
    <button
      v-if="hasLineOrArrow"
      class="opt-btn"
      :class="{ active: currentPopup === 'arrow-options' }"
      data-opt="arrow-options"
      title="Line & arrow options"
      @click="togglePopup('arrow-options', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><line x1="15" y1="16" x2="19" y2="12"></line><line x1="15" y1="8" x2="19" y2="12"></line></svg>
    </button>

    <!-- Opacity (hide for audio only) -->
    <button
      v-if="!hasAudioOnly"
      class="opt-btn"
      :class="{ active: currentPopup === 'opacity' }"
      data-opt="opacity"
      title="Opacity"
      @click="togglePopup('opacity', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/></svg>
    </button>

    <!-- Volume (video/audio only) -->
    <button
      v-if="hasMedia"
      class="opt-btn"
      :class="{ active: currentPopup === 'volume' }"
      data-opt="volume"
      title="Volume"
      @click="togglePopup('volume', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </button>

    <!-- Speed (video/audio only) -->
    <button
      v-if="hasMedia"
      class="opt-btn"
      :class="{ active: currentPopup === 'speed' }"
      data-opt="speed"
      title="Playback Speed"
      @click="togglePopup('speed', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </button>

    <!-- Effect (effect clips only) -->
    <button
      v-if="hasEffect"
      class="opt-btn"
      :class="{ active: currentPopup === 'effect' }"
      data-opt="effect"
      title="Effect settings"
      @click="togglePopup('effect', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3"/>
      </svg>
    </button>

    <!-- Filter (filter clips only) -->
    <button
      v-if="hasFilter"
      class="opt-btn"
      :class="{ active: currentPopup === 'filter' }"
      data-opt="filter"
      title="Filter settings"
      @click="togglePopup('filter', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
    </button>

    <!-- Transition (transition clips only) -->
    <button
      v-if="hasTransition"
      class="opt-btn"
      :class="{ active: currentPopup === 'transition' }"
      data-opt="transition"
      title="Transition settings"
      @click="togglePopup('transition', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="8" height="16" rx="1"/>
        <rect x="14" y="4" width="8" height="16" rx="1"/>
        <path d="M10 12h4" stroke-dasharray="2 2"/>
      </svg>
    </button>

    <!-- Font (text only) -->
    <button
      v-if="hasText"
      class="opt-btn"
      :class="{ active: currentPopup === 'font' }"
      data-opt="font"
      title="Text options"
      @click="togglePopup('font', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
    </button>

    <!-- Cursor options (cursor shapes only) -->
    <button
      v-if="hasCursor"
      class="opt-btn"
      :class="{ active: currentPopup === 'cursor' }"
      data-opt="cursor"
      title="Cursor options"
      @click="togglePopup('cursor', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l6 16 2-6 6-2L4 4z"/><line x1="14" y1="14" x2="20" y2="20"/></svg>
    </button>

    <!-- Capture options (screen/webcam capture shapes only) -->
    <button
      v-if="hasCapture"
      class="opt-btn"
      :class="{ active: currentPopup === 'capture' }"
      data-opt="capture"
      title="Capture options"
      @click="togglePopup('capture', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M2 12h3M19 12h3M12 2v3M12 19v3"/></svg>
    </button>

    <!-- FX (video mode only - for any visual clip) -->
    <button
      v-if="canHaveFx"
      class="opt-btn"
      :class="{ active: currentPopup === 'clip-fx' || currentPopup === 'fx-edit' }"
      data-opt="clip-fx"
      title="Effects & Filters"
      @click="togglePopup('clip-fx', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <text x="6" y="16" font-size="10" font-weight="bold" fill="currentColor" stroke="none">FX</text>
      </svg>
    </button>

    <!-- Layers -->
    <button
      class="opt-btn"
      :class="{ active: currentPopup === 'layers' }"
      data-opt="layers"
      title="Layers"
      @click="togglePopup('layers', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
    </button>

    <!-- Duplicate -->
    <button class="opt-btn" id="opt-duplicate" title="Duplicate" @click="duplicate">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
    </button>

    <!-- Delete -->
    <button class="opt-btn" id="opt-delete" title="Delete" @click="deleteSelected">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>

    <!-- More -->
    <!-- <button
      class="opt-btn"
      :class="{ active: currentPopup === 'more' }"
      data-opt="more"
      title="More options"
      @click="togglePopup('more', $event)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
    </button> -->
    </template>
  </div>

  <!-- Keyframe Settings Popup -->
  <div id="opt-popup-keyframe" class="opt-popup opt-popup-wide" :class="{ visible: currentPopup === 'keyframe' }">
    <div class="opt-popup-title">Viewport</div>
    <div class="opt-popup-label">Zoom</div>
    <div class="opt-slider-row">
      <input type="range" min="1" max="5" step="0.1" :value="kfZoom" @input="onKfZoomInput" @keydown.stop>
      <input type="number" class="opt-num-input" min="0.1" max="10" step="0.1" :value="kfZoom.toFixed(2)" @input="onKfZoomInput" @keydown.stop>
    </div>
    <div class="opt-popup-label" style="margin-top:8px">Custom Position (drag to adjust)</div>
    <div
      ref="panPickerRef"
      class="opt-pan-picker"
      :class="{ active: panPickerActive, disabled: kfZoom <= 1 }"
      :style="{ aspectRatio: getCanvasAspectRatio() }"
      @mousedown="kfZoom > 1 ? startPanPicker($event) : null"
    >
      <!-- Viewport box (shows visible area when zoomed in) -->
      <div class="opt-pan-picker-viewport" :style="getViewportBoxStyle()"></div>
      <!-- Crosshairs -->
      <div class="opt-pan-picker-crosshair-h" :style="{ top: getPanPickerPosition().y + '%' }"></div>
      <div class="opt-pan-picker-crosshair-v" :style="{ left: getPanPickerPosition().x + '%' }"></div>
      <!-- Handle -->
      <div
        class="opt-pan-picker-handle"
        :style="{ left: getPanPickerPosition().x + '%', top: getPanPickerPosition().y + '%' }"
      ></div>
      <!-- Disabled overlay when zoom <= 1 -->
      <div v-if="kfZoom <= 1" class="opt-pan-picker-disabled">
        <span>Zoom in to pan</span>
      </div>
    </div>
    <div class="opt-pan-inputs">
      <div class="opt-pan-input-group">
        <span class="opt-pan-label">X:</span>
        <input type="number" class="opt-num-input" step="10"
          :min="getPanLimits(kfZoom).minPanX"
          :max="getPanLimits(kfZoom).maxPanX"
          :value="Math.round(kfPanX)"
          :disabled="kfZoom <= 1"
          @input="onKfPanXInput"
          @keydown.stop>
      </div>
      <div class="opt-pan-input-group">
        <span class="opt-pan-label">Y:</span>
        <input type="number" class="opt-num-input" step="10"
          :min="getPanLimits(kfZoom).minPanY"
          :max="getPanLimits(kfZoom).maxPanY"
          :value="Math.round(kfPanY)"
          :disabled="kfZoom <= 1"
          @input="onKfPanYInput"
          @keydown.stop>
      </div>
    </div>

    <div class="opt-divider" style="margin:12px 0"></div>

    <div class="opt-popup-title">Easing</div>
    <div class="opt-btn-row opt-btn-row-wrap">
      <button
        v-for="opt in kfEasingOptions"
        :key="opt.value"
        class="opt-choice-btn"
        :class="{ selected: kfEasing === opt.value }"
        :title="opt.label"
        @click="setKfEasing(opt.value)"
      >
        <svg class="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" stroke-width="2">
          <path :d="opt.path"/>
        </svg>
      </button>
    </div>

    <div class="opt-divider" style="margin:12px 0"></div>

    <button class="opt-menu-item" style="width:100%;text-align:center" @click="resetKeyframeFromCanvas">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      Reset from Canvas
    </button>
  </div>

  <!-- Stroke Color Popup -->
  <div id="opt-popup-stroke" class="opt-popup" :class="{ visible: currentPopup === 'stroke' }">
    <div class="opt-popup-title">Stroke</div>
    <div class="opt-popup-label">Colors</div>
    <div class="opt-color-grid">
      <button
        v-for="color in strokePalette"
        :key="'stroke-' + color"
        class="opt-color-btn"
        :class="{ selected: firstShape?.color === color }"
        :style="color === 'transparent'
          ? { background: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0, 3px 3px' }
          : { background: color }"
        @click="setStroke(color)"
      ></button>
    </div>
    <div class="opt-popup-label">Hex code</div>
    <div class="opt-hex-row">
      <span>#</span>
      <input type="text" id="stroke-hex" :value="strokeHex" maxlength="6" @input="onStrokeHexInput">
      <input type="color" id="stroke-picker" :value="'#' + (strokeHex || '1e1e1e')" @input="onStrokePickerChange">
    </div>
  </div>

  <!-- Fill Color Popup -->
  <div id="opt-popup-fill" class="opt-popup" :class="{ visible: currentPopup === 'fill' }">
    <div class="opt-popup-title">Background</div>
    <div class="opt-popup-label">Colors</div>
    <div class="opt-color-grid">
      <button
        v-for="color in fillPalette"
        :key="'fill-' + color"
        class="opt-color-btn"
        :class="{ selected: firstShape?.fillColor === color }"
        :style="color === 'transparent'
          ? { background: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0, 3px 3px' }
          : { background: color }"
        @click="setFill(color)"
      ></button>
    </div>
    <div class="opt-popup-label">Hex code</div>
    <div class="opt-hex-row">
      <span>#</span>
      <input type="text" id="fill-hex" :value="fillHex" maxlength="6" placeholder="none" @input="onFillHexInput">
      <input type="color" id="fill-picker" :value="'#' + (fillHex || 'ffffff')" @input="onFillPickerChange">
    </div>
  </div>

  <!-- Stroke Options Popup -->
  <div id="opt-popup-stroke-options" class="opt-popup" :class="{ visible: currentPopup === 'stroke-options' }">
    <!-- Stroke controls only for non-media shapes -->
    <template v-if="!hasOnlyMediaOrFrame">
      <div class="opt-popup-title">Stroke width</div>
      <div class="opt-btn-row">
        <button v-for="w in [1, 2, 4, 6]" :key="'width-' + w" class="opt-choice-btn" :class="{ selected: isSelected('width', w) }" @click="setStrokeWidth(w)">
          <div class="opt-line" :style="{ height: w + 'px' }"></div>
        </button>
      </div>
      <div class="opt-popup-title" style="margin-top:12px">Stroke style</div>
      <div class="opt-btn-row">
        <button class="opt-choice-btn" :class="{ selected: isSelected('stroke-style', 'solid') }" title="Solid" @click="setStrokeStyle('solid')">
          <svg class="w-8 h-4" viewBox="0 0 32 16"><line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="opt-choice-btn" :class="{ selected: isSelected('stroke-style', 'dashed') }" title="Dashed" @click="setStrokeStyle('dashed')">
          <svg class="w-8 h-4" viewBox="0 0 32 16"><line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/></svg>
        </button>
        <button class="opt-choice-btn" :class="{ selected: isSelected('stroke-style', 'dotted') }" title="Dotted" @click="setStrokeStyle('dotted')">
          <svg class="w-8 h-4" viewBox="0 0 32 16"><line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="2 4"/></svg>
        </button>
      </div>
    </template>
    <!-- Corner Radius Controls (for rectangles, images, videos) -->
    <template v-if="hasCornerRadiusSupport">
      <div class="opt-popup-title" :style="{ marginTop: hasOnlyMediaOrFrame ? '0' : '12px' }">
        Corner Radius
        <button class="opt-link-btn" :class="{ linked: cornerRadiusLinked }" title="Link/unlink corners" @click="toggleCornerRadiusLink">
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path v-if="cornerRadiusLinked" d="M4 6V5a4 4 0 018 0v1M4 10v1a4 4 0 008 0v-1M2 6h4M10 6h4M2 10h4M10 10h4"/>
            <path v-else d="M4 6V5a4 4 0 014-4M12 6V5a4 4 0 00-4-4M4 10v1a4 4 0 004 4M12 10v1a4 4 0 01-4 4M2 6h4M10 6h4M2 10h4M10 10h4"/>
          </svg>
        </button>
      </div>
      <div v-if="cornerRadiusLinked" class="opt-radius-row">
        <label class="opt-radius-label">All</label>
        <input type="number" class="opt-radius-input" min="0" max="200" :value="cornerRadiusAll" @input="setCornerRadius($event.target.value)">
      </div>
      <div v-else class="opt-radius-grid">
        <div class="opt-radius-row">
          <label class="opt-radius-label" title="Top Left">TL</label>
          <input type="number" class="opt-radius-input" min="0" max="200" :value="cornerRadiusTL" @input="setCornerRadius($event.target.value, 'tl')">
        </div>
        <div class="opt-radius-row">
          <label class="opt-radius-label" title="Top Right">TR</label>
          <input type="number" class="opt-radius-input" min="0" max="200" :value="cornerRadiusTR" @input="setCornerRadius($event.target.value, 'tr')">
        </div>
        <div class="opt-radius-row">
          <label class="opt-radius-label" title="Bottom Left">BL</label>
          <input type="number" class="opt-radius-input" min="0" max="200" :value="cornerRadiusBL" @input="setCornerRadius($event.target.value, 'bl')">
        </div>
        <div class="opt-radius-row">
          <label class="opt-radius-label" title="Bottom Right">BR</label>
          <input type="number" class="opt-radius-input" min="0" max="200" :value="cornerRadiusBR" @input="setCornerRadius($event.target.value, 'br')">
        </div>
      </div>
    </template>
    <!-- Roughness only for non-media shapes -->
    <template v-if="!hasOnlyMediaOrFrame">
      <div class="opt-popup-title" style="margin-top:12px">Roughness</div>
      <div class="opt-btn-row">
        <button class="opt-choice-btn" :class="{ selected: isSelected('roughness', 0) }" title="Precise" @click="setRoughness(0)">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/></svg>
        </button>
        <button class="opt-choice-btn" :class="{ selected: isSelected('roughness', 1) }" title="Normal" @click="setRoughness(1)">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5c4-0.5 12 0.5 16-0.5M20 5c0.5 4-0.5 12 0.5 16M20 19c-4 0.5-12-0.5-16 0.5M4 19c-0.5-4 0.5-12-0.5-16"/></svg>
        </button>
        <button class="opt-choice-btn" :class="{ selected: isSelected('roughness', 2) }" title="Rough" @click="setRoughness(2)">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6c2-1 6 1 8 0s6 1 8-1M19 5c1 2-1 6 0 8s-1 6 1 8M20 19c-2 1-6-1-8 0s-6-1-8 1M5 20c-1-2 1-6 0-8s1-6-1-8"/></svg>
        </button>
      </div>
    </template>
  </div>

  <!-- Arrow Options Popup -->
  <div id="opt-popup-arrow-options" class="opt-popup" :class="{ visible: currentPopup === 'arrow-options' }">
    <div class="opt-popup-title">Arrow type</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-type', 'single') }" title="Single arrow" @click="setArrowType('single')">
        <svg class="w-8 h-4" viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="8" x2="26" y2="8"/><polyline points="20 3 26 8 20 13"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-type', 'double') }" title="Double arrow" @click="setArrowType('double')">
        <svg class="w-8 h-4" viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="8" x2="26" y2="8"/><polyline points="12 3 6 8 12 13"/><polyline points="20 3 26 8 20 13"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-type', 'none') }" title="No arrows (line)" @click="setArrowType('none')">
        <svg class="w-8 h-4" viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="8" x2="30" y2="8"/></svg>
      </button>
    </div>
    <div class="opt-popup-title" style="margin-top:12px">Arrow head</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-head', 'triangle') }" title="Triangle (filled)" @click="setArrowHead('triangle')">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="4 12 16 6 16 18"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-head', 'open') }" title="Open triangle" @click="setArrowHead('open')">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 12 14 6 14 18 4 12"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-head', 'diamond') }" title="Diamond" @click="setArrowHead('diamond')">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 4 20 12 12 20 4 12"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-head', 'circle') }" title="Circle" @click="setArrowHead('circle')">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="6"/></svg>
      </button>
    </div>
    <div class="opt-popup-title" style="margin-top:12px">Arrow size</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-size', 'small') }" @click="setArrowSize('small')">S</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-size', 'medium') }" @click="setArrowSize('medium')">M</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('arrow-size', 'large') }" @click="setArrowSize('large')">L</button>
    </div>
  </div>

  <!-- Opacity Popup -->
  <div id="opt-popup-opacity" class="opt-popup opt-popup-sm" :class="{ visible: currentPopup === 'opacity' }">
    <div class="opt-popup-title">Opacity</div>
    <div class="opt-slider-row">
      <span>0</span>
      <input type="range" id="opt-opacity" min="0" max="100" :value="opacityValue" @input="onOpacityChange">
      <span id="opt-opacity-val">{{ opacityValue }}</span>
    </div>
  </div>

  <!-- Volume Popup -->
  <div id="opt-popup-volume" class="opt-popup opt-popup-md" :class="{ visible: currentPopup === 'volume' }">
    <div class="opt-popup-title">Volume</div>
    <div class="opt-slider-row">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
      <input type="range" id="opt-volume" min="0" max="100" :value="volumeValue" @input="onVolumeChange">
      <span id="opt-volume-val">{{ volumeValue }}</span>
    </div>
    <div class="opt-btn-row" style="margin-top:8px">
      <button class="opt-choice-btn opt-mute-btn" :class="{ active: volumeValue === 0 }" id="opt-mute" title="Mute" @click="toggleMute">
        <svg v-if="volumeValue > 0" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
      </button>
    </div>

    <div class="opt-divider"></div>

    <div class="opt-popup-title">Fade In</div>
    <div class="opt-slider-row">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20 L22 4"/><path d="M2 20 L2 12 L10 12"/></svg>
      <input type="range" id="opt-fade-in" min="0" max="5" step="0.1" :value="fadeInValue" @input="onFadeInChange">
      <span id="opt-fade-in-val">{{ fadeInValue }}s</span>
    </div>

    <div class="opt-popup-title" style="margin-top:8px">Fade Out</div>
    <div class="opt-slider-row">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4 L22 20"/><path d="M22 20 L22 12 L14 12"/></svg>
      <input type="range" id="opt-fade-out" min="0" max="5" step="0.1" :value="fadeOutValue" @input="onFadeOutChange">
      <span id="opt-fade-out-val">{{ fadeOutValue }}s</span>
    </div>
  </div>

  <!-- Speed Popup -->
  <div id="opt-popup-speed" class="opt-popup opt-popup-sm" :class="{ visible: currentPopup === 'speed' }">
    <div class="opt-popup-title">Playback Speed</div>
    <div class="opt-slider-row">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <input type="range" id="opt-speed" min="0.25" max="4" step="0.25" :value="speedValue" @input="onSpeedChange">
      <span id="opt-speed-val">{{ speedValue }}x</span>
    </div>
    <div class="opt-btn-row" style="margin-top:8px">
      <button class="opt-choice-btn" :class="{ selected: isSelected('speed', 0.5) }" @click="setSpeed(0.5)">0.5x</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('speed', 1) }" @click="setSpeed(1)">1x</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('speed', 1.5) }" @click="setSpeed(1.5)">1.5x</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('speed', 2) }" @click="setSpeed(2)">2x</button>
    </div>
  </div>

  <!-- Font Popup -->
  <div id="opt-popup-font" class="opt-popup" :class="{ visible: currentPopup === 'font' }">
    <div class="opt-popup-title">Font family</div>
    <select id="opt-font-family" class="opt-select" :value="firstShape?.fontFamily || 'Sans-serif'" @change="setFontFamily">
      <option v-for="font in fonts" :key="font" :value="font" :style="{ fontFamily: font }">{{ font }}</option>
    </select>

    <div class="opt-popup-title" style="margin-top:12px">Font size</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isSelected('fontsize', 14) }" @click="setFontSize(14)">S</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('fontsize', 20) }" @click="setFontSize(20)">M</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('fontsize', 28) }" @click="setFontSize(28)">L</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('fontsize', 36) }" @click="setFontSize(36)">XL</button>
    </div>

    <div v-if="allowBold || allowItalic || allowUnderline" class="opt-popup-title" style="margin-top:12px">Style</div>
    <div v-if="allowBold || allowItalic || allowUnderline" class="opt-btn-row opt-style-row">
      <button v-if="allowBold" class="opt-style-btn" :class="{ active: isFontStyleActive('bold') }" title="Bold (Ctrl+B)" @click="toggleFontStyle('bold')">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"/><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg>
      </button>
      <button v-if="allowItalic" class="opt-style-btn" :class="{ active: isFontStyleActive('italic') }" title="Italic (Ctrl+I)" @click="toggleFontStyle('italic')">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </button>
      <button v-if="allowUnderline" class="opt-style-btn" :class="{ active: isFontStyleActive('underline') }" title="Underline (Ctrl+U)" @click="toggleFontStyle('underline')">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
      </button>
    </div>

    <div class="opt-popup-title" style="margin-top:12px">Text align</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isSelected('align', 'left') }" @click="setTextAlign('left')">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('align', 'center') }" @click="setTextAlign('center')">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('align', 'right') }" @click="setTextAlign('right')">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>

    <div class="opt-popup-title" style="margin-top:12px">Line height</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isSelected('lineheight', 1.0) }" @click="setLineHeight(1.0)">1.0</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('lineheight', 1.3) }" @click="setLineHeight(1.3)">1.3</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('lineheight', 1.5) }" @click="setLineHeight(1.5)">1.5</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('lineheight', 1.8) }" @click="setLineHeight(1.8)">1.8</button>
      <button class="opt-choice-btn" :class="{ selected: isSelected('lineheight', 2.0) }" @click="setLineHeight(2.0)">2.0</button>
    </div>
  </div>

  <!-- Cursor Popup -->
  <div id="opt-popup-cursor" class="opt-popup" :class="{ visible: currentPopup === 'cursor' }">
    <div class="opt-popup-title">Cursor type</div>
    <div class="opt-btn-row opt-btn-row-wrap">
      <button
        v-for="ct in cursorTypesList"
        :key="ct.id"
        class="opt-choice-btn"
        :class="{ selected: firstShape?.cursorType === ct.id }"
        :title="ct.name"
        @click="setCursorType(ct.id)"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="ct.icon"></svg>
      </button>
    </div>

    <div class="opt-popup-title" style="margin-top:12px">Size</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: isCursorScale(0.5) }" @click="setCursorScale(0.5)">XS</button>
      <button class="opt-choice-btn" :class="{ selected: isCursorScale(0.75) }" @click="setCursorScale(0.75)">S</button>
      <button class="opt-choice-btn" :class="{ selected: isCursorScale(1.0) }" @click="setCursorScale(1.0)">M</button>
      <button class="opt-choice-btn" :class="{ selected: isCursorScale(1.5) }" @click="setCursorScale(1.5)">L</button>
      <button class="opt-choice-btn" :class="{ selected: isCursorScale(2.0) }" @click="setCursorScale(2.0)">XL</button>
    </div>

    <div class="opt-popup-title" style="margin-top:12px">Show path</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: firstShape?.showPath === true }" @click="setCursorShowPath(true)">Yes</button>
      <button class="opt-choice-btn" :class="{ selected: firstShape?.showPath === false }" @click="setCursorShowPath(false)">No</button>
    </div>

    <!-- Selected Keyframe Controls -->
    <template v-if="hasSelectedKeyframe">
      <div class="opt-divider" style="margin: 12px 0"></div>
      <div class="opt-popup-title">
        Keyframe #{{ selectedCursorKeyframeIndex + 1 }}
      </div>
      <div class="opt-popup-label">Path time (seconds)</div>
      <div class="opt-slider-row">
        <input
          type="number"
          class="opt-num-input opt-num-input-wide"
          min="0"
          step="0.1"
          :value="selectedCursorKeyframe?.time?.toFixed(2)"
          @input="onKeyframeTimeInput"
          @keydown.stop
        >
        <span class="opt-unit">s</span>
      </div>
      <div class="opt-popup-label" style="margin-top: 8px">Hold time (pause at position)</div>
      <div class="opt-slider-row">
        <input
          type="number"
          class="opt-num-input opt-num-input-wide"
          min="0"
          step="0.1"
          :value="(selectedCursorKeyframe?.holdTime || 0).toFixed(2)"
          @input="onKeyframeHoldTimeInput"
          @keydown.stop
        >
        <span class="opt-unit">s</span>
      </div>
      <button
        class="opt-menu-item opt-menu-item-danger"
        style="margin-top: 8px"
        :disabled="firstShape?.cursorKeyframes?.length <= 1"
        @click="deleteSelectedKeyframe"
      >
        Delete keyframe
      </button>
    </template>
  </div>

  <!-- Capture Options Popup -->
  <div id="opt-popup-capture" class="opt-popup" :class="{ visible: currentPopup === 'capture' }">
    <div class="opt-popup-title">{{ firstShape?.type === 'webcamCapture' ? 'Webcam' : 'Screen' }} Capture</div>

    <!-- Webcam-specific: Shape style -->
    <template v-if="hasWebcamCapture">
      <div class="opt-popup-label">Shape</div>
      <div class="opt-btn-row">
        <button class="opt-choice-btn" :class="{ selected: firstShape?.circular === true }" @click="setCaptureCircular(true)">Circle</button>
        <button class="opt-choice-btn" :class="{ selected: firstShape?.circular === false }" @click="setCaptureCircular(false)">Rectangle</button>
      </div>

      <div class="opt-popup-label" style="margin-top:12px">Border width</div>
      <div class="opt-slider-row">
        <input type="range" min="0" max="10" step="1" :value="firstShape?.borderWidth || 4" @input="onCaptureBorderWidthInput">
        <span>{{ firstShape?.borderWidth || 4 }}px</span>
      </div>
    </template>

    <!-- Corner radius (for rectangular shapes) -->
    <template v-if="!firstShape?.circular">
      <div class="opt-popup-label" style="margin-top:12px">Corner radius</div>
      <div class="opt-slider-row">
        <input type="range" min="0" max="50" step="1" :value="firstShape?.cornerRadius || 0" @input="onCaptureCornerRadiusInput">
        <span>{{ firstShape?.cornerRadius || 0 }}px</span>
      </div>
    </template>

    <div class="opt-divider" style="margin: 12px 0"></div>

    <!-- Recording status -->
    <div class="opt-popup-title">Recording</div>
    <div v-if="isCaptureRecording" class="opt-status-row">
      <span class="recording-indicator"></span>
      <span class="opt-status-text">{{ captureRecordingDuration }}</span>
    </div>
    <div class="opt-btn-row" style="margin-top: 8px">
      <button v-if="!isCaptureRecording" class="opt-choice-btn opt-btn-primary" @click="startCaptureRecording">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
        Start
      </button>
      <button v-else class="opt-choice-btn opt-btn-danger" @click="stopCaptureRecording">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
        Stop
      </button>
    </div>
  </div>

  <!-- Layers Popup -->
  <div id="opt-popup-layers" class="opt-popup opt-popup-sm" :class="{ visible: currentPopup === 'layers' }">
    <div class="opt-popup-title">Layers</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" id="opt-to-back" title="Send to back" @click="sendToBack">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>
      </button>
      <button class="opt-choice-btn" id="opt-backward" title="Send backward" @click="sendBackward">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 10 12 15 17 10"/></svg>
      </button>
      <button class="opt-choice-btn" id="opt-forward" title="Bring forward" @click="bringForward">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 14 12 9 7 14"/></svg>
      </button>
      <button class="opt-choice-btn" id="opt-to-front" title="Bring to front" @click="bringToFront">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
      </button>
    </div>
  </div>

  <!-- More Options Popup -->
  <div id="opt-popup-more" class="opt-popup" :class="{ visible: currentPopup === 'more' }">
    <div class="opt-popup-title">More options</div>
    <button class="opt-menu-item" id="opt-copy-png" @click="copyAsPNG">Copy as PNG</button>
    <button class="opt-menu-item" id="opt-copy-svg" @click="copyAsSVG">Copy as SVG</button>
    <div class="opt-divider"></div>
    <button class="opt-menu-item" id="opt-group" @click="group">Group</button>
    <button class="opt-menu-item" id="opt-ungroup" @click="ungroup">Ungroup</button>
  </div>

  <!-- Effect Popup (placeholder - video mode only) -->
  <div id="opt-popup-effect" class="opt-popup" :class="{ visible: currentPopup === 'effect' }">
    <div class="opt-popup-title">Effect Settings</div>
    <div class="opt-popup-label">Effect Type</div>
    <div id="opt-effect-name" class="opt-clip-name">{{ firstShape?.name || firstShape?.subtype || '-' }}</div>
    <div class="opt-popup-label">Intensity</div>
    <div class="opt-slider-row">
      <span>0</span>
      <input type="range" id="opt-effect-intensity" min="0" max="100" :value="firstShape?.intensity ?? 100" @input="onEffectIntensityChange">
      <span id="opt-effect-intensity-val">{{ firstShape?.intensity ?? 100 }}</span>
    </div>

    <!-- Chromatic Aberration: Offset -->
    <template v-if="firstShape?.subtype === 'chromatic'">
      <div class="opt-popup-label">Offset</div>
      <div class="opt-slider-row">
        <span>1</span>
        <input type="range" min="1" max="20" :value="firstShape?.offset ?? 5" @input="onEffectOffsetChange">
        <span>{{ firstShape?.offset ?? 5 }}</span>
      </div>
    </template>

    <!-- Pixelate: Size -->
    <template v-if="firstShape?.subtype === 'pixelate'">
      <div class="opt-popup-label">Pixel Size</div>
      <div class="opt-slider-row">
        <span>2</span>
        <input type="range" min="2" max="50" :value="firstShape?.size ?? 10" @input="onEffectSizeChange">
        <span>{{ firstShape?.size ?? 10 }}</span>
      </div>
    </template>

    <!-- Blur: Radius -->
    <template v-if="firstShape?.subtype === 'blur'">
      <div class="opt-popup-label">Blur Radius</div>
      <div class="opt-slider-row">
        <span>1</span>
        <input type="range" min="1" max="30" :value="firstShape?.radius ?? 10" @input="onEffectRadiusChange">
        <span>{{ firstShape?.radius ?? 10 }}</span>
      </div>
    </template>

    <!-- Glitch: Amount -->
    <template v-if="firstShape?.subtype === 'glitch'">
      <div class="opt-popup-label">Glitch Amount</div>
      <div class="opt-slider-row">
        <span>1</span>
        <input type="range" min="1" max="50" :value="firstShape?.amount ?? 10" @input="onEffectAmountChange">
        <span>{{ firstShape?.amount ?? 10 }}</span>
      </div>
    </template>

    <!-- Drop Shadow: Offset X/Y, Blur, Color -->
    <template v-if="firstShape?.subtype === 'dropShadow'">
      <div class="opt-popup-label">Offset X</div>
      <div class="opt-slider-row">
        <span>-20</span>
        <input type="range" min="-20" max="20" :value="firstShape?.offsetX ?? 5" @input="onEffectOffsetXChange">
        <span>{{ firstShape?.offsetX ?? 5 }}</span>
      </div>
      <div class="opt-popup-label">Offset Y</div>
      <div class="opt-slider-row">
        <span>-20</span>
        <input type="range" min="-20" max="20" :value="firstShape?.offsetY ?? 5" @input="onEffectOffsetYChange">
        <span>{{ firstShape?.offsetY ?? 5 }}</span>
      </div>
      <div class="opt-popup-label">Blur</div>
      <div class="opt-slider-row">
        <span>0</span>
        <input type="range" min="0" max="30" :value="firstShape?.blur ?? 10" @input="onEffectBlurChange">
        <span>{{ firstShape?.blur ?? 10 }}</span>
      </div>
      <div class="opt-popup-label">Shadow Color</div>
      <div class="opt-color-grid">
        <button
          v-for="color in shadowPalette"
          :key="'shadow-' + color"
          class="opt-color-btn"
          :class="{ selected: firstShape?.color === color }"
          :style="{ background: color }"
          @click="setShadowColor(color)"
        ></button>
      </div>
      <div class="opt-popup-label">Hex code</div>
      <div class="opt-hex-row">
        <span>#</span>
        <input type="text" :value="getShadowColorHex()" maxlength="6" @input="onShadowHexInput">
        <input type="color" :value="'#' + getShadowColorHex()" @input="onShadowPickerChange">
      </div>
    </template>

    <!-- Vignette: Radius -->
    <template v-if="firstShape?.subtype === 'vignette'">
      <div class="opt-popup-label">Radius</div>
      <div class="opt-slider-row">
        <span>10</span>
        <input type="range" min="10" max="100" :value="firstShape?.radius ?? 50" @input="onEffectRadiusChange">
        <span>{{ firstShape?.radius ?? 50 }}</span>
      </div>
    </template>

    <!-- Grain: Amount -->
    <template v-if="firstShape?.subtype === 'grain'">
      <div class="opt-popup-label">Amount</div>
      <div class="opt-slider-row">
        <span>5</span>
        <input type="range" min="5" max="100" :value="firstShape?.amount ?? 30" @input="onEffectAmountChange">
        <span>{{ firstShape?.amount ?? 30 }}</span>
      </div>
    </template>

    <!-- Glow: Radius and Color -->
    <template v-if="firstShape?.subtype === 'glow'">
      <div class="opt-popup-label">Radius</div>
      <div class="opt-slider-row">
        <span>1</span>
        <input type="range" min="1" max="30" :value="firstShape?.radius ?? 10" @input="onEffectRadiusChange">
        <span>{{ firstShape?.radius ?? 10 }}</span>
      </div>
    </template>
  </div>

  <!-- Filter Popup (placeholder - video mode only) -->
  <div id="opt-popup-filter" class="opt-popup" :class="{ visible: currentPopup === 'filter' }">
    <div class="opt-popup-title">Filter Settings</div>
    <div class="opt-popup-label">Filter Type</div>
    <div id="opt-filter-name" class="opt-clip-name">{{ firstShape?.name || firstShape?.subtype || '-' }}</div>
    <div class="opt-popup-label">Value</div>
    <div class="opt-slider-row">
      <span id="opt-filter-min">{{ firstShape?.min ?? 0 }}</span>
      <input type="range" id="opt-filter-value" :min="firstShape?.min ?? 0" :max="firstShape?.max ?? 200" :value="firstShape?.value ?? 100" @input="onFilterValueChange">
      <span id="opt-filter-value-val">{{ firstShape?.value ?? 100 }}</span>
    </div>
  </div>

  <!-- Transition Popup (video mode only) -->
  <div id="opt-popup-transition" class="opt-popup opt-popup-wide" :class="{ visible: currentPopup === 'transition' }">
    <div class="opt-popup-title">Transition Settings</div>

    <!-- Transition Type (read-only) -->
    <div class="opt-popup-label">Transition Type</div>
    <div id="opt-transition-name" class="opt-clip-name">{{ firstShape?.name || firstShape?.subtype || '-' }}</div>

    <!-- Easing -->
    <div class="opt-popup-label">Easing</div>
    <div class="opt-btn-row">
      <button class="opt-choice-btn" :class="{ selected: firstShape?.easing === 'linear' }" title="Linear" @click="() => { if (firstShape) { firstShape.easing = 'linear'; renderAfterChange(); } }">
        <svg class="w-6 h-4" viewBox="0 0 24 16"><line x1="2" y1="14" x2="22" y2="2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: firstShape?.easing === 'ease-in' }" title="Ease In" @click="() => { if (firstShape) { firstShape.easing = 'ease-in'; renderAfterChange(); } }">
        <svg class="w-6 h-4" viewBox="0 0 24 16"><path d="M2 14 Q2 2 22 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: firstShape?.easing === 'ease-out' }" title="Ease Out" @click="() => { if (firstShape) { firstShape.easing = 'ease-out'; renderAfterChange(); } }">
        <svg class="w-6 h-4" viewBox="0 0 24 16"><path d="M2 14 Q22 14 22 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      </button>
      <button class="opt-choice-btn" :class="{ selected: firstShape?.easing === 'ease-in-out' || !firstShape?.easing }" title="Ease In-Out" @click="() => { if (firstShape) { firstShape.easing = 'ease-in-out'; renderAfterChange(); } }">
        <svg class="w-6 h-4" viewBox="0 0 24 16"><path d="M2 14 Q2 8 12 8 Q22 8 22 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      </button>
    </div>

    <!-- Slide Transitions: Distance -->
    <template v-if="['slideLeft', 'slideRight', 'slideUp', 'slideDown'].includes(firstShape?.subtype)">
      <div class="opt-popup-label">Slide Distance</div>
      <div class="opt-slider-row">
        <span>10%</span>
        <input type="range" min="10" max="100" step="5" :value="firstShape?.distance ?? 100" @input="(e) => { if (firstShape) { firstShape.distance = parseInt(e.target.value); renderAfterChange(); } }">
        <span>{{ firstShape?.distance ?? 100 }}%</span>
      </div>
    </template>

    <!-- Zoom Transitions: Full Controls -->
    <template v-if="['zoomIn', 'zoomOut', 'crossZoom'].includes(firstShape?.subtype)">
      <!-- Zoom Mode: Auto vs Manual -->
      <div class="opt-popup-label">Zoom Mode</div>
      <div class="opt-btn-row">
        <button class="opt-choice-btn" :class="{ selected: firstShape?.zoomMode === 'auto' || !firstShape?.zoomMode }" @click="() => { if (firstShape) { firstShape.zoomMode = 'auto'; renderAfterChange(); } }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
          Auto
        </button>
        <button class="opt-choice-btn" :class="{ selected: firstShape?.zoomMode === 'manual' }" @click="() => { if (firstShape) { firstShape.zoomMode = 'manual'; renderAfterChange(); } }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7 19 3-8 8-3L3 3z"/></svg>
          Manual
        </button>
      </div>

      <!-- Focal Point Presets (when Manual mode) -->
      <template v-if="firstShape?.zoomMode === 'manual'">
        <div class="opt-popup-label">Focal Point</div>
        <div class="opt-focal-grid">
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'top-left' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'top-left'; firstShape.focalX = 0; firstShape.focalY = 0; renderAfterChange(); } }" title="Top Left">
            <span class="focal-dot" style="top: 2px; left: 2px;"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'top-center' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'top-center'; firstShape.focalX = 50; firstShape.focalY = 0; renderAfterChange(); } }" title="Top Center">
            <span class="focal-dot" style="top: 2px; left: 50%; transform: translateX(-50%);"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'top-right' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'top-right'; firstShape.focalX = 100; firstShape.focalY = 0; renderAfterChange(); } }" title="Top Right">
            <span class="focal-dot" style="top: 2px; right: 2px;"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'middle-left' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'middle-left'; firstShape.focalX = 0; firstShape.focalY = 50; renderAfterChange(); } }" title="Middle Left">
            <span class="focal-dot" style="top: 50%; left: 2px; transform: translateY(-50%);"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'center' || !firstShape?.focalPoint }" @click="() => { if (firstShape) { firstShape.focalPoint = 'center'; firstShape.focalX = 50; firstShape.focalY = 50; renderAfterChange(); } }" title="Center">
            <span class="focal-dot" style="top: 50%; left: 50%; transform: translate(-50%, -50%);"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'middle-right' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'middle-right'; firstShape.focalX = 100; firstShape.focalY = 50; renderAfterChange(); } }" title="Middle Right">
            <span class="focal-dot" style="top: 50%; right: 2px; transform: translateY(-50%);"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'bottom-left' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'bottom-left'; firstShape.focalX = 0; firstShape.focalY = 100; renderAfterChange(); } }" title="Bottom Left">
            <span class="focal-dot" style="bottom: 2px; left: 2px;"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'bottom-center' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'bottom-center'; firstShape.focalX = 50; firstShape.focalY = 100; renderAfterChange(); } }" title="Bottom Center">
            <span class="focal-dot" style="bottom: 2px; left: 50%; transform: translateX(-50%);"></span>
          </button>
          <button class="opt-focal-btn" :class="{ selected: firstShape?.focalPoint === 'bottom-right' }" @click="() => { if (firstShape) { firstShape.focalPoint = 'bottom-right'; firstShape.focalX = 100; firstShape.focalY = 100; renderAfterChange(); } }" title="Bottom Right">
            <span class="focal-dot" style="bottom: 2px; right: 2px;"></span>
          </button>
        </div>
        <!-- Draggable focal point picker -->
        <div class="opt-popup-label" style="margin-top: 8px;">Custom Position (drag to adjust)</div>
        <div
          class="opt-focal-picker"
          @mousedown="startFocalDrag($event, 'focal')"
          @touchstart.prevent="startFocalDrag($event, 'focal')"
        >
          <div
            class="focal-picker-handle"
            :style="{ left: (firstShape?.focalX ?? 50) + '%', top: (firstShape?.focalY ?? 50) + '%' }"
          ></div>
          <div class="focal-picker-crosshair-h" :style="{ top: (firstShape?.focalY ?? 50) + '%' }"></div>
          <div class="focal-picker-crosshair-v" :style="{ left: (firstShape?.focalX ?? 50) + '%' }"></div>
        </div>
        <div class="opt-coord-row" style="margin-top: 4px;">
          <label>X:</label>
          <input type="number" min="0" max="100" step="1" :value="firstShape?.focalX ?? 50" @input="(e) => { if (firstShape) { firstShape.focalX = parseInt(e.target.value) || 50; firstShape.focalPoint = 'custom'; renderAfterChange(); } }" class="opt-coord-input">
          <span>%</span>
          <label style="margin-left: 12px;">Y:</label>
          <input type="number" min="0" max="100" step="1" :value="firstShape?.focalY ?? 50" @input="(e) => { if (firstShape) { firstShape.focalY = parseInt(e.target.value) || 50; firstShape.focalPoint = 'custom'; renderAfterChange(); } }" class="opt-coord-input">
          <span>%</span>
        </div>
      </template>

      <!-- Zoom Level (magnification amount) -->
      <div class="opt-popup-label">Zoom Level</div>
      <div class="opt-slider-row">
        <span>100%</span>
        <input type="range" min="100" max="300" step="10" :value="firstShape?.zoomLevel ?? 150" @input="(e) => { if (firstShape) { firstShape.zoomLevel = parseInt(e.target.value); renderAfterChange(); } }">
        <span>{{ firstShape?.zoomLevel ?? 150 }}%</span>
      </div>
    </template>

    <!-- Ken Burns Transition: Dual Focal Points + Zoom Range -->
    <template v-if="firstShape?.subtype === 'kenBurns'">
      <!-- Start Zoom -->
      <div class="opt-popup-label">Start Zoom</div>
      <div class="opt-slider-row">
        <span>100%</span>
        <input type="range" min="100" max="200" step="5" :value="firstShape?.startZoom ?? 100" @input="(e) => { if (firstShape) { firstShape.startZoom = parseInt(e.target.value); renderAfterChange(); } }">
        <span>{{ firstShape?.startZoom ?? 100 }}%</span>
      </div>

      <!-- End Zoom -->
      <div class="opt-popup-label">End Zoom</div>
      <div class="opt-slider-row">
        <span>100%</span>
        <input type="range" min="100" max="200" step="5" :value="firstShape?.endZoom ?? 120" @input="(e) => { if (firstShape) { firstShape.endZoom = parseInt(e.target.value); renderAfterChange(); } }">
        <span>{{ firstShape?.endZoom ?? 120 }}%</span>
      </div>

      <!-- Start Focal Point -->
      <div class="opt-popup-label">Start Focal Point (drag to adjust)</div>
      <div
        class="opt-focal-picker"
        @mousedown="startFocalDrag($event, 'startFocal')"
        @touchstart.prevent="startFocalDrag($event, 'startFocal')"
      >
        <div
          class="focal-picker-handle"
          :style="{ left: (firstShape?.startFocalX ?? 50) + '%', top: (firstShape?.startFocalY ?? 50) + '%' }"
        ></div>
        <div class="focal-picker-crosshair-h" :style="{ top: (firstShape?.startFocalY ?? 50) + '%' }"></div>
        <div class="focal-picker-crosshair-v" :style="{ left: (firstShape?.startFocalX ?? 50) + '%' }"></div>
      </div>
      <div class="opt-coord-row" style="margin-top: 4px;">
        <label>X:</label>
        <input type="number" min="0" max="100" step="1" :value="firstShape?.startFocalX ?? 50" @input="(e) => { if (firstShape) { firstShape.startFocalX = parseInt(e.target.value) || 50; firstShape.startFocalPoint = 'custom'; renderAfterChange(); } }" class="opt-coord-input">
        <span>%</span>
        <label style="margin-left: 12px;">Y:</label>
        <input type="number" min="0" max="100" step="1" :value="firstShape?.startFocalY ?? 50" @input="(e) => { if (firstShape) { firstShape.startFocalY = parseInt(e.target.value) || 50; firstShape.startFocalPoint = 'custom'; renderAfterChange(); } }" class="opt-coord-input">
        <span>%</span>
      </div>

      <!-- End Focal Point -->
      <div class="opt-popup-label" style="margin-top: 12px;">End Focal Point (drag to adjust)</div>
      <div
        class="opt-focal-picker"
        @mousedown="startFocalDrag($event, 'endFocal')"
        @touchstart.prevent="startFocalDrag($event, 'endFocal')"
      >
        <div
          class="focal-picker-handle"
          :style="{ left: (firstShape?.endFocalX ?? 50) + '%', top: (firstShape?.endFocalY ?? 50) + '%' }"
        ></div>
        <div class="focal-picker-crosshair-h" :style="{ top: (firstShape?.endFocalY ?? 50) + '%' }"></div>
        <div class="focal-picker-crosshair-v" :style="{ left: (firstShape?.endFocalX ?? 50) + '%' }"></div>
      </div>
      <div class="opt-coord-row" style="margin-top: 4px;">
        <label>X:</label>
        <input type="number" min="0" max="100" step="1" :value="firstShape?.endFocalX ?? 50" @input="(e) => { if (firstShape) { firstShape.endFocalX = parseInt(e.target.value) || 50; firstShape.endFocalPoint = 'custom'; renderAfterChange(); } }" class="opt-coord-input">
        <span>%</span>
        <label style="margin-left: 12px;">Y:</label>
        <input type="number" min="0" max="100" step="1" :value="firstShape?.endFocalY ?? 50" @input="(e) => { if (firstShape) { firstShape.endFocalY = parseInt(e.target.value) || 50; firstShape.endFocalPoint = 'custom'; renderAfterChange(); } }" class="opt-coord-input">
        <span>%</span>
      </div>
    </template>

    <!-- Blur Transition: Intensity -->
    <template v-if="firstShape?.subtype === 'blurTransition'">
      <div class="opt-popup-label">Blur Intensity</div>
      <div class="opt-slider-row">
        <span>0px</span>
        <input type="range" min="0" max="30" step="1" :value="firstShape?.intensity ?? 10" @input="(e) => { if (firstShape) { firstShape.intensity = parseInt(e.target.value); renderAfterChange(); } }">
        <span>{{ firstShape?.intensity ?? 10 }}px</span>
      </div>
    </template>

    <!-- Spin Transition: Rotation & Direction -->
    <template v-if="firstShape?.subtype === 'spin'">
      <div class="opt-popup-label">Rotation</div>
      <div class="opt-slider-row">
        <span>90°</span>
        <input type="range" min="90" max="720" step="90" :value="firstShape?.rotation ?? 360" @input="(e) => { if (firstShape) { firstShape.rotation = parseInt(e.target.value); renderAfterChange(); } }">
        <span>{{ firstShape?.rotation ?? 360 }}°</span>
      </div>
      <div class="opt-popup-label">Direction</div>
      <div class="opt-btn-row">
        <button class="opt-choice-btn" :class="{ selected: firstShape?.direction === 'cw' || !firstShape?.direction }" @click="() => { if (firstShape) { firstShape.direction = 'cw'; renderAfterChange(); } }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
          CW
        </button>
        <button class="opt-choice-btn" :class="{ selected: firstShape?.direction === 'ccw' }" @click="() => { if (firstShape) { firstShape.direction = 'ccw'; renderAfterChange(); } }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>
          CCW
        </button>
      </div>
    </template>

    <!-- Flip Transition: Axis -->
    <template v-if="firstShape?.subtype === 'flip'">
      <div class="opt-popup-label">Flip Axis</div>
      <div class="opt-btn-row">
        <button class="opt-choice-btn" :class="{ selected: firstShape?.axis === 'horizontal' || !firstShape?.axis }" @click="() => { if (firstShape) { firstShape.axis = 'horizontal'; renderAfterChange(); } }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/></svg>
          Horizontal
        </button>
        <button class="opt-choice-btn" :class="{ selected: firstShape?.axis === 'vertical' }" @click="() => { if (firstShape) { firstShape.axis = 'vertical'; renderAfterChange(); } }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/></svg>
          Vertical
        </button>
      </div>
    </template>

    <!-- Bounce Transition: Intensity & Bounces -->
    <template v-if="firstShape?.subtype === 'bounce'">
      <div class="opt-popup-label">Bounce Intensity</div>
      <div class="opt-slider-row">
        <span>0.1</span>
        <input type="range" min="0.1" max="1" step="0.1" :value="firstShape?.intensity ?? 0.5" @input="(e) => { if (firstShape) { firstShape.intensity = parseFloat(e.target.value); renderAfterChange(); } }">
        <span>{{ (firstShape?.intensity ?? 0.5).toFixed(1) }}</span>
      </div>
      <div class="opt-popup-label">Number of Bounces</div>
      <div class="opt-btn-row">
        <button v-for="n in [1, 2, 3, 4, 5]" :key="n" class="opt-choice-btn" :class="{ selected: (firstShape?.bounces ?? 2) === n }" @click="() => { if (firstShape) { firstShape.bounces = n; renderAfterChange(); } }">
          {{ n }}
        </button>
      </div>
    </template>

    <!-- Elastic Transition: Elasticity -->
    <template v-if="firstShape?.subtype === 'elastic'">
      <div class="opt-popup-label">Elasticity</div>
      <div class="opt-slider-row">
        <span>0.1</span>
        <input type="range" min="0.1" max="1" step="0.1" :value="firstShape?.elasticity ?? 0.5" @input="(e) => { if (firstShape) { firstShape.elasticity = parseFloat(e.target.value); renderAfterChange(); } }">
        <span>{{ (firstShape?.elasticity ?? 0.5).toFixed(1) }}</span>
      </div>
    </template>
  </div>

  <!-- Clip FX Menu Popup (video mode - for any visual clip) -->
  <div id="opt-popup-clip-fx" class="opt-popup opt-popup-wide" :class="{ visible: currentPopup === 'clip-fx' }">
    <div class="opt-popup-title">Effects & Filters</div>

    <!-- Filters Category -->
    <div class="opt-fx-category">
      <div class="opt-fx-category-header">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
        <span>Filters</span>
      </div>
      <div class="opt-fx-list">
        <button
          v-for="filter in clipFilters"
          :key="filter.id"
          class="opt-fx-item"
          :class="{ active: shapeHasFx('filter', filter.id) }"
          @click="openFxEdit('filter', filter.id)"
        >
          <span class="opt-fx-check" v-if="shapeHasFx('filter', filter.id)">✓</span>
          <span class="opt-fx-icon" v-html="getFxIcon(filter.icon)"></span>
          <span>{{ filter.name }}</span>
        </button>
      </div>
    </div>

    <!-- Animations Category -->
    <div class="opt-fx-category">
      <div class="opt-fx-category-header">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <path d="M10 7 L14 12 L10 17"/>
        </svg>
        <span>Animations</span>
      </div>
      <div class="opt-fx-list">
        <button
          v-for="anim in clipAnimations"
          :key="anim.id"
          class="opt-fx-item"
          :class="{ active: shapeHasFx('animation', anim.id) }"
          @click="openFxEdit('animation', anim.id)"
        >
          <span class="opt-fx-check" v-if="shapeHasFx('animation', anim.id)">✓</span>
          <span class="opt-fx-icon" v-html="getFxIcon(anim.icon)"></span>
          <span>{{ anim.name }}</span>
        </button>
      </div>
    </div>
  </div>

  <!-- FX Edit Popup (parameter editing for selected FX) -->
  <div id="opt-popup-fx-edit" class="opt-popup opt-popup-wide" :class="{ visible: currentPopup === 'fx-edit' }">
    <div class="opt-popup-title">
      <button class="opt-back-btn" @click.stop="goBackToFxMenu" title="Back to FX list">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <span>{{ currentFxName ? (fxDisplayNames[currentFxName] || currentFxName) : '' }}</span>
    </div>

    <!-- Filter Parameters -->
    <template v-if="currentFxType === 'filter' && localFx">
      <div class="opt-popup-label">{{ filterConfig[currentFxName]?.label || 'Value' }}</div>
      <div class="opt-slider-row">
        <span>{{ filterConfig[currentFxName]?.min ?? 0 }}</span>
        <input
          type="range"
          :min="filterConfig[currentFxName]?.min ?? 0"
          :max="filterConfig[currentFxName]?.max ?? 200"
          :step="filterConfig[currentFxName]?.step ?? 1"
          v-model.number="localFx.value"
        >
        <span>{{ localFx.value }}{{ filterConfig[currentFxName]?.unit || '' }}</span>
      </div>
    </template>

    <!-- Animation Parameters -->
    <template v-if="currentFxType === 'animation' && localFx">
      <!-- Preview indicator and button -->
      <div class="opt-preview-row">
        <span v-if="isPreviewingAnimation" class="opt-preview-indicator">
          <svg class="opt-preview-icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Previewing...
        </span>
        <button
          class="opt-preview-btn"
          @click="previewAnimation"
          :disabled="isPreviewingAnimation"
          title="Preview animation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
          </svg>
          Preview
        </button>
      </div>

      <!-- In/Out -->
      <div class="opt-popup-label">Apply To</div>
      <div class="opt-btn-row">
        <button
          class="opt-choice-btn"
          :class="{ selected: localFx.position === 'in' }"
          @click="localFx.position = 'in'"
        >In</button>
        <button
          class="opt-choice-btn"
          :class="{ selected: localFx.position === 'out' }"
          @click="localFx.position = 'out'"
        >Out</button>
        <button
          class="opt-choice-btn"
          :class="{ selected: localFx.position === 'both' }"
          @click="localFx.position = 'both'"
        >Both</button>
      </div>

      <!-- Duration -->
      <div class="opt-popup-label">Duration</div>
      <div class="opt-slider-row">
        <span>0.1s</span>
        <input type="range" min="0.1" :max="maxAnimationDuration" step="0.1" v-model.number="localFx.duration">
        <span>{{ localFx.duration?.toFixed(1) || '0.5' }}s</span>
      </div>

      <!-- Easing -->
      <div class="opt-popup-label">Easing</div>
      <div class="opt-btn-row">
        <button
          v-for="ease in easingOptions"
          :key="ease.value"
          class="opt-choice-btn"
          :class="{ selected: localFx.easing === ease.value }"
          :title="ease.label"
          @click="localFx.easing = ease.value"
        >
          <svg class="w-6 h-4" viewBox="0 0 24 16">
            <path :d="ease.path" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
      </div>

      <!-- Direction (for slide, wipe) -->
      <template v-if="['wipe'].includes(currentFxName)">
        <div class="opt-popup-label">Direction</div>
        <div class="opt-btn-row">
          <button class="opt-choice-btn" :class="{ selected: localFx.direction === 'left' }" @click="localFx.direction = 'left'" title="Left">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button class="opt-choice-btn" :class="{ selected: localFx.direction === 'right' }" @click="localFx.direction = 'right'" title="Right">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <button class="opt-choice-btn" :class="{ selected: localFx.direction === 'up' }" @click="localFx.direction = 'up'" title="Up">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button class="opt-choice-btn" :class="{ selected: localFx.direction === 'down' }" @click="localFx.direction = 'down'" title="Down">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </template>

      <!-- Scale (for zoom transitions) -->
      <template v-if="['zoom', 'zoomIn', 'zoomOut'].includes(currentFxName)">
        <div class="opt-popup-label">Scale</div>
        <div class="opt-slider-row">
          <span>0.1</span>
          <input type="range" min="0.1" max="3" step="0.1" v-model.number="localFx.scale">
          <span>{{ localFx.scale?.toFixed(1) || '1.0' }}x</span>
        </div>
      </template>

      <!-- Rotation (for spin, flip) -->
      <template v-if="['spin', 'flip'].includes(currentFxName)">
        <div class="opt-popup-label">Rotation</div>
        <div class="opt-slider-row">
          <span>90°</span>
          <input type="range" min="90" max="720" step="90" v-model.number="localFx.rotation">
          <span>{{ localFx.rotation || 360 }}°</span>
        </div>
      </template>

      <!-- Intensity (for blur animation) -->
      <template v-if="currentFxName === 'blur' && currentFxType === 'animation'">
        <div class="opt-popup-label">Blur Intensity</div>
        <div class="opt-slider-row">
          <span>5px</span>
          <input type="range" min="5" max="50" step="5" v-model.number="localFx.intensity">
          <span>{{ localFx.intensity || 20 }}px</span>
        </div>
      </template>

      <!-- 3D Rotation controls (for rotate3d animation) -->
      <template v-if="currentFxName === 'rotate3d'">
        <div class="opt-popup-label">Perspective</div>
        <div class="opt-slider-row">
          <span>100</span>
          <input type="range" min="100" max="2000" step="50" v-model.number="localFx.perspective">
          <span>{{ localFx.perspective || 800 }}px</span>
        </div>

        <div class="opt-popup-label">Tilt (X-Axis)</div>
        <div class="opt-slider-row">
          <span>-180°</span>
          <input type="range" min="-180" max="180" step="15" v-model.number="localFx.rotateX">
          <span>{{ localFx.rotateX || 0 }}°</span>
        </div>

        <div class="opt-popup-label">Turn (Y-Axis)</div>
        <div class="opt-slider-row">
          <span>-180°</span>
          <input type="range" min="-180" max="180" step="15" v-model.number="localFx.rotateY">
          <span>{{ localFx.rotateY || 0 }}°</span>
        </div>

        <div class="opt-popup-label">Spin (Z-Axis)</div>
        <div class="opt-slider-row">
          <span>-180°</span>
          <input type="range" min="-180" max="180" step="15" v-model.number="localFx.rotateZ">
          <span>{{ localFx.rotateZ || 0 }}°</span>
        </div>

      </template>
    </template>

    <!-- Action Buttons -->
    <div class="opt-fx-actions">
      <button v-if="currentFxExists" class="opt-fx-btn opt-fx-btn-remove" @click.stop="removeFx" title="Remove this effect">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        
      </button>
      <button class="opt-fx-btn opt-fx-btn-reset" @click="resetFxToDefaults" title="Reset to defaults">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        Reset
      </button>
      <button class="opt-fx-btn opt-fx-btn-apply" @click="doneFxEdit" title="Apply and close">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Done
      </button>
    </div>
  </div>
</template>

<style>
/* OptionsBar is styled via the main styles/index.css */
/* The component uses the same CSS classes as the legacy implementation */

/* Wider number input for keyframe time */
.opt-num-input-wide {
  width: 80px !important;
  min-width: 80px !important;
}

/* Unit text next to inputs */
.opt-unit {
  color: var(--text-muted);
  font-size: 12px;
  margin-left: 4px;
}

/* Danger button style for delete actions */
.opt-menu-item-danger {
  color: var(--danger-color, #ef4444) !important;
}
.opt-menu-item-danger:hover:not(:disabled) {
  background: var(--danger-bg, rgba(239, 68, 68, 0.1)) !important;
}
.opt-menu-item-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Capture popup styles */
.opt-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.opt-status-text {
  font-family: monospace;
  font-size: 14px;
  color: var(--text-primary);
}

.opt-btn-primary {
  background: var(--accent) !important;
  color: white !important;
  border-color: var(--accent) !important;
}

.opt-btn-primary:hover {
  background: var(--accent-hover) !important;
}

.opt-btn-danger {
  background: #ef4444 !important;
  color: white !important;
  border-color: #ef4444 !important;
}

.opt-btn-danger:hover {
  background: #dc2626 !important;
}

.opt-choice-btn svg {
  margin-right: 4px;
}
</style>
