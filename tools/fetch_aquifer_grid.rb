# Fragt den Grundwasserleiter-Kartendienst (Umweltgeologische Karte 1:300 000) auf einem 500-m-Raster ab,
# damit die Angabe später ohne Internet nachgeschlagen werden kann (nächster Rasterpunkt).
# Ergebnis: data/aquifer_grid.json
require 'net/http'
require 'uri'
require 'json'

Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
KREIS = ARGV[0] || 'oberhavel'
RING = JSON.parse(File.read(File.join(ROOT, 'data', KREIS, 'grenze.geojson')))['geometry']['coordinates'][0]
BB_ = JSON.parse(File.read(File.join(ROOT, "data", KREIS, "grenze.geojson")))["geometry"]["coordinates"][0]
S, N = BB_.map { |p| p[1] }.minmax
W, E = BB_.map { |p| p[0] }.minmax
STEP_LAT = 0.0045     # ca. 500 m
STEP_LON = 0.0075     # ca. 500 m bei 53° Nord
WMS = 'https://inspire.brandenburg.de/services/ge_hg_ugk300_wms'

def inside?(lat, lon)
  c = false
  j = RING.length - 1
  RING.each_with_index do |(xi, yi), i|
    xj, yj = RING[j]
    c = !c if ((yi > lat) != (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    j = i
  end
  c
end

rows = ((N - S) / STEP_LAT).ceil + 1
cols = ((E - W) / STEP_LON).ceil + 1
points = []
rows.times do |r|
  cols.times do |c|
    lat = S + r * STEP_LAT
    lon = W + c * STEP_LON
    points << [r, c, lat, lon] if inside?(lat, lon)
  end
end
puts "Rasterpunkte im Landkreis: #{points.size} (Raster #{rows} x #{cols})"

def query(lat, lon)
  d = 0.03
  bbox = [lat - d, lon - d, lat + d, lon + d].join(',')
  url = "#{WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=GE.Aquifer.MediaType" \
        "&QUERY_LAYERS=GE.Aquifer.MediaType&CRS=EPSG:4326&BBOX=#{bbox}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/xml"
  uri = URI(url)
  4.times do
    begin
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 20
      http.read_timeout = 40
      r = http.get(uri.request_uri)
      if r.code == '200'
        xml = r.body.dup.force_encoding('UTF-8').scrub('?')
        feat = xml[%r{<ge_hg:Aquifer .*?</ge_hg:Aquifer>}m]
        return nil unless feat
        g = ->(t) { (feat[%r{<ge_hg:#{t}>([^<]*)</ge_hg:#{t}>}, 1] || '').strip.gsub('&lt;', '<').gsub('&gt;', '>').gsub('&amp;', '&') }
        return {
          bezeichnung: g.('sch_Aquifer_name'),
          maechtigkeit: g.('sch_Aquifer_approximateThickness_QuantityValue_2724'),
          einheit: g.('sch_Aquifer_approximateThickness_QuantityValue_2707'),
          gestein: g.('sub_Aquifer_name'),
          art: g.('sch_Aquifer_mediaType').empty? ? g.('sub_Aquifer_mediaType') : g.('sch_Aquifer_mediaType'),
          empfindlichkeit: g.('sch_Aquifer_vulnerabilityToPollution_QuantityValue_2929')
        }
      end
    rescue StandardError
      nil
    end
    sleep 2
  end
  :fehler
end

queue = Queue.new
points.each { |p| queue << p }
results = {}
errors = 0
done = 0
lock = Mutex.new
3.times.map do
  Thread.new do
    loop do
      p = begin
        queue.pop(true)
      rescue ThreadError
        break
      end
      res = query(p[2], p[3])
      lock.synchronize do
        done += 1
        if res == :fehler
          errors += 1
        else
          results[[p[0], p[1]]] = res
        end
        puts "  #{done}/#{points.size} (Fehler: #{errors})" if (done % 500).zero?
      end
      sleep 0.05
    end
  end
end.each(&:join)

classes = []
index = {}
cells = Array.new(rows * cols, -1)
results.each do |(r, c), v|
  next if v.nil?
  key = JSON.generate(v)
  index[key] ||= (classes << v; classes.size - 1)
  cells[r * cols + c] = index[key]
end
File.write(File.join(ROOT, 'data', KREIS, 'aquifer_grid.json'),
           JSON.generate(origin_lat: S, origin_lon: W, step_lat: STEP_LAT, step_lon: STEP_LON, rows: rows, cols: cols,
                         classes: classes, cells: cells))
puts "Fertig. Klassen: #{classes.size}, Punkte mit Angabe: #{cells.count { |x| x >= 0 }}, ohne Angabe: #{results.size - cells.count { |x| x >= 0 }}, Fehler: #{errors}"
