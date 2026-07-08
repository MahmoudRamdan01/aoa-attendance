/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FCC107",
          soft: "#FFE38A",
          strong: "#E0A800",
          ink: "#221B00",
        },
        charcoal: {
          DEFAULT: "#22292F",
          deep: "#161C23",
          deeper: "#10151B",
        },
      },
      fontFamily: {
        sans: ["Tajawal", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
