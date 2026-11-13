# Baut aus dem Grundwassermessnetz des Landes (LfU/LGB Brandenburg, gwd_2020.zip, Datenlizenz Deutschland Namensnennung 2.0)
# die Datei data/messstellen.js: Grundwasser-Messstellen mit Wasserstand (Frühjahr/Herbst 2020), Geländehöhe und Filterlage.
# Zusätzlich (optional 3. Argument: Ordner mit entpackten gwd_<Jahr>.zip): Schwankungsbreite des Wasserstands über alle Jahre (Mittel-, Frühjahrs- und Herbststände 1999 bis 2020).
# Aufruf: ruby tools/build_messstellen.rb <Ordner mit GWM_2020F.* und GWM_2020H.*> <Ausgabedatei> [Ordner mit x_gwd_*]
require 'json'
Encoding.default_external = Encoding::UTF_8
dir, out = ARGV[0], ARGV[1]
abort 'Aufruf: ruby tools/build_messstellen.rb <shp-Ordner> <Ausgabe.js>' unless dir && out

def utm33_to_ll(e, n)            # ETRS89 / UTM 33N -> Grad (GRS80 ~ WGS84)
  a = 6378137.0; f = 1 / 298.257222101; k0 = 0.9996
  e2 = f * (2 - f); ep2 = e2 / (1 - e2)
  x = e - 500000.0; m = n / k0
  mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
  e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  phi1 = mu + (3 * e1 / 2 - 27 * e1**3 / 32) * Math.sin(2 * mu) + (21 * e1**2 / 16 - 55 * e1**4 / 32) * Math.sin(4 * mu) +
         (151 * e1**3 / 96) * Math.sin(6 * mu) + (1097 * e1**4 / 512) * Math.sin(8 * mu)
  s = Math.sin(phi1); c = Math.cos(phi1); t = Math.tan(phi1)
  nn = a / Math.sqrt(1 - e2 * s * s); t2 = t * t; c1 = ep2 * c * c
  r = a * (1 - e2) / (1 - e2 * s * s)**1.5; d = x / (nn * k0)
  lat = phi1 - (nn * t / r) * (d**2 / 2 - (5 + 3 * t2 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24 +
        (61 + 90 * t2 + 298 * c1 + 45 * t2**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
  lon0 = 15 * Math::PI / 180
  lon = lon0 + (d - (1 + 2 * t2 + c1) * d**3 / 6 + (5 - 2 * c1 + 28 * t2 - 3 * c1**2 + 8 * ep2 + 24 * t2**2) * d**5 / 120) / c
  [lat * 180 / Math::PI, lon * 180 / Math::PI]
end

def read_dbf(f)
  d = File.binread(f)
  n = d[4, 4].unpack1('V'); hl = d[8, 2].unpack1('v'); rl = d[10, 2].unpack1('v')
  fields = []; o = 32
  while d.getbyte(o) != 0x0D
    fields << [d[o, 11].delete("\0"), d.getbyte(o + 16)]; o += 32
  end
  (0...n).map do |i|
    r = d.byteslice(hl + i * rl + 1, rl - 1); p0 = 0
    fields.map { |nm, len| v = r.byteslice(p0, len).force_encoding('UTF-8').scrub('?').strip; p0 += len; [nm, v] }.to_h
  end
end

def read_points(f)
  d = File.binread(f); o = 100; pts = []
  while o < d.size
    len = d[o + 4, 4].unpack1('N') * 2
    pts << d[o + 12, 16].unpack('E2')
    o += 8 + len
  end
  pts
end

def num(v)
  x = v.to_f
  x <= -8000 ? nil : x
end

h = {}
%w[F H].each do |z|
  recs = read_dbf(File.join(dir, "GWM_2020#{z}.dbf")); pts = read_points(File.join(dir, "GWM_2020#{z}.shp"))
  recs.each_with_index { |r, i| (h[r['MKZ']] ||= { pt: pts[i], r: r })[z] = r }
end
HIST = Hash.new { |hh, k| hh[k] = [] }
if ARGV[2]
  Dir[File.join(ARGV[2], 'x_gwd_*', '*', 'shp', 'GWM_*.dbf')].sort.each do |f|
    base = f.sub(/\.dbf\z/, ''); yr = File.basename(f)[/GWM_(\d{4})/, 1].to_i
    read_dbf(f).each { |r| next if r['OW_PEGEL'] == 'ja'; w = num(r['WST_NHN']); HIST[r['MKZ']] << [yr, w] if w }
  end
end
rows = []
h.each do |mkz, v|
  r = v[:r]
  next if r['OW_PEGEL'] == 'ja'                        # Oberflächenwasser-Pegel auslassen
  gok = num(r['GOK_NHN']); wf = v['F'] && num(v['F']['WST_NHN']); wh = v['H'] && num(v['H']['WST_NHN'])
  next unless gok && (wf || wh)
  lat, lon = utm33_to_ll(*v[:pt])
  rows << [lat.round(5), lon.round(5), r['BEZEICHN'], mkz, wf && wf.round(2), wh && wh.round(2), gok.round(2),
           num(r['FOK_GOK']) && num(r['FOK_GOK']).round(1), num(r['FUK_GOK']) && num(r['FUK_GOK']).round(1), r['HGWL'] == 'ja' ? 1 : 0, r['GWM_NETZ'],
           (HIST[mkz].size >= 3 ? HIST[mkz].map { |_, w| w }.min.round(2) : nil), (HIST[mkz].size >= 3 ? HIST[mkz].map { |_, w| w }.max.round(2) : nil), HIST[mkz].size, (HIST[mkz].empty? ? nil : HIST[mkz].map { |y, _| y }.min)]
end
File.write(out, "window.GW_MESS = #{JSON.generate(rows)};\n")
puts "#{rows.size} Grundwasser-Messstellen (von #{h.size}), #{File.size(out) / 1024} KB; mit Filterlage: #{rows.count { |x| x[7] && x[8] }}"
puts rows.first(2).inspect
