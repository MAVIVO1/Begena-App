/**
 * Begena Simulator Engine Architecture
 * Multi-mode Synthesis, Real-time Visualizer & Custom Performance Tracker
 */

document.addEventListener("DOMContentLoaded", () => {
  // SYSTEM ARCHITECTURE VARIABLES
  let audioCtx = null;
  let masterGainNode = null;
  let reverbDelayNode = null;
  let reverbGainNode = null;
  let echoDelayNode = null;
  let echoGainNode = null;
  let bassFilterNode = null;
  let trebleFilterNode = null;

  let isMuted = false;
  let isRecording = false;
  let recordingStartTime = 0;
  let recordedEvents = [];
  let playbackTimeoutIds = [];
  let metronomeIntervalId = null;
  let isMetronomeOn = false;
  let autoDemoIntervalId = null;

  // AUDIO TUNING MAPS (Traditional Tizita Minor Base Frequencies Configuration)
  // Map of 10 traditional Begena strings from left to right (Deep meditative Bass base register)
  const baseFrequencies = [
    55.0, // String 1: A1
    65.41, // String 2: C2
    73.42, // String 3: D2
    82.41, // String 4: E2
    98.0, // String 5: G2
    110.0, // String 6: A2
    130.81, // String 7: C3
    146.83, // String 8: D3
    164.81, // String 9: E3
    196.0, // String 10: G3
  ];

  // Runtime frequency maps allowing global manipulation via transposition arrays
  let currentFrequencies = [...baseFrequencies];
  const keyMappings = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  // RENDERING SYSTEM & AUDIO VISUALIZER CORE
  const canvas = document.getElementById("visualizer-canvas");
  const canvasCtx = canvas.getContext("2d");
  let analyserNode = null;
  let visualizerBufferLength = 0;
  let visualizerDataArray = null;

  // DOM HOOKS
  const stringsWrapper = document.getElementById("strings-wrapper");
  const themeSelector = document.getElementById("theme-selector");
  const playModeSelector = document.getElementById("play-mode");
  const animationToggle = document.getElementById("toggle-animations");

  // INITIALIZATION & DYNAMIC LAYOUT GENERATION
  function initializeStructure() {
    stringsWrapper.innerHTML = "";
    currentFrequencies.forEach((freq, idx) => {
      const track = document.createElement("div");
      track.classList.add("begena-string-track");
      track.dataset.index = idx;
      track.setAttribute("role", "button");
      track.setAttribute(
        "aria-label",
        `Begena String ${idx + 1}, Key ${keyMappings[idx]}`,
      );

      // Generate proportional traditional thickness variables
      const calculatedThickness = 4.5 - idx * 0.3;
      track.style.setProperty("--string-thickness", `${calculatedThickness}px`);

      const stringLine = document.createElement("div");
      stringLine.classList.add("string-element");

      const badge = document.createElement("div");
      badge.classList.add("string-badge");
      badge.innerText = keyMappings[idx];

      track.appendChild(stringLine);
      track.appendChild(badge);
      stringsWrapper.appendChild(track);

      // INPUT CONTROLLERS HOOKUP
      track.addEventListener("mousedown", (e) => {
        e.preventDefault();
        triggerStringPluck(idx);
      });
      track.addEventListener("mouseenter", (e) => {
        if (e.buttons === 1) triggerStringPluck(idx);
      });
      track.addEventListener("touchstart", (e) => {
        e.preventDefault();
        triggerStringPluck(idx);
      });
    });
    resizeCanvas();
  }

  // CANVAS HANDLING CONFIGURATION
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  // WEB AUDIO SYNTHESIS COMPLEX SUB-SYSTEM ENGINE
  function setupAudioPipeline() {
    if (audioCtx) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    visualizerBufferLength = analyserNode.frequencyBinCount;
    visualizerDataArray = new Uint8Array(visualizerBufferLength);

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.setValueAtTime(
      parseFloat(document.getElementById("master-volume").value),
      audioCtx.currentTime,
    );

    // Bi-quad equalizers parameters mapping
    bassFilterNode = audioCtx.createBiquadFilter();
    bassFilterNode.type = "lowshelf";
    bassFilterNode.frequency.setValueAtTime(200, audioCtx.currentTime);
    bassFilterNode.gain.setValueAtTime(
      parseFloat(document.getElementById("eq-bass").value),
      audioCtx.currentTime,
    );

    trebleFilterNode = audioCtx.createBiquadFilter();
    trebleFilterNode.type = "highshelf";
    trebleFilterNode.frequency.setValueAtTime(2000, audioCtx.currentTime);
    trebleFilterNode.gain.setValueAtTime(
      parseFloat(document.getElementById("eq-treble").value),
      audioCtx.currentTime,
    );

    // Simulation nodes setup
    echoDelayNode = audioCtx.createDelay(2.0);
    echoDelayNode.delayTime.setValueAtTime(
      parseFloat(document.getElementById("echo-delay").value) * 0.5,
      audioCtx.currentTime,
    );
    echoGainNode = audioCtx.createGain();
    echoGainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);

    reverbDelayNode = audioCtx.createDelay(1.0);
    reverbDelayNode.delayTime.setValueAtTime(0.04, audioCtx.currentTime); // Quick dense reflection
    reverbGainNode = audioCtx.createGain();
    reverbGainNode.gain.setValueAtTime(
      parseFloat(document.getElementById("reverb-level").value) * 0.4,
      audioCtx.currentTime,
    );

    // PIPELINE CROSS CONNECTIONS
    masterGainNode.connect(bassFilterNode);
    bassFilterNode.connect(trebleFilterNode);
    trebleFilterNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    // Parallel processing loops for Echo and Gizit overtones
    trebleFilterNode.connect(echoDelayNode);
    echoDelayNode.connect(echoGainNode);
    echoGainNode.connect(echoDelayNode); // Loop feedback
    echoGainNode.connect(analyserNode);

    trebleFilterNode.connect(reverbDelayNode);
    reverbDelayNode.connect(reverbGainNode);
    reverbGainNode.connect(reverbDelayNode);
    reverbGainNode.connect(analyserNode);

    renderSystemVisualizer();
  }

  // STRING RENDERING SYNTHESIZER PLUCK TRIGGER
  function triggerStringPluck(index) {
    if (!audioCtx) setupAudioPipeline();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    const currentTimestamp = audioCtx ? audioCtx.currentTime : 0;
    const targetFrequency = currentFrequencies[index];

    // Track and cache recordings gracefully
    if (isRecording) {
      recordedEvents.push({
        time: Date.now() - recordingStartTime,
        stringIndex: index,
      });
    }

    // VISUAL ANIMATION EMITTER
    const trackElement = stringsWrapper.children[index];
    if (trackElement) {
      trackElement.classList.remove("vibrating");
      void trackElement.offsetWidth; // Force reflow trigger
      trackElement.classList.add("vibrating");

      // Instantiation of the procedural particle ripple element
      if (document.body.getAttribute("data-animations") === "true") {
        const ripple = document.createElement("div");
        ripple.classList.add("string-ripple");
        ripple.className = "string-ripple-effect";
        trackElement.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      }

      // Duration handling aligned safely to current mode
      const currentMode = playModeSelector.value;
      let decayLimit = 2.2;
      if (currentMode === "performance") decayLimit = 3.5;
      if (currentMode === "practice") decayLimit = 1.2;

      setTimeout(() => {
        trackElement.classList.remove("vibrating");
      }, decayLimit * 1000);
    }

    if (isMuted || !audioCtx) return;

    // MULTI-OSCILLATOR SYNTHESIS GENERATING AUTHENTIC BUZZ OVERTONES
    const primaryOsc = audioCtx.createOscillator();
    const buzzOsc = audioCtx.createOscillator();
    const voiceGainNode = audioCtx.createGain();

    // Emulate deep heavy string structure using Sawtooth mixed with Triangle waves
    primaryOsc.type = "triangle";
    primaryOsc.frequency.setValueAtTime(targetFrequency, currentTimestamp);

    buzzOsc.type = "sawtooth";
    buzzOsc.frequency.setValueAtTime(targetFrequency * 2.01, currentTimestamp); // Distort slightly for organic warmth

    const buzzGain = audioCtx.createGain();
    const structuralGizitFactor = parseFloat(
      document.getElementById("reverb-level").value,
    );
    buzzGain.gain.setValueAtTime(
      structuralGizitFactor * 0.35,
      currentTimestamp,
    );

    // ATTACK DECAY SUSTAIN RELEASE ENGINE SETUP
    voiceGainNode.gain.setValueAtTime(0.0, currentTimestamp);
    voiceGainNode.gain.linearRampToValueAtTime(0.8, currentTimestamp + 0.02); // Crisp Pluck Attack
    voiceGainNode.gain.exponentialRampToValueAtTime(
      0.15,
      currentTimestamp + 0.4,
    ); // Natural Falloff
    voiceGainNode.gain.exponentialRampToValueAtTime(
      0.001,
      currentTimestamp + 2.5,
    ); // Infinite Resonant Release

    // INTERCONNECTIVITY PATHWAYS
    buzzOsc.connect(buzzGain);
    buzzGain.connect(voiceGainNode);
    primaryOsc.connect(voiceGainNode);

    voiceGainNode.connect(masterGainNode);

    primaryOsc.start(currentTimestamp);
    buzzOsc.start(currentTimestamp);

    primaryOsc.stop(currentTimestamp + 2.6);
    buzzOsc.stop(currentTimestamp + 2.6);
  }

  // REAL-TIME CACHING GRAPHICS LOOP (60 FPS OPTIMIZED)
  function renderSystemVisualizer() {
    requestAnimationFrame(renderSystemVisualizer);
    if (!analyserNode) return;

    analyserNode.getByteFrequencyData(visualizerDataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const pieceWidth = (canvas.width / visualizerBufferLength) * 1.5;
    let axisX = 0;

    for (let i = 0; i < visualizerBufferLength; i++) {
      const currentMetric = visualizerDataArray[i];
      const computedHeight = (currentMetric / 255) * canvas.height * 0.7;

      // Paint elegant glowing custom design patterns
      canvasCtx.fillStyle = `rgba(252, 209, 22, ${(currentMetric / 255) * 0.4})`;
      canvasCtx.fillRect(
        axisX,
        canvas.height - computedHeight,
        pieceWidth - 1,
        computedHeight,
      );

      axisX += pieceWidth;
    }
  }

  // APPLICATION KEYBOARD INTERACTION GATEWAY
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const targetKeyIdx = keyMappings.indexOf(e.key);
    if (targetKeyIdx !== -1) {
      triggerStringPluck(targetKeyIdx);
    }
  });

  // EVENT DELEGATION NAVIGATION HANDLERS
  document.querySelectorAll(".nav-btn, .action-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const destinationId = btn.getAttribute("data-target");
      document
        .querySelectorAll(".content-section")
        .forEach((sec) => sec.classList.remove("active"));
      document
        .querySelectorAll(".nav-btn")
        .forEach((nb) => nb.classList.remove("active"));

      document.getElementById(destinationId).classList.add("active");

      const targetedNavBtn = document.querySelector(
        `.nav-btn[data-target="${destinationId}"]`,
      );
      if (targetedNavBtn) targetedNavBtn.classList.add("active");

      if (destinationId === "simulator-section") resizeCanvas();
    });
  });

  // RUNTIME INTERFACE HANDLERS CONTROLLING AUDIO CONSTANTS
  themeSelector.addEventListener("change", (e) => {
    document.body.setAttribute("data-theme", e.target.value);
  });

  animationToggle.addEventListener("change", (e) => {
    document.body.setAttribute(
      "data-animations",
      e.target.checked ? "true" : "false",
    );
  });

  document.getElementById("master-volume").addEventListener("input", (e) => {
    if (masterGainNode)
      masterGainNode.gain.setValueAtTime(
        parseFloat(e.target.value),
        audioCtx.currentTime,
      );
  });

  document.getElementById("reverb-level").addEventListener("input", (e) => {
    if (reverbGainNode)
      reverbGainNode.gain.setValueAtTime(
        parseFloat(e.target.value) * 0.4,
        audioCtx.currentTime,
      );
  });

  document.getElementById("echo-delay").addEventListener("input", (e) => {
    if (echoDelayNode)
      echoDelayNode.delayTime.setValueAtTime(
        parseFloat(e.target.value) * 0.5,
        audioCtx.currentTime,
      );
  });

  document.getElementById("eq-bass").addEventListener("input", (e) => {
    if (bassFilterNode)
      bassFilterNode.gain.setValueAtTime(
        parseFloat(e.target.value),
        audioCtx.currentTime,
      );
  });

  document.getElementById("eq-treble").addEventListener("input", (e) => {
    if (trebleFilterNode)
      trebleFilterNode.gain.setValueAtTime(
        parseFloat(e.target.value),
        audioCtx.currentTime,
      );
  });

  // TRANSPOSITION & TUNING PANEL ACTIONS
  document.getElementById("tune-up").addEventListener("click", () => {
    currentFrequencies = currentFrequencies.map((f) => f * 1.059463); // Shift up 1 semi-tone
  });

  document.getElementById("tune-down").addEventListener("click", () => {
    currentFrequencies = currentFrequencies.map((f) => f / 1.059463); // Shift down 1 semi-tone
  });

  document.getElementById("tune-reset").addEventListener("click", () => {
    currentFrequencies = [...baseFrequencies];
    document.getElementById("octave-shift").value = 0;
  });

  document.getElementById("octave-shift").addEventListener("input", (e) => {
    const factor = Math.pow(2, parseInt(e.target.value));
    currentFrequencies = baseFrequencies.map((f) => f * factor);
  });

  document.getElementById("mute-btn").addEventListener("click", (e) => {
    isMuted = !isMuted;
    e.target.innerText = isMuted ? "Unmute Audio" : "Mute Audio";
    e.target.style.background = isMuted
      ? "var(--primary-red)"
      : "rgba(255,255,255,0.06)";
  });

  // PERFORMANCE SESSION RECORDING ALGORITHMS
  const recBtn = document.getElementById("record-btn");
  const stopBtn = document.getElementById("stop-btn");
  const playRecBtn = document.getElementById("playback-btn");
  const clearRecBtn = document.getElementById("clear-rec-btn");

  recBtn.addEventListener("click", () => {
    isRecording = true;
    recordedEvents = [];
    recordingStartTime = Date.now();
    recBtn.classList.add("recording");
    recBtn.disabled = true;
    stopBtn.disabled = false;
    playRecBtn.disabled = true;
    clearRecBtn.disabled = true;
  });

  stopBtn.addEventListener("click", () => {
    isRecording = false;
    recBtn.classList.remove("recording");
    recBtn.disabled = false;
    stopBtn.disabled = true;
    if (recordedEvents.length > 0) {
      playRecBtn.disabled = false;
      clearRecBtn.disabled = false;
    }
  });

  playRecBtn.addEventListener("click", () => {
    playbackTimeoutIds.forEach((id) => clearTimeout(id));
    playbackTimeoutIds = [];

    recordedEvents.forEach((evt) => {
      const id = setTimeout(() => {
        triggerStringPluck(evt.stringIndex);
      }, evt.time);
      playbackTimeoutIds.push(id);
    });
  });

  clearRecBtn.addEventListener("click", () => {
    recordedEvents = [];
    playRecBtn.disabled = true;
    clearRecBtn.disabled = true;
  });

  // METRONOME & GENERATIVE COMPOSITION ENGINE MODULES
  document.getElementById("metronome-toggle").addEventListener("click", (e) => {
    isMetronomeOn = !isMetronomeOn;
    if (isMetronomeOn) {
      e.target.innerText = "Metronome ON";
      e.target.style.color = "var(--primary-gold)";
      const tempoBpm = parseInt(
        document.getElementById("metronome-tempo").value,
      );
      const rateInterval = (60 / tempoBpm) * 1000;

      metronomeIntervalId = setInterval(() => {
        if (audioCtx && !isMuted) {
          const clickOsc = audioCtx.createOscillator();
          const clickGain = audioCtx.createGain();
          clickOsc.type = "sine";
          clickOsc.frequency.setValueAtTime(650, audioCtx.currentTime);
          clickGain.gain.setValueAtTime(0.12, audioCtx.currentTime);
          clickGain.gain.exponentialRampToValueAtTime(
            0.001,
            audioCtx.currentTime + 0.05,
          );
          clickOsc.connect(clickGain);
          clickGain.connect(audioCtx.destination);
          clickOsc.start();
          clickOsc.stop(audioCtx.currentTime + 0.06);
        }
      }, rateInterval);
    } else {
      e.target.innerText = "Metronome OFF";
      e.target.style.color = "inherit";
      clearInterval(metronomeIntervalId);
    }
  });

  document.getElementById("random-melody-btn").addEventListener("click", () => {
    let iterations = 0;
    const melodyInterval = setInterval(() => {
      const randomString = Math.floor(Math.random() * 10);
      triggerStringPluck(randomString);
      iterations++;
      if (iterations >= 12) clearInterval(melodyInterval);
    }, 350);
  });

  document.getElementById("demo-btn").addEventListener("click", (e) => {
    if (autoDemoIntervalId) {
      clearInterval(autoDemoIntervalId);
      autoDemoIntervalId = null;
      e.target.innerText = "Auto Demo Mode";
      e.target.style.background = "rgba(255,255,255,0.06)";
    } else {
      e.target.innerText = "Stop Demo Mode";
      e.target.style.background = "var(--primary-green)";
      // Traditional 4-beat meditative phrasing pattern loop
      const traditionalPattern = [0, 3, 5, 3, 2, 5, 7, 5];
      let patternIndex = 0;
      autoDemoIntervalId = setInterval(() => {
        triggerStringPluck(traditionalPattern[patternIndex]);
        patternIndex = (patternIndex + 1) % traditionalPattern.length;
      }, 450);
    }
  });

  // UTILITY INTERFACE ENHANCEMENT SUITE
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  document.getElementById("screenshot-btn").addEventListener("click", () => {
    alert(
      "Configuration Saved: Theme: " +
        themeSelector.value +
        " | Strings Calibrated: 10 Channels Operational.",
    );
  });

  // STARTUP RUNTIME EXECUTION
  initializeStructure();
});
