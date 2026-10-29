// Link yang hanya aktif jika pengguna boleh buka halaman tujuan (Tetapan › Akses role).
// Jika tidak dibenarkan: kandungan tetap dipaparkan, cuma bukan link (atau disembunyikan jika hideIfDenied).
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { pageAllowed } from '../lib/access';

export default function PageLink({ page, to, children, hideIfDenied, ...rest }) {
  const { profile } = useAuth();
  const config = useConfig();
  if (pageAllowed(profile, config, page)) return <Link to={to} {...rest}>{children}</Link>;
  if (hideIfDenied) return null;
  return <div {...rest}>{children}</div>;
}
