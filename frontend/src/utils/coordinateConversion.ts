import proj4 from 'proj4';

proj4.defs(
  'EPSG:2154',
  '+proj=lcc ' +
  '+lat_1=49 +lat_2=44 +lat_0=46.5 ' +
  '+lon_0=3 ' +
  '+x_0=700000 +y_0=6600000 ' +
  '+ellps=GRS80 +units=m +no_defs'
);

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
}

export function lambert93ToWGS84(x: number, y: number): GPSCoordinates {
  const [longitude, latitude] = proj4('EPSG:2154', 'EPSG:4326', [x, y]);

  return {
    latitude,
    longitude
  };
}

export function isValidLambert93Coordinates(x: number | null | undefined, y: number | null | undefined): boolean {
  if (x === null || x === undefined || y === null || y === undefined) {
    return false;
  }

  return x >= 100000 && x <= 1300000 && y >= 6000000 && y <= 7200000;
}
