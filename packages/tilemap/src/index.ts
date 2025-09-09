import type { TinySpriteFrame } from '@tinysprite/core';

export interface Tilemap {
  columns: number;
  rows: number;
  tiles: number[];
}

export function renderTilemap(_frames: TinySpriteFrame[], _map: Tilemap): void {
  // placeholder implementation
}
