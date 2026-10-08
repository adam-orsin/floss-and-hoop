// Removes the built-in Haus Candy Co. examples so only your own designs are left.
// Usage: npm run clear-examples
// Your designs (assets/designs.local.json) and anything in exports/ stay untouched.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const designsPath = path.join(ROOT, 'assets', 'designs.json');
const designs = JSON.parse(fs.readFileSync(designsPath, 'utf8'));
const removed = Object.keys(designs);
fs.writeFileSync(designsPath, '{}\n');
fs.rmSync(path.join(ROOT, 'assets', 'examples'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'examples'), { recursive: true, force: true });

console.log(removed.length
  ? `Removed the built-in examples: ${removed.join(', ')}.`
  : 'There were no built-in examples left to remove.');
console.log('Your own designs and exports/ are unchanged. Make a new one with: npm run make -- path/to/image.png');
