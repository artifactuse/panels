/**
 * Artifactuse Panels - Cloudflare Worker
 * 
 * Simple panel server with:
 * - All panels served without restrictions
 * - Edge caching
 * - CORS headers for iframe embedding
 */

const PANELS = {
  'json-panel': 'JSON tree viewer',
  'svg-panel': 'SVG preview with pan/zoom',
  'diff-panel': 'Side-by-side diff',
  'html-panel': 'HTML + Markdown preview',
  'react-panel': 'React/JSX preview',
  'vue-panel': 'Vue SFC preview',
  'form-panel': 'Interactive forms'
};

const CACHE_DURATIONS = {
  html: 60 * 60,                // 1 hour
  assets: 60 * 60 * 24 * 7,     // 7 days
  immutable: 60 * 60 * 24 * 365 // 1 year
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Health check
    if (path === '/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Panel manifest
    if (path === '/manifest.json') {
      return jsonResponse({
        version: '1.0.0',
        panels: Object.entries(PANELS).map(([name, description]) => ({
          name,
          path: `/${name}/`,
          description
        }))
      });
    }

    // Index page
    if (path === '/' || path === '') {
      return handleIndex();
    }

    // Serve panel assets
    const response = await env.ASSETS.fetch(request);
    
    // SPA fallback - serve index.html for panel routes without extension
    if (!response.ok && !path.includes('.')) {
      const panelName = path.split('/').filter(Boolean)[0];
      if (PANELS[panelName]) {
        const indexUrl = new URL(request.url);
        indexUrl.pathname = `/${panelName}/index.html`;
        const indexResponse = await env.ASSETS.fetch(new Request(indexUrl, request));
        if (indexResponse.ok) {
          return addHeaders(indexResponse, 'html');
        }
      }
    }

    return response.ok ? addHeaders(response, getCacheType(path)) : response;
  }
};

function getCacheType(path) {
  if (path.match(/\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i)) return 'immutable';
  if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i)) return 'assets';
  return 'html';
}

function addHeaders(response, cacheType) {
  const headers = new Headers(response.headers);
  const duration = CACHE_DURATIONS[cacheType];
  
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Content-Type-Options', 'nosniff');
  
  if (cacheType === 'immutable') {
    headers.set('Cache-Control', `public, max-age=${duration}, immutable`);
  } else {
    headers.set('Cache-Control', `public, max-age=${duration}`);
  }
  
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function handleIndex() {
  const panelList = Object.entries(PANELS)
    .filter(([name]) => name !== 'shared')
    .map(([name, desc]) => `<li><a href="/${name}/">${name}</a><span>${desc}</span></li>`)
    .join('\n');

  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifactuse Panels</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; background: #0f172a; color: #e2e8f0; }
    h1 { color: #f8fafc; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.75rem 1rem; margin: 0.5rem 0; background: #1e293b; border-radius: 0.5rem; display: flex; justify-content: space-between; align-items: center; }
    a { color: #60a5fa; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    span { color: #94a3b8; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>📦 Artifactuse Panels</h1>
  <ul>${panelList}</ul>
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
}