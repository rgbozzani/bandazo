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
const SNIPPET_STAGES = [1, 2, 4, 7, 11, 16]; // segundos acumulados por instancia de escucha
const MAX_STAGE = SNIPPET_STAGES.length;
const POINTS_BY_STAGE = [6, 5, 4, 3, 2, 1]; // puntos según en qué instancia acertaste (index 0 = primera instancia)
const MAX_GUESSES = 2; // intentos de adivinar totales (independiente de cuántas instancias escuches)
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
    'Profugos Soda Stereo',
    'Corazon Delator Soda Stereo',
    'Tratame Suavemente Soda Stereo',
    'Signos Soda Stereo',
    'Ella Uso Mi Cabeza Como Un Revolver Soda Stereo',
    'Danza Rota Soda Stereo',
    'Sobredosis de TV Soda Stereo',
    'Zoom Soda Stereo',
    'Terapia de Amor Intensiva Soda Stereo',
    'Un Millon de Años Luz Soda Stereo',
    'Total Interferencia Soda Stereo',
    'Cancion Animal Soda Stereo',
    'Texturas Soda Stereo',
    'Rezo por Vos Charly Garcia',
    'Filosofia Barata y Zapatos de Goma Charly Garcia',
    'Alicia en el Pais Charly Garcia',
    'Cerca de la Revolucion Charly Garcia',
    'Superheroes Charly Garcia',
    'Yendo de la Cama al Living Charly Garcia',
    'Demasiado Cerca del Ruido Charly Garcia',
    'Yo No Quiero Volverme Tan Loco Charly Garcia',
    'Cinema Verite Charly Garcia',
    '11 y 6 Fito Paez',
    'A Rodar Mi Vida Fito Paez',
    'Tres Agujas Fito Paez',
    'Circo Beat Fito Paez',
    'Dando Vueltas en el Aire Fito Paez',
    'Fue Fito Paez',
    'Fantasmas en el Parque Fito Paez',
    'Ala Delta Divididos',
    'Que Ves Divididos',
    'Naftalina Divididos',
    'El Loco de la Guitarra Divididos',
    'Buscando Un Simbolo de Paz Divididos',
    'El Bicho Colorado Divididos',
    'Spaghetti del Rock Divididos',
    'El Farolito Los Piojos',
    'Tan Solo Los Piojos',
    'Genocidio Los Piojos',
    'Espiando en la Ferreteria Los Piojos',
    'Maravilloso Loco Los Piojos',
    'Blues del Duende La Renga',
    'El Twist del Pibe La Renga',
    'Aqui Esta el Diablo La Renga',
    'Toda la Noche Toca el Tambor La Renga',
    'Malas Compañias La Renga',
    'Se Viene Bersuit Vergarabat',
    'Alarma Berreta Bersuit Vergarabat',
    'Vuelos Bersuit Vergarabat',
    'Perro Republicano Attaque 77',
    'Zapatillas Rotas Attaque 77',
    'Chau Loco Attaque 77',
    'El Diablo en Tu Corazon Attaque 77',
    'Tu Carcel Enanitos Verdes',
    'Amores Lejanos Enanitos Verdes',
    'Igual Que Ayer Enanitos Verdes',
    'Bandidos Enanitos Verdes',
    'Estoy Rota Babasonicos',
    'Yegua Babasonicos',
    'Pijamas Babasonicos',
    'El Loco Babasonicos',
    'Loco Andres Calamaro',
    'Media Veronica Andres Calamaro',
    'Alta Suciedad Andres Calamaro',
    'Crimenes Perfectos Andres Calamaro',
    'Paloma Andres Calamaro',
    'Instituciones Sui Generis',
    'Confesiones de Invierno Sui Generis',
    'Cancion para mi Muerte Sui Generis',
    'Fabricante de Mentiras Sui Generis',
    'Necesito Tu Amor Sui Generis',
    'Se Desperto Vicentico',
    'Loco Tu Forma de Ser Los Autenticos Decadentes',
    'Un Osito de Peluche de Museo Los Autenticos Decadentes',
    'Como Me Voy a Olvidar Los Autenticos Decadentes',
    'Somos Amigos Los Autenticos Decadentes',
    'Rocanroles Sinfonicos Callejeros',
    'Ojo Cegado por Ver el Sol Callejeros',
    'Sabado 13 Callejeros',
    'A Tu Lado Contra el Mundo Callejeros',
    'Ella Es Tan Cargosa Ratones Paranoicos',
    'Sudor y Manteca Ratones Paranoicos',
    'Presente Vox Dei',
    'Adonde Esta la Libertad Pappo',
    'Mujer Amante Rata Blanca',
    'La Leyenda del Hada y el Mago Rata Blanca',
    'Angel de la Guarda Hermetica',
    'Montañas de Neon Hermetica',
    'Aguante Almafuerte',
    'Sur o no Sur ANIMAL',
    'El Ciclo del Odio ANIMAL',
    'Sin Documentos Intoxicados',
    'Sopa Intoxicados',
    'El Fantasma de Canterville Jovenes Pordioseros',
    'Llegando a Casa Guasones',
    'Ida y Vuelta Guasones',
    'Como Un Perro La 25',
    'Down With My Baby Kevin Johansen',
    'Cuidate del Blues Kevin Johansen',
    'Friccion Marilina Bertoldi',
    'Beat de Nada Marilina Bertoldi',
    'Volver Onda Vaga',
    'Te Vi Bandalos Chinos',
    'Cumbia Rara Bandalos Chinos',
    'Ella Airbag',
    'Chau No Te Va Gustar',
    'Sweet Sixteen No Te Va Gustar',
    'Que Suerte No Te Va Gustar',
    'Prisionero Eruca Sativa',
    'Uno Eruca Sativa',
    'Fuera de Mi Catupecu Machu',
    'El Amor no Duele Catupecu Machu',
    'Un Poco de Rock and Roll Las Pastillas del Abuelo',
    'Corazon de Xilofono Las Pastillas del Abuelo',
    'Ya Todo Da Igual Turf',
    'Ver Para Creer Turf',
    'Contra el Viento La Beriso',
    'Que Ganas de No Verte Mas La Beriso',
    'Guitarra Negra Riff',
    'Chica de Oro El Mato a un Policia Motorizado',
    'Rana Los Pericos',
    'Fronteras Los Pericos',
    'China Los Pericos',
    'Runaway Los Pericos',
    'Argentina Tour Massacre',
    'Don Miranda',
    'Yo Te Avise Miranda',
    'Es Mentira Miranda',
    'Abarajame Illya Kuryaki and the Valderramas',
    'Va a Volver Illya Kuryaki and the Valderramas',
    'Coolo Illya Kuryaki and the Valderramas',
    'Rey Kong Illya Kuryaki and the Valderramas',
    'Matador Los Fabulosos Cadillacs',
    'El Genio del Dub Los Fabulosos Cadillacs',
    'Vasos Vacios Los Fabulosos Cadillacs',
    'Mal Bicho Los Fabulosos Cadillacs',
    'V Centenario Los Fabulosos Cadillacs',
    'Siguiendo la Luna Los Fabulosos Cadillacs',
    'Uno Dos Ultraviolento Los Violadores',
    'Represion Los Violadores',
    'Ya Nada Se Puede Hacer 2 Minutos',
    'Yo Te Quiero Punk 2 Minutos',
    'Crimen Gustavo Cerati',
    'Puente Gustavo Cerati',
    'Adios Gustavo Cerati',
    'Verbo Carne Gustavo Cerati',
    'Karaoke Gustavo Cerati',
    'Mi Enfermedad Fabiana Cantilo',
    'Blues del Levante Memphis la Blusera',
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
    'Rockstar Duki',
    'Hello Cotto Duki',
    'Cavernicola Duki',
    'Rueda Duki',
    'Rompe Corazones Duki',
    'OG Duki',
    'Tierra Zanta Trueno',
    'Mamichula Trueno',
    'Argentina Trueno',
    'Farsante Trueno',
    'Contacto Trueno',
    'Business Woman Nathy Peluso',
    'Puro Veneno Nathy Peluso',
    'Sana Sana Nathy Peluso',
    'Delito Nathy Peluso',
    'Amor Salvaje Nathy Peluso',
    'Con Otra Cazzu',
    'Piscis Cazzu',
    'Como Antes Cazzu',
    'Nena Maldicion Paulo Londra',
    'Party Paulo Londra',
    'Plan A Paulo Londra',
    'Firma Paulo Londra',
    'Canguro Wos',
    'Purasangre Wos',
    'Arriba Wos',
    'Automatico Maria Becerra',
    'Que Mas Pues Maria Becerra',
    'High Maria Becerra',
    'Corazon Vacio Maria Becerra',
    'Wapo Traketero Nicki Nicole',
    'Colocao Nicki Nicole',
    'Perdoname Nicki Nicole',
    'Baby Boo Nicki Nicole',
    'Rechazado Emilia',
    'La Original Emilia',
    'Ya No Vuelvas Milo J',
    '17 Años Milo J',
    'Fantasma Tiago PZK',
    'Mojando la Yal Tiago PZK',
    'Malviviendo Bhavi',
    'Bandido Neo Pistea',
    'Rap Real Neo Pistea',
    'Envidian mi Style L-Gante',
    'Que Se Sepa Nuestro Amor L-Gante',
    'Down Khea',
    'Sydney Catriel y Paco Amoroso',
    'Reggaetonera Catriel y Paco Amoroso',
    '999 Seven Kayne',
    'Vas a Quedar FMK',
    'Duki Bzrp Music Sessions 41',
    'Paulo Londra Bzrp Music Sessions 46',
    'Nathy Peluso Bzrp Music Sessions 36',
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
    'Paint It Black The Rolling Stones',
    'Sympathy for the Devil The Rolling Stones',
    'Angie The Rolling Stones',
    'Start Me Up The Rolling Stones',
    'Gimme Shelter The Rolling Stones',
    'Dreams Fleetwood Mac',
    'Go Your Own Way Fleetwood Mac',
    'The Chain Fleetwood Mac',
    'Landslide Fleetwood Mac',
    'Hotel California Eagles',
    'Take It Easy Eagles',
    'Wish You Were Here Pink Floyd',
    'Another Brick in the Wall Pink Floyd',
    'Comfortably Numb Pink Floyd',
    'Money Pink Floyd',
    'Stairway to Heaven Led Zeppelin',
    'Whole Lotta Love Led Zeppelin',
    'Kashmir Led Zeppelin',
    'Immigrant Song Led Zeppelin',
    'Hey Jude The Beatles',
    'Let It Be The Beatles',
    'Come Together The Beatles',
    'Here Comes the Sun The Beatles',
    'Yesterday The Beatles',
    'Heroes David Bowie',
    'Life on Mars David Bowie',
    'Space Oddity David Bowie',
    'Lets Dance David Bowie',
    'Rocket Man Elton John',
    'Tiny Dancer Elton John',
    'Bennie and the Jets Elton John',
    'Sweet Dreams Eurythmics',
    'Livin on a Prayer Bon Jovi',
    'Wanted Dead or Alive Bon Jovi',
    'Its My Life Bon Jovi',
    'Jump Van Halen',
    'Panama Van Halen',
    'Dont Stop Believin Journey',
    'Any Way You Want It Journey',
    'Africa Toto',
    'Rosanna Toto',
    'Sultans of Swing Dire Straits',
    'Money for Nothing Dire Straits',
    'La Grange ZZ Top',
    'Sharp Dressed Man ZZ Top',
    'Light My Fire The Doors',
    'Riders on the Storm The Doors',
    'Born to Run Bruce Springsteen',
    'Dancing in the Dark Bruce Springsteen',
    'In the Air Tonight Phil Collins',
    'Sussudio Phil Collins',
    'Land of Confusion Genesis',
    'Here I Go Again Whitesnake',
    'The Final Countdown Europe',
    'Livin la Vida Loca Ricky Martin',
    'Eye of the Tiger Survivor',
    'Radio Ga Ga Queen',
    'I Want to Break Free Queen',
    'Livin After Midnight Judas Priest',
    'Breaking the Law Judas Priest',
    'Run to the Hills Iron Maiden',
    'The Trooper Iron Maiden',
    'Paranoid Black Sabbath',
    'Iron Man Black Sabbath',
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
    'Titi Me Pregunto Bad Bunny',
    'Me Porto Bonito Bad Bunny',
    'Ojitos Lindos Bad Bunny',
    'Un Verano Sin Ti Bad Bunny',
    'Neverita Bad Bunny',
    'Efecto Bad Bunny',
    'La Santa Bad Bunny',
    'Diles Bad Bunny',
    'Soy Peor Bad Bunny',
    'Ni Bien Ni Mal Bad Bunny',
    'Perro Negro Bad Bunny',
    'Monaco Bad Bunny',
    'Reggaeton J Balvin',
    '6 AM J Balvin',
    'Machika J Balvin',
    'Rojo J Balvin',
    'Blanco J Balvin',
    'In Da Getto J Balvin',
    'Perra J Balvin',
    'Amarillo J Balvin',
    'Ambiente J Balvin',
    'Mi Ex Tenia Razon Karol G',
    'TQG Karol G Shakira',
    'X Si Volvemos Karol G',
    'El Barco Karol G',
    'Gatubela Karol G',
    'Contigo Karol G',
    '200 Copas Karol G',
    'Amargura Karol G',
    'Pero Ya No Karol G',
    'Cairo Karol G',
    'Limbo Daddy Yankee',
    'Rompe Daddy Yankee',
    'Shaky Shaky Daddy Yankee',
    'La Despedida Daddy Yankee',
    'Lo Que Paso Paso Daddy Yankee',
    'Pose Daddy Yankee',
    'Salio el Sol Don Omar',
    'Virtual Diva Don Omar',
    'Hasta Que Salga el Sol Don Omar',
    'Taboo Don Omar',
    'Angelito Don Omar',
    'Ella y Yo Don Omar',
    'Follow the Leader Wisin y Yandel',
    'Pam Pam Wisin y Yandel',
    'No Me Compares Wisin y Yandel',
    'Aullando Wisin',
    'Escapate Conmigo Wisin',
    'Adrenalina Wisin',
    'Moviendo Caderas Yandel',
    'Encantadora Yandel',
    'Ley Seca Yandel',
    'Hasta el Amanecer Nicky Jam',
    'Travesuras Nicky Jam',
    'El Amante Nicky Jam',
    'Te Bote Ozuna',
    'Baila Baila Baila Ozuna',
    'Coordina y Cuadra Ozuna',
    'Del Mar Ozuna',
    'Criminal Ozuna',
    'Un Cachito Ozuna',
    'Borro Cassette Maluma',
    'Cuatro Babys Maluma',
    'El Preferido Maluma',
    'HP Maluma',
    'ADMV Maluma',
    'Junio Maluma',
    'Sobrio Maluma',
    'Chillax Farruko',
    'Passion Whine Farruko',
    'La Toxica Farruko',
    'Recuerdas Farruko',
    'Ignorantes Anuel AA',
    'Amanece Anuel AA',
    'Keii Anuel AA',
    'Fantasias Rauw Alejandro',
    'Cuffed Up Rauw Alejandro',
    'Tattoo Rauw Alejandro',
    'Elegi Rauw Alejandro',
    'Punto 40 Rauw Alejandro',
    'Al Natural Tego Calderon',
    'Guasa Guasa Tego Calderon',
    'Es un Secreto Plan B',
    'Candy Plan B',
    'Que Le De Sech',
    'Relacion Sech',
    'Ojala Sech',
    'Classy 101 Feid',
    'Feliz Cumpleaños Ferxxo Feid',
    'Normal Feid',
    'Luna Feid',
    'Bella Myke Towers',
    'Diosa Myke Towers',
    'Lala Myke Towers',
    'No Me Conoce Jhayco',
    'Nasty Ass Jhayco',
    'Party Animal Arcangel',
    'Turista Arcangel',
    'Frio Chencho Corleone',
    'Loco Justin Quiles',
    'Rescate Justin Quiles',
    'Soltera Lunay',
    'Buscando Huellas De La Ghetto',
    'Bonita De La Ghetto',
    'Yo Te Esperare Zion y Lennox',
    'Sola Zion y Lennox',
    'Quiero Bailar Ivy Queen',
    'Yo Quiero Saber Ivy Queen',
    'La Recta Final Vico C',
    'Atrevete-te-te Calle 13',
    'Latinoamerica Calle 13',
    'Prrarn Cosculluela',
    'Eso Ere Tu Alexis y Fido',
    '5 Letras Alexis y Fido',
    'Flow Natural Tito El Bambino',
    'Caile Tito El Bambino',
    'Perdiendo la Cabeza Baby Rasta y Gringo',
    'La Bachata Manuel Turizo',
    'Una Lady Como Tu Manuel Turizo',
    'El Merengue Manuel Turizo',
    'Me Llamas Piso 21',
    'Original Piso 21',
    'Mbappe Eladio Carrion',
    'Coco Chanel Eladio Carrion',
    'Bandolero Ñengo Flow',
    'Ay Darell',
    'Diablo Bryant Myers',
    'No Voy a Llorar Natti Natasha',
    'Mala Santa Becky G',
    'Shower Becky G',
    'La Curiosidad Yailin',
    'Bailando Enrique Iglesias',
    'Duele el Corazon Enrique Iglesias',
    'Subeme la Radio Enrique Iglesias',
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
    'In Between Days The Cure',
    'Lullaby The Cure',
    'Close to Me The Cure',
    'Fascination Street The Cure',
    'Pictures of You The Cure',
    'The Lovecats The Cure',
    'White Riot The Clash',
    'Complete Control The Clash',
    'Guns of Brixton The Clash',
    'Transmission Joy Division',
    'Shes Lost Control Joy Division',
    'Disorder Joy Division',
    'Road to Nowhere Talking Heads',
    'And She Was Talking Heads',
    'Wild Wild Life Talking Heads',
    'Temptation New Order',
    'True Faith New Order',
    'Regret New Order',
    'People Are People Depeche Mode',
    'Master and Servant Depeche Mode',
    'Strangelove Depeche Mode',
    'Never Let Me Down Again Depeche Mode',
    'Rio Duran Duran',
    'The Reflex Duran Duran',
    'Notorious Duran Duran',
    'A View to a Kill Duran Duran',
    'Wild Boys Duran Duran',
    'There Is a Light That Never Goes Out The Smiths',
    'How Soon Is Now The Smiths',
    'Girlfriend in a Coma The Smiths',
    'Spellbound Siouxsie and the Banshees',
    'Peek-a-Boo Siouxsie and the Banshees',
    'Christine Siouxsie and the Banshees',
    'Call Me Blondie',
    'Rapture Blondie',
    'One Way or Another Blondie',
    'Atomic Blondie',
    'Sunday Girl Blondie',
    'Always on My Mind Pet Shop Boys',
    'Opportunities Pet Shop Boys',
    'Domino Dancing Pet Shop Boys',
    'Are Friends Electric Gary Numan',
    'Human The Human League',
    'Love Action The Human League',
    'Say Hello Wave Goodbye Soft Cell',
    'Alive and Kicking Simple Minds',
    'Belfast Child Simple Minds',
    'Lips Like Sugar Echo and the Bunnymen',
    'The Cutter Echo and the Bunnymen',
    'Head Over Heels Tears for Fears',
    'Mad World Tears for Fears',
    'Sowing the Seeds of Love Tears for Fears',
    'Outdoor Miner Wire',
    'Rise Public Image Ltd',
    'This Is Not a Love Song Public Image Ltd',
    'Vienna Ultravox',
    'Dancing With Tears in My Eyes Ultravox',
    'Enola Gay OMD',
    'If You Leave OMD',
    'Souvenir OMD',
    'Ghosts Japan',
    'Life in Tokyo Japan',
    'Stand and Deliver Adam and the Ants',
    'Ant Music Adam and the Ants',
    'Prince Charming Adam and the Ants',
    'Love My Way The Psychedelic Furs',
    'Pretty in Pink The Psychedelic Furs',
    'Love Like Blood Killing Joke',
    'Totally Wired The Fall',
    'Shot by Both Sides Magazine',
    'Sensoria Cabaret Voltaire',
    'Only You Yazoo',
    'Dont Go Yazoo',
    'A Little Respect Erasure',
    'Oh Lamour Erasure',
    'Chains of Love Erasure',
    'Karma Chameleon Culture Club',
    'Do You Really Want to Hurt Me Culture Club',
    'Church of the Poison Mind Culture Club',
    'True Spandau Ballet',
    'Gold Spandau Ballet',
    'Poison Arrow ABC',
    'The Look of Love ABC',
    'Its My Life Talk Talk',
    'Such a Shame Talk Talk',
    'Golden Brown The Stranglers',
    'Peaches The Stranglers',
    'Ever Fallen in Love Buzzcocks',
    'Anarchy in the UK Sex Pistols',
    'God Save the Queen Sex Pistols',
    'Pretty Vacant Sex Pistols',
    'Town Called Malice The Jam',
    'Going Underground The Jam',
    'Olivers Army Elvis Costello',
    'Alison Elvis Costello',
    'Watching the Detectives Elvis Costello',
    'Tempted Squeeze',
    'Up the Junction Squeeze',
    'I Got You Split Enz',
    'Just What I Needed The Cars',
    'My Best Friends Girl The Cars',
    'Drive The Cars',
    'Only the Lonely The Motels',
    'Words Missing Persons',
    'Take My Breath Away Berlin',
    'Voices Carry Til Tuesday',
    'Hold Me Now Thompson Twins',
    'Doctor Doctor Thompson Twins',
    'No One Is to Blame Howard Jones',
    'Things Can Only Get Better Howard Jones',
    '99 Luftballons Nena',
    'Rock Me Amadeus Falco',
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
    'Around the World Red Hot Chili Peppers',
    'Dani California Red Hot Chili Peppers',
    'Suck My Kiss Red Hot Chili Peppers',
    'Monkey Wrench Foo Fighters',
    'All My Life Foo Fighters',
    'Times Like These Foo Fighters',
    'In Bloom Nirvana',
    'Polly Nirvana',
    'All Apologies Nirvana',
    'Daughter Pearl Jam',
    'Better Man Pearl Jam',
    'Elderly Woman Behind the Counter Pearl Jam',
    'Testify Rage Against the Machine',
    'Sleep Now in the Fire Rage Against the Machine',
    'Faint Linkin Park',
    'Somewhere I Belong Linkin Park',
    'What Ive Done Linkin Park',
    'Papercut Linkin Park',
    'Aerials System of a Down',
    'BYOB System of a Down',
    'Spiders System of a Down',
    'Show Me How to Live Audioslave',
    'I Am the Highway Audioslave',
    'Spoonman Soundgarden',
    'Fell on Black Days Soundgarden',
    'Rusty Cage Soundgarden',
    'Island in the Sun Weezer',
    'Hash Pipe Weezer',
    'Beverly Hills Weezer',
    'When I Come Around Green Day',
    'Longview Green Day',
    'Wake Me Up When September Ends Green Day',
    'Hysteria Muse',
    'Time Is Running Out Muse',
    'Knights of Cydonia Muse',
    'Supermassive Black Hole Muse',
    'Man in the Box Alice in Chains',
    'Would Alice in Chains',
    'Down in a Hole Alice in Chains',
    'Rooster Alice in Chains',
    'Interstate Love Song Stone Temple Pilots',
    'Plush Stone Temple Pilots',
    'Vasoline Stone Temple Pilots',
    '1979 Smashing Pumpkins',
    'Today Smashing Pumpkins',
    'Bullet With Butterfly Wings Smashing Pumpkins',
    'Tonight Tonight Smashing Pumpkins',
    'Creep Radiohead',
    'Karma Police Radiohead',
    'No Surprises Radiohead',
    'Paranoid Android Radiohead',
    'Yellow Coldplay',
    'Clocks Coldplay',
    'Fix You Coldplay',
    'Viva la Vida Coldplay',
    'The Scientist Coldplay',
    'Mr Brightside The Killers',
    'Somebody Told Me The Killers',
    'When You Were Young The Killers',
    'Do I Wanna Know Arctic Monkeys',
    'R U Mine Arctic Monkeys',
    '505 Arctic Monkeys',
    'I Bet You Look Good on the Dancefloor Arctic Monkeys',
    'Sex on Fire Kings of Leon',
    'Use Somebody Kings of Leon',
    'Closer Kings of Leon',
    'Seven Nation Army The White Stripes',
    'Fell in Love With a Girl The White Stripes',
    'All the Small Things Blink-182',
    'Whats My Age Again Blink-182',
    'I Miss You Blink-182',
    'Fat Lip Sum 41',
    'In Too Deep Sum 41',
    'Welcome to the Black Parade My Chemical Romance',
    'Helena My Chemical Romance',
    'Im Not Okay My Chemical Romance',
    'Sugar Were Goin Down Fall Out Boy',
    'Thnks fr th Mmrs Fall Out Boy',
    'Misery Business Paramore',
    'Still Into You Paramore',
    'Aint It Fun Paramore',
    'Bring Me to Life Evanescence',
    'My Immortal Evanescence',
    'Going Under Evanescence',
    'The Kill 30 Seconds to Mars',
    'This Is War 30 Seconds to Mars',
    'Drive Incubus',
    'Wish You Were Here Incubus',
    'Freak on a Leash Korn',
    'Break Stuff Limp Bizkit',
    'Last Resort Papa Roach',
    'Animal I Have Become Three Days Grace',
    'The Diary of Jane Breaking Benjamin',
    'Down With the Sickness Disturbed',
    'Duality Slipknot',
    'I Stand Alone Godsmack',
    'Its Been Awhile Staind',
    'With Arms Wide Open Creed',
    'How You Remind Me Nickelback',
    'Glycerine Bush',
    'Lightning Crashes Live',
    'Shine Collective Soul',
    'Unwell Matchbox Twenty',
    'Semi-Charmed Life Third Eye Blind',
    'Song 2 Blur',
    'Wonderwall Oasis',
    'Dont Look Back in Anger Oasis',
    'Common People Pulp',
    'Every You Every Me Placebo',
    'Only Happy When It Rains Garbage',
    'Just a Girl No Doubt',
    'Dont Speak No Doubt',
    'Self Esteem The Offspring',
    'Come Out and Play The Offspring',
    'The Middle Jimmy Eat World',
    'Ocean Avenue Yellowcard',
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
    '22 Taylor Swift',
    'Delicate Taylor Swift',
    'Lover Taylor Swift',
    'Willow Taylor Swift',
    'ME Taylor Swift',
    'Look What You Made Me Do Taylor Swift',
    'Wildest Dreams Taylor Swift',
    'Fearless Taylor Swift',
    'I Knew You Were Trouble Taylor Swift',
    'Stronger Britney Spears',
    'Everytime Britney Spears',
    'Gimme More Britney Spears',
    'Piece of Me Britney Spears',
    'Sometimes Britney Spears',
    'Aint No Other Man Christina Aguilera',
    'Candyman Christina Aguilera',
    'Hurt Christina Aguilera',
    'Hot n Cold Katy Perry',
    'Dark Horse Katy Perry',
    'Chained to the Rhythm Katy Perry',
    'ET Katy Perry',
    'Part of Me Katy Perry',
    'Into You Ariana Grande',
    'No Tears Left to Cry Ariana Grande',
    'God is a Woman Ariana Grande',
    'Side to Side Ariana Grande',
    'Positions Ariana Grande',
    'Irreplaceable Beyonce',
    'Formation Beyonce',
    'Run the World Girls Beyonce',
    'Love on Top Beyonce',
    'Drunk in Love Beyonce',
    'SOS Rihanna',
    'We Found Love Rihanna',
    'Work Rihanna',
    'Stay Rihanna',
    'Take a Bow Rihanna',
    'Disturbia Rihanna',
    'Telephone Lady Gaga',
    'Alejandro Lady Gaga',
    'Shallow Lady Gaga',
    'Applause Lady Gaga',
    'Million Reasons Lady Gaga',
    'Flowers Miley Cyrus',
    'Malibu Miley Cyrus',
    'We Cant Stop Miley Cyrus',
    'The Climb Miley Cyrus',
    'Blow Kesha',
    'We R Who We R Kesha',
    'Get the Party Started Pink',
    'Raise Your Glass Pink',
    'Try Pink',
    'Perfect Pink',
    'SexyBack Justin Timberlake',
    'Cry Me a River Justin Timberlake',
    'Rock Your Body Justin Timberlake',
    'Mirrors Justin Timberlake',
    'Cant Stop the Feeling Justin Timberlake',
    'Baby Justin Bieber',
    'Sorry Justin Bieber',
    'What Do You Mean Justin Bieber',
    'Love Yourself Justin Bieber',
    'Peaches Justin Bieber',
    'Stitches Shawn Mendes',
    'Treat You Better Shawn Mendes',
    'Senorita Shawn Mendes',
    'Just the Way You Are Bruno Mars',
    'Grenade Bruno Mars',
    'Uptown Funk Bruno Mars',
    '24K Magic Bruno Mars',
    'Locked Out of Heaven Bruno Mars',
    'Rolling in the Deep Adele',
    'Someone Like You Adele',
    'Hello Adele',
    'Set Fire to the Rain Adele',
    'Chandelier Sia',
    'Cheap Thrills Sia',
    'Elastic Heart Sia',
    'Come and Get It Selena Gomez',
    'Good for You Selena Gomez',
    'Lose You to Love Me Selena Gomez',
    'Skyscraper Demi Lovato',
    'Confident Demi Lovato',
    'Sorry Not Sorry Demi Lovato',
    'Havana Camila Cabello',
    'New Rules Dua Lipa',
    'Dont Start Now Dua Lipa',
    'Levitating Dua Lipa',
    'IDGAF Dua Lipa',
    'Bad Guy Billie Eilish',
    'Ocean Eyes Billie Eilish',
    'Happier Than Ever Billie Eilish',
    'Blinding Lights The Weeknd',
    'Cant Feel My Face The Weeknd',
    'Starboy The Weeknd',
    'Shape of You Ed Sheeran',
    'Perfect Ed Sheeran',
    'Thinking Out Loud Ed Sheeran',
    'Sugar Maroon 5',
    'Payphone Maroon 5',
    'Moves Like Jagger Maroon 5',
    'She Will Be Loved Maroon 5',
    'Counting Stars OneRepublic',
    'Apologize OneRepublic',
    'Sucker Jonas Brothers',
    'Burnin Up Jonas Brothers',
    'I Want It That Way Backstreet Boys',
    'Everybody Backstreet Boys',
    'As Long As You Love Me Backstreet Boys',
    'Bye Bye Bye NSYNC',
    'Its Gonna Be Me NSYNC',
    'Say My Name Destinys Child',
    'Survivor Destinys Child',
    'Bootylicious Destinys Child',
    'Yeah Usher',
    'Burn Usher',
    'Confessions Usher',
    'Run It Chris Brown',
    'Kiss Kiss Chris Brown',
    'So Sick Ne-Yo',
    'Because of You Ne-Yo',
    'Low Flo Rida',
    'Right Round Flo Rida',
    'Give Me Everything Pitbull',
    'Timber Pitbull',
    'Promiscuous Nelly Furtado',
    'Say It Right Nelly Furtado',
    'Complicated Avril Lavigne',
    'Sk8er Boi Avril Lavigne',
    'Girlfriend Avril Lavigne',
    'Since U Been Gone Kelly Clarkson',
    'Stronger Kelly Clarkson',
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

// ---- Estado en memoria: la canción del día (cada jugador la juega por su cuenta, cuando quiere) ----
let dailyState = null; // { date, song }

async function ensureDailySong() {
  const date = todayKey();
  if (dailyState && dailyState.date === date) return dailyState;

  let dbRow = null;
  if (pool) {
    try {
      const r = await pool.query('SELECT songs FROM daily_games WHERE play_date = $1', [date]);
      dbRow = r.rows[0] || null;
    } catch (e) {
      console.error('Error leyendo daily_games', e);
    }
  }

  let playlist;
  if (dbRow) {
    playlist = dbRow.songs;
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

  dailyState = { date, song: playlist[0] || null };
  return dailyState;
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

async function hasPlayedToday(name, date) {
  if (!pool) return null; // sin DB no podemos saber si ya jugó: dejamos jugar siempre (modo dev/test)
  try {
    const r = await pool.query('SELECT score FROM daily_scores WHERE play_date = $1 AND player_name = $2', [date, name]);
    return r.rows[0] ? r.rows[0].score : null;
  } catch (e) {
    console.error('Error chequeando si ya jugó hoy', e);
    return null;
  }
}

async function persistPlayerScore(date, name, score) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO daily_scores (play_date, player_name, score) VALUES ($1, $2, $3)
       ON CONFLICT (play_date, player_name) DO UPDATE SET score = EXCLUDED.score, updated_at = now()`,
      [date, name, score]
    );
  } catch (e) {
    console.error('Error guardando puntaje del día', e);
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

// ---- Resultado del día para un jugador (recién terminó, o ya había jugado y vuelve a entrar) ----
async function buildDayResultPayload(date, yourScore) {
  const state = dailyState && dailyState.date === date ? dailyState : await ensureDailySong();
  const song = state.song;
  const results = await getTodayResults(date);
  const monthly = await getMonthlyStandings();
  let history = null;
  if (monthly.isMonthEnd) {
    await persistMonthlyWinnerIfNeeded(monthly);
    history = await getWinnersHistory();
  }
  return {
    title: song ? song.title : '',
    artist: song ? song.artist : '',
    artwork: song ? song.artwork : '',
    yourScore,
    results,
    monthly,
    history,
  };
}

async function finishDailySession(socket, ps) {
  const date = ps.date;
  const score = ps.solved ? POINTS_BY_STAGE[ps.stage - 1] : 0;
  dailySessions.delete(socket.id);
  await persistPlayerScore(date, ps.name, score);
  const payload = await buildDayResultPayload(date, score);
  socket.emit('day-result', payload);
  io.emit('standings-updated', payload.monthly);
  if (payload.history) io.emit('history-updated', payload.history);
}

// ---- Sesiones de juego en curso: cada jugador tiene la suya, independiente del resto ----
const dailySessions = new Map(); // socket.id -> { name, date, stage, solved, out }

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
      const date = todayKey();
      const already = await hasPlayedToday(name, date);
      if (already !== null) {
        const payload = await buildDayResultPayload(date, already);
        return cb({ ok: true, finished: true, ...payload });
      }
      const { song } = await ensureDailySong();
      if (!song) return cb({ ok: false, error: 'No se pudo preparar la canción de hoy. Probá de nuevo en un momento.' });
      socket.data.playerName = name;
      dailySessions.set(socket.id, { name, date, stage: 1, guessesUsed: 0, solved: false, out: false });
      cb({
        ok: true,
        finished: false,
        previewUrl: song.previewUrl,
        maxStage: MAX_STAGE,
        stages: SNIPPET_STAGES,
        maxGuesses: MAX_GUESSES,
      });
    } catch (e) {
      cb({ ok: false, error: 'No se pudo entrar a la partida de hoy.' });
    }
  });

  socket.on('player-skip', async () => {
    const ps = dailySessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    if (ps.stage < MAX_STAGE) {
      ps.stage += 1;
      socket.emit('your-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed });
    }
    // si ya está en la última instancia, "pasar" no hace nada más: no hay más clip para revelar
  });

  socket.on('player-guess', async text => {
    const ps = dailySessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    const song = dailyState && dailyState.date === ps.date ? dailyState.song : null;
    if (!song) return;

    const correct = isGuessCorrect(text, song);
    if (correct) {
      ps.solved = true;
      socket.emit('your-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed, solved: true });
      await finishDailySession(socket, ps);
    } else {
      ps.guessesUsed += 1;
      if (ps.guessesUsed >= MAX_GUESSES) {
        ps.out = true;
        socket.emit('your-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed, wrong: true, out: true });
        await finishDailySession(socket, ps);
      } else {
        socket.emit('your-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed, wrong: true });
      }
    }
  });

  socket.on('player-giveup', async () => {
    const ps = dailySessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    ps.out = true;
    socket.emit('your-progress', { stage: ps.stage, out: true, gaveUp: true });
    await finishDailySession(socket, ps);
  });

  socket.on('guess-suggest', async (query, cb) => {
    const q = (query || '').trim();
    if (q.length < 5) return cb({ ok: true, results: [] });
    try {
      const url = `https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(q)}`;
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
        if (results.length >= 5) break;
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
      practiceSessions.set(socket.id, { song, stage: 1, guessesUsed: 0, solved: false, out: false });
      cb({ ok: true, previewUrl: song.previewUrl, maxStage: MAX_STAGE, stages: SNIPPET_STAGES, maxGuesses: MAX_GUESSES });
    } catch (e) {
      cb({ ok: false, error: 'No se pudo conseguir una canción de prueba. Probá de nuevo.' });
    }
  });

  socket.on('practice-skip', () => {
    const ps = practiceSessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    if (ps.stage < MAX_STAGE) {
      ps.stage += 1;
      socket.emit('practice-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed });
    }
    // si ya está en la última instancia, "pasar" no hace nada más: no hay más clip para revelar
  });

  socket.on('practice-guess', text => {
    const ps = practiceSessions.get(socket.id);
    if (!ps || ps.solved || ps.out) return;
    const correct = isGuessCorrect(text, ps.song);
    if (correct) {
      ps.solved = true;
      socket.emit('practice-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed, solved: true });
      socket.emit('practice-end', { title: ps.song.title, artist: ps.song.artist, artwork: ps.song.artwork, solved: true });
      practiceSessions.delete(socket.id);
      return;
    }
    ps.guessesUsed += 1;
    if (ps.guessesUsed < MAX_GUESSES) {
      socket.emit('practice-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed, wrong: true });
    } else {
      ps.out = true;
      socket.emit('practice-progress', { stage: ps.stage, guessesUsed: ps.guessesUsed, wrong: true, out: true });
      socket.emit('practice-end', { title: ps.song.title, artist: ps.song.artist, artwork: ps.song.artwork, solved: false });
      practiceSessions.delete(socket.id);
    }
  });

  socket.on('leave-room', () => dailySessions.delete(socket.id));
  socket.on('disconnect', () => {
    practiceSessions.delete(socket.id);
    dailySessions.delete(socket.id);
  });
});

initDb()
  .catch(e => console.error('No se pudo inicializar la base de datos', e))
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`Bandletina corriendo en el puerto ${PORT}`);
    });
  });
