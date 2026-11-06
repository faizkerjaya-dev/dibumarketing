// Satu baris video dengan butang Shoot · Edit · Pos. Digunakan dalam "Hari ini" dan senarai lain.
import { Link } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';
import { useData } from '../context/DataContext';
import { stageOf } from '../lib/statuses';
import { planApproved, lateSteps } from '../lib/progress';
import { typeColor } from '../lib/colors';
import { fmtDate, relDue } from '../lib/dates';
import { ProgressButtons } from './Progress';

export default function VideoRow({ content: c, action, showOwner }) {
  const config = useConfig();
  const { staffById } = useData();
  const stage = stageOf(config, c.status);
  const late = lateSteps(config, c);
  const ownerName = staffById[c.ownerStaffId]?.name || c.ownerName;
  return (
    <div className="video-row">
      <div className="grow min0" style={{ flexBasis: 260 }}>
        <div className="row gap-sm wrap">
          <span className="code-tag">{c.code}</span>
          <Link to={`/content/${c.id}`} className="video-title">{c.title || c.slotLabel || 'Tanpa tajuk'}</Link>
        </div>
        <div className="day-meta">
          {c.shootDate && <span className={late.includes('shot') ? 'danger-text' : 'muted'}>Shoot {fmtDate(c.shootDate, { weekday: 'short' })}</span>}
          {c.publishDate && <span className={late.includes('posted') ? 'danger-text' : 'strong'}>Pos {fmtDate(c.publishDate, { weekday: 'short' })}{c.publishTime ? ` ${c.publishTime}` : ''} · {relDue(c.publishDate)}</span>}
          {c.platform && <span className="tag">{c.platform}</span>}
          {c.type && <span className="meta-dot"><span className="dot" style={{ background: typeColor(config, c.type) }} />{c.type}</span>}
          {showOwner && ownerName && <span className="muted">{ownerName}</span>}
          {!planApproved(config, c) && <span className="warn-text">{c.planReturn?.at ? 'Idea perlu diubah' : 'Idea belum lulus'}</span>}
          {stage === 'review' && <span className="warn-text">Video menunggu kelulusan</span>}
          {stage === 'published' && !c.publishUrl && <span className="warn-text">Link post belum dimasukkan</span>}
        </div>
      </div>
      <ProgressButtons content={c} action={action} />
    </div>
  );
}
