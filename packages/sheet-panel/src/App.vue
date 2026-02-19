<template>
  <div class="panel font-mono text-sm" :class="[themeClass, accentClass]">
    <!-- Error -->
    <div v-if="parseError" class="p-4 bg-error/10 border border-error/30 rounded-panel text-error">
      <div class="font-semibold mb-2">CSV Parse Error</div>
      <pre class="text-sm whitespace-pre-wrap">{{ parseError }}</pre>
    </div>

    <!-- Spreadsheet -->
    <div class="sheet-container" ref="sheetContainer"></div>

    <!-- Loading -->
    <div v-if="!hasData && !parseError" class="loading">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { createBridge, setupArtifactListeners } from '@artifactuse/shared';
import { setAccentColor } from '@artifactuse/shared/theme';
import Papa from 'papaparse';
import jspreadsheet from 'jspreadsheet-ce';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jsuites/dist/jsuites.css';
import '@artifactuse/shared/styles.css';

const props = defineProps({
  csv: { type: String, default: '' },
  theme: { type: String, default: 'dark' },
  accent: { type: String, default: '' }
});

// Reactive state
const currentTheme = ref(props.theme);
const currentAccent = ref(props.accent);
const rawCsv = ref(props.csv);
const parseError = ref(null);
const hasData = ref(false);
const sheetContainer = ref(null);
const columnHeaders = ref([]);

// jspreadsheet instance (not reactive)
let sheetInstance = null;
let currentArtifactId = null;

// Theme
const themeClass = computed(() => currentTheme.value === 'light' ? 'light' : '');
const accentClass = computed(() => currentAccent.value ? `accent-${currentAccent.value}` : '');


// Parse CSV with PapaParse
function parseCsv(str) {
  if (!str?.trim()) {
    parseError.value = null;
    hasData.value = false;
    destroySpreadsheet();
    return;
  }

  const result = Papa.parse(str.trim(), {
    header: false,
    skipEmptyLines: true,
    delimitersToGuess: [',', '\t', '|', ';'],
  });

  if (result.errors?.length && !result.data?.length) {
    parseError.value = result.errors[0]?.message || 'Failed to parse CSV';
    hasData.value = false;
    destroySpreadsheet();
    return;
  }

  parseError.value = null;

  const data = result.data;
  if (data.length === 0) {
    hasData.value = false;
    destroySpreadsheet();
    return;
  }

  // First row = headers, rest = data
  const headers = data[0].map(String);
  const rows = data.slice(1).map(r => r.map(String));

  columnHeaders.value = headers;
  hasData.value = true;

  nextTick(() => {
    createSpreadsheet(headers, rows);
  });
}


// Create jspreadsheet instance
function createSpreadsheet(headers, data) {
  destroySpreadsheet();

  if (!sheetContainer.value) return;

  const columns = headers.map(h => ({
    type: 'text',
    title: h,
    width: 120,
  }));

  sheetInstance = jspreadsheet(sheetContainer.value, {
    data: data.length > 0 ? data : [[]],
    columns: columns,
    columnSorting: true,
    columnDrag: true,
    columnResize: true,
    search: false,
    pagination: false,
    editable: true,
    allowInsertRow: true,
    allowDeleteRow: true,
    allowInsertColumn: false,
    tableOverflow: true,
    tableWidth: '100%',
    tableHeight: '100vh',
    onchange: handleCellChange,
  });
}

function destroySpreadsheet() {
  if (sheetInstance && sheetContainer.value) {
    try {
      jspreadsheet.destroy(sheetContainer.value);
    } catch (e) {
      // Ignore destroy errors
    }
    sheetInstance = null;
  }
}


// Debounced auto-save
let saveTimeout = null;

function handleCellChange() {
  if (!sheetInstance || !bridge) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const data = sheetInstance.getData();
    const csvString = Papa.unparse({ fields: columnHeaders.value, data });
    bridge.send('edit:save', { artifactId: currentArtifactId, code: csvString });
  }, 500);
}


// Bridge
let bridge = null;

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('theme')) currentTheme.value = params.get('theme');
  const urlAccent = params.get('accent');
  if (urlAccent) { setAccentColor(urlAccent); currentAccent.value = urlAccent; }
  if (params.get('csv')) rawCsv.value = decodeURIComponent(params.get('csv'));

  if (rawCsv.value) parseCsv(rawCsv.value);

  bridge = createBridge({ debug: import.meta.env?.DEV });

  setupArtifactListeners({
    type: 'csv',
    acceptedLanguages: ['csv', 'tsv'],
    bridge,
    onArtifact: (artifact) => {
      currentArtifactId = artifact.id;
      rawCsv.value = artifact.code;
      parseCsv(artifact.code);
      return true;
    },
  });

  bridge.signalReady();
});

onUnmounted(() => {
  clearTimeout(saveTimeout);
  destroySpreadsheet();
  bridge?.destroy();
});

watch(() => props.csv, (v) => v && parseCsv(rawCsv.value = v));
watch(() => props.theme, (t) => t && (currentTheme.value = t));
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

@keyframes artifactuse-spin {
  to { transform: rotate(360deg); }
}

.loading {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(249, 250, 251, 0.85);
  z-index: 5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(17, 24, 39, 0.1);
  border-top-color: rgb(99, 102, 241);
  border-radius: 50%;
  animation: artifactuse-spin 0.8s linear infinite;
}

.sheet-container {
  width: 100%;
  height: 100vh;
  overflow: auto;
}

/* ===== jspreadsheet Dark Theme Overrides ===== */

/* Default is dark */
.jexcel_content {
  background: #1a1a2e !important;
}

.jexcel {
  background: #1a1a2e !important;
  color: #e2e8f0 !important;
  border-color: #2d3748 !important;
}

.jexcel {
    height: 100vh;
    width: 100%;
}

.jexcel td {
  border-color: #2d3748 !important;
}

.jexcel thead td {
  background: #2d3748 !important;
  color: #a0aec0 !important;
  border-color: #374151 !important;
}

.jexcel td.highlight {
  background: rgba(99, 102, 241, 0.15) !important;
}

.jexcel td.jexcel_selected {
  background: rgba(99, 102, 241, 0.25) !important;
}

.jexcel > tbody > tr > td.edition {
  background: #1e293b !important;
  color: #e2e8f0 !important;
}

.jexcel > tbody > tr > td.edition > input,
.jexcel > tbody > tr > td.edition > textarea {
  background: #1e293b !important;
  color: #e2e8f0 !important;
  border: none !important;
}

/* Search bar */
.jexcel_search {
  background: #1e293b !important;
  color: #e2e8f0 !important;
  border-color: #374151 !important;
}

/* Pagination */
.jexcel_pagination {
  background: #1a1a2e !important;
  color: #a0aec0 !important;
}

.jexcel_pagination .jexcel_page {
  color: #a0aec0 !important;
}

.jexcel_pagination .jexcel_page.jexcel_page_selected {
  background: rgba(99, 102, 241, 0.25) !important;
  color: #818cf8 !important;
}

/* Context menu */
.jexcel_contextmenu {
  background: #1e293b !important;
  color: #e2e8f0 !important;
  border-color: #374151 !important;
}

.jexcel_contextmenu > div:hover {
  background: rgba(99, 102, 241, 0.15) !important;
}

/* Toolbar / header area */
.jexcel_toolbar {
  background: #1a1a2e !important;
  border-color: #2d3748 !important;
}

/* Row numbers */
.jexcel > tbody > tr > td:first-child {
  background: #2d3748 !important;
  color: #718096 !important;
}

/* Corner cell */
.jexcel > thead > tr > td:first-child {
  background: #374151 !important;
}

/* Scrollbar styling for dark */
.jexcel_content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.jexcel_content::-webkit-scrollbar-track {
  background: #1a1a2e;
}
.jexcel_content::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 4px;
}

/* ===== Light Theme ===== */
.light .jexcel_content {
  background: #ffffff !important;
}

.light .jexcel {
  background: #ffffff !important;
  color: #1a202c !important;
  border-color: #e2e8f0 !important;
}

.light .jexcel td {
  border-color: #e2e8f0 !important;
}

.light .jexcel thead td {
  background: #f7fafc !important;
  color: #4a5568 !important;
  border-color: #e2e8f0 !important;
}

.light .jexcel td.highlight {
  background: rgba(99, 102, 241, 0.08) !important;
}

.light .jexcel td.jexcel_selected {
  background: rgba(99, 102, 241, 0.15) !important;
}

.light .jexcel > tbody > tr > td.edition {
  background: #ffffff !important;
  color: #1a202c !important;
}

.light .jexcel > tbody > tr > td.edition > input,
.light .jexcel > tbody > tr > td.edition > textarea {
  background: #ffffff !important;
  color: #1a202c !important;
}

.light .jexcel_search {
  background: #ffffff !important;
  color: #1a202c !important;
  border-color: #e2e8f0 !important;
}

.light .jexcel_pagination {
  background: #ffffff !important;
  color: #4a5568 !important;
}

.light .jexcel_pagination .jexcel_page.jexcel_page_selected {
  background: rgba(99, 102, 241, 0.15) !important;
  color: #6366f1 !important;
}

.light .jexcel_contextmenu {
  background: #ffffff !important;
  color: #1a202c !important;
  border-color: #e2e8f0 !important;
}

.light .jexcel > tbody > tr > td:first-child {
  background: #f7fafc !important;
  color: #a0aec0 !important;
}

.light .jexcel > thead > tr > td:first-child {
  background: #edf2f7 !important;
}

.light .loading {
  background: rgba(249, 250, 251, 0.85);
}

/* Dark loading */
.panel:not(.light) .loading {
  background: rgba(26, 26, 46, 0.85);
}
.panel:not(.light) .spinner {
  border-color: rgba(255, 255, 255, 0.1);
  border-top-color: rgb(99, 102, 241);
}
</style>
