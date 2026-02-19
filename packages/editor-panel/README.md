# @artifactuse/editor

Canvas and Video Editor package for Artifactuse.

## Architecture

This package ports the original editor codebase to work with Vue 3 + Vite while **maintaining exact functional parity**. The original modules generate JavaScript code strings that execute in the browser.

### Entry Points

- `/public/canvas.html` - Canvas-only editor
- `/public/video.html` - Full video editor with timeline

### CDN Dependencies

The following libraries are loaded via CDN in the HTML files (not bundled):

| Library | Version | Purpose |
|---------|---------|---------|
| **Rough.js** | 4.6.6 | Sketchy/hand-drawn rendering style |
| **Paper.js** | 0.12.17 | Vector editing and path operations |
| **vis-timeline** | 7.7.3 | Video mode timeline (video.html only) |
| **Peaks.js** | 3.2.1 | Audio waveform visualization (video.html only) |
| **FFmpeg.wasm** | 0.12.10 | Video export (dynamically imported) |

### Core Modules

All original source files are in `src/core/`:

```
src/core/
├── config.js        # Configuration and defaults
├── state.js         # State management
├── utils.js         # Utility functions
├── renderer.js      # Canvas rendering with Rough.js
├── tools.js         # Drawing tools
├── clipboard.js     # Cut/copy/paste
├── snapGuides.js    # Snap guide detection
├── interactions.js  # Mouse/keyboard handling
├── layers.js        # Layers panel
├── contextMenu.js   # Right-click menu
├── toolbar.js       # Toolbar HTML
├── styles.js        # CSS styles
├── ui.js            # UI interactions
├── export.js        # PNG/SVG/JSON export
├── setup.js         # Initialization
└── extensions.js    # Video mode extensions
```

### How It Works

1. Vue entry points (`main-canvas.js`, `main-video.js`) import the core modules
2. Modules return **JavaScript strings** containing the editor logic
3. Entry points inject the HTML and execute the scripts in global scope
4. The editor runs exactly as the original, with Vue providing:
   - Entry point management
   - Bridge communication with parent SDK
   - Theme handling

### Video Mode Features

When `videoMode: true`:

- **Timeline**: vis-timeline with tracks, clips, drag-to-reorder
- **Playback**: Play/pause, seeking, frame-by-frame
- **Audio**: Peaks.js waveform visualization
- **Effects**: Filters, transitions, effects clips on timeline
- **Export**: FFmpeg.wasm for MP4/WebM export
- **Screen Presets**: 1080p, 720p, 4K, Vertical, Square, etc.

### Building

```bash
pnpm install
pnpm build
```

Output:
- `dist/canvas/` - Canvas editor assets
- `dist/video-editor/` - Video editor assets

### Development

```bash
pnpm dev
```

- Canvas: http://localhost:3001/canvas.html
- Video: http://localhost:3001/video.html