import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Crown,
  Crosshair,
  Lock,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Zap,
} from "lucide-react";
import { characterAPI, friendsAPI, gamificationAPI } from "../services/api";
import "./Characters.css";

const LAYER_ORDER = {
  base: 0,
  progression: 1,
  endgame: 2,
};

const formatUsd = (usdCents) => {
  const value = Number(usdCents || 0);
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  return `$${(value / 100).toFixed(2)}`;
};

const getLayerLabel = (layerValue) => {
  const normalized = String(layerValue || "").toLowerCase();
  if (normalized === "base") return "Initiation";
  if (normalized === "progression") return "Protocol";
  if (normalized === "endgame") return "Ascendant";
  return "Field";
};

const getUnlockHint = (progressItem) => {
  if (!progressItem) return "Unlocked through onboarding";

  const unlockType = String(progressItem.unlock_type || "").toLowerCase();
  const required = Number(progressItem.required_progress || 0);
  const current = Number(progressItem.current_progress || 0);

  if (progressItem.is_unlocked || current >= required) {
    return "Unlocked";
  }

  if (unlockType === "streak") {
    return `Reach ${required} day streak (${current}/${required})`;
  }

  if (unlockType === "rank") {
    return `Reach required rank (${current}/${required})`;
  }

  if (unlockType === "challenge" || unlockType === "challenges_completed") {
    return `Complete ${required} challenges (${current}/${required})`;
  }

  if (unlockType === "group_session" || unlockType === "group_sessions") {
    return `Complete ${required} team sessions (${current}/${required})`;
  }

  if (unlockType === "total_xp") {
    return `Earn ${required} XP (${current}/${required})`;
  }

  return `Progress ${current}/${required}`;
};

const getAbilityLabel = (abilityType) => {
  const normalized = String(abilityType || "").toLowerCase();
  if (normalized.includes("xp_multiplier")) return "XP Amplifier";
  if (normalized.includes("challenge")) return "Challenge Boost";
  if (normalized.includes("team")) return "Squad Bonus";
  if (normalized.includes("streak")) return "Streak Guard";
  return "Combat Mod";
};

const getAbilityValue = (ability = {}) => {
  const raw = Number(ability?.effect_value);
  if (!Number.isFinite(raw)) return "Adaptive";

  if (raw > 0 && raw <= 2) {
    return `+${Math.round(raw * 100)}%`;
  }

  return `${Math.round(raw)}`;
};

const clampNumber = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

const toSafeCount = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.trunc(Number(fallback) || 0));
  }

  return Math.max(0, Math.trunc(numeric));
};

const getFriendsCountFromPayload = (friendsPayload) => {
  const resolvedList = Array.isArray(friendsPayload?.friends)
    ? friendsPayload.friends
    : Array.isArray(friendsPayload?.data?.friends)
      ? friendsPayload.data.friends
      : Array.isArray(friendsPayload)
        ? friendsPayload
        : [];

  return resolvedList.length;
};

const extractProgressSignalsFromBackend = ({
  gamificationPayload,
  rankPayload,
  friendsPayload,
}) => {
  const stats =
    gamificationPayload?.stats || gamificationPayload?.data?.stats || {};
  const streakFromRank =
    rankPayload?.profile?.currentStreak ??
    rankPayload?.data?.profile?.currentStreak;
  const streakFromStats = stats.currentStreak ?? stats.current_streak;

  return {
    streak: toSafeCount(streakFromRank, streakFromStats),
    tasks: toSafeCount(
      stats.tasksCompleted ??
        stats.tasks_completed ??
        stats.challengesCompleted ??
        stats.challenges_completed,
      0,
    ),
    friends: toSafeCount(
      getFriendsCountFromPayload(friendsPayload),
      stats.friendsAdded ?? stats.friends_added,
    ),
    groupSessions: toSafeCount(
      stats.groupSessions ??
        stats.group_sessions ??
        stats.teamSessions ??
        stats.team_sessions,
      0,
    ),
  };
};

const getProgressRatio = (progressItem) => {
  if (!progressItem) return 0;

  const required = Number(progressItem.required_progress || 0);
  const current = Number(progressItem.current_progress || 0);

  if (required <= 0) {
    return progressItem.is_unlocked ? 1 : 0;
  }

  return clampNumber(current / required, 0, 1);
};

const resolveGlyphLevel = ({
  isOwned,
  isActive,
  progressItem,
  masteryLevel,
}) => {
  const normalizedMastery = Number(masteryLevel);

  if (isActive && Number.isFinite(normalizedMastery)) {
    return clampNumber(Math.max(1, Math.floor(normalizedMastery || 1)), 1, 10);
  }

  const progressRatio = getProgressRatio(progressItem);

  if (isOwned) {
    return clampNumber(2 + Math.round(progressRatio * 6), 1, 10);
  }

  return clampNumber(1 + Math.floor(progressRatio * 5), 1, 10);
};

const buildGlyphBonuses = ({
  glyphLevel,
  abilities = [],
  layer = "base",
  progressRatio = 0,
}) => {
  const normalizedLayer = String(layer || "").toLowerCase();
  const layerBonus =
    normalizedLayer === "endgame"
      ? 4
      : normalizedLayer === "progression"
        ? 2
        : 1;
  const abilitySignal = abilities.reduce((sum, ability) => {
    const value = Number(ability?.effect_value);
    if (!Number.isFinite(value)) return sum;
    if (value > 0 && value <= 2) return sum + value * 100;
    return sum + value;
  }, 0);

  const signalBonus = Math.round(abilitySignal / 20);
  const levelPower = Math.max(1, Number(glyphLevel || 1));
  const progressPower = Math.round(progressRatio * 6);

  return [
    {
      label: "Attack",
      value: `+${Math.round(levelPower * 2 + layerBonus + signalBonus)}`,
    },
    {
      label: "Health",
      value: `+${Math.round(levelPower * 3 + layerBonus * 2)}`,
    },
    {
      label: "Defense",
      value: `+${Math.round(levelPower * 1.8 + progressPower)}`,
    },
    { label: "Speed", value: `+${Math.round(levelPower + progressPower)}%` },
    {
      label: "Crit. Rate",
      value: `+${Math.round(levelPower * 0.9 + signalBonus)}%`,
    },
    {
      label: "Crit. Damage",
      value: `+${Math.round(levelPower * 1.3 + signalBonus)}%`,
    },
    {
      label: "Focus",
      value: `+${Math.round(levelPower * 0.8 + progressPower)}%`,
    },
    {
      label: "Resistance",
      value: `+${Math.round(levelPower * 0.9 + layerBonus)}%`,
    },
    {
      label: "Agility",
      value: `+${Math.round(levelPower * 1.2 + progressPower)}`,
    },
    {
      label: "Precision",
      value: `+${Math.round(levelPower * 1.1 + signalBonus)}`,
    },
  ];
};

const Characters = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchaseInFlightId, setPurchaseInFlightId] = useState("");

  const [catalog, setCatalog] = useState([]);
  const [ownedCharacters, setOwnedCharacters] = useState([]);
  const [activeCharacterId, setActiveCharacterId] = useState("");
  const [focusCharacterId, setFocusCharacterId] = useState("");
  const [unlockProgress, setUnlockProgress] = useState([]);
  const [userCharacterProgress, setUserCharacterProgress] = useState(null);
  const [activeAbilityIndex, setActiveAbilityIndex] = useState(0);
  const [progressSignals, setProgressSignals] = useState({
    streak: 0,
    tasks: 0,
    friends: 0,
    groupSessions: 0,
  });

  useEffect(() => {
    const loadCharactersPage = async () => {
      try {
        setLoading(true);
        setError("");
        let resolvedCatalog = [];
        let resolvedActiveCharacterId = "";
        let resolvedSelectedCharacterId = "";

        const [
          charactersResult,
          ownedResult,
          progressResult,
          selectedResult,
          gamificationResult,
          rankResult,
          friendsResult,
        ] = await Promise.allSettled([
          characterAPI.getCharacters(),
          characterAPI.getOwnedCharacters(),
          characterAPI.getUnlockProgress(),
          characterAPI.getUserCharacter(),
          gamificationAPI.getProfile(),
          gamificationAPI.getRankProfile(),
          friendsAPI.getAll(),
        ]);

        if (
          charactersResult.status === "fulfilled" &&
          charactersResult.value?.success
        ) {
          resolvedCatalog = charactersResult.value.data || [];
          setCatalog(resolvedCatalog);
        }

        if (ownedResult.status === "fulfilled" && ownedResult.value?.success) {
          const ownedData = ownedResult.value.data || {};
          const owned = ownedData.owned_characters || [];
          setOwnedCharacters(owned);
          resolvedActiveCharacterId = String(
            ownedData.active_character_id?._id ||
              ownedData.active_character_id ||
              "",
          );
          setActiveCharacterId(resolvedActiveCharacterId);
        }

        if (
          progressResult.status === "fulfilled" &&
          progressResult.value?.success
        ) {
          setUnlockProgress(progressResult.value.data || []);
        }

        if (
          selectedResult.status === "fulfilled" &&
          selectedResult.value?.success &&
          !resolvedActiveCharacterId
        ) {
          const selectedChar =
            selectedResult.value.data?.character_id ||
            selectedResult.value.data?.character;
          if (selectedChar?._id) {
            resolvedSelectedCharacterId = String(selectedChar._id);
            setActiveCharacterId(resolvedSelectedCharacterId);
          }
        }

        if (
          selectedResult.status === "fulfilled" &&
          selectedResult.value?.success
        ) {
          setUserCharacterProgress(selectedResult.value.data || null);
        }

        setProgressSignals(
          extractProgressSignalsFromBackend({
            gamificationPayload:
              gamificationResult.status === "fulfilled"
                ? gamificationResult.value
                : null,
            rankPayload:
              rankResult.status === "fulfilled" ? rankResult.value : null,
            friendsPayload:
              friendsResult.status === "fulfilled" ? friendsResult.value : null,
          }),
        );

        const fallbackFocusId =
          resolvedActiveCharacterId ||
          resolvedSelectedCharacterId ||
          String(resolvedCatalog?.[0]?._id || "");

        setFocusCharacterId(fallbackFocusId);
      } catch (err) {
        setError(
          err?.response?.data?.message || "Failed to load character data.",
        );
      } finally {
        setLoading(false);
      }
    };

    loadCharactersPage();
  }, []);

  const ownedIdSet = useMemo(() => {
    return new Set((ownedCharacters || []).map((c) => String(c?._id || c)));
  }, [ownedCharacters]);

  const catalogById = useMemo(() => {
    return new Map(
      (catalog || []).map((character) => [
        String(character?._id || ""),
        character,
      ]),
    );
  }, [catalog]);

  const normalizedOwnedCharacters = useMemo(() => {
    return (ownedCharacters || [])
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return entry;
        }

        return catalogById.get(String(entry || "")) || null;
      })
      .filter(Boolean);
  }, [ownedCharacters, catalogById]);

  const unlockByCharacterId = useMemo(() => {
    const map = new Map();
    (unlockProgress || []).forEach((item) => {
      const characterId = String(
        item?.character_id?._id || item?.character_id || "",
      );
      if (characterId) {
        map.set(characterId, item);
      }
    });
    return map;
  }, [unlockProgress]);

  const sortedCatalog = useMemo(() => {
    return [...(catalog || [])].sort((a, b) => {
      const layerDiff =
        (LAYER_ORDER[a.layer] ?? Number.MAX_SAFE_INTEGER) -
        (LAYER_ORDER[b.layer] ?? Number.MAX_SAFE_INTEGER);

      if (layerDiff !== 0) return layerDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [catalog]);

  const purchasableLockedCount = useMemo(() => {
    return sortedCatalog.reduce((count, character) => {
      const characterId = String(character._id || "");
      const isOwned = ownedIdSet.has(characterId);
      const isPurchasable =
        Boolean(character.is_purchasable) &&
        Number(character.purchase_price_usd_cents || 0) > 0;
      return count + (!isOwned && isPurchasable ? 1 : 0);
    }, 0);
  }, [sortedCatalog, ownedIdSet]);

  const focusCharacter = useMemo(() => {
    const fallback = sortedCatalog[0] || null;
    if (!focusCharacterId) return fallback;

    return (
      sortedCatalog.find(
        (character) => String(character._id) === String(focusCharacterId),
      ) || fallback
    );
  }, [sortedCatalog, focusCharacterId]);

  const focusCharacterState = useMemo(() => {
    if (!focusCharacter) {
      return {
        focusId: "",
        isOwned: false,
        isActive: false,
        isPurchasable: false,
        progressItem: null,
      };
    }

    const focusId = String(focusCharacter._id || "");
    const isOwned = ownedIdSet.has(focusId);
    const isActive = String(activeCharacterId) === focusId;
    const isPurchasable =
      Boolean(focusCharacter.is_purchasable) &&
      Number(focusCharacter.purchase_price_usd_cents || 0) > 0;

    return {
      focusId,
      isOwned,
      isActive,
      isPurchasable,
      progressItem: unlockByCharacterId.get(focusId),
    };
  }, [focusCharacter, ownedIdSet, activeCharacterId, unlockByCharacterId]);

  const focusAbilities = useMemo(() => {
    if (!focusCharacter) return [];
    return Array.isArray(focusCharacter.abilities)
      ? focusCharacter.abilities.slice(0, 4)
      : [];
  }, [focusCharacter]);

  const selectedAbility = useMemo(() => {
    if (!focusAbilities.length) return null;
    return focusAbilities[activeAbilityIndex] || focusAbilities[0] || null;
  }, [focusAbilities, activeAbilityIndex]);

  const teamRoster = useMemo(() => {
    const source =
      normalizedOwnedCharacters.length > 0
        ? normalizedOwnedCharacters
        : sortedCatalog;

    return source.slice(0, 6).map((character, index) => ({
      ...character,
      stateLabel: index === 0 ? "Locked In" : index <= 2 ? "Ready" : "Standby",
    }));
  }, [normalizedOwnedCharacters, sortedCatalog]);

  const focusProgressRatio = useMemo(() => {
    return getProgressRatio(focusCharacterState.progressItem);
  }, [focusCharacterState.progressItem]);

  const focusGlyphLevel = useMemo(() => {
    return resolveGlyphLevel({
      isOwned: focusCharacterState.isOwned,
      isActive: focusCharacterState.isActive,
      progressItem: focusCharacterState.progressItem,
      masteryLevel: userCharacterProgress?.mastery_level,
    });
  }, [focusCharacterState, userCharacterProgress]);

  const focusGlyphBonuses = useMemo(() => {
    return buildGlyphBonuses({
      glyphLevel: focusGlyphLevel,
      abilities: focusAbilities,
      layer: focusCharacter?.layer,
      progressRatio: focusProgressRatio,
    });
  }, [focusGlyphLevel, focusAbilities, focusCharacter, focusProgressRatio]);

  const masteryLevel = useMemo(() => {
    return clampNumber(
      toSafeCount(userCharacterProgress?.mastery_level, 0),
      0,
      10,
    );
  }, [userCharacterProgress]);

  const masteryPoints = useMemo(() => {
    return toSafeCount(userCharacterProgress?.mastery_points, 0);
  }, [userCharacterProgress]);

  const masteryProgressPercent = useMemo(() => {
    if (masteryLevel >= 10) return 100;
    return clampNumber(Math.round(((masteryPoints % 10) / 10) * 100), 0, 100);
  }, [masteryLevel, masteryPoints]);

  const focusUnlockPercent = useMemo(() => {
    return Math.round(focusProgressRatio * 100);
  }, [focusProgressRatio]);

  const focusUnlockCurrent = useMemo(() => {
    return toSafeCount(
      focusCharacterState.progressItem?.current_progress,
      focusCharacterState.isOwned ? 1 : 0,
    );
  }, [focusCharacterState]);

  const focusUnlockRequired = useMemo(() => {
    const required = toSafeCount(
      focusCharacterState.progressItem?.required_progress,
      0,
    );
    if (required > 0) return required;
    return focusCharacterState.isOwned ? 1 : 0;
  }, [focusCharacterState]);

  const hudMapLabel = useMemo(() => {
    const layer = String(focusCharacter?.layer || "").toLowerCase();
    if (layer === "endgame") return "LOTUS";
    if (layer === "progression") return "ASCENT";
    return "HAVEN";
  }, [focusCharacter]);

  const hudRoundValue = useMemo(() => {
    const signalTotal =
      toSafeCount(progressSignals.streak) +
      toSafeCount(progressSignals.tasks) +
      toSafeCount(progressSignals.friends);
    return clampNumber(70 + signalTotal, 1, 99);
  }, [progressSignals]);

  const heroSmokeParticles = useMemo(() => {
    return [
      { top: "12%", left: "18%", size: 54, delay: "0s", duration: "8.2s" },
      { top: "28%", left: "34%", size: 66, delay: "1.1s", duration: "9.4s" },
      { top: "18%", left: "62%", size: 48, delay: "1.9s", duration: "8.8s" },
      { top: "42%", left: "76%", size: 72, delay: "0.6s", duration: "10s" },
      { top: "64%", left: "24%", size: 58, delay: "2.4s", duration: "9.1s" },
      { top: "74%", left: "58%", size: 64, delay: "1.5s", duration: "8.6s" },
    ];
  }, []);

  useEffect(() => {
    setActiveAbilityIndex(0);
  }, [focusCharacterId]);

  useEffect(() => {
    if (!focusAbilities.length) {
      setActiveAbilityIndex(0);
      return;
    }

    if (activeAbilityIndex > focusAbilities.length - 1) {
      setActiveAbilityIndex(0);
    }
  }, [focusAbilities, activeAbilityIndex]);

  const handlePurchaseCharacter = async (characterId) => {
    try {
      setPurchaseError("");
      setPurchaseInFlightId(characterId);

      const response = await characterAPI.purchaseCharacter(characterId);
      const checkoutUrl = response?.data?.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error("Checkout URL missing from response");
      }

      window.location.assign(checkoutUrl);
    } catch (err) {
      setPurchaseError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to start character purchase.",
      );
      setPurchaseInFlightId("");
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-transparent px-6 text-foreground overflow-hidden flex items-center">
        <div className="max-w-7xl mx-auto w-full">
          <div className="rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl p-8 animate-pulse">
            <p className="text-lg font-bold tracking-wider">
              Loading character armory...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="characters-page w-screen h-screen bg-transparent text-foreground relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute top-[-10%] right-[-5%] w-[420px] h-[420px] rounded-full blur-[140px] bg-[var(--accent-color-dynamic)]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[420px] h-[420px] rounded-full blur-[140px] bg-primary" />
      </div>

      <div className="relative z-10 h-full w-full">
        {error && (
          <div className="absolute top-4 left-4 rounded-2xl border border-[var(--accent-color-dynamic)]/40 bg-[var(--accent-color-dynamic)]/10 p-4 text-sm font-semibold z-20">
            {error}
          </div>
        )}

        {purchaseError && (
          <div className="rounded-2xl border border-[var(--accent-color-dynamic)]/40 bg-[var(--accent-color-dynamic)]/10 p-4 text-sm font-semibold">
            {purchaseError}
          </div>
        )}

        <section className="agent-select-section h-full w-full">
          <div className="agent-select-shell">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={`agent-shell-bg-${focusCharacterState.focusId || focusCharacter?.image_asset_path || "none"}`}
                className="agent-shell-background"
                style={
                  focusCharacter?.image_asset_path
                    ? {
                        backgroundImage: `url(${focusCharacter.image_asset_path})`,
                      }
                    : undefined
                }
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
              />
            </AnimatePresence>
            <div className="agent-shell-vignette" />

            <div className="agent-hud-strip">
              <div className="agent-hud-info">
                <strong>{hudMapLabel}</strong>
                <span>COMPETITIVE</span>
              </div>
              <div className="agent-hud-round">
                <span>{hudRoundValue}</span>
              </div>
            </div>

            <aside className="agent-team-roster">
              <p className="agent-panel-kicker">
                <Crosshair className="w-3 h-3" /> Team Roster
              </p>
              <div className="agent-team-list">
                {teamRoster.map((character) => {
                  const characterId = String(character?._id || "");
                  const isFocused = characterId === String(focusCharacterId);
                  const isActive =
                    characterId && characterId === String(activeCharacterId);

                  return (
                    <button
                      key={characterId || character.name}
                      type="button"
                      className={`agent-player-card ${isFocused ? "focused" : ""}`}
                      onClick={() =>
                        characterId && setFocusCharacterId(characterId)
                      }
                    >
                      <div className="agent-player-thumb">
                        {character?.image_asset_path ? (
                          <img
                            src={character.image_asset_path}
                            alt={character?.name || "Character"}
                          />
                        ) : (
                          <div className="agent-player-fallback">
                            {character?.name?.[0] || "?"}
                          </div>
                        )}
                      </div>

                      <div className="agent-player-meta">
                        <p className="agent-player-name">
                          {character?.name || "Unknown"}
                        </p>
                        <p className="agent-player-state">
                          {character?.stateLabel || "Ready"}
                        </p>
                      </div>

                      <div
                        className={`agent-player-indicator ${isActive ? "active" : ""}`}
                      >
                        {isActive ? (
                          <Crown className="w-3 h-3" />
                        ) : (
                          <ShieldCheck className="w-3 h-3" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="agent-hero-zone">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`hero-stage-${focusCharacterState.focusId || "none"}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.01 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="agent-hero-stage"
                >
                  <div className="agent-hero-smoke" />
                  <div className="agent-hero-particles" aria-hidden="true">
                    {heroSmokeParticles.map((particle, index) => (
                      <span
                        key={`${particle.top}-${particle.left}-${index}`}
                        className="agent-hero-particle"
                        style={{
                          top: particle.top,
                          left: particle.left,
                          width: `${particle.size}px`,
                          height: `${particle.size}px`,
                          animationDelay: particle.delay,
                          animationDuration: particle.duration,
                        }}
                      />
                    ))}
                  </div>

                  {focusCharacter?.image_asset_path ? (
                    <img
                      src={focusCharacter.image_asset_path}
                      alt={focusCharacter.name}
                      className="agent-hero-art"
                    />
                  ) : (
                    <div className="agent-hero-fallback">
                      {focusCharacter?.name?.[0] || "?"}
                    </div>
                  )}

                  <div className="agent-hero-nameplate">
                    <span className="agent-nameplate-type">
                      {String(
                        getLayerLabel(focusCharacter?.layer || "field"),
                      ).toUpperCase()}
                    </span>
                    <strong className="agent-nameplate-name">
                      {String(focusCharacter?.name || "Unknown").toUpperCase()}
                    </strong>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <aside className="agent-abilities-panel">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`abilities-${focusCharacterState.focusId || "none"}`}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                >
                  <h3 className="agent-focus-name">
                    {String(focusCharacter?.name || "Unknown").toUpperCase()}
                  </h3>
                  <p className="agent-focus-description">
                    {focusCharacter?.description ||
                      "No character data available."}
                  </p>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`selected-ability-${selectedAbility?._id || selectedAbility?.name || "none"}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="agent-ability-detail"
                    >
                      <p className="agent-ability-title">
                        {selectedAbility?.name || "Ability Preview"}
                      </p>
                      <p className="agent-ability-desc">
                        {selectedAbility?.description ||
                          "No ability details available."}
                      </p>
                      <p className="agent-ability-effect">
                        <Activity className="w-3 h-3" />
                        {selectedAbility
                          ? `${getAbilityLabel(selectedAbility?.effect_type)} • ${getAbilityValue(selectedAbility)}`
                          : "No effect signal"}
                      </p>
                    </motion.div>
                  </AnimatePresence>

                  <div className="agent-progress-module">
                    <div className="agent-meter-row">
                      <span>Mastery Lv {masteryLevel}/10</span>
                      <span>{masteryProgressPercent}%</span>
                    </div>
                    <div className="agent-meter-track">
                      <div
                        className="agent-meter-fill mastery"
                        style={{ width: `${masteryProgressPercent}%` }}
                      />
                    </div>

                    <div className="agent-meter-row">
                      <span>Unlock Progress</span>
                      <span>{focusUnlockPercent}%</span>
                    </div>
                    <div className="agent-meter-track">
                      <div
                        className="agent-meter-fill unlock"
                        style={{ width: `${focusUnlockPercent}%` }}
                      />
                    </div>

                    <div className="agent-progress-copy">
                      {focusUnlockCurrent}/{focusUnlockRequired || "-"} •{" "}
                      {getUnlockHint(focusCharacterState.progressItem)}
                    </div>

                    <div className="agent-signal-cards">
                      <div className="agent-signal-card">
                        <span>Streak</span>
                        <strong>{progressSignals.streak}</strong>
                      </div>
                      <div className="agent-signal-card">
                        <span>Tasks</span>
                        <strong>{progressSignals.tasks}</strong>
                      </div>
                      <div className="agent-signal-card">
                        <span>Friends</span>
                        <strong>{progressSignals.friends}</strong>
                      </div>
                      <div className="agent-signal-card">
                        <span>Market</span>
                        <strong>{purchasableLockedCount}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="agent-bonus-grid">
                    {focusGlyphBonuses.slice(0, 4).map((bonus) => (
                      <div key={bonus.label} className="agent-bonus-chip">
                        <span>{bonus.label}</span>
                        <strong>{bonus.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="agent-action-row">
                    {focusCharacterState.isOwned ? (
                      <button
                        type="button"
                        onClick={() => navigate("/session-setup")}
                        className="characters-action-btn select inventory-action-btn"
                      >
                        Select In Session
                      </button>
                    ) : focusCharacterState.isPurchasable ? (
                      <button
                        type="button"
                        disabled={
                          purchaseInFlightId === focusCharacterState.focusId
                        }
                        onClick={() =>
                          handlePurchaseCharacter(focusCharacterState.focusId)
                        }
                        className="characters-action-btn buy inventory-action-btn disabled:opacity-70 disabled:cursor-wait inline-flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {purchaseInFlightId === focusCharacterState.focusId
                          ? "Opening Checkout..."
                          : `Buy ${formatUsd(focusCharacter?.purchase_price_usd_cents)}`}
                      </button>
                    ) : (
                      <div className="characters-action-btn locked inventory-action-btn text-center">
                        Unlock Through Progression
                      </div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </aside>

            <div className="agent-selection-bar">
              {sortedCatalog.map((character) => {
                const characterId = String(character._id || "");
                const isFocused = characterId === String(focusCharacterId);
                const isOwned = ownedIdSet.has(characterId);
                const isActive = String(activeCharacterId) === characterId;
                const isPurchasable =
                  Boolean(character.is_purchasable) &&
                  Number(character.purchase_price_usd_cents || 0) > 0;

                return (
                  <motion.div
                    key={characterId}
                    role="button"
                    tabIndex={0}
                    className={`agent-select-tile ${isFocused ? "focused" : ""} ${isOwned ? "owned" : "locked"}`}
                    onClick={() => setFocusCharacterId(characterId)}
                    onMouseEnter={() => setFocusCharacterId(characterId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setFocusCharacterId(characterId);
                      }
                    }}
                    whileHover={{ y: -2 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  >
                    <div className="agent-select-thumb">
                      {character.image_asset_path ? (
                        <img
                          src={character.image_asset_path}
                          alt={character.name}
                        />
                      ) : (
                        <div className="agent-select-fallback">
                          {character.name?.[0] || "?"}
                        </div>
                      )}
                    </div>

                    <p className="agent-select-name">
                      {String(character.name || "Unknown").toUpperCase()}
                    </p>
                    <p className="agent-select-state">
                      {isActive
                        ? "Active"
                        : isOwned
                          ? "Owned"
                          : isPurchasable
                            ? formatUsd(character.purchase_price_usd_cents)
                            : "Progression"}
                    </p>

                    <div className="agent-select-marker">
                      {isActive ? (
                        <Zap className="w-3 h-3" />
                      ) : isOwned ? (
                        <ShieldCheck className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                    </div>

                    {isFocused && (
                      <div className="agent-select-focused-action">
                        {isOwned ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate("/session-setup");
                            }}
                            className="agent-lock-in-btn"
                          >
                            LOCK IN
                          </button>
                        ) : isPurchasable ? (
                          <button
                            type="button"
                            disabled={purchaseInFlightId === characterId}
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePurchaseCharacter(characterId);
                            }}
                            className="agent-lock-in-btn buy"
                          >
                            {purchaseInFlightId === characterId
                              ? "..."
                              : `BUY ${formatUsd(character.purchase_price_usd_cents)}`}
                          </button>
                        ) : (
                          <div className="agent-lock-in-btn locked">LOCKED</div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Characters;
