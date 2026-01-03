<template>
  <div class="panel font-mono text-sm" :class="[themeClass, accentClass]">
    <!-- Toolbar -->
    <div class="toolbar">
      <button @click="expandAll" class="btn btn-sm btn-secondary" title="Expand All">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
        </svg>
        <span class="hidden sm:inline">Expand</span>
      </button>
      <button @click="collapseAll" class="btn btn-sm btn-secondary" title="Collapse All">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"/>
        </svg>
        <span class="hidden sm:inline">Collapse</span>
      </button>
      <button @click="copyAll" class="btn btn-sm btn-primary" title="Copy JSON">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span>{{ copyLabel }}</span>
      </button>
      <input 
        v-model="searchQuery" 
        type="text" 
        class="input flex-1 min-w-[120px] max-w-[200px]" 
        placeholder="Search..."
        @input="onSearch"
      />
      <span class="text-xs text-txt-muted ml-auto hidden md:block">{{ statsText }}</span>
    </div>
    
    <!-- Tree -->
    <div class="panel-content">
      <div v-if="parseError" class="p-4 bg-error/10 border border-error/30 rounded-panel text-error">
        <div class="font-semibold mb-2">JSON Parse Error</div>
        <pre class="text-sm whitespace-pre-wrap">{{ parseError }}</pre>
      </div>
      <div v-else>
        <JsonNode 
          :data="parsedData" 
          :path="[]" 
          :search="searchQuery"
          :expandedPaths="expandedPaths"
          @toggle="togglePath"
          @copy="copyPath"
        />
      </div>
    </div>
    
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { createBridge } from '@artifactuse/shared/bridge';
import { setAccentColor } from '@artifactuse/shared/theme';
import JsonNode from './components/JsonNode.vue';
import '@artifactuse/shared/styles.css';

const props = defineProps({
  json: { type: String, default: '' },
  theme: { type: String, default: 'dark' },
  accent: { type: String, default: '' }
});

const currentTheme = ref(props.theme);
const currentAccent = ref(props.accent);
const rawJson = ref(props.json);
const searchQuery = ref('');
const expandedPaths = ref(new Set(['']));
const copyLabel = ref('Copy');
const parsedData = ref(null);
const parseError = ref(null);

const themeClass = computed(() => currentTheme.value === 'light' ? 'light' : '');
const accentClass = computed(() => currentAccent.value ? `accent-${currentAccent.value}` : '');

function parseJson(str) {
  try {
    parsedData.value = JSON.parse(str);
    parseError.value = null;
  } catch (e) {
    parseError.value = e.message;
    parsedData.value = null;
  }
}

const statsText = computed(() => {
  if (!parsedData.value) return '';
  const stats = countNodes(parsedData.value);
  const parts = [];
  if (stats.objects) parts.push(`${stats.objects} obj`);
  if (stats.arrays) parts.push(`${stats.arrays} arr`);
  if (stats.strings) parts.push(`${stats.strings} str`);
  if (stats.numbers) parts.push(`${stats.numbers} num`);
  return parts.join(' · ');
});

function countNodes(value, counts = { objects: 0, arrays: 0, strings: 0, numbers: 0 }) {
  const type = getType(value);
  if (type === 'object') { counts.objects++; Object.values(value).forEach(v => countNodes(v, counts)); }
  else if (type === 'array') { counts.arrays++; value.forEach(v => countNodes(v, counts)); }
  else if (type === 'string') counts.strings++;
  else if (type === 'number') counts.numbers++;
  return counts;
}

function getType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function togglePath(pathStr) {
  if (expandedPaths.value.has(pathStr)) expandedPaths.value.delete(pathStr);
  else expandedPaths.value.add(pathStr);
  expandedPaths.value = new Set(expandedPaths.value);
}

function expandAll() {
  const paths = new Set(['']);
  collectAllPaths(parsedData.value, '', paths);
  expandedPaths.value = paths;
}

function collectAllPaths(value, path, paths) {
  const type = getType(value);
  if (type === 'object') {
    Object.keys(value).forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      paths.add(newPath);
      collectAllPaths(value[key], newPath, paths);
    });
  } else if (type === 'array') {
    value.forEach((item, index) => {
      const newPath = path ? `${path}.${index}` : String(index);
      paths.add(newPath);
      collectAllPaths(item, newPath, paths);
    });
  }
}

function collapseAll() { expandedPaths.value = new Set(['']); }

function copyAll() {
  navigator.clipboard.writeText(JSON.stringify(parsedData.value, null, 2)).then(() => {
    copyLabel.value = 'Copied!';
    setTimeout(() => copyLabel.value = 'Copy', 1500);
  });
}

function copyPath(pathStr) {
  const value = getValueByPath(parsedData.value, pathStr);
  navigator.clipboard.writeText(JSON.stringify(value, null, 2));
}

function getValueByPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

function onSearch() {
  if (!searchQuery.value) return;
  const paths = new Set(['']);
  searchPaths(parsedData.value, '', searchQuery.value.toLowerCase(), paths);
  const allPaths = new Set(paths);
  paths.forEach(p => {
    let current = '';
    p.split('.').forEach(part => {
      current = current ? `${current}.${part}` : part;
      allPaths.add(current);
    });
  });
  expandedPaths.value = allPaths;
}

function searchPaths(value, path, query, paths) {
  const type = getType(value);
  if (type === 'object') {
    Object.keys(value).forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      if (key.toLowerCase().includes(query)) paths.add(newPath);
      searchPaths(value[key], newPath, query, paths);
    });
  } else if (type === 'array') {
    value.forEach((item, index) => searchPaths(item, path ? `${path}.${index}` : String(index), query, paths));
  } else if (type === 'string' && value.toLowerCase().includes(query)) paths.add(path);
  else if (String(value).toLowerCase().includes(query)) paths.add(path);
}

let bridge = null;

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('theme')) currentTheme.value = params.get('theme');
  const urlAccent = params.get('accent');
  if (urlAccent) { setAccentColor(urlAccent); currentAccent.value = urlAccent; }
  if (params.get('json')) rawJson.value = decodeURIComponent(params.get('json'));
  
  if (!rawJson.value && (import.meta.env?.DEV || window.location.hostname === 'localhost')) {
    import('@artifactuse/shared').then(mod => {
      if (mod.getMockData) {
        rawJson.value = JSON.stringify(mod.getMockData('json'));
        parseJson(rawJson.value);
        console.log('[JSON Viewer] Loaded mock data');
      }
    }).catch(() => {});
  }
  
  if (rawJson.value) parseJson(rawJson.value);
  
  bridge = createBridge({ debug: import.meta.env?.DEV });
  bridge.on('setJson', (data) => { rawJson.value = data; parseJson(data); });
  bridge.on('setTheme', (t) => { currentTheme.value = typeof t === 'string' ? t : t.theme; });
  bridge.on('setAccent', (a) => { setAccentColor(a); currentAccent.value = a; });
  bridge.signalReady();
});

watch(() => props.json, (v) => v && parseJson(rawJson.value = v));
watch(() => props.theme, (t) => t && (currentTheme.value = t));
</script>
