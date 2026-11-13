# Tastet die Hydrogeologische Karte 1:50 000 (HYK50, Landesamt für Bergbau, Geologie und Rohstoffe Brandenburg, WMS hgk_wms)
# auf dem Höhenraster des Landkreises ab und liest aus der Füllfarbe die Klasse ab (Legende der Karte):
#   h1 = Oberfläche (HYK50-1): 1 unbedeckter Leiter Niederungen, 2 unbedeckter Leiter Hochflächen, 3 Geringleiter sandig, 4 Geringleiter bindig,
#        5 trockene Sande auf Geringleiter, 6 Wechsel Leiter/Geringleiter (Endmoräne)
#   h2 = Gesamtmächtigkeit des bedeckten Leiters GWLK 2 (HYK50-2): 1 bis 3 m, 2 bis 10 m, 3 bis 20 m, 4 bis 30 m, 5 bis 40 m, 6 bis 50 m, 7 über 50 m
#   h3 = Schutzfunktion bezieht sich auf (HYK50-3): 1 unbedeckter GWLK 1, 2 bedeckter GWLK 1, 3 GWLK 2
# 0 = keine Angabe (Muster, Linie, Beschriftung oder außerhalb). Aufruf: ruby tools/fetch_hyk.rb <kreis-id>
require 'net/http'
require 'uri'
require 'json'
require_relative 'pngmini'

ROOT = File.expand_path('..', __dir__)
id = ARGV[0] or abort 'Aufruf: ruby tools/fetch_hyk.rb <kreis-id>'
ef = File.join(ROOT, 'data', id, 'elevation.json')
EL = if File.exist?(ef) then JSON.parse(File.read(ef))
     else s = File.read(File.join(ROOT, 'data', id, 'daten.js')); JSON.parse(s[s.index('= {') + 2..].sub(/;\s*\z/, ''))['elevation'] end
rows, cols = EL['rows'], EL['cols']
S = 3                                        # Bildpunkte je Rasterzelle und Richtung
CLASSES = {
  'hyk50_1' => [[153, 255, 179], [204, 255, 153], [237, 222, 130], [222, 184, 135], [255, 255, 153], [56, 168, 0]],
  'hyk50_2' => [[255, 255, 255], [230, 255, 255], [191, 250, 255], [153, 237, 255], [51, 222, 255], [25, 204, 255], [0, 179, 242]],
  'hyk50_3' => [[153, 255, 140], [255, 255, 102], [153, 242, 255]]
}
south = EL['origin_lat'] - EL['step_lat'] / 2; north = EL['origin_lat'] + (rows - 0.5) * EL['step_lat']
west = EL['origin_lon'] - EL['step_lon'] / 2; east = EL['origin_lon'] + (cols - 0.5) * EL['step_lon']
W = cols * S; H = rows * S
out = { origin_lat: EL['origin_lat'], origin_lon: EL['origin_lon'], step_lat: EL['step_lat'], step_lon: EL['step_lon'], rows: rows, cols: cols }
CLASSES.each do |layer, pal|
  url = URI("https://inspire.brandenburg.de/services/hgk_wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=#{layer}&STYLES=&CRS=EPSG:4326" \
            "&BBOX=#{south},#{west},#{north},#{east}&WIDTH=#{W}&HEIGHT=#{H}&FORMAT=image/png&TRANSPARENT=TRUE")
  http = Net::HTTP.new(url.host, url.port); http.use_ssl = true; http.read_timeout = 180
  body = nil
  3.times { r = http.get(url.request_uri); (body = r.body; break) if r.code == '200' && r.body.start_with?("\x89PNG".b); sleep 5 }
  abort "#{layer}: kein Bild" unless body
  img = read_png(body); abort "Bildgröße #{img[:w]}x#{img[:h]}, erwartet #{W}x#{H}" unless img[:w] == W && img[:h] == H
  chars = +''
  # Zeile 0 des Rasters liegt im Süden, Bildzeile 0 im Norden
  rows.times do |r|
    cols.times do |c|
      cnt = Hash.new(0)
      S.times do |dy|
        S.times do |dx|
          y = (rows - 1 - r) * S + dy; x = c * S + dx
          p = img[:rows][y][x * img[:bpp], img[:bpp]]
          next if img[:bpp] == 4 && p[3] < 128
          best = nil; bd = 9999
          pal.each_with_index { |q, i| d = (p[0] - q[0]).abs + (p[1] - q[1]).abs + (p[2] - q[2]).abs; (bd = d; best = i + 1) if d < bd }
          cnt[best] += 1 if bd <= 24
        end
      end
      top = cnt.max_by { |_, n| n }
      chars << (top && top[1] >= 3 ? top[0].to_s : '0')
    end
  end
  out[layer.sub('hyk50_', 'h')] = chars
  puts "#{layer}: #{chars.count('0')} von #{chars.size} Zellen ohne Angabe; Klassen: #{chars.chars.tally.sort.to_h}" rescue puts "#{layer} fertig"
end
File.write(File.join(ROOT, 'data', id, 'hyk.json'), JSON.generate(out))
puts "gespeichert: data/#{id}/hyk.json"
