import { AuthProvider, useAuth } from './context/AuthContext';
import { MaestroProvider } from './context/MaestroContext';
import AuthPage from './pages/AuthPage';
import WorkspacePage from './pages/WorkspacePage';
import LoadingScreen from './components/ui/LoadingScreen';

function AppInner() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthPage />;

  return (
    <MaestroProvider>
      <WorkspacePage />
    </MaestroProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
