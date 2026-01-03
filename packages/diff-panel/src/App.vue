<template>
  <div class="panel font-mono text-sm" :class="[themeClass, accentClass]">
    <!-- Toolbar -->
    <div class="toolbar">
      <button 
        @click="viewMode = 'split'" 
        class="btn btn-sm" 
        :class="viewMode === 'split' ? 'btn-primary' : 'btn-secondary'"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"/>
        </svg>
        <span class="hidden sm:inline">Split</span>
      </button>
      <button 
        @click="viewMode = 'unified'" 
        class="btn btn-sm"
        :class="viewMode === 'unified' ? 'btn-primary' : 'btn-secondary'"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
        <span class="hidden sm:inline">Unified</span>
      </button>
      <div class="h-4 w-px bg-line mx-1"></div>
      <button @click="showLineNumbers = !showLineNumbers" class="btn btn-sm btn-secondary" :class="{ 'bg-primary text-white': showLineNumbers }">
        <span>#</span>
        <span class="hidden sm:inline">Lines</span>
      </button>
      <div class="h-4 w-px bg-line mx-1"></div>
      <select v-model="language" class="select w-auto text-sm py-1.5">
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="python">Python</option>
        <option value="css">CSS</option>
        <option value="html">HTML</option>
        <option value="json">JSON</option>
        <option value="markdown">Markdown</option>
        <option value="bash">Bash</option>
        <option value="plaintext">Plain Text</option>
      </select>
      <div class="flex-1"></div>
      <span class="text-xs text-txt-muted">
        <span class="text-green-400">+{{ stats.added }}</span>
        <span class="mx-1">/</span>
        <span class="text-error">-{{ stats.removed }}</span>
      </span>
    </div>
    
    <!-- Diff Display -->
    <div class="panel-content p-0">
      <!-- Split View -->
      <div v-if="viewMode === 'split'" class="flex h-full">
        <!-- Left (Old) -->
        <div class="flex-1 overflow-auto border-r border-line">
          <div class="p-2 bg-panel-surface border-b border-line text-xs text-txt-muted font-sans">Original</div>
          <table class="w-full">
            <tr v-for="(line, i) in splitDiff.left" :key="'l'+i" :class="getLineClass(line.type)">
              <td v-if="showLineNumbers" class="w-10 px-2 text-right text-txt-muted select-none border-r border-line/30">{{ line.lineNum || '' }}</td>
              <td class="px-3 py-0.5 whitespace-pre" v-html="highlightLine(line.content)"></td>
            </tr>
          </table>
        </div>
        <!-- Right (New) -->
        <div class="flex-1 overflow-auto">
          <div class="p-2 bg-panel-surface border-b border-line text-xs text-txt-muted font-sans">Modified</div>
          <table class="w-full">
            <tr v-for="(line, i) in splitDiff.right" :key="'r'+i" :class="getLineClass(line.type)">
              <td v-if="showLineNumbers" class="w-10 px-2 text-right text-txt-muted select-none border-r border-line/30">{{ line.lineNum || '' }}</td>
              <td class="px-3 py-0.5 whitespace-pre" v-html="highlightLine(line.content)"></td>
            </tr>
          </table>
        </div>
      </div>
      
      <!-- Unified View -->
      <div v-else class="overflow-auto h-full">
        <table class="w-full">
          <tr v-for="(line, i) in unifiedDiff" :key="i" :class="getLineClass(line.type)">
            <td v-if="showLineNumbers" class="w-10 px-2 text-right text-txt-muted select-none border-r border-line/30">{{ line.oldNum || '' }}</td>
            <td v-if="showLineNumbers" class="w-10 px-2 text-right text-txt-muted select-none border-r border-line/30">{{ line.newNum || '' }}</td>
            <td class="w-6 px-1 text-center select-none" :class="line.type === 'add' ? 'text-green-400' : line.type === 'remove' ? 'text-error' : 'text-txt-muted'">
              {{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}
            </td>
            <td class="px-3 py-0.5 whitespace-pre" v-html="highlightLine(line.content)"></td>
          </tr>
        </table>
      </div>
    </div>
    
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, shallowRef } from 'vue';
import { createBridge } from '@artifactuse/shared/bridge';
import { setAccentColor } from '@artifactuse/shared/theme';
import '@artifactuse/shared/styles.css';

const props = defineProps({
  oldCode: { type: String, default: '' },
  newCode: { type: String, default: '' },
  lang: { type: String, default: 'javascript' },
  theme: { type: String, default: 'dark' },
  accent: { type: String, default: '' }
});

const currentTheme = ref(props.theme);
const currentAccent = ref(props.accent);
const oldCode = ref(props.oldCode);
const newCode = ref(props.newCode);
const language = ref(props.lang);
const viewMode = ref('split');
const showLineNumbers = ref(true);

// Prism.js state
const Prism = shallowRef(null);
const prismLoaded = ref(false);

const themeClass = computed(() => currentTheme.value === 'light' ? 'light' : '');
const accentClass = computed(() => currentAccent.value ? `accent-${currentAccent.value}` : '');

// Load Prism.js dynamically
async function loadPrism() {
  if (Prism.value || prismLoaded.value) return Prism.value;
  
  try {
    // Load Prism core CSS (dark theme)
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css';
    document.head.appendChild(cssLink);
    
    // Load Prism core JS
    await loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js');
    
    // Load language components
    await Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-typescript.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-css.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markup.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js'),
    ]);
    
    Prism.value = window.Prism;
    prismLoaded.value = true;
    
    return window.Prism;
  } catch (error) {
    console.error('Failed to load Prism.js:', error);
    return null;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Map language selection to Prism grammar
function getPrismLanguage(lang) {
  const mapping = {
    'javascript': 'javascript',
    'typescript': 'typescript',
    'python': 'python',
    'css': 'css',
    'html': 'markup',
    'json': 'json',
    'markdown': 'markdown',
    'bash': 'bash',
    'plaintext': null
  };
  return mapping[lang] || null;
}

// Highlight a single line of code
function highlightLine(content) {
  if (!content || !Prism.value || language.value === 'plaintext') {
    return escapeHtml(content);
  }
  
  const prismLang = getPrismLanguage(language.value);
  if (!prismLang || !Prism.value.languages[prismLang]) {
    return escapeHtml(content);
  }
  
  try {
    return Prism.value.highlight(content, Prism.value.languages[prismLang], prismLang);
  } catch (e) {
    return escapeHtml(content);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Simple diff algorithm
function computeDiff(oldLines, newLines) {
  const result = [];
  let oldIdx = 0, newIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      result.push({ type: 'add', content: newLines[newIdx], oldNum: null, newNum: newIdx + 1 });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      result.push({ type: 'remove', content: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: null });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      result.push({ type: 'same', content: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else {
      // Simple: look ahead for matches
      let foundOld = newLines.indexOf(oldLines[oldIdx], newIdx);
      let foundNew = oldLines.indexOf(newLines[newIdx], oldIdx);
      
      if (foundNew !== -1 && (foundOld === -1 || foundNew - oldIdx <= foundOld - newIdx)) {
        result.push({ type: 'remove', content: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: null });
        oldIdx++;
      } else if (foundOld !== -1) {
        result.push({ type: 'add', content: newLines[newIdx], oldNum: null, newNum: newIdx + 1 });
        newIdx++;
      } else {
        result.push({ type: 'remove', content: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: null });
        result.push({ type: 'add', content: newLines[newIdx], oldNum: null, newNum: newIdx + 1 });
        oldIdx++;
        newIdx++;
      }
    }
  }
  return result;
}

const unifiedDiff = computed(() => {
  const oldLines = oldCode.value.split('\n');
  const newLines = newCode.value.split('\n');
  return computeDiff(oldLines, newLines);
});

const splitDiff = computed(() => {
  const left = [], right = [];
  for (const line of unifiedDiff.value) {
    if (line.type === 'same') {
      left.push({ type: 'same', content: line.content, lineNum: line.oldNum });
      right.push({ type: 'same', content: line.content, lineNum: line.newNum });
    } else if (line.type === 'remove') {
      left.push({ type: 'remove', content: line.content, lineNum: line.oldNum });
      right.push({ type: 'empty', content: '', lineNum: null });
    } else if (line.type === 'add') {
      left.push({ type: 'empty', content: '', lineNum: null });
      right.push({ type: 'add', content: line.content, lineNum: line.newNum });
    }
  }
  return { left, right };
});

const stats = computed(() => {
  let added = 0, removed = 0;
  for (const line of unifiedDiff.value) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
  }
  return { added, removed };
});

function getLineClass(type) {
  switch (type) {
    case 'add': return 'bg-green-500/10';
    case 'remove': return 'bg-error/10';
    case 'empty': return 'bg-panel-hover/30';
    default: return '';
  }
}

let bridge = null;

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('theme')) currentTheme.value = params.get('theme');
  const urlAccent = params.get('accent');
  if (urlAccent) { setAccentColor(urlAccent); currentAccent.value = urlAccent; }
  if (params.get('lang')) language.value = params.get('lang');
  
  // Load Prism.js
  await loadPrism();
  
  if (!oldCode.value && !newCode.value && (import.meta.env?.DEV || window.location.hostname === 'localhost')) {
    import('@artifactuse/shared').then(mod => {
      if (mod.getMockData) {
        const mock = mod.getMockData('diff');
        if (mock) {
          oldCode.value = mock.oldCode;
          newCode.value = mock.newCode;
          if (mock.language) language.value = mock.language;
          console.log('[Diff Viewer] Loaded mock data');
        }
      }
    }).catch(() => {});
  }
  
  bridge = createBridge({ debug: import.meta.env?.DEV });
  bridge.on('setDiff', (data) => {
    if (data.oldCode) oldCode.value = data.oldCode;
    if (data.newCode) newCode.value = data.newCode;
    if (data.language) language.value = data.language;
  });
  bridge.on('setLanguage', (lang) => { language.value = lang; });
  bridge.on('setTheme', (t) => { currentTheme.value = typeof t === 'string' ? t : t.theme; });
  bridge.on('setAccent', (a) => { setAccentColor(a); currentAccent.value = a; });
  bridge.signalReady();
});

watch(() => props.oldCode, (v) => v && (oldCode.value = v));
watch(() => props.newCode, (v) => v && (newCode.value = v));
watch(() => props.lang, (v) => v && (language.value = v));
watch(() => props.theme, (t) => t && (currentTheme.value = t));
</script>

<style>
/* Override Prism.js styles to work with our diff viewer */
.panel code[class*="language-"],
.panel pre[class*="language-"] {
  background: transparent !important;
  text-shadow: none !important;
  font-family: inherit !important;
  font-size: inherit !important;
  line-height: inherit !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* Prism token colors - dark theme compatible */
.panel .token.comment,
.panel .token.prolog,
.panel .token.doctype,
.panel .token.cdata {
  color: #6b7280;
}

.panel .token.punctuation {
  color: #a1a1aa;
}

.panel .token.property,
.panel .token.tag,
.panel .token.boolean,
.panel .token.number,
.panel .token.constant,
.panel .token.symbol,
.panel .token.deleted {
  color: #fb923c;
}

.panel .token.selector,
.panel .token.attr-name,
.panel .token.string,
.panel .token.char,
.panel .token.builtin,
.panel .token.inserted {
  color: #86efac;
}

.panel .token.operator,
.panel .token.entity,
.panel .token.url,
.panel .language-css .token.string,
.panel .style .token.string {
  color: #94a3b8;
}

.panel .token.atrule,
.panel .token.attr-value,
.panel .token.keyword {
  color: #c084fc;
}

.panel .token.function,
.panel .token.class-name {
  color: #60a5fa;
}

.panel .token.regex,
.panel .token.important,
.panel .token.variable {
  color: #fbbf24;
}

/* Light theme overrides */
.panel.light .token.comment,
.panel.light .token.prolog,
.panel.light .token.doctype,
.panel.light .token.cdata {
  color: #9ca3af;
}

.panel.light .token.punctuation {
  color: #71717a;
}

.panel.light .token.property,
.panel.light .token.tag,
.panel.light .token.boolean,
.panel.light .token.number,
.panel.light .token.constant,
.panel.light .token.symbol,
.panel.light .token.deleted {
  color: #ea580c;
}

.panel.light .token.selector,
.panel.light .token.attr-name,
.panel.light .token.string,
.panel.light .token.char,
.panel.light .token.builtin,
.panel.light .token.inserted {
  color: #16a34a;
}

.panel.light .token.operator,
.panel.light .token.entity,
.panel.light .token.url,
.panel.light .language-css .token.string,
.panel.light .style .token.string {
  color: #64748b;
}

.panel.light .token.atrule,
.panel.light .token.attr-value,
.panel.light .token.keyword {
  color: #7c3aed;
}

.panel.light .token.function,
.panel.light .token.class-name {
  color: #2563eb;
}

.panel.light .token.regex,
.panel.light .token.important,
.panel.light .token.variable {
  color: #d97706;
}
</style>