# 🎨 TinySprites Benchmark Report

## 📊 Target Sprite Analysis

**Packed String:** `dx9|000.444.fd0.fff|5T2A3T1A7T1A1B3A1B3T1A2T7A1T2A4T2A1C2A1C1A1T1A3T7A1T2A5T4D4T1A3T2A3D5T6A1D1A5T4A1D3A1D2T`

| Property | Value |
|----------|-------|
| Dimensions | 13 × 9 pixels |
| Total Pixels | 117 |
| Packed Size | 108 characters |
| Compression Ratio | 1.08x |
| Palette Colors | 4 |

### Palette
- **T (Transparent):** Checkerboard pattern
- **A:** #000
- **B:** #444
- **C:** #fd0
- **D:** #fff

## 📁 Benchmark Files Comparison (Ranked by Size)

| Rank | File | Type | Size | Comparison |
|------|------|------|------|------------|
| 1 | **sprite-optimized.webp** | WebP Image | 0.09 KB | 0.89x |
| 2 | **WebP ultra-compressed** | WebP ultra-compressed | 0.09 KB | 0.89x |
| 3 | **WebP high-compressed** | WebP high-compressed | 0.09 KB | 0.89x |
| 4 | **WebP medium-compressed** | WebP medium-compressed | 0.09 KB | 0.89x |
| 5 | **WebP low-compressed** | WebP low-compressed | 0.09 KB | 0.89x |
| 🎯 | **TinySprites Packed** | TinySprites Format | 0.11 KB | - |
| 7 | **sprite-optimized.png** | PNG Image | 0.15 KB | 1.39x |
| 8 | **PNG ultra-compressed** | PNG ultra-compressed | 0.15 KB | 1.39x |
| 9 | **PNG high-compressed** | PNG high-compressed | 0.15 KB | 1.39x |
| 10 | **PNG medium-compressed** | PNG medium-compressed | 0.15 KB | 1.40x |
| 11 | **PNG low-compressed** | PNG low-compressed | 0.15 KB | 1.43x |
| 12 | **sprite-optimized.avif** | AVIF Image | 0.48 KB | 4.55x |

## 🏆 Benchmark Summary

- **Smallest file:** sprite-optimized.webp (0.09 KB)
- **Second smallest:** WebP ultra-compressed (0.09 KB)
- **Largest file:** sprite-optimized.avif (0.48 KB)
- **TinySprites packed:** 0.11 KB

✅ **TinySprites format is competitive with image formats**

## 📋 Packed Format Details

### Format Structure
`[w36]x[h36]|[pal]|[data]`

- **Dimensions (base36):** 13×9 → `d×9`
- **Palette Tokens:** 000, 444, fd0, fff
- **Data Encoding:** Base36 RLE + Literal

### Data Breakdown
The packed data uses a combination of:
- **RLE (Run-Length Encoding):** Number + Color (e.g., `5T` = 5 transparent pixels)
- **Literal Colors:** Direct color references (e.g., `A` = color A, `T` = transparent)

### Compression Analysis
- **Raw pixel data:** 117 pixels
- **Packed representation:** 108 characters
- **Compression ratio:** 1.08x
- **Space savings:** 7.7%

## 🔍 Technical Notes

- **Base36 encoding** provides compact representation for numbers
- **RLE compression** is effective for sprites with repeated colors
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

*Generated on 2025-08-15T17:18:36.771Z*
