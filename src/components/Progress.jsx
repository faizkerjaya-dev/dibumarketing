// Penunjuk kemajuan Shoot · Edit · Pos.
//   <ProgressDots>    : tiga titik kecil (baca sahaja) untuk sel kalendar / senarai padat.
//   <ProgressButtons> : tiga butang; satu klik untuk tanda siap. Klik semula untuk buang tanda.
//   useProgressAction : logik tanda + popup link post (untuk langkah Pos).
import { useState } from 'react';
import { Check, Clapperboard, Scissors, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { markProgress } from '../lib/db';
import { STEPS, progressOf, lateSteps, doneCount, videoApprovalOn } from '../lib/progress';
import { stageOf } from '../lib/statuses';
import { fmtDate, fmtDateTime, today } from '../lib/dates';
import { Modal, Button, Field, Input, useConfirm } from './ui';

const ICONS = { shot: Clapperboard, edited: Scissors, posted: Send };

export function canMarkProgress(profile, c) {
  if (!profile || !c || c.isSlot) return false;
  return can(profile, 'content.edit') || (!!c.ownerUid && c.ownerUid === profile.uid);
}

export function ProgressDots({ content, showLabel }) {
  const config = useConfig();
  const pr = progressOf(config, content);
  const late = lateSteps(config, content);
  const n = doneCount(pr);
  return (
    <span className="pdots" title={STEPS.map((s) => `${s.label}: ${pr[s.key] ? 'siap' : 'belum'}`).join(' · ')} aria-label={`${n} daripada 3 langkah siap`}>
      {STEPS.map((s) => <span key={s.key} className={`pdot${pr[s.key] ? ' on' : ''}${late.includes(s.key) ? ' late' : ''}`} />)}
      {showLabel && <span className="pdots-label">{n === 3 ? 'Selesai' : `${n}/3`}</span>}
    </span>
  );
}

export function useProgressAction() {
  const { profile } = useAuth();
  const config = useConfig();
  const { tasks, staffById } = useData();
  const { run } = useToast();
  const [confirm, confirmEl] = useConfirm();
  const [post, setPost] = useState(null); // { content, url, date }
  const [busy, setBusy] = useState(false);

  const doMark = async (content, key, on, extra = {}) => {
    setBusy(true);
    const step = STEPS.find((s) => s.key === key);
    const res = await run(() => markProgress(content, key, on, { config, profile, staffById, tasks, ...extra }), on ? `${step.doneLabel} ✓` : 'Tanda dibuang');
    setBusy(false);
    return res;
  };

  const toggle = async (content, key) => {
    const pr = progressOf(config, content);
    const step = STEPS.find((s) => s.key === key);
    if (pr[key]) {
      if (!(await confirm(`Buang tanda "${step.doneLabel}" bagi “${content.title}”?${key !== 'posted' ? ' Langkah selepasnya juga akan dibuang tanda.' : ''}`, { title: 'Buang tanda', okLabel: 'Buang tanda' }))) return;
      await doMark(content, key, false);
      return;
    }
    if (key === 'posted') { setPost({ content, url: content.publishUrl || '', date: content.publishDate && content.publishDate < today() ? content.publishDate : today() }); return; }
    await doMark(content, key, true);
  };

  const savePost = async () => {
    const ok = await doMark(post.content, 'posted', true, { publishUrl: post.url, publishedDate: post.date });
    if (ok) setPost(null);
  };

  const el = (
    <>
      {confirmEl}
      <Modal open={!!post} onClose={() => setPost(null)} title="Tanda sudah dipos" footer={<>
        <Button onClick={() => setPost(null)}>Batal</Button>
        <Button variant="primary" icon={Check} busy={busy} onClick={savePost}>{post?.url?.trim() ? 'Simpan' : 'Simpan tanpa link'}</Button>
      </>}>
        {post && <>
          <p className="small muted"><span className="code-tag">{post.content.code}</span> {post.content.title}</p>
          <Field label="Link post" hint="Pilihan. Jika belum ada (contoh pos malam), sistem akan ingatkan untuk tambah link kemudian.">
            <Input type="url" autoFocus value={post.url} onChange={(e) => setPost({ ...post, url: e.target.value })} placeholder="https://www.tiktok.com/@akaun/video/…" />
          </Field>
          <Field label="Tarikh dipos" hint="Lalai: tarikh jadual pos. Ubah jika video dipos pada hari lain."><Input type="date" value={post.date} onChange={(e) => setPost({ ...post, date: e.target.value })} /></Field>
        </>}
      </Modal>
    </>
  );
  return { toggle, el, busy };
}

// size: 'sm' (kad / baris) atau 'lg' (halaman content)
export function ProgressButtons({ content, action, size = 'sm', readOnly }) {
  const { profile } = useAuth();
  const config = useConfig();
  const pr = progressOf(config, content);
  const late = lateSteps(config, content);
  const editable = !readOnly && canMarkProgress(profile, content);
  const next = STEPS.find((s) => !pr[s.key]);
  // Video yang menunggu kelulusan belum boleh dipos (kecuali oleh pelulus).
  const waiting = videoApprovalOn(config) && stageOf(config, content.status) === 'review' && !can(profile, 'content.approve');
  // Jika hanya SMM yang pos, Content Creator tidak boleh tanda Pos.
  const smmPosts = !can(profile, 'content.post') && !config?.social?.creatorCanPost;
  return (
    <span className={`pbtns pbtns-${size}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="group" aria-label="Kemajuan video">
      {STEPS.map((s, i) => {
        const Icon = ICONS[s.key];
        const done = pr[s.key];
        const stamp = content.progress?.[s.key];
        const blocked = s.key === 'posted' && (waiting || smmPosts) && !done;
        const isNext = next?.key === s.key && !blocked;
        const due = s.key === 'shot' ? content.shootDate : s.key === 'posted' ? content.publishDate : '';
        const title = done
          ? `${s.doneLabel}${stamp?.at ? ` · ${fmtDateTime(stamp.at)}${stamp.by ? ` oleh ${stamp.by}` : ''}` : ''}${editable ? ' (klik untuk buang tanda)' : ''}`
          : blocked ? (smmPosts ? 'Dipos oleh Social Media Manager mengikut jadual' : 'Menunggu kelulusan video sebelum boleh dipos')
            : `${s.label} belum siap${due ? ` · sasaran ${fmtDate(due)}` : ''}${editable ? ' (klik untuk tanda siap)' : ''}`;
        return (
          <span key={s.key} className="pstep-wrap">
            {i > 0 && <span className={`pline${done ? ' on' : ''}`} aria-hidden="true" />}
            <button
              type="button"
              className={`pstep${done ? ' on' : ''}${isNext ? ' next' : ''}${late.includes(s.key) ? ' late' : ''}`}
              disabled={!editable || blocked || action?.busy}
              aria-pressed={done}
              title={title}
              onClick={() => action?.toggle(content, s.key)}
            >
              {done ? <Check size={size === 'lg' ? 16 : 13} strokeWidth={3} /> : <Icon size={size === 'lg' ? 16 : 13} />}
              <span>{size === 'lg' ? (done ? s.doneLabel : s.label) : s.label}</span>
            </button>
          </span>
        );
      })}
    </span>
  );
}
