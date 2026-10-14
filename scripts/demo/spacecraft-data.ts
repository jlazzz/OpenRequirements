// Content of the Kestrel-EO demo project: a fictional 175 kg Earth-observation satellite. Every name, organisation
// and number is invented for the demo, but sized like a real mission.
//
// Each item has a `ref`, used by the script to link items and to find them again. `from` lists the refs of the
// items it is derived from (upstream). `verifies` on a test lists the items it verifies. `mitigates` on a hazard
// lists the requirements that control it. A description is plain text: a blank line starts a paragraph, a line
// starting with "| " is a table row (the first is the header), a line starting with "$$" is an equation in LaTeX,
// and a line starting with "- " is a bullet.

export type Attrs = Record<string, string | number | boolean | string[] | { action: string; expected: string }[]>;
export type Item = { ref: string; name: string; text?: string; attrs: Attrs; from?: string[] };
export type Folder = { folder: string; items: Item[] };
export type Test = Item & { verifies: string[] };

const need = (
  ref: string,
  name: string,
  text: string,
  stakeholder: string,
  phase: string[],
  priority = "High",
): Item => ({
  ref,
  name,
  text,
  attrs: { Status: "Approved", Priority: priority, Stakeholder: stakeholder, "Mission phase": phase },
});

type ReqOpts = {
  method?: "Test" | "Analysis" | "Inspection" | "Demonstration";
  crit?: "Mission critical" | "Safety critical" | "Standard";
  pri?: "High" | "Medium" | "Low";
  status?: "Draft" | "In review" | "Approved" | "Rejected";
  why?: string;
  margin?: number;
  due?: string;
};
const req =
  (subsystem: string, defaultStatus: string) =>
  (ref: string, name: string, text: string, from: string[], o: ReqOpts = {}): Item => ({
    ref,
    name,
    text,
    from,
    attrs: {
      Status: o.status ?? defaultStatus,
      Priority: o.pri ?? "Medium",
      "Verification method": o.method ?? "Test",
      Subsystem: subsystem,
      Criticality: o.crit ?? "Standard",
      ...(o.why ? { Rationale: o.why } : {}),
      ...(o.margin !== undefined ? { "Margin (%)": o.margin } : {}),
      ...(o.due ? { "Need date": o.due } : {}),
    },
  });

// ── Mission Needs ────────────────────────────────────────────────────────────────────────────────────────────

export const missionNeeds: Folder[] = [
  {
    folder: "Users and imagery",
    items: [
      need(
        "MN1",
        "Global land imaging",
        "Users need images of any land area between 82° S and 82° N, refreshed at least every five days, to map change over the whole year.",
        "National Land Survey Office",
        ["Operations"],
      ),
      need(
        "MN2",
        "Crop health monitoring",
        "Agricultural users need visible, red-edge and near-infrared bands that support vegetation indices such as NDVI at field scale (fields of 1 ha and up).",
        "Ministry of Agriculture",
        ["Operations"],
      ),
      need(
        "MN3",
        "Rapid disaster response",
        "During a declared disaster, civil protection needs images of a tasked area within 24 hours of the request, day after day for the length of the event.",
        "Civil Protection Agency",
        ["Operations"],
      ),
      need(
        "MN4",
        "Field-scale detail",
        "Users need enough detail to see individual buildings, roads and field boundaries: about 4 m on the ground.",
        "National Land Survey Office",
        ["Operations"],
      ),
      need(
        "MN5",
        "Timely delivery",
        "Most images must reach users on the day they are taken: emergency users want them within hours.",
        "Civil Protection Agency",
        ["Operations"],
      ),
      need(
        "MN14",
        "Consistent measurements over time",
        "Scientists comparing images years apart need the brightness values to be calibrated and stable over the whole mission.",
        "Climate Research Institute",
        ["Commissioning", "Operations"],
        "Medium",
      ),
      need(
        "MN11",
        "Long-term archive",
        "Every image and its metadata must stay retrievable for at least ten years after it is taken.",
        "National Archive Service",
        ["Operations", "Disposal"],
        "Medium",
      ),
    ],
  },
  {
    folder: "Programme and operations",
    items: [
      need(
        "MN6",
        "Five years of service",
        "The programme is funded for five years of operations and plans its replacement on that basis.",
        "Programme Board",
        ["Operations"],
      ),
      need(
        "MN7",
        "Rideshare launch",
        "To keep launch cost down, the satellite must fly as a secondary passenger on a commercial rideshare launch.",
        "Programme Board",
        ["Launch"],
      ),
      need(
        "MN8",
        "Small operations team",
        "The operator can staff at most three people per shift, so routine operations must be largely automatic.",
        "Mission Operations",
        ["Commissioning", "Operations"],
        "Medium",
      ),
      need(
        "MN12",
        "Survive faults unattended",
        "The satellite must keep itself safe after an on-board fault until the team can respond, including over a long weekend with few ground contacts.",
        "Mission Operations",
        ["Commissioning", "Operations", "Safe mode"],
      ),
    ],
  },
  {
    folder: "Regulation and security",
    items: [
      need(
        "MN9",
        "Leave orbit responsibly",
        "The licensing authority requires the satellite to leave orbit within five years after the end of the mission.",
        "Space Licensing Authority",
        ["Disposal"],
      ),
      need(
        "MN10",
        "Protected commanding and data",
        "Only the operator may command the satellite, and images of sensitive sites must not be readable by third parties on the downlink.",
        "Programme Board",
        ["Operations"],
      ),
      need(
        "MN13",
        "Licensed radio frequencies",
        "The satellite must transmit only in frequency bands allocated and coordinated for it.",
        "Spectrum Authority",
        ["Launch", "Operations"],
      ),
    ],
  },
];

// ── Mission Requirements ─────────────────────────────────────────────────────────────────────────────────────

const mr = req("System", "Approved");
export const missionRequirements: Folder[] = [
  {
    folder: "Orbit and coverage",
    items: [
      mr(
        "MR1",
        "Operational orbit",
        "The mission shall operate in a sun-synchronous orbit at 550 km ± 5 km altitude with a local time of descending node of 10:30 ± 15 min.",
        ["MN1"],
        {
          method: "Analysis",
          pri: "High",
          why: "10:30 gives good sun elevation for land imaging and low cloud cover.",
        },
      ),
      mr(
        "MR2",
        "Revisit time",
        "The mission shall be able to image any point between 82° S and 82° N at least once every 5 days, using roll angles up to 30° off nadir.",
        ["MN1", "MN3"],
        { method: "Analysis", pri: "High", crit: "Mission critical" },
      ),
      mr("MR3", "Swath width", "The imaging swath shall be at least 30 km wide at nadir.", ["MN1"], {
        method: "Analysis",
      }),
      mr("MR7", "Daily imaging capacity", "The mission shall image at least 150,000 km² of land per day.", ["MN1"], {
        method: "Analysis",
        pri: "High",
      }),
    ],
  },
  {
    folder: "Image quality",
    items: [
      mr(
        "MR4",
        "Ground sampling distance",
        "The ground sampling distance shall be 4.0 m or better at nadir in all spectral bands.",
        ["MN4"],
        { pri: "High", crit: "Mission critical" },
      ),
      mr(
        "MR5",
        "Spectral bands",
        "The imager shall provide the following five bands.\n\n| Band | Name | From (nm) | To (nm) |\n| B1 | Blue | 450 | 520 |\n| B2 | Green | 520 | 600 |\n| B3 | Red | 630 | 690 |\n| B4 | Red edge | 700 | 730 |\n| B5 | Near infrared | 770 | 900 |",
        ["MN2"],
        { pri: "High", crit: "Mission critical" },
      ),
      mr(
        "MR6",
        "Signal-to-noise ratio",
        "The signal-to-noise ratio shall be at least 100 in every band for a target of 30 % reflectance at a sun elevation of 30°.",
        ["MN4", "MN14"],
        { pri: "High" },
      ),
      mr(
        "MR21",
        "Radiometric accuracy",
        "Absolute radiometric accuracy shall be within 5 % and stability within 2 % per year over the mission.",
        ["MN14"],
        { pri: "Medium" },
      ),
    ],
  },
  {
    folder: "Data and operations",
    items: [
      mr(
        "MR8",
        "Tasking response",
        "An image of a newly tasked target shall be acquired within 12 hours of the request in 90 % of cases.",
        ["MN3"],
        { method: "Demonstration", pri: "High" },
      ),
      mr(
        "MR9",
        "Delivery latency",
        "90 % of images shall be delivered to users as processed products within 6 hours of acquisition.",
        ["MN5"],
        { method: "Demonstration", pri: "High" },
      ),
      mr(
        "MR20",
        "Ground stations",
        "The ground segment shall use at least two high-latitude ground stations, one in each hemisphere.",
        ["MN5"],
        { method: "Inspection" },
      ),
      mr("MR22", "Archive", "All raw data and processed products shall be archived for at least 10 years.", ["MN11"], {
        method: "Demonstration",
        pri: "Low",
      }),
      mr(
        "MR23",
        "Operations staffing",
        "Routine operations shall need no more than three operators per shift, with planning and pass execution automated.",
        ["MN8"],
        { method: "Demonstration" },
      ),
      mr(
        "MR14",
        "Autonomy",
        "The satellite shall stay safe and power positive for at least 72 hours without any ground contact.",
        ["MN12"],
        { pri: "High", crit: "Mission critical" },
      ),
    ],
  },
  {
    folder: "Launch, lifetime and disposal",
    items: [
      mr(
        "MR10",
        "Mission lifetime",
        "The satellite shall operate for 5 years in orbit with a reliability of at least 0.85.",
        ["MN6"],
        { method: "Analysis", pri: "High" },
      ),
      mr("MR11", "Launch mass", "The launch mass shall not exceed 180 kg, propellant included.", ["MN7"], {
        method: "Inspection",
        pri: "High",
        margin: 3,
      }),
      mr(
        "MR12",
        "Stowed envelope",
        "In launch configuration the satellite shall fit within 1,000 × 800 × 950 mm above the separation plane.",
        ["MN7"],
        { method: "Inspection" },
      ),
      mr(
        "MR13",
        "Launch environment",
        "The satellite shall withstand the launch environments of the rideshare user guide with the qualification margins of ECSS-E-ST-10-03.",
        ["MN7"],
        { pri: "High", crit: "Mission critical" },
      ),
      mr(
        "MR15",
        "Deorbit",
        "The satellite shall re-enter within 5 years after the end of the mission, with a probability of success of at least 0.9.",
        ["MN9"],
        { method: "Analysis", crit: "Safety critical" },
      ),
      mr(
        "MR16",
        "Re-entry casualty risk",
        "The risk of casualty on the ground from re-entry shall be below 1 in 10,000.",
        ["MN9"],
        { method: "Analysis", crit: "Safety critical" },
      ),
    ],
  },
  {
    folder: "Security and spectrum",
    items: [
      mr(
        "MR17",
        "Command authentication",
        "Every telecommand shall be authenticated before it is executed.",
        ["MN10"],
        { pri: "High", crit: "Mission critical" },
      ),
      mr("MR18", "Downlink confidentiality", "Payload data shall be encrypted on the downlink.", ["MN10"], {
        pri: "Medium",
      }),
      mr(
        "MR19",
        "Frequency bands",
        "The satellite shall use S-band (2025–2110 MHz up, 2200–2290 MHz down) for control and X-band (8025–8400 MHz) for payload data.",
        ["MN13"],
        { method: "Inspection" },
      ),
    ],
  },
];

// ── System Requirements ──────────────────────────────────────────────────────────────────────────────────────

const sys = req("System", "Approved");
export const systemRequirements: Folder[] = [
  {
    folder: "Performance",
    items: [
      sys(
        "S1",
        "Pointing accuracy",
        "During imaging, the payload line of sight shall point within 0.05° (3σ) of the commanded direction.",
        ["MR4", "MR2"],
        { pri: "High", crit: "Mission critical", margin: 20 },
      ),
      sys(
        "S2",
        "Pointing stability",
        "During imaging, line-of-sight jitter shall be below 2 µrad over any 1 ms line integration, which is a quarter of a pixel.",
        ["MR4"],
        { pri: "High", crit: "Mission critical" },
      ),
      sys(
        "S3",
        "Agility",
        "The satellite shall slew 30° about the roll axis and settle to imaging stability within 60 s.",
        ["MR2", "MR7"],
        { pri: "High" },
      ),
      sys(
        "S4",
        "Geolocation accuracy",
        "Image pixels shall be located on the ground to within 20 m CE90 without ground control points.",
        ["MR4"],
        { method: "Analysis" },
      ),
      sys("S5", "Imaging duty", "The satellite shall support at least 12 minutes of imaging per orbit.", ["MR7"], {
        method: "Analysis",
        pri: "High",
      }),
      sys(
        "S6",
        "On-board storage",
        "On-board storage shall hold at least 512 GB of payload data at end of life.",
        ["MR7", "MR9"],
        { pri: "High" },
      ),
      sys("S7", "Payload downlink rate", "The X-band downlink shall carry at least 300 Mbit/s of user data.", ["MR9"], {
        pri: "High",
      }),
      sys(
        "S8",
        "Control link rates",
        "The S-band link shall support 64 kbit/s uplink and 256 kbit/s downlink.",
        ["MR8"],
        {},
      ),
      sys("S9", "Time knowledge", "On-board time shall be known to within 1 ms of UTC.", ["MR4"], {
        method: "Analysis",
      }),
      sys("S10", "Position knowledge", "The satellite position shall be known on board to within 10 m (3σ).", ["MR4"], {
        method: "Analysis",
      }),
      sys(
        "S11",
        "On-board calibration",
        "The satellite shall provide a solar diffuser calibration at least once a month and a dark calibration on every imaging pass.",
        ["MR21"],
        {},
      ),
      sys(
        "S12",
        "Image compression",
        "Payload data shall be compressed with CCSDS 122.0 at a ratio of at most 4:1.",
        ["MR9"],
        { method: "Analysis", pri: "Low" },
      ),
    ],
  },
  {
    folder: "Budgets",
    items: [
      sys(
        "S13",
        "Mass budget",
        "The dry mass shall not exceed 160 kg, with a system margin of at least 10 % at CDR.\n\n| Subsystem | Mass (kg) |\n| Structure | 38.0 |\n| Payload | 31.5 |\n| EPS | 24.0 |\n| ADCS | 14.5 |\n| Propulsion (dry) | 9.5 |\n| COMMS | 6.0 |\n| C&DH | 5.5 |\n| Thermal | 4.0 |\n| Harness | 9.0 |\n| Total | 142.0 |",
        ["MR11"],
        { method: "Analysis", pri: "High", margin: 12.7 },
      ),
      sys(
        "S14",
        "Power budget",
        "In the worst-case imaging orbit at end of life, orbit-average power generation shall be at least 1.2 times orbit-average consumption.",
        ["MR10", "MR7"],
        { method: "Analysis", pri: "High", crit: "Mission critical", margin: 20 },
      ),
      sys(
        "S15",
        "Delta-v budget",
        "The propulsion system shall provide at least 120 m/s of delta-v: 60 m/s for orbit maintenance, 15 m/s for collision avoidance and 45 m/s for deorbit.",
        ["MR1", "MR15"],
        { method: "Analysis", margin: 15 },
      ),
      sys(
        "S16",
        "Data budget",
        "Daily downlink capacity shall be at least 1.3 times the daily imaging data volume.",
        ["MR9"],
        { method: "Analysis", margin: 30 },
      ),
      sys(
        "S17",
        "Link margin",
        "Every radio link shall close with at least 3 dB of margin at 5° ground station elevation, with the required energy per bit computed as below.\n$$\\frac{E_b}{N_0} = \\mathrm{EIRP} - L_{fs} - L_{atm} + \\frac{G}{T} - 10\\log_{10}(k\\,R_b)\nwhere R_b is the data rate and k is Boltzmann's constant.",
        ["MR9", "MR8"],
        { method: "Analysis", margin: 3 },
      ),
      sys(
        "S18",
        "Thermal margins",
        "Every unit shall stay at least 5 °C inside its qualification temperature range in all predicted cases.",
        ["MR10"],
        { method: "Analysis" },
      ),
      sys(
        "S19",
        "Reliability",
        "Reliability at 5 years shall be at least 0.85, with no single point of failure in the chain that keeps the satellite safe.",
        ["MR10", "MR14"],
        { method: "Analysis", crit: "Mission critical" },
      ),
    ],
  },
  {
    folder: "Environment",
    items: [
      sys(
        "S20",
        "Quasi-static loads",
        "The satellite shall withstand quasi-static loads of 8.5 g axial and 3.0 g lateral, applied together.",
        ["MR13"],
        { crit: "Mission critical" },
      ),
      sys(
        "S21",
        "Random vibration",
        "The satellite shall withstand random vibration of 14.1 g rms from 20 to 2,000 Hz for 2 minutes per axis.",
        ["MR13"],
        { crit: "Mission critical" },
      ),
      sys(
        "S22",
        "Shock",
        "The satellite shall withstand a shock of 2,000 g (SRS, Q = 10) at the separation interface.",
        ["MR13"],
        {},
      ),
      sys(
        "S23",
        "Stiffness",
        "In launch configuration, the first natural frequency shall be above 45 Hz axially and above 25 Hz laterally.",
        ["MR13"],
        {},
      ),
      sys(
        "S24",
        "Thermal vacuum",
        "The satellite shall operate through 4 thermal vacuum cycles between the qualification limits of every unit.",
        ["MR13", "MR10"],
        { crit: "Mission critical" },
      ),
      sys(
        "S25",
        "Total ionizing dose",
        "Every unit shall tolerate a total ionizing dose of 30 krad(Si) behind 2.5 mm of aluminium.",
        ["MR10"],
        { method: "Analysis" },
      ),
      sys(
        "S26",
        "Single event effects",
        "No unit shall suffer destructive latch-up below a linear energy transfer of 60 MeV·cm²/mg.",
        ["MR10"],
        { method: "Analysis" },
      ),
      sys(
        "S27",
        "Electromagnetic compatibility",
        "The satellite shall meet MIL-STD-461G CE102 and RE102 as tailored in the EMC control plan.",
        ["MR13", "MR19"],
        {},
      ),
      sys(
        "S28",
        "Atomic oxygen and UV",
        "Exterior materials shall be rated for the 5-year atomic oxygen fluence and UV dose of the operational orbit.",
        ["MR10"],
        { method: "Analysis" },
      ),
      sys(
        "S29",
        "Outgassing",
        "Non-metallic materials shall have a total mass loss below 1.0 % and collected volatile condensable material below 0.1 % (ASTM E595).",
        ["MR21"],
        { method: "Inspection" },
      ),
    ],
  },
  {
    folder: "Modes and autonomy",
    items: [
      sys(
        "S30",
        "Operating modes",
        "The satellite shall have these modes:\n\n- Launch\n- Detumble\n- Safe\n- Nominal\n- Imaging\n- Downlink\n- Orbit manoeuvre\n- Deorbit",
        ["MR14"],
        { method: "Demonstration", pri: "High" },
      ),
      sys(
        "S31",
        "Detumble",
        "The satellite shall reduce its body rates from 10 °/s to below 0.5 °/s within 3 orbits.",
        ["MR14"],
        { crit: "Mission critical" },
      ),
      sys(
        "S32",
        "Safe mode",
        "In safe mode the satellite shall point its arrays at the sun, stay power positive and transmit an S-band beacon, within 30 minutes of the trigger.",
        ["MR14"],
        { pri: "High", crit: "Mission critical" },
      ),
      sys(
        "S33",
        "Fault detection and recovery",
        "The satellite shall detect and isolate a failure of a critical unit within 10 s.",
        ["MR14"],
        { pri: "High", crit: "Mission critical" },
      ),
      sys(
        "S34",
        "Stored operations",
        "The satellite shall execute a stored schedule covering at least 7 days of operations.",
        ["MR23", "MR8"],
        {},
      ),
      sys(
        "S35",
        "In-flight software update",
        "Flight software shall be patchable and fully reloadable in orbit.",
        ["MR10"],
        {},
      ),
      sys(
        "S36",
        "Housekeeping telemetry",
        "Housekeeping telemetry shall be sampled at 1 Hz and stored for at least 72 hours.",
        ["MR14"],
        {},
      ),
      sys(
        "S37",
        "Separation sequence",
        "After separation the satellite shall keep all transmitters off for 45 minutes and deploy its solar arrays autonomously after 30 minutes.",
        ["MR13", "MR19"],
        { pri: "High", crit: "Safety critical" },
      ),
    ],
  },
  {
    folder: "Safety and disposal",
    items: [
      sys(
        "S38",
        "Propulsion inhibits",
        "Three independent inhibits shall prevent inadvertent thruster firing during ground operations and launch.",
        ["MR13"],
        { method: "Inspection", pri: "High", crit: "Safety critical" },
      ),
      sys(
        "S39",
        "Pressure vessels",
        "Pressure vessels shall be proof tested at 1.5 times and designed for a burst pressure of at least 2 times the maximum expected operating pressure.",
        ["MR13"],
        { pri: "High", crit: "Safety critical" },
      ),
      sys(
        "S40",
        "Battery safety",
        "The battery shall be protected against overcharge, overdischarge and external short circuit, with two independent protections for each.",
        ["MR13"],
        { pri: "High", crit: "Safety critical" },
      ),
      sys(
        "S41",
        "Passivation",
        "At end of life the satellite shall deplete its propellant, discharge its battery and permanently disable charging.",
        ["MR15"],
        { method: "Demonstration", crit: "Safety critical" },
      ),
      sys(
        "S42",
        "Deorbit reserve",
        "At least 45 m/s of delta-v shall be kept in reserve for deorbit throughout the mission.",
        ["MR15"],
        { method: "Analysis", crit: "Safety critical" },
      ),
      sys(
        "S43",
        "Demisability",
        "No fragment surviving re-entry shall have an impact energy above 15 J, except those listed in the casualty risk assessment.",
        ["MR16"],
        { method: "Analysis", crit: "Safety critical" },
      ),
      sys(
        "S44",
        "Collision avoidance",
        "The satellite shall be able to perform a collision avoidance manoeuvre within 24 hours of a conjunction warning.",
        ["MR15", "MR10"],
        { method: "Demonstration" },
      ),
    ],
  },
  {
    folder: "Security and spectrum",
    items: [
      sys(
        "S45",
        "Telecommand authentication",
        "Every telecommand shall carry an HMAC-SHA256 code and an anti-replay counter, checked before execution.",
        ["MR17"],
        { pri: "High", crit: "Mission critical" },
      ),
      sys(
        "S46",
        "Payload encryption",
        "Payload data shall be encrypted with AES-256-GCM before modulation.",
        ["MR18"],
        {},
      ),
      sys(
        "S47",
        "Key management",
        "The satellite shall hold at least two key slots, support re-keying over the air and zeroize keys on command.",
        ["MR17", "MR18"],
        {},
      ),
      sys(
        "S48",
        "Operator access",
        "Ground operators shall log in with two-factor authentication, and every telecommand sent shall be recorded with the operator's name.",
        ["MR17", "MR23"],
        { method: "Demonstration" },
      ),
      sys(
        "S49",
        "Recovery commands",
        "A small set of hardware recovery commands (reset, safe mode, redundancy switch) shall work without flight software, authenticated with a separate key.",
        ["MR17", "MR14"],
        { crit: "Mission critical" },
      ),
      sys("S50", "Spectrum mask", "Out-of-band emissions shall stay within the masks of ITU-R SM.1541.", ["MR19"], {}),
    ],
  },
];

// ── Subsystem Requirements ───────────────────────────────────────────────────────────────────────────────────

const adcs = req("ADCS", "Approved");
const eps = req("EPS", "Approved");
const comms = req("COMMS", "Approved");
const cdh = req("C&DH", "Approved");
const fsw = req("FSW", "In review");
const prop = req("PROP", "Approved");
const therm = req("THERM", "In review");
const str = req("STR", "Approved");
const pl = req("PAYLOAD", "Approved");
const gnd = req("GROUND", "Draft");

export const subsystemRequirements: Folder[] = [
  {
    folder: "ADCS: Attitude determination and control",
    items: [
      adcs(
        "A1",
        "Attitude knowledge",
        "Attitude shall be determined to within 0.01° (3σ) per axis during imaging.",
        ["S1", "S4"],
        { pri: "High", crit: "Mission critical" },
      ),
      adcs(
        "A2",
        "Star trackers",
        "Two star tracker heads shall be mounted so that at least one is unblinded in every imaging attitude.",
        ["S1", "S19"],
        { method: "Analysis" },
      ),
      adcs("A3", "Gyro noise", "Gyro angle random walk shall be below 0.005 °/√h.", ["S2"], {}),
      adcs(
        "A4",
        "Reaction wheels",
        "Four reaction wheels in a pyramid shall each provide at least 0.4 Nms of momentum and 20 mNm of torque.",
        ["S3"],
        { pri: "High" },
      ),
      adcs(
        "A5",
        "Microvibration",
        "Wheel-induced microvibration at the payload interface shall be below 1 µrad.",
        ["S2"],
        { pri: "High", crit: "Mission critical" },
      ),
      adcs(
        "A6",
        "Magnetorquers",
        "Three magnetorquers of at least 15 Am² each shall dump wheel momentum and detumble the satellite.",
        ["S31"],
        {},
      ),
      adcs(
        "A7",
        "Coarse sun sensors",
        "Coarse sun sensors shall see the sun from any attitude with an accuracy of 5° or better.",
        ["S32"],
        { crit: "Mission critical" },
      ),
      adcs(
        "A8",
        "Slew performance",
        "A 30° roll slew shall complete within 45 s and settle to imaging stability within 15 s.",
        ["S3"],
        { pri: "High" },
      ),
      adcs(
        "A9",
        "Safe mode control",
        "Safe mode sun pointing shall work with reaction wheels, or with magnetorquers alone if the wheels have failed.",
        ["S32", "S19"],
        { pri: "High", crit: "Mission critical" },
      ),
      adcs(
        "A10",
        "GNSS receiver",
        "The GNSS receiver shall give position within 10 m and a pulse per second within 1 µs of UTC.",
        ["S9", "S10"],
        {},
      ),
      adcs("A11", "Control rate", "The attitude estimator and controller shall run at 10 Hz.", ["S1"], {
        method: "Inspection",
        pri: "Low",
      }),
      adcs(
        "A12",
        "B-dot detumble",
        "A B-dot controller using magnetometer and magnetorquers shall detumble the satellite from 10 °/s.",
        ["S31"],
        { crit: "Mission critical" },
      ),
      adcs("A13", "Momentum management", "Wheel momentum shall be unloaded outside imaging windows only.", ["S5"], {
        method: "Analysis",
        pri: "Low",
      }),
      adcs(
        "A14",
        "Target tracking",
        "During imaging, the controller shall track the ground target with yaw steering to compensate for Earth rotation.",
        ["S4"],
        {},
      ),
    ],
  },
  {
    folder: "EPS: Electrical power",
    items: [
      eps(
        "E1",
        "Solar array output",
        "Two deployable wings shall produce at least 380 W at end of life at normal sun incidence.",
        ["S14"],
        { pri: "High", crit: "Mission critical", margin: 8 },
      ),
      eps(
        "E2",
        "Solar cells",
        "Solar cells shall be triple-junction GaAs with a beginning-of-life efficiency of at least 29.5 %.",
        ["S14"],
        { method: "Inspection" },
      ),
      eps(
        "E3",
        "Battery capacity",
        "The Li-ion battery shall store at least 960 Wh at beginning of life, with depth of discharge kept below 30 % in nominal operations.",
        ["S14", "MR10"],
        { pri: "High", crit: "Mission critical" },
      ),
      eps("E4", "Main bus", "The main power bus shall be unregulated at 28 V ± 4 V.", ["S14"], {
        method: "Inspection",
      }),
      eps(
        "E5",
        "Load protection",
        "Every load shall be fed through a latching current limiter that trips, reports and can be reset by command.",
        ["S33", "S40"],
        { pri: "High" },
      ),
      eps(
        "E6",
        "Cell voltage limits",
        "Charging shall stop at 4.20 V per cell and loads shall be shed at 2.70 V per cell, with two independent protections.",
        ["S40"],
        { pri: "High", crit: "Safety critical" },
      ),
      eps(
        "E7",
        "Safe mode power",
        "The satellite shall stay power positive in safe mode with one array wing failed.",
        ["S32", "S19"],
        { method: "Analysis", crit: "Mission critical" },
      ),
      eps(
        "E8",
        "Array deployment",
        "Each wing shall be released by two redundant burn wires and deploy within 30 minutes after separation.",
        ["S37"],
        { pri: "High", crit: "Mission critical" },
      ),
      eps(
        "E9",
        "Load shedding",
        "Non-essential loads shall be shed automatically when the state of charge falls below 40 %.",
        ["S33"],
        {},
      ),
      eps(
        "E10",
        "Charge disable",
        "A command shall disconnect the arrays from the battery permanently for passivation.",
        ["S41"],
        { crit: "Safety critical" },
      ),
      eps("E11", "State of charge", "State of charge shall be estimated to within ± 5 %.", ["S14"], { pri: "Low" }),
      eps("E12", "Battery temperature", "The battery shall operate between 0 °C and +30 °C.", ["S18"], {}),
      eps(
        "E13",
        "Separation switches",
        "Separation switches shall keep every load unpowered until the satellite has separated.",
        ["S37", "S38"],
        { crit: "Safety critical" },
      ),
    ],
  },
  {
    folder: "COMMS: Communications",
    items: [
      comms(
        "C1",
        "X-band transmitter",
        "The X-band transmitter shall send 300 Mbit/s using DVB-S2 with adaptive coding and modulation up to 8PSK.",
        ["S7"],
        { pri: "High" },
      ),
      comms(
        "C2",
        "X-band antenna",
        "An isoflux X-band antenna shall give at least 6 dBi at the edge of coverage.",
        ["S17"],
        {},
      ),
      comms("C3", "X-band power", "X-band RF output power shall be at least 2 W.", ["S17"], {}),
      comms(
        "C4",
        "S-band transceiver",
        "The S-band transceiver shall support 64 kbit/s uplink and 256 kbit/s downlink with CCSDS framing.",
        ["S8"],
        { pri: "High" },
      ),
      comms(
        "C5",
        "S-band antennas",
        "Two hemispherical S-band antennas shall give near-omnidirectional coverage.",
        ["S32", "S19"],
        { crit: "Mission critical" },
      ),
      comms(
        "C6",
        "Receiver always on",
        "The S-band receiver shall be on in every mode once the separation inhibit has ended.",
        ["S32", "S37"],
        { crit: "Mission critical" },
      ),
      comms("C7", "RF inhibit", "No transmitter shall radiate within 45 minutes after separation.", ["S37"], {
        pri: "High",
        crit: "Safety critical",
      }),
      comms(
        "C8",
        "Frequency stability",
        "Carrier frequency shall stay within ± 2 ppm over the operating temperature range.",
        ["S50"],
        {},
      ),
      comms(
        "C9",
        "Spurious emissions",
        "Spurious emissions shall be at least 60 dBc below the carrier outside the allocated band.",
        ["S50"],
        {},
      ),
      comms("C10", "S-band link margin", "The S-band link shall close with 3 dB margin at 5° elevation.", ["S17"], {
        method: "Analysis",
      }),
      comms(
        "C11",
        "Ranging",
        "The S-band transceiver shall support two-way ranging as a backup to GNSS orbit determination.",
        ["S10"],
        { pri: "Low" },
      ),
      comms(
        "C12",
        "Telecommand decoding",
        "The receiver shall decode CCSDS CLTUs with BCH error correction.",
        ["S8"],
        {},
      ),
    ],
  },
  {
    folder: "C&DH: Command and data handling",
    items: [
      cdh(
        "D1",
        "Redundant computer",
        "The on-board computer shall have two cold-redundant processor boards.",
        ["S19", "S33"],
        { method: "Inspection", crit: "Mission critical" },
      ),
      cdh(
        "D2",
        "Mass memory",
        "Mass memory shall provide 640 GB at beginning of life with error detection and correction, and at least 512 GB at end of life.",
        ["S6"],
        { pri: "High", margin: 25 },
      ),
      cdh("D3", "Write rate", "Mass memory shall accept payload data at 1.2 Gbit/s.", ["S5"], {}),
      cdh(
        "D4",
        "Hardware authentication",
        "Telecommands shall be authenticated in hardware with HMAC-SHA256 and a 64-bit anti-replay counter.",
        ["S45"],
        { pri: "High", crit: "Mission critical" },
      ),
      cdh(
        "D5",
        "Encryption throughput",
        "Payload data shall be encrypted with AES-256-GCM at 300 Mbit/s or more.",
        ["S46"],
        {},
      ),
      cdh(
        "D6",
        "Key storage",
        "Keys shall be stored in two slots in tamper-resistant memory and erased by a zeroize command.",
        ["S47"],
        {},
      ),
      cdh(
        "D7",
        "Time distribution",
        "On-board time shall be synchronised to the GNSS pulse per second to within 1 µs.",
        ["S9"],
        {},
      ),
      cdh("D8", "Housekeeping storage", "Housekeeping telemetry shall be stored for 72 hours at 1 Hz.", ["S36"], {}),
      cdh("D9", "Watchdog", "A hardware watchdog shall reset the processor within 2 s of a software hang.", ["S33"], {
        crit: "Mission critical",
      }),
      cdh("D10", "Memory scrubbing", "All RAM shall be scrubbed for single-bit errors every 10 minutes.", ["S26"], {}),
      cdh("D11", "Data buses", "Platform units shall connect over CAN and the payload over SpaceWire.", ["S5"], {
        method: "Inspection",
      }),
      cdh(
        "D12",
        "Hardware command decoder",
        "A hardware decoder shall execute reset, safe mode and redundancy switch commands without software.",
        ["S49", "S32"],
        { crit: "Mission critical" },
      ),
    ],
  },
  {
    folder: "FSW: Flight software",
    items: [
      fsw(
        "F1",
        "Mode manager",
        "The mode manager shall allow only the transitions in the mode diagram and refuse all others with an event.",
        ["S30"],
        { pri: "High" },
      ),
      fsw(
        "F2",
        "FDIR monitors",
        "Fault monitors shall have configurable thresholds, persistence counts and recovery actions.",
        ["S33"],
        { pri: "High", crit: "Mission critical" },
      ),
      fsw(
        "F3",
        "Command queue",
        "The time-tagged command queue shall hold at least 20,000 commands covering 7 days.",
        ["S34"],
        {},
      ),
      fsw(
        "F4",
        "Software upload",
        "Patches and full images shall be uploaded with a CRC check and fall back to the previous image if the new one fails to boot.",
        ["S35"],
        { pri: "High", crit: "Mission critical" },
      ),
      fsw("F5", "Telemetry packets", "Telemetry shall use the CCSDS space packet protocol.", ["S36"], {
        method: "Inspection",
        pri: "Low",
      }),
      fsw(
        "F6",
        "Authentication check",
        "No telecommand shall be dispatched before its authentication has passed; replayed commands shall be rejected.",
        ["S45"],
        { pri: "High", crit: "Mission critical" },
      ),
      fsw("F7", "Event log", "The event log shall hold at least 10,000 events and survive resets.", ["S36", "S33"], {}),
      fsw("F8", "CPU load", "Worst-case CPU load shall stay below 70 %.", ["S19"], { margin: 30 }),
      fsw("F9", "Boot to safe mode", "After a reset, the software shall reach safe mode within 60 s.", ["S32"], {
        crit: "Mission critical",
      }),
      fsw(
        "F10",
        "Orbit propagator",
        "An on-board orbit propagator shall be updated from GNSS and keep running through GNSS outages.",
        ["S34", "S44"],
        {},
      ),
      fsw(
        "F11",
        "Imaging tasks",
        "Imaging tasks shall run from an uploaded target list, generating the attitude profile on board.",
        ["S34", "S5"],
        { pri: "High" },
      ),
      fsw(
        "F12",
        "Coding standard",
        "Flight software shall follow MISRA C:2012 with documented deviations and reach 90 % statement coverage in unit tests.",
        ["S19"],
        { method: "Inspection" },
      ),
      fsw("F13", "Parameter tables", "Parameter tables shall be updatable without a reboot.", ["S35"], { pri: "Low" }),
      fsw(
        "F14",
        "Separation timers",
        "Separation timers shall start the array deployment at 30 minutes and enable transmitters at 45 minutes.",
        ["S37"],
        { pri: "High", crit: "Safety critical" },
      ),
    ],
  },
  {
    folder: "PROP: Propulsion",
    items: [
      prop(
        "P1",
        "Thrusters",
        "Four 1 N hydrazine thrusters shall be mounted to give thrust along the velocity vector.",
        ["S15"],
        { method: "Inspection" },
      ),
      prop("P2", "Propellant load", "The tank shall hold at least 9.0 kg of hydrazine.", ["S15"], {
        method: "Analysis",
        margin: 15,
      }),
      prop(
        "P3",
        "Tank pressure",
        "The tank shall have a maximum expected operating pressure of 24 bar, be proof tested at 36 bar and burst above 48 bar.",
        ["S39"],
        { pri: "High", crit: "Safety critical" },
      ),
      prop("P4", "Valve inhibits", "Thruster valves shall have three independent electrical inhibits.", ["S38"], {
        pri: "High",
        crit: "Safety critical",
      }),
      prop(
        "P5",
        "Catalyst bed heaters",
        "Catalyst beds shall be preheated to at least 120 °C before a firing.",
        ["S15"],
        {},
      ),
      prop("P6", "Propellant temperature", "Propellant lines and tank shall stay above +10 °C.", ["S18"], {
        crit: "Mission critical",
      }),
      prop("P7", "Minimum impulse bit", "The minimum impulse bit shall be 0.05 Ns or smaller.", ["S15"], {}),
      prop("P8", "Leak rate", "External leak rate shall be below 1 × 10⁻⁶ scc/s of helium.", ["S39"], {
        crit: "Safety critical",
      }),
      prop("P9", "Deorbit burns", "The system shall deliver 45 m/s in burns of at most 10 minutes each.", ["S42"], {
        method: "Analysis",
        crit: "Safety critical",
      }),
      prop(
        "P10",
        "Propellant venting",
        "Remaining propellant and pressurant shall be vented at end of life.",
        ["S41"],
        { method: "Demonstration", crit: "Safety critical" },
      ),
    ],
  },
  {
    folder: "THERM: Thermal control",
    items: [
      therm(
        "T1",
        "Passive design",
        "Thermal control shall be passive: insulation, radiators and heaters, with no pumped loops.",
        ["S18"],
        { method: "Inspection" },
      ),
      therm(
        "T2",
        "Focal plane temperature",
        "The detector focal plane shall be held at 20 °C ± 2 °C during imaging.",
        ["S18", "MR21"],
        { pri: "High" },
      ),
      therm("T3", "Battery thermal control", "The battery shall be kept between 0 °C and +30 °C.", ["S18"], {
        crit: "Safety critical",
      }),
      therm(
        "T4",
        "Survival heaters",
        "Survival heaters shall be controlled by thermostats, independent of software.",
        ["S32"],
        { crit: "Mission critical" },
      ),
      therm("T5", "Heater power", "Heater power shall not exceed 35 W orbit average in the cold case.", ["S14"], {
        method: "Analysis",
      }),
      therm(
        "T6",
        "Telescope gradient",
        "The temperature gradient across the telescope structure shall be below 1 °C to hold focus.",
        ["S1", "MR4"],
        { pri: "High" },
      ),
      therm("T7", "Propellant line heaters", "Heaters shall keep every propellant line above +10 °C.", ["S18"], {}),
      therm(
        "T8",
        "Thermal model correlation",
        "The thermal model shall be correlated to the thermal balance test within ± 5 °C.",
        ["S24"],
        { method: "Analysis" },
      ),
      therm(
        "T9",
        "Radiator coatings",
        "Radiator coatings shall keep their absorptance and emittance within the design values for 5 years.",
        ["S28"],
        { method: "Analysis", pri: "Low" },
      ),
      therm(
        "T10",
        "Temperature sensors",
        "At least 60 thermistors with ± 0.5 °C accuracy shall monitor the satellite.",
        ["S18"],
        { method: "Inspection", pri: "Low" },
      ),
    ],
  },
  {
    folder: "STR: Structure and mechanisms",
    items: [
      str("R1", "Primary structure", "The primary structure shall be built from aluminium honeycomb panels.", ["S20"], {
        method: "Inspection",
      }),
      str("R2", "Natural frequencies", "The first mode shall be above 45 Hz axially and 25 Hz laterally.", ["S23"], {
        pri: "High",
      }),
      str(
        "R3",
        "Safety factors",
        "Structural analysis shall use factors of safety of 1.25 on yield and 1.4 on ultimate loads.",
        ["S20"],
        { method: "Analysis" },
      ),
      str("R4", "Launch adapter interface", "The satellite shall mate to a 15-inch separation ring.", ["MR12"], {
        method: "Inspection",
      }),
      str("R5", "Stowed envelope", "The stowed satellite, arrays folded, shall fit the envelope of MR12.", ["MR12"], {
        method: "Inspection",
      }),
      str("R6", "Centre of mass", "The centre of mass shall lie within 25 mm of the separation axis.", ["S20"], {}),
      str("R7", "Optical bench stability", "Thermal distortion of the payload mount shall be below 10 µrad.", ["S1"], {
        method: "Analysis",
        pri: "High",
      }),
      str("R8", "Electrical bonding", "All structure parts shall be bonded to below 2.5 mΩ.", ["S27"], {
        method: "Inspection",
        pri: "Low",
      }),
      str("R9", "Venting", "Vent areas shall be sized for launch depressurisation.", ["S20"], {
        method: "Analysis",
        pri: "Low",
      }),
      str(
        "R10",
        "Demisable materials",
        "No titanium or beryllium part heavier than 0.5 kg shall be used without a demise analysis.",
        ["S43"],
        { method: "Inspection", crit: "Safety critical" },
      ),
    ],
  },
  {
    folder: "PAYLOAD: Multispectral imager",
    items: [
      pl(
        "L1",
        "Telescope",
        "The telescope shall have a focal length of 900 mm and an aperture of at least 230 mm.",
        ["MR4"],
        { method: "Inspection", pri: "High" },
      ),
      pl(
        "L2",
        "Detector",
        "A five-band TDI CMOS pushbroom detector shall have at least 7,500 pixels across track.",
        ["MR3", "MR5"],
        { pri: "High" },
      ),
      pl("L3", "Band edges", "Band edges shall be within ± 5 nm of MR5.", ["MR5"], { crit: "Mission critical" }),
      pl("L4", "MTF", "The modulation transfer function at Nyquist shall be at least 0.15.", ["MR4"], {
        pri: "High",
        crit: "Mission critical",
      }),
      pl("L5", "Payload SNR", "The payload SNR shall meet MR6 with 10 % margin.", ["MR6"], { pri: "High", margin: 10 }),
      pl("L6", "Line rate", "The detector shall support line rates up to 2,000 lines per second.", ["MR4"], {}),
      pl("L7", "Data output", "The payload shall output at least 1.0 Gbit/s over SpaceWire.", ["S5"], {}),
      pl("L8", "Solar diffuser", "A deployable solar diffuser shall allow full-aperture calibration.", ["S11"], {}),
      pl(
        "L9",
        "Dark calibration",
        "A shutter shall close the aperture for a dark calibration on every pass.",
        ["S11", "MR21"],
        {},
      ),
      pl(
        "L10",
        "Optics cleanliness",
        "Particulate obscuration of the optics shall be below 300 ppm at launch.",
        ["S29"],
        { method: "Inspection" },
      ),
      pl("L11", "Payload power", "The payload shall draw no more than 85 W while imaging.", ["S14"], { margin: 10 }),
      pl("L12", "Focus mechanism", "The focus mechanism shall move ± 0.2 mm in steps of 1 µm.", ["MR4"], {}),
    ],
  },
  {
    folder: "GROUND: Ground segment",
    items: [
      gnd(
        "G1",
        "Ground station network",
        "Contacts shall be scheduled with one northern and one southern high-latitude ground station.",
        ["MR20"],
        { method: "Inspection" },
      ),
      gnd("G2", "X-band receive", "Ground X-band antennas shall have a G/T of at least 23 dB/K.", ["S17"], {
        method: "Analysis",
      }),
      gnd(
        "G3",
        "Automatic planning",
        "Mission planning shall generate a new plan from tasking requests every 6 hours without operator action.",
        ["MR8", "MR23"],
        { pri: "High" },
      ),
      gnd(
        "G4",
        "Processing time",
        "Processing from raw data to orthorectified product shall take at most 2 hours per image.",
        ["MR9"],
        { pri: "High" },
      ),
      gnd("G5", "Archive copies", "The archive shall keep two copies in separate locations for 10 years.", ["MR22"], {
        method: "Inspection",
      }),
      gnd(
        "G6",
        "Flight dynamics",
        "Flight dynamics shall determine the orbit and screen for conjunctions every day.",
        ["S44"],
        { method: "Demonstration" },
      ),
      gnd(
        "G7",
        "Operator login",
        "Operators shall log in with two-factor authentication; every command shall be logged with its operator.",
        ["S48"],
        {},
      ),
      gnd(
        "G8",
        "Key management facility",
        "Keys shall be generated and stored in a hardware security module.",
        ["S47"],
        {},
      ),
      gnd(
        "G9",
        "Automated alerts",
        "Telemetry out of limits shall alert the on-call engineer within 5 minutes.",
        ["MR23"],
        {},
      ),
      gnd(
        "G10",
        "Customer portal",
        "Users shall submit tasking requests and download products through a web portal.",
        ["MR8", "MR9"],
        { method: "Demonstration" },
      ),
    ],
  },
];

// ── Interfaces ───────────────────────────────────────────────────────────────────────────────────────────────

const icd = (
  ref: string,
  name: string,
  type: string,
  a: string,
  b: string,
  text: string,
  links: string[],
  controlled = true,
): Item & { links: string[] } => ({
  ref,
  name,
  text,
  links,
  attrs: {
    Status: controlled ? "Approved" : "Draft",
    "Interface type": type,
    "Side A": a,
    "Side B": b,
    Controlled: controlled,
  },
});

export const interfaces: { folder: string; items: (Item & { links: string[] })[] }[] = [
  {
    folder: "Data",
    items: [
      icd(
        "I1",
        "Payload to mass memory",
        "Data",
        "Multispectral imager",
        "Mass memory unit",
        "Two SpaceWire links at 200 Mbit/s each carry image data, with a third for control.",
        ["L7", "D3", "D11"],
      ),
      icd(
        "I3",
        "Star trackers to OBC",
        "Data",
        "Star tracker heads",
        "On-board computer",
        "RS-422 at 115.2 kbit/s; attitude quaternions at 10 Hz.",
        ["A2", "D11"],
      ),
      icd(
        "I4",
        "Reaction wheels to OBC",
        "Data",
        "Reaction wheels",
        "On-board computer",
        "CAN 2.0B at 1 Mbit/s with CANopen.",
        ["A4", "D11"],
      ),
      icd(
        "I5",
        "GNSS to OBC",
        "Data",
        "GNSS receiver",
        "On-board computer",
        "UART navigation messages at 1 Hz plus a pulse-per-second line.",
        ["A10", "D7"],
      ),
      icd(
        "I6",
        "S-band transceiver to OBC",
        "Data",
        "S-band transceiver",
        "On-board computer",
        "Synchronous serial for telecommand frames and telemetry frames.",
        ["C4", "C12"],
      ),
      icd(
        "I7",
        "Mass memory to X-band transmitter",
        "Data",
        "Mass memory unit",
        "X-band transmitter",
        "LVDS parallel interface at 400 Mbit/s with encrypted frames.",
        ["C1", "D5"],
      ),
      icd(
        "I22",
        "Ground stations to mission control",
        "Data",
        "Ground stations",
        "Mission control centre",
        "SLE services over a VPN.",
        ["G1", "G3"],
      ),
      icd(
        "I23",
        "Mission control to processing",
        "Data",
        "Mission control centre",
        "Payload data processing centre",
        "Raw data files pushed by SFTP after each pass.",
        ["G4"],
      ),
      icd(
        "I24",
        "Customer portal API",
        "Data",
        "Customer portal",
        "User systems",
        "REST API for tasking and product download, OGC-compliant catalogue.",
        ["G10"],
        false,
      ),
      icd(
        "I25",
        "Key management to mission control",
        "Data",
        "Key management facility",
        "Mission control centre",
        "Key handles only; key material never leaves the HSM in clear.",
        ["G8", "D6"],
      ),
    ],
  },
  {
    folder: "Electrical",
    items: [
      icd(
        "I2",
        "Payload power",
        "Electrical",
        "Power conditioning and distribution unit",
        "Multispectral imager",
        "Two 28 V LCL outputs of 5 A, nominal and redundant.",
        ["L11", "E4", "E5"],
      ),
      icd(
        "I8",
        "Solar arrays to PCDU",
        "Electrical",
        "Solar array wings",
        "Power conditioning and distribution unit",
        "Eight array sections per wing through the hinge harness.",
        ["E1", "E4"],
      ),
      icd(
        "I9",
        "Battery to PCDU",
        "Electrical",
        "Battery",
        "Power conditioning and distribution unit",
        "Main power, cell voltage and temperature telemetry, and the charge enable line.",
        ["E3", "E6"],
      ),
      icd(
        "I10",
        "PCDU load outputs",
        "Electrical",
        "Power conditioning and distribution unit",
        "All platform units",
        "28 V latching current limiter outputs per the power distribution table.",
        ["E5"],
      ),
      icd(
        "I11",
        "Thruster valve drivers",
        "Electrical",
        "Power conditioning and distribution unit",
        "Propulsion module",
        "Valve drivers behind three series inhibits.",
        ["P4", "E5"],
      ),
      icd(
        "I12",
        "Heater lines",
        "Electrical",
        "Power conditioning and distribution unit",
        "Heaters",
        "24 heater lines, each thermostat protected.",
        ["T4", "T5"],
      ),
      icd(
        "I14",
        "Separation switches",
        "Electrical",
        "Separation ring",
        "Power conditioning and distribution unit",
        "Three break-wire switches in a two-out-of-three vote.",
        ["E13"],
      ),
      icd(
        "I21",
        "Umbilical connector",
        "Electrical",
        "Satellite",
        "Electrical ground support equipment",
        "Battery charging, arming plugs and test telemetry before launch.",
        ["E13"],
        false,
      ),
    ],
  },
  {
    folder: "Mechanical and thermal",
    items: [
      icd(
        "I13",
        "Satellite to launch adapter",
        "Mechanical",
        "Satellite",
        "Rideshare launch adapter",
        "15-inch separation ring, 24 bolts.",
        ["R4", "R5"],
      ),
      icd(
        "I15",
        "Payload to optical bench",
        "Mechanical",
        "Multispectral imager",
        "Optical bench",
        "Three titanium bipods, isostatic.",
        ["R7", "L1"],
      ),
      icd(
        "I18",
        "Tank to structure",
        "Mechanical",
        "Propellant tank",
        "Central panel",
        "Polar mount with a slip joint for thermal expansion.",
        ["P3", "R1"],
      ),
      icd(
        "I16",
        "Payload thermal interface",
        "Thermal",
        "Multispectral imager",
        "Payload radiator",
        "Heat pipe to a dedicated radiator, 15 W dissipated in imaging.",
        ["T2", "L1"],
      ),
      icd(
        "I17",
        "Battery thermal interface",
        "Thermal",
        "Battery",
        "Battery radiator",
        "Battery mounted on its own radiator with heaters, insulated from the structure.",
        ["T3", "E12"],
      ),
    ],
  },
  {
    folder: "RF",
    items: [
      icd(
        "I19",
        "X-band space to ground",
        "RF",
        "X-band transmitter",
        "Ground stations",
        "8025–8400 MHz, right-hand circular, DVB-S2.",
        ["C1", "C2", "G2"],
      ),
      icd(
        "I20",
        "S-band space to ground",
        "RF",
        "S-band transceiver",
        "Ground stations",
        "2025–2110 MHz up and 2200–2290 MHz down, CCSDS.",
        ["C4", "C5"],
      ),
    ],
  },
];

// ── Hazards ──────────────────────────────────────────────────────────────────────────────────────────────────

const haz = (
  ref: string,
  name: string,
  severity: string,
  likelihood: string,
  cause: string,
  mitigation: string,
  mitigates: string[],
  status = "Approved",
): Item & { mitigates: string[] } => ({
  ref,
  name,
  mitigates,
  attrs: { Status: status, Severity: severity, Likelihood: likelihood, Cause: cause, Mitigation: mitigation },
});

export const hazards: { folder: string; items: (Item & { mitigates: string[] })[] }[] = [
  {
    folder: "Ground processing and launch",
    items: [
      haz(
        "H1",
        "Inadvertent thruster firing",
        "Catastrophic",
        "Remote",
        "Valve driver failure or a wrong command while people are near the satellite.",
        "Three independent inhibits; arming plug fitted only on the launcher.",
        ["P4", "S38"],
      ),
      haz(
        "H2",
        "Hydrazine leak during fuelling",
        "Catastrophic",
        "Remote",
        "Leaking fitting or valve during fuelling.",
        "Leak tests before fuelling; fuelling in protective suits by a certified team.",
        ["P8", "S39"],
      ),
      haz(
        "H3",
        "Tank rupture",
        "Catastrophic",
        "Improbable",
        "Over-pressure or a flaw in the tank.",
        "Proof test at 1.5 times MEOP; burst factor of 2.",
        ["P3", "S39"],
      ),
      haz(
        "H4",
        "Battery thermal runaway",
        "Critical",
        "Remote",
        "Overcharge, internal short or overheating of a cell.",
        "Two independent charge cut-offs; battery kept below +30 °C.",
        ["E6", "S40", "T3"],
      ),
      haz(
        "H5",
        "Array deploys inside the fairing",
        "Critical",
        "Remote",
        "Burn wire fires before separation.",
        "Separation switches keep the burn-wire circuits unpowered.",
        ["E8", "E13"],
      ),
      haz(
        "H6",
        "Transmitting before separation",
        "Critical",
        "Remote",
        "Transmitter switched on in the fairing, interfering with the launcher.",
        "45-minute RF inhibit timer after separation.",
        ["C7", "S37"],
      ),
      haz(
        "H16",
        "RF exposure during testing",
        "Marginal",
        "Remote",
        "Staff near the X-band antenna during radiated tests.",
        "Radiated tests only in the anechoic chamber with interlocks.",
        ["C7"],
        "In review",
      ),
      haz(
        "H17",
        "Leak during thermal vacuum test",
        "Marginal",
        "Remote",
        "Pressurised propulsion system leaks in the chamber.",
        "Test with the system pressurised with helium only, below 10 bar.",
        ["P8"],
        "In review",
      ),
    ],
  },
  {
    folder: "On orbit",
    items: [
      haz(
        "H7",
        "Loss of attitude control",
        "Critical",
        "Occasional",
        "Wheel or sensor failure leaves the arrays off the sun and the battery drains.",
        "Magnetorquer-only safe mode; power positive with one wing failed.",
        ["A9", "E7", "S32"],
      ),
      haz(
        "H8",
        "Corrupt software image",
        "Critical",
        "Remote",
        "A software upload is corrupted or contains an error.",
        "CRC check, fallback to the previous image, hardware recovery commands.",
        ["F4", "D12"],
      ),
      haz(
        "H9",
        "Unauthorised commanding",
        "Catastrophic",
        "Remote",
        "An attacker sends or replays telecommands.",
        "HMAC authentication and anti-replay in hardware and software; ground two-factor login.",
        ["S45", "D4", "F6", "G7"],
      ),
      haz(
        "H10",
        "Collision with debris",
        "Catastrophic",
        "Improbable",
        "A conjunction is missed or the avoidance manoeuvre is too late.",
        "Daily conjunction screening; manoeuvre within 24 hours.",
        ["S44", "G6", "P7"],
      ),
      haz(
        "H14",
        "Upsets corrupt stored images",
        "Marginal",
        "Probable",
        "Radiation flips bits in mass memory.",
        "EDAC on mass memory and RAM scrubbing.",
        ["D2", "D10"],
      ),
      haz(
        "H15",
        "Battery overdischarge in safe mode",
        "Critical",
        "Remote",
        "Safe mode loads exceed generation in a long eclipse season.",
        "Automatic load shedding at 40 % state of charge.",
        ["E9", "E7"],
      ),
      haz(
        "H13",
        "Optics contamination",
        "Marginal",
        "Occasional",
        "Outgassing deposits on the telescope mirrors.",
        "Low-outgassing materials; bake-out of all units.",
        ["S29", "L10"],
      ),
      haz(
        "H18",
        "Loss of command keys",
        "Critical",
        "Improbable",
        "Keys lost on the ground or erased on board.",
        "Two key slots, HSM backup, separate recovery key.",
        ["D6", "S47", "G8"],
      ),
    ],
  },
  {
    folder: "End of life",
    items: [
      haz(
        "H11",
        "Failure to deorbit",
        "Critical",
        "Remote",
        "Propellant runs out or the propulsion fails before the deorbit.",
        "45 m/s kept in reserve; passivation if the deorbit cannot be done.",
        ["S42", "P9", "S41"],
      ),
      haz(
        "H12",
        "Casualty on re-entry",
        "Catastrophic",
        "Improbable",
        "Parts survive re-entry and hit people.",
        "Demisable materials; casualty risk assessment.",
        ["S43", "R10"],
      ),
    ],
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────

type TestOpts = { method?: string; facility?: string; expected?: string; status?: string; steps?: string };
const test =
  (level: string, defaultFacility: string) =>
  (ref: string, name: string, verifies: string[], o: TestOpts = {}): Test => ({
    ref,
    name,
    verifies,
    attrs: {
      Status: o.status ?? "Approved",
      "Verification method": o.method ?? "Test",
      "Test level": level,
      Facility: o.facility ?? defaultFacility,
      ...(o.expected ? { "Expected result": o.expected } : {}),
      // "Do this > see that | next step > next result"
      ...(o.steps
        ? {
            Steps: o.steps.split(" | ").map((step) => {
              const [action = "", expected = ""] = step.split(" > ");
              return { action, expected };
            }),
          }
        : {}),
    },
  });

const unit = test("Unit", "CI pipeline");
const comp = test("Component", "Supplier facility");
const sub = test("Subsystem", "Integration lab");
const system = test("Integrated system", "Assembly, integration and test hall");
const env = test("Environmental", "Environmental test centre");
const val = test("Mission validation", "Mission control centre");

// Flight software unit tests, reported by CI as JUnit. The test names in the report carry the UIDs of these items.
export const fswUnitTests: Test[] = [
  unit("U1", "Mode manager allows every transition in the mode diagram", ["F1"]),
  unit("U2", "Mode manager refuses Safe to Imaging", ["F1"]),
  unit("U3", "FDIR monitor trips after the persistence count", ["F2"]),
  unit("U4", "FDIR monitor recovers after the hysteresis band", ["F2"]),
  unit("U5", "FDIR recovery action table loads from parameters", ["F2", "F13"]),
  unit("U6", "Command queue accepts 20,000 time-tagged commands", ["F3"]),
  unit("U7", "Command queue executes in time order across a reset", ["F3"]),
  unit("U8", "Patch upload rejects a bad CRC", ["F4"]),
  unit("U9", "Boot falls back to the previous image after three failed boots", ["F4"]),
  unit("U10", "Space packets have a valid primary header", ["F5"]),
  unit("U11", "Unauthenticated command is not dispatched", ["F6"]),
  unit("U12", "Replayed command counter is rejected", ["F6"]),
  unit("U13", "Event log survives a warm reset", ["F7"]),
  unit("U14", "Event log wraps at 10,000 events", ["F7"]),
  unit("U15", "Scheduler meets every deadline at 70 % load", ["F8"]),
  unit("U16", "Boot reaches safe mode in under 60 s on the target", ["F9"]),
  unit("U17", "Orbit propagator error below 100 m after 24 h", ["F10"]),
  unit("U18", "Propagator continues through a GNSS outage", ["F10"]),
  unit("U19", "Imaging task builds the attitude profile from a target", ["F11"]),
  unit("U20", "Imaging task rejects a target outside the roll limit", ["F11"]),
  unit("U21", "Parameter table update takes effect without reboot", ["F13"]),
  unit("U22", "Separation timer starts deployment at 30 min", ["F14"]),
  unit("U23", "Separation timer keeps transmitters off until 45 min", ["F14", "C7"]),
  unit("U24", "B-dot controller output sign matches field rate", ["A12"]),
  unit("U25", "Attitude estimator converges from a 10° error", ["A1"]),
  unit("U26", "Wheel momentum unload waits for the end of imaging", ["A13"]),
  unit("U27", "Yaw steering profile matches the reference", ["A14"]),
  unit("U28", "Load shedding table switches off non-essential loads", ["E9"]),
  unit("U29", "State-of-charge estimator error below 5 %", ["E11"]),
  unit("U30", "Housekeeping store holds 72 h at 1 Hz", ["D8"]),
  unit("U31", "Memory scrub task visits every page in 10 min", ["D10"]),
  unit("U32", "Static analysis reports no undocumented MISRA deviation", ["F12"], { method: "Inspection" }),
];

export const componentTests: Folder[] = [
  {
    folder: "Unit acceptance",
    items: [
      comp("CA1", "Star tracker acceptance", ["A2", "A1"], {
        expected: "Accuracy within 2 arcsec (1σ) cross-boresight on the star simulator.",
        steps:
          "Mount the head on the star simulator > Head acquires the simulated sky within 10 s | Run the accuracy pattern for 30 min > Cross-boresight error below 2 arcsec (1σ) | Record the quaternion log > Log saved with the serial number",
      }),
      comp("CA2", "Gyro noise characterisation", ["A3"], {
        expected: "Angle random walk below 0.005 °/√h.",
        steps:
          "Place the gyro on the seismic block > Output stable within 10 min | Record 8 hours of rate data > Data has no gaps | Compute the Allan deviation > ARW below 0.005 °/√h",
      }),
      comp("CA3", "Reaction wheel torque and momentum", ["A4"], {
        steps:
          "Spin the wheel to maximum speed > Momentum at least 0.4 Nms | Command a 20 mNm torque step > Measured torque within 5 % | Spin down and record > Run-down time matches the friction model",
      }),
      comp("CA4", "Reaction wheel microvibration", ["A5"], {
        facility: "Microvibration test bench",
        steps:
          "Mount the wheel on the force plate > Background noise below 1 mN | Sweep the speed from 0 to 6,000 rpm > Force spectra recorded | Propagate to the payload interface > Jitter below 1 µrad",
      }),
      comp("CA5", "Magnetorquer dipole", ["A6"], {
        steps:
          "Place the rod in the Helmholtz cage > Background field nulled | Drive the rod at full current > Dipole at least 15 Am²",
      }),
      comp("CA6", "Coarse sun sensor accuracy", ["A7"], { facility: "Solar simulator" }),
      comp("CA7", "GNSS receiver with constellation simulator", ["A10"], {
        steps:
          "Connect the RF simulator with a 550 km orbit scenario > Receiver locks within 90 s | Run 2 hours > Position error below 10 m (3σ) | Measure PPS against the reference > PPS within 1 µs",
      }),
      comp("CA8", "Solar panel flash test", ["E1", "E2"], {
        facility: "Large-area pulsed solar simulator",
        steps:
          "Flash each panel at AM0 > I-V curve recorded | Compute power at the maximum power point > Matches cell count times cell efficiency within 2 % | Inspect for cracked cells > No cell cracked",
      }),
      comp("CA9", "Battery capacity and cell matching", ["E3", "E6"], {
        steps:
          "Charge to 4.20 V per cell > Charge stops at 4.20 V ± 0.01 V | Discharge at C/2 to 2.70 V per cell > Capacity at least 960 Wh | Compare cell voltages > Spread below 20 mV",
      }),
      comp("CA10", "X-band transmitter RF performance", ["C1", "C3", "C8"], {
        facility: "RF lab",
        steps:
          "Connect the transmitter to the spectrum analyser > Carrier present | Measure output power > At least 2 W | Measure EVM at 8PSK > EVM below 8 % | Sweep temperature from -10 to +50 °C > Frequency within ± 2 ppm",
      }),
      comp("CA11", "S-band transceiver sensitivity", ["C4", "C12"], { facility: "RF lab" }),
      comp("CA12", "Mass memory bit error rate", ["D2", "D3"]),
      comp("CA13", "On-board computer burn-in", ["D1"], { expected: "No failure in 168 hours at +60 °C." }),
      comp("CA14", "Thruster hot fire acceptance", ["P1", "P5", "P7"], {
        facility: "Propulsion test stand",
        steps:
          "Preheat the catalyst bed > Bed at 120 °C within 30 min | Fire 10 pulses of 50 ms > Impulse bit below 0.05 Ns | Fire 60 s steady state > Thrust 1 N ± 10 %",
      }),
      comp("CA15", "Tank proof pressure test", ["P3"], {
        facility: "Hydrostatic test cell",
        steps:
          "Fill the tank with water > No trapped air | Raise to 36 bar and hold 5 min > No leak and no permanent deformation | Inspect with dye penetrant > No indication",
      }),
      comp("CA16", "Thermistor calibration", ["T10"], { method: "Inspection" }),
      comp("CA17", "Detector dark current", ["L2"], { facility: "Payload clean room" }),
      comp("CA18", "Detector spectral response", ["L3"], { facility: "Monochromator bench" }),
      comp("CA19", "Focus mechanism range and step", ["L12"]),
      comp("CA20", "Encryption module throughput", ["D5"], { facility: "Avionics lab" }),
    ],
  },
];

export const subsystemTests: Folder[] = [
  {
    folder: "ADCS",
    items: [
      sub("SA1", "Closed-loop pointing in hardware in the loop", ["A1", "A11", "S1"], {
        facility: "ADCS hardware-in-the-loop bench",
        steps:
          "Load the imaging scenario into the dynamics simulator > Simulator running at 10 Hz | Start closed-loop control > Attitude converges within 60 s | Run 10 imaging strips > Pointing error below 0.05° (3σ) | Run the same strips with one star tracker blinded > Pointing error still below 0.05°",
      }),
      sub("SA2", "Slew and settle", ["A8", "S3"], {
        facility: "ADCS hardware-in-the-loop bench",
        steps:
          "Command a 30° roll slew > Slew complete within 45 s | Measure settling > Stable within 15 s | Repeat in the opposite direction > Same result",
      }),
      sub("SA3", "Detumble from 10 °/s", ["A12", "S31"], {
        facility: "ADCS hardware-in-the-loop bench",
        steps:
          "Set initial rates of 10 °/s on all axes > Simulator shows tumbling | Enable detumble mode > B-dot controller active | Run for 3 orbits > Rates below 0.5 °/s",
      }),
      sub("SA4", "Safe mode sun acquisition with magnetorquers only", ["A9", "A7"], {
        facility: "Air bearing with sun simulator",
        steps:
          "Disable all wheels > Wheels show off | Enter safe mode from a random attitude > Sun acquired within 30 min | Hold for 2 orbits > Sun angle below 15°",
      }),
      sub("SA5", "Target tracking with yaw steering", ["A14"], { facility: "ADCS hardware-in-the-loop bench" }),
    ],
  },
  {
    folder: "EPS",
    items: [
      sub("SE1", "Array deployment", ["E8"], {
        facility: "Deployment rig with gravity offload",
        steps:
          "Mount the wing on the offload rig > Wing stowed with hold-down | Fire the primary burn wire > Release within 30 s | Observe deployment > Wing latched fully open | Repeat with the redundant burn wire > Release within 30 s",
      }),
      sub("SE2", "Power budget with solar array simulator", ["S14", "E4", "E7"], {
        facility: "Electrical test bench",
        steps:
          "Program the solar array simulator for the worst-case orbit > Profile loaded | Run 10 imaging orbits > Battery depth of discharge below 30 % | Fail one wing in the simulator > Power positive in safe mode",
      }),
      sub("SE3", "Latching current limiter trip and reset", ["E5"]),
      sub("SE4", "Load shedding at 40 % state of charge", ["E9"]),
      sub("SE5", "Battery protection chain", ["E6", "S40"], {
        steps:
          "Disable the primary charge cut-off > Primary shows disabled | Charge until the secondary trips > Charging stops at 4.25 V per cell | Discharge until the load disconnect trips > Loads shed at 2.70 V per cell",
      }),
    ],
  },
  {
    folder: "COMMS",
    items: [
      sub("SC1", "X-band end-to-end throughput", ["C1", "S7", "D5"], {
        facility: "RF lab",
        steps:
          "Connect mass memory, encryptor and transmitter to the ground modem > Link locked | Play back 50 GB of test images > User throughput at least 300 Mbit/s | Compare received files > Bit-exact after decryption",
      }),
      sub("SC2", "S-band link at threshold", ["C4", "C10"], { facility: "RF lab" }),
      sub("SC3", "RF inhibit timer", ["C7", "S37"], {
        steps:
          "Simulate separation > Timer starts | Monitor RF output for 45 min > No emission | Wait past 45 min > S-band beacon starts",
      }),
      sub("SC4", "Two-way ranging", ["C11"], { facility: "RF lab", status: "Draft" }),
    ],
  },
  {
    folder: "C&DH and FSW",
    items: [
      sub("SD1", "Telecommand authentication", ["D4", "F6", "S45"], {
        facility: "Avionics lab",
        steps:
          "Send a valid authenticated command > Executed | Send the same command again > Rejected as replay | Send a command with one bit changed in the MAC > Rejected | Read the event log > Two rejections logged",
      }),
      sub("SD2", "Watchdog reset", ["D9"], { facility: "Avionics lab" }),
      sub("SD3", "Hardware recovery commands", ["D12", "S49"], {
        facility: "Avionics lab",
        steps:
          "Halt the flight software > Software not responding | Send the hardware reset command > Processor resets | Send the redundancy switch command > Redundant board boots",
      }),
      sub("SD4", "Seven-day stored schedule", ["F3", "S34"], { facility: "Software validation facility" }),
      sub("SD5", "Software patch and rollback", ["F4", "S35"], {
        facility: "Software validation facility",
        steps:
          "Upload a valid patch > CRC passes and patch applied | Upload an image that fails to boot > Boot falls back to the previous image | Read telemetry > Running image reported",
      }),
      sub("SD6", "FDIR scenarios", ["F2", "S33"], { facility: "Software validation facility" }),
      sub("SD7", "Boot to safe mode timing", ["F9", "S32"], { facility: "Software validation facility" }),
      sub("SD8", "Key zeroize and re-key", ["D6", "S47"], { facility: "Avionics lab" }),
    ],
  },
  {
    folder: "PROP and THERM",
    items: [
      sub("SP1", "Propulsion inhibit check", ["P4", "S38"], {
        method: "Inspection",
        steps:
          "Remove the arming plug > Inhibit 1 open | Leave separation switches pressed > Inhibit 2 open | Command valve open without enable > Inhibit 3 open, no valve current",
      }),
      sub("SP2", "Propulsion leak test", ["P8"], { facility: "Helium leak test chamber" }),
      sub("ST1", "Survival heater thermostats", ["T4", "T7"], { facility: "Thermal chamber" }),
      sub("ST2", "Focal plane temperature control", ["T2"], { facility: "Thermal chamber" }),
    ],
  },
  {
    folder: "PAYLOAD",
    items: [
      sub("SL1", "MTF measurement", ["L4", "MR4"], {
        facility: "Optical test bench",
        steps:
          "Project the slanted-edge target through the collimator > Edge in focus | Record 100 lines per band > Images stored | Compute MTF at Nyquist > At least 0.15 in every band",
      }),
      sub("SL2", "Radiometric SNR", ["L5", "MR6"], { facility: "Integrating sphere" }),
      sub("SL3", "Solar diffuser calibration", ["L8", "S11"], { facility: "Optical test bench" }),
      sub("SL4", "Dark calibration with shutter", ["L9"], { facility: "Payload clean room" }),
      sub("SL5", "Payload power draw", ["L11"], { facility: "Payload clean room" }),
      sub("SL6", "Payload data output rate", ["L7", "D3"], { facility: "Avionics lab" }),
    ],
  },
  {
    folder: "GROUND",
    items: [
      sub("SG1", "Automatic plan generation", ["G3"], { facility: "Ground segment reference facility" }),
      sub("SG2", "Processing time", ["G4"], { facility: "Ground segment reference facility" }),
      sub("SG3", "Operator two-factor login", ["G7", "S48"], { facility: "Ground segment reference facility" }),
      sub("SG4", "Telemetry alerts", ["G9"], { facility: "Ground segment reference facility", status: "Draft" }),
    ],
  },
];

export const systemTests: Folder[] = [
  {
    folder: "Functional",
    items: [
      system("FF1", "Full functional test", ["S30", "S36", "F1"], {
        steps:
          "Power on in launch mode > All units report nominal | Step through every mode > Each transition reported in telemetry | Run each unit's functional sequence > Every unit passes | Read the event log > No unexpected events",
      }),
      system("FF2", "Separation sequence", ["S37", "E13", "F14"], {
        steps:
          "Release the separation switches > Timers start | Wait 30 min > Array deployment commanded | Wait 45 min > S-band beacon on",
      }),
      system("FF3", "System FDIR test", ["S33", "S32"], {
        steps:
          "Inject a wheel failure > Failure isolated within 10 s | Inject a star tracker failure > Switched to the other head | Inject a processor hang > Watchdog reset and safe mode within 30 min",
      }),
      system("FF4", "72-hour autonomy", ["MR14", "S34"], {
        expected: "Satellite stays safe and power positive for 72 hours with no commands.",
      }),
      system("FF5", "Penetration test of the command chain", ["MR17", "S45", "S49"], {
        facility: "Independent security lab",
      }),
      system("FF6", "Mass properties", ["MR11", "S13", "R6"], {
        method: "Inspection",
        facility: "Mass properties machine",
      }),
    ],
  },
  {
    folder: "Environmental",
    items: [
      env("EV1", "Sine vibration", ["S20", "S23", "R2"], {
        facility: "Shaker, Environmental test centre",
        steps:
          "Low-level sine survey on X > First mode above 25 Hz | Qualification sine on X > No damage | Low-level survey after > Frequency shift below 5 % | Repeat on Y and Z > Same criteria",
      }),
      env("EV2", "Random vibration", ["S21"], {
        facility: "Shaker, Environmental test centre",
        steps:
          "Random at -6 dB on X > Response within predictions | Full level 14.1 g rms for 2 min > No damage | Low-level sine after > Frequency shift below 5 % | Repeat on Y and Z > Same criteria",
      }),
      env("EV3", "Shock", ["S22"], { facility: "Clamp-band shock rig" }),
      env("EV4", "Thermal vacuum", ["S24", "MR13", "S18"], {
        facility: "Thermal vacuum chamber",
        steps:
          "Pump down below 1e-5 mbar > Pressure reached | Hot operational plateau > All units inside limits, functional test passes | Cold operational plateau > All units inside limits, functional test passes | Hot and cold start > Units start at the qualification limits | Repeat for 4 cycles > All cycles pass",
      }),
      env("EV5", "Thermal balance", ["T8"], { facility: "Thermal vacuum chamber" }),
      env("EV6", "Conducted and radiated EMC", ["S27", "S50", "C9"], { facility: "EMC chamber" }),
      env("EV7", "Deployment after vibration", ["E8", "S37"], { facility: "Deployment rig with gravity offload" }),
      env("EV8", "Leak test after vibration", ["P8", "S39"], { facility: "Helium leak test chamber" }),
    ],
  },
  {
    folder: "End to end",
    items: [
      system("EE1", "System validation test with the ground segment", ["S8", "S7", "S48"], {
        facility: "Mission control centre and satellite in the AIT hall",
        steps:
          "Connect the satellite to mission control through the RF suitcase > Link established | Run a pass plan with commands and telemetry > All commands acknowledged | Dump stored images over X-band > Files received and processed",
      }),
      system("EE2", "RF compatibility with the ground station", ["C1", "C4", "S17"], {
        facility: "Northern ground station",
      }),
      system("EE3", "Imaging chain end to end", ["MR4", "MR5", "S12"], {
        facility: "Optical stimulus in the AIT hall",
      }),
    ],
  },
];

export const validationTests: Folder[] = [
  {
    folder: "Operations rehearsals",
    items: [
      val("V1", "Launch and early orbit rehearsal", ["MN12", "MN8"], {
        method: "Demonstration",
        steps:
          "Run the separation scenario on the simulator > Team follows the LEOP procedures | Inject a safe mode during the first pass > Team recovers within the procedure time | Debrief > Lessons learned recorded",
      }),
      val("V2", "Disaster response drill", ["MN3", "MN5"], {
        method: "Demonstration",
        steps:
          "Submit an urgent tasking request through the portal > Request accepted | Wait for the next plan > Target planned within 6 h | Deliver the simulated product > Product delivered within 24 h of the request",
      }),
      val("V3", "Routine operations week with three operators", ["MN8"], { method: "Demonstration" }),
      val("V4", "Archive retrieval of a ten-year-old product", ["MN11"], { method: "Demonstration" }),
    ],
  },
  {
    folder: "Analyses and commissioning",
    items: [
      val("V5", "Revisit and coverage analysis review", ["MN1"], { method: "Analysis", facility: "Mission analysis" }),
      val("V6", "Crop index validation with ground truth", ["MN2"], {
        facility: "Agricultural test sites",
        status: "Draft",
      }),
      val("V7", "In-orbit image quality commissioning", ["MN4", "MN14"], {
        facility: "On orbit",
        status: "Draft",
      }),
      val("V8", "Five-year reliability assessment review", ["MN6"], {
        method: "Analysis",
        facility: "Product assurance",
      }),
      val("V9", "Launcher interface compatibility review", ["MN7"], {
        method: "Inspection",
        facility: "Launch provider",
      }),
      val("V10", "Space debris compliance assessment", ["MN9"], { method: "Analysis", facility: "Mission analysis" }),
      val("V11", "Security accreditation", ["MN10"], { method: "Inspection", facility: "Accreditation authority" }),
      val("V12", "Frequency licence check", ["MN13"], { method: "Inspection", facility: "Spectrum authority" }),
    ],
  },
];
