const express = require('express');
const { ACTIONS, requireApiPermission } = require('../../dashboard/auth');
const { getAllowedRoleNames } = require('../../services/permissionService');
const {
  getDateRange,
  getOverviewStats,
  getTaskStats,
  getBugStats,
  getStandupStats,
  getDeploymentStats
} = require('../../services/analyticsService');

async function getPrimaryGuild(client) {
  if (!client) return null;
  const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
  if (guildId) {
    try {
      return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
    } catch (error) {
      console.error(`[api/analytics] Failed to fetch guild ${guildId}:`, error);
    }
  }
  return client.guilds.cache.first() || null;
}

async function getDevTeamSize(client) {
  const guild = await getPrimaryGuild(client);
  if (!guild) return 0;

  const allowedRoles = getAllowedRoleNames(ACTIONS.SUBMIT_STANDUP).map((name) => name.toLowerCase());
  if (!allowedRoles.length) return 0;

  try {
    await guild.members.fetch();
  } catch (error) {
    console.error('[api/analytics] Failed to fetch guild members:', error);
    return 0;
  }

  return guild.members.cache.filter((member) => {
    if (member.user.bot) return false;
    return member.roles.cache.some((role) => allowedRoles.includes(role.name.toLowerCase()));
  }).size;
}

function createAnalyticsApiRouter(client) {
  const router = express.Router();

  router.get('/overview', requireApiPermission(ACTIONS.VIEW_ANALYTICS_OVERVIEW), async (req, res) => {
    try {
      const range = getDateRange(7);
      const devTeamSize = await getDevTeamSize(client);
      const stats = await getOverviewStats(range, { devTeamSize });
      return res.json({ ok: true, data: stats });
    } catch (error) {
      console.error('[api/analytics] overview failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load overview analytics' });
    }
  });

  router.get('/tasks', requireApiPermission(ACTIONS.VIEW_ANALYTICS_DETAILED), async (req, res) => {
    try {
      const range = getDateRange(30);
      const stats = await getTaskStats(range);
      return res.json({ ok: true, data: stats });
    } catch (error) {
      console.error('[api/analytics] tasks failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load task analytics' });
    }
  });

  router.get('/bugs', requireApiPermission(ACTIONS.VIEW_ANALYTICS_DETAILED), async (req, res) => {
    try {
      const range = getDateRange(30);
      const stats = await getBugStats(range);
      return res.json({ ok: true, data: stats });
    } catch (error) {
      console.error('[api/analytics] bugs failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load bug analytics' });
    }
  });

  router.get('/standups', requireApiPermission(ACTIONS.VIEW_ANALYTICS_DETAILED), async (req, res) => {
    try {
      const range = getDateRange(7);
      const devTeamSize = await getDevTeamSize(client);
      const stats = await getStandupStats(range, { devTeamSize });
      return res.json({ ok: true, data: stats });
    } catch (error) {
      console.error('[api/analytics] standups failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load standup analytics' });
    }
  });

  router.get('/deployments', requireApiPermission(ACTIONS.VIEW_ANALYTICS_DETAILED), async (req, res) => {
    try {
      const range = getDateRange(30);
      const stats = await getDeploymentStats(range);
      return res.json({ ok: true, data: stats });
    } catch (error) {
      console.error('[api/analytics] deployments failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load deployment analytics' });
    }
  });

  return router;
}

module.exports = {
  createAnalyticsApiRouter
};
