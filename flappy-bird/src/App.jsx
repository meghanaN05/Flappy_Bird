import React, { useEffect, useRef, useState, useCallback } from "react";

const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const GROUND_H = 100;
const BIRD_X = 120;
const BIRD_R = 16;

const GRAVITY = 0.45;
const LIFT = -8.8;
const PIPE_GAP_MIN = 150;
const PIPE_GAP_MAX = 200;
const PIPE_SPAWN_MS = 1400;
const PIPE_WIDTH = 80;
const BASE_SPEED = 3;
const SPEED_SCALE_INC = 0.00008;

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

function useRaf(callback, active = true) {
  const cb = useRef(callback);
  const rafId = useRef(null);
  useEffect(() => { cb.current = callback; }, [callback]);
  useEffect(() => {
    if (!active) return;
    let t0 = performance.now();
    const loop = (t) => {
      const dt = (t - t0) / 16.6667;
      t0 = t;
      cb.current?.(dt);
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [active]);
}

export default function FlappyBird() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("fb_best") || 0));
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  const birdY = useRef(HEIGHT * 0.5);
  const birdV = useRef(0);
  const pipes = useRef([]);
  const speed = useRef(BASE_SPEED);
  const lastSpawn = useRef(0);

  const reset = useCallback(() => {
    setScore(0);
    setGameOver(false);
    setPaused(false);
    setRunning(true);
    birdY.current = HEIGHT * 0.45;
    birdV.current = 0;
    pipes.current = [];
    speed.current = BASE_SPEED;
    lastSpawn.current = performance.now();
  }, []);

  const flap = useCallback(() => {
    if (!running) {
      reset();
      return;
    }
    if (gameOver) return;
    birdV.current = LIFT;
  }, [running, gameOver, reset]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      } else if (e.key.toLowerCase() === "p") {
        setPaused((p) => !p);
      } else if (e.key.toLowerCase() === "r") {
        reset();
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawStaticBg(canvas.getContext("2d"));
    };

    window.addEventListener("resize", resize);
    resize();
    return () => window.removeEventListener("resize", resize);
  }, []);

  useRaf((dt) => {
    if (!running || paused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    speed.current += SPEED_SCALE_INC * dt;

    const now = performance.now();
    if (now - lastSpawn.current > PIPE_SPAWN_MS) {
      lastSpawn.current = now;
      const gap = randBetween(PIPE_GAP_MIN, PIPE_GAP_MAX);
      const topH = randBetween(40, HEIGHT - GROUND_H - 40 - gap);
      pipes.current.push({ x: WIDTH + 10, topH, passed: false, gap });
    }

    birdV.current += GRAVITY * dt;
    birdY.current += birdV.current * dt;

    for (let p of pipes.current) p.x -= speed.current * dt;
    while (pipes.current.length && pipes.current[0].x + PIPE_WIDTH < -10) {
      pipes.current.shift();
    }

    let localScoreInc = 0;
    for (let p of pipes.current) {
      if (!p.passed && p.x + PIPE_WIDTH < BIRD_X) {
        p.passed = true;
        localScoreInc += 1;
      }
      const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_WIDTH;
      const bottomTop = p.topH + p.gap;
      const hitTop = birdY.current - BIRD_R < p.topH;
      const hitBottom = birdY.current + BIRD_R > bottomTop;
      if (inX && (hitTop || hitBottom)) {
        endGame();
        return;
      }
    }

    if (localScoreInc) setScore((s) => s + localScoreInc);

    if (birdY.current + BIRD_R >= HEIGHT - GROUND_H || birdY.current - BIRD_R <= 0) {
      endGame();
      return;
    }

    drawFrame(ctx, birdY.current, pipes.current, score);
  }, running && !gameOver);

  const endGame = () => {
    setGameOver(true);
    setRunning(false);
    setPaused(false);
    setBest((b) => {
      const next = Math.max(b, score);
      localStorage.setItem("fb_best", String(next));
      return next;
    });
  };

  const drawStaticBg = (ctx) => {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    skyGrad.addColorStop(0, "#87CEEB");
    skyGrad.addColorStop(1, "#E0FFFF");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#c2a579";
    ctx.fillRect(0, HEIGHT - GROUND_H, WIDTH, GROUND_H);
  };

  const drawFrame = (ctx, y, pipesArr, sc) => {
    drawStaticBg(ctx);

    for (let p of pipesArr) {
      ctx.fillStyle = "#2ebd59";
      ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
      ctx.fillStyle = "#1c9a42";
      ctx.fillRect(p.x - 4, p.topH - 14, PIPE_WIDTH + 8, 14);

      const bottomTop = p.topH + p.gap;
      ctx.fillStyle = "#2ebd59";
      ctx.fillRect(p.x, bottomTop, PIPE_WIDTH, HEIGHT - GROUND_H - bottomTop);
      ctx.fillStyle = "#1c9a42";
      ctx.fillRect(p.x - 4, bottomTop, PIPE_WIDTH + 8, 14);
    }

    ctx.save();
    ctx.translate(BIRD_X, y);
    const tilt = Math.max(-0.5, Math.min(0.6, birdV.current / 10));
    ctx.rotate(tilt);

    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(5, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(6.5, -4, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.font = "bold 36px sans-serif";
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText(String(sc), WIDTH / 2, 60);
  };

  const onPointerDown = () => flap();

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}
      onMouseDown={onPointerDown}
      onTouchStart={onPointerDown}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {!running && !gameOver && (
        <Overlay>
          <h2>Tap / Click / Space to Start</h2>
          <button onClick={() => setRunning(true)}>Start</button>
          <button onClick={reset}>Reset</button>
        </Overlay>
      )}
      {paused && !gameOver && running && (
        <Overlay>
          <h2>Paused</h2>
          <button onClick={() => setPaused(false)}>Resume</button>
          <button onClick={() => setRunning(false)}>Quit</button>
        </Overlay>
      )}
      {gameOver && (
        <Overlay>
          <h2>Game Over</h2>
          <p>Score: {score} · Best: {best}</p>
          <button onClick={reset}>Restart</button>
          <button onClick={() => setRunning(false)}>Quit</button>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "rgba(255,255,255,0.5)" }}>
      {children}
    </div>
  );
}
