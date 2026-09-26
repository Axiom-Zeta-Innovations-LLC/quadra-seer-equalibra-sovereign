
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const hexToRgb = (hex: string): RGB | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

export const adjustHexColor = (hex: string, percent: number): string => {
    let { r, g, b } = hexToRgb(hex) || {r:0, g:0, b:0};
    const amount = Math.floor(255 * (percent / 100));
    
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));

    const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};


export const getContrastColor = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';

  // Formula to calculate luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

  return luminance > 0.5 ? '#000000' : '#ffffff';
};

export const hexToRgba = (hex: string, alpha: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(0,0,0,${alpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};
