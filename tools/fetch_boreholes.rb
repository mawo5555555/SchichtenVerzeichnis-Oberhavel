# Lädt alle Bohrungen mit Schichtenverzeichnis im Bereich eines Landkreises vom WFS des Landes Brandenburg.
# Aufruf: ruby tools/fetch_boreholes.rb <kreis-id>   (z. B. ostprignitz-ruppin)
# Ergebnis: data/<kreis-id>/boreholes.json. Alle Bohrungen werden übernommen, auch außerhalb der Kreisgrenze gelegener.
require 'net/http'
require 'uri'
require 'json'

ROOT = File.expand_path('..', __dir__)
KREIS = ARGV[0] || 'oberhavel'
bb = JSON.parse(File.read(File.join(ROOT, 'data', KREIS, 'grenze.geojson')))['geometry']['coordinates'][0]
S = bb.map { |p| p[1] }.min; N = bb.map { |p| p[1] }.max
W = bb.map { |p| p[0] }.min; E = bb.map { |p| p[0] }.max
WFS = 'https://inspire.brandenburg.de/services/bpk_wfs'

def get(url)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.open_timeout = 20
  http.read_timeout = 90
  3.times do |t|
    begin
      r = http.get(uri.request_uri)
      return r.body.dup.force_encoding('UTF-8').scrub('?') if r.code == '200'
    rescue StandardError => e
      warn "  Versuch #{t + 1}: #{e.class}"
    end
    sleep 2
  end
  nil
end

def cell(s, n, w, e, depth = 0)
  bbox = "#{s},#{w},#{n},#{e},urn:ogc:def:crs:EPSG::4326"
  url = "#{WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=bpk_m_sch&COUNT=3000" \
        "&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=#{URI.encode_www_form_component(bbox)}"
  xml = get(url)
  return [] unless xml
  members = xml.scan(%r{<app:bpk_m_sch .*?</app:bpk_m_sch>}m)
  if members.length >= 3000 && depth < 4
    ms, mw = (s + n) / 2, (w + e) / 2
    return cell(s, ms, w, mw, depth + 1) + cell(s, ms, mw, e, depth + 1) +
           cell(ms, n, w, mw, depth + 1) + cell(ms, n, mw, e, depth + 1)
  end
  members.map do |m|
    g = ->(tag) { (m[%r{<app:#{tag}>([^<]*)</app:#{tag}>}, 1] || '').strip }
    pos = (m[%r{<gml:pos>([^<]*)</gml:pos>}, 1] || '').split.map(&:to_f)
    next if pos.length < 2
    { id: g.('Bohrungs_ID'), name: g.('Bohrungsname'), lat: pos[0], lon: pos[1],
      depth: g.('Teufe_in_m').to_f, height: g.('HoeheNN_in_m').to_f, type: g.('Aufschlussart') }
  end.compact
end

all = {}
step_lat, step_lon = 0.05, 0.07
lat = S
while lat < N
  lon = W
  while lon < E
    cell(lat, [lat + step_lat, N].min, lon, [lon + step_lon, E].min).each { |b| all[b[:id]] = b }
    lon += step_lon
  end
  lat += step_lat
end
out = all.values.sort_by { |b| b[:id] }
File.write(File.join(ROOT, 'data', KREIS, 'boreholes.json'), JSON.generate(out))
puts "#{KREIS}: #{out.size} Bohrungen im Bereich"
