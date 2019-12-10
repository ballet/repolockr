import { Context } from "probot";
import * as util from "util";
import { IRepolockrConfig } from "./config";

export function shouldRunCheck(context: Context, config: IRepolockrConfig): { run: boolean, reason?: string } {
  // note: can only get pull request branch from pull_request.opened (and similar) events
  // reasons to not run
  // 1. on greenlisted branch
  const greenList = config.branches?.allow;
  const pullRequestBranch = getPullRequest(context).head.ref;
  if (greenList && greenList.includes(pullRequestBranch)) {
    return { run: false, reason: "pull request branch is explicitly allowed" };
  }

  // 2. no lock list or lock list is empty
  const lockList = config.lock;
  if (!lockList || !lockList.length) {
    return { run: false, reason: "no lock list set" };
  }

  return { run: true };
}

function encodePullRequestInfo(context: Context): string {
  // note: can only get pull request branch from pull_request.opened (and similar) events
  const pullRequest = getPullRequest(context);
  const headSha = pullRequest.head.sha;
  const baseSha = pullRequest.base.sha;
  const pullNumber = pullRequest.number;
  return `${headSha}:${baseSha}:${pullNumber}`;
}
export async function createCheckRun(context: Context) {
  const response = await context.github.checks.create(context.issue({
    external_id: encodePullRequestInfo(context),
    head_sha: context.payload.pull_request.head.sha,
    name: "repolockr",
    status: "queued",
  }));
  return response.data;
}

export function getPullRequest(context: Context) {
  if (context.event.startsWith("pull_request")) {
    return context.payload.pull_request;
  } else if (context.event.startsWith("check_run")) {
    const pullRequests = context.payload.check_run.pull_requests;
    if (!pullRequests || pullRequests.length === 0) {
      const payload = util.inspect(context.payload);
      context.log.error(`Missing pull requests: ${payload}`);
      throw new Error("Missing pull requests");
    } else if (pullRequests.length === 1) {
      return pullRequests[0];
    } else {
      context.log.warn("Don't know what to do with multiple pull requests");
      return pullRequests[0];
    }
  } else {
    throw new Error("Unexpected event: ${context.event}");
  }
}
