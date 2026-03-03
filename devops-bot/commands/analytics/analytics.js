const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ACTIONS, checkPermission, getAllowedRoleNames } = require('../../services/permissionService');
const {
  getDateRange,
  getOverviewStats,
  getTaskStats,
  getBugStats,
  getStandupStats,
  getDeploymentStats
} = require('../../services/analyticsService');
const {
  buildAnalyticsOverviewEmbed,
  buildAnalyticsTasksEmbed,
  buildAnalyticsBugsEmbed,
  buildAnalyticsStandupsEmbed,
  buildAnalyticsDeploymentsEmbed
} = require('../../utils/embedBuilder');

function hasAnyAllowedRole(member, action) {
  const allowedRoles = getAllowedRoleNames(action).map((name) => name.toLowerCase());
  return member.roles.cache.some((role) => allowedRoles.includes(role.name.toLowerCase()));
}

async function getDevTeamSize(guild) {
  if (!guild) return 0;

  try {
    await guild.members.fetch();
  } catch (error) {
    console.error('[analytics] Failed to fetch guild members:', error);
    return 0;
  }

  return guild.members.cache.filter((member) => !member.user.bot && hasAnyAllowedRole(member, ACTIONS.SUBMIT_STANDUP)).size;
}

function ensureDetailedPermission(member) {
  return checkPermission(member, ACTIONS.VIEW_ANALYTICS_DETAILED);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('Analytics and productivity insights')
    .addSubcommand((subcommand) =>
      subcommand.setName('overview').setDescription('Weekly overview for the last 7 days')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('tasks').setDescription('Task productivity analytics')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('bugs').setDescription('Bug resolution analytics')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('standups').setDescription('Standup consistency analytics')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('deployments').setDescription('Deployment reliability analytics')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'overview') {
        if (!checkPermission(interaction.member, ACTIONS.VIEW_ANALYTICS_OVERVIEW)) {
          return interaction.reply({
            content: 'You do not have permission to view analytics overview.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const range = getDateRange(7);
        const devTeamSize = await getDevTeamSize(interaction.guild);
        const stats = await getOverviewStats(range, { devTeamSize });

        return interaction.editReply({
          embeds: [buildAnalyticsOverviewEmbed(stats)]
        });
      }

      if (!ensureDetailedPermission(interaction.member)) {
        return interaction.reply({
          content: 'You do not have permission to view detailed analytics.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (subcommand === 'tasks') {
        const range = getDateRange(30);
        const stats = await getTaskStats(range);
        return interaction.editReply({ embeds: [buildAnalyticsTasksEmbed(stats)] });
      }

      if (subcommand === 'bugs') {
        const range = getDateRange(30);
        const stats = await getBugStats(range);
        return interaction.editReply({ embeds: [buildAnalyticsBugsEmbed(stats)] });
      }

      if (subcommand === 'standups') {
        const range = getDateRange(7);
        const devTeamSize = await getDevTeamSize(interaction.guild);
        const stats = await getStandupStats(range, { devTeamSize });
        return interaction.editReply({ embeds: [buildAnalyticsStandupsEmbed(stats)] });
      }

      if (subcommand === 'deployments') {
        const range = getDateRange(30);
        const stats = await getDeploymentStats(range);
        return interaction.editReply({ embeds: [buildAnalyticsDeploymentsEmbed(stats)] });
      }

      return interaction.editReply({ content: 'Unknown analytics command.' });
    } catch (error) {
      console.error(`[analytics] ${subcommand} failed:`, error);

      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: `Request failed: ${error.message}` });
      }

      return interaction.reply({
        content: `Request failed: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
