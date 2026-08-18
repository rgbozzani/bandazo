// Bandazo - servidor de salas multijugador
// Juego de adivinar canciones por clips de audio, estilo Bandle/Heardle.
// Usa la API publica de iTunes Search para buscar canciones y obtener previews de 30s.

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---- Config del juego ----
const SNIPPET_STAGES = [1, 2, 4, 7, 11, 16]; // segundos acumulados por intento
const MAX_STAGE = SNIPPET_STAGES.length;
const POINTS_BY_STAGE = [6, 5, 4, 3, 2, 1]; // puntos segun en que intento acertaste (index 0 = primer intento)
const FIRST_SOLVER_BONUS = 2;
const GRACE_PERIOD_MS = 12000; // tiempo extra para el resto tras la primera respuesta correcta
const MAX_PLAYLIST = 60; // tope de canciones por sala (el pack mezclado trae ~49)

// ---- Pack de canciones sugeridas ----
// Son solo terminos de busqueda: el server los busca en iTunes al vuelo, no hay audio guardado aca.
// Se agrupan por genero aca abajo solo para que sea facil de mantener/editar, pero al agregarlas
// a la sala se mezclan todas juntas (no se eligen por separado).
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
          'Rasguna las Piedras Sui Generis',
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
          'El Extrano de Pelo Largo La Renga',
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
          'Como Te Extrano Kapanga',
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

const SONG_PACKS = {
    mix: {
          label: 'Mix sugerido',
          get queries() {
                  // se mezcla cada vez que se pide, para que el orden de carga tambien sea random
            // (toma todos los generos de GENRE_QUERIES automaticamente)
            return shuffleArray(Object.values(GENRE_QUERIES).flat());
          },
    },
};

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

// ---- Estado en memoria ----
/** rooms: Map<code, RoomState> */
const rooms = new Map();

function makeRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
          code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (rooms.has(code));
    return code;
}

function normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
    .split('').filter(function (c) { return c.charCodeAt(0) < 128; }).join('') // saca acentos (post NFD)
      .replace(/\(.*?\)/g, '') // saca parentesis tipo (feat. x) (remastered)
      .replace(/[^a-z0-9]+/g, ' ')

    .trim();
}

function isGuessCorrect(guess, song) {
    const g = normalize(guess);
    if (!g) return false;
    const title = normalize(song.title);
    if (g === title) return true;
    // aceptar coincidencia si el titulo completo esta contenido y es razonablemente largo
  if (title.length > 3 && (g.includes(title) || title.includes(g))) return true;
    return false;
}

function publicPlayers(room) {
    return Object.values(room.players).map(p => ({
          id: p.id,
          name: p.name,
          score: p.score,
          isHost: p.id === room.hostId,
          connected: p.connected,
    }));
}

function publicPlaylist(room) {
    // no exponemos previewUrl/titulo de rondas futuras de forma innecesaria, pero como el host la arma, se las mostramos a todos igual
  return room.playlist.map((s, i) => ({ index: i, title: s.title, artist: s.artist, artwork: s.artwork }));
}

function roomSummary(room) {
    return {
          code: room.code,
          players: publicPlayers(room),
          playlist: publicPlaylist(room),
          state: room.state, // 'lobby' | 'playing' | 'round-end' | 'finished'
          roundIndex: room.roundIndex,
          totalRounds: room.order.length,
    };
}

function broadcastRoom(room) {
    io.to(room.code).emit('room-update', roomSummary(room));
}

function getRoomBySocket(socket) {
    const code = socket.data.roomCode;
    if (!code) return null;
    return rooms.get(code) || null;
}

function startRound(room) {
    room.roundIndex += 1;
    if (room.roundIndex >= room.order.length) {
          finishGame(room);
          return;
    }
    const songIndex = room.order[room.roundIndex];
    room.currentSong = room.playlist[songIndex];
    room.state = 'playing';
    room.roundWinnerId = null;
    room.roundEndsAt = null;
    clearTimeout(room.roundTimer);

  room.playerRoundState = {};
    for (const id of Object.keys(room.players)) {
          room.playerRoundState[id] = { stage: 1, solved: false, out: false };
    }

  io.to(room.code).emit('round-start', {
        roundIndex: room.roundIndex,
        totalRounds: room.order.length,
        previewUrl: room.currentSong.previewUrl,
        artwork: room.currentSong.artwork,
        maxStage: MAX_STAGE,
        stages: SNIPPET_STAGES,
  });
    broadcastRoom(room);
}

function maybeEndRoundForEveryone(room) {
    const states = Object.values(room.playerRoundState);
    if (states.length === 0) return false;
    const allDone = states.every(s => s.solved || s.out);
    if (allDone) {
          endRound(room);
          return true;
    }
    return false;
}

function endRound(room) {
    if (room.state !== 'playing') return;
    clearTimeout(room.roundTimer);
    room.state = 'round-end';
    const song = room.currentSong;
    io.to(room.code).emit('round-end', {
          title: song.title,
          artist: song.artist,
          artwork: song.artwork,
          players: publicPlayers(room),
          isLastRound: room.roundIndex >= room.order.length - 1,
    });
    broadcastRoom(room);
}

function finishGame(room) {
    room.state = 'finished';
    io.to(room.code).emit('game-end', { players: publicPlayers(room).sort((a, b) => b.score - a.score) });
    broadcastRoom(room);
}

io.on('connection', socket => {
    socket.on('list-packs', cb => {
          cb(Object.entries(SONG_PACKS).map(([id, p]) => ({ id, label: p.label, count: p.queries.length })));
    });

        socket.on('add-pack', async (packId, cb) => {
              const room = getRoomBySocket(socket);
              if (!room || room.hostId !== socket.id || room.state !== 'lobby') return cb({ ok: false, error: 'No autorizado.' });
              const pack = SONG_PACKS[packId];
              if (!pack) return cb({ ok: false, error: 'Pack no encontrado.' });

                      const existingKeys = new Set(room.playlist.map(s => s.previewUrl));
              let added = 0;
              let skipped = 0;
              let failed = 0;

                      for (const query of pack.queries) {
                              if (room.playlist.length >= MAX_PLAYLIST) break;
                              try {
                                        const song = await searchOne(query);
                                        if (!song) {
                                                    failed++;
                                                    continue;
                                        }
                                        if (existingKeys.has(song.previewUrl)) {
                                                    skipped++;
                                                    continue;
                                        }
                                        existingKeys.add(song.previewUrl);
                                        room.playlist.push(song);
                                        added++;
                                        broadcastRoom(room); // feedback incremental mientras se arma el pack
                              } catch (e) {
                                        failed++;
                              }
                      }

                      cb({ ok: true, added, skipped, failed });
              broadcastRoom(room);
        });

        socket.on('create-room', (playerName, cb) => {
              try {
                      const name = (playerName || '').trim().slice(0, 24) || 'Anfitrion';
                      const code = makeRoomCode();
                      const room = {
                                code,
                                hostId: socket.id,
                                players: {
                                            [socket.id]: { id: socket.id, name, score: 0, connected: true },
                                },
                                playlist: [],
                                order: [],
                                roundIndex: -1,
                                currentSong: null,
                                playerRoundState: {},
                                state: 'lobby',
                                roundTimer: null,
                      };
                      rooms.set(code, room);
                      socket.join(code);
                      socket.data.roomCode = code;
                      cb({ ok: true, room: roomSummary(room), you: room.players[socket.id] });
              } catch (e) {
                      cb({ ok: false, error: 'No se pudo crear la sala.' });
              }
        });

        socket.on('join-room', ({ code, playerName }, cb) => {
              const room = rooms.get((code || '').toUpperCase().trim());
              if (!room) return cb({ ok: false, error: 'No existe una sala con ese codigo.' });
              const name = (playerName || '').trim().slice(0, 24) || 'Jugador';
              room.players[socket.id] = { id: socket.id, name, score: 0, connected: true };
              socket.join(room.code);
              socket.data.roomCode = room.code;
              cb({ ok: true, room: roomSummary(room), you: room.players[socket.id] });
              broadcastRoom(room);
        });

        socket.on('search-songs', async (query, cb) => {
              const q = (query || '').trim();
              if (!q) return cb({ ok: true, results: [] });
              try {
                      const url = `https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${encodeURIComponent(q)}`;
                      const resp = await fetch(url);
                      const data = await resp.json();
                      const results = (data.results || [])
                        .filter(r => r.previewUrl)
                        .map(r => ({
                                    title: r.trackName,
                                    artist: r.artistName,
                                    artwork: (r.artworkUrl100 || '').replace('100x100', '300x300'),
                                    previewUrl: r.previewUrl,
                        }));
                      cb({ ok: true, results });
              } catch (e) {
                      cb({ ok: false, error: 'No se pudo buscar canciones. Proba de nuevo.' });
              }
        });

        socket.on('add-song', song => {
              const room = getRoomBySocket(socket);
              if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
              if (!song || !song.previewUrl) return;
              if (room.playlist.length >= MAX_PLAYLIST) return;
              room.playlist.push({
                      title: song.title,
                      artist: song.artist,
                      artwork: song.artwork,
                      previewUrl: song.previewUrl,
              });
              broadcastRoom(room);
        });

        socket.on('remove-song', index => {
              const room = getRoomBySocket(socket);
              if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
              if (index >= 0 && index < room.playlist.length) {
                      room.playlist.splice(index, 1);
                      broadcastRoom(room);
              }
        });

        socket.on('start-game', () => {
              const room = getRoomBySocket(socket);
              if (!room || room.hostId !== socket.id) return;
              if (room.playlist.length === 0) return;
              // shuffle
                      const idx = room.playlist.map((_, i) => i);
              for (let i = idx.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      [idx[i], idx[j]] = [idx[j], idx[i]];
              }
              room.order = idx;
              room.roundIndex = -1;
              for (const p of Object.values(room.players)) p.score = 0;
              startRound(room);
        });

        socket.on('next-round', () => {
              const room = getRoomBySocket(socket);
              if (!room || room.hostId !== socket.id) return;
              if (room.state !== 'round-end' && room.state !== 'lobby') return;
              startRound(room);
        });

        socket.on('player-skip', () => {
              const room = getRoomBySocket(socket);
              if (!room || room.state !== 'playing') return;
              const ps = room.playerRoundState[socket.id];
              if (!ps || ps.solved || ps.out) return;
              if (ps.stage < MAX_STAGE) {
                      ps.stage += 1;
                      socket.emit('your-progress', { stage: ps.stage });
              } else {
                      ps.out = true;
                      socket.emit('your-progress', { stage: ps.stage, out: true });
                      maybeEndRoundForEveryone(room);
              }
        });

        socket.on('player-guess', text => {
              const room = getRoomBySocket(socket);
              if (!room || room.state !== 'playing') return;
              const ps = room.playerRoundState[socket.id];
              const player = room.players[socket.id];
              if (!ps || !player || ps.solved || ps.out) return;

                      const correct = isGuessCorrect(text, room.currentSong);
              if (correct) {
                      ps.solved = true;
                      const isFirst = room.roundWinnerId === null;
                      if (isFirst) room.roundWinnerId = socket.id;
                      const points = POINTS_BY_STAGE[ps.stage - 1] + (isFirst ? FIRST_SOLVER_BONUS : 0);
                      player.score += points;
                      io.to(room.code).emit('player-correct', {
                                playerId: socket.id,
                                playerName: player.name,
                                points,
                                isFirst,
                      });
                      socket.emit('your-progress', { stage: ps.stage, solved: true });

                if (isFirst && !room.roundTimer) {
                          room.roundEndsAt = Date.now() + GRACE_PERIOD_MS;
                          room.roundTimer = setTimeout(() => endRound(room), GRACE_PERIOD_MS);
                          io.to(room.code).emit('grace-period', { endsAt: room.roundEndsAt });
                }
                      if (!maybeEndRoundForEveryone(room)) {
                                broadcastRoom(room);
                      }
              } else {
                      if (ps.stage < MAX_STAGE) {
                                ps.stage += 1;
                                socket.emit('your-progress', { stage: ps.stage, wrong: true });
                      } else {
                                ps.out = true;
                                socket.emit('your-progress', { stage: ps.stage, wrong: true, out: true });
                                maybeEndRoundForEveryone(room);
                      }
              }
        });

        socket.on('leave-room', () => handleLeave(socket));
    socket.on('disconnect', () => handleLeave(socket));

        function handleLeave(socket) {
              const room = getRoomBySocket(socket);
              if (!room) return;
              const wasHost = room.hostId === socket.id;
              delete room.players[socket.id];
              delete room.playerRoundState[socket.id];

      if (Object.keys(room.players).length === 0) {
              clearTimeout(room.roundTimer);
              rooms.delete(room.code);
              return;
      }
              if (wasHost) {
                      room.hostId = Object.keys(room.players)[0];
              }
              maybeEndRoundForEveryone(room);
              broadcastRoom(room);
        }
});

server.listen(PORT, () => {
    console.log(`Bandazo corriendo en el puerto ${PORT}`);
});
