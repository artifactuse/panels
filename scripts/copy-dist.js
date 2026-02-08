#!/usr/bin/env node

// Copy built panel dist/ folders into worker/dist/{panel-name}/
// Used by cf:dev to populate the worker's static assets before starting wrangler

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workerDist = path.join(root, 'worker', 'dist');
const packagesDir = path.join(root, 'packages');
const publicDir = path.join(root, 'worker', 'public');

const PANELS = [
	'json-panel',
	'svg-panel',
	'diff-panel',
	'html-panel',
	'react-panel',
	'vue-panel',
	'form-panel',
];

// Clean and recreate worker/dist
fs.rmSync(workerDist, { recursive: true, force: true });
fs.mkdirSync(workerDist, { recursive: true });

let copied = 0;
let skipped = 0;

for (const panel of PANELS) {
	const src = path.join(packagesDir, panel, 'dist');
	const dest = path.join(workerDist, panel);
	if (fs.existsSync(src)) {
		fs.cpSync(src, dest, { recursive: true });
		console.log(`  ✓ ${panel}`);
		copied++;
	} else {
		console.log(`  ○ ${panel} (not built)`);
		skipped++;
	}
}

// Copy worker/public/* (favicon, etc.)
if (fs.existsSync(publicDir)) {
	for (const file of fs.readdirSync(publicDir)) {
		fs.cpSync(path.join(publicDir, file), path.join(workerDist, file), { recursive: true });
	}
	console.log('  ✓ public files');
}

console.log(`\nPanels: ${copied} copied, ${skipped} skipped`);
