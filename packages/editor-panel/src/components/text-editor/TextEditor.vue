<script setup>
/**
 * TextEditor - Inline text editing overlay
 *
 * This component provides an inline contenteditable text editor that appears
 * when creating or editing text shapes. It matches the canvas text position
 * and styling exactly.
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { getEditorState } from '../../composables/useEditorState.js';

const { state, config } = getEditorState();

// Editor state
const visible = ref(false);
const editorRef = ref(null);
const canvasPos = ref({ x: 0, y: 0 });
const editingIndex = ref(-1);
const fontSize = ref(20);
const originalX = ref(0);
const textAlign = ref('left');

// Styling
const editorStyle = ref({});

// Track if we're editing a frame child
const editingFrameChild = ref(null);

/**
 * Show the text editor for a shape
 * @param {Object} shape - The text shape to edit
 * @param {number} editIndex - Index in shapes array (-1 for new text)
 * @param {Object} frameChildInfo - Optional frame child info { frameIndex, childIndex }
 */
function show(shape, editIndex = -1, frameChildInfo = null) {
  const editor = editorRef.value;
  if (!editor) return;

  const shapeFontSize = shape.fontSize || config?.text?.defaultSize || 20;
  const fontFamily = shape.fontFamily || config?.text?.defaultFont || 'Sans-serif';
  const align = shape.align || 'left';
  const rotation = shape.rotation || 0;
  const useColor = shape.color || state.currentColor;
  const lineHeight = shape.lineHeight || config?.text?.defaultLineHeight || 1.3;
  // Account for display scale in video mode
  const displayScale = state.canvasDisplayScale || 1;
  const scaledSize = shapeFontSize * state.zoom * displayScale;

  // Get the visual bounds of the text (accounts for alignment)
  let bounds = null;
  if (typeof window.getShapeBounds === 'function') {
    bounds = window.getShapeBounds(shape);
  }

  // Use bounds for visual position (left edge of text)
  const canvasX = bounds ? bounds.x : shape.x;
  const canvasY = bounds ? bounds.y : shape.y;

  // Store state
  canvasPos.value = { x: canvasX, y: canvasY };
  editingIndex.value = editIndex;
  fontSize.value = shapeFontSize;
  originalX.value = shape.x;
  textAlign.value = align;
  editingFrameChild.value = frameChildInfo;

  // Track editing index in state so renderer can skip this shape
  state.textEditingIndex = editIndex;
  if (frameChildInfo) {
    state.textEditingFrameChild = frameChildInfo;
  }

  // Calculate screen position
  // Use drawing-canvas which exists in both canvas and video modes
  const canvas = document.getElementById('drawing-canvas');
  const canvasRect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };

  // effectiveZoom combines zoom with display scale
  const effectiveZoom = state.zoom * displayScale;

  const calcScreenX = canvasX * effectiveZoom + state.panX * displayScale + canvasRect.left;
  const calcScreenY = canvasY * effectiveZoom + state.panY * displayScale + canvasRect.top;

  // Compensate for line-height top spacing so text aligns with canvas position
  const topOffset = (lineHeight - 1) * scaledSize / 2;

  // Build style
  const style = {
    display: 'block',
    left: calcScreenX + 'px',
    top: calcScreenY + 'px',
    fontSize: scaledSize + 'px',
    lineHeight: String(lineHeight),
    fontFamily: fontFamily,
    color: useColor,
    textAlign: align,
    marginTop: -topOffset + 'px',
    fontWeight: shape.bold ? 'bold' : 'normal',
    fontStyle: shape.italic ? 'italic' : 'normal',
    textDecoration: shape.underline ? 'underline' : 'none',
  };

  // For center/right aligned text, set initial width to match bounds
  if ((align === 'center' || align === 'right') && bounds && bounds.width > 0) {
    style.width = (bounds.width * effectiveZoom) + 'px';
  } else {
    style.width = 'auto';
  }

  // Apply rotation if needed
  if (rotation) {
    const rotationDeg = rotation * (180 / Math.PI);
    const boundsWidth = bounds ? bounds.width * effectiveZoom : 50;
    const boundsHeight = bounds ? bounds.height * effectiveZoom : scaledSize * 1.2;
    style.transformOrigin = `${boundsWidth / 2}px ${boundsHeight / 2}px`;
    style.transform = `rotate(${rotationDeg}deg)`;
  } else {
    style.transform = 'none';
    style.transformOrigin = '';
  }

  editorStyle.value = style;
  visible.value = true;

  // Set text content
  editor.innerText = shape.text || '';

  // Re-render to hide the shape being edited
  if (editIndex >= 0 || frameChildInfo) {
    if (typeof window.render === 'function') window.render();
  }

  // Focus and select text
  nextTick(() => {
    setTimeout(() => {
      editor.focus();
      if (shape.text) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 10);
  });
}

/**
 * Hide the text editor
 * @param {boolean} save - Whether to save the text
 */
function hide(save = false) {
  const editor = editorRef.value;
  if (!visible.value || !editor) return;

  const text = editor.innerText.trim();

  // Clear editing index so shape renders again
  state.textEditingIndex = -1;

  if (save && text) {
    // Check if editing a frame child
    if (editingFrameChild.value) {
      const { frameIndex, childIndex } = editingFrameChild.value;
      const frame = state.shapes[frameIndex];
      if (frame && frame.children && frame.children[childIndex]) {
        frame.children[childIndex].text = text;
        state.selectedFrameChildren = [{ frameIndex, childIndex }];
        state.selectedIndices = [];
      }
      state.textEditingFrameChild = null;
    } else if (editingIndex.value >= 0 && state.shapes[editingIndex.value]) {
      // Editing existing text - verify shape still exists
      state.shapes[editingIndex.value].text = text;
      state.selectedIndices = [editingIndex.value];
    } else if (editingIndex.value < 0) {
      // Creating new text
      const newShape = {
        id: typeof window.generateId === 'function' ? window.generateId() : Date.now().toString(36),
        type: 'text',
        name: 'Text',
        visible: true,
        x: canvasPos.value.x,
        y: canvasPos.value.y,
        text: text,
        color: state.currentColor,
        fontSize: fontSize.value,
        fontFamily: config?.text?.defaultFont || 'Sans-serif',
        lineHeight: state.currentLineHeight || config?.text?.defaultLineHeight || 1.3,
        opacity: state.currentOpacity
      };

      // In video mode, assign track and timing (same as other shapes in useInteractions.js)
      if (state.videoMode) {
        const startTime = state.currentTime || 0;
        const duration = config?.video?.defaultClipDuration || 5;

        // Find available track using the video state composable
        let trackId = 'track-1';
        if (typeof window.getVideoState === 'function') {
          const videoState = window.getVideoState();
          if (videoState && typeof videoState.findAvailableTrack === 'function') {
            trackId = videoState.findAvailableTrack(startTime, duration);
          }
        }

        newShape.trackId = trackId;
        newShape.startTime = startTime;
        newShape.duration = duration;
      }

      state.shapes.push(newShape);
      state.selectedIndices = [state.shapes.length - 1];

      // Update timeline in video mode
      if (state.videoMode) {
        if (typeof window.updateTimelineGroups === 'function') {
          window.updateTimelineGroups();
        }
        if (typeof window.updateTimelineItems === 'function') {
          window.updateTimelineItems();
        }
      }
    }
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.showOptionsBar === 'function') window.showOptionsBar();
  } else if (save && !text && editingIndex.value >= 0) {
    // Delete empty text
    state.shapes.splice(editingIndex.value, 1);
    state.selectedIndices = [];
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.hideOptionsBar === 'function') window.hideOptionsBar();
  } else if (save && !text && editingFrameChild.value) {
    // Delete empty frame child text
    const { frameIndex, childIndex } = editingFrameChild.value;
    const frame = state.shapes[frameIndex];
    if (frame && frame.children) {
      frame.children.splice(childIndex, 1);
    }
    state.textEditingFrameChild = null;
    state.selectedFrameChildren = [];
    if (typeof window.render === 'function') window.render();
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.hideOptionsBar === 'function') window.hideOptionsBar();
  } else {
    // Cancelled or empty new text - just re-render
    state.textEditingFrameChild = null;
    editingFrameChild.value = null;
    if (typeof window.render === 'function') window.render();
  }

  // Reset editor
  visible.value = false;
  editorStyle.value = {};
  editor.innerText = '';
  editingIndex.value = -1;
  editingFrameChild.value = null;

  // Always switch to select tool after text editing ends
  if (typeof window.setTool === 'function') {
    window.setTool('select');
  }
}

/**
 * Update editor position (called when canvas pans/zooms)
 */
function updatePosition() {
  if (!visible.value) return;

  const editor = editorRef.value;
  if (!editor) return;

  // Account for display scale in video mode
  const displayScale = state.canvasDisplayScale || 1;
  const scaledSize = fontSize.value * state.zoom * displayScale;
  const canvas = document.getElementById('drawing-canvas');
  const canvasRect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };

  const effectiveZoom = state.zoom * displayScale;
  const calcScreenX = canvasPos.value.x * effectiveZoom + state.panX * displayScale + canvasRect.left;
  const calcScreenY = canvasPos.value.y * effectiveZoom + state.panY * displayScale + canvasRect.top;

  editorStyle.value = {
    ...editorStyle.value,
    left: calcScreenX + 'px',
    top: calcScreenY + 'px',
    fontSize: scaledSize + 'px',
  };

  // Update size
  editor.style.height = 'auto';
  editor.style.height = Math.max(scaledSize * 1.2, editor.scrollHeight) + 'px';
  editor.style.width = 'auto';
  editor.style.width = Math.max(scaledSize, editor.scrollWidth + 4) + 'px';
}

// Handle input for auto-resize
function onInput() {
  const editor = editorRef.value;
  if (!editor) return;

  // Account for display scale in video mode
  const displayScale = state.canvasDisplayScale || 1;
  const scaledSize = fontSize.value * state.zoom * displayScale;
  const align = textAlign.value;

  editor.style.height = 'auto';
  editor.style.height = Math.max(scaledSize * 1.2, editor.scrollHeight) + 'px';

  // For center/right aligned, maintain at least the initial width
  if (align === 'center' || align === 'right') {
    const currentWidth = parseFloat(editorStyle.value.width) || 0;
    if (currentWidth > 0) {
      editor.style.width = Math.max(currentWidth, editor.scrollWidth + 4) + 'px';
    }
  } else {
    editor.style.width = 'auto';
    editor.style.width = Math.max(scaledSize, editor.scrollWidth + 4) + 'px';
  }

  // Trigger render to update recording canvas with live typing
  // This captures the typing animation in the recording output
  if (state.isRecording && typeof window.render === 'function') {
    window.render();
  }
}

// Handle keydown for escape/enter
function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    hide(false); // Cancel
  } else if (e.key === 'Enter' && !e.shiftKey) {
    // Allow shift+enter for newlines, enter alone saves
    // Actually, let's allow enter for newlines since it's a multi-line editor
  }
}

// Handle blur
function onBlur() {
  // Save on blur
  hide(true);
}

/**
 * Edit text at a specific shape index
 * Called by useInteractions.js on double-click
 * @param {number} index - The shape index in state.shapes
 */
function editTextAtIndex(index) {
  const shape = state.shapes[index];
  if (!shape || shape.type !== 'text') {
    console.warn('[TextEditor] editTextAtIndex: Invalid shape or not a text shape at index', index);
    return;
  }
  show(shape, index);
}

/**
 * Edit text for a frame child
 * @param {number} frameIndex - The frame shape index
 * @param {number} childIndex - The child index within the frame
 */
function editFrameChildText(frameIndex, childIndex) {
  const frame = state.shapes[frameIndex];
  if (!frame || frame.type !== 'frame' || !frame.children) {
    console.warn('[TextEditor] editFrameChildText: Invalid frame at index', frameIndex);
    return;
  }
  const child = frame.children[childIndex];
  if (!child || child.type !== 'text') {
    console.warn('[TextEditor] editFrameChildText: Invalid child or not a text shape');
    return;
  }
  show(child, -1, { frameIndex, childIndex });
}

// Expose methods globally for legacy code
onMounted(() => {
  // Primary names
  window.showTextEditor = show;
  window.hideTextEditor = hide;
  window.updateTextEditorPosition = updatePosition;
  // Edit helpers for double-click from useInteractions.js
  window.editTextAtIndex = editTextAtIndex;
  window.editFrameChildText = editFrameChildText;
  // Also expose with vue prefix for compatibility
  window.vueShowTextEditor = show;
  window.vueHideTextEditor = hide;
  window.vueUpdateTextEditorPosition = updatePosition;
});

onUnmounted(() => {
  delete window.showTextEditor;
  delete window.hideTextEditor;
  delete window.updateTextEditorPosition;
  delete window.editTextAtIndex;
  delete window.editFrameChildText;
  delete window.vueShowTextEditor;
  delete window.vueHideTextEditor;
  delete window.vueUpdateTextEditorPosition;
});

// Expose methods for parent component
defineExpose({ show, hide, updatePosition, editTextAtIndex, editFrameChildText });
</script>

<template>
  <div
    id="text-editor"
    ref="editorRef"
    contenteditable="true"
    :style="visible ? editorStyle : { display: 'none' }"
    @input="onInput"
    @keydown="onKeyDown"
    @blur="onBlur"
  ></div>
</template>

<style>
#text-editor {
  position: fixed;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-wrap: break-word;
  min-width: 1em;
  min-height: 1em;
  padding: 0;
  margin: 0;
  z-index: 1000;
  pointer-events: auto;
}

#text-editor:focus {
  /* outline: 2px solid var(--accent, #3b82f6); */
  outline-offset: 2px;
}
</style>
