/* =========================================================
   PORTFOLIO — edit this list to add / remove your work.
   Order here doesn't matter: the site sorts A–Z by band, then song.
   ---------------------------------------------------------
   artist : band / artist name
   title  : song, EP or album title
   roles  : any of "prod", "rec", "mix", "master"
   genre  : short label (optional)
   year   : release year (optional)
   audio  : file name (without extension) in site/audio/
            → plays in the B19 player. Needs both
              <name>.mp3 (320 kbps) and <name>.flac
   url    : artist's page (Bandcamp etc.) — the artist name links
            to it, opens in a new tab. Optional.
   link   : used only when there's no "audio" file. Paste a normal
            share link from: YouTube (incl. YT Music, Shorts), Vimeo,
            Spotify, SoundCloud, Apple Music, Deezer, Tidal.
            It opens as a small player under the track row.
            Bandcamp: use the link from Share/Embed → "EmbeddedPlayer"
            (src="https://bandcamp.com/EmbeddedPlayer/...").
            Any other link opens in a new tab ("LISTEN ↗").
   ========================================================= */
window.B19_WORK = [
  {
    artist: "Whitewater",
    url: "https://whitewaterband.bandcamp.com/",
    title: "Gold Formula",
    roles: ["prod", "rec", "mix", "master"],
    genre: "Stoner rock",
    year: 2019,
    audio: "whitewater-gold-formula"
  },
  {
    artist: "Impala",
    url: "https://impalacore.bandcamp.com/album/25",
    title: "Miło Było",
    roles: ["prod", "rec", "mix", "master"],
    genre: "Post-hardcore / Metalcore",
    year: 2025,
    audio: "impala-bejsment"
  },
  {
    artist: "Whitewater",
    url: "https://whitewaterband.bandcamp.com/",
    title: "Octa",
    roles: ["prod", "rec"],
    genre: "Stoner rock",
    year: 2025,
    audio: "whitewater-octa"
  },
  {
    artist: "Whitewater",
    url: "https://whitewaterband.bandcamp.com/",
    title: "Cedar",
    roles: ["prod", "rec"],
    genre: "Stoner rock",
    year: 2024,
    audio: "whitewater-cedar"
  },
  {
    artist: "Camping Hill",
    title: "Brudne Serca",
    roles: ["prod", "rec", "mix", "master"],
    genre: "Alternative rock",
    year: 2025,
    // no master file yet → plays the YouTube video in the page
    link: "https://www.youtube.com/watch?v=c2w_vgFjx_o"
  }
];
