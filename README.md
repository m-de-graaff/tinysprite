# TinySprites

A highly optimized 2D pixel art format designed for tiny files, fast decoding, and excellent compression at small dimensions.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)]()

## What is TinySprites?

TinySprites is a specialized image format that excels at compressing small 2D pixel art graphics. Unlike traditional formats like PNG or GIF, TinySprites is designed from the ground up for tiny sprites, icons, and UI elements where file size matters most.

### Key Features

- **🎯 Tiny file sizes** - Optimized for small images (typically < 64x64 pixels)
- **⚡ Fast decoding** - Single-pass, streaming-friendly decoder
- **🔧 Embeddable** - Can be stored as strings in code or databases
- **🚀 Forward-compatible** - Built-in versioning and extensibility
- **🎨 Pixel art optimized** - Specialized compression for 2D graphics

### Perfect For

- Game sprites and UI elements
- Web icons and small graphics
- Embedded graphics in applications
- Database storage of small images
- Streaming applications requiring fast decode

## Quick Start

### Basic Usage

```javascript
// Example: Creating a simple 16x16 sprite
const sprite = new TinySprite(16, 16);
sprite.setPixel(0, 0, 0xff0000); // Red pixel
const encoded = sprite.encode(); // Get compressed bytes
```

### File Format

TinySprites files are extremely compact:

```
Header (2-4 bytes) + Compressed pixel data
```

For a 16x16 single-color sprite, the entire file might be just **3-4 bytes**!

## How It Works

### Color Modes

**Default: TSV8 (Tiny HSV)**

- 8-bit perceptual color space optimized for pixel art
- H: 4 bits (0-15 hue), S: 2 bits (0-3 saturation), V: 2 bits (0-3 value)
- Covers the essential colors needed for most sprites

**Alternative modes:**

- RGB332 (legacy 8-bit)
- PAL12 (12-bit palette)
- RGB888 (full color)

### Compression Strategy

TinySprites uses a hybrid LZ/RLE approach specifically designed for pixel art:

1. **RLE (Run Length Encoding)** - For flat areas and solid colors
2. **LZ Copy** - For repeating patterns within the image
3. **Micro-patterns** - For small repeating motifs like borders
4. **Smart heuristics** - Auto-selects optimal bit depth and compression

### Example Compression

```
Original: 16x16 sprite with 4 colors
PNG:     ~200 bytes
GIF:     ~150 bytes
TinySprites: ~25 bytes
```

## Performance

- **Decoding speed**: Single-pass, streaming-friendly
- **Memory usage**: Minimal working set
- **Compression ratio**: Excellent for small images
- **Header overhead**: Minimal compared to PNG/GIF

## Roadmap

### Version 2 Features

- **Tilemaps** - Efficient storage of repeated tiles
- **Animations** - Frame-based animation support
- **Extended color modes** - Additional color spaces

All v2 features maintain backward compatibility with v1 decoders.

## GitHub Actions

This repository includes automated workflows for building, testing, and releasing:

### 🚀 Automatic Workflows

- **Build & Size Check** - Runs on every push and PR to verify builds and track file sizes
- **Size Monitoring** - Comments on PRs with bundle size analysis and impact assessment
- **Auto-Release** - Creates GitHub releases automatically when you push version tags

### 📊 Size Tracking

Every build automatically calculates and reports:

- Decoder bundle size
- Encoder bundle size
- Total bundle size
- Size budget compliance (≤20KB total)

### 🏷️ Creating Releases

To create a new release:

1. **Tag your release:**

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

2. **Workflow automatically:**
   - Builds the project
   - Calculates file sizes
   - Creates a GitHub release
   - Uploads dist files as release assets
   - Includes size information in release notes

### 📁 Workflow Files

- `.github/workflows/build.yml` - Build verification and size checking
- `.github/workflows/size-check.yml` - PR size analysis and commenting
- `.github/workflows/release.yml` - Automatic release creation

## Getting Started

### Installation

```bash
# If you have a package manager
npm install tinysprites

# Or clone the repository
git clone https://github.com/m-de-graaff/tinysprites.git
cd tinysprites
```

### Basic Example

```javascript
import { TinySprite } from "tinysprites";

// Create a simple sprite
const sprite = new TinySprite(32, 32);

// Draw something
for (let i = 0; i < 32; i++) {
  sprite.setPixel(i, i, 0xff0000); // Red diagonal line
}

// Compress and save
const compressed = sprite.encode();
fs.writeFileSync("sprite.ts", compressed);

// Later, decode and display
const decoded = TinySprite.decode(compressed);
displaySprite(decoded);
```

## Documentation

- **[Technical Specification](docs/SPECIFICATION.md)** - Complete format specification and implementation details
- **[API Reference](docs/API.md)** - Programming interface documentation
- **[Examples](docs/EXAMPLES.md)** - Sample code and use cases
- **[Contributing Guide](docs/CONTRIBUTING.md)** - How to contribute to the project

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Areas We'd Love Help With

- Encoder optimizations
- Additional language bindings
- Documentation improvements
- Performance benchmarking

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the need for tiny, embeddable graphics
- Built on years of experience with pixel art and game development
- Thanks to the open source community for feedback and testing

---

**Questions?** Open an [issue](https://github.com/m-de-graaff/tinysprites/issues) or join our [discussions](https://github.com/m-de-graaff/tinysprites/discussions)!
