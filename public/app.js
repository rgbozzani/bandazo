const socket = io();

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

let state = {
  roomCode: null,
  isHost: false,
  myId: null,
  players: [],
  playlist: [],
  currentStage: 1,
  maxStage: 6,
  stages: [1, 2, 4, 7, 11, 16],
  solved: false,
  out: false,
  audioReady: false,
};

// ---------- Landing: tabs ----------
el('tab-create').onclick = () => {
  el('tab-create').classList.add('active');
  el('tab-join').classList.remove('active');
  show('panel-create');
  hide('panel-join');
};
el('tab-join').onclick = () => {
  el('tab-join').classList.add('active');
  el('tab-create').classList.remove('active');
  show('panel-join');
  hide('panel-create');
};

// Auto-fill join code from URL (?room=CODE)
const urlParams = new URLSearchParams(location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  el('tab-join').click();
  el('join-code').value = roomFromUrl.toUpperCase();
}

// ---------- Create / Join ----------
el('btn-create').onclick = () => {
  const name = el('create-name').value.trim();
  if (!name) return (el('create-error').textContent = 'Poné tu nombre.');
  el('btn-create').disabled = true;
  socket.emit('create-room', name, res => {
    el('btn-create').disabled = false;
    if (!res.ok) return (el('create-error').textContent = res.error);
    state.isHost = true;
    state.myId = res.you.id;
    enterLobby(res.room);
  });
};

el('btn-join').onclick = () => {
  const name = el('join-name').value.trim();
  const code = el('join-code').value.trim().toUpperCase();
  if (!name) return (el('join-error').textContent = 'Poné tu nombre.');
  if (!code) return (el('join-error').textContent = 'Poné el código de sala.');
  el('btn-join').disabled = true;
  socket.emit('join-room', { code, playerName: name }, res => {
    el('btn-join').disabled = false;
    if (!res.ok) return (el('join-error').textContent = res.error);
    state.isHost = false;
    state.myId = res.you.id;
    enterLobby(res.room);
  });
};

function enterLobby(room) {
  state.roomCode = room.code;
  hide('screen-landing');
  show('screen-lobby');
  el('lobby-code').textContent = room.code;
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  el('share-link').value = link;
  if (state.isHost) {
    show('host-playlist-card');
    hide('guest-wait-card');
    loadPacks();
  } else {
    hide('host-playlist-card');
    show('guest-wait-card');
  }
  renderRoom(room);
}

// ---------- Packs sugeridos ----------
function loadPacks() {
  socket.emit('list-packs', packs => {
    const wrap = el('pack-buttons');
    wrap.innerHTML = '';
    packs.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'secondary small';
      btn.type = 'button';
      btn.textContent = `${p.label} (${p.count})`;
      btn.onclick = () => addPack(p.id, p.label, btn);
      wrap.appendChild(btn);
    });
  });
}

function addPack(id, label, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Agregando…';
  el('pack-status').textContent = `Buscando canciones de "${label}"…`;
  socket.emit('add-pack', id, res => {
    btn.disabled = false;
    btn.textContent = original;
    if (!res.ok) {
      el('pack-status').textContent = res.error || 'No se pudo agregar el pack.';
      return;
    }
    let msg = `${label}: se agregaron ${res.added} canciones.`;
    if (res.skipped) msg += ` (${res.skipped} ya estaban en la lista)`;
    if (res.failed) msg += ` (${res.failed} no se encontraron)`;
    el('pack-status').textContent = msg;
  });
}

el('btn-copy-link').onclick = () => {
  el('share-link').select();
  navigator.clipboard?.writeText(el('share-link').value).catch(() => {});
  el('btn-copy-link').textContent = '¡Copiado!';
  setTimeout(() => (el('btn-copy-link').textContent = 'Copiar link'), 1500);
};

// ---------- Song search (host only) ----------
let searchTimer = null;
el('song-search').oninput = e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  el('song-results').innerHTML = '';
  if (!q) return;
  searchTimer = setTimeout(() => {
    socket.emit('search-songs', q, res => {
      if (!res.ok) return;
      el('song-results').innerHTML = '';
      res.results.forEach(song => {
        const div = document.createElement('div');
        div.className = 'song-item';
        div.innerHTML = `<img src="${song.artwork}" onerror="this.style.visibility='hidden'"/>
          <div class="meta"><div class="t">${escapeHtml(song.title)}</div><div class="a">${escapeHtml(song.artist)}</div></div>
          <button class="small secondary" type="button">Agregar</button>`;
        div.querySelector('button').onclick = () => {
          socket.emit('add-song', song);
        };
        el('song-results').appendChild(div);
      });
    });
  }, 350);
};

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

el('btn-start').onclick = () => socket.emit('start-game');
el('btn-next-round').onclick = () => socket.emit('next-round');

// ---------- Room updates ----------
socket.on('room-update', room => {
  state.players = room.players;
  state.playlist = room.playlist;
  renderRoom(room);
});

function renderRoom(room) {
  const playersHtml = room.players
    .map(p => `<li><span>${p.isHost ? '★ ' : ''}${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`)
    .join('');
  el('lobby-players').innerHTML = playersHtml;
  el('game-players').innerHTML = playersHtml;
  el('round-end-players').innerHTML = playersHtml;

  const plHtml = room.playlist
    .map(
      (s, i) =>
        `<div class="song-item"><img src="${s.artwork}" onerror="this.style.visibility='hidden'"/>
        <div class="meta"><div class="t">${escapeHtml(s.title)}</div><div class="a">${escapeHtml(s.artist)}</div></div>
        ${state.isHost && room.state === 'lobby' ? `<button class="small secondary" data-i="${i}">Quitar</button>` : ''}
        </div>`
    )
    .join('');
  el('playlist-list').innerHTML = plHtml;
  el('playlist-list-guest').innerHTML = plHtml || '<p class="muted">Aún no hay canciones.</p>';
  el('playlist-list').querySelectorAll('button[data-i]').forEach(btn => {
    btn.onclick = () => socket.emit('remove-song', Number(btn.dataset.i));
  });

  if (state.isHost) {
    el('btn-start').disabled = room.playlist.length === 0;
    el('start-hint').textContent =
      room.playlist.length === 0 ? 'Agregá al menos una canción para empezar.' : `${room.playlist.length} canción(es) en la playlist.`;
  }
}

// ---------- Game flow ----------
socket.on('round-start', data => {
  hide('screen-lobby');
  hide('screen-round-end');
  show('screen-game');

  state.currentStage = 1;
  state.solved = false;
  state.out = false;
  state.maxStage = data.maxStage;
  state.stages = data.stages;

  el('round-badge').textContent = `Ronda ${data.roundIndex + 1} de ${data.totalRounds}`;
  el('grace-note-top').textContent = '';
  el('guess-input').value = '';
  el('guess-input').disabled = false;
  el('btn-guess').disabled = false;
  el('btn-skip').disabled = false;
  el('guess-feedback').textContent = '';
  hide('grace-note');
  el('feed').innerHTML = '';

  const audio = el('audio');
  audio.src = data.previewUrl;
  audio.currentTime = 0;
  state.audioReady = true;

  renderStageDots();
});

function renderStageDots() {
  const wrap = el('stage-dots');
  wrap.innerHTML = '';
  for (let i = 1; i <= state.maxStage; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < state.currentStage ? ' filled' : '') + (i === state.currentStage ? ' current' : '');
    wrap.appendChild(d);
  }
}

el('btn-play').onclick = () => {
  const audio = el('audio');
  if (!state.audioReady) return;
  const seconds = state.stages[Math.min(state.currentStage, state.stages.length) - 1];
  audio.currentTime = 0;
  audio
    .play()
    .then(() => {
      const stopAt = seconds * 1000;
      clearTimeout(audio._stopTimer);
      audio._stopTimer = setTimeout(() => audio.pause(), stopAt);
    })
    .catch(() => {});
};

function lockGuessUI(disabled) {
  el('guess-input').disabled = disabled;
  el('btn-guess').disabled = disabled;
  el('btn-skip').disabled = disabled;
}

el('btn-guess').onclick = submitGuess;
el('guess-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitGuess();
});
function submitGuess() {
  const text = el('guess-input').value.trim();
  if (!text) return;
  socket.emit('player-guess', text);
  el('guess-input').value = '';
}

el('btn-skip').onclick = () => socket.emit('player-skip');

socket.on('your-progress', data => {
  state.currentStage = data.stage;
  renderStageDots();
  if (data.solved) {
    state.solved = true;
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--good)';
    el('guess-feedback').textContent = '¡Correcto! Esperá a que termine la ronda.';
  } else if (data.out) {
    state.out = true;
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--bad)';
    el('guess-feedback').textContent = 'Se acabaron tus intentos para esta ronda.';
  } else if (data.wrong) {
    el('guess-feedback').style.color = 'var(--bad)';
    el('guess-feedback').textContent = 'No es esa. Se reveló más del clip.';
  }
});

socket.on('player-correct', data => {
  const item = document.createElement('div');
  item.className = 'item' + (data.isFirst ? ' win' : '');
  item.textContent = `${data.playerName} acertó ${data.isFirst ? '¡primero! ' : ''}(+${data.points} pts)`;
  el('feed').prepend(item);
});

socket.on('grace-period', data => {
  show('grace-note');
  const note = el('grace-note');
  const tick = () => {
    const remaining = Math.max(0, Math.round((data.endsAt - Date.now()) / 1000));
    note.textContent = `Alguien ya acertó. Quedan ${remaining}s para que el resto adivine.`;
    el('grace-note-top').textContent = `⏱ ${remaining}s`;
    if (remaining > 0) requestAnimationFrame(() => setTimeout(tick, 250));
  };
  tick();
});

socket.on('round-end', data => {
  hide('screen-game');
  show('screen-round-end');
  el('reveal-artwork').src = data.artwork;
  el('reveal-title').textContent = data.title;
  el('reveal-artist').textContent = data.artist;
  const playersHtml = data.players
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(p => `<li><span>${p.isHost ? '★ ' : ''}${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`)
    .join('');
  el('round-end-players').innerHTML = playersHtml;

  if (state.isHost) {
    show('btn-next-round');
    hide('wait-host-note');
    el('btn-next-round').textContent = data.isLastRound ? 'Ver resultados finales' : 'Siguiente ronda';
  } else {
    hide('btn-next-round');
    show('wait-host-note');
  }
});

socket.on('game-end', data => {
  hide('screen-round-end');
  hide('screen-game');
  show('screen-final');
  const sorted = data.players.slice().sort((a, b) => b.score - a.score);
  el('final-players').innerHTML = sorted
    .map(
      (p, i) =>
        `<li class="${i === 0 ? 'first' : ''}"><span>${i === 0 ? '🏆 ' : `${i + 1}. `}${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`
    )
    .join('');
});
