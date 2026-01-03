# Artifactuse Panels

Panel artifacts for the Artifactuse SDK. These are standalone apps that run inside iframes and communicate with the parent SDK via postMessage.

## 📊 Overview

| Package | Description | Tier |
|---------|-------------|------|
| `@artifactuse/json-panel` | Interactive JSON tree viewer | 🆓 Free |
| `@artifactuse/svg-panel` | SVG preview with pan/zoom | 🆓 Free |
| `@artifactuse/diff-panel` | Side-by-side diff comparison | 🆓 Free |
| `@artifactuse/html-panel` | HTML + Markdown preview | 🆓 Free |
| `@artifactuse/react-panel` | React/JSX preview | 🆓 Free |
| `@artifactuse/vue-panel` | Vue SFC preview | 🆓 Free |
| `@artifactuse/form-panel` | Interactive forms, wizards, file uploads | 🆓 Free |
| `@artifactuse/editor-panel` | Canvas + Video editor | ⭐ Pro |
| `@artifactuse/code-panel` | JS + Python code execution | ⭐ Pro |
| `@artifactuse/shared` | Bridge + theme utilities | 🆓 Free |

> **Note:** Pro panels require a [Pro subscription](https://artifactuse.com/pricing). Free panels are open source (MIT).

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

### Via Bridge Message

```javascript
// Set theme
bridge.send('setTheme', 'light');  // or 'dark'

// Set accent color (any supported format)
bridge.send('setAccent', '#ff6432');
bridge.send('setAccent', 'purple');
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

## 📁 Structure

```
artifactuse-panels/
├── packages/
│   ├── json-panel/          # JSON tree viewer         🆓
│   ├── svg-panel/           # SVG viewer               🆓
│   ├── diff-panel/          # Diff viewer              🆓
│   ├── html-panel/          # HTML + Markdown preview  🆓
│   ├── react-panel/         # React/JSX preview        🆓
│   ├── vue-panel/           # Vue SFC preview          🆓
│   ├── form-panel/          # Forms, wizards           🆓
│   ├── code-panel/          # JS + Python runtime      ⭐ Pro
│   ├── editor-panel/        # Canvas + Video editor    ⭐ Pro
│   └── shared/              # Bridge + theme utilities
│
├── scripts/deploy.sh        # CDN deployment
├── package.json             # Monorepo root
└── turbo.json               # Turborepo config
```

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
npm run build:editor
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

**Usage:**
```javascript
// Form data structure
const formData = {
  type: 'form',
  id: 'contact-form',
  variant: 'fields',  // 'fields' | 'wizard' | 'buttons'
  title: 'Contact Us',
  description: 'Fill out the form below',
  submitLabel: 'Send',
  cancelLabel: 'Cancel',
  data: {
    layout: 'vertical',  // 'vertical' | 'horizontal' | 'grid'
    fields: [
      { name: 'name', type: 'text', label: 'Name', required: true },
      { name: 'email', type: 'email', label: 'Email', required: true },
      { name: 'message', type: 'textarea', label: 'Message', rows: 4 }
    ]
  }
};

// Send to panel
iframe.contentWindow.postMessage({
  type: 'setData',
  data: formData
}, '*');

// Listen for form submission
window.addEventListener('message', (e) => {
  if (e.data.action === 'form:submit') {
    console.log('Form values:', e.data.data.values);
  }
});
```

**Buttons Example:**
```javascript
const buttonsData = {
  type: 'form',
  variant: 'buttons',
  description: 'How would you like to proceed?',
  data: {
    fields: [
      { type: 'button', id: 'continue', label: 'Continue', style: 'primary' },
      { type: 'button', id: 'skip', label: 'Skip', style: 'secondary' },
      { type: 'button', id: 'cancel', label: 'Cancel', style: 'ghost' }
    ]
  }
};
```

**Button Styles:**
- `primary` - Accent color background
- `secondary` - Subtle background with border
- `ghost` - Transparent background
- `danger` - Red/error color
- `success` - Green/success color

**Mixed Form with Buttons:**
```javascript
// Buttons can also be mixed with input fields
const mixedForm = {
  type: 'form',
  variant: 'fields',
  title: 'Quick Feedback',
  data: {
    fields: [
      { name: 'rating', type: 'rating', label: 'How was your experience?' },
      { name: 'comment', type: 'textarea', label: 'Comments', rows: 2 },
      { type: 'button', id: 'submit', label: 'Submit Feedback', style: 'primary' },
      { type: 'button', id: 'skip', label: 'Skip', style: 'ghost' }
    ]
  }
};
```

**Wizard Example:**
```javascript
const wizardData = {
  type: 'form',
  variant: 'wizard',
  title: 'Onboarding',
  data: {
    showProgress: true,
    steps: [
      {
        id: 'personal',
        title: 'Personal Info',
        fields: [
          { name: 'name', type: 'text', label: 'Full Name', required: true },
          { name: 'email', type: 'email', label: 'Email', required: true }
        ]
      },
      {
        id: 'preferences',
        title: 'Preferences',
        fields: [
          { name: 'theme', type: 'radio', label: 'Theme', options: [
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
        ]
      }
    ]
  }
};
```

### @artifactuse/json-panel

Interactive JSON tree viewer with Tailwind CSS.

**Features:**
- Expand/collapse all nodes
- Search keys and values with highlighting
- Copy value or path to clipboard
- Node statistics
- Theme customization

**Usage:**
```javascript
iframe.contentWindow.postMessage({
  type: 'setJson',
  data: '{"key": "value"}'
}, '*');
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

**Usage:**
```javascript
iframe.contentWindow.postMessage({
  type: 'setSvg',
  data: '<svg>...</svg>'
}, '*');
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

**Usage:**
```javascript
iframe.contentWindow.postMessage({
  type: 'setDiff',
  data: {
    oldCode: 'original text',
    newCode: 'modified text'
  }
}, '*');
```

### @artifactuse/code-panel

JavaScript and Python code execution sandbox.

**Features:**
- JavaScript execution with console capture
- Python execution via Pyodide (WebAssembly)
- Execution time display
- Ctrl/Cmd+Enter to run
- Theme customization

**Usage:**
```javascript
iframe.contentWindow.postMessage({
  type: 'setCode',
  data: {
    code: 'console.log("Hello!");',
    language: 'javascript'  // or 'python'
  }
}, '*');

// Trigger execution
iframe.contentWindow.postMessage({ type: 'run' }, '*');
```

### @artifactuse/editor-panel

Full-featured canvas and video editor.

**Canvas Mode Features:**
- Drawing tools (rect, circle, line, arrow, freehand, text)
- Shape manipulation (resize, rotate, group)
- Layers panel
- Snap guides
- Export to PNG, SVG, JSON

**Video Mode Features:**
- Timeline with tracks
- Audio waveforms
- Clip trimming
- Effects and filters
- FFmpeg export

### @artifactuse/shared

Shared utilities for all panel packages.

#### Bridge (`@artifactuse/shared/bridge`)

```javascript
import { createBridge } from '@artifactuse/shared/bridge';

const bridge = createBridge({ debug: true });

bridge.on('setData', (data) => {
  // Handle incoming data
});

bridge.send('form:submit', { formId, values });
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

### Parent → Panel

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
{ type: 'ready' }

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
```

## 🎨 Content Type Routing

| Content Type | Package | Dev Port | CDN Path | Tier |
|--------------|---------|----------|----------|------|
| JSON | `@artifactuse/json-panel` | 5173 | `/json-panel/` | 🆓 |
| SVG | `@artifactuse/svg-panel` | 5174 | `/svg-panel/` | 🆓 |
| Diff / Patch | `@artifactuse/diff-panel` | 5175 | `/diff-panel/` | 🆓 |
| JavaScript / Python | `@artifactuse/code-panel` | 5176 | `/code-panel/` | ⭐ Pro |
| HTML / Markdown | `@artifactuse/html-panel` | 5177 | `/html-panel/` | 🆓 |
| React / JSX | `@artifactuse/react-panel` | 5178 | `/react-panel/` | 🆓 |
| Vue SFC | `@artifactuse/vue-panel` | 5179 | `/vue-panel/` | 🆓 |
| Form / Wizard | `@artifactuse/form-panel` | 5180 | `/form-panel/` | 🆓 |
| Canvas / Whiteboard | `@artifactuse/editor-panel` | 5181 | `/editor-panel/canvas/` | ⭐ Pro |
| Video / Timeline | `@artifactuse/editor-panel` | 5181 | `/editor-panel/video/` | ⭐ Pro |

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

## 📤 Deployment

### Deploy to CDN

```bash
# Set environment variables
export CDN_BUCKET=your-s3-bucket
export CDN_URL=https://cdn.yourdomain.com
export CLOUDFRONT_DISTRIBUTION_ID=XXXXXX  # Optional

# Deploy to CDN
npm run deploy
```

### CDN URL Structure

After deployment, panels are available at:

```
https://cdn.yourdomain.com/
├── editor-panel/
│   ├── video/       # Video Editor
│   └── canvas/      # Canvas Editor
├── json-panel/      # JSON Viewer
├── svg-panel/       # SVG Viewer
├── diff-panel/      # Diff Viewer
├── code-panel/      # Code Runtime (JS/Python)
├── html-panel/      # HTML Preview
├── react-panel/     # React Preview
├── vue-panel/       # Vue Preview
└── form-panel/      # Form Panel
```

### Configure SDK

Point the Artifactuse SDK to your CDN:

```javascript
provideArtifactuse({
  cdnUrl: 'https://cdn.yourdomain.com',
})
```

## 🔧 Tech Stack

- **Build**: Vite 5
- **Framework**: Vue 3 (Composition API)
- **Styling**: Tailwind CSS 3.4
- **Monorepo**: npm workspaces + Turborepo
- **Editor**: Paper.js, vis-timeline, Peaks.js, FFmpeg.wasm
- **Sandbox**: Pyodide (Python WebAssembly)

## 📄 License

MIT