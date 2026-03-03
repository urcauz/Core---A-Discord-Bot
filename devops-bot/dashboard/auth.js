const { ACTIONS, checkPermission } = require('../services/permissionService');

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function getGuildId() {
  return process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
}

function createPseudoMember(roleNames) {
  const roles = (roleNames || []).map((name) => ({ name }));

  return {
    permissions: {
      has: () => false
    },
    roles: {
      cache: {
        some: (cb) => roles.some(cb)
      }
    }
  };
}

function canPerform(roleNames, action) {
  return checkPermission(createPseudoMember(roleNames), action);
}

function getDiscordAuthUrl() {
  const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds'
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const redirectUri = process.env.REDIRECT_URI;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Discord user (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchGuildMember(userId) {
  const guildId = getGuildId();
  const botToken = process.env.DISCORD_TOKEN;

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
    headers: {
      Authorization: `Bot ${botToken}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch guild member (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchGuildRoles() {
  const guildId = getGuildId();
  const botToken = process.env.DISCORD_TOKEN;

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
    headers: {
      Authorization: `Bot ${botToken}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch guild roles (${response.status}): ${text}`);
  }

  return response.json();
}

function resolveMemberRoleNames(memberRoleIds, guildRoles) {
  const roleNameById = new Map((guildRoles || []).map((role) => [role.id, role.name]));
  return (memberRoleIds || [])
    .map((id) => roleNameById.get(id))
    .filter(Boolean);
}

function requireSessionAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }

  return next();
}

function requireDashboardPermission(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }

  const ok = canPerform(req.session.user.roles, ACTIONS.VIEW_DASHBOARD);
  if (!ok) {
    return res.status(403).render('layout', {
      title: 'Access Denied',
      activePage: 'dashboard',
      user: req.session.user,
      bodyTemplate: 'dashboard',
      bodyData: {
        denied: true
      }
    });
  }

  return next();
}

function requireApiPermission(action) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const allowed = canPerform(req.session.user.roles, action || ACTIONS.VIEW_DASHBOARD_API);
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    return next();
  };
}

module.exports = {
  ACTIONS,
  getGuildId,
  getDiscordAuthUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  fetchGuildMember,
  fetchGuildRoles,
  resolveMemberRoleNames,
  canPerform,
  requireSessionAuth,
  requireDashboardPermission,
  requireApiPermission
};
