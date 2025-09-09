## TinySprite Spec v1 (Deflate-friendly text encoding)

Goal: human-readable, extremely compressible text that decodes with a tiny JS/TS parser. All integers are base-36 unless noted.

- Numbers: use base-36 (parse with `parseInt(token, 36)`).
- Separators: `:` for headers, `|` between header and payload, `/` between rows, `,` between runs, `.` inside runs.
- Whitespace is optional and may be omitted; decoders should ignore ASCII spaces and tabs outside of tokens.
- Comments are not part of the format; fixtures avoid comments. Explanations here are for humans.

### Palettes (palette-first)
Token: `P:`
- Global/per-pack palette. Up to 256 colors.
- Colors: `rrggbb` or `rrggbbaa` (hex, lowercase), optional compact `rgb`/`rgba` (RGB444/ARGB4444), decoders must expand to 8-bit per channel.
- Example:
```text
P: 000000, ffffff, ffcc00, 00ff00, 0000ff, 00000000
```
- Alpha: if `aa` (or `a` in 4-bit form) is present, it is used; otherwise alpha = ff.

### Sprites (row-RLE + row repetition)
Token: `s:`
- Grammar: `s:w,h|rows`
- `rows := row ('/' row)*`
- `row := run (',' run)* | '=' | '=*n`  (row repetition)
- `run := count '.' colorIndex | '_'`
- All integers (`w`,`h`,`count`,`colorIndex`,`n`) are base-36.
- `colorIndex` is an index into the active palette.
- `_` is a shorthand for a single transparent pixel (equivalent to `1.0` if palette index 0 is transparent). For longer transparent runs use `count.0`.
- Row repetition:
  - `=` repeats the entire previous row once
  - `=*n` repeats the entire previous row `n` additional times
- Examples:
```text
s:8,8|8.0/=*7                    # 8x8 fully color 0
s:8,2|4.1,4.2/4.2,4.1            # two rows with two colors
s:4,4|4.1/=*3                    # row repeat
s:4,2|2.1,_,1.1,1.2/4.2          # '_' = 1 transparent pixel (index 0)
```

Decoder notes:
- Split on `|` into header and body.
- Parse `w,h` then iterate rows split by `/`.
- For each row token:
  - `=`: duplicate previous row
  - `=*n`: duplicate previous row `n` times
  - Otherwise split by `,` into runs; each run is either `_` or `count.index`.
- Interpret all numbers in base-36.

### Patterns & mini-dictionary (optional)
Token: `d:`
- Define short aliases for row fragments to reduce repetition.
- Grammar: `d: NAME=row (',' run)* ( ';' NAME=row ... )`
- After a dictionary line, sprite rows may use `NAME` in place of a row; `NAME+NAME` is not concatenation (single NAME denotes a row). For row fragments within a row, expand at `NAME` positions separated by commas.
- Example:
```text
d: A=4.1,4.2; B=2.1,2.2,2.1
s:8,3|A/B/A
```
- Decoders should expand NAME to its defined run-list when encountered within a row.

### Tilemaps
Tokens: `S:` (tileset sprites), `m:` (map)
- Tileset: a list of sprite tiles (`s:`) that share the same palette.
- Map grammar: `m:tw,th,gw,gh|rows`
  - `tw,th`: tile width,height in pixels (base-36)
  - `gw,gh`: grid width,height in tiles (base-36)
  - rows use runs of `count.index` where `index` is a tile index into the tileset list
  - `=` and `=*n` apply to rows as in sprites
- Example (2 tiles, 4×2 map of 8×8 tiles):
```text
P: 000000,ffffff
S: s:8,8|8.0/=*7 ; s:8,8|8.1/=*7
m:8,8,4,2|2.0,2.1/4.1
```

### Animations (frames and diffs)
Tokens: `f:` (frame), optional `t=` (duration ms)
- A full frame can be a complete `s:` or a reference to a base plus row patches.
- Diff grammar: `f: base=# | t=ms, patches`
  - `base=#` references a prior full frame by index (base-36), or omit to patch the immediately previous frame
  - `patches := (rN: row) ( '/' rN: row )*` where `N` is a zero-based row number
  - `row` uses the same row syntax as sprites, including `=` and dictionary names
- Examples:
```text
# full frames
f: s:8,2|8.0/8.1
f: t=a, s:8,2|8.1/8.0           # a (10) ms

# diffs over previous
f: t=64, r0: 8.1/ r1: =
```

### Pack file
Sections; order is flexible but palettes should precede users of palette.
- Sections and tokens:
  - `P:` palettes (one per pack is typical)
  - `S:` sprites (tileset or general library)
  - `T:` tilesets (named groups of sprites) – optional sugar around `S:`
  - `M:` tilemaps
  - `A:` animations
  - `X:` tracks (reserved; not specified in v1)
- Multiple entries within a section are separated by `;`.
- Example pack:
```text
P: 000000,ffffff,ffcc00
S: s:4,4|4.0/=*3 ; s:4,4|4.1/=*3
M: m:4,4,2,2|2.0,2.1/2.1,2.0
A: f: s:4,4|4.0/=*3 ; f: t=32, r1: 4.1
```

### Size/Deflate notes
- Prefer repeated characters and simple tokens: long `count` runs and row repetition compress very well.
- Use dictionary (`d:`) to name repeated motifs.

### Error handling
- Decoders should fail fast on malformed tokens.
- Unknown section tokens in pack files should be ignored for forward compatibility.

### Versioning
- This is v1. Future versions may extend tokens; decoders should tolerate extra sections they do not understand.
