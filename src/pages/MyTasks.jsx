// Skrin utama Content Creator: apa yang kena buat hari ini.
// Senarai di kiri, butiran tugasan di kanan. Di telefon, kedua-duanya bertindan.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, CheckCircle2, Lightbulb } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { updateOwnTask, updateById, addLink, addIdea } from '../lib/db';
import { statusForStage } from '../lib/statuses';
import { TASK_ROLES, findOpt, slug } from '../lib/constants';
import { today, addDays, startOfWeek, fmtDate, relDue, parseDate } from '../lib/dates';
import { PageHeader, Card, Button, Pill, Field, Input, Textarea, Loading, Empty, Stat, Segmented } from '../components/ui';
import { TaskStatusPill } from '../components/pills';
import { doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useDoc } from '../hooks/useFirestore';
import { computeKpi, monthKey, monthPace, kpiStatus, staffTarget, fmtKpi } from '../lib/kpi';
import { KpiBar } from './Kpi';

export default function MyTasks() {
  const { tasks, content: allContent, contentById, staffById, ready } = useData();
  const kKey = monthKey(parseDate(today()).getFullYear(), parseDate(today()).getMonth());
  const targetsQ = useDoc(useMemo(() => doc(db, 'kpiTargets', kKey), [kKey]), kKey);
  const { profile } = useAuth();
  const config = useConfig();
  const { run } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [scope, setScope] = useState('open');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [idea, setIdea] = useState('');
  const panelRef = useRef(null);
  const t0 = today();
  const weekEnd = addDays(startOfWeek(t0), 6);

  const mine = useMemo(() => tasks.filter((t) => t.staffUid === profile.uid || (profile.staffId && t.staffId === profile.staffId)), [tasks, profile.uid, profile.staffId]);
  const groups = useMemo(() => {
    const open = mine.filter((t) => t.status !== 'done').sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    const g = [
      ['Lewat', open.filter((t) => t.deadline && t.deadline < t0)],
      ['Perlu siap hari ini', open.filter((t) => t.deadline === t0)],
      ['Minggu ini', open.filter((t) => t.deadline > t0 && t.deadline <= weekEnd)],
      ['Kemudian', open.filter((t) => t.deadline > weekEnd)],
      ['Tiada deadline', open.filter((t) => !t.deadline)],
    ];
    const done = mine.filter((t) => t.status === 'done' && (t.completedAt || '') >= addDays(t0, -14)).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    return scope === 'open' ? g.filter(([, l]) => l.length) : [['Siap dalam 14 hari lepas', done]];
  }, [mine, t0, weekEnd, scope]);

  const allVisible = groups.flatMap(([, l]) => l);
  const selected = mine.find((t) => t.id === selectedId) || allVisible[0] || null;
  const content = selected?.contentId ? contentById[selected.contentId] : null;

  useEffect(() => { setNote(selected?.notes || ''); setLink(''); }, [selected?.id, selected?.notes]);

  const kPace = monthPace(kKey);
  const me = profile.staffId ? staffById[profile.staffId] : null;
  const myKpi = me ? computeKpi({ key: kKey, content: allContent, tasks, staff: [me], metrics: [], accountStats: [], config }).perStaff[0] : null;

  if (!ready) return <div className="page"><Loading /></div>;
  if (!profile.staffId && !mine.length) {
    return <div className="page"><PageHeader title="Hari ini" /><Empty title="Akaun belum dipautkan ke profil staf" text="Minta Admin pautkan akaun anda dalam Tetapan › Pengguna." /></div>;
  }

  const pick = (t) => {
    setSelectedId(t.id);
    if (window.innerWidth < 900) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const checklist = config.checklist.map((label) => ({ key: slug(label), label }));
  const overdue = mine.filter((t) => t.status !== 'done' && t.deadline && t.deadline < t0).length;
  const dueToday = mine.filter((t) => t.status !== 'done' && t.deadline === t0).length;

  const submitIdea = async () => {
    const ok = await run(() => addIdea({ text: idea, platform: '', statusKey: statusForStage(config, 'idea') }, { profile, staffById }), 'Idea dihantar');
    if (ok) setIdea('');
  };

  return (
    <div className="page">
      <PageHeader title="Hari ini" crumb={fmtDate(t0, { weekday: 'long', year: 'numeric' })} actions={<Segmented value={scope} onChange={setScope} options={[{ key: 'open', label: 'Belum siap' }, { key: 'done', label: 'Siap' }]} />} />
      <div className="stats">
        <Stat label="Perlu siap hari ini" value={dueToday} tone={dueToday ? 'amber' : undefined} />
        <Stat label="Minggu ini" value={mine.filter((t) => t.status !== 'done' && t.deadline >= t0 && t.deadline <= weekEnd).length} />
        <Stat label="Lewat" value={overdue} tone={overdue ? 'red' : undefined} />
      </div>

      {myKpi && (
        <Card title="KPI saya bulan ini" subtitle={`Content yang anda miliki dan tugasan berdeadline bulan ini. ${Math.round(kPace * 100)}% bulan sudah berlalu.`}>
          <div className="kpi-mini">
            {[['Content terbit', myKpi.published, staffTarget(targetsQ.data, profile.staffId, 'published'), 'count', ''], ['Siap tepat masa', myKpi.onTimePct, staffTarget(targetsQ.data, profile.staffId, 'onTimePct'), 'rate', '%']].map(([label, actual, target, kind, unit]) => {
              const st = kpiStatus(actual, target, kind, kPace);
              return (
                <div key={label} className="col gap-xs">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="small muted">{label}</span><Pill tone={st.tone}>{st.label}</Pill></div>
                  <strong style={{ fontSize: 20 }}>{fmtKpi(actual, unit)}{target ? <span className="kpi-target"> / {fmtKpi(target, unit)}</span> : ''}</strong>
                  <KpiBar ratio={st.ratio} pace={kind === 'count' ? kPace : null} tone={st.tone === 'gray' ? 'gray' : st.tone} />
                </div>
              );
            })}
            <div className="col gap-xs"><span className="small muted">Tugasan siap</span><strong style={{ fontSize: 20 }}>{myKpi.done}/{myKpi.assigned}</strong>{myKpi.overdue > 0 && <span className="small danger-text">{myKpi.overdue} lewat</span>}</div>
          </div>
        </Card>
      )}

      <div className="split">
        <div className="main">
          {!allVisible.length && <Card><Empty title={scope === 'open' ? 'Tiada tugasan terbuka' : 'Tiada tugasan siap baru-baru ini'} text={scope === 'open' ? 'Tugasan baharu akan muncul di sini bila diberikan kepada anda.' : undefined} /></Card>}
          {groups.map(([name, list]) => (
            <div key={name} className="col gap-sm">
              <h2 className="muted" style={{ fontSize: 13 }}>{name}</h2>
              {list.map((t) => {
                const late = t.status !== 'done' && t.deadline && t.deadline < t0;
                return (
                  <button key={t.id} type="button" className={`task-card${selected?.id === t.id ? ' selected' : ''}`} onClick={() => pick(t)}>
                    <Pill tone="brand">{findOpt(TASK_ROLES, t.role).label}</Pill>
                    <span className="grow min0" style={{ flexBasis: 170 }}>
                      <strong className="block">{t.contentTitle || t.description || 'Tugasan'}</strong>
                      <span className="small muted">{[t.contentCode, t.campaignName].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={late ? 'danger-text small' : 'small strong'}>{t.status === 'done' ? `Siap ${fmtDate(t.completedAt)}` : relDue(t.deadline)}</span>
                    <TaskStatusPill value={t.status} />
                  </button>
                );
              })}
            </div>
          ))}

          <Card title="Hantar idea" subtitle="Idea anda masuk Bank idea. Ketua akan jadualkan tarikhnya.">
            <div className="row gap-sm">
              <Input style={{ flex: 1 }} value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && idea.trim() && submitIdea()} placeholder="Contoh: mitos garam untuk bayi" />
              <Button icon={Lightbulb} disabled={!idea.trim()} onClick={submitIdea}>Hantar</Button>
            </div>
          </Card>
        </div>

        {selected && (
          <div className="side" ref={panelRef}>
            <Card>
              <div className="col gap">
                <div>
                  <div className="small muted">{selected.contentCode || 'Tugasan umum'}{content?.platform ? ` · ${content.platform}` : ''}</div>
                  <h2 style={{ fontSize: 18 }}>{selected.contentTitle || selected.description}</h2>
                  <div className="row gap-sm wrap" style={{ marginTop: 6 }}>
                    <Pill tone="brand">Tugas anda: {findOpt(TASK_ROLES, selected.role).label}</Pill>
                    <Pill tone={selected.deadline && selected.deadline <= t0 && selected.status !== 'done' ? 'red' : 'gray'}>{selected.deadline ? `Siap ${fmtDate(selected.deadline, { weekday: 'short' })}` : 'Tiada deadline'}</Pill>
                  </div>
                  {selected.description && selected.contentTitle && <p className="small" style={{ marginTop: 8 }}>{selected.description}</p>}
                </div>

                {content && (content.brief?.hook || content.brief?.concept || content.brief?.script) && (
                  <div className="card-pad" style={{ background: 'var(--surface-2)', borderRadius: 11 }}>
                    <h3>Brief</h3>
                    {content.brief.topic && <p className="small"><strong>Topik:</strong> {content.brief.topic}</p>}
                    {content.brief.hook && <p className="small"><strong>Hook:</strong> {content.brief.hook}</p>}
                    {content.brief.concept && <p className="small pre-line" style={{ marginTop: 4 }}>{content.brief.concept}</p>}
                    {content.brief.script && <details><summary className="small strong">Skrip penuh</summary><p className="small pre-line">{content.brief.script}</p></details>}
                  </div>
                )}

                {content && (
                  <div>
                    <h3>Senarai semak</h3>
                    {checklist.map((i) => (
                      <label key={i.key} className="check"><input type="checkbox" checked={!!content.checklist?.[i.key]} onChange={(e) => run(() => updateById('content', content.id, { checklist: { ...(content.checklist || {}), [i.key]: e.target.checked } }, profile))} />{i.label}</label>
                    ))}
                  </div>
                )}

                {content && (
                  <div className="col gap-sm">
                    <h3>Link</h3>
                    {(content.links || []).map((l) => <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="row gap-sm small"><ExternalLink size={14} />{l.label}</a>)}
                    <Field label="Link draf atau raw footage"><Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" /></Field>
                    <Button size="sm" className="self-start" disabled={!link} onClick={async () => { const ok = await run(() => addLink(content, { url: link, label: `${findOpt(TASK_ROLES, selected.role).label} · ${profile.name}`, category: 'Draf' }, profile), 'Link ditambah'); if (ok) setLink(''); }}>Tambah link</Button>
                  </div>
                )}

                <Field label="Nota produksi"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shot 3 guna cahaya tingkap" /></Field>
                <div className="row gap-sm wrap">
                  <Button size="sm" disabled={note === (selected.notes || '')} onClick={() => run(() => updateOwnTask(selected, { notes: note }, profile), 'Nota disimpan')}>Simpan nota</Button>
                  {selected.status === 'todo' && <Button size="sm" onClick={() => run(() => updateOwnTask(selected, { status: 'in_progress' }, profile), 'Dimulakan')}>Mula</Button>}
                  {selected.status === 'done' && <Button size="sm" onClick={() => run(() => updateOwnTask(selected, { status: 'in_progress' }, profile), 'Dibuka semula')}>Buka semula</Button>}
                </div>
                {selected.status !== 'done' && <Button variant="primary" icon={CheckCircle2} onClick={() => run(() => updateOwnTask(selected, { status: 'done' }, profile), 'Ditanda siap')}>Tanda {findOpt(TASK_ROLES, selected.role).label.toLowerCase()} siap</Button>}
                {content && <Link to={`/content/${content.id}`} className="small">Buka halaman penuh content →</Link>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
