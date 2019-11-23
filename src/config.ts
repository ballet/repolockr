import { ReposGetContentsResponse } from "@octokit/rest";
import yaml from "js-yaml";
import path from "path";
import { Context } from "probot";
import { atos, getPullRequest } from "./util";

const CONFIG_PATH = path.posix.join(".github", "repolockr.yml");
const DEFAULT_CONFIG_REFERENCE = "master";

export interface IRepolockrConfig {
  lock?: string[];
  branches?: {
    allow?: string[];
  };
}

async function getBaseReference(context: Context): Promise<string> {
  const pullRequest = getPullRequest(context);
  return pullRequest.base.sha;
}

type ReposGetContentsResponseFile =
  | {
      type: string;
      content?: string;
      encoding?: string;
    }
  & ReposGetContentsResponse;

export async function loadConfig(context: Context, ref?: string): Promise<IRepolockrConfig> {
  /* load config from base:.github/repolockr.yml or default to master */
  if (!ref) {
    try {
      ref = await getBaseReference(context);
    } catch (err) {
      ref = DEFAULT_CONFIG_REFERENCE;
    }
  }

  const response = await context.github.repos.getContents(context.repo({ path: CONFIG_PATH, ref }));
  const content = (response.data as ReposGetContentsResponseFile).content;
  try {
    return yaml.safeLoad(atos(content)) || {}
  } catch (err) {
    context.log.error("Unexpected result for repolockr config file");
    return {};
  }
}
