// Thread komen untuk content (general / review) dan deliverable (revision).
// Content Creator hanya nampak komen yang visibleUids mengandungi uid dia (dikawal oleh rules).
import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useFirestore';
import { addComment } from '../lib/db';
import { isCreatorOnly } from '../lib/permissions';
import { fmtDateTime } from '../lib/dates';
import { REVIEW_OUTCOMES, findOpt } from '../lib/constants';
import { Avatar, Button, Loading, ErrorBox, Pill } from './ui';

const KIND_LABEL = {
  review: null, revision_request: ['Minta pembetulan', 'amber'], submission: ['Draf dihantar', 'violet'], approval: ['Diluluskan', 'green'],
};

export default function CommentThread({ targetType, targetId, thread, visibleUids = [], placeholder = 'Tulis komen', canPost = true, emptyText = 'Belum ada komen.' }) {
  const { profile } = useAuth();
  const { run } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const creatorOnly = isCreatorOnly(profile);

  const q = useMemo(() => {
    const base = [where('targetId', '==', targetId)];
    if (creatorOnly) base.push(where('visibleUids', 'array-contains', profile.uid));
    return query(collection(db, 'comments'), ...base);
  }, [targetId, creatorOnly, profile.uid]);
  const { data, loading, error } = useQuery(q, [q]);

  const items = useMemo(() => data
    .filter((c) => c.targetType === targetType && (!thread || c.thread === thread))
    .sort((a, b) => (a.createdAtIso || '').localeCompare(b.createdAtIso || '')), [data, targetType, thread]);

  const send = async () => {
    setBusy(true);
    const ok = await run(() => addComment({ targetType, targetId, thread: thread || 'general', text, visibleUids }, profile));
    setBusy(false);
    if (ok) setText('');
  };

  return (
    <div className="thread">
      {loading && <Loading text="Memuatkan komen…" />}
      <ErrorBox error={error} />
      {!loading && !items.length && <p className="muted small">{emptyText}</p>}
      {items.map((c) => {
        const outcome = c.kind === 'review' && c.outcome ? findOpt(REVIEW_OUTCOMES, c.outcome) : null;
        const kind = KIND_LABEL[c.kind];
        const reply = c.authorUid === profile.uid;
        return (
          <div key={c.id} className="comment" style={reply && thread === 'review' ? { paddingLeft: 24 } : undefined}>
            <Avatar name={c.authorName} size={30} />
            <div className="comment-body">
              <div className="comment-meta">
                <strong>{c.authorName}</strong>
                {outcome && <Pill tone={outcome.tone} strong>{outcome.label}</Pill>}
                {kind && <Pill tone={kind[1]}>{kind[0]}</Pill>}
                <span className="muted small">{fmtDateTime(c.createdAtIso)}</span>
              </div>
              <div className="comment-text">{c.text}</div>
            </div>
          </div>
        );
      })}
      {canPost && (
        <div className="col gap-sm">
          <label><span className="sr-only">{placeholder}</span>
            <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={send} busy={busy} disabled={!text.trim()}>Hantar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
