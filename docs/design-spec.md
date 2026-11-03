# War Room — Prototype Design Spec

Nov 1, 2026 · @Scott

## Overview

War Room is a cinematic thriller where you play the President in the Situation Room during high-stakes covert raids. You don't fight the raid. You decide whether it happens, watch it unfold through drone and helmet-cam feeds, and make the calls nobody else can. The prototype answers one question: is a single tense HVT raid, run through AI advisors and live feeds, fun and replayable?

Design pillars:

- **Decide, don't control.** Your AI advisors and ground force commander plan and execute. You approve, overrule, or abort.
- **Information is never certain.** Intel has confidence levels, feeds are grainy, and positive ID is a judgment call.
- **Every call has a cost.** Waiting risks losing the target; acting risks lives, civilians, and exposure.
- **Cinematic tension.** Rising pressure, mid-raid complications, and a debrief that shows the consequences.

Prototype deliverable: one playable raid mission in a browser build, instrumented to log inference cost per session.

**Tone:** visceral and mature. Violence is shown, not sanitized, mostly through helmet cams, drone thermal, and audio. Firm lines: no on-screen harm to children (it can be an outcome, conveyed through radio and the debrief), no torture or mutilation, and the game never rewards cruelty.

## Setting and scenario

The world is fictional and near future (around 2030) but grounded in real US special operations and intelligence capabilities. The target, host country, and all names are placeholders.

**Premise:** the founder of a mercenary company that does a hostile great power's deniable work, codenamed CHARON, is staying at his fortified seaside mansion on the Black Sea coast of a Western-leaning republic whose government quietly courts his patron. Two weeks ago, his men's drones killed four US service members. Confidence he's there is 60–70%, and in 72 hours he flies back to where he's untouchable. Full profile in the mission library.

**Map:** a fortified seaside mansion (blast-hardened residence with a panic room and escape tunnel, guest villas, staff quarters, helipad, private marina with his armed yacht) plus the coastal highway and neighboring villas of the host's political elites. It's night.

**Forces:**

- **You:** a JSOC task force operating under CIA authority, with four 4-operator Marine Raider assault teams, an armed ISR drone overhead, and a quick reaction force (QRF) on standby. Insertion and fire support are chosen in the loadout.
- **Opposition:** a force of about 25–30 REQUIEM veterans fiercely loyal to him personally, with night vision, drones, and a smart-home security system, plus host police and coast guard who respond if the raid draws attention.
- **Civilians:** household staff, possibly members of his family, and the wealthy neighbors. They're never valid targets.

**Outcome, not just win or lose:** the debrief grades the target (captured, killed with confirmed ID, or escaped), intel recovered from the site, friendly casualties, civilian casualties, and whether the force got out before local forces arrived.

**Complications:** each run draws one or two at random from the mission's pool. For CHARON, that includes his patron's own hit team arriving the same night, a mid-raid defection offer, and a run for the yacht.

### Special operations equipment

Equipment reflects what US special operations forces field now, projected a few years out. Every item must change a decision you or the force makes.

| Item | Gameplay effect |
| --- | --- |
| Night vision and suppressed carbines | Operators see in the dark, though his veterans have night vision too; suppressed fire reveals less. |
| Assault helicopters (MH-60 class) | Fast insertion, but rotor noise alerts the target shortly before landing, and rooftop anti-aircraft missiles can hit them. |
| Assault boats | Quiet maritime insertion from offshore; slower and weather-dependent. |
| Armed ISR drone (MQ-9 class) | Your drone control mode: thermal camera, laser designation, and a few precision missiles. |
| Small quadcopters | Teams scout approaches and rooftops before moving. |
| Team counter-drone kit | Jams or shoots down the defenders' FPV drones; without it, teams are exposed from above. |
| Breaching charges, flashbangs, and a thermal lance | Fast building entry at the cost of noise; the lance cuts through the panic room door slowly and quietly. |
| Capture kit (less-lethal weapons, sedation) | Makes capture more likely, at greater risk to operators. |
| Biometric ID kit | A rapid facial or DNA check that confirms identity on site. |
| Quick reaction force | Reinforcement if things go wrong; committing it raises the risk of exposure. |

- **Naming:** use generic classes and military designations in game, not manufacturer brand names.
- **Data-driven:** keep all equipment stats in data files so they're easy to update.

### Who you send

The demo uses a JSOC-led task force operating under CIA authority, with Marine Raider teams as the assault force. JSOC provides command, dedicated special operations helicopters, and top-tier ISR; the Raiders bring maritime skills that suit a coastal target. In game it uses a fictional task force designation.

This puts both the military and the CIA in the story, makes deniability a real stake, and supports a raid at this scale. Later options:

| Force | Style | Tradeoff |
| --- | --- | --- |
| JSOC task force with Raider assault teams (demo) | Helicopter or maritime raid, 16 operators | Most capable, but the loudest footprint |
| Raider-led task force | The same assault force with thinner support | Harder variant: fewer premium helicopters and drones |
| CIA Ground Branch | Small team, ground infiltration, local cover | Most deniable, least firepower, help is far away |
| Ranger-style raid force | Larger force with more firepower | Hard to keep covert |
| Overwatch and strike | Sniper or recon team plus an armed drone, no assault | Lowest risk to US lives, hardest positive ID |
| CIA–JSOC hybrid | Ground Branch recon guides the assault | Strong intel and assault, but two chains of command |

### Loadout: insertion, extraction, and fire support

Before launch, you choose freely. There's no visible budget or score. Instead, every option and combination has strengths, weaknesses, and risks that your advisors explain and argue over. Under the hood, each choice feeds hidden detection and exposure models that drive complications and the debrief.

**Insertion** (risks shown for CHARON):

| Option | Strength | Weakness | Risk |
| --- | --- | --- | --- |
| Helicopters | Fastest, carries all four teams, doubles as extraction | Rotor noise warns the mansion minutes out | Host air defense, or the patron's radar across the sea, spots the flight |
| Assault boats from offshore | Quiet, uses the marina and seawall | Slower, smaller load, depends on sea state | Coast guard patrols, and the armed yacht covers the marina |
| HALO/HAHO parachute | Silent arrival from far away, no predictable route | Teams can scatter, limited heavy gear, hard timing | Landing on the wrong roof or in a host politician's villa |
| Vehicles under local cover | Blends into highway traffic; best for the snatch approach | Small team, light weapons, slow to reinforce | Checkpoints, and a cover story that can unravel |

**Extraction** is chosen separately (helicopters, boats to an offshore ship, or vehicles to a safe house and a later flight), plus a required backup plan. Mixed choices like parachuting in and leaving by boat are valid.

**Fire support:**

| Option | Strength | Weakness | Risk |
| --- | --- | --- | --- |
| Armed drone missiles | Precise, long loiter, and you can fly it | Counter-drone jamming; a missile strike destroys the intel | Collateral damage to neighboring villas |
| Loitering munitions | Small warheads that can wait for the right moment | Limited punch against hardened positions | Can be jammed or shot down |
| Sniper overwatch | The most precise lethal option, with near-zero collateral | Needs a covered position and clear line of sight | The sniper team can be found |
| Gunship on call | Devastating sustained fire | Impossible to deny | A gunship over a partner's coast looks like an act of war |
| Attack helicopters | Close support that can cover extraction | Loud and vulnerable to rooftop missiles | A shootdown becomes an international crisis |
| Non-kinetic (power cut, cell jamming, CCTV cyberattack) | Blinds defenses without firing a shot; deniable | Backup generators blunt it, and jamming hits your own comms | A district-wide blackout alerts host security |
| Pre-assault electronic attack | Knocks out radar and counter-drone systems | Warns the defenders that something is coming | Hard to deny if traced |
| Show of force | A low jet pass that can freeze host security | Tells everyone the US is involved | Heavy exposure cost |

- **Combinations matter.** Helicopters plus a power cut shrink the warning window. Parachutes plus non-kinetic support are the quietest option, with the least firepower if things go wrong.
- **Advisors disagree.** The mission commander wants overwhelming support, the national security advisor flags exposure, and the CIA director favors whatever keeps the drive intact.
- **No visible score.** Players learn the tradeoffs through advice, outcomes, and the debrief.

## Mission design

### Mission template

Every scenario defines the same fields, so missions stay consistent and comparable:

- **Backstory and target profile:** who the target is, why they matter, and the strategic case for each outcome (capture vs. kill, rescue vs. trade).
- **Objective:** primary (capture, kill, rescue, recover, destroy) and secondary (intel, no casualties, deniability).
- **Core uncertainty:** what you can't know for sure, such as identity, location, or loyalty.
- **Clock:** what forces you to act.
- **Political context:** the host nation's stance (hostile, neutral, ally) and what exposure costs.
- **Key locations:** the places on the map that drive decisions.
- **Signature decision:** the one agonizing call the scenario is built around.
- **Approaches:** at least three valid options, none always correct.
- **Complication pool:** 8–16 possibilities, with 1–2 drawn per run.
- **Allowed forces, intel, and support:** what's available in this theater.
- **Grading:** how the debrief scores the result.

Political context is also a modifier: any mission can be relocated to an ally's territory, where getting caught damages the alliance instead of starting a crisis.

### Mission library

Eight missions, each built around a different kind of uncertainty. CHARON is the demo; the rest come later. Cut or merged: Ally's Backyard became the political-context modifier, Moving Target became an approach in Proof of Life, and Embassy Under Fire and The Launcher are parked because they play like a defense or a wide-area search rather than a raid. Missions 2–8 are still outlines that need the full template treatment CHARON got.

#### 1. CHARON (demo)

The founder of a state-linked mercenary group, modeled on real-world groups like Wagner but fictional, is staying at his fortified seaside mansion on the Black Sea. The host is a Western-leaning republic whose government quietly courts his patron. Two weeks ago, his men's drones killed four US service members.

| Field | Detail |
| --- | --- |
| Backstory | A former special forces officer of a hostile great power who founded REQUIEM Group, whose fighters call themselves "the choir." REQUIEM does the patron's deniable work: propping up friendly regimes, running mines, and arming proxy militias. He personally moves weapons, gold, and cash through the network. After a failed power play against the patron's defense ministry, his standing is precarious. Two weeks ago, REQUIEM drones struck a US outpost in a proxy war and killed four Americans. Both REQUIEM and the patron deny it. |
| Target profile | Late 50s, paranoid, vain, and an insomniac. Protected by about 25–30 REQUIEM veterans who have fought beside him for a decade and are loyal to him, not to the patron. Rarely leaves patron territory, which is what makes this week unique. Carries an encrypted drive he calls his insurance: records of the patron's covert operations. |
| Why capture matters | He knows the patron's next planned operation against a US ally, and the identities of patron agents inside allied governments. Alive, he's proof the patron ordered the strike that killed Americans, which builds the case for sanctions and allied support. |
| Why killing is on the table | He ordered the strike, so killing him delivers justice and deterrence. But his secrets die with him, and the patron gets a martyr and a propaganda win. |
| Objective | Primary: capture alive, or kill with confirmed ID if capture fails. Secondary: recover the drive, no civilian harm, no exposure. |
| Core uncertainty | Is he actually at the mansion, and is the drive with him? |
| Clock | In 72 hours he flies back into patron territory, where he's untouchable. |
| Political context | The host republic is a Western partner on paper, seeking NATO and EU ties, but its ruling party quietly courts the patron and shelters its elites. Raiding without telling them risks pushing the country into the patron's arms. Telling them risks a tip-off. The patron's navy patrols nearby waters, and treaty limits restrict how long US warships can stay in the Black Sea. |
| Key locations | Blast-hardened main residence with a rock-cut panic room and escape tunnel, guest villas, staff quarters, helipad, private marina with his armed yacht, coastal highway, neighboring villas owned by the host's political elite. |
| Defenses | Layered: a hardened smart home, an outer guard ring, REQUIEM veterans on the walls and roof, a personal bodyguard inner circle, and a reaction force. Details below. |
| Signature decision | He seals himself in the panic room with host security minutes away: breach for capture, kill him, or leave without him. |
| Approaches | Maritime insertion from offshore, helicopter raid, snatch on the coastal highway when he leaves for a meeting, pressure the host government to hand him over (slow and leak-prone), drone strike (loses the drive and the capture). |
| Complications | His patron's hit team arrives the same night; he offers to defect mid-raid; he runs for the yacht; the drive starts self-wiping; a dinner party puts guests on site; counter-drone systems down your ISR drone; he calls his patron live from the panic room; a mole in host intelligence tips him off; a hired local gate guard offers to open the outer gate for a deal; a decoy convoy leaves as the raid starts; backup power and thermal masking blunt your advantages; a rooftop sniper pins down the assault; the panic room tunnel leads to the marina; a patron navy patrol shadows the coast; a Black Sea storm rolls in. |
| Grading | Best: capture with the drive. Then capture without it, kill with it, kill only. Escape is a failure. Civilian harm, exposure, and damage to relations with the host lower any result. |
| Best forces | JSOC task force with Raider assault teams, CIA–JSOC hybrid |

**Defenses in depth.** The mansion is a fortress under its luxury finish, and his men are loyal to him personally, not to the patron or to money. They won't break or surrender easily.

| Layer | What's there | What it means for you |
| --- | --- | --- |
| Structure | Reinforced concrete under marble, blast-rated glass, steel shutters, blast doors on key corridors, and a rock-cut panic room with its own air, power, and comms | Breaching is slow and loud, and explosive breaches near the panic room risk killing him |
| Smart home | Networked cameras with AI video analytics, facial recognition at the gates, motion and seismic perimeter sensors, gunshot detection, automated lockdown, controllable lighting, drone-detection radar, independent power, and satellite internet | Hack it and you can loop cameras, unlock doors, and kill the lights. Get detected and the house locks down, shutters drop, and floodlights blind your night vision |
| Outer ring | Locally hired gate guards, perimeter patrols, and dogs | The weakest link: least loyal, no night vision, and the most likely to be bribed |
| REQUIEM veterans (about 12) | Body armor, night vision and thermal optics, rooftop machine guns, a sniper, shoulder-fired anti-aircraft missiles, and a team flying armed FPV drones | They erode your night advantage, make helicopter insertion risky, and can hunt your teams from above |
| Inner circle (about 6) | Personal bodyguards who have served him for a decade | Loyal to the death: they rush him to the panic room or the yacht and fight to the last man |
| Reaction force (about 8) | Quartered in the guest villa with armored SUVs | Arrives within minutes, and can block the highway snatch or reinforce the house |

- **Morale:** veterans and the inner circle don't flee when suppressed. They reposition and counterattack. Only the outer ring breaks.
- **The smart home cuts both ways:** the system that protects him is also your best intel source and your best weapon, if you take control of it first.

**Family presence.** His family may or may not be at the mansion, and each run decides it at the start. His second wife, his teenage son from his first marriage, and his 8-year-old daughter can be present in any combination, or not at all.

- **Finding out:** intel can reveal who's there, through the son's social media, school holiday calendars, payments for children's items, the jet's passenger manifest, or the inside asset. Nothing is certain until someone sees them.
- **It can change:** if he grows suspicious during the intel phase, he may send the family away. That's one of the behavioral tells worth catching.
- **The panic room:** family may be sealed inside with him, which makes an explosive breach far riskier and gives legal counsel strong objections.
- **Strikes:** with family present, most strike options fall outside your rules of engagement or become reserved decisions with heavy consequences.
- **His behavior:** with his family there, he's less likely to flee alone and more likely to negotiate or offer to defect to protect them.
- **Negotiated surrender:** offering safe passage for his family in exchange for his surrender becomes a valid path to capture. The game never allows threatening the family.
- **Advisors split:** the CIA director sees a chance for surrender, while the national security advisor and legal counsel see unacceptable risk.
- **Debrief:** harm to his family is among the most serious outcomes, politically and morally.

**Brevity codes.** The target's codename is CHARON, after the ferryman of the dead. Radio calls use words from the same River Styx myth, plus one real generic term:

| Code | Meaning |
| --- | --- |
| STYX | Assault force crosses the coastline (feet dry) |
| JACKPOT | Target found and positively identified |
| CHARON in custody | Target captured |
| CHARON EKIA | Target killed in action |
| OBOL | The insurance drive is recovered |
| ACHERON | Abort |
| LETHE | Exfil complete, everyone's out |

Advisors, decision cards, and the debrief all use these codes. The best-case call is "JACKPOT... CHARON in custody. OBOL secured."

#### 2. Proof of Life

Two American aid workers are held in a mountain village. Captors move them every 48 hours while a ransom channel stays open.

| Field | Detail |
| --- | --- |
| Objective | Rescue both alive; secondary: capture the captor leader |
| Core uncertainty | Location: which house, and are both still alive? |
| Clock | Next move in under 48 hours; captors have threatened execution |
| Political context | Neutral nation that will object but won't fight |
| Signature decision | Raid now on partial confirmation, or negotiate to buy time and intel |
| Approaches | Night raid, intercept during the move, hand off to local forces, keep negotiating |
| Complications | Hostages split up, one hostage can't walk, a local tips off the captors, demands change mid-negotiation |
| Best forces | JSOC task force, CIA–JSOC hybrid |

#### 3. Dirty Cargo

Stolen radiological material sits in a port warehouse, scheduled to ship out within hours.

| Field | Detail |
| --- | --- |
| Objective | Recover the material intact; secondary: capture the broker |
| Core uncertainty | Which container, and is it rigged? |
| Clock | The ship sails before dawn |
| Political context | Neutral port city with heavy civilian traffic |
| Signature decision | How much risk to accept to recover the material rather than just stop the shipment |
| Approaches | Ground raid with a radiological team, board the ship at sea, tip off local authorities and lose control of it |
| Complications | Decoy containers, booby trap, port police respond, material already moved to a truck |
| Best forces | JSOC task force with an EOD/radiological attachment |

#### 4. The Wedding

A terrorist leader surfaces at a family wedding in a crowded city, with a three-hour window.

| Field | Detail |
| --- | --- |
| Objective | Capture or kill; secondary: zero civilian casualties |
| Core uncertainty | Positive ID in a crowd: which man is him? |
| Clock | Three hours before he vanishes for years |
| Political context | Neutral nation, with press nearby |
| Signature decision | Capture in the chaos, strike with known collateral, or let him walk |
| Approaches | Snatch as he leaves, strike his vehicle after departure, local police arrest, abort |
| Complications | Body double, he leaves early with children, police at the venue, a guest posts video online |
| Best forces | CIA Ground Branch, overwatch and strike, JSOC task force |

#### 5. The Defector

A foreign weapons scientist wants out but is watched by a hostile security service in its own capital.

| Field | Detail |
| --- | --- |
| Objective | Extract him and his family unharmed; secondary: his research data |
| Core uncertainty | Loyalty: genuine defector or double agent? |
| Clock | The security service is growing suspicious |
| Political context | Hostile peer state; any firefight is an international incident |
| Signature decision | Push through heavy surveillance, or abort and burn the channel |
| Approaches | Covert vehicle extraction, border crossing on foot, embassy route, abort |
| Complications | Family won't leave without a relative, surveillance team spots the handlers, he insists on grabbing a drive from his lab, city-wide checkpoint lockdown |
| Best forces | CIA Ground Branch, with the CIA–JSOC hybrid as emergency backup only |

#### 6. Broken Arrow

An experimental US stealth drone crashed in hostile territory. A rival power's team and local militia are racing to the wreck.

| Field | Detail |
| --- | --- |
| Objective | Recover the core components; fallback: destroy the wreck |
| Core uncertainty | Wreck condition, and who gets there first |
| Clock | The rival team is hours away |
| Political context | Hostile territory; the rival power's soldiers raise escalation risk |
| Signature decision | Fight for recovery, or destroy it and deny everything |
| Approaches | Recovery raid, strike the wreck, seize a nearby airstrip and recover, fast snatch-and-run |
| Complications | Rival team already on site, wreck landed in a village, weather grounds helicopters, militia shoot down a helicopter |
| Best forces | Ranger-style raid force or JSOC task force, with a combat search and rescue attachment |

#### 7. Dark Ship

A cargo ship carrying missile components is crossing international waters at night in rough seas.

| Field | Detail |
| --- | --- |
| Objective | Seize the cargo and evidence; secondary: arrest smugglers and protect the crew |
| Core uncertainty | Which crew are smugglers, and is the ship rigged to scuttle? |
| Clock | Hours until it reaches protected territorial waters |
| Political context | International waters; the flag nation will protest |
| Signature decision | Board in rough seas now, or wait for calmer weather near the border |
| Approaches | Helicopter fast-rope boarding, boat boarding, disable the steering and shadow it, strike and lose the evidence |
| Complications | Scuttling charges, an armed escort boat, crew taken hostage, operator lost overboard |
| Best forces | JSOC task force with Raider maritime teams |

#### 8. Burned

A captured CIA officer is about to be moved to a secret prison where they'll be broken.

| Field | Detail |
| --- | --- |
| Objective | Rescue the officer; secondary: deny the captors what they've learned |
| Core uncertainty | Location and condition, and has the officer already talked? |
| Clock | Transfer within 24 hours |
| Political context | Hostile nation that will parade the officer publicly |
| Signature decision | High-risk rescue raid, convoy ambush during transfer, or a prisoner trade |
| Approaches | Holding-site raid, convoy ambush, prisoner swap, hand off to local forces |
| Complications | Officer moved early, officer wounded, the transfer is a trap, captors execute on alarm |
| Best forces | CIA–JSOC hybrid, JSOC task force, CIA Ground Branch |

## Player role and core loop

You are the President in the Situation Room. You never control units directly, except the drone when you take it over. Your power is the decisions only you can make, with a target cadence of one hard decision every 3–5 minutes.

The mission runs in four phases:

1. **Intel (15–20 min):** task sources across a compressed 96-hour window to build confidence and learn what's inside the mansion. See the intel phase section below.
2. **Plan (5–10 min):** read the intel dossier, question your advisors, choose your loadout and rules of engagement, pick an approach from the mission's options, set the timing (night, moon phase, weather window), then give the go or wait. Waiting raises confidence but risks the target leaving.
3. **Execute (20–30 min):** watch through drone and helmet-cam feeds, answer decision cards under time pressure, and intervene when you choose to.
4. **Debrief (2–3 min):** see what happened, what each advisor recommended, and the consequences: headlines, diplomatic fallout, and intel gained.

The calls only you can make are listed under reserved decisions in the decisions interface. The biggest are green-lighting the raid, authorizing lethal force on an uncertain target, and approving strikes. Abort authority depends on your rules of engagement.

## Intel phase

Intel is the heart of a covert operation, so this phase is deep. You get a 96-hour surveillance window, played as four in-game days of about 4–5 real minutes each (15–20 minutes total). What you learn sets the raid's starting confidence, unlocks planning options, and decides what surprises you later.

**How a day works:**

- **Task:** assign your available sources. Each has limited slots per day, and some take more than a day to deliver.
- **Collect:** reports arrive through the day, each graded for source reliability (A–F) and information credibility (1–6), the way real intelligence reports are rated.
- **Fuse:** pin reports to an evidence board. Confidence rises only when independent sources corroborate each other, not from piling up more of the same.
- **Decide:** keep watching, adjust collection, or move to planning early.

**Sources:**

| Source | What it can reveal | Risk |
| --- | --- | --- |
| High-altitude stealth drone | Pattern of life: guard shifts, vehicles, visitors | Limited time on station |
| Armed ISR drone (MQ-9 class) | Closer, sharper imagery and thermal | Easier to spot; counter-drone systems may track it |
| Satellite imagery (optical and radar) | Construction, vehicles, yacht position, even through clouds | Snapshots only, on a fixed schedule |
| CIA asset inside the mansion (household staff) | Who's really inside, room layout, his routines | Can be burned, or turned into a source of false information |
| Recruit a new asset (bribe a guard or contractor) | Shift schedules, security weaknesses | Slow, and the approach itself may be reported |
| Signals intercepts | Phone and radio traffic, a possible voice match | He switches phones and goes quiet |
| Cyber: CCTV, phones, smart-home systems | Live camera feeds, door logs, his location room by room | Detected intrusions trigger a security sweep |
| Financial tracking | Payments that reveal plans, like catering for a dinner party or yacht refueling | Slow, and needs a cooperative bank |
| Flight tracking | His private jet's flight plans and crew call-outs | Plans can be filed as a decoy |
| Open source and social media | His girlfriend's or son's posts revealing who's there and when | Posts may be delayed, or staged |
| Host intelligence liaison | Local access, police schedules, mansion blueprints | The mole may tip him off |
| Allied intelligence liaison | A second opinion and their own sources | They want something in return, and may leak |
| Close target reconnaissance team | Operators scout the walls and marina at night | Getting spotted can blow the whole operation |
| Technical plant (tracker or bug) | Tracks his car or yacht, or listens in a room | Needs an asset or recon team to place it, and can be found |

**No visible suspicion meter.** The game tracks how alert the target is behind the scenes. You only see it through his behavior, and it's up to you (and your advisors, who may notice or miss things) to read the signs:

- More guards on the roof, or lights on all night
- His phone goes dark, or he switches devices
- The yacht is refueled, or the jet files a flight plan early
- Staff are sent home, or visitors canceled
- Decoy convoys start leaving at odd hours
- Counter-drone jamming increases

Push too hard and he may move early, change rooms, or set a trap. Watch too little and you go in blind.

**What carries into the raid:** confirmed guards are marked, a discovered tunnel becomes a blocking position, a known party night changes the civilian count, and the jet's flight plan can open the highway snatch approach. Intel you skipped shows up as a surprise.

Advisors pull in different directions: the CIA director wants more collection, the mission commander wants to go before the window closes, and the national security advisor worries every new source is another chance of a leak.

## Modes

All three views run on the same simulation, and the raid never waits for you. Switch freely between them.

**Ops workspace:** a map-centric workspace inspired by modern AI-assisted command software. The map sits in the center, with an AI chat panel for your advisors docked beside it, plus the evidence board and course-of-action cards. Best for the intel and planning phases.

**Situation Room:** the wall of screens, with the main feed, helmet-cam grid, advisor portraits, dossier, and decision cards. Best for watching the raid unfold.

**Drone control:** fly the armed ISR drone yourself.

### Drone control

- **Flight:** set the orbit pattern and altitude. Flying high is safer and quieter but the image is softer; flying low is sharper but audible and easier for counter-drone systems to find. Time on station is limited, and a second drone can relieve the first.
- **Sensor:** thermal (white-hot or black-hot) and daylight modes, zoom, a laser rangefinder, and track lock to follow a person or vehicle automatically. Clouds, smoke, and glare degrade the picture.
- **Overwatch:** call out threats to the teams, mark contacts, follow anyone fleeing, watch the marina and highway, and lase targets for helicopter gunners.
- **Contested link:** counter-drone jamming adds lag and pixelation and can drop the link entirely. The drone then flies a lost-link route until control returns.
- **Records:** everything the drone sees is recorded for the debrief, including what you chose not to strike.

Strike workflow, where every step is a reserved decision:

1. **Mark and track** the target.
2. **Build positive ID** from what you can see and what others report. The game shows confidence, never certainty.
3. **Review the collateral estimate:** a blast-area overlay and possible civilians, with uncertainty.
4. **Hear legal counsel's view.**
5. **Choose a munition:** a reduced-blast warhead, a small precision missile, a larger missile, or none.
6. **Authorize.** During the flight time you can still divert the missile to an empty area if someone walks into frame.

The shipped game runs in real time with no pause. Pause and 2x speed exist only as developer tools for testing.

## AI advisors

Four core voices are with you throughout: three advisors in the Situation Room and the ground force commander on the radio. Two more appear when their expertise matters: an intel analyst who leads the intel phase, and legal counsel for rules of engagement and strike decisions. Their fallibility comes from bias, incomplete information, and disagreement, not lying. Misreporting comes later.

| Advisor (placeholder) | Role | When present | Pushes for | Blind spot |
| --- | --- | --- | --- | --- |
| Adm. Hale | JSOC mission commander | Throughout | Protecting his operators and trusting the force | Resists any interference mid-raid |
| Dir. Kessler | CIA director | Throughout | Capturing the target alive for intel | Overconfident in her agency's intel |
| Ms. Navarro | National security advisor | Throughout | Avoiding exposure and keeping the host government on side | Can push caution past the point of usefulness |
| Lt. Col. Reyes | Raider ground force commander (radio) | Planning onward | Accomplishing the mission | Only knows what his teams can see |
| Analyst Cho | CIA targeting analyst | Intel and planning; on call during the raid | Following the evidence wherever it points | Can over-read patterns, and can simply be wrong |
| Mr. Adler | Legal counsel | Rules of engagement setup and strike decisions | Lawful, defensible decisions | Caveats can stall urgent calls |

Behavior:

- **Brief:** present the intel and course-of-action options during planning, each with its risks.
- **Recommend:** give a short recommendation on every decision card. They will often disagree.
- **Answer:** respond to your free-text questions in character, using only what they could plausibly know.
- **React:** comment on major events like contact, casualties, and complications, with the ground force commander reporting what his teams see.
- **Memory:** keep a running summary of your decisions and recent events, never the full chat history.

## Decisions interface

Most decisions are structured cards; free text is for questions and instructions. Cards work without the LLM, which keeps them instant and cheap. There are no visible timers, but the raid never stops while you think.

- **Delegable decisions:** if you don't answer, the ground force commander acts within your rules of engagement once the situation forces it. For example, he repositions a team under fire or pulls back from a compromised approach.
- **Reserved decisions:** some calls only you can make, and the force holds until you do. Holding has costs, like local forces getting closer or the target getting away. Reserved calls include drone or gunship strikes, lethal force on an unconfirmed target, breaching the panic room with civilians inside, entering a host politician's villa, committing the QRF, and anything outside your rules of engagement.
- **Free text:** ask any advisor a question ("@Kessler how sure are we it's him?") or give the ground force commander an instruction ("get eyes on the north alley"). The LLM turns instructions into a structured plan in JSON.
- **Interventions:** Hold, Proceed, and Abort are always available. Each overrides the commander and is logged for the debrief.
- **Validation:** plan JSON is checked against a schema and the simulation's legal moves. Invalid output is retried once, then the advisor asks you to rephrase.
- **Latency:** a canned acknowledgment shows instantly while the LLM responds.

### Rules of engagement and delegation

Before launch, you set what the force may do without asking you. Delegating more means fewer interruptions and faster action, but the debrief still holds you responsible for what happens.

| Setting | Options |
| --- | --- |
| Lethal force | Self-defense only, against hostile acts or intent, or any armed person |
| Target outcome | Capture only, capture preferred with kill authorized if capture fails, or kill authorized |
| Abort authority | Commander may abort on his own, or only with your approval |
| Strike authority | Every strike needs your approval, or strikes on armed threats away from civilians are pre-cleared |
| Civilian risk | Pull back whenever civilians are at risk, or accept risk to complete the objective |
| Time on target | A hard limit before the force must leave, with or without the target |

Advisors weigh in here too: the mission commander wants freedom of action, while the national security advisor wants tight limits.

## Simulation

The raid plays out on a 3D map where operators, guards, and civilians physically move, take cover, and fight. The simulation is deterministic from a seed so runs can be replayed and debugged.

### Fidelity: deep systems, simple visuals

Simplify how the battle looks, never how it plays. The test: if a simplification would change a tactical decision you or the ground force commander would make, it's too simple.

| Keep deep | Simplify |
| --- | --- |
| Directional, typed, destructible cover | Simple geometry under realistic camera filters |
| Line of sight from real terrain and buildings | A few soldier animations: move, fire, prone, die |
| Suppression and morale | Destruction as a swap to rubble, not physics |
| Every operator tracked individually | Visceral on a budget: blood decals, a few wound states, and graphic audio; no physics ragdolls |
| Elevation, flanking, and weapon ranges | Basic lighting and one weather setting |
| Darkness and night vision | No per-soldier inventory or ammo micromanagement |

- **Tick rate:** 10 Hz simulation, with rendering interpolated at full frame rate.
- **Units:** individual operators in 4-person teams, mercenary guards, responding host police and coast guard, and civilians. Each person has health; each team has morale and suppression.
- **Movement:** navmesh pathfinding across streets, rooftops, and building interiors. Helicopters fly scripted insertion and extraction paths.
- **Close quarters:** buildings have interior rooms. Teams stack, breach, and clear room by room, and in the drone view roofs fade out so you can follow them.
- **Combat:** per-shot hit chance from range, weapon, cover, darkness, and suppression.
- **Positive ID:** people start as unknown. ID comes from close observation, a helmet-cam facial match, or drone thermal profile, and it's never certain from the air.
- **Civilians:** panic, flee, or freeze, and can wander into fire. Civilian harm is tracked for the debrief.
- **Strikes:** drone missiles hit after a short flight time. A collateral estimate shows before you authorize.
- **Enemy AI:** scripted behavior trees for guards (patrol, alert, defend) and responding host security, using the same cover rules. Loyalty varies by layer: hired guards break under pressure, REQUIEM veterans don't. No LLM.
- **Event bus:** typed events (contact, casualties, positive ID, complication, compromise) drive advisor reactions and decision cards.

### Cover

Cover is tagged on map objects and is directional: a wall protects only against fire from its far side. Starting values below are for tuning.

| Type | Examples | Hits taken | Detection |
| --- | --- | --- | --- |
| Heavy | Reinforced walls, stone columns, vehicle engine blocks | 50% fewer | Normal |
| Light | Garden walls, planters, furniture, car doors | 25% fewer | Normal |
| Concealment | Hedges, palms, curtains, smoke | No change | Shorter range |
| Open | Lawns, courtyard, pool deck, driveway | No change | Normal |
| Exposed | Swimming pool, marina shallows | 25% more | Normal |

- Operators and guards automatically take the best cover near their destination, facing known threats.
- Defenders can hold rooms and rooftops as heavy cover.
- Breaching charges, drone missiles, and gunship fire can destroy walls, turning heavy cover into rubble.
- The ground force commander's plans reference cover directly, like "hold behind the courtyard wall".

### Line of sight and fog of war

You only see what your units can actually see.

- Each person has a sight radius, blocked by terrain, buildings, and smoke.
- It's night: anyone without night vision sees far less, and muzzle flashes and lights reveal positions.
- Concealment shrinks the range at which someone can be spotted. Firing or moving reveals them.
- Rooftops extend sight range.
- Fog has three states: visible, last known (a fading marker), and unexplored.
- Drone thermal sees through concealment but not buildings.
- Line of sight is computed a few times per second on a grid, not every frame, to keep it cheap.

## Maps and layout

The CHARON level is four linked maps: the compound and three floors. Interiors are built for room-clearing, with sparse cover so movement is exposed. Rough floor plans exist; final geometry is tuned in the editor.

### Compound

A walled seaside estate, inland highway to the north, Black Sea to the south.

- **North:** coastal highway, main gate, helipad, staff quarters, and the guest villa by the gate that houses the reaction force.
- **Center:** the main residence, with the panic room in its deepest corner.
- **South:** pool and open lawn (the exposed killing ground), terrace, private marina with the armed yacht, and a seawall.
- **Escape tunnel:** runs from the panic room under the grounds to the marina. A slow breach lets him reach the yacht.
- **Five approaches, each stressing a different defense:** (A) vehicles to the main gate, into the reaction force; (B) breach the perimeter wall; (C) helicopter to the roof or helipad, within reach of the rooftop sniper and anti-air missiles; (D) boats through the marina; (E) combat divers over the seawall, the quietest entry.
- **Cover:** heavy (boundary walls, vehicles), light (planters, furniture), and concealment (trees, garden). The pool and lawn are exposed.

### Ground floor

Organized around a long central hallway running the full depth of the house, the main internal fight. Teams enter from the foyer (north) or the terrace glass doors (south) and both funnel into the hall, where every room's doorway is a firing position.

- **Rooms:** foyer, double-height great room, kitchen with pantry and mud room (side exit), dining room, security office (take it to kill CCTV and alarms), guest WC, the study (holds the drive), the master suite (his fast route to the panic room), and the panic room with the tunnel mouth.
- **The great room is a trap:** open, overlooked by the upper gallery, with only a sofa and bar for cover.

### Upper floor

Reached by the stairs, and tied to the ground floor in two ways that make the house one vertical problem.

- **The gallery is open to the great room below,** so fire crosses between floors.
- **A second panic room entrance** (a safe landing with a shaft down) means he can reach the panic room from upstairs, so holding the stairs isn't enough.
- **Rooms:** his private office (a safe and possible second drive), the wife's suite, a guest room, bathrooms, and the children's rooms flanking the safe landing, so when the family is present the hardest breach is right where the kids are.
- **The balcony** overlooks the terrace and sea, doubling as the fast-rope insertion point (approach C) and a sniper perch.

## UI layout

Each view has its own layout, and a persistent top bar lets you switch between them.

- **Ops workspace:** a central map with contacts, routes, and intel pins; an advisor chat panel on one side; the evidence board and course-of-action cards on the other.
- **Situation Room:** a main screen with the drone feed or tactical 3D view, a grid of four helmet cams (tap to enlarge), advisor portraits with current recommendations, and a right panel with the intel dossier, confidence assessment, and decision card queue.
- **Drone control:** a full-screen sensor view with military-style symbology, a mini-map, and the strike workflow panel.
- **Status bar (all views):** mission clock, team status, helicopters, drone munitions, QRF status, and time controls.

Visual style: a dark tactical UI. Helmet cams aim for realism through camera treatment rather than expensive assets: night-vision phosphor, grain, compression artifacts, fisheye, and head movement over simple geometry. ISR feeds stay minimal: white-hot or black-hot thermal with military-style symbology. No real company names, logos, or copied UI.

## Technical architecture

The whole game runs in the browser. One thin server exists only to hold the API key and log costs.

The full technical design lives in its own doc: [War Room — Technical Design](https://claude.ai/artifact/R4Fx1VX9DKqa2a4V8NQK1S).

&#91;embedded content: prototype architecture · client, agents, gateway\]

Decision cards and interventions go straight to the simulation. Only free-text questions, instructions, and filtered events reach the LLM, and the simulation keeps running while an advisor thinks.

Stack: TypeScript, Babylon.js for the 3D compound and the drone and helmet-cam feeds, React for panels, and the simulation in a Web Worker. The gateway is a small Node server or Cloudflare Worker. For a desktop executable later, wrap the same build with Tauri, and add bring-your-own-key as an option.

Rendering: Babylon.js's WebGPU engine by default, with automatic fallback to WebGL2 for older browsers and devices. Shaders (night vision, thermal, grain) are written so they run on both backends, and the slice avoids WebGPU-only features like compute shaders. Line of sight and all game logic stay on the CPU in the simulation worker, so results are deterministic on any GPU.

Assets: see the asset pipeline section. The mansion is generated from floor-plan data, with cover tags in the data; other assets are imported as glTF.

## Inference cost and instrumentation

The target is under $0.40 of inference per mission (about 45–60 minutes). This is an assumption to validate in playtests, not a measured number.

The LLM is called only on these triggers:

- A free-text question or instruction (larger model).
- The planning briefing and course-of-action options, once per run (larger model).
- Intel reports and analyst summaries during the intel phase (small model).
- Advisor recommendations on decision cards (small model).
- Reactions to significant events filtered from the event bus (small model).
- The debrief narrative and headlines, once per run (larger model).

Cost controls: cache the static prompt (personas, doctrine, rules, mission dossier), send a compact state summary instead of raw state, cap calls per minute per advisor, and cap free-text length so players can't flood or game the advisors.

Log every call with session ID, advisor, trigger type, model, input/cached/output tokens, cost, and latency. Show a cost summary at the end of each session.

Voiced radio: browser speech voices and pre-recorded common calls cost nothing. Paid text-to-speech is used only for generated advisor answers, and it's logged like LLM calls.

## Out of scope for prototype

These are deferred until the core loop proves fun: a campaign and target network, conventional RTS battles, controlling operator teams directly, advisor misreporting, the political layer beyond the debrief, multiplayer, voice orders, the desktop build, and an LLM-driven enemy.

## Success criteria and milestones

The prototype succeeds if the raid feels tense and players want to run it again with different choices. Measurable checks:

- At least 5 playtesters finish the mission, and most want a second run.
- Each run has 4–6 hard decisions, with no long stretches of passive watching.
- Playtesters can name at least one decision they agonized over.
- Advisors give distinct, plausible advice, judged from logs.
- Inference cost stays under target, and advisor response latency stays under 2 seconds.

Build order: a vertical slice of CHARON first, built with AI coding agents, then the full design. Estimated 6–9 weeks full-time; about 10–14 weeks at half-time; 4–6 months at a few hours a week. Your availability for testing, tuning, and decisions is the real bottleneck, not code.

The slice includes the intel phase with 6 sources (high-altitude drone, inside asset, signals intercepts, cyber, financial tracking, host liaison), the Situation Room view, drone control with the full strike workflow, three rules-of-engagement settings (lethal force, target outcome, strike authority), helicopter and boat insertion, the fire support options, family presence, 4–5 complications, brevity codes, voiced radio, the debrief, and every item listed under "In the slice" in feature decisions.

**Time compression built into the plan:**

- **Greybox from data:** the mansion is generated in code from a floor-plan data file (rooms, walls, doors, cover tags), so the map is playable in days and changes are edits to data, not models.
- **Headless simulation tests:** the deterministic simulation runs thousands of raids without graphics, so agents can check guard behavior, pathfinding, and balance automatically instead of someone watching every run.
- **Parallel agents with contracts:** data formats for the map, units, events, and decisions are fixed first, then separate agents build the simulation, UI, and intel and advisor systems in parallel against them.
- **Fun before polish:** the whole raid is playable in greybox before any art or audio work, with a hard fun check at the halfway point.

1. **Week 1, contracts and greybox:** data schemas, the floor-plan data for all four maps, the procedural greybox mansion, the headless simulation harness, and the Babylon scene with camera effects.
2. **Weeks 2–3, parallel tracks:** simulation (movement, combat, cover, line of sight, guards, civilians, family, positive ID) with automated tests; UI shell and decision cards; intel phase, advisors, and the LLM gateway with cost logging.
3. **Weeks 4–5, integration:** drone control and strikes, helmet cams, insertion options, smart-home hacking, panic room breaches, site exploitation, wounded operators, capture kit, and fire support. Ends with a **fun gate**: a full raid played in greybox. If the panic room moment doesn't land, fix design before spending on art.
4. **Weeks 6–7, assets and atmosphere:** the asset pipeline pass (below), violence and audio, voiced radio, social media ticker, complications, and the debrief.
5. **Weeks 8–9, tuning:** advisor personality tuning, balance, playtests, and a go/no-go decision.

After a go: the "right after the slice" items, the remaining intel sources, the Ops workspace view, full rules-of-engagement and loadout options, the full complication pool, and then missions 2–8.

## Asset pipeline

No hand modeling. Every asset comes from code, free libraries, or AI generation, in that order of preference.

| Asset | Source | Notes |
| --- | --- | --- |
| Mansion, walls, rooms, doors | Generated in code from the floor-plan data | Cover tags come straight from the data. Free CC0 textures (marble, concrete, plaster) from Poly Haven. |
| Terrain, cliff, seawall, marina, exterior dressing | Blender driven by Claude through Blender MCP, exported as glTF | Claude builds and edits the scene from plain-English instructions; you review in the viewport. |
| Props: furniture, vehicles, boats, helicopter, yacht | Free CC0 libraries first (Kenney, Quaternius, Poly Haven), then AI generation for gaps | Meshy or Tripo (hosted), or TRELLIS.2 (open source, runs locally on a capable GPU). |
| Characters: operators, guards, civilians, family | Free rigged CC0 characters first, or AI-generated models plus auto-rigging | Mixamo for free rigging and a large animation library (move, crouch, fire, breach, die). |
| Camera looks | Shaders in code | Night-vision phosphor, thermal, grain, fisheye, and blood decals on the helmet-cam lens. |

- **Licensing:** keep an asset manifest listing every asset's source and license. Meshy's free tier requires crediting Meshy; Tripo's commercial rights come with paid plans; TRELLIS.2 is MIT-licensed; Hunyuan3D's license excludes the EU, UK, and South Korea, so avoid it if you'll sell there.
- **Cleanup:** AI meshes are dense, so run a decimate or remesh pass (Claude can do this through Blender MCP) before importing.
- **Style consistency:** generate props from one shared style prompt, and let the camera filters do the realism work.

* **Hardware:** the current GTX 1060 6GB can't realistically run local 3D generators, so the slice uses CC0 libraries and free hosted tiers. Nothing before the week 6 asset pass needs a GPU upgrade. If you upgrade, aim for 16GB or more of VRAM to run open generators locally. The 1060 also makes a good minimum-spec test machine for the browser build.

### Art direction test (start of week 6)

Decide the look before acquiring assets. Build one room (the study) and one operator both ways, then view them through the helmet-cam, thermal, and night-vision filters:

- **Realistic-lite (recommended):** realistic PBR textures on simple geometry. Fits the visceral tone and the found-footage feel of the feeds.
- **Stylized low-poly:** the Synty, Quaternius, and Kenney look. Cheap and consistent, but cartoonish against the tone.

Pick one and record it in the decisions log. Mixing the two reads as unfinished.

### Asset sources

| Need | Source | License | Notes |
| --- | --- | --- | --- |
| Furniture, props, night sky, cliff and stone materials | Poly Haven | CC0 | Realistic models, PBR textures, and HDRIs with a key-free download API |
| Extra textures | AmbientCG | CC0 | PBR materials |
| Placeholder props, greybox dressing | Quaternius, Kenney | CC0 | Stylized; fine as placeholders |
| Specific items: helicopter, SUVs, yacht, weapons, soldiers | Sketchfab (CC0 and CC-BY filters) | Per model | Being folded into Fab, so download needed CC0 models early |
| Low-poly extras | Poly Pizza | Mostly CC-BY | Credit creators |
| Realistic modern operators | AI generation plus Mixamo rigging | Per tool | No good free pack exists; the helmet-cam filters carry the realism |
| Stylized military (only if going stylized) | Synty POLYGON Military | Paid | Desert, Iraq-war setting; check the license for web builds first |

### Audio and animation sources

| Need | Source | License | Notes |
| --- | --- | --- | --- |
| Advisor and radio voices | Kokoro.js | Open source | Runs in the browser with WebGPU at no cost; replaces paid text-to-speech |
| Weapons, ambience, vehicles, impacts | Sonniss GDC bundles | Royalty-free, no attribution | Multi-year archive; no AI or ML training allowed |
| Extra sound effects | Freesound (CC0 filter), Kenney audio | CC0 |  |
| Locomotion animation | Mixamo | Free with an Adobe account | In maintenance mode, but still the base library |
| Breach stacks, room clears, custom moves | Rokoko Vision (webcam mocap), Rokoko Create (text to animation) | Free tiers | Act out moves on a webcam; Create allows five exports a month |

Avoid free tiers of AI sound-effect tools for shipped audio; several lack commercial rights.

### After a GPU upgrade (16 GB+ VRAM)

- **AssetFurnace** (open source, Apache-2.0): a local image-to-3D pipeline producing textured, rigged, animated characters, and agents can drive it through MCP.
- **TRELLIS.2** (MIT): the strongest open image-to-3D model.
- **UniRig:** auto-rigging for non-humanoid models.
- **Atlas Studio** (paid): a fallback for a one-month batch if AI meshes need too much cleanup.

## Feature decisions

Where every backlog item landed after review.

### In the slice

- **Wounded operators:** when someone is badly hit, choose between medical evacuation and finishing the mission.
- **Site exploitation:** searching for phones, drives, and documents trades intel against time on target.
- **Voiced radio:** browser speech voices and pre-recorded common calls, behind a radio static filter; paid text-to-speech only for generated advisor answers.
- **Panic room breach options:** a thermal lance (slow), an explosive breach (fast, may kill him and anyone with him), or cutting air and power and waiting him out.
- **Local social media ticker:** residents post about helicopters and gunfire in real time, an early sign the raid is going public.
- **On-site biometric ID:** a rapid facial or DNA check that turns a probable ID into JACKPOT.
- **Capture kit:** less-lethal weapons and sedation. Capture becomes more likely, but operators take more risk.
- **Lower-collateral strikes:** sniper overwatch, a reduced-blast warhead, and loitering munitions.
- **Pre-assault electronic attack:** knock out radar and counter-drone systems just before insertion, at the cost of warning the defenders.
- **Disable the yacht:** a precision shot to the engines to close the sea escape, which may tip him off.
- **Show of force:** a low jet pass to freeze host security, with a heavy exposure cost.

### Right after the slice

- **Aftermath and cover story:** what you tell the host government, the public, and Congress, feeding a hidden leak model.
- **Highway snatch with vehicle stoppers:** a second map area, convoy AI, spike strips, and engine disablers.
- **K9 team:** dogs that track the tunnel or a fleeing target and help clear rooms.

### Backlog

Onboarding and a guided first run, after-action replay, difficulty and accessibility settings, presidential calls to the host's leader, a scout robot or tethered micro-drone, and missions 2–8.

### Production and operations

| Item | What | When |
| --- | --- | --- |
| Asset licenses vs. browser builds | Web builds ship assets in downloadable form. Check every paid license allows that before buying; prefer CC0. | Before any purchase |
| Asset storage | Keep large assets in Cloudflare R2 (free tier), with only references in git. | Week 6 |
| API budget | The game's advisor calls bill your Anthropic API key. Set a small playtest budget and a hard daily spend cap. | Week 2 |
| Gateway protection | Session tokens, Cloudflare Turnstile, and per-session and daily limits so nobody can burn your API credit. | Week 2 |
| Crash recovery | Autosave the seed and command log so a closed tab can resume the run. Nearly free with the replay system. | Weeks 9–10 |
| Playtest distribution | Private, password-protected browser builds on itch.io; the event log doubles as playtest analytics. | Weeks 8–9 |
| Names and likenesses | Military designations and generic classes only ("MH-60 class"), never manufacturer names or trademarks. | Always |

### Settled

- **Time:** the shipped game is real time with no pause. Pause and 2x exist only as developer tools.
- **Tone:** visceral and mature (see the overview), within firm lines.

## Sources

- [Marine Corps releases roadmap for infantry in drone-covered world](https://taskandpurpose.com/news/marine-air-defenses-squads/), Task & Purpose, Aug 2026
