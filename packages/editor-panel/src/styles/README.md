# Editor Styles

This directory contains the migrated CSS styles for the canvas/video editor.

## Migration Status

**Phase 10 Complete**: All styles from the legacy `core/styles.js` string-based generator have been migrated to proper CSS files.

### Files

- `index.css` - Main stylesheet containing all editor styles

### Usage

Import the CSS in your entry point:

```javascript
import './styles/index.css';
```

### Tailwind CSS

The stylesheet includes Tailwind CSS directives:
- `@tailwind base` - Preflight/reset styles
- `@tailwind components` - Component classes
- `@tailwind utilities` - Utility classes

Tailwind is configured via `tailwind.config.js` in the package root with:
- Dark mode via `class` strategy
- Custom `accent` color (`#6366f1`)
- Custom `gray-850` color

### CSS Variables

The stylesheet uses CSS custom properties for theming. Key variables:

```css
--accent: #6366f1          /* Primary accent color (indigo) */
--accent-hover: #4f46e5    /* Accent hover state */
--accent-light: rgba(...)  /* Light accent for backgrounds */
--panel-bg: #ffffff        /* Panel background color */
--divider: #e5e7eb         /* Divider/border color */
--text-primary: #111827    /* Primary text color */
--text-muted: #6b7280      /* Muted/secondary text */
```

Dark mode is activated by adding the `.dark` class to the body element.

### Architecture

The CSS is organized into logical sections:

1. **CSS Variables** - Theme colors and spacing
2. **Base Layout** - Body, app container, editor structure
3. **Canvas** - Canvas wrapper, cursor modes, zoom/pan
4. **Toolbar** - Floating toolbar, tool buttons, groups
5. **Panels** - Layers panel, menu panel, popups
6. **Options Bar** - Shape properties bar
7. **Context Menu** - Right-click menu
8. **Footer Controls** - Zoom controls, help button
9. **Video Mode** - Timeline, playback controls, tracks
10. **vis-timeline Overrides** - Timeline library customization
11. **Light Mode Overrides** - Video workspace light theme
12. **Responsive** - Mobile breakpoint adjustments

### Legacy Code

The legacy `core/styles.js` file is still present for reference but is no longer used.
The `injectLegacyStyles` function in `bridge/legacyBridge.js` is deprecated.

### Future Work

- Consider splitting into component-specific CSS modules
- Add CSS custom properties for more theming options
- Migrate inline styles from HTML generators
