// Bandletina - partida diaria compartida para un grupo fijo de 6 amigos.
// Juego de adivinar canciones por clips de audio, estilo Bandle/Heardle.
// Usa la API pública de iTunes Search para buscar canciones y obtener previews de 30s.
// Cada día hay UNA sola partida (mismas canciones para todos), los puntajes de cada
// participante se acumulan a lo largo del mes en una base Postgres, y el último día
// hábil del mes se arma un podio con los 3 primeros.

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
let Pool = null;
try {
  ({ Pool } = require('pg'));
} catch (e) {
  // pg no instalado / no disponible: el juego funciona igual, pero sin persistencia
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TIMEZONE = 'America/Argentina/Buenos_Aires';

app.use(express.static(path.join(__dirname, 'public')));

// ---- Config del juego ----
const SNIPPET_STAGES = [1, 2, 4, 7, 11, 16]; // segundos acumulados por intento
const MAX_STAGE = SNIPPET_STAGES.length;
const POINTS_BY_STAGE = [6, 5, 4, 3, 2, 1]; // puntos según en qué intento acertaste (index 0 = primer intento)
const FIRST_SOLVER_BONUS = 2;
const GRACE_PERIOD_MS = 12000; // tiempo extra para el resto tras la primera respuesta correcta
const MAX_PLAYLIST = 1; // una sola canción por día: la partida es una única ronda

// Los 6 participantes posibles (grupo fijo).
const PLAYER_NAMES = ['Al', 'Carmín', 'Dada', 'Gogo', 'Javi', 'Ro'];

// ---- Pack de canciones sugeridas ----
// Son solo términos de búsqueda: el server los busca en iTunes al vuelo, no hay audio guardado acá.
// Se agrupan por género acá abajo solo para que sea fácil de mantener/editar; al armar la partida
// del día se mezclan todas juntas.
const GENRE_QUERIES = {
  rockArgentino: [
    'De Musica Ligera Soda Stereo',
    'Persiana Americana Soda Stereo',
    'El Arriero Divididos',
    'Ando Los Piojos',
    'Panic Show La Renga',
    'Los Dinosaurios Charly Garcia',
    'Mariposa Tecknicolor Fito Paez',
    'Sr Cobranza Bersuit Vergarabat',
    'Hoy Attaque 77',
    'Rasguña las Piedras Sui Generis',
    'Insoportablemente Azul Airbag',
    'Irresponsables Babasonicos',
    'Delectrico Babasonicos',
    'Microdancing Babasonicos',
    'La Guitarra Los Autenticos Decadentes',
    'La Rubia Tarada Sumo',
    'Lamento Boliviano Enanitos Verdes',
    'Flaca Andres Calamaro',
    'Un Angel Para Tu Soledad Los Enanitos Verdes',
    'Cuando Sea Grande Los Piojos',
    'Bares y Fondas Massacre',
    'Africa Verde Massacre',
    'El General Confusion Massacre',
    'En la Ciudad de la Furia Soda Stereo',
    'Cuando Pase el Temblor Soda Stereo',
    'Y Dale Alegria a mi Corazon Fito Paez',
    'Un Vestido y un Amor Fito Paez',
    'Demoliendo Hoteles Charly Garcia',
    'No Bombardeen Buenos Aires Charly Garcia',
    'Sabalero Divididos',
    'Todo Parece Indicar Los Piojos',
    'Verano del 92 Los Piojos',
    'La Balada del Diablo y la Muerte La Renga',
    'Beber en el Rio La Renga',
    'El Extraño de Pelo Largo La Renga',
    'La Argentinidad al Palo Bersuit Vergarabat',
    'Jijiji Patricio Rey y sus Redonditos de Ricota',
    'Vencedores Vencidos Patricio Rey y sus Redonditos de Ricota',
    'Muchacha Ojos de Papel Almendra',
    'Perfecta Miranda',
    'Comeme el Rico Coco Illya Kuryaki and the Valderramas',
    'Al Vacio No Te Va Gustar',
    'Ella Las Pastillas del Abuelo',
    'Mujer Lava Perros El Mato a un Policia Motorizado',
    'Ruedas de Metal Riff',
    'Mujeres y Botellas Riff',
    'Ya no Sos la Misma La Beriso',
    'Tu Veneno Turf',
    'Abrazado a Vos Catupecu Machu',
    'Retrato Eruca Sativa',
    'Mienteme Bandalos Chinos',
    'El Perdedor Airbag',
    'Otra Epoca Airbag',
    'Todo Cambia Los Pericos',
    'Nada Personal Soda Stereo',
    'Aire GIT',
    'Wadu Wadu Virus',
    'Mil Horas Los Abuelos de la Nada',
    'Seguir Viviendo Sin Tu Amor Spinetta',
    'Post Crucifixion Pescado Rabioso',
    'El Rey del Movimiento Vicentico',
    'Cementerio Club Callejeros',
    'No Podes Volver Attaque 77',
    'Un Dia de Suerte Attaque 77',
    'La Bolsa Bersuit Vergarabat',
    'Amapola del 66 Divididos',
    'Guitarras Blancas Enanitos Verdes',
    'Vicio Ratones Paranoicos',
  ],
  trapUrbanoArgentino: [
    'Dumbai Catriel y Paco Amoroso',
    'El Unico Catriel y Paco Amoroso',
    'El Dia del Amigo Catriel y Paco Amoroso',
    'Tetas Catriel y Paco Amoroso',
    'Al Fin Solo Dillom',
    '1000 Grados Dillom',
    'El Diablo en tu Cuerpo Dillom',
    'Bien o Mal Dillom',
    'Animal Acru Wos',
    'Delirio Acru',
    'Como Te Extraño Kapanga',
    'Naides Kapanga',
    'Sr Tomate Kapanga',
    'Goteo Duki',
    'She Dont Give a FO Duki',
    'Tumbando el Club Duki',
    'Quevedo Bzrp Music Sessions 52',
    'Wos Bzrp Music Sessions 27',
    'Sin Cadenas Wos',
    'Mi Enemigo El Amor Wos',
    'Tranky Funky Trueno',
    'Dance Crip Trueno',
    'Corazon Nathy Peluso',
    'Nada Cazzu',
    'Adan y Eva Paulo Londra',
    'Chance Paulo Londra',
    'Fresa YSY A',
  ],
  internacionalVarios: [
    'Blitzkrieg Bop Ramones',
    'I Wanna Be Sedated Ramones',
    'Sheena Is a Punk Rocker Ramones',
    'Epic Faith No More',
    'Easy Faith No More',
    'I Gotta Feeling Black Eyed Peas',
    'Boom Boom Pow Black Eyed Peas',
    'Pump It Black Eyed Peas',
    'Never Tear Us Apart INXS',
    'Need You Tonight INXS',
    'New Sensation INXS',
    'Enjoy the Silence Depeche Mode',
    'Personal Jesus Depeche Mode',
    'Policy of Truth Depeche Mode',
    'Bohemian Rhapsody Queen',
    'Dont Stop Me Now Queen',
    'We Will Rock You Queen',
    'Highway to Hell ACDC',
    'Back in Black ACDC',
    'Sweet Child O Mine Guns N Roses',
    'November Rain Guns N Roses',
    'Enter Sandman Metallica',
    'Nothing Else Matters Metallica',
    'Every Breath You Take The Police',
    'Roxanne The Police',
    'With or Without You U2',
    'Sunday Bloody Sunday U2',
    'Dream On Aerosmith',
  ],
  reggaetonLatino: [
    'Gasolina Daddy Yankee',
    'Danza Kuduro Don Omar',
    'Mi Gente J Balvin',
    'Callaita Bad Bunny',
    'Taki Taki DJ Snake Ozuna',
    'Tusa Karol G Nicki Minaj',
    'Rakata Wisin Yandel',
    'El Perdon Nicky Jam',
    'Felices los 4 Maluma',
    'Pepas Farruko',
    'China Anuel AA',
    'Todo de Ti Rauw Alejandro',
    'Pa Que Retozen Tego Calderon',
    'Fanatica Sensual Plan B',
    'Otra Vez Zion y Lennox J Balvin',
    'Yonaguni Bad Bunny',
    'Ginza J Balvin',
    'Con Calma Daddy Yankee',
    'Safaera Bad Bunny',
    'Dakiti Bad Bunny',
    'Vete Bad Bunny',
    'Mia Bad Bunny',
    'Ay Vamos J Balvin',
    'No Es Justo J Balvin',
    'Bichota Karol G',
    'Provenza Karol G',
    'Amorfoda Bad Bunny',
    'Hawai Maluma',
    'Corazon Maluma',
    'Sin Pijama Becky G Natti Natasha',
    'Krippy Kush Farruko',
    'Vaina Loca Ozuna Manuel Turizo',
    'Adictiva Daddy Yankee Anuel AA',
    'Con Altura Rosalia J Balvin',
    'Loco Contigo DJ Snake J Balvin',
    'Ella Quiere Beber Anuel AA',
    'Otro Trago Sech',
    'La Jeepeta Nio Garcia',
    'Se Preparo Ozuna',
    'Caramelo Ozuna',
    'Mayores Becky G Bad Bunny',
    'La Modelo Ozuna Cardi B',
    'Ahora Me Llama Karol G',
    'X Nicky Jam J Balvin',
    'Dile Don Omar',
    'Ram Pam Pam Natti Natasha Becky G',
    'Bum Bum Tam Tam MC Fioti J Balvin',
    'Bota Fuego El Alfa',
    'Mi Cama Karol G',
    'Culpables Karol G Anuel AA',
    'Downtown Anitta J Balvin',
    'Envolver Anitta',
    'Nibiru Ozuna',
    'Sensualidad Bad Bunny Prince Royce J Balvin',
    'Location Karol G Anuel AA',
    'Secreto Anuel AA Karol G',
    'Se Le Ve Bad Bunny',
    'Yo Perreo Sola Bad Bunny',
  ],
  postPunkNewWave: [
    'Friday Im in Love The Cure',
    'Just Like Heaven The Cure',
    'Boys Dont Cry The Cure',
    'Lovesong The Cure',
    'Should I Stay or Should I Go The Clash',
    'London Calling The Clash',
    'Rock the Casbah The Clash',
    'Train in Vain The Clash',
    'Love Will Tear Us Apart Joy Division',
    'Psycho Killer Talking Heads',
    'Once in a Lifetime Talking Heads',
    'Kiss Them for Me Siouxsie and the Banshees',
    'Just Cant Get Enough Depeche Mode',
    'Blue Monday New Order',
    'This Charming Man The Smiths',
    'Hungry Like the Wolf Duran Duran',
    'The Killing Moon Echo and the Bunnymen',
    'Bela Lugosis Dead Bauhaus',
    'Heart of Glass Blondie',
    'Girls on Film Duran Duran',
    'Save a Prayer Duran Duran',
    'Dont You Want Me The Human League',
    'Tainted Love Soft Cell',
    'Cars Gary Numan',
    'Bizarre Love Triangle New Order',
    'A Forest The Cure',
    'Whip It Devo',
    'Atmosphere Joy Division',
    'Burning Down the House Talking Heads',
    'Rock Lobster The B 52s',
    'Dont You Forget About Me Simple Minds',
    'I Ran A Flock of Seagulls',
    'Everybody Wants to Rule the World Tears for Fears',
    'Shout Tears for Fears',
    'Senses Working Overtime XTC',
    'At Home He Feels Like a Tourist Gang of Four',
    'Video Killed the Radio Star The Buggles',
    'West End Girls Pet Shop Boys',
    'Its a Sin Pet Shop Boys',
  ],
  rockAlternativoInternacional: [
    'Californication Red Hot Chili Peppers',
    'Under the Bridge Red Hot Chili Peppers',
    'Give It Away Red Hot Chili Peppers',
    'Scar Tissue Red Hot Chili Peppers',
    'Otherside Red Hot Chili Peppers',
    'By the Way Red Hot Chili Peppers',
    'Snow Hey Oh Red Hot Chili Peppers',
    'Cant Stop Red Hot Chili Peppers',
    'Everlong Foo Fighters',
    'The Pretender Foo Fighters',
    'My Hero Foo Fighters',
    'Learn to Fly Foo Fighters',
    'Best of You Foo Fighters',
    'Smells Like Teen Spirit Nirvana',
    'Come as You Are Nirvana',
    'Lithium Nirvana',
    'Heart Shaped Box Nirvana',
    'About a Girl Nirvana',
    'Alive Pearl Jam',
    'Even Flow Pearl Jam',
    'Jeremy Pearl Jam',
    'Black Pearl Jam',
    'Killing in the Name Rage Against the Machine',
    'Bulls on Parade Rage Against the Machine',
    'Guerrilla Radio Rage Against the Machine',
    'In the End Linkin Park',
    'Numb Linkin Park',
    'Crawling Linkin Park',
    'Chop Suey System of a Down',
    'Toxicity System of a Down',
    'Like a Stone Audioslave',
    'Cochise Audioslave',
    'Black Hole Sun Soundgarden',
    'Buddy Holly Weezer',
    'Say It Aint So Weezer',
    'Basket Case Green Day',
    'American Idiot Green Day',
    'Boulevard of Broken Dreams Green Day',
    'Uprising Muse',
    'Starlight Muse',
  ],
  popInternacional2000s: [
    'Shake It Off Taylor Swift',
    'Blank Space Taylor Swift',
    'Love Story Taylor Swift',
    'You Belong with Me Taylor Swift',
    'Bad Blood Taylor Swift',
    'Anti Hero Taylor Swift',
    'Cruel Summer Taylor Swift',
    'Style Taylor Swift',
    'Toxic Britney Spears',
    'Baby One More Time Britney Spears',
    'Oops I Did It Again Britney Spears',
    'Womanizer Britney Spears',
    'Circus Britney Spears',
    'Genie in a Bottle Christina Aguilera',
    'Beautiful Christina Aguilera',
    'Fighter Christina Aguilera',
    'Dirrty Christina Aguilera',
    'Firework Katy Perry',
    'Roar Katy Perry',
    'California Gurls Katy Perry',
    'Teenage Dream Katy Perry',
    'Thank U Next Ariana Grande',
    '7 Rings Ariana Grande',
    'Problem Ariana Grande',
    'Break Free Ariana Grande',
    'Single Ladies Beyonce',
    'Crazy in Love Beyonce',
    'Halo Beyonce',
    'Umbrella Rihanna',
    'Diamonds Rihanna',
    'Only Girl in the World Rihanna',
    'Poker Face Lady Gaga',
    'Bad Romance Lady Gaga',
    'Just Dance Lady Gaga',
    'Party in the USA Miley Cyrus',
    'Wrecking Ball Miley Cyrus',
    'Tik Tok Kesha',
    'Die Young Kesha',
    'So What Pink',
    'Just Give Me a Reason Pink',
  ],
};

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function searchOne(query) {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=1&term=${encodeURIComponent(query)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const r = (data.results || [])[0];
  if (!r || !r.previewUrl) return null;
  return {
    title: r.trackName,
    artist: r.artistName,
    artwork: (r.artworkUrl100 || '').replace('100x100', '300x300'),
    previewUrl: r.previewUrl,
  };
}

async function buildDailyPlaylist() {
  // recorre las queries en orden aleatorio y se queda con la primera que dé resultado válido
  // (MAX_PLAYLIST=1 corta el loop apenas hay una canción lista)
  const queries = shuffleArray(Object.values(GENRE_QUERIES).flat());
  const playlist = [];
  const seen = new Set();
  for (const q of queries) {
    if (playlist.length >= MAX_PLAYLIST) break;
    try {
      const song = await searchOne(q);
      if (song && song.previewUrl && !seen.has(song.previewUrl)) {
        seen.add(song.previewUrl);
        playlist.push(song);
      }
    } catch (e) {
      // si falla una búsqueda puntual, seguimos con la siguiente
    }
  }
  return playlist;
}

// ---- Persistencia (Postgres) ----
const pool =
  Pool && process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : null;

async function initDb() {
  if (!pool) {
    console.log('DATABASE_URL no configurada: el juego funciona pero los puntajes no se guardan.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_games (
      play_date DATE PRIMARY KEY,
      songs JSONB NOT NULL,
      started BOOLEAN NOT NULL DEFAULT false,
      finished BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_scores (
      play_date DATE NOT NULL,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (play_date, player_name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_winners (
      month TEXT PRIMARY KEY,
      winner_name TEXT NOT NULL,
      winner_score INTEGER NOT NULL,
      podium JSONB NOT NULL,
      decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('Base de datos lista.');
}

// ---- Fecha / día hábil (zona horaria Argentina) ----
function todayKey() {
  // formato en-CA da YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

function lastBusinessDayOfMonth(year, monthIndex0) {
  // arranca en el último día calendario del mes y retrocede hasta un día hábil (lunes a viernes)
  let d = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

function isLastBusinessDay(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const lbd = lastBusinessDayOfMonth(y, m - 1);
  return lbd.getUTCFullYear() === y && lbd.getUTCMonth() + 1 === m && lbd.getUTCDate() === day;
}

// ---- Estado en memoria: una sola partida "de hoy" ----
let room = null;

async function ensureRoom() {
  const date = todayKey();
  if (room && room.date === date) return room;

  let dbRow = null;
  if (pool) {
    try {
      const r = await pool.query('SELECT play_date, songs, started, finished FROM daily_games WHERE play_date = $1', [date]);
      dbRow = r.rows[0] || null;
    } catch (e) {
      console.error('Error leyendo daily_games', e);
    }
  }

  let playlist;
  let finished = false;
  let started = false;

  if (dbRow) {
    playlist = dbRow.songs;
    finished = dbRow.finished;
    started = dbRow.started;
  } else {
    playlist = await buildDailyPlaylist();
    if (pool) {
      try {
        await pool.query('INSERT INTO daily_games (play_date, songs) VALUES ($1, $2) ON CONFLICT (play_date) DO NOTHING', [
          date,
          JSON.stringify(playlist),
        ]);
      } catch (e) {
        console.error('Error creando daily_games', e);
      }
    }
  }

  room = {
    date,
    playlist,
    order: [],
    roundIndex: -1,
    currentSong: null,
    players: {},
    playerRoundState: {},
    state: finished ? 'finished' : 'lobby',
    roundTimer: null,
    roundWinnerId: null,
    roundEndsAt: null,
    started,
    finished,
  };
  return room;
}

async function getTodayResults(date) {
  const scores = {};
  PLAYER_NAMES.forEach(n => (scores[n] = 0));
  if (pool) {
    try {
      const r = await pool.query('SELECT player_name, score FROM daily_scores WHERE play_date = $1', [date]);
      for (const row of r.rows) scores[row.player_name] = row.score;
    } catch (e) {
      console.error('Error leyendo daily_scores', e);
    }
  }
  return PLAYER_NAMES.map(n => ({ name: n, score: scores[n] || 0 })).sort((a, b) => b.score - a.score);
}

async function getMonthlyStandings() {
  const date = todayKey();
  const [y, m] = date.split('-');
  const monthStart = `${y}-${m}-01`;
  const totals = {};
  PLAYER_NAMES.forEach(n => (totals[n] = 0));
  if (pool) {
    try {
      const r = await pool.query(
        'SELECT player_name, SUM(score) AS total FROM daily_scores WHERE play_date >= $1 AND play_date <= $2 GROUP BY player_name',
        [monthStart, date]
      );
      for (const row of r.rows) totals[row.player_name] = parseInt(row.total, 10) || 0;
    } catch (e) {
      console.error('Error calculando standings', e);
    }
  }
  const standings = PLAYER_NAMES.map(n => ({ name: n, total: totals[n] || 0 })).sort((a, b) => b.total - a.total);
  return { month: `${y}-${m}`, isMonthEnd: isLastBusinessDay(date), standings };
}

async function persistTodayScores(r) {
  if (!pool) return;
  try {
    for (const p of Object.values(r.players)) {
      await pool.query(
        `INSERT INTO daily_scores (play_date, player_name, score) VALUES ($1, $2, $3)
         ON CONFLICT (play_date, player_name) DO UPDATE SET score = EXCLUDED.score, updated_at = now()`,
        [r.date, p.name, p.score]
      );
    }
    await pool.query('UPDATE daily_games SET finished = true WHERE play_date = $1', [r.date]);
  } catch (e) {
    console.error('Error guardando puntajes del día', e);
  }
}

// ---- Historial de ganadores mensuales ----
async function persistMonthlyWinnerIfNeeded(monthly) {
  if (!pool || !monthly.isMonthEnd) return;
  const top = monthly.standings[0];
  if (!top || top.total <= 0) return; // nadie sumó puntos este mes: no coronamos ganador
  const podium = monthly.standings.slice(0, 3);
  try {
    await pool.query(
      `INSERT INTO monthly_winners (month, winner_name, winner_score, podium)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (month) DO UPDATE SET
         winner_name = EXCLUDED.winner_name,
         winner_score = EXCLUDED.winner_score,
         podium = EXCLUDED.podium,
         decided_at = now()`,
      [monthly.month, top.name, top.total, JSON.stringify(podium)]
    );
  } catch (e) {
    console.error('Error guardando ganador del mes', e);
  }
}

async function getWinnersHistory() {
  if (!pool) return [];
  try {
    const r = await pool.query(
      'SELECT month, winner_name, winner_score, podium FROM monthly_winners ORDER BY month DESC LIMIT 24'
    );
    return r.rows.map(row => ({
      month: row.month,
      winnerName: row.winner_name,
      winnerScore: row.winner_score,
      podium: row.podium,
    }));
  } catch (e) {
    console.error('Error leyendo historial de ganadores', e);
    return [];
  }
}

// ---- Lógica de comparación de respuestas ----
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter(function (c) {
      return c.charCodeAt(0) < 128;
    })
    .join('') // saca acentos (post NFD)
    .replace(/\(.*?\)/g, '') // saca parentesis tipo (feat. x) (remastered)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isGuessCorrect(guess, song) {
  const g = normalize(guess);
  if (!g) return false;
  const title = normalize(song.title);
  if (g === title) return true;
  if (title.length > 3 && (g.includes(title) || title.includes(g))) return true;
  return false;
}

function publicPlayers(r) {
  return Object.values(r.players).map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected,
  }));
}

function roomSummary(r) {
  return {
    date: r.date,
    players: publicPlayers(r),
    songCount: r.playlist.length,
    state: r.state,
    roundIndex: r.roundIndex,
    totalRounds: r.order.length,
  };
}

function broadcastRoom() {
  if (!room) return;
  io.to('daily').emit('room-update', roomSummary(room));
}

function startRound() {
  const r = room;
  r.roundIndex += 1;
  if (r.roundIndex >= r.order.length) {
    finishGame();
    return;
  }
  const songIndex = r.order[r.roundIndex];
  r.currentSong = r.playlist[songIndex];
  r.state = 'playing';
  r.roundWinnerId = null;
  r.roundEndsAt = null;
  clearTimeout(r.roundTimer);

  r.playerRoundState = {};
  for (const id of Object.keys(r.players)) {
    r.playerRoundState[id] = { stage: 1, solved: false, out: false };
  }

  io.to('daily').emit('round-start', {
    roundIndex: r.roundIndex,
    totalRounds: r.order.length,
    previewUrl: r.currentSong.previewUrl,
    artwork: r.currentSong.artwork,
    maxStage: MAX_STAGE,
    stages: SNIPPET_STAGES,
  });
  broadcastRoom();
}

function maybeEndRoundForEveryone() {
  const r = room;
  const states = Object.values(r.playerRoundState);
  if (states.length === 0) return false;
  const allDone = states.every(s => s.solved || s.out);
  if (allDone) {
    endRound();
    return true;
  }
  return false;
}

function endRound() {
  const r = room;
  if (r.state !== 'playing') return;
  clearTimeout(r.roundTimer);
  r.state = 'round-end';
  const song = r.currentSong;
  io.to('daily').emit('round-end', {
    title: song.title,
    artist: song.artist,
    artwork: song.artwork,
    players: publicPlayers(r),
    isLastRound: r.roundIndex >= r.order.length - 1,
  });
  broadcastRoom();
}

async function finishGame() {
  const r = room;
  r.state = 'finished';
  r.finished = true;
  const playersFinal = publicPlayers(r).sort((a, b) => b.score - a.score);
  await persistTodayScores(r);
  const monthly = await getMonthlyStandings();
  await persistMonthlyWinnerIfNeeded(monthly);
  const history = await getWinnersHistory();
  io.to('daily').emit('game-end', { players: playersFinal, monthly, history });
  broadcastRoom();
  io.emit('standings-updated', monthly);
  if (monthly.isMonthEnd) io.emit('history-updated', history);
}

function getRoomBySocket(socket) {
  if (!room) return null;
  if (!room.players[socket.id]) return null;
  return room;
}

// ---- Modo prueba: ronda solitaria con una canción al azar, no cuenta para el puntaje ----
const practiceSessions = new Map(); // socket.id -> { song, stage, solved, out }

io.on('connection', socket => {
  socket.on('get-players', cb => cb(PLAYER_NAMES));

  socket.on('get-standings', async cb => {
    try {
      const monthly = await getMonthlyStandings();
      cb({ ok: true, monthly });
    } catch (e) {
      cb({ ok: false, error: 'No se pudo cargar la tabla del mes.' });
    }
  });

  socket.on('get-history', async cb => {
    try {
      const history = await getWinnersHistory();
      cb({ ok: true, history });
    } catch (e) {
      cb({ ok: false, error: 'No se pudo cargar el historial de ganadores.' });
    }
  });

  socket.on('join-today', async (name, cb) => {
    try {
      if (!PLAYER_NAMES.includes(name)) return cb({ ok: false, error: 'Elegí tu nombre de la lista.' });
      const r = await ensureRoom();
      if (r.state === 'finished') {
        const results = await getTodayResults(r.date);
        return cb({ ok: true, finished: true, date: r.date, results });
      }
      r.players[socket.id] = { id: socket.id, name, score: 0, connected: true };
      if (r.state === 'playing' && r.currentSong) {
        r.playerRoundState[socket.id] = { stage: 1, solved: false, out: false };
      }
      socket.join('daily');
      socket.data.playerName = name;
      const current =
        r.state === 'playing' && r.currentSong
          ? {
              roundIndex: r.roundIndex,
              totalRounds: r.order.length,
              previewUrl: r.currentSong.previewUrl,
              artwork: r.currentSong.artwork,
              maxStage: MAX_STAGE,
              stages: SNIPPET_STAGES,
            }
          : null;
      cb({ ok: true, finished: false, room: roomSummary(r), you: r.players[socket.id], current });
      broadcastRoom();
    } catch (e) {
      cb({ ok: false, error: 'No se pudo entrar a la partida de hoy.' });
    }
  });

  socket.on('start-game', () => {
    const r = room;
    if (!r || r.state !== 'lobby') return;
    if (Object.keys(r.players).length === 0) return;
    const idx = r.playlist.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    r.order = idx;
    r.roundIndex = -1;
    for (const p of Object.values(r.players)) p.score = 0;
    r.started = true;
    if (pool) pool.query('UPDATE daily_games SET started = true WHERE play_date = $1', [r.date]).catch(() => {});
    startRound();
  });

  socket.on('next-round', () => {
    const r = getRoomBySocket(socket);
    if (!r) return;
    if (r.state !== 'round-end' && r.state !== 'lobby') return;
    startRound();
  });

  socket.on('player-skip', () => {
    const r = getRoomBySocket(socket);
    if (!r || r.state !== 'playing') return;
    const ps = r.playerRoundState[socket.id];
    if (!ps || ps.solved || ps.out) return;
    if (ps.stage < MAX_STAGE) {
      ps.stage += 1;
      socket.emit('your-progress', { stage: ps.stage });
    } else {
      ps.out = true;
      socket.emit('your-progress', { stage: ps.stage, out: true });
      maybeEndRoundForEveryone();
    }
  });

  socket.on('player-guess', text => {
    const r = getRoomBySocket(socket);
    if (!r || r.state !== 'playing') return;
    const ps = r.playerRoundState[socket.id];
    const player = r.players[socket.id];
    if (!ps || !player || ps.solved || ps.out) return;

    const correct = isGuessCorrect(text, r.currentSong);
    if (correct) {
      ps.solved = true;
      const isFirst = r.roundWinnerId === null;
      if (isFirst) r.roundWinnerId = socket.id;
      const points = POINTS_BY_STAGE[ps.stage - 1] + (isFirst ? FIRST_SOLVER_BONUS : 0);
      player.score += points;
      io.to('daily').emit('player-correct', {
        playerId: socket.id,
        playerName: player.name,
        points,
        isFirst,
      });
      socket.emit('your-progress', { stage: ps.stage, solved: true });

      if (isFirst && !r.roundTimer) {
        r.roundEndsAt = Date.now() + GRACE_PERIOD_MS;
        r.roundTimer = setTimeout(() => endRound(), GRACE_PERIOD_MS);
        io.to('daily').emit('grace-period', { endsAt: r.roundEndsAt });
      }
      if (!maybeEndRoundForEveryone()) {
        broadcastRoom();
      }
    } else {
      if (ps.stage < MAX_STAGE) {
        ps.stage += 1;
        socket.emit('your-progress', { stage: ps.stage, wrong: true });
      } else {
        ps.out = true;
        socket.emit('your-progress', { stage: ps.stage, wrong: true, out: true });
        maybeEndRoundForEveryone();
      }
    }
  });

  socket.on('guess-suggest', async (query, cb) => {
    const q = (query || '').trim();
    if (q.length <= 5) return cb({ ok: true, results: [] });
    try {
      const url = `https://itunes.apple.com/search?media=music&entity=song&limit=8&term=${encodeURIComponent(q)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const seen = new Set();
      const results = [];
      for (const r of data.results || []) {
        if (!r.trackName) continue;
        const key = normalize(r.trackName) + '|' + normalize(r.artistName || '');
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ title: r.trackName, artist: r.artistName || '' });
        if (results.length >= 8) break;
      }
      cb({ ok: true, results });
    } catch (e) {
      cb({ ok: true, results: [] });
    }
  });

  socket.on('start-practice', async cb => {
    try {
      const songs = await buildDailyPlaylist(); // reutiliza la búsqueda: 1 canción al azar del pool
      const song = songs[0];
      if (!song) return cb({ ok: false, error: 'No se pudo conseguir una canción de prueba. Probá de nuevo.' });
      practiceSessions.set(socket.id, { song, stage: 1, solved: false, out: false });
      cb({ ok: true, previewUrl: song.previewUrl, maxStage: MAX_STAGE, stages: SNIPPET_STAGES });
    } catch (e) {
      cb({ ok: false, error: 'No se pudo conseguir una canción de prueba. Probá de nuevo.' });
    }
  });

  socket.on('practice-skip', () => {
    const ps = practiceSessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    if (ps.stage < MAX_STAGE) {
      ps.stage += 1;
      socket.emit('practice-progress', { stage: ps.stage });
    } else {
      ps.out = true;
      socket.emit('practice-progress', { stage: ps.stage, out: true });
      socket.emit('practice-end', { title: ps.song.title, artist: ps.song.artist, artwork: ps.song.artwork, solved: false });
      practiceSessions.delete(socket.id);
    }
  });

  socket.on('practice-guess', text => {
    const ps = practiceSessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    const correct = isGuessCorrect(text, ps.song);
    if (correct) {
      ps.solved = true;
      socket.emit('practice-progress', { stage: ps.stage, solved: true });
      socket.emit('practice-end', { title: ps.song.title, artist: ps.song.artist, artwork: ps.song.artwork, solved: true });
      practiceSessions.delete(socket.id);
    } else if (ps.stage < MAX_STAGE) {
      ps.stage += 1;
      socket.emit('practice-progress', { stage: ps.stage, wrong: true });
    } else {
      ps.out = true;
      socket.emit('practice-progress', { stage: ps.stage, wrong: true, out: true });
      socket.emit('practice-end', { title: ps.song.title, artist: ps.song.artist, artwork: ps.song.artwork, solved: false });
      practiceSessions.delete(socket.id);
    }
  });

  socket.on('leave-room', () => handleLeave(socket));
  socket.on('disconnect', () => {
    practiceSessions.delete(socket.id);
    handleLeave(socket);
  });

  function handleLeave(socket) {
    const r = getRoomBySocket(socket);
    if (!r) return;
    delete r.players[socket.id];
    delete r.playerRoundState[socket.id];
    maybeEndRoundForEveryone();
    broadcastRoom();
  }
});

initDb()
  .catch(e => console.error('No se pudo inicializar la base de datos', e))
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`Bandletina corriendo en el puerto ${PORT}`);
    });
  });
