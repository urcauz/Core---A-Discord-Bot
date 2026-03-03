const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isModalSubmit()) {
      const bugCommand = client.commands.get('bug');
      if (bugCommand?.isBugModal?.(interaction)) {
        try {
          await bugCommand.handleModalSubmit(interaction);
        } catch (error) {
          console.error('[interactionCreate] Bug modal handling failed:', error);
          if (!interaction.replied && !interaction.deferred) {
            try {
              await interaction.reply({
                content: 'An unexpected error occurred while processing the bug report.',
                flags: MessageFlags.Ephemeral
              });
            } catch (replyError) {
              console.error('[interactionCreate] Failed to send modal error response:', replyError);
            }
          }
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`[interactionCreate] Command ${interaction.commandName} failed:`, error);

      const payload = {
        content: 'An unexpected error occurred while running this command.',
        flags: MessageFlags.Ephemeral
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (replyError) {
        console.error('[interactionCreate] Failed to send error response:', replyError);
      }
    }
  }
};
