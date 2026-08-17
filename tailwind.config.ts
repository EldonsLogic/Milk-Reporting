import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        milk: {
          bg: "#FAF9F6",
          surface: "#FFFFFF",
          black: "#111111",
          yellow: "#FFE600",
          yellowHover: "#E6CF00",
          muted: "#666666",
          border: "#E2E2DF",
          subtle: "#F2F1ED",
          darkBg: "#0C0C0C",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "4px",
      },
      boxShadow: {
        none: "none",
        crisp: "2px 2px 0px #111111",
        "crisp-sm": "1px 1px 0px #111111",
      },
    },
  },
  plugins: [],
};
export default config;
