// Every dataset theme maps onto the same shape (a fact table plus a small
// dimension table), so one set of question templates works for all of them.
// All names below are invented. No real company or employer data.

export interface ThemeCols {
  table: string;
  id: string;
  key: string;
  a: string; // category column 1
  b: string; // category column 2
  m: string; // main measure
  m2: string; // second measure
  date: string;
  nul: string; // nullable text column
}

export interface DimCols {
  table: string;
  key: string;
  name: string;
  attr: string;
  dm: string; // numeric attribute
}

export interface Theme {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  fact: ThemeCols;
  dim: DimCols;
  label: {
    row: string;
    rows: string;
    a: string;
    b: string;
    m: string;
    m2: string;
    nul: string;
    nulMissing: string; // what NULL means in this story
    dimRow: string;
    dimRows: string;
    attr: string;
    dm: string;
  };
  gen: {
    a: string[];
    b: string[];
    m: [number, number, number];
    m2: [number, number];
    nul: string[];
    nulRate: number;
    names: string[];
    attr: string[];
    dm: [number, number];
  };
}

export const THEMES: Theme[] = [
  {
    id: "retail",
    name: "Retail Orders",
    icon: "🛒",
    tagline: "A small online shop with orders and customers.",
    fact: { table: "orders", id: "order_id", key: "customer_id", a: "city", b: "category", m: "amount", m2: "qty", date: "order_date", nul: "coupon" },
    dim: { table: "customers", key: "customer_id", name: "name", attr: "tier", dm: "age" },
    label: { row: "order", rows: "orders", a: "city", b: "category", m: "amount", m2: "quantity", nul: "coupon", nulMissing: "no coupon used", dimRow: "customer", dimRows: "customers", attr: "tier", dm: "age" },
    gen: {
      a: ["Mumbai", "Pune", "Delhi", "Bengaluru", "Chennai", "Jaipur", "Hyderabad", "Kolkata"],
      b: ["Electronics", "Grocery", "Fashion", "Books", "Toys", "Home"],
      m: [150, 4800, 50],
      m2: [1, 6],
      nul: ["SAVE10", "FEST20", "NEWUSER", "FREESHIP"],
      nulRate: 0.4,
      names: ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sana", "Vikram", "Isha", "Arjun", "Tara", "Neel", "Zoya"],
      attr: ["Basic", "Plus", "Elite"],
      dm: [19, 58],
    },
  },
  {
    id: "ipl",
    name: "IPL Innings",
    icon: "🏏",
    tagline: "Batting scores from an imaginary T20 season.",
    fact: { table: "innings", id: "inning_id", key: "player_id", a: "venue", b: "opponent", m: "runs", m2: "balls", date: "match_date", nul: "dismissal" },
    dim: { table: "players", key: "player_id", name: "name", attr: "role", dm: "age" },
    label: { row: "innings", rows: "innings", a: "venue", b: "opponent", m: "runs", m2: "balls faced", nul: "dismissal", nulMissing: "not out", dimRow: "player", dimRows: "players", attr: "role", dm: "age" },
    gen: {
      a: ["Wankhede", "Chepauk", "Eden Gardens", "Chinnaswamy", "Kotla", "Motera", "Uppal"],
      b: ["Mumbai Meteors", "Chennai Cyclones", "Delhi Dynamos", "Bengaluru Blasters", "Kolkata Comets", "Jaipur Jaguars"],
      m: [0, 96, 1],
      m2: [3, 58],
      nul: ["caught", "bowled", "lbw", "run out"],
      nulRate: 0.3,
      names: ["R. Kale", "A. Shetty", "V. Iyer", "S. Gill", "M. Rana", "K. Bose", "P. Naik", "J. Dutta", "H. Patel", "T. Rao"],
      attr: ["Batter", "Bowler", "All-rounder", "Keeper"],
      dm: [19, 38],
    },
  },
  {
    id: "trains",
    name: "Mumbai Locals",
    icon: "🚆",
    tagline: "Passenger counts and delays on suburban trains.",
    fact: { table: "journeys", id: "journey_id", key: "train_id", a: "station", b: "time_slot", m: "passengers", m2: "delay_min", date: "journey_date", nul: "delay_reason" },
    dim: { table: "trains", key: "train_id", name: "train_name", attr: "line", dm: "cars" },
    label: { row: "journey", rows: "journeys", a: "station", b: "time slot", m: "passengers", m2: "delay in minutes", nul: "delay reason", nulMissing: "no reason logged", dimRow: "train", dimRows: "trains", attr: "line", dm: "number of cars" },
    gen: {
      a: ["Dadar", "Andheri", "Thane", "Kurla", "Borivali", "Churchgate", "Ghatkopar", "Vashi"],
      b: ["Morning Peak", "Afternoon", "Evening Peak", "Night"],
      m: [800, 4200, 50],
      m2: [0, 25],
      nul: ["Signal", "Crowding", "Rain", "Track work"],
      nulRate: 0.45,
      names: ["Virar Fast", "Thane Slow", "Panvel Local", "Churchgate AC", "Kalyan Fast", "Borivali Slow", "Vashi Local", "Karjat Fast"],
      attr: ["Western", "Central", "Harbour"],
      dm: [12, 15],
    },
  },
  {
    id: "movies",
    name: "Movie Night",
    icon: "🎬",
    tagline: "Ticket sales for invented films across cities.",
    fact: { table: "shows", id: "show_id", key: "movie_id", a: "city", b: "format", m: "tickets", m2: "price", date: "show_date", nul: "promo" },
    dim: { table: "movies", key: "movie_id", name: "title", attr: "genre", dm: "runtime" },
    label: { row: "show", rows: "shows", a: "city", b: "format", m: "tickets sold", m2: "ticket price", nul: "promo", nulMissing: "no promo", dimRow: "movie", dimRows: "movies", attr: "genre", dm: "runtime" },
    gen: {
      a: ["Mumbai", "Pune", "Delhi", "Kochi", "Lucknow", "Indore", "Surat"],
      b: ["2D", "3D", "IMAX", "4DX"],
      m: [20, 300, 1],
      m2: [150, 650],
      nul: ["BOGO", "STUDENT", "EARLYBIRD"],
      nulRate: 0.4,
      names: ["Neon Monsoon", "The Last Local", "Chai and Chaos", "Byte Club", "Cyber Sultan", "Midnight Masala", "Kabaddi Kings", "Lost in Lonavala"],
      attr: ["Action", "Comedy", "Drama", "Sci-Fi"],
      dm: [95, 178],
    },
  },
  {
    id: "food",
    name: "Food Delivery",
    icon: "🍛",
    tagline: "Delivery runs, bills and riders in one busy week.",
    fact: { table: "deliveries", id: "delivery_id", key: "rider_id", a: "area", b: "cuisine", m: "bill", m2: "minutes", date: "order_date", nul: "promo" },
    dim: { table: "riders", key: "rider_id", name: "rider", attr: "vehicle", dm: "years" },
    label: { row: "delivery", rows: "deliveries", a: "area", b: "cuisine", m: "bill", m2: "delivery minutes", nul: "promo", nulMissing: "no promo", dimRow: "rider", dimRows: "riders", attr: "vehicle", dm: "years riding" },
    gen: {
      a: ["Bandra", "Andheri", "Powai", "Colaba", "Juhu", "Worli", "Malad"],
      b: ["Biryani", "Pizza", "Thali", "Chinese", "Dosa", "Burger"],
      m: [120, 1800, 10],
      m2: [12, 55],
      nul: ["FIRST50", "WEEKEND", "RAINY"],
      nulRate: 0.45,
      names: ["Raju", "Salim", "Pooja", "Imran", "Lata", "Govind", "Ayesha", "Manoj", "Rekha", "Deepak"],
      attr: ["Bike", "E-bike", "Cycle"],
      dm: [1, 9],
    },
  },
  {
    id: "music",
    name: "Music Streams",
    icon: "🎧",
    tagline: "Plays by made-up artists on a tiny streaming app.",
    fact: { table: "streams", id: "stream_id", key: "artist_id", a: "city", b: "device", m: "plays", m2: "minutes", date: "stream_date", nul: "playlist" },
    dim: { table: "artists", key: "artist_id", name: "artist", attr: "genre", dm: "debut_year" },
    label: { row: "stream record", rows: "stream records", a: "city", b: "device", m: "plays", m2: "minutes", nul: "playlist", nulMissing: "not from a playlist", dimRow: "artist", dimRows: "artists", attr: "genre", dm: "debut year" },
    gen: {
      a: ["Mumbai", "Goa", "Shillong", "Delhi", "Bengaluru", "Chandigarh", "Pune"],
      b: ["Phone", "Web", "Smart TV", "Car"],
      m: [50, 2000, 10],
      m2: [10, 900],
      nul: ["Chill Vibes", "Workout", "Road Trip", "Focus"],
      nulRate: 0.4,
      names: ["DJ Chutney", "The Ragas", "Lofi Lassi", "Bass Bandra", "Kavya K", "Monsoon Theory", "Arcade Ashes", "Pixel Qawwali"],
      attr: ["Indie", "Electronic", "Hip-Hop", "Fusion"],
      dm: [2008, 2024],
    },
  },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
