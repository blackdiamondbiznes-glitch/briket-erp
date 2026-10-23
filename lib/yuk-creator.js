/**
 * /yuk yozuvchisi. Faqat tekshirilgan initData dagi user.
 * Token va initData ning o'zi shu yerga kelmaydi va logga yozilmaydi.
 */

const LEGACY_LABEL = 'Eski yozuv';

function clip(value, max) {
  if (value == null) return null;
  const s = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

function creatorFromUser(user) {
  if (!user || user.id == null || user.id === '') return null;
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

module.exports = {
  LEGACY_LABEL: LEGACY_LABEL,
  creatorFromUser: creatorFromUser,
  creatorLabel: creatorLabel,
  withCreatorName: withCreatorName,
};
