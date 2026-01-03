// @artifactuse/shared/src/bridge.js
// Bridge receiver for panel artifacts (runs inside iframe)

/**
 * Create bridge receiver for panel artifacts
 * Handles communication with parent Artifactuse SDK
 */
export function createBridgeReceiver(options = {}) {
  const {
    origin = '*', // Allowed parent origin, set to specific domain in production
    debug = false,
  } = options;
  
  const listeners = new Map();
  let parentOrigin = null;
  let isReady = false;
  
  /**
   * Log debug messages
   */
  function log(...args) {
    if (debug) {
      console.log('[Artifactuse Panel]', ...args);
    }
  }
  
  /**
   * Handle incoming messages from parent
   */
  function handleMessage(event) {
    // Validate origin
    if (origin !== '*' && event.origin !== origin) {
      log('Ignored message from unauthorized origin:', event.origin);
      return;
    }
    
    const { data } = event;
    
    // Validate message format
    if (!data || data.type !== 'artifactuse') {
      return;
    }
    
    // Store parent origin for responses
    if (!parentOrigin) {
      parentOrigin = event.origin;
    }
    
    const { action, data: payload, requestId } = data;
    
    log('Received:', action, payload);
    
    // Emit to listeners
    const callbacks = listeners.get(action);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          const result = callback(payload, requestId);
          
          // If callback returns a promise, wait for it
          if (result instanceof Promise) {
            result.then(response => {
              if (requestId) {
                sendResponse(requestId, response);
              }
            }).catch(error => {
              if (requestId) {
                sendError(requestId, error.message);
              }
            });
          } else if (requestId && result !== undefined) {
            sendResponse(requestId, result);
          }
        } catch (error) {
          console.error('Bridge handler error:', error);
          if (requestId) {
            sendError(requestId, error.message);
          }
        }
      });
    }
  }
  
  /**
   * Send message to parent
   */
  function send(action, data = {}) {
    if (!window.parent || window.parent === window) {
      log('No parent window');
      return;
    }
    
    const message = {
      type: 'artifactuse',
      action,
      data,
      timestamp: Date.now(),
    };
    
    log('Sending:', action, data);
    
    window.parent.postMessage(message, parentOrigin || '*');
  }
  
  /**
   * Send response to a request
   */
  function sendResponse(requestId, data) {
    send('response', { requestId, data, success: true });
  }
  
  /**
   * Send error response
   */
  function sendError(requestId, error) {
    send('response', { requestId, error, success: false });
  }
  
  /**
   * Subscribe to action
   */
  function on(action, callback) {
    if (!listeners.has(action)) {
      listeners.set(action, new Set());
    }
    listeners.get(action).add(callback);
    
    return () => off(action, callback);
  }
  
  /**
   * Unsubscribe from action
   */
  function off(action, callback) {
    listeners.get(action)?.delete(callback);
  }
  
  /**
   * Request AI assistance from parent
   */
  function requestAI(prompt, context = {}) {
    const requestId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    send('ai:request', {
      requestId,
      prompt,
      context,
    });
    
    return requestId;
  }
  
  /**
   * Request save to cloud
   */
  function requestSave(data) {
    send('save:request', data);
  }
  
  /**
   * Notify export complete
   */
  function notifyExportComplete(blob, filename) {
    send('export:complete', {
      filename,
      size: blob.size,
      type: blob.type,
    });
  }
  
  /**
   * Update artifact data in parent
   */
  function updateArtifact(data) {
    send('artifact:update', data);
  }
  
  /**
   * Submit form data to parent
   */
  function submitForm(formId, action, values) {
    send('form:submit', {
      formId,
      action,
      values,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Cancel form in parent
   */
  function cancelForm(formId, values) {
    send('form:cancel', {
      formId,
      action: 'cancel',
      values,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Notify form step change
   */
  function formStepChange(formId, step, values) {
    send('form:step', {
      formId,
      step,
      values,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Signal ready to parent
   */
  function signalReady() {
    if (isReady) return;
    
    isReady = true;
    send('panel:ready', {
      timestamp: Date.now(),
    });
    
    log('Panel ready');
  }
  
  /**
   * Initialize bridge
   */
  function init() {
    window.addEventListener('message', handleMessage);
    
    // Signal ready after a short delay to ensure parent is listening
    setTimeout(signalReady, 100);
    
    log('Bridge initialized');
  }
  
  /**
   * Destroy bridge
   */
  function destroy() {
    window.removeEventListener('message', handleMessage);
    listeners.clear();
    isReady = false;
    
    log('Bridge destroyed');
  }
  
  // Auto-initialize
  init();
  
  return {
    send,
    on,
    off,
    requestAI,
    requestSave,
    notifyExportComplete,
    updateArtifact,
    submitForm,
    cancelForm,
    formStepChange,
    signalReady,
    destroy,
  };
}

export default createBridgeReceiver;

// Alias for convenience
export const createBridge = createBridgeReceiver;
