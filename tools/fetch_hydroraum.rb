# Fragt die Hydrogeologische Raumgliederung (WMS hgk_wms, Ebene hydroraum, LBGR Brandenburg) auf einem 1-km-Raster ab
# und speichert die Namen der Landschaftseinheiten (z. B. "Brandenburgische Urstrom- und Nebentäler") als data/<kreis-id>/hydroraum.json.
# Aufruf: ruby tools/fetch_hydroraum.rb <kreis-id>
require 'net/http'
require 'uri'
require 'json'

Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
id = ARGV[0] or abort 'Aufruf: ruby tools/fetch_hydroraum.rb <kreis-id>'
EL = begin
  f = File.join(ROOT, 'data', id, 'elevation.json')
  if File.exist?(f) then JSON.parse(File.read(f))
  else s = File.read(File.join(ROOT, 'data', id, 'daten.js')); i = s.index(/=\s+\{"id"/); JSON.parse(s[s.index('{', i)..].sub(/;\s*\z/, ''))['elevation'] end
end
RING = JSON.parse(File.read(File.join(ROOT, 'data', id, 'grenze.geojson')))['geometry']['coordinates'][0] rescue nil
if RING.nil?
  s = File.read(File.join(ROOT, 'data', id, 'daten.js')); i = s.index(/=\s+\{"id"/)
  RING = JSON.parse(s[s.index('{', i)..].sub(/;\s*\z/, ''))['grenze'][0]
end
STEP_LAT = 0.009; STEP_LON = 0.015                # ca. 1 km
S = EL['origin_lat']; W = EL['origin_lon']
rows = ((EL['rows'] * EL['step_lat']) / STEP_LAT).ceil + 1; cols = ((EL['cols'] * EL['step_lon']) / STEP_LON).ceil + 1
def inside?(lat, lon)
  c = false; j = RING.length - 1
  RING.each_with_index { |(xi, yi), i| xj, yj = RING[j]; c = !c if ((yi > lat) != (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi); j = i }
  c
end
pts = []
rows.times { |r| cols.times { |c| lat = S + r * STEP_LAT; lon = W + c * STEP_LON; pts << [r, c, lat, lon] if inside?(lat, lon) } }
puts "Punkte: #{pts.size}"; $stdout.sync = true
def query(lat, lon)
  d = 0.002
  url = "https://inspire.brandenburg.de/services/hgk_wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=hydroraum&QUERY_LAYERS=hydroraum" \
        "&CRS=EPSG:4326&BBOX=#{lat - d},#{lon - d},#{lat + d},#{lon + d}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/plain"
  uri = URI(url)
  4.times do
    begin
      http = Net::HTTP.new(uri.host, uri.port); http.use_ssl = true; http.open_timeout = 20; http.read_timeout = 40
      r = http.get(uri.request_uri)
      if r.code == '200'
        t = r.body.dup.force_encoding('UTF-8').scrub('?')
        g = ->(k) { t[/#{k} = '([^']*)'/, 1] }
        return g.('nat_name') ? { nat: g.('nat_name'), hnat: g.('hnat_name'), tr: g.('tr_name'), r: g.('r_name') } : nil
      end
    rescue StandardError
      nil
    end
    sleep 2
  end
  :fehler
end
q = Queue.new; pts.each { |p| q << p }
res = {}; err = 0; done = 0; lock = Mutex.new
3.times.map { Thread.new { loop { p = (q.pop(true) rescue break); v = query(p[2], p[3]); lock.synchronize { done += 1; v == :fehler ? err += 1 : res[[p[0], p[1]]] = v; puts "  #{done}/#{pts.size} (Fehler #{err})" if (done % 500).zero? }; sleep 0.05 } } }.each(&:join)
classes = []; idx = {}; cells = Array.new(rows * cols, -1)
res.each { |(r, c), v| next if v.nil?; k = JSON.generate(v); idx[k] ||= (classes << v; classes.size - 1); cells[r * cols + c] = idx[k] }
File.write(File.join(ROOT, 'data', id, 'hydroraum.json'), JSON.generate(origin_lat: S, origin_lon: W, step_lat: STEP_LAT, step_lon: STEP_LON, rows: rows, cols: cols, classes: classes, cells: cells))
puts "Fertig. Klassen: #{classes.size}, Punkte mit Angabe: #{cells.count { |x| x >= 0 }}, Fehler: #{err}"
