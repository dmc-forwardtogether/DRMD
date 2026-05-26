/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./components/**/*.{vue,js,ts}",
    "./pages/**/*.vue",
    "./app.vue"
  ],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 12px 36px rgba(0, 0, 0, 0.12)"
      }
    }
  },
  plugins: []
}
