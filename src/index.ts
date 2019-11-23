import { ChecksUpdateResponse } from "@octokit/rest";
import { Application, Context } from "probot"; // eslint-disable-line no-unused-vars
import { IRepolockrConfig, loadConfig } from "./config";

export = (app: Application) => {
  app.on(["pull_request.opened", "pull_request.synchronize"], async (context) => {
    app.log.info(`Responding to ${context.event}`);
    const timeStart = new Date(Date.now());

    // check if check run is needed
    const config = await loadConfig(context);
    const { run: shouldRun, reason } = shouldRunCheck(context, config);
    if (!shouldRun) {
      app.log.info(`Exiting - should not run check (${reason})`);
      return;
    }

    // immediately create in-progress check run
    const { id: checkRunId } = await createCheckRun(context, { timeStart });
    app.log.info(`Created checkrun ${checkRunId}`);

    // get list of files modified by pr
    const lockList = config.lock!;
    const modifiedFiles = await getChangedFiles(context);
    const improperModifications = modifiedFiles
      .filter((f) => lockList.includes(f));
    const report = createCheckRunOutputReport(improperModifications);
    const { status, conclusion } = await completeCheckRun(context, checkRunId, report);
    app.log.info(`Updated checkrun ${checkRunId}: status=${status}, conclusion=${conclusion}`);
  });
};

function createCheckRunOutputReport(improperModifications: string[]): any {
  const n = improperModifications.length;

  let output: any;
  const title = "repolockr report";
  let conclusion: string;

  if (n === 0) {
    conclusion = "success";
    output = {
      summary: "OK",
      title,
    };
  } else {
    let text = "The following locked files were modified:";
    for (const file of improperModifications) {
      text += `\n- ${file}`;
    }
    conclusion = "failure";
    let summary: string;
    if (n === 1) {
      summary = 'There was 1 locked file that was modified';
    } else {
      summary = `There were ${n} locked files that were modified`;
    }
    output = {
      summary,
      text,
      title,
    };
  }

  return {
    conclusion,
    output,
  };
}

interface ICreateCheckRunOptions {
  timeStart?: Date;
}

async function createCheckRun(context: Context, options: ICreateCheckRunOptions) {
  const response = await context.github.checks.create(context.issue({
    head_sha: context.payload.pull_request.head.sha,
    name: "repolockr",
    status: "in_progress",
    ...options,
  }));
  return response.data;
}

async function completeCheckRun(context: Context, id: number, options: any): Promise<ChecksUpdateResponse> {
  const endTime = new Date(Date.now());
  const response = await context.github.checks.update(context.repo({
    check_run_id: id,
    completed_at: endTime,
    status: "completed",
    ...options,
  }));
  return response.data;
}

function shouldRunCheck(context: Context, config: IRepolockrConfig): { run: boolean, reason?: string } {
  // reasons to not run
  // 1. on greenlisted branch
  const greenList = config.branches?.allow;
  const pullRequestBranch = context.payload.pull_request.head.ref;
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

async function getChangedFiles(context: Context): Promise<string[]> {
  const pullRequestNumber = getPullRequestNumber(context);
  const response = await context.github.pulls.listFiles(context.repo({ pull_number: pullRequestNumber }));
  const files: string[] = response.data.map((o) => o.filename);
  return files;
}

function getPullRequestNumber(context: Context): number {
  return context.payload.pull_request.number;
}
