export function makeFrameLooper<T>(frames: T[]): () => T | undefined {
  let i = 0;
  return () => {
    if (frames.length === 0) return undefined;
    const value = frames[i];
    i = (i + 1) % frames.length;
    return value;
  };
}
