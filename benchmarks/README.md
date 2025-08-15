# 🎨 TinySprites Benchmark Suite

This folder contains tools and files for benchmarking TinySprites against traditional image formats.

## 📁 Contents

- **`benchmark-analyzer.js`** - Node.js script to analyze sprite compression and generate reports
- **`benchmarks.md`** - Generated benchmark report in Markdown format
- **`benchmark-report.html`** - Interactive HTML benchmark report with visual sprite preview
- **Sample image files** - Various image formats for comparison

## 🚀 Quick Start

### Prerequisites

- Node.js installed on your system

### Running Benchmarks

1. **Navigate to this folder:**

   ```bash
   cd benchmarks
   ```

2. **Run the benchmark analyzer:**

   ```bash
   node benchmark-analyzer.js
   ```

3. **View the results:**
   - Open `benchmark-report.html` in your browser for the interactive report
   - Check `benchmarks.md` for the Markdown documentation

## 🔧 Customizing Benchmarks

### Testing Different Sprites

Edit the `TARGET_SPRITE` variable in `benchmark-analyzer.js`:

```javascript
const TARGET_SPRITE = "your_packed_sprite_string_here";
```

### Adding More Benchmark Files

Simply place additional image files (PNG, GIF, JPG) in this folder. The analyzer will automatically detect and include them in the comparison.

## 📊 What Gets Analyzed

The benchmark analyzer:

- **Decodes** the TinySprites packed format
- **Compares** file sizes across different formats
- **Ranks** files by size (smallest to largest)
- **Calculates** compression ratios
- **Generates** visual reports with sprite previews

## 🎯 Understanding the Results

- **🎯 TinySprites Packed** - Your sprite in TinySprites format
- **Rank numbers** - Position in size ranking (1 = smallest)
- **Comparison** - How many times larger than TinySprites format
- **Status** - Descriptive ranking (e.g., "Smallest file", "Second smallest file")

## 📈 Report Features

### HTML Report (`benchmark-report.html`)

- Interactive sprite preview canvas
- Color palette visualization
- Responsive design
- Professional styling

### Markdown Report (`benchmarks.md`)

- Technical analysis
- Size comparisons
- Format breakdown
- Usage instructions

## 🔍 Example Output

```
📁 BENCHMARK FILES (Ranked by Size)
=====================================
Smallest file        | TinySprites Packed        |     0.11 KB | TinySprites Format
Second smallest file | tiny_sprite.png           |     0.21 KB | PNG Image
Third smallest file  | tiny_sprite.gif           |     0.66 KB | GIF Animation
Largest file         | sprite_original.png       |     1.00 KB | PNG Image
```

## 💡 Tips

- **Small sprites** often show the best compression ratios
- **Complex sprites** with many colors may have different results
- **Animation formats** (GIF) include timing data that affects file size
- **PNG compression** varies based on image content and optimization

---

_Happy benchmarking! 🎨✨_
