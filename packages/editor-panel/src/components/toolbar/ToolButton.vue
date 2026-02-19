<script setup>
/**
 * ToolButton - A single toolbar button
 *
 * IMPORTANT: This component outputs the EXACT same HTML as the legacy
 * toolButton() function in core/toolbar.js:
 *
 * <button data-tool="${tool}" class="toolbar-btn ${activeClass} text-gray-600 dark:text-gray-300" title="${title} (${shortcut})">
 *   <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg>
 *   <span class="shortcut text-gray-400">${shortcut}</span>
 * </button>
 */
defineProps({
  tool: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  shortcut: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  },
  isToggle: {
    type: Boolean,
    default: false
  }
});

defineEmits(['click']);
</script>

<template>
  <button
    :data-toggle="isToggle ? tool : undefined"
    :data-tool="!isToggle ? tool : undefined"
    class="toolbar-btn text-gray-600 dark:text-gray-300"
    :class="{ active }"
    :title="shortcut ? `${title} (${shortcut})` : title"
    @click="$emit('click', tool)"
  >
    <svg
      class="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      v-html="icon"
    />
    <span v-if="shortcut" class="shortcut text-gray-400">{{ shortcut }}</span>
  </button>
</template>

<style>
/*
 * ToolButton uses global CSS classes from styles/index.css
 * Classes used: .toolbar-btn, .toolbar-btn.active, .shortcut
 * Tailwind: text-gray-600, dark:text-gray-300, text-gray-400
 * NO scoped styles - must use global CSS for consistency with legacy
 */
</style>
