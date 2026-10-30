// Panel sisi untuk tambah atau brief content. Dua mod dalam panel yang sama:
//   cepat  = tajuk, platform, tarikh. Untuk isi banyak content.
//   penuh  = tambah masa, kategori, topik, hook, konsep dan tugaskan staf.
// Tiada medan dibuang; mod penuh membukanya bila diperlukan.
import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { quickAddContent, fillSlot, saveTask } from '../lib/db';
import { statusList, statusForStage, findStatus } from '../lib/statuses';
import { missingForStatus, FIELD_LABELS } from '../lib/workflow';
import { AppError } from '../lib/errors';
import { TASK_ROLES, PRIORITIES } from '../lib/constants';
import { typeColor } from '../lib/colors';
import { today, daysBetween } from '../lib/dates';
import { Button, Field, Input, Select, Textarea } from './ui';

const LAST = 'dibu_last_add';
export const readLast = () => {
  try { return JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { return {}; }
};
const writeLast = (v) => { try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* abaikan */ } };

const EMPTY_BRIEF = { topic: '', hook: '', concept: '', caption: '', hashtags: '', references: '', audience: '', message: '', objective: '', script: '', notes: '', cta: '' };

export default function BriefDrawer({ open, onClose, preset = {}, content = null }) {
  const { profile } = useAuth();
  const { staff, staffById, contentById, campaigns } = useData();
  const config = useConfig();
  const { run } = useToast();
  const [mode, setMode] = useState('quick');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({});
  const [task, setTask] = useState({ staffId: '', role: 'shooting', deadline: '', estHours: '' });
  const titleRef = useRef(null);

  useEffect(() => {
    if (!open) { setF({}); return; }
    const last = readLast();
    const base = content || {};
    setMode(content && !content.isSlot ? 'full' : 'quick');
    setAdvanced(false);
    setTask({ staffId: '', role: 'shooting', deadline: '', estHours: '' });
    setF({
      title: base.title || '',
      platform: base.platform || preset.platform || last.platform || config.platforms[0] || '',
      type: base.type || last.type || '',
      publishDate: base.publishDate || preset.date || (preset.shootDate ? '' : today()),
      publishTime: base.publishTime || '',
      shootDate: base.shootDate || preset.shootDate || '',
      ownerStaffId: base.ownerStaffId || preset.ownerStaffId || last.ownerStaffId || profile.staffId || '',
      pillar: base.pillar || '',
      product: base.product || '',
      campaignId: base.campaignId || preset.campaignId || '',
      priority: base.priority || 'medium',
      publishAccount: base.publishAccount || '',
      status: base.status || preset.status || statusForStage(config, 'idea'),
      brief: { ...EMPTY_BRIEF, ...(base.brief || {}) },
    });
    setTimeout(() => titleRef.current?.focus(), 60);
  }, [open, content, preset.date, preset.shootDate, preset.platform, preset.status, preset.ownerStaffId, preset.campaignId, config, profile.staffId]);

  // Render pertama selepas panel dibuka berlaku SEBELUM useEffect di atas mengisi borang.
  // Tanpa semakan ini, f.title masih undefined dan panel akan crash.
  if (!open || !f.brief) return null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setBrief = (k) => (e) => setF((x) => ({ ...x, brief: { ...x.brief, [k]: e.target.value } }));
  const staffOpts = staff.filter((s) => s.status !== 'inactive').map((s) => ({ value: s.id, label: s.name }));

  const save = async (again) => {
    setBusy(true);
    const ok = await run(async () => {
      const payload = {
        title: f.title, platform: f.platform, publishDate: f.publishDate, publishTime: f.publishTime, shootDate: f.shootDate || '',
        ownerStaffId: f.ownerStaffId, pillar: f.pillar, product: f.product, campaignId: f.campaignId,
        campaignName: campaigns.find((c) => c.id === f.campaignId)?.name || '',
        priority: f.priority, type: f.type, publishAccount: f.publishAccount, status: f.status,
        brief: f.brief,
      };
      // Syarat aliran kerja yang sama seperti Papan kerja: contohnya status Terbit perlukan link post.
      const missing = missingForStatus(config, { ...content, ...payload }, f.status);
      if (missing.length) {
        throw new AppError(`Status “${findStatus(config, f.status).label}” perlukan: ${missing.map((m) => FIELD_LABELS[m]).join(', ')}. Pilih status lain, atau tukar status dari halaman content.`);
      }
      let id;
      if (content) {
        await fillSlot(content, payload, { profile, staffById });
        id = content.id;
      } else {
        id = await quickAddContent(payload, { profile, staffById });
      }
      if (task.staffId) {
        await saveTask({ ...task, contentId: id, priority: f.priority, description: f.brief.topic || '' }, { profile, staffById, contentById });
      }
      writeLast({ platform: f.platform, ownerStaffId: f.ownerStaffId, type: f.type });
      return id;
    }, content ? 'Content dikemas kini' : 'Content ditambah');
    setBusy(false);
    if (!ok) return;
    if (again) {
      setF((x) => ({ ...x, title: '', brief: { ...EMPTY_BRIEF } }));
      setTask({ staffId: '', role: 'shooting', deadline: '', estHours: '' });
      titleRef.current?.focus();
    } else {
      onClose();
    }
  };

  // Enter hanya simpan bila kursor dalam kotak teks satu baris (bukan textarea / butang).
  const onKey = (e) => {
    if (e.key === 'Enter' && mode === 'quick' && e.target.tagName === 'INPUT' && f.title.trim() && !busy) { e.preventDefault(); save(!content); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="side-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="side-panel" role="dialog" aria-modal="true" aria-label={content ? (content.isSlot ? 'Isi slot kosong' : 'Edit content') : 'Content baharu'} onKeyDown={onKey}>
        <div className="side-head">
          <h2 className="grow">{content ? (content.isSlot ? 'Isi slot kosong' : 'Edit content') : 'Content baharu'}</h2>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="row gap-xs" style={{ padding: '10px 18px 0' }}>
          <button type="button" className={`chip${mode === 'quick' ? ' on' : ''}`} onClick={() => setMode('quick')}>Tambah cepat</button>
          <button type="button" className={`chip${mode === 'full' ? ' on' : ''}`} onClick={() => setMode('full')}>Brief penuh</button>
        </div>

        <div className="side-body">
          <Field label="Tajuk content" required>
            <Input ref={titleRef} value={f.title} onChange={set('title')} placeholder="POV ibu bekerja siapkan sarapan" autoFocus />
          </Field>

          <div className="grid-2">
            <Field label="Tarikh pos" hint="Bila video ini dipos."><Input type="date" value={f.publishDate} onChange={set('publishDate')} /></Field>
            <Field label="Tarikh shoot" hint={f.shootDate && f.publishDate ? `${daysBetween(f.shootDate, f.publishDate)} hari sebelum pos` : 'Pilihan'}><Input type="date" value={f.shootDate} max={f.publishDate || undefined} onChange={set('shootDate')} /></Field>
            {mode === 'full' && <Field label="Masa pos"><Input type="time" value={f.publishTime} onChange={set('publishTime')} /></Field>}
          </div>

          <Field label="Platform" group>
            <div className="chips">
              {config.platforms.map((p) => (
                <button key={p} type="button" className={`chip${f.platform === p ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, platform: p }))}>{p}</button>
              ))}
            </div>
          </Field>

          <Field label="Jenis content" group>
            <div className="chips">
              {(config.contentTypes || []).map((t) => (
                <button key={t} type="button" className={`chip${f.type === t ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, type: x.type === t ? '' : t }))}>
                  <span className="dot" style={{ background: typeColor(config, t), marginRight: 6 }} />{t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Pemilik content"><Select value={f.ownerStaffId} onChange={set('ownerStaffId')} options={staffOpts} placeholder="Belum ditetapkan" /></Field>

          {mode === 'full' && (
            <>
              <Field label="Kategori" group>
                <div className="chips">
                  {config.pillars.map((p) => (
                    <button key={p} type="button" className={`chip${f.pillar === p ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, pillar: x.pillar === p ? '' : p }))}>{p}</button>
                  ))}
                </div>
              </Field>
              <Field label="Topik"><Input value={f.brief.topic} onChange={setBrief('topic')} placeholder="Sarapan cepat untuk bayi 8 bulan" /></Field>
              <Field label="Hook, 3 saat pertama"><Textarea rows={2} value={f.brief.hook} onChange={setBrief('hook')} placeholder="Pukul 6 pagi, ibu ada 10 minit je." /></Field>
              <Field label="Konsep dan arahan"><Textarea rows={4} value={f.brief.concept} onChange={setBrief('concept')} placeholder="Shot tangan sahaja. Lighting tingkap. 30 hingga 40 saat." /></Field>

              <div className="warnbox" style={{ display: 'block' }}>
                <div className="field-label" style={{ color: 'var(--link)', marginBottom: 8 }}>Tugaskan kepada</div>
                <div className="chips" style={{ marginBottom: 10 }}>
                  {staff.filter((s) => s.status === 'active').map((s) => (
                    <button key={s.id} type="button" className={`chip${task.staffId === s.id ? ' on' : ''}`} onClick={() => setTask((t) => ({ ...t, staffId: t.staffId === s.id ? '' : s.id }))}>{s.name}</button>
                  ))}
                </div>
                {task.staffId && (
                  <div className="grid-2">
                    <Field label="Tugas"><Select value={task.role} onChange={(e) => setTask((t) => ({ ...t, role: e.target.value }))} options={TASK_ROLES} /></Field>
                    <Field label="Siap sebelum"><Input type="date" value={task.deadline} onChange={(e) => setTask((t) => ({ ...t, deadline: e.target.value }))} /></Field>
                    <Field label="Anggaran jam"><Input type="number" min="0" step="0.5" value={task.estHours} onChange={(e) => setTask((t) => ({ ...t, estHours: e.target.value }))} /></Field>
                  </div>
                )}
                <p className="small" style={{ color: 'var(--link)', marginTop: 6 }}>
                  {task.staffId ? `${staffById[task.staffId]?.name} akan dapat notifikasi dan content ini muncul dalam senarai tugasan dia.` : 'Pilihan. Kosongkan jika pemilik content buat sendiri.'}
                </p>
              </div>

              <button type="button" className="link-btn row gap-xs" onClick={() => setAdvanced((a) => !a)}>
                <ChevronDown size={14} style={{ transform: advanced ? 'rotate(180deg)' : 'none' }} />
                {advanced ? 'Sembunyikan medan lanjutan' : 'Produk, kempen, caption, hashtag, link rujukan'}
              </button>

              {advanced && (
                <div className="grid-2">
                  <Field label="Produk"><Select value={f.product} onChange={set('product')} options={config.products} placeholder="Tiada" /></Field>
                  <Field label="Kempen"><Select value={f.campaignId} onChange={set('campaignId')} options={campaigns.filter((c) => c.status !== 'archived').map((c) => ({ value: c.id, label: c.name }))} placeholder="Tiada kempen" /></Field>
                  <Field label="Keutamaan"><Select value={f.priority} onChange={set('priority')} options={PRIORITIES} /></Field>
                  <Field label="Status"><Select value={f.status} onChange={set('status')} options={statusList(config)} /></Field>
                  <Field label="Akaun terbit"><Input value={f.publishAccount} onChange={set('publishAccount')} placeholder="Akaun utama Dibu" /></Field>
                  <Field label="Caption" full><Textarea rows={3} value={f.brief.caption} onChange={setBrief('caption')} /></Field>
                  <Field label="Hashtag" full><Input value={f.brief.hashtags} onChange={setBrief('hashtags')} placeholder="#makananbayi #mpasi" /></Field>
                  <Field label="Call to action" full><Input value={f.brief.cta} onChange={setBrief('cta')} /></Field>
                  <Field label="Link rujukan" full><Input value={f.brief.references} onChange={setBrief('references')} placeholder="https://" /></Field>
                  <Field label="Skrip penuh" full><Textarea rows={5} value={f.brief.script} onChange={setBrief('script')} /></Field>
                </div>
              )}
            </>
          )}
        </div>

        <div className="side-foot">
          <Button onClick={onClose}>Batal</Button>
          <div className="grow" />
          {!content && <Button busy={busy} disabled={!f.title.trim()} onClick={() => save(true)}>Simpan dan tambah lagi</Button>}
          <Button variant="primary" busy={busy} disabled={!f.title.trim()} onClick={() => save(false)}>Simpan</Button>
        </div>
      </aside>
    </div>
  );
}
