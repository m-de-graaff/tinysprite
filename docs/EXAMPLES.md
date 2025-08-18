# TinySprites Examples

This document provides practical examples and use cases for the TinySprites library.

## Basic Usage

### Creating a Simple Sprite

```javascript
import { TinySprite } from "tinysprites";

// Create a 16x16 sprite
const sprite = new TinySprite(16, 16);

// Draw a simple pattern
for (let x = 0; x < 16; x++) {
  for (let y = 0; y < 16; y++) {
    if (x === y) {
      sprite.setPixel(x, y, 0xff0000); // Red diagonal line
    } else if (x + y === 15) {
      sprite.setPixel(x, y, 0x00ff00); // Green diagonal line
    }
  }
}

// Encode and save
const encoded = sprite.encode();
fs.writeFileSync("diagonal.ts", encoded);
```

### Loading and Displaying

```javascript
// Load a sprite
const loadedSprite = TinySprite.decode(encoded);

// Convert to canvas and display
const canvas = loadedSprite.toCanvas();
document.body.appendChild(canvas);

// Or use with existing canvas context
const ctx = canvas.getContext("2d");
const imageData = loadedSprite.toImageData();
ctx.putImageData(imageData, 0, 0);
```

## Game Development Examples

### Creating Game Sprites

```javascript
// Player character sprite
const player = new TinySprite(32, 32, { colorMode: "TSV8" });

// Draw player body
for (let x = 8; x < 24; x++) {
  for (let y = 8; y < 24; y++) {
    player.setPixel(x, y, 0x0000ff); // Blue body
  }
}

// Draw player eyes
player.setPixel(12, 12, 0xffffff); // White eye
player.setPixel(20, 12, 0xffffff); // White eye
player.setPixel(12, 13, 0x000000); // Black pupil
player.setPixel(20, 13, 0x000000); // Black pupil

// Save player sprite
const playerData = player.encode();
```

### Sprite Animation

```javascript
// Create multiple frames for walking animation
const frames = [];
const frameCount = 4;

for (let frame = 0; frame < frameCount; frame++) {
  const walkingSprite = new TinySprite(32, 32);

  // Draw walking pose based on frame
  const legOffset = Math.sin((frame * Math.PI) / 2) * 2;

  // Draw body
  for (let x = 8; x < 24; x++) {
    for (let y = 8; y < 24; y++) {
      walkingSprite.setPixel(x, y, 0x0000ff);
    }
  }

  // Draw legs with animation
  for (let y = 24; y < 32; y++) {
    walkingSprite.setPixel(12 + legOffset, y, 0x8b4513); // Brown leg
    walkingSprite.setPixel(20 - legOffset, y, 0x8b4513); // Brown leg
  }

  frames.push(walkingSprite.encode());
}

// Save animation frames
frames.forEach((frame, index) => {
  fs.writeFileSync(`walking_${index}.ts`, frame);
});
```

## Web Development Examples

### Icon Generation

```javascript
// Create a simple app icon
const icon = new TinySprite(64, 64, { colorMode: "TSV8" });

// Fill background
icon.fill(0x4a90e2); // Blue background

// Draw icon symbol
for (let x = 20; x < 44; x++) {
  for (let y = 20; y < 44; y++) {
    if (x >= 24 && x <= 40 && y >= 24 && y <= 40) {
      icon.setPixel(x, y, 0xffffff); // White center
    } else if (x >= 20 && x <= 44 && y >= 20 && y <= 44) {
      icon.setPixel(x, y, 0xf5a623); // Orange border
    }
  }
}

// Convert to base64 for inline use
const iconBase64 = icon.encode({ format: "base64" });
const dataUrl = `data:image/ts;base64,${iconBase64}`;

// Use in HTML
const img = document.createElement("img");
img.src = dataUrl;
document.body.appendChild(img);
```

### Responsive Graphics

```javascript
// Create a responsive logo that scales well
const logo = new TinySprite(128, 32, { colorMode: "TSV8" });

// Draw company name
const drawLetter = (x, y, letter) => {
  const patterns = {
    T: [
      [0, 0, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0],
    ],
    I: [
      [0, 0, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1],
    ],
    N: [
      [0, 0, 1, 0, 0, 0, 0, 1],
      [0, 0, 1, 1, 0, 0, 0, 1],
      [0, 0, 1, 0, 1, 0, 0, 1],
      [0, 0, 1, 0, 0, 1, 0, 1],
      [0, 0, 1, 0, 0, 0, 1, 1],
      [0, 0, 1, 0, 0, 0, 0, 1],
    ],
  };

  const pattern = patterns[letter];
  if (pattern) {
    for (let py = 0; py < pattern.length; py++) {
      for (let px = 0; px < pattern[py].length; px++) {
        if (pattern[py][px]) {
          logo.setPixel(x + px, y + py, 0x000000); // Black letter
        }
      }
    }
  }
};

// Draw "TINY" text
drawLetter(10, 8, "T");
drawLetter(25, 8, "I");
drawLetter(40, 8, "N");
drawLetter(55, 8, "Y");

// Save logo
const logoData = logo.encode();
```

## Database and Storage Examples

### Storing Sprites in Database

```javascript
// SQLite example
const db = new sqlite3.Database("sprites.db");

// Create table for sprites
db.run(`
    CREATE TABLE IF NOT EXISTS sprites (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        data BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Store a sprite
const storeSprite = (name, sprite) => {
  const encoded = sprite.encode({ format: "buffer" });

  db.run(
    "INSERT INTO sprites (name, width, height, data) VALUES (?, ?, ?, ?)",
    [name, sprite.width, sprite.height, encoded],
    function (err) {
      if (err) {
        console.error("Error storing sprite:", err);
      } else {
        console.log(`Sprite ${name} stored with ID ${this.lastID}`);
      }
    }
  );
};

// Retrieve a sprite
const getSprite = (name, callback) => {
  db.get("SELECT * FROM sprites WHERE name = ?", [name], (err, row) => {
    if (err) {
      callback(err);
    } else if (row) {
      const sprite = TinySprite.decode(row.data);
      callback(null, sprite);
    } else {
      callback(new Error("Sprite not found"));
    }
  });
};

// Usage
storeSprite("player", player);
getSprite("player", (err, sprite) => {
  if (!err) {
    console.log("Retrieved sprite:", sprite.width, "x", sprite.height);
  }
});
```

### JSON Storage

```javascript
// Store sprite data in JSON
const spriteCollection = {
  sprites: [
    {
      name: "player",
      width: 32,
      height: 32,
      data: player.encode({ format: "base64" }),
    },
    {
      name: "enemy",
      width: 24,
      height: 24,
      data: enemy.encode({ format: "base64" }),
    },
  ],
};

// Save to file
fs.writeFileSync("sprites.json", JSON.stringify(spriteCollection, null, 2));

// Load from file
const loaded = JSON.parse(fs.readFileSync("sprites.json", "utf8"));
loaded.sprites.forEach((spriteInfo) => {
  const sprite = TinySprite.decode(spriteInfo.data);
  console.log(`Loaded ${spriteInfo.name}: ${sprite.width}x${sprite.height}`);
});
```

## Performance Examples

### Batch Processing

```javascript
// Process multiple images efficiently
const processImages = async (imageFiles) => {
  const results = [];

  for (const file of imageFiles) {
    try {
      // Load image
      const image = await loadImage(file);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      // Convert to TinySprite
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const sprite = TinySprite.fromImageData(imageData);

      // Encode with optimal settings
      const analysis = analyzeCompression(imageData);
      const encoded = sprite.encode({
        quality: analysis.recommendedBpi * 10,
      });

      results.push({
        name: file.name,
        originalSize: file.size,
        compressedSize: encoded.length,
        compressionRatio: ((encoded.length / file.size) * 100).toFixed(1),
      });
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
    }
  }

  return results;
};

// Usage
const files = document.getElementById("fileInput").files;
const results = await processImages(files);
results.forEach((result) => {
  console.log(`${result.name}: ${result.compressionRatio}% of original size`);
});
```

### Streaming Decoder

```javascript
// Decode sprite data as it arrives
class StreamingDecoder {
  constructor() {
    this.buffer = [];
    this.decoder = null;
  }

  receiveChunk(chunk) {
    this.buffer.push(chunk);

    // Try to decode if we have enough data
    if (this.buffer.length > 0) {
      try {
        const combined = Buffer.concat(this.buffer);
        this.decoder = TinySprite.decode(combined);
        this.buffer = []; // Clear buffer after successful decode

        // Emit decoded event
        this.onDecoded?.(this.decoder);
      } catch (error) {
        // Not enough data yet, continue buffering
      }
    }
  }

  getSprite() {
    return this.decoder;
  }
}

// Usage with network streaming
const decoder = new StreamingDecoder();
decoder.onDecoded = (sprite) => {
  console.log("Sprite decoded:", sprite.width, "x", sprite.height);
  displaySprite(sprite);
};

// Simulate receiving data in chunks
const encodedData = player.encode();
const chunkSize = 8;
for (let i = 0; i < encodedData.length; i += chunkSize) {
  const chunk = encodedData.slice(i, i + chunkSize);
  decoder.receiveChunk(chunk);
}
```

## Advanced Examples

### Custom Color Palettes

```javascript
// Create a sprite with custom palette
const createPaletteSprite = (width, height, colors) => {
  const sprite = new TinySprite(width, height, { colorMode: "PAL12" });

  // Add custom colors to palette
  colors.forEach((color, index) => {
    sprite.addPaletteColor(color);
  });

  return sprite;
};

// Create a retro game sprite with limited colors
const retroSprite = createPaletteSprite(16, 16, [
  0x000000, // Black
  0xffffff, // White
  0xff0000, // Red
  0x00ff00, // Green
  0x0000ff, // Blue
]);

// Draw retro pattern
for (let x = 0; x < 16; x++) {
  for (let y = 0; y < 16; y++) {
    const colorIndex = (x + y) % 5;
    retroSprite.setPixel(x, y, colorIndex);
  }
}
```

### Pattern Recognition

```javascript
// Create a sprite with repeating patterns
const createPatternSprite = () => {
  const sprite = new TinySprite(64, 64);

  // Define a repeating pattern
  const pattern = [
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 1],
  ];

  // Apply pattern across the sprite
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const patternX = x % 4;
      const patternY = y % 4;
      const shouldFill = pattern[patternY][patternX];

      if (shouldFill) {
        sprite.setPixel(x, y, 0x000000); // Black
      } else {
        sprite.setPixel(x, y, 0xffffff); // White
      }
    }
  }

  return sprite;
};

const patternSprite = createPatternSprite();
const encoded = patternSprite.encode();
console.log("Pattern sprite size:", encoded.length, "bytes");
```

These examples demonstrate the versatility and power of the TinySprites library across different use cases and scenarios.
