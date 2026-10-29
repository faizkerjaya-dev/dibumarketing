// Laluan (routes) dan pintu masuk: semak setup Firebase → login → profil → kebenaran role.
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { missingEnv, firebaseConfig } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfigProvider } from './context/ConfigContext';
import { DataProvider } from './context/DataContext';
import { can, isCreatorOnly } from './lib/permissions';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { Loading, ErrorBox, Empty } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/Calendar';
import Pipeline from './pages/Pipeline';
import ContentDetail from './pages/ContentDetail';
import Team from './pages/Team';
import StaffDetail from './pages/StaffDetail';
import Creators from './pages/Creators';
import CreatorForm from './pages/CreatorForm';
import CreatorDetail from './pages/CreatorDetail';
import Campaigns from './pages/Campaigns';
import CampaignForm from './pages/CampaignForm';
import CampaignDetail from './pages/CampaignDetail';
import Deliverables from './pages/Deliverables';
import Library from './pages/Library';
import Analytics from './pages/Analytics';
import SettingsPage from './pages/Settings';
import MyTasks from './pages/MyTasks';
import Notifications from './pages/Notifications';
import Approvals from './pages/Approvals';
import KpiPage from './pages/Kpi';

function NotFound() {
  return (
    <div className="page">
      <Empty title="Halaman tidak dijumpai" text="Pautan ini mungkin salah atau sudah tidak wujud." action={<Link to="/" className="btn btn-secondary">Ke halaman utama</Link>} />
    </div>
  );
}

function SetupMissing() {
  return (
    <div className="center-screen">
      <div className="card card-pad narrow">
        <h1>Setup belum lengkap</h1>
        <p>Environment variables Firebase berikut tiada:</p>
        <ul>{missingEnv.map((k) => <li key={k}><code>{k}</code></li>)}</ul>
        <p className="muted small">Local: isi fail <code>.env</code>. Vercel: Settings › Environment Variables, kemudian Redeploy.</p>
      </div>
    </div>
  );
}

function AccountProblem({ status, user, error, logout }) {
  return (
    <div className="center-screen">
      <div className="card card-pad narrow">
        {status === 'noProfile' && <>
          <h1>Akaun belum disediakan</h1>
          <p>Anda berjaya log masuk, tetapi profil pengguna belum dicipta. Minta Admin tambah akaun anda dalam Tetapan › Pengguna.</p>
          <p className="small">Untuk admin pertama: dalam Firestore, cipta dokumen <code>users/{user?.uid}</code> dengan medan <code>roles: ["admin"]</code>, <code>active: true</code>, <code>name</code>. Rujuk README.</p>
          <p className="small">UID anda: <code className="select-all">{user?.uid}</code></p>
        </>}
        {status === 'inactive' && <><h1>Akaun dinyahaktifkan</h1><p>Hubungi Admin untuk aktifkan semula.</p></>}
        {status === 'offline' && <>
          <h1>Tidak dapat sambung ke database</h1>
          <p>Log masuk berjaya, tetapi browser tidak dapat sambung ke Firestore.</p>
          <ul className="small">
            <li>Matikan ad blocker atau extension privasi untuk laman ini, atau cuba dalam tetingkap Incognito.</li>
            <li>Semak sambungan internet.</li>
            <li>Pastikan Firestore Database sudah dicipta dalam projek <code>{firebaseConfig.projectId}</code>.</li>
          </ul>
          <p className="small muted">Halaman ini akan bertukar sendiri sebaik sahaja sambungan berjaya.</p>
          <p className="small">UID anda: <code className="select-all">{user?.uid}</code></p>
        </>}
        {status === 'error' && <><h1>Profil tidak dapat dibaca</h1><ErrorBox error={error} /></>}
        <button type="button" className="btn btn-secondary" onClick={logout}>Log keluar</button>
      </div>
    </div>
  );
}

// Halaman pengurus. Content Creator dihantar ke Hari ini (/my-tasks).
function Guard({ action = 'view.all', children }) {
  const { profile } = useAuth();
  if (!can(profile, action)) return <Navigate to={isCreatorOnly(profile) ? '/my-tasks' : '/dashboard'} replace />;
  return children;
}

// Pautan lama /content/new?campaign=ID dikekalkan: hantar ke kalendar dengan panel Tambah terbuka.
function NewContentRedirect() {
  const { search } = useLocation();
  const campaign = new URLSearchParams(search).get('campaign');
  return <Navigate to={`/calendar?add=1${campaign ? `&campaign=${campaign}` : ''}`} replace />;
}

function Gate() {
  const { status, user, profile, error, logout } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="center-screen"><Loading text="Memuatkan akaun…" /></div>;
  if (status === 'signedOut') return location.pathname === '/login' ? <Login /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (status !== 'ready') return <AccountProblem status={status} user={user} error={error} logout={logout} />;

  const home = isCreatorOnly(profile) ? '/my-tasks' : '/dashboard';
  return (
    <ConfigProvider>
      <DataProvider>
        <Routes>
          <Route path="/login" element={<Navigate to={location.state?.from || home} replace />} />
          <Route element={<Layout />}>
            <Route index element={<Navigate to={home} replace />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/content/:id" element={<ContentDetail />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
            <Route path="/pipeline" element={<Guard><Pipeline /></Guard>} />
            <Route path="/content/new" element={<NewContentRedirect />} />
            <Route path="/team" element={<Guard><Team /></Guard>} />
            <Route path="/team/:id" element={<Guard><StaffDetail /></Guard>} />
            <Route path="/creators" element={<Guard><Creators /></Guard>} />
            <Route path="/creators/new" element={<Guard action="creator.manage"><CreatorForm /></Guard>} />
            <Route path="/creators/:id" element={<Guard><CreatorDetail /></Guard>} />
            <Route path="/creators/:id/edit" element={<Guard action="creator.manage"><CreatorForm /></Guard>} />
            <Route path="/campaigns" element={<Guard><Campaigns /></Guard>} />
            <Route path="/campaigns/new" element={<Guard action="campaign.manage"><CampaignForm /></Guard>} />
            <Route path="/campaigns/:id" element={<Guard><CampaignDetail /></Guard>} />
            <Route path="/campaigns/:id/edit" element={<Guard action="campaign.manage"><CampaignForm /></Guard>} />
            <Route path="/deliverables" element={<Guard><Deliverables /></Guard>} />
            <Route path="/library" element={<Guard><Library /></Guard>} />
            <Route path="/analytics" element={<Guard><Analytics /></Guard>} />
            <Route path="/approvals" element={<Guard><Approvals /></Guard>} />
            <Route path="/kpi" element={<Guard><KpiPage /></Guard>} />
            <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </DataProvider>
    </ConfigProvider>
  );
}

export default function App() {
  if (missingEnv.length) return <SetupMissing />;
  return (
    <ToastProvider>
      <AuthProvider>
        <ErrorBoundary>
          <Gate />
        </ErrorBoundary>
      </AuthProvider>
    </ToastProvider>
  );
}
