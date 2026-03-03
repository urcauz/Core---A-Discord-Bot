const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { ACTIONS, checkPermission } = require('../../services/permissionService');
const {
  resolveStandupDateForThread,
  buildStandupModalCustomId,
  parseStandupModalCustomId,
  submitStandup,
  generateWeeklySummary
} = require('../../services/standupService');
const { buildStandupWeeklySummaryEmbed } = require('../../utils/embedBuilder');

function buildStandupSubmitModal(date) {
  const modal = new ModalBuilder()
    .setCustomId(buildStandupModalCustomId(date))
    .setTitle(`Standup Submit (${date})`);

  const yesterdayInput = new TextInputBuilder()
    .setCustomId('yesterday')
    .setLabel('What did you complete yesterday?')
    .setRequired(true)
    .setMaxLength(4000)
    .setStyle(TextInputStyle.Paragraph);

  const todayInput = new TextInputBuilder()
    .setCustomId('today')
    .setLabel('What are you working on today?')
    .setRequired(true)
    .setMaxLength(4000)
    .setStyle(TextInputStyle.Paragraph);

  const blockersInput = new TextInputBuilder()
    .setCustomId('blockers')
    .setLabel('Any blockers?')
    .setRequired(true)
    .setMaxLength(4000)
    .setStyle(TextInputStyle.Paragraph);

  modal.addComponents(
    new ActionRowBuilder().addComponents(yesterdayInput),
    new ActionRowBuilder().addComponents(todayInput),
    new ActionRowBuilder().addComponents(blockersInput)
  );

  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('standup')
    .setDescription('Standup automation commands')
    .addSubcommand((subcommand) => subcommand.setName('submit').setDescription('Submit daily standup'))
    .addSubcommand((subcommand) => subcommand.setName('summary').setDescription('View current weekly standup summary')),

  isStandupModal(interaction) {
    return Boolean(parseStandupModalCustomId(interaction.customId));
  },

  async handleModalSubmit(interaction) {
    const date = parseStandupModalCustomId(interaction.customId);
    if (!date) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = interaction.guild;
      const thread = interaction.channel;

      if (!thread?.isThread()) {
        return interaction.editReply({ content: 'Standup submission is only available inside a standup thread.' });
      }

      await submitStandup({
        guild,
        userId: interaction.user.id,
        date,
        yesterday: interaction.fields.getTextInputValue('yesterday'),
        today: interaction.fields.getTextInputValue('today'),
        blockers: interaction.fields.getTextInputValue('blockers'),
        thread
      });

      return interaction.editReply({ content: `Standup submitted for ${date}.` });
    } catch (error) {
      console.error('[standup command] modal submit failed:', error);
      return interaction.editReply({ content: `Failed to submit standup: ${error.message}` });
    }
  },

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'submit') {
        if (!checkPermission(interaction.member, ACTIONS.SUBMIT_STANDUP)) {
          return interaction.reply({
            content: 'You do not have permission to submit standup.',
            flags: MessageFlags.Ephemeral
          });
        }

        const thread = interaction.channel;
        if (!thread?.isThread()) {
          return interaction.reply({
            content: 'Use `/standup submit` inside today\'s standup thread.',
            flags: MessageFlags.Ephemeral
          });
        }

        const date = await resolveStandupDateForThread(interaction.guild, thread);
        if (!date) {
          return interaction.reply({
            content: 'This is not an active standup thread for today.',
            flags: MessageFlags.Ephemeral
          });
        }

        const modal = buildStandupSubmitModal(date);
        return interaction.showModal(modal);
      }

      if (subcommand === 'summary') {
        if (!checkPermission(interaction.member, ACTIONS.VIEW_STANDUP_SUMMARY)) {
          return interaction.reply({
            content: 'You do not have permission to view standup summary.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const summary = await generateWeeklySummary(client);
        const embed = buildStandupWeeklySummaryEmbed(summary);

        return interaction.editReply({ embeds: [embed] });
      }

      return interaction.reply({ content: 'Unknown standup command.', flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error(`[standup command] ${subcommand} failed:`, error);

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
