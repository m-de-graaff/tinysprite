## TinySprite FORMAT.md — Phase 1 DSL (Deflate‑friendly ASCII)

This document defines a compact, ASCII‑only, ZIP/deflate‑aware domain‑specific language (DSL) for describing palettes, sprites, tilesets, tilemaps, and animations. It is designed to gzip well (stable tokenization, repeated keys, few alphabets) and to be trivial to parse in a few KB of JavaScript without allocations.

Status: Phase 1 locked grammar surface. Later phases may add gated extensions without breaking existing decoders.

---

## 1) Design goals and constraints

- ASCII only. No BOM. Files are UTF‑8 (7‑bit subset) with no non‑ASCII required.
- Deflate‑friendly tokenization: predictable separators and key letters; repeated symbol set; no whitespace.
- Embedded strings are supported in a minimal, compression‑aware form.
- Lowercase keys/tokens for data; single‑letter UPPERCASE for top‑level sections; A/B/… capitals for pattern IDs.
- Numbers are base36 unless otherwise stated. Hex colors are lowercase rrggbb (optionally rrggbbaa) or rgb444.
- Whitespace: not allowed except a single optional newline between top‑level sections. Comments allowed with `#` to end‑of‑line (may hurt gzip; omit in production).

---

## 2) Reserved alphabet and tokens

- Allowed characters in the grammar: digits `0–9`, lowercase `a–z`, and symbols `, . | / = * ( ) # ^ < > @ ~ :`.
- Anything else is invalid in Phase 1.
- Case sensitive. Section tags are single UPPERCASE letters: `P S T M A X`.

---

## 3) File structure (pack)

A pack is a concatenation of sections. Section order is free (recommend: `P` then `K/H/T/…` defaults, then assets). No spaces.

- Section header: `X:` where `X ∈ {P,S,T,M,A,X}`.
- Optional final newline. Between sections, a single `\n` is allowed.

Top‑level comments: `# …\n` (discouraged for gz size).

---

## 4) Defaults and inheritance

Defaults reduce repetition and improve compression. Defaults are scoped and inherited by subsequent sections until changed.

- Header size: `H:w,h` (pixels). Applies to subsequent `S` unless overridden by that `S`.
- Palette: `K:pal` (palette literal defined in §5). Applies to `S`/`T`/`M`/`A`.
- Tile size: `T:w,h` (tile width,height). Applies to `T` and `M` unless they override.
- Frame delta time: `DT:ms` (integer milliseconds). Applies to `A` frames unless overridden per frame.
- Reset: `!` clears all defaults in the current pack scope (after `!`, no `H/K/T/DT` are in effect until re‑declared).

Placement: Defaults appear in `P:` or inline at the start of any section’s payload. Example: `P:K:...H:16,16DT:100`.

---

## 5) Palettes

Palette literals use comma‑separated color tokens. Valid color token forms:

- `rrggbb` (hex, lowercase)
- `rrggbbaa` (hex with alpha)
- `rgb444` (exactly 3 or 4 hex nibbles; expand to 8‑bit per channel by bit replication)

Grammar:
- Global: in `P:` or as a default `K:pal`.
- Per‑pack or per‑asset: place `K:pal` before an `S/T/M/A` body to override.

Example palette:
- `K:000000,ff0040,ffc000,ffffff`

Bitplane mode (optional, §10): If current palette size `K` is 2 or 4, a sprite may opt into bitplane encoding.

---

## 6) Numbers and encoding

- Integers are base36: digits `0–9` then `a–z` (a=10 … z=35). No sign. No prefix.
- Width/height, counts, indices, times use base36 unless explicitly noted.
- Hex colors are base16 lowercase.

---

## 7) Embedded strings

Minimal, gzip‑friendly strings appear in metadata pairs as `key=(...)` with no spaces.

- Syntax: `(` bytes `)` where bytes are printable ASCII except `)`.
- Escape: `~hh` encodes a byte by two lowercase hex digits (e.g., `~29` is `)`). `~~` decodes to a literal `~`.
- Parsers must decode `~hh` into a single byte. Encoders should only escape `)` and `~`.

Example: `name=(slime) author=(pico~20dev)`.

---

## 8) Patterns dictionary (row macros)

Define reusable row fragments to shorten sprite rows.

- Section local dictionary: `d:A=...,B=...,C=...` placed before rows (in `S:`).
- Identifiers are single capital letters `A–Z`.
- Right‑hand side is a row fragment using the same tokens as rows (runs, `_`, pattern refs). Commas separate runs.
- In rows, reference patterns by their letter `A` `B` … as if they were inlined.

Example dict: `d:A=3.1,2._,3.1 B=_ ,2.2,_`

---

## 9) Sprites (Row‑RLE)

Sprite payload uses row RLE with strong gzip locality.

Header:
- `s:w,h|` where `w,h` are base36 pixel dimensions. If omitted, `H:` default must exist.

Rows:
- Rows are separated by `/`.
- A row is one of:
  - `=` repeat previous row once
  - `=*n` repeat previous row `n` additional times (n base36; `=*0` is no‑op)
  - Otherwise: a comma‑separated list of tokens:
    - Run: `count.color` where:
      - `count` is base36 run length (≥1)
      - `color` is base36 palette index (0‑based)
    - Transparent single pixel: `_` (equivalent to `1.t` where `t` is the transparent index; transparency does not consume palette)
    - Pattern reference: `A`/`B`/… (inlines the fragment defined in `d:`)

Notes:
- A concrete row must expand to exactly `w` pixels.
- `=` is invalid for the first row.
- For maximum gzip gains, prefer repeating groups `=*n` for vertical stripes.

Full `S:` section:
- `S:` section contains an optional inline defaults block (e.g., `K:`), optional `d:` dictionary, then a single sprite `s:...`:

Example sprite (8×4 using palette indices):
- `S:H:8,4K:000000,ff0040,ffc000,ffffff d:A=3.1,2._,3.1 s:8,4|A/A/=/*2`

---

## 10) Optional sprite modes

- Bitplane mode (only if current palette has 2 or 4 entries): prefix the sprite header with `^b` → `s^b:w,h|...`.
  - 2‑color: rows encode bits MSB→LSB across width; `1` = index 1, `0` = index 0.
  - 4‑color: two bitplanes (LSB plane first, then MSB plane) concatenated per row using `,` between sub‑rows; width must be multiple of 8 for best gzip.
  - In bitplane mode, row tokens are sequences of base36 run‑bits: `count.bit` where `bit ∈ {0,1}`; `_` not used.
- Mirror X mode: `^x` applied on a sprite header `s^x:w,h|...` mirrors each row horizontally at decode time (encoder may still store left half patterns for gzip wins).
- Quadrant mode: `^q` on sprite header `s^q:w,h|...` replicates the first quadrant (⌈w/2⌉×⌈h/2⌉) into four; remaining rows must provide only that quadrant.
- Modes may be combined: `s^bx:w,h|...` (order is irrelevant).

---

## 11) Tilesets (`T:`)

Tilesets are ordered lists of fixed‑size tiles that tilemaps reference by index.

- Effective tile size comes from `T:w,h` default or an inline override `T:w,h` placed before tiles.
- Body: one or more tiles, each encoded as a sprite body with the same `w,h`:
  - Tile: `s|row(/row)*` or `s:w,h|...` if not using defaults.
  - Tiles are separated by `//` (double slash) to aid gzip’s run matching between tiles.
- Tile indices are 0‑based in insertion order.

Example tileset (two 8×8 tiles):
- `T:T:8,8K:000,fff s|.../...//s|.../...`

---

## 12) Tilemaps (`M:`)

Tilemaps place tile indices on a grid with optional row repetition.

Header:
- `m:tw,th,gw,gh|` where:
  - `tw,th` tile dimensions (base36). If omitted, inherited from default `T:w,h`.
  - `gw,gh` grid width,height in tiles (base36).

Rows:
- Each row encodes `gw` cells using comma‑separated tokens:
  - `count.index` — place `count` consecutive tiles with tileset index `index` (both base36)
  - `=` — repeat previous entire row once
  - `=*n` — repeat previous row `n` additional times

Notes:
- A concrete row expands to exactly `gw` cells.
- Map references the most recent `T:` tileset (or active default) unless an inline `T:` selects another tileset context.

---

## 13) Animations (`A:`)

Animations group time‑ordered frames targeting a sprite or tilemap, using either full frames or row diffs. Defaults (`DT`) apply if per‑frame time is omitted.

Targets:
- By convention, the `A:` section immediately follows the asset it animates (an `S:` or `M:`). Alternatively, `A:id=...` may appear where `id` is a string key to bind (encoders should co‑locate for gzip wins).

Frames:
- Full frame: `f:t=ms|` then a complete payload of the target type:
  - For sprite targets: `f:t=64| s:w,h|row/...`
  - For tilemap targets: `f:t=32| m:tw,th,gw,gh|row/...`
- Row diffs (sprite): a frame made of directives, each separated by `/`:
  - `rN: ...` — replace row `N` (0‑based) with a row body using sprite row tokens
  - `rN:=` — copy previous frame’s row `N`
  - `=*n` — repeat the entire previous frame `n` additional times
- Row diffs (tilemap): identical shape, but row bodies use tilemap row tokens (`count.index`, `=` disallowed within a diff row).

Timing:
- `t=ms` is base36 milliseconds. If omitted, use active `DT` default.

Example (sprite diffs):
- `A:DT:10 r3:_,3.1,_/r4:=/*5`

---

## 14) Pack section (`P:`) and metadata (`X:`)

`P:` is an optional header that can carry defaults and pack‑wide metadata. It does not carry pixel data.

- Place defaults: `K:... H:w,h T:w,h DT:ms`.
- Optional metadata pairs: `name=(...) author=(...) license=(...)` etc.

`X:` is a free‑form extension section for vendor‑specific data and future features. Grammar inside `X:` is opaque to the core decoder; tools must preserve unknown `X:` blocks.

---

## 15) Grammar (EBNF‑like)

Note: terminals are literal ASCII, numbers are base36 unless noted.

pack        := section ("\n" section)*
section     := Psec | Ssec | Tsec | Msec | Asec | Xsec
Psec        := "P:" pbody
Ssec        := "S:" sbefore sbody
Tsec        := "T:" tbefore tbody
Msec        := "M:" mbefore mbody
Asec        := "A:" abody
Xsec        := "X:" xbytes
pbody       := (default | meta)*
sbefore     := (default | dict)*
tbefore     := (default)*
mbefore     := (default | Tselect)?

; defaults and selects
default     := ("K:" pal) | ("H:" num "," num) | ("T:" num "," num) | ("DT:" num) | "!"
Tselect     := "T:" num "," num
meta        := key "=" string
key         := [a-z]+
string      := "(" (printable_no_paren | escape)* ")"
escape      := "~" hex hex | "~~"

; palette
pal         := color ("," color)*
color       := hex6 | hex8 | rgb444
hex6        := hexdig hexdig hexdig hexdig hexdig hexdig
hex8        := hex6 hexdig hexdig
rgb444      := hexdig hexdig hexdig | hexdig hexdig hexdig hexdig
hexdig      := [0-9a-f]

; sprite
sbody       := "s" modes? ":" (num "," num)? "|" row ("/" row)*
modes       := ("^" [bqx])+    ; b=bitplane, x=mirrorX, q=quadrant
row         := "=" | "=*" num | rowruns
rowruns     := rowtok ("," rowtok)*
rowtok      := run | "_" | patref
run         := num "." num      ; count.colorIndex
patref      := [A-Z]

dict        := "d:" assign ("," assign)*
assign      := [A-Z] "=" rowruns

; tileset
tbody       := tile ("//" tile)*
tile        := ("s" (":" num "," num)? "|") row ("/" row)*

; tilemap
mbody       := "m:" (num "," num ",")? num "," num "|" mrow ("/" mrow)*
mrow        := "=" | "=*" num | mrtok ("," mrtok)*
mrtok       := num "." num      ; count.index

; animation (subset)
abody       := (frame | sdiff | mdiff) ("/" (sdiff | mdiff))*
frame       := "f:t=" num "|" (sbody | mbody)
sdiff       := "r" num ":" (rowruns | "=") | "=*" num
mdiff       := "r" num ":" (mrtok ("," mrtok)*) | "=*" num

num         := [0-9a-z]+
printable_no_paren := any ASCII 0x20..0x7E except ")"

---

## 16) Semantics and validation

- Decoders must validate that expanded row lengths match declared widths (`w` or `gw`).
- `=` and `=*n` are illegal when there is no previous row/frame.
- Palette indices out of range are errors.
- Modes `^b`, `^x`, `^q` apply per sprite only; they do not persist to other sprites.
- Defaults apply from the point they appear forward until another default or `!`.
- Unknown section letters must be rejected except `X:` which is opaque and should be preserved.

---

## 17) Compression guidance (non‑normative but recommended)

- Omit whitespace and comments in production assets.
- Reuse dictionaries (`d:`), defaults, and tileset contexts to maximize token repetition.
- Prefer `=*n` for vertical bands; prefer runs with the same `colorIndex` to help deflate find repeats.
- Keep palettes stable across related sprites; keep section key order stable (`K:H:T:DT:`) for better gzip.
- For tilesets, group visually similar tiles and use `//` separator to improve LZ matches across tiles.
- For animations, sort frames so diffs are small; use row diffs (`rN:`) when only a few rows change.

---

## 18) Examples (abridged)

Small pack with a palette, one sprite using a pattern and a vertical repeat, a tileset + tilemap, and an anim diff:

Preamble and defaults:

```
P:K:000000,ff0040,ffc000,ffffff H:8,4 DT:0
```

Sprite with dictionary and row repeats:

```
S:d:A=3.1,2._,3.1 s:8,4|A/A/=/*2
```

Tileset of two 8×8 tiles and a 4×2 tilemap using indices:

```
T:T:8,8K:000,fff s|.../...//s|.../...
M:m:8,8,4,2|4.0,4.1/=/*1
```

Animation with two row diffs and 5 frame repeat:

```
A:DT:10 r3:_,3.1,_/r4:=/*5
```

---

## 19) Forward compatibility

- Future features will be gated under `X:` or by explicit new mode letters. Parsers must error on unknown mode letters in Phase 1.
- Encoders may emit additional metadata pairs in `P:`; decoders must ignore unknown `key=(...)` pairs.

---

## 20) Implementation checklist (decoder MVP)

- Parse pack as a single string without splits; maintain an index and a char→value LUT (base36).
- Decode palette to a Uint32Array RGBA.
- Expand rows with RLE and `=`/`=*n`; apply patterns by inlining.
- Render using canvas fillRect per run with cached fillStyle; disable image smoothing.
- Support `S`, `T`, `M`, `A` (full and diffs), `P` defaults, `X` passthrough. Bitplane optional.

