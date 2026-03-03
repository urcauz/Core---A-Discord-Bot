const { EmbedBuilder } = require('discord.js');

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
  formatDate,
  truncateTitle
};
