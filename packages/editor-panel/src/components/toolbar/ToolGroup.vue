<script setup>
/**
 * ToolGroup - A group of tools with dropdown menu
 *
 * IMPORTANT: This component outputs the EXACT same HTML as the legacy
 * toolbar.js tool group pattern:
 *
 * <div class="tool-group" data-group="${groupName}">
 *   <button data-tool="${tool}" class="toolbar-btn tool-group-btn text-gray-600 dark:text-gray-300" title="${title} (${shortcut})">
 *     <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg>
 *     <svg class="group-indicator" viewBox="0 0 6 4"><path d="M0 0l3 4 3-4z" fill="currentColor"/></svg>
 *   </button>
 *   <div class="tool-group-dropdown">
 *     <button data-tool="${tool}" class="tool-group-item" title="${title} (${shortcut})">
 *       <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg>
 *       <span class="tool-name">${title}</span>
 *       <span class="tool-shortcut">${shortcut}</span>
 *     </button>
 *     ...
 *   </div>
 * </div>
 *
 * For FX group (video mode), the dropdown is categorized:
 * <div class="tool-group-dropdown fx-dropdown">
 *   <div class="fx-section-label">Effects</div>
 *   <button data-fx="effect-..." class="tool-group-item fx-item">...</button>
 *   <div class="fx-section-label">Filters</div>
 *   <button data-fx="filter-..." class="tool-group-item fx-item">...</button>
 *   <div class="fx-section-label">Transitions</div>
 *   <button data-fx="transition-..." class="tool-group-item fx-item">...</button>
 * </div>
 *
 * NOTE: Legacy dropdown shows on CSS :hover (.tool-group:hover .tool-group-dropdown)
 * We match this by NOT using v-show - the dropdown visibility is controlled by CSS hover
 */
import { computed } from 'vue';

const props = defineProps({
  groupName: {
    type: String,
    required: true
  },
  tools: {
    type: Array,
    required: true
    // Each tool: { id, name, shortcut, icon, type? }
    // For FX tools, type is 'effect', 'filter', or 'transition'
  },
  activeTool: {
    type: String,
    default: ''
  },
  // Custom icon for the group button (used for FX group)
  groupIcon: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['select']);

// Check if this is an FX group (has categorized tools)
const isFxGroup = computed(() => props.groupName === 'fx');

// Group FX tools by type (effects, filters, transitions)
const categorizedTools = computed(() => {
  if (!isFxGroup.value) return null;

  const effects = props.tools.filter(t => t.type === 'effect');
  const filters = props.tools.filter(t => t.type === 'filter');
  const transitions = props.tools.filter(t => t.type === 'transition');

  return { effects, filters, transitions };
});

// Find the active tool in this group, or use the first one
function getActiveInGroup() {
  const found = props.tools.find(t => t.id === props.activeTool);
  return found || props.tools[0];
}

function selectTool(toolId) {
  emit('select', toolId);
}

// Get the button icon - use groupIcon if provided (for FX), otherwise active tool's icon
function getButtonIcon() {
  if (props.groupIcon) return props.groupIcon;
  return getActiveInGroup()?.icon || '';
}

// Get the button title
function getButtonTitle() {
  if (isFxGroup.value) return 'Effects & Filters';
  const active = getActiveInGroup();
  return `${active?.name || ''}${active?.shortcut ? ` (${active.shortcut})` : ''}`;
}
</script>

<template>
  <div class="tool-group" :data-group="groupName">
    <button
      :data-tool="isFxGroup ? 'fx' : getActiveInGroup()?.id"
      class="toolbar-btn tool-group-btn text-gray-600 dark:text-gray-300"
      :title="getButtonTitle()"
    >
      <svg
        class="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        v-html="getButtonIcon()"
      />
      <svg class="group-indicator" viewBox="0 0 6 4">
        <path d="M0 0l3 4 3-4z" fill="currentColor" />
      </svg>
    </button>

    <!-- FX group dropdown with categories -->
    <div v-if="isFxGroup" class="tool-group-dropdown fx-dropdown">
      <!-- Effects section -->
      <template v-if="categorizedTools.effects.length > 0">
        <div class="fx-section-label">Effects</div>
        <button
          v-for="tool in categorizedTools.effects"
          :key="tool.id"
          :data-fx="tool.id"
          class="tool-group-item fx-item"
          :title="tool.name"
          @click="selectTool(tool.id)"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            v-html="tool.icon"
          />
          <span class="tool-name">{{ tool.name }}</span>
        </button>
      </template>

      <!-- Filters section -->
      <template v-if="categorizedTools.filters.length > 0">
        <div class="fx-section-label">Filters</div>
        <button
          v-for="tool in categorizedTools.filters"
          :key="tool.id"
          :data-fx="tool.id"
          class="tool-group-item fx-item"
          :title="tool.name"
          @click="selectTool(tool.id)"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            v-html="tool.icon"
          />
          <span class="tool-name">{{ tool.name }}</span>
        </button>
      </template>

      <!-- Transitions section -->
      <template v-if="categorizedTools.transitions.length > 0">
        <div class="fx-section-label">Transitions</div>
        <button
          v-for="tool in categorizedTools.transitions"
          :key="tool.id"
          :data-fx="tool.id"
          class="tool-group-item fx-item"
          :title="tool.name"
          @click="selectTool(tool.id)"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            v-html="tool.icon"
          />
          <span class="tool-name">{{ tool.name }}</span>
        </button>
      </template>
    </div>

    <!-- Regular tool group dropdown -->
    <div v-else class="tool-group-dropdown">
      <button
        v-for="tool in tools"
        :key="tool.id"
        :data-tool="tool.id"
        class="tool-group-item"
        :title="`${tool.name}${tool.shortcut ? ` (${tool.shortcut})` : ''}`"
        @click="selectTool(tool.id)"
      >
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          v-html="tool.icon"
        />
        <span class="tool-name">{{ tool.name }}</span>
        <span class="tool-shortcut">{{ tool.shortcut }}</span>
      </button>
    </div>
  </div>
</template>

<style>
/*
 * ToolGroup uses global CSS classes from styles/index.css
 * Classes used:
 *   .tool-group - container with position: relative
 *   .toolbar-btn, .tool-group-btn - main button styling
 *   .group-indicator - small arrow indicator
 *   .tool-group-dropdown - dropdown container (hidden by default, shown on :hover)
 *   .tool-group-item - dropdown item styling
 *   .tool-name, .tool-shortcut - text styling in dropdown
 *
 * FX group specific classes:
 *   .fx-dropdown - scrollable dropdown (max-height: 400px, overflow-y: auto)
 *   .fx-section-label - category headers (Effects, Filters, Transitions)
 *   .fx-item - FX tool items (uses data-fx instead of data-tool)
 *
 * Tailwind: text-gray-600, dark:text-gray-300
 * NO scoped styles - dropdown visibility controlled by global CSS hover rule
 */
</style>
