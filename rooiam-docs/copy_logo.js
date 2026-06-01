import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.join(__dirname, '../art/rooiam-logo-wordmark-horizontal-transparent.svg');
const dest = path.join(__dirname, 'public/wordmark-light.svg');

fs.copyFileSync(source, dest);
console.log('Copied logo to public/wordmark-light.svg');
