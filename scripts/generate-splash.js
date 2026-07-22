/**
 * Generate splash screen images for Android
 * White background + centered app icon (green rounded square with white shield)
 */

const fs = require('fs');
const path = require('path');

// Generate SVG for splash: white background + centered icon
function generateSplashSvg(width, height) {
  // Icon size: 24% of smaller dimension (60% of previous 40%)
  const iconSize = Math.min(width, height) * 0.24;
  const iconX = (width - iconSize) / 2;
  const iconY = (height - iconSize) / 2;
  const cornerRadius = iconSize * 0.1875;
  
  // Shield path (same as icon generator, scaled)
  const shieldScale = iconSize * 0.029;
  const shieldOffsetX = iconX + iconSize * 0.156;
  const shieldOffsetY = iconY + iconSize * 0.125;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- White background -->
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  
  <!-- Icon: green rounded square -->
  <rect x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" rx="${cornerRadius}" fill="#059669"/>
  
  <!-- Shield (white stroke) -->
  <g transform="translate(${shieldOffsetX}, ${shieldOffsetY}) scale(${shieldScale})">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

// Splash sizes: landscape and portrait for each density
const SPLASH_SIZES = [
  // Landscape (land)
  { dir: 'drawable-land-mdpi', width: 480, height: 320 },
  { dir: 'drawable-land-hdpi', width: 800, height: 480 },
  { dir: 'drawable-land-xhdpi', width: 1280, height: 720 },
  { dir: 'drawable-land-xxhdpi', width: 1600, height: 960 },
  { dir: 'drawable-land-xxxhdpi', width: 1920, height: 1152 },
  // Portrait (port)
  { dir: 'drawable-port-mdpi', width: 320, height: 480 },
  { dir: 'drawable-port-hdpi', width: 480, height: 800 },
  { dir: 'drawable-port-xhdpi', width: 720, height: 1280 },
  { dir: 'drawable-port-xxhdpi', width: 960, height: 1600 },
  { dir: 'drawable-port-xxxhdpi', width: 1152, height: 1920 },
];

async function generateSplash() {
  try {
    const sharp = require('sharp');
    const root = path.resolve(__dirname, '..');

    console.log('Generating splash screens...');

    for (const { dir, width, height } of SPLASH_SIZES) {
      const resDir = path.join(root, 'android/app/src/main/res', dir);
      
      // Create directory if not exists
      if (!fs.existsSync(resDir)) {
        fs.mkdirSync(resDir, { recursive: true });
      }

      const outputFile = path.join(resDir, 'splash.png');
      const tempSvg = path.join(root, `temp-splash-${dir.replace(/[^a-zA-Z0-9]/g, '_')}.svg`);

      fs.writeFileSync(tempSvg, generateSplashSvg(width, height));
      await sharp(tempSvg).png().toFile(outputFile);
      fs.unlinkSync(tempSvg);

      console.log(`  ${dir}: ${width}x${height}`);
    }

    // Also generate default drawable splash
    const defaultDir = path.join(root, 'android/app/src/main/res/drawable');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    const tempSvg = path.join(root, 'temp-splash-default.svg');
    fs.writeFileSync(tempSvg, generateSplashSvg(480, 320));
    await sharp(tempSvg).png().toFile(path.join(defaultDir, 'splash.png'));
    fs.unlinkSync(tempSvg);
    console.log('  drawable: 480x320 (default)');

    console.log('Done! Splash screens generated in android/app/src/main/res/drawable-*/');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

generateSplash();