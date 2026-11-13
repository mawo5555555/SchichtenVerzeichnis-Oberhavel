# Holt die Grenze eines Landkreises von Nominatim (OpenStreetMap) und speichert sie als data/<kreis-id>/grenze.geojson
# (Feature mit Polygon-Außenring, wie von den anderen Werkzeugen erwartet).
# Aufruf: ruby tools/fetch_grenze.rb <kreis-id> "Landkreis Havelland, Brandenburg"
require 'net/http'
require 'uri'
require 'json'
require 'fileutils'

ROOT = File.expand_path('..', __dir__)
id, q = ARGV[0], ARGV[1]
abort 'Aufruf: ruby tools/fetch_grenze.rb <kreis-id> "<Suchtext>"' unless id && q
uri = URI("https://nominatim.openstreetmap.org/search?q=#{URI.encode_www_form_component(q)}&format=geojson&polygon_geojson=1&limit=1&polygon_threshold=0.0005")
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true
http.read_timeout = 60
r = http.get(uri.request_uri, 'User-Agent' => 'schichtenverzeichnis-prototype')
abort "HTTP #{r.code}" unless r.code == '200'
f = JSON.parse(r.body)['features'].first or abort 'nichts gefunden'
g = f['geometry']
ring = if g['type'] == 'Polygon' then g['coordinates'][0]
       elsif g['type'] == 'MultiPolygon' then g['coordinates'].map { |p| p[0] }.max_by(&:size)
       else abort "unerwarteter Typ #{g['type']}" end
FileUtils.mkdir_p(File.join(ROOT, 'data', id))
File.write(File.join(ROOT, 'data', id, 'grenze.geojson'),
           JSON.generate(type: 'Feature', properties: { name: f['properties']['display_name'] }, geometry: { type: 'Polygon', coordinates: [ring] }))
lat = ring.map { |p| p[1] }; lon = ring.map { |p| p[0] }
puts "#{id}: #{f['properties']['display_name']} – #{ring.size} Punkte, S/N #{lat.min.round(3)}/#{lat.max.round(3)}, W/E #{lon.min.round(3)}/#{lon.max.round(3)}"
