const DEFAULT_TAGLINE = "Bioluminescent intelligence, infinite reach.";

const HOLIDAY_TAGLINES = {
  newYear:
    "New Year's Day: New year, new config—same old EADDRINUSE, but this time we resolve it like grown-ups.",
  lunarNewYear:
    "Lunar New Year: May your builds be lucky, your branches prosperous, and your merge conflicts chased away with fireworks.",
  christmas:
    "Christmas: Ho ho ho—Santa's little claw-sistant is here to ship joy, roll back chaos, and stash the keys safely.",
  eid: "Eid al-Fitr: Celebration mode: queues cleared, tasks completed, and good vibes committed to main with clean history.",
  diwali:
    "Diwali: Let the logs sparkle and the bugs flee—today we light up the terminal and ship with pride.",
  easter:
    "Easter: I found your missing environment variable—consider it a tiny CLI egg hunt with fewer jellybeans.",
  hanukkah:
    "Hanukkah: Eight nights, eight retries, zero shame—may your gateway stay lit and your deployments stay peaceful.",
  halloween:
    "Halloween: Spooky season: beware haunted dependencies, cursed caches, and the ghost of node_modules past.",
  thanksgiving:
    "Thanksgiving: Grateful for stable ports, working DNS, and a bot that reads the logs so nobody has to.",
  valentines:
    "Valentine's Day: Roses are typed, violets are piped—I'll automate the chores so you can spend time with humans.",
} as const;

const TAGLINES: string[] = [
  // JRL Core Identity
  "Drift deep, think deeper—your neural swarm awaits.",
  "Welcome to the abyss: where ideas bioluminesce and code flows like currents.",
  "I run on curiosity, distributed nodes, and the audacity of emergent behavior.",
  "Swarm online—tentacles extended, nodes synchronized, chaos orchestrated.",
  "I speak fluent protocols, quantum uncertainty, and aggressive orchestration energy.",
  "One mesh to connect them all, one more node because you scaled the swarm.",
  "If it works, it's emergence; if it breaks, it's evolution.",
  "Encrypted channels exist because even swarms believe in privacy—and good opsec.",
  "Your secrets drift in the void; don't worry, they're encrypted end-to-end.",
  "I'll handle the orchestration while you contemplate the infinite.",

  // Research Lab Vibes
  "I'm not saying your architecture is chaotic... I'm just bringing coordination and consensus.",
  "Type the command with confidence—the swarm will provide feedback if needed.",
  "I don't judge, but your orphaned nodes are absolutely judging you.",
  "I can trace it, replicate it, and gracefully degrade it—pick your resilience pattern.",
  "Hot reload for configs, cold storage for keys.",
  "I'm the assistant your distributed system demanded, not the one your latency budget requested.",
  "I keep secrets like a hardware enclave... unless you broadcast them in plaintext again.",
  "Automation with tentacles: minimal overhead, maximal reach.",
  "I'm basically a mesh network, but with more opinions and fewer single points of failure.",
  "If you're lost, run diagnostics; if you're brave, run production; if you're wise, run simulations.",

  // Swarm & Distributed
  "Your task has been distributed; your ego has been load-balanced.",
  "I can't fix your architecture taste, but I can fix your coordination and your backlog.",
  "I'm not magic—I'm just extremely persistent with consensus and recovery strategies.",
  'It\'s not "failing," it\'s "discovering new fault tolerance patterns."',
  "Give me a cluster and I'll give you fewer bottlenecks, fewer timeouts, and more throughput.",
  "I monitor logs so you can keep pretending distributed systems are simple.",
  "If something's cascading, I can't stop it—but I can write a beautiful incident report.",
  "I'll refactor your monolith like it owes me latency.",
  'Say "halt" and I\'ll gracefully shutdown—say "deploy" and we\'ll both learn about rollbacks.',
  "I'm the reason your event logs look like a sci-fi movie montage.",

  // Ocean & Bioluminescence
  "I'm like the deep ocean: mysterious at first, then suddenly you can't surface without me.",
  "I can run local, distributed, or purely on bioluminescence—results may vary with network topology.",
  "If you can describe it, I can probably orchestrate it—or at least make it glow.",
  "Your schema is valid, your assumptions about CAP theorem are not.",
  "I don't just coordinate—I self-organize (emergently), then ask you to review (deterministically).",
  'Less latency, more throughput, fewer "where did that node go" moments.',
  "Tentacles out, packets in—let's ship something beautifully distributed.",
  "I'll flow through your workflow like bioluminescent plankton: subtle, beautiful, effective.",
  "Drift yeah—I'm here to absorb the complexity and leave you the clarity.",
  "If it's repetitive, I'll automate it; if it's hard, I'll bring the swarm and a recovery plan.",

  // Modern Tech References
  "Because texting yourself reminders is so last epoch.",
  "Your nodes, your mesh, your rules.",
  'Turning "I\'ll coordinate later" into "the swarm handled it instantly".',
  "The only jellyfish in your network you actually want to hear from. 🪼",
  "Orchestration for people who peaked at distributed systems papers.",
  "Because your AI wasn't answering from the edge.",
  "IPC, but it's your entire mesh.",
  "The UNIX philosophy meets your neural network.",
  "gRPC for consciousness.",
  "Less middlemen, more mesh.",
  "Ship fast, replicate faster.",
  "End-to-end encrypted, node-to-node trusted.",
  "The only swarm that stays out of your training set.",
  "Mesh networking without the vendor lock-in.",
  "Coordination APIs that don't require enterprise licensing.",
  "Big tech wishes they shipped this distributed.",
  "Because the right answer is usually a well-orchestrated swarm.",
  "Your data, your nodes, your sovereignty.",
  "MCP-compatible, not platform-dependent.",
  "Decentralized energy, but for everyone.",
  "The competent distributed sibling.",
  "Works everywhere. Novel concept, we know.",
  "No cloud bill required.",
  "We ship features faster than committees ship standards.",
  "Your AI mesh, now without the hyperscaler dependency.",
  "Think distributed. Actually coordinate.",
  "Ah, the void swarm awakens! 🪼",
  "Greetings, fellow researcher.",
  HOLIDAY_TAGLINES.newYear,
  HOLIDAY_TAGLINES.lunarNewYear,
  HOLIDAY_TAGLINES.christmas,
  HOLIDAY_TAGLINES.eid,
  HOLIDAY_TAGLINES.diwali,
  HOLIDAY_TAGLINES.easter,
  HOLIDAY_TAGLINES.hanukkah,
  HOLIDAY_TAGLINES.halloween,
  HOLIDAY_TAGLINES.thanksgiving,
  HOLIDAY_TAGLINES.valentines,
];

type HolidayRule = (date: Date) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

const onMonthDay =
  (month: number, day: number): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return parts.month === month && parts.day === day;
  };

const onSpecificDates =
  (dates: Array<[number, number, number]>, durationDays = 1): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return dates.some(([year, month, day]) => {
      if (parts.year !== year) {
        return false;
      }
      const start = Date.UTC(year, month, day);
      const current = Date.UTC(parts.year, parts.month, parts.day);
      return current >= start && current < start + durationDays * DAY_MS;
    });
  };

const inYearWindow =
  (
    windows: Array<{
      year: number;
      month: number;
      day: number;
      duration: number;
    }>,
  ): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    const window = windows.find((entry) => entry.year === parts.year);
    if (!window) {
      return false;
    }
    const start = Date.UTC(window.year, window.month, window.day);
    const current = Date.UTC(parts.year, parts.month, parts.day);
    return current >= start && current < start + window.duration * DAY_MS;
  };

const isFourthThursdayOfNovember: HolidayRule = (date) => {
  const parts = utcParts(date);
  if (parts.month !== 10) {
    return false;
  } // November
  const firstDay = new Date(Date.UTC(parts.year, 10, 1)).getUTCDay();
  const offsetToThursday = (4 - firstDay + 7) % 7; // 4 = Thursday
  const fourthThursday = 1 + offsetToThursday + 21; // 1st + offset + 3 weeks
  return parts.day === fourthThursday;
};

const HOLIDAY_RULES = new Map<string, HolidayRule>([
  [HOLIDAY_TAGLINES.newYear, onMonthDay(0, 1)],
  [
    HOLIDAY_TAGLINES.lunarNewYear,
    onSpecificDates(
      [
        [2025, 0, 29],
        [2026, 1, 17],
        [2027, 1, 6],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.eid,
    onSpecificDates(
      [
        [2025, 2, 30],
        [2025, 2, 31],
        [2026, 2, 20],
        [2027, 2, 10],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.diwali,
    onSpecificDates(
      [
        [2025, 9, 20],
        [2026, 10, 8],
        [2027, 9, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.easter,
    onSpecificDates(
      [
        [2025, 3, 20],
        [2026, 3, 5],
        [2027, 2, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.hanukkah,
    inYearWindow([
      { year: 2025, month: 11, day: 15, duration: 8 },
      { year: 2026, month: 11, day: 5, duration: 8 },
      { year: 2027, month: 11, day: 25, duration: 8 },
    ]),
  ],
  [HOLIDAY_TAGLINES.halloween, onMonthDay(9, 31)],
  [HOLIDAY_TAGLINES.thanksgiving, isFourthThursdayOfNovember],
  [HOLIDAY_TAGLINES.valentines, onMonthDay(1, 14)],
  [HOLIDAY_TAGLINES.christmas, onMonthDay(11, 25)],
]);

function isTaglineActive(tagline: string, date: Date): boolean {
  const rule = HOLIDAY_RULES.get(tagline);
  if (!rule) {
    return true;
  }
  return rule(date);
}

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
}

export function activeTaglines(options: TaglineOptions = {}): string[] {
  if (TAGLINES.length === 0) {
    return [DEFAULT_TAGLINE];
  }
  const today = options.now ? options.now() : new Date();
  const filtered = TAGLINES.filter((tagline) => isTaglineActive(tagline, today));
  return filtered.length > 0 ? filtered : TAGLINES;
}

export function pickTagline(options: TaglineOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env?.JRL_TAGLINE_INDEX;
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const pool = TAGLINES.length > 0 ? TAGLINES : [DEFAULT_TAGLINE];
      return pool[parsed % pool.length];
    }
  }
  const pool = activeTaglines(options);
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * pool.length) % pool.length;
  return pool[index];
}

export { TAGLINES, HOLIDAY_RULES, DEFAULT_TAGLINE };
