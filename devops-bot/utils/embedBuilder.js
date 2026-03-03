const { EmbedBuilder } = require('discord.js');

function clamp(value, max) {
  const normalized = String(value ?? 'N/A');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function formatDate(date) {
  if (!date) return 'Not set';
  const timestamp = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${timestamp}:f>`;
}

function truncateTitle(title, max = 45) {
  if (!title) return 'Untitled';
  if (title.length <= max) return title;
  return `${title.slice(0, max - 3)}...`;
}

function buildTaskEmbed(task) {
  return new EmbedBuilder()
    .setTitle(`Task #${task.taskId}: ${task.title}`)
    .setColor(colorByStatus(task.status))
    .addFields(
      { name: 'Project', value: task.project || 'General', inline: true },
      { name: 'Status', value: task.status, inline: true },
      { name: 'Priority', value: task.priority, inline: true },
      { name: 'Assigned To', value: task.assignedTo ? `<@${task.assignedTo}>` : 'Unassigned', inline: true },
      { name: 'Created By', value: `<@${task.createdBy}>`, inline: true },
      { name: 'Deadline', value: formatDate(task.deadline), inline: true },
      { name: 'Description', value: task.description || 'No description provided.' }
    )
    .setFooter({ text: `Created ${new Date(task.createdAt).toLocaleString()}` })
    .setTimestamp(new Date(task.updatedAt));
}

function buildTaskListEmbed(tasks, page, totalPages, filters = {}) {
  const filterParts = [];
  if (filters.mine) filterParts.push('Mine');
  if (filters.status) filterParts.push(`Status: ${filters.status}`);
  if (filters.project) filterParts.push(`Project: ${filters.project}`);

  const description = tasks.length
    ? tasks
        .map(
          (task) =>
            `**#${task.taskId}** • ${task.title}\n` +
            `Status: ${task.status} | Priority: ${task.priority} | Assignee: ${task.assignedTo ? `<@${task.assignedTo}>` : 'Unassigned'}`
        )
        .join('\n\n')
    : 'No tasks found for the selected filters.';

  return new EmbedBuilder()
    .setTitle('Task List')
    .setColor(0x2b87ff)
    .setDescription(description)
    .addFields({
      name: 'Filters',
      value: filterParts.length ? filterParts.join(' | ') : 'None'
    })
    .setFooter({ text: `Page ${page} of ${totalPages}` })
    .setTimestamp();
}

function bugSeverityColor(severity) {
  switch (severity) {
    case 'Low':
      return 0x198754;
    case 'Medium':
      return 0xffc107;
    case 'High':
      return 0xfd7e14;
    case 'Critical':
      return 0xdc3545;
    default:
      return 0x2b87ff;
  }
}

function webhookColorByState(state) {
  switch (state) {
    case 'success':
      return 0x198754;
    case 'failure':
      return 0xdc3545;
    case 'in_progress':
      return 0x0d6efd;
    case 'pr_opened':
      return 0x6f42c1;
    default:
      return 0x2b87ff;
  }
}

function buildWebhookEmbed({
  title,
  color,
  eventType,
  service,
  project,
  branch,
  commit,
  triggeredBy,
  url,
  extraFields
}) {
  const embed = new EmbedBuilder()
    .setTitle(title || 'Webhook Event')
    .setColor(color || 0x2b87ff)
    .addFields(
      { name: 'Event Type', value: clamp(eventType, 1024), inline: true },
      { name: 'Service', value: clamp(service, 1024), inline: true },
      { name: 'Project', value: clamp(project, 1024), inline: true },
      { name: 'Branch', value: clamp(branch, 1024), inline: true },
      { name: 'Commit', value: clamp(commit, 1024), inline: true },
      { name: 'Triggered By', value: clamp(triggeredBy, 1024), inline: true }
    )
    .setTimestamp(new Date());

  if (url) {
    embed.addFields({ name: 'Link', value: clamp(url, 1024), inline: false });
  }

  if (Array.isArray(extraFields) && extraFields.length) {
    embed.addFields(
      extraFields.map((field) => ({
        name: clamp(field?.name || 'Details', 256),
        value: clamp(field?.value, 1024),
        inline: Boolean(field?.inline)
      }))
    );
  }

  return embed;
}

function buildBugEmbed(bug) {
  return new EmbedBuilder()
    .setTitle(`Bug #${bug.bugId}: ${bug.title}`)
    .setColor(bugSeverityColor(bug.severity))
    .addFields(
      { name: 'Bug ID', value: String(bug.bugId), inline: true },
      { name: 'Project', value: bug.project || 'General', inline: true },
      { name: 'Environment', value: bug.environment, inline: true },
      { name: 'Severity', value: bug.severity, inline: true },
      { name: 'Status', value: bug.status, inline: true },
      { name: 'Reported By', value: `<@${bug.reportedBy}>`, inline: true },
      { name: 'Steps to Reproduce', value: bug.stepsToReproduce || 'Not provided' },
      { name: 'Expected Result', value: bug.expectedResult || 'Not provided' },
      { name: 'Actual Result', value: bug.actualResult || 'Not provided' }
    )
    .setTimestamp(new Date(bug.createdAt || Date.now()));
}

function buildBugListEmbed(bugs, page, totalPages, filters = {}) {
  const filterParts = [];
  if (filters.mine) filterParts.push('Mine');
  if (filters.severity) filterParts.push(`Severity: ${filters.severity}`);
  if (filters.status) filterParts.push(`Status: ${filters.status}`);

  const description = bugs.length
    ? bugs
        .map(
          (bug) =>
            `**#${bug.bugId}** • ${bug.title}\n` +
            `Project: ${bug.project} | Severity: ${bug.severity} | Status: ${bug.status} | Assignee: ${bug.assignedTo ? `<@${bug.assignedTo}>` : 'Unassigned'}`
        )
        .join('\n\n')
    : 'No bugs found for the selected filters.';

  return new EmbedBuilder()
    .setTitle('Bug List')
    .setColor(0xe55300)
    .setDescription(description)
    .addFields({
      name: 'Filters',
      value: filterParts.length ? filterParts.join(' | ') : 'None'
    })
    .setFooter({ text: `Page ${page} of ${totalPages}` })
    .setTimestamp();
}

function buildDailyStandupEmbed(date) {
  return new EmbedBuilder()
    .setTitle(`Daily Standup — ${date}`)
    .setColor(0x0d6efd)
    .setDescription(
      'Reply in this thread answering:\n\n' +
      '• What did you complete yesterday?\n' +
      '• What are you working on today?\n' +
      '• Any blockers?'
    )
    .setTimestamp(new Date());
}

function buildStandupWeeklySummaryEmbed(summary) {
  const range = summary?.dates?.length ? `${summary.dates[0]} to ${summary.dates[summary.dates.length - 1]}` : 'N/A';

  const topContributors = summary?.topContributors?.length
    ? summary.topContributors
        .map((item) => `<@${item.userId}> (${item.submissions}/${summary.dates.length})`)
        .join('\n')
    : 'No submissions recorded.';

  const missed = summary?.missedStandups?.length
    ? summary.missedStandups
        .map((item) => `<@${item.userId}> missed ${item.missedDays} day(s)`)
        .join('\n')
    : 'No missed standups this week.';

  const blockers = summary?.stats?.length
    ? summary.stats
        .map((item) => `<@${item.userId}>: ${item.blockers}`)
        .join('\n')
    : 'No blocker data available.';

  return new EmbedBuilder()
    .setTitle('Weekly Standup Summary')
    .setColor(0x0d6efd)
    .addFields(
      { name: 'Week Range', value: range, inline: false },
      { name: 'Top Contributors', value: clamp(topContributors, 1024), inline: false },
      { name: 'Users with Missed Standups', value: clamp(missed, 1024), inline: false },
      { name: 'Blockers Reported', value: clamp(blockers, 1024), inline: false }
    )
    .setTimestamp(new Date());
}

function colorByStatus(status) {
  switch (status) {
    case 'Backlog':
      return 0x6c757d;
    case 'In Progress':
      return 0x0d6efd;
    case 'Review':
      return 0xffc107;
    case 'Blocked':
      return 0xdc3545;
    case 'Completed':
      return 0x198754;
    default:
      return 0x2b87ff;
  }
}

module.exports = {
  buildTaskEmbed,
  buildTaskListEmbed,
  buildBugEmbed,
  buildBugListEmbed,
  buildDailyStandupEmbed,
  buildStandupWeeklySummaryEmbed,
  buildWebhookEmbed,
  bugSeverityColor,
  webhookColorByState,
  formatDate,
  truncateTitle
};
