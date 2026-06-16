import React from "react";

interface Column {
  name: string;
  label: string;
}

interface SimpleTableProps {
  data: Record<string, unknown>[];
  columns: Column[];
  stickyHeader?: boolean;
}

export const SimpleTable = ({ data, columns, stickyHeader }: SimpleTableProps) => {
  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          color: "var(--sre-text-primary, #1A2440)",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.name}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--sre-table-border, #e0e0e0)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  color: "var(--sre-text-secondary, #6F747F)",
                  ...(stickyHeader
                    ? {
                        position: "sticky" as const,
                        top: 0,
                        background: "var(--sre-table-header-bg, #fff)",
                        zIndex: 1,
                      }
                    : {}),
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              style={{
                background: i % 2 === 0 ? "transparent" : "var(--sre-table-stripe, rgba(0,0,0,0.02))",
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.name}
                  style={{
                    padding: "6px 12px",
                    borderBottom: "1px solid var(--sre-table-border, #f0f0f0)",
                  }}
                >
                  {String(row[col.name] ?? "\u2014")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
