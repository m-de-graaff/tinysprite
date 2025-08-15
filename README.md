# TinySprites 🎨

A lightweight, zero-dependency JavaScript library for creating, manipulating, and rendering pixel art sprites. Perfect for games, demos, and creative coding projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Size](https://img.shields.io/bundlephobia/min/tinysprites)](https://bundlephobia.com/result?p=tinysprites)

## ✨ Features

- **Ultra-lightweight**: Only ~2KB minified and gzipped
- **Zero dependencies**: Pure vanilla JavaScript
- **Powerful API**: Create, manipulate, and render sprites
- **Efficient encoding**: Compact packed format for sharing
- **Canvas integration**: Easy rendering to HTML5 Canvas
- **Transformations**: Flip, rotate, and manipulate sprites
- **Visual editor**: Built-in web-based sprite editor
- **Cross-platform**: Works in browsers and Node.js

## 🚀 Quick Start

### CDN (Browser)

```html
<script src="./tinysprites.min.js"></script>
<script>
  // Create a simple 8x8 sprite
  const sprite = TinySprites.create(8, 8, 0, ["#ff0000", "#00ff00", "#0000ff"]);

  // Draw it to a canvas
  const canvas = document.getElementById("myCanvas");
  const ctx = canvas.getContext("2d");
  TinySprites.draw(ctx, sprite, 0, 0, { scale: 4 });
</script>
```

### NPM

```bash
npm install tinysprites
```

```javascript
const TinySprites = require("tinysprites");

// Create a sprite
const sprite = TinySprites.create(16, 16, 0, ["#ff0000", "#00ff00"]);
```

## 📚 API Reference

### Core Functions

#### `TinySprites.create(width, height, fillIndex, paletteHex)`

Creates a new sprite with specified dimensions and optional palette.

```javascript
// Create a 16x16 transparent sprite
const sprite = TinySprites.create(16, 16);

// Create a 8x8 sprite filled with color index 1
const sprite = TinySprites.create(8, 8, 1, ["#ff0000", "#00ff00"]);

// Access sprite properties
console.log(sprite.width); // 8
console.log(sprite.height); // 8
console.log(sprite.data); // Uint8Array of pixel indices
console.log(sprite.palette); // Array of RGBA colors
```

#### `TinySprites.makePalette(hexTokens)`

Creates a palette from hex color tokens.

```javascript
const palette = TinySprites.makePalette(["#ff0000", "#00ff00", "#0000ff"]);
// Returns: [[0,0,0,0], [255,0,0,255], [0,255,0,255], [0,0,255,255]]
// Index 0 is always transparent
```

### Encoding & Decoding

#### `TinySprites.encodePacked(sprite, paletteHex, rawMode)`

Encodes a sprite into a compact packed string format.

```javascript
const sprite = TinySprites.create(8, 8, 1, ["#ff0000", "#00ff00"]);
const packed = TinySprites.encodePacked(sprite, ["ff0000", "00ff00"]);
console.log(packed); // "8x8|ff0000.00ff00|8A8B..."

// Use raw mode for literal encoding (no RLE compression)
const rawPacked = TinySprites.encodePacked(sprite, ["ff0000", "00ff00"], true);
```

#### `TinySprites.decodePacked(packedString)`

Decodes a packed string back into a sprite object.

```javascript
const packed = "8x8|ff0000.00ff00|8A8B...";
const sprite = TinySprites.decodePacked(packed);
console.log(sprite.width); // 8
console.log(sprite.height); // 8
```

### Rendering

#### `TinySprites.draw(ctx, sprite, x, y, options)`

Draws a sprite to a canvas context.

```javascript
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");

// Basic drawing
TinySprites.draw(ctx, sprite, 10, 20);

// With scaling
TinySprites.draw(ctx, sprite, 0, 0, { scale: 3 });

// Fit to specific dimensions
TinySprites.draw(ctx, sprite, 0, 0, { fit: { w: 100, h: 100 } });
```

#### `TinySprites.toCanvas(sprite, scale)`

Creates a canvas element with the sprite rendered at specified scale.

```javascript
const canvas = TinySprites.toCanvas(sprite, 4);
document.body.appendChild(canvas);
```

#### `TinySprites.toImageData(sprite)`

Converts sprite to ImageData for advanced canvas operations.

```javascript
const imageData = TinySprites.toImageData(sprite);
ctx.putImageData(imageData, 0, 0);
```

### Transformations

#### `TinySprites.flipH(sprite)`

Flips sprite horizontally.

```javascript
const flippedSprite = TinySprites.flipH(sprite);
```

#### `TinySprites.flipV(sprite)`

Flips sprite vertically.

```javascript
const flippedSprite = TinySprites.flipV(sprite);
```

#### `TinySprites.rot90(sprite)`, `TinySprites.rot180(sprite)`, `TinySprites.rot270(sprite)`

Rotates sprite by specified degrees.

```javascript
const rotatedSprite = TinySprites.rot90(sprite); // 90° clockwise
const rotatedSprite = TinySprites.rot180(sprite); // 180°
const rotatedSprite = TinySprites.rot270(sprite); // 270° clockwise
```

### Export Functions

#### `TinySprites.toImage(sprite, scale)`

Creates an HTML Image element.

```javascript
const img = TinySprites.toImage(sprite, 4);
img.onload = () => document.body.appendChild(img);
```

#### `TinySprites.toBitmap(sprite, scale)`

Creates an ImageBitmap (if supported).

```javascript
TinySprites.toBitmap(sprite, 4).then((bitmap) => {
  ctx.drawImage(bitmap, 0, 0);
});
```

## 🎨 Packed Format

TinySprites uses a compact packed format for sharing sprites:

```
{width}x{height}|{palette}|{rle_data}
```

### Format Breakdown

- **Width/Height**: Base36 encoded dimensions (e.g., `8x8`, `gx10`)
- **Palette**: Dot or comma separated hex colors without `#` (e.g., `ff0000.00ff00`)
- **RLE Data**: Run-length encoded pixel indices using base36 + symbols

### Symbol Mapping

- `T` = Transparent (index 0)
- `A` = Color index 1
- `B` = Color index 2
- `Z` = Color index 26

### Example Packed String

```
8x8|ff0000.00ff00.0000ff|8A8B8C8D8E8F8G8H
```

This represents an 8x8 sprite with red, green, and blue colors, with RLE-compressed pixel data.

## 🖥️ Web Editor

TinySprites includes a powerful web-based sprite editor:

### Features

- **Visual Grid Editor**: Click-to-paint interface
- **Real-time Preview**: See changes instantly
- **Color Palette Management**: Add, edit, and organize colors
- **Export Options**: Generate packed codes, PNG images
- **Transform Tools**: Flip, rotate, and manipulate sprites
- **Undo/Redo**: Full history support
- **Keyboard Shortcuts**: Fast workflow

### Usage

1. Open `pages/index.html` in your browser
2. Set sprite dimensions
3. Paint with the pencil tool
4. Add colors to your palette
5. Export as packed code or PNG

Or can be found [here](https://m-de-graaff.github.io/tinysprite/)!

## 📱 Demo Page

Test sprites and packed codes in the demo page:

1. Open `pages/demo.html`
2. Input any packed code
3. See the sprite rendered instantly
4. Browse built-in examples

Or can be found [here](https://m-de-graaff.github.io/tinysprite/demo)!

## 🔧 Development

### Building

```bash
npm install
npm run build          # Build minified library
npm run build-demo     # Inject library.json into demo.html
```

### Automated Build Process

The GitHub Actions workflow automatically:

1. **Injects library.json content** into demo.html during deployment
2. **Updates the sprite library** in the demo page automatically
3. **Ensures consistency** between library.json and the demo page

This means you can:

- Add new sprites to `pages/library.json`
- Push to main branch
- The demo page automatically includes the new sprites
- No manual file editing required

### Project Structure

```
tinysprite/
├── tinysprites.js          # Source library
├── tinysprites.min.js      # Minified library
├── pages/
│   ├── index.html          # Sprite editor
│   └── demo.html           # Demo viewer
├── build.js                # Build script
└── package.json
```

## 📖 Examples

### Create a Simple Sprite

```javascript
// Create a 16x16 sprite
const sprite = TinySprites.create(16, 16, 0, ["#ff0000", "#00ff00"]);

// Set some pixels (red)
sprite.data[0] = 1; // Top-left pixel
sprite.data[15] = 1; // Top-right pixel
sprite.data[240] = 1; // Bottom-left pixel
sprite.data[255] = 1; // Bottom-right pixel

// Draw to canvas
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
TinySprites.draw(ctx, sprite, 0, 0, { scale: 4 });
```

### Load and Display a Packed Sprite

```javascript
// Load from packed string
const packed = "8x8|ff0000.00ff00|8A8B8C8D8E8F8G8H";
const sprite = TinySprites.decodePacked(packed);

// Display with custom scaling
TinySprites.draw(ctx, sprite, 50, 50, { scale: 6 });
```

### Create an Animated Sprite

```javascript
// Create multiple frames
const frame1 = TinySprites.create(8, 8, 0, ["#ff0000"]);
const frame2 = TinySprites.create(8, 8, 0, ["#ff0000"]);

// Modify frames
frame1.data[0] = 1; // Red pixel in frame 1
frame2.data[7] = 1; // Red pixel in frame 2

// Animate
let currentFrame = 0;
const frames = [frame1, frame2];

setInterval(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  TinySprites.draw(ctx, frames[currentFrame], 0, 0, { scale: 4 });
  currentFrame = (currentFrame + 1) % frames.length;
}, 500);
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern JavaScript
- Optimized for performance and size
- Designed for ease of use and flexibility

---

**Made with ❤️ for the creative coding community**
