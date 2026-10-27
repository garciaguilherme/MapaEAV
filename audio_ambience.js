/**
 * audio_ambience.js - Motor Sonoro de Ambiência & Música Lo-Fi Suave
 * 
 * Sintetizador Web Audio API 100% autônomo e sem dependências externas:
 * 1. Ambiência de Vento Natural: ruído rosa filtrado com LFOs modulando rajadas e sopro estéreo.
 * 2. Música Lo-Fi Mellow:
 *    - Acordes quentes estilo Rhodes (Fmaj9, Am7, Dm9, Bbmaj7#11) com wow/flutter de fita cassete.
 *    - Sub-grave aveludado e acolhedor.
 *    - Melodias esparsas com eco de fita analógica (delay estéreo).
 *    - Pulsação suave (heartbeat kick aveludado + brush de fita).
 *    - Textura de vinil e calor analógico.
 */

(function () {
  'use strict';

  let audioCtx = null;
  let isPlaying = false;
  let masterGain = null;
  let windGain = null;
  let musicGain = null;
  let compressor = null;

  // Parâmetros de volume padrão
  let musicVolume = 0.65;
  let windVolume = 0.40;

  // Geradores e temporizadores
  let windNodes = null;
  let musicInterval = null;
  let vinylNode = null;
  let beatStep = 0;
  let chordIndex = 0;
  let currentBpm = 66; // Tempo lento e relaxante

  // Notas da escala e frequências (Hz)
  const NOTES = {
    'F1': 43.65, 'A1': 55.00, 'Bb1': 58.27, 'C2': 65.41, 'D2': 73.42,
    'F2': 87.31, 'A2': 110.00, 'Bb2': 116.54, 'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00,
    'A3': 220.00, 'B3': 246.94, 'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00,
    'A4': 440.00, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'G5': 783.99
  };

  // Progressão nostálgica e aconchegante Lo-Fi (F Maior / D Menor)
  const CHORD_PROGRESSION = [
    {
      name: 'Fmaj9',
      bass: 'F1',
      root: 'F2',
      voicing: ['A3', 'C4', 'E4', 'G4', 'C5'],
      melodyCandidates: ['E5', 'C5', 'A4', 'G4']
    },
    {
      name: 'Am7',
      bass: 'A1',
      root: 'A2',
      voicing: ['G3', 'C4', 'E4', 'G4'],
      melodyCandidates: ['C5', 'D5', 'E5', 'G4']
    },
    {
      name: 'Dm9',
      bass: 'D2',
      root: 'D3',
      voicing: ['A3', 'C4', 'F4', 'E4'],
      melodyCandidates: ['F4', 'A4', 'C5', 'E5', 'D5']
    },
    {
      name: 'Bbmaj7#11',
      bass: 'Bb1',
      root: 'Bb2',
      voicing: ['A3', 'C4', 'E4', 'F4'],
      melodyCandidates: ['D5', 'C5', 'A4', 'F4']
    }
  ];

  // Delay estéreo para eco espacial
  let delayNode = null;
  let delayFeedback = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    return audioCtx;
  }

  // --- 1. GERADOR DE RUÍDO ROSA (PINK NOISE) PARA O VENTO ---
  function createPinkNoiseBuffer(ctx, durationSec = 5) {
    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let rb0 = 0, rb1 = 0, rb2 = 0, rb3 = 0, rb4 = 0, rb5 = 0, rb6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + whiteL * 0.0555179;
      b1 = 0.99332 * b1 + whiteL * 0.0750759;
      b2 = 0.96900 * b2 + whiteL * 0.1538520;
      b3 = 0.86650 * b3 + whiteL * 0.3104856;
      b4 = 0.55000 * b4 + whiteL * 0.5329522;
      b5 = -0.7616 * b5 - whiteL * 0.0168980;
      left[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + whiteL * 0.5362) * 0.08;
      b6 = whiteL * 0.115926;

      const whiteR = Math.random() * 2 - 1;
      rb0 = 0.99886 * rb0 + whiteR * 0.0555179;
      rb1 = 0.99332 * rb1 + whiteR * 0.0750759;
      rb2 = 0.96900 * rb2 + whiteR * 0.1538520;
      rb3 = 0.86650 * rb3 + whiteR * 0.3104856;
      rb4 = 0.55000 * rb4 + whiteR * 0.5329522;
      rb5 = -0.7616 * rb5 - whiteR * 0.0168980;
      right[i] = (rb0 + rb1 + rb2 + rb3 + rb4 + rb5 + rb6 + whiteR * 0.5362) * 0.08;
      rb6 = whiteR * 0.115926;
    }
    return buffer;
  }

  // --- 2. SINTETIZADOR DA AMBIÊNCIA DO VENTO ---
  function startWindSynthesis(ctx, destination) {
    const pinkBuffer = createPinkNoiseBuffer(ctx, 6);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    // Filtro passa-faixa principal (sopros da brisa)
    const bandFilter = ctx.createBiquadFilter();
    bandFilter.type = 'bandpass';
    bandFilter.frequency.value = 420;
    bandFilter.Q.value = 2.0;

    // Filtro passa-baixa adicional para maciez
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 850;

    // Filtro corta-graves para manter o sub-grave da música limpo
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 140;

    // LFO 1: Modula frequência do vento (sensação de rajadas lentas)
    const lfoFreq = ctx.createOscillator();
    lfoFreq.frequency.value = 0.08; // 1 ciclo a cada 12 segundos
    const lfoFreqGain = ctx.createGain();
    lfoFreqGain.gain.value = 180;
    lfoFreq.connect(lfoFreqGain);
    lfoFreqGain.connect(bandFilter.frequency);

    // LFO 2: Modula volume do vento (respiração do ar)
    const lfoAmp = ctx.createOscillator();
    lfoAmp.frequency.value = 0.12; // 1 ciclo a cada 8 segundos
    const lfoAmpGain = ctx.createGain();
    lfoAmpGain.gain.value = 0.35;
    const windSubGain = ctx.createGain();
    windSubGain.gain.value = 0.65;
    lfoAmp.connect(lfoAmpGain);
    lfoAmpGain.connect(windSubGain.gain);

    // Conexão em cascata
    noiseSource.connect(bandFilter);
    bandFilter.connect(lowFilter);
    lowFilter.connect(highPass);
    highPass.connect(windSubGain);
    windSubGain.connect(destination);

    noiseSource.start();
    lfoFreq.start();
    lfoAmp.start();

    return {
      stop: () => {
        try {
          noiseSource.stop();
          lfoFreq.stop();
          lfoAmp.stop();
          noiseSource.disconnect();
          bandFilter.disconnect();
          lowFilter.disconnect();
          highPass.disconnect();
          windSubGain.disconnect();
        } catch (e) {}
      }
    };
  }

  // --- 3. TEXTURA DE VINIL ANALÓGICO & TAPE WARMTH ---
  function startVinylTexture(ctx, destination) {
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // Hiss de fita ultra suave
      let sample = (Math.random() * 2 - 1) * 0.007;
      // Estalos aleatórios esparsos (crackle de vinil)
      if (Math.random() < 0.00035) {
        sample += (Math.random() * 2 - 1) * 0.08;
      }
      data[i] = sample;
    }

    const vinylSource = ctx.createBufferSource();
    vinylSource.buffer = buffer;
    vinylSource.loop = true;

    const vinylFilter = ctx.createBiquadFilter();
    vinylFilter.type = 'lowpass';
    vinylFilter.frequency.value = 2400;

    const vinylGain = ctx.createGain();
    vinylGain.gain.value = 0.22;

    vinylSource.connect(vinylFilter);
    vinylFilter.connect(vinylGain);
    vinylGain.connect(destination);

    vinylSource.start();
    return {
      stop: () => {
        try {
          vinylSource.stop();
          vinylSource.disconnect();
        } catch (e) {}
      }
    };
  }

  // --- 4. TAPE DELAY ESTÉREO PARA ECOS LO-FI ---
  function setupTapeDelay(ctx, destination) {
    delayNode = ctx.createDelay();
    delayNode.delayTime.value = 0.38; // Tempo sincronizado suave

    delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.32; // Feedback acolhedor

    const delayDamp = ctx.createBiquadFilter();
    delayDamp.type = 'lowpass';
    delayDamp.frequency.value = 1400; // Corta agudos nos ecos como fita vintage

    delayNode.connect(delayDamp);
    delayDamp.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayDamp.connect(destination);

    return delayNode;
  }

  // --- 5. VOZ DE PIANO RHODES / ELETRIC PIANO LO-FI ---
  function playRhodesNote(ctx, freq, startTime, duration = 3.2, velocity = 0.7) {
    const oscBody = ctx.createOscillator();
    const oscHarm = ctx.createOscillator();
    const noteGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Senóide rica no fundamental + triângulo suave com leve detune (chorus)
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(freq, startTime);

    oscHarm.type = 'triangle';
    oscHarm.frequency.setValueAtTime(freq * 1.0008, startTime); // Sutil batimento analógico

    // Wow & Flutter (modulação lenta de pitch típica de fita K7)
    const flutterLfo = ctx.createOscillator();
    flutterLfo.frequency.setValueAtTime(0.65, startTime); // 0.65 Hz
    const flutterGain = ctx.createGain();
    flutterGain.gain.setValueAtTime(freq * 0.003, startTime); // ~3 a 5 cents
    flutterLfo.connect(flutterGain);
    flutterGain.connect(oscBody.frequency);
    flutterGain.connect(oscHarm.frequency);

    // Filtro lowpass com envelope para timbre aveludado
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 3.5, 1600), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.8, 700), startTime + duration);
    filter.Q.value = 1.2;

    // Envelope de amplitude ADSR
    const attack = 0.035;
    const decay = duration * 0.7;
    const targetGain = velocity * 0.16;

    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.linearRampToValueAtTime(targetGain, startTime + attack);
    noteGain.gain.exponentialRampToValueAtTime(targetGain * 0.35, startTime + attack + decay);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscBody.connect(filter);
    oscHarm.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(musicGain);

    // Enviar fração suave para o tape delay
    if (delayNode) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = 0.18;
      noteGain.connect(sendGain);
      sendGain.connect(delayNode);
    }

    oscBody.start(startTime);
    oscHarm.start(startTime);
    flutterLfo.start(startTime);

    oscBody.stop(startTime + duration + 0.1);
    oscHarm.stop(startTime + duration + 0.1);
    flutterLfo.stop(startTime + duration + 0.1);
  }

  // --- 6. SUB-GRAVE PROFUNDO E ACOLHEDOR ---
  function playSubBass(ctx, freq, startTime, duration = 3.6) {
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    const bassFilter = ctx.createBiquadFilter();

    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(freq, startTime);

    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 160;

    bassGain.gain.setValueAtTime(0.0001, startTime);
    bassGain.gain.linearRampToValueAtTime(0.24, startTime + 0.08);
    bassGain.gain.exponentialRampToValueAtTime(0.14, startTime + duration * 0.6);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(musicGain);

    bassOsc.start(startTime);
    bassOsc.stop(startTime + duration + 0.1);
  }

  // --- 7. BEAT AVELUDADO LO-FI (HEARTBEAT KICK + BRUSH) ---
  function playMellowKick(ctx, startTime) {
    const kickOsc = ctx.createOscillator();
    const kickGain = ctx.createGain();
    const kickFilter = ctx.createBiquadFilter();

    // Queda de pitch rápida típica de bumbo analógico
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(85, startTime);
    kickOsc.frequency.exponentialRampToValueAtTime(38, startTime + 0.09);

    kickFilter.type = 'lowpass';
    kickFilter.frequency.value = 110;

    kickGain.gain.setValueAtTime(0.28, startTime);
    kickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

    kickOsc.connect(kickFilter);
    kickFilter.connect(kickGain);
    kickGain.connect(musicGain);

    kickOsc.start(startTime);
    kickOsc.stop(startTime + 0.25);
  }

  function playSoftBrush(ctx, startTime) {
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.018));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);

    noise.start(startTime);
    noise.stop(startTime + 0.06);
  }

  // --- 8. MELODIAS ESPARSAS E DREAMY COM DELAY ---
  function playDreamyBell(ctx, noteName, startTime) {
    const freq = NOTES[noteName];
    if (!freq) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.frequency.value = 2200;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.11, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);

    if (delayNode) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = 0.35;
      gain.connect(sendGain);
      sendGain.connect(delayNode);
    }

    osc.start(startTime);
    osc.stop(startTime + 1.9);
  }

  // --- 9. SEQUENCIADOR DE COMPASSOS (LOOP LO-FI CONTÍNUO) ---
  function scheduleLoFiStep() {
    if (!isPlaying || !audioCtx) return;

    const now = audioCtx.currentTime;
    const beatDuration = 60 / currentBpm; // ~0.909 segundos por batida
    const chord = CHORD_PROGRESSION[chordIndex];

    // No tempo 1 do compasso: Toca o acorde aberto com dedilhado (strum) humano
    if (beatStep === 0) {
      // Sub-grave
      const bassFreq = NOTES[chord.bass] || NOTES[chord.root] * 0.5;
      playSubBass(audioCtx, bassFreq, now, beatDuration * 3.8);

      // Notas do acorde com micro-atraso (20ms a 40ms entre notas)
      chord.voicing.forEach((noteName, idx) => {
        const f = NOTES[noteName];
        if (f) {
          const strumDelay = idx * (0.028 + Math.random() * 0.012);
          playRhodesNote(audioCtx, f, now + strumDelay, beatDuration * 3.5, 0.75 - idx * 0.06);
        }
      });

      // Melodia esparsa eventual no início do acorde
      if (Math.random() < 0.65) {
        const melNote = chord.melodyCandidates[Math.floor(Math.random() * chord.melodyCandidates.length)];
        playDreamyBell(audioCtx, melNote, now + beatDuration * (1.2 + Math.random() * 0.8));
      }
    }

    // Ritmo de bateria super discreto (Heartbeat & Tape Brush)
    if (beatStep === 0) {
      playMellowKick(audioCtx, now);
    } else if (beatStep === 1 || beatStep === 3) {
      playSoftBrush(audioCtx, now);
    } else if (beatStep === 2) {
      if (Math.random() < 0.4) {
        playMellowKick(audioCtx, now); // Kick fantasma
      }
    }

    // Melodia de resposta no 3º tempo
    if (beatStep === 2 && Math.random() < 0.5) {
      const melNote = chord.melodyCandidates[Math.floor(Math.random() * chord.melodyCandidates.length)];
      playDreamyBell(audioCtx, melNote, now + beatDuration * 0.5);
    }

    // Avançar batida e compasso
    beatStep = (beatStep + 1) % 4;
    if (beatStep === 0) {
      chordIndex = (chordIndex + 1) % CHORD_PROGRESSION.length;
    }
  }

  // --- 10. CONTROLE DO SISTEMA DE ÁUDIO ---
  function startPlayback() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (isPlaying) return;
    isPlaying = true;

    // Master Compressor / Limiter para calor analógico sem clipping
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-2.0, ctx.currentTime);
    compressor.knee.setValueAtTime(14.0, ctx.currentTime);
    compressor.ratio.setValueAtTime(6.0, ctx.currentTime);
    compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    compressor.release.setValueAtTime(0.20, ctx.currentTime);
    compressor.connect(ctx.destination);

    // Master Gain com fade-in suave de 1.8 segundos
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 1.8);
    masterGain.connect(compressor);

    // Canais independentes de Vento e Música
    windGain = ctx.createGain();
    windGain.gain.setValueAtTime(windVolume, ctx.currentTime);
    windGain.connect(masterGain);

    musicGain = ctx.createGain();
    musicGain.gain.setValueAtTime(musicVolume, ctx.currentTime);
    musicGain.connect(masterGain);

    // Iniciar efeitos de Delay e Vinil
    setupTapeDelay(ctx, musicGain);
    vinylNode = startVinylTexture(ctx, masterGain);

    // Iniciar ambiência do vento
    windNodes = startWindSynthesis(ctx, windGain);

    // Iniciar loop musical
    beatStep = 0;
    chordIndex = 0;
    scheduleLoFiStep();

    const beatIntervalMs = (60 / currentBpm) * 1000;
    musicInterval = setInterval(scheduleLoFiStep, beatIntervalMs);

    updateUI();
  }

  function stopPlayback() {
    if (!isPlaying || !audioCtx) return;
    isPlaying = false;

    if (masterGain) {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
    }

    setTimeout(() => {
      if (musicInterval) clearInterval(musicInterval);
      musicInterval = null;

      if (windNodes) {
        windNodes.stop();
        windNodes = null;
      }
      if (vinylNode) {
        vinylNode.stop();
        vinylNode = null;
      }
      updateUI();
    }, 850);
  }

  function toggleAudio() {
    if (isPlaying) {
      stopPlayback();
      showToast('🔇 Áudio e Ambiência Desativados');
    } else {
      startPlayback();
      showToast('🎵 Música Lo-Fi & Vento Ativos');
    }
  }

  function setMusicVolumeVal(val) {
    musicVolume = Math.max(0, Math.min(1, val));
    if (musicGain && audioCtx) {
      musicGain.gain.setTargetAtTime(musicVolume, audioCtx.currentTime, 0.05);
    }
  }

  function setWindVolumeVal(val) {
    windVolume = Math.max(0, Math.min(1, val));
    if (windGain && audioCtx) {
      windGain.gain.setTargetAtTime(windVolume, audioCtx.currentTime, 0.05);
    }
  }

  // --- 11. ATUALIZAÇÃO DA INTERFACE & FEEDBACK VISUAL ---
  function updateUI() {
    const btnSound = document.getElementById('btn-sound');
    const iconOff = document.getElementById('icon-sound-off');
    const iconOn = document.getElementById('icon-sound-on');
    const toggleDockSound = document.getElementById('toggle-sound-dock');

    if (btnSound) {
      if (isPlaying) {
        btnSound.classList.add('active');
        btnSound.title = 'Desativar Áudio (Música Lo-Fi & Vento)';
      } else {
        btnSound.classList.remove('active');
        btnSound.title = 'Ativar Áudio (Música Lo-Fi & Vento)';
      }
    }

    if (iconOff) iconOff.style.display = isPlaying ? 'none' : 'block';
    if (iconOn) iconOn.style.display = isPlaying ? 'block' : 'none';

    if (toggleDockSound) {
      toggleDockSound.checked = isPlaying;
    }
  }

  function showToast(msg) {
    let toast = document.getElementById('audio-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'audio-toast';
      toast.className = 'audio-toast-popup';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Inicializar listeners na página
  function initListeners() {
    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      btnSound.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAudio();
      });
    }

    const toggleDockSound = document.getElementById('toggle-sound-dock');
    if (toggleDockSound) {
      toggleDockSound.addEventListener('change', (e) => {
        if (e.target.checked !== isPlaying) {
          toggleAudio();
        }
      });
    }

    const sliderMusic = document.getElementById('slider-music-volume');
    if (sliderMusic) {
      sliderMusic.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value) / 100;
        setMusicVolumeVal(v);
        const label = document.getElementById('music-volume-val');
        if (label) label.textContent = Math.round(v * 100) + '%';
      });
    }

    const sliderWind = document.getElementById('slider-wind-volume');
    if (sliderWind) {
      sliderWind.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value) / 100;
        setWindVolumeVal(v);
        const label = document.getElementById('wind-volume-val');
        if (label) label.textContent = Math.round(v * 100) + '%';
      });
    }

    // Atalho de teclado: Tecla 'M' para alternar mudo/som
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'm' || e.key === 'M') {
        toggleAudio();
      }
    });
  }

  // Auto-inicializar após DOM carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListeners);
  } else {
    initListeners();
  }

  // Expor API global
  window.AmbienceManager = {
    play: startPlayback,
    stop: stopPlayback,
    toggle: toggleAudio,
    setMusicVolume: setMusicVolumeVal,
    setWindVolume: setWindVolumeVal,
    isPlaying: () => isPlaying
  };

})();
