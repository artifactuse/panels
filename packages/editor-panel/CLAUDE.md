# Editor Panel Package

## Overview

`@artifactuse/editor-panel` is a Vue 3 + Vite-based canvas and video editor package providing two editing modes:

- **Canvas Editor** (`canvas.html`): Static drawing/design canvas with shapes, text, images
- **Video Editor** (`video.html`): Full video editor with timeline, clips, effects, transitions, and MP4/WebM export

## Tech Stack

- **Framework**: Vue 3 with Composition API
- **Build**: Vite 5.0.0
- **Styling**: Tailwind CSS 3.4.0 + PostCSS
- **Key Libraries**:
  - Rough.js (hand-drawn style rendering)
  - Paper.js (vector editing & boolean operations)
  - vis-timeline (video timeline UI)
  - Peaks.js (audio waveforms)
  - mp4-muxer (video export)

## Development Commands

```bash
pnpm dev              # Start dev server (canvas mode) - port 3001
pnpm dev:video        # Start dev server (video mode)
pnpm dev:canvas       # Start dev server (canvas mode)
pnpm build            # Production build
pnpm preview          # Preview built assets
pnpm lint             # Run ESLint
pnpm clean            # Remove dist directory
```

## Architecture

### Entry Points

| Entry | HTML | Main JS | Purpose |
|-------|------|---------|---------|
| Canvas | `canvas.html` | `src/main-canvas.js` | Static design mode |
| Video | `video.html` | `src/main-video.js` | Video editing mode |

### Directory Structure

```
src/
├── main-canvas.js          # Canvas entry point
├── main-video.js           # Video entry point
├── App.vue                 # Root UI overlay component
├── composables/            # Vue Composition API modules
│   ├── useEditorState.js   # Core reactive state
│   ├── useRenderer.js      # Canvas rendering pipeline
│   ├── useInteractions.js  # Mouse/touch handlers
│   ├── useHistory.js       # Undo/redo
│   ├── useTools.js         # Shape manipulation
│   ├── useKeyboard.js      # Keyboard shortcuts
│   ├── useClipboard.js     # Copy/paste
│   ├── useExport.js        # PNG/SVG/JSON/MP4/WebM export
│   ├── useSnapGuides.js    # Alignment guides
│   ├── useCropMode.js      # Image cropping
│   ├── useVectorEdit.js    # Path editing
│   ├── useFrameChildren.js # Frame child interaction
│   ├── useVideoState.js    # Video timeline state
│   ├── usePlayback.js      # Video playback control
│   ├── useTimeline.js      # vis-timeline integration
│   ├── useClipManagement.js# Clip CRUD
│   ├── useMediaRegistry.js # Media caching
│   ├── useVideoMode.js     # Video mode init
│   ├── useViewportKeyframes.js # Camera animation
│   └── useRecording.js     # Screen/webcam recording
├── components/
│   ├── canvas/CanvasWrapper.vue
│   ├── toolbar/EditorToolbar.vue
│   ├── panels/MenuPanel.vue
│   ├── panels/LayersPanel.vue
│   ├── context-menu/ContextMenu.vue
│   ├── options-bar/OptionsBar.vue
│   ├── text-editor/TextEditor.vue
│   ├── export/ExportModal.vue
│   ├── footer/FooterControls.vue
│   ├── video/TimelinePanel.vue
│   └── recording/
│       ├── RecordingDialog.vue   # Device selection modal
│       └── RecordingControls.vue # Floating recording bar
├── renderer/shapes/        # Shape-specific renderers
│   ├── index.js            # Barrel export + shape registry
│   ├── rect.js             # rect, diamond, triangle
│   ├── ellipse.js          # ellipse, circle
│   ├── arrow.js            # line, arrow
│   ├── text.js             # text
│   ├── media.js            # image, video
│   ├── freehand.js         # freehand
│   ├── path.js             # Paper.js paths
│   ├── frame.js            # frame containers
│   ├── group.js            # groups
│   ├── cursor.js           # animated cursor
│   └── capture.js          # screen/webcam capture
├── utils/
│   ├── shapes.js           # Shape factories, cloning
│   ├── geometry.js         # Bounds, transforms
│   ├── coordinates.js      # Coordinate conversions
│   ├── hitTesting.js       # Collision detection
│   └── media.js            # Media element caching
├── bridge/
│   ├── legacyBridge.js     # Exposes state globally
│   └── utilsBridge.js      # Exposes utils globally
├── config/
│   └── defaults.js         # Default configuration (670 lines)
└── styles/
    └── index.css           # Tailwind + custom CSS
```

## Shape Types

### Visual Shapes (Rendered to Canvas)

| Type | Description | Renderer | Sketchy Support |
|------|-------------|----------|-----------------|
| `rect` | Rectangle | rect.js | Yes |
| `diamond` | Diamond/rhombus | rect.js | Yes |
| `triangle` | Triangle | rect.js | Yes |
| `ellipse` | Ellipse | ellipse.js | Yes |
| `circle` | Circle | ellipse.js | Yes |
| `line` | Simple line | arrow.js | Yes |
| `arrow` | Line with arrowheads | arrow.js | Yes |
| `freehand` | Freehand drawing | freehand.js | No |
| `path` | Paper.js vector path | path.js | No |
| `text` | Text element | text.js | No |
| `image` | Image element | media.js | No |
| `video` | Video element (video mode) | media.js | No |
| `audio` | Audio element (video mode) | N/A (timeline only) | No |
| `frame` | Container/artboard | frame.js | No |
| `group` | Shape group | group.js | No |
| `cursor` | Animated cursor (video) | cursor.js | No |
| `screenCapture` | Live screen capture (video) | capture.js | No |
| `webcamCapture` | Live webcam capture (video) | capture.js | No |

### Cursor Shape Properties

Cursor shapes have a `cursorKeyframes` array (not to be confused with `viewportKeyframe` shape type):

```javascript
cursor.cursorKeyframes = [
  { time: 0, x: 100, y: 100, easing: 'ease-out' },
  { time: 1, x: 200, y: 150, easing: 'linear', controlIn: {...}, controlOut: {...} }
]
```

- **Adding keyframes**: Double-click on cursor path when cursor is selected
- **Deleting keyframes**: Click keyframe, press Delete (cannot delete last remaining)
- **Default gap**: Configurable via `config.cursorPath.defaultKeyframeGap` (default: 1 second)

### Non-Visual Shape Types (Video Mode)

| Type | Description | Purpose |
|------|-------------|---------|
| `viewportKeyframe` | Camera animation keyframe | Controls viewport pan/zoom over time |
| `effect` | Visual effect clip | Timeline FX (drop shadow, glow, blur, etc.) |
| `filter` | Color filter clip | Timeline FX (brightness, contrast, etc.) |
| `transition` | Transition clip | Timeline FX (fade, wipe, slide, etc.) |

### Shape Categories

```javascript
shapeCategories = {
  geometric: ['rect', 'ellipse', 'circle', 'diamond', 'triangle'],
  drawing: ['line', 'arrow', 'freehand', 'path'],
  media: ['image', 'video', 'audio'],
  text: ['text'],
  container: ['frame', 'group'],
  animation: ['cursor'],
  capture: ['screenCapture', 'webcamCapture'],
  timeline: ['viewportKeyframe', 'effect', 'filter', 'transition']
}
```

## 3D Shape Transforms

### Tilt Handles (Permanent Shape Properties)

Shapes can be tilted in 3D space using dedicated handles on the selection box:

- **TiltX Handle** (left side, red): Tilts shape forward/backward (pitch)
- **TiltY Handle** (bottom side, blue): Tilts shape left/right (yaw)

**Shape Properties:**
```javascript
shape.tiltX  // X-axis tilt in radians (pitch) - range: ±60° (±π/3)
shape.tiltY  // Y-axis tilt in radians (yaw) - range: ±60° (±π/3)
```

**Interaction:**
- Drag TiltX handle up/down to tilt forward/backward
- Drag TiltY handle left/right to tilt left/right
- Hold Shift while dragging to snap to 15° increments
- Combined with rotation for complex 3D orientations

**Implementation Files:**
- `useRenderer.js:672-700` - Applies tilt transforms (skew + scale)
- `useRenderer.js:1039-1087` - Renders tilt handles on selection box
- `useInteractions.js` - Handles tilt drag interactions
- `hitTesting.js:43-82` - Inverse tilt transform for accurate hit testing
- `geometry.js:367-387` - `getTiltXHandle()` / `getTiltYHandle()` positions

**Config (defaults.js `selection` section):**
```javascript
tiltHandleSize: 5,           // Handle radius (× uiScale)
tiltXHandleStroke: '#ef4444', // Red stroke
tiltXHandleFill: '#fecaca',   // Light red fill
tiltYHandleStroke: '#3b82f6', // Blue stroke
tiltYHandleFill: '#bfdbfe',   // Light blue fill
```

**Transform Math:**
```javascript
// Forward transform (renderer):
c.translate(centerX, centerY);
c.transform(1, skewY, skewX, 1, 0, 0);  // Skew
c.scale(scaleFromTiltY, scaleFromTiltX); // Scale
c.translate(-centerX, -centerY);

// Where:
scaleFromTiltX = Math.max(0.1, Math.cos(tiltX));
scaleFromTiltY = Math.max(0.1, Math.cos(tiltY));
skewX = Math.sin(tiltX) * 0.5;
skewY = Math.sin(tiltY) * 0.5;
```

**Hit Testing for Tilted Shapes:**
Uses proper 2×2 matrix inverse (M = Skew × Scale):
```javascript
// Combined matrix: M = [scaleY, skewX*scaleX; skewY*scaleY, scaleX]
// Inverse order: Tilt → Flip → Rotation → Animation (reverse of forward)
```

## Video Mode Features

### 3D Animations (Per-Clip)

Video mode supports 3D animation effects applied to individual clips:

**Animation Type:** `rotate3d`
- Rotates shape in 3D space during entrance/exit
- Uses CSS-like perspective transforms

**Per-Clip Animation Properties:**
```javascript
shape.animation = {
  entrance: { type: 'rotate3d', duration: 0.5, easing: 'ease-out' },
  exit: { type: 'rotate3d', duration: 0.5, easing: 'ease-in' }
}
```

**Available 3D Animations (clipFx.animations):**
- `rotate3d` - 3D rotation effect
- `flip` - Flip animation (Y-axis)
- `spin` - Spin animation (Z-axis rotation)

**Animation Transform Application:**
Animations are applied during the entrance/exit periods of a clip's timeline visibility. The renderer calculates animation progress and applies corresponding transforms.

### Effects (11 presets)
Drop Shadow, Glow, Outline, Vignette, Blur, Film Grain, Glitch, Chromatic Aberration, Pixelate, Sharpen, Emboss

### Filters (8 presets)
Brightness, Contrast, Saturation, Hue Rotate, Grayscale, Sepia, Invert, Temperature

### Transitions (19 types)
Fade, Dissolve, Wipe (Left/Right/Up/Down), Slide (Left/Right/Up/Down), Zoom In/Out, Cross Zoom, Ken Burns, Blur, Spin, Flip, Bounce, Elastic

### Per-Clip Animations
Entrance/exit effects: Fade, Slide (4 directions), Zoom, Wipe, Blur, Dissolve, Spin, Flip, Bounce, Elastic

### Screen Presets
- 1080p (1920×1080)
- 720p (1280×720)
- 4K UHD (3840×2160)
- Vertical HD (1080×1920)
- Square (1080×1080)
- Instagram Portrait (1080×1350)
- Cinematic (2560×1080)
- Twitter (1280×720)
- Facebook Cover (820×312)

### Cursor Types (Animated Cursors)
Pointer, Hand, Text (I-beam), Crosshair, Loading (Spinner), Grab, Grabbing

### Viewport Keyframes
Camera animation with pan/zoom over time. Supports easing: linear, ease-in, ease-out, ease-in-out

### Screen/Webcam Recording
Record screen and webcam (PiP style) with microphone audio:
- Opens device selection dialog (Shift+R)
- Creates `screenCapture` and `webcamCapture` shapes on canvas
- Records to separate MediaRecorder instances
- Converts to video clips when recording stops

**Recording Dialog Flow:**
1. **Sources step**: Select screen source, webcam, microphone, and interaction recording options
2. **Preview step**: Live preview of selected sources, warnings/tips based on selection
3. **Tab Select step** (optional): When recording browser tab with extension, select which tab to track
4. **Recording**: Floating controls bar with pause/resume/stop

**Recording Components:**
- `RecordingDialog.vue` - Multi-step device selection modal with live previews
- `RecordingControls.vue` - Floating control bar during recording (pause/resume/stop, timer)

**Recording Composable:** `useRecording.js`
- `requestScreenCapture()` - Get screen/window/tab stream via `getDisplayMedia()`
- `requestWebcamCapture(deviceId)` - Get camera stream via `getUserMedia()`
- `requestMicrophoneCapture(deviceId)` - Get audio stream
- `startRecording()` / `stopRecording()` - Control recording
- `pauseRecording()` / `resumeRecording()` - Pause/resume recording
- `openRecordingDialog()` / `closeRecordingDialog()` - Dialog control
- Separate blobs for screen and webcam

**Recording State:**
- `isRecording` - Whether currently recording
- `isPaused` - Whether recording is paused
- `recordingDuration` - Current recording duration in seconds
- `recordingDisplaySurface` - Type of capture: 'browser', 'window', or 'monitor'
- `screenStream` / `webcamStream` / `audioStream` - Active MediaStreams
- `availableVideoDevices` / `availableAudioDevices` - Enumerated devices

**Cursor Recorder Extension:**
Optional browser extension for accurate cursor tracking across tabs:
- `checkExtension()` - Check if extension is installed and get version
- `connectExtension(extensionId)` - Connect to extension by ID
- `startExtensionRecording()` / `stopExtensionRecording()` - Control extension tracking
- `setRecordedTab(tabId)` - Set which tab to track (null = all tabs)
- Extension ID stored in localStorage for reconnection

### Interaction Recording
Parent toggle in RecordingDialog that groups cursor-related features:
- **Show Cursor Overlay**: Creates an animated cursor clip that follows mouse movements
- **Auto-Zoom on Clicks**: Automatically zooms to click locations (configurable 1.5x-4x)

These features can be enabled independently:
| Interaction Recording | Cursor Overlay | Auto-Zoom | Result |
|----------------------|----------------|-----------|--------|
| OFF | - | - | No cursor/click data captured |
| ON | OFF | OFF | Click data captured (for future use) |
| ON | ON | OFF | Cursor overlay shown |
| ON | OFF | ON | No cursor, but zoom on clicks works |
| ON | ON | ON | Cursor overlay + zoom on clicks |

Recording state variables:
- `recordInteractions` - Master toggle for cursor/click data capture
- `recordCursor` - Whether to show cursor overlay in output
- `autoZoomOnClick` - Whether to generate viewport keyframes for zoom
- `zoomLevel` - Zoom level (1.5x - 4x)

### Video Frame Caching
Videos cache their last valid frame to prevent placeholder flicker during timeline scrubbing:
- `cacheVideoFrame(shapeId, video, width, height)` - Cache current frame to OffscreenCanvas
- `getCachedVideoFrame(shapeId)` - Retrieve cached frame
- Used when `video.readyState < 2` (video is seeking)
- Cache cleared when shape is unregistered

## Keyboard Shortcuts

### Tool Shortcuts (Single Key)
| Key | Tool |
|-----|------|
| V | Select |
| H | Hand (pan) |
| R | Rectangle |
| D | Diamond |
| O | Ellipse |
| T | Triangle |
| A | Arrow |
| L | Line |
| P | Pen (path) |
| X | Text |
| I | Image (opens file picker) |
| E | Eraser |
| F | Frame |
| C | Cursor (video mode) |

### Video Mode Media Shortcuts
| Key | Action |
|-----|--------|
| I | Insert image |
| U | Insert video |
| M | Insert audio |

### Video Playback Shortcuts
| Key | Action |
|-----|--------|
| Space | Play/pause |
| K | Play/pause |
| J | Skip back 5s |
| L | Skip forward 5s |
| , | Previous frame |
| . | Next frame |
| S | Split at playhead |
| Home | Go to start |
| End | Go to end |
| Shift+K | Add camera keyframe |
| Shift+R | Open recording dialog |

### Modifier Shortcuts (Ctrl/Cmd)
| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+A | Select all |
| Ctrl+C | Copy |
| Ctrl+X | Cut |
| Ctrl+V | Paste |
| Ctrl+D | Duplicate |
| Ctrl+G | Group |
| Ctrl+Shift+G | Ungroup |
| Ctrl+S | Save as JSON |
| Ctrl+O | Open/import |
| Ctrl+Shift+E | Export PNG |
| Ctrl+[ | Send backward |
| Ctrl+] | Bring forward |
| Ctrl+Shift+[ | Send to back |
| Ctrl+Shift+] | Bring to front |
| Ctrl++ | Zoom in |
| Ctrl+- | Zoom out |
| Ctrl+0 | Reset zoom |
| Ctrl+1 | Zoom to fit |

### Boolean Operations (Ctrl+Alt)
| Shortcut | Action |
|----------|--------|
| Ctrl+Alt+U | Union |
| Ctrl+Alt+S | Subtract |
| Ctrl+Alt+I | Intersect |
| Ctrl+Alt+E | Exclude |

### Other Shortcuts
| Key | Action |
|-----|--------|
| Delete/Backspace | Delete selected |
| Escape | Exit mode/cancel crop/cancel vector edit |
| Enter | Apply crop/Apply vector edit |
| ? | Show shortcuts help |
| Arrow keys | Nudge 1px |
| Shift+Arrow | Nudge 10px |
| [ | Send backward |
| ] | Bring forward |
| +/= | Zoom in |
| - | Zoom out |
| 0 | Reset zoom |
| 1 | Zoom to fit |

### Mouse Interactions
| Action | Result |
|--------|--------|
| Double-click on empty canvas | Opens text editor to create new text |
| Double-click on text | Enters text edit mode |
| Double-click on image/video | Enters crop mode |
| Double-click on vector shape | Enters vector edit mode |
| Double-click on frame | Edits frame name |
| Double-click on cursor path | Adds keyframe at position |
| Drag TiltX handle (left, red) | Tilt shape forward/backward |
| Drag TiltY handle (bottom, blue) | Tilt shape left/right |
| Shift + drag tilt handle | Snap to 15° increments |

## Configuration (defaults.js)

### Canvas Settings
- Default size: 800×600
- Background color: #ffffff

### Tool Defaults
- Stroke width options: 1, 2, 4
- Roughness levels: 0 (smooth), 1 (medium), 2 (rough)
- Stroke styles: solid, dashed, dotted
- Edge styles: sharp, round
- Arrow types: single, double, none
- Arrow head styles: triangle, open, diamond, circle
- Arrow head sizes: small, medium, large

### Text Options
- 18 font families available
- Default font: Sans-serif
- Default size: 20px
- Supports bold, italic, underline

### Snap Settings
- Enabled by default
- Threshold: 5px
- Shows snap lines (pink)
- Shows dimensions

### Selection Style
- Color: #6366f1 (indigo)
- Handle style: circle
- Handle size: 10px
- Dashed outline
- TiltX handle: red (#ef4444) on left side
- TiltY handle: blue (#3b82f6) on bottom side

### History
- Max states: 50

### Video Settings
- Default duration: 60s
- Preview FPS: 30
- Export FPS: 60 (configurable: 24, 30, 60)
- Default preset: 720p
- Default clip duration: 5s

### Control Points
- Handle size: 8px
- Handle colors: white fill, #6366f1 stroke
- Line dash: [4, 4]

### Vector Edit Mode
- Anchor size: 8px
- Handle size: 6px
- Hit tolerance: 10px

### Zoom
- Min: 0.1
- Max: 5
- Step: 0.05
- Default: 1

## State Management

All state is managed via Vue 3 reactive objects in `useEditorState.js`:

```javascript
const { state, config } = getEditorState()

// Key state properties
state.shapes              // Array of all shape objects
state.selectedIndices     // Array of selected shape indices
state.currentTool         // Active tool
state.zoom                // Current zoom level
state.panX, state.panY    // Pan offset
state.currentTime         // Video playback position
state.isPlaying           // Playback state
state.projectDuration     // Total project length
state.tracks              // Timeline tracks
state.videoMode           // Whether in video mode
```

### Interaction Flags
```javascript
state.isDrawing
state.isDragging
state.isPanning
state.isResizing
state.isSelecting
state.isRotating
state.isCropping
state.isVectorEditing
state.isExporting
```

## Composable Pattern

All composables use a singleton pattern:

```javascript
import { getRenderer } from './composables/useRenderer'
import { getEditorState } from './composables/useEditorState'
import { getTools } from './composables/useTools'
import { getHistory } from './composables/useHistory'

const { render } = getRenderer()
const { state } = getEditorState()
const { deleteShapes, duplicateSelected } = getTools()
const { undo, redo, saveState } = getHistory()
```

## Global Window Exposure (Legacy)

For backward compatibility:

```javascript
window.state      // Vue reactive state proxy
window.CONFIG     // Configuration object
window.canvas     // Canvas DOM element
window.ctx        // 2D rendering context
window.render()   // Trigger re-render
window.saveState()// Save to undo history
window.undo()     // Undo
window.redo()     // Redo
```

## Data Flow

1. **User Interaction** → `useInteractions.js` handles mouse/touch
2. **State Mutation** → Modify `state.shapes`, `state.selectedIndices`, etc.
3. **History Capture** → Call `saveState()` for undo support
4. **Render Trigger** → Call `render()` to redraw canvas
5. **UI Update** → Vue reactivity updates components automatically

## Bridge Communication

The editor communicates with parent frames via postMessage:

```javascript
// Ready signal
{ type: 'ready', source: 'canvas-editor' }
{ type: 'ready', source: 'video-editor' }

// Incoming events
{ type: 'load:artifact', artifact: {...} }
{ type: 'theme:change', theme: 'dark', colors: {...} }
```

## Theme System

### Colors (Accent)
- Primary: #6366f1 (indigo)
- Hover: #4f46e5
- Light: rgba(99, 102, 241, 0.1)

### Dark Mode
- Activated via `.dark` class on body
- CSS variables for theming
- `applyTheme()` from @artifactuse/shared

### Color Palettes
**Stroke**: transparent, black, red, green, blue, orange, purple
**Fill**: transparent, light red, light green, light blue, light yellow, light purple, red

## Test Data

Sample projects in `test-data/`:
- `test-video-2min.json` - 2-minute video project
- `test-text-transitions.json` - Text with transitions
- `test-artifactuse-intro.json` - Sample intro
- `test-youtube-thumbnail.json` - Thumbnail example

## Common Tasks

### Adding a New Shape Type

1. Add renderer in `src/renderer/shapes/newtype.js`
2. Register in `src/renderer/shapes/index.js` (drawFunctions map)
3. Add to shapeCategories in index.js
4. Add keyboard shortcut in `useKeyboard.js` SHORTCUTS object
5. Add toolbar button in `EditorToolbar.vue`
6. Add property editing in `OptionsBar.vue`
7. Update `supportsSketchy()` and `supportsFill()` if needed

### Adding a New Effect (Video)

1. Add effect config in `src/config/defaults.js` under `effects.items`
2. Implement effect render logic in `useRenderer.js`
3. Add icon in `EditorToolbar.vue` getEffectIcon function

### Adding a New Filter (Video)

1. Add filter config in `src/config/defaults.js` under `filters.items`
2. Include min/max/default values
3. Implement filter application in `useRenderer.js`

### Adding a New Transition (Video)

1. Add transition config in `src/config/defaults.js` under `transitions.items`
2. Implement transition render logic in `useExport.js`

### Debugging

```javascript
// Force re-render
window.render()

// Check state
console.log(window.state.shapes)
console.log(window.state.selectedIndices)

// Check current tool
console.log(window.state.currentTool)

// Check video state
console.log(window.state.currentTime)
console.log(window.state.tracks)
```

## Key Files by Importance

| File | Purpose | Lines |
|------|---------|-------|
| `useRenderer.js` | Canvas rendering | ~3000 |
| `useInteractions.js` | Mouse/touch handling | ~2000 |
| `useExport.js` | Export (PNG/SVG/MP4) | ~2500 |
| `useTimeline.js` | Video timeline | ~1800 |
| `useEditorState.js` | Core state | ~740 |
| `App.vue` | Root UI | ~1100 |
| `defaults.js` | Configuration | ~670 |
| `index.css` | Styling | ~2000 |
| `useKeyboard.js` | Shortcuts | ~790 |
| `useClipManagement.js` | Clip CRUD | ~750 |

## Notes

- FX clips (effect, filter, transition) are stored in shapes array but skipped during canvas rendering - they're used for timeline display and video export processing
- Canvas transformations use zoom/pan without recalculating coordinates
- Rough.js provides the hand-drawn aesthetic for geometric shapes
- Paper.js handles complex vector path operations and boolean operations
- The package maintains backward compatibility via bridge modules
