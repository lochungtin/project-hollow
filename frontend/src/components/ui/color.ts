/** Converts an [r,g,b] (0-255) triple into a "#rrggbb" hex string. */
export const rgb2hex = (rgb: number[]) => `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`
