import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { LogOut } from 'lucide-react';
import FormulaireRecherche from './FormulaireRecherche';
import CarteInstallation from './CarteInstallation';
import { ResultatRPC } from '../types/commune';

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [resultat, setResultat] = useState<ResultatRPC | null>(null);
  const [coordonnees, setCoordonnees] = useState<{ lat: number; lon: number } | null>(null);

  const handleResultat = (nouveauResultat: ResultatRPC, lat: number, lon: number) => {
    setResultat(nouveauResultat);
    setCoordonnees({ lat, lon });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">ConsumerSeek</h1>
              <p className="text-sm text-slate-600">Analyse des communes autour d'une installation</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FormulaireRecherche onResultat={handleResultat} />

        {resultat && coordonnees && (
          <CarteInstallation
            resultat={resultat}
            latitude={coordonnees.lat}
            longitude={coordonnees.lon}
          />
        )}

        {!resultat && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Aucune recherche effectuée
              </h3>
              <p className="text-slate-600">
                Saisissez une adresse ou des coordonnées GPS pour visualiser les communes autour d'une installation.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
