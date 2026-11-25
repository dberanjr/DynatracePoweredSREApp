import React from "react";
import ReactDOM from "react-dom/client";
import { queryExecutionClient } from "@dynatrace-sdk/client-query";
import { AppRoot } from "@dynatrace/strato-components/core";
import { BrowserRouter } from "react-router-dom";
import { SHARED_CONFIG_GLOBAL_KEY, SHARED_CONFIG_PATH } from "./app/settings/lookupDefs";
import "./app/theme.css";

// The DQL of the whole app is built from the customer's settings when the app modules load, and those settings live in
// the lookup /lookups/dtsrepoweredapp/config. So: read the table first, hand the rows over through a global, and only then
// load the settings module and the app (dynamic imports, evaluated in this order).
type Row = Record<string, unknown>;

async function readSharedConfig(): Promise<{ state: "saved" | "missing" | "unreadable"; rows: Row[]; error?: string }> {
  try {
    const started = await queryExecutionClient.queryExecute({
      body: { query: `load "${SHARED_CONFIG_PATH}" | limit 200`, maxResultRecords: 200, requestTimeoutMilliseconds: 20000 },
    });
    let records: Array<Row | null> | undefined = started.result?.records;
    for (let i = 0; !records && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const p = await queryExecutionClient.queryPoll({ requestToken: started.requestToken! });
      if (p.state === "SUCCEEDED") records = p.result?.records ?? [];
      else if (p.state !== "NOT_STARTED" && p.state !== "RUNNING") throw new Error(`query ended in state ${p.state}`);
    }
    return { state: "saved", rows: (records ?? []).filter((r): r is Row => !!r) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return { state: /UNKNOWN_TABULAR_FILE|doesn't exist|does not exist|not found/i.test(msg) ? "missing" : "unreadable", rows: [], error: msg };
  }
}

async function start() {
  (globalThis as Record<string, unknown>)[SHARED_CONFIG_GLOBAL_KEY] = await readSharedConfig();
  await import("./app/settings/appSettings");
  const { App } = await import("./app/App");
  const { ThemeProvider } = await import("./app/components/ThemeToggle");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <AppRoot>
      <ThemeProvider>
        <BrowserRouter basename="ui">
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </AppRoot>
  );
}

void start();
