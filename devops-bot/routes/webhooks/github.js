const express = require('express');
const {
  validateGitHubSignature,
  sendWebhookEmbed,
  logWebhookSummary,
  formatCommitShort,
  createStandardEmbed
} = require('../../services/webhookService');

function parseGitHubBody(rawBuffer) {
  try {
    return JSON.parse(rawBuffer.toString('utf8'));
  } catch {
    return null;
  }
}

function getPrBranch(payload) {
  return payload?.pull_request?.head?.ref || payload?.pull_request?.base?.ref || 'N/A';
}

function getWorkflowBranch(payload) {
  return payload?.workflow_run?.head_branch || payload?.repository?.default_branch || 'N/A';
}

function getWorkflowCommitMessage(payload) {
  const firstCommit = payload?.workflow_run?.head_commit;
  return firstCommit?.message || 'N/A';
}

function createGitHubWebhookRouter(client) {
  const router = express.Router();

  router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signatureHeader = req.headers['x-hub-signature-256'];
    const rawBody = req.body;

    if (!validateGitHubSignature(rawBody, signatureHeader, secret)) {
      console.warn('[webhook/github] Invalid signature.');
      return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const payload = parseGitHubBody(rawBody);
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
    }

    const event = req.headers['x-github-event'];
    const action = payload.action;
    const repoName = payload?.repository?.full_name || payload?.repository?.name || 'N/A';

    console.log(`[webhook/github] Event received: ${event}${action ? ` (${action})` : ''}`);

    try {
      if (event === 'pull_request' && action === 'opened') {
        const embed = createStandardEmbed({
          title: `Pull Request Opened: ${payload.pull_request?.title || 'N/A'}`,
          state: 'pr_opened',
          eventType: 'pull_request.opened',
          service: 'GitHub',
          project: repoName,
          branch: getPrBranch(payload),
          commit: formatCommitShort(payload.pull_request?.head?.sha),
          triggeredBy: payload.pull_request?.user?.login || 'N/A',
          url: payload.pull_request?.html_url,
          extraFields: [
            { name: 'Status', value: 'Opened', inline: true },
            { name: 'Author', value: payload.pull_request?.user?.login || 'N/A', inline: true }
          ]
        });

        await sendWebhookEmbed(client, {
          channelName: process.env.PULL_REQUESTS_CHANNEL_NAME || 'pull-requests',
          embed
        });
        await logWebhookSummary(client, `GitHub PR opened in ${repoName}.`);
      }

      if (event === 'pull_request' && action === 'closed' && payload.pull_request?.merged) {
        const embed = createStandardEmbed({
          title: `Pull Request Merged: ${payload.pull_request?.title || 'N/A'}`,
          state: 'success',
          eventType: 'pull_request.merged',
          service: 'GitHub',
          project: repoName,
          branch: getPrBranch(payload),
          commit: formatCommitShort(payload.pull_request?.merge_commit_sha),
          triggeredBy: payload.pull_request?.merged_by?.login || 'N/A',
          url: payload.pull_request?.html_url,
          extraFields: [{ name: 'Status', value: 'Merged', inline: true }]
        });

        await sendWebhookEmbed(client, {
          channelName: process.env.PULL_REQUESTS_CHANNEL_NAME || 'pull-requests',
          embed
        });
        await logWebhookSummary(client, `GitHub PR merged in ${repoName}.`);
      }

      if (event === 'push') {
        const headCommit = payload.head_commit || {};
        const embed = createStandardEmbed({
          title: `Push: ${headCommit.message || 'Commit pushed'}`,
          state: 'in_progress',
          eventType: 'push',
          service: 'GitHub',
          project: repoName,
          branch: String(payload.ref || 'N/A').replace('refs/heads/', ''),
          commit: formatCommitShort(headCommit.id || payload.after),
          triggeredBy: payload.pusher?.name || payload.sender?.login || 'N/A',
          url: payload.compare,
          extraFields: [{ name: 'Commit Message', value: headCommit.message || 'N/A' }]
        });

        await sendWebhookEmbed(client, {
          channelName: process.env.DEPLOY_LOGS_CHANNEL_NAME || 'deploy-logs',
          embed
        });
        await logWebhookSummary(client, `GitHub push received for ${repoName}.`);
      }

      if (event === 'workflow_run' && action === 'completed') {
        const conclusion = payload.workflow_run?.conclusion;
        const isFailed = conclusion === 'failure';
        const isSuccess = conclusion === 'success';

        if (isFailed || isSuccess) {
          const embed = createStandardEmbed({
            title: `Workflow ${isFailed ? 'Failed' : 'Succeeded'}: ${payload.workflow_run?.name || 'N/A'}`,
            state: isFailed ? 'failure' : 'success',
            eventType: 'workflow_run',
            service: 'GitHub Actions',
            project: repoName,
            branch: getWorkflowBranch(payload),
            commit: formatCommitShort(payload.workflow_run?.head_sha),
            triggeredBy: payload.workflow_run?.actor?.login || 'N/A',
            url: payload.workflow_run?.html_url,
            extraFields: [
              { name: 'Workflow Name', value: payload.workflow_run?.name || 'N/A', inline: true },
              { name: 'Commit Message', value: getWorkflowCommitMessage(payload), inline: false }
            ]
          });

          await sendWebhookEmbed(client, {
            channelName: process.env.DEPLOY_LOGS_CHANNEL_NAME || 'deploy-logs',
            embed,
            pingRoleName: isFailed ? (process.env.DEVOPS_ROLE_NAME || 'DevOps') : undefined
          });

          await logWebhookSummary(
            client,
            `GitHub workflow ${isFailed ? 'failed' : 'succeeded'} for ${repoName}.`
          );
        }
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[webhook/github] Failed to process event:', error);
      return res.status(500).json({ ok: false, error: 'Internal webhook processing error' });
    }
  });

  return router;
}

module.exports = {
  createGitHubWebhookRouter
};
