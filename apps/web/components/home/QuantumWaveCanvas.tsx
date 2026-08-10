"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

type ParticlePalette = {
  cyan: [number, number, number];
  blue: [number, number, number];
  violet: [number, number, number];
};

type PointerInfluence = {
  x: number;
  y: number;
  strength: number;
};

const TAU = Math.PI * 2;
const PARTICLE_PALETTE: ParticlePalette = {
  cyan: [28, 201, 224],
  blue: [24, 113, 255],
  violet: [118, 83, 244],
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp01((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function mixColor(
  start: [number, number, number],
  end: [number, number, number],
  amount: number,
) {
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount)) as [number, number, number];
}

function ribbonColor(progress: number) {
  if (progress < 0.58) {
    return mixColor(PARTICLE_PALETTE.cyan, PARTICLE_PALETTE.blue, progress / 0.58);
  }

  return mixColor(PARTICLE_PALETTE.blue, PARTICLE_PALETTE.violet, (progress - 0.58) / 0.42);
}

function seededNoise(a: number, b: number) {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function drawBackgroundDust(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  const count = width < 640 ? 42 : 110;

  context.save();
  for (let index = 0; index < count; index += 1) {
    const seedX = seededNoise(index, 11);
    const seedY = seededNoise(index, 19);
    const drift = Math.sin(time * 0.00012 + seedX * TAU) * height * 0.012;
    const x = seedX * width;
    const y = height * (0.16 + seedY * 0.68) + drift;
    const color = index % 4 === 0 ? PARTICLE_PALETTE.violet : PARTICLE_PALETTE.cyan;
    const radius = 0.55 + seededNoise(index, 27) * 1.1;
    const alpha = 0.035 + seededNoise(index, 31) * 0.08;

    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fillStyle = `rgba(${color.join(",")},${alpha})`;
    context.fill();
  }
  context.restore();
}

function drawParticleRibbon(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  options: {
    interaction: number;
    offsetY: number;
    opacity: number;
    phaseOffset: number;
    scale: number;
    soft?: boolean;
  },
  pointer: PointerInfluence,
) {
  const mobile = width < 640;
  const lengthSteps = mobile ? (options.soft ? 48 : 72) : (options.soft ? 104 : 156);
  const crossSteps = mobile ? (options.soft ? 7 : 9) : (options.soft ? 13 : 19);
  const phase = time * 0.0002 + options.phaseOffset;

  context.save();
  context.globalCompositeOperation = "source-over";

  for (let lengthIndex = 0; lengthIndex <= lengthSteps; lengthIndex += 1) {
    const progress = lengthIndex / lengthSteps;
    const edgeFade = smoothstep(0, 0.08, progress) * (1 - smoothstep(0.91, 1, progress));
    const baseCenterY = height * (
      options.offsetY
      - (progress - 0.5) * 0.055
      + Math.sin(progress * TAU * 1.06 + phase * 0.28) * 0.026
    );
    const pointerDistanceX = (progress - pointer.x) / 0.17;
    const pointerDistanceY = (baseCenterY / height - pointer.y) / 0.28;
    const pointerProximity = Math.exp(
      -(pointerDistanceX * pointerDistanceX + pointerDistanceY * pointerDistanceY),
    ) * pointer.strength * options.interaction;
    const centerY = baseCenterY + (pointer.y * height - baseCenterY) * pointerProximity * 0.18;
    const twist = progress * TAU * 2.05
      - phase
      + (pointer.x - 0.5) * pointerProximity * 0.56;
    const envelope = height * options.scale * (
      0.62
      + Math.sin(progress * TAU * 1.35 - 0.9) * 0.18
      + Math.cos(progress * TAU * 2.2 + 0.6) * 0.08
    );
    const baseColor = ribbonColor(progress);

    for (let crossIndex = 0; crossIndex < crossSteps; crossIndex += 1) {
      const cross = crossIndex / (crossSteps - 1) * 2 - 1;
      const depth = Math.cos(twist) * cross;
      const lateral = Math.sin(twist) * cross;
      const secondaryCurl = Math.sin(progress * TAU * 3.2 + cross * 1.4 + phase * 0.55);
      const x = progress * width + depth * width * 0.026 + secondaryCurl * width * 0.0018;
      const y = centerY + lateral * envelope + depth * height * 0.012;
      const frontness = clamp01((depth + 1) / 2);
      const rowEmphasis = 0.56 + (1 - Math.abs(cross)) * 0.44;
      const alpha = edgeFade
        * options.opacity
        * rowEmphasis
        * (0.34 + frontness * 0.66)
        * (1 + pointerProximity * 0.38);
      const radius = (mobile ? 1.15 : 1.52)
        * (0.72 + frontness * 1.12)
        * (options.soft ? 0.7 : 1)
        * (1 + pointerProximity * 0.18);

      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fillStyle = `rgba(${baseColor.join(",")},${alpha})`;
      context.fill();

      if (!options.soft && frontness > 0.83 && crossIndex % 3 === 0) {
        context.beginPath();
        context.arc(x, y, radius * 2.25, 0, TAU);
        context.fillStyle = `rgba(${baseColor.join(",")},${alpha * 0.08})`;
        context.fill();
      }
    }
  }

  context.restore();
}

function drawParticleScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointer: PointerInfluence,
) {
  context.clearRect(0, 0, width, height);

  drawBackgroundDust(context, width, height, time);
  drawParticleRibbon(context, width, height, time, {
    interaction: 0.64,
    offsetY: 0.18,
    opacity: mobileOpacity(width, 0.35),
    phaseOffset: 2.15,
    scale: 0.145,
    soft: true,
  }, pointer);
  drawParticleRibbon(context, width, height, time, {
    interaction: 1,
    offsetY: 0.43,
    opacity: 0.94,
    phaseOffset: 0,
    scale: 0.22,
  }, pointer);
  drawParticleRibbon(context, width, height, time, {
    interaction: 0.56,
    offsetY: 0.72,
    opacity: mobileOpacity(width, 0.32),
    phaseOffset: 4.3,
    scale: 0.15,
    soft: true,
  }, pointer);

  if (pointer.strength > 0.015) {
    const pointerGlow = context.createRadialGradient(
      pointer.x * width,
      pointer.y * height,
      0,
      pointer.x * width,
      pointer.y * height,
      width * 0.12,
    );
    pointerGlow.addColorStop(0, `rgba(37,153,255,${0.1 * pointer.strength})`);
    pointerGlow.addColorStop(0.38, `rgba(34,211,238,${0.045 * pointer.strength})`);
    pointerGlow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = pointerGlow;
    context.fillRect(0, 0, width, height);
  }

  const calmCenter = context.createRadialGradient(
    width * 0.5,
    height * 0.22,
    0,
    width * 0.5,
    height * 0.22,
    width * 0.2,
  );
  calmCenter.addColorStop(0, "rgba(255,255,255,0.62)");
  calmCenter.addColorStop(0.36, "rgba(255,255,255,0.3)");
  calmCenter.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = calmCenter;
  context.fillRect(width * 0.2, 0, width * 0.6, height * 0.58);
}

function mobileOpacity(width: number, opacity: number) {
  return width < 640 ? opacity * 0.9 : opacity;
}

export function QuantumWaveCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const drawingContext = canvasElement.getContext("2d", { alpha: true });
    if (!drawingContext) return;

    const canvas = canvasElement;
    const context = drawingContext;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let lastFrame = Number.NEGATIVE_INFINITY;
    let pageVisible = !document.hidden;
    let canvasVisible = true;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let pointerStrength = 0;
    let targetPointerX = 0.5;
    let targetPointerY = 0.5;
    let targetPointerStrength = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function shouldAnimate() {
      return !reducedMotion.matches && pageVisible && canvasVisible;
    }

    function draw(time: number) {
      drawParticleScene(
        context,
        width,
        height,
        reducedMotion.matches ? 5600 : time,
        {
          x: pointerX,
          y: pointerY,
          strength: reducedMotion.matches ? 0 : pointerStrength,
        },
      );
    }

    function tick(time: number) {
      animationFrame = 0;
      const minimumFrameTime = width < 640 ? 48 : 38;

      if (time - lastFrame >= minimumFrameTime) {
        pointerX += (targetPointerX - pointerX) * 0.09;
        pointerY += (targetPointerY - pointerY) * 0.09;
        pointerStrength += (targetPointerStrength - pointerStrength) * 0.11;
        draw(time);
        lastFrame = time;
      }

      if (shouldAnimate()) animationFrame = window.requestAnimationFrame(tick);
    }

    function start() {
      if (!shouldAnimate() || animationFrame) return;
      animationFrame = window.requestAnimationFrame(tick);
    }

    function stop() {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }

    function handleVisibilityChange() {
      pageVisible = !document.hidden;
      if (shouldAnimate()) start();
      else stop();
    }

    function handleMotionPreferenceChange() {
      stop();
      draw(performance.now());
      start();
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch" || reducedMotion.matches) return;

      const rect = canvas.getBoundingClientRect();
      const insideCanvas = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;

      if (!insideCanvas) {
        targetPointerStrength = 0;
        return;
      }

      targetPointerX = clamp01((event.clientX - rect.left) / rect.width);
      targetPointerY = clamp01((event.clientY - rect.top) / rect.height);
      targetPointerStrength = 1;
      start();
    }

    function clearPointerInfluence() {
      targetPointerStrength = 0;
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          canvasVisible = entries.some((entry) => entry.isIntersecting);
          if (shouldAnimate()) start();
          else stop();
        }, { rootMargin: "160px 0px" });

    resize();
    resizeObserver.observe(canvas);
    intersectionObserver?.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("blur", clearPointerInfluence);
    reducedMotion.addEventListener?.("change", handleMotionPreferenceChange);
    draw(performance.now());
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearPointerInfluence);
      reducedMotion.removeEventListener?.("change", handleMotionPreferenceChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-particle-effect="spiral-ribbon"
      data-particle-interaction="pointer"
      data-particle-layers="3"
      className={clsx("pointer-events-none block h-full w-full", className)}
      style={{
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 12%, black 24%, black 74%, rgba(0,0,0,0.45) 88%, transparent 100%)",
        maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 12%, black 24%, black 74%, rgba(0,0,0,0.45) 88%, transparent 100%)",
      }}
    />
  );
}
