/**
 * Generate a single 128x128 preview icon
 * Green rounded square background + white stroke shield
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// emerald-600: #059669
// White stroke shield on emerald-600 rounded square background
// Shield should occupy ~1/3 of the image
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#059669"/>
  <g transform="translate(20, 16) scale(3.7)">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const root = path.resolve(__dirname, '..');
const tempSvg = path.join(root, 'temp-icon-preview.svg');
const outputPng = path.join(root, 'shield-preview-128.png');

fs.writeFileSync(tempSvg, ICON_SVG);

sharp(tempSvg)
  .png()
  .toFile(outputPng)
  .then(() => {
    fs.unlinkSync(tempSvg);
    console.log('Generated: shield-preview-128.png');
  })
  .catch(err => {
    console.error('Error:', err.message);
  });