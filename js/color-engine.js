/**
 * ChromaFloor - 2D Color-Field Positioning Engine
 * Maps stage coordinates (0..1, 0..1) to human-distinguishable 2D color zones,
 * landmarks, distances, and walking directions.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChromaColorEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // 8 Columns (Left to Right): A -> H
  const ZONE_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const DEFAULT_EVENT_NAME = 'BangFace';

  // BangFace Default Venue Configuration
  const DEFAULT_ROOMS = [
    {
      id: 'main',
      name: 'Bang Room',
      widthMeters: 40,
      depthMeters: 50,
      shape: 'stage',
      palette: 'wheel',
      landmarks: [
        { id: 'lm-mwi0tw2e-8w0v', name: 'Stage', type: 'stage', icon: '🎸', x: 0.529, y: 0.077 },
        { id: 'lm-mwi0u9ze-ylkc', name: 'Toilets', type: 'wc', icon: '🚻', x: 0.102, y: 0.057 },
        { id: 'lm-mwi0ujd8-t1ef', name: 'Entrance', type: 'entrance', icon: '🚪', x: 0.156, y: 0.954 },
        { id: 'lm-mwi0v5g4-5kl9', name: 'Bar', type: 'bar', icon: '🍸', x: 0.483, y: 0.944 },
        { id: 'lm-mwi0vfg8-c9l9', name: 'Speaker', type: 'speaker', icon: '🔊', x: 0.798, y: 0.119 },
        { id: 'lm-mwi0vhv8-gq13', name: 'Speaker', type: 'speaker', icon: '🔊', x: 0.278, y: 0.122 }
      ]
    },
    {
      id: 'room-mwi0xgct-jj5s',
      name: 'Face Room',
      widthMeters: 70,
      depthMeters: 50,
      shape: 'stage',
      palette: 'wheel',
      landmarks: []
    },
    {
      id: 'room-mwi0zas0-exgz',
      name: 'Hard Crew upstairs',
      widthMeters: 70,
      depthMeters: 50,
      shape: 'stage',
      palette: 'wheel',
      landmarks: [
        { id: 'lm-mwi0zi9v-gigz', name: 'Entrance', type: 'entrance', icon: '🚪', x: 0.854, y: 0.91 },
        { id: 'lm-mwi0zyor-0hsy', name: 'Bar', type: 'bar', icon: '🍸', x: 0.943, y: 0.543 },
        { id: 'lm-mwi1091x-rqzg', name: 'Bar', type: 'bar', icon: '🍸', x: 0.057, y: 0.5 },
        { id: 'lm-mwi10j37-t3bn', name: 'Toilets', type: 'wc', icon: '🚻', x: 0.045, y: 0.805 },
        { id: 'lm-mwi10oav-y99e', name: 'Stage', type: 'stage', icon: '🎸', x: 0.515, y: 0.043 },
        { id: 'lm-mwi10zzw-t3gv', name: 'Exit', type: 'custom', icon: '🏷️', x: 0.059, y: 0.936 }
      ]
    }
  ];

  // Fixture Catalog for Drag & Drop and Palette
  const FIXTURE_TYPES = {
    stage: { label: 'Stage', defaultName: 'Stage', icon: '🎸' },
    dj: { label: 'DJ Booth', defaultName: 'DJ Booth', icon: '🎧' },
    bar: { label: 'Bar', defaultName: 'Bar', icon: '🍸' },
    booth: { label: 'Sound Desk', defaultName: 'Sound Desk', icon: '🎛️' },
    speaker: { label: 'Speaker', defaultName: 'Speaker Stack', icon: '🔊' },
    entrance: { label: 'Entrance', defaultName: 'Entrance', icon: '🚪' },
    wc: { label: 'Toilets', defaultName: 'Toilets', icon: '🚻' },
    water: { label: 'Water', defaultName: 'Water Point', icon: '💧' },
    cloak: { label: 'Cloakroom', defaultName: 'Cloakroom', icon: '🧥' },
    chill: { label: 'Chill / VIP', defaultName: 'Chill Area', icon: '🌿' },
    pillar: { label: 'Pillar', defaultName: 'Pillar', icon: '🏛️' },
    custom: { label: 'Custom', defaultName: 'Landmark', icon: '🏷️' }
  };

  /**
   * Builds a room preset from a template key
   */
  function buildRoomFromTemplate(templateKey, opts) {
    const opt = opts || {};
    const id = opt.id || ('room-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));
    const name = opt.name || 'New Room';
    const widthMeters = Number(opt.widthMeters) || 40;
    const depthMeters = Number(opt.depthMeters) || 50;
    const shape = opt.shape || 'stage';
    const palette = opt.palette || 'wheel';

    let landmarks = [];
    switch (templateKey) {
      case 'blank':
        landmarks = [];
        break;
      case 'club':
        landmarks = [
          { id: 'lm-stage', name: 'Stage', type: 'stage', icon: FIXTURE_TYPES.stage.icon, x: 0.50, y: 0.08 },
          { id: 'lm-dj', name: 'DJ Booth', type: 'dj', icon: FIXTURE_TYPES.dj.icon, x: 0.50, y: 0.16 },
          { id: 'lm-bar', name: 'Bar', type: 'bar', icon: FIXTURE_TYPES.bar.icon, x: 0.12, y: 0.52 },
          { id: 'lm-wc', name: 'Toilets', type: 'wc', icon: FIXTURE_TYPES.wc.icon, x: 0.88, y: 0.56 },
          { id: 'lm-entry', name: 'Entrance', type: 'entrance', icon: FIXTURE_TYPES.entrance.icon, x: 0.50, y: 0.92 }
        ];
        break;
      case 'festival':
        landmarks = [
          { id: 'lm-mainstage', name: 'Main Stage', type: 'stage', icon: FIXTURE_TYPES.stage.icon, x: 0.50, y: 0.07 },
          { id: 'lm-lstack', name: 'Left Stack', type: 'speaker', icon: FIXTURE_TYPES.speaker.icon, x: 0.18, y: 0.14 },
          { id: 'lm-rstack', name: 'Right Stack', type: 'speaker', icon: FIXTURE_TYPES.speaker.icon, x: 0.82, y: 0.14 },
          { id: 'lm-foh', name: 'Sound Desk', type: 'booth', icon: FIXTURE_TYPES.booth.icon, x: 0.50, y: 0.48 },
          { id: 'lm-bar', name: 'Bar', type: 'bar', icon: FIXTURE_TYPES.bar.icon, x: 0.10, y: 0.56 },
          { id: 'lm-water', name: 'Water Point', type: 'water', icon: FIXTURE_TYPES.water.icon, x: 0.90, y: 0.52 },
          { id: 'lm-entry', name: 'Entrance', type: 'entrance', icon: FIXTURE_TYPES.entrance.icon, x: 0.50, y: 0.92 }
        ];
        break;
      case 'boiler':
        landmarks = [
          { id: 'lm-dj360', name: '360° DJ Booth', type: 'dj', icon: FIXTURE_TYPES.dj.icon, x: 0.50, y: 0.50 },
          { id: 'lm-nbar', name: 'North Bar', type: 'bar', icon: FIXTURE_TYPES.bar.icon, x: 0.50, y: 0.12 },
          { id: 'lm-sbar', name: 'Side Bar', type: 'bar', icon: FIXTURE_TYPES.bar.icon, x: 0.12, y: 0.50 },
          { id: 'lm-chill', name: 'Chill Area', type: 'chill', icon: FIXTURE_TYPES.chill.icon, x: 0.86, y: 0.50 },
          { id: 'lm-entry', name: 'Entrance', type: 'entrance', icon: FIXTURE_TYPES.entrance.icon, x: 0.50, y: 0.92 }
        ];
        break;
      default:
        landmarks = [];
        break;
    }

    return {
      id,
      name,
      widthMeters,
      depthMeters,
      shape,
      palette,
      landmarks
    };
  }

  /**
   * Finds the primary stage/DJ landmark in room or returns default stage origin
   */
  function getStageOrigin(room) {
    const landmarks = (room && Array.isArray(room.landmarks)) ? room.landmarks : [];
    const stageLm = landmarks.find(lm => lm.type === 'stage') || landmarks.find(lm => lm.type === 'dj');
    if (stageLm) {
      return {
        x: stageLm.x,
        y: stageLm.y,
        hasStage: true,
        name: stageLm.name
      };
    }
    return {
      x: 0.5,
      y: 0,
      hasStage: false,
      name: null
    };
  }

  /**
   * Converts HSL values to RGB tuple [0..255, 0..255, 0..255]
   */
  function hslToRgb(h, s, l) {
    const hNorm = ((h % 360) + 360) % 360;
    const sNorm = Math.max(0, Math.min(100, s)) / 100;
    const lNorm = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let rP = 0, gP = 0, bP = 0;
    if (hNorm < 60) { rP = c; gP = x; }
    else if (hNorm < 120) { rP = x; gP = c; }
    else if (hNorm < 180) { gP = c; bP = x; }
    else if (hNorm < 240) { gP = x; bP = c; }
    else if (hNorm < 300) { rP = x; bP = c; }
    else { rP = c; bP = x; }

    return [
      Math.max(0, Math.min(255, Math.round((rP + m) * 255))),
      Math.max(0, Math.min(255, Math.round((gP + m) * 255))),
      Math.max(0, Math.min(255, Math.round((bP + m) * 255)))
    ];
  }

  /**
   * Converts RGB array [r, g, b] to hex uppercase string '#RRGGBB'
   */
  function rgbToHex([r, g, b]) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * Relative luminance calculation based on WCAG 2.1 to pick dark or white text for maximum readability
   */
  function getTextColor([r, g, b]) {
    const sR = r / 255, sG = g / 255, sB = b / 255;
    const rLin = sR <= 0.03928 ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4);
    const gLin = sG <= 0.03928 ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4);
    const bLin = sB <= 0.03928 ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4);
    const lum = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
    return lum > 0.38 ? '#0E1012' : '#FFFFFF';
  }

  /**
   * Computes HSL tuple (h, s, l) for coordinate (x, y) given a palette mode.
   * Palettes:
   *  - 'wheel' (default): Archimedean spiral + smooth glowing Pearl core
   *  - 'polar': Classic radial color wheel + glowing Pearl core
   *  - 'prism': 2D diagonal chromatic wave field
   */
  function calculateHsl(x, y, palette) {
    const cx = Math.max(0, Math.min(1, Number.isFinite(Number(x)) ? Number(x) : 0));
    const cy = Math.max(0, Math.min(1, Number.isFinite(Number(y)) ? Number(y) : 0));
    const pal = palette || 'wheel';

    if (pal === 'prism') {
      const h = (cx * 250 + cy * 155 + 28 * Math.sin(cx * Math.PI * 2) * Math.cos(cy * Math.PI * 2) + 360) % 360;
      const s = Math.max(0, Math.min(100, 90 + 6 * Math.sin((cx + cy) * Math.PI)));
      const rawL = 68 - 28 * cy + 10 * Math.cos(cx * Math.PI * 2);
      const l = Math.max(32, Math.min(78, rawL));
      return { h: (h + 360) % 360, s, l };
    }

    // Radial calculation for 'wheel' and 'polar'
    const dx = (cx - 0.5) * 2;
    const dy = (cy - 0.5) * 2;
    const thetaRad = Math.atan2(dy, dx);
    const thetaDeg = thetaRad * (180 / Math.PI); // -180 .. 180
    const r = Math.hypot(dx, dy); // 0 at center, 1 at mid-walls, ~1.414 at corners

    let h = 0;
    if (pal === 'polar') {
      h = (thetaDeg + 90 + 360) % 360;
    } else {
      // Default: 'wheel' Archimedean Spiral
      h = (thetaDeg + 90 + r * 115 + 720) % 360;
    }

    // Smooth Singularity-Free Center (smoothstep)
    const tCore = Math.min(1, r / 0.20);
    const smoothCore = tCore * tCore * (3 - 2 * tCore);

    // Saturation: 8% luminous Pearl at center -> 96% vivid
    const s = 8 + 88 * smoothCore;

    // Lightness: 95% glowing Pearl at center -> 38% rich jewel perimeter
    const rNorm = Math.min(1, Math.pow(r / 1.28, 0.88));
    const l = Math.max(30, Math.min(96, 95 - 57 * rNorm));

    return {
      h: (h + 360) % 360,
      s,
      l
    };
  }

  /**
   * Determines color naming from HSL
   */
  function getColorNameFromHsl(h, s, l) {
    if (s < 16) {
      return 'Pearl White';
    }

    const normH = ((h % 360) + 360) % 360;

    let hueWord = 'Rose';
    if (normH >= 346 || normH < 13) {
      hueWord = 'Crimson';
    } else if (normH < 28) {
      hueWord = 'Coral';
    } else if (normH < 44) {
      hueWord = 'Tangerine';
    } else if (normH < 62) {
      hueWord = 'Gold';
    } else if (normH < 88) {
      hueWord = 'Lime';
    } else if (normH < 130) {
      hueWord = 'Emerald';
    } else if (normH < 162) {
      hueWord = 'Mint';
    } else if (normH < 188) {
      hueWord = 'Turquoise';
    } else if (normH < 210) {
      hueWord = 'Cyan';
    } else if (normH < 235) {
      hueWord = 'Azure';
    } else if (normH < 262) {
      hueWord = 'Cobalt';
    } else if (normH < 288) {
      hueWord = 'Indigo';
    } else if (normH < 316) {
      hueWord = 'Orchid';
    } else {
      hueWord = 'Rose';
    }

    let toneWord = 'Rich';
    if (s < 42) {
      toneWord = 'Pastel';
    } else if (l >= 74) {
      toneWord = 'Ice';
    } else if (l >= 60) {
      toneWord = 'Bright';
    } else if (l >= 46) {
      toneWord = 'Vivid';
    } else if (l >= 35) {
      toneWord = 'Rich';
    } else {
      toneWord = 'Deep';
    }

    return `${toneWord} ${hueWord}`;
  }

  /**
   * Comprehensive spot color resolution for any coordinate (x, y) with chosen palette
   */
  function getSpotColor(x, y, palette = 'wheel') {
    const cx = Math.max(0, Math.min(1, Number.isFinite(Number(x)) ? Number(x) : 0));
    const cy = Math.max(0, Math.min(1, Number.isFinite(Number(y)) ? Number(y) : 0));

    const { h, s, l } = calculateHsl(cx, cy, palette);
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb);
    const textColor = getTextColor(rgb);

    // 8x8 Grid Zone Code (A1 .. H8)
    const colIdx = Math.min(7, Math.max(0, Math.floor(cx * 8)));
    const rowIdx = Math.min(7, Math.max(0, Math.floor(cy * 8))) + 1;
    const colLetter = ZONE_COLUMNS[colIdx];
    const rowNumber = rowIdx;
    const zoneCode = `${colLetter}${rowNumber}`;

    // Color name derived accurately from HSL
    const colorName = getColorNameFromHsl(h, s, l);

    // Depth label
    let depthLabel = 'Back';
    if (cy < 0.16) depthLabel = 'Front Rail';
    else if (cy < 0.34) depthLabel = 'Front';
    else if (cy < 0.56) depthLabel = 'Mid-Floor';
    else if (cy < 0.78) depthLabel = 'Mid-Back';

    // Lateral side label
    let sideLabel = 'Right';
    if (cx < 0.25) sideLabel = 'Left';
    else if (cx < 0.42) sideLabel = 'Mid-Left';
    else if (cx < 0.58) sideLabel = 'Center';
    else if (cx < 0.75) sideLabel = 'Mid-Right';

    const fullPositionLabel = `${depthLabel} · ${sideLabel}`;

    return {
      x: cx,
      y: cy,
      h: Math.round(h * 10) / 10,
      s: Math.round(s * 10) / 10,
      l: Math.round(l * 10) / 10,
      rgb,
      hex,
      textColor,
      zoneCode,
      colLetter,
      rowNumber,
      colorName,
      sideLabel,
      depthLabel,
      fullPositionLabel,
      palette
    };
  }

  /**
   * Find nearest landmark in active room and compute human natural language phrase
   */
  function getNearestLandmark(x, y, room) {
    const cx = Math.max(0, Math.min(1, Number.isFinite(Number(x)) ? Number(x) : 0));
    const cy = Math.max(0, Math.min(1, Number.isFinite(Number(y)) ? Number(y) : 0));
    const landmarks = (room && Array.isArray(room.landmarks)) ? room.landmarks : [];

    let closest = null;
    let minDistance = Infinity;

    for (const lm of landmarks) {
      const d = Math.hypot(cx - lm.x, cy - lm.y);
      if (d < minDistance) {
        minDistance = d;
        closest = lm;
      }
    }

    if (!closest) {
      return { landmark: null, distance: Infinity, phrase: '' };
    }

    let phrase = `Toward ${closest.name}`;
    if (minDistance < 0.07) {
      phrase = `Right by ${closest.name}`;
    } else if (minDistance < 0.18) {
      phrase = `Near ${closest.name}`;
    }

    return {
      landmark: closest,
      distance: Math.round(minDistance * 1000) / 1000,
      phrase
    };
  }

  /**
   * Calculate walking vector, real-world distance in meters, step counts,
   * natural direction instructions, and color shifts.
   */
  function getWalkingDirections(fromSpot, toSpot, room) {
    const actualFrom = fromSpot || { x: 0.50, y: 0.92 };
    const actualTo = toSpot || { x: 0.50, y: 0.50 };

    const widthM = (room && room.widthMeters) || 40;
    const depthM = (room && room.depthMeters) || 50;
    const palette = (room && room.palette) || 'wheel';

    const dxMeters = (actualTo.x - actualFrom.x) * widthM;
    const dyMeters = (actualTo.y - actualFrom.y) * depthM;
    const meters = Math.round(Math.hypot(dxMeters, dyMeters));
    const steps = Math.max(1, Math.round(meters / 0.75)); // Average festival crowd step = 0.75m

    const fb = dyMeters <= -3 ? 'Forward' : (dyMeters >= 3 ? 'Back' : '');
    const lr = dxMeters <= -3 ? 'Left' : (dxMeters >= 3 ? 'Right' : '');

    let move = 'Right here';
    if (fb && lr) move = `${fb}-${lr}`;
    else if (fb) move = `Straight ${fb}`;
    else if (lr) move = `${lr} across floor`;

    const stageOrigin = getStageOrigin(room);
    let toward = '';
    if (stageOrigin.hasStage) {
      const distFromStage = Math.hypot((actualFrom.x - stageOrigin.x) * widthM, (actualFrom.y - stageOrigin.y) * depthM);
      const distToStage = Math.hypot((actualTo.x - stageOrigin.x) * widthM, (actualTo.y - stageOrigin.y) * depthM);
      if (distToStage < distFromStage - 2) {
        toward = `toward ${stageOrigin.name}`;
      } else if (distToStage > distFromStage + 2) {
        toward = `away from ${stageOrigin.name}`;
      }
    }
    if (!toward) {
      toward = dyMeters < 0 ? 'toward Front' : (dyMeters > 0 ? 'toward Back' : '');
    }

    const towardStr = toward ? ` ${toward}` : '';
    const headline = meters <= 2
      ? 'You are right next to them!'
      : `${meters}m ${move}${towardStr}`;

    const directionLabel = meters <= 2
      ? 'At your spot'
      : `${meters}m (${steps} steps) ${move}`;

    const fromColor = getSpotColor(actualFrom.x, actualFrom.y, palette);
    const toColor = getSpotColor(actualTo.x, actualTo.y, palette);
    const nearest = getNearestLandmark(actualTo.x, actualTo.y, room);

    return {
      meters,
      steps,
      headline,
      directionLabel,
      fromColor,
      toColor,
      nearest
    };
  }

  /**
   * Generates offscreen canvas with smooth 2D gradient floor,
   * handling stage perspective flip, palette selection, and optional dome vignette.
   */
  function createFloorBackground(width, height, flipped, shape, palette = 'wheel') {
    const w = Math.max(16, Math.floor(width || 292));
    const h = Math.max(16, Math.floor(height || 272));

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const offCtx = off.getContext('2d');
    if (!offCtx) return off;

    const imgData = offCtx.createImageData(w, h);
    const data = imgData.data;
    let idx = 0;

    const isDome = shape === 'dome';

    for (let py = 0; py < h; py++) {
      const normY = Math.max(0, Math.min(1, flipped ? (1 - py / h) : (py / h)));

      for (let px = 0; px < w; px++) {
        const normX = Math.max(0, Math.min(1, flipped ? (1 - px / w) : (px / w)));
        const { h: hue, s, l } = calculateHsl(normX, normY, palette);
        let [r, g, b] = hslToRgb(hue, s, l);

        if (isDome) {
          // Circular / dome shading
          const dx = (px / w - 0.5) * 2;
          const dy = (py / h - 0.5) * 2;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 0.85) {
            const vig = Math.max(0.18, 1 - (dist2 - 0.85) * 1.5);
            r = Math.round(r * vig);
            g = Math.round(g * vig);
            b = Math.round(b * vig);
          }
        }

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
        idx += 4;
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    return off;
  }

  /**
   * Helper to draw crisp, subtle polar depth rings and optional grid lines on floor canvas overlay
   */
  function drawWheelGuides(ctx, w, h, opts = {}) {
    if (!ctx) return;
    const { showGrid = true, palette = 'wheel' } = opts;

    ctx.save();

    // Polar Depth Rings (3 subtle rings around center: 20%, 45%, 70% of radius)
    if (palette === 'wheel' || palette === 'polar') {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const minDim = Math.min(w, h);
      const radii = [minDim * 0.15, minDim * 0.32, minDim * 0.48];

      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.setLineDash([4, 6]);

      for (const r of radii) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Center crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // A1 - H8 Grid Lines
    if (showGrid) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.setLineDash([]);

      for (let i = 1; i < 8; i++) {
        // Vertical lines
        const gx = Math.round((i / 8) * w);
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();

        // Horizontal lines
        const gy = Math.round((i / 8) * h);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  return {
    DEFAULT_EVENT_NAME,
    ZONE_COLUMNS,
    DEFAULT_ROOMS,
    FIXTURE_TYPES,
    buildRoomFromTemplate,
    getStageOrigin,
    calculateHsl,
    getColorNameFromHsl,
    hslToRgb,
    rgbToHex,
    getTextColor,
    getSpotColor,
    getNearestLandmark,
    getWalkingDirections,
    createFloorBackground,
    drawWheelGuides
  };
});
