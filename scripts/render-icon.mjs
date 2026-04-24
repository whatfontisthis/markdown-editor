import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('icon.svg', 'utf8');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1024 },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'Arial'
  }
});
writeFileSync('icon.png', resvg.render().asPng());
console.log('wrote icon.png (1024x1024)');
