import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      colors: {
        navy: {
          950: "#061638",
          900: "#071A3D",
          700: "#26385E",
        },
        tymra: {
          blue: "#0969FF",
          cyan: "#18C8E8",
          purple: "#8B35FF",
          muted: "#60708A",
          border: "#DCE8F8",
        },
      },
      boxShadow: {
        search: "0 18px 60px rgba(9, 105, 255, 0.16), 0 0 0 1px rgba(24, 200, 232, 0.18)",
        card: "0 18px 48px rgba(6, 22, 56, 0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
        glow: "0 0 34px rgba(24, 200, 232, 0.28), 0 0 48px rgba(139, 53, 255, 0.12)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.4s linear infinite",
        floatSlow: "floatSlow 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
