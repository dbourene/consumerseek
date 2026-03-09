import { supabase } from '../supabaseClient';
import { ActiveInstallation } from '../types/installation';
import { getRayonReglementaire, getCategorieReglementaire } from '../utils/densityCategory';
import * as turf from '@turf/turf';

interface ExportKMLParams {
  activeInstallations: ActiveInstallation[];
}

export async function exportToKML(params: ExportKMLParams): Promise<void> {
  try {
    console.log('🗺️ Export KML - Génération du fichier KML...');

    const { activeInstallations } = params;

    if (activeInstallations.length === 0) {
      alert('Aucune installation sélectionnée.');
      return;
    }

    const allCommuneCodes = new Set<string>();

    for (const installation of activeInstallations) {
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

    const { data: communes, error } = await supabase
      .from('communes')
      .select('codgeo, nom_commune, dens7, libdens7, geomgeo')
      .in('codgeo', Array.from(allCommuneCodes));

    if (error || !communes) {
      console.error('❌ Erreur lors de la récupération des communes:', error);
      alert('Erreur lors de la récupération des communes.');
      return;
    }

    const kmlContent = await generateKMLContent(communes, activeInstallations);

    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `export_geometries_${timestamp}.kml`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Export KML réussi : ${filename}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'export KML:', error);
    alert('Une erreur est survenue lors de l\'export KML.');
  }
}

async function generateKMLContent(
  communes: any[],
  installations: ActiveInstallation[]
): Promise<string> {
  const placemarks: string[] = [];

  console.log(`📊 Traitement de ${communes.length} communes pour l'export KML`);

  const communeCodes = communes.filter(c => c.geomgeo).map(c => c.codgeo);

  if (communeCodes.length === 0) {
    console.warn('⚠️ Aucune commune avec géométrie');
  }

  const { data: kmlData, error: kmlError } = await supabase.rpc('get_communes_kml', {
    commune_codes: communeCodes
  });

  if (kmlError) {
    console.error('❌ Erreur lors de la conversion KML:', kmlError);
  }

  const kmlMap = new Map<string, string>();
  if (kmlData && Array.isArray(kmlData)) {
    for (const row of kmlData) {
      kmlMap.set(row.codgeo, row.kml_geometry);
      console.log(`✅ ${row.codgeo}: ${row.kml_geometry.substring(0, 50)}... (${row.kml_geometry.length} chars)`);
    }
  }

  console.log(`📊 KML généré pour ${kmlMap.size} communes sur ${communes.length}`);

  const communeFolder = createFolder(
    'Communes',
    'Communes avec leur classification de densité',
    []
  );

  for (const commune of communes) {
    if (!commune.geomgeo) {
      console.warn(`⚠️ Commune ${commune.nom_commune} n'a pas de géométrie`);
      continue;
    }

    const kmlGeometry = kmlMap.get(commune.codgeo);

    if (!kmlGeometry) {
      console.warn(`⚠️ Pas de KML retourné pour ${commune.nom_commune}`);
      continue;
    }

    const color = getCommuneColor(commune.dens7);
    const styleId = `style_dens${commune.dens7}`;

    const placemark = `
      <Placemark>
        <name>${escapeXML(commune.nom_commune)}</name>
        <ExtendedData>
          <Data name="Code">
            <value>${escapeXML(commune.codgeo)}</value>
          </Data>
          <Data name="Densité">
            <value>${escapeXML(commune.libdens7)}</value>
          </Data>
          <Data name="Code densité">
            <value>${commune.dens7}</value>
          </Data>
        </ExtendedData>
        <styleUrl>#${styleId}</styleUrl>
        ${kmlGeometry}
      </Placemark>`;

    communeFolder.placemarks.push(placemark);
  }

  console.log(`✅ Total communes ajoutées au KML: ${communeFolder.placemarks.length}`);

  const installationsFolder = createFolder(
    'Installations',
    'Stations de traitement des eaux',
    []
  );

  const rayonsFolder = createFolder(
    'Rayons réglementaires',
    'Cercles de rayon autour des installations',
    []
  );

  // Calculer les cercles additionnels pour chaque installation
  const additionalCircles = new Map<string, number[]>();

  console.log('\n🔍 CALCUL DES CERCLES ADDITIONNELS POUR KML');
  console.log(`📍 Nombre d'installations à analyser: ${installations.length}`);
  console.log(`📍 Communes disponibles: ${communes.length}\n`);

  for (const installation of installations) {
    const installationDensite = installation.densite || 5;
    const installationCategory = getCategorieReglementaire(installationDensite);
    const rayonPrincipal = getRayonReglementaire(installationDensite);

    console.log('===== ANALYSE INSTALLATION (KML) =====');
    console.log(`Nom: ${installation.nom}`);
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
    if (installationCategory === 2 && rayonPrincipal === 10000) {
      console.log('→ Installation catégorie 2 (densité 3-4, rayon 10 km)');

      // Vérifier si des communes de catégorie 1 (densité 1-2) intersectent un cercle de 2 km
      const cercle2km = turf.circle(installationPoint, 2, { steps: 64, units: 'kilometers' });
      console.log('→ Vérification cercle 2 km pour communes catégorie 1 (densité 1-2)...');

      const communesCat1 = communes.filter(c => getCategorieReglementaire(c.dens7) === 1);
      console.log(`  Communes catégorie 1 disponibles: ${communesCat1.length}`);

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

    if (circlesForInstallation.length > 0) {
      additionalCircles.set(installation.id, circlesForInstallation);
      console.log(`✅ Cercles additionnels pour ${installation.nom}:`, circlesForInstallation.map(r => `${r/1000}km`).join(', '));
    } else {
      console.log(`ℹ️ Pas de cercle additionnel pour ${installation.nom}`);
    }
  }

  console.log('\n📊 Génération des placemarks KML...\n');

  for (const installation of installations) {
    const placemark = `
      <Placemark>
        <name>${escapeXML(installation.nom)}</name>
        <description><![CDATA[
          <b>Puissance:</b> ${installation.puissance_kWc || 'N/A'} kWc<br/>
        ]]></description>
        <styleUrl>#style_installation</styleUrl>
        <Point>
          <coordinates>${installation.longitude},${installation.latitude},0</coordinates>
        </Point>
      </Placemark>`;

    installationsFolder.placemarks.push(placemark);

    if (installation.rayon) {
      const rayonKm = (installation.rayon / 1000).toFixed(2);
      const circleCoordinates = generateCircleCoordinates(
        installation.latitude,
        installation.longitude,
        installation.rayon
      );

      const circlePlacemark = `
      <Placemark>
        <name>Rayon ${rayonKm} km - ${installation.nom}</name>
        <description><![CDATA[
          <b>Rayon réglementaire:</b> ${rayonKm} km<br/>
          <b>Installation:</b> ${escapeXML(installation.nom)}
        ]]></description>
        <styleUrl>#style_rayon_${getRayonStyleId(installation.rayon)}</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
${circleCoordinates}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`;

      rayonsFolder.placemarks.push(circlePlacemark);
    }

    if (installation.rayon_densite_reglementaire &&
        installation.rayon_densite_reglementaire !== installation.rayon) {
      const rayonAdapteKm = (installation.rayon_densite_reglementaire / 1000).toFixed(2);
      const circleAdapteCoordinates = generateCircleCoordinates(
        installation.latitude,
        installation.longitude,
        installation.rayon_densite_reglementaire
      );

      const circleAdaptePlacemark = `
      <Placemark>
        <name>Rayon adapté ${rayonAdapteKm} km - ${installation.nom}</name>
        <description><![CDATA[
          <b>Rayon adapté à la densité:</b> ${rayonAdapteKm} km<br/>
          <b>Installation:</b> ${escapeXML(installation.nom)}<br/>
          <b>Note:</b> Rayon élargi pour communes de catégorie inférieure
        ]]></description>
        <styleUrl>#style_rayon_${getRayonStyleId(installation.rayon_densite_reglementaire)}</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
${circleAdapteCoordinates}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`;

      rayonsFolder.placemarks.push(circleAdaptePlacemark);
    }

    // Ajouter les cercles additionnels
    const additionalRadii = additionalCircles.get(installation.id);
    if (additionalRadii && additionalRadii.length > 0) {
      console.log(`📍 Ajout de ${additionalRadii.length} cercle(s) additionnel(s) pour ${installation.nom}`);

      for (const radius of additionalRadii) {
        const rayonKm = (radius / 1000).toFixed(2);
        const circleCoordinates = generateCircleCoordinates(
          installation.latitude,
          installation.longitude,
          radius
        );

        const additionalCirclePlacemark = `
      <Placemark>
        <name>Rayon additionnel ${rayonKm} km - ${installation.nom}</name>
        <description><![CDATA[
          <b>Rayon additionnel:</b> ${rayonKm} km<br/>
          <b>Installation:</b> ${escapeXML(installation.nom)}<br/>
          <b>Raison:</b> Communes de catégorie plus restrictive dans le périmètre
        ]]></description>
        <styleUrl>#style_rayon_${getRayonStyleId(radius)}</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
${circleCoordinates}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`;

        rayonsFolder.placemarks.push(additionalCirclePlacemark);
      }
    }
  }

  const totalPlacemarks = communeFolder.placemarks.length +
                         installationsFolder.placemarks.length +
                         rayonsFolder.placemarks.length;

  console.log(`📋 Récapitulatif KML:`);
  console.log(`   - Communes: ${communeFolder.placemarks.length}`);
  console.log(`   - Installations: ${installationsFolder.placemarks.length}`);
  console.log(`   - Rayons: ${rayonsFolder.placemarks.length}`);
  console.log(`   - Total placemarks: ${totalPlacemarks}`);

  const styles = generateStyles();

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Export ConsumerSeek</name>
    <description>Communes, installations et rayons réglementaires</description>
    ${styles}
    ${renderFolder(communeFolder)}
    ${renderFolder(installationsFolder)}
    ${renderFolder(rayonsFolder)}
  </Document>
</kml>`;
}

function getCommuneColor(dens7: number): string {
  switch (dens7) {
    case 1:
      return '7f90ee90';
    case 2:
      return '7fffffe0';
    case 3:
      return '7fffb366';
    case 4:
      return '7f4169e1';
    default:
      return '7fcccccc';
  }
}

function getCircleColor(rayon: number): string {
  if (rayon <= 10000) {
    return 'ff0000ff';
  } else if (rayon <= 15000) {
    return 'ff00ff00';
  } else if (rayon <= 20000) {
    return 'ff00ffff';
  } else {
    return 'ffff0000';
  }
}

function generateCircleCoordinates(lat: number, lon: number, radiusMeters: number): string {
  const points: string[] = [];
  const numPoints = 64;
  const earthRadius = 6371000;

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 360) / numPoints;
    const angleRad = (angle * Math.PI) / 180;

    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;

    const newLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(radiusMeters / earthRadius) +
      Math.cos(latRad) * Math.sin(radiusMeters / earthRadius) * Math.cos(angleRad)
    );

    const newLonRad = lonRad + Math.atan2(
      Math.sin(angleRad) * Math.sin(radiusMeters / earthRadius) * Math.cos(latRad),
      Math.cos(radiusMeters / earthRadius) - Math.sin(latRad) * Math.sin(newLatRad)
    );

    const newLat = (newLatRad * 180) / Math.PI;
    const newLon = (newLonRad * 180) / Math.PI;

    points.push(`${newLon},${newLat},0`);
  }

  return points.join('\n              ');
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface FolderData {
  name: string;
  description: string;
  placemarks: string[];
}

function createFolder(name: string, description: string, placemarks: string[]): FolderData {
  return { name, description, placemarks };
}

function renderFolder(folder: FolderData): string {
  if (folder.placemarks.length === 0) {
    return '';
  }

  return `
    <Folder>
      <name>${escapeXML(folder.name)}</name>
      <description>${escapeXML(folder.description)}</description>
      ${folder.placemarks.join('\n')}
    </Folder>`;
}

function getRayonStyleId(rayon: number): string {
  if (rayon <= 2000) return '2km';
  if (rayon <= 10000) return '10km';
  if (rayon <= 15000) return '15km';
  if (rayon <= 20000) return '20km';
  return '20kmplus';
}

function generateStyles(): string {
  return `
    <Style id="style_dens1">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f0000FF</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_dens2">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f0000FF</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_dens3">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f00FFFF</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_dens4">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f00FFFF</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_dens5">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f00FF00</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_dens6">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f00FF00</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_dens7">
      <LineStyle>
        <color>ff000000</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>7f00FF00</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_installation">
      <IconStyle>
        <color>ff0000ff</color>
        <scale>1.3</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="style_rayon_10km">
      <LineStyle>
        <color>ff0000ff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00000000</color>
        <fill>0</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_rayon_15km">
      <LineStyle>
        <color>ff00ff00</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00000000</color>
        <fill>0</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_rayon_20km">
      <LineStyle>
        <color>ff00ffff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00000000</color>
        <fill>0</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_rayon_20kmplus">
      <LineStyle>
        <color>ffff0000</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00000000</color>
        <fill>0</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="style_rayon_2km">
      <LineStyle>
        <color>ffff00ff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00000000</color>
        <fill>0</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>`;
}
