import fs from "node:fs";
import path from "node:path";

type SeriesState = {
  series: {
    premise: string;
    genre: string[] | string;
    core_promise: string;
    editorial_version: string;
  };
  characters: Record<string, string>;
  global_truth: Record<string, string>;
};

export function readSeriesStateForAdmission(packRoot: string): SeriesState {
  const filePath = path.join(packRoot, "shared/series-state.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as SeriesState;
}
