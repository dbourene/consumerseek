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
  showLabels?: boolean;
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

export default function CommunesLayer({ communes, transparence, highlight, installations = [], showLabels = false }: CommunesLayerProps) {
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

    if (!map.getPane('communesLabelsPane')) {
      map.createPane('communesLabelsPane');
      const pane = map.getPane('communesLabelsPane');
      if (pane) {
        pane.style.zIndex = '500';
        pane.style.pointerEvents = 'none';
      }
    }

    if (!map.getPane('additionalCirclesPane')) {
      map.createPane('additionalCirclesPane');
      const pane = map.getPane('additionalCirclesPane');
      if (pane) {
        pane.style.zIndex = '460';
      }
    }

    console.log('CommunesLayer - Nombre de communes reçues:', communes.length);
    console.log('CommunesLayer - Installations:', installations.length);

    const layers: L.Layer[] = [];

    // Calculer les cercles additionnels pour chaque installation
    const additionalCircles = new Map<string, number[]>();

    console.log('\n🔍 CALCUL DES CERCLES ADDITIONNELS');
    console.log(`📍 Nombre d'installations à analyser: ${installations.length}`);
    console.log(`📍 Communes disponibles: ${communes.length}\n`);

    installations.forEach(installation => {
      const installationDensite = installation.densite || 5;
      const installationCategory = getCategorieReglementaire(installationDensite);
      const rayonPrincipal = getRayonReglementaire(installationDensite);

      console.log('===== ANALYSE INSTALLATION =====');
      console.log(`Position: [${installation.latitude}, ${installation.longitude}]`);
      console.log(`Densité: ${installationDensite}, Catégorie: ${installationCategory}, Rayon principal: ${rayonPrincipal}m`);

      const circlesForInstallation: number[] = [];
      const installationPoint = turf.point([installation.longitude, installation.latitude]);

      // Installation en densité 5-7 (rayon 20 km)
      if (installationCategory === 3 && rayonPrincipal === 20000) {
        console.log('→ Installation catégorie 3 (densité 5-7, rayon 20 km)');

        // Vérifier si des communes de catégorie 2 (densité 3-4) intersectent un cercle de 10 km
        const cercle10km = turf.circle(installationPoint, 10, { steps: 64, units: 'kilometers' });
        console.log('→ Vérification cercle 10 km pour communes catégorie 2 (densité 3-4)...');

        const communesCat2 = communes.filter(c => getCategorieReglementaire(c.dens7) === 2);
        console.log(`  Communes catégorie 2 disponibles: ${communesCat2.length}`);
        communesCat2.forEach(c => console.log(`    - ${c.nom_commune} (densité ${c.dens7})`));

        const hasCat2In10km = communes.some(c => {
          if (getCategorieReglementaire(c.dens7) === 2 && c.geomgeo) {
            try {
              const communeFeature = turf.feature(c.geomgeo as any);
              const intersection = turf.intersect(turf.featureCollection([communeFeature, cercle10km]));
              const hasIntersection = intersection !== null;
              console.log(`    ${c.nom_commune}: ${hasIntersection ? '✓ INTERSECTE' : '✗ pas d\'intersection'}`);
              return hasIntersection;
            } catch (e) {
              console.log(`    ${c.nom_commune}: ✗ erreur intersection`, e);
              return false;
            }
          }
          return false;
        });

        console.log(`  Résultat: ${hasCat2In10km ? '✓ Cercle 10 km ajouté' : '✗ Pas de cercle 10 km'}`);
        if (hasCat2In10km) {
          circlesForInstallation.push(10000);
        }

        // Vérifier si des communes de catégorie 1 (densité 1-2) intersectent un cercle de 2 km
        const cercle2km = turf.circle(installationPoint, 2, { steps: 64, units: 'kilometers' });
        console.log('→ Vérification cercle 2 km pour communes catégorie 1 (densité 1-2)...');

        const communesCat1 = communes.filter(c => getCategorieReglementaire(c.dens7) === 1);
        console.log(`  Communes catégorie 1 disponibles: ${communesCat1.length}`);
        communesCat1.forEach(c => console.log(`    - ${c.nom_commune} (densité ${c.dens7})`));

        const hasCat1In2km = communes.some(c => {
          if (getCategorieReglementaire(c.dens7) === 1 && c.geomgeo) {
            try {
              const communeFeature = turf.feature(c.geomgeo as any);
              const intersection = turf.intersect(turf.featureCollection([communeFeature, cercle2km]));
              const hasIntersection = intersection !== null;
              console.log(`    ${c.nom_commune}: ${hasIntersection ? '✓ INTERSECTE' : '✗ pas d\'intersection'}`);
              return hasIntersection;
            } catch (e) {
              console.log(`    ${c.nom_commune}: ✗ erreur intersection`, e);
              return false;
            }
          }
          return false;
        });

        console.log(`  Résultat: ${hasCat1In2km ? '✓ Cercle 2 km ajouté' : '✗ Pas de cercle 2 km'}`);
        if (hasCat1In2km) {
          circlesForInstallation.push(2000);
        }
      }
      // Installation en densité 3-4 (rayon 10 km)
      else if (installationCategory === 2 && rayonPrincipal === 10000) {
        console.log('→ Installation catégorie 2 (densité 3-4, rayon 10 km)');

        // Vérifier si des communes de catégorie 1 (densité 1-2) intersectent un cercle de 2 km
        const cercle2km = turf.circle(installationPoint, 2, { steps: 64, units: 'kilometers' });
        console.log('→ Vérification cercle 2 km pour communes catégorie 1 (densité 1-2)...');

        const communesCat1 = communes.filter(c => getCategorieReglementaire(c.dens7) === 1);
        console.log(`  Communes catégorie 1 disponibles: ${communesCat1.length}`);
        communesCat1.forEach(c => console.log(`    - ${c.nom_commune} (densité ${c.dens7})`));

        const hasCat1In2km = communes.some(c => {
          if (getCategorieReglementaire(c.dens7) === 1 && c.geomgeo) {
            try {
              const communeFeature = turf.feature(c.geomgeo as any);
              const intersection = turf.intersect(turf.featureCollection([communeFeature, cercle2km]));
              const hasIntersection = intersection !== null;
              console.log(`    ${c.nom_commune}: ${hasIntersection ? '✓ INTERSECTE' : '✗ pas d\'intersection'}`);
              return hasIntersection;
            } catch (e) {
              console.log(`    ${c.nom_commune}: ✗ erreur intersection`, e);
              return false;
            }
          }
          return false;
        });

        console.log(`  Résultat: ${hasCat1In2km ? '✓ Cercle 2 km ajouté' : '✗ Pas de cercle 2 km'}`);
        if (hasCat1In2km) {
          circlesForInstallation.push(2000);
        }
      }
      // Installation en densité 1-2 (rayon 2 km) : pas de cercle additionnel
      else {
        console.log('→ Installation catégorie 1 (densité 1-2, rayon 2 km) : pas de cercle additionnel');
      }

      console.log(`Cercles à afficher: [${circlesForInstallation.map(r => r/1000 + 'km').join(', ')}]`);
      console.log('================================\n');

      if (circlesForInstallation.length > 0) {
        const key = `${installation.latitude},${installation.longitude}`;
        additionalCircles.set(key, circlesForInstallation);
      }
    });

    // Afficher les cercles additionnels
    additionalCircles.forEach((radii, key) => {
      const [lat, lon] = key.split(',').map(Number);
      radii.forEach(radius => {
        const circle = L.circle([lat, lon], {
          radius,
          pane: 'additionalCirclesPane',
          color: '#ef4444',
          fillColor: 'transparent',
          weight: 2,
          opacity: 0.8,
          dashArray: '10, 5',
        });
        circle.bindPopup(`
          <div style="font-family: sans-serif;">
            <strong>Cercle réglementaire additionnel</strong><br/>
            Rayon: ${(radius / 1000).toFixed(0)} km<br/>
            <em>Présence de communes plus restrictives</em>
          </div>
        `);
        circle.addTo(map);
        layers.push(circle);
      });
    });

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

    // Ajouter les labels des communes si activé
    if (showLabels) {
      communes.forEach((commune) => {
        if (!commune.geomgeo) return;

        try {
          // Calculer le centre de la commune
          const communeFeature = turf.feature(commune.geomgeo as any);
          const center = turf.centerOfMass(communeFeature);
          const [lon, lat] = center.geometry.coordinates;

          // Créer un marker avec un divIcon pour le label
          const labelIcon = L.divIcon({
            className: 'commune-label',
            html: `<div style="
              background-color: rgba(255, 255, 255, 0.9);
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              color: #1e293b;
              border: 1px solid #cbd5e1;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              white-space: nowrap;
              text-align: center;
            ">${commune.nom_commune}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const labelMarker = L.marker([lat, lon], {
            icon: labelIcon,
            pane: 'communesLabelsPane',
            interactive: false,
          });

          labelMarker.addTo(map);
          layers.push(labelMarker);
        } catch (error) {
          console.warn('Erreur lors de la création du label pour', commune.nom_commune, error);
        }
      });
    }

    return () => {
      layers.forEach((layer) => {
        map.removeLayer(layer);
      });
    };
  }, [map, communes, transparence, highlight, installations, showLabels]);

  return null;
}
