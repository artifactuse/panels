<script setup>
/**
 * MCP Status Indicator
 * 
 * Shows connection status to the local MCP server.
 * Styled to match EditorToolbar buttons.
 * 
 * States:
 *   - Disconnected (gray dot)
 *   - Connecting (amber dot, pulsing)
 *   - Connected (green dot, glowing)
 *   - Error (red dot, glowing)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { mcpState, toggleMCP, connectMCP } from '@artifactuse/shared';

// Reactive refs (mcpState is plain object, not reactive)
const connected = ref(mcpState.connected);
const connecting = ref(mcpState.connecting);
const error = ref(mcpState.error);

function updateState() {
  connected.value = mcpState.connected;
  connecting.value = mcpState.connecting;
  error.value = mcpState.error;
}

onMounted(() => {
  window.addEventListener('artifactuse:mcp:connected', updateState);
  window.addEventListener('artifactuse:mcp:disconnected', updateState);
  window.addEventListener('artifactuse:mcp:connecting', updateState);
  window.addEventListener('artifactuse:mcp:error', updateState);
  updateState();
});

onUnmounted(() => {
  window.removeEventListener('artifactuse:mcp:connected', updateState);
  window.removeEventListener('artifactuse:mcp:disconnected', updateState);
  window.removeEventListener('artifactuse:mcp:connecting', updateState);
  window.removeEventListener('artifactuse:mcp:error', updateState);
});

const tooltip = computed(() => {
  if (connected.value) return 'MCP connected (click to disconnect)';
  if (connecting.value) return 'Connecting to MCP...';
  if (error.value) return `MCP error: ${error.value}`;
  return 'Connect to MCP';
});

const statusClass = computed(() => ({
  'mcp-connected': connected.value,
  'mcp-connecting': connecting.value && !connected.value,
  'mcp-error': error.value && !connected.value && !connecting.value,
}));

const dotClass = computed(() => ({
  'dot-connected': connected.value,
  'dot-connecting': connecting.value && !connected.value,
  'dot-error': error.value && !connected.value && !connecting.value,
  'dot-disconnected': !connected.value && !connecting.value && !error.value,
}));

function handleClick() {
  if (connected.value || connecting.value) {
    toggleMCP();
  } else {
    connectMCP();
  }
}
</script>

<template>
  <button
    class="toolbar-btn text-gray-600 dark:text-gray-300 mcp-status-btn"
    :class="statusClass"
    :title="tooltip"
    @click="handleClick"
  >

    <svg class="w-5 h-5" viewBox="0 0 64 64" fill="none">
        <path stroke="currentColor" stroke-linecap="round" stroke-width="4.312" d="M6.288 30.06 30.68 5.669a8.624 8.624 0 0 1 12.196 0v0a8.624 8.624 0 0 1 0 12.197l-18.42 18.421"></path>
        <path stroke="currentColor" stroke-linecap="round" stroke-width="4.312" d="m24.71 36.032 18.166-18.167a8.624 8.624 0 0 1 12.197 0l.127.127a8.624 8.624 0 0 1 0 12.196l-22.061 22.06a2.874 2.874 0 0 0 0 4.066l4.53 4.53"></path>
        <path stroke="currentColor" stroke-linecap="round" stroke-width="4.312" d="m36.778 11.766-18.04 18.04a8.624 8.624 0 0 0 0 12.197v0a8.624 8.624 0 0 0 12.196 0l18.04-18.04"></path>
    </svg>
    <!-- Status dot overlay -->
    <span class="mcp-dot" :class="dotClass" />
  </button>
</template>

<style>
/* MCP Status button - builds on toolbar-btn */
.mcp-status-btn {
  position: relative;
}

/* Status dot - bottom-right of icon */
.mcp-dot {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  pointer-events: none;
  transition: all 0.2s ease;
}

.dark .mcp-dot {
  border-color: #1f2937;
}

/* Dot states */
.dot-connected {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.6);
}

.dot-connecting {
  background: #f59e0b;
  animation: mcp-pulse 1s infinite;
}

.dot-disconnected {
  background: #9ca3af;
}

.dot-error {
  background: #ef4444;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
}

/* Button color when connected */
.mcp-status-btn.mcp-connected {
  color: #22c55e !important;
}

.mcp-status-btn.mcp-connected:hover {
  color: #16a34a !important;
}

/* Button color when connecting */
.mcp-status-btn.mcp-connecting {
  color: #f59e0b !important;
}

/* Button color when error */
.mcp-status-btn.mcp-error {
  color: #ef4444 !important;
}

.mcp-status-btn.mcp-error:hover {
  color: #dc2626 !important;
}

@keyframes mcp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>