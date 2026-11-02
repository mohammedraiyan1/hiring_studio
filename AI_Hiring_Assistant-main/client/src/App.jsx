import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewRolePage from './pages/NewRolePage';
import RolePage from './pages/RolePage';
import CandidatesPage from './pages/CandidatesPage';
import ComparePage from './pages/ComparePage';
import KnowledgePage from './pages/KnowledgePage';
import InterviewPage from './pages/InterviewPage';
import RankingPage from './pages/RankingPage';
import { CareersPage, CareerJobPage } from './pages/CareersPage';
import ApplicationsPage from './pages/ApplicationsPage';
import ApplicationDetailPage from './pages/ApplicationDetailPage';

function Protected({ children }) {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return user ? <AppShell>{children}</AppShell> : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/careers" element={<CareersPage />} />
      <Route path="/applications" element={<Protected><ApplicationsPage /></Protected>} />
      <Route path="/applications/:id" element={<Protected><ApplicationDetailPage /></Protected>} />
      <Route path="/careers/:id" element={<CareerJobPage />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <LoginPage initialMode="register" />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/roles/new" element={<Protected><NewRolePage /></Protected>} />
      <Route path="/roles/:roleId" element={<Protected><RolePage /></Protected>} />
      <Route path="/roles/:roleId/candidates" element={<Protected><CandidatesPage /></Protected>} />
      <Route path="/roles/:roleId/compare" element={<Protected><ComparePage /></Protected>} />
      <Route path="/roles/:roleId/ranking" element={<Protected><RankingPage /></Protected>} />
      <Route path="/jobs/new" element={<Protected><NewRolePage /></Protected>} />
      <Route path="/jobs/:jobId" element={<Protected><RolePage /></Protected>} />
      <Route path="/jobs/:jobId/edit" element={<Protected><RolePage /></Protected>} />
      <Route path="/jobs/:jobId/candidates" element={<Protected><CandidatesPage /></Protected>} />
      <Route path="/jobs/:jobId/candidates/new" element={<Protected><CandidatesPage /></Protected>} />
      <Route path="/jobs/:jobId/candidates/:candidateId/interview" element={<Protected><InterviewPage /></Protected>} />
      <Route path="/jobs/:jobId/compare" element={<Protected><ComparePage /></Protected>} />
      <Route path="/jobs/:jobId/ranking" element={<Protected><RankingPage /></Protected>} />
      <Route path="/knowledge" element={<Protected><KnowledgePage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
