"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DrawdownPoint } from "@/lib/quant/types";

export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  const step = Math.max(1, Math.floor(data.length / 240));
  const sampled = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d) => ({ ...d, pct: Number((d.drawdown * 100).toFixed(2)) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={sampled} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.45} />
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
          width={48}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(10,12,17,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(v: number) => [`${v}%`, "Drawdown"]}
        />
        <Area
          type="monotone"
          dataKey="pct"
          stroke="#f43f5e"
          strokeWidth={1.5}
          fill="url(#ddFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
