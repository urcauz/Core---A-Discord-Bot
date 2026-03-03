const express = require('express');
const {
  validateRenderSignature,
  persistDeployEvent,
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

function extractRenderEvent(payload, headers) {
  return payload?.type || payload?.event || headers['x-render-event'] || 'unknown';
}

function extractRenderData(payload) {
  const deploy = payload?.data?.deploy || payload?.deploy || payload?.data || {};
  const service = payload?.data?.service || payload?.service || {};

  return {
    serviceName: service.name || deploy.serviceName || 'N/A',
    environment: deploy.environment || service.environment || payload?.environment || 'N/A',
    commitId: deploy.commit?.id || deploy.commitId || payload?.commitId || 'N/A',
    commitMessage: deploy.commit?.message || payload?.commitMessage || 'N/A',
    deployUrl: deploy.url || deploy.dashboardUrl || payload?.url || null,
    triggeredBy: deploy.trigger?.name || payload?.triggeredBy || 'Render',
    completedAt: deploy.finishedAt || deploy.updatedAt || payload?.createdAt || null
  };
}

function createRenderWebhookRouter(client) {
  const router = express.Router();

  router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.RENDER_WEBHOOK_SECRET;
    const rawBody = req.body;

    if (!validateRenderSignature(rawBody, req.headers, secret)) {
      console.warn('[webhook/render] Invalid signature.');
      return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const payload = parseBody(rawBody);
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
    }

    const eventType = extractRenderEvent(payload, req.headers);
    const data = extractRenderData(payload);

    console.log(`[webhook/render] Event received: ${eventType}`);

    try {
      const isStarted = eventType === 'deploy.created';
      const isSucceeded = eventType === 'deploy.succeeded';
      const isFailed = eventType === 'deploy.failed';

      if (!isStarted && !isSucceeded && !isFailed) {
        await logWebhookSummary(client, `Render event ignored: ${eventType}`);
        return res.status(200).json({ ok: true, ignored: true });
      }

      const state = isStarted ? 'in_progress' : isSucceeded ? 'success' : 'failure';
      const embed = createStandardEmbed({
        title: `Render Deploy ${isStarted ? 'Started' : isSucceeded ? 'Succeeded' : 'Failed'}`,
        state,
        eventType,
        service: 'Render',
        project: data.serviceName,
        branch: data.environment,
        commit: formatCommitShort(data.commitId),
        triggeredBy: data.triggeredBy,
        url: data.deployUrl,
        extraFields: [
          { name: 'Service Name', value: data.serviceName, inline: true },
          { name: 'Environment', value: data.environment, inline: true },
          { name: 'Commit ID', value: formatCommitShort(data.commitId), inline: true },
          { name: 'Deploy URL', value: data.deployUrl || 'N/A', inline: false },
          { name: 'Commit Message', value: data.commitMessage || 'N/A', inline: false }
        ]
      });

      await sendWebhookEmbed(client, {
        channelName: process.env.DEPLOY_LOGS_CHANNEL_NAME || 'deploy-logs',
        embed,
        pingRoleName: isFailed ? (process.env.DEVOPS_ROLE_NAME || 'DevOps') : undefined
      });

      if (isSucceeded || isFailed) {
        await persistDeployEvent({
          service: 'Render',
          status: isSucceeded ? 'Success' : 'Failure',
          branch: data.environment,
          project: data.serviceName,
          timestamp: data.completedAt ? new Date(data.completedAt) : new Date()
        });
      }

      await logWebhookSummary(client, `Render deploy event processed: ${eventType} (${data.serviceName}).`);

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[webhook/render] Failed to process event:', error);
      return res.status(500).json({ ok: false, error: 'Internal webhook processing error' });
    }
  });

  return router;
}

module.exports = {
  createRenderWebhookRouter
};
