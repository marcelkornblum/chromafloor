/**
 * ChromaFloor - Zero-Backend URL Hash State Protocol (#cf1=)
 * Encodes and decodes multi-user festival crew spots, custom venue settings,
 * and builds resilient group chat share messages.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChromaUrlState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Fixed baseline epoch (2023-11-14) to pack timestamps into small integer minutes
  const TS_EPOCH_MINUTES = 1700000000000;

  /**
   * Field sanitizers to prevent delimiter collision (: ; |) in user strings
   */
  function sanitizeField(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\|/g, '/')
      .replace(/;/g, ',')
      .replace(/:/g, '-');
  }

  function desanitizeField(str) {
    return str || '';
  }

  /**
   * Encodes state object into #cf1= hash string
   * Schema: #cf1=encodeURIComponent("eventName;activeRoomId;focusPinId;pins")
   * where pins is: "id:name:roomId:x1000:y1000:tsMin:colorName:note:lat:lng|..."
   */
  function encodeState(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') return '';

    const eventName = sanitizeField(stateObj.eventName || 'Festival');
    const activeRoomId = sanitizeField(stateObj.activeRoomId || 'main');
    const focusPinId = sanitizeField(stateObj.focusPinId || '');

    const rawPins = Array.isArray(stateObj.pins) ? stateObj.pins : [];
    // Limit to 20 pins to keep URL well within mobile browser bounds
    const packedPins = rawPins.slice(0, 20).map(p => {
      const id = sanitizeField(p.id || 'p');
      const name = sanitizeField(p.name || 'Friend');
      const roomId = sanitizeField(p.roomId || activeRoomId);
      const x1000 = Math.round(Math.max(0, Math.min(1, Number(p.x) || 0)) * 1000);
      const y1000 = Math.round(Math.max(0, Math.min(1, Number(p.y) || 0)) * 1000);

      // Relative timestamp in minutes from base epoch
      const tsMs = typeof p.ts === 'number' ? p.ts : Date.now();
      const tsMin = Math.max(0, Math.round((tsMs - TS_EPOCH_MINUTES) / 60000));

      const colorName = sanitizeField(p.colorName || '');
      const note = sanitizeField(p.note || '');
      const lat = p.lat !== undefined && p.lat !== null && !isNaN(p.lat) ? Number(p.lat).toFixed(6) : '';
      const lng = p.lng !== undefined && p.lng !== null && !isNaN(p.lng) ? Number(p.lng).toFixed(6) : '';

      return [id, name, roomId, x1000, y1000, tsMin, colorName, note, lat, lng].join(':');
    }).join('|');

    const payload = [eventName, activeRoomId, focusPinId, packedPins].join(';');
    return `#cf1=${encodeURIComponent(payload)}`;
  }

  /**
   * Decodes #cf1= hash string back into structured state object
   * Returns null if hash is invalid or malformed
   */
  function decodeHash(hashString) {
    if (!hashString || typeof hashString !== 'string') return null;

    const trimmed = hashString.trim();
    const prefixIdx = trimmed.indexOf('#cf1=');
    if (prefixIdx === -1) return null;

    const rawPayload = trimmed.slice(prefixIdx + 5);
    if (!rawPayload) return null;

    try {
      const decoded = decodeURIComponent(rawPayload);
      const parts = decoded.split(';');
      if (parts.length < 2) return null;

      const eventName = desanitizeField(parts[0]) || 'Festival';
      const activeRoomId = desanitizeField(parts[1]) || 'main';
      const focusPinId = desanitizeField(parts[2]) || '';
      const pinsRaw = parts[3] || '';

      const pins = [];
      if (pinsRaw.length > 0) {
        const pinEntries = pinsRaw.split('|');
        for (const entry of pinEntries) {
          if (!entry) continue;
          const f = entry.split(':');
          if (f.length < 5) continue;

          const id = desanitizeField(f[0]);
          const name = desanitizeField(f[1]);
          const roomId = desanitizeField(f[2]) || activeRoomId;
          const x = Math.max(0, Math.min(1, (parseInt(f[3], 10) || 0) / 1000));
          const y = Math.max(0, Math.min(1, (parseInt(f[4], 10) || 0) / 1000));

          const tsMin = parseInt(f[5], 10);
          const ts = !isNaN(tsMin) && tsMin > 0 ? (tsMin * 60000 + TS_EPOCH_MINUTES) : Date.now();

          const colorName = desanitizeField(f[6]);
          const note = desanitizeField(f[7]);
          const lat = (f[8] && f[8] !== '') ? parseFloat(f[8]) : null;
          const lng = (f[9] && f[9] !== '') ? parseFloat(f[9]) : null;

          pins.push({
            id,
            name,
            roomId,
            x,
            y,
            ts,
            colorName,
            note,
            lat,
            lng
          });
        }
      }

      return {
        eventName,
        activeRoomId,
        focusPinId,
        pins
      };
    } catch (err) {
      console.warn('[ChromaUrlState] Failed to decode hash:', err);
      return null;
    }
  }

  /**
   * Builds clean full URL that works identically on GitHub Pages, custom domain, and localhost
   */
  function buildShareUrl(stateObj) {
    const hash = encodeState(stateObj);
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin || '';
      const pathname = window.location.pathname || '/';
      return `${origin}${pathname}${hash}`;
    }
    return `https://marcelkornblum.github.io/chromafloor/${hash}`;
  }

  /**
   * Builds high-converting group chat message and concise preview
   * matching: 🌈 {name} is at {colorName} ({zoneCode}) [{hex}] · {room.name} ({eventName}) 📍 {nearestPhrase}{notePart} 👥 {crewCount} crew on floor 🔗 Open floor radar: {shareUrl}
   */
  function buildChatMessages(opts) {
    const opt = opts || {};
    const userPin = opt.userPin || { name: 'You', colorName: 'Deep Cyan', zoneCode: 'E6', hex: '#08CBCF' };
    const room = opt.room || { name: 'Main Stage' };
    const eventName = opt.eventName || 'Festival';
    const crewCount = Number.isFinite(opt.crewCount) ? opt.crewCount : 1;
    const shareUrl = opt.shareUrl || '';
    const nearestPhrase = opt.nearestPhrase || 'Toward Sound Desk';
    const note = (userPin.note || '').trim();

    const name = userPin.name || 'You';
    const colorName = userPin.colorName || 'Deep Cyan';
    const zoneCode = userPin.zoneCode || 'E6';
    const hex = userPin.hex || '#08CBCF';
    const roomName = room.name || 'Main Stage';

    const notePart = note ? ` · "${note}"` : '';
    const gpsPart = (userPin.lat && userPin.lng) ? ` 📡 GPS: ${userPin.lat.toFixed(5)},${userPin.lng.toFixed(5)}` : '';

    const previewText = `🌈 ${name} is at ${colorName} (${zoneCode}) [${hex}] · ${roomName} (${eventName}) 📍 ${nearestPhrase}${notePart} 👥 ${crewCount} crew on floor`;
    const fullMessage = `${previewText}${gpsPart}\n🔗 Open floor radar: ${shareUrl}`;

    return {
      previewText,
      fullMessage
    };
  }

  return {
    TS_EPOCH_MINUTES,
    sanitizeField,
    desanitizeField,
    encodeState,
    decodeHash,
    buildShareUrl,
    buildChatMessages
  };
});
