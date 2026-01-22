import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { LogOut, MapPin, Circle, FileText } from 'lucide-react';
import FormulaireRecherche from './FormulaireRecherche';
import CarteInstallation from './CarteInstallation';
import ConsumersIndicators from './ConsumersIndicators';
import { GeocodingModal } from './GeocodingModal';
import { AddressCorrectionTable } from './AddressCorrectionTable';
import SaveInstallationModal from './SaveInstallationModal';
import ExistingInstallationsModal from './ExistingInstallationsModal';
import SelectInstallationsForGeocodingModal from './SelectInstallationsForGeocodingModal';
import TreatmentStationsImport from './TreatmentStationsImport';
import OnDemandLoadingModal from './OnDemandLoadingModal';
import ConsumerStat from './ConsumerStat';
import { ResultatRPC } from '../types/commune';
import { TrancheConso, CategorieActivite, TRANCHES_CONSO, CATEGORIES_ACTIVITE, Consommateur } from '../types/consommateur';
import { isAddressGeocoded, GeocodeResult } from '../services/geocoding';
import { Installation, ActiveInstallation } from '../types/installation';

interface DashboardProps {
  onLogout: () => void;
  onTestUpload?: (token: string) => void;
}

export default function Dashboard({ onLogout, onTestUpload }: DashboardProps) {
  const [resultat, setResultat] = useState<ResultatRPC | null>(null);
  const [coordonnees, setCoordonnees] = useState<{ lat: number; lon: number } | null>(null);
  const [marge, setMarge] = useState<number>(200);
  const [selectedTranches, setSelectedTranches] = useState<Set<TrancheConso>>(new Set(TRANCHES_CONSO));
  const [selectedCategories, setSelectedCategories] = useState<Set<CategorieActivite>>(new Set(CATEGORIES_ACTIVITE));
  const [nombreConsommateurs, setNombreConsommateurs] = useState(0);
  const [consommationAnnuelle, setConsommationAnnuelle] = useState(0);
  const [showGeocodingModal, setShowGeocodingModal] = useState(false);
  const [failedAddresses, setFailedAddresses] = useState<Consommateur[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showExistingInstallationsModal, setShowExistingInstallationsModal] = useState(false);
  const [showSelectInstallationsForGeocoding, setShowSelectInstallationsForGeocoding] = useState(false);
  const [selectedInstallationIds, setSelectedInstallationIds] = useState<Set<string>>(new Set());
  const [activeInstallations, setActiveInstallations] = useState<ActiveInstallation[]>([]);
  const [installationsForGeocoding, setInstallationsForGeocoding] = useState<ActiveInstallation[]>([]);
  const [showStationsImport, setShowStationsImport] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<{ resultat: ResultatRPC; lat: number; lon: number; marge: number } | null>(null);
  const [geocodingRefreshKey, setGeocodingRefreshKey] = useState(0);
  const [circleFilterActive, setCircleFilterActive] = useState(false);
  const [circleFilterPosition, setCircleFilterPosition] = useState<[number, number] | null>(null);
  const [showConsumerStat, setShowConsumerStat] = useState(false);

  useEffect(() => {
    loadActiveInstallations();
  }, [selectedInstallationIds]);

  const loadActiveInstallations = async () => {
    if (selectedInstallationIds.size === 0) {
      setActiveInstallations([]);
      setSelectedCommuneCodes([]);
      return;
    }

    console.log('📍 Chargement des installations sélectionnées:', Array.from(selectedInstallationIds));

    const { data, error } = await supabase
      .from('installations')
      .select('*')
      .in('id', Array.from(selectedInstallationIds));

    if (error) {
      console.error('Error loading installations:', error);
      return;
    }

    console.log('📍 Installations récupérées:', data);

    const allCommuneCodes = new Set<string>();

    const installationsWithRadius = await Promise.all(
      (data || []).map(async (installation) => {
        console.log(`📍 Appel RPC pour installation ${installation.nom} (${installation.latitude}, ${installation.longitude})`);

        const { data: rpcData } = await supabase.rpc(
          'rpc_communes_autour_installation',
          {
            p_lat: installation.latitude,
            p_lon: installation.longitude,
          }
        );

        console.log(`📍 RPC Data pour ${installation.nom}:`, rpcData);

        if (rpcData) {
          if (rpcData.commune_installation) {
            console.log(`  → Commune installation: ${rpcData.commune_installation.codgeo}`);
            allCommuneCodes.add(rpcData.commune_installation.codgeo);
          }
          if (rpcData.communes_dans_rayon) {
            console.log(`  → Communes dans rayon: ${rpcData.communes_dans_rayon.length}`);
            rpcData.communes_dans_rayon.forEach((commune: any) => {
              allCommuneCodes.add(commune.codgeo);
            });
          }
        }

        return {
          ...installation,
          rayon: rpcData?.rayon || 20000,
          marge: 200
        };
      })
    );

    console.log('📍 Tous les codes communes collectés:', Array.from(allCommuneCodes));

    setActiveInstallations(installationsWithRadius);
    setSelectedCommuneCodes(Array.from(allCommuneCodes));
  };

  const handleResultat = async (nouveauResultat: ResultatRPC, lat: number, lon: number, margeMetres: number) => {
    setNombreConsommateurs(0);
    setConsommationAnnuelle(0);
    setSelectedInstallationIds(new Set());
    setFailedAddresses([]);
    setCircleFilterActive(false);
    setCircleFilterPosition(null);

    const communeCodes = [
      ...(nouveauResultat.commune_installation ? [nouveauResultat.commune_installation.codgeo] : []),
      ...nouveauResultat.communes_dans_rayon.map(c => c.codgeo)
    ];

    setPendingSearch({ resultat: nouveauResultat, lat, lon, marge: margeMetres });
    setShowLoadingModal(true);
  };

  const handleLoadingComplete = async () => {
    setShowLoadingModal(false);

    if (!pendingSearch) return;

    const { resultat: nouveauResultat, lat, lon, marge: margeMetres } = pendingSearch;

    setResultat(nouveauResultat);
    setCoordonnees({ lat, lon });
    setMarge(margeMetres);

    const communeCodes = [
      ...(nouveauResultat.commune_installation ? [nouveauResultat.commune_installation.codgeo] : []),
      ...nouveauResultat.communes_dans_rayon.map(c => c.codgeo)
    ];

    setSelectedCommuneCodes(communeCodes);

    // Ne pas vérifier les adresses invalides avant le géocodage
    // Le tableau de correction apparaîtra après le géocodage s'il y a des échecs
    setPendingSearch(null);
  };

  const handleLoadingCancel = () => {
    setShowLoadingModal(false);
    setPendingSearch(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const handleTrancheToggle = (tranche: TrancheConso) => {
    setSelectedTranches(prev => {
      const next = new Set(prev);
      if (next.has(tranche)) {
        next.delete(tranche);
      } else {
        next.add(tranche);
      }
      return next;
    });
  };

  const handleCategoryToggle = (category: CategorieActivite) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleStatsUpdate = (nbSites: number, consoTotal: number) => {
    setNombreConsommateurs(nbSites);
    setConsommationAnnuelle(consoTotal);
  };

  const [selectedCommuneCodes, setSelectedCommuneCodes] = useState<string[]>([]);

  const loadFailedAddresses = async (communeCodes: string[]) => {
    console.log('📋 loadFailedAddresses appelé avec:', communeCodes.length, 'codes communes');

    if (communeCodes.length === 0) {
      console.log('📋 Aucun code commune, nettoyage de failedAddresses');
      setFailedAddresses([]);
      return;
    }

    console.log('📋 Requête Supabase pour les adresses failed uniquement...');

    // Ne charger QUE les adresses qui ont échoué au géocodage
    const { data: failedData, error: failedError } = await supabase
      .from('consommateurs')
      .select('*')
      .in('code_commune', communeCodes)
      .eq('annee', 2024)
      .eq('geocode_status', 'failed')
      .order('nom_commune', { ascending: true })
      .order('adresse', { ascending: true });

    if (failedError) {
      console.error('❌ Error loading failed addresses:', failedError);
      return;
    }

    console.log(`📋 ${failedData?.length || 0} adresses failed`);
    setFailedAddresses(failedData || []);
  };

  const handleStartGeocoding = () => {
    if (activeInstallations.length > 0) {
      setInstallationsForGeocoding(activeInstallations);
      setShowGeocodingModal(true);
    } else {
      setShowSelectInstallationsForGeocoding(true);
    }
  };

  const handleInstallationsSelectedForGeocoding = async (installations: Installation[]) => {
    const installationsWithRadius = await Promise.all(
      installations.map(async (installation) => {
        const { data: rpcData } = await supabase.rpc(
          'rpc_communes_autour_installation',
          {
            p_lat: installation.latitude,
            p_lon: installation.longitude,
          }
        );

        return {
          ...installation,
          rayon: rpcData?.rayon || 20000,
          marge: 200
        };
      })
    );

    const allCommuneCodes = new Set<string>();

    for (const installation of installationsWithRadius) {
      const { data: rpcData } = await supabase.rpc(
        'rpc_communes_autour_installation',
        {
          p_lat: installation.latitude,
          p_lon: installation.longitude,
        }
      );

      if (rpcData) {
        if (rpcData.commune_installation) {
          allCommuneCodes.add(rpcData.commune_installation.codgeo);
        }
        if (rpcData.communes_dans_rayon) {
          rpcData.communes_dans_rayon.forEach((commune: any) => {
            allCommuneCodes.add(commune.codgeo);
          });
        }
      }
    }

    setSelectedCommuneCodes(Array.from(allCommuneCodes));
    setInstallationsForGeocoding(installationsWithRadius);
    setShowGeocodingModal(true);
  };

  const handleGeocodingComplete = (result: GeocodeResult) => {
    console.log('🎯 Dashboard - Résultat géocodage:', {
      total: result.total,
      success: result.success,
      failed: result.failed,
      invalidAddresses: result.invalidAddresses.map(c => ({
        id: c.id,
        adresse: c.adresse,
        nom_commune: c.nom_commune
      }))
    });
    setShowGeocodingModal(false);
    setInstallationsForGeocoding([]);
    loadFailedAddresses(selectedCommuneCodes);
    setGeocodingRefreshKey(prev => prev + 1);
  };

  const handleAddressUpdate = async () => {
    await loadFailedAddresses(selectedCommuneCodes);
    setGeocodingRefreshKey(prev => prev + 1);
  };

  const handleSaveInstallation = () => {
    if (!resultat?.commune_installation || !coordonnees) return;
    setShowSaveModal(true);
  };

  const handleInstallationSaved = () => {
    setShowSaveModal(false);
  };

  const handleShowExistingInstallations = () => {
    setShowExistingInstallationsModal(true);
  };

  const handleInstallationSelectionChange = (ids: Set<string>) => {
    setSelectedInstallationIds(ids);
    setResultat(null);
    setCoordonnees(null);
    setFailedAddresses([]);
    setCircleFilterActive(false);
    setCircleFilterPosition(null);
  };

  const handleToggleCircleFilter = () => {
    if (circleFilterActive) {
      setCircleFilterActive(false);
      setCircleFilterPosition(null);
    } else {
      if (activeInstallations.length === 1) {
        setCircleFilterActive(true);
        setCircleFilterPosition([activeInstallations[0].latitude, activeInstallations[0].longitude]);
      }
    }
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConsumerStat(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition font-medium"
              >
                <FileText className="w-5 h-5" />
                <span>ConsumerStat</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => setShowStationsImport(!showStationsImport)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showStationsImport ? '− Masquer' : '+ Afficher'} l'import des stations de traitement
          </button>
          {showStationsImport && (
            <div className="mt-4">
              <TreatmentStationsImport />
            </div>
          )}
        </div>

        <FormulaireRecherche
          onResultat={handleResultat}
          onShowExistingInstallations={handleShowExistingInstallations}
        />

        {(resultat && coordonnees) || activeInstallations.length > 0 ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <ConsumersIndicators
                nombreConsommateurs={nombreConsommateurs}
                consommationAnnuelle={consommationAnnuelle}
                onSave={handleSaveInstallation}
                canSave={!!(resultat && coordonnees)}
              />
              <div className="flex gap-2">
                {activeInstallations.length === 1 && (
                  <button
                    onClick={handleToggleCircleFilter}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium shadow-md ${
                      circleFilterActive
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    <Circle className="w-5 h-5" />
                    {circleFilterActive ? 'Désactiver le filtre' : 'Activer le filtre circulaire'}
                  </button>
                )}
                <button
                  onClick={handleStartGeocoding}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md"
                >
                  <MapPin className="w-5 h-5" />
                  Géocoder les consommateurs
                </button>
              </div>
            </div>
            <CarteInstallation
              resultat={resultat}
              latitude={coordonnees?.lat}
              longitude={coordonnees?.lon}
              marge={marge}
              selectedCommuneCodes={selectedCommuneCodes}
              selectedTranches={selectedTranches}
              selectedCategories={selectedCategories}
              onTrancheToggle={handleTrancheToggle}
              onCategoryToggle={handleCategoryToggle}
              onStatsUpdate={handleStatsUpdate}
              activeInstallations={activeInstallations}
              geocodingRefreshKey={geocodingRefreshKey}
              circleFilterActive={circleFilterActive}
              circleFilterPosition={circleFilterPosition}
              onCircleFilterPositionChange={setCircleFilterPosition}
            />
            {failedAddresses.length > 0 && (
              <AddressCorrectionTable
                invalidAddresses={failedAddresses}
                onUpdate={handleAddressUpdate}
              />
            )}
          </>
        ) : null}

        {!resultat && activeInstallations.length === 0 && (
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

      {showGeocodingModal && (
        <GeocodingModal
          communes={selectedCommuneCodes}
          annee={2024}
          installations={installationsForGeocoding}
          onClose={() => {
            setShowGeocodingModal(false);
            setInstallationsForGeocoding([]);
          }}
          onComplete={handleGeocodingComplete}
        />
      )}

      {showSelectInstallationsForGeocoding && (
        <SelectInstallationsForGeocodingModal
          onClose={() => setShowSelectInstallationsForGeocoding(false)}
          onSelect={handleInstallationsSelectedForGeocoding}
        />
      )}

      {showSaveModal && resultat?.commune_installation && coordonnees && (
        <SaveInstallationModal
          commune={resultat.commune_installation.nom_commune}
          latitude={coordonnees.lat}
          longitude={coordonnees.lon}
          marge={marge}
          onClose={() => setShowSaveModal(false)}
          onSaved={handleInstallationSaved}
        />
      )}

      {showExistingInstallationsModal && (
        <ExistingInstallationsModal
          selectedIds={selectedInstallationIds}
          onClose={() => setShowExistingInstallationsModal(false)}
          onSelectionChange={handleInstallationSelectionChange}
        />
      )}

      {showLoadingModal && pendingSearch && (
        <OnDemandLoadingModal
          communeCodes={[
            ...(pendingSearch.resultat.commune_installation ? [pendingSearch.resultat.commune_installation.codgeo] : []),
            ...pendingSearch.resultat.communes_dans_rayon.map(c => c.codgeo)
          ]}
          annee={2024}
          onComplete={handleLoadingComplete}
          onCancel={handleLoadingCancel}
        />
      )}

      {showConsumerStat && (
        <ConsumerStat onClose={() => setShowConsumerStat(false)} onTestUpload={onTestUpload} />
      )}
    </div>
  );
}
