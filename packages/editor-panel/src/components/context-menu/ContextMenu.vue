<script setup>
/**
 * ContextMenu - Right-click context menu for canvas actions
 *
 * IMPORTANT: This component outputs the EXACT same HTML as getContextMenuHTML()
 * in core/contextMenu.js:
 *
 * <div id="context-menu" class="hidden fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl min-w-[200px] max-h-[500px] overflow-y-auto py-1.5 z-50">
 *   <button class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" data-action="cut">
 *     <span>Cut</span>
 *     <span class="text-xs text-gray-400">⌘X</span>
 *   </button>
 *   <div class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700"></div>
 *   ...
 * </div>
 *
 * NOTE: The legacy code handles visibility logic in showContextMenu() by toggling
 * display:none on items. This Vue component replicates that exact behavior.
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';
import { getClipboard } from '../../composables/useClipboard.js';

const { state, config } = getEditorState();
const clipboard = getClipboard();

// Visibility and position
const visible = ref(false);
const menuRef = ref(null);

// Store the canvas position where right-click occurred (for "Paste here")
const pastePosition = ref({ x: 0, y: 0 });

// View mode is now tracked in shared state (state.viewModeActive)

// Config options
const showSnapToggle = computed(() => config.snap?.showInContextMenu !== false);
const showFrameTool = computed(() => config.toolbar?.showFrameTool !== false);

// State-derived visibility - matches legacy showContextMenu() logic
const hasFrameChildSelection = computed(() =>
  state.selectedFrameChildren && state.selectedFrameChildren.length > 0
);

const hasSelection = computed(() =>
  state.selectedIndices.length > 0 || hasFrameChildSelection.value
);

const hasMainSelection = computed(() => state.selectedIndices.length > 0);
const hasShapes = computed(() => state.shapes.length > 0);
const hasClipboard = computed(() => state.clipboard && state.clipboard.length > 0);
const isMultiSelection = computed(() => state.selectedIndices.length > 1);

const selectedShape = computed(() =>
  state.selectedIndices.length > 0 ? state.shapes[state.selectedIndices[0]] : null
);

const isGroup = computed(() => selectedShape.value?.type === 'group');
const isFrame = computed(() =>
  state.selectedIndices.length === 1 && selectedShape.value?.type === 'frame'
);

// Check if selection is croppable (image, video, or webcamCapture)
const isImage = computed(() => {
  const croppableTypes = ['image', 'video', 'webcamCapture'];
  if (state.selectedIndices.length === 1) {
    const type = selectedShape.value?.type;
    if (croppableTypes.includes(type)) return true;
  }
  if (hasFrameChildSelection.value && state.selectedFrameChildren.length === 1) {
    const sel = state.selectedFrameChildren[0];
    const frame = state.shapes[sel.frameIndex];
    const child = frame?.children?.[sel.childIndex];
    if (croppableTypes.includes(child?.type)) return true;
  }
  return false;
});

const canWrapInFrame = computed(() => {
  return state.selectedIndices.length > 0 && !state.selectedIndices.some(i => {
    const s = state.shapes[i];
    return s?.type === 'frame' || s?.parentFrameId;
  });
});

const canRemoveFromFrame = computed(() => hasFrameChildSelection.value);

const canBooleanOperate = computed(() => {
  if (!isMultiSelection.value || hasFrameChildSelection.value) return false;
  const validTypes = ['rect', 'circle', 'ellipse', 'diamond', 'triangle', 'path'];
  return state.selectedIndices.every(i => {
    const s = state.shapes[i];
    return s && validTypes.includes(s.type);
  });
});

// Check item visibility - matches legacy showContextMenu() logic exactly
function isItemVisible(action) {
  const requiresSelection = ['cut', 'copy', 'copyPng', 'copySvg', 'duplicate', 'delete', 'flipHorizontal', 'flipVertical'];
  const requiresMainSelection = ['bringForward', 'sendBackward', 'bringToFront', 'sendToBack', 'group', 'ungroup'];

  // Hide items that require any selection when nothing selected
  if (requiresSelection.includes(action) && !hasSelection.value) {
    return false;
  }

  // Hide items that require main selection when only frame children are selected
  if (requiresMainSelection.includes(action) && (!state.selectedIndices.length || hasFrameChildSelection.value)) {
    return false;
  }

  // Select all: hidden when shapes exist and something is selected, or when no shapes exist
  if (action === 'selectAll') {
    return hasShapes.value && !hasSelection.value;
  }

  // Crop image visible when single image is selected
  if (action === 'cropImage') {
    return isImage.value;
  }

  // Group requires multiple main selection
  if (action === 'group') {
    return isMultiSelection.value && !hasFrameChildSelection.value;
  }

  // Ungroup requires a group to be selected
  if (action === 'ungroup') {
    return isGroup.value;
  }

  // Boolean operations require 2+ closed shapes
  if (['boolUnion', 'boolSubtract', 'boolIntersect', 'boolExclude'].includes(action)) {
    return canBooleanOperate.value;
  }

  // Frame-related options
  if (action === 'wrapInFrame') {
    return showFrameTool.value && canWrapInFrame.value && !hasFrameChildSelection.value;
  }

  if (action === 'selectFrameElements') {
    return showFrameTool.value && isFrame.value;
  }

  if (action === 'removeFromFrame') {
    return showFrameTool.value && (canRemoveFromFrame.value || (isFrame.value && selectedShape.value?.children?.length));
  }

  if (action === 'toggleClipContent' || action === 'exportFramePng' || action === 'exportFrameSvg') {
    return showFrameTool.value && isFrame.value;
  }

  // Snap toggles: hide when element is selected
  if (action === 'toggleSnap' || action === 'toggleSnapObjects') {
    return showSnapToggle.value && !hasSelection.value;
  }

  // View mode: hide when element is selected
  if (action === 'toggleViewMode') {
    return !hasSelection.value;
  }

  return true;
}

// Get item label - handles toggle labels like legacy
function getItemLabel(action, label) {
  if (action === 'toggleSnap' && !hasSelection.value) {
    return state.snapToGuides !== false ? '✓ Snap to guides' : 'Snap to guides';
  }
  if (action === 'toggleSnapObjects' && !hasSelection.value) {
    return state.snapToObjects !== false ? '✓ Snap to objects' : 'Snap to objects';
  }
  if (action === 'toggleViewMode' && !hasSelection.value) {
    return state.viewModeActive ? '✓ View mode' : 'View mode';
  }
  if (action === 'toggleClipContent' && isFrame.value) {
    return selectedShape.value?.clipContent ? '✓ Clip content' : 'Clip content';
  }
  return label;
}

// Check if paste is disabled
function isPasteDisabled() {
  return !hasClipboard.value;
}

async function show(x, y, canvasX = null, canvasY = null) {
  // Store canvas position for "Paste here" (if provided)
  if (canvasX !== null && canvasY !== null) {
    pastePosition.value = { x: canvasX, y: canvasY };
  } else if (typeof window.screenToCanvas === 'function') {
    // Convert screen coordinates to canvas coordinates
    const pos = window.screenToCanvas(x, y);
    pastePosition.value = { x: pos.x, y: pos.y };
  }

  // Wait for Vue reactivity to process any state changes (e.g., selection updates)
  await nextTick();

  // Make menu visible for measurement (matches legacy approach)
  visible.value = true;

  // Wait for DOM to update with visible menu
  await nextTick();

  const menu = menuRef.value;
  if (!menu) return;

  // Position off-screen first to get accurate dimensions (matches legacy)
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';

  // Wait for render
  await new Promise(resolve => requestAnimationFrame(resolve));

  // Get dimensions using getBoundingClientRect (matches legacy)
  const rect = menu.getBoundingClientRect();
  const menuWidth = rect.width;
  const menuHeight = rect.height;

  const padding = config.contextMenu?.viewportPadding ?? 8;

  let posX = x;
  let posY = y;

  // Adjust X - if would go off right edge, flip to left of cursor (matches legacy)
  if (x + menuWidth + padding > window.innerWidth) {
    posX = x - menuWidth;
  }
  // Ensure doesn't go off left edge
  if (posX < padding) {
    posX = padding;
  }

  // Adjust Y - if would go off bottom edge, flip to above cursor (matches legacy)
  if (y + menuHeight + padding > window.innerHeight) {
    posY = y - menuHeight;
  }
  // Ensure doesn't go off top edge
  if (posY < padding) {
    posY = padding;
  }

  // Set final position via direct DOM manipulation (no Vue style binding to override)
  menu.style.left = posX + 'px';
  menu.style.top = posY + 'px';
}

function hide() {
  visible.value = false;
}

function handleAction(action) {
  hide();

  switch (action) {
    case 'cut':
      // Use Vue composable directly for proper media handling
      clipboard.cutSelected();
      break;
    case 'copy':
      // Use Vue composable directly for proper media handling
      clipboard.copySelected();
      break;
    case 'paste':
      // Use Vue composable directly for proper media handling
      clipboard.pasteClipboard();
      break;
    case 'pasteHere':
      // Use Vue composable directly for proper media handling
      clipboard.pasteAt(pastePosition.value.x, pastePosition.value.y);
      break;
    case 'copyPng':
      if (typeof window.copySelectedAsPng === 'function') window.copySelectedAsPng();
      break;
    case 'copySvg':
      if (typeof window.copySelectedAsSvg === 'function') window.copySelectedAsSvg();
      break;
    case 'cropImage':
      if (typeof window.handleContextCropImage === 'function') window.handleContextCropImage();
      break;
    case 'selectAll':
      if (typeof window.selectAll === 'function') window.selectAll();
      break;
    case 'duplicate':
      if (typeof window.duplicateSelected === 'function') window.duplicateSelected();
      break;
    case 'flipHorizontal':
      if (typeof window.flipSelectedHorizontal === 'function') window.flipSelectedHorizontal();
      break;
    case 'flipVertical':
      if (typeof window.flipSelectedVertical === 'function') window.flipSelectedVertical();
      break;
    case 'bringForward':
      if (typeof window.bringForward === 'function') window.bringForward();
      break;
    case 'sendBackward':
      if (typeof window.sendBackward === 'function') window.sendBackward();
      break;
    case 'bringToFront':
      if (typeof window.bringToFront === 'function') window.bringToFront();
      break;
    case 'sendToBack':
      if (typeof window.sendToBack === 'function') window.sendToBack();
      break;
    case 'group':
      if (typeof window.groupSelected === 'function') window.groupSelected();
      break;
    case 'ungroup':
      if (typeof window.ungroupSelected === 'function') window.ungroupSelected();
      break;
    case 'boolUnion':
    case 'boolSubtract':
    case 'boolIntersect':
    case 'boolExclude':
      if (typeof window.booleanOperation === 'function') {
        window.booleanOperation(action.replace('bool', '').toLowerCase());
      }
      break;
    case 'wrapInFrame':
      if (typeof window.wrapSelectionInFrame === 'function') window.wrapSelectionInFrame();
      break;
    case 'removeFromFrame':
      if (typeof window.handleRemoveFromFrame === 'function') window.handleRemoveFromFrame();
      break;
    case 'selectFrameElements':
      if (typeof window.selectAllFrameElements === 'function') window.selectAllFrameElements();
      break;
    case 'toggleClipContent':
      if (typeof window.toggleFrameClipContent === 'function') window.toggleFrameClipContent();
      break;
    case 'exportFramePng':
      if (typeof window.exportFrameAsPng === 'function') window.exportFrameAsPng();
      break;
    case 'exportFrameSvg':
      if (typeof window.exportFrameAsSvg === 'function') window.exportFrameAsSvg();
      break;
    case 'toggleSnap':
      state.snapToGuides = state.snapToGuides === false ? true : false;
      break;
    case 'toggleSnapObjects':
      state.snapToObjects = state.snapToObjects === false ? true : false;
      break;
    case 'toggleViewMode':
      // Toggle view mode in shared state (App.vue reacts to this)
      state.viewModeActive = !state.viewModeActive;
      // Also call legacy function to hide remaining legacy UI elements
      if (typeof window.toggleViewMode === 'function') window.toggleViewMode();
      break;
    case 'delete':
      // Use Vue composable directly for proper cleanup
      clipboard.deleteSelected();
      break;
  }
}

// Click outside to close
function handleClickOutside(event) {
  if (visible.value && !event.target.closest('#context-menu')) {
    hide();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Expose show/hide methods for legacy code
defineExpose({ show, hide });

// Also expose globally for legacy code compatibility
if (typeof window !== 'undefined') {
  window.vueContextMenu = { show, hide };
}
</script>

<template>
  <!-- EXACT same structure as legacy getContextMenuHTML() -->
  <!-- NOTE: No Teleport - stays in vue-overlay-root so it's not hidden by legacy cleanup -->
  <div
    id="context-menu"
    ref="menuRef"
    :class="visible ? '' : 'hidden'"
    class="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl min-w-[200px] max-h-[500px] overflow-y-auto py-1.5 z-[200]"
  >
      <!-- Cut -->
      <button
        v-show="isItemVisible('cut')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="cut"
        @click="handleAction('cut')"
      >
        <span>Cut</span>
        <span class="text-xs text-gray-400">⌘X</span>
      </button>

      <!-- Copy -->
      <button
        v-show="isItemVisible('copy')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="copy"
        @click="handleAction('copy')"
      >
        <span>Copy</span>
        <span class="text-xs text-gray-400">⌘C</span>
      </button>

      <!-- Paste -->
      <button
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        :class="{ 'opacity-40 cursor-not-allowed': isPasteDisabled() }"
        :disabled="isPasteDisabled()"
        data-action="paste"
        @click="handleAction('paste')"
      >
        <span>Paste</span>
        <span class="text-xs text-gray-400">⌘V</span>
      </button>

      <!-- Paste here -->
      <button
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        :class="{ 'opacity-40 cursor-not-allowed': isPasteDisabled() }"
        :disabled="isPasteDisabled()"
        data-action="pasteHere"
        @click="handleAction('pasteHere')"
      >
        <span>Paste here</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <div v-show="isItemVisible('copy')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Copy as PNG -->
      <button
        v-show="isItemVisible('copyPng')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="copyPng"
        @click="handleAction('copyPng')"
      >
        <span>Copy as PNG</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Copy as SVG -->
      <button
        v-show="isItemVisible('copySvg')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="copySvg"
        @click="handleAction('copySvg')"
      >
        <span>Copy as SVG</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <div v-show="isItemVisible('cropImage')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Crop image -->
      <button
        v-show="isItemVisible('cropImage')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="cropImage"
        @click="handleAction('cropImage')"
      >
        <span>Crop image</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <div v-show="isItemVisible('selectAll')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Select all -->
      <button
        v-show="isItemVisible('selectAll')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="selectAll"
        @click="handleAction('selectAll')"
      >
        <span>Select all</span>
        <span class="text-xs text-gray-400">⌘A</span>
      </button>

      <!-- Duplicate -->
      <button
        v-show="isItemVisible('duplicate')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="duplicate"
        @click="handleAction('duplicate')"
      >
        <span>Duplicate</span>
        <span class="text-xs text-gray-400">⌘D</span>
      </button>

      <div v-show="isItemVisible('flipHorizontal')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Flip horizontal -->
      <button
        v-show="isItemVisible('flipHorizontal')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="flipHorizontal"
        @click="handleAction('flipHorizontal')"
      >
        <span>Flip horizontal</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Flip vertical -->
      <button
        v-show="isItemVisible('flipVertical')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="flipVertical"
        @click="handleAction('flipVertical')"
      >
        <span>Flip vertical</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <div v-show="isItemVisible('bringForward')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Bring forward -->
      <button
        v-show="isItemVisible('bringForward')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="bringForward"
        @click="handleAction('bringForward')"
      >
        <span>Bring forward</span>
        <span class="text-xs text-gray-400">⌘]</span>
      </button>

      <!-- Send backward -->
      <button
        v-show="isItemVisible('sendBackward')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="sendBackward"
        @click="handleAction('sendBackward')"
      >
        <span>Send backward</span>
        <span class="text-xs text-gray-400">⌘[</span>
      </button>

      <!-- Bring to front -->
      <button
        v-show="isItemVisible('bringToFront')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="bringToFront"
        @click="handleAction('bringToFront')"
      >
        <span>Bring to front</span>
        <span class="text-xs text-gray-400">⌘⇧]</span>
      </button>

      <!-- Send to back -->
      <button
        v-show="isItemVisible('sendToBack')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="sendToBack"
        @click="handleAction('sendToBack')"
      >
        <span>Send to back</span>
        <span class="text-xs text-gray-400">⌘⇧[</span>
      </button>

      <div v-show="isItemVisible('group')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Group -->
      <button
        v-show="isItemVisible('group')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="group"
        @click="handleAction('group')"
      >
        <span>Group</span>
        <span class="text-xs text-gray-400">⌘G</span>
      </button>

      <!-- Ungroup -->
      <button
        v-show="isItemVisible('ungroup')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="ungroup"
        @click="handleAction('ungroup')"
      >
        <span>Ungroup</span>
        <span class="text-xs text-gray-400">⌘⇧G</span>
      </button>

      <div v-show="isItemVisible('boolUnion')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Boolean Union -->
      <button
        v-show="isItemVisible('boolUnion')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="boolUnion"
        @click="handleAction('boolUnion')"
      >
        <span>Union</span>
        <span class="text-xs text-gray-400">⌘⌥U</span>
      </button>

      <!-- Boolean Subtract -->
      <button
        v-show="isItemVisible('boolSubtract')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="boolSubtract"
        @click="handleAction('boolSubtract')"
      >
        <span>Subtract</span>
        <span class="text-xs text-gray-400">⌘⌥S</span>
      </button>

      <!-- Boolean Intersect -->
      <button
        v-show="isItemVisible('boolIntersect')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="boolIntersect"
        @click="handleAction('boolIntersect')"
      >
        <span>Intersect</span>
        <span class="text-xs text-gray-400">⌘⌥I</span>
      </button>

      <!-- Boolean Exclude -->
      <button
        v-show="isItemVisible('boolExclude')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="boolExclude"
        @click="handleAction('boolExclude')"
      >
        <span>Exclude</span>
        <span class="text-xs text-gray-400">⌘⌥E</span>
      </button>

      <div v-show="isItemVisible('wrapInFrame')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Wrap in frame -->
      <button
        v-show="isItemVisible('wrapInFrame')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="wrapInFrame"
        @click="handleAction('wrapInFrame')"
      >
        <span>Wrap selection in frame</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Remove from frame -->
      <button
        v-show="isItemVisible('removeFromFrame')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="removeFromFrame"
        @click="handleAction('removeFromFrame')"
      >
        <span>Remove from frame</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Select all elements in frame -->
      <button
        v-show="isItemVisible('selectFrameElements')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="selectFrameElements"
        @click="handleAction('selectFrameElements')"
      >
        <span>Select all elements in frame</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Toggle clip content -->
      <button
        v-show="isItemVisible('toggleClipContent')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="toggleClipContent"
        @click="handleAction('toggleClipContent')"
      >
        <span>{{ getItemLabel('toggleClipContent', 'Clip content') }}</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Export frame as PNG -->
      <button
        v-show="isItemVisible('exportFramePng')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="exportFramePng"
        @click="handleAction('exportFramePng')"
      >
        <span>Export frame as PNG</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Export frame as SVG -->
      <button
        v-show="isItemVisible('exportFrameSvg')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="exportFrameSvg"
        @click="handleAction('exportFrameSvg')"
      >
        <span>Export frame as SVG</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <div v-show="isItemVisible('toggleSnap')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Snap to guides -->
      <button
        v-show="isItemVisible('toggleSnap')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="toggleSnap"
        @click="handleAction('toggleSnap')"
      >
        <span>{{ getItemLabel('toggleSnap', 'Snap to guides') }}</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- Snap to objects -->
      <button
        v-show="isItemVisible('toggleSnapObjects')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="toggleSnapObjects"
        @click="handleAction('toggleSnapObjects')"
      >
        <span>{{ getItemLabel('toggleSnapObjects', 'Snap to objects') }}</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <!-- View mode -->
      <button
        v-show="isItemVisible('toggleViewMode')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="toggleViewMode"
        @click="handleAction('toggleViewMode')"
      >
        <span>{{ getItemLabel('toggleViewMode', 'View mode') }}</span>
        <span class="text-xs text-gray-400"></span>
      </button>

      <div v-show="isItemVisible('delete')" class="context-divider my-1.5 border-t border-gray-200 dark:border-gray-700" />

      <!-- Delete -->
      <button
        v-show="isItemVisible('delete')"
        class="context-item w-full flex items-center justify-between px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        data-action="delete"
        @click="handleAction('delete')"
      >
        <span>Delete</span>
        <span class="text-xs text-gray-400">Del</span>
      </button>
  </div>
</template>

<style>
/*
 * ContextMenu uses global CSS classes from styles/index.css
 * Classes used:
 *   .context-item - menu item base styling
 *   .context-divider - divider styling
 * Tailwind classes used for exact match with legacy:
 *   hidden, fixed, bg-white, dark:bg-gray-800, border, border-gray-200,
 *   dark:border-gray-700, rounded-lg, shadow-xl, min-w-[200px], max-h-[500px],
 *   overflow-y-auto, py-1.5, z-[200], w-full, flex, items-center, justify-between,
 *   px-3, py-2, text-xs, text-gray-700, dark:text-gray-200, hover:bg-gray-100,
 *   dark:hover:bg-gray-700, text-gray-400, my-1.5, border-t, text-red-600,
 *   dark:text-red-400, opacity-40, cursor-not-allowed
 * NO scoped styles - must use global CSS for consistency with legacy
 */
</style>
