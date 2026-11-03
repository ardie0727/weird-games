"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isMuted, onMuteChange, setMuted } from "@/lib/client/sound";
import { load, save } from "@/lib/client/storage";
import {
  AREAS,
  CARD,
  ENEMY,
  EVENT,
  HEROES,
  HERO_ORDER,
  LEVEL_PERKS,
  META_UPGRADES,
  SNACK,
  SPRING_CLEANING,
  STATUS,
  TRINKET,
  viewCard,
  type CardInst,
  type HeroId,
  type MoveDef,
  type StatusId,
} from "@/lib/dtc/data";
import {
  COLS,
  ROWS,
  abandonRun,
  alive,
  applyRunToMeta,
  buy,
  buyMeta,
  campRest,
  campUpgrade,
  canPlay,
  cancelPick,
  cardCost,
  chooseEvent,
  chooseNode,
  choosePerk,
  discardSnack,
  discount,
  endTurn,
  enemyStep,
  energyPerTurn,
  eventChoiceOk,
  finishReward,
  heroCrit,
  leaveCamp,
  leaveEvent,
  leaveShop,
  leaveTreasure,
  metaCost,
  moveDamage,
  moveOf,
  needsTarget,
  newMeta,
  newRun,
  pickCard,
  pickableCards,
  playCard,
  reachable,
  restHeal,
  shopRemove,
  takeBossTrinket,
  takeCard,
  takeCrumbs,
  takeRewardSnack,
  takeRewardTrinket,
  takeTreasure,
  totalFloor,
  unlockHero,
  useSnack,
  xpProgress,
  type Combat,
  type Enemy,
  type FxEvent,
  type MapNode,
  type Meta,
  type Run,
  type Statuses,
} from "@/lib/dtc/engine";
import { sfx, unlockAudio } from "@/lib/dtc/sound";
import { AreaBg, ArtDefs, DrawerBg, Sprite } from "./art";

const RUN_KEY = "dtc.run";
const META_KEY = "dtc.meta";

type View = "drawer" | "select" | "run" | "help";
type Act = (fn: (r: Run) => void) => void;
interface Info {
  title: string;
  body: ReactNode;
}
type ShowInfo = (i: Info | null) => void;

// ------------------------------------------------------------------ root

export function DownTheCouch() {
  const [ready, setReady] = useState(false);
  const [meta, setMetaState] = useState<Meta>(newMeta());
  const [run, setRun] = useState<Run | null>(null);
  const [view, setView] = useState<View>("drawer");
  const [muted, setMutedState] = useState(false);
  const runRef = useRef<Run | null>(null);

  useEffect(() => {
    const m = load<Meta>(META_KEY, newMeta());
    setMetaState({ ...newMeta(), ...m });
    const r = load<Run | null>(RUN_KEY, null);
    if (r && r.v === 1 && r.map?.length) {
      runRef.current = r;
      setRun(r);
    }
    setMutedState(isMuted());
    setReady(true);
    const off = onMuteChange(setMutedState);
    return () => {
      off();
    };
  }, []);

  const setMeta = useCallback((m: Meta) => {
    setMetaState(m);
    save(META_KEY, m);
  }, []);

  const act: Act = useCallback((fn) => {
    const cur = runRef.current;
    if (!cur) return;
    const r = structuredClone(cur);
    fn(r);
    runRef.current = r;
    setRun(r);
    save(RUN_KEY, r);
  }, []);

  const startRun = (hero: HeroId, asc: number) => {
    unlockAudio();
    const r = newRun(hero, asc, meta, (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0);
    runRef.current = r;
    setRun(r);
    save(RUN_KEY, r);
    setView("run");
    sfx("turn");
  };

  const endRunToDrawer = () => {
    const r = runRef.current;
    if (r && (r.screen === "over" || r.screen === "victory")) setMeta(applyRunToMeta(r, meta));
    runRef.current = null;
    setRun(null);
    save(RUN_KEY, null);
    setView("drawer");
  };

  const toggleMute = () => setMuted(!muted);

  return (
    <div className="dtc-root">
      <ArtDefs />
      {!ready ? (
        <div className="dtc-loading">Digging through the couch…</div>
      ) : view === "run" && run ? (
        <RunView run={run} act={act} onExit={() => setView("drawer")} onFinish={endRunToDrawer} muted={muted} toggleMute={toggleMute} />
      ) : view === "select" ? (
        <HeroSelect meta={meta} setMeta={setMeta} onBack={() => setView("drawer")} onStart={startRun} />
      ) : view === "help" ? (
        <Help onBack={() => setView("drawer")} />
      ) : (
        <Drawer
          meta={meta}
          setMeta={setMeta}
          run={run}
          onContinue={() => {
            unlockAudio();
            setView("run");
          }}
          onNew={() => setView("select")}
          onHelp={() => setView("help")}
          muted={muted}
          toggleMute={toggleMute}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ hub

function Drawer({
  meta,
  setMeta,
  run,
  onContinue,
  onNew,
  onHelp,
  muted,
  toggleMute,
}: {
  meta: Meta;
  setMeta: (m: Meta) => void;
  run: Run | null;
  onContinue: () => void;
  onNew: () => void;
  onHelp: () => void;
  muted: boolean;
  toggleMute: () => void;
}) {
  return (
    <div className="dtc-page">
      <DrawerBg />
      <div className="dtc-page-inner">
        <div className="dtc-row-between">
          <Link href="/" className="dtc-link">
            ← Weird Games
          </Link>
          <button className="dtc-icon-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
        <header className="dtc-hero-head">
          <div className="dtc-title-sprites" aria-hidden>
            {HERO_ORDER.map((h, i) => (
              <div key={h} className="dtc-bob" style={{ animationDelay: `${-i * 0.5}s` }}>
                <Sprite id={h} />
              </div>
            ))}
          </div>
          <h1 className="dtc-title">Down the Couch</h1>
          <p className="dtc-sub">You fell into the sofa. Fight your way down through the world of lost things and escape before the Vacuum comes.</p>
        </header>

        <div className="dtc-menu">
          {run && run.screen !== "over" && run.screen !== "victory" ? (
            <button className="dtc-btn dtc-btn-big" onClick={onContinue}>
              ▶ Continue run
              <small>
                {HEROES[run.hero].name} · {AREAS[run.area].name} · floor {totalFloor(run)}
              </small>
            </button>
          ) : run ? (
            <button className="dtc-btn dtc-btn-big" onClick={onContinue}>
              See how your last run ended
            </button>
          ) : null}
          <button className={`dtc-btn ${run ? "dtc-btn-ghost" : "dtc-btn-big"}`} onClick={onNew} disabled={!!run}>
            {run ? "Finish your current run to start a new one" : "▶ New run"}
          </button>
          <button className="dtc-btn dtc-btn-ghost" onClick={onHelp}>
            How to play
          </button>
        </div>

        <section className="dtc-panel">
          <div className="dtc-row-between">
            <h2 className="dtc-h2">The Junk Drawer</h2>
            <div className="dtc-lint" title="Lint">
              ☁️ {meta.lint} lint
            </div>
          </div>
          <p className="dtc-muted">Lint you collect on every run, win or lose, is spent here on permanent upgrades.</p>
          <div className="dtc-upgrades">
            {META_UPGRADES.map((u) => {
              const lvl = meta.up[u.id] ?? 0;
              const cost = metaCost(meta, u.id);
              return (
                <div key={u.id} className="dtc-upgrade">
                  <div className="dtc-upgrade-icon">{u.icon}</div>
                  <div className="dtc-upgrade-body">
                    <b>
                      {u.name}{" "}
                      {u.costs.length > 1 && (
                        <span className="dtc-pips">
                          {u.costs.map((_, i) => (
                            <i key={i} className={i < lvl ? "on" : ""} />
                          ))}
                        </span>
                      )}
                    </b>
                    <span>{u.desc}</span>
                  </div>
                  {cost === null ? (
                    <span className="dtc-owned">Owned</span>
                  ) : (
                    <button
                      className="dtc-btn dtc-btn-small"
                      disabled={meta.lint < cost}
                      onClick={() => {
                        const m = buyMeta(meta, u.id);
                        if (m) {
                          setMeta(m);
                          sfx("buy");
                        }
                      }}
                    >
                      ☁️ {cost}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="dtc-panel dtc-stats">
          <div>
            <b>{meta.runs}</b>
            <span>runs</span>
          </div>
          <div>
            <b>{meta.wins}</b>
            <span>escapes</span>
          </div>
          <div>
            <b>{meta.bestFloor}</b>
            <span>best floor</span>
          </div>
          <div>
            <b>{meta.asc}</b>
            <span>Spring Cleaning</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Help({ onBack }: { onBack: () => void }) {
  return (
    <div className="dtc-page">
      <DrawerBg />
      <div className="dtc-page-inner">
        <button className="dtc-link" onClick={onBack}>
          ← Back
        </button>
        <h1 className="dtc-title dtc-title-sm">How to play</h1>
        <div className="dtc-panel dtc-help">
          <h3>The run</h3>
          <p>
            Pick a path on the map through 4 areas: The Cushions, The Springs, The Underfloor and The Drain. Each area ends with a boss. Beat the Vacuum at the
            bottom of the Drain to escape.
          </p>
          <h3>Fights</h3>
          <p>
            You get 3 energy and draw 5 cards each turn. Cards cost energy, shown in the top-left corner. Tap a card to pick it up, then tap an enemy (or tap the
            card again if it doesn't need a target). Above each enemy you can see what it will do next, so block when a big hit is coming.
          </p>
          <p>Block soaks up damage and disappears at the start of your next turn. Your HP carries over between fights.</p>
          <h3>Getting stronger</h3>
          <p>
            Win fights to earn crumbs, new cards and XP. Each level gives you a perk. Trinkets give passive bonuses for the rest of the run. Snacks are one-time
            items: tap one in the top bar to use it.
          </p>
          <h3>Map icons</h3>
          <ul className="dtc-legend">
            <li>⚔️ Fight</li>
            <li>👹 Elite (tough, drops a trinket)</li>
            <li>❓ Something unknown</li>
            <li>🛒 Shop</li>
            <li>🔥 Lint campfire (rest or upgrade a card)</li>
            <li>👛 Treasure</li>
          </ul>
          <h3>Laptop controls</h3>
          <p>Keys 1 to 9 pick a card, ← and → pick a target, Enter or Space plays it, E ends your turn, Esc cancels.</p>
          <h3>Between runs</h3>
          <p>
            Every run earns lint, even when you lose. Spend it in the Junk Drawer to unlock heroes and permanent upgrades. Escape once to unlock Spring Cleaning,
            harder levels for more lint.
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroSelect({ meta, setMeta, onBack, onStart }: { meta: Meta; setMeta: (m: Meta) => void; onBack: () => void; onStart: (h: HeroId, asc: number) => void }) {
  const [hero, setHero] = useState<HeroId>("penny");
  const [asc, setAsc] = useState(0);
  const h = HEROES[hero];
  const unlocked = meta.unlocked.includes(hero);
  const counts = h.starter.reduce<Record<string, number>>((a, id) => ((a[id] = (a[id] ?? 0) + 1), a), {});
  return (
    <div className="dtc-page">
      <DrawerBg />
      <div className="dtc-page-inner">
        <div className="dtc-row-between">
          <button className="dtc-link" onClick={onBack}>
            ← Junk Drawer
          </button>
          <div className="dtc-lint">☁️ {meta.lint} lint</div>
        </div>
        <h1 className="dtc-title dtc-title-sm">Who fell in?</h1>
        <div className="dtc-hero-tabs" role="tablist">
          {HERO_ORDER.map((id) => {
            const ok = meta.unlocked.includes(id);
            return (
              <button key={id} role="tab" aria-selected={hero === id} className={`dtc-hero-tab ${hero === id ? "on" : ""} ${ok ? "" : "locked"}`} onClick={() => setHero(id)}>
                <Sprite id={id} />
                <span>{HEROES[id].name}</span>
                {!ok && <em>🔒</em>}
              </button>
            );
          })}
        </div>
        <div className="dtc-panel dtc-hero-card" style={{ ["--hc" as string]: h.color }}>
          <div className="dtc-hero-big dtc-bob">
            <Sprite id={hero} />
          </div>
          <div className="dtc-hero-info">
            <div className="dtc-eyebrow">{h.role}</div>
            <h2 className="dtc-h2">{h.name}</h2>
            <p className="dtc-muted">{h.blurb}</p>
            <div className="dtc-kv">
              <span>❤️ {h.maxHp + 5 * (meta.up.stuffing ?? 0)} HP</span>
            </div>
            <p>
              <b>{h.passiveName}:</b> {h.passive}
            </p>
            <div className="dtc-starter">
              {Object.entries(counts).map(([id, n]) => (
                <span key={id}>
                  {n}× {CARD[id].name}
                </span>
              ))}
            </div>
          </div>
        </div>
        {meta.asc > 0 && (
          <div className="dtc-panel">
            <h3 className="dtc-h3">Spring Cleaning level</h3>
            <div className="dtc-asc">
              {Array.from({ length: meta.asc + 1 }, (_, i) => (
                <button key={i} className={`dtc-chip ${asc === i ? "on" : ""}`} onClick={() => setAsc(i)}>
                  {i === 0 ? "Off" : i}
                </button>
              ))}
            </div>
            <p className="dtc-muted">
              {asc === 0 ? "Normal difficulty." : SPRING_CLEANING.slice(1, asc + 1).join(" ")} {asc > 0 && `Lint ×${(1 + asc * 0.1).toFixed(1)}.`}
            </p>
          </div>
        )}
        {unlocked ? (
          <button className="dtc-btn dtc-btn-big" onClick={() => onStart(hero, asc)}>
            ▶ Fall in as {h.name}
          </button>
        ) : (
          <button
            className="dtc-btn dtc-btn-big"
            disabled={meta.lint < h.unlockCost}
            onClick={() => {
              const m = unlockHero(meta, hero);
              if (m) {
                setMeta(m);
                sfx("level");
              }
            }}
          >
            🔓 Unlock {h.name} for ☁️ {h.unlockCost} lint
          </button>
        )}
        {!unlocked && meta.lint < h.unlockCost && <p className="dtc-muted dtc-center">Play runs to collect lint. Every run counts, even short ones.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ run

function RunView({ run, act, onExit, onFinish, muted, toggleMute }: { run: Run; act: Act; onExit: () => void; onFinish: () => void; muted: boolean; toggleMute: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [shown, setShown] = useState(run.screen);
  const [snackSel, setSnackSel] = useState<number | null>(null);

  useEffect(() => {
    if (run.screen === shown) return;
    if (shown === "combat" && run.combat) {
      const won = run.combat.phase === "won";
      const t = setTimeout(() => {
        setShown(run.screen);
        if (run.screen === "over") sfx("lose");
        else if (won) sfx("win");
      }, 900);
      return () => clearTimeout(t);
    }
    setShown(run.screen);
    if (run.screen === "levelup") sfx("level");
    if (run.screen === "victory") sfx("win");
    if (run.screen === "over") sfx("lose");
  }, [run.screen, shown, run.combat]);

  const screen = shown;
  const showInfo: ShowInfo = setInfo;

  return (
    <div className={`dtc-run area-${run.area}`}>
      <TopBar run={run} showInfo={showInfo} onExit={onExit} act={act} muted={muted} toggleMute={toggleMute} snackSel={snackSel} setSnackSel={setSnackSel} />
      <div className="dtc-screen">
        {screen === "combat" && run.combat && <CombatView key={run.floor} run={run} act={act} showInfo={showInfo} snackSel={snackSel} setSnackSel={setSnackSel} />}
        {screen === "map" && <MapView run={run} act={act} />}
        {screen === "reward" && run.reward && <RewardView run={run} act={act} showInfo={showInfo} />}
        {screen === "shop" && run.shop && <ShopView run={run} act={act} showInfo={showInfo} />}
        {screen === "camp" && <CampView run={run} act={act} />}
        {screen === "event" && run.event && <EventView run={run} act={act} />}
        {screen === "treasure" && run.treasure && <TreasureView run={run} act={act} />}
        {screen === "levelup" && run.levelChoices && <LevelUpView run={run} act={act} />}
        {screen === "pick" && run.pick && <PickView run={run} act={act} />}
        {(screen === "over" || screen === "victory") && <EndView run={run} onFinish={onFinish} />}
      </div>
      {info && <InfoSheet info={info} onClose={() => setInfo(null)} />}
    </div>
  );
}

function TopBar({
  run,
  showInfo,
  onExit,
  act,
  muted,
  toggleMute,
  snackSel,
  setSnackSel,
}: {
  run: Run;
  showInfo: ShowInfo;
  onExit: () => void;
  act: Act;
  muted: boolean;
  toggleMute: () => void;
  snackSel: number | null;
  setSnackSel: (n: number | null) => void;
}) {
  const xp = xpProgress(run);
  const inCombat = run.screen === "combat" && run.combat?.phase === "player";
  const openSnack = (i: number) => {
    const id = run.snacks[i];
    if (!id) return;
    const s = SNACK[id];
    const usable = inCombat || id === "gummy";
    showInfo({
      title: `${s.icon} ${s.name}`,
      body: (
        <>
          <p>{s.desc}</p>
          <div className="dtc-row">
            {usable && (
              <button
                className="dtc-btn"
                onClick={() => {
                  showInfo(null);
                  if (s.target === "enemy" && run.combat && alive(run.combat).length > 1) {
                    setSnackSel(i);
                    return;
                  }
                  act((r) => {
                    useSnack(r, i);
                  });
                  sfx(id === "gummy" ? "heal" : "card");
                }}
              >
                Use it
              </button>
            )}
            <button
              className="dtc-btn dtc-btn-ghost"
              onClick={() => {
                showInfo(null);
                act((r) => discardSnack(r, i));
              }}
            >
              Throw away
            </button>
          </div>
          {!usable && <p className="dtc-muted">Snacks can be used during your turn in a fight.</p>}
        </>
      ),
    });
  };
  const openMenu = () =>
    showInfo({
      title: "Paused",
      body: (
        <div className="dtc-col">
          <button
            className="dtc-btn"
            onClick={() => {
              showInfo(null);
              onExit();
            }}
          >
            Save and go to the Junk Drawer
          </button>
          <button className="dtc-btn dtc-btn-ghost" onClick={toggleMute}>
            Sound: {muted ? "off" : "on"}
          </button>
          <ConfirmButton
            label="Give up this run"
            confirm="Tap again to give up"
            onConfirm={() => {
              showInfo(null);
              act((r) => abandonRun(r));
            }}
          />
        </div>
      ),
    });
  const openDeck = () =>
    showInfo({
      title: `Your deck (${run.deck.length} cards)`,
      body: (
        <div className="dtc-deckgrid">
          {sortDeck(run.deck).map((c) => (
            <CardFace key={c.uid} ci={c} />
          ))}
        </div>
      ),
    });
  const openTrinket = (id: string) => {
    const t = TRINKET[id];
    showInfo({ title: `${t.icon} ${t.name}`, body: <p>{t.desc}</p> });
  };
  const hpPct = Math.max(0, (run.hp / run.maxHp) * 100);
  return (
    <div className="dtc-topbar">
      <div className="dtc-topbar-row">
        <button className="dtc-hp" onClick={() => showInfo({ title: HEROES[run.hero].name, body: <HeroInfo run={run} /> })} aria-label="Hero info">
          <span className="dtc-hp-face">
            <Sprite id={run.hero} />
          </span>
          <span className="dtc-hp-bar">
            <i style={{ width: `${hpPct}%` }} />
            <b>
              {run.hp}/{run.maxHp}
            </b>
          </span>
        </button>
        <span className="dtc-pill" title="Crumbs">
          🍪 {run.crumbs}
        </span>
        <span className="dtc-pill dtc-lv" title={`XP ${xp.into}/${xp.need}`}>
          Lv {run.level}
          <span className="dtc-xp">
            <i style={{ width: `${Math.min(100, (xp.into / xp.need) * 100)}%` }} />
          </span>
        </span>
        <span className="dtc-pill dtc-area-pill">
          {AREAS[run.area].short} {run.pos ? run.pos.row + 1 : 0}/{ROWS + 1}
        </span>
        <span className="dtc-spacer" />
        <button className="dtc-icon-btn" onClick={openDeck} aria-label="View deck">
          🂠<small>{run.deck.length}</small>
        </button>
        <button className="dtc-icon-btn" onClick={openMenu} aria-label="Menu">
          ☰
        </button>
      </div>
      <div className="dtc-topbar-row dtc-topbar-items">
        <div className="dtc-snacks">
          {run.snacks.map((s, i) => (
            <button key={i} className={`dtc-snack ${s ? "" : "empty"} ${snackSel === i ? "sel" : ""}`} onClick={() => openSnack(i)} disabled={!s} aria-label={s ? SNACK[s].name : "Empty snack slot"}>
              {s ? SNACK[s].icon : ""}
            </button>
          ))}
        </div>
        <div className="dtc-trinkets">
          {run.trinkets.map((t) => (
            <button key={t} className="dtc-trinket" onClick={() => openTrinket(t)} aria-label={TRINKET[t].name} title={TRINKET[t].name}>
              {TRINKET[t].icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroInfo({ run }: { run: Run }) {
  const h = HEROES[run.hero];
  return (
    <>
      <p>
        <b>{h.passiveName}:</b> {h.passive}
      </p>
      <p className="dtc-muted">
        Energy per turn: {energyPerTurn(run)} · Crit chance: {Math.round(heroCrit(run) * 100)}% · Level {run.level}
      </p>
      {run.combat && <StatusList st={run.combat.st} />}
    </>
  );
}

function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={`dtc-btn ${armed ? "dtc-btn-danger" : "dtc-btn-ghost"}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirm : label}
    </button>
  );
}

function InfoSheet({ info, onClose }: { info: Info; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="dtc-sheet-wrap" onClick={onClose}>
      <div className="dtc-sheet" role="dialog" aria-label={info.title} onClick={(e) => e.stopPropagation()}>
        <div className="dtc-row-between">
          <h3 className="dtc-h3">{info.title}</h3>
          <button className="dtc-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="dtc-sheet-body">{info.body}</div>
      </div>
    </div>
  );
}

function sortDeck(deck: CardInst[]) {
  const order = { attack: 0, skill: 1, power: 2, curse: 3 };
  return [...deck].sort((a, b) => order[CARD[a.id].type] - order[CARD[b.id].type] || CARD[a.id].name.localeCompare(CARD[b.id].name));
}

// ------------------------------------------------------------------ cards

const CARD_ICON: Record<string, string> = {
  flip: "🪙",
  "coin-toss": "🪙",
  "lucky-toss": "🍀",
  "four-leaf": "🍀",
  jackpot: "🎰",
  "roll-dice": "🎲",
  "all-in": "💰",
  "needle-jab": "🪡",
  "thread-lash": "🧵",
  "hem-slam": "🧵",
  "iron-thread": "🧵",
  "prickly-pins": "📌",
  "shield-bash": "🛡️",
  jab: "🗝️",
  "skeleton-key": "🗝️",
  unlock: "🔓",
  "master-key": "🔓",
  "turn-lock": "🔐",
  "rust-away": "🟤",
  "rust-trail": "🟤",
  corrode: "🟤",
  jingle: "🔔",
  strum: "🎸",
  riff: "🎸",
  "power-chord": "🎸",
  shred: "🔥",
  "stage-dive": "🤘",
  "mosh-pit": "🤘",
  metronome: "🎵",
  encore: "🔁",
  solo: "🎤",
  hype: "📣",
  feedback: "📢",
  "sound-check": "🎚️",
  "static-shock": "⚡",
  ricochet: "↯",
  "pocket-lint": "☁️",
  "sugar-rush": "🍬",
  scavenge: "🔍",
  "snack-break": "🍪",
  "dust-cloud": "🌫️",
  "double-down": "✖️",
  "hot-streak": "🔥",
  "copper-plating": "🪙",
  "lined-pockets": "👖",
  "open-sesame": "🚪",
  "copy-key": "📋",
  sticky: "🍯",
  "crumb-mess": "🥨",
};

function cardIcon(ci: CardInst) {
  const d = CARD[ci.id];
  if (CARD_ICON[d.id]) return CARD_ICON[d.id];
  if (d.type === "power") return "⭐";
  if (d.type === "attack") return "💥";
  if (d.fx.some((f) => f.k === "block")) return "🛡️";
  if (d.fx.some((f) => f.k === "draw")) return "🃏";
  return "✨";
}

function CardFace({
  ci,
  cost,
  selected,
  disabled,
  onClick,
  style,
  hint,
}: {
  ci: CardInst;
  cost?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  hint?: string;
}) {
  const v = viewCard(ci);
  const c = cost ?? v.cost;
  const type = v.def.type;
  const body = (
    <>
      <span className={`dtc-card-cost ${cost !== undefined && cost > v.cost ? "up" : cost !== undefined && cost < v.cost ? "down" : ""}`}>{c < 0 ? "–" : c}</span>
      <span className="dtc-card-name">{v.name}</span>
      <span className="dtc-card-art">{cardIcon(ci)}</span>
      <span className="dtc-card-type">{type === "curse" ? "Curse" : type[0].toUpperCase() + type.slice(1)}</span>
      <span className="dtc-card-text">{v.text}</span>
      {hint && <span className="dtc-card-hint">{hint}</span>}
    </>
  );
  const cls = `dtc-card t-${type} r-${v.def.rarity} ${ci.up ? "up" : ""} ${selected ? "sel" : ""} ${disabled ? "dis" : ""}`;
  return onClick ? (
    <button className={cls} onClick={onClick} style={style} aria-pressed={selected} aria-label={`${v.name}, costs ${c}. ${v.text}`}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

// ------------------------------------------------------------------ combat

interface Floater {
  id: number;
  who: "hero" | number;
  text: string;
  cls: string;
}

function intentLabel(run: Run, e: Enemy, m: MoveDef): { icon: string; text: string } {
  const d = moveDamage(run, e, m);
  const dmg = d ? `${d.dmg}${d.hits > 1 ? `×${d.hits}` : ""}` : "";
  switch (m.intent) {
    case "atk":
      return { icon: "🗡️", text: dmg };
    case "atkdef":
      return { icon: "🗡️🛡️", text: dmg };
    case "atkdebuff":
      return { icon: "🗡️🌀", text: dmg };
    case "def":
      return { icon: "🛡️", text: "" };
    case "buff":
      return { icon: "💪", text: "" };
    case "debuff":
      return { icon: "🌀", text: "" };
    case "summon":
      return { icon: "📯", text: "" };
    case "charge":
      return { icon: "⚠️", text: "" };
    case "heal":
      return { icon: "💚", text: "" };
    default:
      return { icon: "❔", text: "" };
  }
}

function intentDesc(run: Run, e: Enemy, m: MoveDef): string {
  const parts: string[] = [];
  const d = moveDamage(run, e, m);
  if (d) parts.push(`attack for ${d.dmg}${d.hits > 1 ? ` × ${d.hits}` : ""}`);
  if (m.block) parts.push(`gain ${m.block} block`);
  for (const [s, n] of m.self ?? []) parts.push(`gain ${n} ${STATUS[s].name}`);
  for (const [s, n] of m.hero ?? []) parts.push(`give you ${n} ${STATUS[s].name}`);
  if (m.summon) parts.push("call for help");
  if (m.special === "rewind") parts.push("rewind and heal");
  if (m.special === "explode") parts.push("explode");
  if (m.special === "steal") parts.push("steal crumbs");
  if (m.addCard) parts.push(`add ${CARD[m.addCard].name} to your discard pile`);
  if (m.intent === "charge" && !parts.length) parts.push("get ready for something big");
  return `${m.name}: will ${parts.join(", ") || "do something"}.`;
}

function StatusList({ st, small }: { st: Statuses; small?: boolean }) {
  const entries = Object.entries(st).filter(([, n]) => n && n > 0) as [StatusId, number][];
  if (!entries.length) return null;
  if (small)
    return (
      <div className="dtc-st">
        {entries.map(([s, n]) => (
          <span key={s} className={STATUS[s].good ? "good" : "bad"} title={`${STATUS[s].name}: ${STATUS[s].desc(n)}`}>
            {STATUS[s].icon}
            {s === "double" || s === "keepall" || s === "split" ? "" : n}
          </span>
        ))}
      </div>
    );
  return (
    <ul className="dtc-st-list">
      {entries.map(([s, n]) => (
        <li key={s}>
          <span>{STATUS[s].icon}</span>
          <b>
            {STATUS[s].name}
            {s === "double" || s === "keepall" || s === "split" ? "" : ` ${n}`}
          </b>
          : {STATUS[s].desc(n)}
        </li>
      ))}
    </ul>
  );
}

function HpBar({ hp, max, block }: { hp: number; max: number; block: number }) {
  return (
    <div className={`dtc-unit-hp ${block ? "blocked" : ""}`}>
      <i style={{ width: `${Math.max(0, (hp / max) * 100)}%` }} />
      <b>
        {Math.max(0, hp)}/{max}
      </b>
      {block > 0 && <em>🛡️{block}</em>}
    </div>
  );
}

function CombatView({ run, act, showInfo, snackSel, setSnackSel }: { run: Run; act: Act; showInfo: ShowInfo; snackSel: number | null; setSnackSel: (n: number | null) => void }) {
  const c = run.combat as Combat;
  const [sel, setSel] = useState<number | null>(null);
  const [tgt, setTgt] = useState<number | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [hurt, setHurt] = useState<Record<string, number>>({});
  const [lunge, setLunge] = useState<Record<string, number>>({});
  const seen = useRef(c.seq);
  const fid = useRef(0);
  const handRef = useRef<HTMLDivElement>(null);
  const [handW, setHandW] = useState(360);

  const living = alive(c);
  const player = c.phase === "player";
  const selCard = sel !== null ? c.hand.find((h) => h.uid === sel) ?? null : null;
  const targeting = (selCard && needsTarget(selCard) && living.length > 1) || snackSel !== null;

  // play fx
  useEffect(() => {
    const fresh = c.fx.filter((f) => f.seq > seen.current);
    if (!fresh.length) return;
    seen.current = c.seq;
    const add: Floater[] = [];
    const hurtNow: Record<string, number> = {};
    const lungeNow: Record<string, number> = {};
    let sound: Parameters<typeof sfx>[0] | null = null;
    fresh.forEach((f: FxEvent) => {
      const key = String(f.who);
      const push = (text: string, cls: string) => add.push({ id: ++fid.current, who: f.who, text, cls });
      switch (f.kind) {
        case "dmg":
          push(`-${f.n}`, f.who === "hero" ? "hurt" : "dmg");
          hurtNow[key] = Date.now();
          sound = f.who === "hero" ? "hurt" : sound ?? "hit";
          break;
        case "crit":
          push(`-${f.n}!`, "crit");
          hurtNow[key] = Date.now();
          sound = "crit";
          break;
        case "block":
          push(`+${f.n}🛡️`, "block");
          sound = sound ?? "block";
          break;
        case "heal":
          if (f.n) push(`+${f.n}`, "heal");
          sound = sound ?? "heal";
          break;
        case "status":
          if (f.text) push(`${(f.n ?? 0) > 0 ? "+" : ""}${f.n} ${f.text}`, "status");
          break;
        case "text":
          push(f.n !== undefined && f.text !== "blocked" ? `${f.text === "crumbs" ? "+" : ""}${f.n} ${f.text}` : f.text === "blocked" ? `🛡️ ${f.n}` : f.text ?? "", f.text === "blocked" ? "block" : "text");
          break;
        case "die":
          sound = "die";
          break;
        case "atk":
          lungeNow[key] = Date.now();
          if (f.text) push(f.text, "move");
          break;
        case "card":
          sound = sound ?? "card";
          break;
        case "summon":
          sound = sound ?? "debuff";
          break;
      }
    });
    if (sound) sfx(sound);
    if (add.length) {
      // stagger multiple floaters on the same unit
      const perWho: Record<string, number> = {};
      const staged = add.map((a) => {
        const k = String(a.who);
        perWho[k] = (perWho[k] ?? 0) + 1;
        return { ...a, cls: `${a.cls} d${Math.min(4, perWho[k] - 1)}` };
      });
      setFloaters((fl) => [...fl.slice(-30), ...staged]);
      const ids = new Set(staged.map((s) => s.id));
      setTimeout(() => setFloaters((fl) => fl.filter((x) => !ids.has(x.id))), 1500);
    }
    if (Object.keys(hurtNow).length) setHurt((h) => ({ ...h, ...hurtNow }));
    if (Object.keys(lungeNow).length) setLunge((h) => ({ ...h, ...lungeNow }));
  }, [c.seq, c.fx]);

  // enemy turn driver
  useEffect(() => {
    if (c.phase !== "enemy") return;
    const t = setTimeout(() => act((r) => void enemyStep(r)), c.enemyIdx === 0 ? 450 : 620);
    return () => clearTimeout(t);
  }, [c.phase, c.enemyIdx, c.turn, act]);

  useEffect(() => {
    if (c.phase === "player") sfx("turn");
  }, [c.turn, c.phase]);

  // keep selection valid
  useEffect(() => {
    if (sel !== null && !c.hand.some((h) => h.uid === sel)) setSel(null);
    if (tgt !== null && !living.some((e) => e.uid === tgt)) setTgt(null);
  }, [c.hand, sel, tgt, living]);

  useLayoutEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHandW(el.clientWidth));
    ro.observe(el);
    setHandW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const play = useCallback(
    (uid: number, target?: number) => {
      const ci = c.hand.find((h) => h.uid === uid);
      if (!ci || !canPlay(run, ci)) return;
      act((r) => {
        playCard(r, uid, target);
      });
      if (CARD[ci.id].type === "attack") setLunge((h) => ({ ...h, hero: Date.now() }));
      setSel(null);
    },
    [act, c.hand, run],
  );

  const tapCard = (ci: CardInst) => {
    if (!player) return;
    setSnackSel(null);
    if (!canPlay(run, ci)) {
      setSel(ci.uid === sel ? null : ci.uid);
      return;
    }
    if (sel === ci.uid) {
      if (needsTarget(ci) && living.length > 1) {
        const t = tgt ?? null;
        if (t !== null) play(ci.uid, t);
        return;
      }
      play(ci.uid, living[0]?.uid);
      return;
    }
    setSel(ci.uid);
  };

  const tapEnemy = (e: Enemy) => {
    if (snackSel !== null) {
      const slot = snackSel;
      setSnackSel(null);
      act((r) => {
        useSnack(r, slot, e.uid);
      });
      return;
    }
    if (selCard && player) {
      if (needsTarget(selCard)) {
        play(selCard.uid, e.uid);
        return;
      }
      if (canPlay(run, selCard)) {
        play(selCard.uid, e.uid);
        return;
      }
    }
    const d = ENEMY[e.id];
    const m = moveOf(e);
    showInfo({
      title: d.name,
      body: (
        <>
          <p>{d.desc}</p>
          {m && <p className="dtc-intent-desc">Next: {intentDesc(run, e, m)}</p>}
          <StatusList st={e.st} />
        </>
      ),
    });
  };

  const doEnd = () => {
    if (!player) return;
    setSel(null);
    setSnackSel(null);
    act((r) => {
      endTurn(r);
    });
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (document.querySelector(".dtc-sheet-wrap")) return;
      const k = e.key;
      if (/^[1-9]$/.test(k)) {
        const ci = c.hand[Number(k) - 1];
        if (ci) {
          e.preventDefault();
          if (sel === ci.uid) tapCard(ci);
          else setSel(ci.uid);
        }
      } else if (k === "ArrowLeft" || k === "ArrowRight") {
        if (!living.length) return;
        e.preventDefault();
        const i = Math.max(0, living.findIndex((x) => x.uid === tgt));
        const n = (i + (k === "ArrowRight" ? 1 : -1) + living.length) % living.length;
        setTgt(living[n].uid);
      } else if (k === "Enter" || k === " ") {
        if (selCard) {
          e.preventDefault();
          play(selCard.uid, tgt ?? living[0]?.uid);
        }
      } else if (k === "e" || k === "E") {
        doEnd();
      } else if (k === "Escape") {
        setSel(null);
        setSnackSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const n = c.hand.length;
  const cardW = handW < 520 ? 92 : 124;
  const overlap = n > 1 ? Math.min(cardW * 0.08, (handW - 24 - n * cardW) / (n - 1)) : 0;
  const isBoss = c.kind === "boss";

  return (
    <div className={`dtc-combat ${targeting ? "targeting" : ""}`}>
      <div className="dtc-scene">
        <AreaBg area={run.area} />
        <Dust />
        {isBoss && c.turn <= 1 && player && <div className="dtc-boss-banner">{ENEMY[c.enemies[0].id].name}</div>}
        <div className="dtc-units">
          <div className="dtc-enemies">
            {c.enemies.map((e) => {
              if (e.dead) {
                return (
                  <div key={e.uid} className="dtc-unit dead" style={{ ["--sz" as string]: ENEMY[e.id].size ?? 1 }}>
                    <div className="dtc-unit-sprite">
                      <Sprite id={e.id} />
                    </div>
                  </div>
                );
              }
              const m = moveOf(e);
              const il = m ? intentLabel(run, e, m) : null;
              const key = String(e.uid);
              return (
                <button
                  key={e.uid}
                  className={`dtc-unit enemy ${tgt === e.uid ? "tgt" : ""} ${hurt[key] && Date.now() - hurt[key] < 400 ? "hit" : ""}`}
                  style={{ ["--sz" as string]: ENEMY[e.id].size ?? 1 }}
                  onClick={() => tapEnemy(e)}
                  onMouseEnter={() => setTgt(e.uid)}
                  aria-label={`${ENEMY[e.id].name}, ${e.hp} of ${e.maxHp} HP${m ? `. ${intentDesc(run, e, m)}` : ""}`}
                >
                  {il && m && (
                    <span className={`dtc-intent i-${m.intent}`}>
                      <span>{il.icon}</span>
                      {il.text && <b>{il.text}</b>}
                    </span>
                  )}
                  <span className="dtc-unit-sprite" key={lunge[key] ?? 0} data-lunge={lunge[key] ? "l" : ""}>
                    <span className="dtc-bob" style={{ animationDelay: `${-(e.uid % 5) * 0.4}s` }}>
                      <Sprite id={e.id} />
                    </span>
                  </span>
                  <HpBar hp={e.hp} max={e.maxHp} block={e.block} />
                  <StatusList st={e.st} small />
                  <span className="dtc-floaters">
                    {floaters
                      .filter((f) => f.who === e.uid)
                      .map((f) => (
                        <span key={f.id} className={`dtc-float ${f.cls}`}>
                          {f.text}
                        </span>
                      ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="dtc-heroside">
            <button
              className={`dtc-unit hero ${hurt.hero && Date.now() - hurt.hero < 400 ? "hit" : ""}`}
              onClick={() => {
                if (selCard && player && !needsTarget(selCard)) {
                  play(selCard.uid);
                  return;
                }
                showInfo({ title: HEROES[run.hero].name, body: <HeroInfo run={run} /> });
              }}
              aria-label={`${HEROES[run.hero].name}, ${run.hp} of ${run.maxHp} HP`}
            >
              <span className="dtc-unit-sprite" key={lunge.hero ?? 0} data-lunge={lunge.hero ? "r" : ""}>
                <span className="dtc-bob">
                  <Sprite id={run.hero} />
                </span>
              </span>
              <HpBar hp={run.hp} max={run.maxHp} block={c.block} />
              <StatusList st={c.st} small />
              <span className="dtc-floaters">
                {floaters
                  .filter((f) => f.who === "hero")
                  .map((f) => (
                    <span key={f.id} className={`dtc-float ${f.cls}`}>
                      {f.text}
                    </span>
                  ))}
              </span>
            </button>
          </div>
        </div>
        {player && (snackSel !== null || selCard) && (
          <div className="dtc-target-hint">
            {snackSel !== null
              ? "Tap an enemy to use the snack"
              : selCard && !canPlay(run, selCard)
                ? cardCost(run, selCard) < 0
                  ? "This card can't be played"
                  : "Not enough energy"
                : targeting
                  ? "Tap an enemy to target it"
                  : "Tap the card again to play it"}
          </div>
        )}
        {c.phase === "enemy" && <div className="dtc-turn-banner">Enemy turn</div>}
        {c.phase === "won" && <div className="dtc-turn-banner win">Victory!</div>}
        {c.phase === "lost" && <div className="dtc-turn-banner lose">Knocked out…</div>}
      </div>

      <div className="dtc-handarea">
        <div className="dtc-controls">
          <div className="dtc-energy" aria-label={`${c.energy} energy`}>
            <b>{c.energy}</b>
            <small>/{c.maxEnergy + (c.st.energy ?? 0)}</small>
          </div>
          <button
            className="dtc-pile"
            onClick={() =>
              showInfo({
                title: `Draw pile (${c.draw.length})`,
                body: (
                  <div className="dtc-deckgrid">
                    {sortDeck(c.draw).map((x) => (
                      <CardFace key={x.uid} ci={x} />
                    ))}
                  </div>
                ),
              })
            }
          >
            📚 {c.draw.length}
          </button>
          <button
            className="dtc-pile"
            onClick={() =>
              showInfo({
                title: `Discard pile (${c.discard.length})`,
                body: (
                  <div className="dtc-deckgrid">
                    {c.discard.map((x) => (
                      <CardFace key={x.uid} ci={x} />
                    ))}
                  </div>
                ),
              })
            }
          >
            🗑️ {c.discard.length}
          </button>
          <span className="dtc-spacer" />
          <span className="dtc-turn">Turn {c.turn}</span>
          <button className={`dtc-btn dtc-end ${player && !c.hand.some((h) => canPlay(run, h)) ? "glow" : ""}`} onClick={doEnd} disabled={!player}>
            End turn
          </button>
        </div>
        <div className="dtc-hand" ref={handRef}>
          {c.hand.map((ci, i) => {
            const cost = cardCost(run, ci);
            const ok = player && canPlay(run, ci);
            const s = sel === ci.uid;
            const mid = (n - 1) / 2;
            const rot = n > 1 ? (i - mid) * (handW < 520 ? 2.2 : 1.6) : 0;
            return (
              <CardFace
                key={ci.uid}
                ci={ci}
                cost={cost}
                selected={s}
                disabled={!ok}
                onClick={() => tapCard(ci)}
                style={{
                  marginLeft: i === 0 ? 0 : overlap,
                  transform: s ? "translateY(-14px) scale(1.05)" : `rotate(${rot}deg) translateY(${Math.abs(i - mid) * 2}px)`,
                  zIndex: s ? 50 : i,
                }}
              />
            );
          })}
          {!c.hand.length && player && <div className="dtc-muted dtc-center">No cards left. End your turn.</div>}
        </div>
      </div>
    </div>
  );
}

function Dust() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const x = cv.getContext("2d");
    if (!x) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0,
      H = 0,
      raf = 0;
    let motes: { x: number; y: number; r: number; v: number; p: number }[] = [];
    const size = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.width = Math.max(1, r.width * dpr);
      H = cv.height = Math.max(1, r.height * dpr);
      motes = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 2 + 0.6) * dpr, v: Math.random() * 0.3 + 0.1, p: Math.random() * 6 }));
    };
    const draw = (t: number) => {
      x.clearRect(0, 0, W, H);
      for (const m of motes) {
        if (!reduce) {
          m.y -= m.v;
          m.x += Math.sin(t / 1500 + m.p) * 0.3;
          if (m.y < -5) {
            m.y = H + 5;
            m.x = Math.random() * W;
          }
        }
        x.globalAlpha = 0.35;
        x.fillStyle = "#ffe8c0";
        x.beginPath();
        x.arc(m.x, m.y, m.r, 0, 7);
        x.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    size();
    window.addEventListener("resize", size);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, []);
  return <canvas ref={ref} className="dtc-dust" aria-hidden />;
}

// ------------------------------------------------------------------ map

const NODE_ICON: Record<string, string> = { fight: "⚔️", elite: "👹", event: "❓", shop: "🛒", camp: "🔥", treasure: "👛", boss: "👑" };
const NODE_NAME: Record<string, string> = { fight: "Fight", elite: "Elite", event: "Unknown", shop: "Shop", camp: "Campfire", treasure: "Treasure", boss: "Boss" };

function MapView({ run, act }: { run: Run; act: Act }) {
  const ROW_H = 76;
  const total = ROWS + 1;
  const height = total * ROW_H + 60;
  const scrollRef = useRef<HTMLDivElement>(null);
  const opts = reachable(run);
  const isOpt = (n: MapNode) => opts.some((o) => o.row === n.row && o.col === n.col);
  const jitter = (r: number, c: number) => (((r * 7 + c * 13 + run.area * 5) % 7) - 3) * 0.9;
  const px = (n: MapNode) => (n.row === ROWS ? 50 : 12 + (n.col / (COLS - 1)) * 76 + jitter(n.row, n.col));
  const py = (n: MapNode) => height - 40 - n.row * ROW_H - (n.row === ROWS ? 14 : 0);
  const visited = (n: MapNode) => run.pos && n.row === run.pos.row && n.col === run.pos.col;
  const area = AREAS[run.area];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const row = run.pos ? run.pos.row : -1;
    const y = height - 40 - (row + 1) * ROW_H;
    el.scrollTop = Math.max(0, y - el.clientHeight * 0.6);
  }, [run.pos, height]);

  const bossId = area.boss;
  return (
    <div className="dtc-map-wrap">
      <AreaBg area={run.area} />
      <div className="dtc-map-head">
        <div className="dtc-eyebrow">
          Area {run.area + 1} of {AREAS.length}
        </div>
        <h2 className="dtc-h2">{area.name}</h2>
        <p className="dtc-muted">{area.blurb}</p>
        <p className="dtc-map-tip">{run.pos ? "Choose where to go next." : "Choose where to start."}</p>
      </div>
      <div className="dtc-map-scroll" ref={scrollRef}>
        <div className="dtc-map" style={{ height }}>
          <svg className="dtc-map-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
            {run.map.flatMap((row) =>
              row.flatMap((n) =>
                n.next.map((c) => {
                  const m = run.map[n.row + 1]?.find((x) => x.col === c);
                  if (!m) return null;
                  const from = visited(n) && isOpt(m);
                  return (
                    <line
                      key={`${n.row}-${n.col}-${c}`}
                      x1={px(n)}
                      y1={py(n)}
                      x2={px(m)}
                      y2={py(m)}
                      className={from ? "hot" : ""}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }),
              ),
            )}
          </svg>
          {run.map.flatMap((row) =>
            row.map((n) => {
              const opt = isOpt(n);
              const past = run.pos ? n.row < run.pos.row || !!visited(n) : false;
              const seeReal = run.hero === "key" && n.type === "event";
              const icon = n.type === "boss" ? null : NODE_ICON[seeReal ? n.real : n.type];
              return (
                <button
                  key={`${n.row}-${n.col}`}
                  className={`dtc-node n-${n.type} ${opt ? "opt" : ""} ${visited(n) ? "here" : ""} ${past && !visited(n) ? "past" : ""}`}
                  style={{ left: `${px(n)}%`, top: py(n) }}
                  disabled={!opt}
                  onClick={() => {
                    sfx("click");
                    act((r) => {
                      chooseNode(r, n.row, n.col);
                    });
                  }}
                  aria-label={`${NODE_NAME[n.type]}${seeReal ? ` (${NODE_NAME[n.real]})` : ""}${opt ? ", available" : ""}`}
                >
                  {n.type === "boss" ? <Sprite id={bossId} /> : <span>{icon}</span>}
                  {seeReal && <em>?</em>}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ rewards & rooms

function Panel({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  return (
    <div className="dtc-room">
      <div className="dtc-room-inner">
        {eyebrow && <div className="dtc-eyebrow">{eyebrow}</div>}
        <h2 className="dtc-h2">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function RewardView({ run, act, showInfo }: { run: Run; act: Act; showInfo: ShowInfo }) {
  const r = run.reward!;
  const [chosen, setChosen] = useState<number | null>(null);
  const cardsLeft = !!r.cards;
  return (
    <Panel title="You won!" eyebrow={`+${r.xp} XP`}>
      <div className="dtc-loot">
        {!r.crumbsTaken && (
          <button
            className="dtc-loot-item"
            onClick={() => {
              sfx("coin");
              act((x) => takeCrumbs(x));
            }}
          >
            <span>🍪</span> {r.crumbs} crumbs
          </button>
        )}
        {r.trinket && (
          <button
            className="dtc-loot-item"
            onClick={() => {
              sfx("buy");
              act((x) => takeRewardTrinket(x));
            }}
          >
            <span>{TRINKET[r.trinket].icon}</span>
            <span className="dtc-loot-text">
              <b>{TRINKET[r.trinket].name}</b>
              <small>{TRINKET[r.trinket].desc}</small>
            </span>
          </button>
        )}
        {r.snack && (
          <button
            className="dtc-loot-item"
            onClick={() => {
              act((x) => {
                if (takeRewardSnack(x)) sfx("buy");
                else showInfo({ title: "Pockets full", body: <p>Throw away a snack from the top bar first, then take this one.</p> });
              });
            }}
          >
            <span>{SNACK[r.snack].icon}</span>
            <span className="dtc-loot-text">
              <b>{SNACK[r.snack].name}</b>
              <small>{SNACK[r.snack].desc}</small>
            </span>
          </button>
        )}
      </div>
      {r.boss && (
        <>
          <h3 className="dtc-h3">Pick a boss trinket</h3>
          <div className="dtc-choices">
            {r.boss.map((id) => (
              <button
                key={id}
                className="dtc-choice"
                onClick={() => {
                  sfx("level");
                  act((x) => takeBossTrinket(x, id));
                }}
              >
                <span className="dtc-choice-icon">{TRINKET[id].icon}</span>
                <b>{TRINKET[id].name}</b>
                <small>{TRINKET[id].desc}</small>
              </button>
            ))}
          </div>
          <button className="dtc-btn dtc-btn-ghost" onClick={() => act((x) => takeBossTrinket(x, null))}>
            Skip
          </button>
        </>
      )}
      {cardsLeft && (
        <>
          <h3 className="dtc-h3">Add a card to your deck</h3>
          <div className="dtc-cardpick">
            {r.cards!.map((ci) => (
              <CardFace key={ci.uid} ci={ci} selected={chosen === ci.uid} onClick={() => setChosen(ci.uid)} />
            ))}
          </div>
          <div className="dtc-row dtc-center">
            <button
              className="dtc-btn"
              disabled={chosen === null}
              onClick={() => {
                sfx("card");
                act((x) => takeCard(x, chosen));
              }}
            >
              Take card
            </button>
            <button className="dtc-btn dtc-btn-ghost" onClick={() => act((x) => takeCard(x, null))}>
              Skip
            </button>
          </div>
        </>
      )}
      {!cardsLeft && !r.boss && (
        <button className="dtc-btn dtc-btn-big" onClick={() => act((x) => finishReward(x))}>
          Continue
        </button>
      )}
    </Panel>
  );
}

function ShopView({ run, act, showInfo }: { run: Run; act: Act; showInfo: ShowInfo }) {
  const s = run.shop!;
  const tryBuy = (kind: "card" | "trinket" | "snack", i: number) => {
    let ok = false;
    act((r) => {
      ok = buy(r, kind, i);
    });
    if (ok) sfx("buy");
    else sfx("click");
  };
  const price = (p: number) => discount(run, p);
  return (
    <Panel title="The Crumb Market" eyebrow="Shop">
      <p className="dtc-muted">A mouse in a bottle-cap hat runs a stall out of a matchbox. “Everything must go.”</p>
      <h3 className="dtc-h3">Cards</h3>
      <div className="dtc-shop-cards">
        {s.cards.map((it, i) => (
          <div key={it.item.uid} className={`dtc-shop-item ${it.sold ? "sold" : ""}`}>
            <CardFace ci={it.item} onClick={it.sold ? undefined : () => tryBuy("card", i)} disabled={run.crumbs < price(it.price)} />
            <span className={`dtc-price ${run.crumbs < price(it.price) ? "no" : ""}`}>{it.sold ? "Sold" : `🍪 ${price(it.price)}`}</span>
          </div>
        ))}
      </div>
      <h3 className="dtc-h3">Trinkets and snacks</h3>
      <div className="dtc-loot">
        {s.trinkets.map((it, i) => (
          <button key={it.item} className={`dtc-loot-item ${it.sold ? "sold" : ""}`} disabled={it.sold} onClick={() => tryBuy("trinket", i)}>
            <span>{TRINKET[it.item].icon}</span>
            <span className="dtc-loot-text">
              <b>{TRINKET[it.item].name}</b>
              <small>{TRINKET[it.item].desc}</small>
            </span>
            <span className={`dtc-price ${run.crumbs < price(it.price) ? "no" : ""}`}>{it.sold ? "Sold" : `🍪 ${price(it.price)}`}</span>
          </button>
        ))}
        {s.snacks.map((it, i) => (
          <button
            key={it.item + i}
            className={`dtc-loot-item ${it.sold ? "sold" : ""}`}
            disabled={it.sold}
            onClick={() => {
              if (!run.snacks.includes(null)) {
                showInfo({ title: "Pockets full", body: <p>You can't carry more snacks. Use or throw one away first.</p> });
                return;
              }
              tryBuy("snack", i);
            }}
          >
            <span>{SNACK[it.item].icon}</span>
            <span className="dtc-loot-text">
              <b>{SNACK[it.item].name}</b>
              <small>{SNACK[it.item].desc}</small>
            </span>
            <span className={`dtc-price ${run.crumbs < price(it.price) ? "no" : ""}`}>{it.sold ? "Sold" : `🍪 ${price(it.price)}`}</span>
          </button>
        ))}
        <button
          className={`dtc-loot-item ${s.removed ? "sold" : ""}`}
          disabled={s.removed}
          onClick={() => {
            act((r) => {
              shopRemove(r);
            });
          }}
        >
          <span>✂️</span>
          <span className="dtc-loot-text">
            <b>Card snipping</b>
            <small>Remove a card from your deck.</small>
          </span>
          <span className={`dtc-price ${run.crumbs < price(s.removePrice) ? "no" : ""}`}>{s.removed ? "Done" : `🍪 ${price(s.removePrice)}`}</span>
        </button>
      </div>
      <button className="dtc-btn dtc-btn-big" onClick={() => act((r) => leaveShop(r))}>
        Leave the shop
      </button>
    </Panel>
  );
}

function CampView({ run, act }: { run: Run; act: Act }) {
  const heal = restHeal(run);
  return (
    <Panel title="Lint Campfire" eyebrow="Rest stop">
      <div className="dtc-campfire" aria-hidden>
        <div className="dtc-fire">
          <i />
          <i />
          <i />
        </div>
        <div className="dtc-camp-hero dtc-bob">
          <Sprite id={run.hero} />
        </div>
      </div>
      {run.campDone ? (
        <>
          <p className="dtc-center">You feel ready to keep going.</p>
          <button className="dtc-btn dtc-btn-big" onClick={() => act((r) => leaveCamp(r))}>
            Continue
          </button>
        </>
      ) : (
        <div className="dtc-choices">
          <button
            className="dtc-choice"
            disabled={heal <= 0}
            onClick={() => {
              sfx("heal");
              act((r) => campRest(r));
            }}
          >
            <span className="dtc-choice-icon">💤</span>
            <b>Rest</b>
            <small>{heal > 0 ? `Heal ${heal} HP.` : "Your 9-Volt Battery won't let you rest."}</small>
          </button>
          <button className="dtc-choice" onClick={() => act((r) => campUpgrade(r))}>
            <span className="dtc-choice-icon">🪡</span>
            <b>Stitch</b>
            <small>Upgrade a card.</small>
          </button>
        </div>
      )}
    </Panel>
  );
}

function EventView({ run, act }: { run: Run; act: Act }) {
  const st = run.event!;
  const ev = EVENT[st.id];
  return (
    <Panel title={ev.title} eyebrow="Something unusual">
      <div className="dtc-event-art" aria-hidden>
        {ev.art}
      </div>
      <p className="dtc-event-text">{ev.text}</p>
      {st.result === null ? (
        <div className="dtc-col">
          {ev.choices.map((ch) => {
            const ok = eventChoiceOk(run, ch.id);
            return (
              <button
                key={ch.id}
                className="dtc-btn dtc-event-choice"
                disabled={!ok}
                onClick={() => {
                  sfx("click");
                  act((r) => chooseEvent(r, ch.id));
                }}
              >
                <b>{ch.label}</b>
                <small>{ok ? ch.hint : `You need ${ch.cost} crumbs.`}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <p className="dtc-event-result">{st.result}</p>
          <button className="dtc-btn dtc-btn-big" onClick={() => act((r) => leaveEvent(r))}>
            Continue
          </button>
        </>
      )}
    </Panel>
  );
}

function TreasureView({ run, act }: { run: Run; act: Act }) {
  const t = run.treasure!;
  return (
    <Panel title="A Lost Coin Purse" eyebrow="Treasure">
      <div className="dtc-event-art" aria-hidden>
        {t.taken ? "👛✨" : "👛"}
      </div>
      {!t.taken ? (
        <>
          <p className="dtc-center">
            Inside: 🍪 {t.crumbs} crumbs and {t.options.length > 1 ? "two trinkets. Key's sharp eye lets you choose one." : "a trinket."}
          </p>
          <div className="dtc-choices">
            {t.options.map((id) => (
              <button
                key={id}
                className="dtc-choice"
                onClick={() => {
                  sfx("buy");
                  act((r) => takeTreasure(r, id));
                }}
              >
                <span className="dtc-choice-icon">{TRINKET[id].icon}</span>
                <b>{TRINKET[id].name}</b>
                <small>{TRINKET[id].desc}</small>
              </button>
            ))}
            {!t.options.length && (
              <button className="dtc-btn" onClick={() => act((r) => takeTreasure(r, null))}>
                Take the crumbs
              </button>
            )}
          </div>
        </>
      ) : (
        <button className="dtc-btn dtc-btn-big" onClick={() => act((r) => leaveTreasure(r))}>
          Continue
        </button>
      )}
    </Panel>
  );
}

function LevelUpView({ run, act }: { run: Run; act: Act }) {
  return (
    <Panel title={`Level ${run.level - run.pendingLevels + 1}!`} eyebrow="Level up">
      <p className="dtc-center dtc-muted">Pick a perk.</p>
      <div className="dtc-choices">
        {run.levelChoices!.map((id) => {
          const p = LEVEL_PERKS.find((x) => x.id === id)!;
          return (
            <button
              key={id}
              className="dtc-choice"
              onClick={() => {
                sfx("level");
                act((r) => choosePerk(r, id));
              }}
            >
              <span className="dtc-choice-icon">{p.icon}</span>
              <b>{p.name}</b>
              <small>{p.desc}</small>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function PickView({ run, act }: { run: Run; act: Act }) {
  const p = run.pick!;
  const [chosen, setChosen] = useState<number | null>(null);
  const list = sortDeck(pickableCards(run));
  const chosenCard = list.find((c) => c.uid === chosen);
  const verb = p.mode === "upgrade" ? "Upgrade" : p.mode === "remove" ? "Remove" : "Swap";
  return (
    <Panel title={p.title}>
      {chosenCard && p.mode === "upgrade" && (
        <div className="dtc-preview-up">
          <CardFace ci={chosenCard} />
          <span>→</span>
          <CardFace ci={{ ...chosenCard, up: true }} />
        </div>
      )}
      <div className="dtc-deckgrid">
        {list.map((c) => (
          <CardFace key={c.uid} ci={c} selected={chosen === c.uid} onClick={() => setChosen(c.uid)} />
        ))}
      </div>
      {!list.length && <p className="dtc-muted">Nothing to choose.</p>}
      <div className="dtc-row dtc-center dtc-sticky-actions">
        <button
          className="dtc-btn"
          disabled={chosen === null}
          onClick={() => {
            sfx(p.mode === "upgrade" ? "level" : "card");
            act((r) => {
              pickCard(r, chosen!);
            });
            setChosen(null);
          }}
        >
          {verb}
        </button>
        {(p.cancel || !list.length) && (
          <button
            className="dtc-btn dtc-btn-ghost"
            onClick={() =>
              act((r) => {
                if (r.pick) r.pick.cancel = true;
                cancelPick(r);
              })
            }
          >
            Cancel
          </button>
        )}
      </div>
    </Panel>
  );
}

function EndView({ run, onFinish }: { run: Run; onFinish: () => void }) {
  const won = run.screen === "victory";
  const s = run.stats;
  return (
    <div className={`dtc-room dtc-end-screen ${won ? "won" : "lost"}`}>
      {won ? <DrawerBg /> : <AreaBg area={run.area} />}
      <div className="dtc-room-inner">
        <div className="dtc-end-sprite dtc-bob">
          <Sprite id={won ? run.hero : run.hero} />
        </div>
        <h2 className="dtc-title dtc-title-sm">{won ? "You escaped the couch!" : "Lost in the couch"}</h2>
        <p className="dtc-center">
          {won
            ? `${HEROES[run.hero].name} beat the Vacuum and rolled out from under the sofa into the daylight.`
            : `${HEROES[run.hero].name} was taken out by ${run.killer ?? "something fluffy"} in ${AREAS[run.area].name}.`}
        </p>
        <div className="dtc-panel dtc-stats">
          <div>
            <b>{totalFloor(run)}</b>
            <span>floor</span>
          </div>
          <div>
            <b>{s.kills}</b>
            <span>defeated</span>
          </div>
          <div>
            <b>{s.bosses}</b>
            <span>bosses</span>
          </div>
          <div>
            <b>{s.biggestHit}</b>
            <span>biggest hit</span>
          </div>
          <div>
            <b>{s.cardsPlayed}</b>
            <span>cards played</span>
          </div>
          <div>
            <b>{run.level}</b>
            <span>level</span>
          </div>
        </div>
        <p className="dtc-lint-big">☁️ +{run.lint ?? 0} lint</p>
        <button className="dtc-btn dtc-btn-big" onClick={onFinish}>
          Back to the Junk Drawer
        </button>
      </div>
    </div>
  );
}

