// Jadual pos: senarai kerja Social Media Manager untuk pos ke SEMUA akaun (TikTok, IG, FB, Threads…).
// Setiap baris = satu pos (pos utama atau pos silang). Klik baris → panel kanan dengan caption, hashtag,
// link video final dan ruang tampal link post. Status pos dikira dari kemajuan & kelulusan video.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, Settings2, Plus, Trash2, CalendarClock, Link2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { isArchived } from '../lib/statuses';
import { markProgress, markCrossPost, saveSocialSettings, addPostLink, setPostTiming } from '../lib/db';
import { postsOf, postState, POST_STATES, accountsOf, accountColor, accountLabel, postedDayOf, timingOf, autoOnTime, onTimeDeadline } from '../lib/social';
import { uid } from '../lib/constants';
import { today, addDays, fmtDate, fmtDateTime, relDue } from '../lib/dates';
import { usePersistentState } from '../hooks/usePersistentState';
import { PageHeader, Card, Button, Segmented, Select, Pill, Empty, Loading, Modal, Field, Input } from '../components/ui';
import BriefDrawer from '../components/BriefDrawer';

const bucketOf = (time) => {
  if (!time) return 'Tiada masa';
  const h = Number(time.slice(0, 2));
  if (h < 12) return 'Pagi';
  if (h < 17) return 'Tengah hari';
  return 'Malam';
};
const BUCKETS = ['Pagi', 'Tengah hari', 'Malam', 'Tiada masa'];

async function copy(text, success) {
  try { await navigator.clipboard.writeText(text || ''); success('Disalin'); } catch { /* abaikan */ }
}

export default function Posting() {
  const { content, staffById, tasks, ready } = useData();
  const { profile } = useAuth();
  const config = useConfig();
  const { run, success } = useToast();
  const [range, setRange] = usePersistentState('post_range', 'today');
  const [account, setAccount] = usePersistentState('post_account', '');
  const [showDone, setShowDone] = usePersistentState('post_done', true);
  const [selKey, setSelKey] = useState(null);
  const [url, setUrl] = useState('');
  const [postDate, setPostDate] = useState(today());
  const [links, setLinks] = useState({}); // input link bagi senarai peringatan
  const [busy, setBusy] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const t0 = today();
  const canPost = can(profile, 'content.post') || !!config?.social?.creatorCanPost;
  const accounts = accountsOf(config);

  const allPosts = useMemo(() => content
    .filter((c) => !c.archived && !isArchived(config, c.status))
    .flatMap((c) => postsOf(config, c))
    .filter((p) => p.date)
    .map((p) => ({ ...p, state: postState(config, p) })), [content, config]);

  const to = range === 'today' ? t0 : range === 'tomorrow' ? addDays(t0, 1) : addDays(t0, 6);
  const from = range === 'tomorrow' ? addDays(t0, 1) : t0;
  const inScope = (p) => (!account || p.account.id === account);
  const list = allPosts.filter((p) => inScope(p) && p.date >= from && p.date <= to && (showDone || p.state !== 'done'))
    .sort((a, b) => `${a.date}${a.time || '99'}`.localeCompare(`${b.date}${b.time || '99'}`));
  const late = allPosts.filter((p) => inScope(p) && p.date < t0 && p.date >= addDays(t0, -14) && p.state !== 'done')
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  const days = [...new Set(list.map((p) => p.date))];
  const selected = [...late, ...list].find((p) => p.key === selKey) || list.find((p) => p.state === 'ready') || late[0] || list[0] || null;
  const todayPosts = allPosts.filter((p) => p.date === t0);
  // Peringatan: pos yang sudah ditanda dipos tetapi belum ada link (30 hari terakhir).
  const noLink = allPosts.filter((p) => inScope(p) && p.state === 'done' && !p.url && !p.content.isSlot && p.date <= t0 && p.date >= addDays(t0, -30))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Tarikh dipos lalai ikut pos yang dipilih: tarikh jadual jika sudah lepas, jika tidak hari ini.
  const selDate = selected?.date || '';
  useEffect(() => { setPostDate(selDate && selDate < t0 ? selDate : t0); }, [selected?.key, selDate, t0]);

  if (!ready) return <div className="page"><Loading /></div>;

  // Tarikh dipos lalai: tarikh jadual jika sudah lepas (contoh pos malam semalam ditanda pagi ini).
  const pick = (p) => { setSelKey(p.key); setUrl(''); };
  const markPosted = async (p, on, scheduled = false) => {
    const date = scheduled ? p.date : (postDate || t0);
    setBusy(true);
    const ok = await run(() => (p.primary
      ? markProgress(p.content, 'posted', on, { config, profile, staffById, tasks, publishUrl: url, publishedDate: date, scheduled })
      : markCrossPost(p.content, p.idx, on, { url, date, scheduled, profile })),
    on ? (scheduled ? `Ditanda: dijadual dalam app (${accountLabel(p.account)})` : `Dipos ke ${accountLabel(p.account)}${url.trim() ? '' : '. Jangan lupa tambah link post.'}`) : 'Tanda pos dibuang');
    setBusy(false);
    if (ok) setUrl('');
  };
  const saveLink = async (p, value) => {
    const ok = await run(() => addPostLink(p, value, profile), 'Link post disimpan');
    if (ok) setLinks((x) => ({ ...x, [p.key]: '' }));
  };
  const canTiming = can(profile, 'content.approve');

  const row = (p) => {
    const st = POST_STATES[p.state];
    const c = p.content;
    const ownerName = staffById[c.ownerStaffId]?.name || c.ownerName;
    return (
      <button key={p.key} type="button" className={`post-q-row${selected?.key === p.key ? ' on' : ''}`} onClick={() => pick(p)}>
        <strong className="post-q-time">{p.time || '—'}</strong>
        <span className="acc-chip"><span className="dot" style={{ background: accountColor(config, p.account.id) }} />{accountLabel(p.account)}</span>
        <span className="grow min0" style={{ flexBasis: 220 }}>
          <span className="block"><span className="code-tag">{c.code}</span> <strong>{c.isSlot ? (c.slotLabel || 'Slot kosong') : c.title}</strong></span>
          <span className="small muted">{[ownerName, !p.primary && 'pos silang', p.state === 'done' && p.postedBy && `dipos oleh ${p.postedBy}`].filter(Boolean).join(' · ')}</span>
        </span>
        <Pill tone={st.tone}>{st.label}</Pill>
      </button>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Jadual pos" actions={<>
        {can(profile, 'social.manage') && <Button icon={Settings2} onClick={() => setAccOpen(true)}>Akaun & tetapan</Button>}
      </>}>
        <p className="muted small" style={{ marginTop: 4 }}>Semua pos ke semua akaun. Pilih satu pos, salin caption, pos di app, kemudian tampal link dan tanda sudah dipos.</p>
      </PageHeader>

      <div className="toolbar">
        <Segmented value={range} onChange={setRange} options={[
          { key: 'today', label: `Hari ini (${allPosts.filter((p) => inScope(p) && p.date === t0).length})` },
          { key: 'tomorrow', label: `Esok (${allPosts.filter((p) => inScope(p) && p.date === addDays(t0, 1)).length})` },
          { key: 'week', label: `7 hari (${allPosts.filter((p) => inScope(p) && p.date >= t0 && p.date <= addDays(t0, 6)).length})` },
        ]} />
        <Select value={account} onChange={(e) => setAccount(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))} placeholder="Semua akaun" aria-label="Akaun" />
        <label className="check small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Tunjuk yang sudah dipos</label>
      </div>

      <div className="acc-today">
        {accounts.map((a) => {
          const mine = todayPosts.filter((p) => p.account.id === a.id);
          const done = mine.filter((p) => p.state === 'done').length;
          return (
            <div key={a.id} className="acc-today-item">
              <span className="row gap-xs small"><span className="dot" style={{ background: accountColor(config, a.id) }} />{accountLabel(a)}</span>
              <strong>{done}/{mine.length}</strong>
              <span className="acc-bar"><span style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%`, background: accountColor(config, a.id) }} /></span>
            </div>
          );
        })}
      </div>

      <div className="split">
        <div className="main">
          {noLink.length > 0 && (
            <Card pad={false} className="video-group link-remind">
              <div className="video-group-head"><strong className="row gap-xs"><Link2 size={16} />Masukkan link post segera ({noLink.length})</strong><span className="small muted">Link diperlukan untuk laporan Hari ke-7</span></div>
              {noLink.map((p) => (
                <div key={p.key} className="link-row">
                  <span className="grow min0" style={{ flexBasis: 240 }}>
                    <span className="block"><span className="code-tag">{p.content.code}</span> <strong>{p.content.title}</strong></span>
                    <span className="small muted">{accountLabel(p.account)} · dipos {fmtDate(postedDayOf(p) || p.date, { weekday: 'short' })}{p.content.scheduledInApp || p.content.crossPosts?.[p.idx]?.scheduled ? ' · dijadual dalam app' : ''}</span>
                  </span>
                  {canPost || p.content.ownerUid === profile.uid ? (
                    <span className="row gap-xs" style={{ flex: '1 1 300px' }}>
                      <Input type="url" aria-label={`Link post ${p.content.code}`} value={links[p.key] || ''} onChange={(e) => setLinks((x) => ({ ...x, [p.key]: e.target.value }))} placeholder="Tampal link post https://…" />
                      <Button size="sm" variant="primary" disabled={!(links[p.key] || '').trim()} onClick={() => saveLink(p, links[p.key])}>Simpan</Button>
                    </span>
                  ) : <span className="small warn-text">Belum ada link</span>}
                </div>
              ))}
            </Card>
          )}
          {late.length > 0 && (
            <Card pad={false} className="video-group">
              <div className="video-group-head late"><strong>Lewat (belum dipos)</strong><span className="small muted">{late.length} pos</span></div>
              {late.map((p) => <div key={p.key} className="post-q-wrap"><span className="small danger-text post-q-date">{relDue(p.date)}</span>{row(p)}</div>)}
            </Card>
          )}
          {!list.length && <Card><Empty title="Tiada pos dalam tempoh ini" text="Tambah tarikh pos pada content, atau pilih tempoh lain." /></Card>}
          {days.map((d) => (
            <div key={d} className="col gap-sm">
              {days.length > 1 && <h2 className="muted" style={{ fontSize: 13 }}>{fmtDate(d, { weekday: 'long' })} · {relDue(d)}</h2>}
              {BUCKETS.map((b) => {
                const items = list.filter((p) => p.date === d && bucketOf(p.time) === b);
                if (!items.length) return null;
                const done = items.filter((p) => p.state === 'done').length;
                return (
                  <Card key={b} pad={false} className="video-group">
                    <div className="video-group-head"><strong>{b}</strong><span className="small muted">{items.length} pos{done ? ` · ${done} sudah` : ''}</span></div>
                    {items.map(row)}
                  </Card>
                );
              })}
            </div>
          ))}
        </div>

        {selected && (
          <div className="side">
            <Card className="post-panel">
              <div className="col gap">
                <div>
                  <div className="small muted">{fmtDate(selected.date, { weekday: 'short' })}{selected.time ? ` · ${selected.time}` : ''} · {accountLabel(selected.account)}</div>
                  <h2 style={{ fontSize: 17, margin: '2px 0' }}><span className="code-tag">{selected.content.code}</span> {selected.content.title || selected.content.slotLabel}</h2>
                  <Pill tone={POST_STATES[selected.state].tone}>{POST_STATES[selected.state].label}</Pill>
                  {selected.content.approval?.outcome === 'approved' && <div className="small ok-text" style={{ marginTop: 6 }}>Video diluluskan oleh {selected.content.approval.byName}</div>}
                </div>

                {(selected.content.links || []).slice(-3).reverse().map((l) => (
                  <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="post-link"><span className="ellipsis">{l.label}{l.category ? ` · ${l.category}` : ''}</span><ExternalLink size={14} /></a>
                ))}

                {[['Caption', selected.content.brief?.caption], ['Hashtag', selected.content.brief?.hashtags], ['Call to action', selected.content.brief?.cta]].map(([label, text]) => (
                  <div key={label} className="col gap-xs">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="small strong muted">{label}</span>
                      {text && <button type="button" className="link-btn row gap-xs" onClick={() => copy(text, success)}><Copy size={13} />Salin</button>}
                    </div>
                    <div className="copy-box">{text || <span className="muted">Belum diisi dalam brief.</span>}</div>
                  </div>
                ))}
                {(selected.content.brief?.caption || selected.content.brief?.hashtags) && (
                  <Button size="sm" icon={Copy} onClick={() => copy([selected.content.brief?.caption, selected.content.brief?.hashtags].filter(Boolean).join('\n\n'), success)}>Salin caption + hashtag</Button>
                )}

                {selected.state === 'done' ? (
                  <div className="col gap-sm">
                    <span className="small">{(selected.primary ? selected.content.scheduledInApp : selected.content.crossPosts?.[selected.idx]?.scheduled) ? 'Dijadual dalam app' : 'Dipos'} {fmtDate(postedDayOf(selected) || selected.date, { weekday: 'short' })}{selected.postedBy ? ` oleh ${selected.postedBy}` : ''}</span>
                    {selected.url ? <a href={selected.url} target="_blank" rel="noreferrer" className="row gap-xs"><ExternalLink size={14} />Lihat post</a> : (
                      <div className="warnbox col gap-sm" style={{ alignItems: 'stretch' }}>
                        <strong className="small">Belum ada link post</strong>
                        <Input type="url" value={links[selected.key] || ''} onChange={(e) => setLinks((x) => ({ ...x, [selected.key]: e.target.value }))} placeholder="Tampal link post https://…" />
                        <Button size="sm" variant="primary" disabled={!(links[selected.key] || '').trim()} onClick={() => saveLink(selected, links[selected.key])}>Simpan link</Button>
                      </div>
                    )}
                    <TimingControl post={selected} config={config} canEdit={canTiming} onChange={(v) => run(() => setPostTiming(selected, v, profile), 'Status tepat masa dikemas kini')} />
                    {canPost && <Button size="sm" onClick={() => markPosted(selected, false)} disabled={busy}>Buang tanda dipos</Button>}
                  </div>
                ) : selected.state === 'ready' ? (
                  canPost ? (
                    <div className="col gap-sm">
                      <Field label="Link post" hint="Pilihan. Boleh tambah kemudian; sistem akan ingatkan."><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
                      <Field label="Tarikh dipos"><Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} /></Field>
                      <Button variant="primary" icon={Check} busy={busy} onClick={() => markPosted(selected, true)}>Tanda sudah dipos</Button>
                      {selected.date >= t0 && (
                        <Button icon={CalendarClock} busy={busy} onClick={() => markPosted(selected, true, true)} title="Untuk pos malam / hujung minggu yang sudah dijadualkan dalam TikTok, Meta Business Suite dan lain-lain">
                          Sudah dijadual dalam app ({fmtDate(selected.date, { weekday: 'short' })}{selected.time ? ` ${selected.time}` : ''})
                        </Button>
                      )}
                    </div>
                  ) : <p className="small muted">Pos dibuat oleh Social Media Manager.</p>
                ) : selected.state === 'waiting' ? (
                  <div className="col gap-sm">
                    <p className="small warn-text">Video menunggu kelulusan sebelum boleh dipos.</p>
                    {can(profile, 'content.approve') && <Link to="/approvals" className="btn btn-secondary btn-sm">Buka Kelulusan</Link>}
                  </div>
                ) : selected.state === 'slot' ? (
                  <div className="col gap-sm">
                    <p className="small danger-text">Slot ini belum ada content.</p>
                    {can(profile, 'content.edit') && <Button size="sm" icon={Plus} onClick={() => setDrawer({ content: selected.content })}>Isi slot</Button>}
                  </div>
                ) : (
                  <p className="small danger-text">Video belum siap {selected.content.progress?.shot ? 'diedit' : 'dishoot'}. Hubungi {staffById[selected.content.ownerStaffId]?.name || 'pemilik'} atau tukar tarikh pos.</p>
                )}
                <Link to={`/content/${selected.content.id}`} className="small">Buka halaman content →</Link>
              </div>
            </Card>
          </div>
        )}
      </div>

      <AccountsModal open={accOpen} onClose={() => setAccOpen(false)} />
      <BriefDrawer open={!!drawer} onClose={() => setDrawer(null)} content={drawer?.content} />
    </div>
  );
}

// Urus akaun media sosial + siapa boleh tanda Pos. Disimpan dalam settings/social.
function AccountsModal({ open, onClose }) {
  const config = useConfig();
  const { profile } = useAuth();
  const { run } = useToast();
  const [rows, setRows] = useState([]);
  const [creatorPost, setCreatorPost] = useState(false);
  const [grace, setGrace] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRows(accountsOf(config).map((a) => ({ ...a })));
    setCreatorPost(!!config?.social?.creatorCanPost);
    setGrace(config?.social?.graceWorkingDay !== false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const platforms = [...new Set([...(config.platforms || []), 'TikTok', 'Instagram', 'Facebook', 'Threads', 'YouTube', 'X', 'LinkedIn', 'Lemon8', 'Shopee'])];
  const setRow = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    const clean = rows.filter((r) => r.platform).map((r) => ({
      id: r.id || uid(), platform: r.platform, handle: (r.handle || '').trim(),
      name: (r.handle || '').trim() ? `${r.platform} ${(r.handle || '').trim()}` : r.platform,
    }));
    setBusy(true);
    const ok = await run(() => saveSocialSettings({ accounts: clean, creatorCanPost: creatorPost, graceWorkingDay: grace }, profile), 'Akaun media sosial disimpan');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide title="Akaun media sosial" footer={<>
      <Button onClick={onClose}>Batal</Button>
      <Button variant="primary" busy={busy} onClick={save}>Simpan</Button>
    </>}>
      <p className="small muted">Senarai akaun yang dipos oleh pasukan. Warna kalendar (Warna ikut: Akaun) mengikut susunan ini. Akaun lama yang dibuang tidak memadam content.</p>
      <div className="col gap-sm">
        {rows.map((r, i) => (
          <div key={r.id || i} className="row gap-sm wrap" style={{ alignItems: 'end' }}>
            <span className="dot" style={{ background: accountColor({ social: { accounts: rows } }, r.id), width: 12, height: 12, marginBottom: 14 }} />
            <Field label={i === 0 ? 'Platform' : undefined}><Select value={r.platform} onChange={(e) => setRow(i, 'platform', e.target.value)} options={platforms} placeholder="Pilih" /></Field>
            <Field label={i === 0 ? 'Nama akaun / handle' : undefined}><Input value={r.handle || ''} onChange={(e) => setRow(i, 'handle', e.target.value)} placeholder="@dibu.my" /></Field>
            <button type="button" className="icon-btn" aria-label="Buang akaun" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
          </div>
        ))}
        <Button size="sm" icon={Plus} className="self-start" onClick={() => setRows((x) => [...x, { id: uid(), platform: '', handle: '' }])}>Tambah akaun</Button>
      </div>
      <label className="check" style={{ marginTop: 16 }}>
        <input type="checkbox" checked={creatorPost} onChange={(e) => setCreatorPost(e.target.checked)} />
        Content Creator boleh tanda Pos sendiri (jika tidak, hanya SMM / pengurus yang pos)
      </label>
      <label className="check" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={grace} onChange={(e) => setGrace(e.target.checked)} />
        Kira "tepat masa" jika ditanda dipos sebelum hujung hari bekerja berikutnya (pos malam / hujung minggu tidak dikira lewat)
      </label>
    </Modal>
  );
}

// Status tepat masa satu pos: kiraan automatik + pelarasan Admin / SMM.
export function TimingControl({ post, config, canEdit, onChange }) {
  const auto = autoOnTime(config, post);
  const cur = timingOf(post);
  const final = cur ? cur === 'ontime' : auto;
  return (
    <div className="col gap-xs">
      <span className="small">
        <span className="muted">Tepat masa: </span>
        <strong className={final ? 'ok-text' : 'danger-text'}>{final ? 'Ya' : 'Lewat'}</strong>
        <span className="muted"> · {cur ? 'dilaras manual' : `auto (had ${fmtDate(onTimeDeadline(config, post.date), { weekday: 'short' })})`}</span>
      </span>
      {canEdit && (
        <Select value={cur} onChange={(e) => onChange(e.target.value)} aria-label="Laras tepat masa"
          options={[{ value: '', label: `Auto (${auto ? 'tepat masa' : 'lewat'})` }, { value: 'ontime', label: 'Tepat masa' }, { value: 'late', label: 'Lewat' }]} />
      )}
    </div>
  );
}
