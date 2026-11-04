import { useEffect, useRef } from 'react';

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawInterviewer(ctx: CanvasRenderingContext2D, time: number, level: number) {
  ctx.save();
  const background = ctx.createLinearGradient(0, 70, 620, 650);
  background.addColorStop(0, '#e6edf9');
  background.addColorStop(1, '#c7d8f1');
  ctx.fillStyle = background;
  ctx.fillRect(16, 70, 616, 578);
  ellipse(ctx, 170, 230, 160, 210, '#ffffff3b');
  ellipse(ctx, 530, 440, 150, 240, '#99b4df25');
  const breath = Math.sin(time / 1300) * 2;
  ctx.translate(0, breath);
  // The same illustrated character and camera are drawn into the visible and recorded canvas.
  const hair = ctx.createLinearGradient(230, 170, 440, 490);
  hair.addColorStop(0, '#3d3537');
  hair.addColorStop(1, '#1b202d');
  ellipse(ctx, 324, 329, 123, 164, hair);
  ctx.fillStyle = '#263349';
  ctx.beginPath();
  ctx.moveTo(142, 648);
  ctx.bezierCurveTo(150, 493, 200, 468, 280, 457);
  ctx.lineTo(368, 457);
  ctx.bezierCurveTo(464, 474, 492, 516, 508, 648);
  ctx.closePath();
  ctx.fill();
  const neck = ctx.createLinearGradient(0, 403, 0, 486);
  neck.addColorStop(0, '#c8917e');
  neck.addColorStop(1, '#efc0a5');
  ctx.fillStyle = neck;
  ctx.fillRect(291, 405, 67, 86);
  ctx.fillStyle = '#f5f5f8';
  ctx.beginPath();
  ctx.moveTo(276, 458);
  ctx.lineTo(324, 493);
  ctx.lineTo(373, 457);
  ctx.lineTo(371, 648);
  ctx.lineTo(278, 648);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#384960';
  ctx.beginPath();
  ctx.moveTo(276, 455);
  ctx.lineTo(239, 478);
  ctx.lineTo(259, 550);
  ctx.lineTo(282, 541);
  ctx.lineTo(324, 648);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(373, 455);
  ctx.lineTo(411, 478);
  ctx.lineTo(390, 550);
  ctx.lineTo(369, 541);
  ctx.lineTo(324, 648);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 229, 329, 17, 28, '#dfaa91');
  ellipse(ctx, 419, 329, 17, 28, '#dfaa91');
  const skin = ctx.createRadialGradient(294, 282, 10, 327, 329, 130);
  skin.addColorStop(0, '#f8d5bb');
  skin.addColorStop(0.75, '#e8b79c');
  skin.addColorStop(1, '#c98e79');
  ellipse(ctx, 324, 321, 95, 126, skin);
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(225, 310);
  ctx.bezierCurveTo(203, 167, 345, 133, 413, 235);
  ctx.bezierCurveTo(397, 219, 361, 246, 319, 222);
  ctx.bezierCurveTo(300, 278, 263, 256, 225, 310);
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#685047';
  ctx.beginPath();
  ctx.moveTo(260, 300);
  ctx.quadraticCurveTo(280, 290, 300, 299);
  ctx.moveTo(348, 299);
  ctx.quadraticCurveTo(368, 289, 388, 300);
  ctx.stroke();
  const blink = Math.sin(time / 2800) > 0.994;
  for (const x of [281, 368]) {
    if (blink) {
      ctx.strokeStyle = '#5e433e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 13, 320);
      ctx.lineTo(x + 13, 320);
      ctx.stroke();
    } else {
      ellipse(ctx, x, 320, 17, 8, '#fff8ef');
      ellipse(ctx, x + Math.sin(time / 7500) * 1.5, 320, 5, 6, '#514641');
      ellipse(ctx, x + 2, 318, 1.5, 2, '#fff');
    }
  }
  ctx.strokeStyle = '#c18c77';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(325, 326);
  ctx.quadraticCurveTo(318, 350, 328, 354);
  ctx.stroke();
  ellipse(ctx, 268, 353, 20, 11, '#dd99833b');
  ellipse(ctx, 382, 353, 20, 11, '#dd99833b');
  const opening = Math.max(0, Math.min(1, level));
  if (opening > 0.07) {
    ellipse(ctx, 326, 385, 21 + opening * 3, 4 + opening * 14, '#743e40');
    ellipse(ctx, 326, 379, 17, 2 + opening * 2, '#fff0e7');
  } else {
    ctx.strokeStyle = '#a56261';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(306, 382);
    ctx.quadraticCurveTo(326, 393, 347, 382);
    ctx.stroke();
  }
  ellipse(ctx, 231, 360, 4, 5, '#d7c7a6');
  ellipse(ctx, 418, 360, 4, 5, '#d7c7a6');
  ctx.restore();
}

export function drawInterviewScene(
  ctx: CanvasRenderingContext2D,
  options: {
    camera?: HTMLVideoElement | null;
    time: number;
    elapsedMs?: number;
    level?: number;
    candidateSpeaking?: boolean;
    caption?: string;
  },
) {
  ctx.clearRect(0, 0, 1280, 720);
  ctx.fillStyle = '#17243c';
  ctx.fillRect(0, 0, 1280, 720);
  drawInterviewer(ctx, options.time, options.level ?? 0);
  ctx.fillStyle = '#22324b';
  ctx.fillRect(648, 70, 616, 578);
  const camera = options.camera;
  if (camera && camera.readyState >= 2) {
    const width = camera.videoWidth || 640,
      height = camera.videoHeight || 360;
    const scale = Math.max(616 / width, 578 / height),
      sw = 616 / scale,
      sh = 578 / scale;
    ctx.save();
    ctx.translate(1912, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(camera, (width - sw) / 2, (height - sh) / 2, sw, sh, 648, 70, 616, 578);
    ctx.restore();
  } else {
    ellipse(ctx, 956, 290, 58, 58, '#425570');
    ellipse(ctx, 956, 426, 110, 76, '#425570');
    ctx.fillStyle = '#d1dced';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('开始后显示你的摄像头画面', 956, 535);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#f2f6ff';
  ctx.font = '600 22px sans-serif';
  ctx.fillText('AI 面试官', 36, 45);
  ctx.fillText('我 · 摄像头', 670, 45);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#a9bad5';
  const seconds = Math.floor((options.elapsedMs ?? 0) / 1000);
  ctx.fillText(
    options.elapsedMs
      ? `${Math.floor(seconds / 60)
          .toString()
          .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
      : '面试序章',
    1150,
    45,
  );
  ctx.fillStyle = '#1b2a43cc';
  ctx.fillRect(16, 594, 616, 54);
  ctx.fillRect(648, 594, 616, 54);
  ctx.fillStyle = '#e0e8f6';
  ctx.font = '17px sans-serif';
  ctx.fillText((options.level ?? 0) > 0.05 ? '正在提问' : '等待你的回答', 36, 627);
  ctx.fillText(options.candidateSpeaking ? '正在回答' : '自然开口，停顿后自动接续', 668, 627);
  if (options.caption) {
    ctx.font = '21px sans-serif';
    const lines: string[] = [];
    let line = '';
    for (const char of options.caption.slice(-120)) {
      if (ctx.measureText(line + char).width > 1180) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
    if (line) lines.push(line);
    const shown = lines.slice(-2);
    ctx.fillStyle = '#101b2df2';
    ctx.fillRect(16, 654, 1248, 62);
    ctx.fillStyle = '#fff';
    shown.forEach((value, index) => ctx.fillText(value, 32, 678 + index * 28));
  } else {
    ctx.fillStyle = '#96aac7';
    ctx.font = '15px sans-serif';
    ctx.fillText('专注表达，认真聆听 · 录像包含完整左右分屏与已开启字幕', 32, 691);
  }
}

export default function InterviewScene({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const value = canvas ?? document.createElement('canvas');
    value.width = 1280;
    value.height = 720;
    host.replaceChildren(value);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!canvas) {
      const context = value.getContext('2d')!;
      const draw = () => drawInterviewScene(context, { time: Date.now() });
      draw();
      timer = setInterval(draw, 1000 / 24);
    }
    return () => {
      if (timer) clearInterval(timer);
      host.replaceChildren();
    };
  }, [canvas]);
  return (
    <div
      className="interview-scene"
      ref={ref}
      role="img"
      aria-label="完整分屏画面：左侧 AI 面试官数字人，右侧我的摄像头"
    />
  );
}
