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

function toPercentString(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function toUserLabel(userId) {
  return /^\d+$/.test(String(userId || '')) ? `<@${userId}>` : 'Unassigned';
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

function buildAnalyticsOverviewEmbed(stats) {
  return new EmbedBuilder()
    .setTitle('CORE Weekly Overview')
    .setColor(0x2b87ff)
    .addFields(
      { name: 'Timeframe', value: stats.range.label, inline: false },
      { name: 'Tasks Created', value: String(stats.tasksCreated), inline: true },
      { name: 'Tasks Completed', value: String(stats.tasksCompleted), inline: true },
      { name: 'Bugs Reported', value: String(stats.bugsReported), inline: true },
      { name: 'Bugs Fixed', value: String(stats.bugsFixed), inline: true },
      { name: 'Deployment Success Rate', value: toPercentString(stats.deploymentSuccessRate), inline: true },
      { name: 'Standup Submission Rate', value: toPercentString(stats.standupSubmissionRate), inline: true }
    )
    .setFooter({ text: 'Computed from live MongoDB aggregates' })
    .setTimestamp();
}

function buildAnalyticsTasksEmbed(stats) {
  const statusText = Object.keys(stats.statusBreakdown).length
    ? Object.entries(stats.statusBreakdown)
        .map(([status, count]) => `${status}: ${count}`)
        .join('\n')
    : 'No task data for this timeframe.';

  const contributorsText = stats.topContributors.length
    ? stats.topContributors.map((item) => `${toUserLabel(item.userId)}: ${item.completedTasks}`).join('\n')
    : 'No completed tasks in this timeframe.';

  return new EmbedBuilder()
    .setTitle('Task Analytics')
    .setColor(0x2b87ff)
    .addFields(
      { name: 'Timeframe', value: stats.range.label, inline: false },
      { name: 'Tasks per Status', value: clamp(statusText, 1024), inline: false },
      { name: 'Top 5 Contributors', value: clamp(contributorsText, 1024), inline: false },
      { name: 'Average Completion Time', value: `${stats.averageCompletionHours.toFixed(2)} hours`, inline: false }
    )
    .setFooter({ text: 'Computed from live MongoDB aggregates' })
    .setTimestamp();
}

function buildAnalyticsBugsEmbed(stats) {
  const severityText = Object.keys(stats.severityBreakdown).length
    ? Object.entries(stats.severityBreakdown)
        .map(([severity, count]) => `${severity}: ${count}`)
        .join('\n')
    : 'No bug data for this timeframe.';

  const threshold = Number(process.env.CRITICAL_BUG_ALERT_THRESHOLD || 5);
  const color = stats.criticalBugCount > threshold ? 0xdc3545 : 0x2b87ff;

  return new EmbedBuilder()
    .setTitle('Bug Analytics')
    .setColor(color)
    .addFields(
      { name: 'Timeframe', value: stats.range.label, inline: false },
      { name: 'Bugs by Severity', value: clamp(severityText, 1024), inline: false },
      { name: 'Average Resolution Time', value: `${stats.averageResolutionHours.toFixed(2)} hours`, inline: true },
      { name: 'Critical Bug Count', value: String(stats.criticalBugCount), inline: true },
      {
        name: 'Open vs Closed Ratio',
        value: `Open: ${stats.openClosedRatio.open} | Closed: ${stats.openClosedRatio.closed}`,
        inline: false
      }
    )
    .setFooter({ text: 'Computed from live MongoDB aggregates' })
    .setTimestamp();
}

function buildAnalyticsStandupsEmbed(stats) {
  const consistentText = stats.mostConsistentContributors.length
    ? stats.mostConsistentContributors
        .map((item) => `${toUserLabel(item.userId)}: ${item.submissions}`)
        .join('\n')
    : 'No submissions in this timeframe.';

  return new EmbedBuilder()
    .setTitle('Standup Analytics')
    .setColor(0x2b87ff)
    .addFields(
      { name: 'Timeframe', value: stats.range.label, inline: false },
      { name: 'Submission Rate', value: toPercentString(stats.submissionRate), inline: true },
      { name: 'Dev Team Size', value: String(stats.devTeamSize), inline: true },
      { name: 'Total Blockers Reported', value: String(stats.blockersReported), inline: true },
      { name: 'Most Consistent Contributors', value: clamp(consistentText, 1024), inline: false },
      { name: 'Missed Standup Count', value: String(stats.missedStandups), inline: false }
    )
    .setFooter({ text: 'Computed from live MongoDB aggregates' })
    .setTimestamp();
}

function buildAnalyticsDeploymentsEmbed(stats) {
  let color = 0x2b87ff;
  if (stats.failureRate > 20) {
    color = stats.failureRate > 40 ? 0xdc3545 : 0xfd7e14;
  }

  return new EmbedBuilder()
    .setTitle('Deployment Analytics')
    .setColor(color)
    .addFields(
      { name: 'Timeframe', value: stats.range.label, inline: false },
      { name: 'Total Deployments', value: String(stats.totalDeployments), inline: true },
      { name: 'Success Rate', value: toPercentString(stats.successRate), inline: true },
      { name: 'Failure Count', value: String(stats.failureCount), inline: true },
      { name: 'Most Deployed Project', value: stats.mostDeployedProject || 'N/A', inline: false }
    )
    .setFooter({ text: 'Computed from live MongoDB aggregates' })
    .setTimestamp();
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
  buildAnalyticsOverviewEmbed,
  buildAnalyticsTasksEmbed,
  buildAnalyticsBugsEmbed,
  buildAnalyticsStandupsEmbed,
  buildAnalyticsDeploymentsEmbed,
  bugSeverityColor,
  webhookColorByState,
  formatDate,
  truncateTitle
};
