import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import PublicInvoiceUpload from './components/PublicInvoiceUpload';
import type { User as SupabaseUser } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<{ type: 'app' | 'upload', token?: string }>({ type: 'app' });

  const navigateToUpload = (token: string) => {
    setRoute({ type: 'upload', token });
  };

  const navigateToApp = () => {
    setRoute({ type: 'app' });
    window.history.pushState({}, '', '/');
  };

  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      const match = path.match(/^\/upload\/([a-zA-Z0-9-]+)$/);

      if (match) {
        setRoute({ type: 'upload', token: match[1] });
        setLoading(false);
      } else {
        setRoute({ type: 'app' });
        supabase.auth.getSession().then(({ data: { session } }) => {
          setUser(session?.user ?? null);
          setLoading(false);
        });
      }
    };

    checkRoute();
    window.addEventListener('popstate', checkRoute);

    if (route.type === 'app') {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => {
        subscription.unsubscribe();
        window.removeEventListener('popstate', checkRoute);
      };
    }

    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  const handleAuthSuccess = () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (route.type === 'upload' && route.token) {
    return (
      <>
        {user && (
          <div className="fixed top-4 left-4 z-50">
            <button
              onClick={navigateToApp}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-lg"
            >
              ← Retour au Dashboard
            </button>
          </div>
        )}
        <PublicInvoiceUpload token={route.token} />
      </>
    );
  }

  if (!user) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  return <Dashboard onLogout={handleLogout} onTestUpload={navigateToUpload} />;
}

export default App;
