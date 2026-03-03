async function logTaskAction(guild, message) {
  if (!guild) return;

  const logChannelName = process.env.LOG_CHANNEL_NAME || 'server-logs';
  const logChannel = guild.channels.cache.find(
    (channel) => channel.name === logChannelName && channel.isTextBased()
  );

  if (!logChannel) {
    console.warn(`[logService] Channel #${logChannelName} not found.`);
    return;
  }

  try {
    await logChannel.send({ content: message });
  } catch (error) {
    console.error('[logService] Failed to write log:', error);
  }
}

module.exports = {
  logTaskAction
};
