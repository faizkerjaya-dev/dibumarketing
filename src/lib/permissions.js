// Kebenaran di sisi UI. Ini hanya untuk sorok butang. Kawalan sebenar ada dalam firestore.rules.
// Pengguna boleh ada lebih dari satu role; kebenaran digabungkan.

const RULES = {
  'content.create': ['admin', 'marketing_manager', 'content_manager'],
  'content.edit': ['admin', 'marketing_manager', 'content_manager'],
  'content.delete': ['admin'],
  'content.review': ['admin', 'marketing_manager'],
  'content.approve': ['admin', 'marketing_manager'],
  'kpi.manage': ['admin', 'marketing_manager'],
  'stats.enter': ['admin', 'marketing_manager', 'content_manager', 'creator_manager'],
  'library.add': ['admin', 'marketing_manager', 'content_manager', 'creator_manager'],
  'task.assign': ['admin', 'marketing_manager', 'content_manager'],
  'staff.manage': ['admin', 'marketing_manager'],
  'creator.manage': ['admin', 'marketing_manager', 'creator_manager'],
  'campaign.manage': ['admin', 'marketing_manager'],
  'campaign.creators': ['admin', 'marketing_manager', 'creator_manager'],
  'metrics.enter': ['admin', 'marketing_manager', 'content_manager', 'creator_manager'],
  'settings.manage': ['admin'],
  'users.manage': ['admin'],
  'view.all': ['admin', 'marketing_manager', 'content_manager', 'creator_manager', 'viewer'],
};

export function hasRole(profile, ...roles) {
  return !!profile?.roles?.some((r) => roles.includes(r));
}

export function can(profile, action) {
  const allowed = RULES[action];
  if (!allowed) {
    console.warn('[Dibu] Unknown permission:', action);
    return false;
  }
  return hasRole(profile, ...allowed);
}

export const MANAGER_ROLES = ['admin', 'marketing_manager', 'content_manager', 'creator_manager'];

// Content Creator (tanpa role pengurus) hanya nampak content MILIK SENDIRI.
// Walaupun dia juga diberi role "viewer", dia tetap dihadkan kepada content sendiri,
// supaya creator tidak boleh melihat content creator lain.
export function isCreatorOnly(profile) {
  if (!profile) return false;
  if (hasRole(profile, ...MANAGER_ROLES)) return false;
  return hasRole(profile, 'content_creator') || !can(profile, 'view.all');
}
