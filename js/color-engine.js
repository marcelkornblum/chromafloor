/**
 * ChromaFloor - 2D Color-Field Positioning Engine
 * Maps stage coordinates (0..1, 0..1) to human-distinguishable color zones,
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

  // 11 Hue anchor stops across floor width (X: 0.0 -> 1.0)
  // Perceptually spaced so spectral transitions (Red -> Amber -> Lime -> Cyan -> Azure -> Cobalt -> Violet -> Rose) are distinct
  const HUE_STOPS = [
    { x: 0.00, h: 0 },
    { x: 0.12, h: 24 },
    { x: 0.23, h: 48 },
    { x: 0.35, h: 92 },
    { x: 0.47, h: 152 },
    { x: 0.58, h: 188 },
    { x: 0.68, h: 206 },
    { x: 0.78, h: 224 },
    { x: 0.89, h: 262 },
    { x: 0.97, h: 322 },
    { x: 1.00, h: 330 }
  ];

  const HUE_WORDS = [
    'Crimson', // 0
    'Coral',   // 1
    'Amber',   // 2
    'Lime',    // 3
    'Mint',    // 4
    'Cyan',    // 5
    'Azure',   // 6
    'Cobalt',  // 7
    'Violet',  // 8
    'Rose'     // 9
  ];

  // 8 Columns (Left to Right): A -> H
  const ZONE_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Clean Default Customizable Room
  const DEFAULT_ROOMS = [
    {
      id: 'main',
      name: 'Main Room',
      shape: 'stage',
      widthMeters: 40,
      depthMeters: 50,
      landmarks: [
        { id: 'lm-stage', name: 'Stage', type: 'stage', icon: '🎸', x: 0.50, y: 0.08 },
        { id: 'lm-foh', name: 'Sound Desk', type: 'booth', icon: '🎛️', x: 0.50, y: 0.48 },
        { id: 'lm-bar', name: 'Bar', type: 'bar', icon: '🍸', x: 0.12, y: 0.54 },
        { id: 'lm-wc', name: 'Toilets', type: 'wc', icon: '🚻', x: 0.88, y: 0.54 },
        { id: 'lm-entry', name: 'Entrance', type: 'entrance', icon: '🚪', x: 0.50, y: 0.92 }
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
   * Interpolate hue degrees [0..360] across floor width x [0..1]
   */
  function interpolateHue(x) {
    const cx = Math.max(0, Math.min(1, Number.isFinite(Number(x)) ? Number(x) : 0));
    if (cx <= HUE_STOPS[0].x) return HUE_STOPS[0].h;
    const last = HUE_STOPS[HUE_STOPS.length - 1];
    if (cx >= last.x) return last.h;

    for (let i = 0; i < HUE_STOPS.length - 1; i++) {
      const s0 = HUE_STOPS[i];
      const s1 = HUE_STOPS[i + 1];
      if (cx >= s0.x && cx <= s1.x) {
        const t = (cx - s0.x) / (s1.x - s0.x);
        return s0.h + t * (s1.h - s0.h);
      }
    }
    return 0;
  }

  /**
   * Calculate Saturation and Lightness percentages from depth y [0..1]
   * y=0 is Front / Stage (brighter, lighter), y=1 is Back / Entrance (deeper, darker)
   */
  function getSaturationAndLightness(y) {
    const cy = Math.max(0, Math.min(1, Number.isFinite(Number(y)) ? Number(y) : 0));
    if (cy <= 0.5) {
      const t = cy / 0.5;
      return {
        s: 92 + t * 4,           // 92% -> 96%
        l: 80 + t * (53 - 80)    // 80% (light pastel / ice) -> 53% (vivid core)
      };
    }
    const t = (cy - 0.5) / 0.5;
    return {
      s: 96 + t * (88 - 96),     // 96% -> 88%
      l: 53 + t * (26 - 53)      // 53% -> 26% (deep / midnight)
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
   * Comprehensive spot color resolution for any coordinate (x, y)
   */
  function getSpotColor(x, y) {
    const cx = Math.max(0, Math.min(1, Number.isFinite(Number(x)) ? Number(x) : 0));
    const cy = Math.max(0, Math.min(1, Number.isFinite(Number(y)) ? Number(y) : 0));

    const h = interpolateHue(cx);
    const { s, l } = getSaturationAndLightness(cy);
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb);
    const textColor = getTextColor(rgb);

    // 8x8 Grid Zone Code (A1 .. H8)
    const colIdx = Math.min(7, Math.max(0, Math.floor(cx * 8)));
    const rowIdx = Math.min(7, Math.max(0, Math.floor(cy * 8))) + 1;
    const colLetter = ZONE_COLUMNS[colIdx];
    const rowNumber = rowIdx;
    const zoneCode = `${colLetter}${rowNumber}`;

    // Tone descriptor based on depth
    let toneWord = 'Midnight';
    if (cy < 0.22) toneWord = 'Ice';
    else if (cy < 0.40) toneWord = 'Bright';
    else if (cy < 0.62) toneWord = 'Vivid';
    else if (cy < 0.80) toneWord = 'Deep';

    // Hue descriptor based on lateral width
    const hueIdx = Math.min(9, Math.max(0, Math.floor(cx * 10)));
    const colorName = `${toneWord} ${HUE_WORDS[hueIdx]}`;

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
      fullPositionLabel
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

    const fromColor = getSpotColor(actualFrom.x, actualFrom.y);
    const toColor = getSpotColor(actualTo.x, actualTo.y);
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
   * handling stage perspective flip and optional dome vignette.
   */
  function createFloorBackground(width, height, flipped, shape) {
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
      const { s, l } = getSaturationAndLightness(normY);

      for (let px = 0; px < w; px++) {
        const normX = Math.max(0, Math.min(1, flipped ? (1 - px / w) : (px / w)));
        const hue = interpolateHue(normX);
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

  return {
    HUE_STOPS,
    HUE_WORDS,
    ZONE_COLUMNS,
    DEFAULT_ROOMS,
    FIXTURE_TYPES,
    buildRoomFromTemplate,
    getStageOrigin,
    interpolateHue,
    getSaturationAndLightness,
    hslToRgb,
    rgbToHex,
    getTextColor,
    getSpotColor,
    getNearestLandmark,
    getWalkingDirections,
    createFloorBackground
  };
});
