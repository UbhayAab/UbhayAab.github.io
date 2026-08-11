// The five deep-dives.
//
// The brief called for a dedicated cinematic page per frontier theme, each
// reskinning the environment to its signal colour and carrying a manifesto, a
// thesis, the opportunity and a themed interactive. This is the content layer
// for those five.
//
// The prose is a draft in Ubhay's voice and should be edited by him. The
// figures are not: every number below is a real, public, checkable one, and
// each carries the source in `note` so nothing on this site asserts a
// quantity without saying where it came from.

window.VISION = [
  {
    slug: 'nuclear',
    title: 'Nuclear energy',
    subtitle: 'Fission efficiency',
    color: '#f59e0b',
    manifesto: 'The cleanest, densest power humanity has ever built, and we talked ourselves out of it.',
    thesis: [
      'Nuclear is the only dispatchable source that is simultaneously near-zero carbon, land-frugal and available at any latitude in any weather. It lost on none of those. It lost on capital cost, schedule risk and the political economy of one-off megaprojects.',
      'That is a manufacturing problem wearing a physics costume. Every plant built as a bespoke civil-engineering project relearns its lessons from scratch. Modular reactors invert it: build the same unit hundreds of times in a factory, ship it, and let the learning curve do what it does to every other manufactured good.',
      'The bet is not that fission gets better. The bet is that it gets boring.',
    ],
    numbers: [
      { value: '92.3%', label: 'capacity factor', note: 'US nuclear fleet, 2023, EIA. Highest of any source; wind is about 33%, utility solar about 25%.' },
      { value: '~0.3 km2', label: 'land per TWh/yr', note: 'Roughly two orders of magnitude less than solar or wind for the same annual energy.' },
      { value: '2.1 M', label: 'times denser than coal', note: 'Energy per kilogram of U-235 fission against bituminous coal combustion.' },
    ],
    pillars: [
      { title: 'Serial production, not projects', body: 'The cost of a first-of-a-kind plant tells you almost nothing about the cost of the eightieth. Nuclear has almost no eightieths.' },
      { title: 'Regulation priced correctly', body: 'Safety rules should be indexed to actual delivered harm per unit energy. On that measure fission already wins and is regulated as if it loses.' },
      { title: 'Waste is a storage problem', body: 'All the spent fuel the US has ever produced would cover a single football field to a depth of about ten metres. That is a logistics answer, not a civilisational one.' },
      { title: 'Grid stability as a product', body: 'Firm power is worth more than its energy. As grids get more intermittent, the premium on dispatchable output rises, and nothing else is both firm and clean.' },
    ],
    sim: { id: 'reactor', label: 'Hold a reactor critical' },
    closing: 'If the twentieth century got the physics right and the economics wrong, the twenty-first only has to fix the second one.',
  },

  {
    slug: 'farming',
    title: 'Vertical farming',
    subtitle: 'Hydroponic automation',
    color: '#22c55e',
    manifesto: 'Grow food where it is eaten, and the supply chain stops being the product.',
    thesis: [
      'Most of what a vegetable costs is not growing it. It is moving it, chilling it, and throwing away the third of it that spoils on the way. Vertical farming attacks the logistics, not the agronomy.',
      'The honest problem is energy. Outdoors the sun is free; indoors every photon is on the meter, and that single line item has killed most of the first generation of the industry. Anyone selling vertical farming without a cheap-electricity story is selling a rounding error.',
      'Which is why this is the same bet as the reactor. Cheap firm power turns an uneconomic farm into an economic one, in the same building, with no change to the biology.',
    ],
    numbers: [
      { value: '~95%', label: 'less water', note: 'Closed-loop hydroponics against open-field irrigation for leafy greens; recirculation recovers most transpiration.' },
      { value: '30-40%', label: 'of food is lost or wasted', note: 'FAO/UNEP estimates for the share of global food production lost or wasted; a large part of it in transport and storage.' },
      { value: '~1/365', label: 'of the land', note: 'Stacked layers plus year-round cycles against a single outdoor season, for the same annual leafy-green yield.' },
    ],
    pillars: [
      { title: 'Energy is the whole argument', body: 'Photosynthesis has a fixed price in joules. Until electricity is cheap and firm, an indoor farm is a way of converting expensive power into cheap lettuce.' },
      { title: 'Crops that justify the photons', body: 'High value, short cycle, fragile in transit. Leafy greens, herbs, berries, pharma inputs. Not staple grains, and anyone claiming otherwise has not done the arithmetic.' },
      { title: 'Autonomy over labour', body: 'The margin sits in the gap between what a plant needs and what a human notices. That gap is closed with sensors and control loops, not more staff.' },
      { title: 'Sited at the demand', body: 'The value is proximity. A farm an hour from the plate beats a farm with better yields a continent away.' },
    ],
    sim: { id: 'farm', label: 'Run a grow cycle' },
    closing: 'Not a replacement for fields. A replacement for the two thousand kilometres between the field and the plate.',
  },

  {
    slug: 'space',
    title: 'Space infrastructure',
    subtitle: 'Orbital logistics',
    color: '#8b5cf6',
    manifesto: 'When the cost of reaching orbit collapses, everything downstream of it becomes a business.',
    thesis: [
      'Nothing about space changed in the last decade except the price. That was enough. Reusability turned launch from a national programme into a freight service, and freight services create industries the way roads create towns.',
      'The interesting layer is not rockets. It is what becomes reasonable once mass to orbit is cheap: manufacturing in microgravity, power collected where there is no night, propellant depots, and eventually pulling materials from bodies that never had a gravity well worth escaping.',
      'The whole of it is a logistics problem. That happens to be the problem I know best.',
    ],
    numbers: [
      { value: '$65k to ~$1.4k', label: 'per kg to LEO', note: 'Space Shuttle era against Falcon 9 reusable pricing. Roughly a 40x fall inside one working lifetime.' },
      { value: '~9.4 km/s', label: 'delta-v to orbit', note: 'Including gravity and drag losses. The physics did not get easier; the accounting did.' },
      { value: '0', label: 'nights in orbit', note: 'A correctly placed solar collector never enters eclipse, which is why orbital power keeps being reinvented.' },
    ],
    pillars: [
      { title: 'Price is the technology', body: 'No new physics was required to open space. A 40x cost reduction did what forty years of ambition could not.' },
      { title: 'Depots beat bigger rockets', body: 'Refuelling in orbit decouples payload from launch vehicle size. It is the shipping container of spaceflight.' },
      { title: 'Materials, eventually', body: 'Asteroid mining is not a near-term business. It is the far end of a chain whose near end, cheap lift, already exists.' },
      { title: 'The boring middle', body: 'Tracking, scheduling, insurance, debris, standards. Unglamorous, and where infrastructure businesses actually live.' },
    ],
    sim: { id: 'mine', label: 'Prospect an asteroid' },
    closing: 'The rocket you scrolled past to get here is the cheap part now. That is the entire point.',
  },

  {
    slug: 'robotics',
    title: 'Robotics',
    subtitle: 'General purpose agents',
    color: '#ef4444',
    manifesto: 'We automated thinking before we automated picking things up, which is exactly backwards from what anyone expected.',
    thesis: [
      'Moravec noticed it forty years ago: the hard problems for machines are the ones a one-year-old solves without effort. A model can now pass a professional exam and still cannot reliably fold a towel. Perception and manipulation, not reasoning, are the frontier.',
      'What changed is that the same architectures that ate language are now eating control. Treating a robot policy as a sequence model, trained on demonstrations instead of hand-written controllers, is the first approach that has ever transferred across tasks.',
      'The economics follow the general-purpose part. A machine that does one thing competes with a jig. A machine that does most things competes with hiring.',
    ],
    numbers: [
      { value: '4.28 M', label: 'industrial robots in operation', note: 'IFR World Robotics 2024 estimate of the global operational stock.' },
      { value: '~1 in 10', label: 'of them outside a cage', body: '', note: 'Collaborative robots remain a small share of installations, which is the whole constraint: most automation still cannot share a room with a person.' },
      { value: 'Moravec', label: "'s paradox, 1988", note: 'Reasoning is cheap to automate; sensorimotor skill is expensive. Still the governing fact of the field.' },
    ],
    pillars: [
      { title: 'Manipulation is the bottleneck', body: 'Locomotion is largely solved and looks impressive on video. Hands are neither.' },
      { title: 'Data, not gearboxes', body: 'The scarce input is demonstrations of real tasks in real clutter. Whoever owns that corpus owns the field.' },
      { title: 'Humanoid is a form factor bet', body: 'Not because legs are efficient, but because the world is already built for that shape. It is a compatibility argument.' },
      { title: 'Deployment beats demos', body: 'The gap between a controlled demonstration and a machine that runs a night shift unattended is where every robotics company actually dies.' },
    ],
    sim: { id: 'factory', label: 'Balance a robot line' },
    closing: 'The economy is short of hands, not of intelligence. That is the arbitrage.',
  },

  {
    slug: 'media',
    title: 'Next generation IP',
    subtitle: 'Immersive storytelling',
    color: '#ec4899',
    manifesto: 'The most durable assets of the last century were not factories. They were characters.',
    thesis: [
      'A steel mill depreciates. A world does not. The franchises built in the mid twentieth century are still the highest-margin assets their owners hold, and they cost a fraction of what a comparable industrial asset would have.',
      'What has changed is production cost. Generative tooling collapses the price of the expensive middle, previsualisation, iteration, localisation, so the binding constraint moves back to the only part that never got cheaper: whether anyone cares about the characters.',
      'That means more worlds get attempted and almost all still fail. The scarce input was never rendering. It was taste.',
    ],
    numbers: [
      { value: '~$90 B+', label: 'lifetime franchise revenue', note: 'Widely cited estimates for Pokemon across games, merchandise and media, the highest-grossing media franchise on record.' },
      { value: '~1928', label: 'and still earning', note: 'Steamboat Willie. Assets measured in decades, not quarters.' },
      { value: '<10%', label: 'of the cost is the idea', note: 'Production and marketing dominate a franchise budget, which is exactly the part generative tooling is deflating.' },
    ],
    pillars: [
      { title: 'Worlds compound, films do not', body: 'A single title is a bet. A world is a platform you can keep issuing bets against.' },
      { title: 'Interactive is the native form', body: 'Attention has moved to media you act inside. Passive formats become the trailer.' },
      { title: 'Cheap production, dearer taste', body: 'When everyone can render anything, the premium moves entirely to judgement.' },
      { title: 'Own the characters', body: 'Distribution keeps changing hands every fifteen years. The characters do not.' },
    ],
    sim: null,
    closing: 'Build a world people want to live in and the business model will find you.',
  },
];
