/**
 * Tiya Landing Page & Typographic Vector Animation Engine
 * Precision CAD typography + Interactive Showcase & OS Detection
 */

// ==========================================
// 1. Web Audio Synthesizer for CAD Feedback
// ==========================================
class VectorAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false; // Audio disabled by default; toggles on via UI or interaction
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playDraw() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(680, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (_) {}
  }

  playSnap() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (_) {}
  }

  playFill() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(260, this.ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (_) {}
  }
}

const sfx = new VectorAudio();

// ==========================================
// 2. CAD Animation Engine State & Helpers
// ==========================================
const animState = {
  time: 0.0,
  duration: 5.5, // Crisp ~5.5s pacing
  playing: true,
  autoLoop: false,
  fontStyle: 'geometric',
  lastSnapTriggered: false,
  lastFillTriggered: false,
  lastDrawTriggered: false,
  curtainDismissed: false
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// CAD Handle SVG Helper — scale compensated to remain razor-sharp hairline vectors
function renderAnchor(x, y, scale = 1, zoom = 1) {
  const s = (3.4 / zoom) * scale;
  return `<rect x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" fill="#ffffff" stroke="none" />`;
}

function renderHandle(ax, ay, hx, hy, label, labelPos = 'top', scale = 1, zoom = 1) {
  const curHx = ax + (hx - ax) * scale;
  const curHy = ay + (hy - ay) * scale;
  const dotR = (2.2 / zoom) * scale;

  const line = `<line x1="${ax}" y1="${ay}" x2="${curHx}" y2="${curHy}" stroke="rgba(255,255,255,0.7)" class="cad-guide" />`;
  const tip = `<circle cx="${curHx}" cy="${curHy}" r="${dotR}" fill="#ffffff" stroke="none" />`;
  const anchor = renderAnchor(ax, ay, scale, zoom);

  const offset = 8.5 / zoom;
  let tx = curHx;
  let ty = curHy - offset;
  if (labelPos === 'left') { tx = curHx - offset * 1.5; ty = curHy + (3 / zoom); }
  else if (labelPos === 'right') { tx = curHx + offset * 1.5; ty = curHy + (3 / zoom); }
  else if (labelPos === 'bottom') { tx = curHx; ty = curHy + offset * 1.4; }
  else if (labelPos === 'top-left') { tx = curHx - offset * 1.2; ty = curHy - offset; }

  const fontSize = (8.5 / zoom).toFixed(2);
  const text = (label && scale > 0.3) ? `
    <text x="${tx}" y="${ty}" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="${fontSize}" fill="#ffffff" opacity="${Math.min(1, scale * 1.1)}" font-weight="500">
      ${label}
    </text>
  ` : '';

  return line + tip + anchor + text;
}

// Reconstructed authentic geometric typography for "Tiya"
function getTiyaPaths(params) {
  const { vLeft, vC1, vC2, vC3, style } = params;

  // Letter 'T' Dimensions (X: 200 to 350, Center: 275)
  const tTop = 190;
  const tBarH = 38;
  const tStemLeft = 256;
  const tStemRight = 294;
  const tBottom = 430;
  const tLeftEdge = 200;
  const tRightEdge = 350;

  // Dynamic fillet matching reference screenshots
  const lFilletR = vLeft * 1.6;
  const rFilletR = vLeft * 1.9;

  const pathT = `
    M ${tLeftEdge} ${tTop}
    H ${tRightEdge}
    V ${tTop + tBarH}
    H ${tStemRight + rFilletR}
    C ${tStemRight + rFilletR * 0.45} ${tTop + tBarH}, ${tStemRight} ${tTop + tBarH + rFilletR * 0.45}, ${tStemRight} ${tTop + tBarH + rFilletR}
    V ${tBottom}
    H ${tStemLeft}
    V ${tTop + tBarH + lFilletR}
    C ${tStemLeft} ${tTop + tBarH + lFilletR * 0.45}, ${tStemLeft - lFilletR * 0.45} ${tTop + tBarH}, ${tStemLeft - lFilletR} ${tTop + tBarH}
    H ${tLeftEdge}
    Z
  `;

  // Letter 'i' Dimensions (X: 406 to 444)
  const pathIStem = `M 406 270 H 444 V 430 H 406 Z`;

  // Letter 'y' Dimensions (X: 494 to 648, Stem Width: 38px)
  const yLeft = 494;
  const yInnerLeft = 532;
  const yInnerRight = 610;
  const yRight = 648;
  const yTop = 270;
  const yBaseline = 430;
  const yDescender = 515;

  const cupFlex = vC1 * 1.8;

  const pathY = `
    M ${yLeft} ${yTop}
    H ${yInnerLeft}
    V ${yBaseline - 55}
    C ${yInnerLeft} ${yBaseline - 20 + cupFlex}, ${yInnerRight} ${yBaseline - 20 + cupFlex}, ${yInnerRight} ${yBaseline - 55}
    V ${yTop}
    H ${yRight}
    V ${yBaseline + 25}
    C ${yRight} ${yDescender + 4}, ${yInnerRight - 8} ${yDescender + 8}, ${yInnerLeft - 8} ${yDescender - 4}
    L ${yInnerLeft - 8} ${yDescender - 42}
    C ${yInnerLeft + 28} ${yDescender - 32}, ${yInnerRight} ${yDescender - 36}, ${yInnerRight} ${yBaseline + 2}
    C ${yInnerRight} ${yBaseline + 2}, ${yInnerLeft + 12} ${yBaseline + 2}, ${yLeft} ${yBaseline - 45}
    Z
  `;

  // Letter 'a' Dimensions (X: 698 to 836, Stem Width: 38px)
  const aStemW = 38;
  const aLeft = 698;
  const aRight = 836;
  const aTop = 270;
  const aBottom = 430;

  let pathA = '';

  if (style === 'grotesk') {
    // Neo-Grotesk Double-Story 'a'
    pathA = `
      M ${aRight - aStemW} ${aTop}
      H ${aRight}
      V ${aBottom}
      H ${aRight - aStemW}
      V ${aBottom - 16}
      C ${aRight - aStemW - 12} ${aBottom - 2}, ${aRight - aStemW - 30} ${aBottom + 3}, ${aLeft + 58} ${aBottom + 3}
      C ${aLeft + 16} ${aBottom + 3}, ${aLeft} ${aBottom - 26}, ${aLeft} ${aTop + 80}
      C ${aLeft} ${aTop + 30}, ${aLeft + 26} ${aTop}, ${aLeft + 65} ${aTop}
      H ${aRight - aStemW}
      Z
      M ${aRight - aStemW} ${aTop + 36}
      H ${aLeft + 65}
      C ${aLeft + 42} ${aTop + 36}, ${aLeft + 38} ${aTop + 48}, ${aLeft + 38} ${aTop + 72}
      C ${aLeft + 38} ${aBottom - 40}, ${aLeft + 46} ${aBottom - 34}, ${aLeft + 65} ${aBottom - 34}
      C ${aLeft + 90} ${aBottom - 34}, ${aRight - aStemW} ${aBottom - 48}, ${aRight - aStemW} ${aBottom - 64}
      Z
    `;
  } else {
    // Sleek Geometric Single-Story 'a'
    pathA = `
      M ${aRight - aStemW} ${aTop}
      H ${aRight}
      V ${aBottom}
      H ${aRight - aStemW}
      V ${aBottom - 20}
      C ${aRight - aStemW - 16} ${aBottom + 3}, ${aRight - 60} ${aBottom + 4}, ${aLeft + 54} ${aBottom + 4}
      C ${aLeft + 15} ${aBottom + 4}, ${aLeft} ${aBottom - 28}, ${aLeft} ${aTop + 72}
      C ${aLeft} ${aTop + 28}, ${aLeft + 22} ${aTop}, ${aLeft + 66} ${aTop}
      H ${aRight - aStemW}
      Z
      M ${aRight - aStemW} ${aTop + 38}
      H ${aLeft + 64}
      C ${aLeft + 44} ${aTop + 38}, ${aLeft + 38} ${aTop + 52}, ${aLeft + 38} ${aTop + 70}
      C ${aLeft + 38} ${aBottom - 38}, ${aLeft + 46} ${aBottom - 34}, ${aLeft + 64} ${aBottom - 34}
      C ${aLeft + 88} ${aBottom - 34}, ${aRight - aStemW} ${aBottom - 48}, ${aRight - aStemW} ${aBottom - 64}
      Z
    `;
  }

  return { pathT, pathIStem, pathY, pathA };
}

// ==========================================
// 3. Main CAD Animation Render Frame
// ==========================================
let dom = {};

function initDOMRefs() {
  dom = {
    stageArea: document.getElementById('stage-area'),
    cameraRig: document.getElementById('camera-rig'),
    heroStageWrapper: document.getElementById('hero-stage-wrapper'),
    electricBg: document.getElementById('electric-bg'),
    laserScanline: document.getElementById('laser-scanline'),
    laserSpark: document.getElementById('laser-spark'),
    glyphT: document.getElementById('glyph-T'),
    glyphIDot: document.getElementById('glyph-i-dot'),
    glyphIStem: document.getElementById('glyph-i-stem'),
    glyphY: document.getElementById('glyph-y'),
    glyphA: document.getElementById('glyph-a'),
    cadHandlesLayer: document.getElementById('cad-handles-layer'),
    navbar: document.getElementById('main-navbar'),
    osDetectBadge: document.getElementById('user-os-badge'),
    primaryDownloadBtn: document.getElementById('primary-download-btn'),
    macCodeBlock: document.getElementById('mac-code-block'),
    copyMacBtn: document.getElementById('copy-mac-btn'),
    gitCloneBlock: document.getElementById('git-clone-block'),
    copyGitBtn: document.getElementById('copy-git-btn')
  };
}

function updateFrame(t) {
  if (!dom.cameraRig) return;

  // Macro CAD view initial camera: zoomed in close on the T/i fillet junction
  let zoom = 3.35;
  let panX = -135;
  let panY = -35;
  let handlesScale = 1;
  let handlesOpacity = 1;
  let fillAlpha = 0;

  // Real-time animated fillet parameters
  let vLeft = 12.6;
  let vC1 = 7.62;
  let vC2 = 5.71;
  let vC3 = 13.4;

  if (t < 1.6) {
    // Phase 1: Dynamic Line Motion & Calibration (Laser sweep & initial drafting: 0.0s -> 1.6s)
    animState.lastSnapTriggered = false;
    animState.lastFillTriggered = false;

    const drawP = Math.min(t / 1.3, 1);
    const strokeLength = 1600;
    const strokeDashOffset = (1 - drawP) * strokeLength;

    const breathe = Math.sin(t * 6.0) * 0.4;
    vLeft = 12.6 + breathe;
    vC1 = 7.62 - breathe * 0.35;
    vC2 = 5.71 + breathe * 0.25;
    vC3 = 13.4 + breathe * 0.45;

    // Laser scanline sweeping across the screen
    if (t < 1.4 && dom.laserScanline && dom.laserSpark) {
      const scanP = t / 1.4;
      const laserX = lerp(100, 1100, scanP);
      dom.laserScanline.setAttribute('x1', laserX);
      dom.laserScanline.setAttribute('x2', laserX);
      dom.laserScanline.setAttribute('opacity', Math.sin(scanP * Math.PI) * 0.85);

      dom.laserSpark.setAttribute('cx', laserX);
      dom.laserSpark.setAttribute('cy', 310 + Math.sin(t * 14) * 50);
      dom.laserSpark.setAttribute('opacity', 0.9);

      if (!animState.lastDrawTriggered && t > 0.15) {
        sfx.playDraw();
        animState.lastDrawTriggered = true;
      }
    } else if (dom.laserScanline && dom.laserSpark) {
      dom.laserScanline.setAttribute('opacity', 0);
      dom.laserSpark.setAttribute('opacity', 0);
    }

    zoom = 3.35 + Math.sin(t * 3.0) * 0.025;
    panX = -135 + Math.cos(t * 3.0) * 2;
    panY = -35;
    fillAlpha = 0;
    handlesScale = 1;
    handlesOpacity = 1;

  } else if (t >= 1.6 && t < 2.8) {
    // Phase 2: Fillet Tightening Snap (1.6s -> 2.8s)
    if (dom.laserScanline) dom.laserScanline.setAttribute('opacity', 0);
    if (dom.laserSpark) dom.laserSpark.setAttribute('opacity', 0);
    animState.lastDrawTriggered = false;

    const st = (t - 1.6) / 1.2;
    const ease = easeInOutCubic(st);

    if (!animState.lastSnapTriggered && t > 1.85) {
      sfx.playSnap();
      animState.lastSnapTriggered = true;
    }

    vLeft = lerp(12.6, 6.26, ease);
    vC1 = lerp(7.62, 3.18, ease);
    vC2 = lerp(5.71, 2.39, ease);
    vC3 = lerp(13.4, 5.59, ease);

    zoom = lerp(3.35, 3.22, ease);
    panX = lerp(-135, -125, ease);
    panY = lerp(-35, -30, ease);
    fillAlpha = 0;
    handlesScale = 1;
    handlesOpacity = 1;

  } else if (t >= 2.8 && t < 3.8) {
    // Phase 3: Electric Fill & Smooth Handle Retraction (2.8s -> 3.8s)
    const st = (t - 2.8) / 1.0;
    const ease = easeInOutCubic(st);

    if (!animState.lastFillTriggered) {
      sfx.playFill();
      animState.lastFillTriggered = true;
    }

    vLeft = 6.26;
    vC1 = 3.18;
    vC2 = 2.39;
    vC3 = 5.59;

    fillAlpha = ease;
    handlesScale = Math.max(0, 1 - ease * 1.35);
    handlesOpacity = Math.max(0, 1 - ease * 1.5);

    zoom = lerp(3.22, 2.5, ease);
    panX = lerp(-125, -60, ease);
    panY = lerp(-30, -15, ease);

  } else if (t >= 3.8 && t < 4.8) {
    // Phase 4: Cinematic Camera Pull-Back revealing the complete wordmark (3.8s -> 4.8s)
    const st = (t - 3.8) / 1.0;
    const ease = easeInOutCubic(st);

    fillAlpha = 1;
    handlesScale = 0;
    handlesOpacity = 0;

    vLeft = 6.26;
    vC1 = 3.18;
    vC2 = 2.39;
    vC3 = 5.59;

    zoom = lerp(2.5, 1.0, ease);
    panX = lerp(-60, 0, ease);
    panY = lerp(-15, 0, ease);

  } else {
    // Phase 5: Complete pristine wordmark lockup (4.8s -> 5.5s settle)
    fillAlpha = 1;
    handlesScale = 0;
    handlesOpacity = 0;
    vLeft = 6.26;
    vC1 = 3.18;
    vC2 = 2.39;
    vC3 = 5.59;
    zoom = 1.0;
    panX = 0;
    panY = 0;
  }

  dom.cameraRig.style.transform = `scale(${zoom}) translate(${panX}px, ${panY}px)`;

  // Generate paths with active live parameters and current style
  const paths = getTiyaPaths({ vLeft, vC1, vC2, vC3, style: animState.fontStyle });

  // Update Letter SVG Elements
  if (dom.glyphT) dom.glyphT.setAttribute('d', paths.pathT);
  if (dom.glyphIStem) dom.glyphIStem.setAttribute('d', paths.pathIStem);
  if (dom.glyphY) dom.glyphY.setAttribute('d', paths.pathY);
  if (dom.glyphA) dom.glyphA.setAttribute('d', paths.pathA);

  // Dash offset animation during draw phase
  if (t < 1.6) {
    const strokeLength = 1600;
    const drawP = Math.min(t / 1.3, 1);
    const dashOffset = (1 - drawP) * strokeLength;
    if (dom.glyphT) {
      dom.glyphT.style.strokeDasharray = strokeLength;
      dom.glyphT.style.strokeDashoffset = dashOffset;
    }
    if (dom.glyphY) {
      dom.glyphY.style.strokeDasharray = strokeLength;
      dom.glyphY.style.strokeDashoffset = dashOffset;
    }
    if (dom.glyphA) {
      dom.glyphA.style.strokeDasharray = strokeLength;
      dom.glyphA.style.strokeDashoffset = dashOffset;
    }
  } else {
    if (dom.glyphT) dom.glyphT.style.strokeDasharray = 'none';
    if (dom.glyphY) dom.glyphY.style.strokeDasharray = 'none';
    if (dom.glyphA) dom.glyphA.style.strokeDasharray = 'none';
  }

  // Fill color transitions from transparent to solid white
  const fillStyle = `rgba(255, 255, 255, ${fillAlpha})`;
  if (dom.glyphT) dom.glyphT.setAttribute('fill', fillStyle);
  if (dom.glyphIDot) dom.glyphIDot.setAttribute('fill', fillStyle);
  if (dom.glyphIStem) dom.glyphIStem.setAttribute('fill', fillStyle);
  if (dom.glyphY) dom.glyphY.setAttribute('fill', fillStyle);
  if (dom.glyphA) dom.glyphA.setAttribute('fill', fillStyle);

  // Render Handles Layer with smooth retraction & zoom compensation
  if (dom.cadHandlesLayer) {
    if (handlesOpacity > 0.01) {
      dom.cadHandlesLayer.setAttribute('opacity', handlesOpacity);
      let hHTML = '';

      const lblLeft = t >= 4.2 ? vLeft.toFixed(2) : vLeft.toFixed(1);
      const lblC1 = vC1.toFixed(2);
      const lblC2 = vC2.toFixed(2);
      const lblC3 = vC3.toFixed(2);

      const rFilletR = vLeft * 1.9;
      const axT1 = 294 + rFilletR;
      const ayT1 = 190 + 38;
      const axT2 = 294;
      const ayT2 = 190 + 38 + rFilletR;

      hHTML += renderHandle(axT1, ayT1, axT1 - rFilletR * 0.55, ayT1, lblLeft, 'top', handlesScale, zoom);
      hHTML += renderHandle(axT2, ayT2, axT2, ayT2 - rFilletR * 0.55, lblLeft, 'right', handlesScale, zoom);
      hHTML += renderAnchor(axT2, 340, handlesScale, zoom);
      hHTML += renderAnchor(axT2, 430, handlesScale, zoom);

      const yLeft = 494;
      const yTop = 270;
      const yShoulderR = vC1 * 3.2;
      const yArcW = vC2 * 6.4;

      hHTML += renderAnchor(yLeft, 430, handlesScale, zoom);
      hHTML += renderHandle(yLeft, yTop + yShoulderR, yLeft, yTop + yShoulderR * 0.45, lblC1, 'left', handlesScale, zoom);
      hHTML += renderHandle(yLeft + yArcW, yTop, yLeft + yArcW * 0.45, yTop, lblC2, 'top', handlesScale, zoom);
      hHTML += renderHandle(yLeft + yArcW + 24, yTop, yLeft + yArcW + 24 + (vC3 * 1.5), yTop, lblC3, 'top', handlesScale, zoom);

      const yInnerLeft = 532;
      hHTML += renderAnchor(yInnerLeft, yTop + 38, handlesScale, zoom);
      hHTML += renderHandle(yInnerLeft, yTop + 38, yInnerLeft, yTop + 38 + 26, '26.8', 'right', handlesScale, zoom);
      hHTML += renderHandle(yInnerLeft, 430, yInnerLeft + 32, 430, '26.8', 'top', handlesScale, zoom);

      dom.cadHandlesLayer.innerHTML = hHTML;
    } else {
      dom.cadHandlesLayer.setAttribute('opacity', 0);
    }
  }

  // Background Presentation: Electric Blue flood inside SVG
  if (dom.electricBg) {
    dom.electricBg.setAttribute('opacity', fillAlpha);
  }

  // Smooth stage lighting
  if (dom.heroStageWrapper) {
    if (fillAlpha > 0.5) {
      dom.heroStageWrapper.classList.add('electric-active');
    } else {
      dom.heroStageWrapper.classList.remove('electric-active');
    }
  }
}

// Animation Loop
let lastTime = performance.now();

function dismissCurtain() {
  if (animState.curtainDismissed) return;
  animState.curtainDismissed = true;
  setPlayState(false);

  if (dom.heroStageWrapper) {
    dom.heroStageWrapper.classList.add('curtain-up');
    // Hide after slide-up transition completes to prevent any scroll obstruction or GPU load
    setTimeout(() => {
      if (dom.heroStageWrapper && dom.heroStageWrapper.classList.contains('curtain-up')) {
        dom.heroStageWrapper.style.visibility = 'hidden';
      }
    }, 900);
  }
}

function replayCurtain() {
  if (!dom.heroStageWrapper) return;
  window.scrollTo({ top: 0, behavior: 'instant' });
  dom.heroStageWrapper.style.visibility = 'visible';
  dom.heroStageWrapper.classList.remove('curtain-up');
  animState.curtainDismissed = false;
  animState.time = 0;
  animState.lastSnapTriggered = false;
  animState.lastFillTriggered = false;
  animState.lastDrawTriggered = false;
  setPlayState(true);
  updateFrame(0);
}

function tick(now) {
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  if (animState.playing) {
    animState.time += delta;
    if (animState.time >= animState.duration) {
      animState.time = animState.duration;
      setPlayState(false);

      // Once animation completes and settles on pristine lockup,
      // hold for 450ms then smoothly slide curtain up revealing the page!
      if (!animState.curtainDismissed) {
        setTimeout(() => {
          dismissCurtain();
        }, 450);
      }
    }
    updateFrame(animState.time);
  }

  requestAnimationFrame(tick);
}

function setPlayState(play) {
  animState.playing = play;
  if (animState.playing) {
    sfx.init();
  }
}

// ==========================================
// 4. Interactive Page Logic & Controls
// ==========================================
function setupControls() {
  // Skip button click handler
  const skipBtn = document.getElementById('curtain-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissCurtain();
    });
  }

  // Wheel scroll down triggers instant curtain slide-up
  window.addEventListener('wheel', (e) => {
    if (!animState.curtainDismissed && e.deltaY > 5) {
      dismissCurtain();
    }
  }, { passive: true });

  // Touch swipe up triggers curtain slide-up on mobile
  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!animState.curtainDismissed && e.touches && e.touches[0]) {
      const diffY = touchStartY - e.touches[0].clientY;
      if (diffY > 15) {
        dismissCurtain();
      }
    }
  }, { passive: true });

  // Click on stage area: if nearing the end or already done, dismiss; otherwise toggle pause/play
  if (dom.stageArea) {
    dom.stageArea.addEventListener('click', (e) => {
      if (e.target.closest('#curtain-skip-btn')) return;
      sfx.init();
      if (!animState.curtainDismissed && animState.time >= 3.8) {
        dismissCurtain();
      } else if (!animState.curtainDismissed) {
        setPlayState(!animState.playing);
      }
    });
  }

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    if (!animState.curtainDismissed) {
      if (['Escape', 'ArrowDown', 'PageDown', 'Enter'].includes(e.code)) {
        e.preventDefault();
        dismissCurtain();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPlayState(!animState.playing);
        return;
      }
    }
  });

  // Logo button: if at top and dismissed, replay intro curtain; otherwise scroll to top
  const brandLogo = document.getElementById('brand-logo-btn');
  if (brandLogo) {
    brandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      if (animState.curtainDismissed && window.scrollY < 120) {
        replayCurtain();
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // Sticky Navbar state on scroll
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (dom.navbar) {
      if (scrollY > 30) {
        dom.navbar.classList.add('scrolled');
      } else {
        dom.navbar.classList.remove('scrolled');
      }
    }
  }, { passive: true });
}

// ==========================================
// 5. Intelligent OS Detection & Downloads
// ==========================================
function setupOSDetection() {
  const ua = window.navigator.userAgent.toLowerCase();
  let detected = 'mac'; // Default fallback

  if (ua.includes('win')) {
    detected = 'win';
  } else if (ua.includes('linux') || ua.includes('x11')) {
    detected = 'linux';
  } else if (ua.includes('mac') || ua.includes('darwin')) {
    detected = 'mac';
  }

  const osConfig = {
    mac: {
      name: 'macOS (Apple Silicon)',
      file: 'tiya_0.4.0_aarch64.dmg',
      url: 'https://github.com/saqib40/tiya/releases/download/v0.4.0/tiya_0.4.0_aarch64.dmg',
      icon: `<svg viewBox="0 0 384 512" width="18" height="18" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.59c0 62.6 24 121 57.7 166.5 17 22.7 36 46.9 59.5 46.4 23.7-.4 32.6-17.3 61.1-17.3 27.8 0 36 17.3 60.6 17.3 24.5-.5 41.9-22 58.4-45.4 17.7-25.3 25.2-49.7 26.1-51.6-59.8-31-68.7-115.2-69.1-120.8zM242.5 100.9c13.7-21.2 21.8-42.3 17-62.8-19.4 1.5-44 12.6-61 37.8-13.8 21.2-23.5 46.1-17.6 65.8 22.7 1.2 46.9-16.7 61.6-40.8zm0 0"/></svg>`
    },
    win: {
      name: 'Windows (x64)',
      file: 'tiya_0.4.0_x64-setup.exe',
      url: 'https://github.com/saqib40/tiya/releases/download/v0.4.0/tiya_0.4.0_x64-setup.exe',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 12V6.75L9 5.43V11.91L3 12ZM20 4.12L10 5.33V11.86L20 12V4.12ZM3 13L9 13.09V19.9L3 18.75V13ZM20 13.1V20.78L10 19.98V13.15L20 13.1Z"/></svg>`
    },
    linux: {
      name: 'Linux (.deb / AppImage)',
      file: 'tiya_0.4.0_amd64.deb',
      url: 'https://github.com/saqib40/tiya/releases/download/v0.4.0/tiya_0.4.0_amd64.deb',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.06 12.32a7.13 7.13 0 0 0-3.31-2.13c.44-1 .93-1.8 1.58-2.47c2-2.18 1.53-4.06.9-5.31c-.69-1.41-2.13-2.31-3.84-2.37a7.57 7.57 0 0 0-3.06.75a6.88 6.88 0 0 0-3.09-.75c-1.69.06-3.13 1-3.81 2.37c-.63 1.28-1.06 3.16.91 5.31c.62.66 1.12 1.47 1.56 2.47a7.13 7.13 0 0 0-3.31 2.13c-2 2.4-1.81 5.21-1.34 7.06c.22 1.1.6 2.32 1.59 3.66a8.84 8.84 0 0 0 3.28 2.9c1.82.89 4.23.89 5.63 0a9.42 9.42 0 0 0 3.28-2.9c1-1.35 1.37-2.57 1.59-3.66c.47-1.85.63-4.66-1.4-7.06m-4.84 9.12c-.66.22-1.75.34-3.22.34s-2.56-.12-3.22-.34a7.91 7.91 0 0 1-2.62-2a14.69 14.69 0 0 1-1.31-2.84a5 5 0 0 1-.34-1.44c-.16-1.06-.09-2.63 1.09-4.06a5.78 5.78 0 0 1 2.62-1.72a7.44 7.44 0 0 1-.59-2.06A3.4 3.4 0 0 1 8 6.22c.38-.72.91-1 1.53-1s1.34.38 1.69 1a5.88 5.88 0 0 1 1.06 2.65h.56A5.88 5.88 0 0 1 13.94 6.22c.38-.72.91-1 1.53-1s1.34.38 1.69 1a3.4 3.4 0 0 1 .41 1.09a7.44 7.44 0 0 1-.59 2.06a5.78 5.78 0 0 1 2.62 1.72c1.22 1.43 1.25 3 1.09 4.06a5 5 0 0 1-.34 1.44a14.69 14.69 0 0 1-1.31 2.84a7.91 7.91 0 0 1-2.62 2M9.87 15a1.66 1.66 0 1 1 1.66-1.66A1.66 1.66 0 0 1 9.87 15m5.82-1.66a1.66 1.66 0 1 1-1.66 1.66a1.66 1.66 0 0 1 1.66-1.66z"/></svg>`
    }
  };

  const current = osConfig[detected];

  // Update primary download CTA
  if (dom.primaryDownloadBtn && current) {
    dom.primaryDownloadBtn.href = current.url;
    dom.primaryDownloadBtn.innerHTML = `
      <span class="btn-icon">${current.icon}</span>
      <span class="btn-text">
        <span class="btn-subtext">Download for ${current.name}</span>
        <span class="btn-maintext">Get Tiya v0.4.0</span>
      </span>
      <span class="btn-badge">~80 MB</span>
    `;
  }

  // Highlight active OS card in download section
  const osCards = document.querySelectorAll('.os-download-card');
  osCards.forEach(card => {
    if (card.dataset.os === detected) {
      card.classList.add('recommended-os');
      const badge = card.querySelector('.os-tag');
      if (badge) badge.textContent = 'Detected for your OS';
    }
  });

  // OS Tab switcher
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetOS = btn.dataset.os;

      osCards.forEach(card => {
        if (targetOS === 'all' || card.dataset.os === targetOS) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// ==========================================
// 6. Interactive Feature Tour & Showcase Pins
// ==========================================
function setupShowcaseInteractions() {
  const hotspotPins = document.querySelectorAll('.hotspot-pin');
  const featurePills = document.querySelectorAll('.feature-tour-pill');
  const calloutBox = document.getElementById('tour-callout');
  const calloutTitle = document.getElementById('tour-callout-title');
  const calloutDesc = document.getElementById('tour-callout-desc');

  const tourData = {
    editor: {
      title: "Monaco Editor Core",
      desc: "Full syntax highlighting, bracket colorization, multi-cursor editing, and bundled high-readability typography."
    },
    synctex: {
      title: "Bidirectional SyncTeX",
      desc: "Instant navigation between source code line and compiled PDF coordinate. Never lose your editing position."
    },
    tectonic: {
      title: "Embedded Tectonic Engine",
      desc: "Zero-configuration Rust compiler. Auto-fetches missing CTAN packages on demand and streams diagnostics in real-time."
    },
    preview: {
      title: "High-DPI PDF Previewer",
      desc: "Real-time rendering, smooth page zooming, text selection, and instantaneous re-rendering on file save."
    }
  };

  function activateTourItem(key) {
    featurePills.forEach(p => p.classList.toggle('active', p.dataset.target === key));
    hotspotPins.forEach(pin => pin.classList.toggle('active', pin.dataset.target === key));

    if (tourData[key] && calloutTitle && calloutDesc && calloutBox) {
      calloutTitle.textContent = tourData[key].title;
      calloutDesc.textContent = tourData[key].desc;
      calloutBox.classList.add('highlight-pulse');
      setTimeout(() => calloutBox.classList.remove('highlight-pulse'), 400);
    }
  }

  featurePills.forEach(pill => {
    pill.addEventListener('click', () => {
      activateTourItem(pill.dataset.target);
    });
  });

  hotspotPins.forEach(pin => {
    pin.addEventListener('click', () => {
      activateTourItem(pin.dataset.target);
    });
  });
}

// ==========================================
// 7. Copy-to-Clipboard Helpers
// ==========================================
function setupCopyButtons() {
  function copyTextWithFeedback(btn, text) {
    if (!navigator.clipboard) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span>Copied!</span>
    `;
    btn.classList.add('copied');

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('copied');
    }, 2200);
  }

  if (dom.copyMacBtn && dom.macCodeBlock) {
    dom.copyMacBtn.addEventListener('click', () => {
      copyTextWithFeedback(dom.copyMacBtn, 'xattr -cr /Applications/Tiya.app');
    });
  }

  if (dom.copyGitBtn && dom.gitCloneBlock) {
    dom.copyGitBtn.addEventListener('click', () => {
      const gitCmd = `git clone https://github.com/saqib40/tiya.git\ncd tiya\nnpm install\nnpm run tauri dev`;
      copyTextWithFeedback(dom.copyGitBtn, gitCmd);
    });
  }
}

// ==========================================
// 8. Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initDOMRefs();
  setupControls();
  setupOSDetection();
  setupShowcaseInteractions();
  setupCopyButtons();

  // Start animation loop
  requestAnimationFrame(tick);
  updateFrame(0);
});
