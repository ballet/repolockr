import { Context } from 'probot';
import * as yaml from 'js-yaml';
import { atos } from './util';
import { ReposGetContentsResponse } from '@octokit/rest';


const CONFIG_PATH = '.github/repolockr.yml';
const DEFAULT_CONFIG_REFERENCE = 'master';

export interface RepolockrConfig {
  lock?: string[];
  branches?: {
    allow?: string[];
  }
}

async function getBaseReference(context: Context): Promise<string> {
  const pullRequests = context.payload.pull_requests;
  if (pullRequests.length == 1) {
    const pullRequest = pullRequests[0];
    return pullRequest.base.sha;
  } else {
    throw new Error();
  }
}

type ReposGetContentsResponseFile =
  | {
      type: string;
      content?: string;
      encoding?: string;
    }
  & ReposGetContentsResponse;

export async function loadConfig(context: Context, ref?: string): Promise<RepolockrConfig> {
  /* load config from base:.github/repolockr.yml or default to master */
  if (!ref) {
    try {
      ref = await getBaseReference(context);
    } catch (err) {
      ref = DEFAULT_CONFIG_REFERENCE;
    }
  }

  const response = await context.github.repos.getContents(context.repo({ path: CONFIG_PATH, ref: ref }));
  // TODO check status code
  // TODO check that response is for a single file, not for directory etc.
  const { type, encoding, content } = response.data as ReposGetContentsResponseFile;
  if (type !== 'file' || encoding !== 'base64') {
    context.log.error('Unexpected result for repolockr config file');
    return {} as RepolockrConfig;
  }
  return yaml.safeLoad(atos(content)) as RepolockrConfig;
}
