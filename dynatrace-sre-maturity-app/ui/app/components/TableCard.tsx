import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";
import { SimpleTable } from "./SimpleTable";

export function TableCard({
  title,
  color,
  query,
  columns,
  maxHeight,
}: {
  title: string;
  color: string;
  query: string;
  columns: { name: string; label: string }[];
  maxHeight?: number;
}) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });
  const count = data?.records?.length ?? 0;

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
          padding: "10px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <Heading level={5} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
          {count > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{count} items</span>}
        </div>
        <div style={{ padding: 16 }}>
          {isLoading ? (
            <Flex justifyContent="center" padding={16}><ProgressCircle /></Flex>
          ) : error ? (
            <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 12 }}>{error.message}</Paragraph>
          ) : data?.records && data.records.length > 0 ? (
            <div style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined }}>
              <SimpleTable data={data.records as Record<string, unknown>[]} columns={columns} stickyHeader={!!maxHeight} />
            </div>
          ) : (
            <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.5 }}>No data available</Paragraph>
          )}
        </div>
      </div>
    </RefreshOverlay>
  );
}
