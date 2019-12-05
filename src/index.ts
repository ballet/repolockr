import { ChecksUpdateResponse } from "@octokit/rest";
import express from "express";
import { Application, Context } from "probot"; // eslint-disable-line no-unused-vars
import { IRepolockrConfig, loadConfig } from "./config";
import { getPullRequest } from "./util";

export = (app: Application) => {
  // Status check
  const router = app.route("/repolockr");
  router.use(express.static("public"));
  router.get("/statusz", (req, res) => {
    res.send("OK");
  });

  // Probot
  app.on(["pull_request.opened", "pull_request.synchronize"], async (context) => {
    context.log.info(`Responding to ${context.event}`);
    const timeStart = new Date(Date.now());

    // check if check run is needed
    const config = await loadConfig(context);
    const { run: shouldRun, reason } = shouldRunCheck(context, config);
    if (!shouldRun) {
      context.log.info(`Exiting - should not run check (${reason})`);
      return;
    }

    // immediately create in-progress check run
    const { id: checkRunId } = await createCheckRun(context, { timeStart });
    context.log.info(`Created checkrun ${checkRunId}`);
  });

  app.on(["check_run.created", "check_run.rerequested"], async (context) => {

    context.log.info(`Responding to ${context.event}`);
    const config = await loadConfig(context);
    const checkRunId = context.payload.check_run.id;

    let report: any;
    if (!config || !config.lock || config.lock.length === 0) {
      // something went wrong with the configuration
      report = {
        conclusion: "neutral",
        output: {
          summary: "The configured list of locked files could not be determined",
          title: "repolockr report",
        },
      };
    } else {
      // get list of files modified by pr
      const modifiedFiles = await getChangedFiles(context);

      // check for improper modifications
      const lockList = config.lock!;
      const improperModifications = modifiedFiles
        .filter((f) => lockList.includes(f));

      // create report
      report = createCheckRunOutputReport(improperModifications);
    }

    // update check run
    const { status, conclusion } = await completeCheckRun(context, checkRunId, report);
    context.log.info(`Updated checkrun ${checkRunId}: status=${status}, conclusion=${conclusion}`);
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
      summary = "There was 1 locked file that was modified";
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
    head_sha: getPullRequest(context).head.sha,
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

async function getChangedFiles(context: Context): Promise<string[]> {
  const pullRequestNumber = getPullRequest(context).number;
  const response = await context.github.pulls.listFiles(context.repo({ pull_number: pullRequestNumber }));
  const files: string[] = response.data.map((o) => o.filename);
  return files;
}
