<script setup>
/**
 * CanvasWrapper - The main drawing canvas container
 *
 * Replaces getCanvasWrapperHTML() from core/toolbar.js
 * Renders the canvas element and wrapper div.
 *
 * The canvas must be mounted early and call setupCanvas() to initialize
 * the global canvas references (window.canvas, window.ctx, window.wrapper).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getEditorState, setupCanvas } from '../../composables/useEditorState.js';

const { state } = getEditorState();

const emit = defineEmits(['canvas-ready']);

// Refs for canvas elements
const wrapperRef = ref(null);
const canvasRef = ref(null);

// Compute wrapper class based on current tool
const wrapperClass = computed(() => {
  const tool = state.currentTool || 'select';
  return `mode-${tool}`;
});

// Set up canvas when mounted
onMounted(() => {
  // Call setupCanvas to initialize global refs (window.canvas, window.ctx, window.wrapper)
  const result = setupCanvas();

  if (result) {
    emit('canvas-ready', result);
  }
});
</script>

<template>
  <div
    ref="wrapperRef"
    id="canvas-wrapper"
    :class="wrapperClass"
  >
    <canvas ref="canvasRef" id="drawing-canvas"></canvas>
  </div>
</template>

<style scoped>
/* Styles are in styles/index.css - #canvas-wrapper and #drawing-canvas */
</style>
