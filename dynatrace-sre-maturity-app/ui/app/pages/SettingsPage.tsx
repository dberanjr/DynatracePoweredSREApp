import React, { useMemo, useState } from "react";
import { functions } from "@dynatrace-sdk/app-utils";
import { useDql } from "../hooks/useDql";
import { useDemoMode } from "../demo/demoMode";
import {
  APP_ID_TAG_KEYS,
  APP_ID_LABEL,
  COMPANY_LOGO_URL,
  COMPANY_NAME,
  DEFAULT_COMPANY_LOGO_URL,
  DEFAULT_COMPANY_NAME,
  DEFAULT_APP_ID_LABEL,
  SOURCE_SETTINGS,
  CATALOG_SETTINGS,
  CLOUD_TAG_OVERRIDE,
  APP_ID_MAX_LENGTH,
  APP_ID_CLOUD_TAG,
  SHARED_CONFIG_STATE,
  defaultSourceSettings,
  defaultCatalogSettings,
  settingsToRows,
  validateCompanyLogoUrl,
} from "../settings/appSettings";
import {
  LOOKUP_DEFS,
  SHARED_CONFIG_PATH,
  DEFAULT_TAG_KEY,
  validateColumn,
  validateTagKey,
  validateSourcePath,
  parseTagKeys,
  normalizeIdMaxLength,
  DEFAULT_TIERS,
  MAX_EXTRA_FIELDS,
  type CatalogSettings,
  type SourceSettings,
  type TierRule,
  type LookupTableDef,
} from "../settings/lookupDefs";

const muted = "var(--sre-text-secondary, #6F747F)";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "var(--sre-surface, transparent)",
  color: "inherit",
  fontFamily: "monospace",
  boxSizing: "border-box",
};

const buttonStyle = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  border: primary ? "none" : "1px solid rgba(128,128,128,0.4)",
  background: primary ? "#1414D3" : "transparent",
  color: primary ? "#fff" : "inherit",
});

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--sre-border, rgba(128,128,128,0.25))",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};

const ErrorText = ({ msg }: { msg: string | null }) =>
  msg ? <div style={{ fontSize: 12, color: "#C4233B", marginTop: 3 }}>{msg}</div> : null;

/** Detects the columns of a lookup table so they can be offered as suggestions. */
function useDetectedColumns(path: string, enabled: boolean) {
  const query = `load "${path}"\n| limit 1`;
  const { data, error, isLoading } = useDql({ query: enabled ? query : "data record(a = 1) | limit 0" }, { enabled });
  const columns = useMemo(() => {
    if (!enabled) return [] as string[];
    const names = new Set<string>();
    const mappings = (data?.types?.[0] as { mappings?: Record<string, unknown> } | undefined)?.mappings;
    if (mappings) Object.keys(mappings).forEach((k) => names.add(k));
    const rec = data?.records?.[0] as Record<string, unknown> | undefined;
    if (rec) Object.keys(rec).forEach((k) => names.add(k));
    return Array.from(names).sort();
  }, [data, enabled]);
  return { columns, error: enabled ? error : undefined, isLoading: enabled && isLoading };
}

/**
 * Text input with a button that lists every detected column. (A native <datalist> only shows options matching
 * what is already typed, so a pre-filled box showed nothing useful.)
 */
const ColumnInput = ({
  value,
  onChange,
  columns,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  columns: string[];
  placeholder?: string;
  label: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <div style={{ display: "flex", gap: 4 }}>
        <input aria-label={label} style={inputStyle} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button
          type="button"
          aria-label={`${label}: choose from detected columns`}
          title={columns.length ? "Choose from detected columns" : "Click Detect columns first"}
          disabled={!columns.length}
          style={{ ...buttonStyle(false, !columns.length), padding: "0 10px" }}
          onClick={() => setOpen((o) => !o)}
        >
          ▾
        </button>
      </div>
      {columns.length > 0 && value.trim() && !columns.includes(value.trim()) && (
        <div role="alert" style={{ fontSize: 11, color: "#d9534f", marginTop: 2 }}>
          Not a column of this table. Queries fail if a mapped column doesn't exist. Pick one from the list, or clear it if the table has no such column.
        </div>
      )}
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 50,
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 2,
            maxHeight: 220,
            overflowY: "auto",
            background: "var(--sre-surface, #fff)",
            color: "inherit",
            border: "1px solid rgba(128,128,128,0.5)",
            borderRadius: 6,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          {columns.map((c) => (
            <button
              type="button"
              key={c}
              role="option"
              aria-selected={c === value}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                border: "none",
                background: c === value ? "rgba(20,20,211,0.18)" : "transparent",
                color: "inherit",
                fontFamily: "monospace",
                fontSize: 13,
                cursor: "pointer",
              }}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const smallButton: React.CSSProperties = { ...buttonStyle(false), padding: "4px 10px", fontSize: 12 };

/** CMDB display options: extra fields and tier values. */
const CatalogOptions = ({ catalog, onChange, columns }: { catalog: CatalogSettings; onChange: (next: CatalogSettings) => void; columns: string[] }) => {
  const setTier = (i: number, patch: Partial<TierRule>) =>
    onChange({ ...catalog, tiers: catalog.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <div style={{ marginTop: 18, borderTop: "1px solid var(--sre-border, rgba(128,128,128,0.25))", paddingTop: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Extra fields</div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
        Additional columns to show in the application profile banner (up to {MAX_EXTRA_FIELDS}).
      </div>
      {catalog.extras.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "start" }}>
          <input
            aria-label={`Extra field ${i + 1} label`}
            style={{ ...inputStyle, fontFamily: "inherit" }}
            placeholder="Label shown in the app"
            value={e.label}
            onChange={(ev) => onChange({ ...catalog, extras: catalog.extras.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })}
          />
          <div style={{ width: "100%" }}>
            <ColumnInput
              label={`Extra field ${i + 1} column`}
              placeholder="Your column"
              columns={columns}
              value={e.column}
              onChange={(v) => onChange({ ...catalog, extras: catalog.extras.map((x, j) => (j === i ? { ...x, column: v } : x)) })}
            />
            <ErrorText msg={validateColumn(e.column, false)} />
          </div>
          <button style={smallButton} onClick={() => onChange({ ...catalog, extras: catalog.extras.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button
        style={{ ...smallButton, opacity: catalog.extras.length >= MAX_EXTRA_FIELDS ? 0.5 : 1 }}
        disabled={catalog.extras.length >= MAX_EXTRA_FIELDS}
        onClick={() => onChange({ ...catalog, extras: [...catalog.extras, { label: "", column: "" }] })}
      >
        + Add field
      </button>

      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 18 }}>Tier values</div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
        What the values in your tier column mean, most critical first. The leaderboard groups applications by tier and its enterprise score
        uses the ones marked critical. Matching ignores case.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) minmax(120px,1fr) 70px 70px", gap: "6px 10px", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase" }}>Value in your data</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase" }}>Shown as</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase" }}>Critical</div>
        <div />
        {catalog.tiers.map((t, i) => (
          <React.Fragment key={i}>
            <input aria-label={`Tier ${i + 1} value`} style={inputStyle} value={t.value} spellCheck={false} onChange={(e) => setTier(i, { value: e.target.value })} />
            <input
              aria-label={`Tier ${i + 1} label`}
              style={{ ...inputStyle, fontFamily: "inherit" }}
              placeholder="(same as value)"
              value={t.label}
              onChange={(e) => setTier(i, { label: e.target.value })}
            />
            <input aria-label={`Tier ${i + 1} critical`} type="checkbox" checked={t.critical} onChange={(e) => setTier(i, { critical: e.target.checked })} />
            <button style={smallButton} onClick={() => onChange({ ...catalog, tiers: catalog.tiers.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={smallButton} onClick={() => onChange({ ...catalog, tiers: [...catalog.tiers, { value: "", label: "", critical: false }] })}>
          + Add tier value
        </button>
        <button
          style={smallButton}
          title='For a yes/no "top tier" column'
          onClick={() =>
            onChange({ ...catalog, tiers: [{ value: "yes", label: "Top tier", critical: true }, { value: "no", label: "Standard", critical: false }] })
          }
        >
          Use yes / no
        </button>
        <button style={smallButton} onClick={() => onChange({ ...catalog, tiers: DEFAULT_TIERS.map((t) => ({ ...t })) })}>
          Restore defaults
        </button>
      </div>
    </div>
  );
};

const SourceEditor = ({
  value,
  onChange,
  catalog,
  onCatalogChange,
}: {
  value: SourceSettings;
  onChange: (next: SourceSettings) => void;
  catalog: CatalogSettings;
  onCatalogChange: (next: CatalogSettings) => void;
}) => {
  const def: LookupTableDef = LOOKUP_DEFS.cmdb;
  const demo = useDemoMode();
  const [detect, setDetect] = useState(false);
  const pathError = validateSourcePath(value.path);
  const { columns, error, isLoading } = useDetectedColumns(value.path.trim(), detect && !demo && !pathError);
  const windowError = /^\d+[hd]$/.test(value.window.trim()) ? null : 'Use a number of hours or days, e.g. "24h" or "7d".';

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Your application data</div>
      <div style={{ fontSize: 12, color: muted, margin: "2px 0 12px" }}>
        The lookup table you supply, with one row per application. The "Build /lookups/dtsrepoweredapp/cmdb" workflow reads it, maps your
        columns to the ones below, keeps only the applications that have live entities in this tenant, and writes the result to
        <code> {def.defaultPath}</code>, which feeds the application selector, profile banner and leaderboard. Your table is never modified.
      </div>

      <label htmlFor="source-path" style={{ fontSize: 12, fontWeight: 700 }}>Your lookup table</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          id="source-path"
          style={inputStyle}
          value={value.path}
          placeholder="/lookups/my_applications"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange({ ...value, path: e.target.value })}
        />
        <button
          style={{ ...buttonStyle(false, demo || !!pathError), whiteSpace: "nowrap" }}
          disabled={demo || !!pathError}
          title={demo ? "Turn off demo mode to read your tenant's lookup tables" : "Read the table and suggest its column names"}
          onClick={() => setDetect(true)}
        >
          {isLoading ? "Reading…" : "Detect columns"}
        </button>
      </div>
      <ErrorText msg={value.path.trim() ? pathError : null} />
      {detect && error && <ErrorText msg={`Couldn't read this table: ${error.message ?? "unknown error"}`} />}
      {detect && !error && !isLoading && columns.length > 0 && (
        <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>Found {columns.length} columns. Use the ▾ button next to a column box to pick one.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(200px, 1.4fr) minmax(120px, 0.8fr)", gap: "10px 16px", marginTop: 14, alignItems: "start" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase" }}>App needs</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase" }}>Your column</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase" }}>Shown in app as</div>
        {Object.entries(def.fields).map(([fieldKey, f]) => {
          const colValue = value.columns[fieldKey] ?? "";
          const err = validateColumn(colValue, f.optional);
          return (
            <React.Fragment key={fieldKey}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {f.label}
                  {!f.optional && <span style={{ color: "#C4233B" }}> *</span>}
                </div>
                <div style={{ fontSize: 11, color: muted }}>{f.hint}</div>
              </div>
              <div>
                <ColumnInput
                  label={`${f.label} column in your table`}
                  columns={columns}
                  value={colValue}
                  placeholder={f.optional ? "(none)" : "your column"}
                  onChange={(v) => onChange({ ...value, columns: { ...value.columns, [fieldKey]: v } })}
                />
                <ErrorText msg={err} />
              </div>
              {f.display ? (
                <input
                  aria-label={`${f.label} display label`}
                  style={{ ...inputStyle, fontFamily: "inherit" }}
                  placeholder={f.display.label}
                  value={catalog.labels[fieldKey] ?? ""}
                  onChange={(e) => onCatalogChange({ ...catalog, labels: { ...catalog.labels, [fieldKey]: e.target.value } })}
                />
              ) : (
                <div />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <label htmlFor="source-window" style={{ fontSize: 12, fontWeight: 700 }}>An application counts as live if it was seen in the last</label>
        <input
          id="source-window"
          style={{ ...inputStyle, maxWidth: 120, display: "block", marginTop: 4 }}
          value={value.window}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange({ ...value, window: e.target.value })}
        />
        <ErrorText msg={windowError} />
        {!windowError && <div style={{ fontSize: 12, marginTop: 4, color: muted }}>Hours or days, e.g. 24h or 7d. Widen it to keep applications that report less often.</div>}
      </div>

      <CatalogOptions catalog={catalog} onChange={onCatalogChange} columns={columns} />
    </div>
  );
};

export const SettingsPage = () => {
  const [tagKeysText, setTagKeysText] = useState(APP_ID_TAG_KEYS.join(", "));
  const [label, setLabel] = useState(APP_ID_LABEL);
  const [cloudTag, setCloudTag] = useState(CLOUD_TAG_OVERRIDE);
  const [idMax, setIdMax] = useState(String(APP_ID_MAX_LENGTH));
  const [companyName, setCompanyName] = useState(COMPANY_NAME);
  const [logoUrl, setLogoUrl] = useState(COMPANY_LOGO_URL);
  const [source, setSource] = useState<SourceSettings>(() => structuredClone(SOURCE_SETTINGS));
  const [catalog, setCatalog] = useState<CatalogSettings>(() => structuredClone(CATALOG_SETTINGS));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);

  const rawKeys = tagKeysText.split(",").map((k) => k.trim()).filter(Boolean);
  const tagKeys = parseTagKeys(tagKeysText);
  const badKey = rawKeys.map((k) => ({ k, err: validateTagKey(k) })).find((x) => x.err);
  const tagKeysError = !rawKeys.length ? "Enter at least one tag key." : badKey ? `"${badKey.k}": ${badKey.err}` : null;
  const logoError = validateCompanyLogoUrl(logoUrl);
  const sourceFields = Object.entries(LOOKUP_DEFS.cmdb.fields as Record<string, { optional?: boolean }>);
  const sourceValid =
    !validateSourcePath(source.path) &&
    /^\d+[hd]$/.test(source.window.trim()) &&
    sourceFields.every(([f, d]) => !validateColumn(source.columns[f] ?? "", d.optional));
  const catalogValid =
    catalog.extras.every((e) => e.label.trim() && !validateColumn(e.column, false)) && catalog.tiers.every((t) => t.value.trim());
  const cloudTagError = cloudTag.trim() ? validateTagKey(cloudTag) : null;
  const idMaxError = normalizeIdMaxLength(idMax) === Number(idMax.trim()) && idMax.trim() !== "" ? null : "Enter a whole number from 1 to 64.";
  const valid = !tagKeysError && !cloudTagError && !idMaxError && !logoError && sourceValid && catalogValid;
  const dirty =
    SHARED_CONFIG_STATE.state !== "saved" ||
    tagKeys.join(",") !== APP_ID_TAG_KEYS.join(",") ||
    cloudTag.trim() !== CLOUD_TAG_OVERRIDE ||
    normalizeIdMaxLength(idMax) !== APP_ID_MAX_LENGTH ||
    (companyName.trim() || DEFAULT_COMPANY_NAME) !== COMPANY_NAME ||
    logoUrl.trim() !== COMPANY_LOGO_URL ||
    (label.trim() || DEFAULT_APP_ID_LABEL) !== APP_ID_LABEL ||
    JSON.stringify(source) !== JSON.stringify(SOURCE_SETTINGS) ||
    JSON.stringify(catalog) !== JSON.stringify(CATALOG_SETTINGS);

  const demo = useDemoMode();
  const onSave = async () => {
    if (!valid || saving) return;
    if (demo) {
      setSaveError("Saving is disabled in demo mode. Turn Demo off to save settings to your tenant.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const cleanSource: SourceSettings = {
        path: source.path.trim(),
        window: source.window.trim(),
        columns: Object.fromEntries(Object.entries(source.columns).map(([k, v]) => [k, v.trim()])),
      };
      const rows = settingsToRows({
        tagKeys,
        cloudTagKey: cloudTag.trim(),
        idMaxLength: normalizeIdMaxLength(idMax),
        appIdLabel: label.trim() || DEFAULT_APP_ID_LABEL,
        companyName: companyName.trim() || DEFAULT_COMPANY_NAME,
        companyLogoUrl: logoUrl.trim(),
        source: cleanSource,
        catalog,
      });
      const res = await functions.call("saveLookup", { data: { table: "config", rows } });
      await res.json();
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/permission|storage:files:write|403|401/i.test(msg)) setNoPermission(true);
      setSaveError(msg);
      setSaving(false);
    }
  };

  const readOnly = noPermission;
  const saveDisabled = !valid || !dirty || saving || readOnly;

  return (
    <div style={{ maxWidth: 820, padding: 24 }}>
      <h2 style={{ margin: "0 0 4px" }}>Settings</h2>
      <p style={{ marginTop: 0, color: muted }}>
        Tell the app how your organization identifies an application in Dynatrace and where your application data lives. Settings are
        stored in <code>{SHARED_CONFIG_PATH}</code>, so every user and every DT-SRE APP workflow sees the same ones.
      </p>

      {SHARED_CONFIG_STATE.state === "missing" && (
        <div role="status" style={{ ...cardStyle, borderColor: "#B7791F", background: "rgba(183,121,31,0.10)" }}>
          <strong>No settings are saved on this tenant yet.</strong> The values below are defaults. Fill them in and Save to create <code>{SHARED_CONFIG_PATH}</code>
          (this needs permission to write lookup tables, <code>storage:files:write</code>). The workflows stop with an error until it exists.
        </div>
      )}
      {SHARED_CONFIG_STATE.state === "unreadable" && (
        <div role="alert" style={{ ...cardStyle, borderColor: "#C4233B", background: "rgba(196,35,59,0.10)" }}>
          <strong>The saved settings could not be read:</strong> {SHARED_CONFIG_STATE.error ?? "unknown error"}. The values below are defaults; do not save until this is resolved.
        </div>
      )}
      {readOnly && (
        <div role="alert" style={{ ...cardStyle, borderColor: "#C4233B", background: "rgba(196,35,59,0.10)" }}>
          <strong>You can view these settings but not change them.</strong> Saving needs permission to write lookup tables (<code>storage:files:write</code>).
          Ask a Dynatrace administrator to change them, or to give you that permission.
        </div>
      )}

      <h3 style={{ margin: "24px 0 8px" }}>Organization</h3>
      <div style={cardStyle}>
        <label htmlFor="company-name" style={{ display: "block", fontWeight: 700, marginBottom: 4 }}>
          Company name
        </label>
        <input
          id="company-name"
          style={{ ...inputStyle, maxWidth: 420, fontFamily: "inherit" }}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          autoComplete="off"
        />
        <div style={{ fontSize: 12, marginTop: 4, color: muted }}>
          Shown on the landing page and the maturity leaderboard. Default: {DEFAULT_COMPANY_NAME}.
        </div>

        <label htmlFor="company-logo" style={{ display: "block", fontWeight: 700, margin: "16px 0 4px" }}>
          Landing-page logo (optional)
        </label>
        <input
          id="company-logo"
          style={inputStyle}
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="(none)"
        />
        <ErrorText msg={logoError} />
        {!logoError && (
          <div style={{ fontSize: 12, marginTop: 4, color: muted }}>
            Faint background image on the landing page: a path under the app&apos;s assets (e.g. ./assets/logo.png), an https:// URL, or blank for none.
          </div>
        )}
      </div>

      <h3 style={{ margin: "24px 0 8px" }}>Application identifier</h3>
      <div style={cardStyle}>
        <label htmlFor="appId-tag-keys" style={{ display: "block", fontWeight: 700, marginBottom: 4 }}>
          Entity tag keys that carry the {label.trim() || APP_ID_LABEL}
        </label>
        <input
          id="appId-tag-keys"
          style={{ ...inputStyle, maxWidth: 420 }}
          value={tagKeysText}
          onChange={(e) => setTagKeysText(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder={DEFAULT_TAG_KEY}
        />
        <div style={{ fontSize: 12, marginTop: 4, color: tagKeysError ? "#C4233B" : muted }}>
          {tagKeysError ??
            `Separate several keys with commas. An entity tagged "${tagKeys[0] ?? DEFAULT_TAG_KEY}:abc" belongs to application abc, and the same goes for each other key you list. The values must be the same IDs your application data uses.`}
        </div>

        <label htmlFor="appId-cloud-tag" style={{ display: "block", fontWeight: 700, margin: "16px 0 4px" }}>
          Cloud resource tag key (optional)
        </label>
        <input
          id="appId-cloud-tag"
          style={{ ...inputStyle, maxWidth: 420 }}
          value={cloudTag}
          onChange={(e) => setCloudTag(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder={`(auto: ${tagKeys[0] ?? APP_ID_CLOUD_TAG})`}
        />
        <ErrorText msg={cloudTagError} />
        {!cloudTagError && (
          <div style={{ fontSize: 12, marginTop: 4, color: muted }}>
            The tag key on your AWS / Azure / GCP resources and Site Reliability Guardians. Unlike entity tags it is case-sensitive, so use it exactly as
            it appears (e.g. <code>UTAN</code>). Leave blank to use the first tag key.
          </div>
        )}

        <label htmlFor="appId-max-length" style={{ display: "block", fontWeight: 700, margin: "16px 0 4px" }}>
          Longest {label.trim() || APP_ID_LABEL} (characters)
        </label>
        <input
          id="appId-max-length"
          style={{ ...inputStyle, maxWidth: 120 }}
          value={idMax}
          onChange={(e) => setIdMax(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
        />
        <ErrorText msg={idMaxError} />
        {!idMaxError && (
          <div style={{ fontSize: 12, marginTop: 4, color: muted }}>
            Values longer than this are ignored as noise when listing applications and scoring them. Set it to your longest ID (e.g. 5 for five-digit numbers).
          </div>
        )}

        <label htmlFor="appId-label" style={{ display: "block", fontWeight: 700, margin: "16px 0 4px" }}>
          Display label
        </label>
        <input
          id="appId-label"
          style={{ ...inputStyle, maxWidth: 420, fontFamily: "inherit" }}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoComplete="off"
        />
        <div style={{ fontSize: 12, marginTop: 4, color: muted }}>Name shown for the identifier in the header selector. Default: {DEFAULT_APP_ID_LABEL}.</div>
      </div>

      <h3 style={{ margin: "24px 0 4px" }}>Application catalog</h3>
      <p style={{ marginTop: 0, fontSize: 13, color: muted }}>
        All other lookup tables are written by the workflows or the Lookups tab, in <code>/lookups/dtsrepoweredapp/</code> with fixed columns.
      </p>
      <SourceEditor value={source} onChange={setSource} catalog={catalog} onCatalogChange={setCatalog} />

      {saveError && !noPermission && (
        <div role="alert" style={{ fontSize: 13, color: "#C4233B", margin: "0 0 10px" }}>
          Could not save: {saveError}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={buttonStyle(true, saveDisabled)} disabled={saveDisabled} onClick={() => void onSave()}>
          {saving ? "Saving…" : "Save & reload"}
        </button>
        <button
          style={buttonStyle(false)}
          onClick={() => {
            setTagKeysText(DEFAULT_TAG_KEY);
            setLabel(DEFAULT_APP_ID_LABEL);
            setCloudTag("");
            setCompanyName(DEFAULT_COMPANY_NAME);
            setLogoUrl(DEFAULT_COMPANY_LOGO_URL);
            setSource(defaultSourceSettings());
            setCatalog(defaultCatalogSettings());
          }}
        >
          Restore defaults in form
        </button>
      </div>
      <p style={{ fontSize: 12, marginTop: 16, color: muted }}>
        Queries are built when the app loads, so saving reloads the page. After changing the tag keys or the application data, run the
        "Build /lookups/dtsrepoweredapp/cmdb" workflow to rebuild the catalog; the other workflows read these settings each time they run.
      </p>
    </div>
  );
};
