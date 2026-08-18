const socket = io();

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

let state = {
  currentStage: 1,
  maxStage: 6,
  stages: [1, 2, 4, 7, 11, 16],
  solved: false,
  out: false,
  audioReady: false,
  isPractice: false,
};

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showScreen(id) {
  ['screen-landing', 'screen-game', 'screen-final', 'screen-practice-end'].forEach(s => hide(s));
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

// ---------- Entrar a jugar la Bandletina de hoy (cada uno cuando quiere) ----------
el('btn-join').onclick = () => {
  const name = el('player-select').value;
  if (!name) return (el('join-error').textContent = 'Elegí tu nombre de la lista.');
  el('btn-join').disabled = true;
  socket.emit('join-today', name, res => {
    el('btn-join').disabled = false;
    if (!res.ok) return (el('join-error').textContent = res.error);
    state.isPractice = false;
    if (res.finished) {
      renderDayResult(res);
      return;
    }
    showScreen('screen-game');
    handleRoundStart(res);
  });
};

// ---------- Modo prueba (no cuenta para el puntaje) ----------
el('btn-practice').onclick = () => startPractice();
el('btn-practice-again').onclick = () => startPractice();
el('btn-practice-back').onclick = () => {
  state.isPractice = false;
  loadStandings();
  loadHistory();
  showScreen('screen-landing');
};

function startPractice() {
  el('btn-practice').disabled = true;
  el('btn-practice-again').disabled = true;
  socket.emit('start-practice', res => {
    el('btn-practice').disabled = false;
    el('btn-practice-again').disabled = false;
    if (!res.ok) {
      el('join-error').textContent = res.error;
      return;
    }
    state.isPractice = true;
    showScreen('screen-game');
    handleRoundStart({ previewUrl: res.previewUrl, maxStage: res.maxStage, stages: res.stages });
  });
}

socket.on('practice-progress', data => {
  state.currentStage = data.stage;
  renderStageDots();
  if (data.solved) {
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--teal)';
    el('guess-feedback').textContent = '¡Correcto!';
  } else if (data.out) {
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--bad)';
    el('guess-feedback').textContent = 'Se acabaron los intentos.';
  } else if (data.wrong) {
    el('guess-feedback').style.color = 'var(--bad)';
    el('guess-feedback').textContent = 'No es esa. Se reveló más del clip.';
  }
});

socket.on('practice-end', data => {
  el('practice-reveal-artwork').src = data.artwork;
  el('practice-reveal-title').textContent = data.title;
  el('practice-reveal-artist').textContent = data.artist;
  el('practice-result-note').textContent = data.solved ? '¡La acertaste! No suma puntos.' : 'Esta vez no. No resta puntos.';
  showScreen('screen-practice-end');
});

el('btn-final-back').onclick = () => {
  loadStandings();
  showScreen('screen-landing');
};

// ---------- Game flow ----------
function handleRoundStart(data) {
  state.currentStage = 1;
  state.solved = false;
  state.out = false;
  state.gaveUp = false;
  state.maxStage = data.maxStage;
  state.stages = data.stages;

  el('round-badge').textContent = state.isPractice ? '🎧 Prueba (no cuenta)' : '🎵 La canción de hoy';
  el('guess-input').value = '';
  el('guess-input').disabled = false;
  el('btn-guess').disabled = false;
  el('btn-skip').disabled = false;
  el('btn-give-up').disabled = false;
  el('guess-feedback').textContent = '';
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
  el('btn-give-up').disabled = disabled;
}

el('btn-guess').onclick = submitGuess;
el('guess-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitGuess();
  if (e.key === 'Escape') hideSuggestions();
});
function submitGuess() {
  const text = el('guess-input').value.trim();
  if (!text) return;
  socket.emit(state.isPractice ? 'practice-guess' : 'player-guess', text);
  el('guess-input').value = '';
  hideSuggestions();
}

// ---------- Sugerencias de canciones al escribir (autocompletar) ----------
let suggestTimer = null;
el('guess-input').addEventListener('input', () => {
  clearTimeout(suggestTimer);
  const text = el('guess-input').value.trim();
  if (text.length < 5) {
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

el('btn-skip').onclick = () => socket.emit(state.isPractice ? 'practice-skip' : 'player-skip');

el('btn-give-up').onclick = () => {
  if (state.isPractice) {
    state.isPractice = false;
    loadStandings();
    loadHistory();
    showScreen('screen-landing');
    return;
  }
  socket.emit('player-giveup');
  lockGuessUI(true);
  hideSuggestions();
};

socket.on('your-progress', data => {
  state.currentStage = data.stage;
  renderStageDots();
  if (data.solved) {
    state.solved = true;
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--teal)';
    el('guess-feedback').textContent = '¡Correcto!';
  } else if (data.out) {
    state.out = true;
    lockGuessUI(true);
    el('guess-feedback').style.color = 'var(--bad)';
    el('guess-feedback').textContent = data.gaveUp ? 'Te rendiste.' : 'Se acabaron tus intentos.';
  } else if (data.wrong) {
    el('guess-feedback').style.color = 'var(--bad)';
    el('guess-feedback').textContent = 'No es esa. Se reveló más del clip.';
  }
});

// ---------- Resultado del día: recién terminaste tu ronda, o ya habías jugado hoy ----------
socket.on('day-result', data => renderDayResult(data));

function renderDayResult(data) {
  showScreen('screen-final');
  el('reveal-artwork').src = data.artwork;
  el('reveal-title').textContent = data.title;
  el('reveal-artist').textContent = data.artist;
  el('final-your-score').textContent =
    data.yourScore > 0 ? `Sumaste ${data.yourScore} pts hoy.` : 'No sumaste puntos hoy.';

  const sorted = data.results.slice().sort((a, b) => b.score - a.score);
  el('final-players').innerHTML = sorted
    .map(
      (p, i) =>
        `<li class="${i === 0 && p.score > 0 ? 'first' : ''}"><span>${i === 0 && p.score > 0 ? '🏆 ' : `${i + 1}. `}${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`
    )
    .join('');

  if (data.monthly && data.monthly.isMonthEnd) {
    el('month-end-card').style.display = '';
    const top3 = data.monthly.standings.slice(0, 3);
    const stepClass = ['s1', 's2', 's3'];
    const medal = ['🥇', '🥈', '🥉'];
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
  if (data.monthly) renderStandings(data.monthly);
}
