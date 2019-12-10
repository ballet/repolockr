import express from "express";
import { Application, Context } from "probot";
import { completeCheckRun, getChangedFiles, startCheckRun } from "./check_event";
import { loadConfig } from "./config";
import { createCheckRun, shouldRunCheck } from "./pull_request_event";

export = (app: Application) => {
  // Status check
  const router = app.route("/repolockr");
  router.use(express.static("public"));
  router.get("/statusz", (req: any, res: any) => {
    res.send("OK");
  });

  // Probot - pull_request event
  app.on(["pull_request.opened", "pull_request.synchronize"], async (context) => {
    context.log.info(`Responding to ${context.event}`);

    // determine if check run is needed
    const config = await loadConfig(context);
    const { run: shouldRun, reason } = shouldRunCheck(context, config);
    if (!shouldRun) {
      context.log.info(`Exiting - should not run check (${reason})`);
      return;
    }

    // immediately create queued check run
    const { id: checkRunId } = await createCheckRun(context);
    context.log.info(`Created checkrun ${checkRunId}`);
  });

  // Probot - check_run event
  app.on(["check_run.created", "check_run.rerequested"], async (context) => {
    context.log.info(`Responding to ${context.event}`);

    // determine if check run is pertitent to this app
    if (!isCheckRunForMyApp(context)) {
      context.log.debug(`Ignoring check run from different app`);
      return;
    }

    // mark check run as in progress
    const checkRunId = context.payload.check_run.id;
    startCheckRun(context, checkRunId);

    // actually do the check
    const config = await loadConfig(context);
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

function isCheckRunForMyApp(context: Context): boolean {
  // this is a number (see WebhookPayloadCheckSuiteCheckSuiteApp)
  const requestingAppId: number = context.payload.check_run.app.id;
  // this is a string and needs to be converted
  const myAppId: number = Number(process.env.APP_ID);
  return requestingAppId === myAppId;
}

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
