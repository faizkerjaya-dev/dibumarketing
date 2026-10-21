// Semua operasi tulis ke Firestore ada di sini. Setiap fungsi log apa yang ditulis (nampak bila ?debug=1),
// jadi bila ada masalah, mula semak di fail ini.
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where,
  serverTimestamp, runTransaction, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { log } from './log';
import { AppError } from './errors';
import { nowIso, today, addDays, parseDate } from './dates';
import { uid } from './constants';

const by = (profile) => profile?.name || profile?.email || '';

export async function createDoc(name, data, profile) {
  log.info('create', name, data);
  const ref = await addDoc(collection(db, name), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: by(profile),
    updatedBy: by(profile),
  });
  return ref.id;
}

export async function updateById(name, id, data, profile) {
  log.info('update', `${name}/${id}`, data);
  await updateDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp(), updatedBy: by(profile) });
}

export async function setById(name, id, data, merge = true) {
  log.info('set', `${name}/${id}`, data);
  await setDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp() }, { merge });
}

export async function removeById(name, id) {
  log.warn('delete', `${name}/${id}`);
  await deleteDoc(doc(db, name, id));
}

// Kod berturutan seperti DBU-0001, guna transaction supaya tiada kod berganda.
export async function nextCode(counter, prefix, pad = 4) {
  return (await reserveCodes(counter, prefix, 1, pad))[0];
}

// Tempah beberapa kod sekaligus dalam SATU transaction.
// Penting untuk "Rancang sebulan": 66 slot tidak boleh buat 66 transaction berasingan.
export async function reserveCodes(counter, prefix, count, pad = 4) {
  const ref = doc(db, 'counters', counter);
  const start = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const from = (snap.exists() ? snap.data().next : 0) + 1;
    tx.set(ref, { next: from + count - 1 }, { merge: true });
    return from;
  });
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(start + i).padStart(pad, '0')}`);
}

// Log aktiviti dan notifikasi tidak menghentikan tindakan utama jika gagal.
export async function logActivity(profile, { type, message, refType, refId }) {
  try {
    await addDoc(collection(db, 'activity'), {
      type, message, refType: refType || null, refId: refId || null,
      actorUid: profile?.uid || null, actorName: by(profile),
      createdAt: serverTimestamp(), createdAtIso: nowIso(),
    });
  } catch (e) {
    log.warn('activity log gagal (tindakan utama tetap berjaya)', e);
  }
}

export async function notify(toUid, { title, body = '', link = '' }) {
  if (!toUid) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      toUid, title, body, link, read: false, createdAt: serverTimestamp(), createdAtIso: nowIso(),
    });
  } catch (e) {
    log.warn('notifikasi gagal dihantar', e);
  }
}

export async function notifyStaff(staffIds, staffById, payload, exceptUid) {
  const uids = [...new Set(staffIds.map((id) => staffById[id]?.userUid).filter(Boolean))].filter((u) => u !== exceptUid);
  await Promise.all(uids.map((u) => notify(u, payload)));
}

/* ---------------- Content: tambah cepat, slot, idea ---------------- */

// Rekod content yang paling minimum. Medan lain diisi kemudian.
function blankContent(extra = {}) {
  return {
    title: '', code: '', pillar: '', type: '', platform: '', product: '', campaignId: '', campaignName: '',
    objective: '', priority: 'medium', ownerStaffId: '', ownerName: '', status: '',
    publishAccount: '', publishDate: '', publishTime: '', publishUrl: '', publishedDate: '',
    brief: {}, checklist: {}, links: [], review: null, archived: false, isSlot: false,
    assigneeStaffIds: [], assigneeUids: [],
    ...extra,
  };
}

// Tambah cepat: tajuk + platform + tarikh sahaja. Dipanggil dari sel kalendar dan dari telefon.
export async function quickAddContent(data, { profile, staffById }) {
  const title = (data.title || '').trim();
  if (!title) throw new AppError('Tajuk tidak boleh kosong.');
  const owner = staffById[data.ownerStaffId];
  const code = await nextCode('content', 'DBU');
  const id = await createDoc('content', blankContent({
    ...data,
    title,
    code,
    ownerStaffId: data.ownerStaffId || '',
    ownerName: owner?.name || '',
    assigneeStaffIds: data.ownerStaffId ? [data.ownerStaffId] : [],
    assigneeUids: owner?.userUid ? [owner.userUid] : [],
  }), profile);
  await logActivity(profile, { type: 'content_created', message: `${by(profile)} tambah “${title}”`, refType: 'content', refId: id });
  return id;
}

// Isi slot kosong: slot bertukar jadi content sebenar sebaik sahaja ada tajuk.
export async function fillSlot(content, patch, { profile, staffById }) {
  const title = (patch.title || '').trim();
  if (!title) throw new AppError('Tajuk tidak boleh kosong.');
  const owner = staffById[patch.ownerStaffId || content.ownerStaffId];
  await updateById('content', content.id, {
    ...patch,
    title,
    isSlot: false,
    ownerStaffId: patch.ownerStaffId || content.ownerStaffId || '',
    ownerName: owner?.name || content.ownerName || '',
  }, profile);
}

// Rancang sebulan: tempah slot kosong mengikut kekerapan posting.
// Slot tidak dikira dalam laporan sehingga ia diberi tajuk.
export async function createSlots(plan, { profile, staffById, config }) {
  const { from, to, weekdays, perPlatform, ownerStaffId, rotatePillars, statusKey } = plan;
  if (!from || !to) throw new AppError('Isi tarikh mula dan tarikh tamat.');
  if (to < from) throw new AppError('Tarikh tamat mesti selepas tarikh mula.');
  if (!weekdays.length) throw new AppError('Pilih sekurang-kurangnya satu hari.');
  const entries = Object.entries(perPlatform).filter(([, n]) => Number(n) > 0);
  if (!entries.length) throw new AppError('Tetapkan sekurang-kurangnya satu platform.');

  const owner = staffById[ownerStaffId];
  const pillars = rotatePillars ? (config.pillars || []) : [];
  const labels = config.slotLabels || ['Slot'];
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = (parseDate(d).getDay() + 6) % 7; // 0 = Isnin
    if (!weekdays.includes(dow)) continue;
    entries.forEach(([platform, n]) => {
      for (let i = 0; i < Number(n); i += 1) {
        rows.push({ date: d, platform, label: labels[i % labels.length] || `Slot ${i + 1}` });
      }
    });
  }
  if (!rows.length) throw new AppError('Tiada tarikh yang padan dengan tetapan ini.');
  if (rows.length > 400) throw new AppError(`Tetapan ini akan cipta ${rows.length} slot. Pendekkan tempoh supaya tidak melebihi 400.`);

  const codes = await reserveCodes('content', 'DBU', rows.length);
  let batch = writeBatch(db);
  rows.forEach((r, i) => {
    batch.set(doc(collection(db, 'content')), {
      ...blankContent({
        code: codes[i],
        title: '',
        slotLabel: r.label,
        platform: r.platform,
        publishDate: r.date,
        status: statusKey,
        isSlot: true,
        pillar: pillars.length ? pillars[i % pillars.length] : '',
        ownerStaffId: ownerStaffId || '',
        ownerName: owner?.name || '',
        assigneeStaffIds: ownerStaffId ? [ownerStaffId] : [],
        assigneeUids: owner?.userUid ? [owner.userUid] : [],
      }),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: by(profile), updatedBy: by(profile),
    });
    if ((i + 1) % 400 === 0) { batch.commit(); batch = writeBatch(db); }
  });
  await batch.commit();
  await logActivity(profile, { type: 'slots_created', message: `${by(profile)} tempah ${rows.length} slot (${from} hingga ${to})`, refType: 'calendar', refId: null });
  log.info('slots created', rows.length);
  return rows.length;
}

// Buang slot kosong yang tidak jadi digunakan.
export async function deleteSlots(ids) {
  let batch = writeBatch(db);
  ids.forEach((id, i) => {
    batch.delete(doc(db, 'content', id));
    if ((i + 1) % 400 === 0) { batch.commit(); batch = writeBatch(db); }
  });
  await batch.commit();
}

// Bank idea: content tanpa tarikh terbit. Seret ke kalendar untuk beri tarikh.
export async function addIdea({ text, platform, statusKey }, { profile }) {
  const title = (text || '').trim();
  if (!title) throw new AppError('Tulis idea dahulu.');
  const code = await nextCode('content', 'DBU');
  return createDoc('content', blankContent({ title, code, platform: platform || '', status: statusKey, publishDate: '' }), profile);
}

export async function scheduleIdea(content, date, profile) {
  await updateById('content', content.id, { publishDate: date }, profile);
}

/* ---------------- Content ---------------- */

// Kira semula siapa yang terlibat dengan content (owner + semua staf bertugasan).
// Medan assigneeUids digunakan oleh Firestore rules untuk benarkan Content Creator baca content itu.
export async function syncAssignees(contentId, staffById) {
  const content = await getDoc(doc(db, 'content', contentId));
  if (!content.exists()) return;
  const snap = await getDocs(query(collection(db, 'tasks'), where('contentId', '==', contentId)));
  const ids = new Set(snap.docs.map((d) => d.data().staffId).filter(Boolean));
  if (content.data().ownerStaffId) ids.add(content.data().ownerStaffId);
  const staffIds = [...ids];
  const uids = [...new Set(staffIds.map((id) => staffById[id]?.userUid).filter(Boolean))];
  log.debug('syncAssignees', contentId, staffIds, uids);
  await updateDoc(doc(db, 'content', contentId), { assigneeStaffIds: staffIds, assigneeUids: uids });
}

function taskPayload(t, content, staff) {
  return {
    contentId: content?.id || null,
    contentCode: content?.code || '',
    contentTitle: content?.title || '',
    campaignId: content?.campaignId || t.campaignId || null,
    campaignName: content?.campaignName || t.campaignName || '',
    staffId: staff.id,
    staffName: staff.name,
    staffUid: staff.userUid || null,
    role: t.role || 'other',
    description: t.description || '',
    deadline: t.deadline || '',
    priority: t.priority || 'medium',
    status: t.status || 'todo',
    estHours: t.estHours === '' || t.estHours == null ? null : Number(t.estHours),
    notes: t.notes || '',
  };
}

export async function createContent(data, tasks, { profile, staffById }) {
  if (!data.title?.trim()) throw new AppError('Tajuk content wajib diisi.');
  if (!data.ownerStaffId) throw new AppError('Pilih pemilik content.');
  const code = data.code?.trim() || (await nextCode('content', 'DBU'));
  const owner = staffById[data.ownerStaffId];
  const id = await createDoc('content', {
    ...data,
    code,
    ownerName: owner?.name || '',
    assigneeStaffIds: [data.ownerStaffId],
    assigneeUids: owner?.userUid ? [owner.userUid] : [],
    checklist: {},
    links: [],
    review: null,
    archived: false,
  }, profile);
  const content = { id, code, ...data };
  const valid = tasks.filter((t) => t.staffId && staffById[t.staffId]);
  if (valid.length) {
    const batch = writeBatch(db);
    valid.forEach((t) => {
      batch.set(doc(collection(db, 'tasks')), {
        ...taskPayload(t, content, staffById[t.staffId]),
        assignedAt: nowIso(),
        history: [{ at: nowIso(), by: by(profile), text: `Ditugaskan kepada ${staffById[t.staffId].name}` }],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    await syncAssignees(id, staffById);
    await notifyStaff(valid.map((t) => t.staffId), staffById, { title: `Tugasan baharu: ${data.title}`, link: `/content/${id}` }, profile?.uid);
  }
  await logActivity(profile, { type: 'content_created', message: `${by(profile)} cipta “${data.title}”`, refType: 'content', refId: id });
  return id;
}

export async function saveTask(task, { profile, staffById, contentById, existing }) {
  const staff = staffById[task.staffId];
  if (!staff) throw new AppError('Pilih staf untuk tugasan ini.');
  const content = task.contentId ? contentById[task.contentId] : null;
  const payload = taskPayload(task, content, staff);
  let id = existing?.id;
  if (existing) {
    const history = [...(existing.history || [])];
    if (existing.staffId !== task.staffId) history.push({ at: nowIso(), by: by(profile), text: `Ditukar dari ${existing.staffName} kepada ${staff.name}` });
    if (existing.deadline !== payload.deadline) history.push({ at: nowIso(), by: by(profile), text: `Deadline ${existing.deadline || 'tiada'} → ${payload.deadline || 'tiada'}` });
    if (existing.status !== payload.status) history.push({ at: nowIso(), by: by(profile), text: `Status → ${payload.status}` });
    await updateById('tasks', id, { ...payload, history, completedAt: payload.status === 'done' ? existing.completedAt || today() : null }, profile);
  } else {
    id = await createDoc('tasks', {
      ...payload, assignedAt: nowIso(), completedAt: null,
      history: [{ at: nowIso(), by: by(profile), text: `Ditugaskan kepada ${staff.name}` }],
    }, profile);
  }
  if (payload.contentId) await syncAssignees(payload.contentId, staffById);
  if (!existing || existing.staffId !== task.staffId) {
    await notifyStaff([task.staffId], staffById, { title: `Tugasan baharu: ${payload.contentTitle || payload.description || payload.role}`, body: payload.deadline ? `Perlu siap ${payload.deadline}` : '', link: payload.contentId ? `/content/${payload.contentId}` : '/my-tasks' }, profile?.uid);
    await logActivity(profile, { type: 'staff_assigned', message: `${by(profile)} tugaskan ${staff.name} untuk ${payload.role}: “${payload.contentTitle || payload.description}”`, refType: payload.contentId ? 'content' : 'task', refId: payload.contentId || id });
  }
  return id;
}

export async function deleteTask(task, { staffById }) {
  await removeById('tasks', task.id);
  if (task.contentId) await syncAssignees(task.contentId, staffById);
}

// Content Creator kemas kini tugasan sendiri: hanya medan yang dibenarkan oleh rules.
export async function updateOwnTask(task, patch, profile) {
  const allowed = {};
  ['status', 'notes', 'actualHours'].forEach((k) => { if (k in patch) allowed[k] = patch[k]; });
  if (allowed.status) {
    allowed.completedAt = allowed.status === 'done' ? today() : null;
    allowed.history = [...(task.history || []), { at: nowIso(), by: by(profile), text: `Status → ${allowed.status}` }];
  }
  await updateById('tasks', task.id, allowed, profile);
}

export async function changeContentStatus(content, status, extra, { profile, staffById }) {
  await updateById('content', content.id, { status, ...extra }, profile);
  await logActivity(profile, { type: `content_${status}`, message: `${by(profile)} tukar status “${content.title}” kepada ${status}`, refType: 'content', refId: content.id });
  if (status === 'approval' || status === 'published') {
    await notifyStaff([content.ownerStaffId], staffById, { title: `“${content.title}” kini ${status}`, link: `/content/${content.id}` }, profile?.uid);
  }
}

export async function addComment({ targetType, targetId, thread = 'general', kind = 'comment', outcome = null, text, visibleUids = [] }, profile) {
  if (!text?.trim()) throw new AppError('Komen kosong.');
  return createDoc('comments', {
    targetType, targetId, thread, kind, outcome, text: text.trim(),
    authorUid: profile.uid, authorName: by(profile), visibleUids, createdAtIso: nowIso(),
  }, profile);
}

export async function saveReview(content, { outcome, comment, adjustStaffId, adjustDeadline }, ctx) {
  const { profile, staffById, contentById } = ctx;
  if (!outcome) throw new AppError('Pilih keputusan semakan.');
  let adjustmentTaskId = null;
  if (outcome === 'adjust' && adjustStaffId) {
    adjustmentTaskId = await saveTask({
      contentId: content.id, staffId: adjustStaffId, role: 'adjustment', description: comment || 'Adjust and repost',
      deadline: adjustDeadline || '', priority: 'high', status: 'todo',
    }, { profile, staffById, contentById });
  }
  const review = { outcome, comment: comment || '', byName: by(profile), byUid: profile.uid, at: nowIso(), adjustmentTaskId };
  await updateById('content', content.id, { review }, profile);
  const fresh = await getDoc(doc(db, 'content', content.id));
  await addComment({
    targetType: 'content', targetId: content.id, thread: 'review', kind: 'review', outcome,
    text: comment || `Ditanda ${outcome}`, visibleUids: fresh.data()?.assigneeUids || [],
  }, profile);
  await notifyStaff(fresh.data()?.assigneeStaffIds || [], staffById, { title: `Semakan: “${content.title}”`, body: outcome === 'fyp' ? 'FYP' : outcome === 'adjust' ? 'Perlu dibaiki' : 'Tak FYP', link: `/content/${content.id}?tab=review` }, profile?.uid);
  await logActivity(profile, { type: 'content_reviewed', message: `${by(profile)} semak “${content.title}”: ${outcome}`, refType: 'content', refId: content.id });
}

export async function addLink(content, link, profile) {
  if (!/^https?:\/\//i.test(link.url || '')) throw new AppError('Link mesti bermula dengan http:// atau https://');
  const links = [...(content.links || []), { id: uid(), label: link.label || link.url, url: link.url, category: link.category || '', addedBy: by(profile), addedAt: nowIso() }];
  await updateById('content', content.id, { links }, profile);
}

export async function removeLink(content, linkId, profile) {
  await updateById('content', content.id, { links: (content.links || []).filter((l) => l.id !== linkId) }, profile);
}

export async function saveMetrics(target, values, profile) {
  const clean = {};
  Object.entries(values).forEach(([k, v]) => { if (v !== '' && v != null && k !== 'date') clean[k] = Number(v); });
  if (!Object.keys(clean).length) throw new AppError('Isi sekurang-kurangnya satu angka.');
  return createDoc('metrics', {
    ...clean,
    targetType: target.type, targetId: target.id, campaignId: target.campaignId || null, creatorId: target.creatorId || null,
    date: values.date || today(), source: 'manual', enteredByName: by(profile), createdAtIso: nowIso(),
  }, profile);
}

/* ---------------- Users ---------------- */

// Pautkan akaun login (uid) kepada profil staf. Tugasan & content lama juga dikemas kini supaya
// Content Creator boleh nampak tugasan yang diassign sebelum akaun dia dicipta.
export async function linkStaffToUser(staffId, userUid, staffById) {
  const old = Object.values(staffById).find((s) => s.userUid === userUid && s.id !== staffId);
  if (old) await updateDoc(doc(db, 'staff', old.id), { userUid: null });
  if (!staffId) return;
  await updateDoc(doc(db, 'staff', staffId), { userUid });
  const snap = await getDocs(query(collection(db, 'tasks'), where('staffId', '==', staffId)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { staffUid: userUid }));
  await batch.commit();
  const freshMap = { ...staffById, [staffId]: { ...staffById[staffId], userUid } };
  const contentIds = new Set(snap.docs.map((d) => d.data().contentId).filter(Boolean));
  const owned = await getDocs(query(collection(db, 'content'), where('ownerStaffId', '==', staffId)));
  owned.docs.forEach((d) => contentIds.add(d.id));
  for (const cid of contentIds) await syncAssignees(cid, freshMap);
  log.info('linked staff', staffId, 'to user', userUid, 'content synced:', contentIds.size);
}

/* ---------------- Campaign creators & deliverables ---------------- */

// Nama kempen disalin ke rekod lain untuk paparan pantas. Bila nama berubah, kemas kini salinan itu.
export async function propagateCampaignName(campaignId, name) {
  const batch = writeBatch(db);
  for (const col of ['content', 'tasks', 'campaignCreators', 'deliverables']) {
    const snap = await getDocs(query(collection(db, col), where('campaignId', '==', campaignId)));
    snap.docs.forEach((d) => batch.update(d.ref, { campaignName: name }));
  }
  await batch.commit();
}

export async function assignCreator(campaign, creator, data, { profile, staffById }) {
  const id = `${campaign.id}__${creator.id}`;
  const exists = await getDoc(doc(db, 'campaignCreators', id));
  if (exists.exists()) throw new AppError(`${creator.name} sudah ada dalam kempen ini.`);
  await setDoc(doc(db, 'campaignCreators', id), {
    campaignId: campaign.id, campaignName: campaign.name, creatorId: creator.id, creatorName: creator.name,
    ownerStaffId: data.ownerStaffId || '', ownerName: staffById[data.ownerStaffId]?.name || '',
    fee: Number(data.fee) || 0, paidAmount: Number(data.paidAmount) || 0,
    contractStatus: data.contractStatus || 'none', paymentStatus: data.paymentStatus || 'unpaid',
    briefDate: data.briefDate || '', deadline: data.deadline || '', notes: data.notes || '',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: by(profile),
  });
  await logActivity(profile, { type: 'creator_assigned', message: `${by(profile)} tambah ${creator.name} ke ${campaign.name}`, refType: 'campaign', refId: campaign.id });
  return id;
}

export async function saveDeliverable(d, existing, profile) {
  if (!d.assignmentId) throw new AppError('Deliverable mesti ada creator assignment.');
  if (!d.type) throw new AppError('Pilih jenis deliverable.');
  if (existing) {
    await updateById('deliverables', existing.id, d, profile);
    return existing.id;
  }
  const code = await nextCode('deliverables', 'DLV');
  return createDoc('deliverables', { ...d, code, status: d.status || 'brief_sent', revisionCount: 0 }, profile);
}

// Aliran revisi: hanya deliverable ini berubah, deliverable lain creator yang sama tidak terjejas.
export async function deliverableAction(d, action, text, profile) {
  const map = {
    submit: { status: 'submitted', kind: 'submission', label: 'Draf dihantar' },
    revision: { status: 'revision', kind: 'revision_request', label: 'Minta pembetulan' },
    approve: { status: 'approved', kind: 'approval', label: 'Diluluskan' },
  };
  const a = map[action];
  if (!a) throw new AppError(`Tindakan tidak dikenali: ${action}`);
  const patch = { status: a.status };
  if (action === 'revision') patch.revisionCount = (d.revisionCount || 0) + 1;
  if (action === 'approve') patch.approvedDate = today();
  await updateById('deliverables', d.id, patch, profile);
  await addComment({ targetType: 'deliverable', targetId: d.id, thread: 'revision', kind: a.kind, text: text || a.label }, profile);
  await logActivity(profile, { type: `deliverable_${action}`, message: `${a.label}: ${d.creatorName} · ${d.type} (${d.campaignName})`, refType: 'campaign', refId: d.campaignId });
}
