# Holt Geländehöhen für den Landkreis auf einem 250-m-Raster (EU-DEM, 25 m Auflösung, über die öffentliche OpenTopoData-API),
# damit die Offline-Karte Höhenlinien und Relief zeichnen kann.  Quelle: EU-DEM / Copernicus, Zugang: opentopodata.org
# Die API erlaubt 100 Punkte je Abruf und etwa einen Abruf pro Sekunde, das Skript hält sich daran (ca. 10 Minuten).
require 'net/http'
require 'uri'
require 'json'

Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
KREIS = ARGV[0] || 'oberhavel'
BB_ = JSON.parse(File.read(File.join(ROOT, "data", KREIS, "grenze.geojson")))["geometry"]["coordinates"][0]
S, N = BB_.map { |p| p[1] }.minmax
W, E = BB_.map { |p| p[0] }.minmax
MULT = (ENV["MULT"] || 1).to_i   # 2 = 500-m-Raster (weniger Abrufe)
STEP_LAT = 0.00225 * MULT   # ca. 250 m * MULT
STEP_LON = 0.00375 * MULT
rows = ((N - S) / STEP_LAT).ceil + 1
cols = ((E - W) / STEP_LON).ceil + 1
pts = []
rows.times { |r| cols.times { |c| pts << [r, c, (S + r * STEP_LAT).round(5), (W + c * STEP_LON).round(5)] } }
puts "Rasterpunkte: #{pts.size} (#{rows} x #{cols})"
$stdout.sync = true

def fetch(batch)
  locs = batch.map { |p| "#{p[2]},#{p[3]}" }.join('|')
  uri = URI("https://api.opentopodata.org/v1/eudem25m?locations=#{locs}")
  8.times do |t|
    begin
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 20
      http.read_timeout = 60
      r = http.get(uri.request_uri, 'User-Agent' => 'schichtenverzeichnis-prototype')
      return JSON.parse(r.body)['results'].map { |x| x['elevation'] } if r.code == '200'
      warn "  HTTP #{r.code}, warte"
    rescue StandardError => e
      warn "  #{e.class}"
    end
    sleep 5 * (t + 1)
  end
  nil
end

vals = Array.new(rows * cols)
batches = pts.each_slice(100).to_a
fail_count = 0
batches.each_with_index do |b, i|
  el = fetch(b)
  if el && el.size == b.size
    b.each_with_index { |p, k| vals[p[0] * cols + p[1]] = el[k].nil? ? nil : (el[k] * 10).round }
  else
    fail_count += 1
  end
  puts "  #{i + 1}/#{batches.size} (Fehler: #{fail_count})" if ((i + 1) % 25).zero?
  sleep 1.1
end

missing = vals.count(&:nil?)
File.write(File.join(ROOT, 'data', KREIS, 'elevation.json'),
           JSON.generate(origin_lat: S, origin_lon: W, step_lat: STEP_LAT, step_lon: STEP_LON, rows: rows, cols: cols, dm: vals.map { |v| v || -32768 }))
puts "Fertig. Fehlende Punkte: #{missing}. Hoehe min/max (m): #{vals.compact.min.to_f / 10} / #{vals.compact.max.to_f / 10}"
