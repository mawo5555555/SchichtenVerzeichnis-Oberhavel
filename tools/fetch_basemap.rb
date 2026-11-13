# Holt Orte, Hauptstraßen, Flüsse und Seen für Oberhavel aus OpenStreetMap (Overpass-API) und speichert sie kompakt als
# Hintergrundkarte für die Offline-Version. Daten: © OpenStreetMap-Mitwirkende (ODbL).
require 'net/http'
require 'uri'
require 'json'

Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
KREIS = ARGV[0] || 'oberhavel'
BB_ = JSON.parse(File.read(File.join(ROOT, "data", KREIS, "grenze.geojson")))["geometry"]["coordinates"][0]
S, N = BB_.map { |p| p[1] }.minmax
W, E = BB_.map { |p| p[0] }.minmax
BB = "#{S},#{W},#{N},#{E}"
QUERY = <<~Q
  [out:json][timeout:120];
  (
    node["place"~"^(city|town|village)$"](#{BB});
    way["highway"~"^(motorway|trunk|primary|secondary)$"](#{BB});
    way["waterway"~"^(river|canal)$"](#{BB});
    way["natural"="water"]["name"](#{BB});
  );
  out geom tags;
Q

uri = URI('https://overpass-api.de/api/interpreter')
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true
http.open_timeout = 30
http.read_timeout = 180
req = Net::HTTP::Post.new(uri.request_uri)
req['User-Agent'] = 'schichtenverzeichnis-prototype'
req.set_form_data('data' => QUERY)
res = http.request(req)
abort "Overpass-Fehler #{res.code}" unless res.code == '200'
data = JSON.parse(res.body.dup.force_encoding('UTF-8').scrub('?'))

def line(geom)
  pts = geom.map { |p| [p['lat'].round(5), p['lon'].round(5)] }
  pts.each_with_object([]) { |p, a| a << p unless a.last == p }
end

out = { orte: [], strassen: [], fluesse: [], seen: [] }
data['elements'].each do |el|
  tags = el['tags'] || {}
  if el['type'] == 'node'
    out[:orte] << { n: tags['name'], t: tags['place'], lat: el['lat'].round(5), lon: el['lon'].round(5) } if tags['name']
  elsif el['type'] == 'way' && el['geometry']
    if tags['highway']
      out[:strassen] << { k: tags['highway'], n: (tags['name'] || tags['ref']), p: line(el['geometry']) }
    elsif tags['waterway']
      out[:fluesse] << { n: tags['name'], p: line(el['geometry']) }
    elsif tags['natural'] == 'water'
      out[:seen] << { n: tags['name'], p: line(el['geometry']) }
    end
  end
end
File.write(File.join(ROOT, 'data', KREIS, 'basemap.json'), JSON.generate(out))
puts "Orte: #{out[:orte].size}, Straßen: #{out[:strassen].size}, Flüsse: #{out[:fluesse].size}, Seen: #{out[:seen].size}"
puts "Größe: #{File.size(File.join(ROOT, 'data', KREIS, 'basemap.json')) / 1024} KB"
