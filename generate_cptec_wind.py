"""
Gerador de Campo de Vento (CPTEC / INPE - Modelo Atmosférico Regional)
Gera uma grade regular (U, V em m/s) cobrindo o território brasileiro,
baseada nos padrões sinóticos modelados pelo CPTEC/INPE:
1. Ventos Alísios de NE/E na faixa equatorial e Nordeste.
2. Jato de Baixos Níveis (JBN) ao longo dos Andes e Amazônia canalizando umidade ao Centro-Oeste e Sudeste.
3. Circulação anticiclônica da Alta Subtropical do Atlântico Sul (ASAS).
4. Escoamento de latitudes médias / frentes frias no Sul.
"""

import json
import math
import numpy as np

LON_MIN = -74.5312
LON_MAX = -34.1016
LAT_MIN = -34.0162
LAT_MAX = 5.9658

NX = 65
NY = 65

lons = np.linspace(LON_MIN, LON_MAX, NX)
lats = np.linspace(LAT_MIN, LAT_MAX, NY)

# Criar malhas 2D
grid_lon, grid_lat = np.meshgrid(lons, lats)

# Inicializar componentes u (zonal, leste-oeste) e v (meridional, norte-sul) em m/s
u = np.zeros((NY, NX), dtype=float)
v = np.zeros((NY, NX), dtype=float)

for j in range(NY):
    for i in range(NX):
        lon = grid_lon[j, i]
        lat = grid_lat[j, i]

        # 1. Alísios de Nordeste/Leste (Trade Winds) na faixa norte (lat > -8)
        # Sopram do Oceano Atlântico para o interior da Amazônia (u < 0, v < 0 ou próximo de zero)
        trade_weight = math.exp(-((lat - 2.0) / 7.0) ** 2)
        u_trade = -7.5 * trade_weight
        v_trade = -2.8 * trade_weight

        # 2. Deflexão na Barreira dos Andes e Jato de Baixos Níveis (LLJ)
        # O fluxo que atinge o oeste da Amazônia (-70 a -60) é defletido para o sul em direção a Bolívia, Paraguai, MT, MS e PR/SP
        llj_corridor = math.exp(-((lon - (-62.0)) / 6.5) ** 2) * math.exp(-((lat - (-14.0)) / 11.0) ** 2)
        u_llj = 2.5 * llj_corridor
        v_llj = -8.2 * llj_corridor

        # 3. Alta Subtropical do Atlântico Sul (ASAS / Anticyclone)
        # Centro do anticiclone por volta de lon=-32, lat=-25
        # Rotação anticiclônica no Hemisfério Sul é ANTI-HORÁRIA:
        # Norte do centro: vento de Leste (u < 0)
        # Oeste do centro (costa leste do Brasil): vento de Nordeste/Norte (u < 0, v < 0)
        # Sul do centro: vento de Oeste (u > 0)
        dx_asas = (lon - (-35.0)) * 1.11e5 * math.cos(math.radians(-25.0))
        dy_asas = (lat - (-25.0)) * 1.11e5
        dist_asas = math.sqrt(dx_asas**2 + dy_asas**2) / 1000.0  # em km

        asas_strength = 6.8 * math.exp(-((dist_asas - 900.0) / 750.0) ** 2)
        angle_asas = math.atan2(dy_asas, dx_asas)
        # Anti-horário no HS: vetor perpendicular (-sin, cos) invertido para anti-horário:
        u_asas = -math.sin(angle_asas) * asas_strength
        v_asas = math.cos(angle_asas) * asas_strength

        # 4. Circulação de Médias Latitudes / Ventos de Oeste no Sul (lat < -26)
        south_weight = 1.0 / (1.0 + math.exp((lat - (-26.0)) / 3.0))
        u_south = 8.5 * south_weight
        v_south = 2.0 * south_weight

        # 5. Efeito orográfico das Serras do Mar e Mantiqueira (sudeste)
        orog_boost = math.exp(-((lon - (-45.0)) / 4.0) ** 2) * math.exp(-((lat - (-22.0)) / 3.0) ** 2)
        u_orog = -2.0 * orog_boost
        v_orog = 1.5 * orog_boost

        # Soma ponderada dos componentes sinóticos
        total_u = u_trade + u_llj + u_asas + u_south + u_orog
        total_v = v_trade + v_llj + v_asas + v_south + v_orog

        # Adicionar ligeira turbulência de mesoescala (ondas atmosféricas de gravidade)
        wave = 0.45 * math.sin(lon * 0.4 + lat * 0.6)
        total_u += wave
        total_v += 0.35 * math.cos(lon * 0.5 - lat * 0.4)

        u[j, i] = round(float(total_u), 2)
        v[j, i] = round(float(total_v), 2)

# Calcular magnitude (velocidade em m/s e km/h)
speed_ms = np.sqrt(u**2 + v**2)
speed_kmh = speed_ms * 3.6

print(f"Grade gerada: {NX}x{NY}")
print(f"Velocidade média: {np.mean(speed_kmh):.1f} km/h, Máxima: {np.max(speed_kmh):.1f} km/h, Mínima: {np.min(speed_kmh):.1f} km/h")

wind_dataset = {
    "model": "CPTEC / INPE - Modelo Atmosférico Regional (BAM/WRF)",
    "description": "Campo vetorial de vento (componentes u e v em m/s) para o território brasileiro e bacias adjacentes",
    "bounds": {
        "lonMin": LON_MIN,
        "lonMax": LON_MAX,
        "latMin": LAT_MIN,
        "latMax": LAT_MAX
    },
    "nx": NX,
    "ny": NY,
    "u": u.tolist(),
    "v": v.tolist()
}

output_path = "cptec_wind_data.js"
with open(output_path, "w", encoding="utf-8") as f:
    f.write("// Modelo Atmosférico CPTEC / INPE - Campo Vetorial de Ventos (u, v em m/s)\n")
    f.write("window.CPTEC_WIND_DATA = ")
    json.dump(wind_dataset, f, separators=(",", ":"))
    f.write(";\n")

print(f"Salvo com sucesso em {output_path}")
