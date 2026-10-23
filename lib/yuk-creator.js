/**
 * /yuk yozuvchisi. Telegram foydalanuvchisi yoki ERP admin sessiyasi.
 * Kalit, token va initData shu modulga kelmaydi va logga yozilmaydi.
 * Mijoz yuborgan created_by_* o'qilmaydi.
 */

const LEGACY_LABEL = 'Eski yozuv';

function clip(value, max) {
  if (value == null) return null;
  const s = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

function creatorFromUser(user) {
  if (!user || user.kind === 'erp-admin') return null;
  if (user.id == null || user.id === '') return null;
  const id = String(user.id).trim();
  if (!/^\d{1,20}$/.test(id)) return null;
  const username = clip(String(user.username || '').replace(/^@+/, ''), 32);
  return {
    telegramId: id,
    firstName: clip(user.first_name, 64),
    lastName: clip(user.last_name, 64),
    username: username,
  };
}

function creatorFromAdmin(name) {
  return {
    telegramId: null,
    firstName: clip(name, 64) || 'Admin',
    lastName: null,
    username: null,
  };
}

function creatorFromActor(actor) {
  if (!actor) return null;
  if (actor.kind === 'erp-admin') return creatorFromAdmin(actor.name);
  return creatorFromUser(actor);
}

function hasStoredCreator(row) {
  if (!row) return false;
  return !!(
    row.created_by_first_name ||
    row.created_by_last_name ||
    row.created_by_username ||
    row.created_by_telegram_id
  );
}

function creatorLabel(row) {
  if (!row) return LEGACY_LABEL;
  const name = [row.created_by_first_name, row.created_by_last_name]
    .map(function (part) { return part == null ? '' : String(part).trim(); })
    .filter(Boolean)
    .join(' ');
  if (name) return name;
  const username = row.created_by_username == null
    ? ''
    : String(row.created_by_username).trim().replace(/^@+/, '');
  if (username) return '@' + username;
  if (row.created_by_telegram_id) return String(row.created_by_telegram_id);
  return LEGACY_LABEL;
}

function withCreatorName(row) {
  if (!row || typeof row !== 'object') return row;
  row.created_by_name = creatorLabel(row);
  return row;
}

function creatorParams(creator) {
  if (!creator) return [null, null, null, null];
  return [
    creator.telegramId || null,
    creator.firstName || null,
    creator.lastName || null,
    creator.username || null,
  ];
}

module.exports = {
  LEGACY_LABEL: LEGACY_LABEL,
  creatorFromUser: creatorFromUser,
  creatorFromAdmin: creatorFromAdmin,
  creatorFromActor: creatorFromActor,
  creatorLabel: creatorLabel,
  withCreatorName: withCreatorName,
  creatorParams: creatorParams,
  hasStoredCreator: hasStoredCreator,
};
