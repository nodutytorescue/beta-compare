import { useRef, useEffect } from 'react';
import type { ProgressPoint } from '../types';
import { lowConfidenceRanges } from '../lib/progressCurve';

interface SparklineChartProps {
  curve: ProgressPoint[];
  width?: number;
  height?: number;
  className?: string;
}

export default function SparklineChart({
  curve,
  width = 300,
  height = 48,
  className = ''
}: SparklineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || curve.length === 0) return;

    const W = width, H = height;
    const duration = curve[curve.length - 1].timestamp - curve[0].timestamp;
    if (duration === 0) return;

    const toX = (ms: number) => ((ms - curve[0].timestamp) / duration) * W;
    const toY = (p: number) => H - p * (H - 4) - 2; // top padding 2px

    // Build polyline points
    const pts = curve.map(p => `${toX(p.timestamp).toFixed(1)},${toY(p.progress).toFixed(1)}`).join(' ');

    // Low-confidence shading
    const gapRanges = lowConfidenceRanges(curve);
    const rects = gapRanges.map(r =>
      `<rect x="${toX(r.startMs).toFixed(1)}" y="0" width="${(toX(r.endMs) - toX(r.startMs)).toFixed(1)}" height="${H}" fill="rgba(148,163,184,0.15)" />`
    ).join('');

    svg.innerHTML = `
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${rects}
      <polyline
        points="${pts}"
        fill="none"
        stroke="#38bdf8"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <line id="sparkline-cursor" x1="0" y1="0" x2="0" y2="${H}" stroke="#f472b6" stroke-width="1" opacity="0"/>
    `;
  }, [curve, width, height]);

  /** Called from PlayerScreen via DOM to update cursor position without re-render */
  const updateCursor = (progress: number) => {
    const svg = svgRef.current;
    if (!svg || curve.length === 0) return;
    const duration = curve[curve.length - 1].timestamp - curve[0].timestamp;
    if (duration === 0) return;
    // Find approximate time from progress
    const cursor = svg.querySelector('#sparkline-cursor');
    if (!cursor) return;
    // Simple: map progress linearly to x (approximate)
    const x = ((progress) * width).toFixed(1);
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('opacity', '1');
  };

  // Expose updateCursor via data attribute approach — parent uses ref
  useEffect(() => {
    const svg = svgRef.current;
    if (svg) (svg as SVGSVGElement & { updateCursor?: typeof updateCursor }).updateCursor = updateCursor;
  });

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full h-full ${className}`}
    />
  );
}
