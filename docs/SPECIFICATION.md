# TinySprites Technical Specification

This document provides the complete technical specification for the TinySprites image format, including file structure, compression algorithms, and implementation details.

## File Format Specification

### Header Structure

```
[ B0 ]   : 0b1111vvvv  (magic/version; v=1 in v1)
[ VAR ]  : width  (ULEB128)
[ VAR ]  : height (ULEB128)
[ B1 ]   : flags
          bits 7..6: color_mode (00 TSV8, 01 RGB332, 10 PAL12, 11 RGB888)
          bits 5..3: bits-per-index (bpi-1)  → 1..8 bits/index
          bit  2   : has_transparency_key (0/1)
          bit  1   : tiling/anim present (0/1)
          bit  0   : compression profile (0=general, 1=planar-only)
[ OPT ]  : transparency_key (1 byte index) if bit2 set
[ STREAM ]: token stream (see below)
```

### Header Details

- **ULEB128 encoding** saves space on tiny sizes (e.g., 12 fits in 1 byte)
- **Bits-per-index (bpi)** lets the encoder pick the smallest palette index width (1..8). Typical sprites often fit in 2–4 bits (4–16 colors)
- **Color entries** (for PAL12/RGB888) are defined via palette tokens in the stream (so you don't pay if you don't need them)

## Color Modes

### Default: TSV8 (Tiny HSV)

By default, TinySprites uses TSV8 (Tiny HSV), a perceptual 8-bit color:

- **H**: 4 bits (0–15) – coarse hue ring
- **S**: 2 bits (0–3) – saturation
- **V**: 2 bits (0–3) – value/brightness

This covers black/white/greys (S=0), browns (low-S, orange hue, mid-V), and saturated primaries—perfect for pixel art. It's compact, byte-addressable, and maps well to sRGB on decode.

### Alternative Color Modes

Fallback/alt modes (flag-selectable in header):

- **RGB332** (legacy 8-bit)
- **PAL12** (palette entries in 12-bit 4:4:4)
- **RGB888** (full color; rarely needed for sprites)

**Transparency**: Optional key-index (one palette index = transparent). No alpha bytes needed.

## Token Stream (Compression Core)

A very small LZ/RLE hybrid specialized for pixel art. Pixels are read in raster order (row by row). Indices are bit-packed at the chosen bpi (1..8).

Each token begins with a 2-bit class (top bits), followed by class-specific fields:

### 00 = RLE (Run of a single index)

```
00 | len_var | index_bits
```

- `len_var` is ULEB128 (1..∞), but tiny runs (1–16) have single-byte short forms
- Great for flat areas and outlines

### 01 = LITERAL (Inline indices)

```
01 | len_var | packed_indices
```

- The raw sequence when patterns don't repeat

### 10 = COPY (LZ back-reference)

```
10 | offset_var | len_var
```

- Copies previously emitted indices, enabling "pattern reuse"
- This is where your RRGGBBGBRRRGGBB trick shines:
  - First emit RRGGBB once (literal)
  - Later, use COPY to reference that exact 6-index span (or any part) instead of repeating it
- Offsets are measured in indices from the current write head

### 11 = CONTROL (Small opcodes)

Subtype byte follows (low nibble = sub-op):

| Code | Operation  | Description                                                                                       |
| ---- | ---------- | ------------------------------------------------------------------------------------------------- |
| 0x0  | END        | Terminates stream                                                                                 |
| 0x1  | SOLID      | Solid fill (1 color for entire image)<br>Zero-cost decode for 1-color sprites → microscopic files |
| 0x2  | NEWROW     | Optional hint to align copies by row (saves a byte in some streams)                               |
| 0x3  | PAL_ADDx   | Add x new palette entries (x=1,4,16); entries encoded per color_mode                              |
| 0x4  | PAT_DEF    | Define a short pattern ID (0..15) with length L and payload (packed indices)                      |
| 0x5  | PAT_USE    | Emit pattern ID k repeated n times (micro-dictionary, even cheaper than COPY for super-repeaters) |
| 0x6  | ROW_REPEAT | Copy previous row (optionally with an XOR mask nibble repeated across the row)                    |
| 0x7  | SKIP       | Skip N indices (implicitly transparent if key is set)—handy for sparse sprites                    |

In practice: the encoder picks RLE for flat runs, COPY/PAT_USE for repeats, and LITERAL for odd bits. CONTROL ops keep the stream small and self-describing.

## Smart Optimizations (Encoder Strategies)

### Auto-bpi Selection

- Inspect color count; pick 1/2/3/4 bpp where possible
- If 17+ colors, try palette partitioning per row/tile to stay at 4 bpp

### Row-aware COPY

- Prefer COPY offsets that start exactly one row back (height-distance)
- Many pixel motifs repeat across rows

### Micro-patterns (PAT_DEF/PAT_USE)

- Great for motifs like "RRGGBB", checkerboards, repeated borders
- The encoder auto-discovers patterns up to length 16 with a rolling hash
- PAT_USE beats COPY when repeated 3+ times

### Solid-first Heuristic

- If >85% of pixels are the same index, emit SOLID + sparse SKIP/LITERAL patches (delta sprite)
- Often wins on partially empty/transparent icons

### Palette Deltas

- In PAL12/RGB888 modes, store palette as delta from last entry (zigzag varints)
- Small color ramps (UI tints/shades) store in a handful of bytes

### Transparent-key Suppression

- If a color is dominant background, make it the key and "skip" it with SKIP runs instead of writing it

## Forward Compatibility

- **Version nibble** in B0; unknown tokens are safely skippable
- **CONTROL subtypes** include a length when not trivially sized, so future tools can skip unknown blocks
- **Feature flags** (B1) reserve space for tiles/anim/metadata in v2+
- **Palette block types** are self-describing by color mode—adding a new color space is trivial

## V2 Roadmap (Tilemaps & Animations)

### Tilemaps

Optional tiling header (bit in flags + tiny subheader):

- Tile size (e.g., 8×8), tile count (varint)
- Tile stream = concatenation of tiny tile sprites (same token set)
- Map layer references tile IDs with RLE/COPY (super small for levels/UI)

### Animations

- **Frame table**: per-frame duration (varint)
- **Inter-frame COPY**: allow COPY across previous frame buffer (temporal LZ)
- **Optional palette tween block** (micro-shader vibe with TSV8)

All of this sits after the base header under CONTROL blocks; v1 decoders that don't know "tiles/anim" can still decode the first base frame.

## Implementation Notes

### ULEB128 Encoding

ULEB128 (Unsigned Little-Endian Base 128) is used for variable-length integers:

```
For values 0-127:  1 byte  (0xxxxxxx)
For values 128-16383: 2 bytes (1xxxxxxx 0xxxxxxx)
For values 16384+: 3+ bytes (1xxxxxxx 1xxxxxxx 0xxxxxxx...)
```

### Bit Packing

Indices are packed at the chosen bits-per-index (bpi) value:

- **1 bpi**: 8 indices per byte
- **2 bpi**: 4 indices per byte
- **3 bpi**: 2.67 indices per byte (2 indices in 6 bits, 1 in 2 bits)
- **4 bpi**: 2 indices per byte
- **5-8 bpi**: Similar packing with byte boundaries

### Compression Profiles

- **General (0)**: Full compression with all token types
- **Planar-only (1)**: Optimized for images with strong horizontal patterns

## Performance Characteristics

- **Decoding speed**: Single-pass, streaming-friendly
- **Memory usage**: Minimal working set
- **Compression ratio**: Excellent for small images (< 64x64 pixels)
- **Header overhead**: Minimal compared to PNG/GIF

## Use Cases

- **Game sprites** and UI elements
- **Web icons** and small graphics
- **Embedded graphics** in applications
- **Database storage** of small images
- **Streaming applications** requiring fast decode
