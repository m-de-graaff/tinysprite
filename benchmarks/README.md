# 🎨 TinySprites Image Optimization with Sharp

This directory contains powerful image optimization tools that use **Sharp** to heavily optimize sprites from TinySprites format to various image formats with multiple compression levels.

## 🚀 Features

- **Multi-format support**: PNG, WebP, AVIF (JPEG removed - not suitable for pixel-perfect sprites)
- **Multiple compression levels**: Ultra, High, Medium, Low
- **Heavy optimization**: Uses Sharp's advanced compression algorithms
- **Transparency support**: Maintains alpha channels where possible
- **Batch processing**: Generate all formats and levels at once
- **Detailed reporting**: Comprehensive size analysis and comparisons

## ⚠️ Why No JPEG?

JPEG format was intentionally removed because:
- **Lossy compression**: Always introduces unwanted colors (like #e6e6e6)
- **No transparency support**: Requires background color substitution
- **Pixel art degradation**: Blurs sharp edges and introduces artifacts
- **Color bleeding**: Creates intermediate colors not in the original palette

For pixel-perfect sprites, use **PNG** (lossless) or **WebP** (lossless) instead.

## 📦 Installation

The Sharp dependency is already installed in the main project:

```bash
pnpm install
```

## 🛠️ Tools

### 1. Benchmark Analyzer (`benchmark-analyzer.js`)

The main benchmark tool that compares TinySprites format against heavily optimized images.

**Usage:**
```bash
cd benchmarks
node benchmark-analyzer.js
```

**What it does:**
- Parses the target sprite from TinySprites format
- Generates optimized images in PNG, WebP, and AVIF
- Creates multiple compression levels for each format
- Compares file sizes and generates detailed reports
- Outputs HTML and Markdown reports

### 2. Image Optimizer (`image-optimizer.js`)

A standalone tool for converting TinySprites to optimized images.

**Usage:**
```bash
cd benchmarks
node image-optimizer.js <packed-sprite> [output-dir] [base-name]
```

**Examples:**
```bash
# Basic usage
node image-optimizer.js "<packed-sprite>"

# With custom output directory
node image-optimizer.js "<packed-sprite>" optimized

# With custom base name
node image-optimizer.js "<packed-sprite>" optimized my-sprite
```

## 🎯 Optimization Levels

### PNG Optimization
- **Ultra**: Compression level 9, 8 colors, heavy dithering
- **High**: Compression level 8, 16 colors, medium dithering
- **Medium**: Compression level 6, 32 colors, light dithering
- **Low**: Compression level 4, 64 colors, minimal dithering

### WebP Optimization
- **Ultra**: Quality 60, effort 6, lossy
- **High**: Quality 75, effort 5, lossy
- **Medium**: Quality 85, effort 4, lossy
- **Low**: Quality 95, effort 3, lossy
- **Lossless**: Quality 100, effort 6, lossless

### JPEG Optimization
- **Ultra**: Quality 60, progressive, MozJPEG
- **High**: Quality 75, progressive, MozJPEG
- **Medium**: Quality 85, progressive, MozJPEG
- **Low**: Quality 95, progressive, MozJPEG

### AVIF Optimization
- **Ultra**: Quality 60, effort 9
- **High**: Quality 75, effort 6
- **Medium**: Quality 85, effort 4
- **Low**: Quality 95, effort 2

## 📊 Output

Running the tools generates:

1. **Optimized images** in multiple formats and compression levels
2. **HTML report** (`benchmark-report.html`) - Interactive visualization
3. **Markdown report** (`benchmarks.md`) - Documentation format
4. **Console output** - Real-time progress and results

## 🔧 Advanced Usage

### Custom Optimization Parameters

You can modify the optimization parameters in the code:

```javascript
// In image-optimizer.js
const levels = [
  { name: 'custom', quality: 70, effort: 5, lossless: false }
];
```

### Batch Processing Multiple Sprites

```javascript
const optimizer = new SpriteOptimizer();
const sprites = [
  "<packed-sprite-1>",
  "<packed-sprite-2>"
];


for (const packed of sprites) {
  const sprite = optimizer.parsePackedSprite(packed);
  await optimizer.optimizeSprite(sprite, 'output', `sprite-${Date.now()}`);
}
```

### Integration with Build Process

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "optimize": "node benchmarks/image-optimizer.js",
    "benchmark": "node benchmarks/benchmark-analyzer.js"
  }
}
```

## 📈 Performance Comparison

The Sharp-based optimization typically provides:

- **PNG**: 20-60% smaller than basic PNG generation
- **WebP**: 30-80% smaller than PNG equivalents
- **JPEG**: 40-90% smaller than PNG (lossy)
- **AVIF**: 50-90% smaller than WebP (next-gen format)

## 🎨 Format Recommendations

- **Web**: Use WebP with quality 75-85
- **Print**: Use PNG with compression level 6-8
- **Mobile**: Use AVIF with quality 70-80
- **Legacy**: Use JPEG with quality 80-90

## 🔍 Troubleshooting

### Common Issues

1. **Sharp installation errors**: Ensure you have Node.js 14+ and run `pnpm install`
2. **Memory issues**: Large sprites may require more memory; increase Node.js heap size
3. **Format support**: Some formats (AVIF) require recent Sharp versions

### Performance Tips

- Use `Promise.all()` for parallel processing
- Process sprites in batches for memory efficiency
- Choose appropriate quality levels for your use case

## 📚 API Reference

### SpriteOptimizer Class

```javascript
const optimizer = new SpriteOptimizer();

// Parse TinySprites format
const sprite = optimizer.parsePackedSprite(packedString);

// Optimize to all formats
const results = await optimizer.optimizeSprite(sprite, 'output', 'name');

// Generate report
const report = optimizer.generateReport(sprite, results);
```

### Methods

- `parsePackedSprite(packed)` - Parse TinySprites format
- `optimizeSprite(sprite, outputDir, baseName)` - Generate all optimizations
- `optimizePng(sprite, outputDir, baseName)` - PNG optimization only
- `optimizeWebP(sprite, outputDir, baseName)` - WebP optimization only
- `optimizeJpeg(sprite, outputDir, baseName)` - JPEG optimization only
- `optimizeAvif(sprite, outputDir, baseName)` - AVIF optimization only
- `generateReport(sprite, results)` - Generate optimization report

## 🤝 Contributing

To add new optimization features:

1. Add new format support in the `SpriteOptimizer` class
2. Update the `supportedFormats` array
3. Add corresponding optimization method
4. Update the main `optimizeSprite` method
5. Test with various sprite types

## 📄 License

MIT License - see main project license for details.
