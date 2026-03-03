const { ChannelType } = require('discord.js');
const { Task } = require('../models/Task');
const { getNextSequence } = require('../utils/counter');
const { buildTaskEmbed, truncateTitle } = require('../utils/embedBuilder');
const { logTaskAction } = require('./logService');
const { emitDashboardUpdate } = require('../dashboard/socket');

function getTaskBoardChannel(guild) {
  const boardChannelName = process.env.TASK_CHANNEL_NAME || 'project-tasks';
  return guild.channels.cache.find(
    (channel) =>
      channel.name === boardChannelName &&
      channel.type === ChannelType.GuildText &&
      channel.isTextBased()
  );
}

function getLeadDeveloperRole(guild) {
  const leadRoleName = process.env.LEAD_DEVELOPER_ROLE_NAME || 'Lead Developer';
  return guild.roles.cache.find((role) => role.name.toLowerCase() === leadRoleName.toLowerCase());
}

async function getTaskThread(guild, threadId) {
  if (!threadId) return null;
  let thread = guild.channels.cache.get(threadId);
  if (thread) return thread;

  try {
    thread = await guild.channels.fetch(threadId);
    return thread;
  } catch {
    return null;
  }
}

async function createTask({ guild, creatorId, title, description, project, priority, deadline }) {
  const taskId = await getNextSequence('taskId');

  const task = await Task.create({
    taskId,
    title,
    description: description || '',
    project: project || 'General',
    priority: priority || 'Medium',
    createdBy: creatorId,
    deadline: deadline || null
  });

  const taskBoardChannel = getTaskBoardChannel(guild);
  if (!taskBoardChannel) {
    throw new Error(`Channel #${process.env.TASK_CHANNEL_NAME || 'project-tasks'} was not found.`);
  }

  const taskMessage = await taskBoardChannel.send({
    embeds: [buildTaskEmbed(task)]
  });

  const threadName = `Task-${task.taskId} | ${truncateTitle(task.title, 55)}`;
  const thread = await taskMessage.startThread({
    name: threadName,
    autoArchiveDuration: 10080,
    reason: `Task ${task.taskId} created by ${creatorId}`
  });

  task.threadId = thread.id;
  await task.save();

  await thread.send({
    content: `Task #${task.taskId} created by <@${creatorId}>.`
  });

  await logTaskAction(
    guild,
    `🆕 Task #${task.taskId} created by <@${creatorId}> | Project: **${task.project}** | Priority: **${task.priority}**`
  );
  emitDashboardUpdate('task:created', { taskId: task.taskId, status: task.status, project: task.project });

  return task;
}

async function assignTask({ guild, taskId, assignedToUser, actorId }) {
  const task = await Task.findOne({ taskId, archived: false });
  if (!task) throw new Error(`Task #${taskId} not found.`);

  task.assignedTo = assignedToUser.id;
  await task.save();

  const thread = await getTaskThread(guild, task.threadId);
  if (thread?.isTextBased()) {
    await thread.send({ content: `📌 Task assigned to <@${assignedToUser.id}> by <@${actorId}>.` });
  }

  try {
    await assignedToUser.send(`You have been assigned Task #${task.taskId}: **${task.title}**`);
  } catch (error) {
    console.warn(`[taskService] Unable to DM user ${assignedToUser.id}:`, error.message);
  }

  await logTaskAction(guild, `👤 Task #${task.taskId} assigned to <@${assignedToUser.id}> by <@${actorId}>.`);

  return task;
}

async function moveTask({ guild, taskId, newStatus, actorId }) {
  const task = await Task.findOne({ taskId, archived: false });
  if (!task) throw new Error(`Task #${taskId} not found.`);

  const previousStatus = task.status;
  task.status = newStatus;
  await task.save();

  const thread = await getTaskThread(guild, task.threadId);
  if (thread?.isTextBased()) {
    await thread.send({
      content: `🔄 Status changed: **${previousStatus}** → **${newStatus}** by <@${actorId}>.`
    });

    if (newStatus === 'Review') {
      const leadRole = getLeadDeveloperRole(guild);
      if (leadRole) {
        await thread.send({ content: `<@&${leadRole.id}> Task #${task.taskId} is ready for review.` });
      }
    }

    if (newStatus === 'Completed') {
      await thread.setLocked(true, 'Task completed');
      await thread.setArchived(true, 'Task completed');
    }
  }

  await logTaskAction(
    guild,
    `🚦 Task #${task.taskId} moved from **${previousStatus}** to **${newStatus}** by <@${actorId}>.`
  );

  return task;
}

async function updateTask({ guild, taskId, updates, actorId }) {
  const task = await Task.findOne({ taskId, archived: false });
  if (!task) throw new Error(`Task #${taskId} not found.`);

  const changedFields = [];

  if (typeof updates.description === 'string') {
    task.description = updates.description;
    changedFields.push('description');
  }

  if (updates.deadline !== undefined) {
    task.deadline = updates.deadline;
    changedFields.push('deadline');
  }

  if (updates.priority) {
    task.priority = updates.priority;
    changedFields.push('priority');
  }

  if (!changedFields.length) {
    throw new Error('No valid fields were provided to update.');
  }

  await task.save();

  const thread = await getTaskThread(guild, task.threadId);
  if (thread?.isTextBased()) {
    await thread.send({
      content: `🛠 Task updated by <@${actorId}>. Fields changed: **${changedFields.join(', ')}**.`
    });
  }

  await logTaskAction(
    guild,
    `✏️ Task #${task.taskId} updated by <@${actorId}>. Fields: ${changedFields.join(', ')}.`
  );

  return task;
}

async function listTasks({ requesterId, mine, status, project, page = 1, pageSize = 5 }) {
  const query = { archived: false };

  if (mine) query.assignedTo = requesterId;
  if (status) query.status = status;
  if (project) query.project = project;

  const totalCount = await Task.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * pageSize;

  const tasks = await Task.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize);

  return {
    tasks,
    totalCount,
    totalPages,
    page: safePage
  };
}

async function archiveTask({ guild, taskId, actorId }) {
  const task = await Task.findOne({ taskId, archived: false });
  if (!task) throw new Error(`Task #${taskId} not found.`);

  task.archived = true;
  await task.save();

  const thread = await getTaskThread(guild, task.threadId);
  const archiveCategoryName = process.env.ARCHIVE_CATEGORY_NAME || 'archived';

  if (thread) {
    if (typeof thread.setParent === 'function') {
      const archiveCategory = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory &&
          channel.name.toLowerCase() === archiveCategoryName.toLowerCase()
      );

      if (archiveCategory) {
        await thread.setParent(archiveCategory.id, { lockPermissions: false });
      }
    }

    if (thread.isThread()) {
      await thread.setLocked(true, 'Task archived');
      await thread.setArchived(true, 'Task archived');
    }
  }

  await logTaskAction(guild, `📦 Task #${task.taskId} archived by <@${actorId}>.`);

  return task;
}

module.exports = {
  createTask,
  assignTask,
  moveTask,
  updateTask,
  listTasks,
  archiveTask
};
