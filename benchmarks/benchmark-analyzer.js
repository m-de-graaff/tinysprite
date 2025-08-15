#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// The sprite to benchmark
const TARGET_SPRITE = "dx9|000.444.fd0.fff|5T2A3T1A7T1A1B3A1B3T1A2T7A1T2A4T2A1C2A1C1A1T1A3T7A1T2A5T4D4T1A3T2A3D5T6A1D1A5T4A1D3A1D2T";

console.log('🔍 Analyzing sprite and benchmarks...\n');

// Parse the packed sprite
function parsePackedSprite(packed) {
  const parts = packed.split('|');
  if (parts.length < 3) {
    throw new Error('Invalid packed format');
  }
  
  const dimensions = parts[0];
  const palette = parts[1];
  const data = parts[2];
  
  // Parse dimensions (base36)
  const [w, h] = dimensions.split('x').map(d => parseInt(d, 36));
  
  // Parse palette
  const paletteColors = palette.split(/[.,]/).filter(Boolean).map(c => '#' + c);
  
  // Parse data (base36 RLE)
  let pixels = [];
  let i = 0;
  while (i < data.length) {
    const char = data[i];
    if (char >= '0' && char <= '9') {
      // RLE: number + color
      const count = parseInt(char, 36);
      const colorIndex = data[i + 1];
      const color = colorIndex === 'T' ? 0 : colorIndex.charCodeAt(0) - 64; // A=1, B=2, etc.
      for (let j = 0; j < count; j++) {
        pixels.push(color);
      }
      i += 2;
    } else {
      // Literal color
      const color = char === 'T' ? 0 : char.charCodeAt(0) - 64;
      pixels.push(color);
      i++;
    }
  }
  
  return {
    width: w,
    height: h,
    palette: paletteColors,
    data: pixels,
    packedLength: packed.length,
    rawSize: w * h,
    compressionRatio: ((w * h) / packed.length).toFixed(2)
  };
}

// Analyze file sizes
function analyzeFileSizes() {
  const benchmarkDir = __dirname;
  const files = fs.readdirSync(benchmarkDir).filter(file => 
    file.endsWith('.png') || file.endsWith('.gif') || file.endsWith('.jpg') || file.endsWith('.jpeg')
  );
  
  const fileAnalysis = files.map(file => {
    const filePath = path.join(benchmarkDir, file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    return {
      name: file,
      size: stats.size,
      sizeKB: sizeKB,
      extension: path.extname(file),
      type: getFileType(file)
    };
  });
  
  return fileAnalysis;
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.gif': return 'GIF Animation';
    case '.png': return 'PNG Image';
    case '.jpg':
    case '.jpeg': return 'JPEG Image';
    default: return 'Unknown';
  }
}

// Generate benchmark report
function generateBenchmarkReport() {
  try {
    const sprite = parsePackedSprite(TARGET_SPRITE);
    const fileAnalysis = analyzeFileSizes();
    
    // Add TinySprites to the comparison
    const allFiles = [
      {
        name: 'TinySprites Packed',
        size: sprite.packedLength,
        sizeKB: (sprite.packedLength / 1024).toFixed(2),
        extension: '.txt',
        type: 'TinySprites Format',
        isTinySprites: true
      },
      ...fileAnalysis
    ];
    
    // Sort by size (smallest first)
    allFiles.sort((a, b) => a.size - b.size);
    
    // Add ranking
    allFiles.forEach((file, index) => {
      if (index === 0) {
        file.rank = 'Smallest file';
      } else if (index === 1) {
        file.rank = 'Second smallest file';
      } else if (index === 2) {
        file.rank = 'Third smallest file';
      } else if (index === allFiles.length - 1) {
        file.rank = 'Largest file';
      } else {
        file.rank = `${(index + 1).toString().padStart(2, '0')}nd smallest file`;
      }
    });
    
    console.log('📊 SPRITE ANALYSIS');
    console.log('==================');
    console.log(`Dimensions: ${sprite.width}×${sprite.height} pixels`);
    console.log(`Palette: ${sprite.palette.length} colors`);
    console.log(`Packed size: ${sprite.packedLength} characters`);
    console.log(`Raw size: ${sprite.rawSize} pixels`);
    console.log(`Compression ratio: ${sprite.compressionRatio}x`);
    console.log(`Palette colors: ${sprite.palette.join(', ')}`);
    
    console.log('\n📁 BENCHMARK FILES (Ranked by Size)');
    console.log('=====================================');
    allFiles.forEach(file => {
      const rank = file.rank.padEnd(20);
      const name = file.name.padEnd(25);
      const size = file.sizeKB.padStart(8);
      const type = file.type.padEnd(20);
      console.log(`${rank} | ${name} | ${size} KB | ${type}`);
    });
    
    console.log('\n📈 SIZE COMPARISON');
    console.log('==================');
    
    const smallest = allFiles[0];
    const largest = allFiles[allFiles.length - 1];
    
    allFiles.forEach(file => {
      if (file.isTinySprites) {
        console.log(`🎯 ${file.name.padEnd(25)} | ${file.sizeKB.padStart(8)} KB | ${file.rank}`);
      } else {
        const ratio = (file.size / sprite.packedLength).toFixed(2);
        console.log(`📁 ${file.name.padEnd(25)} | ${file.sizeKB.padStart(8)} KB | ${ratio}x | ${file.rank}`);
      }
    });
    
    console.log('\n🏆 SUMMARY');
    console.log('==========');
    console.log(`Smallest file: ${smallest.name} (${smallest.sizeKB} KB)`);
    console.log(`Largest file: ${largest.name} (${largest.sizeKB} KB)`);
    console.log(`TinySprites packed: ${(sprite.packedLength / 1024).toFixed(2)} KB`);
    
    if (sprite.packedLength < smallest.size) {
      console.log('🎉 TinySprites format is the smallest!');
    } else if (sprite.packedLength < largest.size) {
      console.log('✅ TinySprites format is competitive with image formats');
    } else {
      console.log('📊 TinySprites format is larger than some image formats');
    }
    
    return { sprite, allFiles };
    
  } catch (error) {
    console.error('❌ Error analyzing sprite:', error.message);
    return null;
  }
}

// Generate HTML report
function generateHTMLReport(data) {
  if (!data) return;
  
  const { sprite, allFiles } = data;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TinySprites Benchmark Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d0f13; 
            color: #e8eaf3; 
            line-height: 1.6;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { 
            color: #78dcfa; 
            text-align: center; 
            margin-bottom: 30px;
            font-size: 2.5em;
        }
        .section { 
            background: #141824; 
            border: 1px solid #22283a; 
            border-radius: 12px; 
            padding: 20px; 
            margin-bottom: 20px;
        }
        h2 { 
            color: #78dcfa; 
            margin-bottom: 15px;
            border-bottom: 2px solid #22283a;
            padding-bottom: 8px;
        }
        .sprite-preview {
            display: flex;
            gap: 20px;
            align-items: center;
            margin: 20px 0;
        }
        .sprite-canvas {
            border: 2px solid #22283a;
            border-radius: 8px;
            background: #0f1422;
        }
        .sprite-info {
            flex: 1;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        .info-item {
            background: #0b0e17;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #1f2538;
        }
        .info-label {
            color: #9aa3b2;
            font-size: 0.9em;
            margin-bottom: 5px;
        }
        .info-value {
            font-size: 1.1em;
            font-weight: 600;
            color: #78dcfa;
        }
        .benchmark-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        .benchmark-table th,
        .benchmark-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #1f2538;
        }
        .benchmark-table th {
            background: #0b0e17;
            color: #78dcfa;
            font-weight: 600;
        }
        .benchmark-table tr:hover {
            background: rgba(120, 220, 250, 0.05);
        }
        .tinysprites-row {
            background: rgba(120, 220, 250, 0.1);
            border-left: 4px solid #78dcfa;
        }
        .rank-1 { color: #2dd4bf; font-weight: bold; }
        .rank-2 { color: #78dcfa; font-weight: bold; }
        .rank-3 { color: #9aa3b2; font-weight: bold; }
        .rank-last { color: #ff5b6b; font-weight: bold; }
        .summary {
            background: linear-gradient(135deg, #0b0e17, #141824);
            border: 2px solid #78dcfa;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }
        .summary h3 {
            color: #78dcfa;
            margin-bottom: 15px;
            font-size: 1.5em;
        }
        .metric {
            display: inline-block;
            margin: 0 20px;
            padding: 15px;
            background: rgba(120, 220, 250, 0.1);
            border-radius: 8px;
            border: 1px solid rgba(120, 220, 250, 0.3);
        }
        .metric-value {
            font-size: 1.8em;
            font-weight: bold;
            color: #78dcfa;
        }
        .metric-label {
            color: #9aa3b2;
            font-size: 0.9em;
            margin-top: 5px;
        }
        .palette {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin: 15px 0;
        }
        .color-swatch {
            width: 30px;
            height: 30px;
            border: 2px solid #1e2436;
            border-radius: 6px;
            position: relative;
        }
        .color-swatch.transparent {
            background: conic-gradient(#1a2032 0 25%, #141a29 0 50%, #1a2032 0 75%, #141a29 0) 0 0/8px 8px;
        }
        .color-swatch::after {
            content: attr(data-index);
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 10px;
            color: #8b9bb4;
            background: rgba(139, 155, 180, 0.1);
            padding: 2px 4px;
            border-radius: 3px;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 TinySprites Benchmark Report</h1>
        
        <div class="section">
            <h2>📊 Target Sprite Analysis</h2>
            <div class="sprite-preview">
                <canvas id="spriteCanvas" class="sprite-canvas" width="${sprite.width * 10}" height="${sprite.height * 10}"></canvas>
                <div class="sprite-info">
                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-label">Dimensions</div>
                            <div class="info-value">${sprite.width} × ${sprite.height} pixels</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Total Pixels</div>
                            <div class="info-value">${sprite.rawSize.toLocaleString()}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Packed Size</div>
                            <div class="info-value">${sprite.packedLength} characters</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Compression Ratio</div>
                            <div class="info-value">${sprite.compressionRatio}x</div>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Palette Colors</div>
                        <div class="palette">
                            <div class="color-swatch transparent" data-index="T"></div>
                            ${sprite.palette.map((color, i) => 
                                `<div class="color-swatch" style="background: ${color}" data-index="${String.fromCharCode(65 + i)}"></div>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>📁 Benchmark Files Comparison (Ranked by Size)</h2>
            <table class="benchmark-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>File</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Comparison</th>
                    </tr>
                </thead>
                <tbody>
                    ${allFiles.map((file, index) => {
                        const rankClass = index === 0 ? 'rank-1' : 
                                        index === 1 ? 'rank-2' : 
                                        index === 2 ? 'rank-3' : 
                                        index === allFiles.length - 1 ? 'rank-last' : '';
                        
                        const rowClass = file.isTinySprites ? 'tinysprites-row' : '';
                        
                        if (file.isTinySprites) {
                            return `
                                <tr class="${rowClass}">
                                    <td class="${rankClass}">1</td>
                                    <td><strong>${file.name}</strong></td>
                                    <td>${file.type}</td>
                                    <td>${file.sizeKB} KB</td>
                                    <td>-</td>
                                </tr>
                            `;
                        } else {
                            const ratio = (file.size / sprite.packedLength).toFixed(2);
                            return `
                                <tr class="${rowClass}">
                                    <td class="${rankClass}">${index + 1}</td>
                                    <td><strong>${file.name}</strong></td>
                                    <td>${file.type}</td>
                                    <td>${file.sizeKB} KB</td>
                                    <td>${ratio}x</td>
                                </tr>
                            `;
                        }
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="summary">
            <h3>🏆 Benchmark Summary</h3>
            <div class="metric">
                <div class="metric-value">${sprite.width}×${sprite.height}</div>
                <div class="metric-label">Sprite Size</div>
            </div>
            <div class="metric">
                <div class="metric-value">${(sprite.packedLength / 1024).toFixed(2)} KB</div>
                <div class="metric-label">Packed Size</div>
            </div>
            <div class="metric">
                <div class="metric-value">${sprite.compressionRatio}x</div>
                <div class="metric-label">Compression</div>
            </div>
            <div class="metric">
                <div class="metric-value">${sprite.palette.length}</div>
                <div class="metric-label">Colors</div>
            </div>
        </div>
        
        <div class="section">
            <h2>📋 Packed Format Details</h2>
            <div class="info-item">
                <div class="info-label">Packed String</div>
                <div class="info-value" style="font-family: monospace; word-break: break-all; background: #0a0f1b; padding: 10px; border-radius: 6px; margin-top: 8px;">
                    ${TARGET_SPRITE}
                </div>
            </div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Format</div>
                    <div class="info-value">[w36]x[h36]|[pal]|[data]</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Dimensions (base36)</div>
                    <div class="info-value">${sprite.width}×${sprite.height} → ${sprite.width.toString(36)}×${sprite.height.toString(36)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Palette Tokens</div>
                    <div class="info-value">${sprite.palette.map(c => c.slice(1)).join(', ')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Data Encoding</div>
                    <div class="info-value">Base36 RLE + Literal</div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Render the sprite preview
        const canvas = document.getElementById('spriteCanvas');
        const ctx = canvas.getContext('2d');
        const scale = 10;
        
        // Set canvas size
        canvas.width = ${sprite.width} * scale;
        canvas.height = ${sprite.height} * scale;
        
        // Draw sprite
        const palette = [null, ...${JSON.stringify(sprite.palette)}];
        const data = ${JSON.stringify(sprite.data)};
        
        for (let y = 0; y < ${sprite.height}; y++) {
            for (let x = 0; x < ${sprite.width}; x++) {
                const index = data[y * ${sprite.width} + x];
                if (index > 0 && palette[index]) {
                    ctx.fillStyle = palette[index];
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
        
        // Add grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= ${sprite.width}; i++) {
            ctx.beginPath();
            ctx.moveTo(i * scale, 0);
            ctx.lineTo(i * scale, ${sprite.height} * scale);
            ctx.stroke();
        }
        for (let i = 0; i <= ${sprite.height}; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * scale);
            ctx.lineTo(${sprite.width} * scale, i * scale);
            ctx.stroke();
        }
    </script>
</body>
</html>`;

  return html;
}

// Generate Markdown report
function generateMarkdownReport(data) {
  if (!data) return;
  
  const { sprite, allFiles } = data;
  
  const markdown = `# 🎨 TinySprites Benchmark Report

## 📊 Target Sprite Analysis

**Packed String:** \`${TARGET_SPRITE}\`

| Property | Value |
|----------|-------|
| Dimensions | ${sprite.width} × ${sprite.height} pixels |
| Total Pixels | ${sprite.rawSize.toLocaleString()} |
| Packed Size | ${sprite.packedLength} characters |
| Compression Ratio | ${sprite.compressionRatio}x |
| Palette Colors | ${sprite.palette.length} |

### Palette
- **T (Transparent):** Checkerboard pattern
${sprite.palette.map((color, i) => `- **${String.fromCharCode(65 + i)}:** ${color}`).join('\n')}

## 📁 Benchmark Files Comparison (Ranked by Size)

| Rank | File | Type | Size | Comparison |
|------|------|------|------|------------|
${allFiles.map((file, index) => {
  if (file.isTinySprites) {
    return `| 🎯 | **${file.name}** | ${file.type} | ${file.sizeKB} KB | - |`;
  } else {
    const ratio = (file.size / sprite.packedLength).toFixed(2);
    return `| ${index + 1} | **${file.name}** | ${file.type} | ${file.sizeKB} KB | ${ratio}x |`;
  }
}).join('\n')}

## 🏆 Benchmark Summary

- **Smallest file:** ${allFiles[0].name} (${allFiles[0].sizeKB} KB)
- **Second smallest:** ${allFiles[1].name} (${allFiles[1].sizeKB} KB)
- **Largest file:** ${allFiles[allFiles.length - 1].name} (${allFiles[allFiles.length - 1].sizeKB} KB)
- **TinySprites packed:** ${(sprite.packedLength / 1024).toFixed(2)} KB

${sprite.packedLength < allFiles[0].size ? 
  '🎉 **TinySprites format is the smallest!**' : 
  sprite.packedLength < allFiles[allFiles.length - 1].size ?
  '✅ **TinySprites format is competitive with image formats**' :
  '📊 **TinySprites format is larger than some image formats**'
}

## 📋 Packed Format Details

### Format Structure
\`[w36]x[h36]|[pal]|[data]\`

- **Dimensions (base36):** ${sprite.width}×${sprite.height} → \`${sprite.width.toString(36)}×${sprite.height.toString(36)}\`
- **Palette Tokens:** ${sprite.palette.map(c => c.slice(1)).join(', ')}
- **Data Encoding:** Base36 RLE + Literal

### Data Breakdown
The packed data uses a combination of:
- **RLE (Run-Length Encoding):** Number + Color (e.g., \`5T\` = 5 transparent pixels)
- **Literal Colors:** Direct color references (e.g., \`A\` = color A, \`T\` = transparent)

### Compression Analysis
- **Raw pixel data:** ${sprite.rawSize} pixels
- **Packed representation:** ${sprite.packedLength} characters
- **Compression ratio:** ${sprite.compressionRatio}x
- **Space savings:** ${((1 - sprite.packedLength / sprite.rawSize) * 100).toFixed(1)}%

## 🔍 Technical Notes

- **Base36 encoding** provides compact representation for numbers
- **RLE compression** is effective for sprites with repeated colors
- **Palette optimization** reduces color data overhead
- **Format efficiency** varies based on sprite complexity and color distribution

## 🚀 Running Your Own Benchmarks

To run benchmarks on your own sprites:

1. **Navigate to the benchmarks folder:**
   \`\`\`bash
   cd benchmarks
   \`\`\`

2. **Run the benchmark analyzer:**
   \`\`\`bash
   node benchmark-analyzer.js
   \`\`\`

3. **View the generated reports:**
   - \`benchmark-report.html\` - Interactive HTML report
   - \`benchmarks.md\` - Markdown documentation

4. **Customize the sprite:**
   Edit the \`TARGET_SPRITE\` variable in \`benchmark-analyzer.js\` to test different sprites.

---

*Generated on ${new Date().toISOString()}*
`;

  return markdown;
}

// Main execution
const benchmarkData = generateBenchmarkReport();

if (benchmarkData) {
  // Generate HTML report
  const htmlReport = generateHTMLReport(benchmarkData);
  fs.writeFileSync(path.join(__dirname, 'benchmark-report.html'), htmlReport);
  console.log('\n✅ Generated benchmark-report.html');
  
  // Generate Markdown report
  const markdownReport = generateMarkdownReport(benchmarkData);
  fs.writeFileSync(path.join(__dirname, 'benchmarks.md'), markdownReport);
  console.log('✅ Generated benchmarks.md');
  
  console.log('\n📊 Benchmark analysis complete!');
  console.log('📁 Check the generated files for detailed reports.');
  console.log('\n💡 To run benchmarks on your own sprites:');
  console.log('   1. cd benchmarks');
  console.log('   2. node benchmark-analyzer.js');
  console.log('   3. Edit TARGET_SPRITE variable to test different sprites');
} else {
  console.log('\n❌ Failed to generate benchmark reports');
}
