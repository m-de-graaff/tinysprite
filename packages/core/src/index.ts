export interface TinySpriteFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

export function decodeTinySprite(bytes: Uint8Array): TinySpriteFrame[] {
  // TODO: implement real decoder later
  return [];
}
