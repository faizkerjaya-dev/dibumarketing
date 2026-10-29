import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { useToast } from '../context/ToastContext';
import { fmtDateTime } from '../lib/dates';
import { PageHeader, Card, Button, Loading, ErrorBox, Empty } from '../components/ui';

export default function Notifications() {
  const { items, unread, loading, error, markRead, markAllRead } = useNotifications();
  const { run } = useToast();
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHeader title="Notifikasi" actions={unread > 0 && <Button onClick={() => run(markAllRead, 'Semua ditanda dibaca')}>Tanda semua dibaca</Button>} />
      <Card>
        {loading && <Loading />}
        <ErrorBox error={error} />
        {!loading && !items.length && <Empty title="Tiada notifikasi" text="Notifikasi muncul bila anda diberi tugasan, content disemak, atau status berubah." />}
        {items.map((n) => (
          <button key={n.id} type="button" className={`menu-item notif${n.read ? '' : ' unread'}`} style={{ width: '100%' }} onClick={() => { markRead(n.id); if (n.link) navigate(n.link); }}>
            <span className="grow"><strong>{n.title}</strong>{n.body && <span className="small muted block">{n.body}</span>}</span>
            <span className="small muted">{fmtDateTime(n.createdAtIso)}</span>
          </button>
        ))}
        <p className="muted small" style={{ marginTop: 12 }}>Notifikasi dicipta bila sesuatu berlaku dalam app. Peringatan deadline automatik (email atau push) belum diaktifkan kerana ia perlukan Cloud Functions (pelan Blaze). Deadline terdekat dipaparkan di Dashboard dan Tugasan saya.</p>
      </Card>
    </div>
  );
}
