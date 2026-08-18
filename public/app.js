const socket = io();

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

let state = {
  myId: null,
  myName: null,
  players: [],
  currentStage: 1,
  maxStage: 6,
  stages: [1, 2, 4, 7, 11, 16],
  solved: false,
  out: false,
  audioReady: false,
};

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showScreen(id) {
  ['screen-landing', 'screen-already', 'screen-lobby', 'screen-game', 'screen-round-end', 'screen-final'].forEach(s => hide(s));
  show(id);
}

// ---------- Landing: lista de jugadores + tabla del mes ----------
socket.on('connect', () => {
  socket.emit('get-players', players => {
    const sel = el('player-select');
    players.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });
  loadStandings();
  loadHistory();
});

socket.on('standings-updated', monthly => renderStandings(monthly));
socket.on('history-updated', history => renderHistory(history));

function loadStandings() {
  socket.emit('get-standings', res => {
    if (res.ok) renderStandings(res.monthly);
  });
}

function loadHistory() {
  socket.emit('get-history', res => {
    if (res.ok) renderHistory(res.history);
  });
}

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function formatMonth(m) {
  const [y, mo] = (m || '').split('-');
  const idx = parseInt(mo, 10) - 1;
  if (!y || isNaN(idx) || !MONTH_NAMES[idx]) return m || '';
  return `${MONTH_NAMES[idx]} ${y}`;
}

function renderHistory(history) {
  const list = el('history-list');
  const empty = el('history-empty');
  if (!history || !history.length) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = history
    .map(
      h =>
        `<li><span class="month">${formatMonth(h.month)}</span><span class="winner">🏆 ${escapeHtml(h.winnerName)}</span><span class="total">${h.winnerScore} pts</span></li>`
    )
    .join('');
}

function renderStandings(monthly) {
  const list = el('standings-list');
  list.innerHTML = monthly.standings
    .map((p, i) => {
      const rankCls = i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1 + '.';
      return `<li class="${rankCls}"><span class="rank">${medal}</span><span class="name">${escapeHtml(p.name)}</span><span class="total">${p.total} pts</span></li>`;
    })
    .join('');
  el('standings-note').textContent = monthly.isMonthEnd
    ? 'Hoy es el último día hábil del mes: ¡se define el podio!'
    : `Acumulado de ${monthly.month}. El podio se arma el último día hábil del mes.`;
}

// ---------- Entrar a la partida de hoy ----------
el('btn-join').onclick = () => {
  const name = el('player-select').value;
  if (!name) return (el('join-error').textContent = 'Elegí tu nombre de la lista.');
  el('btn-join').disabled = true;
  socket.emit('join-today', name, res => {
    el('btn-join').disabled = false;
    if (!res.ok) return (el('join-error').textContent = res.error);
    state.myName = name;
    if (res.finished) {
      renderAlreadyPlayed(res.results);
      return;
    }
    state.players = res.room.players;
    renderLobby(res.room);
    if (res.current) {
      showScreen('screen-game');
      handleRoundStart(res.current);
    } else if (res.room.state === 'round-end') {
      showScreen('screen-round-end');
    } else {
      showScreen('screen-lobby');
    }
  });
};

function renderAlreadyPlayed(results) {
  el('already-results').innerHTML = results
    .map(p => `<li><span>${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`)
    .join('');
  showScreen('screen-already');
}

el('btn-already-back').onclick = () => {
  loadStandings();
  showScreen('screen-landing');
};

el('btn-final-back').onclick = () => {
  loadStandings();
  showScreen('screen-landing');
};

// ---------- Lobby ----------
function renderLobby(room) {
  el('lobby-date').textContent = room.date;
  el('song-count-text').textContent =
    room.songCount > 0 ? 'La canción de hoy está lista' : 'Preparando la canción de hoy…';
  el('lobby-players').innerHTML = room.players
    .map(p => `<li><span>${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`)
    .join('');
  el('btn-start').disabled = room.players.length === 0;
}

el('btn-start').onclick = () => socket.emit('start-game');
el('btn-next-round').onclick = () => socket.emit('next-round');

// ---------- Room updates ----------
socket.on('room-update', room => {
  state.players = room.players;
  if (room.state === 'lobby') renderLobby(room);
  renderPlayerLists();
});

function renderPlayerLists() {
  const html = state.players.map(p => `<li><span>${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`).join('');
  el('game-players').innerHTML = html;
  el('round-end-players').innerHTML = html;
}

// ---------- Game flow ----------
socket.on('round-start', data => {
  showScreen('screen-game');
  handleRoundStart(data);
});

function handleRoundStart(data) {
  state.currentStage = 1;
  state.solved = false;
  state.out = false;
  state.maxStage = data.maxStage;
  state.stages = data.stages;

  el('round-badge').textContent = data.totalRounds > 1 ? `Ronda ${data.roundIndex + 1} de ${data.totalRounds}` : '🎵 La canción de hoy';
  el('grace-note-top').textContent = '';
  el('guess-input').value = '';
  el('guess-input').disabled = false;
  el('btn-guess').disabled = false;
  el('btn-skip').disabled = false;
  el('guess-feedback').textContent = '';
  hide('grace-note');
  el('feed').innerHTML = '';
  hideSuggestions();

  const audio = el('audio');
  audio.src = data.previewUrl;
  audio.currentTime = 0;
  state.audioReady = true;

  renderStageDots();
}

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
  if (e.key === 'Escape') hideSuggestions();
});
function submitGuess() {
  const text = el('guess-input').value.trim();
  if (!text) return;
  socket.emit('player-guess', text);
  el('guess-input').value = '';
  hideSuggestions();
}

// ---------- Sugerencias de canciones al escribir (autocompletar) ----------
let suggestTimer = null;
el('guess-input').addEventListener('input', () => {
  clearTimeout(suggestTimer);
  const text = el('guess-input').value.trim();
  if (text.length <= 5) {
    hideSuggestions();
    return;
  }
  suggestTimer = setTimeout(() => {
    socket.emit('guess-suggest', text, res => {
      if (res && res.ok) renderSuggestions(res.results);
    });
  }, 300);
});

function renderSuggestions(results) {
  const box = el('guess-suggestions');
  if (!results || !results.length) {
    hideSuggestions();
    return;
  }
  box.innerHTML = results
    .map(
      r =>
        `<div class="sug-item" data-title="${escapeHtml(r.title)}">${escapeHtml(r.title)}<span class="artist">${escapeHtml(r.artist)}</span></div>`
    )
    .join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.sug-item').forEach(item => {
    item.onclick = () => {
      el('guess-input').value = item.dataset.title;
      hideSuggestions();
      el('guess-input').focus();
    };
  });
}

function hideSuggestions() {
  const box = el('guess-suggestions');
  box.classList.add('hidden');
  box.innerHTML = '';
}

document.addEventListener('click', e => {
  if (!e.target.closest('.guess-wrap')) hideSuggestions();
});

el('btn-skip').onclick = () => socket.emit('player-skip');

socket.on('your-progress', data => {
  state.currentStage = data.stage;
  renderStageDots();
  if (data.solved) {
    state.solved = true;
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--teal)';
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
  showScreen('screen-round-end');
  el('reveal-artwork').src = data.artwork;
  el('reveal-title').textContent = data.title;
  el('reveal-artist').textContent = data.artist;
  const playersHtml = data.players
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(p => `<li><span>${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`)
    .join('');
  el('round-end-players').innerHTML = playersHtml;
  el('btn-next-round').textContent = data.isLastRound ? 'Ver resultados finales' : 'Siguiente ronda';
});

socket.on('game-end', data => {
  showScreen('screen-final');
  const sorted = data.players.slice().sort((a, b) => b.score - a.score);
  el('final-players').innerHTML = sorted
    .map(
      (p, i) =>
        `<li class="${i === 0 ? 'first' : ''}"><span>${i === 0 ? '🏆 ' : `${i + 1}. `}${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`
    )
    .join('');

  if (data.monthly && data.monthly.isMonthEnd) {
    el('month-end-card').style.display = '';
    const top3 = data.monthly.standings.slice(0, 3);
    const stepClass = ['s1', 's2', 's3'];
    const medal = ['🥇', '🥈', '🥉'];
    // orden visual: 2do, 1ro, 3ro (podio), pero mantenemos el orden de datos top3[0..2]
    el('podium').innerHTML = top3
      .map(
        (p, i) =>
          `<div class="step ${stepClass[i]}"><span class="medal">${medal[i]}</span>${escapeHtml(p.name)}<div>${p.total} pts</div></div>`
      )
      .join('');
  } else {
    el('month-end-card').style.display = 'none';
  }

  if (data.history) renderHistory(data.history);
  loadStandings();
  loadHistory();
});
