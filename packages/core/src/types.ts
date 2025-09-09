export type Palette = Uint32Array

export interface Run {
  c: number // count
  i: number // palette index
}

export interface Sprite {
  w: number
  h: number
  rows: Run[][]
}