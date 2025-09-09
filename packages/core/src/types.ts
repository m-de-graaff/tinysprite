export type Palette = Uint32Array

export interface Run {
  c: number // count
  i: number // palette index (-1 = transparent)
}

export interface Sprite {
  w: number
  h: number
  rows: Run[][]
  pal?: Palette // optional palette reference for rendering convenience
  _css?: string[] // cached CSS colors derived from pal (for rendering); underscored for mangling
}
