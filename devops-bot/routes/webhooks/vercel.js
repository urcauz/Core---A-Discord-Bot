const express = require('express');
const {
  validateVercelSignature,
  sendWebhookEmbed,
  logWebhookSummary,
  formatCommitShort,
  createStandardEmbed
} = require('../../services/webhookService');

function parseBody(rawBuffer) {
  try {
    return JSON.parse(rawBuffer.toString('utf8'));
  } catch {
    return null;
  }
}

function extractEnvironment(payload) {
  const target = payload?.target || payload?.environment || payload?.deployment?.target;
  if (String(target).toLowerCase() === 'production') return 'Production';
  return 'Preview';
}

function extractState(payload) {
  return payload?.state || payload?.deployment?.state || payload?.type || 'UNKNOWN';
}

function extractCommitMessage(payload) {
  return (
    payload?.meta?.githubCommitMessage ||
    payload?.deployment?.meta?.githubCommitMessage ||
    payload?.commit?.message ||
    'N/A'
  );
}

function createVercelWebhookRouter(client) {
  const router = express.Router();

  router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.VERCEL_WEBHOOK_SECRET;
    const rawBody = req.body;

    if (!validateVercelSignature(rawBody, req.headers, secret)) {
      console.warn('[webhook/vercel] Invalid signature.');
      return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const payload = parseBody(rawBody);
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
    }

    const state = String(extractState(payload)).toUpperCase();
    const projectName = payload?.name || payload?.project?.name || payload?.deployment?.name || 'N/A';
    const environment = extractEnvironment(payload);
    const commitSha =
      payload?.meta?.githubCommitSha ||
      payload?.deployment?.meta?.githubCommitSha ||
      payload?.commit?.sha ||
      'N/A';
    const deploymentUrl = payload?.url
      ? `https://${payload.url.replace(/^https?:\/\//, '')}`
      : payload?.deployment?.url || null;
    const triggeredBy = payload?.creator?.username || payload?.user?.username || 'Vercel';

    console.log(`[webhook/vercel] Event received with state: ${state}`);

    try {
      const isReady = state === 'READY';
      const isError = state === 'ERROR';

      if (!isReady && !isError) {
        await logWebhookSummary(client, `Vercel event ignored: state=${state}`);
        return res.status(200).json({ ok: true, ignored: true });
      }

      const embed = createStandardEmbed({
        title: `Vercel Deployment ${isReady ? 'Ready' : 'Error'}`,
        state: isReady ? 'success' : 'failure',
        eventType: `vercel.${state.toLowerCase()}`,
        service: 'Vercel',
        project: projectName,
        branch: environment,
        commit: formatCommitShort(commitSha),
        triggeredBy,
        url: deploymentUrl,
        extraFields: [
          { name: 'Project Name', value: projectName, inline: true },
          { name: 'Environment', value: environment, inline: true },
          { name: 'Commit', value: formatCommitShort(commitSha), inline: true },
          { name: 'Deployment URL', value: deploymentUrl || 'N/A', inline: false },
          { name: 'Commit Message', value: extractCommitMessage(payload), inline: false }
        ]
      });

      await sendWebhookEmbed(client, {
        channelName: process.env.DEPLOY_LOGS_CHANNEL_NAME || 'deploy-logs',
        embed,
        pingRoleName: isError ? (process.env.DEVOPS_ROLE_NAME || 'DevOps') : undefined
      });

      await logWebhookSummary(
        client,
        `Vercel deployment ${isReady ? 'ready' : 'error'} for ${projectName}.`
      );

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[webhook/vercel] Failed to process event:', error);
      return res.status(500).json({ ok: false, error: 'Internal webhook processing error' });
    }
  });

  return router;
}

module.exports = {
  createVercelWebhookRouter
};
