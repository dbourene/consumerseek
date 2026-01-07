-- Exemple de données de communes pour tester l'application
-- Vous pouvez exécuter ce script dans le SQL Editor de Supabase

-- Insertion de quelques communes autour de Paris pour tester
INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Paris', '75056', 7, 48.8566, 2.3522, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.2241,48.8155],[2.4699,48.8155],[2.4699,48.9022],[2.2241,48.9022],[2.2241,48.8155]]]]}'))
  ON CONFLICT (code) DO NOTHING;

INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Versailles', '78646', 5, 48.8048, 2.1203, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.0903,48.7848],[2.1503,48.7848],[2.1503,48.8248],[2.0903,48.8248],[2.0903,48.7848]]]]}'))
  ON CONFLICT (code) DO NOTHING;

INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Melun', '77288', 3, 48.5394, 2.6602, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.6302,48.5194],[2.6902,48.5194],[2.6902,48.5594],[2.6302,48.5594],[2.6302,48.5194]]]]}'))
  ON CONFLICT (code) DO NOTHING;

INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Fontainebleau', '77186', 2, 48.4084, 2.7015, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.6715,48.3884],[2.7315,48.3884],[2.7315,48.4284],[2.6715,48.4284],[2.6715,48.3884]]]]}'))
  ON CONFLICT (code) DO NOTHING;

INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Nemours', '77333', 1, 48.2662, 2.6966, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.6666,48.2462],[2.7266,48.2462],[2.7266,48.2862],[2.6666,48.2862],[2.6666,48.2462]]]]}'))
  ON CONFLICT (code) DO NOTHING;

INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Boulogne-Billancourt', '92012', 6, 48.8350, 2.2397, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.2097,48.8150],[2.2697,48.8150],[2.2697,48.8550],[2.2097,48.8550],[2.2097,48.8150]]]]}'))
  ON CONFLICT (code) DO NOTHING;

INSERT INTO communes (nom, code, densite, latitude, longitude, geom) VALUES
  ('Saint-Denis', '93066', 6, 48.9362, 2.3574, ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[2.3274,48.9162],[2.3874,48.9162],[2.3874,48.9562],[2.3274,48.9562],[2.3274,48.9162]]]]}'))
  ON CONFLICT (code) DO NOTHING;

-- Note: Les géométries ci-dessus sont des rectangles simplifiés pour l'exemple
-- Pour obtenir les vraies géométries des communes françaises, vous pouvez utiliser :
-- - data.gouv.fr (fichiers GeoJSON des communes)
-- - API Geo (api.gouv.fr/api/geo)
-- - Base ADMIN EXPRESS de l'IGN

-- Exemple de requête pour tester la fonction RPC :
-- SELECT rpc_communes_autour_installation(48.8566, 2.3522);
