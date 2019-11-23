import { ReposGetContentsResponse } from "@octokit/rest";
import * as yaml from "js-yaml";
import { Context } from "probot";
import { atos } from "./util";

const CONFIG_PATH = ".github/repolockr.yml";
const DEFAULT_CONFIG_REFERENCE = "master";

export interface IRepolockrConfig {
  lock?: string[];
  branches?: {
    allow?: string[];
  };
}

async function getBaseReference(context: Context): Promise<string> {
  return context.payload.pull_request.base.sha;
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
  // TODO check status code
  // TODO check that response is for a single file, not for directory etc.
  const { type, encoding, content } = response.data as ReposGetContentsResponseFile;
  if (type !== "file" || encoding !== "base64") {
    context.log.error("Unexpected result for repolockr config file");
    return {} as IRepolockrConfig;
  }
  return yaml.safeLoad(atos(content)) as IRepolockrConfig;
}
