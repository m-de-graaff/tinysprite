export interface TrackEvent<T> {
  t: number;
  v: T;
}

export function sampleTrack<T>(events: TrackEvent<T>[], time: number): T | undefined {
  let prev: TrackEvent<T> | undefined;
  for (const e of events) {
    if (e.t > time) break;
    prev = e;
  }
  return prev?.v;
}
