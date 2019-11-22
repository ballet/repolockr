import { Application, Context } from 'probot'; // eslint-disable-line no-unused-vars
import { loadConfig, RepolockrConfig } from './config';

export = (app: Application) => {
  app.on('check_suite.requested', async (context) => {
    app.log.info('Responding to check_suite.requested');
    const timeStart = new Date(Date.now());

    if (!isCheckSuiteOnPullRequest(context)) {
      app.log.info(`Exiting - commit is not on pull request`);
      return;
    }

    // check if check run is needed
    const config = await loadConfig(context);
    const result = shouldRunCheck(context, config);
    if (!result.run) {
      app.log.info(`Exiting - should not run check (${result.reason})`);
      return;
    }

    // immediately create in-progress check run
    const { id: check_run_id } = await createCheckRun(context, { timeStart });
    app.log.info(`Created checkrun ${check_run_id}`);

    // get list of files modified by pr
    const lockList = config.lock!;
    const modifiedFiles = await getChangeList(context);
    const improperModifications = modifiedFiles.filter(f => lockList.includes(f));
    let options: any;
    const report = createCheckRunOutputReport(improperModifications);
    completeCheckRun(context, check_run_id, report);
  })
}

function createCheckRunOutputReport(improperModifications: string[]): any {
  const n = improperModifications.length;
  let conclusion: string;
  const title = 'repolockr report';
  let output: any;
  if (n==0) {
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

async function completeCheckRun(context: Context, id: number, options: any) {
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
  // 1. not on pull request
  if (!(context.payload.pull_requests && context.payload.pull_requests.length)) {
    return { run: false, reason: 'commit not part of pull request' };
  }

  // 2. on greenlisted branch
  const greenList = config.branches?.allow;
  const pullRequestBranch = context.payload.pull_requests[0].head.ref;
  if (greenList && greenList.includes(pullRequestBranch)) {
    return { run: false, reason: 'pull request branch is explicitly allowed' };
  };

  // 3. no lock list or lock list is empty
  const lockList = config.lock;
  if (!lockList || lockList.length == 0) {
    return { run: false, reason: 'no lock list set' };
  }

  return { run: true };
}

async function getChangeList(context: Context): Promise<string[]> {
  // see https://developer.github.com/v3/pulls/#list-pull-requests-files
  const pullRequestNumber = getPullRequestNumber(context);
  const response = await context.github.pulls.listFiles(context.repo({ pull_number: pullRequestNumber }));
  const files: string[] = response.data.map(o => o.filename);
  return files;
}


function isCheckSuiteOnPullRequest(context: Context): boolean {
  return context.payload.pull_requests && context.payload.pull_requests.length;
}

function getPullRequestNumber(context: Context): number {
  return context.payload.pull_requests[0].number;
}
