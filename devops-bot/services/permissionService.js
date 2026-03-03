const ACTIONS = Object.freeze({
  CREATE_TASK: 'CREATE_TASK',
  ASSIGN_TASK: 'ASSIGN_TASK',
  MOVE_TASK: 'MOVE_TASK',
  ARCHIVE_TASK: 'ARCHIVE_TASK'
});

const DEFAULT_ROLE_MAP = Object.freeze({
  CREATE_TASK: ['Founder', 'Lead Developer'],
  ASSIGN_TASK: ['Founder', 'Lead Developer'],
  MOVE_TASK: ['Founder', 'Lead Developer'],
  ARCHIVE_TASK: ['Founder', 'Lead Developer']
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
  checkPermission
};
