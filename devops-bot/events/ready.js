const { REST, Routes } = require('discord.js');

async function registerSlashCommands(client) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required for slash registration.');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const commandPayload = client.commands.map((command) => command.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandPayload
    });
    console.log(`[ready] Registered ${commandPayload.length} guild command(s) for guild ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: commandPayload
  });
  console.log(`[ready] Registered ${commandPayload.length} global command(s).`);
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`[ready] Logged in as ${client.user.tag}.`);

    try {
      await registerSlashCommands(client);
    } catch (error) {
      console.error('[ready] Slash command registration failed:', error);
    }
  }
};
