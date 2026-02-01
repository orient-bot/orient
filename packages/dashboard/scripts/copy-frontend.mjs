import { cpSync, existsSync, rmSync, readdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const sourceDir = resolve(rootDir, '..', 'dashboard-frontend', 'dist');
const targetDir = resolve(rootDir, 'public');

if (!existsSync(sourceDir)) {
  console.log('[dashboard] Frontend dist not found, skipping copy:', sourceDir);
  process.exit(0);
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}

cpSync(sourceDir, targetDir, { recursive: true });
const resizeTargets = [
  resolve(targetDir, 'ori.png'),
  resolve(targetDir, 'mascot'),
];

function collectPngs(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectPngs(fullPath));
    } else if (entry.toLowerCase().endsWith('.png')) {
      results.push(fullPath);
    }
  }
  return results;
}

function hasSips() {
  try {
    execFileSync('sips', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const pngs = [];
for (const target of resizeTargets) {
  if (existsSync(target) && statSync(target).isDirectory()) {
    pngs.push(...collectPngs(target));
  } else if (existsSync(target)) {
    pngs.push(target);
  }
}

if (pngs.length && hasSips()) {
  // Downscale large PNGs to keep package size reasonable.
  for (const file of pngs) {
    try {
      execFileSync('sips', ['-Z', '512', file], { stdio: 'ignore' });
    } catch {
      // Best-effort; ignore resize errors and keep original file.
    }
  }
  console.log('[dashboard] Copied frontend build to', targetDir, 'and resized PNG assets');
} else {
  console.log('[dashboard] Copied frontend build to', targetDir);
}
