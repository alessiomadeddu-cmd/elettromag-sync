/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
    'bg-sky-600', 'bg-amber-600', 'bg-orange-600', 'bg-rose-600',
    'bg-purple-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600', 'bg-lime-600', 'bg-orange-500',
    'text-green-400', 'text-yellow-400', 'text-blue-400', 'text-red-400',
    'bg-green-900/30', 'bg-yellow-900/30', 'bg-gray-600/35', 'bg-gray-700/35',
    'bg-green-900/35', 'bg-red-900/20'
  ]
}