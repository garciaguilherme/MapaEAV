import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

crop_box = (96, 120, 1016, 1080)
w = crop_box[2] - crop_box[0] # 920
h = crop_box[3] - crop_box[1] # 960

# 1. Load elevation and mask
disp_full = Image.open('brazil_displacement.png').convert('L')
disp_crop = np.array(disp_full.crop(crop_box), dtype=np.float32) / 255.0

mask_full = Image.open('brazil_mask.png').convert('L')
mask_crop_img = mask_full.crop(crop_box)
# Feather the mask slightly for smooth edge transition
mask_feathered = mask_crop_img.filter(ImageFilter.GaussianBlur(1.2))
mask_arr = np.array(mask_feathered, dtype=np.float32) / 255.0

lon_min, lon_max = -74.5312, -34.1016
lat_min, lat_max = -34.0162, 5.9658

xs = np.linspace(lon_min, lon_max, w)
ys = np.linspace(lat_max, lat_min, h)
lons, lats = np.meshgrid(xs, ys)

print(f"Generating organic vintage geological texture: {w}x{h}...")

# Compute gradients and curvature for drainage valley highlighting
gy, gx = np.gradient(disp_crop)
slope = np.sqrt(gx**2 + gy**2)
gyy, gyx = np.gradient(gy)
gxy, gxx = np.gradient(gx)
laplacian = gxx + gyy
valleys = np.clip(laplacian * 45.0, 0, 1.0)

# Build Organic Geological Palette based on John Casper Branner 1919 Mappa Geologico do Brazil
# Color definitions (RGB floats)
C_AMAZON = np.array([218, 172, 68], dtype=np.float32)     # Golden ochre / mustard
C_AMAZON_RIVER = np.array([244, 218, 145], dtype=np.float32) # Sand river valley
C_PARANA = np.array([32, 68, 36], dtype=np.float32)        # Deep moss / basalt green
C_MANTIQUEIRA = np.array([126, 44, 18], dtype=np.float32)  # Burnt terracotta / copper
C_CRATON = np.array([84, 26, 12], dtype=np.float32)        # Deep raw umber / Archean rock
C_CREST = np.array([228, 218, 200], dtype=np.float32)      # Chalky limestone summit
C_CERRADO = np.array([184, 142, 92], dtype=np.float32)     # Sandy ochre clay
C_CAATINGA = np.array([195, 132, 82], dtype=np.float32)    # Terracotta sandstone
C_PANTANAL = np.array([76, 96, 58], dtype=np.float32)      # Olive wetland

# 1. Paraná Basin weight: smooth Gaussian centered around (-52, -25)
parana_dist = ((lons - -52.0) / 4.8)**2 + ((lats - -25.0) / 6.2)**2
w_parana = np.clip(np.exp(-parana_dist * 1.5) * 1.2, 0, 1.0) * (1.0 - np.clip((disp_crop - 0.45) * 4.0, 0, 1.0))

# 2. Amazon weight: low elevation, north and west
amazon_factor = np.clip((lats - -13.0) / 6.0, 0, 1.0) * np.clip((-46.0 - lons) / 8.0, 0, 1.0)
w_amazon = amazon_factor * np.clip((0.45 - disp_crop) / 0.35, 0, 1.0)

# 3. Pantanal weight:
pantanal_dist = ((lons - -56.8) / 2.2)**2 + ((lats - -18.2) / 2.8)**2
w_pantanal = np.clip(np.exp(-pantanal_dist * 2.5), 0, 1.0) * np.clip((0.2 - disp_crop) * 5.0, 0, 1.0)

# 4. Coastal Shield / Mountain Crags weight:
# High elevation in southeast & eastern Brazil (Minas, SP, RJ, Bahia, ES, PR)
is_east = np.clip((lons - -50.0) / 6.0, 0, 1.0)
is_south_east = np.clip((lats - -12.0) / -6.0, 0, 1.0) * np.clip((-28.0 - lats) / -5.0, 0, 1.0)
w_mountain = is_east * is_south_east * np.clip((disp_crop - 0.28) / 0.4, 0, 1.0)

# 5. Northeast Caatinga weight:
w_ne = np.clip((lons - -45.0) / 5.0, 0, 1.0) * np.clip((lats - -15.0) / 5.0, 0, 1.0)

rgba_map = np.zeros((h, w, 4), dtype=np.float32)

for y in range(h):
    for x in range(w):
        m = mask_arr[y, x]
        if m < 0.01:
            # Completely transparent outside Brazil!
            rgba_map[y, x] = [0, 0, 0, 0]
            continue

        elev = disp_crop[y, x]
        
        # Start with default central plateau / Cerrado color
        color = C_CERRADO.copy()

        # Blend Northeast
        ne_w = w_ne[y, x]
        if ne_w > 0:
            color = (1.0 - ne_w) * color + ne_w * C_CAATINGA

        # Blend Amazon
        amz_w = w_amazon[y, x]
        if amz_w > 0:
            amz_col = (1.0 - valleys[y, x] * 0.4) * C_AMAZON + (valleys[y, x] * 0.4) * C_AMAZON_RIVER
            color = (1.0 - amz_w) * color + amz_w * amz_col

        # Blend Pantanal
        pnt_w = w_pantanal[y, x]
        if pnt_w > 0:
            color = (1.0 - pnt_w) * color + pnt_w * C_PANTANAL

        # Blend Paraná Basin
        par_w = w_parana[y, x]
        if par_w > 0:
            color = (1.0 - par_w) * color + par_w * C_PARANA

        # Blend Mountain Crags & Craton
        mtn_w = w_mountain[y, x]
        if mtn_w > 0:
            mtn_col = (1.0 - np.clip(elev * 1.5, 0, 1.0)) * C_MANTIQUEIRA + np.clip(elev * 1.5, 0, 1.0) * C_CRATON
            color = (1.0 - mtn_w) * color + mtn_w * mtn_col

        # Elevation brightness modulation
        color = color * (0.85 + 0.35 * elev)

        # High mountain peaks get bone-white / chalky highlights
        if elev > 0.62:
            t_crest = np.clip((elev - 0.62) / 0.38, 0, 1.0)
            color = (1.0 - t_crest) * color + t_crest * C_CREST

        rgba_map[y, x] = [color[0], color[1], color[2], m * 255.0]

# Load IBGE GeoJSON and draw delicate vintage boundary lines
with open('brazil-states.json', 'r', encoding='utf-8') as f:
    geojson = json.load(f)

diff_img = Image.fromarray(np.clip(rgba_map, 0, 255).astype(np.uint8), mode='RGBA')
draw = ImageDraw.Draw(diff_img)

def coord_to_pixel(lon, lat):
    px = (lon - lon_min) / (lon_max - lon_min) * w
    py = (lat_max - lat) / (lat_max - lat_min) * h
    return px, py

for feat in geojson['features']:
    geom = feat['geometry']
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    for rings in polys:
        outer = rings[0]
        pts = [coord_to_pixel(lon, lat) for lon, lat in outer]
        draw.line(pts, fill=(50, 36, 24, 180), width=1)

diff_img.save('brazil_relief_texture.png')
print("Successfully saved brazil_relief_texture.png with RGBA transparency!")

# 2. Re-create Base Parchment Sheet with clean borders
sheet_w = 1400
sheet_h = 1200
sheet = Image.new('RGB', (sheet_w, sheet_h), (243, 237, 226))

np.random.seed(42)
noise = np.random.normal(0, 3.0, (sheet_h, sheet_w, 3))
sheet_arr = np.clip(np.array(sheet, dtype=np.float32) + noise, 0, 255).astype(np.uint8)
sheet = Image.fromarray(sheet_arr)
draw_sheet = ImageDraw.Draw(sheet)

# Faint vintage graticule lines
grid_color = (212, 202, 188)
text_color = (135, 120, 105)

for lon_val in range(-75, -30, 5):
    px = (lon_val - lon_min) / (lon_max - lon_min) * w + (sheet_w - w) // 2
    draw_sheet.line([(px, 25), (px, sheet_h - 25)], fill=grid_color, width=1)
    draw_sheet.text((px + 4, 30), f"{abs(lon_val)}°W", fill=text_color)
    draw_sheet.text((px + 4, sheet_h - 45), f"{abs(lon_val)}°W", fill=text_color)

for lat_val in range(-35, 10, 5):
    py = (lat_max - lat_val) / (lat_max - lat_min) * h + (sheet_h - h) // 2
    draw_sheet.line([(25, py), (sheet_w - 25, py)], fill=grid_color, width=1)
    hemi = "N" if lat_val > 0 else ("S" if lat_val < 0 else "Eq.")
    lbl = f"{abs(lat_val)}°{hemi}" if lat_val != 0 else "Equador"
    draw_sheet.text((30, py - 14), lbl, fill=text_color)
    draw_sheet.text((sheet_w - 70, py - 14), lbl, fill=text_color)

# Neatline borders
draw_sheet.rectangle([(18, 18), (sheet_w - 18, sheet_h - 18)], outline=(145, 125, 105), width=2)
draw_sheet.rectangle([(22, 22), (sheet_w - 22, sheet_h - 22)], outline=(195, 180, 160), width=1)

# Title in Atlantic Ocean
title_x = sheet_w - 380
title_y = 55
draw_sheet.rectangle([(title_x - 15, title_y - 10), (title_x + 350, title_y + 195)], fill=(245, 239, 229), outline=(175, 155, 135), width=1)
draw_sheet.rectangle([(title_x - 12, title_y - 7), (title_x + 347, title_y + 192)], outline=(215, 200, 180), width=1)

draw_sheet.text((title_x + 35, title_y + 8), "MAPPA GEOLOGICO", fill=(45, 35, 25))
draw_sheet.text((title_x + 115, title_y + 30), "DO", fill=(75, 60, 45))
draw_sheet.text((title_x + 65, title_y + 50), "B R A Z I L", fill=(30, 20, 10))
draw_sheet.text((title_x + 50, title_y + 85), "ORGANISADO POR", fill=(85, 70, 55))
draw_sheet.text((title_x + 28, title_y + 105), "JOHN CASPER BRANNER", fill=(45, 35, 25))
draw_sheet.text((title_x + 115, title_y + 130), "1919", fill=(75, 60, 45))
draw_sheet.text((title_x + 30, title_y + 160), "ESCALA 1 : 5.000.000", fill=(105, 90, 75))

# Legend
leg_x = sheet_w - 360
leg_y = 275
draw_sheet.text((leg_x, leg_y), "LEGENDA ESTRATIGRÁFICA", fill=(55, 45, 35))

legends = [
    ((218, 172, 68), "Terciário & Quaternário (Bacia Amazônica)"),
    ((195, 132, 82), "Cretáceo & Jurássico (Bacias Sedimentares)"),
    ((32, 68, 36),   "Trapp Basáltico / Serra Geral (Bacia do Paraná)"),
    ((184, 142, 92), "Paleozoico (Bacia do Parnaíba / São Francisco)"),
    ((126, 44, 18),  "Pré-Cambriano / Cristalino (Escudo Brasileiro)"),
    ((84, 26, 12),   "Arqueano (Serras da Mantiqueira & Espinhaço)"),
    ((228, 218, 200),"Cumes e Picos Mais Altos (> 1.800m)")
]

for i, (col, text) in enumerate(legends):
    cy = leg_y + 28 + i * 24
    draw_sheet.rectangle([(leg_x, cy), (leg_x + 22, cy + 14)], fill=col, outline=(70, 55, 40))
    draw_sheet.text((leg_x + 32, cy - 1), text, fill=(65, 52, 40))

# Blend surrounding South American relief
cw = crop_box[2] - crop_box[0]
ch = crop_box[3] - crop_box[1]
pad_x = (sheet_w - cw) // 2
pad_y = (sheet_h - ch) // 2
sheet_crop_box = (crop_box[0] - pad_x, crop_box[1] - pad_y, crop_box[2] + pad_x, crop_box[3] + pad_y)

disp_sheet = disp_full.crop(sheet_crop_box).resize((sheet_w, sheet_h), Image.Resampling.BILINEAR)
mask_sheet = mask_full.crop(sheet_crop_box).resize((sheet_w, sheet_h), Image.Resampling.BILINEAR)

disp_sheet_arr = np.array(disp_sheet, dtype=np.float32) / 255.0
mask_sheet_arr = np.array(mask_sheet) > 100

gy_s, gx_s = np.gradient(disp_sheet_arr)
hillshade_s = np.clip((-gx_s * 0.7 - gy_s * 0.7) * 4.0 + 0.5, 0, 1.0)

sheet_arr = np.array(sheet, dtype=np.float32)
for c in range(3):
    base_ch = sheet_arr[:, :, c]
    non_brazil_land = (disp_sheet_arr > 0.02) & (~mask_sheet_arr)
    shade_mod = (hillshade_s - 0.5) * 40.0
    base_ch[non_brazil_land] = np.clip(base_ch[non_brazil_land] + shade_mod[non_brazil_land], 175, 245)
    sheet_arr[:, :, c] = base_ch

final_sheet = Image.fromarray(sheet_arr.astype(np.uint8))
final_sheet.save('brazil_paper_sheet.jpg', quality=93, optimize=True)
print("Saved updated brazil_paper_sheet.jpg with surrounding relief!")
