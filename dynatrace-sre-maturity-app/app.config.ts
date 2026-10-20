import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Local, untracked settings live in .env (see .env.example). dt-app does not
// load .env itself, so parse KEY=VALUE lines here; real env vars (CI) win.
const envFile = join(process.cwd(), ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
}

const environmentUrl = (process.env.DT_ENVIRONMENT_URL ?? "https://YOUR_TENANT.apps.dynatrace.com").replace(/\/+$/, "");

const config = {
  environmentUrl,
  build: {
    dynatraceDependencies: {
      addOrOverride: {
        "/platform/slo/v1": "1.0.0",
      },
    },
  },
  app: {
    name: process.env.APP_NAME ?? "DynatracePoweredSRE",
    // sync-version.mjs reads this literal with a regex — keep it on one line.
    version: "2.70.2",
    description: "Dynatrace-Powered SRE Maturity Assessment App",
    id: "my.dynatrace.sre.maturity.app",
    scopes: [
      { name: "storage:logs:read", comment: "Read log data" },
      { name: "storage:buckets:read", comment: "Read Grail buckets" },
      { name: "storage:files:read", comment: "Read lookup tables (/lookups/*)" },
      { name: "storage:files:write", comment: "Write the app-managed lookup tables (Lookups tab)" },
      { name: "storage:events:read", comment: "Read events" },
      { name: "storage:bizevents:read", comment: "Read business events" },
      { name: "storage:metrics:read", comment: "Read metrics" },
      { name: "storage:entities:read", comment: "Read entity data" },
      { name: "storage:system:read", comment: "Read system tables" },
      { name: "storage:spans:read", comment: "Read distributed trace / span data" },
      { name: "storage:smartscape:read", comment: "Read Smartscape nodes (cloud resource inventory)" },
      { name: "settings:objects:read", comment: "Read Site Reliability Guardian settings objects (live guardian detail)" },
      { name: "document:documents:read", comment: "Read dashboard documents (live SLO dashboard detail)" },
      { name: "iam:users:read", comment: "Resolve dashboard owner user IDs to display names" },
      { name: "slo:slos:read", comment: "Read Gen3 SLOs (live SLO detail + linking)" }
    ],
  },
};

export default config;
