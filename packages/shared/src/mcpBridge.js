/**
 * Artifactuse MCP Bridge
 * 
 * Connects the Artifactuse web editor to the local MCP server via WebSocket.
 * This enables AI agents to send canvas/video data directly to the editor
 * with real-time crafting support including editing capabilities.
 * 
 * Event Naming Convention:
 *   artifactuse:category:action
 * 
 * Events dispatched:
 *   - artifactuse:mcp:connecting    - Connection attempt started
 *   - artifactuse:mcp:connected     - Successfully connected
 *   - artifactuse:mcp:disconnected  - Disconnected from server
 *   - artifactuse:mcp:error         - Connection error occurred
 *   - artifactuse:init:canvas       - Initialize canvas
 *   - artifactuse:init:video        - Initialize video
 *   - artifactuse:add:shape         - Add single shape to canvas
 *   - artifactuse:add:shapes        - Add multiple shapes to canvas
 *   - artifactuse:update:shape      - Update existing shape on canvas
 *   - artifactuse:delete:shape      - Delete shape from canvas
 *   - artifactuse:add:clip          - Add single clip to video
 *   - artifactuse:add:clips         - Add multiple clips to video
 *   - artifactuse:update:clip       - Update existing clip in video
 *   - artifactuse:delete:clip       - Delete clip from video
 *   - artifactuse:clear:canvas      - Clear canvas
 *   - artifactuse:clear:video       - Clear video
 *   - artifactuse:load:code         - Load code artifact
 *   - artifactuse:load:data         - Load data artifact
 * 
 * Usage:
 *   import { initMCPBridge, mcpState } from './mcpBridge.js';
 *   
 *   // Initialize (but don't connect yet)
 *   initMCPBridge({ editorType: 'canvas', autoConnect: false });
 *   
 *   // User clicks button to connect
 *   connectMCP();
 *   
 *   // Listen for real-time shape additions
 *   window.addEventListener('artifactuse:add:shape', (e) => {
 *     const { shape } = e.detail;
 *     addShapeToCanvas(shape);
 *   });
 *   
 *   // Listen for shape updates
 *   window.addEventListener('artifactuse:update:shape', (e) => {
 *     const { id, index, updates } = e.detail;
 *     updateShapeOnCanvas(id, updates);
 *   });
 *   
 *   // Listen for shape deletions
 *   window.addEventListener('artifactuse:delete:shape', (e) => {
 *     const { id, index } = e.detail;
 *     deleteShapeFromCanvas(id);
 *   });
 */

const DEFAULT_WS_URL = 'ws://localhost:3456';

let ws = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let currentOptions = null;
let manuallyDisconnected = false;

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_BASE = 3000;
const RECONNECT_DELAY_MAX = 15000;

/**
 * Reactive state object for UI binding
 * Use this to show connection status in your UI
 */
export const mcpState = {
  connected: false,
  connecting: false,
  enabled: false, // Start disabled - user must click to connect
  error: null,
  clientId: null,
  initialized: false,
};

/**
 * Initialize the MCP WebSocket bridge
 * @param {Object} options
 * @param {string} options.editorType - 'canvas' or 'video'
 * @param {string} options.wsUrl - WebSocket URL (default: ws://localhost:3456)
 * @param {boolean} options.autoConnect - Connect immediately (default: false)
 * @param {boolean} options.autoReconnect - Auto-reconnect on disconnect (default: true)
 * @param {Function} options.onConnect - Callback when connected
 * @param {Function} options.onDisconnect - Callback when disconnected
 * @param {Function} options.onError - Callback on error
 */
export function initMCPBridge(options = {}) {
  const {
    editorType = 'canvas',
    wsUrl = DEFAULT_WS_URL,
    autoConnect = false, // Don't auto-connect by default
    autoReconnect = true,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  // Store options for later use
  currentOptions = { ...options, wsUrl, editorType, autoReconnect };
  mcpState.initialized = true;

  // Load saved preference
  loadMCPPreference();

  // Only connect if autoConnect is true AND user hasn't disabled it
  if (autoConnect && mcpState.enabled) {
    connectMCP();
  }
}

/**
 * Actually establish the WebSocket connection
 * Call this when user clicks the connect button
 */
export function connectMCP() {
  if (!currentOptions) {
    console.warn('[MCP Bridge] Not initialized. Call initMCPBridge() first.');
    return false;
  }

  const { wsUrl, editorType, autoReconnect, onConnect, onDisconnect, onError } = currentOptions;

  // Don't connect if already connected
  if (ws && ws.readyState === WebSocket.OPEN) {
    return true;
  }

  // Clean up existing connection
  if (ws) {
    ws.close();
    ws = null;
  }

  mcpState.connecting = true;
  mcpState.enabled = true;
  mcpState.error = null;
  manuallyDisconnected = false;

  // Dispatch connecting event for UI
  window.dispatchEvent(new CustomEvent('artifactuse:mcp:connecting'));

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    mcpState.connecting = false;
    mcpState.error = e.message;
    window.dispatchEvent(new CustomEvent('artifactuse:mcp:error', { detail: { error: e.message } }));
    return false;
  }

  ws.onopen = () => {
    mcpState.connected = true;
    mcpState.connecting = false;
    mcpState.error = null;
    reconnectAttempts = 0;

    // Send ready signal with editor type
    ws.send(JSON.stringify({
      type: 'client:ready',
      editorType,
      timestamp: Date.now(),
    }));

    // Save preference
    saveMCPPreference(true);

    // Dispatch custom event for app to listen to
    window.dispatchEvent(new CustomEvent('artifactuse:mcp:connected'));
    
    if (onConnect) onConnect();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (e) {
      console.warn('[MCP Bridge] Failed to parse message:', e);
    }
  };

  ws.onclose = (event) => {
    mcpState.connected = false;
    mcpState.connecting = false;
    ws = null;

    window.dispatchEvent(new CustomEvent('artifactuse:mcp:disconnected'));
    
    if (onDisconnect) onDisconnect();

    // Auto-reconnect only if:
    // - autoReconnect is enabled
    // - user didn't manually disconnect
    // - we haven't exceeded max attempts
    // - it wasn't a clean close
    if (autoReconnect && !manuallyDisconnected && mcpState.enabled && event.code !== 1000) {
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    mcpState.error = 'Connection failed';
    mcpState.connecting = false;
    
    // Dispatch error event for UI
    window.dispatchEvent(new CustomEvent('artifactuse:mcp:error', { detail: { error: 'Connection failed' } }));
    
    if (onError) onError(new Error('Connection failed'));
  };

  return true;
}

/**
 * Handle incoming messages from MCP server
 * Dispatches appropriate events for the editor to handle
 */
function handleMessage(message) {
  const { type, data } = message;
  
  console.log('[MCP Bridge] Received:', type);

  switch (type) {
    // === MCP Connection Events ===
    case 'artifactuse:mcp:connected':
      mcpState.clientId = message.clientId;
      break;

    // === Canvas Events ===
    case 'artifactuse:init:canvas':
      window.dispatchEvent(new CustomEvent('artifactuse:init:canvas', { detail: data }));
      break;

    case 'artifactuse:add:shape':
      window.dispatchEvent(new CustomEvent('artifactuse:add:shape', { detail: data }));
      break;

    case 'artifactuse:add:shapes':
      window.dispatchEvent(new CustomEvent('artifactuse:add:shapes', { detail: data }));
      break;

    case 'artifactuse:update:shape':
      window.dispatchEvent(new CustomEvent('artifactuse:update:shape', { detail: data }));
      break;

    case 'artifactuse:delete:shape':
      window.dispatchEvent(new CustomEvent('artifactuse:delete:shape', { detail: data }));
      break;

    case 'artifactuse:clear:canvas':
      window.dispatchEvent(new CustomEvent('artifactuse:clear:canvas', { detail: data }));
      break;

    // === Video Events ===
    case 'artifactuse:init:video':
      window.dispatchEvent(new CustomEvent('artifactuse:init:video', { detail: data }));
      break;

    case 'artifactuse:add:clip':
      window.dispatchEvent(new CustomEvent('artifactuse:add:clip', { detail: data }));
      break;

    case 'artifactuse:add:clips':
      window.dispatchEvent(new CustomEvent('artifactuse:add:clips', { detail: data }));
      break;

    case 'artifactuse:update:clip':
      window.dispatchEvent(new CustomEvent('artifactuse:update:clip', { detail: data }));
      break;

    case 'artifactuse:delete:clip':
      window.dispatchEvent(new CustomEvent('artifactuse:delete:clip', { detail: data }));
      break;

    case 'artifactuse:clear:video':
      window.dispatchEvent(new CustomEvent('artifactuse:clear:video', { detail: data }));
      break;

    // === Code/Data Events ===
    case 'artifactuse:load:code':
      window.dispatchEvent(new CustomEvent('artifactuse:load:code', { detail: data }));
      break;

    case 'artifactuse:load:data':
      window.dispatchEvent(new CustomEvent('artifactuse:load:data', { detail: data }));
      break;

    // === Legacy Support (for backward compatibility) ===
    case 'load:artifact':
      handleLegacyArtifact(message.artifact);
      break;

    default:
      console.log('[MCP Bridge] Unknown message type:', type);
  }
}

/**
 * Handle legacy artifact loading (backward compatibility)
 */
function handleLegacyArtifact(artifact) {
  if (!artifact || !artifact.language || !artifact.code) {
    console.warn('[MCP Bridge] Invalid legacy artifact:', artifact);
    return;
  }

  console.log(`[MCP Bridge] Loading legacy ${artifact.language} artifact`);

  // Dispatch legacy event
  window.dispatchEvent(new CustomEvent('artifactuse:mcp:artifact', { 
    detail: artifact 
  }));

  // Also try to use the existing bridge if available
  if (window.__artifactuseBridge) {
    window.__artifactuseBridge.emit('load:artifact', artifact);
  } else {
    // Fallback: directly call the import function if exposed
    tryDirectImport(artifact);
  }
}

/**
 * Direct import fallback when bridge isn't available
 */
function tryDirectImport(artifact) {
  const { language, code } = artifact;

  try {
    // Parse the code
    let data = typeof code === 'string' ? JSON.parse(code) : code;

    // Try to use the global importFromJson if available
    if (typeof window.importFromJson === 'function') {
      const success = window.importFromJson(data);
      if (success) {
        console.log('[MCP Bridge] Direct import successful');
        
        // Center view after import
        requestAnimationFrame(() => {
          if (typeof window.resizeCanvasToFit === 'function') {
            window.resizeCanvasToFit();
          } else if (typeof window.centerOnContent === 'function') {
            window.centerOnContent();
          }
        });
      }
      return;
    }

    // Try getExport composable
    if (typeof window.getExport === 'function') {
      const exportModule = window.getExport();
      if (exportModule && typeof exportModule.importFromJson === 'function') {
        exportModule.importFromJson(data);
        console.log('[MCP Bridge] Import via getExport successful');
        return;
      }
    }

    console.warn('[MCP Bridge] No import method available');
  } catch (e) {
    console.error('[MCP Bridge] Import failed:', e);
  }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Stop trying - user can click to retry
    mcpState.connecting = false;
    mcpState.enabled = false;
    mcpState.error = 'Max reconnection attempts reached';
    window.dispatchEvent(new CustomEvent('artifactuse:mcp:error', { detail: { error: 'Max reconnection attempts reached' } }));
    return;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  const delay = Math.min(
    RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts),
    RECONNECT_DELAY_MAX
  );

  reconnectAttempts++;
  mcpState.connecting = true;
  
  // Dispatch connecting event for UI during reconnect
  window.dispatchEvent(new CustomEvent('artifactuse:mcp:connecting'));

  reconnectTimeout = setTimeout(() => {
    if (mcpState.enabled && !manuallyDisconnected) {
      connectMCP();
    }
  }, delay);
}

/**
 * Check if connected to MCP server
 */
export function isMCPConnected() {
  return mcpState.connected && ws && ws.readyState === WebSocket.OPEN;
}

/**
 * Disconnect from MCP server
 */
export function disconnectMCP() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  manuallyDisconnected = true;
  reconnectAttempts = 0;
  mcpState.enabled = false;
  mcpState.error = null; // Clear error on manual disconnect
  
  if (ws) {
    ws.close(1000, 'Client disconnected');
    ws = null;
  }
  
  mcpState.connected = false;
  mcpState.connecting = false;
  
  // Save preference
  saveMCPPreference(false);
  
  // Dispatch disconnected event
  window.dispatchEvent(new CustomEvent('artifactuse:mcp:disconnected'));
}

/**
 * Toggle MCP connection on/off
 * Call this from your UI button
 */
export function toggleMCP() {
  if (mcpState.connected || mcpState.connecting) {
    disconnectMCP();
    return false;
  } else {
    connectMCP();
    return true;
  }
}

/**
 * Save MCP preference to localStorage
 */
function saveMCPPreference(enabled) {
  try {
    localStorage.setItem('artifactuse:mcp:enabled', JSON.stringify(enabled));
  } catch (e) {
    // Ignore localStorage errors
  }
}

/**
 * Load saved MCP preference
 */
export function loadMCPPreference() {
  try {
    const saved = localStorage.getItem('artifactuse:mcp:enabled');
    if (saved !== null) {
      mcpState.enabled = JSON.parse(saved);
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  return mcpState.enabled;
}

/**
 * Get connection status
 */
export function getMCPStatus() {
  return {
    connected: mcpState.connected,
    connecting: mcpState.connecting,
    enabled: mcpState.enabled,
    error: mcpState.error,
    clientId: mcpState.clientId,
    initialized: mcpState.initialized,
  };
}

// Expose functions globally for debugging and UI
if (typeof window !== 'undefined') {
  window.mcpBridge = {
    init: initMCPBridge,
    connect: connectMCP,
    disconnect: disconnectMCP,
    toggle: toggleMCP,
    state: mcpState,
    isConnected: isMCPConnected,
    getStatus: getMCPStatus,
  };
}