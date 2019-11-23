import { Application, Context } from 'probot'; // eslint-disable-line no-unused-vars
import { loadConfig, RepolockrConfig } from './config';
import { ChecksUpdateResponse } from '@octokit/rest';

export = (app: Application) => {
  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {
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
    const { id: check_run_id } = await createCheckRun(context, { timeStart });
    app.log.info(`Created checkrun ${check_run_id}`);

    // get list of files modified by pr
    const lockList = config.lock!;
    const modifiedFiles = await getChangedFiles(context);
    const improperModifications = modifiedFiles
      .filter(f => lockList.includes(f));
    const report = createCheckRunOutputReport(improperModifications);
    const { status, conclusion } = await completeCheckRun(context, check_run_id, report);
    app.log.info(`Updated checkrun ${check_run_id}: status=${status}, conclusion=${conclusion}`);
  })
}

function createCheckRunOutputReport(improperModifications: string[]): any {
  const n = improperModifications.length;
  let conclusion: string;
  const title = 'repolockr report';
  let output: any;
  if (n == 0) {
    conclusion = 'success';
    output = {
      title: title,
      summary: 'OK'
    }
  } else {
    let text = 'The following locked files were modified:'
    for (let file of improperModifications) {
      text += `\n  ${file}`;
    }
    conclusion = 'failure';
    output = {
      title: title,
      summary: `There were ${n} locked files that were modified`,
      text: text
    }
  }
  return {
    conclusion: conclusion,
    output: output
  }
}

interface CreateCheckRunOptions {
  timeStart?: Date;
}

async function createCheckRun(context: Context, options: CreateCheckRunOptions) {
  const response = await context.github.checks.create(context.issue({
    name: 'repolockr',
    head_sha: context.payload.pull_request.head.sha,
    status: 'in_progress',
    ...options
  }));
  return response.data;
}

async function completeCheckRun(context: Context, id: number, options: any): Promise<ChecksUpdateResponse> {
  const endTime = new Date(Date.now());
  const response = await context.github.checks.update(context.repo({
    check_run_id: id,
    status: "completed",
    completed_at: endTime,
    ...options
  }));
  return response.data;
}

function shouldRunCheck(context: Context, config: RepolockrConfig): { run: boolean, reason?: string } {
  // reasons to not run
  // 1. on greenlisted branch
  const greenList = config.branches?.allow;
  const pullRequestBranch = context.payload.pull_request.head.ref;
  if (greenList && greenList.includes(pullRequestBranch)) {
    return { run: false, reason: 'pull request branch is explicitly allowed' };
  };

  // 2. no lock list or lock list is empty
  const lockList = config.lock;
  if (!lockList || lockList.length == 0) {
    return { run: false, reason: 'no lock list set' };
  }

  return { run: true };
}

async function getChangedFiles(context: Context): Promise<string[]> {
  const pullRequestNumber = getPullRequestNumber(context);
  const response = await context.github.pulls.listFiles(context.repo({ pull_number: pullRequestNumber }));
  const files: string[] = response.data.map(o => o.filename);
  return files;
}


function getPullRequestNumber(context: Context): number {
  return context.payload.pull_request.number;
}
