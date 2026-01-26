// @artifactuse/shared
// Shared utilities for Artifactuse panel artifacts

export { createBridgeReceiver, createBridge, default as bridge } from './bridge.js';
export { 
  applyTheme, 
  detectTheme, 
  onThemeChange, 
  getThemeCSS,
  DEFAULT_COLORS,
} from './theme.js';
export { 
  mockData, 
  getMockData, 
  isDev, 
  getDevData 
} from './mockData.js';
export {
  createArtifactHandler,
  setupArtifactListeners,
  getLanguageDisplayName,
  isVisualEditorLanguage,
  isCodeLanguage,
  isDataLanguage,
  isRenderableLanguage,
  isRuntimeLanguage,
  needsJsonParse,
  isRawCodeLanguage,
  normalizeLanguage,
  sanitizeJsonCode,
  LANGUAGE_MAP,
  LANGUAGE_CATEGORIES,
  NEEDS_JSON_PARSE,
  RAW_CODE_LANGUAGES,
} from './handler.js';

export {
  initMCPBridge,
  connectMCP,
  disconnectMCP,
  toggleMCP,
  isMCPConnected,
  getMCPStatus,
  loadMCPPreference,
  mcpState,
} from './mcpBridge.js';