// One weird fact a day. Each is a real, well-documented fact paired with one
// made-up answer. Server-only: the browser never sees `answer` or `reveal`
// until it has guessed.

export interface Fact {
  emoji: string;
  prompt: string;
  options: [string, string];
  answer: 0 | 1;
  reveal: string;
}

export const FACTS: Fact[] = [
  { emoji: "🦩", prompt: "A group of flamingos is called a…", options: ["flamboyance", "fiesta"], answer: 0, reveal: "A flamboyance. Fitting, for a bird that is pink because of the shrimp and algae it eats." },
  { emoji: "🐾", prompt: "Wombat poop comes out shaped like…", options: ["little spirals", "little cubes"], answer: 1, reveal: "Cubes. Their intestines squeeze it into blocks, which don't roll away from the rocks they mark." },
  { emoji: "🐙", prompt: "How many hearts does an octopus have?", options: ["three", "one, but very big"], answer: 0, reveal: "Three. Two pump blood through the gills, one pumps it to the rest of the body." },
  { emoji: "🦄", prompt: "Scotland's official national animal is the…", options: ["Loch Ness monster", "unicorn"], answer: 1, reveal: "The unicorn. It has been on Scottish royal coats of arms since the 1300s." },
  { emoji: "🪐", prompt: "On Venus, which is longer?", options: ["one day", "one year"], answer: 0, reveal: "One day. Venus takes about 243 Earth days to spin once, but only about 225 to circle the Sun." },
  { emoji: "🦦", prompt: "Sea otters sometimes sleep while…", options: ["holding hands", "humming"], answer: 0, reveal: "Holding hands, so they don't drift apart while floating. They also wrap themselves in kelp." },
  { emoji: "🗼", prompt: "In summer heat, the Eiffel Tower gets…", options: ["shorter", "taller"], answer: 1, reveal: "Taller, by up to about 15 cm. The iron expands when it warms up." },
  { emoji: "🏛️", prompt: "Cleopatra lived closer in time to…", options: ["the Moon landing", "the building of the Great Pyramid"], answer: 0, reveal: "The Moon landing. The Great Pyramid was already about 2,500 years old when she was born." },
  { emoji: "🌳", prompt: "Which is there more of?", options: ["stars in the Milky Way", "trees on Earth"], answer: 1, reveal: "Trees. Earth has around 3 trillion; the Milky Way has roughly 100 to 400 billion stars." },
  { emoji: "🥫", prompt: "The man who designed the Pringles can asked to be buried…", options: ["in a Pringles can", "with a lifetime supply of Pringles"], answer: 0, reveal: "In a Pringles can. Some of Fredric Baur's ashes were buried in one in 2008." },
  { emoji: "🦋", prompt: "Butterflies taste their food with their…", options: ["wings", "feet"], answer: 1, reveal: "Feet. Sensors on their legs tell them if a leaf is good for laying eggs on." },
  { emoji: "🐨", prompt: "Koala fingerprints are…", options: ["almost identical to human ones", "perfectly round"], answer: 0, reveal: "Almost identical to ours, closely enough to confuse an expert under a microscope." },
  { emoji: "⚡", prompt: "A bolt of lightning is…", options: ["cooler than a candle flame", "hotter than the Sun's surface"], answer: 1, reveal: "Hotter than the Sun's surface, by about five times. Lightning can reach around 30,000 °C." },
  { emoji: "🍌", prompt: "Botanically speaking, which one is a berry?", options: ["the banana", "the strawberry"], answer: 0, reveal: "The banana. Strawberries aren't true berries, because their seeds sit on the outside." },
  { emoji: "🥜", prompt: "Peanuts aren't nuts. They are…", options: ["seeds of a palm tree", "legumes, like peas and beans"], answer: 1, reveal: "Legumes. They grow underground in pods, like their cousins the peas and lentils." },
  { emoji: "🐋", prompt: "A blue whale's heart is about the size of…", options: ["a basketball", "a bumper car"], answer: 1, reveal: "A bumper car. It weighs around 180 kg and can beat as slowly as twice a minute." },
  { emoji: "⏱️", prompt: "The shortest war in recorded history lasted…", options: ["under an hour", "three days"], answer: 0, reveal: "Under an hour. The Anglo-Zanzibar War of 1896 was over in about 40 minutes." },
  { emoji: "🍅", prompt: "In the 1830s, ketchup was sold in the US as…", options: ["hair dye", "medicine"], answer: 1, reveal: "Medicine. Tomato pills were sold as a cure for indigestion, until the fad collapsed." },
  { emoji: "✏️", prompt: "The dot on top of a lowercase i is called a…", options: ["tittle", "dimple"], answer: 0, reveal: "A tittle. The j has one too." },
  { emoji: "🌕", prompt: "Which is wider?", options: ["the Moon", "Australia"], answer: 1, reveal: "Australia, at about 4,000 km across. The Moon is about 3,475 km wide." },
  { emoji: "🔭", prompt: "Since it was discovered in 1930, Pluto has orbited the Sun…", options: ["zero full times", "three full times"], answer: 0, reveal: "Zero times. One Pluto year is about 248 Earth years, so its first lap since discovery ends around 2178." },
  { emoji: "🐱", prompt: "Cats can't taste…", options: ["salt", "sweetness"], answer: 1, reveal: "Sweetness. They lack a working sweet taste receptor, so cake does nothing for them." },
  { emoji: "🌊", prompt: "In seahorses, the babies are carried and born by…", options: ["the dad", "the mum"], answer: 0, reveal: "The dad. Males carry the eggs in a pouch and give birth to hundreds of tiny seahorses." },
  { emoji: "🐦", prompt: "A group of crows is called a…", options: ["riot", "murder"], answer: 1, reveal: "A murder. Crows can also remember human faces for years." },
  { emoji: "⭐", prompt: "Starfish don't have any…", options: ["blood", "arms"], answer: 0, reveal: "Blood. They pump filtered seawater around their bodies instead." },
  { emoji: "☁️", prompt: "An ordinary fluffy cloud weighs about as much as…", options: ["a feather pillow", "100 elephants"], answer: 1, reveal: "100 elephants, around 500 tonnes of water. It floats because it's spread across a huge space." },
  { emoji: "🦛", prompt: "Hippos make their own sunscreen. It looks…", options: ["reddish", "bright blue"], answer: 0, reveal: "Reddish. The 'blood sweat' isn't blood or sweat. It blocks sunlight and fights germs." },
  { emoji: "❄️", prompt: "Under its white fur, a polar bear's skin is…", options: ["black", "pink"], answer: 0, reveal: "Black, which soaks up heat. The fur isn't white either: each hair is clear and hollow." },
  { emoji: "🪶", prompt: "An ostrich's eye is bigger than its…", options: ["stomach", "brain"], answer: 1, reveal: "Its brain. Each eye is about 5 cm across, the biggest of any land animal." },
  { emoji: "🏔️", prompt: "Every year, Mount Everest…", options: ["grows a few millimetres", "shrinks by a metre"], answer: 0, reveal: "Grows a few millimetres, as the Indian plate keeps pushing into Asia." },
  { emoji: "🫧", prompt: "Bubble wrap was first invented as…", options: ["packing for eggs", "wallpaper"], answer: 1, reveal: "Wallpaper, in 1957. It flopped, then found its true calling protecting computers." },
  { emoji: "⚔️", prompt: "The Hundred Years' War actually lasted…", options: ["116 years", "exactly 100 years"], answer: 0, reveal: "116 years, from 1337 to 1453, with long breaks in the middle." },
  { emoji: "🦈", prompt: "Sharks have been around longer than…", options: ["bacteria", "trees"], answer: 1, reveal: "Trees. Sharks are about 450 million years old; the first trees appeared around 385 million years ago." },
  { emoji: "🛁", prompt: "If you had a big enough bathtub, Saturn would…", options: ["float", "sink like a rock"], answer: 0, reveal: "Float. Saturn is less dense than water, the only planet in our solar system that is." },
  { emoji: "🐻", prompt: "Tardigrades, or 'water bears', have survived…", options: ["the open vacuum of space", "nothing harsher than a puddle"], answer: 0, reveal: "Space. In 2007 they were exposed to vacuum and radiation outside a satellite, and many lived." },
  { emoji: "🐸", prompt: "In winter, the North American wood frog can…", options: ["freeze solid and thaw back to life", "hibernate inside trees"], answer: 0, reveal: "Freeze solid. Its heart stops, then restarts when it thaws in spring." },
  { emoji: "🔤", prompt: "Which word has no a, e, i, o or u?", options: ["strengths", "rhythms"], answer: 1, reveal: "Rhythms. 'Strengths' sneaks an e in there." },
  { emoji: "🐹", prompt: "In Switzerland it's against the rules to keep just one…", options: ["guinea pig", "cactus"], answer: 0, reveal: "Guinea pig. They're social animals, so Swiss animal welfare rules say they need company." },
  { emoji: "🥖", prompt: "A 'baker's dozen' is…", options: ["11", "13"], answer: 1, reveal: "13. Bakers added an extra loaf so they couldn't be accused of selling short." },
  { emoji: "☕", prompt: "The world's first webcam was pointed at…", options: ["a coffee pot", "a fish tank"], answer: 0, reveal: "A coffee pot at Cambridge University, so people knew if there was coffee before walking over." },
  { emoji: "🦒", prompt: "How many bones are in a giraffe's neck?", options: ["seven", "twenty-one"], answer: 0, reveal: "Seven, the same as yours. Each one is just enormous, up to about 25 cm long." },
  { emoji: "🧱", prompt: "From the Moon, with just your eyes, the Great Wall of China is…", options: ["easy to spot", "impossible to see"], answer: 1, reveal: "Impossible to see. It's long but very narrow. Even from low orbit it's hard to pick out." },
  { emoji: "🐟", prompt: "A goldfish's memory lasts about…", options: ["three seconds", "months"], answer: 1, reveal: "Months. Goldfish can be trained to respond to sounds and colours and remember them." },
  { emoji: "🍎", prompt: "Apples float in water because they are…", options: ["about a quarter air", "coated in natural wax"], answer: 0, reveal: "About a quarter air, which is why apple bobbing works." },
  { emoji: "🌑", prompt: "The Moon has…", options: ["moonquakes", "rivers of lava"], answer: 0, reveal: "Moonquakes. Seismometers left by Apollo astronauts recorded them." },
  { emoji: "🐜", prompt: "Ants breathe…", options: ["with tiny lungs", "without any lungs"], answer: 1, reveal: "Without lungs. Air flows in through small holes in their sides called spiracles." },
  { emoji: "🍯", prompt: "Honey found in ancient Egyptian tombs was…", options: ["turned to stone", "still edible"], answer: 1, reveal: "Still edible. Honey is so low in water and so acidic that bacteria can't live in it." },
  { emoji: "🐌", prompt: "A garden snail has…", options: ["thousands of tiny teeth", "no mouth at all"], answer: 0, reveal: "Thousands of tiny teeth, on a ribbon-like tongue called a radula." },
  { emoji: "🦘", prompt: "Kangaroos find it very hard to…", options: ["jump sideways", "walk backwards"], answer: 1, reveal: "Walk backwards. Their big tail and feet make reversing awkward." },
  { emoji: "🦷", prompt: "The hardest substance in your body is…", options: ["tooth enamel", "your thigh bone"], answer: 0, reveal: "Tooth enamel. It's harder than bone, but can't repair itself." },
  { emoji: "🐄", prompt: "A cow has a stomach with…", options: ["one big chamber", "four chambers"], answer: 1, reveal: "Four chambers, which let it break down tough grass by chewing it more than once." },
  { emoji: "🌋", prompt: "The tallest known volcano in the solar system is on…", options: ["Mars", "Earth"], answer: 0, reveal: "Mars. Olympus Mons is about 22 km high, nearly three times the height of Everest." },
  { emoji: "🦆", prompt: "A duck's feet don't feel cold on ice because…", options: ["they're full of feathers", "of a heat exchange in their legs"], answer: 1, reveal: "Heat exchange. Warm blood flowing down heats the cold blood coming back up." },
  { emoji: "💧", prompt: "Hot water dropped into very cold air (−30 °C or so)…", options: ["turns into snow almost instantly", "falls as a solid ice ball"], answer: 0, reveal: "Turns into a cloud of snow and ice almost instantly, because it breaks into tiny droplets that freeze fast." },
  { emoji: "🐝", prompt: "To make one jar of honey, honeybees fly about…", options: ["the length of a cricket pitch", "around the world, several times"], answer: 1, reveal: "Several trips around the world. A 500 g jar takes roughly 90,000 km of flying." },
  { emoji: "🧠", prompt: "Your brain uses about how much of your body's energy?", options: ["a fifth", "a hundredth"], answer: 0, reveal: "About a fifth, even though it's only around 2% of your body weight." },
  { emoji: "🦉", prompt: "An owl can't move its eyes, so it…", options: ["turns its head about 270°", "blinks to look around"], answer: 0, reveal: "Turns its head up to about 270°, thanks to extra neck bones and special blood vessels." },
  { emoji: "🌶️", prompt: "Birds eating very hot chillies feel…", options: ["the burn twice as much", "no burn at all"], answer: 1, reveal: "No burn. Birds don't react to capsaicin, so they happily spread chilli seeds around." },
];

/** Puzzle numbers count from launch day: #1 on 2026-10-26 (IST). */
export const LAUNCH_DAY = "2026-10-26";

export function puzzleNumber(day: string): number {
  const ms = Date.parse(day + "T00:00:00Z") - Date.parse(LAUNCH_DAY + "T00:00:00Z");
  return Math.round(ms / 86_400_000) + 1;
}

export function factFor(day: string): Fact {
  const i = (((puzzleNumber(day) - 1) % FACTS.length) + FACTS.length) % FACTS.length;
  return FACTS[i];
}

