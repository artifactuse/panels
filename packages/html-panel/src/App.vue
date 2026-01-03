<template>
  <div class="preview-container" :class="{ 'markdown-mode': isMarkdown }">
    <div v-if="error" class="error">
      <div class="error-title">Preview Error</div>
      <pre>{{ error }}</pre>
    </div>
    <div v-else class="content" v-html="renderedHtml"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { createBridge } from '@artifactuse/shared/bridge';

const props = defineProps({
  code: { type: String, default: '' },
  language: { type: String, default: 'html' }
});

const code = ref(props.code);
const language = ref(props.language);
const error = ref(null);

const isMarkdown = computed(() => {
  const lang = language.value.toLowerCase();
  return lang === 'markdown' || lang === 'md';
});

// Simple markdown parser
function parseMarkdown(md) {
  let html = md
    // Code blocks (must come before inline code)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return '<pre><code class="language-' + lang + '">' + escapeHtml(code.trim()) + '</code></pre>';
    })
    // Headers
    .replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links and images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Blockquotes
    .replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr />')
    // Unordered lists
    .replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')
    // Paragraphs - wrap non-tag lines
    .replace(/\n\n+/g, '\n</p><p>\n')
    // Line breaks
    .replace(/\n/g, '<br />');
  
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)(\s*<br \/>)*/gs, (match) => {
    return '<ul>' + match.replace(/<br \/>/g, '') + '</ul>';
  });
  
  // Merge consecutive blockquotes
  html = html.replace(/(<\/blockquote>)\s*(<blockquote>)/g, '<br />');
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  
  return '<p>' + html + '</p>';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render content
const renderedHtml = computed(() => {
  try {
    error.value = null;
    const content = code.value;
    
    if (!content) return '';
    
    if (isMarkdown.value) {
      return parseMarkdown(content);
    }
    
    // HTML - return as-is (sanitization should happen at SDK level)
    return content;
  } catch (e) {
    error.value = e.message;
    return '';
  }
});

// Handle link clicks - open in new tab
function handleLinkClick(e) {
  const link = e.target.closest('a');
  if (link && link.href && !link.href.startsWith('javascript:')) {
    e.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  }
}

// Bridge for parent communication
let bridge = null;

onMounted(() => {
  bridge = createBridge({
    onMessage: (msg) => {
      if (msg.type === 'setCode' || msg.action === 'setContent') {
        code.value = msg.data?.code || msg.data?.content || '';
        language.value = msg.data?.language || 'html';
      }
    }
  });
  bridge.send({ type: 'ready' });
  
  // Dev mode: load mock data if no data provided
  if (!code.value && (import.meta.env?.DEV || window.location.hostname === 'localhost')) {
    import('@artifactuse/shared').then((mod) => {
      if (mod.getMockData) {
        // Check URL for type hint
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type') || 'html';
        const mockContent = mod.getMockData(type === 'md' || type === 'markdown' ? 'markdown' : 'html');
        if (mockContent) {
          code.value = mockContent;
          language.value = type === 'md' || type === 'markdown' ? 'markdown' : 'html';
          console.log(`[HTML Preview] Loaded ${language.value} mock data for development`);
        }
      }
    }).catch(() => {});
  }
  
  // Handle link clicks
  document.addEventListener('click', handleLinkClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleLinkClick);
  bridge?.destroy();
});

watch(() => props.code, (v) => { code.value = v; });
watch(() => props.language, (v) => { language.value = v; });
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.preview-container {
  width: 100%;
  min-height: 100vh;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  background: #fff;
}

.preview-container.markdown-mode {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.content {
  width: 100%;
}

/* Typography */
.markdown-mode h1,
.markdown-mode h2,
.markdown-mode h3,
.markdown-mode h4,
.markdown-mode h5,
.markdown-mode h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.3;
  color: #111;
}

.markdown-mode h1 {
  font-size: 2em;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.3em;
}

.markdown-mode h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.3em;
}

.markdown-mode h3 { font-size: 1.25em; }
.markdown-mode h4 { font-size: 1em; }
.markdown-mode h5 { font-size: 0.875em; }
.markdown-mode h6 { font-size: 0.85em; color: #666; }

.markdown-mode p {
  margin: 1em 0;
}

.markdown-mode a {
  color: #0066cc;
  text-decoration: none;
}

.markdown-mode a:hover {
  text-decoration: underline;
}

.markdown-mode code {
  background: #f4f4f4;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  font-size: 0.9em;
}

.markdown-mode pre {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.markdown-mode pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: 0.875em;
}

.markdown-mode ul,
.markdown-mode ol {
  padding-left: 2em;
  margin: 1em 0;
}

.markdown-mode li {
  margin: 0.25em 0;
}

.markdown-mode blockquote {
  border-left: 4px solid #ddd;
  margin: 1em 0;
  padding: 0.5em 1em;
  color: #666;
  background: #f9f9f9;
}

.markdown-mode hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 2em 0;
}

.markdown-mode img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.markdown-mode table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-mode th,
.markdown-mode td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.markdown-mode th {
  background: #f4f4f4;
  font-weight: 600;
}

/* Error display */
.error {
  padding: 20px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 8px;
}

.error-title {
  font-weight: bold;
  margin-bottom: 8px;
}

.error pre {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
}
</style>
