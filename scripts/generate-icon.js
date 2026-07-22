/**
 * Generate shield app icon for Android
 * Green rounded square background + white stroke shield
 */

const fs = require('fs');
const path = require('path');

// emerald-600: #059669
// White stroke shield on emerald-600 rounded square background
function generateIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.1875}" fill="#059669"/>
  <g transform="translate(${size * 0.156}, ${size * 0.125}) scale(${size * 0.029})">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const SIZES = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 },
];

async function generateIcons() {
  try {
    const sharp = require('sharp');
    const root = path.resolve(__dirname, '..');

    console.log('Generating icons...');

    for (const { name, size } of SIZES) {
      const dir = path.join(root, 'android/app/src/main/res', name);
      const outputFile = path.join(dir, 'ic_launcher.png');
      const outputRound = path.join(dir, 'ic_launcher_round.png');
      const outputFg = path.join(dir, 'ic_launcher_foreground.png');

      const tempSvg = path.join(root, `temp-icon-${size}.svg`);
      fs.writeFileSync(tempSvg, generateIconSvg(size));

      // Main icon
      await sharp(tempSvg).png().toFile(outputFile);

      // Round icon (same for this design)
      await sharp(tempSvg).png().toFile(outputRound);

      // Foreground (shield only, transparent background)
      const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <g transform="translate(${size * 0.156}, ${size * 0.125}) scale(${size * 0.029})">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>`;
      const tempFgSvg = path.join(root, `temp-fg-${size}.svg`);
      fs.writeFileSync(tempFgSvg, fgSvg);
      await sharp(tempFgSvg).png().toFile(outputFg);

      // Cleanup temp files
      fs.unlinkSync(tempSvg);
      fs.unlinkSync(tempFgSvg);

      console.log(`  ${name}: ${size}x${size}`);
    }

    console.log('Done! Icons generated in android/app/src/main/res/mipmap-*/');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

generateIcons();