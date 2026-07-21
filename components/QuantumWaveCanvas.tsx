"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

type Pin = {
  x: number;
  row: number;
  height: number;
  phase: number;
  color: "blue" | "cyan" | "purple";
};

type DotSeed = {
  nx: number;
  row: number;
  jitter: number;
  yJitter: number;
  radius: number;
  rgb: string;
  baseAlpha: number;
  radiusScale: number;
  energy: number;
  driftFactor: number;
  perspective: number;
  amplitudeFactor: number;
  sideLiftFactor: number;
  centerSettleFactor: number;
  wave1Base: number;
  wave2Base: number;
  wave3Base: number;
  microBase: number;
};

type RenderConfig = {
  cols: number;
  rows: number;
  contourRows: number[];
  contourSteps: number;
  dotScale: number;
  oceanDotKeep: number;
  frameMs: number;
  scrollingFrameMs: number;
};

type IslandSegment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
};

type IslandPoint = {
  x: number;
  row: number;
};

const TAU = Math.PI * 2;

function horizontalMapPoint(point: IslandPoint): IslandPoint {
  const x = 1 - point.x;
  const row = 0.54 + (point.row - 0.54) * 0.72 + (x - 0.5) * 0.08;

  return { x, row: Math.min(0.92, Math.max(0.08, row)) };
}

function horizontalMapSegment(segment: IslandSegment): IslandSegment {
  const start = horizontalMapPoint({ x: segment.ax, row: segment.ay });
  const end = horizontalMapPoint({ x: segment.bx, row: segment.by });

  return {
    ax: start.x,
    ay: start.row,
    bx: end.x,
    by: end.row,
    radius: segment.radius * 0.9,
  };
}

function horizontalMapPin(pin: Pin): Pin {
  const point = horizontalMapPoint({ x: pin.x, row: pin.row });

  return { ...pin, x: point.x, row: point.row };
}

const baseCityPins: Pin[] = [
  { x: 0.7, row: 0.22, height: 0.42, phase: 0.2, color: "cyan" },
  { x: 0.65, row: 0.34, height: 0.5, phase: 1.7, color: "blue" },
  { x: 0.69, row: 0.42, height: 0.32, phase: 4.4, color: "blue" },
  { x: 0.77, row: 0.39, height: 0.38, phase: 5.0, color: "purple" },
  { x: 0.74, row: 0.49, height: 0.3, phase: 2.7, color: "cyan" },
  { x: 0.66, row: 0.62, height: 0.46, phase: 3.5, color: "blue" },
  { x: 0.37, row: 0.53, height: 0.3, phase: 5.7, color: "cyan" },
  { x: 0.39, row: 0.67, height: 0.4, phase: 2.2, color: "purple" },
  { x: 0.23, row: 0.72, height: 0.36, phase: 0.9, color: "blue" },
  { x: 0.29, row: 0.8, height: 0.34, phase: 4.1, color: "cyan" },
  { x: 0.15, row: 0.86, height: 0.28, phase: 2.8, color: "purple" },
];

const baseIslandSegments: IslandSegment[] = [
  { ax: 0.08, ay: 0.8, bx: 0.18, by: 0.7, radius: 0.085 },
  { ax: 0.18, ay: 0.7, bx: 0.29, by: 0.61, radius: 0.09 },
  { ax: 0.29, ay: 0.61, bx: 0.42, by: 0.53, radius: 0.082 },
  { ax: 0.42, ay: 0.53, bx: 0.5, by: 0.58, radius: 0.066 },
  { ax: 0.13, ay: 0.86, bx: 0.28, by: 0.78, radius: 0.076 },
  { ax: 0.58, ay: 0.61, bx: 0.68, by: 0.5, radius: 0.074 },
  { ax: 0.68, ay: 0.5, bx: 0.67, by: 0.36, radius: 0.087 },
  { ax: 0.67, ay: 0.36, bx: 0.74, by: 0.25, radius: 0.092 },
  { ax: 0.74, ay: 0.25, bx: 0.86, by: 0.33, radius: 0.078 },
  { ax: 0.86, ay: 0.33, bx: 0.81, by: 0.49, radius: 0.083 },
  { ax: 0.81, ay: 0.49, bx: 0.66, by: 0.62, radius: 0.073 },
];

const baseIslandOutlines: IslandPoint[][] = [
  [
    { x: 0.07, row: 0.83 },
    { x: 0.13, row: 0.75 },
    { x: 0.24, row: 0.65 },
    { x: 0.36, row: 0.56 },
    { x: 0.47, row: 0.52 },
    { x: 0.52, row: 0.58 },
    { x: 0.45, row: 0.66 },
    { x: 0.34, row: 0.76 },
    { x: 0.2, row: 0.87 },
    { x: 0.08, row: 0.9 },
  ],
  [
    { x: 0.58, row: 0.63 },
    { x: 0.54, row: 0.53 },
    { x: 0.56, row: 0.42 },
    { x: 0.62, row: 0.31 },
    { x: 0.72, row: 0.22 },
    { x: 0.84, row: 0.29 },
    { x: 0.9, row: 0.42 },
    { x: 0.83, row: 0.54 },
    { x: 0.68, row: 0.64 },
  ],
];

const baseIslandRidges: IslandPoint[][] = [
  [
    { x: 0.12, row: 0.8 },
    { x: 0.24, row: 0.69 },
    { x: 0.36, row: 0.6 },
    { x: 0.48, row: 0.56 },
  ],
  [
    { x: 0.65, row: 0.58 },
    { x: 0.69, row: 0.46 },
    { x: 0.71, row: 0.34 },
    { x: 0.78, row: 0.28 },
  ],
];

const cityPins = baseCityPins.map(horizontalMapPin);
const islandSegments = baseIslandSegments.map(horizontalMapSegment);
const islandOutlines = [baseIslandOutlines[1], baseIslandOutlines[0]].map((outline) => outline.map(horizontalMapPoint));
const islandRidges = [baseIslandRidges[1], baseIslandRidges[0]].map((ridge) => ridge.map(horizontalMapPoint));

const colorMap = {
  blue: { rgb: "9, 105, 255", glow: "rgba(9, 105, 255, 0.45)" },
  cyan: { rgb: "24, 200, 232", glow: "rgba(24, 200, 232, 0.42)" },
  purple: { rgb: "139, 53, 255", glow: "rgba(139, 53, 255, 0.34)" },
};

function hash(row: number, col: number) {
  const value = Math.sin(row * 127.1 + col * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function segmentDistance(nx: number, row: number, segment: IslandSegment) {
  const vx = segment.bx - segment.ax;
  const vy = segment.by - segment.ay;
  const wx = nx - segment.ax;
  const wy = row - segment.ay;
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq === 0 ? 0 : clamp01((wx * vx + wy * vy) / lengthSq);
  const px = segment.ax + vx * t;
  const py = segment.ay + vy * t;
  const dx = nx - px;
  const dy = row - py;

  return Math.sqrt(dx * dx + dy * dy);
}

function islandMaskStrength(nx: number, row: number) {
  let strength = 0;

  for (let index = 0; index < islandSegments.length; index += 1) {
    const segment = islandSegments[index];
    const distance = segmentDistance(nx, row, segment);
    const segmentStrength = 1 - smoothStep(segment.radius * 0.72, segment.radius * 1.28, distance);
    strength = Math.max(strength, segmentStrength);
  }

  return clamp01(strength);
}

function islandCoastStrength(strength: number) {
  return clamp01(1 - Math.abs(strength - 0.48) / 0.22);
}

function getRenderConfig(width: number): RenderConfig {
  if (width < 640) {
    return {
      cols: 48,
      rows: 18,
      contourRows: [0.08, 0.22, 0.42, 0.64],
      contourSteps: 40,
      dotScale: 0.74,
      oceanDotKeep: 0.48,
      frameMs: 72,
      scrollingFrameMs: 220,
    };
  }

  return {
    cols: 112,
    rows: 30,
    contourRows: [0.03, 0.1, 0.2, 0.33, 0.5, 0.68, 0.82],
    contourSteps: 60,
    dotScale: 1,
    oceanDotKeep: 0.56,
    frameMs: 64,
    scrollingFrameMs: 220,
  };
}

function buildDotSeeds(config: RenderConfig): DotSeed[] {
  const seeds: DotSeed[] = [];

  for (let rowIndex = 0; rowIndex < config.rows; rowIndex += 1) {
    const row = rowIndex / (config.rows - 1);
    for (let colIndex = 0; colIndex < config.cols; colIndex += 1) {
      const huePick = hash(colIndex, rowIndex);
      const rgb = huePick > 0.91 ? "139, 53, 255" : huePick > 0.58 ? "24, 200, 232" : "9, 105, 255";
      const nx = colIndex / (config.cols - 1);
      const islandStrength = islandMaskStrength(nx, row);
      const coastStrength = islandCoastStrength(islandStrength);
      const oceanDot = islandStrength < 0.12 && coastStrength < 0.08;

      if (oceanDot && hash(rowIndex + 21, colIndex + 17) > config.oceanDotKeep) {
        continue;
      }

      const leftRise = Math.exp(-Math.pow((nx - 0.2) / 0.18, 2));
      const rightRise = Math.exp(-Math.pow((nx - 0.8) / 0.18, 2));
      const centerDip = 0.58 * Math.exp(-Math.pow((nx - 0.52) / 0.19, 2));
      const leftRidge = Math.exp(-Math.pow((nx - 0.17) / 0.22, 2));
      const rightRidge = Math.exp(-Math.pow((nx - 0.83) / 0.22, 2));
      const centerValley = Math.exp(-Math.pow((nx - 0.5) / 0.23, 2));

      seeds.push({
        nx,
        row,
        jitter: (hash(rowIndex, colIndex) - 0.5) * 0.55,
        yJitter: (hash(colIndex + 3, rowIndex + 4) - 0.5) * 2,
        radius: (0.32 + row * 1.04 + hash(colIndex + 9, rowIndex + 13) * 0.46) * config.dotScale,
        rgb,
        baseAlpha: (0.055 + row * 0.46) * (0.12 + islandStrength * 0.92 + coastStrength * 0.22),
        radiusScale: 0.58 + islandStrength * 0.56 + coastStrength * 0.28,
        energy: 0.74 + leftRise * 1.08 + rightRise * 1.04 - centerDip * 0.76,
        driftFactor: (1 - row) * 0.015,
        perspective: Math.pow(row, 1.58),
        amplitudeFactor: 0.045 + (1 - row) * 0.145,
        sideLiftFactor: (leftRidge + rightRidge) * (0.07 + (1 - row) * 0.045),
        centerSettleFactor: centerValley * (0.018 + row * 0.028),
        wave1Base: nx * TAU * 2.35 + row * 3.25,
        wave2Base: nx * TAU * 5.5 - row * 2.45,
        wave3Base: nx * TAU * 3.6 + row * 5.05,
        microBase: (nx + row * 0.36) * TAU * 9.5,
      });
    }
  }

  return seeds;
}

function waveHeight(nx: number, row: number, time: number) {
  const leftRise = Math.exp(-Math.pow((nx - 0.2) / 0.18, 2));
  const rightRise = Math.exp(-Math.pow((nx - 0.8) / 0.18, 2));
  const centerDip = 0.58 * Math.exp(-Math.pow((nx - 0.52) / 0.19, 2));
  const microSwell = Math.sin((nx + row * 0.36) * TAU * 9.5 + time * 0.00022) * 0.08;
  const energy = 0.74 + leftRise * 1.08 + rightRise * 1.04 - centerDip * 0.76;

  return (
    Math.sin(nx * TAU * 2.35 + row * 3.25 + time * 0.00054) * 0.58 +
    Math.sin(nx * TAU * 5.5 - row * 2.45 - time * 0.00039) * 0.22 +
    Math.cos(nx * TAU * 3.6 + row * 5.05 + time * 0.00029) * 0.18 +
    microSwell
  ) * energy;
}

function surfacePointFromWave(width: number, height: number, nx: number, row: number, time: number, wave: number) {
  const horizon = height * 0.52;
  const perspective = Math.pow(row, 1.58);
  const drift = Math.sin(row * 4.8 + time * 0.00022) * (1 - row) * width * 0.015;
  const x = nx * width + drift;
  const amplitude = height * (0.045 + (1 - row) * 0.145);
  const leftRidge = Math.exp(-Math.pow((nx - 0.17) / 0.22, 2));
  const rightRidge = Math.exp(-Math.pow((nx - 0.83) / 0.22, 2));
  const centerValley = Math.exp(-Math.pow((nx - 0.5) / 0.23, 2));
  const sideLift = (leftRidge + rightRidge) * height * (0.07 + (1 - row) * 0.045);
  const centerSettle = centerValley * height * (0.018 + row * 0.028);
  const y = horizon + perspective * height * 0.42 - wave * amplitude - sideLift + centerSettle;

  return { x, y };
}

function surfacePoint(width: number, height: number, nx: number, row: number, time: number) {
  return surfacePointFromWave(width, height, nx, row, time, waveHeight(nx, row, time));
}

function dotWaveHeight(seed: DotSeed, time: number) {
  const microSwell = Math.sin(seed.microBase + time * 0.00022) * 0.08;

  return (
    Math.sin(seed.wave1Base + time * 0.00054) * 0.58 +
    Math.sin(seed.wave2Base - time * 0.00039) * 0.22 +
    Math.cos(seed.wave3Base + time * 0.00029) * 0.18 +
    microSwell
  ) * seed.energy;
}

function dotSurfacePoint(width: number, height: number, seed: DotSeed, time: number, wave: number) {
  const horizon = height * 0.52;
  const drift = Math.sin(seed.row * 4.8 + time * 0.00022) * seed.driftFactor * width;
  const x = seed.nx * width + drift;
  const y =
    horizon +
    seed.perspective * height * 0.42 -
    wave * height * seed.amplitudeFactor -
    seed.sideLiftFactor * height +
    seed.centerSettleFactor * height;

  return { x, y };
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawIslandPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: IslandPoint[],
  time: number,
  options: { close?: boolean; fill?: string; stroke?: string | CanvasGradient; lineWidth?: number; shadowColor?: string; shadowBlur?: number },
) {
  if (!points.length) return;

  ctx.beginPath();
  points.forEach((point, index) => {
    const drift = Math.sin(time * 0.00034 + index * 0.9) * 0.006;
    const surfacePointValue = surfacePoint(width, height, point.x + drift, point.row, time + index * 380);

    if (index === 0) ctx.moveTo(surfacePointValue.x, surfacePointValue.y);
    else ctx.lineTo(surfacePointValue.x, surfacePointValue.y);
  });

  if (options.close) ctx.closePath();

  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }

  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.shadowColor = options.shadowColor ?? "transparent";
    ctx.shadowBlur = options.shadowBlur ?? 0;
    ctx.stroke();
  }
}

function drawMapHorizonPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: IslandPoint[],
  time: number,
  options: { close?: boolean; stroke: string | CanvasGradient; lineWidth: number; shadowColor: string; shadowBlur: number },
) {
  if (!points.length) return;

  const yOffset = width < 640 ? 0.02 : 0.08;
  const yScale = width < 640 ? 0.24 : 0.32;

  ctx.beginPath();
  points.forEach((point, index) => {
    const xDrift = Math.sin(time * 0.00032 + point.row * 5.2 + index) * width * 0.004;
    const yDrift = Math.sin(time * 0.00044 + point.x * 7.5 + index * 0.8) * height * 0.012;
    const x = point.x * width + xDrift;
    const y = height * (yOffset + point.row * yScale) + yDrift;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  if (options.close) ctx.closePath();

  ctx.strokeStyle = options.stroke;
  ctx.lineWidth = options.lineWidth;
  ctx.shadowColor = options.shadowColor;
  ctx.shadowBlur = options.shadowBlur;
  ctx.stroke();
}

export function QuantumWaveCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const drawingContext = canvasElement.getContext("2d", { alpha: true });
    if (!drawingContext) return;

    const canvas: HTMLCanvasElement = canvasElement;
    const context: CanvasRenderingContext2D = drawingContext;

    let animationFrame = 0;
    let tickTimer = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let pageVisible = !document.hidden;
    let canvasVisible = true;
    let isScrolling = false;
    let scrollTimer = 0;
    let lastDrawTime = Number.NEGATIVE_INFINITY;
    let renderConfig = getRenderConfig(width);
    let dotSeeds = buildDotSeeds(renderConfig);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.15);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderConfig = getRenderConfig(width);
      dotSeeds = buildDotSeeds(renderConfig);
    }

    function draw(time: number) {
      context.clearRect(0, 0, width, height);

      const skyWash = context.createLinearGradient(0, 0, 0, height);
      skyWash.addColorStop(0, "rgba(239, 249, 255, 0)");
      skyWash.addColorStop(0.2, "rgba(239, 249, 255, 0.08)");
      skyWash.addColorStop(0.54, "rgba(225, 247, 255, 0.34)");
      skyWash.addColorStop(0.78, "rgba(255, 255, 255, 0.16)");
      skyWash.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = skyWash;
      context.fillRect(0, 0, width, height);

      const horizonGlow = context.createRadialGradient(width * 0.5, height * 0.55, 0, width * 0.5, height * 0.55, width * 0.44);
      horizonGlow.addColorStop(0, "rgba(255, 255, 255, 0.94)");
      horizonGlow.addColorStop(0.12, "rgba(98, 225, 255, 0.36)");
      horizonGlow.addColorStop(0.34, "rgba(9, 105, 255, 0.12)");
      horizonGlow.addColorStop(1, "rgba(9, 105, 255, 0)");
      context.fillStyle = horizonGlow;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalCompositeOperation = "lighter";
      context.shadowColor = "rgba(24, 200, 232, 0.32)";
      context.shadowBlur = 9;
      const horizonLine = context.createLinearGradient(0, 0, width, 0);
      horizonLine.addColorStop(0, "rgba(24, 200, 232, 0)");
      horizonLine.addColorStop(0.42, "rgba(24, 200, 232, 0.4)");
      horizonLine.addColorStop(0.5, "rgba(255, 255, 255, 0.82)");
      horizonLine.addColorStop(0.62, "rgba(9, 105, 255, 0.26)");
      horizonLine.addColorStop(1, "rgba(24, 200, 232, 0)");
      context.strokeStyle = horizonLine;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(0, height * 0.55);
      context.lineTo(width, height * 0.55);
      context.stroke();
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = width < 640 ? 0.42 : 0.52;
      islandOutlines.forEach((outline, index) => {
        const horizonStroke = context.createLinearGradient(0, 0, width, 0);
        horizonStroke.addColorStop(0, "rgba(24, 200, 232, 0.04)");
        horizonStroke.addColorStop(0.18, index === 0 ? "rgba(9, 105, 255, 0.52)" : "rgba(24, 200, 232, 0.18)");
        horizonStroke.addColorStop(0.5, "rgba(24, 200, 232, 0.34)");
        horizonStroke.addColorStop(0.82, index === 0 ? "rgba(24, 200, 232, 0.16)" : "rgba(9, 105, 255, 0.54)");
        horizonStroke.addColorStop(1, "rgba(139, 53, 255, 0.08)");
        drawMapHorizonPath(context, width, height, outline, time + index * 1200, {
          close: true,
          stroke: horizonStroke,
          lineWidth: width < 640 ? 0.85 : 1.25,
          shadowColor: "rgba(9, 105, 255, 0.22)",
          shadowBlur: width < 640 ? 3 : 6,
        });
      });
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      islandOutlines.forEach((outline, index) => {
        const fill = index === 0 ? "rgba(9, 105, 255, 0.055)" : "rgba(24, 200, 232, 0.058)";
        const stroke = index === 0 ? "rgba(9, 105, 255, 0.34)" : "rgba(24, 200, 232, 0.32)";
        drawIslandPath(context, width, height, outline, time + index * 900, {
          close: true,
          fill,
          stroke,
          lineWidth: width < 640 ? 0.85 : 1.2,
          shadowColor: index === 0 ? "rgba(9, 105, 255, 0.18)" : "rgba(24, 200, 232, 0.18)",
          shadowBlur: width < 640 ? 3 : 5,
        });
      });
      context.restore();

      context.save();
      context.globalCompositeOperation = "source-over";
      for (let seedIndex = 0; seedIndex < dotSeeds.length; seedIndex += 1) {
        const seed = dotSeeds[seedIndex];
        const wave = dotWaveHeight(seed, time);
        const point = dotSurfacePoint(width, height, seed, time, wave);
        const lift = Math.max(0, -wave);

        drawDot(
          context,
          point.x + seed.jitter * (width / renderConfig.cols),
          point.y + seed.yJitter,
          seed.radius * seed.radiusScale,
          `rgba(${seed.rgb}, ${Math.min(0.72, seed.baseAlpha + lift * 0.1 * seed.radiusScale)})`,
        );
      }
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      renderConfig.contourRows.forEach((row, index) => {
        const gradient = context.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, "rgba(24, 200, 232, 0.05)");
        gradient.addColorStop(0.24, index % 2 ? "rgba(139, 53, 255, 0.5)" : "rgba(9, 105, 255, 0.58)");
        gradient.addColorStop(0.55, "rgba(24, 200, 232, 0.34)");
        gradient.addColorStop(0.82, index % 2 ? "rgba(9, 105, 255, 0.5)" : "rgba(139, 53, 255, 0.42)");
        gradient.addColorStop(1, "rgba(24, 200, 232, 0.04)");

        context.beginPath();
        for (let step = 0; step <= renderConfig.contourSteps; step += 1) {
          const nx = step / renderConfig.contourSteps;
          const point = surfacePoint(width, height, nx, row, time + index * 1200);
          if (step === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = gradient;
        context.lineWidth = index < 3 ? 1.35 : 0.9;
        context.shadowColor = index % 2 ? "rgba(139, 53, 255, 0.22)" : "rgba(9, 105, 255, 0.24)";
        context.shadowBlur = 4;
        context.stroke();
      });
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      islandRidges.forEach((ridge, index) => {
        const ridgeStroke = context.createLinearGradient(width * 0.24, 0, width * 0.72, 0);
        ridgeStroke.addColorStop(0, "rgba(139, 53, 255, 0.16)");
        ridgeStroke.addColorStop(0.45, index % 2 ? "rgba(24, 200, 232, 0.46)" : "rgba(9, 105, 255, 0.48)");
        ridgeStroke.addColorStop(1, "rgba(139, 53, 255, 0.22)");
        drawIslandPath(context, width, height, ridge, time + index * 1400, {
          stroke: ridgeStroke,
          lineWidth: width < 640 ? 0.75 : 1.05,
          shadowColor: "rgba(9, 105, 255, 0.2)",
          shadowBlur: width < 640 ? 3 : 5,
        });
      });
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      islandOutlines.forEach((outline, index) => {
        const coastStroke = context.createLinearGradient(0, 0, width, 0);
        coastStroke.addColorStop(0, "rgba(24, 200, 232, 0.08)");
        coastStroke.addColorStop(0.25, index === 0 ? "rgba(9, 105, 255, 0.62)" : "rgba(139, 53, 255, 0.42)");
        coastStroke.addColorStop(0.56, "rgba(24, 200, 232, 0.54)");
        coastStroke.addColorStop(0.84, index === 0 ? "rgba(139, 53, 255, 0.34)" : "rgba(9, 105, 255, 0.62)");
        coastStroke.addColorStop(1, "rgba(24, 200, 232, 0.08)");
        drawIslandPath(context, width, height, outline, time + index * 1100, {
          close: true,
          stroke: coastStroke,
          lineWidth: width < 640 ? 1.05 : 1.55,
          shadowColor: "rgba(9, 105, 255, 0.34)",
          shadowBlur: width < 640 ? 4 : 7,
        });
      });
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      cityPins.forEach((pin, index) => {
        if (width < 640 && index % 2 === 1) return;

        const color = colorMap[pin.color];
        const wobble = Math.sin(time * 0.001 + pin.phase) * 0.018;
        const nx = Math.min(0.98, Math.max(0.02, pin.x + wobble));
        const row = Math.min(0.9, Math.max(0.08, pin.row + Math.cos(time * 0.0007 + pin.phase) * 0.018));
        const base = surfacePoint(width, height, nx, row, time);
        const pulse = 0.88 + Math.sin(time * 0.0018 + pin.phase) * 0.12;
        const topY = base.y - height * pin.height * pulse;
        const alpha = width < 640 && index % 2 ? 0.58 : 0.78;
        const line = context.createLinearGradient(base.x, base.y, base.x, topY);
        line.addColorStop(0, `rgba(${color.rgb}, 0)`);
        line.addColorStop(0.35, `rgba(${color.rgb}, ${alpha * 0.3})`);
        line.addColorStop(1, `rgba(${color.rgb}, ${alpha})`);

        context.strokeStyle = line;
        context.lineWidth = width < 640 ? 0.9 : 1.2;
        context.shadowColor = color.glow;
        context.shadowBlur = width < 640 ? 5 : 7;
        context.beginPath();
        context.moveTo(base.x, base.y);
        context.lineTo(base.x, topY);
        context.stroke();

        drawDot(context, base.x, topY, width < 640 ? 2.2 : 2.7, `rgba(${color.rgb}, ${alpha})`);
        drawDot(context, base.x, topY, width < 640 ? 4.6 : 5.6, `rgba(${color.rgb}, ${alpha * 0.16})`);
      });
      context.restore();

      context.save();
      context.globalAlpha = 0.38;
      [0.06, 0.1, 0.16, 0.82, 0.88, 0.94].forEach((nx, index) => {
        const point = surfacePoint(width, height, nx, 0.9, time + index * 900);
        drawDot(context, point.x, point.y + height * 0.08, 3.4 + (index % 3) * 2.2, "rgba(9, 105, 255, 0.22)");
      });
      context.restore();
    }

    function shouldAnimate() {
      return !reducedMotion.matches && pageVisible && canvasVisible;
    }

    function scheduleTick() {
      if (animationFrame || !shouldAnimate()) return;
      if (tickTimer) return;

      const targetFrameMs = isScrolling ? renderConfig.scrollingFrameMs : renderConfig.frameMs;
      const elapsed = performance.now() - lastDrawTime;
      const delay = lastDrawTime === Number.NEGATIVE_INFINITY ? 0 : Math.max(0, targetFrameMs - elapsed);

      tickTimer = window.setTimeout(() => {
        tickTimer = 0;
        if (!shouldAnimate() || animationFrame) return;
        animationFrame = window.requestAnimationFrame(tick);
      }, delay);
    }

    function cancelTick() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      if (tickTimer) {
        window.clearTimeout(tickTimer);
        tickTimer = 0;
      }
    }

    function tick(time: number) {
      animationFrame = 0;
      draw(time);
      lastDrawTime = time;
      scheduleTick();
    }

    function handleVisibilityChange() {
      pageVisible = !document.hidden;

      if (shouldAnimate()) scheduleTick();
      else cancelTick();
    }

    function handleScroll() {
      isScrolling = true;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        isScrolling = false;
        scheduleTick();
      }, 160);
    }

    function handleReducedMotionChange() {
      if (shouldAnimate()) scheduleTick();
      else cancelTick();
      draw(performance.now());
    }

    const observer = new ResizeObserver(() => {
      resize();
      lastDrawTime = Number.NEGATIVE_INFINITY;
      draw(performance.now());
      scheduleTick();
    });

    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              canvasVisible = entries.some((entry) => entry.isIntersecting);

              if (canvasVisible) {
                lastDrawTime = Number.NEGATIVE_INFINITY;
                draw(performance.now());
                scheduleTick();
              } else {
                cancelTick();
              }
            },
            { rootMargin: "180px 0px" },
          );

    resize();
    observer.observe(canvas);
    intersectionObserver?.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("scroll", handleScroll, { passive: true });
    reducedMotion.addEventListener?.("change", handleReducedMotionChange);
    draw(performance.now());
    scheduleTick();

    return () => {
      observer.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("scroll", handleScroll);
      reducedMotion.removeEventListener?.("change", handleReducedMotionChange);
      window.clearTimeout(scrollTimer);
      window.clearTimeout(tickTimer);
      cancelTick();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={clsx("pointer-events-none block h-full w-full", className)}
      style={{
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 13%, black 90%, transparent 100%)",
        maskImage: "linear-gradient(to bottom, transparent 0%, black 13%, black 90%, transparent 100%)",
      }}
    />
  );
}
