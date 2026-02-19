<script setup>
/**
 * LayersPanel - Displays list of shapes/layers with visibility and reordering
 *
 * IMPORTANT: This component outputs the EXACT same HTML as getLayersPanelHTML()
 * in core/layers.js:
 *
 * <div id="layers-panel" class="popup-panel w-64">
 *   <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
 *     <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Layers</span>
 *     <div class="flex gap-1">
 *       <button id="layer-up" class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" title="Move Up">...</button>
 *       <button id="layer-down" class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" title="Move Down">...</button>
 *     </div>
 *   </div>
 *   <div id="layers-list" class="max-h-80 overflow-y-auto p-2">
 *     <!-- Layer items rendered dynamically -->
 *   </div>
 * </div>
 *
 * Layer item structure (from renderLayersList):
 * <div class="layer-item flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selected/hover classes}" draggable="true" data-layer-index="${i}">
 *   <div class="drag-handle text-gray-300 dark:text-gray-600 cursor-grab">...</div>
 *   <button class="layer-vis p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400" data-index="${i}">...</button>
 *   <div class="text-gray-400"><!-- shape icon --></div>
 *   <span class="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">${name}</span>
 * </div>
 */
import { ref, computed } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';

const { state, selectShape } = getEditorState();

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

defineEmits(['close']);

// Explicit computed for class binding
const panelClasses = computed(() => ({
  visible: props.visible
}));

// Drag and drop state
const draggedIndex = ref(-1);
const dropTargetIndex = ref(-1);

// Flatten shapes with their children for display
// Frames and groups show their children indented below them
const layers = computed(() => {
  const result = [];

  function addShapeAndChildren(shape, index, depth = 0, parentIndex = null, childIndex = null) {
    const isTopLevel = depth === 0;
    const isSelected = isTopLevel
      ? state.selectedIndices.includes(index)
      : state.selectedFrameChildren?.some(fc =>
          fc.parentIndex === parentIndex && fc.childIndex === childIndex
        );

    result.push({
      shape,
      index: isTopLevel ? index : parentIndex,
      childIndex: isTopLevel ? null : childIndex,
      depth,
      isSelected,
      isHidden: shape.visible === false,
      isExpanded: shape.isExpanded !== false, // Default to expanded
      hasChildren: (shape.type === 'frame' || shape.type === 'group') && shape.children?.length > 0
    });

    // Add children if expanded
    if ((shape.type === 'frame' || shape.type === 'group') && shape.children?.length > 0 && shape.isExpanded !== false) {
      shape.children.forEach((child, ci) => {
        addShapeAndChildren(child, index, depth + 1, index, ci);
      });
    }
  }

  // Process all top-level shapes in reverse order (top layer first)
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    addShapeAndChildren(state.shapes[i], i);
  }

  return result;
});

// Get shape name - matches legacy getShapeName()
function getShapeName(shape) {
  if (shape.name) return shape.name;
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
    frame: 'Frame',
    freehand: 'Drawing',
    path: 'Path',
    group: 'Group'
  };
  return typeNames[shape.type] || 'Shape';
}

// Get shape icon - matches legacy getShapeIcon()
function getShapeIcon(type) {
  const icons = {
    rect: '<rect x="3" y="3" width="18" height="18" rx="2"></rect>',
    ellipse: '<ellipse cx="12" cy="12" rx="10" ry="7"></ellipse>',
    diamond: '<path d="M12 2L22 12L12 22L2 12L12 2z"></path>',
    triangle: '<path d="M12 3L22 21H2L12 3z"></path>',
    line: '<line x1="5" y1="19" x2="19" y2="5"></line>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
    text: '<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    video: '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>',
    audio: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    frame: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line>',
    freehand: '<path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>',
    path: '<path d="M3 17c3.5-3.5 7-6 10.5-6s7 2.5 7.5 6"></path>',
    group: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>'
  };
  return icons[type] || '<circle cx="12" cy="12" r="8"></circle>';
}

function handleLayerClick(layer, event) {
  // Don't handle click if it was on visibility button, drag handle, or expand button
  if (event.target.closest('.layer-vis') || event.target.closest('.drag-handle') || event.target.closest('.expand-toggle')) {
    return;
  }

  const { index, childIndex, depth } = layer;

  if (depth > 0 && childIndex !== null) {
    // Clicking on a child item - select frame child
    state.selectedIndices = [];
    state.selectedFrameChildren = [{ parentIndex: index, childIndex }];
  } else {
    // Top-level shape selection
    state.selectedFrameChildren = [];

    if (event.shiftKey && state.selectedIndices.length > 0) {
      // Range selection
      const last = state.selectedIndices[state.selectedIndices.length - 1];
      const start = Math.min(last, index);
      const end = Math.max(last, index);
      for (let i = start; i <= end; i++) {
        if (!state.selectedIndices.includes(i)) {
          state.selectedIndices.push(i);
        }
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      const idx = state.selectedIndices.indexOf(index);
      if (idx >= 0) {
        state.selectedIndices.splice(idx, 1);
      } else {
        state.selectedIndices.push(index);
      }
    } else {
      // Single selection
      state.selectedIndices = [index];
    }
  }

  // Trigger render
  if (typeof window.render === 'function') {
    window.render();
  }

  // Show/hide options bar
  const hasSelection = state.selectedIndices.length > 0 || state.selectedFrameChildren?.length > 0;
  if (hasSelection) {
    if (typeof window.showOptionsBar === 'function') {
      window.showOptionsBar();
    }
  } else {
    if (typeof window.hideOptionsBar === 'function') {
      window.hideOptionsBar();
    }
  }
}

function toggleExpand(layer) {
  const shape = layer.depth === 0
    ? state.shapes[layer.index]
    : state.shapes[layer.index]?.children?.[layer.childIndex];

  if (shape && (shape.type === 'frame' || shape.type === 'group')) {
    shape.isExpanded = shape.isExpanded === false ? true : false;
  }
}

function toggleVisibility(layer) {
  // Get the correct shape - either top-level or child
  let shape;
  if (layer.depth === 0) {
    // Top-level shape
    shape = state.shapes[layer.index];
  } else {
    // Child of a frame or group
    const parent = state.shapes[layer.index];
    if (parent && parent.children && layer.childIndex !== null) {
      shape = parent.children[layer.childIndex];
    }
  }

  if (!shape) return;

  shape.visible = shape.visible === false ? true : false;

  // Handle media elements for video/audio
  if (shape.type === 'video' || shape.type === 'audio') {
    let mediaElement = shape.videoElement || shape.audioElement;
    if (!mediaElement && shape.id && typeof window.getMediaElement === 'function') {
      mediaElement = window.getMediaElement(shape.id);
    }
    if (mediaElement) {
      if (!shape.visible) {
        mediaElement.muted = true;
        if (!mediaElement.paused) {
          mediaElement.pause();
        }
      } else {
        mediaElement.muted = false;
      }
    }
  }

  if (typeof window.render === 'function') {
    window.render();
  }
}

function moveLayerUp() {
  if (state.selectedIndices.length !== 1) return;
  const index = state.selectedIndices[0];
  if (index >= state.shapes.length - 1) return;

  const shape = state.shapes.splice(index, 1)[0];
  state.shapes.splice(index + 1, 0, shape);
  state.selectedIndices = [index + 1];

  if (typeof window.render === 'function') {
    window.render();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

function moveLayerDown() {
  if (state.selectedIndices.length !== 1) return;
  const index = state.selectedIndices[0];
  if (index <= 0) return;

  const shape = state.shapes.splice(index, 1)[0];
  state.shapes.splice(index - 1, 0, shape);
  state.selectedIndices = [index - 1];

  if (typeof window.render === 'function') {
    window.render();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

// Drag and drop handlers
function onDragStart(index, event) {
  draggedIndex.value = index;
  event.target.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', index.toString());
}

function onDragEnd(event) {
  event.target.classList.remove('dragging');
  clearDropIndicators();
  draggedIndex.value = -1;
  dropTargetIndex.value = -1;
}

function onDragOver(index, event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  if (draggedIndex.value === -1 || draggedIndex.value === index) return;

  const item = event.target.closest('.layer-item');
  if (!item) return;

  const rect = item.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;

  clearDropIndicators();

  if (event.clientY < midY) {
    item.classList.add('drop-above');
    dropTargetIndex.value = index;
  } else {
    item.classList.add('drop-below');
    dropTargetIndex.value = index - 1;
  }
}

function onDragLeave(event) {
  event.target.closest('.layer-item')?.classList.remove('drop-above', 'drop-below');
}

function onDrop(event) {
  event.preventDefault();
  clearDropIndicators();

  if (draggedIndex.value === -1 || draggedIndex.value === dropTargetIndex.value) return;

  reorderLayer(draggedIndex.value, dropTargetIndex.value);
}

function clearDropIndicators() {
  document.querySelectorAll('.layer-item').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
}

function reorderLayer(fromIndex, toIndex) {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= state.shapes.length) return;

  const shape = state.shapes.splice(fromIndex, 1)[0];

  if (fromIndex < toIndex) {
    toIndex--;
  }

  state.shapes.splice(toIndex + 1, 0, shape);

  // Update selected indices
  if (state.selectedIndices.includes(fromIndex)) {
    state.selectedIndices = state.selectedIndices.map(idx => {
      if (idx === fromIndex) return toIndex + (fromIndex < toIndex ? 0 : 1);
      if (fromIndex < toIndex) {
        if (idx > fromIndex && idx <= toIndex) return idx - 1;
      } else {
        if (idx >= toIndex + 1 && idx < fromIndex) return idx + 1;
      }
      return idx;
    });
  }

  if (typeof window.render === 'function') {
    window.render();
  }
  if (typeof window.saveState === 'function') {
    window.saveState();
  }
}

// Get layer item classes - matches legacy renderLayersList()
function getLayerItemClasses(isSelected, isHidden) {
  const base = 'layer-item flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors';
  const selectedClass = isSelected
    ? 'bg-accent/10 border border-accent/30'
    : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent';
  const hiddenClass = isHidden ? 'opacity-50' : '';
  return `${base} ${selectedClass} ${hiddenClass}`;
}
</script>

<template>
  <!-- EXACT same structure as legacy getLayersPanelHTML() -->
  <div id="layers-panel" class="popup-panel w-64" :class="panelClasses">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Layers</span>
      <div class="flex gap-1">
        <button
          id="layer-up"
          class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Move Up"
          @click="moveLayerUp"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
        <button
          id="layer-down"
          class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Move Down"
          @click="moveLayerDown"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
    <div id="layers-list" class="max-h-80 overflow-y-auto p-2">
      <!-- Empty state -->
      <div
        v-if="layers.length === 0"
        class="text-center text-sm text-gray-400 dark:text-gray-500 py-4"
      >
        No layers yet
      </div>

      <!-- Layer items - with support for nested children -->
      <div
        v-for="layer in layers"
        :key="layer.shape.id || `${layer.index}-${layer.childIndex}`"
        :class="getLayerItemClasses(layer.isSelected, layer.isHidden)"
        :style="{ paddingLeft: `${12 + layer.depth * 16}px` }"
        :draggable="layer.depth === 0"
        :data-layer-index="layer.index"
        :data-child-index="layer.childIndex"
        @click="handleLayerClick(layer, $event)"
        @dragstart="layer.depth === 0 && onDragStart(layer.index, $event)"
        @dragend="onDragEnd"
        @dragover="layer.depth === 0 && onDragOver(layer.index, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <!-- Expand/collapse toggle for frames and groups -->
        <button
          v-if="layer.hasChildren"
          class="expand-toggle p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400"
          @click.stop="toggleExpand(layer)"
        >
          <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-90': layer.isExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div v-else-if="layer.depth > 0" class="w-4"></div>

        <!-- Drag handle (only for top-level items) -->
        <div v-if="layer.depth === 0" class="drag-handle text-gray-300 dark:text-gray-600 cursor-grab">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        <button
          class="layer-vis p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400"
          :data-index="layer.index"
          @click.stop="toggleVisibility(layer)"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <template v-if="layer.isHidden">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </template>
            <template v-else>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </template>
          </svg>
        </button>

        <div class="text-gray-400">
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            v-html="getShapeIcon(layer.shape.type)"
          />
        </div>

        <span class="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
          {{ layer.shape.name || getShapeName(layer.shape) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style>
/*
 * LayersPanel uses global CSS classes from styles/index.css
 * Classes used:
 *   .popup-panel - panel base styling
 *   .layer-item - layer row styling (includes drag states)
 *   .drag-handle - drag handle styling
 *   .layer-vis - visibility button styling
 * Tailwind classes used for exact match with legacy:
 *   w-64, px-4, py-3, border-b, border-gray-200, dark:border-gray-700,
 *   flex, items-center, justify-between, gap-1, gap-2, p-1.5, p-1, p-2,
 *   rounded, rounded-lg, hover:bg-gray-100, dark:hover:bg-gray-700,
 *   text-gray-500, dark:text-gray-400, text-gray-300, dark:text-gray-600,
 *   text-gray-400, text-gray-700, dark:text-gray-200, max-h-80,
 *   overflow-y-auto, cursor-pointer, cursor-grab, transition-colors,
 *   opacity-50, text-sm, font-semibold, truncate, flex-1
 * NO scoped styles - must use global CSS for consistency with legacy
 */
</style>
