// Pusat kawalan Social Media Manager: satu skrin untuk pantau dan kawal pasukan content creator.
//   - Ringkasan: perlu dilulus, pos hari ini, lewat, Hari ke-7 belum direkod
//   - Perlu tindakan anda: senarai kerja SMM yang disusun ikut keutamaan
//   - Pos hari ini ikut akaun
//   - Kad setiap creator (minggu ini): shoot / edit / pos, lewat, menunggu lulus, KPI bulan ini
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useConfig } from '../context/ConfigContext';
import { useQuery, useDoc } from '../hooks/useFirestore';
import { stageOf, isArchived } from '../lib/statuses';
import { progressOf, lateSteps } from '../lib/progress';
import { postsOf, postState, accountsOf, accountColor, accountLabel } from '../lib/social';
import { postedOn } from '../lib/performance';
import { monthKey, monthPace, staffTarget, kpiStatus } from '../lib/kpi';
import { today, addDays, startOfWeek, fmtDate, relDue, parseDate } from '../lib/dates';
import { PageHeader, Card, Pill, Avatar, Loading, Empty } from '../components/ui';
import { KpiBar } from './Kpi';

export default function Control() {
  const { content, staff, staffColor, ready } = useData();
  const config = useConfig();
  const t0 = today();
  const wk0 = startOfWeek(t0);
  const wk1 = addDays(wk0, 6);
  const kKey = monthKey(parseDate(t0).getFullYear(), parseDate(t0).getMonth());
  const metrics = useQuery(useMemo(() => collection(db, 'metrics'), []), []);
  const targets = useDoc(useMemo(() => doc(db, 'kpiTargets', kKey), [kKey]), kKey);

  const live = useMemo(() => content.filter((c) => !c.archived && !c.isSlot && !isArchived(config, c.status)), [content, config]);
  const d7done = useMemo(() => new Set(metrics.data.filter((m) => m.checkpoint === 'd7').map((m) => m.targetId)), [metrics.data]);
  const posts = useMemo(() => content.filter((c) => !c.archived && !isArchived(config, c.status)).flatMap((c) => postsOf(config, c)).filter((p) => p.date).map((p) => ({ ...p, state: postState(config, p) })), [content, config]);

  if (!ready) return <div className="page"><Loading /></div>;

  const stage = (c) => stageOf(config, c.status);
  const videos = live.filter((c) => stage(c) === 'review');
  const ideasSoon = live.filter((c) => stage(c) === 'idea' && (c.shootDate || c.publishDate) && (c.shootDate || c.publishDate) <= addDays(t0, 14));
  const lateShoot = live.filter((c) => lateSteps(config, c, t0).includes('shot'));
  const latePosts = posts.filter((p) => p.date < t0 && p.date >= addDays(t0, -14) && p.state !== 'done');
  const todayPosts = posts.filter((p) => p.date === t0);
  const emptySlots = posts.filter((p) => p.state === 'slot' && p.date >= t0 && p.date <= addDays(t0, 3));
  const notReadySoon = posts.filter((p) => ['notready'].includes(p.state) && p.date >= t0 && p.date <= addDays(t0, 1));
  const noLink = posts.filter((p) => p.state === 'done' && !p.url && p.date <= t0 && p.date >= addDays(t0, -30));
  const d7due = live.filter((c) => stage(c) === 'published' && postedOn(c) <= addDays(t0, -7) && postedOn(c) >= addDays(t0, -60) && !d7done.has(c.id));

  const ideaWeeks = {};
  ideasSoon.forEach((c) => { const k = startOfWeek(c.publishDate || c.shootDate); ideaWeeks[k] = (ideaWeeks[k] || 0) + 1; });

  const todo = [
    ...videos.sort((a, b) => (a.publishDate || '9999').localeCompare(b.publishDate || '9999')).slice(0, 6).map((c) => ({ key: `v${c.id}`, kind: 'Lulus video', tone: 'amber', title: `${c.code} ${c.title}`, meta: `${c.ownerName || 'Tiada pemilik'} · pos ${c.publishDate ? relDue(c.publishDate).toLowerCase() : 'tiada tarikh'}`, to: '/approvals', action: 'Semak' })),
    ...Object.entries(ideaWeeks).sort().map(([k, n]) => ({ key: `i${k}`, kind: 'Lulus idea', tone: 'blue', title: `${n} idea minggu ${fmtDate(k)} – ${fmtDate(addDays(k, 6))}`, meta: 'Luluskan supaya creator boleh mula shoot', to: '/approvals', action: 'Lulus minggu' })),
    ...latePosts.slice(0, 5).map((p) => ({ key: `p${p.key}`, kind: 'Belum dipos', tone: 'red', title: `${p.content.code} ${p.content.title || p.content.slotLabel || ''}`, meta: `${accountLabel(p.account)} · ${relDue(p.date)}`, to: '/posting', action: 'Buka' })),
    ...lateShoot.slice(0, 5).map((c) => ({ key: `s${c.id}`, kind: 'Lewat shoot', tone: 'red', title: `${c.code} ${c.title}`, meta: `${c.ownerName || 'Tiada pemilik'} · sasaran shoot ${fmtDate(c.shootDate)}`, to: `/content/${c.id}`, action: 'Buka' })),
    ...notReadySoon.slice(0, 5).map((p) => ({ key: `n${p.key}`, kind: 'Belum siap', tone: 'red', title: `${p.content.code} ${p.content.title}`, meta: `${accountLabel(p.account)} · pos ${relDue(p.date).toLowerCase()}`, to: `/content/${p.content.id}`, action: 'Buka' })),
    ...emptySlots.slice(0, 5).map((p) => ({ key: `e${p.key}`, kind: 'Slot kosong', tone: 'red', title: `${accountLabel(p.account)} · ${fmtDate(p.date, { weekday: 'short' })}${p.time ? ` ${p.time}` : ''}`, meta: 'Tiada video untuk slot ini', to: '/posting', action: 'Isi slot' })),
    ...(noLink.length ? [{ key: 'nolink', kind: 'Link post', tone: 'amber', title: `${noLink.length} pos belum ada link`, meta: 'Masukkan link segera supaya laporan boleh dipadankan', to: '/posting', action: 'Masukkan' }] : []),
    ...(d7due.length ? [{ key: 'd7', kind: 'Laporan', tone: 'green', title: `${d7due.length} video perlu rekod Hari ke-7`, meta: 'Isi sekali gus dalam satu jadual', to: '/performance', action: 'Rekod' }] : []),
  ];

  // Kad creator: semua staf yang memiliki content dalam minggu ini atau bulan ini.
  const pace = monthPace(kKey);
  const monthFrom = `${kKey}-01`;
  const team = staff.filter((s) => s.status !== 'inactive').map((s) => {
    const own = live.filter((c) => c.ownerStaffId === s.id);
    const week = own.filter((c) => (c.publishDate >= wk0 && c.publishDate <= wk1) || (c.shootDate >= wk0 && c.shootDate <= wk1));
    const pr = week.map((c) => progressOf(config, c));
    const publishedMonth = content.filter((c) => c.ownerStaffId === s.id && stage(c) === 'published' && postedOn(c) >= monthFrom && postedOn(c) <= t0).length;
    const target = staffTarget(targets.data, s.id, 'published');
    return {
      s, n: week.length, own: own.length,
      shot: pr.filter((x) => x.shot).length, edited: pr.filter((x) => x.edited).length, posted: pr.filter((x) => x.posted).length,
      late: own.filter((c) => lateSteps(config, c, t0).length).length,
      waiting: own.filter((c) => stage(c) === 'review').length,
      d7: d7due.filter((c) => c.ownerStaffId === s.id).length,
      publishedMonth, target, kst: kpiStatus(publishedMonth, target, 'count', pace),
    };
  }).filter((x) => x.own > 0 || x.publishedMonth > 0).sort((a, b) => b.late - a.late || b.n - a.n);

  const accounts = accountsOf(config);
  const stats = [
    { label: 'Perlu dilulus', value: videos.length + ideasSoon.length, hint: `${ideasSoon.length} idea (14 hari) · ${videos.length} video`, tone: videos.length + ideasSoon.length ? 'amber' : undefined, to: '/approvals' },
    { label: 'Pos hari ini', value: `${todayPosts.filter((p) => p.state === 'done').length} / ${todayPosts.length}`, hint: `${todayPosts.filter((p) => p.state === 'ready').length} sedia dipos`, to: '/posting' },
    { label: 'Lewat', value: lateShoot.length + latePosts.length, hint: `${lateShoot.length} belum shoot · ${latePosts.length} belum pos`, tone: lateShoot.length + latePosts.length ? 'red' : undefined },
    { label: 'Hari ke-7 belum direkod', value: d7due.length, hint: 'Rekod seminggu sekali', to: '/performance' },
  ];

  return (
    <div className="page">
      <PageHeader title="Pusat kawalan" crumb={fmtDate(t0, { weekday: 'long', year: 'numeric' })} actions={<>
        <Link to="/performance" className="btn btn-secondary">Rekod mingguan</Link>
        <Link to="/posting" className="btn btn-primary">Buka jadual pos</Link>
      </>} />

      <div className="stats">
        {stats.map((x) => {
          const inner = <><span className="stat-label">{x.label}</span><span className="stat-value">{x.value}</span><span className="stat-hint">{x.hint}</span></>;
          return x.to
            ? <Link key={x.label} to={x.to} className={`stat stat-link${x.tone ? ` stat-${x.tone}` : ''}`}>{inner}</Link>
            : <div key={x.label} className={`stat${x.tone ? ` stat-${x.tone}` : ''}`}>{inner}</div>;
        })}
      </div>

      <div className="split">
        <div className="main">
          <Card pad={false} className="video-group">
            <div className="video-group-head"><strong>Perlu tindakan anda</strong><span className="small muted">{todo.length} perkara</span></div>
            {!todo.length && <div className="card-pad"><Empty title="Semua beres" text="Tiada kelulusan, pos lewat atau laporan tertunggak." /></div>}
            {todo.map((t) => (
              <Link key={t.key} to={t.to} className="todo-row">
                <Pill tone={t.tone}>{t.kind}</Pill>
                <span className="grow min0"><strong className="block ellipsis">{t.title}</strong><span className="small muted">{t.meta}</span></span>
                <span className="small strong link-text">{t.action}</span>
              </Link>
            ))}
          </Card>
        </div>
        <div className="side">
          <Card title="Pos hari ini ikut akaun">
            <div className="col gap-sm">
              {accounts.map((a) => {
                const mine = todayPosts.filter((p) => p.account.id === a.id);
                const done = mine.filter((p) => p.state === 'done').length;
                return (
                  <div key={a.id} className="col gap-xs">
                    <div className="row small" style={{ justifyContent: 'space-between' }}><span className="row gap-xs"><span className="dot" style={{ background: accountColor(config, a.id), width: 9, height: 9, borderRadius: '50%', display: 'inline-block' }} />{accountLabel(a)}</span><strong>{done} / {mine.length}</strong></div>
                    <span className="acc-bar"><span style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%`, background: accountColor(config, a.id) }} /></span>
                  </div>
                );
              })}
              <Link to="/posting" className="small">Buka jadual pos →</Link>
            </div>
          </Card>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Pasukan creator · minggu ini</h2>
        <span className="small muted">{fmtDate(wk0)} – {fmtDate(wk1)}</span>
      </div>
      {!team.length && <Card><Empty title="Belum ada content dengan pemilik" text="Tetapkan pemilik content supaya kemajuan setiap creator kelihatan di sini." /></Card>}
      <div className="team-grid">
        {team.map((x) => (
          <Link key={x.s.id} to={`/team/${x.s.id}`} className="team-card">
            <span className="row gap-sm">
              <span className="owner-ring" style={{ '--ring': staffColor[x.s.id] }}><Avatar name={x.s.name} size={36} /></span>
              <span className="col"><strong>{x.s.name}</strong><span className="small muted">{x.n} video minggu ini</span></span>
            </span>
            <span className="team-steps">
              {[['Shoot', x.shot], ['Edit', x.edited], ['Pos', x.posted]].map(([l, v]) => <span key={l}><strong>{v}/{x.n}</strong><span>{l}</span></span>)}
            </span>
            <span className="row gap-xs wrap">
              {x.late > 0 && <Pill tone="red">{x.late} lewat</Pill>}
              {x.waiting > 0 && <Pill tone="amber">{x.waiting} tunggu lulus</Pill>}
              {x.d7 > 0 && <Pill tone="blue">{x.d7} H7 belum</Pill>}
              {!x.late && !x.waiting && !x.d7 && <Pill tone="green">Atas jadual</Pill>}
            </span>
            <span className="col gap-xs">
              <span className="row small" style={{ justifyContent: 'space-between' }}><span className="muted">KPI terbit bulan ini</span><strong>{x.publishedMonth}{x.target ? ` / ${x.target}` : ''}</strong></span>
              <KpiBar ratio={x.kst.ratio} pace={pace} tone={x.kst.tone === 'gray' ? 'gray' : x.kst.tone} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
