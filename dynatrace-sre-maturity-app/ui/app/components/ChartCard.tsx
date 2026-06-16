import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import {
  TimeseriesChart,
  convertToTimeseries,
} from "@dynatrace/strato-components-preview/charts";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";

export function ChartCard({
  title,
  subtitle,
  icon,
  color,
  query,
  height = 260,
  variant = "line",
  yAxisFormatter,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  color: string;
  query: string;
  height?: number;
  variant?: "line" | "bar" | "area";
  yAxisFormatter?: (value: number) => string;
}) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 12,
        border: "1px solid var(--sre-border)",
        overflow: "hidden",
        boxShadow: "0 1px 3px var(--sre-card-shadow)",
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${color}, ${color}dd)`,
          padding: height < 200 ? "8px 16px" : "12px 20px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: height < 200 ? 14 : 18 }}>{icon}</span>
          <div>
            <Heading level={height < 200 ? 6 : 5} style={{ color: "#fff", margin: 0, fontSize: height < 200 ? 13 : undefined }}>{title}</Heading>
            {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ padding: height < 200 ? 8 : 16 }}>
          {isLoading ? (
            <Flex justifyContent="center" padding={height < 200 ? 16 : 32}><ProgressCircle /></Flex>
          ) : error ? (
            <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 12 }}>{error.message}</Paragraph>
          ) : data?.records && data.records.length > 0 ? (
            <div style={{ height }}>
              <TimeseriesChart
                data={convertToTimeseries(data.records, data.types)}
                variant={variant}
                gapPolicy="connect"
              >
                <TimeseriesChart.Legend hidden />
                {yAxisFormatter && <TimeseriesChart.YAxis formatter={yAxisFormatter} />}
              </TimeseriesChart>
            </div>
          ) : (
            <Flex justifyContent="center" padding={32}>
              <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.5 }}>No data available for this timeframe</Paragraph>
            </Flex>
          )}
        </div>
      </div>
    </RefreshOverlay>
  );
}
