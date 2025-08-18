# TinySprites API Reference

This document provides the complete API reference for the TinySprites library.

## Core Classes

### TinySprite

The main class for creating and manipulating TinySprites.

#### Constructor

```javascript
new TinySprite(width, height, options?)
```

**Parameters:**

- `width` (number): Width of the sprite in pixels
- `height` (number): Height of the sprite in pixels
- `options` (object, optional): Configuration options
  - `colorMode` (string): Color mode ('TSV8', 'RGB332', 'PAL12', 'RGB888')
  - `transparencyKey` (number): Index to use for transparency
  - `compressionProfile` (string): 'general' or 'planar-only'

**Example:**

```javascript
const sprite = new TinySprite(32, 32, {
  colorMode: "TSV8",
  transparencyKey: 0,
});
```

#### Methods

##### setPixel(x, y, color)

Sets a pixel at the specified coordinates.

**Parameters:**

- `x` (number): X coordinate
- `y` (number): Y coordinate
- `color` (number|string): Color value (hex string or number)

**Example:**

```javascript
sprite.setPixel(0, 0, 0xff0000); // Red pixel
sprite.setPixel(1, 1, "#00FF00"); // Green pixel
```

##### getPixel(x, y)

Gets the color of a pixel at the specified coordinates.

**Parameters:**

- `x` (number): X coordinate
- `y` (number): Y coordinate

**Returns:** (number) Color value

**Example:**

```javascript
const color = sprite.getPixel(0, 0);
```

##### fill(color)

Fills the entire sprite with a single color.

**Parameters:**

- `color` (number|string): Color value

**Example:**

```javascript
sprite.fill(0x000000); // Fill with black
```

##### encode(options?)

Encodes the sprite to TinySprites format.

**Parameters:**

- `options` (object, optional): Encoding options
  - `format` (string): Output format ('buffer', 'base64', 'hex')
  - `quality` (number): Compression quality (0-100)

**Returns:** (Buffer|string) Encoded sprite data

**Example:**

```javascript
const encoded = sprite.encode({ format: "base64" });
const buffer = sprite.encode({ format: "buffer" });
```

##### decode(data)

Static method to decode TinySprites data.

**Parameters:**

- `data` (Buffer|string): Encoded sprite data

**Returns:** (TinySprite) Decoded sprite instance

**Example:**

```javascript
const decoded = TinySprite.decode(encodedData);
```

##### toCanvas()

Converts the sprite to an HTML5 Canvas element.

**Returns:** (HTMLCanvasElement) Canvas element

**Example:**

```javascript
const canvas = sprite.toCanvas();
document.body.appendChild(canvas);
```

##### toImageData()

Converts the sprite to ImageData for use with Canvas 2D context.

**Returns:** (ImageData) ImageData object

**Example:**

```javascript
const imageData = sprite.toImageData();
ctx.putImageData(imageData, 0, 0);
```

## Utility Functions

### Color Conversion

#### rgbToTsv8(r, g, b)

Converts RGB values to TSV8 color space.

**Parameters:**

- `r` (number): Red component (0-255)
- `g` (number): Green component (0-255)
- `b` (number): Blue component (0-255)

**Returns:** (number) TSV8 color value

**Example:**

```javascript
const tsv8Color = rgbToTsv8(255, 0, 0); // Red to TSV8
```

#### tsv8ToRgb(tsv8)

Converts TSV8 color to RGB values.

**Parameters:**

- `tsv8` (number): TSV8 color value

**Returns:** (object) Object with r, g, b properties (0-255)

**Example:**

```javascript
const rgb = tsv8ToRgb(tsv8Color);
console.log(rgb.r, rgb.g, rgb.b);
```

### Compression Utilities

#### analyzeCompression(imageData)

Analyzes image data to determine optimal compression settings.

**Parameters:**

- `imageData` (ImageData|Array): Image data to analyze

**Returns:** (object) Compression analysis results

- `recommendedBpi` (number): Recommended bits-per-index
- `colorCount` (number): Number of unique colors
- `compressionProfile` (string): Recommended compression profile

**Example:**

```javascript
const analysis = analyzeCompression(imageData);
console.log(`Recommended BPI: ${analysis.recommendedBpi}`);
```

## Error Handling

The library throws descriptive errors for common issues:

```javascript
try {
  const sprite = new TinySprite(-1, 32); // Invalid width
} catch (error) {
  console.error(error.message); // "Invalid width: -1. Width must be positive."
}

try {
  sprite.setPixel(100, 0, 0xff0000); // Out of bounds
} catch (error) {
  console.error(error.message); // "Pixel coordinates (100, 0) out of bounds"
}
```

## Performance Considerations

- **Memory usage**: Sprites are stored efficiently in memory
- **Encoding speed**: Optimized for real-time encoding
- **Decoding speed**: Single-pass decoding for streaming applications
- **File size**: Typically 10-50% of equivalent PNG size for small sprites

## Browser Compatibility

- **Modern browsers**: Full support (ES6+)
- **Legacy browsers**: Requires polyfills for ArrayBuffer, Uint8Array
- **Node.js**: Full support (Buffer API)

## TypeScript Support

Full TypeScript definitions are included:

```typescript
interface TinySpriteOptions {
  colorMode?: "TSV8" | "RGB332" | "PAL12" | "RGB888";
  transparencyKey?: number;
  compressionProfile?: "general" | "planar-only";
}

class TinySprite {
  constructor(width: number, height: number, options?: TinySpriteOptions);
  // ... methods
}
```
