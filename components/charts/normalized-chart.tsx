"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NormalizedPoint } from "@/lib/quant/types";

export function NormalizedChart({
  data,
  ticker,
  benchmark,
}: {
  data: NormalizedPoint[];
  ticker: string;
  benchmark: string;
}) {
  // Downsample for readability on long windows.
  const step = Math.max(1, Math.floor(data.length / 240));
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={sampled} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="tickerFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="benchFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64748b" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickFormatter={(d: string) => d.slice(2, 7)}
          minTickGap={48}
          stroke="rgba(148,163,184,0.2)"
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          stroke="rgba(148,163,184,0.2)"
          domain={["auto", "auto"]}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(10,12,17,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="ticker"
          name={ticker}
          stroke="#34d399"
          strokeWidth={2}
          fill="url(#tickerFill)"
        />
        <Area
          type="monotone"
          dataKey="benchmark"
          name={benchmark}
          stroke="#94a3b8"
          strokeWidth={1.5}
          fill="url(#benchFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
