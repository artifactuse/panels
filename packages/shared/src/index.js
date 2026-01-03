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
