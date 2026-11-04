import type { DemoFixture, DemoFunctionFixture } from "../types";
import { portfolioFixtures } from "./portfolio";
import { scorecardsFixtures, scorecardsFunctionFixtures } from "./scorecards";
import { signalsFixtures } from "./signals";
import { dependenciesFixtures } from "./dependencies";
import { lookupsFixtures } from "./lookups";

// Order = match priority (first match wins). Each area owns its own file;
// put specific matchers before generic ones inside a file.
export const dqlFixtures: DemoFixture[] = [
  ...scorecardsFixtures,
  ...dependenciesFixtures,
  ...portfolioFixtures,
  ...signalsFixtures,
  ...lookupsFixtures,
];
export const functionFixtures: DemoFunctionFixture[] = [...scorecardsFunctionFixtures];
