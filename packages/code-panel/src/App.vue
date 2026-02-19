<template>
  <div class="panel font-mono text-sm" :class="[themeClass, accentClass]">
    <!-- Toolbar -->
    <div class="toolbar">
      <select v-model="language" class="select w-auto text-sm py-1.5">
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
      </select>
      <button @click="runCode" class="btn btn-sm btn-primary" :disabled="isRunning || pyodideLoading">
        <svg v-if="isRunning || pyodideLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>{{ pyodideLoading ? 'Loading...' : isRunning ? 'Running...' : 'Run' }}</span>
      </button>
      <button @click="clearOutput" class="btn btn-sm btn-secondary">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        <span class="hidden sm:inline">Clear</span>
      </button>
      <!-- Python status indicator -->
      <div v-if="language === 'python'" class="flex items-center gap-1.5 text-xs text-txt-muted">
        <span v-if="pyodideReady" class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-green-500"></span>
          <span class="hidden sm:inline">Python ready</span>
        </span>
        <span v-else-if="pyodideLoading" class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
          <span class="hidden sm:inline">{{ pyodideLoadProgress || 'Loading...' }}</span>
        </span>
        <span v-else class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-zinc-500"></span>
          <span class="hidden sm:inline">Python idle</span>
        </span>
      </div>
      <div class="flex-1"></div>
      <button @click="copyCode" class="btn btn-sm btn-secondary">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span>{{ copyLabel }}</span>
      </button>
    </div>
    
    <!-- Editor & Output -->
    <div ref="splitContainer" class="flex-1 flex flex-col md:flex-row overflow-hidden">
      <!-- Code Editor -->
      <div 
        class="flex flex-col border-b md:border-b-0 md:border-r border-line overflow-hidden"
        :style="{ flexBasis: isHorizontal ? `${splitPosition}%` : '50%', flexGrow: 0, flexShrink: 0 }"
      >
        <div class="px-3 py-1.5 bg-panel-surface border-b border-line text-xs text-txt-muted flex items-center gap-2">
          <span>Code</span>
          <span class="opacity-50">•</span>
          <span class="text-txt-muted/60">Ctrl+Enter to run</span>
        </div>
        <div ref="editorContainer" class="flex-1 overflow-auto codemirror-container"></div>
      </div>
      
      <!-- Draggable Divider -->
      <div 
        ref="divider"
        class="divider-handle group"
        :class="[
          isHorizontal ? 'divider-horizontal' : 'divider-vertical',
          isDragging ? 'is-dragging' : ''
        ]"
        @mousedown="startDrag"
        @touchstart.prevent="startDrag"
      >
        <div class="divider-line" :class="isHorizontal ? 'divider-line-horizontal' : 'divider-line-vertical'">
          <div class="divider-grip">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
      
      <!-- Output -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        <div class="px-3 py-1.5 bg-panel-surface border-b border-line text-xs text-txt-muted flex items-center gap-2">
          <span>Output</span>
          <span v-if="executionTime" class="text-txt-muted">{{ executionTime }}ms</span>
        </div>
        <div class="flex-1 overflow-auto p-3">
          <div v-if="!output.length" class="text-txt-muted italic">Run code to see output...</div>
          <div v-for="(line, i) in output" :key="i" :class="line.type === 'error' ? 'text-error' : line.type === 'warn' ? 'text-warning' : 'text-txt'">
            <span class="text-txt-muted mr-2 select-none">[{{ line.type }}]</span>
            <span class="whitespace-pre-wrap">{{ line.content }}</span>
          </div>
        </div>
      </div>
    </div>
    
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, shallowRef } from 'vue';
import { createBridge, setupArtifactListeners } from '@artifactuse/shared';
import { setAccentColor } from '@artifactuse/shared/theme';
import '@artifactuse/shared/styles.css';

// CodeMirror imports
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const props = defineProps({
  initialCode: { type: String, default: '' },
  lang: { type: String, default: 'javascript' },
  theme: { type: String, default: 'dark' },
  accent: { type: String, default: '' }
});

const currentTheme = ref(props.theme);
const currentAccent = ref(props.accent);
const code = ref(props.initialCode);
const language = ref(props.lang);
const output = ref([]);
const isRunning = ref(false);
const executionTime = ref(null);
const copyLabel = ref('Copy');

// Pyodide state
const pyodide = shallowRef(null);
const pyodideLoading = ref(false);
const pyodideReady = ref(false);
const pyodideLoadProgress = ref('');

const editorContainer = ref(null);
const editorView = shallowRef(null);

// Split pane state
const splitContainer = ref(null);
const divider = ref(null);
const splitPosition = ref(50); // percentage
const isDragging = ref(false);
const isHorizontal = ref(true); // true for side-by-side, false for stacked

const themeClass = computed(() => currentTheme.value === 'light' ? 'light' : '');
const accentClass = computed(() => currentAccent.value ? `accent-${currentAccent.value}` : '');

// Check if we're in horizontal (side-by-side) or vertical (stacked) mode
function checkLayout() {
  if (splitContainer.value) {
    isHorizontal.value = splitContainer.value.offsetWidth >= 640; // md breakpoint
  }
}

// Draggable divider logic
function startDrag(e) {
  isDragging.value = true;
  document.body.style.cursor = isHorizontal.value ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });
  document.addEventListener('touchend', stopDrag);
}

function onDrag(e) {
  if (!isDragging.value || !splitContainer.value) return;
  
  e.preventDefault();
  
  const rect = splitContainer.value.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  let newPosition;
  if (isHorizontal.value) {
    newPosition = ((clientX - rect.left) / rect.width) * 100;
  } else {
    newPosition = ((clientY - rect.top) / rect.height) * 100;
  }
  
  // Clamp between 20% and 80%
  splitPosition.value = Math.max(20, Math.min(80, newPosition));
}

function stopDrag() {
  isDragging.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('touchmove', onDrag);
  document.removeEventListener('touchend', stopDrag);
}

// Custom dark theme for CodeMirror
const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#e4e4e7',
    height: '100%',
  },
  '.cm-content': {
    caretColor: 'var(--accent, #60a5fa)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    padding: '12px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent, #60a5fa)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(99, 102, 241, 0.3) !important',
  },
  '.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: '#52525b',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 16px',
    minWidth: '40px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
    cursor: 'pointer',
    color: '#71717a',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: '#a1a1aa',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    outline: '1px solid rgba(99, 102, 241, 0.5)',
  },
  '.cm-tooltip': {
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    },
    '& > ul > li': {
      padding: '4px 8px',
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgba(99, 102, 241, 0.2)',
    },
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
}, { dark: true });

// Custom light theme for CodeMirror
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#27272a',
    height: '100%',
  },
  '.cm-content': {
    caretColor: 'var(--accent, #3b82f6)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    padding: '12px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent, #3b82f6)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(59, 130, 246, 0.2) !important',
  },
  '.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 16px',
    minWidth: '40px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
    cursor: 'pointer',
    color: '#a1a1aa',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: '#71717a',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    outline: '1px solid rgba(59, 130, 246, 0.4)',
  },
  '.cm-tooltip': {
    backgroundColor: '#ffffff',
    border: '1px solid #e4e4e7',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    },
    '& > ul > li': {
      padding: '4px 8px',
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
}, { dark: false });

// Custom syntax highlighting for dark theme
const darkHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#c084fc' },
  { tag: tags.operator, color: '#94a3b8' },
  { tag: tags.special(tags.variableName), color: '#67e8f9' },
  { tag: tags.typeName, color: '#fbbf24' },
  { tag: tags.atom, color: '#fb923c' },
  { tag: tags.number, color: '#fb923c' },
  { tag: tags.definition(tags.variableName), color: '#67e8f9' },
  { tag: tags.string, color: '#86efac' },
  { tag: tags.special(tags.string), color: '#86efac' },
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#e4e4e7' },
  { tag: tags.tagName, color: '#f87171' },
  { tag: tags.bracket, color: '#a1a1aa' },
  { tag: tags.meta, color: '#fbbf24' },
  { tag: tags.link, color: '#60a5fa', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#f472b6' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.className, color: '#fbbf24' },
  { tag: tags.propertyName, color: '#60a5fa' },
  { tag: tags.function(tags.variableName), color: '#60a5fa' },
  { tag: tags.function(tags.propertyName), color: '#60a5fa' },
  { tag: tags.bool, color: '#fb923c' },
  { tag: tags.null, color: '#fb923c' },
  { tag: tags.regexp, color: '#f87171' },
]);

// Custom syntax highlighting for light theme
const lightHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#7c3aed' },
  { tag: tags.operator, color: '#64748b' },
  { tag: tags.special(tags.variableName), color: '#0891b2' },
  { tag: tags.typeName, color: '#d97706' },
  { tag: tags.atom, color: '#ea580c' },
  { tag: tags.number, color: '#ea580c' },
  { tag: tags.definition(tags.variableName), color: '#0891b2' },
  { tag: tags.string, color: '#16a34a' },
  { tag: tags.special(tags.string), color: '#16a34a' },
  { tag: tags.comment, color: '#9ca3af', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#27272a' },
  { tag: tags.tagName, color: '#dc2626' },
  { tag: tags.bracket, color: '#71717a' },
  { tag: tags.meta, color: '#d97706' },
  { tag: tags.link, color: '#2563eb', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#db2777' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.className, color: '#d97706' },
  { tag: tags.propertyName, color: '#2563eb' },
  { tag: tags.function(tags.variableName), color: '#2563eb' },
  { tag: tags.function(tags.propertyName), color: '#2563eb' },
  { tag: tags.bool, color: '#ea580c' },
  { tag: tags.null, color: '#ea580c' },
  { tag: tags.regexp, color: '#dc2626' },
]);

function getLanguageExtension(lang) {
  switch (lang) {
    case 'python':
      return python();
    case 'txt':
      return [];
    case 'javascript':
    default:
      return javascript();
  }
}

// Load Pyodide dynamically
async function loadPyodide() {
  if (pyodide.value || pyodideLoading.value) return pyodide.value;
  
  pyodideLoading.value = true;
  pyodideLoadProgress.value = 'Loading Python runtime...';
  
  try {
    // Dynamically load the Pyodide script
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    pyodideLoadProgress.value = 'Initializing Python...';
    
    // Initialize Pyodide
    const pyodideInstance = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
    });
    
    pyodideLoadProgress.value = 'Setting up environment...';
    
    // Set up stdout/stderr capture
    await pyodideInstance.runPythonAsync(`
import sys
from io import StringIO

class OutputCapture:
    def __init__(self, output_type='log'):
        self.output_type = output_type
        self.buffer = StringIO()
    
    def write(self, text):
        if text.strip():
            self.buffer.write(text)
    
    def flush(self):
        pass
    
    def getvalue(self):
        return self.buffer.getvalue()
    
    def clear(self):
        self.buffer = StringIO()

_stdout_capture = OutputCapture('log')
_stderr_capture = OutputCapture('error')
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
    `);
    
    pyodide.value = pyodideInstance;
    pyodideReady.value = true;
    pyodideLoadProgress.value = '';
    
    return pyodideInstance;
  } catch (error) {
    pyodideLoadProgress.value = '';
    throw error;
  } finally {
    pyodideLoading.value = false;
  }
}

// Run Python code using Pyodide
async function runPython() {
  const logs = [];
  
  try {
    // Load Pyodide if not already loaded
    if (!pyodide.value) {
      logs.push({ type: 'info', content: 'Loading Python runtime (first run may take a moment)...' });
      output.value = logs;
      await loadPyodide();
      logs.pop(); // Remove loading message
    }
    
    const py = pyodide.value;
    
    // Clear previous output captures
    await py.runPythonAsync(`
_stdout_capture.clear()
_stderr_capture.clear()
    `);
    
    // Run the user's code
    let result;
    try {
      result = await py.runPythonAsync(code.value);
    } catch (pythonError) {
      // Extract the Python error message
      const errorStr = pythonError.message || String(pythonError);
      logs.push({ type: 'error', content: errorStr });
      output.value = logs;
      return;
    }
    
    // Get captured stdout
    const stdout = await py.runPythonAsync('_stdout_capture.getvalue()');
    if (stdout) {
      stdout.split('\n').forEach(line => {
        if (line.trim()) {
          logs.push({ type: 'log', content: line });
        }
      });
    }
    
    // Get captured stderr
    const stderr = await py.runPythonAsync('_stderr_capture.getvalue()');
    if (stderr) {
      stderr.split('\n').forEach(line => {
        if (line.trim()) {
          logs.push({ type: 'error', content: line });
        }
      });
    }
    
    // If there's a result and no stdout, show the result
    if (result !== undefined && result !== null && !stdout) {
      const resultStr = String(result);
      if (resultStr !== 'None' && resultStr.trim()) {
        logs.push({ type: 'log', content: resultStr });
      }
    }
    
  } catch (error) {
    logs.push({ type: 'error', content: `Failed to run Python: ${error.message}` });
  }
  
  output.value = logs;
}

function createEditorState(doc, lang, isDark) {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter({
        openText: '▾',
        closedText: '▸',
      }),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(isDark ? darkHighlighting : lightHighlighting),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
        {
          key: 'Ctrl-Enter',
          mac: 'Cmd-Enter',
          run: () => {
            runCode();
            return true;
          },
        },
      ]),
      getLanguageExtension(lang),
      isDark ? darkTheme : lightTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          code.value = update.state.doc.toString();
        }
      }),
    ],
  });
}

function initEditor() {
  if (!editorContainer.value) return;
  
  const isDark = currentTheme.value !== 'light';
  const state = createEditorState(code.value, language.value, isDark);
  
  if (editorView.value) {
    editorView.value.destroy();
  }
  
  editorView.value = new EditorView({
    state,
    parent: editorContainer.value,
  });
}

function updateEditorContent(newCode) {
  if (!editorView.value) return;
  const currentCode = editorView.value.state.doc.toString();
  if (currentCode !== newCode) {
    editorView.value.dispatch({
      changes: { from: 0, to: currentCode.length, insert: newCode },
    });
  }
}

async function runCode() {
  if (isRunning.value) return;
  isRunning.value = true;
  output.value = [];
  const startTime = performance.now();
  
  try {
    if (language.value === 'javascript') {
      runJavaScript();
    } else if (language.value === 'python') {
      await runPython();
    }
  } finally {
    executionTime.value = Math.round(performance.now() - startTime);
    isRunning.value = false;
  }
}

function runJavaScript() {
  const originalConsole = { ...console };
  const logs = [];
  
  // Override console methods
  console.log = (...args) => logs.push({ type: 'log', content: args.map(String).join(' ') });
  console.error = (...args) => logs.push({ type: 'error', content: args.map(String).join(' ') });
  console.warn = (...args) => logs.push({ type: 'warn', content: args.map(String).join(' ') });
  console.info = (...args) => logs.push({ type: 'info', content: args.map(String).join(' ') });
  
  try {
    const result = new Function(code.value)();
    if (result !== undefined) {
      logs.push({ type: 'log', content: String(result) });
    }
  } catch (e) {
    logs.push({ type: 'error', content: e.message });
  }
  
  // Restore console
  Object.assign(console, originalConsole);
  output.value = logs;
}

function clearOutput() {
  output.value = [];
  executionTime.value = null;
}

function copyCode() {
  navigator.clipboard.writeText(code.value).then(() => {
    copyLabel.value = 'Copied!';
    setTimeout(() => copyLabel.value = 'Copy', 1500);
  });
}

let bridge = null;
let resizeObserver = null;

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('theme')) currentTheme.value = params.get('theme');
  const urlAccent = params.get('accent');
  if (urlAccent) { setAccentColor(urlAccent); currentAccent.value = urlAccent; }
  if (params.get('code')) code.value = decodeURIComponent(params.get('code'));
  if (params.get('lang')) language.value = params.get('lang');
  
  // if (!code.value && (import.meta.env?.DEV || window.location.hostname === 'localhost')) {
  //   import('@artifactuse/shared').then(mod => {
  //     if (mod.getMockData) {
  //       const mock = mod.getMockData('javascript');
  //       if (mock) {
  //         code.value = mock;
  //         // Update the editor with mock data after it's loaded
  //         if (editorView.value) {
  //           updateEditorContent(mock);
  //         }
  //         console.log('[Sandbox] Loaded mock data');
  //       }
  //     }
  //   }).catch(() => {});
  // }
  
  // Check layout initially and on resize
  checkLayout();
  resizeObserver = new ResizeObserver(checkLayout);
  if (splitContainer.value) {
    resizeObserver.observe(splitContainer.value);
  }
  
  // Initialize CodeMirror editor
  initEditor();
  
  bridge = createBridge({ debug: import.meta.env?.DEV });
  
  setupArtifactListeners({
    type: 'runtime',
    acceptedLanguages: ['javascript', 'js', 'python', 'py'],
    bridge,
    onArtifact: (artifact, lang) => {
      // Raw code - no parsing needed
      code.value = artifact.code || '';
      language.value = artifact.language;
      updateEditorContent(code.value);
      return true;
    },
  });
  
  bridge.on('run:code', runCode);
  
  bridge.signalReady();
});

onUnmounted(() => {
  if (editorView.value) {
    editorView.value.destroy();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  // Clean up any lingering drag events
  stopDrag();
});

// Reinitialize editor when language or theme changes
watch([language, currentTheme], () => {
  initEditor();
});

// Watch for external code changes and sync to editor
watch(code, (newCode) => {
  if (editorView.value) {
    const currentEditorCode = editorView.value.state.doc.toString();
    if (currentEditorCode !== newCode) {
      updateEditorContent(newCode);
    }
  }
});

watch(() => props.initialCode, (v) => {
  if (v) {
    code.value = v;
  }
});
watch(() => props.lang, (v) => v && (language.value = v));
watch(() => props.theme, (t) => t && (currentTheme.value = t));
</script>

<style>
.codemirror-container {
  height: 100%;
}

.codemirror-container .cm-editor {
  height: 100%;
}

.codemirror-container .cm-scroller {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

/* Ensure proper scrolling */
.codemirror-container .cm-content {
  min-height: 100%;
}

/* Custom scrollbar styling */
.codemirror-container .cm-scroller::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.codemirror-container .cm-scroller::-webkit-scrollbar-track {
  background: transparent;
}

.codemirror-container .cm-scroller::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.codemirror-container .cm-scroller::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.light .codemirror-container .cm-scroller::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.light .codemirror-container .cm-scroller::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

/* Divider styles */
.divider-handle {
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.divider-horizontal {
  width: 12px;
  cursor: col-resize;
  margin: 0 -6px;
}

.divider-vertical {
  height: 12px;
  cursor: row-resize;
  margin: -6px 0;
}

.divider-line {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.divider-line-horizontal {
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  background-color: var(--color-line, rgba(255, 255, 255, 0.1));
}

.divider-line-vertical {
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 1px;
  background-color: var(--color-line, rgba(255, 255, 255, 0.1));
}

.divider-handle:hover .divider-line,
.divider-handle.is-dragging .divider-line {
  background-color: var(--accent, #60a5fa);
}

.divider-handle:hover .divider-line-horizontal,
.divider-handle.is-dragging .divider-line-horizontal {
  width: 3px;
}

.divider-handle:hover .divider-line-vertical,
.divider-handle.is-dragging .divider-line-vertical {
  height: 3px;
}

.divider-grip {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.divider-horizontal .divider-grip {
  flex-direction: column;
}

.divider-vertical .divider-grip {
  flex-direction: row;
}

.divider-handle:hover .divider-grip,
.divider-handle.is-dragging .divider-grip {
  opacity: 1;
}

.divider-grip span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: var(--accent, #60a5fa);
}

.light .divider-line-horizontal,
.light .divider-line-vertical {
  background-color: var(--color-line, rgba(0, 0, 0, 0.1));
}

/* Prevent text selection while dragging */
.divider-handle.is-dragging {
  user-select: none;
}
</style>