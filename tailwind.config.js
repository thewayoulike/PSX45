/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', 
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        // Plus Jakarta Sans looks incredibly premium for numbers and headers
        display: ['Plus Jakarta Sans', 'sans-serif'], 
      },
      colors: {
        slate: { 
          850: '#151e2e', 
          900: '#0f172a', 
          950: '#020617' 
        }
      },
      boxShadow: {
        // Soft, diffuse shadows for cards instead of harsh standard shadows
        'card': '0 10px 40px -10px rgba(0,0,0,0.05)',
        'card-dark': '0 10px 40px -10px rgba(0,0,0,0.3)',
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.15)',
        'glass': '0 4px 30px rgba(0, 0, 0, 0.05)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        }
      }
    }
  },
  plugins: [],
}
