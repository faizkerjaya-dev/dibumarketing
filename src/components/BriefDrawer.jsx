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
import { quickAddContent, fillSlot, saveTask, updateById } from '../lib/db';
import { statusList, statusForStage } from '../lib/statuses';
import { TASK_ROLES, PRIORITIES } from '../lib/constants';
import { today } from '../lib/dates';
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
  // null sehingga useEffect mengisinya. Tanpa ini, render pertama membaca f.title yang belum wujud.
  const [f, setF] = useState(null);
  const [task, setTask] = useState({ staffId: '', role: 'shooting', deadline: '', estHours: '' });
  const titleRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const last = readLast();
    const base = content || {};
    setMode(content && !content.isSlot ? 'full' : 'quick');
    setAdvanced(false);
    setTask({ staffId: '', role: 'shooting', deadline: '', estHours: '' });
    setF({
      title: base.title || '',
      platform: base.platform || preset.platform || last.platform || config.platforms[0] || '',
      publishDate: base.publishDate || preset.date || today(),
      publishTime: base.publishTime || '',
      ownerStaffId: base.ownerStaffId || preset.ownerStaffId || last.ownerStaffId || profile.staffId || '',
      pillar: base.pillar || '',
      product: base.product || '',
      campaignId: base.campaignId || '',
      priority: base.priority || 'medium',
      type: base.type || '',
      publishAccount: base.publishAccount || '',
      status: base.status || preset.status || statusForStage(config, 'idea'),
      brief: { ...EMPTY_BRIEF, ...(base.brief || {}) },
    });
    setTimeout(() => titleRef.current?.focus(), 60);
  }, [open, content, preset.date, preset.platform, preset.status, preset.ownerStaffId, config, profile.staffId]);

  if (!open || !f) return null;
  const title = (f.title || '').trim();
  // Satu nilai untuk tajuk dan label aksesibiliti, supaya kedua-duanya tidak terpisah.
  const heading = content ? (content.isSlot ? 'Isi slot kosong' : 'Edit content') : 'Content baharu';
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setBrief = (k) => (e) => setF((x) => ({ ...x, brief: { ...x.brief, [k]: e.target.value } }));
  const staffOpts = staff.filter((s) => s.status !== 'inactive').map((s) => ({ value: s.id, label: s.name }));

  const save = async (again) => {
    setBusy(true);
    const ok = await run(async () => {
      const payload = {
        title: f.title, platform: f.platform, publishDate: f.publishDate, publishTime: f.publishTime,
        ownerStaffId: f.ownerStaffId, pillar: f.pillar, product: f.product, campaignId: f.campaignId,
        campaignName: campaigns.find((c) => c.id === f.campaignId)?.name || '',
        priority: f.priority, type: f.type, publishAccount: f.publishAccount, status: f.status,
        brief: f.brief,
      };
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
      writeLast({ platform: f.platform, ownerStaffId: f.ownerStaffId });
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

  const onKey = (e) => {
    if (e.key === 'Enter' && mode === 'quick' && title) { e.preventDefault(); save(true); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="side-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="side-panel" role="dialog" aria-modal="true" aria-label={heading} onKeyDown={onKey}>
        <div className="side-head">
          <h2 className="grow">{heading}</h2>
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
            <Field label="Tarikh terbit"><Input type="date" value={f.publishDate} onChange={set('publishDate')} /></Field>
            {mode === 'full' && <Field label="Masa"><Input type="time" value={f.publishTime} onChange={set('publishTime')} /></Field>}
          </div>

          <Field label="Platform" group>
            <div className="chips">
              {config.platforms.map((p) => (
                <button key={p} type="button" className={`chip${f.platform === p ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, platform: p }))}>{p}</button>
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
                  {staff.filter((s) => s.status === 'active').slice(0, 8).map((s) => (
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
                  {task.staffId ? `${staffById[task.staffId]?.name} akan dapat notifikasi dan content ini muncul dalam Hari ini dia.` : 'Pilihan. Kosongkan jika pemilik content buat sendiri.'}
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
                  <Field label="Jenis content"><Select value={f.type} onChange={set('type')} options={config.contentTypes} placeholder="Pilih" /></Field>
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
          <Button busy={busy} disabled={!title} onClick={() => save(true)}>Simpan dan tambah lagi</Button>
          <Button variant="primary" busy={busy} disabled={!title} onClick={() => save(false)}>Simpan</Button>
        </div>
      </aside>
    </div>
  );
}
