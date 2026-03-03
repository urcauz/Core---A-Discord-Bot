const ACTIONS = Object.freeze({
  CREATE_TASK: 'CREATE_TASK',
  ASSIGN_TASK: 'ASSIGN_TASK',
  MOVE_TASK: 'MOVE_TASK',
  ARCHIVE_TASK: 'ARCHIVE_TASK',
  CREATE_BUG: 'CREATE_BUG',
  ASSIGN_BUG: 'ASSIGN_BUG',
  MOVE_BUG: 'MOVE_BUG',
  SUBMIT_STANDUP: 'SUBMIT_STANDUP',
  VIEW_STANDUP_SUMMARY: 'VIEW_STANDUP_SUMMARY',
  VIEW_ANALYTICS_OVERVIEW: 'VIEW_ANALYTICS_OVERVIEW',
  VIEW_ANALYTICS_DETAILED: 'VIEW_ANALYTICS_DETAILED',
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_DASHBOARD_API: 'VIEW_DASHBOARD_API'
});

const DEFAULT_ROLE_MAP = Object.freeze({
  CREATE_TASK: ['Founder', 'Lead Developer'],
  ASSIGN_TASK: ['Founder', 'Lead Developer'],
  MOVE_TASK: ['Founder', 'Lead Developer'],
  ARCHIVE_TASK: ['Founder', 'Lead Developer'],
  CREATE_BUG: ['Founder', 'Lead Developer', 'QA', 'Developer', 'DevOps'],
  ASSIGN_BUG: ['Founder', 'Lead Developer', 'QA'],
  MOVE_BUG: ['Founder', 'Lead Developer', 'QA'],
  SUBMIT_STANDUP: ['Founder', 'Lead Developer', 'QA', 'Developer', 'DevOps'],
  VIEW_STANDUP_SUMMARY: ['Founder', 'Lead Developer'],
  VIEW_ANALYTICS_OVERVIEW: ['Founder', 'Lead Developer', 'QA', 'Developer', 'DevOps'],
  VIEW_ANALYTICS_DETAILED: ['Founder', 'Lead Developer'],
  VIEW_DASHBOARD: ['Founder', 'Lead Developer'],
  VIEW_DASHBOARD_API: ['Founder', 'Lead Developer']
});

function parseRoleList(value) {
  if (!value) return null;
  const roles = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return roles.length ? roles : null;
}

function resolveAllowedRoleNames(action) {
  const envKey = `${action}_ROLES`;
  return parseRoleList(process.env[envKey]) || DEFAULT_ROLE_MAP[action] || [];
}

function checkPermission(member, action) {
  if (!member || !action) return false;

  if (member.permissions?.has('Administrator')) {
    return true;
  }

  const allowedRoleNames = resolveAllowedRoleNames(action);
  if (!allowedRoleNames.length) return false;

  const normalizedAllowedNames = allowedRoleNames.map((name) => name.toLowerCase());

  return member.roles.cache.some((role) => normalizedAllowedNames.includes(role.name.toLowerCase()));
}

module.exports = {
  ACTIONS,
  checkPermission,
  getAllowedRoleNames: resolveAllowedRoleNames
};
