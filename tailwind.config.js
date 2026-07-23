/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#dce6ff",
          500: "#3457d5",
          600: "#2a45b0",
          700: "#22378c",
        },
      },
    },
  },
  plugins: [],
};
