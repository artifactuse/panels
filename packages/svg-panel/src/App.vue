<template>
  <div class="panel" :class="[themeClass, accentClass]">
    <!-- Toolbar -->
    <div class="toolbar">
      <button @click="zoomIn" class="btn btn-sm btn-icon btn-secondary" title="Zoom In">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
        </svg>
      </button>
      <button @click="zoomOut" class="btn btn-sm btn-icon btn-secondary" title="Zoom Out">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"/>
        </svg>
      </button>
      <button @click="resetZoom" class="btn btn-sm btn-secondary" title="Reset">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <span class="hidden sm:inline">{{ Math.round(zoom * 100) }}%</span>
      </button>
      <div class="h-4 w-px bg-line mx-1"></div>
      <button @click="toggleGrid" class="btn btn-sm btn-secondary" :class="{ 'bg-primary text-white': showGrid }">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9h16M4 15h16M9 4v16M15 4v16"/>
        </svg>
        <span class="hidden sm:inline">Grid</span>
      </button>
      <button @click="toggleDarkBg" class="btn btn-sm btn-secondary" :class="{ 'bg-primary text-white': darkBg }">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
        <span class="hidden sm:inline">Dark</span>
      </button>
      <div class="flex-1"></div>
      <button @click="copySvg" class="btn btn-sm btn-secondary">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span>{{ copyLabel }}</span>
      </button>
      <button @click="downloadSvg" class="btn btn-sm btn-primary">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        <span class="hidden sm:inline">Download</span>
      </button>
    </div>
    
    <!-- SVG Display -->
    <div 
      class="panel-content flex items-center justify-center overflow-auto"
      :class="darkBg ? 'bg-gray-900' : 'bg-white'"
      :style="showGrid ? gridStyle : ''"
      ref="container"
      @wheel.prevent="handleWheel"
    >
      <div 
        class="svg-container transition-transform duration-100"
        :style="{ transform: `scale(${zoom})` }"
        v-html="sanitizedSvg"
      ></div>
    </div>
    
    <!-- Info Bar -->
    <div class="px-3 py-2 bg-panel-surface border-t border-line text-xs text-txt-muted flex gap-4">
      <span v-if="svgSize">{{ svgSize.width }} × {{ svgSize.height }}</span>
      <span>{{ svgBytes }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { createBridge } from '@artifactuse/shared/bridge';
import { setAccentColor } from '@artifactuse/shared/theme';
import '@artifactuse/shared/styles.css';

const props = defineProps({
  svg: { type: String, default: '' },
  theme: { type: String, default: 'dark' },
  accent: { type: String, default: '' }
});

const currentTheme = ref(props.theme);
const currentAccent = ref(props.accent);
const rawSvg = ref(props.svg);
const zoom = ref(1);
const showGrid = ref(false);
const darkBg = ref(false);
const copyLabel = ref('Copy');
const container = ref(null);

const themeClass = computed(() => currentTheme.value === 'light' ? 'light' : '');
const accentClass = computed(() => currentAccent.value ? `accent-${currentAccent.value}` : '');

const sanitizedSvg = computed(() => {
  // Basic sanitization - remove script tags
  return rawSvg.value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
});

const svgSize = computed(() => {
  const match = rawSvg.value.match(/viewBox=["']([^"']+)["']/i);
  if (match) {
    const [, , w, h] = match[1].split(/\s+/);
    return { width: w, height: h };
  }
  const wMatch = rawSvg.value.match(/width=["'](\d+)/);
  const hMatch = rawSvg.value.match(/height=["'](\d+)/);
  if (wMatch && hMatch) return { width: wMatch[1], height: hMatch[1] };
  return null;
});

const svgBytes = computed(() => {
  const bytes = new Blob([rawSvg.value]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
});

const gridStyle = computed(() => ({
  backgroundImage: `
    linear-gradient(45deg, #80808020 25%, transparent 25%),
    linear-gradient(-45deg, #80808020 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #80808020 75%),
    linear-gradient(-45deg, transparent 75%, #80808020 75%)
  `,
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
}));

const ZOOM_STEP = 1.05; // 5% per step

function zoomIn() {
  zoom.value = Math.min(zoom.value * ZOOM_STEP, 5);
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / ZOOM_STEP, 0.1);
}
function resetZoom() { zoom.value = 1; }
function toggleGrid() { showGrid.value = !showGrid.value; }
function toggleDarkBg() { darkBg.value = !darkBg.value; }

function handleWheel(e) {
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
}

function copySvg() {
  navigator.clipboard.writeText(rawSvg.value).then(() => {
    copyLabel.value = 'Copied!';
    setTimeout(() => copyLabel.value = 'Copy', 1500);
  });
}

function downloadSvg() {
  const blob = new Blob([rawSvg.value], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'image.svg';
  a.click();
  URL.revokeObjectURL(url);
}

let bridge = null;

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('theme')) currentTheme.value = params.get('theme');
  const urlAccent = params.get('accent');
  if (urlAccent) { setAccentColor(urlAccent); currentAccent.value = urlAccent; }
  if (params.get('svg')) rawSvg.value = decodeURIComponent(params.get('svg'));
  
  if (!rawSvg.value && (import.meta.env?.DEV || window.location.hostname === 'localhost')) {
    import('@artifactuse/shared').then(mod => {
      if (mod.getMockData) {
        rawSvg.value = mod.getMockData('svg');
        console.log('[SVG Viewer] Loaded mock data');
      }
    }).catch(() => {});
  }
  
  bridge = createBridge({ debug: import.meta.env?.DEV });
  bridge.on('setSvg', (data) => { rawSvg.value = data; });
  bridge.on('setTheme', (t) => { currentTheme.value = typeof t === 'string' ? t : t.theme; });
  bridge.on('setAccent', (a) => { setAccentColor(a); currentAccent.value = a; });
  bridge.signalReady();
});

watch(() => props.svg, (v) => v && (rawSvg.value = v));
watch(() => props.theme, (t) => t && (currentTheme.value = t));
</script>

<style>
.svg-container :deep(svg) {
  max-width: 100%;
  max-height: 100%;
}
</style>
