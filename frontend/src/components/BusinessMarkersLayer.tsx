import { useEffect, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import { supabase } from '../supabaseClient';
import { Building2 } from 'lucide-react';

interface Business {
  id: string;
  siret: string;
  denomination: string;
  adresse_complete: string;
  code_postal: string;
  libelle_commune: string;
  activite_principale_etablissement: string;
  tranche_effectifs_etablissement: string;
  latitude: number;
  longitude: number;
}

interface BusinessMarkersLayerProps {
  selectedCommuneCodes: string[];
  maxMarkers?: number;
}

const getEffectifsLabel = (tranche: string): string => {
  const tranches: { [key: string]: string } = {
    '00': 'Aucun salarié',
    '01': '1 à 2 salariés',
    '02': '3 à 5 salariés',
    '03': '6 à 9 salariés',
    '11': '10 à 19 salariés',
    '12': '20 à 49 salariés',
    '21': '50 à 99 salariés',
    '22': '100 à 199 salariés',
    '31': '200 à 249 salariés',
    '32': '250 à 499 salariés',
    '41': '500 à 999 salariés',
    '42': '1000 à 1999 salariés',
    '51': '2000 à 4999 salariés',
    '52': '5000 à 9999 salariés',
    '53': '10 000 salariés et plus'
  };
  return tranches[tranche] || 'Non renseigné';
};

export default function BusinessMarkersLayer({
  selectedCommuneCodes,
  maxMarkers = 200
}: BusinessMarkersLayerProps) {
  const map = useMap();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleZoom = () => {
      setCurrentZoom(map.getZoom());
    };

    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map]);

  useEffect(() => {
    if (currentZoom < 13) {
      setBusinesses([]);
      return;
    }

    if (selectedCommuneCodes.length === 0) {
      setBusinesses([]);
      return;
    }

    const fetchBusinesses = async () => {
      setLoading(true);
      try {
        const bounds = map.getBounds();
        const { data, error } = await supabase
          .from('societes')
          .select('id, siret, denomination, adresse_complete, code_postal, libelle_commune, activite_principale_etablissement, tranche_effectifs_etablissement, latitude, longitude')
          .in('code_commune', selectedCommuneCodes)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('latitude', bounds.getSouth())
          .lte('latitude', bounds.getNorth())
          .gte('longitude', bounds.getWest())
          .lte('longitude', bounds.getEast())
          .limit(maxMarkers);

        if (error) throw error;
        setBusinesses(data || []);
      } catch (error) {
        console.error('Erreur lors du chargement des établissements:', error);
        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, [selectedCommuneCodes, currentZoom, map, maxMarkers]);

  useEffect(() => {
    const handleMoveEnd = () => {
      if (selectedCommuneCodes.length > 0 && currentZoom >= 13) {
        const fetchBusinesses = async () => {
          const bounds = map.getBounds();
          const { data, error } = await supabase
            .from('societes')
            .select('id, siret, denomination, adresse_complete, code_postal, libelle_commune, activite_principale_etablissement, tranche_effectifs_etablissement, latitude, longitude')
            .in('code_commune', selectedCommuneCodes)
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .gte('latitude', bounds.getSouth())
            .lte('latitude', bounds.getNorth())
            .gte('longitude', bounds.getWest())
            .lte('longitude', bounds.getEast())
            .limit(maxMarkers);

          if (!error && data) {
            setBusinesses(data);
          }
        };

        fetchBusinesses();
      }
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [selectedCommuneCodes, currentZoom, map, maxMarkers]);

  const createBusinessIcon = (business: Business) => {
    const showLabel = currentZoom >= 15;

    const html = showLabel
      ? `
        <div style="position: relative; text-align: center;">
          <div style="
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 3px 6px;
            border-radius: 3px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            white-space: nowrap;
            font-size: 10px;
            font-weight: 600;
            color: #1e293b;
            pointer-events: none;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
          ">
            ${business.denomination || 'Sans nom'}
          </div>
          <div style="
            width: 16px;
            height: 16px;
            background: #10b981;
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        </div>
      `
      : `
        <div style="
          width: 12px;
          height: 12px;
          background: #10b981;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
      `;

    return new DivIcon({
      html,
      className: 'business-marker-icon',
      iconSize: showLabel ? [16, 16] : [12, 12],
      iconAnchor: showLabel ? [8, 8] : [6, 6],
    });
  };

  if (currentZoom < 13) {
    return null;
  }

  if (selectedCommuneCodes.length === 0 && !loading) {
    return (
      <div className="leaflet-top leaflet-right" style={{ marginTop: '80px', marginRight: '10px' }}>
        <div className="bg-white px-3 py-2 rounded shadow-lg text-xs text-slate-600">
          Sélectionnez une installation pour voir les établissements
        </div>
      </div>
    );
  }

  return (
    <>
      {businesses.map((business) => (
        <Marker
          key={business.id}
          position={[business.latitude, business.longitude]}
          icon={createBusinessIcon(business)}
        >
          <Popup maxWidth={300}>
            <div className="p-2">
              <div className="flex items-start gap-2 mb-2">
                <Building2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">
                    {business.denomination || 'Établissement sans dénomination'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">SIRET: {business.siret}</p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="font-medium text-slate-700">Adresse:</span>
                  <p className="text-slate-600">
                    {business.adresse_complete}<br />
                    {business.code_postal} {business.libelle_commune}
                  </p>
                </div>

                {business.activite_principale_etablissement && (
                  <div>
                    <span className="font-medium text-slate-700">Code NAF:</span>
                    <span className="text-slate-600 ml-1">
                      {business.activite_principale_etablissement}
                    </span>
                  </div>
                )}

                {business.tranche_effectifs_etablissement && (
                  <div>
                    <span className="font-medium text-slate-700">Effectifs:</span>
                    <span className="text-slate-600 ml-1">
                      {getEffectifsLabel(business.tranche_effectifs_etablissement)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200">
                <p className="text-xs text-slate-500 italic">
                  Source: Base SIRENE (INSEE)
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Les numéros de téléphone ne sont pas disponibles dans la base SIRENE publique
                </p>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {loading && (
        <div className="leaflet-top leaflet-right" style={{ marginTop: '80px', marginRight: '10px' }}>
          <div className="bg-white px-3 py-2 rounded shadow-lg text-xs text-slate-600">
            Chargement des établissements...
          </div>
        </div>
      )}
    </>
  );
}
