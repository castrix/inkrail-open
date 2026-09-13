import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './app.vue'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#151714',
        paper: '#f4efe3',
        moss: '#496354',
        rust: '#b85d3c',
        gold: '#c9a96e'
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans', 'system-ui', 'sans-serif'],
        serif: ['Literata', 'Noto Serif TC', 'Georgia', 'serif']
      }
    }
  }
}
