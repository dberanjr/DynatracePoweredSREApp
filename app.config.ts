import type { CliConfig } from "@dynatrace/app-toolkit/cli-config";

const config: CliConfig = {
  environmentUrl: "https://YOUR_TENANT.apps.dynatrace.com",
  app: {
    name: "DynatraceSREMaturityApp",
    version: "1.0.0",
    description: "SRE Maturity Assessment — application-level reliability intelligence",
    id: "my.dynatrace.sre.maturity.app",
    scopes: [
      { name: "storage:logs:read", comment: "Read log data" },
      { name: "storage:events:read", comment: "Read events" },
      { name: "storage:bizevents:read", comment: "Read business events" },
      { name: "storage:metrics:read", comment: "Read metrics" },
      { name: "storage:entities:read", comment: "Read entities" },
      { name: "environment-api:entities:read", comment: "Read entity data" },
      { name: "storage:buckets:read", comment: "Read lookup tables" },
      { name: "davis:problems:read", comment: "Read Davis problems" },
      { name: "smartscape:read", comment: "Read Smartscape topology" },
    ],
  },
  icon: "./src/assets/logo.png",
};

export default config;
