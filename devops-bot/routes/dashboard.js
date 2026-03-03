const express = require('express');
const {
  ACTIONS,
  getDiscordAuthUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  fetchGuildMember,
  fetchGuildRoles,
  resolveMemberRoleNames,
  canPerform,
  requireSessionAuth,
  requireDashboardPermission
} = require('../dashboard/auth');

function createDashboardRouter() {
  const router = express.Router();

  router.get('/login', (req, res) => {
    return res.redirect(getDiscordAuthUrl());
  });

  router.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send('Missing OAuth code.');
    }

    try {
      const tokenData = await exchangeCodeForToken(code);
      const user = await fetchDiscordUser(tokenData.access_token);
      const member = await fetchGuildMember(user.id);

      if (!member) {
        return res.status(403).send('Access denied: user is not a member of this guild.');
      }

      const guildRoles = await fetchGuildRoles();
      const roleNames = resolveMemberRoleNames(member.roles, guildRoles);
      const allowed = canPerform(roleNames, ACTIONS.VIEW_DASHBOARD);

      if (!allowed) {
        return res.status(403).send('Access denied: missing required dashboard role.');
      }

      req.session.regenerate((err) => {
        if (err) {
          console.error('[dashboard] Session regenerate failed:', err);
          return res.status(500).send('Session initialization failed.');
        }

        req.session.user = {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          roles: roleNames,
          loginAt: new Date().toISOString()
        };

        return res.redirect('/dashboard');
      });
    } catch (error) {
      console.error('[dashboard] OAuth callback failed:', error);
      return res.status(500).send('Authentication failed.');
    }
  });

  router.get('/logout', requireSessionAuth, (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('[dashboard] Session destroy failed:', err);
      }
      res.clearCookie('core_dashboard.sid');
      return res.redirect('/login');
    });
  });

  router.get('/dashboard', requireDashboardPermission, (req, res) => {
    return res.render('layout', {
      title: 'Dashboard',
      activePage: 'dashboard',
      user: req.session.user,
      bodyTemplate: 'dashboard',
      bodyData: {}
    });
  });

  router.get('/dashboard/tasks', requireDashboardPermission, (req, res) => {
    return res.render('layout', {
      title: 'Tasks',
      activePage: 'tasks',
      user: req.session.user,
      bodyTemplate: 'tasks',
      bodyData: {}
    });
  });

  router.get('/dashboard/bugs', requireDashboardPermission, (req, res) => {
    return res.render('layout', {
      title: 'Bugs',
      activePage: 'bugs',
      user: req.session.user,
      bodyTemplate: 'bugs',
      bodyData: {}
    });
  });

  router.get('/dashboard/deployments', requireDashboardPermission, (req, res) => {
    return res.render('layout', {
      title: 'Deployments',
      activePage: 'deployments',
      user: req.session.user,
      bodyTemplate: 'deployments',
      bodyData: {}
    });
  });

  router.get('/dashboard/standups', requireDashboardPermission, (req, res) => {
    return res.render('layout', {
      title: 'Standups',
      activePage: 'standups',
      user: req.session.user,
      bodyTemplate: 'standups',
      bodyData: {}
    });
  });

  return router;
}

module.exports = {
  createDashboardRouter
};
