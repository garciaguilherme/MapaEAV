/**
 * MAPA DO BRASIL 3D - RELEVO TOPOGRÁFICO & ALTIMETRIA
 * Dados de elevação digital NASA SRTM integrados à malha geográfica oficial do IBGE.
 */

(function () {
  'use strict';

  // --- Configuration ---
  const CONFIG = {
    centerLon: -54.39,
    centerLat: -14.24,
    scale: 1.25,
    geoBounds: {
      lonMin: -74.5312,
      lonMax: -34.1016,
      latMin: -34.0162,
      latMax: 5.9658
    },
    planeWidth: 48.98,
    planeHeight: 49.98,
    planeCenter: { x: 0.09, y: 0.27 },
    sheetWidth: 74.5,
    sheetHeight: 62.5,
    defaultReliefExaggeration: 3.2,
    defaultAzimuth: 106, // Ângulo de luz: 106° (Leste)
    defaultElevation: 5,  // Modo escuro inicial: Altura do sol 5° (Rasante)
    defaultSunIntensity: 0.8 // Intensidade solar: 0.8
  };

  const NOTABLE_PEAKS = [
    { name: 'Pico da Neblina', alt: '2.995m', lon: -66.0044, lat: 0.8039, uf: 'AM' },
    { name: 'Pico da Bandeira', alt: '2.892m', lon: -41.7972, lat: -20.4347, uf: 'MG/ES' },
    { name: 'Pedra da Mina', alt: '2.798m', lon: -44.9767, lat: -22.4278, uf: 'MG/SP' },
    { name: 'Agulhas Negras', alt: '2.791m', lon: -44.6669, lat: -22.3814, uf: 'RJ/MG' },
    { name: 'Monte Roraima', alt: '2.734m', lon: -60.4389, lat: 5.1433, uf: 'RR' },
    { name: 'Pico do Barbado', alt: '2.033m', lon: -41.9056, lat: -13.2922, uf: 'BA' },
    { name: 'Pouso Alto (Veadeiros)', alt: '1.676m', lon: -47.5333, lat: -14.0333, uf: 'GO' }
  ];

  const THEMES = {
    vintage: {
      name: 'Relevo Topográfico (NASA / IBGE)',
      baseColor: 0xd4af37,
      edgeColor: 0x4a3622,
      hoverEmissive: 0xcda851,
      hoverEdgeColor: 0xffffff,
      bg: 0x15100c,
      gridColor: 0xcda851,
      badgeBorder: '#cda851',
      sunColor: 0xffeed4,
      ambientColor: 0x4a3e32,
      ambientIntensity: 0.95
    },
    neon: {
      name: 'Cyber Neon',
      baseColor: 0x0f172a,
      edgeColor: 0x00f3ff,
      hoverEmissive: 0x38bdf8,
      hoverEdgeColor: 0xffffff,
      bg: 0x030508,
      gridColor: 0x00f3ff,
      badgeBorder: '#00f3ff',
      sunColor: 0xfff7ed,
      ambientColor: 0x0f172a,
      ambientIntensity: 0.55
    },
    regions: {
      name: 'Regiões IBGE',
      regionColors: {
        'Norte': 0x10b981,
        'Nordeste': 0xf97316,
        'Centro-Oeste': 0xeab308,
        'Sudeste': 0x06b6d4,
        'Sul': 0x8b5cf6
      },
      edgeColor: 0xffffff,
      hoverEmissive: 0xffffff,
      hoverEdgeColor: 0x00f3ff,
      bg: 0x05070c,
      gridColor: 0x38bdf8,
      badgeBorder: '#ffffff',
      sunColor: 0xffedd5,
      ambientColor: 0x1a2436,
      ambientIntensity: 0.65
    },
    gold: {
      name: 'Obsidiana & Ouro',
      baseColor: 0x18181b,
      edgeColor: 0xfbbf24,
      hoverEmissive: 0xd97706,
      hoverEdgeColor: 0xfffbeb,
      bg: 0x050505,
      gridColor: 0xfbbf24,
      badgeBorder: '#fbbf24',
      sunColor: 0xfef08a,
      ambientColor: 0x241d14,
      ambientIntensity: 0.7
    }
  };

  let renderMode = 'relief';
  let currentThemeKey = 'vintage';
  let reliefExaggeration = CONFIG.defaultReliefExaggeration;
  let sunAzimuth = CONFIG.defaultAzimuth;
  let sunElevation = CONFIG.defaultElevation;
  let sunIntensity = CONFIG.defaultSunIntensity;
  let sunOrbitActive = false;
  let autoRotate = false;
  let showLabels = false; // By default off to let the magnificent relief artwork shine cleanly
  let showPeaks = true;
  let showGrid = false; // Turned off by default in vintage mode to show paper sheet
  let soundEnabled = false;
  let activeRegionFilter = 'todas';

  // Three.js instances
  let scene, camera, renderer, controls;
  let brazilContainer; // master group
  let reliefMesh = null;
  let paperSheetMesh = null;
  let tableMesh = null;
  let skyboxTexture = null;
  let skyMesh = null;
  let showSkybox = true;
  let rawElevationData = null;
  let elevImgWidth = 0, elevImgHeight = 0;
  let peaksGroup = null;
  let stateVectorGroup = null;
  let stateGroups = [];
  let gridGroup, starsGroup;
  let sunLight, sunTarget, ambientLight;
  let raycaster, mousePos;
  let hoveredState = null;
  let selectedState = null;

  // Animation & Camera Tween
  let cameraTargetPos = null;
  let controlsTargetPos = null;
  let targetRotationZ = null;

  // Audio Context
  let audioCtx = null;

  // DOM Elements
  const containerEl = document.getElementById('canvas-container');
  const tooltipEl = document.getElementById('hover-tooltip');
  const tooltipSigla = document.getElementById('tooltip-sigla-val');
  const tooltipRegiao = document.getElementById('tooltip-regiao-val');
  const tooltipNome = document.getElementById('tooltip-nome-val');
  const tooltipElevation = document.getElementById('tooltip-elevation-val');

  const drawerEl = document.getElementById('detail-drawer');
  const drawerSigla = document.getElementById('drawer-sigla');
  const drawerNome = document.getElementById('drawer-nome');
  const drawerRegiao = document.getElementById('drawer-regiao');
  const drawerCapital = document.getElementById('drawer-capital');
  const drawerCodibge = document.getElementById('drawer-codibge');
  const drawerPopulacao = document.getElementById('drawer-populacao');
  const drawerArea = document.getElementById('drawer-area');
  const drawerFact = document.getElementById('drawer-fact');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');

  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  const apiStatusText = document.getElementById('api-status-text');
  const apiStatusDot = document.getElementById('api-status-dot');

  const modeReliefBtn = document.getElementById('mode-relief');
  const modePolygonsBtn = document.getElementById('mode-polygons');
  const sectionReliefControls = document.getElementById('section-relief-controls');
  const sliderRelief = document.getElementById('slider-relief');
  const reliefVal = document.getElementById('relief-val');

  const sliderAzimuth = document.getElementById('slider-azimuth');
  const azimuthVal = document.getElementById('azimuth-val');
  const sliderElevation = document.getElementById('slider-elevation');
  const elevationVal = document.getElementById('elevation-val');
  const sliderLight = document.getElementById('slider-light');
  const lightVal = document.getElementById('light-val');
  const toggleSunOrbit = document.getElementById('toggle-sunorbit');

  const toggleAutoRotate = document.getElementById('toggle-autorotate');
  const toggleLabels = document.getElementById('toggle-labels');
  const togglePeaks = document.getElementById('toggle-peaks');
  const toggleGrid = document.getElementById('toggle-grid');
  const toggleSkybox = document.getElementById('toggle-skybox');
  const selectState = document.getElementById('select-state');
  const btnReloadApi = document.getElementById('btn-reload-api');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnSound = document.getElementById('btn-sound');
  const iconSoundOff = document.getElementById('icon-sound-off');
  const iconSoundOn = document.getElementById('icon-sound-on');

  const compassHud = document.getElementById('compass-hud');
  const compassNeedle = document.getElementById('compass-needle');

  const btnViewPerspective = document.getElementById('view-perspective');
  const btnViewTopdown = document.getElementById('view-topdown');
  const btnViewCinematic = document.getElementById('view-cinematic');

  // Hamburger Menu & Control Dock Elements
  const btnHamburger = document.getElementById('btn-hamburger');
  const btnCloseDock = document.getElementById('btn-close-dock');
  const controlDock = document.getElementById('control-dock');

  // Wind Flow (CPTEC / INPE) Controls & State
  const btnNavWind = document.getElementById('btn-nav-wind');
  const toggleWind = document.getElementById('toggle-wind');
  const sliderWindSpeed = document.getElementById('slider-wind-speed');
  const windSpeedVal = document.getElementById('wind-speed-val');
  const sliderWindDensity = document.getElementById('slider-wind-density');
  const windDensityVal = document.getElementById('wind-density-val');

  let windGroup = null;
  let windLinesMesh = null;
  let windPointsMesh = null;
  let showWind = true;
  let windSpeedMultiplier = 1.0;
  let windParticleCount = 1600;
  let windParticles = [];

  // --- Audio Synth Feedback ---
  function playSynthTone(freq, type = 'sine', duration = 0.08) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  // --- Projection helper (Exact Web Mercator matching displacement raster) ---
  const Y_MAX_MERC = Math.log(Math.tan(Math.PI / 4.0 + (CONFIG.geoBounds.latMax * Math.PI / 180.0) / 2.0));
  const Y_MIN_MERC = Math.log(Math.tan(Math.PI / 4.0 + (CONFIG.geoBounds.latMin * Math.PI / 180.0) / 2.0));

  function projectCoord(lon, lat) {
    const gb = CONFIG.geoBounds;
    const u = (lon - gb.lonMin) / (gb.lonMax - gb.lonMin);
    const latRad = lat * (Math.PI / 180.0);
    const yMerc = Math.log(Math.tan(Math.PI / 4.0 + latRad / 2.0));
    const v = (yMerc - Y_MIN_MERC) / (Y_MAX_MERC - Y_MIN_MERC);

    const x = (u - 0.5) * CONFIG.planeWidth + CONFIG.planeCenter.x;
    const y = (v - 0.5) * CONFIG.planeHeight + CONFIG.planeCenter.y;
    return { x, y };
  }

  function unprojectCoord(x, y) {
    const gb = CONFIG.geoBounds;
    const u = (x - CONFIG.planeCenter.x) / CONFIG.planeWidth + 0.5;
    const v = (y - CONFIG.planeCenter.y) / CONFIG.planeHeight + 0.5;
    const lon = u * (gb.lonMax - gb.lonMin) + gb.lonMin;
    const yMerc = v * (Y_MAX_MERC - Y_MIN_MERC) + Y_MIN_MERC;
    const latRad = 2.0 * Math.atan(Math.exp(yMerc)) - Math.PI / 2.0;
    const lat = latRad * (180.0 / Math.PI);
    return { lon, lat };
  }

  // --- Init Three.js Scene ---
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(THEMES[currentThemeKey].bg);
    scene.fog = null;

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    // Camera positioned back so the entire map sheet fits comfortably in frame
    camera.position.set(0, 56, 52);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerEl.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // Rotação máxima da câmera limitada para não ultrapassar a lateral da mesa
    controls.maxPolarAngle = Math.PI / 2.7; // ~66.7° (evita que a câmera passe da borda ou olhe sob a mesa)
    controls.minPolarAngle = 0.05;
    // Zoom out máximo ampliado confortavelmente mantendo a câmera delimitada à mesa
    controls.minDistance = 16;
    controls.maxDistance = 120;
    controls.target.set(0, 0, 0);

    raycaster = new THREE.Raycaster();
    mousePos = new THREE.Vector2(-999, -999);

    setupLighting();
    setupEnvironment();

    brazilContainer = new THREE.Group();
    // Rotate -90° on X: local XY is horizontal, +Z is up in the sky
    brazilContainer.rotation.x = -Math.PI / 2;
    scene.add(brazilContainer);

    stateVectorGroup = new THREE.Group();
    stateVectorGroup.visible = false;
    brazilContainer.add(stateVectorGroup);

    peaksGroup = new THREE.Group();
    brazilContainer.add(peaksGroup);

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

    setupUIEventListeners();
  }

  // --- Studio Lateral Lighting Setup ---
  function setupLighting() {
    ambientLight = new THREE.AmbientLight(
      THEMES[currentThemeKey].ambientColor || 0x4a3e32,
      THEMES[currentThemeKey].ambientIntensity || 0.95
    );
    scene.add(ambientLight);

    // Warm Directional Sunlight
    sunLight = new THREE.DirectionalLight(THEMES[currentThemeKey].sunColor, CONFIG.defaultSunIntensity);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 180;
    const d = 55;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.04;

    sunTarget = new THREE.Object3D();
    sunTarget.position.set(CONFIG.planeCenter.x, 0, -CONFIG.planeCenter.y);
    scene.add(sunTarget);
    sunLight.target = sunTarget;
    scene.add(sunLight);

    // Soft gallery rim fill from opposite horizon
    const rimLight = new THREE.DirectionalLight(0x383024, 0.4);
    rimLight.position.set(0, 15, -45);
    scene.add(rimLight);

    updateLateralLightPosition();
  }

  function updateLateralLightPosition() {
    const azRad = sunAzimuth * (Math.PI / 180);
    const elRad = sunElevation * (Math.PI / 180);

    const dist = 75;
    const x = dist * Math.cos(elRad) * Math.sin(azRad);
    const y = dist * Math.sin(elRad);
    const z = dist * Math.cos(elRad) * Math.cos(azRad);

    sunLight.position.set(x, y, z);
    sunLight.intensity = sunIntensity;
    sunLight.color.set(THEMES[currentThemeKey].sunColor || 0xffeed4);

    if (ambientLight) {
      ambientLight.color.set(THEMES[currentThemeKey].ambientColor || 0x4a3e32);
      ambientLight.intensity = THEMES[currentThemeKey].ambientIntensity || 0.95;
    }
  }

  let lightTween = null;
  let currentSolarMode = 'escuro';

  function syncLightSliders() {
    if (sliderElevation) {
      sliderElevation.value = Math.round(sunElevation);
      elevationVal.textContent = `${Math.round(sunElevation)}° (${sunElevation < 28 ? 'Rasante' : 'Alto'})`;
    }
    if (sliderAzimuth) {
      sliderAzimuth.value = Math.round(sunAzimuth);
      azimuthVal.textContent = `${Math.round(sunAzimuth)}° (L (Leste))`;
    }
    if (sliderLight) {
      sliderLight.value = sunIntensity.toFixed(1);
      lightVal.textContent = sunIntensity.toFixed(1);
    }
  }

  function setSolarThemeMode(mode, animate = true) {
    currentSolarMode = mode;
    const targetIntensity = 0.8;
    const targetAzimuth = 106;
    // Modo claro: Altura 65. Modo escuro: Altura 5.
    const targetElevation = (mode === 'claro' ? 65 : 5);

    // Atualizar botões na top-nav e na dock
    const btnClaro = document.getElementById('btn-mode-claro');
    const btnEscuro = document.getElementById('btn-mode-escuro');
    const dockBtnClaro = document.getElementById('dock-btn-claro');
    const dockBtnEscuro = document.getElementById('dock-btn-escuro');

    if (btnClaro) btnClaro.classList.toggle('active', mode === 'claro');
    if (btnEscuro) btnEscuro.classList.toggle('active', mode === 'escuro');
    if (dockBtnClaro) dockBtnClaro.classList.toggle('active', mode === 'claro');
    if (dockBtnEscuro) dockBtnEscuro.classList.toggle('active', mode === 'escuro');

    if (!animate) {
      sunIntensity = targetIntensity;
      sunAzimuth = targetAzimuth;
      sunElevation = targetElevation;
      syncLightSliders();
      updateLateralLightPosition();
      return;
    }

    const startIntensity = sunIntensity;
    const startAzimuth = sunAzimuth;
    const startElevation = sunElevation;
    const startTime = performance.now();
    const duration = 520; // 520ms de transição cinematográfica da luz

    lightTween = {
      update: (now) => {
        const progress = Math.min((now - startTime) / duration, 1.0);
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        sunIntensity = startIntensity + (targetIntensity - startIntensity) * ease;
        sunAzimuth = startAzimuth + (targetAzimuth - startAzimuth) * ease;
        sunElevation = startElevation + (targetElevation - startElevation) * ease;

        syncLightSliders();
        updateLateralLightPosition();

        if (progress >= 1.0) {
          lightTween = null;
        }
      }
    };

    playSynthTone(mode === 'claro' ? 620 : 420, 'sine', 0.08);
  }

  // --- Environment & Base Sheet ---
  function setupEnvironment() {
    gridGroup = new THREE.Group();
    gridGroup.visible = showGrid;

    const ringRadii = [25, 40, 55];
    ringRadii.forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.05, r + 0.05, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: THEMES[currentThemeKey].gridColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.12
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.15;
      gridGroup.add(ring);
    });

    scene.add(gridGroup);

    starsGroup = new THREE.Group();
    const starCount = 350;
    const starGeo = new THREE.BufferGeometry();
    const starCoords = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      starCoords[i] = (Math.random() - 0.5) * 200;
      starCoords[i + 1] = Math.random() * 80 + 5;
      starCoords[i + 2] = (Math.random() - 0.5) * 200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xd4af37,
      size: 0.6,
      transparent: true,
      opacity: 0.35
    });
    const stars = new THREE.Points(starGeo, starMat);
    starsGroup.add(stars);
    starsGroup.visible = false;
    scene.add(starsGroup);
  }

  // --- Build Realistic Topographic Relief Mesh & Base Paper Sheet ---
  async function loadTopographicRelief() {
    loadingText.textContent = 'Carregando Relevo Topográfico (NASA SRTM / IBGE)...';
    loadingOverlay.classList.remove('hidden');

    try {
      // 1. Sample elevation data from heightmap
      const heightImg = await loadImage('brazil_relief_height.png');
      elevImgWidth = heightImg.width;
      elevImgHeight = heightImg.height;

      const offCanvas = document.createElement('canvas');
      offCanvas.width = elevImgWidth;
      offCanvas.height = elevImgHeight;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(heightImg, 0, 0);
      rawElevationData = offCtx.getImageData(0, 0, elevImgWidth, elevImgHeight).data;

      // 2. Load textures
      const texLoader = new THREE.TextureLoader();
      const diffuseMap = await loadTextureAsync(texLoader, 'brazil_relief_texture.png?v=2');
      const normalMap = await loadTextureAsync(texLoader, 'brazil_relief_normal.png');
      const paperSheetMap = await loadTextureAsync(texLoader, 'brazil_paper_sheet.jpg?v=8');
      const paperNormalMap = await loadTextureAsync(texLoader, 'paper_normal.jpg?v=6');

      const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
      diffuseMap.generateMipmaps = true;
      diffuseMap.minFilter = THREE.LinearMipmapLinearFilter;
      diffuseMap.magFilter = THREE.LinearFilter;
      diffuseMap.anisotropy = maxAniso;

      normalMap.generateMipmaps = true;
      normalMap.minFilter = THREE.LinearMipmapLinearFilter;
      normalMap.magFilter = THREE.LinearFilter;
      normalMap.anisotropy = maxAniso;

      paperSheetMap.generateMipmaps = true;
      paperSheetMap.minFilter = THREE.LinearMipmapLinearFilter;
      paperSheetMap.magFilter = THREE.LinearFilter;
      paperSheetMap.anisotropy = maxAniso;

      paperNormalMap.generateMipmaps = true;
      paperNormalMap.minFilter = THREE.LinearMipmapLinearFilter;
      paperNormalMap.magFilter = THREE.LinearFilter;
      paperNormalMap.anisotropy = maxAniso;

      // 3. Create the Base Vintage Paper Sheet Mesh (receives drop shadow from Brazil and casts on the table!)
      const sheetGeom = new THREE.PlaneGeometry(CONFIG.sheetWidth, CONFIG.sheetHeight);
      const sheetMat = new THREE.MeshStandardMaterial({
        map: paperSheetMap,
        normalMap: paperNormalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.90,
        metalness: 0.0,
        shadowSide: THREE.DoubleSide
      });
      paperSheetMesh = new THREE.Mesh(sheetGeom, sheetMat);
      paperSheetMesh.position.set(CONFIG.planeCenter.x, CONFIG.planeCenter.y, -0.06);
      paperSheetMesh.receiveShadow = true;
      paperSheetMesh.castShadow = true;
      brazilContainer.add(paperSheetMesh);

      // 3b. Create Antique Wood Table Surface (replaces black background with an authentic wooden study desk)
      const woodTexture = await loadTextureAsync(texLoader, 'wood_table.jpg');
      const woodNormal = await loadTextureAsync(texLoader, 'wood_table_normal.jpg');

      woodTexture.wrapS = THREE.RepeatWrapping;
      woodTexture.wrapT = THREE.RepeatWrapping;
      woodTexture.repeat.set(3.2, 2.7);
      woodTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      woodNormal.wrapS = THREE.RepeatWrapping;
      woodNormal.wrapT = THREE.RepeatWrapping;
      woodNormal.repeat.set(3.2, 2.7);
      woodNormal.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const tableWidth = 200;
      const tableHeight = 170;
      const tableThickness = 4.0;
      const tableGeom = new THREE.BoxGeometry(tableWidth, tableHeight, tableThickness);
      const tableMat = new THREE.MeshStandardMaterial({
        map: woodTexture,
        normalMap: woodNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.54,
        metalness: 0.03
      });
      tableMesh = new THREE.Mesh(tableGeom, tableMat);
      // Top of table is at z = -0.14, so box center is at z = -0.14 - (tableThickness / 2) = -2.14
      tableMesh.position.set(CONFIG.planeCenter.x, CONFIG.planeCenter.y, -0.14 - (tableThickness / 2));
      tableMesh.receiveShadow = true;
      brazilContainer.add(tableMesh);

      // 3c. Load 360° Victorian Cartographer Atelier Skybox
      try {
        skyboxTexture = await loadTextureAsync(texLoader, 'skybox.jpg');
        skyboxTexture.minFilter = THREE.LinearFilter;
        skyboxTexture.magFilter = THREE.LinearFilter;

        const skyGeo = new THREE.SphereGeometry(450, 64, 40);
        const skyMat = new THREE.MeshBasicMaterial({
          map: skyboxTexture,
          side: THREE.BackSide,
          depthWrite: false
        });
        skyMesh = new THREE.Mesh(skyGeo, skyMat);
        // Elevate slightly so horizon naturally matches table height
        skyMesh.position.y = -10;
        // Rotate so grand arched windows and antique bookshelves frame the default view
        skyMesh.rotation.y = -Math.PI * 0.45;
        skyMesh.visible = showSkybox;
        scene.add(skyMesh);
      } catch (err) {
        console.warn('Falha ao carregar skybox:', err);
      }

      // 4. Create High-Density Plane Geometry (260x260 vertices for optimal performance & aesthetic detail)
      const segX = 260;
      const segY = 260;
      const geom = new THREE.PlaneGeometry(CONFIG.planeWidth, CONFIG.planeHeight, segX, segY);

      applyElevationDisplacement(geom);

      // 5. Tactile vintage paper relief material with RGBA cutout and normal map
      const material = new THREE.MeshStandardMaterial({
        map: diffuseMap,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(2.0, 2.0),
        roughness: 0.75,
        metalness: 0.02,
        transparent: true,
        alphaTest: 0.05,
        flatShading: false
      });

      reliefMesh = new THREE.Mesh(geom, material);
      reliefMesh.position.set(CONFIG.planeCenter.x, CONFIG.planeCenter.y, 0);
      reliefMesh.castShadow = true;
      reliefMesh.receiveShadow = true;
      reliefMesh.userData = { isRelief: true };

      // Ensure cast shadow perfectly matches Brazil's organic silhouette onto the paper sheet
      reliefMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: diffuseMap,
        alphaTest: 0.1
      });

      brazilContainer.add(reliefMesh);

      // 6. Build Notable Peaks 3D markers
      buildNotablePeaks();

      apiStatusText.textContent = 'Fontes';
      apiStatusDot.style.backgroundColor = '#d4af37';
    } catch (err) {
      console.error('Erro ao carregar relevo:', err);
      apiStatusText.textContent = 'Erro Relevo (Modo Vetor)';
    } finally {
      loadingOverlay.classList.add('hidden');
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function loadTextureAsync(loader, url) {
    return new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
  }

  function applyElevationDisplacement(geom) {
    if (!rawElevationData) return;
    const pos = geom.attributes.position;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const u = geom.attributes.uv.getX(i);
      const v = geom.attributes.uv.getY(i);

      const px = Math.min(Math.floor(u * elevImgWidth), elevImgWidth - 1);
      const py = Math.min(Math.floor((1 - v) * elevImgHeight), elevImgHeight - 1);

      const idx = (py * elevImgWidth + px) * 4;
      const val = rawElevationData[idx] / 255.0;

      pos.setZ(i, val * reliefExaggeration);
    }

    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }

  function updateReliefExaggeration(val) {
    reliefExaggeration = val;
    if (reliefMesh && reliefMesh.geometry) {
      applyElevationDisplacement(reliefMesh.geometry);
      buildNotablePeaks();
    }
  }

  // --- Build Notable Peaks Markers ---
  function buildNotablePeaks() {
    while (peaksGroup.children.length > 0) {
      peaksGroup.remove(peaksGroup.children[0]);
    }

    NOTABLE_PEAKS.forEach(pk => {
      const pt = projectCoord(pk.lon, pk.lat);
      const zElev = sampleElevationAtCoord(pk.lon, pk.lat) * reliefExaggeration;

      const peakObj = new THREE.Group();
      peakObj.position.set(pt.x, pt.y, zElev);

      // Antique brass summit cone
      const coneGeo = new THREE.ConeGeometry(0.28, 0.75, 8);
      coneGeo.rotateX(Math.PI);
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0xcda851,
        metalness: 0.6,
        roughness: 0.3
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.z = 0.38;
      peakObj.add(cone);

      // Vintage styled badge
      const canvas = document.createElement('canvas');
      canvas.width = 190;
      canvas.height = 68;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(20, 16, 12, 0.9)';
      ctx.beginPath();
      ctx.roundRect(4, 4, 182, 60, 8);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#cda851';
      ctx.stroke();

      ctx.fillStyle = '#f4ede2';
      ctx.font = 'bold 20px "Cinzel", "Space Grotesk", serif';
      ctx.textAlign = 'center';
      ctx.fillText(pk.name, 95, 30);

      ctx.fillStyle = '#cda851';
      ctx.font = 'bold 18px "Inter", sans-serif';
      ctx.fillText(pk.alt, 95, 52);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.4, 0.85, 1);
      sprite.position.z = 1.25;
      peakObj.add(sprite);

      peaksGroup.add(peakObj);
    });

    peaksGroup.visible = showPeaks;
  }

  function sampleElevationAtCoord(lon, lat) {
    if (!rawElevationData) return 0;
    const gb = CONFIG.geoBounds;
    const u = (lon - gb.lonMin) / (gb.lonMax - gb.lonMin);
    const latRad = lat * (Math.PI / 180.0);
    const yMerc = Math.log(Math.tan(Math.PI / 4.0 + latRad / 2.0));
    const v = (yMerc - Y_MIN_MERC) / (Y_MAX_MERC - Y_MIN_MERC);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const px = Math.min(Math.max(Math.floor(u * elevImgWidth), 0), elevImgWidth - 1);
    const py = Math.min(Math.max(Math.floor((1 - v) * elevImgHeight), 0), elevImgHeight - 1);

    const idx = (py * elevImgWidth + px) * 4;
    return rawElevationData[idx] / 255.0;
  }

  // --- Wind Flow Field Sampling & Particle Simulation (CPTEC / INPE) ---
  function sampleWindAtCoord(lon, lat) {
    if (!window.CPTEC_WIND_DATA) return { u: 0, v: 0, speed: 0 };
    const w = window.CPTEC_WIND_DATA;
    const b = w.bounds;
    const fx = ((lon - b.lonMin) / (b.lonMax - b.lonMin)) * (w.nx - 1);
    const fy = ((lat - b.latMin) / (b.latMax - b.latMin)) * (w.ny - 1);

    if (fx < 0 || fx >= w.nx - 1 || fy < 0 || fy >= w.ny - 1) {
      return { u: 0, v: 0, speed: 0 };
    }

    const x0 = Math.floor(fx);
    const x1 = Math.min(x0 + 1, w.nx - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, w.ny - 1);

    const s = fx - x0;
    const t = fy - y0;

    const u00 = w.u[y0][x0], u10 = w.u[y0][x1];
    const u01 = w.u[y1][x0], u11 = w.u[y1][x1];
    const uVal = (1 - s) * (1 - t) * u00 + s * (1 - t) * u10 + (1 - s) * t * u01 + s * t * u11;

    const v00 = w.v[y0][x0], v10 = w.v[y0][x1];
    const v01 = w.v[y1][x0], v11 = w.v[y1][x1];
    const vVal = (1 - s) * (1 - t) * v00 + s * (1 - t) * v10 + (1 - s) * t * v01 + s * t * v11;

    const speed = Math.sqrt(uVal * uVal + vVal * vVal);
    return { u: uVal, v: vVal, speed };
  }

  function initWindFlowLayer() {
    windGroup = new THREE.Group();
    windGroup.visible = showWind;
    brazilContainer.add(windGroup);

    rebuildWindParticles(windParticleCount);
  }

  function rebuildWindParticles(count) {
    if (windLinesMesh) {
      windGroup.remove(windLinesMesh);
      if (windLinesMesh.geometry) windLinesMesh.geometry.dispose();
      if (windLinesMesh.material) windLinesMesh.material.dispose();
      windLinesMesh = null;
    }
    if (windPointsMesh) {
      windGroup.remove(windPointsMesh);
      if (windPointsMesh.geometry) windPointsMesh.geometry.dispose();
      if (windPointsMesh.material) windPointsMesh.material.dispose();
      windPointsMesh = null;
    }

    windParticleCount = Math.min(count, 2500);
    windParticles = [];

    // Rastros mais longos e contínuos: 14 segmentos por partícula (28 vértices por rastro)
    const segmentsPerTrail = 14;
    const totalVertices = windParticleCount * segmentsPerTrail * 2;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(totalVertices * 3);
    const colors = new Float32Array(totalVertices * 3);
    const alphas = new Float32Array(totalVertices);

    // Gotículas frontais enevoadas com glow
    const headGeom = new THREE.BufferGeometry();
    const headPositions = new Float32Array(windParticleCount * 3);
    const headColors = new Float32Array(windParticleCount * 3);

    for (let i = 0; i < windParticleCount; i++) {
      const p = resetWindParticle({}, true);
      windParticles.push(p);

      const baseV = i * segmentsPerTrail * 6;
      const baseAlpha = i * segmentsPerTrail * 2;
      for (let s = 0; s < segmentsPerTrail; s++) {
        const segStart = p.trail[s];
        const segEnd = p.trail[s + 1];
        const idx = baseV + s * 6;
        const aIdx = baseAlpha + s * 2;

        positions[idx] = segStart.x;
        positions[idx + 1] = segStart.y;
        positions[idx + 2] = segStart.z;

        positions[idx + 3] = segEnd.x;
        positions[idx + 4] = segEnd.y;
        positions[idx + 5] = segEnd.z;

        for (let k = 0; k < 6; k += 3) {
          colors[idx + k] = 0.05;
          colors[idx + k + 1] = 0.65;
          colors[idx + k + 2] = 0.92;
        }

        alphas[aIdx] = 0.0;
        alphas[aIdx + 1] = 1.0;
      }

      headPositions[i * 3] = p.currX;
      headPositions[i * 3 + 1] = p.currY;
      headPositions[i * 3 + 2] = p.currZ;

      headColors[i * 3] = 0.05;
      headColors[i * 3 + 1] = 0.65;
      headColors[i * 3 + 2] = 0.92;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    // ShaderMaterial para degradê autêntico da cor para transparência total (sem escurecer)
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = alpha;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });

    windLinesMesh = new THREE.LineSegments(geom, lineMat);
    windLinesMesh.renderOrder = 200;
    windGroup.add(windLinesMesh);

    // Textura enevoada com núcleo luminoso e glow suave (atmospheric haze halo)
    const headCanvas = document.createElement('canvas');
    headCanvas.width = 64; headCanvas.height = 64;
    const hctx = headCanvas.getContext('2d');
    const grad = hctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.50)');
    grad.addColorStop(0.72, 'rgba(255, 255, 255, 0.16)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    hctx.fillStyle = grad;
    hctx.fillRect(0, 0, 64, 64);
    const headTex = new THREE.CanvasTexture(headCanvas);

    headGeom.setAttribute('position', new THREE.BufferAttribute(headPositions, 3));
    headGeom.setAttribute('color', new THREE.BufferAttribute(headColors, 3));

    const headMat = new THREE.PointsMaterial({
      size: 6.8,
      sizeAttenuation: false,
      map: headTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      depthTest: false
    });

    windPointsMesh = new THREE.Points(headGeom, headMat);
    windPointsMesh.renderOrder = 205;
    windGroup.add(windPointsMesh);
  }

  function resetWindParticle(p, isInitial = false) {
    if (Math.random() < 0.78) {
      p.lon = -71.5 + Math.random() * 37.0;
      p.lat = -33.0 + Math.random() * 38.0;
    } else {
      p.lon = -43.0 + Math.random() * 9.0;
      p.lat = -24.0 + Math.random() * 28.0;
    }

    const pt = projectCoord(p.lon, p.lat);
    const zElev = sampleElevationAtCoord(p.lon, p.lat) * reliefExaggeration;
    const hoverZ = zElev + (zElev > 0.05 ? 0.45 : 0.25);

    p.currX = pt.x;
    p.currY = pt.y;
    p.currZ = hoverZ;

    // Inicializar 15 nós de rastro (14 segmentos)
    p.trail = [];
    for (let k = 0; k < 15; k++) {
      p.trail.push({ x: pt.x, y: pt.y, z: hoverZ });
    }

    p.speed = 0;
    p.age = isInitial ? Math.floor(Math.random() * 95) : 0;
    p.maxAge = Math.floor(75 + Math.random() * 75);
    return p;
  }

  function updateWindFlow(delta) {
    if (!showWind || !windLinesMesh || !windPointsMesh) return;

    const posAttr = windLinesMesh.geometry.attributes.position;
    const colAttr = windLinesMesh.geometry.attributes.color;
    const alphaAttr = windLinesMesh.geometry.attributes.alpha;
    const positions = posAttr.array;
    const colors = colAttr.array;
    const alphas = alphaAttr.array;

    const headPosAttr = windPointsMesh.geometry.attributes.position;
    const headColAttr = windPointsMesh.geometry.attributes.color;
    const headPositions = headPosAttr.array;
    const headColors = headColAttr.array;

    const dt = Math.min(delta, 0.05);
    // Velocidade de advecção calibrada para visualização fluida e contínua
    const timeScale = 0.0092 * windSpeedMultiplier * (dt / 0.016);
    const gb = CONFIG.geoBounds;
    const segmentsPerTrail = 14;

    for (let i = 0; i < windParticleCount; i++) {
      const p = windParticles[i];
      p.age++;

      if (p.age >= p.maxAge || p.lon < gb.lonMin || p.lon > gb.lonMax || p.lat < gb.latMin || p.lat > gb.latMax) {
        resetWindParticle(p);
      }

      const wind = sampleWindAtCoord(p.lon, p.lat);
      p.speed = wind.speed;

      const latRad = p.lat * (Math.PI / 180.0);
      const cosLat = Math.max(Math.cos(latRad), 0.2);

      p.lon += (wind.u / cosLat) * timeScale;
      p.lat += wind.v * timeScale;

      const pt = projectCoord(p.lon, p.lat);
      const zElev = sampleElevationAtCoord(p.lon, p.lat) * reliefExaggeration;
      const hoverZ = zElev + (zElev > 0.05 ? 0.45 : 0.25);

      p.currX = pt.x;
      p.currY = pt.y;
      p.currZ = hoverZ;

      // Avançar histórico dos nós do rastro
      p.trail.shift();
      p.trail.push({ x: pt.x, y: pt.y, z: hoverZ });

      // Cores contrastantes e luminosas mapeadas por velocidade (km/h)
      const speedKmh = wind.speed * 3.6;
      let r, g, b;
      if (speedKmh < 18) {
        // Brisa: Azul Celeste profundo e nítido
        r = 0.02; g = 0.60; b = 0.95;
      } else if (speedKmh < 35) {
        // Moderado: Âmbar Ouro rico e luminoso
        const t = (speedKmh - 18) / 17.0;
        r = 0.15 + 0.75 * t;
        g = 0.68 - 0.18 * t;
        b = 0.82 - 0.78 * t;
      } else {
        // Forte / Jato: Coral e Fogo rubro
        const t = Math.min((speedKmh - 35) / 20.0, 1.0);
        r = 0.94;
        g = 0.42 - 0.26 * t;
        b = 0.06 + 0.08 * t;
      }

      // Ciclo de vida da partícula (fade-in inicial e fade-out ao expirar)
      let lifeFactor = 1.0;
      if (p.age < 14) lifeFactor = p.age / 14.0;
      else if (p.age > p.maxAge - 18) lifeFactor = (p.maxAge - p.age) / 18.0;

      const baseV = i * segmentsPerTrail * 6;
      const baseAlpha = i * segmentsPerTrail * 2;

      // 14 segmentos de rastro com degradê contínuo no canal alpha para transparência (0.0 na cauda)
      for (let s = 0; s < segmentsPerTrail; s++) {
        const segIdx = baseV + s * 6;
        const aIdx = baseAlpha + s * 2;
        const pA = p.trail[s];
        const pB = p.trail[s + 1];

        positions[segIdx] = pA.x;
        positions[segIdx + 1] = pA.y;
        positions[segIdx + 2] = pA.z;

        positions[segIdx + 3] = pB.x;
        positions[segIdx + 4] = pB.y;
        positions[segIdx + 5] = pB.z;

        // Cores mantêm sua saturação original sem escurecer para preto
        colors[segIdx] = r;
        colors[segIdx + 1] = g;
        colors[segIdx + 2] = b;

        colors[segIdx + 3] = r;
        colors[segIdx + 4] = g;
        colors[segIdx + 5] = b;

        // Degradê suave e contínuo no canal alpha:
        // Na ponta da cauda (s = 0), alphaA é 0.0 (totalmente transparente).
        // Na cabeça (s = 13), alphaB atinge ~0.92 (cor plena e destacada).
        alphas[aIdx] = Math.pow(s / segmentsPerTrail, 1.7) * lifeFactor * 0.92;
        alphas[aIdx + 1] = Math.pow((s + 1) / segmentsPerTrail, 1.7) * lifeFactor * 0.92;
      }

      // Cabeça do ponto com névoa / glow atmosférico
      headPositions[i * 3] = p.currX;
      headPositions[i * 3 + 1] = p.currY;
      headPositions[i * 3 + 2] = p.currZ;

      // Cabeça luminosa com leve realce
      headColors[i * 3] = Math.min(r * 1.15, 1.0);
      headColors[i * 3 + 1] = Math.min(g * 1.15, 1.0);
      headColors[i * 3 + 2] = Math.min(b * 1.15, 1.0);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    headPosAttr.needsUpdate = true;
    headColAttr.needsUpdate = true;
  }

  // --- Create Text Badge Sprite (Sigla) ---
  function createTextSprite(text, theme) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 128);

    ctx.beginPath();
    ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 16, 12, 0.9)';
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = theme.badgeBorder || '#cda851';
    ctx.stroke();

    ctx.fillStyle = '#f4ede2';
    ctx.font = 'bold 42px "Cinzel", "Space Grotesk", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 65);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.45, 1.45, 1.45);
    return sprite;
  }

  function updateStateSprite(st) {
    if (!st || !st.group) return;
    if (st.sprite) st.group.remove(st.sprite);
    st.sprite = createTextSprite(st.sigla, THEMES[currentThemeKey]);
    st.sprite.position.set(st.centroid.x, st.centroid.y, 1.2);
    st.sprite.visible = showLabels && (activeRegionFilter === 'todas' || st.regiao === activeRegionFilter);
    st.group.add(st.sprite);
  }

  // --- Build Vector Polygons Map (Alternative Mode) ---
  function buildBrazilVectorMap(geojsonData) {
    while (stateVectorGroup.children.length > 0) {
      stateVectorGroup.remove(stateVectorGroup.children[0]);
    }
    stateGroups = [];

    const theme = THEMES[currentThemeKey];

    geojsonData.features.forEach(feature => {
      const codarea = String(feature.properties.codarea);
      const meta = (window.ESTADOS_DETAILS && window.ESTADOS_DETAILS[codarea]) || {
        id: codarea,
        sigla: 'UF ' + codarea,
        nome: 'Estado ' + codarea,
        regiao: 'Brasil',
        capital: '-',
        populacao: '-',
        area: '-',
        curiosidade: 'Dados fornecidos pelo IBGE.'
      };

      const stateGroup = new THREE.Group();
      stateGroup.userData = {
        stateId: codarea,
        sigla: meta.sigla,
        nome: meta.nome,
        regiao: meta.regiao,
        data: meta
      };

      let stateColor = theme.baseColor || 0x1e293b;
      if (currentThemeKey === 'regions' && theme.regionColors && theme.regionColors[meta.regiao]) {
        stateColor = theme.regionColors[meta.regiao];
      }

      const material = new THREE.MeshStandardMaterial({
        color: stateColor,
        roughness: 0.45,
        metalness: 0.15,
        emissive: 0x000000
      });

      const lineMaterial = new THREE.LineBasicMaterial({
        color: theme.edgeColor,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.85
      });

      const geomType = feature.geometry.type;
      const polygonRingsList = geomType === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;

      const stateMeshes = [];
      const stateLines = [];
      let sumX = 0, sumY = 0, pointCount = 0;

      polygonRingsList.forEach(rings => {
        const outerCoords = rings[0];
        const shape = new THREE.Shape();

        outerCoords.forEach(([lon, lat], i) => {
          const pt = projectCoord(lon, lat);
          sumX += pt.x;
          sumY += pt.y;
          pointCount++;
          if (i === 0) shape.moveTo(pt.x, pt.y);
          else shape.lineTo(pt.x, pt.y);
        });

        for (let h = 1; h < rings.length; h++) {
          const holePath = new THREE.Path();
          rings[h].forEach(([lon, lat], i) => {
            const pt = projectCoord(lon, lat);
            if (i === 0) holePath.moveTo(pt.x, pt.y);
            else holePath.lineTo(pt.x, pt.y);
          });
          shape.holes.push(holePath);
        }

        const extrudeSettings = {
          depth: 0.25,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.03,
          bevelSegments: 2
        };

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(geom, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { parentGroup: stateGroup, stateId: codarea };
        stateGroup.add(mesh);
        stateMeshes.push(mesh);

        const edges = new THREE.EdgesGeometry(geom, 25);
        const line = new THREE.LineSegments(edges, lineMaterial);
        stateGroup.add(line);
        stateLines.push(line);
      });

      const centroid = {
        x: pointCount > 0 ? sumX / pointCount : 0,
        y: pointCount > 0 ? sumY / pointCount : 0
      };

      const sprite = createTextSprite(meta.sigla, theme);
      sprite.position.set(centroid.x, centroid.y, 1.1);
      sprite.visible = showLabels;
      stateGroup.add(sprite);

      stateVectorGroup.add(stateGroup);

      stateGroups.push({
        group: stateGroup,
        stateId: codarea,
        sigla: meta.sigla,
        nome: meta.nome,
        regiao: meta.regiao,
        data: meta,
        material: material,
        lineMaterial: lineMaterial,
        baseColor: stateColor,
        meshes: stateMeshes,
        lines: stateLines,
        sprite: sprite,
        centroid: centroid,
        currentY: 0,
        targetY: 0
      });
    });

    populateStateSelect();
  }

  function setRenderMode(mode) {
    renderMode = mode;
    if (mode === 'relief') {
      if (modeReliefBtn) modeReliefBtn.classList.add('active');
      if (modePolygonsBtn) modePolygonsBtn.classList.remove('active');
      if (sectionReliefControls) sectionReliefControls.style.display = 'flex';
      if (reliefMesh) reliefMesh.visible = true;
      if (paperSheetMesh) paperSheetMesh.visible = true;
      if (peaksGroup) peaksGroup.visible = showPeaks;
      stateVectorGroup.visible = false;
    } else {
      if (modeReliefBtn) modeReliefBtn.classList.remove('active');
      if (modePolygonsBtn) modePolygonsBtn.classList.add('active');
      if (sectionReliefControls) sectionReliefControls.style.display = 'none';
      if (reliefMesh) reliefMesh.visible = false;
      if (paperSheetMesh) paperSheetMesh.visible = false;
      if (peaksGroup) peaksGroup.visible = false;
      stateVectorGroup.visible = true;
    }
    if (tableMesh) tableMesh.visible = true;
  }

  // --- Populate State Dropdown ---
  function populateStateSelect() {
    selectState.innerHTML = '<option value="">Selecione ou busque uma UF...</option>';
    const sortedStates = [...stateGroups].sort((a, b) => a.nome.localeCompare(b.nome));

    sortedStates.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.stateId;
      opt.textContent = `${st.sigla} - ${st.nome} (${st.regiao})`;
      selectState.appendChild(opt);
    });
  }

  // --- Region Filter ---
  function filterByRegion(region) {
    activeRegionFilter = region;
    stateGroups.forEach(st => {
      const match = (region === 'todas' || st.regiao === region);
      st.material.opacity = match ? 1.0 : 0.25;
      st.material.transparent = !match;
      st.lineMaterial.opacity = match ? 0.85 : 0.15;
      if (st.sprite) {
        st.sprite.visible = showLabels && match;
      }
    });
  }

  // --- Apply Visual Theme ---
  function applyTheme(themeKey) {
    currentThemeKey = themeKey;
    const theme = THEMES[themeKey];

    scene.background.set(theme.bg);
    if (!showSkybox) {
      scene.fog = new THREE.FogExp2(theme.bg, 0.005);
    } else {
      scene.fog = null;
    }

    updateLateralLightPosition();

    stateGroups.forEach(st => {
      let color = theme.baseColor;
      if (themeKey === 'regions' && theme.regionColors && theme.regionColors[st.regiao]) {
        color = theme.regionColors[st.regiao];
      }
      st.baseColor = color;
      st.material.color.set(color);
      st.lineMaterial.color.set(theme.edgeColor);

      updateStateSprite(st);
    });

    gridGroup.children.forEach(child => {
      if (child.material) {
        child.material.color.set(theme.gridColor);
      }
    });
  }

  // --- Raycasting & Hover / Click Handlers ---
  function onMouseMove(event) {
    mousePos.x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePos.y = -(event.clientY / window.innerHeight) * 2 + 1;

    tooltipEl.style.left = `${event.clientX}px`;
    tooltipEl.style.top = `${event.clientY - 15}px`;

    raycaster.setFromCamera(mousePos, camera);
    const intersects = raycaster.intersectObjects(brazilContainer.children, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (renderMode === 'relief' && hit.object === reliefMesh) {
        const localPt = brazilContainer.worldToLocal(hit.point.clone());
        const geoCoord = unprojectCoord(localPt.x, localPt.y);

        const found = findStateAtGeoCoord(geoCoord.lon, geoCoord.lat);
        if (found) {
          const elevMeters = Math.round(sampleElevationAtCoord(geoCoord.lon, geoCoord.lat) * 2892);
          tooltipSigla.textContent = found.sigla;
          tooltipRegiao.textContent = found.regiao;
          tooltipNome.textContent = found.nome;
          tooltipElevation.textContent = `Altitude Estimada: ~${elevMeters.toLocaleString('pt-BR')}m`;
          tooltipEl.classList.add('visible');
        } else {
          tooltipEl.classList.remove('visible');
        }
      }
    }
  }

  function findStateAtGeoCoord(lon, lat) {
    if (!window.BRAZIL_GEOJSON) return null;
    for (let feat of window.BRAZIL_GEOJSON.features) {
      if (pointInFeature(lon, lat, feat)) {
        const codarea = String(feat.properties.codarea);
        return stateGroups.find(s => s.stateId === codarea);
      }
    }
    return null;
  }

  function pointInFeature(lon, lat, feat) {
    const geom = feat.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (let rings of polys) {
      if (pointInPolygon(lon, lat, rings[0])) return true;
    }
    return false;
  }

  function pointInPolygon(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function onClick(event) {
    if (event.target.closest('.control-dock') || event.target.closest('.detail-drawer') || event.target.closest('.top-nav') || event.target.closest('.compass-hud')) {
      return;
    }

    raycaster.setFromCamera(mousePos, camera);
    const intersects = raycaster.intersectObjects(brazilContainer.children, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (renderMode === 'relief' && hit.object === reliefMesh) {
        const localPt = brazilContainer.worldToLocal(hit.point.clone());
        const geoCoord = unprojectCoord(localPt.x, localPt.y);
        const found = findStateAtGeoCoord(geoCoord.lon, geoCoord.lat);
        if (found) {
          playSynthTone(580, 'triangle', 0.12);
          selectStateTarget(found);
        }
      } else {
        let hitMesh = hit.object;
        let targetStateId = hitMesh.userData.stateId || (hitMesh.parent && hitMesh.parent.userData.stateId);
        if (targetStateId) {
          const found = stateGroups.find(s => s.stateId === targetStateId);
          if (found) {
            playSynthTone(580, 'triangle', 0.12);
            selectStateTarget(found);
          }
        }
      }
    }
  }

  function selectStateTarget(stateItem) {
    selectedState = stateItem;
    selectState.value = stateItem.stateId;

    drawerSigla.textContent = stateItem.sigla;
    drawerNome.textContent = stateItem.nome;
    drawerRegiao.textContent = `Região ${stateItem.regiao}`;
    drawerCapital.textContent = stateItem.data.capital;
    drawerCodibge.textContent = stateItem.stateId;
    drawerPopulacao.textContent = stateItem.data.populacao;
    drawerArea.textContent = stateItem.data.area;
    drawerFact.innerHTML = `<strong>Curiosidade:</strong> ${stateItem.data.curiosidade}`;

    drawerEl.classList.add('open');
    // Camera remains in place per user preference
  }

  // --- Fetch Live GeoJSON from IBGE API v3 ---
  async function fetchLiveIBGEData() {
    loadingText.textContent = 'Consultando API oficial do IBGE v3...';
    loadingOverlay.classList.remove('hidden');

    const startTime = performance.now();
    const endpoint = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';

    try {
      apiStatusDot.style.backgroundColor = '#d4af37';
      apiStatusText.textContent = 'Carregando IBGE...';

      const response = await fetch(endpoint, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const elapsed = Math.round(performance.now() - startTime);

      window.BRAZIL_GEOJSON = data;
      buildBrazilVectorMap(data);

      apiStatusDot.style.backgroundColor = '#d4af37';
      apiStatusText.textContent = `IBGE Ao Vivo (${elapsed}ms)`;
      playSynthTone(720, 'sine', 0.15);
    } catch (err) {
      console.warn('Falha na conexão com IBGE, usando dados locais.', err);
      apiStatusDot.style.backgroundColor = '#d4af37';
      apiStatusText.textContent = 'Malha IBGE Local';

      if (window.BRAZIL_GEOJSON) {
        buildBrazilVectorMap(window.BRAZIL_GEOJSON);
      }
    } finally {
      setTimeout(() => {
        loadingOverlay.classList.add('hidden');
      }, 350);
    }
  }

  // --- UI Event Listeners ---
  function setupUIEventListeners() {
    // Hamburger Menu & Dock Panel Toggles
    if (btnHamburger && controlDock) {
      btnHamburger.addEventListener('click', () => {
        const isOpen = controlDock.classList.toggle('open');
        btnHamburger.classList.toggle('active', isOpen);
        btnHamburger.setAttribute('aria-expanded', isOpen);
        playSynthTone(isOpen ? 540 : 420, 'sine', 0.08);
      });
    }

    if (btnCloseDock && controlDock) {
      btnCloseDock.addEventListener('click', () => {
        controlDock.classList.remove('open');
        if (btnHamburger) {
          btnHamburger.classList.remove('active');
          btnHamburger.setAttribute('aria-expanded', 'false');
        }
        playSynthTone(400, 'sine', 0.08);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && controlDock && controlDock.classList.contains('open')) {
        controlDock.classList.remove('open');
        if (btnHamburger) {
          btnHamburger.classList.remove('active');
          btnHamburger.setAttribute('aria-expanded', 'false');
        }
        playSynthTone(380, 'sine', 0.08);
      }
    });

    if (modeReliefBtn) modeReliefBtn.addEventListener('click', () => setRenderMode('relief'));
    if (modePolygonsBtn) modePolygonsBtn.addEventListener('click', () => setRenderMode('polygons'));

    sliderRelief.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      reliefVal.textContent = `${val.toFixed(1)}x`;
      updateReliefExaggeration(val);
    });

    sliderAzimuth.addEventListener('input', (e) => {
      sunAzimuth = parseInt(e.target.value, 10);
      let cardinal = 'N';
      if (sunAzimuth >= 22.5 && sunAzimuth < 67.5) cardinal = 'NE';
      else if (sunAzimuth >= 67.5 && sunAzimuth < 112.5) cardinal = 'L (Leste)';
      else if (sunAzimuth >= 112.5 && sunAzimuth < 157.5) cardinal = 'SE';
      else if (sunAzimuth >= 157.5 && sunAzimuth < 202.5) cardinal = 'S (Sul)';
      else if (sunAzimuth >= 202.5 && sunAzimuth < 247.5) cardinal = 'SO';
      else if (sunAzimuth >= 247.5 && sunAzimuth < 292.5) cardinal = 'O (Oeste)';
      else if (sunAzimuth >= 292.5 && sunAzimuth < 337.5) cardinal = 'NO (Noroeste)';

      azimuthVal.textContent = `${sunAzimuth}° (${cardinal})`;
      updateLateralLightPosition();
    });

    sliderElevation.addEventListener('input', (e) => {
      sunElevation = parseInt(e.target.value, 10);
      elevationVal.textContent = `${sunElevation}° (${sunElevation < 28 ? 'Rasante' : 'Alto'})`;
      updateLateralLightPosition();
    });

    sliderLight.addEventListener('input', (e) => {
      sunIntensity = parseFloat(e.target.value);
      lightVal.textContent = sunIntensity.toFixed(1);
      updateLateralLightPosition();
    });

    toggleSunOrbit.addEventListener('change', (e) => {
      sunOrbitActive = e.target.checked;
    });

    // View Buttons with pulled-back camera positions
    btnViewPerspective.addEventListener('click', () => {
      setActiveViewBtn(btnViewPerspective);
      controls.enableRotate = true;
      controlsTargetPos = new THREE.Vector3(0, 0, 0);
      cameraTargetPos = new THREE.Vector3(0, 56, 52);
    });

    btnViewTopdown.addEventListener('click', () => {
      setActiveViewBtn(btnViewTopdown);
      targetRotationZ = 0;
      controlsTargetPos = new THREE.Vector3(0, 0, 0);
      cameraTargetPos = new THREE.Vector3(0, 86, 0.001);
    });

    btnViewCinematic.addEventListener('click', () => {
      setActiveViewBtn(btnViewCinematic);
      controls.enableRotate = true;
      controlsTargetPos = new THREE.Vector3(0, 0, 0);
      cameraTargetPos = new THREE.Vector3(0, 22, 50);
    });

    function setActiveViewBtn(btn) {
      [btnViewPerspective, btnViewTopdown, btnViewCinematic].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    compassHud.addEventListener('click', () => {
      targetRotationZ = 0;
      playSynthTone(440, 'sine', 0.1);
    });

    const regionChips = document.querySelectorAll('.chip');
    regionChips.forEach(chip => {
      chip.addEventListener('click', () => {
        regionChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterByRegion(chip.dataset.region);
        playSynthTone(380, 'sine', 0.05);
      });
    });

    btnSound.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnSound.classList.toggle('active', soundEnabled);
      iconSoundOff.style.display = soundEnabled ? 'none' : 'block';
      iconSoundOn.style.display = soundEnabled ? 'block' : 'none';
      if (soundEnabled) playSynthTone(520, 'sine', 0.1);
    });

    // Wind Flow Controls (CPTEC / INPE)
    function setWindLayerEnabled(enabled) {
      showWind = enabled;
      if (windGroup) windGroup.visible = showWind;
      if (toggleWind) toggleWind.checked = showWind;
      if (btnNavWind) btnNavWind.classList.toggle('active', showWind);
      playSynthTone(showWind ? 480 : 340, 'sine', 0.08);
    }

    if (btnNavWind) {
      btnNavWind.addEventListener('click', () => {
        setWindLayerEnabled(!showWind);
      });
    }

    if (toggleWind) {
      toggleWind.addEventListener('change', (e) => {
        setWindLayerEnabled(e.target.checked);
      });
    }

    if (sliderWindSpeed) {
      sliderWindSpeed.addEventListener('input', (e) => {
        windSpeedMultiplier = parseFloat(e.target.value);
        if (windSpeedVal) windSpeedVal.textContent = `${windSpeedMultiplier.toFixed(1)}x`;
      });
    }

    if (sliderWindDensity) {
      sliderWindDensity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (windDensityVal) windDensityVal.textContent = val.toLocaleString('pt-BR');
        rebuildWindParticles(val);
      });
    }

    toggleAutoRotate.addEventListener('change', (e) => {
      autoRotate = e.target.checked;
    });

    toggleLabels.addEventListener('change', (e) => {
      showLabels = e.target.checked;
      stateGroups.forEach(st => {
        if (st.sprite) st.sprite.visible = showLabels && (activeRegionFilter === 'todas' || st.regiao === activeRegionFilter);
      });
    });

    togglePeaks.addEventListener('change', (e) => {
      showPeaks = e.target.checked;
      if (peaksGroup) peaksGroup.visible = showPeaks;
    });

    toggleGrid.addEventListener('change', (e) => {
      showGrid = e.target.checked;
      gridGroup.visible = showGrid;
    });

    if (toggleSkybox) {
      toggleSkybox.addEventListener('change', (e) => {
        showSkybox = e.target.checked;
        if (skyMesh) {
          skyMesh.visible = showSkybox;
        }
        if (showSkybox) {
          scene.fog = null;
        } else {
          scene.fog = new THREE.FogExp2(THEMES[currentThemeKey].bg, 0.005);
        }
        playSynthTone(440, 'triangle', 0.08);
      });
    }

    selectState.addEventListener('change', (e) => {
      const id = e.target.value;
      if (id) {
        const found = stateGroups.find(s => s.stateId === id);
        if (found) {
          playSynthTone(580, 'triangle', 0.1);
          selectStateTarget(found);
        }
      }
    });

    btnCloseDrawer.addEventListener('click', () => {
      drawerEl.classList.remove('open');
      selectedState = null;
    });

    btnReloadApi.addEventListener('click', () => {
      fetchLiveIBGEData();
    });

    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
      } else {
        document.exitFullscreen().catch(err => console.log(err));
      }
    });
  }

  function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // --- Animation Loop ---
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Continuous Sun Orbit if enabled
    if (sunOrbitActive) {
      sunAzimuth = (sunAzimuth + delta * 15) % 360;
      sliderAzimuth.value = Math.round(sunAzimuth);
      azimuthVal.textContent = `${Math.round(sunAzimuth)}°`;
      updateLateralLightPosition();
    }

    if (autoRotate && !controls.state == -1 && targetRotationZ === null) {
      brazilContainer.rotation.z -= delta * 0.08;
    }

    if (targetRotationZ !== null) {
      const diff = targetRotationZ - brazilContainer.rotation.z;
      brazilContainer.rotation.z += diff * 0.1;
      if (Math.abs(diff) < 0.005) {
        brazilContainer.rotation.z = targetRotationZ;
        targetRotationZ = null;
      }
    }

    if (compassNeedle) {
      const totalAngle = brazilContainer.rotation.z;
      compassNeedle.style.transform = `rotate(${-totalAngle * (180 / Math.PI)}deg)`;
    }

    if (cameraTargetPos) {
      camera.position.lerp(cameraTargetPos, 0.05);
      if (camera.position.distanceTo(cameraTargetPos) < 0.1) {
        cameraTargetPos = null;
      }
    }
    if (controlsTargetPos) {
      controls.target.lerp(controlsTargetPos, 0.05);
      if (controls.target.distanceTo(controlsTargetPos) < 0.1) {
        controlsTargetPos = null;
      }
    }

    controls.update();

    // Delimitação física: a câmera nunca ultrapassa a lateral da mesa nem desce abaixo do tampo
    const maxCamX = 92;
    const maxCamZ = 80;
    const minCamY = 14;

    if (camera.position.y < minCamY) camera.position.y = minCamY;
    if (camera.position.x < -maxCamX) camera.position.x = -maxCamX;
    if (camera.position.x > maxCamX) camera.position.x = maxCamX;
    if (camera.position.z < -maxCamZ) camera.position.z = -maxCamZ;
    if (camera.position.z > maxCamZ) camera.position.z = maxCamZ;

    // Manter o alvo de pan (controls.target) contido no centro do mapa
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -20, 20);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -15, 15);
    controls.target.y = 0;

    if (starsGroup) {
      starsGroup.rotation.y += delta * 0.015;
    }

    if (showWind) {
      updateWindFlow(delta);
    }

    renderer.render(scene, camera);
  }

  // --- Bootstrap Application ---
  async function start() {
    initScene();

    if (window.BRAZIL_GEOJSON) {
      buildBrazilVectorMap(window.BRAZIL_GEOJSON);
    }

    await loadTopographicRelief();

    setRenderMode('relief');

    initWindFlowLayer();

    animate();
  }

  window.addEventListener('DOMContentLoaded', start);
})();
