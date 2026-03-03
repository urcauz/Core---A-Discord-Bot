const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

function buildOverviewEmbed() {
  return new EmbedBuilder()
    .setTitle('CORE DevOps Bot Help')
    .setColor(0x2b87ff)
    .setDescription('Internal command reference')
    .addFields(
      {
        name: '/task',
        value:
          '`create`, `assign`, `update`, `move`, `list`, `archive`\n' +
          'Task workflow and thread-based tracking.'
      },
      {
        name: '/bug',
        value:
          '`report`, `assign`, `move`, `list`\n' +
          'Bug reporting with modal submission and triage.'
      },
      {
        name: '/standup',
        value:
          '`submit`, `summary`\n' +
          'Daily standup submissions and weekly summaries.'
      },
      {
        name: '/analytics',
        value:
          '`overview`, `tasks`, `bugs`, `standups`, `deployments`\n' +
          'Live metrics computed from MongoDB aggregates.'
      },
      {
        name: 'Dashboard',
        value:
          '`/dashboard` (web) with role-gated access, plus protected `/api/*` endpoints.'
      }
    )
    .setFooter({ text: 'Use /help command:<name> for focused help (e.g. /help command:task)' })
    .setTimestamp();
}

function buildCommandEmbed(command) {
  switch (command) {
    case 'task':
      return new EmbedBuilder()
        .setTitle('/task Help')
        .setColor(0x2b87ff)
        .addFields(
          { name: '/task create', value: 'Create a task, post embed, open task thread.' },
          { name: '/task assign', value: 'Assign a task and notify assignee + logs.' },
          { name: '/task update', value: 'Update description/deadline/priority.' },
          { name: '/task move', value: 'Change status, trigger review/completion actions.' },
          { name: '/task list', value: 'List tasks with filters and pagination.' },
          { name: '/task archive', value: 'Archive task and lock/archive thread (role-gated).' }
        )
        .setTimestamp();

    case 'bug':
      return new EmbedBuilder()
        .setTitle('/bug Help')
        .setColor(0xe55300)
        .addFields(
          { name: '/bug report', value: 'Open modal and submit new bug report.' },
          { name: '/bug assign', value: 'Assign bug to user and log action.' },
          { name: '/bug move', value: 'Move bug status and notify reporter on fixed.' },
          { name: '/bug list', value: 'List bugs by severity/status/assignee filters.' }
        )
        .setTimestamp();

    case 'standup':
      return new EmbedBuilder()
        .setTitle('/standup Help')
        .setColor(0x0d6efd)
        .addFields(
          { name: '/standup submit', value: 'Submit standup via modal in active standup thread.' },
          { name: '/standup summary', value: 'View weekly standup summary (role-gated).' }
        )
        .setTimestamp();

    case 'analytics':
      return new EmbedBuilder()
        .setTitle('/analytics Help')
        .setColor(0x2b87ff)
        .addFields(
          { name: '/analytics overview', value: 'Last 7 days high-level metrics.' },
          { name: '/analytics tasks', value: 'Task throughput and completion analytics.' },
          { name: '/analytics bugs', value: 'Bug severity/resolution analytics.' },
          { name: '/analytics standups', value: 'Standup consistency and blocker trends.' },
          { name: '/analytics deployments', value: 'Deployment reliability and failure rate.' }
        )
        .setTimestamp();

    case 'dashboard':
      return new EmbedBuilder()
        .setTitle('Dashboard Help')
        .setColor(0x2b87ff)
        .setDescription(
          'Use `/login` in browser to access dashboard pages:\n' +
          '`/dashboard`, `/dashboard/tasks`, `/dashboard/bugs`, `/dashboard/deployments`, `/dashboard/standups`\n\n' +
          'All `/api/*` routes are session-protected and role-gated.'
        )
        .setTimestamp();

    default:
      return buildOverviewEmbed();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show structured help for CORE DevOps bot commands')
    .addStringOption((option) =>
      option
        .setName('command')
        .setDescription('Specific command group to show help for')
        .setRequired(false)
        .addChoices(
          { name: 'task', value: 'task' },
          { name: 'bug', value: 'bug' },
          { name: 'standup', value: 'standup' },
          { name: 'analytics', value: 'analytics' },
          { name: 'dashboard', value: 'dashboard' }
        )
    ),

  async execute(interaction) {
    try {
      const command = interaction.options.getString('command');
      const embed = command ? buildCommandEmbed(command) : buildOverviewEmbed();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('[help command] failed:', error);
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: 'Failed to render help.' });
      }
      return interaction.reply({ content: 'Failed to render help.', flags: MessageFlags.Ephemeral });
    }
  }
};
