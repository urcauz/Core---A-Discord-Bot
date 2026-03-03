const { ChannelType } = require('discord.js');
const { Bug } = require('../models/Bug');
const { getNextSequence } = require('../utils/counter');
const { buildBugEmbed, truncateTitle } = require('../utils/embedBuilder');
const { logTaskAction } = require('./logService');

function findRoleByName(guild, roleName) {
  if (!roleName) return null;
  return guild.roles.cache.find((role) => role.name.toLowerCase() === roleName.toLowerCase()) || null;
}

function getBugReportChannel(guild) {
  const channelName = process.env.BUG_CHANNEL_NAME || 'bug-reports';
  return guild.channels.cache.find(
    (channel) =>
      channel.name === channelName &&
      channel.type === ChannelType.GuildText &&
      channel.isTextBased()
  );
}

function getBugThread(guild, threadId) {
  if (!threadId) return null;
  return guild.channels.cache.get(threadId) || null;
}

async function fetchBugThread(guild, threadId) {
  const cached = getBugThread(guild, threadId);
  if (cached) return cached;

  try {
    return await guild.channels.fetch(threadId);
  } catch {
    return null;
  }
}

function getQaRole(guild) {
  return findRoleByName(guild, process.env.QA_ROLE_NAME || 'QA');
}

function getLeadDeveloperRole(guild) {
  return findRoleByName(guild, process.env.LEAD_DEVELOPER_ROLE_NAME || 'Lead Developer');
}

function getDevOpsRole(guild) {
  return findRoleByName(guild, process.env.DEVOPS_ROLE_NAME || 'DevOps');
}

async function createBug({
  guild,
  reportedBy,
  title,
  project,
  environment,
  severity,
  stepsToReproduce,
  expectedResult,
  actualResult
}) {
  const bugId = await getNextSequence('bugId');

  const bug = await Bug.create({
    bugId,
    title,
    project: project || 'General',
    environment,
    severity,
    stepsToReproduce,
    expectedResult,
    actualResult,
    reportedBy,
    status: 'Open'
  });

  const bugChannel = getBugReportChannel(guild);
  if (!bugChannel) {
    throw new Error(`Channel #${process.env.BUG_CHANNEL_NAME || 'bug-reports'} was not found.`);
  }

  const bugMessage = await bugChannel.send({ embeds: [buildBugEmbed(bug)] });

  let threadCreated = false;
  let threadError = null;

  try {
    const threadName = `Bug-${bug.bugId} | ${truncateTitle(bug.title, 55)}`;
    const thread = await bugMessage.startThread({
      name: threadName,
      autoArchiveDuration: 10080,
      reason: `Bug ${bug.bugId} reported by ${reportedBy}`
    });

    bug.threadId = thread.id;
    await bug.save();
    threadCreated = true;

    const pings = [];
    const qaRole = getQaRole(guild);
    if (qaRole) pings.push(`<@&${qaRole.id}>`);

    if (bug.severity === 'Critical') {
      const leadRole = getLeadDeveloperRole(guild);
      const devOpsRole = getDevOpsRole(guild);
      if (leadRole) pings.push(`<@&${leadRole.id}>`);
      if (devOpsRole) pings.push(`<@&${devOpsRole.id}>`);
    }

    const pingBlock = pings.length ? `${pings.join(' ')}\n` : '';
    await thread.send({ content: `${pingBlock}Bug #${bug.bugId} created by <@${reportedBy}>.` });
  } catch (error) {
    threadError = error;
    console.error(`[bugService] Failed to create thread for bug #${bug.bugId}:`, error);
  }

  await logTaskAction(
    guild,
    `🐞 Bug #${bug.bugId} reported by <@${reportedBy}> | Severity: **${bug.severity}** | Project: **${bug.project}**`
  );

  return { bug, threadCreated, threadError };
}

async function assignBug({ guild, bugId, assignedToUser, actorId }) {
  const bug = await Bug.findOne({ bugId });
  if (!bug) {
    throw new Error(`Bug #${bugId} not found.`);
  }

  bug.assignedTo = assignedToUser.id;
  await bug.save();

  const thread = await fetchBugThread(guild, bug.threadId);
  if (thread?.isTextBased()) {
    await thread.send({ content: `👤 Bug assigned to <@${assignedToUser.id}> by <@${actorId}>.` });
  }

  await logTaskAction(guild, `👤 Bug #${bug.bugId} assigned to <@${assignedToUser.id}> by <@${actorId}>.`);

  return bug;
}

async function moveBug({ guild, bugId, newStatus, actorId }) {
  const bug = await Bug.findOne({ bugId });
  if (!bug) {
    throw new Error(`Bug #${bugId} not found.`);
  }

  const previousStatus = bug.status;
  bug.status = newStatus;
  await bug.save();

  const thread = await fetchBugThread(guild, bug.threadId);
  if (thread?.isTextBased()) {
    await thread.send({
      content: `🔄 Status changed: **${previousStatus}** → **${newStatus}** by <@${actorId}>.`
    });

    if (newStatus === 'Fixed') {
      await thread.send({ content: `<@${bug.reportedBy}> Bug #${bug.bugId} was marked as fixed.` });
    }

    if (newStatus === 'Closed') {
      await thread.setLocked(true, 'Bug closed');
      await thread.setArchived(true, 'Bug closed');
    }
  }

  await logTaskAction(
    guild,
    `📌 Bug #${bug.bugId} moved from **${previousStatus}** to **${newStatus}** by <@${actorId}>.`
  );

  return bug;
}

async function listBugs({ requesterId, severity, status, mine, page = 1, pageSize = 5 }) {
  const query = {};

  if (severity) query.severity = severity;
  if (status) query.status = status;
  if (mine) query.assignedTo = requesterId;

  const totalCount = await Bug.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * pageSize;

  const bugs = await Bug.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize);

  return {
    bugs,
    totalCount,
    totalPages,
    page: safePage
  };
}

module.exports = {
  createBug,
  assignBug,
  moveBug,
  listBugs
};
