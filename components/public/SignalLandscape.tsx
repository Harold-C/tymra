"use client";

import dynamic from "next/dynamic";

const QuantumWaveCanvas = dynamic(
  () => import("../QuantumWaveCanvas").then((module) => module.QuantumWaveCanvas),
  { ssr: false },
);

export function SignalLandscape() {
  return (
    <div className="signal-landscape" aria-hidden="true">
      <QuantumWaveCanvas className="h-full w-full" />
    </div>
  );
}

