import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Commune } from '../types/commune';
import * as turf from '@turf/turf';
import { getRayonReglementaire, getCategorieReglementaire, estCategorieRestrictive } from '../utils/densityCategory';

interface Installation {
  latitude: number;
  longitude: number;
  densite?: number;
}

interface CommunesLayerProps {
  communes: Commune[];
  transparence: number;
  highlight?: string;
  installations?: Installation[];
}

function getCouleurDensite(densite: number): { fillColor: string; color: string } {
  if (densite === 1 || densite === 2) {
    return { fillColor: '#ef4444', color: '#991b1b' };
  } else if (densite === 3 || densite === 4) {
    return { fillColor: '#fbbf24', color: '#92400e' };
  } else {
    return { fillColor: '#22c55e', color: '#166534' };
  }
}

export default function CommunesLayer({ communes, transparence, highlight, installations = [] }: CommunesLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane('communesPane')) {
      map.createPane('communesPane');
      const pane = map.getPane('communesPane');
      if (pane) {
        pane.style.zIndex = '400';
      }
    }

    if (!map.getPane('communesBorderPane')) {
      map.createPane('communesBorderPane');
      const pane = map.getPane('communesBorderPane');
      if (pane) {
        pane.style.zIndex = '450';
      }
    }

    console.log('CommunesLayer - Nombre de communes reçues:', communes.length);
    console.log('CommunesLayer - Installations:', installations.length);

    const layers: L.Layer[] = [];

    communes.forEach((commune) => {
      if (!commune.geomgeo) {
        console.log('CommunesLayer - Commune sans geomgeo:', commune.nom_commune);
        return;
      }

      const couleurs = getCouleurDensite(commune.dens7);
      const isHighlight = highlight === commune.codgeo;
      const communeCategory = getCategorieReglementaire(commune.dens7);
      const communeRayon = getRayonReglementaire(commune.dens7);

      // Vérifier si cette commune a une catégorie plus restrictive pour au moins une installation
      let needsSplit = false;
      let relevantInstallation: Installation | null = null;

      for (const installation of installations) {
        const installationDensite = installation.densite || 5;
        const installationCategory = getCategorieReglementaire(installationDensite);

        if (estCategorieRestrictive(communeCategory, installationCategory)) {
          needsSplit = true;
          relevantInstallation = installation;
          break;
        }
      }

      if (needsSplit && relevantInstallation) {
        // Créer deux zones : une normale et une claire
        try {
          const communeFeature = turf.feature(commune.geomgeo as any);
          const installationPoint = turf.point([relevantInstallation.longitude, relevantInstallation.latitude]);
          const rayonKm = communeRayon / 1000;
          const circleReglementaire = turf.circle(installationPoint, rayonKm, { steps: 64, units: 'kilometers' });

          // Zone normale (intersection entre commune et cercle réglementaire)
          let zoneNormale;
          let zoneClaire;

          try {
            const intersection = turf.intersect(turf.featureCollection([communeFeature, circleReglementaire]));
            if (intersection) {
              zoneNormale = intersection;
            }
          } catch (e) {
            console.warn('Intersection failed for', commune.nom_commune, e);
          }

          // Zone claire (commune moins la zone normale)
          try {
            if (zoneNormale) {
              const difference = turf.difference(turf.featureCollection([communeFeature, zoneNormale]));
              if (difference) {
                zoneClaire = difference;
              }
            } else {
              // Si pas d'intersection, toute la commune est en zone claire
              zoneClaire = communeFeature;
            }
          } catch (e) {
            console.warn('Difference failed for', commune.nom_commune, e);
          }

          // Afficher la zone normale
          if (zoneNormale) {
            const layerNormale = L.geoJSON(zoneNormale as any, {
              pane: 'communesPane',
              style: {
                fillColor: couleurs.fillColor,
                color: isHighlight ? '#1e40af' : couleurs.color,
                weight: isHighlight ? 2.5 : 1.5,
                fillOpacity: transparence,
                opacity: isHighlight ? 1 : 0.8,
              },
              onEachFeature: (_feature, layer) => {
                layer.bindPopup(`
                  <div style="font-family: sans-serif;">
                    <strong style="font-size: 1.125rem;">${commune.nom_commune}</strong><br/>
                    ${isHighlight ? '<span style="color: #2563eb; font-weight: 600;">Commune d\'installation</span><br/>' : ''}
                    Code: ${commune.codgeo}<br/>
                    Densité: ${commune.dens7} - ${commune.libdens7}<br/>
                    <em>Zone dans rayon réglementaire</em>
                  </div>
                `);
              },
            });
            layerNormale.addTo(map);
            layers.push(layerNormale);
          }

          // Afficher la zone claire (avec opacité réduite)
          if (zoneClaire) {
            const layerClaire = L.geoJSON(zoneClaire as any, {
              pane: 'communesPane',
              style: {
                fillColor: couleurs.fillColor,
                color: couleurs.color,
                weight: 1.5,
                fillOpacity: transparence * 0.3, // Opacité réduite
                opacity: 0.5,
              },
              onEachFeature: (_feature, layer) => {
                layer.bindPopup(`
                  <div style="font-family: sans-serif;">
                    <strong style="font-size: 1.125rem;">${commune.nom_commune}</strong><br/>
                    Code: ${commune.codgeo}<br/>
                    Densité: ${commune.dens7} - ${commune.libdens7}<br/>
                    <em>Zone au-delà du rayon réglementaire</em>
                  </div>
                `);
              },
            });
            layerClaire.addTo(map);
            layers.push(layerClaire);
          }

          // Tracer la limite entre les deux zones
          if (zoneNormale) {
            const boundaryLayer = L.geoJSON(circleReglementaire as any, {
              pane: 'communesBorderPane',
              style: {
                fill: false,
                color: couleurs.color,
                weight: 2,
                opacity: 0.8,
                dashArray: '5, 5',
              },
            });
            boundaryLayer.addTo(map);
            layers.push(boundaryLayer);
          }
        } catch (error) {
          console.error('Erreur lors du découpage de la commune', commune.nom_commune, error);
          // En cas d'erreur, afficher la commune normalement
          const layer = L.geoJSON(commune.geomgeo as any, {
            pane: 'communesPane',
            style: {
              fillColor: couleurs.fillColor,
              color: isHighlight ? '#1e40af' : couleurs.color,
              weight: isHighlight ? 2.5 : 1.5,
              fillOpacity: transparence,
              opacity: isHighlight ? 1 : 0.8,
            },
            onEachFeature: (_feature, layer) => {
              layer.bindPopup(`
                <div style="font-family: sans-serif;">
                  <strong style="font-size: 1.125rem;">${commune.nom_commune}</strong><br/>
                  ${isHighlight ? '<span style="color: #2563eb; font-weight: 600;">Commune d\'installation</span><br/>' : ''}
                  Code: ${commune.codgeo}<br/>
                  Densité: ${commune.dens7} - ${commune.libdens7}
                </div>
              `);
            },
          });
          layer.addTo(map);
          layers.push(layer);
        }
      } else {
        // Affichage normal sans découpage
        const layer = L.geoJSON(commune.geomgeo as any, {
          pane: 'communesPane',
          style: {
            fillColor: couleurs.fillColor,
            color: isHighlight ? '#1e40af' : couleurs.color,
            weight: isHighlight ? 2.5 : 1.5,
            fillOpacity: transparence,
            opacity: isHighlight ? 1 : 0.8,
          },
          onEachFeature: (_feature, layer) => {
            layer.bindPopup(`
              <div style="font-family: sans-serif;">
                <strong style="font-size: 1.125rem;">${commune.nom_commune}</strong><br/>
                ${isHighlight ? '<span style="color: #2563eb; font-weight: 600;">Commune d\'installation</span><br/>' : ''}
                Code: ${commune.codgeo}<br/>
                Densité: ${commune.dens7} - ${commune.libdens7}
              </div>
            `);
          },
        });
        layer.addTo(map);
        layers.push(layer);
      }
    });

    return () => {
      layers.forEach((layer) => {
        map.removeLayer(layer);
      });
    };
  }, [map, communes, transparence, highlight, installations]);

  return null;
}
