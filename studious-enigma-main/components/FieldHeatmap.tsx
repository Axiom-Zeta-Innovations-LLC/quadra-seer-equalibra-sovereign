import React from 'react';

interface FieldHeatmapProps {
  title: string;
  field: number[][];
  heightClassName?: string;
  heightPx?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function valueToColor(value: number): string {
  // Normalize using tanh so outliers do not wash out the map.
  const normalized = Math.tanh(value);
  const hue = normalized >= 0 ? 175 : 8;
  const saturation = 82;
  const lightness = 14 + Math.abs(normalized) * 40;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

const FieldHeatmap: React.FC<FieldHeatmapProps> = ({ title, field, heightClassName = 'h-32', heightPx }) => {
  if (!field || field.length === 0 || field[0].length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-gray-400">{title}</div>
        <div className="text-[9px] font-mono text-gray-500">No field data available.</div>
      </div>
    );
  }

  const rows = field.length;
  const cols = field[0].length;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-300">{title}</div>
        <div className="text-[8px] font-mono uppercase tracking-widest text-gray-500">
          {rows}x{cols}
        </div>
      </div>
      <div
        className={`grid w-full overflow-hidden rounded-lg border border-white/10 ${heightClassName}`}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          ...(typeof heightPx === 'number' ? { height: `${heightPx}px` } : {}),
        }}
      >
        {field.flatMap((row, rIdx) =>
          row.map((value, cIdx) => {
            const opacity = clamp(0.2 + Math.abs(Math.tanh(value)) * 0.78, 0.2, 0.98);
            return (
              <div
                key={`${rIdx}-${cIdx}`}
                style={{
                  backgroundColor: valueToColor(value),
                  opacity,
                }}
                title={`(${rIdx}, ${cIdx}) = ${value.toFixed(4)}`}
              />
            );
          })
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-gray-500">
        <span>negative</span>
        <span>neutral</span>
        <span>positive</span>
      </div>
    </div>
  );
};

export default FieldHeatmap;
