# Holt die Hydroisohypsen (Linien gleicher Grundwasserhöhe, m NHN) der Hydrogeologischen Karte 1:50 000 (HYK50, LBGR Brandenburg, WFS hgk_wfs)
# für die Ausdehnung eines Landkreises (Rechteck um die Grenze). Typ 3/4 = oberer Leiter (GWLK 1), 5/6 = tiefer, bedeckter Leiter (GWLK 2).
# Ergebnis: data/<kreis-id>/isohypsen.json mit Linien [Typ, Höhe, [lat, lon, lat, lon, ...]] (Punkte auf ca. 150 m ausgedünnt).
# Aufruf: ruby tools/fetch_isohypsen.rb <kreis-id>
require 'net/http'
require 'uri'
require 'json'
Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
id = ARGV[0] or abort 'Aufruf: ruby tools/fetch_isohypsen.rb <kreis-id>'
ring = begin
  JSON.parse(File.read(File.join(ROOT, 'data', id, 'grenze.geojson')))['geometry']['coordinates'][0]
rescue StandardError
  s = File.read(File.join(ROOT, 'data', id, 'daten.js')); i = s.index(/=\s+\{"id"/); JSON.parse(s[s.index('{', i)..].sub(/;\s*\z/, ''))['grenze'][0]
end
s_, n_ = ring.map { |p| p[1] }.minmax; w_, e_ = ring.map { |p| p[0] }.minmax
def get(url)
  uri = URI(url)
  4.times do
    begin
      http = Net::HTTP.new(uri.host, uri.port); http.use_ssl = true; http.open_timeout = 20; http.read_timeout = 120
      r = http.get(uri.request_uri)
      return r.body.dup.force_encoding('UTF-8').scrub('?') if r.code == '200'
    rescue StandardError => e
      warn "  #{e.class}"
    end
    sleep 3
  end
  nil
end
def decimate(pts, min_m = 150)
  out = [pts[0]]
  pts.each_cons(1) { |_| }
  pts[1..].each do |p|
    q = out.last; dy = (p[0] - q[0]) * 111320; dx = (p[1] - q[1]) * 111320 * Math.cos(p[0] * Math::PI / 180)
    out << p if Math.sqrt(dx * dx + dy * dy) >= min_m
  end
  out << pts.last if out.last != pts.last
  out
end
lines = []; start = 0
loop do
  url = "https://inspire.brandenburg.de/services/hgk_wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=app:hyk50_hydroisohypsen&COUNT=1000&STARTINDEX=#{start}" \
        "&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=#{s_},#{w_},#{n_},#{e_},urn:ogc:def:crs:EPSG::4326"
  xml = get(url) or abort 'Abruf fehlgeschlagen'
  mem = xml.scan(%r{<wfs:member>.*?</wfs:member>}m)
  mem.each do |m|
    ident = m[%r{<app:identifikator>([^<]*)<}, 1].to_i; wert = m[%r{<app:wert>([^<]*)<}, 1].to_f
    m.scan(%r{<gml:posList[^>]*>([^<]*)</gml:posList>}m).each do |(pl)|
      v = pl.split.map(&:to_f); pts = v.each_slice(2).to_a
      next if pts.size < 2
      d = decimate(pts)
      lines << [ident, wert, d.flatten.map { |x| x.round(5) }]
    end
  end
  puts "  #{start + mem.size} Objekte, #{lines.size} Linien"
  break if mem.size < 1000
  start += 1000
end
File.write(File.join(ROOT, 'data', id, 'isohypsen.json'), JSON.generate(lines))
puts "#{id}: #{lines.size} Linien, #{File.size(File.join(ROOT, 'data', id, 'isohypsen.json')) / 1024} KB; Typen: #{lines.group_by { |l| l[0] }.map { |k, v| "#{k}=#{v.size}" }.join(', ')}"
