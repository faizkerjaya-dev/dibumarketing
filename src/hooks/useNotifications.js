import { useMemo } from 'react';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useQuery } from './useFirestore';
import { commitInChunks } from '../lib/db';

export function useNotifications() {
  const { profile } = useAuth();
  const q = useMemo(() => (profile?.uid ? query(collection(db, 'notifications'), where('toUid', '==', profile.uid)) : null), [profile?.uid]);
  const { data, loading, error } = useQuery(q, [q]);
  const items = useMemo(() => [...data].sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')), [data]);
  const unread = items.filter((n) => !n.read).length;
  const markRead = (id) => {
    const n = items.find((x) => x.id === id);
    if (!n || n.read) return Promise.resolve();
    return updateDoc(doc(db, 'notifications', id), { read: true });
  };
  const markAllRead = () => commitInChunks(items.filter((n) => !n.read), (batch, n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
  return { items, unread, loading, error, markRead, markAllRead };
}
