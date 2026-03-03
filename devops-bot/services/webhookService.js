const crypto = require('crypto');
const { buildWebhookEmbed, webhookColorByState } = require('../utils/embedBuilder');
const { logTaskAction } = require('./logService');
const { DeployEvent } = require('../models/DeployEvent');

function safeCompare(a, b) {
  const aBuffer = Buffer.from(String(a || ''), 'utf8');
  const bBuffer = Buffer.from(String(b || ''), 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function createHmacDigest(algorithm, secret, rawBody, prefix = '') {
  const digest = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');
  return `${prefix}${digest}`;
}

function validateGitHubSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const expected = createHmacDigest('sha256', secret, rawBody, 'sha256=');
  return safeCompare(expected, signatureHeader);
}

function validateRenderSignature(rawBody, headers, secret) {
  if (!secret) return false;

  const headerSignature = headers['x-render-signature'];
  if (headerSignature) {
    const expectedPrefixed = createHmacDigest('sha256', secret, rawBody, 'sha256=');
    const expectedRaw = createHmacDigest('sha256', secret, rawBody);
    return safeCompare(expectedPrefixed, headerSignature) || safeCompare(expectedRaw, headerSignature);
  }

  const authHeader = headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return safeCompare(authHeader.slice(7), secret);
  }

  const tokenHeader = headers['x-render-secret'];
  if (tokenHeader) {
    return safeCompare(tokenHeader, secret);
  }

  return false;
}

function validateVercelSignature(rawBody, headers, secret) {
  if (!secret) return false;

  const headerSignature = headers['x-vercel-signature'];
  if (headerSignature) {
    const expectedSha1 = createHmacDigest('sha1', secret, rawBody);
    const expectedSha256 = createHmacDigest('sha256', secret, rawBody);
    return safeCompare(expectedSha1, headerSignature) || safeCompare(expectedSha256, headerSignature);
  }

  const authHeader = headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return safeCompare(authHeader.slice(7), secret);
  }

  return false;
}

async function persistDeployEvent({ service, status, branch, project, timestamp }) {
  if (!service || !status) return;

  try {
    await DeployEvent.create({
      service,
      status,
      branch: branch || 'N/A',
      project: project || 'N/A',
      timestamp: timestamp || new Date()
    });
  } catch (error) {
    console.error('[webhookService] Failed to persist deploy event:', error);
  }
}

async function getPrimaryGuild(client) {
  if (!client) return null;

  const configuredGuildId = process.env.DISCORD_GUILD_ID;
  if (configuredGuildId) {
    try {
      return client.guilds.cache.get(configuredGuildId) || (await client.guilds.fetch(configuredGuildId));
    } catch (error) {
      console.error(`[webhookService] Unable to fetch guild ${configuredGuildId}:`, error);
    }
  }

  const firstGuild = client.guilds.cache.first();
  return firstGuild || null;
}

async function getTextChannelByName(guild, channelName) {
  if (!guild || !channelName) return null;

  let channel = guild.channels.cache.find(
    (item) => item.name === channelName && item.isTextBased() && !item.isThread()
  );

  if (channel) return channel;

  try {
    await guild.channels.fetch();
    channel = guild.channels.cache.find(
      (item) => item.name === channelName && item.isTextBased() && !item.isThread()
    );
    return channel || null;
  } catch (error) {
    console.error(`[webhookService] Failed channel fetch for #${channelName}:`, error);
    return null;
  }
}

function findRoleByName(guild, roleName) {
  if (!guild || !roleName) return null;
  return guild.roles.cache.find((role) => role.name.toLowerCase() === roleName.toLowerCase()) || null;
}

async function sendWebhookEmbed(client, { channelName, embed, pingRoleName }) {
  const guild = await getPrimaryGuild(client);
  if (!guild) {
    console.error('[webhookService] No guild is available for webhook notifications.');
    return;
  }

  const channel = await getTextChannelByName(guild, channelName);
  if (!channel) {
    console.error(`[webhookService] Channel #${channelName} not found.`);
    return;
  }

  const mention = pingRoleName ? findRoleByName(guild, pingRoleName) : null;
  const content = mention ? `<@&${mention.id}>` : undefined;

  await channel.send({
    content,
    embeds: [embed]
  });
}

async function logWebhookSummary(client, summary) {
  const guild = await getPrimaryGuild(client);
  if (!guild) {
    console.error('[webhookService] Cannot write webhook summary without guild context.');
    return;
  }

  await logTaskAction(guild, `🔔 ${summary}`);
}

function formatCommitShort(commitId) {
  if (!commitId) return 'N/A';
  return String(commitId).slice(0, 8);
}

function createStandardEmbed({
  title,
  eventType,
  service,
  project,
  branch,
  commit,
  triggeredBy,
  url,
  state,
  extraFields
}) {
  return buildWebhookEmbed({
    title,
    color: webhookColorByState(state),
    eventType,
    service,
    project,
    branch,
    commit,
    triggeredBy,
    url,
    extraFields
  });
}

module.exports = {
  validateGitHubSignature,
  validateRenderSignature,
  validateVercelSignature,
  persistDeployEvent,
  sendWebhookEmbed,
  logWebhookSummary,
  formatCommitShort,
  createStandardEmbed
};
