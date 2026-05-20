// data.jsx — mock data for Today prototype.
// In the real app, all of this reads from Supabase / Course / Tide / Ink.

const TODAY_DATE = new Date('2026-05-19T07:24:00');

const MANTRA = {
  text: '"The impediment to action advances action. What stands in the way becomes the way."',
  source: 'Marcus Aurelius'
};

const OURA = {
  readiness: 78,
  delta: '+4',
  rows: [
    { label: 'sleep',  value: '7h 12m', delta: '+22m' },
    { label: 'hrv',    value: '52 ms',  delta: '+6',  dir: 'up' },
    { label: 'rhr',    value: '58 bpm', delta: '-2',  dir: 'up' },
    { label: 'temp',   value: '+0.2°',  delta: 'norm' },
  ]
};

const HEALTH_INSIGHT =
  'HRV up, RHR down. Body is recovered. Schedule the hard work this morning.';

const TIDE_HABITS = [
  { id: 'h1', label: 'Water · 2L',          tag: 'habit',     checked: false },
  { id: 'h2', label: 'Magnesium · creatine', tag: 'habit',    checked: true  },
  { id: 'h3', label: 'Cold shower',         tag: 'challenge', checked: false },
  { id: 'h4', label: 'Read 20 min',         tag: 'habit',     checked: false },
];

const TIDE_BACKFILL = [
  { id: 'b1', label: 'Steps · estimate',   tag: 'yesterday', checked: false },
  { id: 'b2', label: 'Lift session done',  tag: 'yesterday', checked: false },
];

const GROUNDING = [
  { name: 'Waking Up',      src: 'app',  kind: 'meditate' },
  { name: 'Stoic meditate', src: 'ink',  kind: 'meditate' },
  { name: 'Stoic morning',  src: 'ink',  kind: 'reflect' },
  { name: 'Memento mori',   src: 'ink',  kind: 'reflect' },
];

const CAL_EVENTS = [
  { id: 'e1', start: '10:00', end: '11:00', title: 'Call with Jon',     pillar: 'arrow' },
  { id: 'e2', start: '11:30', end: '12:00', title: 'Drane sync',        pillar: 'arrow' },
  { id: 'e3', start: '15:00', end: '16:00', title: 'Accenture review',  pillar: 'arrow' },
];

// Pillars + projects + tasks — what Triage operates on
const PILLARS = [
  {
    id: 'arrow', name: 'Arrow', color: 'arrow',
    openTasks: [
      { id: 'a-ot1', label: 'Slack the team about Friday hand-off', est: '5m'  },
      { id: 'a-ot2', label: 'Approve Sarah\u2019s travel reimbursement', est: '5m' },
    ],
    projects: [
      { id: 'p-morocco', name: 'Morocco onboarding', meta: 'this week', tasks: [
        { id: 't1', label: 'Confirm Casablanca lease terms with Cedric', est: '15m' },
        { id: 't2', label: 'Draft Q3 onboarding plan for Sarah',          est: '45m' },
      ]},
      { id: 'p-drane',   name: 'Drane partnership', meta: 'in flight', tasks: [
        { id: 't3', label: 'Sync prep notes',          est: '15m' },
        { id: 't4', label: 'Pull last quarter numbers', est: '20m' },
      ]},
      { id: 'p-accenture', name: 'Accenture review', meta: 'today 3pm', tasks: [
        { id: 't5', label: 'Read pre-read',            est: '30m' },
      ]},
    ]
  },
  {
    id: 'sunny', name: 'Sunny', color: 'sunny',
    openTasks: [
      { id: 's-ot1', label: 'Order vinyl pressing samples', est: '10m' },
    ],
    projects: [
      { id: 'p-music', name: 'Music · grimey neo-soul EP', meta: 'creative', tasks: [
        { id: 't6', label: 'Track 3 — Eb9 transition bridge', est: '60m' },
        { id: 't7', label: 'Bounce rough mix of Track 1',     est: '30m' },
      ]},
      { id: 'p-pizza', name: 'Pizza setup', meta: 'home', tasks: [
        { id: 't8', label: 'Season the steel before weekend', est: '20m' },
      ]},
      { id: 'p-fitness', name: 'Fitness', meta: 'daily', tasks: [
        { id: 't9', label: 'Zone 2 — 45 min after work',      est: '45m' },
      ]},
    ]
  },
  {
    id: 'life', name: 'Life', color: 'life',
    openTasks: [],
    projects: [
      { id: 'p-apartment', name: 'Apartment', meta: 'admin', tasks: [
        { id: 't10', label: 'Renew gym membership',           est: '10m' },
        { id: 't11', label: 'Call landlord re: bathroom fan', est: '15m' },
      ]},
      { id: 'p-admin', name: 'Admin', meta: 'admin', tasks: [
        { id: 't12', label: 'Amex statement review',          est: '25m' },
        { id: 't13', label: 'Book dentist follow-up',         est: '10m' },
        { id: 't14', label: 'Reply to Mom about June',        est: '5m' },
      ]},
    ]
  },
  {
    id: 'open', name: 'Open Tasks', color: 'open',
    openTasks: [
      { id: 't15', label: 'Pay quarterly tax estimate',     est: '20m' },
      { id: 't16', label: 'Update LinkedIn bio',            est: '15m' },
    ],
    projects: []
  }
];

// What's placed on the day's calendar (the result of scheduling)
// Each block can be: hard-line meeting (from gcal), routine, or pillar block
const PLACED_BLOCKS = [
  { id: 'b-arrow-1', hour: 9,  duration: 60, type: 'arrow',   title: 'Arrow · Morocco onboarding doc', detail: 'deep work',     pillar: 'arrow' },
  { id: 'b-meet-1',  hour: 10, duration: 60, type: 'meeting', title: 'Call with Jon',                  detail: '10:00 — 11:00', pillar: null    },
  { id: 'b-arrow-2', hour: 11, duration: 30, type: 'arrow',   title: 'Arrow · Drane sync prep',        detail: '11:00 — 11:30', pillar: 'arrow', active: true },
  { id: 'b-meet-2',  hour: 11.5, duration: 30, type: 'meeting', title: 'Drane sync',                   detail: '11:30 — 12:00', pillar: null    },
  { id: 'b-rt-1',    hour: 12, duration: 45, type: 'routine', title: 'Lunch',                          detail: 'routine',       pillar: null    },
  { id: 'b-sunny-1', hour: 14, duration: 60, type: 'sunny',   title: 'Sunny · Track 3 bridge',         detail: 'deep work',     pillar: 'sunny' },
  { id: 'b-meet-3',  hour: 15, duration: 60, type: 'meeting', title: 'Accenture review',               detail: '3:00 — 4:00',   pillar: null    },
  { id: 'b-life-1',  hour: 17, duration: 30, type: 'life',    title: 'Life · admin batch',             detail: '5:00 — 5:30',   pillar: 'life'  },
  { id: 'b-rt-2',    hour: 18, duration: 60, type: 'routine', title: 'Gym',                            detail: '6:00 — 7:00 · routine', pillar: null },
];

const SUGGESTIONS = [
  { hour: 13, text: '"Amex statement review · 25 min"',     pillar: 'life' },
  { hour: 16, text: '"Casablanca lease — 6 days waiting"', pillar: 'arrow' },
];

const OPEN_TASKS = [
  { id: 'ot1', pillar: 'arrow', label: 'Confirm Casablanca lease terms with Cedric', est: '15m' },
  { id: 'ot2', pillar: 'arrow', label: 'Reply to Sarah re: Q3 onboarding plan',      est: '10m' },
  { id: 'ot3', pillar: 'life',  label: 'Reply to Mom about June',                    est: '5m'  },
  { id: 'ot4', pillar: 'sunny', label: 'Season the steel before this weekend',       est: '20m' },
];

const ROUTINES = [
  { id: 'r-gym',   name: 'Gym',   hour: 18, duration: 60, autoPlaced: false },
];

const YESTERDAY = {
  completed: 9,
  pushed: 4,
  oura: { score: 74 },
  topReflection: 'Drane sync hit pause. Pick up Monday.',
  events: [
    { time: '10:00', title: 'Standup' },
    { time: '14:00', title: 'Investor call' },
  ],
  habits: [
    { id: 'h1', label: 'Water · 2L',           tag: 'habit',     checked: true  },
    { id: 'h2', label: 'Magnesium · creatine', tag: 'habit',     checked: true  },
    { id: 'h3', label: 'Cold shower',          tag: 'challenge', checked: false },
    { id: 'h4', label: 'Read 20 min',          tag: 'habit',     checked: true  },
    { id: 'h5', label: 'Lift session',         tag: 'habit',     checked: true  },
  ],
  highlight: null, // not yet filled in Ink
};

const TOMORROW = {
  events: [
    { time: '09:00', title: 'Team weekly' },
    { time: '13:00', title: 'Morocco follow-up' },
  ],
  proposed: [
    { pillar: 'arrow', label: 'Block: Morocco onboarding wrap', detail: '2h deep' },
    { pillar: 'sunny', label: 'Block: Track 3 second pass',     detail: '90m'    },
    { pillar: 'life',  label: 'Block: Admin batch',             detail: '30m'    },
  ],
  triageQueue: [
    { pillar: 'arrow', count: 6, sample: 'Send Cedric the lease draft' },
    { pillar: 'sunny', count: 2, sample: 'Bounce Track 1 rough mix'    },
    { pillar: 'life',  count: 3, sample: 'Dentist follow-up'           },
    { pillar: 'open',  count: 1, sample: 'Pay quarterly tax estimate'  },
  ],
};

const WEEK = [
  { day: 'M', date: 18, label: 'mon', blocks: 5, focusH: 2.8, isToday: false, isPast: true,  meeting: 2 },
  { day: 'T', date: 19, label: 'tue', blocks: 6, focusH: 3.5, isToday: true,  isPast: false, meeting: 3 },
  { day: 'W', date: 20, label: 'wed', blocks: 4, focusH: 4.0, isToday: false, isPast: false, isTomorrow: true, meeting: 2 },
  { day: 'T', date: 21, label: 'thu', blocks: 3, focusH: 1.5, isToday: false, isPast: false, meeting: 1 },
  { day: 'F', date: 22, label: 'fri', blocks: 2, focusH: 1.0, isToday: false, isPast: false, meeting: 0 },
  { day: 'S', date: 23, label: 'sat', blocks: 1, focusH: 0,   isToday: false, isPast: false, meeting: 0 },
  { day: 'S', date: 24, label: 'sun', blocks: 1, focusH: 0,   isToday: false, isPast: false, meeting: 0 },
];

Object.assign(window, {
  TODAY_DATA: {
    TODAY_DATE, MANTRA, OURA, HEALTH_INSIGHT,
    TIDE_HABITS, TIDE_BACKFILL, GROUNDING,
    CAL_EVENTS, PILLARS, PLACED_BLOCKS, SUGGESTIONS,
    OPEN_TASKS, ROUTINES, YESTERDAY, TOMORROW, WEEK,
  }
});
