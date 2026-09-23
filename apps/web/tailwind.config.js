/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      boxShadow: {
        // Sombra "flat/enterprise" do design de referência Velzon (docs/design.md) — rasa e em
        // duas camadas, no lugar da sombra difusa anterior. `card` para blocos de conteúdo,
        // `card-lg` para elementos elevados (dropdowns, modais, popovers).
        card: "0 1px 2px rgba(56, 65, 74, 0.1), 0 1px 3px rgba(56, 65, 74, 0.08)",
        "card-lg": "0 5px 10px rgba(30, 32, 37, 0.12)",
      },
      colors: {
        // Paleta institucional OASIS SOLAR — ver docs (Especificação, seção 02) e
        // apps/web/src/theme/colors.ts. Não usar vermelho/verde institucionais: são cores
        // funcionais de estado (Kanban/calendário), não fazem parte da paleta de marca.
        "os-azul-marinho": "#00386D",
        "os-laranja": "#EE7528",
        "os-azul-claro": "#45A3DB",
        "os-amarelo": "#FBBB21",
        "os-cinza": "#878787",
        "os-branco": "#FFFFFF",
        "os-estado-vermelho": "#B42318",
        "os-estado-amarelo": "#FBBB21",
        "os-estado-verde": "#16804A",
        "os-estado-cinza": "#878787",
      },
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
