import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  APP_INTERPRETERS,
  APP_PROBES,
  CHECKS,
  INPUTS,
  PROBES,
  appQueryFor,
  checkState,
  explainApp,
  outcomeFromError,
  tidy,
  type CheckState,
  type InputDef,
  type Outcome,
  type ProbeDef,
  type Records,
  type Status,
  type Verdict,
} from "../readiness/registry";
import {
  ACCENT_SOLID,
  INK,
  TINT,
  cardBodyStyle,
  cardHeaderStyle,
  cardMetaStyle,
  cardStyle,
  cardTitleStyle,
  chipStyle,
  eyebrowStyle,
  subTabStyle,
  tableCellStyle,
  tableHeadCellStyle,
  tableHeadRowStyle,
  tableRowBorder,
} from "../components/redesignStyles";

// Data readiness. Two views of the same question, "does this environment provide what the checks read?":
//   - This environment: each input, measured across everything. Which checks does each one hold up?
//   - One application: why does THIS application's scorecard complain? Each gap is either an environment
//     gap (the input exists nowhere, so fixing it once helps everyone) or an application gap (it exists
//     elsewhere, not for this application).
// Read-only. Probes run only when asked, because some scan a month of events.
// Design: docs/superpowers/specs/2026-10-22-data-readiness-design.md

const SKIP_QUERY = "data record(skip = true) | limit 0";

type ProbeState = { phase: "running" } | { phase: "done"; outcomes: Record<string, Outcome>; scannedBytes?: number; execMs?: number };
type Scope = "environment" | "app";
type Shown = Status | "idle" | "running" | "later";

// Runs one query and reports its outcomes upward. A component per probe keeps the hook count fixed; the run
// number is appended as a comment so pressing Run again really re-executes the query.
function ProbeRunner({
  stateKey,
  probe,
  query,
  interpret,
  runId,
  onState,
}: {
  stateKey: string;
  probe: ProbeDef;
  query: string;
  interpret: (records: Records) => Record<string, Outcome>;
  runId: number;
  onState: (key: string, s: ProbeState) => void;
}) {
  const active = runId > 0;
  const { data, error, isLoading } = useDql({ query: active ? `${query}\n// run ${runId}` : SKIP_QUERY });

  useEffect(() => {
    if (!active) return;
    if (isLoading) {
      onState(stateKey, { phase: "running" });
      return;
    }
    if (error) {
      const outcome = outcomeFromError(probe, error.message);
      const outcomes: Record<string, Outcome> = {};
      for (const id of probe.produces) outcomes[id] = outcome;
      onState(stateKey, { phase: "done", outcomes });
      return;
    }
    if (data) {
      const grail = data.metadata?.grail;
      onState(stateKey, {
        phase: "done",
        outcomes: interpret((data.records ?? []) as Records),
        scannedBytes: grail?.scannedBytes,
        execMs: grail?.executionTimeMilliseconds,
      });
    }
  }, [active, isLoading, error, data, probe, interpret, stateKey, onState]);

  return null;
}

// A runner for the per-application version of a probe.
function AppRunner({ probe, appCI, runId, onState }: { probe: ProbeDef; appCI: string; runId: number; onState: (key: string, s: ProbeState) => void }) {
  const query = useMemo(() => appQueryFor(probe.key, appCI), [probe.key, appCI]);
  const interpret = useCallback((rec: Records) => APP_INTERPRETERS[probe.key](rec, appCI), [probe.key, appCI]);
  return <ProbeRunner stateKey={`app:${probe.key}`} probe={probe} query={query} interpret={interpret} runId={runId} onState={onState} />;
}

const STATUS_LABEL: Record<Shown, string> = {
  ready: "Ready",
  partial: "Partial",
  missing: "Missing",
  na: "Not applicable",
  unknown: "Unknown",
  idle: "Not run",
  running: "Running…",
  later: "Later phase",
};

const NEUTRAL = { fg: INK.muted, bg: "var(--chip, #F4F6F9)" };
const statusColors = (s: Shown) =>
  s === "ready" ? { fg: INK.pass, bg: TINT.pass } : s === "partial" ? { fg: INK.warn, bg: TINT.warn } : s === "missing" ? { fg: INK.fail, bg: TINT.fail } : NEUTRAL;

const Pill = ({ label, fg, bg }: { label: string; fg: string; bg: string }) => (
  <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: fg, background: bg, whiteSpace: "nowrap" }}>{label}</span>
);
const StatusPill = ({ status }: { status: Shown }) => {
  const c = statusColors(status);
  return <Pill label={STATUS_LABEL[status]} fg={c.fg} bg={c.bg} />;
};

const VERDICT: Record<Verdict, { label: string; who: string; fg: string; bg: string }> = {
  "environment-gap": { label: "Environment gap", who: "Fix once, helps every application", fg: INK.fail, bg: TINT.fail },
  "app-gap": { label: "Application gap", who: "Specific to this application", fg: INK.warn, bg: TINT.warn },
  ok: { label: "Present", who: "", fg: INK.pass, bg: TINT.pass },
  "not-applicable": { label: "Not applicable", who: "", ...NEUTRAL },
  unknown: { label: "Unknown", who: "", ...NEUTRAL },
  later: { label: "Measured later", who: "", ...NEUTRAL },
  "not-implemented": { label: "Not implemented", who: "", ...NEUTRAL },
  "not-run": { label: "Not run", who: "", ...NEUTRAL },
};

const CHECK_STATE_LABEL: Record<CheckState, string> = {
  blocked: "blocked",
  "at-risk": "at risk",
  unknown: "unknown",
  ready: "ready",
  "not-implemented": "not implemented",
  "not-measurable": "measured in a later phase",
  "not-run": "not run",
};
const checkStateColor = (s: CheckState): string => (s === "blocked" ? INK.fail : s === "at-risk" ? INK.warn : s === "ready" ? INK.pass : INK.muted);

const LEVEL_NAME: Record<string, string> = { L1: "Full Observability", L2: "Measured Reliability", L3: "AI-Assisted Operations", L4: "Proactive Reliability", L5: "Autonomous Reliability" };

const formatBytes = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  background: ACCENT_SOLID,
  color: "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

const noticeBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 12,
  border: "1px solid var(--line, #E3E6EB)",
  background: "var(--panel, #F7F8FA)",
  color: INK.text,
};

const Tile = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "fail" | "warn" | "pass" }) => (
  <div style={{ ...cardStyle, padding: "12px 14px", minWidth: 190, flex: 1 }}>
    <div style={eyebrowStyle}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tone ? INK[tone] : INK.text, marginTop: 2 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: INK.muted, marginTop: 2 }}>{sub}</div>}
  </div>
);

const flatten = (states: Record<string, ProbeState>): Record<string, Outcome | undefined> => {
  const out: Record<string, Outcome | undefined> = {};
  for (const s of Object.values(states)) if (s.phase === "done") Object.assign(out, s.outcomes);
  return out;
};
const sumBytes = (states: Record<string, ProbeState>): number => Object.values(states).reduce((n, s) => n + (s.phase === "done" ? (s.scannedBytes ?? 0) : 0), 0);

interface Props {
  /** The application chosen in the header. Empty until the picker has loaded. */
  appCI: string;
}

export const ReadinessPage = ({ appCI }: Props) => {
  const [scope, setScope] = useState<Scope>("environment");
  const [estateRun, setEstateRun] = useState(0);
  const [estateStates, setEstateStates] = useState<Record<string, ProbeState>>({});
  // A run belongs to the application it was started for, so switching the picker can never fire queries unasked.
  const [appRunState, setAppRunState] = useState({ n: 0, app: "" });
  const [appStates, setAppStates] = useState<Record<string, ProbeState>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const onEstateState = useCallback((key: string, s: ProbeState) => setEstateStates((prev) => ({ ...prev, [key]: s })), []);
  const onAppState = useCallback((key: string, s: ProbeState) => setAppStates((prev) => ({ ...prev, [key]: s })), []);

  const appRun = appRunState.app === appCI ? appRunState.n : 0;

  // A different application means different results: forget the old ones and wait to be asked again.
  useEffect(() => {
    setAppStates({});
  }, [appCI]);

  const runEstate = () => {
    setEstateStates({});
    setEstateRun((n) => n + 1);
  };
  // The application view needs the environment results to tell the two kinds of gap apart.
  const runApp = () => {
    setAppStates({});
    setAppRunState((prev) => ({ n: prev.n + 1, app: appCI }));
    if (estateRun === 0) setEstateRun(1);
  };

  const estate = useMemo(() => flatten(estateStates), [estateStates]);
  const appOut = useMemo(() => flatten(appStates), [appStates]);
  const estateRunning = estateRun > 0 && PROBES.some((p) => estateStates[p.key]?.phase !== "done");
  const estateFinished = estateRun > 0 && !estateRunning;
  const appRunning = appRun > 0 && (APP_PROBES.some((p) => appStates[`app:${p.key}`]?.phase !== "done") || estateRunning);
  const appFinished = appRun > 0 && !appRunning;
  const code = appCI.toUpperCase();

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      {PROBES.map((p) => (
        <ProbeRunner key={`env:${p.key}`} stateKey={p.key} probe={p} query={p.query} interpret={p.interpret} runId={estateRun} onState={onEstateState} />
      ))}
      {appCI &&
        APP_PROBES.map((p) => <AppRunner key={`app:${p.key}:${appCI}`} probe={p} appCI={appCI} runId={appRun} onState={onAppState} />)}

      <div>
        <Heading level={3} style={{ margin: "0 0 4px" }}>Data Readiness</Heading>
        <Paragraph style={{ margin: 0, fontSize: 13, color: INK.muted }}>
          A low score can mean weak practice, or only that this environment does not provide what a check reads (a log attribute,
          deployment events, a naming convention). Read-only. Nothing runs until you press a button, because a few of the queries
          scan a month of events.
        </Paragraph>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line, #E3E6EB)" }}>
        <button type="button" style={subTabStyle(scope === "environment")} onClick={() => setScope("environment")}>
          This environment
        </button>
        <button type="button" style={subTabStyle(scope === "app")} onClick={() => setScope("app")}>
          {appCI ? `Application ${code}` : "Selected application"}
        </button>
      </div>

      {scope === "environment" ? (
        <EnvironmentView
          estate={estate}
          estateStates={estateStates}
          estateRun={estateRun}
          running={estateRunning}
          finished={estateFinished}
          totalBytes={sumBytes(estateStates)}
          openId={openId}
          setOpenId={setOpenId}
          onRun={runEstate}
        />
      ) : (
        <ApplicationView
          appCI={appCI}
          code={code}
          estate={estate}
          appOut={appOut}
          running={appRunning}
          finished={appFinished}
          started={appRun > 0}
          totalBytes={sumBytes(estateStates) + sumBytes(appStates)}
          onRun={runApp}
        />
      )}
    </Flex>
  );
};

// ───────────────────────────── This environment ─────────────────────────────

function EnvironmentView({
  estate,
  estateStates,
  estateRun,
  running,
  finished,
  totalBytes,
  openId,
  setOpenId,
  onRun,
}: {
  estate: Record<string, Outcome | undefined>;
  estateStates: Record<string, ProbeState>;
  estateRun: number;
  running: boolean;
  finished: boolean;
  totalBytes: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onRun: () => void;
}) {
  const inputStatus = (i: InputDef): Shown => {
    if (!i.probe) return "later";
    const o = estate[i.id];
    return o ? o.status : estateRun === 0 ? "idle" : "running";
  };
  const checkStates = useMemo(() => Object.fromEntries(CHECKS.map((c) => [c.id, checkState(c, estate)])) as Record<string, CheckState>, [estate]);
  const implemented = CHECKS.filter((c) => !c.notImplemented);
  const countState = (s: CheckState) => implemented.filter((c) => checkStates[c.id] === s).length;
  const measurable = INPUTS.filter((i) => i.probe);
  const countInputs = (s: Status) => measurable.filter((i) => estate[i.id]?.status === s).length;

  const affects = (i: InputDef) => CHECKS.filter((c) => c.inputs.includes(i.id));
  const rows = useMemo(() => {
    const weight = (i: InputDef) => {
      const st = estate[i.id]?.status;
      return st === "missing" || st === "partial" ? affects(i).length : -1;
    };
    return [...INPUTS].sort((a, b) => (finished ? weight(b) - weight(a) : 0) || a.id.localeCompare(b.id));
  }, [estate, finished]);

  // What it means, in a sentence, for an input that is not fully present.
  const meaning = (i: InputDef, st: Shown): string => {
    const list = affects(i).filter((c) => !c.notImplemented);
    if (list.length === 0) return "";
    const names = `${list.slice(0, 3).map((c) => `${c.id} ${c.name}`).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}`;
    if (st === "missing") return `No application can pass: ${names}.`;
    if (st === "partial") return `Applications without it will fail: ${names}.`;
    return "";
  };

  return (
    <>
      <div style={noticeBox}>
        This view describes the <strong>whole environment</strong>, not one application. To see why a single application's scorecard
        complains, use the <strong>Application</strong> tab above.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle(running)} disabled={running} onClick={onRun}>
          {estateRun === 0 ? "Run readiness check" : running ? "Running…" : "Run again"}
        </button>
        {running && <span style={{ fontSize: 12, color: INK.muted }}>{PROBES.filter((p) => estateStates[p.key]?.phase === "done").length} of {PROBES.length} queries finished</span>}
        {finished && <span style={{ fontSize: 12, color: INK.muted }}>Done. {PROBES.length} queries scanned {formatBytes(totalBytes)}.</span>}
      </div>

      {finished && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Tile label="Inputs ready" value={`${countInputs("ready")} of ${measurable.length}`} sub={`${countInputs("partial")} partial · ${countInputs("na")} not applicable`} tone="pass" />
          <Tile label="Inputs missing" value={String(countInputs("missing"))} sub={`${measurable.filter((i) => estate[i.id]?.status === "unknown").length} could not be measured`} tone={countInputs("missing") > 0 ? "fail" : undefined} />
          <Tile label="Checks blocked" value={`${countState("blocked")} of ${implemented.length}`} sub={`${countState("at-risk")} more at risk · ${countState("unknown")} unknown`} tone={countState("blocked") > 0 ? "fail" : undefined} />
          <Tile label="Not implemented" value={String(CHECKS.length - implemented.length)} sub="checks the app marks as not yet live" />
        </div>
      )}

      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>Inputs</span>
          <span style={cardMetaStyle}>{finished ? "Most checks held up first" : "Run the check to measure each input"}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={tableHeadRowStyle}>
                <th style={tableHeadCellStyle}>Input</th>
                <th style={tableHeadCellStyle}>Status</th>
                <th style={tableHeadCellStyle}>What was found</th>
                <th style={{ ...tableHeadCellStyle, textAlign: "center" }}>Checks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const st = inputStatus(i);
                const o = estate[i.id];
                const affected = affects(i);
                const open = openId === i.id;
                const probe = PROBES.find((p) => p.key === i.probe);
                const pState = i.probe ? estateStates[i.probe] : undefined;
                const says = meaning(i, st);
                return (
                  <React.Fragment key={i.id}>
                    <tr style={{ borderTop: tableRowBorder, cursor: "pointer" }} onClick={() => setOpenId(open ? null : i.id)}>
                      <td style={tableCellStyle}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(open ? null : i.id);
                          }}
                          style={{ all: "unset", cursor: "pointer", color: INK.text, fontWeight: 600 }}
                        >
                          {open ? "▾" : "▸"} {i.name}
                        </button>{" "}
                        <span style={{ ...eyebrowStyle, marginLeft: 6 }}>{i.id}</span>
                      </td>
                      <td style={tableCellStyle}>
                        <StatusPill status={st} />
                      </td>
                      <td style={{ ...tableCellStyle, whiteSpace: "normal", color: o ? INK.text : INK.muted }}>
                        {st === "later" ? (
                          "Measured in a later phase: it needs the SLO, Settings or Documents APIs."
                        ) : (
                          <>
                            {o ? tidy(o.evidence) : estateRun === 0 ? "" : "…"}
                            {says && <div style={{ color: INK.muted, marginTop: 2 }}>{says}</div>}
                          </>
                        )}
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: "center" }}>{affected.length}</td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={4} style={{ padding: "0 10px 12px 28px", background: "var(--panel-2, #FBFCFD)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, fontSize: 12, color: INK.text }}>
                            <div style={{ color: INK.muted }}>{i.description}</div>
                            {o?.note && <div style={{ color: INK.warn }}>{o.note}</div>}
                            {(st === "missing" || st === "partial") && (
                              <div>
                                <span style={eyebrowStyle}>How to close the gap</span>
                                <div style={{ marginTop: 2 }}>{i.fix}</div>
                              </div>
                            )}
                            {probe && (
                              <div style={{ color: INK.muted }}>
                                What was measured: {probe.window}.
                                {pState?.phase === "done" && pState.scannedBytes !== undefined && (
                                  <> Scanned {formatBytes(pState.scannedBytes)}{pState.execMs !== undefined ? ` in ${(pState.execMs / 1000).toFixed(1)}s` : ""}.</>
                                )}
                              </div>
                            )}
                            <div>
                              <div style={eyebrowStyle}>Checks that read this input</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                                {affected.length === 0 && <span style={{ color: INK.muted }}>None.</span>}
                                {affected.map((c) => (
                                  <span key={c.id} style={chipStyle}>
                                    {c.id} {c.name}{" "}
                                    <span style={{ color: checkStateColor(checkStates[c.id]), fontWeight: 600 }}>{CHECK_STATE_LABEL[checkStates[c.id]]}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            {probe && (
                              <details>
                                <summary style={{ cursor: "pointer", color: INK.muted }}>The query</summary>
                                <pre style={{ margin: "6px 0 0", padding: 10, borderRadius: 6, background: "var(--panel, #F7F8FA)", border: "1px solid var(--line, #E3E6EB)", overflowX: "auto", fontSize: 11, color: INK.text }}>
                                  {probe.query}
                                </pre>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────── One application ─────────────────────────────

function ApplicationView({
  appCI,
  code,
  estate,
  appOut,
  running,
  finished,
  started,
  totalBytes,
  onRun,
}: {
  appCI: string;
  code: string;
  estate: Record<string, Outcome | undefined>;
  appOut: Record<string, Outcome | undefined>;
  running: boolean;
  finished: boolean;
  started: boolean;
  totalBytes: number;
  onRun: () => void;
}) {
  const findings = useMemo(() => (finished ? explainApp(appCI, estate, appOut) : []), [finished, appCI, estate, appOut]);
  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length;

  if (!appCI) {
    return <div style={noticeBox}>Pick an ApplicationCI in the header to see why its scorecard complains.</div>;
  }

  return (
    <>
      <div style={noticeBox}>
        For <strong>{code}</strong>, each check below says what it reads and whether that exists. An <strong>environment gap</strong> means the
        input exists nowhere, so no application can pass until someone fixes it once. An <strong>application gap</strong> means it exists
        elsewhere but not for {code}. <strong>Present</strong> means the input exists for {code}; whether the check then passes is judged on the
        Scorecards page.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle(running)} disabled={running} onClick={onRun}>
          {!started ? `Check ${code}` : running ? "Running…" : "Run again"}
        </button>
        {running && <span style={{ fontSize: 12, color: INK.muted }}>Measuring the environment and {code}…</span>}
        {finished && <span style={{ fontSize: 12, color: INK.muted }}>Done. Scanned {formatBytes(totalBytes)}.</span>}
        {!started && <span style={{ fontSize: 12, color: INK.muted }}>Runs the environment queries too, so the two kinds of gap can be told apart.</span>}
      </div>

      {finished && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Tile label="Environment gaps" value={String(count("environment-gap"))} sub="fix once, helps every application" tone={count("environment-gap") > 0 ? "fail" : undefined} />
          <Tile label="Application gaps" value={String(count("app-gap"))} sub={`specific to ${code}`} tone={count("app-gap") > 0 ? "warn" : undefined} />
          <Tile label="Present" value={String(count("ok"))} sub={`${count("not-applicable")} not applicable`} tone="pass" />
          <Tile label="Not measured" value={String(count("later") + count("unknown"))} sub={`${count("not-implemented")} checks not implemented`} />
        </div>
      )}

      {finished && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>Why {code} scores the way it does</span>
            <span style={cardMetaStyle}>by level, as on the scorecard</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={tableHeadRowStyle}>
                  <th style={tableHeadCellStyle}>Check</th>
                  <th style={tableHeadCellStyle}>Finding</th>
                  <th style={tableHeadCellStyle}>Why</th>
                  <th style={tableHeadCellStyle}>What to do</th>
                </tr>
              </thead>
              <tbody>
                {(["L1", "L2", "L3", "L4", "L5"] as const).map((level) => (
                  <React.Fragment key={level}>
                    <tr>
                      <td colSpan={4} style={{ ...eyebrowStyle, padding: "10px 10px 4px", background: "var(--panel-2, #FBFCFD)" }}>
                        {level} · {LEVEL_NAME[level]}
                      </td>
                    </tr>
                    {findings
                      .filter((f) => f.check.level === level)
                      .map((f) => {
                        const v = VERDICT[f.verdict];
                        const gaps = f.reasons.filter((r) => r.kind === "environment" || r.kind === "app");
                        const shown = f.verdict === "environment-gap" || f.verdict === "app-gap" ? gaps : f.reasons;
                        const fixes = [...new Set(gaps.map((r) => INPUTS.find((i) => i.id === r.inputId)?.fix).filter((x): x is string => Boolean(x)))];
                        return (
                          <tr key={f.check.id} style={{ borderTop: tableRowBorder, verticalAlign: "top" }}>
                            <td style={tableCellStyle}>
                              <span style={{ ...eyebrowStyle, marginRight: 6 }}>{f.check.id}</span>
                              {f.check.name}
                            </td>
                            <td style={tableCellStyle}>
                              <Pill label={v.label} fg={v.fg} bg={v.bg} />
                              {v.who && <div style={{ fontSize: 10, color: INK.muted, marginTop: 3, whiteSpace: "normal", maxWidth: 150 }}>{v.who}</div>}
                            </td>
                            <td style={{ ...tableCellStyle, whiteSpace: "normal", minWidth: 280 }}>
                              {f.verdict === "not-implemented" ? (
                                <span style={{ color: INK.muted }}>The app marks this check as not yet live, so it is not a gap.</span>
                              ) : (
                                shown.map((r) => (
                                  <div key={r.inputId} style={{ color: r.kind === "environment" || r.kind === "app" ? INK.text : INK.muted, marginBottom: 2 }}>
                                    {r.text}
                                  </div>
                                ))
                              )}
                            </td>
                            <td style={{ ...tableCellStyle, whiteSpace: "normal", minWidth: 240, color: INK.muted }}>
                              {fixes.map((t) => (
                                <div key={t} style={{ marginBottom: 2 }}>
                                  {t}
                                </div>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...cardBodyStyle, fontSize: 11, color: INK.muted, borderTop: "1px solid var(--line, #E3E6EB)" }}>
            Windows: entities seen recently, logs sampled over 2 hours, events and workflows over 30 days, problems over 7 days. The SLO,
            Guardian, dashboard and runbook inputs are measured in a later phase.
          </div>
        </div>
      )}
    </>
  );
}
