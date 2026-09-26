
import { adjustHexColor, getContrastColor, hexToRgba } from './utils/colorUtils';

export interface Theme {
  name: string;
  colors: {
    [key: string]: string;
  };
  isCustom?: boolean;
}

export const themes: Theme[] = [
  {
    name: 'Emergence', // The original Green/Yellow
    colors: {
        '--color-primary': '#4ade80', // green-400
        '--color-primary-dark': '#166534', // green-700
        '--color-primary-faded': 'rgba(74, 222, 128, 0.2)',
        '--color-accent': '#facc15', // yellow-400
        '--color-text-primary': '#a3e635', // lime-400
        '--color-text-secondary': '#a1a1aa', // zinc-400
        '--color-border': 'rgba(74, 222, 128, 0.3)',
        '--color-border-accent': 'rgba(250, 204, 21, 0.3)',
        '--color-shadow': 'rgba(84, 255, 164, 0.1)',
        '--color-bot-bg': 'rgba(20, 83, 45, 0.3)', 
        '--color-user-bg': 'rgba(74, 52, 2, 0.3)',
        '--color-button-text': '#000000',
    }
  },
  {
    name: 'Cyberspace', // Blue/Cyan
    colors: {
        '--color-primary': '#60a5fa', // blue-400
        '--color-primary-dark': '#1d4ed8', // blue-700
        '--color-primary-faded': 'rgba(96, 165, 250, 0.2)',
        '--color-accent': '#22d3ee', // cyan-400
        '--color-text-primary': '#93c5fd', // blue-300
        '--color-text-secondary': '#a1a1aa', // zinc-400
        '--color-border': 'rgba(59, 130, 246, 0.3)',
        '--color-border-accent': 'rgba(34, 211, 238, 0.3)',
        '--color-shadow': 'rgba(96, 165, 250, 0.1)',
        '--color-bot-bg': 'rgba(30, 58, 138, 0.3)',
        '--color-user-bg': 'rgba(21, 94, 117, 0.3)',
        '--color-button-text': '#ffffff',
    }
  },
  {
    name: 'Synthwave', // Purple/Pink
    colors: {
        '--color-primary': '#c084fc', // purple-400
        '--color-primary-dark': '#6b21a8', // purple-700
        '--color-primary-faded': 'rgba(192, 132, 252, 0.2)',
        '--color-accent': '#f472b6', // pink-400
        '--color-text-primary': '#d8b4fe', // purple-300
        '--color-text-secondary': '#a1a1aa', // zinc-400
        '--color-border': 'rgba(147, 51, 234, 0.3)',
        '--color-border-accent': 'rgba(244, 114, 182, 0.3)',
        '--color-shadow': 'rgba(192, 132, 252, 0.1)',
        '--color-bot-bg': 'rgba(88, 28, 135, 0.3)',
        '--color-user-bg': 'rgba(131, 24, 67, 0.3)',
        '--color-button-text': '#ffffff',
    }
  },
];

export const generateCustomTheme = (primary: string, accent: string): Theme => {
  return {
    name: 'Custom',
    isCustom: true,
    colors: {
      '--color-primary': primary,
      '--color-primary-dark': adjustHexColor(primary, -30),
      '--color-primary-faded': hexToRgba(primary, 0.2),
      '--color-accent': accent,
      '--color-text-primary': adjustHexColor(primary, 20),
      '--color-text-secondary': '#a1a1aa', // Keep neutral for readability
      '--color-border': hexToRgba(primary, 0.3),
      '--color-border-accent': hexToRgba(accent, 0.3),
      '--color-shadow': hexToRgba(primary, 0.1),
      '--color-bot-bg': hexToRgba(adjustHexColor(primary, -40), 0.3),
      '--color-user-bg': hexToRgba(adjustHexColor(accent, -40), 0.3),
      '--color-button-text': getContrastColor(accent),
    },
  };
};
