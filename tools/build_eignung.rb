# Rechnet für einen Landkreis eine Karte vor: Wahrscheinlichkeit für Sand/Kies (mögliche Grundwasserleiter) in 5, 10, 20, 40 und 60 m Tiefe
# auf einem 500-m-Raster, aus den gelesenen Schichten aller Landkreis-Dateien (data/*/daten.js), abstandsgewichtet wie in der Seite.
# Ergebnis: data/<kreis-id>/eignung.json (Ziffer 0 = keine Angabe, 1-9 = Wahrscheinlichkeit in Neuntelschritten). Danach build_kreis.rb ausführen.
# Aufruf: ruby tools/build_eignung.rb <kreis-id>
require 'json'
Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
id = ARGV[0] or abort 'Aufruf: ruby tools/build_eignung.rb <kreis-id>'
AQ = ["Feinsand", "Mittelsand", "Grobsand", "Sand (o. n. A.)", "Kies"]
def load_kreis(f)
  s = File.read(f); i = s.index(/=\s+\{"id"/); JSON.parse(s[s.index('{', i)..].sub(/;\s*\z/, ''))
end
seen = {}; B = []; mine = nil
Dir[File.join(ROOT, 'data', '*', 'daten.js')].sort.each do |f|
  k = load_kreis(f); mine = k if k['id'] == id
  k['bohrungen'].each do |b|
    next unless b['l'] && !seen[b['i']]
    seen[b['i']] = true
    B << { lat: b['a'], lon: b['o'], depth: b['l'].last[1].to_f, lay: b['l'].map { |x| [x[0].to_f, x[1].to_f, AQ.include?(x[3]) ? 1 : 0] } }
  end
end
abort "Landkreis #{id} nicht gefunden" unless mine
puts "Bohrungen mit Schichten (alle Kreise): #{B.size}"
EL = mine['elevation']; RING = mine['grenze'][0]
STEP = 2
rows = (EL['rows'] + STEP - 1) / STEP; cols = (EL['cols'] + STEP - 1) / STEP
slat = EL['step_lat'] * STEP; slon = EL['step_lon'] * STEP; olat = EL['origin_lat']; olon = EL['origin_lon']
def inside?(lat, lon)
  c = false; j = RING.length - 1
  RING.each_with_index { |(xi, yi), i| xj, yj = RING[j]; c = !c if ((yi > lat) != (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi); j = i }
  c
end
CELL = 0.03; GRID = Hash.new { |h, k| h[k] = [] }
B.each { |b| GRID[[(b[:lat] / CELL).floor, (b[:lon] / CELL).floor]] << b }
DEPTHS = [5, 10, 20, 40, 60]; R = 3000.0
out = DEPTHS.map { +'' }; n_in = 0
rows.times do |r|
  cols.times do |c|
    lat = olat + r * slat; lon = olon + c * slon
    unless inside?(lat, lon) then out.each { |s| s << '0' }; next end
    n_in += 1
    cosl = Math.cos(lat * Math::PI / 180)
    near = []
    ((lat / CELL).floor - 1..(lat / CELL).floor + 1).each { |gy| ((lon / CELL).floor - 1..(lon / CELL).floor + 1).each { |gx|
      GRID[[gy, gx]].each { |b| dy = (b[:lat] - lat) * 111320; dx = (b[:lon] - lon) * 111320 * cosl; d = Math.sqrt(dx * dx + dy * dy); near << [b, d] if d <= R } } }
    DEPTHS.each_with_index do |dep, k|
      w = s = 0.0; n = 0
      near.each do |b, d|
        next if b[:depth] <= dep
        v = nil; b[:lay].each { |a, z, q| (v = q; break) if a <= dep && dep < z }
        next if v.nil?
        wt = 1.0 / (d + 100); w += wt; s += wt * v; n += 1
      end
      out[k] << (n >= 2 ? (1 + [(s / w * 8.999).floor, 8].min).to_s : '0')
    end
  end
end
File.write(File.join(ROOT, 'data', id, 'eignung.json'), JSON.generate(origin_lat: olat, origin_lon: olon, step_lat: slat, step_lon: slon, rows: rows, cols: cols, d: DEPTHS, m: out))
puts "#{id}: #{n_in} Zellen im Kreis; ohne Angabe je Tiefe: #{out.map { |s| s.count('0') - (rows * cols - n_in) }.inspect}"
