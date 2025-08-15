# 🎨 TinySprites Benchmark Report

## 📊 Target Sprite Analysis

**Packed String:** `"dx9|4000444fd0fff\u0001\u0001A\u0012\tA!\u0011\u0001\u0001C!\u0019\r%\u0002\u0001E!\u0001\u0011\u0005\u0003\u0012\u0001\u0001#\u0013\u0002\t\u0007\u0001\u0001E\u0003\u0011\u0001\t\u0003\u0002\tA\u0001\u0011#\u0001\tA\u0001A!\u0012+B\t\u0001\u0001A#\u0001\u0001\u0005\u000b\u0005\t\u0001\u0001\u0012\t\u0001\u0003Q)\u0015)\u0001"`

| Property | Value |
|----------|-------|
| Dimensions | 13 × 9 pixels |
| Total Pixels | 117 |
| Packed Size | 93 characters |
| Compression Ratio | 1.26x |
| Palette Colors | 5 |

### Palette
- **T (Transparent):** Checkerboard pattern
- **A:** 000
- **B:** 444
- **C:** fd0
- **D:** fff

## 📁 Benchmark Files Comparison (Ranked by Size)

| Rank | File | Type | Size | Comparison |
|------|------|------|------|------------|
| 🎯 | **TinySprites Packed** | TinySprites Format | 0.09 KB | - |
| 2 | **sprite-optimized.webp** | WebP Image | 0.09 KB | 1.03x |
| 3 | **WebP ultra-compressed** | WebP ultra-compressed | 0.09 KB | 1.03x |
| 4 | **WebP high-compressed** | WebP high-compressed | 0.09 KB | 1.03x |
| 5 | **WebP medium-compressed** | WebP medium-compressed | 0.09 KB | 1.03x |
| 6 | **WebP low-compressed** | WebP low-compressed | 0.09 KB | 1.03x |
| 7 | **sprite-optimized.png** | PNG Image | 0.15 KB | 1.61x |
| 8 | **PNG ultra-compressed** | PNG ultra-compressed | 0.15 KB | 1.61x |
| 9 | **PNG high-compressed** | PNG high-compressed | 0.15 KB | 1.61x |
| 10 | **PNG medium-compressed** | PNG medium-compressed | 0.15 KB | 1.62x |
| 11 | **PNG low-compressed** | PNG low-compressed | 0.15 KB | 1.66x |
| 12 | **sprite-optimized.avif** | AVIF Image | 0.48 KB | 5.28x |

## 🏆 Benchmark Summary

- **Smallest file:** TinySprites Packed (0.09 KB)
- **Second smallest:** sprite-optimized.webp (0.09 KB)
- **Largest file:** sprite-optimized.avif (0.48 KB)
- **TinySprites packed:** 0.09 KB

✅ **TinySprites format is competitive with image formats**

## 📋 Packed Format Details

### Format Structure
`{dims}|{cnt}{hex...}{order?}![data64]`

- **Dimensions (base36):** 13×9 → `d×9`
- **Palette Tokens:** 000, 444, fd0, fff
- **Data Encoding:** Base64 of 4bpp indices with XOR diff + RLE0

### Data Breakdown
  The packed data uses a combination of:
  - **4bpp packing:** Two pixel indices per byte
  - **XOR differential:** XOR each byte with previous to improve RLE
  - **Zero RLE:** Runs of zero bytes are compressed as `0 + count`

### Compression Analysis
- **Raw pixel data:** 117 pixels
- **Packed representation:** 93 characters
- **Compression ratio:** 1.26x
- **Space savings:** 20.5%

## 🔍 Technical Notes

- **Base64 encoding** avoids control characters for safe JSON and clipboard use
- **XOR + RLE** make sequential pixel data highly compressible
- **Palette optimization** reduces color data overhead
- **Format efficiency** varies based on sprite complexity and color distribution

## 🚀 Running Your Own Benchmarks

To run benchmarks on your own sprites:

1. **Navigate to the benchmarks folder:**
   ```bash
   cd benchmarks
   ```

2. **Run the benchmark analyzer:**
   ```bash
   node benchmark-analyzer.js
   ```

3. **View the generated reports:**
   - `benchmark-report.html` - Interactive HTML report
   - `benchmarks.md` - Markdown documentation

4. **Customize the sprite:**
   Edit the `TARGET_SPRITE` variable in `benchmark-analyzer.js` to test different sprites.

---

*Generated on 2025-08-15T22:27:43.896Z*
