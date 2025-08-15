#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const TinySprites = require('../tinysprites.js');

/**
 * TinySprites Image Optimizer using Sharp
 * Provides heavy image optimization for sprites in multiple formats
 */

class SpriteOptimizer {
  constructor() {
    this.supportedFormats = ['png', 'webp', 'avif']; // JPEG removed - not suitable for pixel-perfect sprites
    this.optimizationLevels = {
      ultra: { name: 'ultra-compressed', quality: 60, effort: 9 },
      high: { name: 'high-compressed', quality: 75, effort: 6 },
      medium: { name: 'medium-compressed', quality: 85, effort: 4 },
      low: { name: 'low-compressed', quality: 95, effort: 2 }
    };
  }

  /**
   * Parse TinySprites packed format using runtime decoder
   */
  parsePackedSprite(packed) {
    const s = TinySprites.decodePacked(packed);
    return {
      width: s.w,
      height: s.h,
      palette: s.palette,
      data: Array.from(s.data),
      packedLength: packed.length,
      rawSize: s.w * s.h,
      compressionRatio: ((s.w * s.h) / packed.length).toFixed(2)
    };
  }


  /**
   * Create RGBA buffer from sprite data
   */
  createRgbaBuffer(sprite) {
    const { width, height, data, palette } = sprite;
    const rgba = Buffer.alloc(width * height * 4);

    for (let i = 0; i < data.length; i++) {
      const colorIndex = data[i];
      const color = palette[colorIndex] || [0, 0, 0, 0];
      const pos = i * 4;
      rgba[pos] = color[0];
      rgba[pos + 1] = color[1];
      rgba[pos + 2] = color[2];
      rgba[pos + 3] = color[3];
    }

    return rgba;
  }



  /**
   * Optimize PNG with multiple compression levels
   */
  async optimizePng(sprite, outputDir, baseName) {
    const results = [];
    const rgba = this.createRgbaBuffer(sprite);
    
    const levels = [
      { name: 'ultra', compression: 9, colors: 8, dither: 0 },
      { name: 'high', compression: 8, colors: 16, dither: 0 },
      { name: 'medium', compression: 6, colors: 32, dither: 0 },
      { name: 'low', compression: 4, colors: 64, dither: 0 }
    ];
    
    for (const level of levels) {
      const outPath = path.join(outputDir, `${baseName}-${level.name}.png`);
      
      await sharp(rgba, { raw: { width: sprite.width, height: sprite.height, channels: 4 } })
        .png({ 
          compressionLevel: level.compression,
          adaptiveFiltering: false, // Disable adaptive filtering to preserve exact colors
          palette: false, // Disable palette mode to preserve exact colors
          dither: level.dither
        })
        .toFile(outPath);
      
      const stats = fs.statSync(outPath);
      results.push({
        format: 'PNG',
        level: level.name,
        path: outPath,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        compression: level.compression,
        colors: level.colors
      });
    }
    
    return results;
  }

  /**
   * Optimize WebP with multiple quality levels
   */
  async optimizeWebP(sprite, outputDir, baseName) {
    const results = [];
    const rgba = this.createRgbaBuffer(sprite);
    
    const levels = [
      { name: 'ultra', quality: 60, effort: 6, lossless: true },
      { name: 'high', quality: 75, effort: 5, lossless: true },
      { name: 'medium', quality: 85, effort: 4, lossless: true },
      { name: 'low', quality: 95, effort: 3, lossless: true },
      { name: 'lossless', quality: 100, effort: 6, lossless: true }
    ];
    
    for (const level of levels) {
      const outPath = path.join(outputDir, `${baseName}-${level.name}.webp`);
      
      await sharp(rgba, { raw: { width: sprite.width, height: sprite.height, channels: 4 } })
        .webp({ 
          quality: level.quality,
          lossless: level.lossless,
          nearLossless: false,
          smartSubsample: true,
          effort: level.effort
        })
        .toFile(outPath);
      
      const stats = fs.statSync(outPath);
      results.push({
        format: 'WebP',
        level: level.name,
        path: outPath,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        quality: level.quality,
        lossless: level.lossless
      });
    }
    
    return results;
  }



  /**
   * Optimize AVIF with multiple quality levels
   */
  async optimizeAvif(sprite, outputDir, baseName) {
    const results = [];
    const rgba = this.createRgbaBuffer(sprite);
    
    const levels = [
      { name: 'ultra', quality: 60, effort: 9 },
      { name: 'high', quality: 75, effort: 6 },
      { name: 'medium', quality: 85, effort: 4 },
      { name: 'low', quality: 95, effort: 2 }
    ];
    
    for (const level of levels) {
      const outPath = path.join(outputDir, `${baseName}-${level.name}.avif`);
      
      await sharp(rgba, { raw: { width: sprite.width, height: sprite.height, channels: 4 } })
        .avif({ 
          quality: level.quality,
          effort: level.effort,
          chromaSubsampling: '4:4:4'
        })
        .toFile(outPath);
      
      const stats = fs.statSync(outPath);
      results.push({
        format: 'AVIF',
        level: level.name,
        path: outPath,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        quality: level.quality,
        effort: level.effort
      });
    }
    
    return results;
  }

  /**
   * Optimize sprite to all formats and levels
   */
  async optimizeSprite(sprite, outputDir, baseName = 'sprite') {
    console.log(`🔄 Optimizing sprite (${sprite.width}×${sprite.height}) to all formats...`);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const results = [];
    
    try {
      // Optimize to all formats (JPEG removed - not suitable for pixel-perfect sprites)
      const [pngResults, webpResults, avifResults] = await Promise.all([
        this.optimizePng(sprite, outputDir, baseName),
        this.optimizeWebP(sprite, outputDir, baseName),
        this.optimizeAvif(sprite, outputDir, baseName)
      ]);
      
      results.push(...pngResults, ...webpResults, ...avifResults);
      
      console.log(`✅ Generated ${results.length} optimized images`);
      
    } catch (error) {
      console.error('❌ Error during optimization:', error.message);
      throw error;
    }
    
    return results;
  }

  /**
   * Generate optimization report
   */
  generateReport(sprite, results) {
    // Sort by size (smallest first)
    const sortedResults = [...results].sort((a, b) => a.size - b.size);
    
    console.log('\n📊 OPTIMIZATION REPORT');
    console.log('======================');
    console.log(`Sprite: ${sprite.width}×${sprite.height} pixels`);
    console.log(`Packed size: ${sprite.packedLength} characters (${(sprite.packedLength / 1024).toFixed(2)} KB)`);
    console.log(`Raw size: ${sprite.rawSize} pixels`);
    console.log(`Compression ratio: ${sprite.compressionRatio}x`);
    
    console.log('\n📁 OPTIMIZED FILES (Ranked by Size)');
    console.log('=====================================');
    
    sortedResults.forEach((result, index) => {
      const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
      const format = result.format.padEnd(8);
      const level = result.level.padEnd(12);
      const size = result.sizeKB.padStart(8);
      const ratio = (result.size / sprite.packedLength).toFixed(2);
      
      console.log(`${rank} | ${format} | ${level} | ${size} KB | ${ratio}x`);
    });
    
    // Summary statistics
    const smallest = sortedResults[0];
    const largest = sortedResults[sortedResults.length - 1];
    const avgSize = (sortedResults.reduce((sum, r) => sum + r.size, 0) / sortedResults.length / 1024).toFixed(2);
    
    console.log('\n🏆 SUMMARY');
    console.log('==========');
    console.log(`Smallest: ${smallest.format} ${smallest.level} (${smallest.sizeKB} KB)`);
    console.log(`Largest: ${largest.format} ${largest.level} (${largest.sizeKB} KB)`);
    console.log(`Average: ${avgSize} KB`);
    console.log(`Best compression: ${(smallest.size / sprite.packedLength).toFixed(2)}x vs TinySprites`);
    
    return {
      sprite,
      results: sortedResults,
      summary: {
        smallest: smallest,
        largest: largest,
        averageSize: avgSize,
        totalFiles: results.length
      }
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🎨 TinySprites Image Optimizer');
    console.log('==============================');
    console.log('');
    console.log('Usage: node image-optimizer.js <packed-sprite> [output-dir] [base-name]');
    console.log('');
    console.log('Example:');
    console.log('  node image-optimizer.js "<packed-sprite>" optimized sprites');
    console.log('');
    console.log('This will generate optimized images in PNG, WebP, and AVIF formats');
    console.log('with multiple compression levels for each format.');
    return;
  }
  
  const packedSprite = args[0];
  const outputDir = args[1] || 'optimized';
  const baseName = args[2] || 'sprite';
  
  try {
    const optimizer = new SpriteOptimizer();
    const sprite = optimizer.parsePackedSprite(packedSprite);
    
    console.log(`🎯 Parsed sprite: ${sprite.width}×${sprite.height} pixels`);
    console.log(`📦 Packed size: ${sprite.packedLength} characters`);
    
    const results = await optimizer.optimizeSprite(sprite, outputDir, baseName);
    const report = optimizer.generateReport(sprite, results);
    
    console.log('\n✅ Optimization complete!');
    console.log(`📁 Files saved to: ${path.resolve(outputDir)}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = SpriteOptimizer;
