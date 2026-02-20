# Artifactuse Panels

Panel artifacts for the Artifactuse SDK. These are standalone apps that run inside iframes and communicate with the parent SDK via postMessage.

**[Live Demo](https://demo.artifactuse.com)**

## 📊 Overview

| Package | Description |
|---------|-------------|
| `@artifactuse/json-panel` | Interactive JSON tree viewer |
| `@artifactuse/svg-panel` | SVG preview with pan/zoom |
| `@artifactuse/diff-panel` | Side-by-side diff comparison |
| `@artifactuse/html-panel` | HTML + Markdown preview |
| `@artifactuse/react-panel` | React/JSX preview |
| `@artifactuse/vue-panel` | Vue SFC preview |
| `@artifactuse/form-panel` | Interactive forms, wizards, file uploads |
| `@artifactuse/sheet-panel` | CSV/TSV spreadsheet viewer & editor |
| `@artifactuse/editor-panel` | Canvas + Video editor |
| `@artifactuse/code-panel` | JS + Python code execution |

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Run all packages in dev mode
npm run dev

# Run specific package
npm run dev:json       # port 5173
npm run dev:svg        # port 5174
npm run dev:diff       # port 5175
npm run dev:code       # port 5176
npm run dev:html       # port 5177
npm run dev:react      # port 5178
npm run dev:vue        # port 5179
npm run dev:form       # port 5180
npm run dev:editor     # port 5181 (canvas + video)
npm run dev:sheet      # port 5182

# Build all
npm run build

# Build specific package
npm run build:json
npm run build:svg
npm run build:diff
npm run build:code
npm run build:html
npm run build:react
npm run build:vue
npm run build:form
npm run build:sheet
npm run build:editor
```

## 📤 Deployment

### Option 1: Cloudflare Workers (Recommended)

Deploy to Cloudflare's edge network for low-latency global delivery.

#### Quick Start (Self-Host)

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy (all panels, no restrictions)
npm run deploy:cf
```

That's it! Your panels are now live on Cloudflare's edge network.

#### Deployment Commands

```bash
npm run deploy:cf              # Deploy to production
npm run deploy:cf:staging      # Deploy to staging
npm run cf:dev                 # Local development server
npm run cf:tail                # Stream live logs
```

#### Custom Domain

1. Add your domain to Cloudflare
2. Update `wrangler.toml`:

```toml
[env.production]
routes = [
  { pattern = "panels.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

3. Deploy: `npm run deploy:cf`

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development`, `staging`, or `production` |
| `DOCS_URL` | `https://artifactuse.com/docs` | Your documentation URL |
| `DASHBOARD_URL` | `https://artifactuse.com/dashboard` | Your dashboard URL |

---

### Option 2: AWS S3 + CloudFront

Deploy to AWS for S3-based hosting with CloudFront CDN.

```bash
# Set environment variables
export CDN_BUCKET=your-s3-bucket
export CDN_URL=https://cdn.yourdomain.com
export CLOUDFRONT_DISTRIBUTION_ID=XXXXXX  # Optional

# Deploy
npm run deploy:aws
```

---

### CDN URL Structure

After deployment, panels are available at:

```
https://your-cdn-url/
├── json-panel/      # JSON Viewer
├── svg-panel/       # SVG Viewer
├── diff-panel/      # Diff Viewer
├── html-panel/      # HTML Preview
├── react-panel/     # React Preview
├── vue-panel/       # Vue Preview
├── form-panel/      # Form Panel
├── sheet-panel/     # CSV/TSV Spreadsheet
├── code-panel/      # Code Runtime (JS/Python)
└── editor-panel/    # Canvas + Video Editor
```

### Configure SDK

Point the Artifactuse SDK to your deployment:

```javascript
provideArtifactuse({
  cdnUrl: 'https://your-cdn-url',
})
```

## 📦 Packages

### @artifactuse/form-panel

Interactive form panel with multiple variants, field types, and validation.

**Variants:**
- `fields` - Standard form with multiple fields
- `wizard` - Multi-step form with progress bar
- `buttons` - Quick action buttons

**Field Types (18):**
- Text inputs: `text`, `email`, `password`, `tel`, `url`, `number`
- `textarea` - Multi-line text
- `select` - Single selection dropdown
- `multiselect` - Multiple selection (checkboxes)
- `radio` - Radio button group
- `checkbox` - Single checkbox
- `toggle` - Toggle switch
- `date`, `time`, `datetime` - Date/time pickers
- `range` - Slider with value display
- `rating` - Star rating (1-5)
- `file` - File upload with preview
- `color` - Color picker
- `button` - Action button (primary, secondary, ghost, danger, success)
- `hidden` - Hidden field

**Features:**
- Built-in validation (required, minLength, maxLength, pattern, email, etc.)
- Form layouts: vertical, horizontal, grid
- Wizard with step navigation and progress bar
- File upload with drag-drop and preview
- Success overlay on submit
- Full theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a form artifact
// artifact.language = 'form'
// artifact.code = JSON string with form configuration
{
  "title": "Contact Us",
  "variant": "fields",
  "data": {
    "fields": [
      { "name": "email", "type": "email", "label": "Email", "required": true }
    ]
  }
}
```

### @artifactuse/json-panel

Interactive JSON tree viewer with Tailwind CSS.

**Features:**
- Expand/collapse all nodes
- Search keys and values with highlighting
- Copy value or path to clipboard
- Node statistics
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a JSON artifact
// artifact.language = 'json'
// artifact.code = the JSON string to display
```


### @artifactuse/svg-panel

SVG preview with pan, zoom, and export.

**Features:**
- Mouse wheel zoom (0.1x - 10x)
- Toggle grid background
- Toggle dark/light preview background
- Download as SVG
- Copy SVG code
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening an SVG artifact
// artifact.language = 'svg'
// artifact.code = raw SVG markup
```

### @artifactuse/diff-panel

Side-by-side and unified diff comparison.

**Features:**
- Split view (two panels)
- Unified view (single panel)
- Line numbers toggle
- Added/removed highlighting
- Change statistics
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a diff artifact
// artifact.language = 'diff'
// artifact.code = JSON string with oldCode, newCode, language
{
  "oldCode": "original text",
  "newCode": "modified text",
  "language": "javascript"
}
```


### @artifactuse/html-panel

HTML and Markdown preview.

**Features:**
- Raw HTML rendering
- Markdown parsing (headers, lists, code blocks, links, images, etc.)
- Syntax highlighting for code blocks
- Link handling (opens in new tab)
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening an HTML/Markdown artifact
// artifact.language = 'html' | 'markdown' | 'md'
// artifact.code = raw HTML or Markdown content
```


### @artifactuse/react-panel

React/JSX preview with live rendering.

**Features:**
- JSX transformation via Babel
- React hooks support (useState, useEffect, etc.)
- Component auto-detection and mounting
- Error display
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a React artifact
// artifact.language = 'react' | 'jsx'
// artifact.code = raw JSX/React code
```


### @artifactuse/vue-panel

Vue SFC preview with live rendering.

**Features:**
- Vue 3 SFC parsing (template, script, style)
- Composition API support
- Options API support
- Scoped styles
- Error display
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a Vue artifact
// artifact.language = 'vue'
// artifact.code = raw Vue SFC code
```

### @artifactuse/sheet-panel

CSV/TSV spreadsheet viewer and editor powered by jspreadsheet-ce.

**Features:**
- Auto-detects delimiters (comma, tab, pipe, semicolon)
- Interactive cell editing with auto-save
- Column sorting, resize, and drag
- Row insert/delete via right-click menu
- Copy/paste support
- Dark/light theme
- Sends edited CSV back to SDK via `edit:save`

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a CSV/TSV artifact
// artifact.language = 'csv' | 'tsv'
// artifact.code = raw CSV or TSV content
```

### @artifactuse/code-panel

JavaScript and Python code execution sandbox.

**Features:**
- JavaScript execution with console capture
- Python execution via Pyodide (WebAssembly)
- Execution time display
- Ctrl/Cmd+Enter to run
- Theme customization

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a code artifact
// artifact.language = 'javascript' | 'typescript' | 'js' | 'ts' | 'sandbox'
// artifact.code = raw code to execute
```

### @artifactuse/editor-panel

Full-featured canvas and video editor.

**Canvas Mode Features:**
- Drawing tools (rect, circle, line, arrow, freehand, text)
- Shape manipulation (resize, rotate, group)
- Frames with children
- Image and video embedding
- Layers panel
- Snap guides
- Export to PNG, SVG, JSON

**Video Mode Features:**
- Timeline with tracks
- Audio waveforms
- Clip trimming
- Effects and filters
- FFmpeg export

**Artifact Loading:**
```javascript
// SDK automatically sends this when opening a canvas/video artifact
// artifact.language = 'canvas' | 'video'
// artifact.code = JSON string with canvas data
{
  "width": 1200,
  "height": 800,
  "backgroundColor": "#ffffff",
  "shapes": [
    { "type": "rect", "x": 100, "y": 100, "width": 200, "height": 150, "fillColor": "#6c5ce7" },
    { "type": "text", "x": 150, "y": 300, "text": "Hello World", "fontSize": 24 }
  ]
}
```

### @artifactuse/shared

Shared utilities for all panel packages.

#### Bridge (`@artifactuse/shared/bridge`)

```javascript
import { createBridge } from '@artifactuse/shared/bridge';

const bridge = createBridge({ debug: true });

// Listen for artifact loading (primary method)
bridge.on('load:artifact', (artifact) => {
  console.log('Artifact loaded:', artifact);
  // Handle artifact.code based on artifact.language
});

// Listen for other events
bridge.on('setData', (data) => {
  // Handle incoming data
});

// Send events to parent
bridge.send('form:submit', { formId, values });

// Signal panel is ready
bridge.signalReady();
```

#### Theme (`@artifactuse/shared/theme`)

```javascript
import { 
  setAccentColor, 
  parseColor, 
  detectTheme,
  ACCENT_PRESETS 
} from '@artifactuse/shared/theme';

// Apply accent color (preset or custom)
setAccentColor('purple');
setAccentColor('#ff6432');
setAccentColor('rgb(255, 100, 50)');

// Parse any color format to RGB
parseColor('#ff6432');  // Returns '255 100 50'
parseColor('rgb(255, 100, 50)');  // Returns '255 100 50'

// Detect theme from URL or system preference
const theme = detectTheme();  // 'dark' or 'light'
```

## 🔌 Communication Protocol

### Artifact Loading (SDK → Panel)

When the SDK opens a panel artifact, it sends a `load:artifact` message via the bridge. This is the **primary method** for loading content into panels.

```javascript
// SDK sends this when opening a panel artifact
{
  type: 'artifactuse',
  action: 'load:artifact',
  data: {
    id: 'artifact-id',
    messageId: 'message-id',
    type: 'code',              // or 'form'
    language: 'canvas',        // panel-specific language identifier
    title: 'Artifact Title',
    code: '...',               // The artifact content (JSON string or raw code)
    isInline: false,
    isPreviewable: true,
    isPanelArtifact: true,
    createdAt: '2026-01-19T10:24:25.650Z'
  }
}
```

### Artifact Code Formats by Panel

| Panel | Language Values | Code Format | Needs JSON Parse |
|-------|-----------------|-------------|------------------|
| `editor-panel` (canvas) | `canvas` | JSON: `{width, height, backgroundColor, shapes}` | ✅ Yes |
| `editor-panel` (video) | `video`, `canvas` | JSON: same as canvas | ✅ Yes |
| `form-panel` | `form` | JSON: form configuration | ✅ Yes |
| `json-panel` | `json` | JSON: the data to display | ✅ Yes |
| `diff-panel` | `diff` | JSON: `{oldCode, newCode, language}` | ✅ Yes |
| `svg-panel` | `svg` | Raw SVG markup | ❌ No |
| `html-panel` | `html`, `markdown`, `md` | Raw HTML or Markdown | ❌ No |
| `react-panel` | `react`, `jsx` | Raw JSX/React code | ❌ No |
| `vue-panel` | `vue` | Raw Vue SFC code | ❌ No |
| `sheet-panel` | `csv`, `tsv` | Raw CSV/TSV content | ❌ No |
| `code-panel` | `javascript`, `typescript`, `js`, `ts`, `sandbox` | Raw code | ❌ No |

### Legacy Messages (Parent → Panel)

These messages are still supported for backwards compatibility:

```javascript
// Set content
iframe.contentWindow.postMessage({
  type: 'setData',  // or setJson, setSvg, setDiff, setCode
  data: { ... }
}, '*');

// Set theme
iframe.contentWindow.postMessage({
  type: 'setTheme',
  data: 'light'
}, '*');

// Set accent color
iframe.contentWindow.postMessage({
  type: 'setAccent',
  data: '#ff6432'
}, '*');
```

### Panel → Parent

```javascript
// Panel ready
{ type: 'artifactuse', action: 'panel:ready', data: { timestamp } }

// Form submitted
{ 
  type: 'artifactuse',
  action: 'form:submit', 
  data: { formId, action, values, timestamp } 
}

// Form cancelled
{ 
  type: 'artifactuse',
  action: 'form:cancel', 
  data: { formId, action, timestamp } 
}

// Artifact updated (editor panels)
{
  type: 'artifactuse',
  action: 'artifact:update',
  data: { ... }
}
```

## 🎨 Theme Customization

All Tailwind-enabled panels support theme and accent color customization.

### Via URL Parameters

```
/form-panel/?theme=light&accent=purple
/json-panel/?theme=dark&accent=%23ff6432
/svg-panel/?accent=rgb(34,197,94)
```

### Supported Accent Color Formats

| Format | Example | URL Encoded |
|--------|---------|-------------|
| Preset name | `purple` | `?accent=purple` |
| Hex (6-digit) | `#ff6432` | `?accent=%23ff6432` |
| Hex (3-digit) | `#f64` | `?accent=%23f64` |
| RGB function | `rgb(255, 100, 50)` | `?accent=rgb(255,100,50)` |
| Space-separated | `255 100 50` | `?accent=255%20100%2050` |

### Available Accent Presets

`blue`, `green`, `purple`, `rose`, `orange`, `cyan`, `indigo`, `pink`, `teal`, `amber`, `red`

### Via JavaScript

```javascript
import { setAccentColor } from '@artifactuse/shared/theme';

// Preset name
setAccentColor('purple');

// Hex color
setAccentColor('#ff6432');

// RGB
setAccentColor('rgb(255, 100, 50)');
setAccentColor('255 100 50');
```


### CSS Variables

The theme system uses CSS variables that you can override:

```css
:root {
  /* Primary/Accent colors (RGB values without rgb()) */
  --color-primary: 99 102 241;
  --color-primary-hover: 79 70 229;
  
  /* Backgrounds */
  --color-bg: 17 24 39;
  --color-surface: 31 41 55;
  --color-hover: 55 65 81;
  
  /* Text */
  --color-text: 243 244 246;
  --color-text-secondary: 156 163 175;
  --color-text-muted: 107 114 128;
  
  /* Border */
  --color-border: 75 85 99;
  
  /* Semantic */
  --color-success: 34 197 94;
  --color-warning: 234 179 8;
  --color-error: 239 68 68;
}
```

## 🎨 Content Type Routing

| Content Type | Package | Dev Port | CDN Path |
|--------------|---------|----------|----------|
| JSON | `@artifactuse/json-panel` | 5173 | `/json-panel/` |
| SVG | `@artifactuse/svg-panel` | 5174 | `/svg-panel/` |
| Diff / Patch | `@artifactuse/diff-panel` | 5175 | `/diff-panel/` |
| JavaScript / Python | `@artifactuse/code-panel` | 5176 | `/code-panel/` |
| HTML / Markdown | `@artifactuse/html-panel` | 5177 | `/html-panel/` |
| React / JSX | `@artifactuse/react-panel` | 5178 | `/react-panel/` |
| Vue SFC | `@artifactuse/vue-panel` | 5179 | `/vue-panel/` |
| Form / Wizard | `@artifactuse/form-panel` | 5180 | `/form-panel/` |
| CSV / TSV | `@artifactuse/sheet-panel` | 5182 | `/sheet-panel/` |
| Canvas / Whiteboard | `@artifactuse/editor-panel` | 5181 | `/editor-panel/canvas/` |
| Video / Timeline | `@artifactuse/editor-panel` | 5181 | `/editor-panel/video/` |

## 📝 Technical Notes

### JSON Artifact Sanitization

When parsing `artifact.code` that contains JSON, panels automatically sanitize unescaped newlines inside string values. This handles cases where the code extractor doesn't properly escape literal newlines within JSON strings:

```javascript
// Sanitize: Fix unescaped newlines inside JSON string values
code = code.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
  return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
});

const data = JSON.parse(code);
```

**Panels that use this sanitization:**
- `editor-panel` (canvas/video) - parses shape data
- `form-panel` - parses form configuration
- `json-panel` - parses JSON data to display
- `diff-panel` - parses oldCode/newCode structure

**Panels that don't need sanitization** (raw code, no JSON parsing):
- `html-panel` - raw HTML/Markdown
- `svg-panel` - raw SVG markup
- `react-panel` - raw JSX code
- `vue-panel` - raw Vue SFC code
- `sheet-panel` - raw CSV/TSV content
- `code-panel` - raw JavaScript/Python code

### Bridge Event Handler Pattern

All panels should implement the `load:artifact` handler in their initialization:

```javascript
bridge = createBridge({ debug: import.meta.env?.DEV });

// Primary: Handle artifact loading from SDK
bridge.on('load:artifact', (artifact) => {
  console.log('Loading artifact:', artifact);
  
  // Check language
  if (artifact.language !== 'expected-language') {
    console.warn('Unsupported artifact language:', artifact.language);
    return;
  }
  
  // For JSON-based artifacts: sanitize and parse
  let code = artifact.code;
  code = code.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  });
  const data = JSON.parse(code);
  
  // Or for raw code artifacts: use directly
  // const content = artifact.code;
  
  // Load the data
  loadData(data);
});

bridge.signalReady();
```

## 📁 Structure

```
artifactuse-panels/
├── packages/
│   ├── json-panel/          # JSON tree viewer
│   ├── svg-panel/           # SVG viewer
│   ├── diff-panel/          # Diff viewer
│   ├── html-panel/          # HTML + Markdown preview
│   ├── react-panel/         # React/JSX preview
│   ├── vue-panel/           # Vue SFC preview
│   ├── form-panel/          # Forms, wizards
│   ├── sheet-panel/         # CSV/TSV spreadsheet
│   ├── code-panel/          # JS + Python runtime
│   ├── editor-panel/        # Canvas + Video editor
│   └── shared/              # Bridge + theme utilities
│
├── worker/                  # Cloudflare Worker
│   ├── src/index.js
│   ├── wrangler.toml
│   └── scripts/
│
├── scripts/
│   ├── deploy.sh            # AWS S3/CloudFront deployment
│   └── deploy-cloudflare.sh # Cloudflare Workers deployment
│
├── package.json             # Monorepo root
└── turbo.json               # Turborepo config
```

## 🛠 Development

### Mock Data

In development mode, panels automatically load mock data from `@artifactuse/shared/mockData.js`:

```javascript
import { getMockData } from '@artifactuse/shared';

const formData = getMockData('form');
const jsonData = getMockData('json');
const svgData = getMockData('svg');
const diffData = getMockData('diff');
```

### Adding a New Panel with Tailwind

1. Create package directory:
```bash
mkdir -p packages/my-panel/src
```

2. Create `package.json`:
```json
{
  "name": "@artifactuse/my-panel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@artifactuse/shared": "*",
    "vue": "^3.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.0.0"
  }
}
```

3. Create `tailwind.config.js`:
```javascript
import sharedConfig from '@artifactuse/shared/tailwind.config';

export default {
  ...sharedConfig,
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
}
```

4. Create `postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

5. Import shared styles in your component:
```javascript
import '@artifactuse/shared/styles.css';
```

6. Implement artifact loading:
```javascript
import { createBridge } from '@artifactuse/shared/bridge';

const bridge = createBridge({ debug: import.meta.env?.DEV });

bridge.on('load:artifact', (artifact) => {
  if (artifact.language !== 'my-language') return;
  
  // Handle artifact.code (parse JSON or use raw)
  loadContent(artifact.code);
});

bridge.signalReady();
```

## 🔧 Tech Stack

- **Build**: Vite 5
- **Framework**: Vue 3 (Composition API)
- **Styling**: Tailwind CSS 3.4
- **Monorepo**: npm workspaces + Turborepo
- **Hosting**: Cloudflare Workers / AWS S3 + CloudFront
- **Editor**: Paper.js, vis-timeline, Peaks.js, FFmpeg.wasm
- **Sandbox**: Pyodide (Python WebAssembly)

## 📄 License

MIT