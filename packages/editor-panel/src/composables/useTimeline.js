// editor/composables/useTimeline.js
// Timeline composable for vis-timeline integration
// Full implementation replacing extensions.js timeline functionality

import { ref, onUnmounted } from 'vue';
import { getEditorState } from './useEditorState.js';

/**
 * Timeline composable for vis-timeline integration
 * Manages timeline initialization, item synchronization, playhead, and edge scrolling
 */
export function useTimeline() {
  const { state, config } = getEditorState();

  // Timeline instance references
  const timelineInstance = ref(null);
  const timelineItems = ref(null);
  const timelineGroups = ref(null);
  const isUpdatingTimeline = ref(false);

  // Playhead state
  const playheadPosition = ref(0);

  // Edge scroll state
  let edgeScrollInterval = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Marquee selection state
  let isMarqueeSelecting = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;
  let marqueeElement = null;

  // Auto-track creation state (for drop zone handling)
  let autoCreatedTrackIds = new Set();
  let currentDragItemId = null;

  /**
   * Initialize vis-timeline
   */
  function initTimeline(containerId = 'timeline-container') {
    // Prevent double initialization
    if (state.timelineInstance) {
      return;
    }

    // Reset loading flags - these will be set to true when ready
    state._playheadLayoutReady = false;
    state._trackTogglesReady = false;

    const container = document.getElementById(containerId);

    if (!container) {
      console.warn('Timeline container not found:', containerId);
      return;
    }

    if (typeof window.vis === 'undefined' || !window.vis.Timeline) {
      console.error('vis-timeline not available. window.vis:', window.vis);
      const loader = document.getElementById('timeline-loader');
      if (loader) {
        loader.innerHTML = '<span style="color: #ef4444;">Failed to load timeline. Please refresh the page.</span>';
      }
      return;
    }

    // Initialize tracks if not present
    if (!state.tracks || state.tracks.length === 0) {
      state.tracks = [
        { id: 'track-1', name: 'Track 1', type: 'video', locked: false, muted: false },
        { id: 'track-2', name: 'Track 2', type: 'video', locked: false, muted: false },
        { id: 'track-3', name: 'Track 3', type: 'audio', locked: false, muted: false },
      ];
    }

    // Create groups (tracks) with drop zones at top and bottom
    const trackGroups = state.tracks.map((track, i) => ({
      id: track.id,
      content: track.name,
      order: i + 1, // Leave room for top drop zone (order 0)
    }));

    // Add drop zones for auto-track creation
    const dropZoneTop = {
      id: '__dropzone_top__',
      content: '<div class="track-dropzone"></div>',
      order: 0,
      className: 'dropzone-group dropzone-top',
    };
    const dropZoneBottom = {
      id: '__dropzone_bottom__',
      content: '<div class="track-dropzone"></div>',
      order: state.tracks.length + 1,
      className: 'dropzone-group dropzone-bottom',
    };

    timelineGroups.value = new window.vis.DataSet([
      dropZoneTop,
      ...trackGroups,
      dropZoneBottom,
    ]);

    // Create items (clips from shapes)
    timelineItems.value = new window.vis.DataSet(getTimelineItems());

    // Get timeline config
    const timelineConfig = config.timeline || {};
    const visTimelineConfig = timelineConfig.visTimeline || {};

    // Track mouse position for edge detection during drag
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopEdgeScroll);

    // Build timeline options
    const options = {
      ...visTimelineConfig,
      min: 0,
      max: Math.max(60, (state.projectDuration || 30) + 30) * 1000,  // projectDuration + 30s padding (min 60s)
      start: 0,
      end: Math.min((state.projectDuration || 30) + 30, 30) * 1000,
      // Explicit editable settings - required for dragging clips
      editable: {
        add: false,
        updateTime: true,
        updateGroup: true,
        remove: false,
      },
      stack: false,
      stackSubgroups: false,
      showCurrentTime: false,
      orientation: 'top',
      selectable: true,
      // Horizontal scrolling with mouse wheel, hold Ctrl/Cmd to zoom
      horizontalScroll: true,
      zoomable: true,
      zoomKey: 'ctrlKey',
      // Disable moveable to allow marquee selection on empty space
      // Users can still scroll horizontally with mouse wheel
      moveable: false,
      zoomMin: 1000,
      zoomMax: 1000 * 60 * 60 * 24,
      margin: { item: { horizontal: 0, vertical: 2 } },
      snap: null,
      onMoving: handleItemMoving,
      onMove: handleItemMove,
      // Group template to allow HTML in group labels (bypasses XSS protection)
      groupTemplate: (group, element) => {
        if (!group) return '';
        // For groups with HTML content, parse and return as DOM element
        if (group.content && group.content.includes('<')) {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = group.content;
          return wrapper.firstChild || wrapper;
        }
        return group.content || '';
      },
    };

    // Configure Hammer.js for more responsive dragging after timeline is created
    const configureHammer = () => {
      if (state.timelineInstance && state.timelineInstance.itemSet) {
        const hammer = state.timelineInstance.itemSet.hammer;
        if (hammer) {
          // Reduce the threshold for pan recognition (default is 10px)
          // Setting to 1 makes it nearly instant
          const pan = hammer.get('pan');
          if (pan) {
            pan.set({ threshold: 1, pointers: 1 });
          }
          // Reduce press time threshold
          const press = hammer.get('press');
          if (press) {
            press.set({ time: 50, threshold: 5 });
          }
        }

        // Also try to access individual item hammers
        if (state.timelineInstance.itemSet.items) {
          Object.values(state.timelineInstance.itemSet.items).forEach(item => {
            if (item.hammer) {
              const itemPan = item.hammer.get('pan');
              if (itemPan) {
                itemPan.set({ threshold: 1, pointers: 1 });
              }
            }
          });
        }
      }
    };

    // Create timeline
    // vis-timeline constructor: new Timeline(container, items, groups, options)
    try {

      state.timelineInstance = new window.vis.Timeline(container, timelineItems.value, timelineGroups.value, options);
      timelineInstance.value = state.timelineInstance;

      // Configure Hammer.js for more responsive dragging
      // Call immediately and also after a delay to ensure it's applied
      configureHammer();
      setTimeout(configureHammer, 100);
      setTimeout(configureHammer, 500);
    } catch (err) {
      console.error('Failed to create vis-timeline:', err);
      return;
    }

    // Setup playhead drag
    setupPlayheadDrag();

    // Setup event handlers
    setupTimelineEvents();

    // Setup context menu
    setupTimelineContextMenu();

    // Inject track toggles (visibility/lock buttons) after a short delay
    // to ensure vis-timeline has rendered the labels
    setTimeout(() => {
      injectTrackToggles();
      setupTrackToggleObserver();
      setupTrackToggleHandlers();

      // Setup marquee selection after vis-timeline has fully rendered
      setupMarqueeSelection();

      // Setup sticky header for vertical scrolling
      setupStickyTimeAxis();

      // Set flag indicating track toggles are ready
      // The Vue component's checkTimelineLoaded() will use this
      state._trackTogglesReady = true;
    }, 100);

    // NOTE: Loader hiding is handled by TimelinePanel.vue's checkTimelineLoaded()
    // which waits for timeline, playhead, and track toggles to all be ready
  }

  /**
   * Handle mouse move for edge scroll detection and drag tracking
   */
  function handleMouseMove(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }

  /**
   * Start edge scrolling
   */
  function startEdgeScroll(direction, speed) {
    if (edgeScrollInterval) return;

    edgeScrollInterval = setInterval(() => {
      if (!state.timelineInstance) return;

      const win = state.timelineInstance.getWindow();
      const shift = direction * speed * 1000;

      const newStart = win.start.getTime() + shift;
      const newEnd = win.end.getTime() + shift;

      // Don't scroll past boundaries
      if (newStart < 0 || newEnd > state.projectDuration * 1000) {
        return;
      }

      state.timelineInstance.setWindow(
        new Date(newStart),
        new Date(newEnd),
        { animation: false }
      );
    }, 50);
  }

  /**
   * Stop edge scrolling
   */
  function stopEdgeScroll() {
    if (edgeScrollInterval) {
      clearInterval(edgeScrollInterval);
      edgeScrollInterval = null;
    }
  }

  /**
   * Find the first track that has no overlapping clips with the given shape
   * @param {Object} shape - The shape to find a track for
   * @param {Map} assignedTracks - Optional map of shapeId -> trackId for shapes already processed
   * @returns {string} - The track ID to use
   */
  function findNonOverlappingTrack(shape, assignedTracks = null) {
    const shapeStart = shape.startTime || 0;
    const shapeEnd = shapeStart + (shape.duration || 5);

    // Check each track in order
    for (const track of state.tracks) {
      // Skip FX tracks for regular shapes
      if (track.id.includes('-fx-')) continue;

      // Check if any shape on this track overlaps with the new shape
      const hasOverlap = state.shapes.some(s => {
        if (s.id === shape.id) return false; // Don't compare with itself
        if (s.startTime === undefined) return false; // Not a timeline shape

        // Get the effective track - either explicit, from assignedTracks map, or default to track-1
        let sTrackId = s.trackId;
        if (!sTrackId && assignedTracks) {
          sTrackId = assignedTracks.get(s.id);
        }
        // If still no trackId and not in assignedTracks, this shape will be processed later
        // Don't consider it as blocking (it will find its own non-overlapping track)
        if (!sTrackId) return false;

        if (sTrackId !== track.id) return false; // Different track

        const sStart = s.startTime || 0;
        const sEnd = sStart + (s.duration || 5);

        // Check for overlap (not just touching)
        return shapeStart < sEnd && shapeEnd > sStart;
      });

      if (!hasOverlap) {
        return track.id;
      }
    }

    // All tracks have overlaps - return the first track as fallback
    // (The user will need to manually adjust or the prompt will warn about this)
    return state.tracks[0]?.id || 'track-1';
  }

  /**
   * Get timeline items from shapes
   * Matches legacy extensions.js getTimelineItems() format
   */
  function getTimelineItems() {
    // Track assignments for shapes without explicit trackId
    // This ensures shapes processed earlier are considered when finding tracks for later shapes
    const assignedTracks = new Map();

    const shapeItems = state.shapes
      .filter(shape => shape.startTime !== undefined)
      .map(shape => {
        // Check if the track is locked
        const track = state.tracks.find(t => t.id === shape.trackId);
        const isLocked = track?.locked === true;

        // Build content with FX indicator if shape has FX or fade transitions
        const hasFx = hasClipFx(shape);
        const clipName = shape.name || getShapeName(shape);
        const content = hasFx
          ? `<span class="clip-fx-indicator" title="Has effects/filters/transitions">FX</span>${clipName}`
          : clipName;

        // Determine track: use explicit trackId, or find a non-overlapping track
        // Pass assignedTracks so it considers shapes already processed in this iteration
        const trackId = shape.trackId || findNonOverlappingTrack(shape, assignedTracks);

        // Record this shape's assigned track for subsequent iterations
        assignedTracks.set(shape.id, trackId);

        return {
          id: shape.id,
          type: 'range',
          group: trackId,
          content: content,
          start: new Date((shape.startTime || 0) * 1000),
          end: new Date(((shape.startTime || 0) + (shape.duration || 5)) * 1000),
          className: getClipClassName(shape) + (isLocked ? ' locked-clip' : '') + (hasFx ? ' has-fx' : ''),
          editable: {
            updateTime: !isLocked,
            updateGroup: !isLocked,
            remove: false,
          },
        };
      });

    return shapeItems;
  }

  /**
   * Check if a shape has any FX (effects, filters, transitions, or fade in/out)
   */
  function hasClipFx(shape) {
    // Check for fx array
    if (shape.fx && Array.isArray(shape.fx) && shape.fx.length > 0) {
      return true;
    }
    // Check for fadeIn/fadeOut
    if (shape.fadeIn > 0 || shape.fadeOut > 0) {
      return true;
    }
    return false;
  }

  /**
   * Get shape name for timeline item
   */
  function getShapeName(shape) {
    if (shape.name) return shape.name;
    // Fallback to type-based name
    const typeNames = {
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      text: 'Text',
      image: 'Image',
      video: 'Video',
      audio: 'Audio',
      frame: 'Frame',
      arrow: 'Arrow',
      line: 'Line',
      freehand: 'Drawing',
      path: 'Path',
      viewportKeyframe: 'Zoom/Pan',
      screenCapture: 'Screen',
      webcamCapture: 'Webcam',
    };
    return typeNames[shape.type] || shape.type;
  }

  /**
   * Get CSS class name for clip based on shape type
   */
  function getClipClassName(shape) {
    const type = shape.type;
    if (type === 'text') return 'text-clip';
    if (type === 'image') return 'image-clip';
    if (type === 'audio') return 'audio-clip';
    if (type === 'video') return 'video-clip';
    if (type === 'effect') return 'effect-clip';
    if (type === 'filter') return 'filter-clip';
    if (type === 'transition') return 'transition-clip';
    if (type === 'viewportKeyframe') return 'viewport-keyframe-clip';
    if (type === 'cursor') return 'cursor-clip';
    if (type === 'screenCapture') return 'capture-clip';
    if (type === 'webcamCapture') return 'capture-clip';
    return 'shape-clip';
  }

  /**
   * Get all clip boundaries (start/end times) across all tracks for snap detection
   */
  function getAllClipBoundaries(excludeId) {
    const boundaries = new Set();
    state.shapes.forEach(shape => {
      if (shape.id !== excludeId && shape.startTime !== undefined) {
        boundaries.add(shape.startTime);
        boundaries.add(shape.startTime + (shape.duration || 5));
      }
    });
    return Array.from(boundaries).sort((a, b) => a - b);
  }

  /**
   * Show vertical snap line at a time position on the timeline
   */
  function showSnapLine(timeSec) {
    if (!state.timelineInstance) return;

    let snapLine = document.getElementById('timeline-snap-line');
    if (!snapLine) {
      snapLine = document.createElement('div');
      snapLine.id = 'timeline-snap-line';
      const snapColor = config.timeline?.snap?.snapLineColor || '#f472b6';
      const snapWidth = config.timeline?.snap?.snapLineWidth || 1;
      snapLine.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        width: ${snapWidth}px;
        background: ${snapColor};
        pointer-events: none;
        z-index: 100;
      `;
      const container = document.querySelector('.vis-content');
      if (container) container.appendChild(snapLine);
    }

    // Convert time to pixel position using vis-timeline's window
    const window = state.timelineInstance.getWindow();
    const windowStart = window.start.getTime();
    const windowEnd = window.end.getTime();
    const containerWidth = state.timelineInstance.dom?.centerContainer?.offsetWidth || 0;

    if (containerWidth > 0) {
      const pixelX = containerWidth * (timeSec * 1000 - windowStart) / (windowEnd - windowStart);
      snapLine.style.left = `${pixelX}px`;
      snapLine.style.display = 'block';
    }
  }

  /**
   * Hide the snap line
   */
  function hideSnapLine() {
    const snapLine = document.getElementById('timeline-snap-line');
    if (snapLine) snapLine.style.display = 'none';
  }

  /**
   * Handle item moving (during drag) - with edge scrolling and drop zone highlighting
   * Note: Auto-track creation is handled by setupItemDragDetection()
   */
  function handleItemMoving(item, callback) {
    // Track the current drag item (also set by setupItemDragDetection)
    currentDragItemId = item.id;

    // Check for edge scrolling
    const timelineBody = document.getElementById('timeline-body');
    if (timelineBody) {
      const rect = timelineBody.getBoundingClientRect();
      const relativeX = lastMouseX - rect.left;
      const edgeThreshold = 80;
      const baseSpeed = 0.3;
      const maxSpeed = 1.5;

      if (relativeX < edgeThreshold && relativeX > -100) {
        const distanceFromEdge = edgeThreshold - relativeX;
        const speedMultiplier = Math.min(maxSpeed, 1 + (distanceFromEdge / edgeThreshold));
        startEdgeScroll(-1, baseSpeed * speedMultiplier);
      } else if (relativeX > rect.width - edgeThreshold && relativeX < rect.width + 100) {
        const distanceFromEdge = relativeX - (rect.width - edgeThreshold);
        const speedMultiplier = Math.min(maxSpeed, 1 + (distanceFromEdge / edgeThreshold));
        startEdgeScroll(1, baseSpeed * speedMultiplier);
      } else {
        stopEdgeScroll();
      }
    }

    // Highlight drop zones when dragging over them
    updateDropZoneHighlight(item.group);

    // Constrain start to not go before 0
    const minTime = 0;
    if (item.start.getTime() < minTime) {
      const duration = item.end.getTime() - item.start.getTime();
      item.start = new Date(minTime);
      item.end = new Date(minTime + duration);
    }

    // Snap to adjacent clips and cross-track alignment
    const snapConfig = config.timeline?.snap;
    if (snapConfig?.enabled !== false) {
      const snapThreshold = snapConfig?.threshold || 0.1;
      const currentStartSec = item.start.getTime() / 1000;
      const currentEndSec = item.end.getTime() / 1000;
      const duration = currentEndSec - currentStartSec;

      let snapped = false;
      hideSnapLine();

      // Get clips on same track (for adjacent snapping)
      const clipsOnTrack = state.shapes.filter(s =>
        s.trackId === item.group &&
        s.id !== item.id &&
        s.startTime !== undefined
      );

      // Snap to adjacent clips on same track
      for (const clip of clipsOnTrack) {
        const clipStart = clip.startTime;
        const clipEnd = clipStart + (clip.duration || 5);

        // Snap our START to their END
        if (Math.abs(currentStartSec - clipEnd) < snapThreshold) {
          item.start = new Date(clipEnd * 1000);
          item.end = new Date((clipEnd + duration) * 1000);
          snapped = true;
          showSnapLine(clipEnd);
          break;
        }

        // Snap our END to their START
        if (Math.abs(currentEndSec - clipStart) < snapThreshold) {
          item.start = new Date((clipStart - duration) * 1000);
          item.end = new Date(clipStart * 1000);
          snapped = true;
          showSnapLine(clipStart);
          break;
        }
      }

      // Cross-track snap lines (snap to any clip boundary across all tracks)
      if (!snapped && snapConfig?.showSnapLines !== false) {
        const allBoundaries = getAllClipBoundaries(item.id);
        for (const boundary of allBoundaries) {
          // Snap START to boundary
          if (Math.abs(currentStartSec - boundary) < snapThreshold) {
            item.start = new Date(boundary * 1000);
            item.end = new Date((boundary + duration) * 1000);
            showSnapLine(boundary);
            snapped = true;
            break;
          }
          // Snap END to boundary
          if (Math.abs(currentEndSec - boundary) < snapThreshold) {
            item.start = new Date((boundary - duration) * 1000);
            item.end = new Date(boundary * 1000);
            showSnapLine(boundary);
            snapped = true;
            break;
          }
        }
      }
    }

    // Dynamically expand timeline if clip extends past current timeline max (with padding)
    const clipEndSeconds = item.end.getTime() / 1000;
    const currentTimelineMax = Math.max(60, (state.projectDuration || 30) + 30);
    const paddedEnd = clipEndSeconds + 30;  // Always 30 sec padding ahead

    if (paddedEnd > currentTimelineMax) {
      if (state.timelineInstance) {
        state.timelineInstance.setOptions({ max: paddedEnd * 1000 });
      }
    }

    callback(item);
  }

  /**
   * Update drop zone highlighting during drag
   */
  function updateDropZoneHighlight(currentGroup) {
    // Target the vis-group elements in the foreground (the actual row backgrounds)
    const topDropZone = document.querySelector('.vis-foreground .vis-group.dropzone-top');
    const bottomDropZone = document.querySelector('.vis-foreground .vis-group.dropzone-bottom');
    // Also target the labels
    const topLabel = document.querySelector('.vis-labelset .vis-label.dropzone-top');
    const bottomLabel = document.querySelector('.vis-labelset .vis-label.dropzone-bottom');

    // Add dragging class to timeline to disable hover effects
    const timeline = document.getElementById('timeline-container');
    if (timeline) {
      timeline.classList.add('timeline-dragging');
    }

    // Update top drop zone
    if (topDropZone) {
      if (currentGroup === '__dropzone_top__') {
        topDropZone.classList.add('dropzone-active');
      } else {
        topDropZone.classList.remove('dropzone-active');
      }
    }
    if (topLabel) {
      if (currentGroup === '__dropzone_top__') {
        topLabel.classList.add('dropzone-active');
      } else {
        topLabel.classList.remove('dropzone-active');
      }
    }

    // Update bottom drop zone
    if (bottomDropZone) {
      if (currentGroup === '__dropzone_bottom__') {
        bottomDropZone.classList.add('dropzone-active');
      } else {
        bottomDropZone.classList.remove('dropzone-active');
      }
    }
    if (bottomLabel) {
      if (currentGroup === '__dropzone_bottom__') {
        bottomLabel.classList.add('dropzone-active');
      } else {
        bottomLabel.classList.remove('dropzone-active');
      }
    }
  }

  /**
   * Clear all drop zone highlights
   */
  function clearDropZoneHighlights() {
    const dropZones = document.querySelectorAll('.dropzone-group, .dropzone-top, .dropzone-bottom');
    dropZones.forEach(zone => zone.classList.remove('dropzone-active'));

    // Remove dragging class from timeline
    const timeline = document.getElementById('timeline-container');
    if (timeline) {
      timeline.classList.remove('timeline-dragging');
    }
  }

  /**
   * Create an auto-generated track (during drag operation)
   */
  function createAutoTrack(refTrackId, position) {
    const refIndex = state.tracks.findIndex(t => t.id === refTrackId);
    if (refIndex < 0) return null;

    const trackNumber = state.tracks.length + 1;
    const newTrack = {
      id: `track-${Date.now()}`,
      name: `Track ${trackNumber}`,
      type: 'video',
      locked: false,
      muted: false,
    };

    const insertIndex = position === 'above' ? refIndex : refIndex + 1;
    state.tracks.splice(insertIndex, 0, newTrack);

    // Track this as an auto-created track for cleanup if emptied
    autoCreatedTrackIds.add(newTrack.id);

    updateTimelineGroups();

    return newTrack;
  }

  /**
   * Check if a clip is the only item on its track
   * @param {string} shapeId - The ID of the shape to check
   * @param {string} trackId - The track ID (may be undefined for auto-assigned shapes)
   */
  function isClipAloneOnTrack(shapeId, trackId) {
    // For shapes without explicit trackId, we need to determine what track they're actually on
    // by using the same logic as getTimelineItems (findNonOverlappingTrack)
    const effectiveTrackId = trackId || getEffectiveTrackId(shapeId);

    const clipsOnTrack = state.shapes.filter(s => {
      if (s.startTime === undefined) return false; // Not a timeline shape
      const sTrackId = s.trackId || getEffectiveTrackId(s.id);
      return sTrackId === effectiveTrackId;
    });
    return clipsOnTrack.length === 1 && clipsOnTrack[0].id === shapeId;
  }

  /**
   * Get the effective track ID for a shape (explicit or auto-assigned)
   */
  function getEffectiveTrackId(shapeId) {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape) return state.tracks[0]?.id || 'track-1';
    return shape.trackId || findNonOverlappingTrack(shape);
  }

  /**
   * Move a track to a new position
   */
  function moveTrackToPosition(trackId, position) {
    const trackIndex = state.tracks.findIndex(t => t.id === trackId);
    if (trackIndex < 0) return false;

    const track = state.tracks[trackIndex];
    state.tracks.splice(trackIndex, 1);

    if (position === 'top') {
      state.tracks.unshift(track);
    } else {
      state.tracks.push(track);
    }

    updateTimelineGroups();
    return true;
  }

  /**
   * Handle item move (after drag ends)
   */
  function handleItemMove(item, callback) {
    stopEdgeScroll();
    clearDropZoneHighlights();
    hideSnapLine();  // Clear snap line when drag ends

    const shape = state.shapes.find(s => s.id === item.id);
    if (!shape) {
      // Clean up auto-created tracks and reset drag state
      cleanupEmptyAutoCreatedTracks();
      resetDragState();
      callback(null);
      return;
    }

    // Get the effective track ID (handles shapes without explicit trackId)
    const effectiveTrackId = shape.trackId || getEffectiveTrackId(shape.id);

    // Handle drop on drop zones
    if (item.group === '__dropzone_top__') {
      // Check if clip is alone on its track - if so, move the track instead of creating new
      if (isClipAloneOnTrack(shape.id, effectiveTrackId)) {
        // Move existing track to top
        moveTrackToPosition(effectiveTrackId, 'top');
        // Ensure shape has explicit trackId now
        shape.trackId = effectiveTrackId;
        item.group = effectiveTrackId;
        shape.startTime = Math.max(0, item.start.getTime() / 1000);
        shape.duration = (item.end.getTime() - item.start.getTime()) / 1000;

        if (typeof window.recalculateProjectDuration === 'function') {
          window.recalculateProjectDuration();
        }
        if (typeof window.saveState === 'function') {
          window.saveState();
        }
        if (typeof window.render === 'function') {
          window.render();
        }
        updateTimelineItems();
        callback(item);
        resetDragState();
        return;
      }

      // Create a new track at the top
      const firstTrack = state.tracks[0];
      const newTrack = createAutoTrack(firstTrack.id, 'above');
      if (newTrack) {
        // Update item to use the new track
        item.group = newTrack.id;
        shape.trackId = newTrack.id;
        shape.startTime = Math.max(0, item.start.getTime() / 1000);
        shape.duration = (item.end.getTime() - item.start.getTime()) / 1000;

        if (typeof window.recalculateProjectDuration === 'function') {
          window.recalculateProjectDuration();
        }
        // Save and re-render
        if (typeof window.saveState === 'function') {
          window.saveState();
        }
        if (typeof window.render === 'function') {
          window.render();
        }

        // Update timeline to reflect new track
        updateTimelineItems();
        callback(item);
        resetDragState();
        return;
      }
    } else if (item.group === '__dropzone_bottom__') {
      // Check if clip is alone on its track - if so, move the track instead of creating new
      if (isClipAloneOnTrack(shape.id, effectiveTrackId)) {
        // Move existing track to bottom
        moveTrackToPosition(effectiveTrackId, 'bottom');
        // Ensure shape has explicit trackId now
        shape.trackId = effectiveTrackId;
        item.group = effectiveTrackId;
        shape.startTime = Math.max(0, item.start.getTime() / 1000);
        shape.duration = (item.end.getTime() - item.start.getTime()) / 1000;

        if (typeof window.recalculateProjectDuration === 'function') {
          window.recalculateProjectDuration();
        }
        if (typeof window.saveState === 'function') {
          window.saveState();
        }
        if (typeof window.render === 'function') {
          window.render();
        }
        updateTimelineItems();
        callback(item);
        resetDragState();
        return;
      }

      // Create a new track at the bottom
      const lastTrack = state.tracks[state.tracks.length - 1];
      const newTrack = createAutoTrack(lastTrack.id, 'below');
      if (newTrack) {
        // Update item to use the new track
        item.group = newTrack.id;
        shape.trackId = newTrack.id;
        shape.startTime = Math.max(0, item.start.getTime() / 1000);
        shape.duration = (item.end.getTime() - item.start.getTime()) / 1000;

        if (typeof window.recalculateProjectDuration === 'function') {
          window.recalculateProjectDuration();
        }
        // Save and re-render
        if (typeof window.saveState === 'function') {
          window.saveState();
        }
        if (typeof window.render === 'function') {
          window.render();
        }

        // Update timeline to reflect new track
        updateTimelineItems();
        callback(item);
        resetDragState();
        return;
      }
    }

    // Check if target track is locked
    const targetTrack = state.tracks.find(t => t.id === item.group);
    if (targetTrack?.locked) {
      // Revert to original position
      cleanupEmptyAutoCreatedTracks();
      resetDragState();
      callback(null);
      updateTimelineItems();
      return;
    }

    // Check for overlap with other clips on same track
    const startTime = item.start.getTime() / 1000;
    const endTime = item.end.getTime() / 1000;

    const hasShapeOverlap = state.shapes.some(s => {
      if (s.id === item.id) return false;
      if (s.startTime === undefined) return false;
      // Get effective track for shapes without explicit trackId
      const sEffectiveTrack = s.trackId || getEffectiveTrackId(s.id);
      if (sEffectiveTrack !== item.group) return false;

      const sEnd = s.startTime + (s.duration || 5);
      const tolerance = 0.001;
      return startTime < sEnd - tolerance && endTime > s.startTime + tolerance;
    });

    if (hasShapeOverlap) {
      cleanupEmptyAutoCreatedTracks();
      resetDragState();
      callback(null);
      updateTimelineItems();
      return;
    }

    // Update shape
    shape.startTime = Math.max(0, startTime);
    shape.duration = endTime - startTime;
    shape.trackId = item.group;

    // Clean up empty auto-created tracks (the clip may have moved to a different track)
    cleanupEmptyAutoCreatedTracks();
    resetDragState();

    // Recalculate project duration based on clip positions
    if (typeof window.recalculateProjectDuration === 'function') {
      window.recalculateProjectDuration();
    }

    // Save state
    if (typeof window.saveState === 'function') {
      window.saveState();
    }

    // Re-render
    if (typeof window.render === 'function') {
      window.render();
    }

    callback(item);
  }

  /**
   * Clean up empty tracks after clip operations (drag, delete, duplicate, etc.)
   * Removes ALL empty tracks, keeping at least one track
   */
  function cleanupEmptyAutoCreatedTracks() {
    // Always check all tracks, not just auto-created ones
    if (state.tracks.length <= 1) return; // Keep at least one track

    // Find all empty tracks
    const tracksToRemove = [];

    state.tracks.forEach(track => {
      // Check if any shape has this track as explicit or effective trackId
      // (includes viewport keyframes which are now shapes)
      const hasClips = state.shapes.some(s => {
        if (s.startTime === undefined) return false;
        const effectiveTrack = s.trackId || getEffectiveTrackId(s.id);
        return effectiveTrack === track.id;
      });

      if (!hasClips) {
        tracksToRemove.push(track.id);
      }
    });

    // Keep at least one track even if all are empty
    if (tracksToRemove.length === state.tracks.length) {
      tracksToRemove.pop(); // Keep the last track
    }

    // Remove empty tracks
    tracksToRemove.forEach(trackId => {
      const index = state.tracks.findIndex(t => t.id === trackId);
      if (index >= 0) {
        state.tracks.splice(index, 1);
      }
      // Remove from tracking set if it was there
      autoCreatedTrackIds.delete(trackId);
    });

    // Update timeline if any tracks were removed
    if (tracksToRemove.length > 0) {
      updateTimelineGroups();
    }
  }

  /**
   * Reset drag state - only clears temporary drag state, not auto-created track tracking
   */
  function resetDragState() {
    // Don't clear autoCreatedTrackIds here - we need to keep tracking them
    // for cleanup when clips are moved away from them
    currentDragItemId = null;
  }

  /**
   * Setup timeline event handlers
   */
  function setupTimelineEvents() {
    if (!state.timelineInstance) return;

    // Handle selection
    state.timelineInstance.on('select', (props) => {
      state.selectedIndices = [];
      state.selectedFrameChildren = [];

      props.items.forEach(itemId => {
        const idx = state.shapes.findIndex(s => s.id === itemId);
        if (idx >= 0) state.selectedIndices.push(idx);
      });

      if (typeof window.render === 'function') {
        window.render();
      }

      // Show/hide options bar based on selection
      if (state.selectedIndices.length > 0) {
        if (typeof window.showOptionsBar === 'function') {
          window.showOptionsBar();
        }
      } else {
        if (typeof window.hideOptionsBar === 'function') {
          window.hideOptionsBar();
        }
      }
    });

    // Handle double-click
    state.timelineInstance.on('doubleClick', (props) => {
      if (props.item) {
        const shapeIndex = state.shapes.findIndex(s => s.id === props.item);
        if (shapeIndex >= 0) {
          const shape = state.shapes[shapeIndex];
          state.selectedIndices = [shapeIndex];

          // For viewport keyframes, jump to time and apply viewport
          if (shape.type === 'viewportKeyframe') {
            state.currentTime = shape.startTime || 0;
            state.zoom = shape.zoom ?? 1;
            state.panX = shape.panX ?? 0;
            state.panY = shape.panY ?? 0;
            if (typeof window.seekTo === 'function') {
              window.seekTo(shape.startTime || 0);
            }
            if (typeof window.render === 'function') {
              window.render();
            }
          }

          if (typeof window.showOptionsBar === 'function') {
            window.showOptionsBar();
          }
        }
      }
    });

    // Handle track control clicks
    document.addEventListener('click', handleTrackControlClick);

    // Note: Auto-track creation is now handled via drop zones
    // Drop zones are special groups at top/bottom that trigger track creation
    // when a clip is dropped on them (handled in handleItemMove)
  }

  /**
   * Handle track control button clicks (legacy handler, kept for compatibility)
   */
  function handleTrackControlClick(e) {
    const btn = e.target.closest('.track-btn');
    if (!btn) return;

    const trackContent = btn.closest('.track-content');
    if (!trackContent) return;

    const trackId = trackContent.dataset.trackId;
    const action = btn.dataset.action;
    const track = state.tracks.find(t => t.id === trackId);

    if (!track) return;

    if (action === 'lock') {
      track.locked = !track.locked;
    } else if (action === 'mute') {
      track.muted = !track.muted;
      // Mute/unmute all clips on this track
      state.shapes.forEach(shape => {
        if (shape.trackId === trackId) {
          shape.muted = track.muted;
        }
      });
    }

    // Update track content
    updateTimelineGroups();
  }

  /**
   * Inject track toggles (visibility/lock buttons) into vis-timeline labels
   * Matches legacy extensions.js injectTrackToggles() behavior
   */
  function injectTrackToggles() {
    const labels = document.querySelectorAll('.vis-labelset .vis-label .vis-inner');
    const showTrackNames = config.timeline?.showTrackNames !== false;

    labels.forEach(label => {
      // Skip if already has our toggles
      const existingHeader = label.querySelector('.track-header');
      if (existingHeader && existingHeader.querySelector('.track-toggle')) {
        // Update track name visibility if config changed
        const trackNameEl = existingHeader.querySelector('.track-name');
        if (trackNameEl) {
          trackNameEl.style.display = showTrackNames ? '' : 'none';
        }
        return;
      }

      // Get track by name from the text content
      const trackName = label.textContent.trim();
      const track = state.tracks.find(t => t.name === trackName);

      if (!track) return;

      const isVisible = track.visible !== false;
      const isLocked = track.locked === true;

      const visibleIcon = isVisible
        ? '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

      const lockIcon = isLocked
        ? '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        : '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

      const trackNameDisplay = showTrackNames ? '' : 'display: none;';

      label.innerHTML = `
        <div class="track-header" data-track-id="${track.id}">
          <button class="track-toggle track-visibility ${isVisible ? 'active' : ''}" data-action="visibility" data-track-id="${track.id}" title="${isVisible ? 'Hide track' : 'Show track'}">
            ${visibleIcon}
          </button>
          <button class="track-toggle track-lock ${isLocked ? 'active' : ''}" data-action="lock" data-track-id="${track.id}" title="${isLocked ? 'Unlock track' : 'Lock track'}">
            ${lockIcon}
          </button>
          <span class="track-name" style="${trackNameDisplay}">${track.name}</span>
        </div>
      `;
    });
  }

  /**
   * Setup MutationObserver to re-inject track toggles when vis-timeline updates labels
   */
  function setupTrackToggleObserver() {
    const labelset = document.querySelector('.vis-labelset');
    if (!labelset || labelset._toggleObserverSet) return;

    const observer = new MutationObserver((mutations) => {
      let needsReinjection = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const target = mutation.target;
          if (target.classList?.contains('vis-inner')) {
            if (!target.querySelector('.track-header')) {
              needsReinjection = true;
              break;
            }
          }
        }
      }

      if (needsReinjection) {
        injectTrackToggles();
      }
    });

    observer.observe(labelset, {
      childList: true,
      subtree: true
    });

    labelset._toggleObserverSet = true;
  }

  /**
   * Update track toggle icons without full re-injection
   */
  function updateTrackToggleIcons() {
    document.querySelectorAll('.track-header').forEach(header => {
      const trackId = header.dataset.trackId;
      const track = state.tracks.find(t => t.id === trackId);
      if (!track) return;

      const isVisible = track.visible !== false;
      const isLocked = track.locked === true;

      const visBtn = header.querySelector('.track-visibility');
      const lockBtn = header.querySelector('.track-lock');

      if (visBtn) {
        visBtn.classList.toggle('active', isVisible);
        visBtn.innerHTML = isVisible
          ? '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      }

      if (lockBtn) {
        lockBtn.classList.toggle('active', isLocked);
        lockBtn.innerHTML = isLocked
          ? '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
          : '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
      }
    });
  }

  /**
   * Setup click handlers for track toggles using event delegation
   */
  function setupTrackToggleHandlers() {
    const labelset = document.querySelector('.vis-labelset');
    if (!labelset || labelset._trackToggleHandlerSet) return;

    labelset.addEventListener('click', (e) => {
      const toggle = e.target.closest('.track-toggle');
      if (!toggle) return;

      e.preventDefault();
      e.stopPropagation();

      const trackId = toggle.dataset.trackId;
      const action = toggle.dataset.action;
      const track = state.tracks.find(t => t.id === trackId);

      if (!track) return;

      if (action === 'visibility') {
        track.visible = track.visible === false ? true : false;
        // Update visibility of shapes on this track
        updateTrackShapesVisibility(trackId, track.visible);
      } else if (action === 'lock') {
        track.locked = !track.locked;
        // Update timeline items to reflect lock state
        updateTimelineItems();
      }

      // Update just the icons
      updateTrackToggleIcons();

      if (typeof window.render === 'function') {
        window.render();
      }
      if (typeof window.saveState === 'function') {
        window.saveState();
      }
    });

    labelset._trackToggleHandlerSet = true;
  }

  /**
   * Update visibility of all shapes on a track
   */
  function updateTrackShapesVisibility(trackId, visible) {
    state.shapes.forEach(shape => {
      if (shape.trackId === trackId) {
        shape.visible = visible;

        // Also mute/unmute audio for video and audio clips
        if (shape.type === 'video' || shape.type === 'audio') {
          let mediaElement = shape.videoElement || shape.audioElement;
          if (!mediaElement && typeof window.getMediaElement === 'function') {
            mediaElement = window.getMediaElement(shape.id);
          }
          if (mediaElement) {
            mediaElement.muted = !visible;
          }
        }
      }
    });
  }

  /**
   * Setup sticky time axis behavior for vertical scrolling
   * Keeps the time axis and left panel corner header visible when scrolling
   */
  function setupStickyTimeAxis() {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;

    const visTop = timelineContainer.querySelector('.vis-panel.vis-top');
    const visLeft = timelineContainer.querySelector('.vis-panel.vis-left');
    if (!visTop || !visLeft) return;

    // Create corner header element to fill the top-left gap
    // This matches the height of .vis-panel.vis-top and width of .vis-panel.vis-left
    let cornerHeader = timelineContainer.querySelector('.timeline-corner-header');
    if (!cornerHeader) {
      cornerHeader = document.createElement('div');
      cornerHeader.className = 'timeline-corner-header';
      timelineContainer.appendChild(cornerHeader);
    }

    // Get dimensions from vis-timeline panels
    const updateCornerDimensions = () => {
      const topHeight = visTop.offsetHeight || 23;
      const leftWidth = visLeft.offsetWidth || 60;

      cornerHeader.style.width = leftWidth + 'px';
      cornerHeader.style.height = topHeight + 'px';
    };

    // Initial dimension update
    updateCornerDimensions();

    // Update dimensions when timeline redraws (in case label widths change)
    if (state.timelineInstance) {
      state.timelineInstance.on('changed', updateCornerDimensions);
    }

    // Optimize for GPU acceleration and compositing
    visTop.style.willChange = 'transform';
    visTop.style.backfaceVisibility = 'hidden';
    cornerHeader.style.willChange = 'transform';
    cornerHeader.style.backfaceVisibility = 'hidden';

    // Cache reference to axis overlay (may be created later)
    let axisOverlay = null;

    // Apply transforms synchronously for instant response
    // Using passive listener + synchronous update is faster than RAF for scroll
    const applyTransform = () => {
      const scrollTop = timelineContainer.scrollTop;
      visTop.style.transform = `translate3d(0, ${scrollTop}px, 0)`;
      cornerHeader.style.transform = `translate3d(0, ${scrollTop}px, 0)`;

      // Get axis overlay reference if not cached yet
      if (!axisOverlay) {
        axisOverlay = timelineContainer.querySelector('#time-axis-overlay');
        if (axisOverlay) {
          axisOverlay.style.willChange = 'transform';
          axisOverlay.style.backfaceVisibility = 'hidden';
        }
      }
      if (axisOverlay) {
        axisOverlay.style.transform = `translate3d(0, ${scrollTop}px, 0)`;
      }
    };

    // Apply initial transform
    applyTransform();

    // Listen for scroll events - synchronous update for smoothness
    timelineContainer.addEventListener('scroll', applyTransform, { passive: true });
  }

  /**
   * Setup playhead drag functionality
   * Creates a custom playhead element matching legacy extensions.js behavior
   */
  function setupPlayheadDrag() {
    const timelineContainer = document.getElementById('timeline-container');
    const timelineBody = document.getElementById('timeline-body');
    if (!timelineContainer || !timelineBody || !state.timelineInstance) return;

    // Remove any existing playhead to prevent duplicates
    const existingPlayhead = document.getElementById('custom-playhead');
    if (existingPlayhead) {
      existingPlayhead.remove();
    }

    // Remove vis-timeline's custom time if present
    try {
      state.timelineInstance.removeCustomTime('playhead');
    } catch(e) {}

    // Get playhead color from config
    const playheadColor = config.timeline?.playheadColor || '#ef4444';

    // Create custom playhead element (matching legacy structure)
    const playhead = document.createElement('div');
    playhead.id = 'custom-playhead';
    playhead.innerHTML = '<div class="playhead-handle"></div><div class="playhead-line"></div>';
    timelineContainer.appendChild(playhead);

    // Apply color from config
    playhead.style.setProperty('--playhead-color', playheadColor);

    // Position absolutely within timeline container
    playhead.style.position = 'absolute';
    playhead.style.top = '0';
    // Don't use bottom: 0 - we'll set explicit height to cover scrollable content
    playhead.style.zIndex = '200';
    playhead.style.pointerEvents = 'auto';
    playhead.style.display = 'none'; // Hide until position is ready

    let isDraggingPlayhead = false;
    let wasPlaying = false;
    let layoutRetryCount = 0;
    const MAX_LAYOUT_RETRIES = 20;

    // Update playhead position based on timeline window
    const updatePlayheadPosition = () => {
      if (!state.timelineInstance) return;

      const win = state.timelineInstance.getWindow();
      const windowStart = win.start.getTime();
      const windowEnd = win.end.getTime();
      const windowDuration = windowEnd - windowStart;

      // Check if timeline window is valid
      if (windowDuration <= 0.1 || !isFinite(windowDuration)) {
        playhead.style.display = 'none';
        setTimeout(updatePlayheadPosition, 50);
        return;
      }

      // Get the labelset (track headers) to determine left offset
      const labelset = timelineContainer.querySelector('.vis-labelset');
      if (!labelset) {
        playhead.style.display = 'none';
        setTimeout(updatePlayheadPosition, 50);
        return;
      }

      // Get the center panel for width calculation
      const visCenter = timelineContainer.querySelector('.vis-panel.vis-center');
      if (!visCenter) {
        playhead.style.display = 'none';
        setTimeout(updatePlayheadPosition, 50);
        return;
      }

      const labelsetWidth = labelset.offsetWidth;
      const centerWidth = visCenter.offsetWidth;

      // Wait for layout to be ready
      if (centerWidth <= 0 || labelsetWidth <= 0) {
        playhead.style.display = 'none';
        if (layoutRetryCount < MAX_LAYOUT_RETRIES) {
          layoutRetryCount++;
          setTimeout(updatePlayheadPosition, 50);
        }
        return;
      }

      // Layout is ready
      layoutRetryCount = 0;
      state._playheadLayoutReady = true;

      // Use labelset width as the left offset (center panel starts right after labelset)
      const leftOffset = labelsetWidth;
      const currentTimeMs = state.currentTime * 1000;
      const progress = (currentTimeMs - windowStart) / windowDuration;
      const safeProgress = isFinite(progress) ? progress : 0;
      const xPos = leftOffset + (safeProgress * centerWidth);

      playhead.style.left = xPos + 'px';
      playhead.style.display = 'block';

      // Set playhead height to cover full scrollable content
      const foreground = timelineContainer.querySelector('.vis-foreground');
      if (foreground) {
        const contentHeight = foreground.scrollHeight || foreground.offsetHeight;
        // Add some padding to ensure it extends past all tracks
        playhead.style.height = Math.max(contentHeight, timelineContainer.scrollHeight) + 'px';
      }

      // Adjust opacity for out-of-view playhead
      if (safeProgress < 0) {
        playhead.style.left = leftOffset + 'px';
        playhead.style.opacity = '0.4';
      } else if (safeProgress > 1) {
        playhead.style.left = (leftOffset + centerWidth) + 'px';
        playhead.style.opacity = '0.4';
      } else {
        playhead.style.opacity = '1';
      }
    };

    // Store the update function globally
    window.updatePlayheadPosition = updatePlayheadPosition;

    // Seek function for playhead drag
    const seekFromEvent = (e) => {
      const visCenter = timelineBody.querySelector('.vis-panel.vis-center');
      if (!visCenter || !state.timelineInstance) return;

      const rect = visCenter.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, relativeX / rect.width));

      const win = state.timelineInstance.getWindow();
      const timeMs = win.start.getTime() + progress * (win.end.getTime() - win.start.getTime());
      const time = Math.max(0, Math.min(timeMs / 1000, state.projectDuration || 60));

      if (typeof window.seekTo === 'function') {
        window.seekTo(time, false);
      } else {
        seekToTime(time);
      }
      updatePlayheadPosition();
    };

    // Start drag handler
    const startDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingPlayhead = true;
      wasPlaying = state.isPlaying;

      if (wasPlaying && typeof window.pause === 'function') {
        window.pause();
      }

      seekFromEvent(e);

      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onDragEnd);
    };

    const onDrag = (e) => {
      if (!isDraggingPlayhead) return;
      seekFromEvent(e);
    };

    const onDragEnd = () => {
      isDraggingPlayhead = false;
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onDragEnd);

      if (wasPlaying && typeof window.play === 'function') {
        window.play();
      }
    };

    // Playhead drag events
    playhead.addEventListener('mousedown', startDrag);

    // Create axis overlay for click-to-seek on time axis
    // Note: Append to timelineContainer (not visCenter) to avoid interfering with vis-timeline events
    const axisOverlay = document.createElement('div');
    axisOverlay.id = 'time-axis-overlay';
    axisOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;height:30px;cursor:pointer;z-index:50;';
    timelineContainer.appendChild(axisOverlay);

    axisOverlay.addEventListener('mousedown', startDrag);

    // Touch support
    let wasPlayingBeforeTouchDrag = false;

    const startTouchDrag = (e) => {
      e.preventDefault();
      isDraggingPlayhead = true;
      wasPlayingBeforeTouchDrag = state.isPlaying;

      if (wasPlayingBeforeTouchDrag && typeof window.pause === 'function') {
        window.pause();
      }

      const touch = e.touches[0];
      seekFromEvent({ clientX: touch.clientX });

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    const onTouchMove = (e) => {
      if (!isDraggingPlayhead) return;
      e.preventDefault();
      const touch = e.touches[0];
      seekFromEvent({ clientX: touch.clientX });
    };

    const onTouchEnd = () => {
      isDraggingPlayhead = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);

      if (wasPlayingBeforeTouchDrag && typeof window.play === 'function') {
        window.play();
      }
    };

    playhead.addEventListener('touchstart', startTouchDrag, { passive: false });
    axisOverlay.addEventListener('touchstart', startTouchDrag, { passive: false });

    // Update playhead when timeline view changes
    state.timelineInstance.on('rangechanged', updatePlayheadPosition);

    // Initial position update
    updatePlayheadPosition();
  }

  /**
   * Get time from click position
   */
  function getTimeFromClick(e) {
    if (!state.timelineInstance) return null;

    const timelineBody = document.getElementById('timeline-body');
    if (!timelineBody) return null;

    const visCenter = timelineBody.querySelector('.vis-panel.vis-center');
    if (!visCenter) return null;

    const rect = visCenter.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;

    const win = state.timelineInstance.getWindow();
    const windowDuration = win.end.getTime() - win.start.getTime();
    const timeOffset = (relativeX / rect.width) * windowDuration;
    const time = (win.start.getTime() + timeOffset) / 1000;

    return Math.max(0, Math.min(time, state.projectDuration || 60));
  }

  /**
   * Seek to time position
   */
  function seekToTime(time) {
    state.currentTime = Math.max(0, Math.min(time, state.projectDuration || 60));

    if (typeof window.syncAllMediaToPlayhead === 'function') {
      window.syncAllMediaToPlayhead();
    }

    updatePlayhead();

    if (typeof window.updateTimeDisplay === 'function') {
      window.updateTimeDisplay();
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * Update playhead position
   * Calls the globally stored updatePlayheadPosition function from setupPlayheadDrag
   */
  function updatePlayhead() {
    if (typeof window.updatePlayheadPosition === 'function') {
      window.updatePlayheadPosition();
    }
    playheadPosition.value = state.currentTime;
  }

  /**
   * Setup timeline context menu
   * NOTE: Context menu is handled by TimelineContextMenu.vue component
   * which sets up its own listener on #timeline-container.
   * This function is kept as a no-op for backwards compatibility.
   */
  function setupTimelineContextMenu() {
    // Context menu is handled by TimelineContextMenu.vue
    // It uses vis-timeline's getEventProperties() API to properly
    // detect what was clicked (clip, track, or empty area)
  }

  /**
   * Setup marquee selection for drag-to-select clips on timeline
   */
  function setupMarqueeSelection() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    // Wait for vis-timeline to render the center panel
    const centerPanel = container.querySelector('.vis-panel.vis-center');
    if (!centerPanel) {
      setTimeout(setupMarqueeSelection, 100);
      return;
    }

    // vis-timeline uses Hammer.js which captures all pointer events
    // We need to hook into vis-timeline's event system
    if (!state.timelineInstance) return;

    // Access the internal Hammer.js instance from vis-timeline
    const dom = state.timelineInstance.dom;

    if (dom && dom.centerContainer) {
      const hammerArray = dom.centerContainer.hammer;

      if (hammerArray && hammerArray.length > 0) {
        const hammer = hammerArray[0];

        if (hammer && typeof hammer.on === 'function') {
          // Listen to hammer's input event to detect gesture start
          // We only use isFirst here - move/end are handled by document pointer events
          hammer.on('hammer.input', (e) => {
            // Only handle left mouse button
            if (e.pointerType === 'mouse' && e.srcEvent.button !== 0) return;

            if (e.isFirst) {
              // First event in gesture (mousedown/touchstart)
              const props = state.timelineInstance.getEventProperties(e.srcEvent);
              // Only start marquee on empty background, not on items
              if (!props.item && props.what === 'background') {
                handleMarqueeStart(e.srcEvent);
              }
            }
          });
        }
      }
    }

    // Handle marquee from top dropzone area
    // The .vis-panel.vis-top intercepts pointer events above the center container
    // We need to listen for mousedown on the top panel and check if it's in the top dropzone area
    const topPanel = container.querySelector('.vis-panel.vis-top');
    if (topPanel) {
      topPanel.addEventListener('mousedown', (e) => {
        // Only handle left mouse button
        if (e.button !== 0) return;

        // Check if this is in the dropzone area
        // The top dropzone row renders in the center panel but may be visually overlapped by the top panel
        const topDropzoneRow = container.querySelector('.vis-foreground .vis-group.dropzone-top');
        if (!topDropzoneRow) return;

        const dropzoneRect = topDropzoneRow.getBoundingClientRect();

        // Check if click Y is within the dropzone row bounds
        if (e.clientY >= dropzoneRect.top && e.clientY <= dropzoneRect.bottom) {
          // This click is on the top dropzone area - start marquee selection
          handleMarqueeStart(e);
          e.preventDefault();
          e.stopPropagation();
        }
      }, true); // Use capture phase to get event before other handlers
    }

    // Use pointer events for move/end - these bypass Hammer.js
    document.addEventListener('pointermove', handleMarqueeMove);
    document.addEventListener('pointerup', handleMarqueeEnd);
    document.addEventListener('pointercancel', handleMarqueeEnd);
  }

  /**
   * Handle marquee selection start
   */
  function handleMarqueeStart(e) {
    // Only start marquee on left click
    if (e.button !== 0) return;

    // Get container for positioning
    const container = document.getElementById('timeline-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();

    isMarqueeSelecting = true;
    // Include scroll offset so marquee position matches scrolled content
    marqueeStartX = e.clientX - rect.left + container.scrollLeft;
    marqueeStartY = e.clientY - rect.top + container.scrollTop;

    // Create marquee element
    marqueeElement = document.createElement('div');
    marqueeElement.className = 'timeline-marquee';
    marqueeElement.style.left = marqueeStartX + 'px';
    marqueeElement.style.top = marqueeStartY + 'px';
    marqueeElement.style.width = '0px';
    marqueeElement.style.height = '0px';
    container.appendChild(marqueeElement);

    // Stop vis-timeline from handling this event
    e.stopPropagation();
    // Prevent text selection during drag
    e.preventDefault();
  }

  /**
   * Handle marquee selection move
   */
  function handleMarqueeMove(e) {
    if (!isMarqueeSelecting || !marqueeElement) return;

    const container = document.getElementById('timeline-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Include scroll offset so marquee position matches scrolled content
    const currentX = e.clientX - rect.left + container.scrollLeft;
    const currentY = e.clientY - rect.top + container.scrollTop;

    // Calculate marquee bounds
    const left = Math.min(marqueeStartX, currentX);
    const top = Math.min(marqueeStartY, currentY);
    const width = Math.abs(currentX - marqueeStartX);
    const height = Math.abs(currentY - marqueeStartY);

    // Update marquee element
    marqueeElement.style.left = left + 'px';
    marqueeElement.style.top = top + 'px';
    marqueeElement.style.width = width + 'px';
    marqueeElement.style.height = height + 'px';

    // Find clips that intersect with the marquee
    const selectedIds = getClipsInMarquee(container, left, top, width, height);

    // Update selection visually (but don't commit yet)
    highlightClipsInMarquee(container, selectedIds);
  }

  /**
   * Handle marquee selection end
   */
  function handleMarqueeEnd(e) {
    if (!isMarqueeSelecting) return;

    const container = document.getElementById('timeline-container');

    if (marqueeElement && container) {
      const rect = container.getBoundingClientRect();
      // Include scroll offset so marquee position matches scrolled content
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;

      // Calculate final marquee bounds
      const left = Math.min(marqueeStartX, currentX);
      const top = Math.min(marqueeStartY, currentY);
      const width = Math.abs(currentX - marqueeStartX);
      const height = Math.abs(currentY - marqueeStartY);

      // Only select if marquee has meaningful size
      if (width > 5 || height > 5) {
        // Find clips that intersect with the marquee
        const selectedIds = getClipsInMarquee(container, left, top, width, height);

        // Commit selection
        if (selectedIds.length > 0) {
          // Update vis-timeline selection
          if (state.timelineInstance) {
            state.timelineInstance.setSelection(selectedIds);
          }

          // Update state.selectedIndices
          state.selectedIndices = [];
          selectedIds.forEach(itemId => {
            const idx = state.shapes.findIndex(s => s.id === itemId);
            if (idx >= 0) state.selectedIndices.push(idx);
          });

          // Show options bar if clips selected
          if (state.selectedIndices.length > 0 && typeof window.showOptionsBar === 'function') {
            window.showOptionsBar();
          }

          // Render canvas
          if (typeof window.render === 'function') {
            window.render();
          }
        } else {
          // Clear selection if no clips in marquee
          if (state.timelineInstance) {
            state.timelineInstance.setSelection([]);
          }
          state.selectedIndices = [];
          if (typeof window.hideOptionsBar === 'function') {
            window.hideOptionsBar();
          }
          if (typeof window.render === 'function') {
            window.render();
          }
        }
      }

      // Remove marquee element
      marqueeElement.remove();

      // Remove highlight classes
      clearMarqueeHighlights(container);
    }

    isMarqueeSelecting = false;
    marqueeElement = null;
  }

  /**
   * Get clip IDs that intersect with the marquee rectangle
   */
  function getClipsInMarquee(container, left, top, width, height) {
    const selectedIds = [];
    const containerRect = container.getBoundingClientRect();

    // Marquee bounds are in scroll-adjusted coordinates
    // Convert to screen coordinates by subtracting scroll offset
    const marqueeLeft = containerRect.left + left - container.scrollLeft;
    const marqueeTop = containerRect.top + top - container.scrollTop;
    const marqueeRight = marqueeLeft + width;
    const marqueeBottom = marqueeTop + height;

    // vis-timeline stores items in itemSet.items with DOM references
    // Access via the internal itemSet
    if (state.timelineInstance && state.timelineInstance.itemSet) {
      const itemSet = state.timelineInstance.itemSet;
      const items = itemSet.items;

      for (const itemId in items) {
        const item = items[itemId];
        if (item && item.dom && item.dom.box) {
          const clipRect = item.dom.box.getBoundingClientRect();

          // Check for intersection
          const intersects =
            clipRect.left < marqueeRight &&
            clipRect.right > marqueeLeft &&
            clipRect.top < marqueeBottom &&
            clipRect.bottom > marqueeTop;

          if (intersects) {
            selectedIds.push(item.id);
          }
        }
      }
    }

    // Filter to valid shape IDs
    return selectedIds.filter(id =>
      state.shapes.some(s => s.id === id)
    );
  }

  /**
   * Highlight clips that are currently in the marquee
   */
  function highlightClipsInMarquee(container, selectedIds) {
    // Remove previous highlights
    container.querySelectorAll('.vis-item.marquee-highlight').forEach(el => {
      el.classList.remove('marquee-highlight');
    });

    // Add highlight to selected clips using itemSet
    if (state.timelineInstance && state.timelineInstance.itemSet) {
      const items = state.timelineInstance.itemSet.items;
      selectedIds.forEach(id => {
        const item = items[id];
        if (item && item.dom && item.dom.box) {
          item.dom.box.classList.add('marquee-highlight');
        }
      });
    }
  }

  /**
   * Clear all marquee highlights
   */
  function clearMarqueeHighlights(container) {
    container.querySelectorAll('.vis-item.marquee-highlight').forEach(el => {
      el.classList.remove('marquee-highlight');
    });
  }

  /**
   * Update timeline items from shapes
   * Uses incremental updates to prevent timeline jumping
   */
  function updateTimelineItems() {
    if (!state.timelineInstance || !timelineItems.value) return;
    if (isUpdatingTimeline.value) return;

    isUpdatingTimeline.value = true;

    try {
      // Update groups incrementally (including drop zones)
      if (timelineGroups.value) {
        const trackGroups = state.tracks.map((track, i) => ({
          id: track.id,
          content: track.name,
          order: i + 1, // Leave room for top drop zone (order 0)
        }));

        // Add drop zones for auto-track creation
        const dropZoneTop = {
          id: '__dropzone_top__',
          content: '<div class="track-dropzone"></div>',
          order: 0,
          className: 'dropzone-group dropzone-top',
        };

        const dropZoneBottom = {
          id: '__dropzone_bottom__',
          content: '<div class="track-dropzone"></div>',
          order: state.tracks.length + 1,
          className: 'dropzone-group dropzone-bottom',
        };

        const newGroups = [dropZoneTop, ...trackGroups, dropZoneBottom];
        const existingGroupIds = timelineGroups.value.getIds();
        const newGroupIds = newGroups.map(g => g.id);

        // Remove groups that no longer exist
        const groupsToRemove = existingGroupIds.filter(id => !newGroupIds.includes(id));
        if (groupsToRemove.length > 0) {
          timelineGroups.value.remove(groupsToRemove);
        }

        // Update or add groups
        newGroups.forEach(group => {
          const existing = timelineGroups.value.get(group.id);
          if (existing) {
            if (existing.content !== group.content || existing.order !== group.order || existing.className !== group.className) {
              timelineGroups.value.update(group);
            }
          } else {
            timelineGroups.value.add(group);
          }
        });
      }

      // Update items incrementally to prevent jumping
      const newItems = getTimelineItems();
      const existingIds = timelineItems.value.getIds();
      const newIds = newItems.map(item => item.id);

      // Remove items that no longer exist
      const itemsToRemove = existingIds.filter(id => !newIds.includes(id));
      if (itemsToRemove.length > 0) {
        timelineItems.value.remove(itemsToRemove);
      }

      // Update existing items or add new ones
      newItems.forEach(item => {
        const existing = timelineItems.value.get(item.id);
        if (existing) {
          // Check if item needs update
          // Handle point items (no end property) vs range items
          const startChanged = existing.start?.getTime() !== item.start?.getTime();
          const endChanged = item.end ? (existing.end?.getTime() !== item.end?.getTime()) : false;
          const needsUpdate =
            startChanged ||
            endChanged ||
            existing.group !== item.group ||
            existing.content !== item.content ||
            existing.className !== item.className;

          if (needsUpdate) {
            timelineItems.value.update(item);
          }
        } else {
          // Add new item
          timelineItems.value.add(item);
        }
      });

    } finally {
      isUpdatingTimeline.value = false;
    }
  }

  /**
   * Update timeline groups (tracks)
   * Uses incremental updates to prevent jumping
   */
  function updateTimelineGroups() {
    if (!timelineGroups.value) return;

    // Build track groups with drop zones
    const trackGroups = state.tracks.map((track, i) => ({
      id: track.id,
      content: track.name,
      order: i + 1, // Leave room for top drop zone (order 0)
    }));

    const dropZoneTop = {
      id: '__dropzone_top__',
      content: '<div class="track-dropzone"></div>',
      order: 0,
      className: 'dropzone-group dropzone-top',
    };

    const dropZoneBottom = {
      id: '__dropzone_bottom__',
      content: '<div class="track-dropzone"></div>',
      order: state.tracks.length + 1,
      className: 'dropzone-group dropzone-bottom',
    };

    const newGroups = [dropZoneTop, ...trackGroups, dropZoneBottom];
    const existingGroupIds = timelineGroups.value.getIds();
    const newGroupIds = newGroups.map(g => g.id);

    // Remove groups that no longer exist (except drop zones)
    const groupsToRemove = existingGroupIds.filter(id =>
      !newGroupIds.includes(id) && !id.startsWith('__dropzone')
    );
    if (groupsToRemove.length > 0) {
      timelineGroups.value.remove(groupsToRemove);
    }

    // Update or add groups
    newGroups.forEach(group => {
      const existing = timelineGroups.value.get(group.id);
      if (existing) {
        if (existing.content !== group.content || existing.order !== group.order) {
          timelineGroups.value.update(group);
        }
      } else {
        timelineGroups.value.add(group);
      }
    });

    // Re-inject track toggles after groups are updated
    setTimeout(() => {
      injectTrackToggles();
      // Force timeline redraw to update label widths
      if (state.timelineInstance) {
        state.timelineInstance.redraw();
      }
      // Re-position playhead after label widths may have changed
      setTimeout(() => {
        if (typeof window.updatePlayheadPosition === 'function') {
          window.updatePlayheadPosition();
        }
      }, 100);
    }, 50);
  }

  /**
   * Add track
   */
  function addTrack(type = 'video') {
    const trackNumber = state.tracks.length + 1;
    const newTrack = {
      id: `track-${Date.now()}`,
      name: `Track ${trackNumber}`,
      type: type,
      locked: false,
      muted: false,
    };

    state.tracks.push(newTrack);
    updateTimelineGroups();

    if (typeof window.saveState === 'function') {
      window.saveState();
    }

    return newTrack;
  }

  /**
   * Remove track
   */
  function removeTrack(trackId) {
    const index = state.tracks.findIndex(t => t.id === trackId);
    if (index < 0) return;

    // Move clips to first track
    state.shapes.forEach(shape => {
      if (shape.trackId === trackId) {
        shape.trackId = state.tracks[0]?.id || 'track-1';
      }
    });

    state.tracks.splice(index, 1);
    updateTimelineItems();

    if (typeof window.saveState === 'function') {
      window.saveState();
    }
  }

  /**
   * Add track at a specific position (above or below another track)
   */
  function addTrackAt(trackId, position = 'below') {
    const refIndex = state.tracks.findIndex(t => t.id === trackId);
    if (refIndex < 0) return addTrack();

    const trackNumber = state.tracks.length + 1;
    const newTrack = {
      id: `track-${Date.now()}`,
      name: `Track ${trackNumber}`,
      type: 'video',
      locked: false,
      muted: false,
    };

    const insertIndex = position === 'above' ? refIndex : refIndex + 1;
    state.tracks.splice(insertIndex, 0, newTrack);
    updateTimelineGroups();

    if (typeof window.saveState === 'function') {
      window.saveState();
    }

    return newTrack;
  }

  /**
   * Rename track with a prompt
   */
  function renameTrackPrompt(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    const newName = prompt('Enter track name:', track.name);
    if (newName && newName.trim()) {
      track.name = newName.trim();
      updateTimelineGroups();

      if (typeof window.saveState === 'function') {
        window.saveState();
      }
    }
  }

  /**
   * Delete track (alias for removeTrack for context menu)
   */
  function deleteTrack(trackId) {
    // Don't allow deleting the last track
    if (state.tracks.length <= 1) {
      console.warn('Cannot delete the last track');
      return;
    }
    removeTrack(trackId);
  }

  /**
   * Clean up all empty tracks (except one if all are empty)
   * Returns the number of tracks removed
   */
  function cleanUpEmptyTracks() {
    // Find tracks that have no clips
    const emptyTrackIds = state.tracks
      .filter(track => !state.shapes.some(s => s.trackId === track.id))
      .map(track => track.id);

    // Don't remove all tracks - keep at least one
    const tracksToRemove = emptyTrackIds.slice(0, Math.max(0, emptyTrackIds.length - (state.tracks.length === emptyTrackIds.length ? 1 : 0)));

    if (tracksToRemove.length === 0) {
      return 0;
    }

    // Remove empty tracks
    tracksToRemove.forEach(trackId => {
      const index = state.tracks.findIndex(t => t.id === trackId);
      if (index >= 0) {
        state.tracks.splice(index, 1);
      }
    });

    // Update timeline
    updateTimelineGroups();

    // Save state
    if (typeof window.saveState === 'function') {
      window.saveState();
    }

    return tracksToRemove.length;
  }

  /**
   * Zoom timeline in
   */
  function zoomIn() {
    if (!state.timelineInstance) return;
    state.timelineInstance.zoomIn(0.5);
  }

  /**
   * Zoom timeline out
   */
  function zoomOut() {
    if (!state.timelineInstance) return;
    state.timelineInstance.zoomOut(0.5);
  }

  /**
   * Fit all items in view
   */
  function fitAll() {
    if (!state.timelineInstance) return;
    state.timelineInstance.fit();
  }

  /**
   * Update the timeline's maximum duration
   * Call this when project duration changes (e.g., after recording or import)
   * @param {number} [durationSeconds] - New duration in seconds. If not provided, uses state.projectDuration
   */
  function updateTimelineDuration(durationSeconds) {
    if (!state.timelineInstance) return;

    // Use provided duration or fall back to state.projectDuration
    const duration = durationSeconds ?? state.projectDuration ?? 60;

    // Validate duration is a valid number
    if (typeof duration !== 'number' || !isFinite(duration) || duration <= 0) {
      console.warn('[Timeline] Invalid duration:', duration, '- skipping update');
      return;
    }

    const durationMs = duration * 1000;
    state.timelineInstance.setOptions({
      max: durationMs
    });

    // Don't change the visible window - only update the max limit
    // This preserves the user's current zoom level
  }

  /**
   * Sync canvas selection to timeline
   * When shapes are selected on the canvas, select corresponding clips in timeline
   */
  function syncSelectionToTimeline() {
    if (!state.timelineInstance) return;

    // Get shape IDs for selected indices
    const selectedIds = state.selectedIndices
      .map(i => state.shapes[i]?.id)
      .filter(id => id);

    // Get current timeline selection
    const currentSelection = state.timelineInstance.getSelection();

    // Only update if selection has changed (avoid infinite loops)
    const selectionChanged =
      selectedIds.length !== currentSelection.length ||
      !selectedIds.every(id => currentSelection.includes(id));

    if (selectionChanged) {
      state.timelineInstance.setSelection(selectedIds);
    }
  }

  /**
   * Destroy timeline
   */
  function destroyTimeline() {
    document.removeEventListener('click', handleTrackControlClick);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopEdgeScroll);

    if (state.timelineInstance) {
      state.timelineInstance.destroy();
      state.timelineInstance = null;
    }
    timelineInstance.value = null;
    timelineItems.value = null;
    timelineGroups.value = null;
  }

  // Clean up on unmount
  onUnmounted(() => {
    destroyTimeline();
  });

  // Expose functions globally
  window.initVisTimeline = initTimeline;
  window.updateTimelineItems = updateTimelineItems;
  window.updateTimelineGroups = updateTimelineGroups;
  window.updatePlayhead = updatePlayhead;
  window.timelineZoomIn = zoomIn;
  window.timelineZoomOut = zoomOut;
  window.timelineFitAll = fitAll;
  window.addTrack = addTrack;
  window.addTrackAt = addTrackAt;
  window.removeTrack = removeTrack;
  window.deleteTrack = deleteTrack;
  window.renameTrackPrompt = renameTrackPrompt;
  window.cleanUpEmptyTracks = cleanUpEmptyTracks;
  window.injectTrackToggles = injectTrackToggles;
  window.updateTrackToggleIcons = updateTrackToggleIcons;
  window.syncSelectionToTimeline = syncSelectionToTimeline;
  window.setupMarqueeSelection = setupMarqueeSelection;
  window.updateTimelineRange = updateTimelineDuration;

  return {
    // State
    timelineInstance,
    timelineItems,
    timelineGroups,
    playheadPosition,

    // Methods
    initTimeline,
    getTimelineItems,
    updateTimelineItems,
    updateTimelineGroups,
    updatePlayhead,
    seekToTime,
    zoomIn,
    zoomOut,
    fitAll,
    addTrack,
    addTrackAt,
    removeTrack,
    deleteTrack,
    renameTrackPrompt,
    cleanUpEmptyTracks,
    destroyTimeline,
    injectTrackToggles,
    updateTrackToggleIcons,
    syncSelectionToTimeline,
  };
}

// Singleton instance
let timelineInstanceSingleton = null;

/**
 * Get or create timeline instance
 */
export function getTimeline() {
  if (!timelineInstanceSingleton) {
    timelineInstanceSingleton = useTimeline();
  }
  return timelineInstanceSingleton;
}

export default useTimeline;
