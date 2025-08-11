import React, { useEffect, useRef, useState } from "react";

// Doodle Jump mini — живой HUD и корректный подсчёт
const WIDTH = 360;
const HEIGHT = 560;
const GRAVITY = 0.30;
const JUMP_VELOCITY = -11.5;
const PLAYER_WIDTH = 36;
const PLAYER_HEIGHT = 40;
const PLATFORM_WIDTH = 68;
const PLATFORM_HEIGHT = 12;
const PLATFORM_GAP_MIN = 60;
const PLATFORM_GAP_MAX = 95;
const H_SPEED = 4.6;

type Platform = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx?: number;
  moving?: boolean;
  spring?: boolean;
};

export default function JumpUp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // нижний UI (оверлей)
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0); // для нижней подписи
  const [best, setBest] = useState<number>(() => {
    const v = localStorage.getItem("jumpup_best");
    return v ? parseInt(v) : 0;
  });

  // актуальный "лучший" в памяти, чтобы не ждать перерисовку React
  const bestRef = useRef(best);

  const stateRef = useRef({
    px: WIDTH / 2 - PLAYER_WIDTH / 2,
    py: HEIGHT - PLAYER_HEIGHT - 50,
    vx: 0,
    vy: 0,
    platforms: [] as Platform[],
    camY: 0,
    keys: { left: false, right: false },
    lastSpawnY: HEIGHT,
    started: false,

    // для счёта
    baseY: HEIGHT - PLAYER_HEIGHT - 50, // высота старта (чем меньше py, тем выше забрались)
    maxClimb: 0,
  });

  // ===== генерация платформ =====
  const initPlatforms = () => {
    const s = stateRef.current;
    s.platforms = [];
    let y = HEIGHT - 20;
    s.platforms.push({ x: WIDTH / 2 - 50, y, w: 100, h: PLATFORM_HEIGHT }); // стартовая широкая
    y -= 60;
    while (y > -2000) {
      const gap = randRange(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
      y -= gap;
      s.platforms.push(spawnPlatform(y));
    }
    s.lastSpawnY = y;
  };

  const spawnPlatform = (y: number): Platform => {
    const x = Math.random() * (WIDTH - PLATFORM_WIDTH);
    const moving = Math.random() < 0.18;
    const spring = !moving && Math.random() < 0.12;
    const vx = moving ? (Math.random() < 0.5 ? 1.2 : -1.2) : 0;
    return { x, y, w: PLATFORM_WIDTH, h: PLATFORM_HEIGHT, moving, vx, spring };
  };

  // ===== управление =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === "keydown") {
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") stateRef.current.keys.left = true;
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") stateRef.current.keys.right = true;
        if (e.key.toLowerCase() === "p") setRunning(r => !r);
        if (e.key.toLowerCase() === "r") restart();
      } else {
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") stateRef.current.keys.left = false;
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") stateRef.current.keys.right = false;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // ===== рестарт =====
  const restart = () => {
    const s = stateRef.current;
    s.px = WIDTH / 2 - PLAYER_WIDTH / 2;
    s.py = HEIGHT - PLAYER_HEIGHT - 50;
    s.vx = 0;
    s.vy = 0;
    s.camY = 0;
    s.keys = { left: false, right: false };
    s.started = false;

    initPlatforms();

    // счёт и стартовый прыжок
    s.baseY = s.py;         // запомнили высоту старта
    s.maxClimb = 0;
    s.vy = JUMP_VELOCITY;   // моментальный старт вверх

    setScore(0);
    setGameOver(false);
    setRunning(true);
  };

  // ===== игровой цикл =====
  useEffect(() => {
    initPlatforms();
    // стартовый пинок вверх и фиксация точки старта
    stateRef.current.baseY = stateRef.current.py;
    stateRef.current.vy = JUMP_VELOCITY;

    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (running && !gameOver) update();
      render(ctx); // HUD рисуем здесь — берём «живые» значения прямо из stateRef
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, gameOver]);

  // ===== логика =====
  const update = () => {
    const s = stateRef.current;

    // горизонталь
    s.vx = 0;
    if (s.keys.left) s.vx = -H_SPEED;
    if (s.keys.right) s.vx = H_SPEED;
    s.px += s.vx;

    // сквозные края
    if (s.px < -PLAYER_WIDTH) s.px = WIDTH;
    if (s.px > WIDTH) s.px = -PLAYER_WIDTH;

    // вертикаль
    s.vy += GRAVITY;
    s.py += s.vy;

    // камера
    if (s.py - s.camY < HEIGHT * 0.35) {
      s.camY = s.py - HEIGHT * 0.35;
    }

    // генерация сверху
    while (s.lastSpawnY > s.camY - 1500) {
      s.lastSpawnY -= randRange(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
      s.platforms.push(spawnPlatform(s.lastSpawnY));
    }

    // движение платформ
    for (const p of s.platforms) {
      if (p.moving && p.vx) {
        p.x += p.vx;
        if (p.x < 0 || p.x + p.w > WIDTH) p.vx *= -1;
      }
    }

    // приземление (с небольшим допуском)
    if (s.vy > 0) {
      for (const p of s.platforms) {
        const withinX = s.px + PLAYER_WIDTH > p.x && s.px < p.x + p.w;
        const headAbove = s.py + PLAYER_HEIGHT <= p.y + s.vy + 0.5;
        const feetCross =
          s.py + PLAYER_HEIGHT + s.vy >= p.y - 2 &&
          s.py + PLAYER_HEIGHT <= p.y + p.h + s.vy + 2;
        if (withinX && headAbove && feetCross) {
          s.py = p.y - PLAYER_HEIGHT;
          s.vy = p.spring ? -14.5 : JUMP_VELOCITY;
          s.started = true;
          break;
        }
      }
    }

    // === счёт/рекорд для нижнего UI ===
    const climbedNow = Math.max(0, s.baseY - s.py);       // чем меньше py, тем выше
    const liveScore = Math.floor(climbedNow);
    setScore(liveScore);                                   // нижняя подпись

    if (climbedNow > s.maxClimb) s.maxClimb = climbedNow;

    // падение — Game Over
    if (s.py - s.camY > HEIGHT + 80) {
      setGameOver(true);
      const newBest = Math.max(bestRef.current, Math.floor(s.maxClimb));
      bestRef.current = newBest;
      setBest(newBest);
      localStorage.setItem("jumpup_best", String(newBest));
    }
  };

  // ===== рендер (HUD считает «вживую» прямо тут) =====
  const render = (ctx: CanvasRenderingContext2D) => {
    const s = stateRef.current;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground(ctx);

    // платформы
    for (const p of s.platforms) {
      const screenY = p.y - s.camY;
      if (screenY > HEIGHT + 40 || screenY < -40) continue;
      ctx.fillStyle = p.moving ? "#2dd4bf" : "#10b981";
      roundRect(ctx, p.x, screenY, p.w, p.h, 4);
      ctx.fill();

      if (p.spring) {
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(p.x + p.w / 2 - 6, screenY - 10, 12, 10);
      }
    }

    // игрок
    drawPlayer(ctx, s.px, s.py - s.camY, s.vy);

    // «живой» счёт прямо из положения игрока
    const hudScore = Math.max(0, Math.floor(s.baseY - s.py));
    drawHUD(ctx, hudScore, bestRef.current, running, gameOver);
  };

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
      {gameOver && (
        <div>
          <h2>Игра окончена</h2>
          <p>Счёт: {score} · Рекорд: {best}</p>
          <button onClick={restart}>Играть снова</button>
        </div>
      )}
    </div>
  );
}

// ===== helpers =====
function randRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, vy: number) {
  ctx.fillStyle = "#60a5fa";
  roundRect(ctx, x, y, PLAYER_WIDTH, PLAYER_HEIGHT, 8);
  ctx.fill();
  // глаза
  ctx.fillStyle = "#000";
  ctx.fillRect(x + 10, y + 12, 4, 6);
  ctx.fillRect(x + PLAYER_WIDTH - 14, y + 12, 4, 6);
  // ножки по скорости
  const k = Math.max(0, Math.min(1, (vy + 10) / 20));
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x + 6, y + PLAYER_HEIGHT - 6, 10, 4 + k * 2);
  ctx.fillRect(x + PLAYER_WIDTH - 16, y + PLAYER_HEIGHT - 6, 10, 4 + k * 2);
}
function drawHUD(ctx: CanvasRenderingContext2D, score: number, best: number, running: boolean, gameOver: boolean) {
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "14px sans-serif";
  ctx.fillText(`Счёт: ${score}`, 12, 20);
  ctx.fillText(`Рекорд: ${best}`, WIDTH - 110, 20);
  if (!gameOver && !running) ctx.fillText("Пауза (P)", WIDTH / 2 - 26, 40);
}

