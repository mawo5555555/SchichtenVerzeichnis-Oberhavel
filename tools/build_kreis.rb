# Fasst die Rohdaten eines Landkreises (data/<id>/*.json, grenze.geojson) zu einer Datei data/<id>/daten.js zusammen.
# Die Web-App lädt alle Dateien data/*/daten.js und wertet die Bohrungen aller Landkreise gemeinsam aus.
# Aufruf: ruby tools/build_kreis.rb <kreis-id> <Anzeigename> [profiles.jsonl]
# Mit profiles.jsonl (Ergebnis der Texterkennung) werden die gelesenen Schichten je Bohrung ("l") mit eingebaut.
require 'json'
require 'date'

ROOT = File.expand_path('..', __dir__)
id, name = ARGV[0], ARGV[1]
abort 'Aufruf: ruby tools/build_kreis.rb <kreis-id> <Anzeigename>' unless id && name
PROF = {}
if ARGV[2] && File.exist?(ARGV[2])
  File.foreach(ARGV[2]) do |line|
    r = JSON.parse(line) rescue next
    PROF[r["id"].to_s] = r["layers"].map { |l| [l[0], l[1], l[2], l[3]] } if r["ok"] && r["layers"] && !r["layers"].empty?
  end
end
dir = File.join(ROOT, 'data', id)
read = ->(f) { JSON.parse(File.read(File.join(dir, f))) }
krs = {
  id: id, name: name, stand: Date.today.strftime('%d.%m.%Y'),
  grenze: read.('grenze.geojson')['geometry']['coordinates'],
  bohrungen: read.('boreholes.json').map { |b| { i: b['id'], n: b['name'], a: b['lat'], o: b['lon'], t: b['depth'], h: b['height'], k: b['type'], p: 0 }.tap { |h| h[:l] = PROF[b['id'].to_s] if PROF[b['id'].to_s] } },
  basemap: read.('basemap.json'),
  basemap_detail: { strassen: [], bahn: [] },
  elevation: File.exist?(File.join(dir, 'elevation.json')) ? read.('elevation.json') : { rows: 0 },
  hyk: File.exist?(File.join(dir, 'hyk.json')) ? read.('hyk.json') : nil,
  eignung: File.exist?(File.join(dir, 'eignung.json')) ? read.('eignung.json') : nil,
  hydroraum: File.exist?(File.join(dir, 'hydroraum.json')) ? read.('hydroraum.json') : nil,
  isohypsen: File.exist?(File.join(dir, 'isohypsen.json')) ? read.('isohypsen.json').select { |l| [3, 4, 5, 6].include?(l[0]) } : nil,
  aquifer: File.exist?(File.join(dir, 'aquifer_grid.json')) ? read.('aquifer_grid.json') : { rows: 0, cells: [], classes: [] }
}
File.write(File.join(dir, 'daten.js'),
           "window.KREIS_DATEN = window.KREIS_DATEN || {};\nwindow.KREIS_DATEN[#{id.to_json}] = #{JSON.generate(krs)};\n")
puts "#{id}: #{krs[:bohrungen].size} Bohrungen, #{File.size(File.join(dir, 'daten.js')) / 1024} KB"
