import { makeFrameLooper } from '@tinysprite/anim';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const frames = makeFrameLooper([0, 1, 2, 3]);
let tick = 0;
function loop() {
  tick++;
  if (tick % 20 === 0) frames();
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  requestAnimationFrame(loop);
}
loop();
