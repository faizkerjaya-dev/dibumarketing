// Satu halaman untuk satu content. Tiada tab; setiap bahagian buka bila diklik.
// Content Creator nampak versi terhad: tiada edit, hanya tugasan sendiri, checklist, link dan balas semakan.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { ExternalLink, Pencil, Plus, Trash2, Archive, BarChart3, ChevronRight, CalendarDays, Hash, User, Flag, Megaphone } from 'lucide-react';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { can, isCreatorOnly } from '../lib/permissions';
import { updateById, removeById, updateOwnTask, addLink, removeLink, saveReview, logActivity } from '../lib/db';
import { statusList, findStatus, stageOf, statusForStage, STAGES } from '../lib/statuses';
import { TASK_ROLES, TASK_STATUSES, REVIEW_OUTCOMES, METRIC_FIELDS, findOpt, slug, num } from '../lib/constants';
import { fmtDate, fmtDateTime, relDue, today, addDays } from '../lib/dates';
import { latestByTarget, engagementRate, pct } from '../lib/metrics';
import { PageHeader, Card, Button, Pill, Avatar, Bar, Field, Input, Select, Textarea, Empty, Loading, ErrorBox, useConfirm } from '../components/ui';
import { ContentStatusPill, PriorityPill, TaskStatusPill, ReviewPill } from '../components/pills';
import TaskModal from '../components/TaskModal';
import CommentThread from '../components/CommentThread';
import MetricsModal from '../components/MetricsModal';
import BriefDrawer from '../components/BriefDrawer';
import { useStatusChange } from '../components/StatusChangeModal';

const BRIEF_FIELDS = [
  ['topic', 'Topik'], ['objective', 'Objektif'], ['audience', 'Sasaran audiens'], ['hook', 'Hook'],
  ['message', 'Mesej utama'], ['concept', 'Konsep dan arahan'], ['script', 'Skrip'], ['caption', 'Caption'],
  ['cta', 'Call to action'], ['hashtags', 'Hashtag'], ['references', 'Link rujukan'], ['notes', 'Nota'],
];

function Fold({ title, hint, hintTone = 'gray', action, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className={`fold${open ? ' open' : ''}`}>
      <button type="button" className="fold-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={15} className="fold-caret" />
        <span className="strong" style={{ fontSize: 14 }}>{title}</span>
        {hint && <Pill tone={hintTone}>{hint}</Pill>}
        <span className="grow" />
        {action}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}

function Stepper({ status }) {
  const config = useConfig();
  const flow = STAGES.filter((s) => s.key !== 'archived');
  const cur = flow.findIndex((s) => s.key === stageOf(config, status));
  return (
    <div className="stepper card card-pad">
      {flow.map((s, i) => (
        <div key={s.key} className={`step${i < cur ? ' done' : ''}${i === cur ? ' now' : ''}`}>
          <span className="step-node">{i < cur ? '✓' : i + 1}</span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewBlock({ content }) {
  const { profile } = useAuth();
  const { staff, staffById, contentById } = useData();
  const config = useConfig();
  const { run } = useToast();
  const canReview = can(profile, 'content.review');
  const creatorOnly = isCreatorOnly(profile);
  const [form, setForm] = useState({ outcome: content.review?.outcome || '', comment: '', adjustStaffId: content.ownerStaffId || '', adjustDeadline: addDays(today(), 3) });
  const [busy, setBusy] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const mq = useMemo(() => (creatorOnly ? null : query(collection(db, 'metrics'), where('targetId', '==', content.id))), [content.id, creatorOnly]);
  const metrics = useQuery(mq, [mq]);
  const latest = latestByTarget(metrics.data)[content.id];

  const save = async () => {
    setBusy(true);
    const ok = await run(() => saveReview(content, form, { profile, staffById, contentById }), 'Semakan disimpan');
    setBusy(false);
    if (ok) setForm((f) => ({ ...f, comment: '' }));
  };

  return (
    <div className="col gap-lg">
      {!creatorOnly && (
        <div>
          <div className="row gap-sm wrap" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="muted small">{latest ? `Angka terkini ${fmtDate(latest.date)}, diisi oleh ${latest.enteredByName}` : 'Belum ada data prestasi. Angka diisi manual dari app platform.'}</span>
            {can(profile, 'metrics.enter') && <Button size="sm" icon={BarChart3} onClick={() => setMetricsOpen(true)}>Rekod prestasi</Button>}
          </div>
          <ErrorBox error={metrics.error} />
          {latest && (
            <div className="stats">
              {METRIC_FIELDS.filter(([k]) => latest[k] != null).map(([k, label]) => <div key={k} className="stat"><span className="stat-label">{label}</span><span className="stat-value">{num(latest[k])}</span></div>)}
              <div className="stat"><span className="stat-label">Kadar engagement</span><span className="stat-value">{pct(engagementRate(latest))}</span></div>
            </div>
          )}
        </div>
      )}

      {content.review && (
        <div className="row gap-sm wrap">
          <ReviewPill review={content.review} />
          <span className="muted small">oleh {content.review.byName} · {fmtDateTime(content.review.at)}</span>
        </div>
      )}

      {canReview && (
        <div className="col gap">
          <div className="outcomes" role="radiogroup" aria-label="Keputusan semakan">
            {REVIEW_OUTCOMES.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={form.outcome === o.key} className={`outcome${form.outcome === o.key ? ` on tone-${o.tone}` : ''}`} onClick={() => setForm({ ...form, outcome: o.key })}>
                <strong>{o.label}</strong><span>{o.hint}</span>
              </button>
            ))}
          </div>
          {form.outcome === 'adjust' && (
            <div className="warnbox"><div className="grid-2" style={{ width: '100%' }}>
              <Field label="Tugasan pembetulan untuk"><Select value={form.adjustStaffId} onChange={(e) => setForm({ ...form, adjustStaffId: e.target.value })} options={staff.filter((s) => s.status !== 'inactive').map((s) => ({ value: s.id, label: s.name }))} placeholder="Komen sahaja, tiada tugasan" /></Field>
              <Field label="Siap sebelum"><Input type="date" value={form.adjustDeadline} onChange={(e) => setForm({ ...form, adjustDeadline: e.target.value })} /></Field>
            </div></div>
          )}
          <Field label="Komen"><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Apa yang perlu diubah, dan kenapa" /></Field>
          <div className="form-actions"><Button variant="primary" busy={busy} disabled={!form.outcome} onClick={save}>Simpan semakan</Button></div>
        </div>
      )}
      {!canReview && !content.review && <p className="muted small">Belum disemak.</p>}

      <CommentThread targetType="content" targetId={content.id} thread="review" visibleUids={content.assigneeUids || []} placeholder="Balas semakan ini" emptyText="Belum ada komen semakan." />
      <MetricsModal open={metricsOpen} onClose={() => setMetricsOpen(false)} target={{ type: 'content', id: content.id, campaignId: content.campaignId }} />
    </div>
  );
}

export default function ContentDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const config = useConfig();
  const { contentById, tasks, ready } = useData();
  const { run } = useToast();
  const [moveTo, moveEl] = useStatusChange();
  const [confirm, confirmEl] = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [taskModal, setTaskModal] = useState(null);
  const [linkForm, setLinkForm] = useState({ label: '', url: '', category: '' });

  const content = contentById[id];
  const creatorOnly = isCreatorOnly(profile);
  const canEdit = can(profile, 'content.edit');
  const myTasks = useMemo(() => tasks.filter((t) => t.contentId === id), [tasks, id]);

  const aq = useMemo(() => (creatorOnly ? null : query(collection(db, 'activity'), where('refId', '==', id))), [id, creatorOnly]);
  const activity = useQuery(aq, [aq]);

  if (!ready) return <div className="page"><Loading /></div>;
  if (!content) return <div className="page"><Empty title="Content tidak dijumpai" text="Mungkin sudah dipadam, atau anda tidak ditugaskan pada content ini." action={<Link to="/calendar">Kembali ke kalendar</Link>} /></div>;

  const stage = stageOf(config, content.status);
  const published = stage === 'published';
  const checklist = config.checklist.map((label) => ({ key: slug(label), label }));
  const doneChecks = checklist.filter((i) => content.checklist?.[i.key]).length;
  const doneTasks = myTasks.filter((t) => t.status === 'done').length;
  const lateTasks = myTasks.filter((t) => t.status !== 'done' && t.deadline && t.deadline < today()).length;
  const canTouch = canEdit || (content.assigneeUids || []).includes(profile.uid);

  const chip = (icon, label, onClick) => (
    <button type="button" className="chip" onClick={onClick} disabled={!onClick} style={!onClick ? { cursor: 'default' } : undefined}>
      <span className="row gap-xs">{icon}{label}</span>
    </button>
  );

  const archive = async () => {
    if (!(await confirm('Arkibkan content ini? Rekod dan sejarah kekal, cuma disorok dari kalendar dan papan kerja.', { title: 'Arkibkan content', okLabel: 'Arkibkan' }))) return;
    await run(async () => {
      await updateById('content', content.id, { archived: true, status: statusForStage(config, 'archived', content.status) }, profile);
      await logActivity(profile, { type: 'content_archived', message: `${profile.name} arkibkan “${content.title}”`, refType: 'content', refId: content.id });
    }, 'Diarkibkan');
  };
  const remove = async () => {
    if (!(await confirm(`Padam terus “${content.title}”? Tugasan berkaitan tidak dipadam. Cadangan: guna Arkib.`, { title: 'Padam kekal', okLabel: 'Padam', danger: true }))) return;
    const ok = await run(() => removeById('content', content.id), 'Dipadam');
    if (ok) navigate('/calendar');
  };
  const addTheLink = async () => {
    const ok = await run(() => addLink(content, linkForm, profile), 'Link ditambah');
    if (ok) setLinkForm({ label: '', url: '', category: '' });
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHeader
        crumb={<><Link to={creatorOnly ? '/my-tasks' : '/calendar'}>{creatorOnly ? 'Hari ini' : 'Kalendar'}</Link> / {content.code}</>}
        title={content.title || content.slotLabel || 'Slot kosong'}
        actions={canEdit && <>
          <Select value={content.status} onChange={(e) => moveTo(content, e.target.value)} options={statusList(config)} aria-label="Tukar status" style={{ width: 150 }} />
          <Button icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>
          {!content.archived && <Button icon={Archive} onClick={archive}>Arkib</Button>}
          {can(profile, 'content.delete') && <Button variant="danger" icon={Trash2} onClick={remove}>Padam</Button>}
        </>}
      >
        <div className="chips" style={{ marginTop: 10 }}>
          {chip(<CalendarDays size={13} />, content.publishDate ? `${fmtDate(content.publishDate, { weekday: 'short' })}${content.publishTime ? `, ${content.publishTime}` : ''}` : 'Tiada tarikh', canEdit ? () => setEditOpen(true) : null)}
          {chip(<Hash size={13} />, content.platform || 'Platform?', canEdit ? () => setEditOpen(true) : null)}
          {chip(<User size={13} />, content.ownerName || 'Tiada pemilik', canEdit ? () => setEditOpen(true) : null)}
          {content.pillar && chip(<Flag size={13} />, content.pillar, canEdit ? () => setEditOpen(true) : null)}
          {content.campaignName && chip(<Megaphone size={13} />, content.campaignName, () => navigate(`/campaigns/${content.campaignId}`))}
          <ContentStatusPill value={content.status} />
          <PriorityPill value={content.priority} />
          <ReviewPill review={content.review} />
        </div>
      </PageHeader>

      <Stepper status={content.status} />

      <Fold title="Brief dan skrip" hint={content.brief?.hook ? 'Hook sudah ditulis' : 'Belum diisi'} hintTone={content.brief?.hook ? 'green' : 'gray'} action={canEdit && <span className="link-btn">Edit</span>}>
        {BRIEF_FIELDS.filter(([k]) => content.brief?.[k]).map(([k, label]) => (
          <div key={k}><div className="muted small strong">{label}</div><div className="pre-line">{content.brief[k]}</div></div>
        ))}
        {!BRIEF_FIELDS.some(([k]) => content.brief?.[k]) && <p className="muted small">Brief belum diisi. Tekan Edit untuk tulis hook dan konsep.</p>}
      </Fold>

      <Fold
        title="Tugasan"
        hint={myTasks.length ? `${doneTasks} daripada ${myTasks.length} siap${lateTasks ? ` · ${lateTasks} lewat` : ''}` : 'Tiada tugasan'}
        hintTone={lateTasks ? 'red' : myTasks.length && doneTasks === myTasks.length ? 'green' : 'gray'}
        defaultOpen={myTasks.length > 0}
      >
        {!myTasks.length && <p className="muted small">Tiada tugasan. Pemilik content buat sendiri, atau tekan Tugaskan staf di bawah.</p>}
        {myTasks.map((t) => {
          const late = t.status !== 'done' && t.deadline && t.deadline < today();
          const mine = t.staffUid === profile.uid;
          return (
            <div key={t.id} className="list-row wrap">
              <Avatar name={t.staffName} size={27} />
              <span className="grow min0" style={{ flexBasis: 150 }}>
                <strong>{findOpt(TASK_ROLES, t.role).label}</strong>
                <span className="small muted block">{t.staffName}{t.estHours ? ` · ${t.estHours}j` : ''}</span>
              </span>
              <span className={late ? 'danger-text small' : 'small muted'}>{t.deadline ? relDue(t.deadline) : 'Tiada deadline'}</span>
              {mine && !canEdit
                ? <Select value={t.status} onChange={(e) => run(() => updateOwnTask(t, { status: e.target.value }, profile), 'Tugasan dikemas kini')} options={TASK_STATUSES} style={{ width: 140 }} />
                : <TaskStatusPill value={t.status} />}
              {can(profile, 'task.assign') && <Button size="sm" variant="ghost" onClick={() => setTaskModal({ task: t })}>Edit</Button>}
            </div>
          );
        })}
        {can(profile, 'task.assign') && <Button size="sm" icon={Plus} onClick={() => setTaskModal({ presetContentId: content.id })}>Tugaskan staf</Button>}
      </Fold>

      <Fold title="Link dan fail" hint={`${(content.links || []).length} link`} action={null}>
        <div className="link-list">
          {(content.links || []).map((l) => (
            <div key={l.id} className="row gap-sm">
              <a href={l.url} target="_blank" rel="noreferrer" className="grow min0"><ExternalLink size={15} /><span className="ellipsis strong">{l.label}</span></a>
              {l.category && <span className="tag">{l.category}</span>}
              {canTouch && <button type="button" className="icon-btn" aria-label="Buang link" onClick={() => run(() => removeLink(content, l.id, profile))}><Trash2 size={15} /></button>}
            </div>
          ))}
          {!(content.links || []).length && <p className="muted small">Belum ada link. Fail besar disimpan di Google Drive; tampal link di sini.</p>}
        </div>
        {canTouch && (
          <div className="grid-3" style={{ alignItems: 'end' }}>
            <Field label="Nama"><Input value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })} placeholder="Edit v1" /></Field>
            <Field label="Link"><Input type="url" value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="https://drive.google.com/…" /></Field>
            <Field label="Kategori"><Select value={linkForm.category} onChange={(e) => setLinkForm({ ...linkForm, category: e.target.value })} options={config.linkCategories} placeholder="Tiada" /></Field>
            <Button icon={Plus} onClick={addTheLink} disabled={!linkForm.url}>Tambah link</Button>
          </div>
        )}
      </Fold>

      <Fold title="Senarai semak" hint={`${doneChecks} daripada ${checklist.length}`} hintTone={doneChecks === checklist.length && checklist.length ? 'green' : 'gray'}>
        <Bar pct={checklist.length ? (doneChecks / checklist.length) * 100 : 0} />
        {checklist.map((i) => (
          <label key={i.key} className="check">
            <input type="checkbox" checked={!!content.checklist?.[i.key]} disabled={!canTouch} onChange={(e) => run(() => updateById('content', content.id, { checklist: { ...(content.checklist || {}), [i.key]: e.target.checked } }, profile))} />
            {i.label}
          </label>
        ))}
      </Fold>

      {(published || content.review) && (
        <Fold title="Semakan dan prestasi" hint={content.review ? findOpt(REVIEW_OUTCOMES, content.review.outcome).label : 'Belum disemak'} hintTone={content.review ? findOpt(REVIEW_OUTCOMES, content.review.outcome).tone : 'gray'} defaultOpen={params.get('tab') === 'review'}>
          <ReviewBlock content={content} />
        </Fold>
      )}

      <Fold title="Catatan pasukan">
        <CommentThread targetType="content" targetId={content.id} thread="general" visibleUids={content.assigneeUids || []} placeholder="Tulis catatan" emptyText="Belum ada catatan." />
      </Fold>

      {!creatorOnly && (
        <Fold title="Log aktiviti">
          {activity.loading && <Loading />}
          <ErrorBox error={activity.error} />
          {[...activity.data].sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')).map((x) => (
            <div key={x.id}><div>{x.message}</div><div className="small muted">{fmtDateTime(x.createdAtIso)}</div></div>
          ))}
          {!activity.loading && !activity.data.length && <p className="muted small">Tiada aktiviti.</p>}
        </Fold>
      )}

      <BriefDrawer open={editOpen} onClose={() => setEditOpen(false)} content={content} />
      <TaskModal open={!!taskModal} onClose={() => setTaskModal(null)} task={taskModal?.task} presetContentId={taskModal?.presetContentId} />
      {moveEl}
      {confirmEl}
    </div>
  );
}
