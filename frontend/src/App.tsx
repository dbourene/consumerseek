import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import AuthForm from './components/AuthForm';
import { LogOut, User } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthSuccess={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                ConsumerSeek
              </h1>
              <p className="text-slate-600">Welcome to your dashboard</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-red-600 transition"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>

          <div className="bg-slate-50 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Logged in as</p>
                <p className="text-lg font-semibold text-slate-900">
                  {user.email}
                </p>
              </div>
            </div>
            <div className="text-sm text-slate-500">
              User ID: {user.id}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
