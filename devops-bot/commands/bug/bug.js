const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { BUG_ENVIRONMENTS, BUG_SEVERITIES, BUG_STATUSES } = require('../../models/Bug');
const { ACTIONS, checkPermission } = require('../../services/permissionService');
const { createBug, assignBug, moveBug, listBugs } = require('../../services/bugService');
const { buildBugListEmbed } = require('../../utils/embedBuilder');

const BUG_MODAL_PREFIX = 'bug_report_modal';

function bugModalId(environment, severity) {
  return `${BUG_MODAL_PREFIX}:${environment}:${severity}`;
}

function parseBugModalId(customId) {
  const [prefix, environment, severity] = String(customId).split(':');
  if (prefix !== BUG_MODAL_PREFIX || !environment || !severity) {
    return null;
  }
  return { environment, severity };
}

function buildReportModal(environment, severity) {
  const modal = new ModalBuilder()
    .setCustomId(bugModalId(environment, severity))
    .setTitle('Report Bug');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setPlaceholder('Short bug summary')
    .setRequired(true)
    .setMaxLength(200)
    .setStyle(TextInputStyle.Short);

  const projectInput = new TextInputBuilder()
    .setCustomId('project')
    .setLabel('Project')
    .setPlaceholder('Project name')
    .setRequired(true)
    .setMaxLength(100)
    .setStyle(TextInputStyle.Short);

  const stepsInput = new TextInputBuilder()
    .setCustomId('steps')
    .setLabel('Steps to Reproduce')
    .setRequired(true)
    .setMaxLength(4000)
    .setStyle(TextInputStyle.Paragraph);

  const expectedInput = new TextInputBuilder()
    .setCustomId('expected')
    .setLabel('Expected Result')
    .setRequired(true)
    .setMaxLength(2000)
    .setStyle(TextInputStyle.Paragraph);

  const actualInput = new TextInputBuilder()
    .setCustomId('actual')
    .setLabel('Actual Result')
    .setRequired(true)
    .setMaxLength(2000)
    .setStyle(TextInputStyle.Paragraph);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(projectInput),
    new ActionRowBuilder().addComponents(stepsInput),
    new ActionRowBuilder().addComponents(expectedInput),
    new ActionRowBuilder().addComponents(actualInput)
  );

  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bug')
    .setDescription('Bug reporting and triage commands')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('report')
        .setDescription('Report a new bug')
        .addStringOption((option) =>
          option
            .setName('environment')
            .setDescription('Bug environment')
            .setRequired(true)
            .addChoices(...BUG_ENVIRONMENTS.map((value) => ({ name: value, value })))
        )
        .addStringOption((option) =>
          option
            .setName('severity')
            .setDescription('Bug severity')
            .setRequired(true)
            .addChoices(...BUG_SEVERITIES.map((value) => ({ name: value, value })))
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('assign')
        .setDescription('Assign a bug to a user')
        .addIntegerOption((option) => option.setName('bugid').setDescription('Bug ID').setRequired(true))
        .addUserOption((option) => option.setName('user').setDescription('Assignee').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('move')
        .setDescription('Move bug to a new status')
        .addIntegerOption((option) => option.setName('bugid').setDescription('Bug ID').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('newstatus')
            .setDescription('New bug status')
            .setRequired(true)
            .addChoices(...BUG_STATUSES.map((value) => ({ name: value, value })))
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List bugs with filters')
        .addStringOption((option) =>
          option
            .setName('severity')
            .setDescription('Filter by severity')
            .setRequired(false)
            .addChoices(...BUG_SEVERITIES.map((value) => ({ name: value, value })))
        )
        .addStringOption((option) =>
          option
            .setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(...BUG_STATUSES.map((value) => ({ name: value, value })))
        )
        .addBooleanOption((option) => option.setName('mybugs').setDescription('Only show bugs assigned to me'))
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1).setRequired(false)
        )
    ),

  isBugModal(interaction) {
    return Boolean(parseBugModalId(interaction.customId));
  },

  async handleModalSubmit(interaction) {
    const parsed = parseBugModalId(interaction.customId);
    if (!parsed) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await createBug({
        guild: interaction.guild,
        reportedBy: interaction.user.id,
        title: interaction.fields.getTextInputValue('title'),
        project: interaction.fields.getTextInputValue('project'),
        environment: parsed.environment,
        severity: parsed.severity,
        stepsToReproduce: interaction.fields.getTextInputValue('steps'),
        expectedResult: interaction.fields.getTextInputValue('expected'),
        actualResult: interaction.fields.getTextInputValue('actual')
      });

      const threadNote = result.threadCreated
        ? ''
        : ' Thread could not be created; bug record and report were still saved.';

      await interaction.editReply({
        content: `Bug #${result.bug.bugId} submitted successfully.${threadNote}`
      });
    } catch (error) {
      console.error('[bug command] modal submit failed:', error);
      await interaction.editReply({ content: `Failed to submit bug: ${error.message}` });
    }
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.member;

    try {
      if (subcommand === 'report') {
        if (!checkPermission(member, ACTIONS.CREATE_BUG)) {
          return interaction.reply({
            content: 'You do not have permission to create bug reports.',
            flags: MessageFlags.Ephemeral
          });
        }

        const environment = interaction.options.getString('environment', true);
        const severity = interaction.options.getString('severity', true);
        const modal = buildReportModal(environment, severity);

        return interaction.showModal(modal);
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      if (subcommand === 'assign') {
        if (!checkPermission(member, ACTIONS.ASSIGN_BUG)) {
          return interaction.editReply({
            content: 'You do not have permission to assign bugs.'
          });
        }

        const bug = await assignBug({
          guild: interaction.guild,
          bugId: interaction.options.getInteger('bugid', true),
          assignedToUser: interaction.options.getUser('user', true),
          actorId: interaction.user.id
        });

        return interaction.editReply({
          content: `Bug #${bug.bugId} assigned to <@${bug.assignedTo}>.`
        });
      }

      if (subcommand === 'move') {
        if (!checkPermission(member, ACTIONS.MOVE_BUG)) {
          return interaction.editReply({
            content: 'You do not have permission to move bugs.'
          });
        }

        const bug = await moveBug({
          guild: interaction.guild,
          bugId: interaction.options.getInteger('bugid', true),
          newStatus: interaction.options.getString('newstatus', true),
          actorId: interaction.user.id
        });

        return interaction.editReply({
          content: `Bug #${bug.bugId} moved to **${bug.status}**.`
        });
      }

      if (subcommand === 'list') {
        const severity = interaction.options.getString('severity');
        const status = interaction.options.getString('status');
        const mine = interaction.options.getBoolean('mybugs') || false;
        const page = interaction.options.getInteger('page') || 1;

        const result = await listBugs({
          requesterId: interaction.user.id,
          severity,
          status,
          mine,
          page,
          pageSize: 5
        });

        return interaction.editReply({
          embeds: [
            buildBugListEmbed(result.bugs, result.page, result.totalPages, {
              severity,
              status,
              mine
            })
          ]
        });
      }

      return interaction.editReply({ content: 'Unknown subcommand.' });
    } catch (error) {
      console.error(`[bug command] ${subcommand} failed:`, error);

      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({
          content: `Request failed: ${error.message}`
        });
      }

      return interaction.reply({
        content: `Request failed: ${error.message}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
