'use strict';

const STORE = {
  records: 'can-badminton-v1',
  players: 'can-badminton-players-v1',
  courts: 'can-badminton-courts-v1',
  audit: 'can-badminton-audit-v1',
  settings: 'can-badminton-settings-v1'
};
const DEFAULT_UNIT = 1000;
const DEFAULT_COURTS = ['Sân 01', 'Sân 02', 'Sân 03', 'Sân 04'];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const fmtMoney = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' ₫';
const makeId = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const isoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const localDateTime = value => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value || Date.now()));
const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value + 'T12:00:00')) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const parsed = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
  catch { return fallback; }
};

let state = {
  date: isoToday(),
  records: parsed(STORE.records, []),
  players: parsed(STORE.players, []),
  courts: parsed(STORE.courts, []),
  audit: parsed(STORE.audit, []),
  settings: { unit: DEFAULT_UNIT, manager: 'Quản lý' , ...parsed(STORE.settings, {}) },
  activeTab: 'home',
  historyFilter: 'all',
  pendingDelete: null,
  deferredPrompt: null
};
if (!Array.isArray(state.records)) state.records = [];
if (!Array.isArray(state.players)) state.players = [];
if (!Array.isArray(state.courts)) state.courts = [];
if (!Array.isArray(state.audit)) state.audit = [];

function persist() {
  localStorage.setItem(STORE.records, JSON.stringify(state.records));
  localStorage.setItem(STORE.players, JSON.stringify(state.players));
  localStorage.setItem(STORE.courts, JSON.stringify(state.courts));
  localStorage.setItem(STORE.audit, JSON.stringify(state.audit.slice(-2000)));
  localStorage.setItem(STORE.settings, JSON.stringify(state.settings));
}

function liveRecords(date = null) {
  return state.records.filter(record => !record.isDeleted && (!date || record.date === date));
}
function liveMatches(date = null) { return liveRecords(date).filter(record => record.type === 'match'); }
function liveDonations(date = null) { return liveRecords(date).filter(record => record.type === 'donation'); }
function livePlayers(date = null) { return state.players.filter(player => !player.isDeleted && (!date || player.date === date)); }
function courtsForDate(date = state.date) {
  const names = state.courts.filter(court => !court.isDeleted && court.date === date).map(court => court.name);
  return [...new Set([...DEFAULT_COURTS, ...names])];
}
function logAction(action, type, id, description) {
  state.audit.unshift({ id: makeId(), action, type, recordId: id, description, actor: state.settings.manager || 'Quản lý', at: new Date().toISOString() });
  state.audit = state.audit.slice(0, 2000);
}
function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 2600);
}
function empty(text) { return '<div class="empty-state">' + esc(text) + '</div>'; }

function contributionFor(match, unit = match.unitAmount || state.settings.unit || DEFAULT_UNIT) {
  const a = Number(match.scoreA) || 0;
  const b = Number(match.scoreB) || 0;
  const sideA = Array.isArray(match.teamA) ? match.teamA : [];
  const sideB = Array.isArray(match.teamB) ? match.teamB : [];
  const factorA = b;
  const factorB = a;
  const people = [
    ...sideA.map(player => ({ ...player, side: 'A', amount: factorA * unit / Math.max(sideA.length, 1) })),
    ...sideB.map(player => ({ ...player, side: 'B', amount: factorB * unit / Math.max(sideB.length, 1) }))
  ];
  const clubs = {};
  people.forEach(player => { const club = player.club || 'Chưa khai báo hội'; clubs[club] = (clubs[club] || 0) + player.amount; });
  return { people, clubs, total: people.reduce((sum, player) => sum + player.amount, 0) };
}

function render() {
  $('#selectedDate').value = state.date;
  const matches = liveMatches(state.date);
  const donations = liveDonations(state.date);
  const matchFund = matches.reduce((sum, match) => sum + (Number(match.totalFund) || contributionFor(match).total || 0), 0);
  const donationTotal = donations.reduce((sum, donation) => sum + (Number(donation.amount) || 0), 0);
  $('#matchCount').textContent = matches.length;
  $('#matchFund').textContent = fmtMoney(matchFund);
  $('#donationTotal').textContent = fmtMoney(donationTotal);
  $('#dayTotal').textContent = fmtMoney(matchFund + donationTotal);
  $('#historyDateBtn').textContent = fmtDate(state.date);
  renderRecent();
  renderHistory();
  renderRoster();
  renderStats();
  renderTrash();
  renderAudit();
  showTab(state.activeTab);
}

function recordSummary(record) {
  if (record.type === 'match') {
    if (record.teamA && record.teamB) {
      const a = record.teamA.map(player => player.name).join(' + ');
      const b = record.teamB.map(player => player.name).join(' + ');
      return { title: record.court + ' · ' + a + ' vs ' + b, meta: (record.matchMode === 'mixed' ? 'Xen kẽ' : 'Hai hội trực tiếp') + ' · ' + record.scoreA + '–' + record.scoreB, amount: Number(record.totalFund) || contributionFor(record).total, icon: '🏸' };
    }
    return { title: record.players || 'Trận đấu cũ', meta: record.score || 'Bản ghi cũ', amount: Number(record.amount) || 0, icon: '🏸' };
  }
  return { title: record.donor || 'Người đóng góp', meta: [record.entityType, record.method, record.content || record.note].filter(Boolean).join(' · ') || 'Quyên góp', amount: Number(record.amount) || 0, icon: '♥' };
}

function rowHtml(record, options = {}) {
  const summary = recordSummary(record);
  const actionMarkup = options.trash
    ? '<div class="record-actions"><button type="button" title="Khôi phục" aria-label="Khôi phục" data-restore="' + esc(record.id) + '">↶</button></div>'
    : '<div class="record-actions"><button type="button" title="Chỉnh sửa" aria-label="Chỉnh sửa" data-edit="' + esc(record.id) + '">✎</button><button type="button" class="delete-action" title="Chuyển vào thùng rác" aria-label="Chuyển vào thùng rác" data-delete="' + esc(record.id) + '">⌫</button></div>';
  const meta = options.trash ? 'Đã chuyển vào thùng rác · ' + localDateTime(record.deletedAt) : esc(summary.meta) + ' · ' + fmtDate(record.date);
  return '<article class="record-row"><span class="record-icon">' + summary.icon + '</span><div class="record-main"><strong class="record-title">' + esc(summary.title) + '</strong><small class="record-meta">' + meta + '</small></div><strong class="record-amount">' + fmtMoney(summary.amount) + '</strong>' + actionMarkup + '</article>';
}

function renderRecent() {
  const records = liveRecords(state.date).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')).slice(0, 5);
  $('#recentList').innerHTML = records.length ? records.map(record => rowHtml(record)).join('') : empty('Chưa có hoạt động nào trong ngày này.');
}
function renderHistory() {
  let records = liveRecords(state.date);
  if (state.historyFilter !== 'all') records = records.filter(record => record.type === state.historyFilter);
  records.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  $('#historyList').innerHTML = records.length ? records.map(record => rowHtml(record)).join('') : empty('Không có bản ghi phù hợp.');
}
function renderRoster() {
  const people = livePlayers(state.date);
  $('#rosterCount').textContent = people.length + ' người';
  $('#rosterList').innerHTML = people.length ? people.map(person =>
    '<article class="record-row"><span class="record-icon">♙</span><div class="record-main"><strong class="record-title">' + esc(person.name) + '</strong><small class="record-meta">' + esc(person.club || 'Chưa khai báo hội') + (person.gender ? ' · ' + esc(person.gender) : '') + '</small></div><div class="record-actions"><button type="button" data-edit-player="' + esc(person.id) + '" aria-label="Sửa người chơi">✎</button><button type="button" class="delete-action" data-delete-player="' + esc(person.id) + '" aria-label="Xóa người chơi">⌫</button></div></article>'
  ).join('') : empty('Chưa có người đăng ký cho ngày này.');
  $('#courtList').innerHTML = courtsForDate().map(name => '<span class="court-chip">' + esc(name) + '</span>').join('');
}
function renderStats() {
  const matches = liveMatches(state.date);
  const donations = liveDonations(state.date);
  const byClub = {};
  const byPlayer = {};
  let matchTotal = 0;
  matches.forEach(match => {
    const funds = contributionFor(match, match.unitAmount || state.settings.unit || DEFAULT_UNIT);
    matchTotal += Number(match.totalFund) || funds.total;
    funds.people.forEach(player => {
      const club = player.club || 'Chưa khai báo hội';
      const playerKey = player.name + ' · ' + club;
      byClub[club] = (byClub[club] || 0) + player.amount;
      byPlayer[playerKey] = (byPlayer[playerKey] || 0) + player.amount;
    });
  });
  const donationTotal = donations.reduce((sum, donation) => sum + Number(donation.amount || 0), 0);
  $('#statsMatches').textContent = matches.length;
  $('#statsDonations').textContent = donations.length;
  $('#statsMatchFund').textContent = fmtMoney(matchTotal);
  $('#statsTotal').textContent = fmtMoney(matchTotal + donationTotal);
  $('#clubStats').innerHTML = Object.keys(byClub).length ? Object.entries(byClub).sort((a,b) => b[1]-a[1]).map(([name, amount]) => '<article class="record-row"><div class="record-main"><strong class="record-title">' + esc(name) + '</strong></div><strong class="record-amount">' + fmtMoney(amount) + '</strong></article>').join('') : empty('Chưa có tiền quỹ từ trận đấu.');
  $('#playerStats').innerHTML = Object.keys(byPlayer).length ? Object.entries(byPlayer).sort((a,b) => b[1]-a[1]).map(([name, amount]) => '<article class="record-row"><div class="record-main"><strong class="record-title">' + esc(name) + '</strong></div><strong class="record-amount">' + fmtMoney(amount) + '</strong></article>').join('') : empty('Chưa có thống kê cá nhân.');
}
function renderTrash() {
  const items = [
    ...state.records.filter(record => record.isDeleted).map(record => ({ ...record, trashType:'record' })),
    ...state.players.filter(player => player.isDeleted).map(player => ({ ...player, type:'player', trashType:'player' }))
  ].sort((a,b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  $('#trashList').innerHTML = items.length ? items.map(item => item.trashType === 'player'
    ? '<article class="record-row"><span class="record-icon">♙</span><div class="record-main"><strong class="record-title">' + esc(item.name) + '</strong><small class="record-meta">Người chơi · ' + esc(item.club || 'Chưa khai báo hội') + ' · Đã xóa ' + localDateTime(item.deletedAt) + '</small></div><div class="record-actions"><button type="button" data-restore-player="' + esc(item.id) + '" aria-label="Khôi phục người chơi">↶</button></div></article>'
    : rowHtml(item, { trash:true })).join('') : empty('Thùng rác đang trống.');
}
function renderAudit() {
  $('#auditList').innerHTML = state.audit.length ? state.audit.slice(0,100).map(item =>
    '<article class="record-row"><span class="record-icon">◷</span><div class="record-main"><strong class="record-title">' + esc(item.actor) + ' · ' + esc(item.action) + '</strong><small class="record-meta">' + esc(item.description) + ' · ' + localDateTime(item.at) + '</small></div></article>'
  ).join('') : empty('Chưa có thao tác nào được ghi nhận.');
}

function showTab(tab) {
  state.activeTab = tab;
  ['history','roster','stats','trash','more','audit'].forEach(name => {
    const section = $('#tab-' + name);
    if (section) section.hidden = tab !== name;
  });
  $('#home').hidden = tab !== 'home';
  $('.date-head').hidden = tab === 'trash' || tab === 'audit';
  $('.metrics').hidden = tab !== 'home';
  $('.quick-grid').hidden = tab !== 'home';
  $('.app-shell > .panel:not(.section-panel)').hidden = tab !== 'home';
  const navTab = ['stats','trash','audit'].includes(tab) ? 'more' : tab;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === navTab));
  persist();
}

function openModal(dialog) { if (!dialog.open) dialog.showModal(); }
function closeModal(dialog) { if (dialog.open) dialog.close(); }
function field(name, label, type = 'text', value = '', attrs = '') {
  return '<label class="field-label">' + esc(label) + '<input name="' + esc(name) + '" type="' + esc(type) + '" value="' + esc(value) + '" ' + attrs + ' /></label>';
}
function clubOptions(selected = '') {
  const clubs = [...new Set(livePlayers(state.date).map(player => player.club).filter(Boolean))];
  if (selected && !clubs.includes(selected)) clubs.push(selected);
  return '<option value="">Chọn người chơi</option>' + livePlayers(state.date).map(player => '<option value="' + esc(player.id) + '" ' + (player.club === selected ? '' : '') + '>' + esc(player.name) + ' · ' + esc(player.club || 'Chưa có hội') + '</option>').join('');
}
function playerSelect(name, selectedId = '') {
  return '<label class="field-label">Người chơi<select name="' + name + '" required>' + livePlayers(state.date).map(player => '<option value="' + esc(player.id) + '" ' + (player.id === selectedId ? 'selected' : '') + '>' + esc(player.name) + ' · ' + esc(player.club || 'Chưa có hội') + '</option>').join('') + '</select></label>';
}

function matchPreview(teamA, teamB, scoreA, scoreB, mode, unit = state.settings.unit || DEFAULT_UNIT) {
  if (teamA.length !== 2 || teamB.length !== 2 || !Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA === scoreB) return null;
  return contributionFor({ teamA, teamB, scoreA, scoreB, matchMode: mode }, unit);
}
function paintPreview() {
  const form = $('#entryForm');
  if (form.dataset.kind !== 'match') return;
  const playersById = Object.fromEntries(livePlayers(state.date).map(player => [player.id, player]));
  const teamA = [form.elements.p1?.value, form.elements.p2?.value].map(id => playersById[id]).filter(Boolean);
  const teamB = [form.elements.p3?.value, form.elements.p4?.value].map(id => playersById[id]).filter(Boolean);
  const scoreA = Number(form.elements.scoreA?.value);
  const scoreB = Number(form.elements.scoreB?.value);
  const mode = form.elements.matchMode?.value || 'direct';
  const existing = form.dataset.existingJson ? JSON.parse(form.dataset.existingJson) : null;
  const preview = matchPreview(teamA, teamB, scoreA, scoreB, mode, existing?.unitAmount || state.settings.unit || DEFAULT_UNIT);
  const box = $('#previewBox');
  if (!preview) { box.hidden = true; box.innerHTML = ''; return; }
  const people = preview.people.map(player => '<div class="preview-line"><span>' + esc(player.name) + ' · ' + esc(player.club || 'Chưa khai báo hội') + '</span><b>' + fmtMoney(player.amount) + '</b></div>').join('');
  const clubs = Object.entries(preview.clubs).map(([club, amount]) => '<div class="preview-line"><span>' + esc(club) + ' đóng</span><b>' + fmtMoney(amount) + '</b></div>').join('');
  box.innerHTML = '<h3>Ước tính tiền gây quỹ</h3><div class="preview-grid">' + people + clubs + '</div><div class="preview-total"><span>Tổng quỹ trận</span><span>' + fmtMoney(preview.total) + '</span></div>';
  box.hidden = false;
}

function openForm(kind, existing = null) {
  const form = $('#entryForm');
  const body = $('#formBody');
  const legacyMatch = kind === 'match' && existing && !existing.teamA;
  form.dataset.kind = kind;
  form.dataset.editId = existing?.id || '';
  $('#previewBox').hidden = true;
  $('#formEyebrow').textContent = existing ? 'CHỈNH SỬA' : 'THÊM MỚI';
  $('#formTitle').textContent = kind === 'match' ? (legacyMatch ? 'Sửa trận cũ' : 'Ghi nhận trận đấu') : kind === 'donation' ? 'Ghi nhận quyên góp' : kind === 'player' ? 'Đăng ký người chơi' : 'Thêm sân thi đấu';
  if (kind === 'match' && !legacyMatch) {
    if (livePlayers(state.date).length < 4) {
      body.innerHTML = '<p class="field-help full">Cần đăng ký ít nhất 4 người cho ngày này trước khi ghi trận.</p><button type="button" class="secondary-button full" data-go-roster>Đến danh sách người chơi</button>';
    } else {
      const roster = livePlayers(state.date);
      const playersById = Object.fromEntries(roster.map(player => [player.id, player]));
      const teams = existing ? [existing.teamA, existing.teamB] : [[],[]];
      let defaultMode = existing?.matchMode || 'direct';
      let current = [teams[0]?.[0]?.id, teams[0]?.[1]?.id, teams[1]?.[0]?.id, teams[1]?.[1]?.id];
      if (!existing) {
        const clubs = [...new Set(roster.map(player => player.club || 'Chưa khai báo hội'))];
        const groups = clubs.map(club => roster.filter(player => (player.club || 'Chưa khai báo hội') === club));
        const directGroups = groups.filter(group => group.length >= 2);
        if (directGroups.length >= 2) {
          current = [directGroups[0][0].id, directGroups[0][1].id, directGroups[1][0].id, directGroups[1][1].id];
        } else if (groups.length >= 2 && groups[0].length >= 2 && groups[1].length >= 2) {
          current = [groups[0][0].id, groups[1][0].id, groups[0][1].id, groups[1][1].id];
          defaultMode = 'mixed';
        } else {
          current = roster.slice(0, 4).map(player => player.id);
          defaultMode = 'mixed';
        }
      }
      body.innerHTML =
        '<label class="field-label">Kiểu trận<select name="matchMode"><option value="direct">Hai hội đấu trực tiếp</option><option value="mixed">Đánh đôi xen kẽ</option></select></label>' +
        '<label class="field-label">Sân<select name="court" required>' + courtsForDate().map(court => '<option ' + (court === (existing?.court || DEFAULT_COURTS[0]) ? 'selected' : '') + '>' + esc(court) + '</option>').join('') + '</select></label>' +
        '<div class="team-card"><h3>Đội A · Điểm <input class="inline-score" name="scoreA" type="number" inputmode="numeric" min="0" step="1" required value="' + esc(existing?.scoreA ?? '') + '"></h3><div class="team-grid">' + [0,1].map(i => playerSelect('p' + (i+1), current[i])).join('') + '</div></div>' +
        '<div class="team-card"><h3>Đội B · Điểm <input class="inline-score" name="scoreB" type="number" inputmode="numeric" min="0" step="1" required value="' + esc(existing?.scoreB ?? '') + '"></h3><div class="team-grid">' + [2,3].map(i => playerSelect('p' + (i+1), current[i])).join('') + '</div></div>' +
        field('note', 'Ghi chú', 'text', existing?.note || '', 'maxlength="500"') +
        '<p class="field-help full">Mỗi đội đóng theo điểm của đội đối phương; khoản đóng được chia đều cho 2 thành viên. 1 điểm = ' + fmtMoney(state.settings.unit || DEFAULT_UNIT) + '.</p>';
      body.querySelector('[name="matchMode"]').value = defaultMode;
      body.querySelectorAll('select').forEach(select => select.addEventListener('change', paintPreview));
      body.querySelectorAll('input').forEach(input => input.addEventListener('input', paintPreview));
    }
  } else if (kind === 'match') {
    body.innerHTML = field('date','Ngày thi đấu','date',existing?.date || state.date,'required') +
      field('players','Người chơi / đội','text',existing?.players || '','required maxlength="180"') +
      field('score','Kết quả','text',existing?.score || '','required maxlength="100"') +
      '<label class="field-label full">Ghi chú<textarea name="note" maxlength="500">' + esc(existing?.note || '') + '</textarea></label>' +
      '<p class="field-help full">Bản ghi cũ không có đủ dữ liệu thành viên để tự tính lại quỹ. Hãy ghi trận mới bằng biểu mẫu đội A / đội B.</p>';
  } else if (kind === 'donation') {
    body.innerHTML = field('date','Ngày đóng góp','date',existing?.date || state.date,'required') +
      field('donor','Người đóng góp','text',existing?.donor || '','required maxlength="120"') +
      '<label class="field-label">Đối tượng<select name="entityType"><option>Cá nhân</option><option>Tổ chức</option><option>Hội / nhóm</option></select></label>' +
      field('amount','Số tiền (đồng)','number',existing?.amount ?? '','required min="1" step="1000" inputmode="numeric"') +
      '<label class="field-label">Hình thức<select name="method"><option value="">Chọn hình thức</option><option>Tiền mặt</option><option>Chuyển khoản</option><option>Khác</option></select></label>' +
      field('content','Nội dung','text',existing?.content || '','maxlength="180"') +
      field('evidenceUrl','Link hình ảnh minh chứng','url',existing?.evidenceUrl || '','maxlength="500"') +
      '<label class="field-label full">Ghi chú<textarea name="note" maxlength="500">' + esc(existing?.note || '') + '</textarea></label>';
    body.querySelector('[name="entityType"]').value = existing?.entityType || 'Cá nhân';
    body.querySelector('[name="method"]').value = existing?.method || '';
  } else if (kind === 'player') {
    body.innerHTML = field('date','Ngày thi đấu','date',existing?.date || state.date,'required') +
      field('name','Tên người chơi','text',existing?.name || '','required maxlength="100"') +
      field('club','Hội / nhóm','text',existing?.club || '','required maxlength="100" list="clubsList"') +
      '<datalist id="clubsList">' + [...new Set(state.players.map(p => p.club).filter(Boolean))].map(club => '<option value="' + esc(club) + '"></option>').join('') + '</datalist>' +
      '<label class="field-label">Giới tính<select name="gender"><option value="">Chưa khai báo</option><option>Nam</option><option>Nữ</option><option>Khác</option></select></label>' +
      field('phone','Số điện thoại','tel',existing?.phone || '','maxlength="30"') +
      field('note','Ghi chú','text',existing?.note || '','maxlength="200"');
    body.querySelector('[name="gender"]').value = existing?.gender || '';
  } else {
    body.innerHTML = field('date','Ngày thi đấu','date',state.date,'required') + field('name','Tên sân','text','','required maxlength="80"');
  }
  if (existing) {
    Object.entries(existing).forEach(([key,value]) => {
      const input = form.elements.namedItem(key);
      if (input && !['date','entityType','method','gender','matchMode'].includes(key)) input.value = value ?? '';
    });
  }
  form.dataset.existingJson = existing ? JSON.stringify(existing) : '';
  openModal($('#entryModal'));
  if (kind === 'match' && !legacyMatch) paintPreview();
}

function validateMatch(mode, teamA, teamB, scoreA, scoreB) {
  if (teamA.length !== 2 || teamB.length !== 2) throw new Error('Chọn đủ 4 người chơi.');
  const allIds = [...teamA, ...teamB].map(player => player.id);
  if (new Set(allIds).size !== 4) throw new Error('Mỗi trận cần 4 người chơi khác nhau.');
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA === scoreB) throw new Error('Điểm phải là số nguyên không âm và hai đội không được hòa.');
  const clubsA = teamA.map(player => player.club || 'Chưa khai báo hội');
  const clubsB = teamB.map(player => player.club || 'Chưa khai báo hội');
  if (mode === 'direct' && (clubsA[0] !== clubsA[1] || clubsB[0] !== clubsB[1] || clubsA[0] === clubsB[0])) throw new Error('Trận trực tiếp cần mỗi đội cùng hội và hai hội khác nhau.');
  if (mode === 'mixed' && (new Set([...clubsA, ...clubsB]).size !== 2 || clubsA[0] === clubsA[1] || clubsB[0] === clubsB[1] || clubsA[0] !== clubsB[0] && clubsA[0] !== clubsB[1] || clubsA[1] !== clubsB[0] && clubsA[1] !== clubsB[1])) throw new Error('Trận xen kẽ cần mỗi đội có một người từ mỗi trong cùng hai hội.');
}

function upsertRecord(record, kind) {
  const old = state.records.find(item => item.id === record.id);
  if (old) state.records = state.records.map(item => item.id === record.id ? { ...record, version: (Number(old.version) || 1) + 1 } : item);
  else state.records.unshift({ ...record, version: 1 });
  logAction(old ? 'Đã chỉnh sửa' : 'Đã tạo', kind, record.id, kind === 'trận đấu' ? (record.court + ' · ' + record.scoreA + '–' + record.scoreB) : (record.donor + ' · ' + fmtMoney(record.amount)));
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.dataset.kind;
  const existing = form.dataset.existingJson ? JSON.parse(form.dataset.existingJson) : null;
  const data = Object.fromEntries(new FormData(form));
  try {
    if (kind === 'match') {
      let record;
      if (!data.matchMode) {
        record = { ...existing, ...data, type:'match', id:existing?.id || makeId(), updatedAt:new Date().toISOString() };
      } else {
        const people = Object.fromEntries(livePlayers(data.date || state.date).map(player => [player.id, player]));
        const teamA = [people[data.p1], people[data.p2]].filter(Boolean).map(player => ({ id:player.id, name:player.name, club:player.club }));
        const teamB = [people[data.p3], people[data.p4]].filter(Boolean).map(player => ({ id:player.id, name:player.name, club:player.club }));
        const scoreA = Number(data.scoreA), scoreB = Number(data.scoreB);
        validateMatch(data.matchMode, teamA, teamB, scoreA, scoreB);
        const unitAmount = existing?.unitAmount || state.settings.unit || DEFAULT_UNIT;
        const item = { id:existing?.id || makeId(), type:'match', date:state.date, court:data.court, matchMode:data.matchMode, teamA, teamB, scoreA, scoreB, unitAmount, note:data.note.trim(), manager:state.settings.manager, createdAt:existing?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
        const sums = contributionFor(item, unitAmount);
        record = { ...item, contributions:sums.people, clubContributions:sums.clubs, totalFund:sums.total };
      }
      upsertRecord(record, 'trận đấu');
      persist(); closeModal($('#entryModal')); render(); toast(existing ? 'Đã cập nhật trận đấu.' : 'Đã lưu trận đấu.');
      return;
    }
    if (kind === 'donation') {
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nhập số tiền lớn hơn 0.');
      const record = { ...existing, ...data, type:'donation', amount, id:existing?.id || makeId(), manager:state.settings.manager, createdAt:existing?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
      upsertRecord(record, 'khoản quyên góp');
      persist(); closeModal($('#entryModal')); render(); toast(existing ? 'Đã cập nhật khoản quyên góp.' : 'Đã lưu khoản quyên góp.');
      return;
    }
    if (kind === 'player') {
      const record = { ...existing, ...data, id:existing?.id || makeId(), manager:state.settings.manager, createdAt:existing?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
      if (existing) state.players = state.players.map(player => player.id === existing.id ? record : player);
      else state.players.unshift(record);
      logAction(existing ? 'Đã chỉnh sửa' : 'Đã đăng ký', 'người chơi', record.id, record.name + ' · ' + record.club);
      persist(); closeModal($('#entryModal')); render(); toast(existing ? 'Đã cập nhật người chơi.' : 'Đã đăng ký người chơi.');
      return;
    }
    if (kind === 'court') {
      const name = data.name.trim();
      if (courtsForDate(data.date).includes(name)) throw new Error('Sân này đã có trong danh sách ngày.');
      const court = { id:makeId(), date:data.date, name, manager:state.settings.manager, createdAt:new Date().toISOString() };
      state.courts.unshift(court); logAction('Đã thêm', 'sân', court.id, court.name + ' · ' + fmtDate(court.date));
      persist(); closeModal($('#entryModal')); render(); toast('Đã thêm sân.');
    }
  } catch (error) { toast(error.message || 'Không thể lưu dữ liệu.'); }
}

function askDelete(id, type = 'record') {
  const record = type === 'player' ? state.players.find(item => item.id === id) : state.records.find(item => item.id === id);
  if (!record) return;
  state.pendingDelete = { id, type };
  const summary = type === 'player' ? { title:record.name + ' · ' + (record.club || 'Chưa khai báo hội'), amount:0 } : recordSummary(record);
  const score = record.type === 'match' && record.teamA ? ' · Tỷ số ' + record.scoreA + '–' + record.scoreB : '';
  $('#deleteSummary').textContent = summary.title + ' · ' + fmtDate(record.date) + score + ' · ' + fmtMoney(summary.amount) + '. Bản ghi sẽ chuyển vào thùng rác và được loại khỏi thống kê.';
  openModal($('#confirmModal'));
}
function confirmDelete() {
  const pending = state.pendingDelete;
  if (!pending) return;
  const list = pending.type === 'player' ? state.players : state.records;
  const item = list.find(row => row.id === pending.id);
  if (!item) return;
  const deleted = { ...item, isDeleted:true, deletedAt:new Date().toISOString(), deletedBy:state.settings.manager, updatedAt:new Date().toISOString() };
  if (pending.type === 'player') state.players = state.players.map(row => row.id === item.id ? deleted : row);
  else state.records = state.records.map(row => row.id === item.id ? deleted : row);
  const description = pending.type === 'player' ? item.name : recordSummary(item).title;
  logAction('Đã chuyển vào thùng rác', pending.type === 'player' ? 'người chơi' : item.type === 'match' ? 'trận đấu' : 'khoản quyên góp', item.id, description);
  persist(); state.pendingDelete = null; closeModal($('#confirmModal')); render(); toast('Đã chuyển bản ghi vào thùng rác.');
}
function restore(id) {
  const item = state.records.find(record => record.id === id && record.isDeleted);
  if (!item) return;
  const restored = { ...item, isDeleted:false, deletedAt:null, deletedBy:null, updatedAt:new Date().toISOString() };
  state.records = state.records.map(record => record.id === id ? restored : record);
  logAction('Đã khôi phục', item.type === 'match' ? 'trận đấu' : 'khoản quyên góp', item.id, recordSummary(restored).title);
  persist(); render(); toast('Đã khôi phục bản ghi.');
}
function restorePlayer(id) {
  const player = state.players.find(item => item.id === id && item.isDeleted);
  if (!player) return;
  state.players = state.players.map(item => item.id === id ? { ...item, isDeleted:false, deletedAt:null, deletedBy:null, updatedAt:new Date().toISOString() } : item);
  logAction('Đã khôi phục', 'người chơi', id, player.name);
  persist(); render(); toast('Đã khôi phục người chơi.');
}

function exportBackup() {
  const backup = { app:'C A N Badminton', schemaVersion:2, exportedAt:new Date().toISOString(), records:state.records, players:state.players, courts:state.courts, audit:state.audit, settings:state.settings };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'can-badminton-backup-' + state.date + '.json'; link.click();
  URL.revokeObjectURL(url); toast('Đã tải bản sao lưu.');
}
async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.players)) throw new Error('Tệp không đúng định dạng bản sao lưu.');
    if (!confirm('Nhập và gộp ' + data.records.length + ' bản ghi cùng ' + data.players.length + ' người chơi vào dữ liệu trên thiết bị này?')) return;
    const merge = (current, incoming) => {
      const map = new Map(current.map(item => [item.id, item]));
      incoming.forEach(item => { if (item?.id) map.set(item.id, item); });
      return [...map.values()];
    };
    state.records = merge(state.records, data.records);
    state.players = merge(state.players, data.players);
    state.courts = merge(state.courts, data.courts || []);
    state.audit = merge(state.audit, data.audit || []);
    logAction('Đã nhập', 'bản sao lưu', '', file.name);
    persist(); render(); toast('Đã nhập bản sao lưu.');
  } catch (error) { toast(error.message || 'Không đọc được tệp.'); }
}

function bindEvents() {
  $('#selectedDate').addEventListener('change', event => { state.date = event.target.value || isoToday(); render(); });
  $('#entryForm').addEventListener('submit', onSubmit);
  $('#confirmDelete').addEventListener('click', confirmDelete);
  $('#managerBtn').addEventListener('click', () => {
    $('#managerForm').elements.manager.value = state.settings.manager || '';
    openModal($('#managerModal'));
  });
  $('#managerForm').addEventListener('submit', event => {
    event.preventDefault(); state.settings.manager = event.currentTarget.elements.manager.value.trim() || 'Quản lý';
    persist(); closeModal($('#managerModal')); render(); toast('Đã lưu tên người nhập.');
  });
  $('#unitAmount').value = state.settings.unit || DEFAULT_UNIT;
  $('#unitAmount').addEventListener('change', event => {
    const unit = Number(event.target.value);
    if (!Number.isFinite(unit) || unit < 1) { event.target.value = state.settings.unit || DEFAULT_UNIT; return toast('Đơn vị quy đổi phải lớn hơn 0.'); }
    state.settings.unit = unit; persist(); render(); toast('Đã cập nhật đơn vị quy đổi.');
  });
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importInput').addEventListener('change', event => importBackup(event.target.files[0]).finally(() => { event.target.value = ''; }));
  $('#historyDateBtn').addEventListener('click', () => $('#selectedDate').showPicker?.());
  $$('.app-shell [data-open], .bottom-nav [data-open]').forEach(button => button.addEventListener('click', () => openForm(button.dataset.open)));
  $$('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('dialog'))));
  $$('.filter-chip').forEach(button => button.addEventListener('click', () => {
    state.historyFilter = button.dataset.filter;
    $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip === button));
    renderHistory();
  }));
  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) { const item = state.records.find(record => record.id === edit.dataset.edit); if (item) openForm(item.type, item); return; }
    const remove = event.target.closest('[data-delete]');
    if (remove) { askDelete(remove.dataset.delete); return; }
    const restoreButton = event.target.closest('[data-restore]');
    if (restoreButton) { restore(restoreButton.dataset.restore); return; }
    const restorePerson = event.target.closest('[data-restore-player]');
    if (restorePerson) { restorePlayer(restorePerson.dataset.restorePlayer); return; }
    const editPlayer = event.target.closest('[data-edit-player]');
    if (editPlayer) { const person = state.players.find(item => item.id === editPlayer.dataset.editPlayer); if (person) openForm('player', person); return; }
    const deletePlayer = event.target.closest('[data-delete-player]');
    if (deletePlayer) { askDelete(deletePlayer.dataset.deletePlayer, 'player'); return; }
    if (event.target.closest('[data-go-roster]')) { closeModal($('#entryModal')); showTab('roster'); }
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!state.deferredPrompt) return toast('Dùng menu trình duyệt để thêm ứng dụng vào màn hình chính.');
    state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null;
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.deferredPrompt = event; $('#installBtn').hidden = false; });
  window.addEventListener('storage', event => { if (Object.values(STORE).includes(event.key)) { state.records = parsed(STORE.records, []); state.players = parsed(STORE.players, []); render(); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

bindEvents();
render();

