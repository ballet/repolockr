import { ChecksUpdateResponse } from "@octokit/rest";
import { Context } from "probot";

function decodePullRequestInfo(externalId: string): any {
  const [headSha, baseSha, pullNumber] = externalId.split(":");
  return { headSha, baseSha, pullNumber };
}

export async function startCheckRun(context: Context, id: number): Promise<ChecksUpdateResponse> {
  const response = await context.github.checks.update(context.repo({
    check_run_id: id,
    started_at: new Date(Date.now()).toISOString(),
    status: "in_progress",
  }));
  return response.data;
}

export async function completeCheckRun(context: Context, id: number, options: any): Promise<ChecksUpdateResponse> {
  const response = await context.github.checks.update(context.repo({
    check_run_id: id,
    completed_at: new Date(Date.now()).toISOString(),
    status: "completed",
    ...options,
  }));
  return response.data;
}

export async function getChangedFiles(context: Context): Promise<string[]> {
  const externalId = context.payload.check_run.external_id;
  const pullRequestNumber = decodePullRequestInfo(externalId);
  const response = await context.github.pulls.listFiles(context.repo({ pull_number: pullRequestNumber }));
  const files: string[] = response.data.map((o) => o.filename);
  return files;
}
