import React, { useEffect, useMemo, useRef, useState } from "react";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CHIP_VALUES = [1, 5, 25, 100];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getSuitColorClass(suit) {
  if (suit === "♥" || suit === "♦") return "text-red-500";
  return "text-slate-900";
}

function getCardNumericValue(rank) {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Number(rank);
}

function getHiLoValue(rank) {
  if (["2", "3", "4", "5", "6"].includes(rank)) return 1;
  if (["10", "J", "Q", "K", "A"].includes(rank)) return -1;
  return 0;
}

function createShoe(deckCount = 5) {
  const shoe = [];
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({
          id: `${deck}-${suit}-${rank}-${Math.random().toString(36).slice(2, 9)}`,
          suit,
          rank,
          value: getCardNumericValue(rank),
          hiLo: getHiLoValue(rank),
        });
      }
    }
  }
  return shuffle(shoe);
}

function dealCard(shoe) {
  if (!shoe.length) {
    return { card: null, shoe };
  }
  return {
    card: shoe[0],
    shoe: shoe.slice(1),
  };
}

function calculateHand(hand) {
  let total = hand.cards.reduce((sum, card) => sum + card.value, 0);
  let aceCount = hand.cards.filter((card) => card.rank === "A").length;

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  const isBlackjack = hand.cards.length === 2 && total === 21 && !hand.fromSplit;
  const isBust = total > 21;
  const isSoft = hand.cards.some((card) => card.rank === "A") && total <= 21 && aceCount > 0;

  return { total, isBlackjack, isBust, isSoft };
}

function getVisibleCountDelta(cards) {
  return cards.reduce((sum, card) => sum + card.hiLo, 0);
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function getDecksRemaining(shoeLength) {
  return Math.max(shoeLength / 52, 0.01);
}

function getTrueCount(runningCount, shoeLength) {
  return runningCount / getDecksRemaining(shoeLength);
}

function shouldDealerHit(hand, dealerHitsSoft17 = false) {
  const calc = calculateHand(hand);
  if (calc.total < 17) return true;
  if (calc.total > 17) return false;
  return dealerHitsSoft17 && calc.isSoft;
}

function getNextActiveHandIndex(hands, startIndex = 0) {
  for (let i = startIndex; i < hands.length; i += 1) {
    const hand = hands[i];
    const calc = calculateHand(hand);
    if (!hand.stood && !hand.resolved && !hand.surrendered && !calc.isBust) {
      return i;
    }
  }
  return -1;
}

function allPlayerHandsFinished(hands) {
  return getNextActiveHandIndex(hands, 0) === -1;
}

function isSplitHand(hand) {
  return Boolean(hand?.fromSplit);
}

function getDealerUpcardValue(card) {
  if (!card) return null;
  if (card.rank === "A") return 11;
  if (["K", "Q", "J"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function getPairRank(hand) {
  if (!hand || hand.cards.length !== 2) return null;
  if (hand.cards[0].rank !== hand.cards[1].rank) return null;
  return hand.cards[0].rank;
}

function getSoftTotalInfo(hand) {
  if (!hand || hand.cards.length !== 2) return null;
  const ranks = hand.cards.map((card) => card.rank);
  const hasAce = ranks.includes("A");
  if (!hasAce) return null;

  const otherCard = hand.cards.find((card) => card.rank !== "A");
  if (!otherCard) return { total: 12, otherValue: 1 };

  return {
    total: 11 + otherCard.value,
    otherValue: otherCard.value,
  };
}

function getBasicStrategyAction(hand, dealerUpcard, config) {
  if (!hand || hand.cards.length < 2 || !dealerUpcard) return null;

  const calc = calculateHand(hand);
  const dealerValue = getDealerUpcardValue(dealerUpcard);
  const pairRank = getPairRank(hand);
  const softInfo = getSoftTotalInfo(hand);
  const canSplit = hand.cards.length === 2 && pairRank && (!hand.fromSplit || config.allowResplit);
  const canDouble = hand.cards.length === 2 && (!hand.fromSplit || config.doubleAfterSplit);
  const canSurrender = config.allowSurrender && hand.cards.length === 2 && !hand.fromSplit;

  if (canSplit && pairRank) {
    if (pairRank === "A" || pairRank === "8") return "Split";
    if (pairRank === "10") return "Stand";
    if (pairRank === "9") {
      if ([2, 3, 4, 5, 6, 8, 9].includes(dealerValue)) return "Split";
      return "Stand";
    }
    if (pairRank === "7") {
      if (dealerValue >= 2 && dealerValue <= 7) return "Split";
      return "Hit";
    }
    if (pairRank === "6") {
      if (dealerValue >= 2 && dealerValue <= 6) return "Split";
      return "Hit";
    }
    if (pairRank === "5") {
      if (dealerValue >= 2 && dealerValue <= 9) return canDouble ? "Double if allowed, otherwise Hit" : "Hit";
      return "Hit";
    }
    if (pairRank === "4") {
      if (dealerValue === 5 || dealerValue === 6) return "Split";
      return "Hit";
    }
    if (pairRank === "3" || pairRank === "2") {
      if (dealerValue >= 2 && dealerValue <= 7) return "Split";
      return "Hit";
    }
  }

  if (softInfo) {
    const total = calc.total;

    if (total >= 20) return "Stand";
    if (total === 19) {
      if (dealerValue === 6 && canDouble) return "Double if allowed, otherwise Stand";
      return "Stand";
    }
    if (total === 18) {
      if (dealerValue >= 3 && dealerValue <= 6 && canDouble) return "Double if allowed, otherwise Stand";
      if ([2, 7, 8].includes(dealerValue)) return "Stand";
      return "Hit";
    }
    if (total === 17) {
      if (dealerValue >= 3 && dealerValue <= 6 && canDouble) return "Double if allowed, otherwise Hit";
      return "Hit";
    }
    if (total === 16 || total === 15) {
      if (dealerValue >= 4 && dealerValue <= 6 && canDouble) return "Double if allowed, otherwise Hit";
      return "Hit";
    }
    if (total === 14 || total === 13) {
      if ((dealerValue === 5 || dealerValue === 6) && canDouble) return "Double if allowed, otherwise Hit";
      return "Hit";
    }
  }

  const total = calc.total;

  if (canSurrender) {
    if (total === 16 && dealerValue >= 9) return "Surrender if allowed, otherwise Hit";
    if (total === 15 && dealerValue === 10) return "Surrender if allowed, otherwise Hit";
  }

  if (total >= 17) return "Stand";
  if (total >= 13 && total <= 16) {
    if (dealerValue >= 2 && dealerValue <= 6) return "Stand";
    return "Hit";
  }
  if (total === 12) {
    if (dealerValue >= 4 && dealerValue <= 6) return "Stand";
    return "Hit";
  }
  if (total === 11) {
    return canDouble ? "Double if allowed, otherwise Hit" : "Hit";
  }
  if (total === 10) {
    if (dealerValue >= 2 && dealerValue <= 9) {
      return canDouble ? "Double if allowed, otherwise Hit" : "Hit";
    }
    return "Hit";
  }
  if (total === 9) {
    if (dealerValue >= 3 && dealerValue <= 6) {
      return canDouble ? "Double if allowed, otherwise Hit" : "Hit";
    }
    return "Hit";
  }

  return "Hit";
}

function doesActionMatchRecommendation(action, recommendation) {
  if (!recommendation) return true;

  const normalizedAction = action.toLowerCase();
  const normalizedRecommendation = recommendation.toLowerCase();

  if (normalizedRecommendation === "hit") return normalizedAction === "hit";
  if (normalizedRecommendation === "stand") return normalizedAction === "stand";
  if (normalizedRecommendation === "split") return normalizedAction === "split";

  if (normalizedRecommendation.includes("double if allowed")) {
    if (normalizedRecommendation.includes("otherwise stand")) {
      return normalizedAction === "double" || normalizedAction === "stand";
    }
    return normalizedAction === "double" || normalizedAction === "hit";
  }

  if (normalizedRecommendation.includes("surrender if allowed")) {
    return normalizedAction === "surrender" || normalizedAction === "hit";
  }

  return normalizedAction === normalizedRecommendation;
}

function getStrategyExplanation(hand, dealerUpcard, recommendation, config) {
  if (!hand || !dealerUpcard || !recommendation) return null;

  const calc = calculateHand(hand);
  const dealerValue = getDealerUpcardValue(dealerUpcard);
  const pairRank = getPairRank(hand);
  const softInfo = getSoftTotalInfo(hand);

  if (pairRank) {
    if (recommendation === "Split") {
      return `This is a pair of ${pairRank}s against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}. Basic strategy prefers splitting here because the pair has more value as two separate hands than as one combined total.`;
    }
    if (recommendation === "Stand") {
      return `This pair plays better as a completed total against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}, so basic strategy prefers standing instead of splitting.`;
    }
  }

  if (softInfo) {
    if (recommendation.includes("Double")) {
      return `This is a soft ${calc.total}, which means an Ace can still reduce if you draw. Against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}, that flexibility makes doubling strong when the rules allow it.`;
    }
    if (recommendation === "Stand") {
      return `This soft ${calc.total} is strong enough to stand against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}. Basic strategy avoids taking extra risk here.`;
    }
    if (recommendation === "Hit") {
      return `This soft ${calc.total} is not strong enough yet against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}, and the Ace gives you flexibility, so hitting is preferred.`;
    }
  }

  if (recommendation.includes("Surrender")) {
    return `This is a difficult hard ${calc.total} against a strong dealer ${dealerValue === 11 ? "Ace" : dealerValue}. Basic strategy prefers surrender here when allowed because giving up half loses less in the long run than playing the hand out.`;
  }

  if (recommendation.includes("Double")) {
    return `This hard ${calc.total} is in a strong doubling range against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}. Basic strategy wants to press the advantage when the dealer is more likely to finish weak.`;
  }

  if (recommendation === "Stand") {
    return `This hard ${calc.total} is strong enough against a dealer ${dealerValue === 11 ? "Ace" : dealerValue} that basic strategy prefers standing rather than risking a worse total.`;
  }

  if (recommendation === "Hit") {
    return `This hard ${calc.total} is too weak to stand comfortably against a dealer ${dealerValue === 11 ? "Ace" : dealerValue}, so basic strategy prefers improving the hand with a hit.`;
  }

  return `Basic strategy prefers ${recommendation.toLowerCase()} in this spot based on your total, the dealer upcard, and the current rule set.`;
}

function createEmptyHand(overrides = {}) {
  return {
    cards: [],
    bet: 0,
    stood: false,
    doubled: false,
    resolved: false,
    surrendered: false,
    outcome: null,
    fromSplit: false,
    splitDepth: 0,
    ...overrides,
  };
}

function buildInitialState(config) {
  return {
    config,
    bankroll: config.startingBankroll,
    currentBet: 0,
    lastBet: 0,
    shoe: createShoe(config.deckCount),
    discardPile: [],
    playerHands: [createEmptyHand()],
    dealerHand: createEmptyHand(),
    phase: "betting",
    message: "Place your bet",
    showTrainer: true,
    runningCount: 0,
    trueCount: 0,
    displayRunningCount: 0,
    displayTrueCount: 0,
    playerCountGuess: "",
    playerTrueCountGuess: "",
    countFeedback: null,
    insuranceOffered: false,
    insuranceTaken: false,
    insuranceBet: 0,
    dealerHasCheckedBlackjack: false,
    dealerTurnInProgress: false,
    dealerTurnStep: "idle",
    lastStrategyFeedback: null,
    lastStrategyExplanation: null,
    countCheckCompletedForRound: false,
    pendingCountDrillPrompt: false,
    activeHandIndex: 0,
    roundLog: [],
    stats: {
      handsPlayed: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      strategyCorrect: 0,
      strategyMistakes: 0,
    },
  };
}

function addRoundLog(existing, ...entries) {
  return [...existing, ...entries.filter(Boolean)];
}

function applyVisibleCardsToCount(runningCount, shoeLength, cards) {
  const nextRunningCount = runningCount + getVisibleCountDelta(cards);
  return {
    runningCount: nextRunningCount,
    trueCount: getTrueCount(nextRunningCount, shoeLength),
  };
}

function getDisplayedCounts(config, runningCount, trueCount, dealerHand, phase, shoeLength) {
  if (!config.realisticCountMode) {
    let fullRunning = runningCount;

    if (
      phase === "playerTurn" &&
      dealerHand &&
      dealerHand.cards &&
      dealerHand.cards.length >= 2 &&
      dealerHand.cards[1]
    ) {
      fullRunning += dealerHand.cards[1].hiLo;
    }

    return {
      displayRunningCount: fullRunning,
      displayTrueCount: getTrueCount(fullRunning, shoeLength),
    };
  }

  return {
    displayRunningCount: runningCount,
    displayTrueCount: trueCount,
  };
}

function playOutDealerAndSettle(state, hands, dealerHand, shoe, runningCount, roundLog) {
  let workingDealer = { ...dealerHand, cards: [...dealerHand.cards] };
  let workingShoe = [...shoe];
  let workingRunningCount = runningCount;
  let workingRoundLog = [...roundLog];

  const holeCard = workingDealer.cards[1];
  if (holeCard) {
    workingRunningCount += holeCard.hiLo;
    workingRoundLog = addRoundLog(workingRoundLog, `Dealer reveals ${holeCard.rank}${holeCard.suit}`);
  }

  while (shouldDealerHit(workingDealer, state.config.dealerHitsSoft17)) {
    const dealt = dealCard(workingShoe);
    if (!dealt.card) break;
    workingDealer.cards = [...workingDealer.cards, dealt.card];
    workingShoe = dealt.shoe;
    workingRunningCount += dealt.card.hiLo;
    workingRoundLog = addRoundLog(workingRoundLog, `Dealer hits ${dealt.card.rank}${dealt.card.suit}`);
  }

  const dealerCalc = calculateHand(workingDealer);
  let bankroll = state.bankroll;
  let stats = { ...state.stats };

  if (state.insuranceTaken && state.insuranceBet > 0) {
    if (calculateHand(workingDealer).isBlackjack) {
      bankroll += state.insuranceBet * 3;
      workingRoundLog = addRoundLog(workingRoundLog, "Insurance wins.");
    } else {
      workingRoundLog = addRoundLog(workingRoundLog, "Insurance loses.");
    }
  }

  const resolvedHands = hands.map((hand) => {
    const calc = calculateHand(hand);
    let outcome = "loss";

    if (hand.surrendered) {
      outcome = "surrender";
      bankroll += hand.bet / 2;
      stats.losses += 1;
    } else if (calc.isBust) {
      outcome = "loss";
      stats.losses += 1;
    } else if (calc.isBlackjack && !dealerCalc.isBlackjack) {
      outcome = "blackjack";
      bankroll += hand.bet * (1 + state.config.blackjackPayout);
      stats.blackjacks += 1;
    } else if (dealerCalc.isBust) {
      outcome = "win";
      bankroll += hand.bet * 2;
      stats.wins += 1;
    } else if (dealerCalc.isBlackjack && !calc.isBlackjack) {
      outcome = "loss";
      stats.losses += 1;
    } else if (calc.total > dealerCalc.total) {
      outcome = "win";
      bankroll += hand.bet * 2;
      stats.wins += 1;
    } else if (calc.total === dealerCalc.total) {
      outcome = "push";
      bankroll += hand.bet;
      stats.pushes += 1;
    } else {
      outcome = "loss";
      stats.losses += 1;
    }

    return {
      ...hand,
      resolved: true,
      stood: true,
      outcome,
    };
  });

  stats.handsPlayed += resolvedHands.length;

  const usedCards = [...resolvedHands.flatMap((hand) => hand.cards), ...workingDealer.cards];
  const cutThreshold = Math.floor(state.config.deckCount * 52 * (1 - state.config.penetration));
  const shouldShuffle = workingShoe.length <= cutThreshold;

  return {
    ...state,
    bankroll,
    playerHands: resolvedHands,
    dealerHand: workingDealer,
    discardPile: shouldShuffle ? [] : [...state.discardPile, ...usedCards],
    shoe: shouldShuffle ? createShoe(state.config.deckCount) : workingShoe,
    runningCount: shouldShuffle ? 0 : workingRunningCount,
    trueCount: shouldShuffle ? 0 : getTrueCount(workingRunningCount, workingShoe.length),
    displayRunningCount: shouldShuffle ? 0 : workingRunningCount,
    displayTrueCount: shouldShuffle ? 0 : getTrueCount(workingRunningCount, workingShoe.length),
    phase: "betting",
    activeHandIndex: 0,
    currentBet: 0,
    insuranceOffered: false,
    insuranceTaken: false,
    insuranceBet: 0,
    dealerHasCheckedBlackjack: false,
    countCheckCompletedForRound: false,
    pendingCountDrillPrompt: state.config.countDrillMode || state.config.requireCountCheckBeforeDeal,
    message: shouldShuffle ? "Cut card reached. Shoe reshuffled." : "Round complete. Place your bet.",
    roundLog: shouldShuffle ? addRoundLog(workingRoundLog, "Cut card reached. New shoe shuffled.") : workingRoundLog,
    stats,
  };
}

function finalizeRoundAfterDealer(state, hands, dealerHand, shoe, runningCount, roundLog) {
  let bankroll = state.bankroll;
  let stats = { ...state.stats };
  let workingRoundLog = [...roundLog];

  if (state.insuranceTaken && state.insuranceBet > 0) {
    if (calculateHand(dealerHand).isBlackjack) {
      bankroll += state.insuranceBet * 3;
      workingRoundLog = addRoundLog(workingRoundLog, "Insurance wins.");
    } else {
      workingRoundLog = addRoundLog(workingRoundLog, "Insurance loses.");
    }
  }

  const dealerCalc = calculateHand(dealerHand);

  const resolvedHands = hands.map((hand) => {
    const calc = calculateHand(hand);
    let outcome = "loss";

    if (hand.surrendered) {
      outcome = "surrender";
      bankroll += hand.bet / 2;
      stats.losses += 1;
    } else if (calc.isBust) {
      outcome = "loss";
      stats.losses += 1;
    } else if (calc.isBlackjack && !dealerCalc.isBlackjack) {
      outcome = "blackjack";
      bankroll += hand.bet * (1 + state.config.blackjackPayout);
      stats.blackjacks += 1;
    } else if (dealerCalc.isBust) {
      outcome = "win";
      bankroll += hand.bet * 2;
      stats.wins += 1;
    } else if (dealerCalc.isBlackjack && !calc.isBlackjack) {
      outcome = "loss";
      stats.losses += 1;
    } else if (calc.total > dealerCalc.total) {
      outcome = "win";
      bankroll += hand.bet * 2;
      stats.wins += 1;
    } else if (calc.total === dealerCalc.total) {
      outcome = "push";
      bankroll += hand.bet;
      stats.pushes += 1;
    } else {
      outcome = "loss";
      stats.losses += 1;
    }

    return {
      ...hand,
      resolved: true,
      stood: true,
      outcome,
    };
  });

  stats.handsPlayed += resolvedHands.length;

  const usedCards = [...resolvedHands.flatMap((hand) => hand.cards), ...dealerHand.cards];
  const cutThreshold = Math.floor(state.config.deckCount * 52 * (1 - state.config.penetration));
  const shouldShuffle = shoe.length <= cutThreshold;

  return {
    ...state,
    bankroll,
    playerHands: resolvedHands,
    dealerHand,
    discardPile: shouldShuffle ? [] : [...state.discardPile, ...usedCards],
    shoe: shouldShuffle ? createShoe(state.config.deckCount) : shoe,
    runningCount: shouldShuffle ? 0 : runningCount,
    trueCount: shouldShuffle ? 0 : getTrueCount(runningCount, shoe.length),
    displayRunningCount: shouldShuffle ? 0 : runningCount,
    displayTrueCount: shouldShuffle ? 0 : getTrueCount(runningCount, shoe.length),
    phase: "betting",
    activeHandIndex: 0,
    currentBet: 0,
    insuranceOffered: false,
    insuranceTaken: false,
    insuranceBet: 0,
    dealerHasCheckedBlackjack: false,
    dealerTurnInProgress: false,
    dealerTurnStep: "idle",
    countCheckCompletedForRound: false,
    pendingCountDrillPrompt: state.config.countDrillMode || state.config.requireCountCheckBeforeDeal,
    message: shouldShuffle
      ? "Cut card reached. Shoe reshuffled."
      : state.config.countDrillMode || state.config.requireCountCheckBeforeDeal
      ? "Round complete. Check your count before the next deal."
      : "Round complete. Place your bet.",
    roundLog: shouldShuffle
      ? addRoundLog(workingRoundLog, "Cut card reached. New shoe shuffled.")
      : workingRoundLog,
    stats,
  };
}

function beginDealerTurn(state, roundLog) {
  return {
    ...state,
    phase: "dealerTurn",
    dealerTurnInProgress: true,
    dealerTurnStep: "revealHole",
    message: "Dealer turn...",
    roundLog: Array.isArray(roundLog) ? roundLog : state.roundLog,
  };
}

function Card({ card, hidden = false, delayMs = 0 }) {
  const suitColorClass = hidden ? "" : getSuitColorClass(card.suit);

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={`card-enter h-24 w-16 rounded-2xl border shadow-md flex items-center justify-center text-lg font-bold transition-transform duration-150 hover:-translate-y-0.5 ${
        hidden
          ? "bg-slate-800 text-slate-300 border-slate-700"
          : "bg-white border-slate-300 shadow-black/10"
      }`}
    >
      <span className={`transition-opacity duration-200 ${suitColorClass}`}>
        {hidden ? "🂠" : `${card.rank}${card.suit}`}
      </span>
    </div>
  );
}

function HandView({ title, hand, hideHoleCard = false, active = false, staggerMs = 120 }) {
  const visibleCards = hideHoleCard ? hand.cards.filter((_, index) => index !== 1) : hand.cards;
  const calc = calculateHand(hand);
  const totalText = hideHoleCard ? "?" : calc.total;

  return (
    <div
      className={`rounded-3xl border p-4 transition-all duration-200 ${
        active
          ? "active-hand-glow border-emerald-400 bg-emerald-950/20 shadow-lg shadow-emerald-900/20"
          : "border-slate-700 bg-slate-950/30"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</div>
            {active && (
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                Active
              </span>
            )}
          </div>
          <div className="text-sm text-slate-500">Bet: {formatMoney(hand.bet || 0)}</div>
        </div>
        <div className="text-right text-sm text-slate-300">
          <div>Total: {totalText}</div>
          {hand.outcome && <div className="capitalize text-slate-400">{hand.outcome}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {hand.cards.map((card, index) => (
          <Card
            key={card.id}
            card={card}
            hidden={hideHoleCard && index === 1}
            delayMs={index * staggerMs}
          />
        ))}
      </div>
      <div className="mt-3 text-sm text-slate-400">
        Visible count impact: {getVisibleCountDelta(visibleCards) >= 0 ? "+" : ""}
        {getVisibleCountDelta(visibleCards)}
      </div>
    </div>
  );
}

function SetupScreen({ config, onChange, onStart }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-3xl font-bold">Blackjack Count Trainer</h1>
        <p className="mt-2 text-slate-400">
          A browser trainer for realistic shoe play, bankroll pressure, and running/true count practice.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 transition-colors duration-150 hover:bg-slate-950/50">
            <div className="text-sm text-slate-400">Deck Count</div>
            <select
              className="mt-2 w-full rounded-xl bg-slate-800 p-3"
              value={config.deckCount}
              onChange={(e) => onChange("deckCount", Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count} deck{count > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 transition-colors duration-150 hover:bg-slate-950/50">
            <div className="text-sm text-slate-400">Starting Bankroll</div>
            <input
              className="mt-2 w-full rounded-xl bg-slate-800 p-3"
              type="number"
              min={100}
              step={100}
              value={config.startingBankroll}
              onChange={(e) => onChange("startingBankroll", Number(e.target.value))}
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 transition-colors duration-150 hover:bg-slate-950/50">
            <div className="text-sm text-slate-400">Table Minimum</div>
            <input
              className="mt-2 w-full rounded-xl bg-slate-800 p-3"
              type="number"
              min={1}
              step={1}
              value={config.tableMin}
              onChange={(e) => onChange("tableMin", Number(e.target.value))}
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 transition-colors duration-150 hover:bg-slate-950/50">
            <div className="text-sm text-slate-400">Penetration</div>
            <input
              className="mt-2 w-full"
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={config.penetration}
              onChange={(e) => onChange("penetration", Number(e.target.value))}
            />
            <div className="mt-2 text-sm text-slate-300">{Math.round(config.penetration * 100)}%</div>
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Realistic Count Mode</div>
              <div className="text-xs text-slate-500">
                Hidden dealer hole card does not affect visible trainer info until revealed.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.realisticCountMode}
              onChange={(e) => onChange("realisticCountMode", e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Manual Count Trainer</div>
              <div className="text-xs text-slate-500">
                Lets you enter your own running count and true count to check yourself.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.manualCountTrainer}
              onChange={(e) => onChange("manualCountTrainer", e.target.checked)}
              className="h-5 w-5"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Require Count Check Before Deal</div>
              <div className="text-xs text-slate-500">
                Prevents the next hand from starting until you check your running and true count.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.requireCountCheckBeforeDeal}
              onChange={(e) => onChange("requireCountCheckBeforeDeal", e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Count Drill Mode</div>
              <div className="text-xs text-slate-500">
                Emphasizes the count-check workflow after each completed round.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.countDrillMode}
              onChange={(e) => onChange("countDrillMode", e.target.checked)}
              className="h-5 w-5"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Dealer Hits Soft 17</div>
              <div className="text-xs text-slate-500">
                If off, dealer stands on all 17s.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.dealerHitsSoft17}
              onChange={(e) => onChange("dealerHitsSoft17", e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 transition-colors duration-150 hover:bg-slate-950/50">
            <div className="text-sm text-slate-400">Blackjack Payout</div>
            <select
              className="mt-2 w-full rounded-xl bg-slate-800 p-3"
              value={config.blackjackPayout}
              onChange={(e) => onChange("blackjackPayout", Number(e.target.value))}
            >
              <option value={1.5}>3:2</option>
              <option value={1.2}>6:5</option>
            </select>
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Double After Split</div>
              <div className="text-xs text-slate-500">
                Allow doubling on split hands.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.doubleAfterSplit}
              onChange={(e) => onChange("doubleAfterSplit", e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Allow Surrender</div>
              <div className="text-xs text-slate-500">
                Adds surrender as a player action.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.allowSurrender}
              onChange={(e) => onChange("allowSurrender", e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Allow Insurance</div>
              <div className="text-xs text-slate-500">
                Insurance offered when dealer shows an Ace.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.allowInsurance}
              onChange={(e) => onChange("allowInsurance", e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-slate-950/50 shadow-lg shadow-black/10">
            <div>
              <div className="text-sm text-slate-400">Allow Resplit</div>
              <div className="text-xs text-slate-500">
                If off, split hands cannot be split again.
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.allowResplit}
              onChange={(e) => onChange("allowResplit", e.target.checked)}
              className="h-5 w-5"
            />
          </label>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={onStart}
            className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}

function TableScreen({ state, setState, onReset }) {
  const decksRemaining = getDecksRemaining(state.shoe.length);
  const activeHand = state.playerHands[state.activeHandIndex] || createEmptyHand();
  const activeCalc = calculateHand(activeHand);
  const dealerUpcard = state.dealerHand?.cards?.[0] || null;
  const currentStrategyRecommendation =
    state.phase === "playerTurn"
      ? getBasicStrategyAction(activeHand, dealerUpcard, state.config)
      : null;
  const runningCountInputRef = useRef(null);
  const trueCountInputRef = useRef(null);

  const drillGateSatisfied =
    !state.config.requireCountCheckBeforeDeal || state.countCheckCompletedForRound || state.stats.handsPlayed === 0;

  const canDeal =
    state.phase === "betting" &&
    state.currentBet >= state.config.tableMin &&
    state.currentBet <= state.bankroll &&
    drillGateSatisfied;
  
  const canHit = state.phase === "playerTurn" && !activeHand.stood && !activeCalc.isBust;
  const canStand = state.phase === "playerTurn" && !activeHand.stood && !activeCalc.isBust;
  const canDouble =
    state.phase === "playerTurn" &&
    activeHand.cards.length === 2 &&
    !activeHand.doubled &&
    state.bankroll >= activeHand.bet &&
    (!isSplitHand(activeHand) || state.config.doubleAfterSplit);
  const canSplit =
    state.phase === "playerTurn" &&
    activeHand.cards.length === 2 &&
    activeHand.cards[0]?.rank === activeHand.cards[1]?.rank &&
    state.bankroll >= activeHand.bet &&
    (!isSplitHand(activeHand) || state.config.allowResplit);
  const canSurrender =
    state.phase === "playerTurn" &&
    state.config.allowSurrender &&
    activeHand.cards.length === 2 &&
    !activeHand.fromSplit &&
    !activeHand.doubled;
  const canInsurance =
    state.phase === "playerTurn" &&
    state.config.allowInsurance &&
    state.insuranceOffered &&
    !state.insuranceTaken &&
    state.bankroll >= Math.floor((state.playerHands[0]?.bet || 0) / 2);

  function patch(updater) {
    setState((prev) => (typeof updater === "function" ? updater(prev) : { ...prev, ...updater }));
  }

  function updateCountGuess(field, value) {
    patch((prev) => ({
      ...prev,
      [field]: value,
      countFeedback: null,
    }));
  }

  function clearCountFeedback() {
    patch((prev) => ({
      ...prev,
      countFeedback: null,
    }));
  }

  function checkCounts() {
    patch((prev) => {
      const runningGuessRaw = prev.playerCountGuess;
      const trueGuessRaw = prev.playerTrueCountGuess;

      if (runningGuessRaw === "" || trueGuessRaw === "") {
        return {
          ...prev,
          countFeedback: "Enter both a running count and true count first.",
        };
      }

      const runningGuess = Number(runningGuessRaw);
      const trueGuess = Number(trueGuessRaw);

      if (Number.isNaN(runningGuess) || Number.isNaN(trueGuess)) {
        return {
          ...prev,
          countFeedback: "Those guesses need to be valid numbers.",
        };
      }

      const actualRunning = prev.displayRunningCount;
      const actualTrue = prev.displayTrueCount;

      const runningDiff = runningGuess - actualRunning;
      const trueDiff = trueGuess - actualTrue;

      const runningCorrect = runningGuess === actualRunning;
      const trueCorrect = Math.abs(trueDiff) < 0.25;

      let feedback = "";

      if (runningCorrect && trueCorrect) {
        feedback = `Perfect. Running count is ${actualRunning >= 0 ? "+" : ""}${actualRunning} and true count is ${actualTrue >= 0 ? "+" : ""}${actualTrue.toFixed(2)}.`;
      } else if (runningCorrect && !trueCorrect) {
        feedback = `Running count is correct. True count is off by ${Math.abs(trueDiff).toFixed(2)}. Actual true count: ${actualTrue >= 0 ? "+" : ""}${actualTrue.toFixed(2)}.`;
      } else if (!runningCorrect && trueCorrect) {
        feedback = `True count is correct. Running count is off by ${Math.abs(runningDiff)}. Actual running count: ${actualRunning >= 0 ? "+" : ""}${actualRunning}.`;
      } else {
        feedback = `Not quite. Running count actual: ${actualRunning >= 0 ? "+" : ""}${actualRunning} (${runningDiff > 0 ? "you were high" : "you were low"} by ${Math.abs(runningDiff)}). True count actual: ${actualTrue >= 0 ? "+" : ""}${actualTrue.toFixed(2)} (${trueDiff > 0 ? "you were high" : "you were low"} by ${Math.abs(trueDiff).toFixed(2)}).`;
      }

      return {
        ...prev,
        countFeedback: feedback,
        countCheckCompletedForRound: true,
        pendingCountDrillPrompt: false,
      };
    });
  }

  useEffect(() => {
    if (!state.dealerTurnInProgress || state.phase !== "dealerTurn") return;

    const timer = setTimeout(() => {
      setState((prev) => {
        if (!prev.dealerTurnInProgress || prev.phase !== "dealerTurn") {
          return prev;
        }

        const dealerHand = { ...prev.dealerHand, cards: [...prev.dealerHand.cards] };
        let shoe = [...prev.shoe];
        let runningCount = prev.runningCount;
        let roundLog = [...prev.roundLog];

        if (prev.dealerTurnStep === "revealHole") {
          const holeCard = dealerHand.cards[1];
          if (holeCard) {
            runningCount += holeCard.hiLo;
            roundLog = addRoundLog(roundLog, `Dealer reveals ${holeCard.rank}${holeCard.suit}`);
          }

          const trueCount = getTrueCount(runningCount, shoe.length);
          const dealerMustHit = shouldDealerHit(dealerHand, prev.config.dealerHitsSoft17);

          if (!dealerMustHit) {
            return finalizeRoundAfterDealer(
              {
                ...prev,
                dealerHand,
                runningCount,
                trueCount,
                displayRunningCount: runningCount,
                displayTrueCount: trueCount,
              },
              prev.playerHands,
              dealerHand,
              shoe,
              runningCount,
              roundLog
            );
          }

          return {
            ...prev,
            dealerHand,
            runningCount,
            trueCount,
            displayRunningCount: runningCount,
            displayTrueCount: trueCount,
            dealerTurnStep: "draw",
            roundLog,
            message: "Dealer reveals hole card...",
          };
        }

        if (prev.dealerTurnStep === "draw") {
          const dealt = dealCard(shoe);
          if (!dealt.card) {
            return finalizeRoundAfterDealer(prev, prev.playerHands, dealerHand, shoe, runningCount, roundLog);
          }

          dealerHand.cards.push(dealt.card);
          shoe = dealt.shoe;
          runningCount += dealt.card.hiLo;
          roundLog = addRoundLog(roundLog, `Dealer hits ${dealt.card.rank}${dealt.card.suit}`);

          const trueCount = getTrueCount(runningCount, shoe.length);
          const dealerMustHitAgain = shouldDealerHit(dealerHand, prev.config.dealerHitsSoft17);

          if (!dealerMustHitAgain) {
            return finalizeRoundAfterDealer(
              {
                ...prev,
                dealerHand,
                shoe,
                runningCount,
                trueCount,
                displayRunningCount: runningCount,
                displayTrueCount: trueCount,
              },
              prev.playerHands,
              dealerHand,
              shoe,
              runningCount,
              roundLog
            );
          }

          return {
            ...prev,
            dealerHand,
            shoe,
            runningCount,
            trueCount,
            displayRunningCount: runningCount,
            displayTrueCount: trueCount,
            dealerTurnStep: "draw",
            roundLog,
            message: "Dealer draws...",
          };
        }

        return prev;
      });
    }, state.dealerTurnStep === "revealHole" ? 700 : 850);

    return () => clearTimeout(timer);
  }, [
    state.dealerTurnInProgress,
    state.dealerTurnStep,
    state.phase,
    setState,
  ]);

  function applyStrategyFeedback(prev, action, handOverride = null) {
    const hand = handOverride || prev.playerHands[prev.activeHandIndex];
    const dealerUp = prev.dealerHand?.cards?.[0];
    const recommendation = getBasicStrategyAction(hand, dealerUp, prev.config);

    if (!recommendation) {
      return {
        feedback: null,
        explanation: null,
        stats: prev.stats,
      };
    }

    const correct = doesActionMatchRecommendation(action, recommendation);
    const explanation = getStrategyExplanation(hand, dealerUp, recommendation, prev.config);

    return {
      feedback: {
        action,
        recommendation,
        correct,
      },
      explanation,
      stats: {
        ...prev.stats,
        strategyCorrect: prev.stats.strategyCorrect + (correct ? 1 : 0),
        strategyMistakes: prev.stats.strategyMistakes + (correct ? 0 : 1),
      },
    };
  }

  function handleCountInputKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      checkCounts();
    }
  }

  function moveToNextHandOrDealer(nextState, nextHands, extraLog, messageForNextHand = "Next hand") {
    const nextIndex = getNextActiveHandIndex(nextHands, nextState.activeHandIndex + 1);
    if (nextIndex !== -1) {
      return {
        ...nextState,
        playerHands: nextHands,
        activeHandIndex: nextIndex,
        phase: "playerTurn",
        message: `${messageForNextHand}: Hand ${nextIndex + 1}`,
        roundLog: addRoundLog(nextState.roundLog, extraLog),
      };
    }

    return beginDealerTurn(
      {
        ...nextState,
        playerHands: nextHands,
        roundLog: addRoundLog(nextState.roundLog, extraLog),
      },
      addRoundLog(nextState.roundLog, extraLog)
    );
  }

  function startRound() {
    patch((prev) => {
      if (!(prev.phase === "betting" && prev.currentBet >= prev.config.tableMin && prev.currentBet <= prev.bankroll)) {
        return prev;
      }

      let shoe = [...prev.shoe];
      const visibleCards = [];

      let dealt = dealCard(shoe);
      const playerCard1 = dealt.card;
      shoe = dealt.shoe;
      visibleCards.push(playerCard1);

      dealt = dealCard(shoe);
      const dealerCard1 = dealt.card;
      shoe = dealt.shoe;
      visibleCards.push(dealerCard1);

      dealt = dealCard(shoe);
      const playerCard2 = dealt.card;
      shoe = dealt.shoe;
      visibleCards.push(playerCard2);

      dealt = dealCard(shoe);
      const dealerCard2 = dealt.card;
      shoe = dealt.shoe;

      const playerHand = createEmptyHand({ cards: [playerCard1, playerCard2], bet: prev.currentBet });
      const dealerHand = createEmptyHand({ cards: [dealerCard1, dealerCard2] });
      const counts = applyVisibleCardsToCount(prev.runningCount, shoe.length, visibleCards);
      const playerCalc = calculateHand(playerHand);
      const dealerUp = dealerHand.cards[0];

      const insuranceOffered =
        prev.config.allowInsurance &&
        dealerUp &&
        dealerUp.rank === "A";

      const displayedCounts = getDisplayedCounts(
        prev.config,
        counts.runningCount,
        counts.trueCount,
        dealerHand,
        "playerTurn",
        shoe.length
      );

      const nextState = {
        ...prev,
        bankroll: prev.bankroll - prev.currentBet,
        lastBet: prev.currentBet,
        currentBet: 0,
        shoe,
        playerHands: [playerHand],
        dealerHand,
        activeHandIndex: 0,
        runningCount: counts.runningCount,
        trueCount: counts.trueCount,
        displayRunningCount: displayedCounts.displayRunningCount,
        displayTrueCount: displayedCounts.displayTrueCount,
        playerCountGuess: "",
        playerTrueCountGuess: "",
        countFeedback: null,
        insuranceOffered,
        insuranceTaken: false,
        insuranceBet: 0,
        dealerHasCheckedBlackjack: false,
        lastStrategyFeedback: null,
        lastStrategyExplanation: null,
        countCheckCompletedForRound: false,
        pendingCountDrillPrompt: false,
        dealerTurnInProgress: false,
        dealerTurnStep: "idle",
        phase: "playerTurn",
        message: insuranceOffered ? "Dealer shows Ace. Insurance available." : "Player turn",
        roundLog: [
          `Player dealt ${playerCard1.rank}${playerCard1.suit}, ${playerCard2.rank}${playerCard2.suit}`,
          `Dealer showing ${dealerUp.rank}${dealerUp.suit}`,
        ],
      };

      if (playerCalc.isBlackjack) {
        return beginDealerTurn(
          {
            ...nextState,
            phase: "dealerTurn",
            message: "Blackjack. Dealer resolving...",
          },
          nextState.roundLog
        );
      }

      return nextState;
    });
  }

  function addChip(value) {
    patch((prev) => {
      if (prev.phase !== "betting") return prev;
      if (prev.currentBet + value > prev.bankroll) return prev;
      return { ...prev, currentBet: prev.currentBet + value };
    });
  }

  function clearBet() {
    patch((prev) => (prev.phase === "betting" ? { ...prev, currentBet: 0 } : prev));
  }

  function rebet() {
    patch((prev) => {
      if (prev.phase !== "betting") return prev;
      if (!prev.lastBet || prev.lastBet > prev.bankroll) return prev;
      return { ...prev, currentBet: prev.lastBet };
    });
  }

  function hit() {
    patch((prev) => {
      if (prev.phase !== "playerTurn") return prev;
      const hand = prev.playerHands[prev.activeHandIndex];
      if (!hand) return prev;

      const dealt = dealCard(prev.shoe);
      if (!dealt.card) return prev;

      const nextHands = [...prev.playerHands];
      nextHands[prev.activeHandIndex] = {
        ...hand,
        cards: [...hand.cards, dealt.card],
      };

      const runningCount = prev.runningCount + dealt.card.hiLo;
      const trueCount = getTrueCount(runningCount, dealt.shoe.length);
      const displayedCounts = getDisplayedCounts(
        prev.config,
        runningCount,
        trueCount,
        prev.dealerHand,
        "playerTurn",
        dealt.shoe.length
      );

      const strategyResult = applyStrategyFeedback(prev, "hit", hand);

      const nextState = {
        ...prev,
        shoe: dealt.shoe,
        playerHands: nextHands,
        runningCount,
        trueCount,
        displayRunningCount: displayedCounts.displayRunningCount,
        displayTrueCount: displayedCounts.displayTrueCount,
        lastStrategyFeedback: strategyResult.feedback,
        lastStrategyExplanation: strategyResult.explanation,
        stats: strategyResult.stats,
        roundLog: addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} hits ${dealt.card.rank}${dealt.card.suit}`),
      };

      const calc = calculateHand(nextHands[prev.activeHandIndex]);
      if (!calc.isBust) {
        return {
          ...nextState,
          message: `Hand ${prev.activeHandIndex + 1} total: ${calc.total}`,
        };
      }

      nextHands[prev.activeHandIndex] = {
        ...nextHands[prev.activeHandIndex],
        stood: true,
      };

      if (allPlayerHandsFinished(nextHands)) {
        return beginDealerTurn(
          {
            ...nextState,
            playerHands: nextHands,
            roundLog: addRoundLog(nextState.roundLog, `Hand ${prev.activeHandIndex + 1} busts`),
          },
          addRoundLog(nextState.roundLog, `Hand ${prev.activeHandIndex + 1} busts`)
        );
      }

      const nextIndex = getNextActiveHandIndex(nextHands, prev.activeHandIndex + 1);
      return {
        ...nextState,
        playerHands: nextHands,
        activeHandIndex: nextIndex,
        message: `Hand ${prev.activeHandIndex + 1} busts. Hand ${nextIndex + 1} active.`,
        roundLog: addRoundLog(nextState.roundLog, `Hand ${prev.activeHandIndex + 1} busts`),
      };
    });
  }

  function stand() {
    patch((prev) => {
      if (prev.phase !== "playerTurn") return prev;
      const nextHands = [...prev.playerHands];
      nextHands[prev.activeHandIndex] = {
        ...nextHands[prev.activeHandIndex],
        stood: true,
      };

      const strategyResult = applyStrategyFeedback(prev, "stand", prev.playerHands[prev.activeHandIndex]);

      if (allPlayerHandsFinished(nextHands)) {
        return beginDealerTurn(
          {
            ...prev,
            playerHands: nextHands,
            lastStrategyFeedback: strategyResult.feedback,
            lastStrategyExplanation: strategyResult.explanation,
            stats: strategyResult.stats,
            roundLog: addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} stands`),
          },
          addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} stands`)
        );
      }

      const nextIndex = getNextActiveHandIndex(nextHands, prev.activeHandIndex + 1);
      return {
        ...prev,
        playerHands: nextHands,
        activeHandIndex: nextIndex,
        lastStrategyFeedback: strategyResult.feedback,
        lastStrategyExplanation: strategyResult.explanation,
        stats: strategyResult.stats,
        message: `Hand ${prev.activeHandIndex + 1} stands. Hand ${nextIndex + 1} active.`,
        roundLog: addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} stands`),
      };
    });
  }

  function doubleDown() {
    patch((prev) => {
      if (prev.phase !== "playerTurn") return prev;
      const hand = prev.playerHands[prev.activeHandIndex];
      if (!hand || hand.cards.length !== 2 || prev.bankroll < hand.bet) return prev;

      const dealt = dealCard(prev.shoe);
      if (!dealt.card) return prev;

      const nextHands = [...prev.playerHands];
      nextHands[prev.activeHandIndex] = {
        ...hand,
        bet: hand.bet * 2,
        doubled: true,
        stood: true,
        cards: [...hand.cards, dealt.card],
      };

      const strategyResult = applyStrategyFeedback(prev, "double", hand);

      const runningCount = prev.runningCount + dealt.card.hiLo;
      const trueCount = getTrueCount(runningCount, dealt.shoe.length);
      const displayedCounts = getDisplayedCounts(
        prev.config,
        runningCount,
        trueCount,
        prev.dealerHand,
        "playerTurn",
        dealt.shoe.length
      );

      const nextState = {
        ...prev,
        bankroll: prev.bankroll - hand.bet,
        shoe: dealt.shoe,
        playerHands: nextHands,
        runningCount,
        trueCount,
        displayRunningCount: displayedCounts.displayRunningCount,
        displayTrueCount: displayedCounts.displayTrueCount,
        lastStrategyFeedback: strategyResult.feedback,
        lastStrategyExplanation: strategyResult.explanation,
        stats: strategyResult.stats,
      };

      if (allPlayerHandsFinished(nextHands)) {
        return beginDealerTurn(
          {
            ...nextState,
            roundLog: addRoundLog(
              prev.roundLog,
              `Hand ${prev.activeHandIndex + 1} doubles and draws ${dealt.card.rank}${dealt.card.suit}`
            ),
          },
          addRoundLog(
            prev.roundLog,
            `Hand ${prev.activeHandIndex + 1} doubles and draws ${dealt.card.rank}${dealt.card.suit}`
          )
        );
      }

      const nextIndex = getNextActiveHandIndex(nextHands, prev.activeHandIndex + 1);
      return {
        ...nextState,
        activeHandIndex: nextIndex,
        message: `Hand ${prev.activeHandIndex + 1} doubles. Hand ${nextIndex + 1} active.`,
        roundLog: addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} doubles and draws ${dealt.card.rank}${dealt.card.suit}`),
      };
    });
  }

  function split() {
    patch((prev) => {
      if (prev.phase !== "playerTurn") return prev;

      const hand = prev.playerHands[prev.activeHandIndex];
      if (!hand) return prev;

      const canResplitThisHand = !hand.fromSplit || prev.config.allowResplit;

      if (
        hand.cards.length !== 2 ||
        hand.cards[0].rank !== hand.cards[1].rank ||
        prev.bankroll < hand.bet ||
        !canResplitThisHand
      ) {
        return prev;
      }

      let shoe = [...prev.shoe];

      const firstDraw = dealCard(shoe);
      shoe = firstDraw.shoe;

      const secondDraw = dealCard(shoe);
      shoe = secondDraw.shoe;

      if (!firstDraw.card || !secondDraw.card) return prev;

      const nextSplitDepth = (hand.splitDepth || 0) + 1;

      const firstHand = createEmptyHand({
        cards: [hand.cards[0], firstDraw.card],
        bet: hand.bet,
        fromSplit: true,
        splitDepth: nextSplitDepth,
      });

      const secondHand = createEmptyHand({
        cards: [hand.cards[1], secondDraw.card],
        bet: hand.bet,
        fromSplit: true,
        splitDepth: nextSplitDepth,
      });

      const nextHands = [...prev.playerHands];
      nextHands.splice(prev.activeHandIndex, 1, firstHand, secondHand);
      
      const strategyResult = applyStrategyFeedback(prev, "split", hand);

      const runningCount = prev.runningCount + firstDraw.card.hiLo + secondDraw.card.hiLo;
      const trueCount = getTrueCount(runningCount, shoe.length);
      const displayedCounts = getDisplayedCounts(
        prev.config,
        runningCount,
        trueCount,
        prev.dealerHand,
        "playerTurn",
        shoe.length
      );

      return {
        ...prev,
        bankroll: prev.bankroll - hand.bet,
        shoe,
        playerHands: nextHands,
        runningCount,
        trueCount,
        displayRunningCount: displayedCounts.displayRunningCount,
        displayTrueCount: displayedCounts.displayTrueCount,
        lastStrategyFeedback: strategyResult.feedback,
        lastStrategyExplanation: strategyResult.explanation,
        stats: strategyResult.stats,
        activeHandIndex: prev.activeHandIndex,
        message: `Split complete. Hand ${prev.activeHandIndex + 1} active`,
        roundLog: addRoundLog(
          prev.roundLog,
          `Hand ${prev.activeHandIndex + 1} splits`,
          `New cards: ${firstDraw.card.rank}${firstDraw.card.suit} and ${secondDraw.card.rank}${secondDraw.card.suit}`
        ),
      };
    });
  }

  function surrender() {
    patch((prev) => {
      if (prev.phase !== "playerTurn" || !prev.config.allowSurrender) return prev;

      const hand = prev.playerHands[prev.activeHandIndex];
      if (!hand) return prev;

      const notEligible =
        hand.cards.length !== 2 ||
        hand.fromSplit ||
        hand.doubled;

      if (notEligible) return prev;

      const nextHands = [...prev.playerHands];
      nextHands[prev.activeHandIndex] = {
        ...hand,
        surrendered: true,
        stood: true,
        resolved: true,
      };

      const strategyResult = applyStrategyFeedback(prev, "surrender", hand);

      return beginDealerTurn(
        {
          ...prev,
          playerHands: nextHands,
          lastStrategyFeedback: strategyResult.feedback,
          lastStrategyExplanation: strategyResult.explanation,
          stats: strategyResult.stats,
          roundLog: addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} surrenders`),
        },
        addRoundLog(prev.roundLog, `Hand ${prev.activeHandIndex + 1} surrenders`)
      );
    });
  }

  function takeInsurance() {
    patch((prev) => {
      if (
        prev.phase !== "playerTurn" ||
        !prev.config.allowInsurance ||
        !prev.insuranceOffered ||
        prev.insuranceTaken
      ) {
        return prev;
      }

      const mainBet = prev.playerHands[0]?.bet || 0;
      const insuranceBet = Math.floor(mainBet / 2);

      if (insuranceBet <= 0 || prev.bankroll < insuranceBet) {
        return prev;
      }

      return {
        ...prev,
        bankroll: prev.bankroll - insuranceBet,
        insuranceTaken: true,
        insuranceBet,
        roundLog: addRoundLog(prev.roundLog, `Insurance taken for ${formatMoney(insuranceBet)}`),
        message: "Insurance placed. Player turn.",
      };
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_28%),linear-gradient(to_bottom,_#020617,_#020617)] text-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="panel-fade flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-2xl shadow-black/20 backdrop-blur-sm">
          <div>
            <h1 className="text-2xl font-bold">Blackjack Count Trainer</h1>
            <div className="mt-1 text-sm text-emerald-200/80">{state.message}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                patch((prev) => ({
                  ...prev,
                  showTrainer: !prev.showTrainer,
                  countFeedback: null,
                }))
              }
              className="rounded-2xl border border-slate-700 px-4 py-2 hover:bg-slate-800"
            >
              {state.showTrainer ? "Hide" : "Show"} Trainer
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="panel-fade rounded-3xl border border-emerald-900/60 bg-emerald-950/25 p-5 shadow-xl shadow-black/20">
              <HandView
                title="Dealer"
                hand={state.dealerHand}
                hideHoleCard={state.phase === "playerTurn"}
                staggerMs={220}
              />
            </div>

            <div className="panel-fade rounded-3xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl shadow-black/20">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Player</div>
              <div className="grid gap-3 md:grid-cols-2">
                {state.playerHands.map((hand, index) => (
                  <HandView
                    key={`${index}-${hand.cards.map((card) => card.id).join("-")}`}
                    title={`Hand ${index + 1}`}
                    hand={hand}
                    active={state.phase === "playerTurn" && index === state.activeHandIndex}
                  />
                ))}
              </div>
            </div>

            <div className="panel-fade rounded-3xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl shadow-black/20">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-400">Current Bet</div>
                  <div className="text-2xl font-bold">{formatMoney(state.currentBet)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CHIP_VALUES.map((value) => (
                    <button
                      key={value}
                      onClick={() => addChip(value)}
                      className="h-12 w-12 rounded-full border border-amber-300 bg-amber-200 text-sm font-bold text-slate-900 shadow-md shadow-black/10 transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                      disabled={state.phase !== "betting" || state.currentBet + value > state.bankroll}
                    >
                      {value}
                    </button>
                  ))}
                  <button onClick={clearBet} className="rounded-2xl border border-slate-700 px-4 py-2 disabled:opacity-40" disabled={state.phase !== "betting"}>
                    Clear
                  </button>
                  <button onClick={rebet} className="rounded-2xl border border-slate-700 px-4 py-2 disabled:opacity-40" disabled={state.phase !== "betting" || !state.lastBet}>
                    Rebet
                  </button>
                  <button
                    onClick={startRound}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"
                    disabled={!canDeal}
                  >
                    Deal
                  </button>
                </div>
              </div>

              {state.phase === "betting" && !drillGateSatisfied && (
                <div className="mt-3 text-sm text-fuchsia-300">
                  Count check required before the next deal.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button onClick={hit} disabled={!canHit} className="rounded-2xl border border-slate-700 px-4 py-2 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">
                  Hit
                </button>
                <button onClick={stand} disabled={!canStand} className="rounded-2xl border border-slate-700 px-4 py-2 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">
                  Stand
                </button>
                <button onClick={doubleDown} disabled={!canDouble} className="rounded-2xl border border-slate-700 px-4 py-2 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">
                  Double
                </button>
                <button onClick={split} disabled={!canSplit} className="rounded-2xl border border-slate-700 px-4 py-2 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">
                  Split
                </button>
                <button onClick={surrender} disabled={!canSurrender} className="rounded-2xl border border-slate-700 px-4 py-2 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">
                  Surrender
                </button>
                <button onClick={takeInsurance} disabled={!canInsurance} className="rounded-2xl border border-slate-700 px-4 py-2 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">
                  Insurance
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel-fade rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-black/20">
              <div className="text-sm text-slate-400">Bankroll</div>
              <div className="text-3xl font-bold">{formatMoney(state.bankroll)}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-800 p-3">
                  <div className="text-slate-400">Cards Left</div>
                  <div className="mt-1 text-lg font-semibold">{state.shoe.length}</div>
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  <div className="text-slate-400">Decks Left</div>
                  <div className="mt-1 text-lg font-semibold">{decksRemaining.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  <div className="text-slate-400">Discarded</div>
                  <div className="mt-1 text-lg font-semibold">{state.discardPile.length}</div>
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  <div className="text-slate-400">Hands Played</div>
                  <div className="mt-1 text-lg font-semibold">{state.stats.handsPlayed}</div>
                </div>
              </div>
            </div>

            {state.insuranceOffered && (
              <div className="rounded-3xl border border-amber-700 bg-amber-950/20 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-amber-300">
                  Insurance Offer
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  Dealer is showing an Ace.
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {state.insuranceTaken
                    ? `Insurance placed: ${formatMoney(state.insuranceBet)}`
                    : "You may place an insurance side bet worth half your original wager."}
                </div>
              </div>
            )}

            <div className="panel-fade rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-black/20">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">Table Rules</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-300">
                <div className="rounded-2xl bg-slate-800 p-3">
                  Dealer: {state.config.dealerHitsSoft17 ? "Hits Soft 17" : "Stands on Soft 17"}
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  Blackjack Pays: {state.config.blackjackPayout === 1.5 ? "3:2" : "6:5"}
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  Double After Split: {state.config.doubleAfterSplit ? "Allowed" : "Not Allowed"}
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  Surrender: {state.config.allowSurrender ? "Allowed" : "Off"}
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  Insurance: {state.config.allowInsurance ? "Allowed" : "Off"}
                </div>
                <div className="rounded-2xl bg-slate-800 p-3">
                  Resplit: {state.config.allowResplit ? "Allowed" : "Off"}
                </div>
              </div>
            </div>
            
            <div className="panel-fade rounded-3xl border border-emerald-700 bg-emerald-950/20 p-4">
              <div className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Basic Strategy
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Recommendation for the active hand against the dealer upcard.
              </div>

              <div className="mt-4 rounded-2xl bg-slate-900 p-3">
                <div className="text-xs text-slate-400">Recommended Move</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {currentStrategyRecommendation || "—"}
                </div>
              </div>

              {state.lastStrategyFeedback && (
                <div
                  className={`mt-3 rounded-2xl p-3 text-sm ${
                    state.lastStrategyFeedback.correct
                      ? "bg-emerald-900/40 text-emerald-200"
                      : "bg-amber-900/40 text-amber-200"
                  }`}
                >
                  {state.lastStrategyFeedback.correct
                    ? `Correct. You chose ${state.lastStrategyFeedback.action}, and basic strategy agrees.`
                    : `You chose ${state.lastStrategyFeedback.action}, but basic strategy recommends ${state.lastStrategyFeedback.recommendation}.`}
                </div>
              )}
            </div>
            
            {state.phase === "betting" && state.lastStrategyFeedback && state.lastStrategyExplanation && (
              <div className="panel-fade rounded-3xl border border-cyan-700 bg-cyan-950/20 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
                  Why That Move Was Correct
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  {state.lastStrategyFeedback.correct
                    ? `Your last decision matched basic strategy.`
                    : `Your last decision did not match basic strategy.`}
                </div>
                <div className="mt-3 rounded-2xl bg-slate-900 p-3 text-sm text-slate-200">
                  {state.lastStrategyExplanation}
                </div>
              </div>
            )}

            {state.pendingCountDrillPrompt && (
              <div className="panel-fade rounded-3xl border border-fuchsia-700 bg-fuchsia-950/20 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-fuchsia-300">
                  Count Drill Prompt
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  The round is over. Enter your running count and true count, then check them before starting the next hand.
                </div>
              </div>
            )}

            {state.config.manualCountTrainer && (
              <div className="panel-fade rounded-3xl border border-violet-700 bg-violet-950/20 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-violet-300">
                  Manual Count Check
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Test yourself without revealing the trainer overlay.
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Your Running Count</label>
                    <input
                      ref={runningCountInputRef}
                      type="number"
                      value={state.playerCountGuess}
                      onChange={(e) => updateCountGuess("playerCountGuess", e.target.value)}
                      onFocus={clearCountFeedback}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          trueCountInputRef.current?.focus();
                        }
                      }}
                      className="w-full rounded-xl bg-slate-900 p-3 text-slate-100 outline-none ring-0"
                      placeholder="Enter running count"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Your True Count</label>
                    <input
                      ref={trueCountInputRef}
                      type="number"
                      step="0.1"
                      value={state.playerTrueCountGuess}
                      onChange={(e) => updateCountGuess("playerTrueCountGuess", e.target.value)}
                      onFocus={clearCountFeedback}
                      onKeyDown={handleCountInputKeyDown}
                      className="w-full rounded-xl bg-slate-900 p-3 text-slate-100 outline-none ring-0"
                      placeholder="Enter true count"
                    />
                  </div>

                  <button
                    onClick={checkCounts}
                    className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-800"
                  >
                    Check Counts
                  </button>

                  {state.countFeedback && (
                    <div
                      className={`rounded-2xl p-3 text-sm ${
                        state.countFeedback.startsWith("Perfect")
                          ? "bg-emerald-900/40 text-emerald-200"
                          : state.countFeedback.startsWith("Running count is correct") ||
                            state.countFeedback.startsWith("True count is correct")
                          ? "bg-amber-900/40 text-amber-200"
                          : "bg-slate-800 text-slate-200"
                      }`}
                    >
                      {state.countFeedback}
                    </div>
                  )}
                </div>
              </div>
            )}

            {state.showTrainer && (
              <div className="panel-fade rounded-3xl border border-sky-700 bg-sky-950/30 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-sky-300">Trainer Overlay</div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-slate-900 p-3">
                    <div className="text-sm text-slate-400">Running Count</div>
                    <div className="text-2xl font-bold">
                      {state.displayRunningCount >= 0 ? "+" : ""}
                      {state.displayRunningCount}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-900 p-3">
                    <div className="text-sm text-slate-400">True Count</div>
                    <div className="text-2xl font-bold">
                      {state.displayTrueCount >= 0 ? "+" : ""}
                      {state.displayTrueCount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="panel-fade rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-black/20">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">Session Stats</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-800 p-3">Wins: {state.stats.wins}</div>
                <div className="rounded-2xl bg-slate-800 p-3">Losses: {state.stats.losses}</div>
                <div className="rounded-2xl bg-slate-800 p-3">Pushes: {state.stats.pushes}</div>
                <div className="rounded-2xl bg-slate-800 p-3">Blackjacks: {state.stats.blackjacks}</div>
                <div className="rounded-2xl bg-slate-800 p-3">Strategy Correct: {state.stats.strategyCorrect}</div>
                <div className="rounded-2xl bg-slate-800 p-3">Strategy Mistakes: {state.stats.strategyMistakes}</div>
              </div>
            </div>

            <div className="panel-fade rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-black/20">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">Round Log</div>
              <div className="mt-3 max-h-64 space-y-2 overflow-auto text-sm text-slate-300">
                {state.roundLog.length === 0 ? (
                  <div className="text-slate-500">No actions yet.</div>
                ) : (
                  state.roundLog.map((entry, index) => (
                    <div
                      key={`${entry}-${index}`}
                      className="rounded-xl bg-slate-800/70 px-3 py-2 leading-relaxed"
                    >
                      • {entry}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const defaultConfig = useMemo(
  () => ({
    deckCount: 5,
    startingBankroll: 1000,
    tableMin: 10,
    penetration: 0.75,
    dealerHitsSoft17: false,
    realisticCountMode: true,
    manualCountTrainer: true,
    blackjackPayout: 1.5,
    doubleAfterSplit: true,
    allowSurrender: true,
    allowInsurance: true,
    allowResplit: false,
    requireCountCheckBeforeDeal: false,
    countDrillMode: false,
  }),
  []
);

  const [config, setConfig] = useState(defaultConfig);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState(buildInitialState(defaultConfig));

  function handleConfigChange(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function startSession() {
    setState(buildInitialState(config));
    setStarted(true);
  }

  function resetSession() {
    setStarted(false);
  }

  const animationStyles = `
    @keyframes cardEnter {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes panelFade {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes glowPulse {
      0%, 100% {
        box-shadow: 0 0 0 rgba(52, 211, 153, 0);
      }
      50% {
        box-shadow: 0 0 24px rgba(52, 211, 153, 0.18);
      }
    }

    .card-enter {
      animation: cardEnter 220ms ease-out;
    }

    .panel-fade {
      animation: panelFade 220ms ease-out;
    }

    .active-hand-glow {
      animation: glowPulse 1.6s ease-in-out infinite;
    }
    `;

  if (!started) {
    return (
      <>
        <style>{animationStyles}</style>
        <SetupScreen config={config} onChange={handleConfigChange} onStart={startSession} />
      </>
    );
  }

  return (
    <>
      <style>{animationStyles}</style>
      <TableScreen state={state} setState={setState} onReset={resetSession} />
    </>
  );
}
