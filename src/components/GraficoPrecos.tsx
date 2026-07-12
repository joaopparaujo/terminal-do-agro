"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Pregao } from "@/app/api/historico/[produto]/route";

const COR_SERIE = "#ffb000";
const COR_TEXTO_MUTED = "#8a6a1f";
const COR_GRADE = "#3a2f10";
const COR_SUPERFICIE = "#0a0a0a";

function formatarReal(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: Pregao }[];
}

function TooltipTerminal({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const pregao = payload[0].payload;
  const sinal = pregao.variacao > 0 ? "▲" : pregao.variacao < 0 ? "▼" : "▪";
  return (
    <div className="border border-border bg-background px-3 py-2 text-sm">
      <p className="text-muted">{pregao.data}</p>
      <p className="font-bold">{formatarReal(pregao.valor)}</p>
      <p className="text-muted">
        {sinal} {pregao.variacao.toLocaleString("pt-BR")}% vs. pregão anterior
      </p>
    </div>
  );
}

export default function GraficoPrecos({ pregoes }: { pregoes: Pregao[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={pregoes}
          margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
        >
          <CartesianGrid stroke={COR_GRADE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="data"
            tickFormatter={(data: string) => data.slice(0, 5)}
            tick={{ fill: COR_TEXTO_MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: COR_GRADE }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(valor: number) =>
              valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
            }
            tick={{ fill: COR_TEXTO_MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            content={<TooltipTerminal />}
            cursor={{ stroke: COR_TEXTO_MUTED, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={COR_SERIE}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{
              r: 4,
              fill: COR_SERIE,
              stroke: COR_SUPERFICIE,
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
