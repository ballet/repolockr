import { ReposGetContentsResponse } from "@octokit/rest";
import yaml from "js-yaml";
import path from "path";
import { Context } from "probot";
import { atos } from "./util";

const CONFIG_PATH = path.posix.join(".github", "repolockr.yml");
const DEFAULT_CONFIG_BRANCH = "master";

export interface IRepolockrConfig {
  lock?: string[];
  branches?: {
    allow?: string[];
  };
}

async function getDefaultBranch(context: Context): Promise<string> {
  return context.payload.repository.default_branch || DEFAULT_CONFIG_BRANCH;
}

type ReposGetContentsResponseFile =
  | {
      type: string;
      content?: string;
      encoding?: string;
    }
  & ReposGetContentsResponse;

export async function loadConfig(context: Context): Promise<IRepolockrConfig> {
  /* load config from master:.github/repolockr.yml */
  const ref = await getDefaultBranch(context);
  const response = await context.github.repos.getContents(context.repo({ path: CONFIG_PATH, ref }));
  const content = (response.data as ReposGetContentsResponseFile).content;
  try {
    return yaml.safeLoad(atos(content)) || {};
  } catch (err) {
    context.log.error("Unexpected result for repolockr config file");
    return {};
  }
}
