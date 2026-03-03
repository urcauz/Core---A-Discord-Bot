const cron = require('node-cron');
const { ChannelType } = require('discord.js');
const Standup = require('../models/Standup');
const { buildDailyStandupEmbed, buildStandupWeeklySummaryEmbed } = require('../utils/embedBuilder');
const { logTaskAction } = require('./logService');
const { ACTIONS, getAllowedRoleNames } = require('./permissionService');

const activeStandupThreads = new Map();
let schedulerInitialized = false;

function getTimezone() {
  return process.env.STANDUP_TIMEZONE || 'Asia/Kolkata';
}

function getDateStringInTimezone(date = new Date(), timezone = getTimezone()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getNowInTimezone(timezone = getTimezone()) {
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
}

function isWeekdayInTimezone(date = new Date(), timezone = getTimezone()) {
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const day = localDate.getDay();
  return day >= 1 && day <= 5;
}

function parseTime(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${raw}. Expected HH:MM (24h).`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: ${raw}.`);
  }

  return { hour, minute };
}

function toWeekdayCronExpression(timeString) {
  const { hour, minute } = parseTime(timeString, '10:00');
  return `${minute} ${hour} * * 1-5`;
}

async function getPrimaryGuild(client) {
  const configuredGuildId = process.env.DISCORD_GUILD_ID;
  if (configuredGuildId) {
    try {
      return client.guilds.cache.get(configuredGuildId) || (await client.guilds.fetch(configuredGuildId));
    } catch (error) {
      console.error(`[standup] Failed to fetch guild ${configuredGuildId}:`, error);
    }
  }

  return client.guilds.cache.first() || null;
}

async function getTextChannelByName(guild, channelName) {
  if (!guild || !channelName) return null;

  let channel = guild.channels.cache.find(
    (item) => item.name === channelName && item.type === ChannelType.GuildText && item.isTextBased()
  );

  if (channel) return channel;

  try {
    await guild.channels.fetch();
    channel = guild.channels.cache.find(
      (item) => item.name === channelName && item.type === ChannelType.GuildText && item.isTextBased()
    );
  } catch (error) {
    console.error(`[standup] Failed channel fetch for #${channelName}:`, error);
  }

  return channel || null;
}

function parseStandupDateFromThreadName(threadName) {
  const match = String(threadName || '').match(/^Standup \| (\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
}

async function getThreadById(guild, threadId) {
  if (!threadId) return null;

  let thread = guild.channels.cache.get(threadId);
  if (thread) return thread;

  try {
    thread = await guild.channels.fetch(threadId);
    return thread;
  } catch {
    return null;
  }
}

async function recoverTodayStandupThread(client) {
  const guild = await getPrimaryGuild(client);
  if (!guild) return;

  const today = getDateStringInTimezone();
  const standupChannelName = process.env.STANDUP_CHANNEL_NAME || 'standups';
  const standupChannel = await getTextChannelByName(guild, standupChannelName);

  if (!standupChannel) {
    console.warn(`[standup] Channel #${standupChannelName} not found during recovery.`);
    return;
  }

  try {
    const activeThreads = await standupChannel.threads.fetchActive();
    const thread = activeThreads.threads.find((item) => parseStandupDateFromThreadName(item.name) === today);

    if (thread) {
      activeStandupThreads.set(today, thread.id);
      console.log(`[standup] Recovered active standup thread for ${today}.`);
      return;
    }

    const archivedThreads = await standupChannel.threads.fetchArchived({ fetchAll: true });
    const archivedThread = archivedThreads.threads.find((item) => parseStandupDateFromThreadName(item.name) === today);

    if (archivedThread) {
      activeStandupThreads.set(today, archivedThread.id);
      console.log(`[standup] Recovered archived standup thread for ${today}.`);
    }
  } catch (error) {
    console.error('[standup] Failed to recover standup thread:', error);
  }
}

async function postDailyStandup(client) {
  const timezone = getTimezone();
  if (!isWeekdayInTimezone(new Date(), timezone)) return;

  const guild = await getPrimaryGuild(client);
  if (!guild) {
    console.error('[standup] No guild available for daily standup posting.');
    return;
  }

  const date = getDateStringInTimezone(new Date(), timezone);
  if (activeStandupThreads.has(date)) {
    return;
  }

  const standupChannelName = process.env.STANDUP_CHANNEL_NAME || 'standups';
  const standupChannel = await getTextChannelByName(guild, standupChannelName);
  if (!standupChannel) {
    console.error(`[standup] Channel #${standupChannelName} not found.`);
    return;
  }

  try {
    const message = await standupChannel.send({ embeds: [buildDailyStandupEmbed(date)] });
    const thread = await message.startThread({
      name: `Standup | ${date}`,
      autoArchiveDuration: 1440,
      reason: `Daily standup thread for ${date}`
    });

    activeStandupThreads.set(date, thread.id);

    await logTaskAction(guild, `🗓️ Daily standup opened for ${date} in <#${thread.id}>.`);
    console.log(`[standup] Daily standup posted for ${date}.`);
  } catch (error) {
    console.error(`[standup] Failed to post daily standup for ${date}:`, error);
  }
}

async function getDevMembers(guild) {
  const allowedRoleNames = getAllowedRoleNames(ACTIONS.SUBMIT_STANDUP);
  if (!allowedRoleNames.length) return [];

  try {
    await guild.members.fetch();
  } catch (error) {
    console.error('[standup] Failed to fetch guild members:', error);
    return [];
  }

  const normalizedRoleNames = allowedRoleNames.map((name) => name.toLowerCase());
  return guild.members.cache.filter((member) => {
    if (member.user.bot) return false;
    return member.roles.cache.some((role) => normalizedRoleNames.includes(role.name.toLowerCase()));
  });
}

function computeReminderTriggerDate(dateString, timezone = getTimezone()) {
  const standupTime = parseTime(process.env.STANDUP_TIME, '10:00');
  const delayMinutes = Number(process.env.STANDUP_REMINDER_DELAY_MINUTES || 120);

  const parts = dateString.split('-').map(Number);
  const baseline = getNowInTimezone(timezone);
  baseline.setFullYear(parts[0], parts[1] - 1, parts[2]);
  baseline.setHours(standupTime.hour, standupTime.minute, 0, 0);
  baseline.setMinutes(baseline.getMinutes() + delayMinutes);
  return baseline;
}

async function sendStandupReminders(client) {
  const timezone = getTimezone();
  const today = getDateStringInTimezone(new Date(), timezone);
  const now = getNowInTimezone(timezone);

  const reminderTimeConfig = process.env.STANDUP_REMINDER_TIME;
  if (reminderTimeConfig) {
    const { hour, minute } = parseTime(reminderTimeConfig, '12:00');
    if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) {
      return;
    }
  } else {
    const reminderTrigger = computeReminderTriggerDate(today, timezone);
    if (now < reminderTrigger) {
      return;
    }
  }

  const guild = await getPrimaryGuild(client);
  if (!guild) return;

  const threadId = activeStandupThreads.get(today);
  if (!threadId) return;

  const thread = await getThreadById(guild, threadId);
  if (!thread || !thread.isTextBased()) {
    console.warn(`[standup] Standup thread missing for ${today}.`);
    return;
  }

  const devMembers = await getDevMembers(guild);
  if (!devMembers.size) return;

  for (const member of devMembers.values()) {
    const existing = await Standup.findOne({ date: today, userId: member.id });

    if (existing?.submittedAt) {
      continue;
    }

    if (existing?.reminded) {
      continue;
    }

    await thread.send({
      content: `<@${member.id}> gentle reminder to submit your standup for ${today}.`
    });

    await Standup.findOneAndUpdate(
      { date: today, userId: member.id },
      {
        $setOnInsert: {
          date: today,
          userId: member.id,
          yesterday: '',
          today: '',
          blockers: '',
          submittedAt: null
        },
        $set: { reminded: true }
      },
      { upsert: true, new: true }
    );
  }
}

function getRecentWeekdays(count, timezone = getTimezone()) {
  const result = [];
  let cursor = getNowInTimezone(timezone);

  while (result.length < count) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      result.unshift(getDateStringInTimezone(cursor, timezone));
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return result;
}

async function generateWeeklySummary(client) {
  const timezone = getTimezone();
  const guild = await getPrimaryGuild(client);
  if (!guild) {
    throw new Error('No guild available for weekly summary.');
  }

  const dates = getRecentWeekdays(5, timezone);
  const devMembers = await getDevMembers(guild);

  const records = await Standup.find({
    date: { $in: dates },
    userId: { $in: devMembers.map((member) => member.id) },
    submittedAt: { $ne: null }
  });

  const stats = new Map();
  for (const member of devMembers.values()) {
    stats.set(member.id, {
      userId: member.id,
      displayName: member.displayName,
      submissions: 0,
      blockers: 0,
      missedDays: dates.length
    });
  }

  for (const record of records) {
    const item = stats.get(record.userId);
    if (!item) continue;

    item.submissions += 1;
    item.missedDays = Math.max(0, item.missedDays - 1);

    if (record.blockers && !/^\s*(none|no blockers?)\s*$/i.test(record.blockers)) {
      item.blockers += 1;
    }
  }

  const allStats = [...stats.values()];
  allStats.sort((a, b) => b.submissions - a.submissions || a.displayName.localeCompare(b.displayName));

  const topContributors = allStats.filter((item) => item.submissions === allStats[0]?.submissions && item.submissions > 0);
  const missedStandups = allStats.filter((item) => item.missedDays > 0);

  return {
    dates,
    stats: allStats,
    topContributors,
    missedStandups
  };
}

async function postWeeklySummary(client) {
  const timezone = getTimezone();
  const now = getNowInTimezone(timezone);
  if (now.getDay() !== 5) return;

  const guild = await getPrimaryGuild(client);
  if (!guild) return;

  const managementChannelName = process.env.MANAGEMENT_CHANNEL_NAME || 'management';
  const managementChannel = await getTextChannelByName(guild, managementChannelName);
  if (!managementChannel) {
    console.error(`[standup] Channel #${managementChannelName} not found for weekly summary.`);
    return;
  }

  try {
    const summary = await generateWeeklySummary(client);
    const embed = buildStandupWeeklySummaryEmbed(summary);

    await managementChannel.send({ embeds: [embed] });
    await logTaskAction(guild, `📈 Weekly standup summary posted for ${summary.dates[0]} to ${summary.dates[4]}.`);
    console.log('[standup] Weekly summary posted.');
  } catch (error) {
    console.error('[standup] Failed to post weekly summary:', error);
  }
}

async function submitStandup({ guild, userId, date, yesterday, today, blockers, thread }) {
  const existing = await Standup.findOne({ date, userId });
  if (existing?.submittedAt) {
    throw new Error('You have already submitted standup for today.');
  }

  await Standup.findOneAndUpdate(
    { date, userId },
    {
      $set: {
        yesterday,
        today,
        blockers,
        submittedAt: new Date(),
        reminded: true
      },
      $setOnInsert: {
        date,
        userId
      }
    },
    { upsert: true, new: true }
  );

  const ackMessage = await thread.send({ content: `Standup submitted by <@${userId}>.` });
  await ackMessage.react('✅');

  await logTaskAction(guild, `✅ Standup submitted by <@${userId}> for ${date}.`);
}

function getActiveStandupDateByThreadId(threadId) {
  for (const [date, id] of activeStandupThreads.entries()) {
    if (id === threadId) {
      return date;
    }
  }

  return null;
}

async function resolveStandupDateForThread(guild, thread) {
  if (!thread || !thread.isThread()) return null;

  const mappedDate = getActiveStandupDateByThreadId(thread.id);
  if (mappedDate) {
    return mappedDate;
  }

  const dateFromName = parseStandupDateFromThreadName(thread.name);
  if (!dateFromName) {
    return null;
  }

  const today = getDateStringInTimezone();
  if (dateFromName !== today) {
    return null;
  }

  const standupChannelName = process.env.STANDUP_CHANNEL_NAME || 'standups';
  const standupChannel = await getTextChannelByName(guild, standupChannelName);
  if (!standupChannel || thread.parentId !== standupChannel.id) {
    return null;
  }

  activeStandupThreads.set(dateFromName, thread.id);
  return dateFromName;
}

function buildStandupModalCustomId(date) {
  return `standup_submit:${date}`;
}

function parseStandupModalCustomId(customId) {
  const match = String(customId || '').match(/^standup_submit:(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
}

function initializeStandupAutomation(client) {
  if (schedulerInitialized) return;
  schedulerInitialized = true;

  client.once('clientReady', async () => {
    try {
      await recoverTodayStandupThread(client);

      const timezone = getTimezone();
      const standupCron = toWeekdayCronExpression(process.env.STANDUP_TIME || '10:00');
      const reminderCron = '*/10 * * * 1-5';
      const summaryCron = toWeekdayCronExpression(process.env.STANDUP_WEEKLY_SUMMARY_TIME || '18:00').replace('1-5', '5');

      cron.schedule(
        standupCron,
        async () => {
          await postDailyStandup(client);
        },
        { timezone }
      );

      cron.schedule(
        reminderCron,
        async () => {
          await sendStandupReminders(client);
        },
        { timezone }
      );

      cron.schedule(
        summaryCron,
        async () => {
          await postWeeklySummary(client);
        },
        { timezone }
      );

      console.log(`[standup] Scheduler initialized. Standup: ${standupCron}, Summary: ${summaryCron}, TZ: ${timezone}`);
    } catch (error) {
      console.error('[standup] Failed to initialize scheduler:', error);
    }
  });
}

module.exports = {
  initializeStandupAutomation,
  resolveStandupDateForThread,
  buildStandupModalCustomId,
  parseStandupModalCustomId,
  submitStandup,
  postWeeklySummary,
  generateWeeklySummary
};
