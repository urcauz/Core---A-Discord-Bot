const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
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
