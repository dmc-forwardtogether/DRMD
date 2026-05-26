export default defineNuxtConfig({
  compatibilityDate: "2026-05-10",
  modules: ["@vueuse/nuxt", "@pinia/nuxt", "@nuxtjs/tailwindcss"],
  css: ["~/assets/css/tailwind.css", "maplibre-gl/dist/maplibre-gl.css", "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"],
  devServer: { port: 3000 },
  runtimeConfig: {
    public: {
      apiBase: "http://localhost:8899"
    }
  },
  app: {
    head: {
      title: "DRMD Editor",
      viewport: "width=device-width,initial-scale=1",
      meta: [
        { name: "description", content: "DRMD OSM-like map editor" }
      ]
    }
  },
  devtools: { enabled: true }
})
