import { Context } from "probot";
import * as util from "util";

export function atos(s: string | undefined): string {
  if (!s) {
    return "";
  } else {
    return Buffer.from(s, "base64").toString("utf-8");
  }
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
