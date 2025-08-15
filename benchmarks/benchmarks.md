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
| 🎯 | **TinySprites Packed** | TinySprites Format | 0.11 KB | - |
| 2 | **tiny_sprite.png** | PNG Image | 0.21 KB | 1.97x |
| 3 | **tiny_sprite.gif** | GIF Animation | 0.66 KB | 6.23x |
| 4 | **sprite.gif** | GIF Animation | 0.67 KB | 6.34x |
| 5 | **sprite_original.png** | PNG Image | 1.00 KB | 9.46x |

## 🏆 Benchmark Summary

- **Smallest file:** TinySprites Packed (0.11 KB)
- **Second smallest:** tiny_sprite.png (0.21 KB)
- **Largest file:** sprite_original.png (1.00 KB)
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

*Generated on 2025-08-15T14:54:05.661Z*
