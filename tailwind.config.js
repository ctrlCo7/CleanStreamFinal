/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#1D9E75',
          dark: '#0F6E56',
          deep: '#085041',
          light: '#E1F5EE',
          mid: '#9FE1CB',
          pale: '#C8EFE2',
        },
        amber: {
          DEFAULT: '#EF9F27',
          bg: '#FAEEDA',
          text: '#854F0B',
        },
        red: {
          DEFAULT: '#E24B4A',
          bg: '#FCEBEB',
          text: '#A32D2D',
        },
        critical: {
          DEFAULT: '#C0392B',
          bg: '#FDECEA',
          text: '#922B21',
        },
        blue: {
          DEFAULT: '#378ADD',
          bg: '#E6F1FB',
          text: '#185FA5',
        },
        purple: {
          DEFAULT: '#7F77DD',
          bg: '#EEEDFE',
          text: '#3C3489',
        },
        green: {
          DEFAULT: '#639922',
          bg: '#EAF3DE',
          text: '#27500A',
        },
        orange: {
          DEFAULT: '#E07B3A',
          bg: '#FDF0E8',
          text: '#7D3A10',
        },
        brgy: {
          DEFAULT: '#C97B2A',
          dark: '#935515',
          deep: '#5C340D',
          light: '#FDF0E0',
          mid: '#F2C27A',
          bg: '#FDF5EB',
        },
        gray: {
          bg: '#F5F5F3',
          mid: '#D3D1C7',
          muted: '#888780',
          hint: '#B4B2A9',
        },
        text: {
          primary: '#1A1A18',
          secondary: '#5F5E5A',
          muted: '#888780',
          hint: '#B4B2A9',
        },
      },
    },
  },
  plugins: [],
};
