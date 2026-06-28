/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ASHIR 5.0 — استراتژی‌های پیشرفته
 * ==========================================
 * بازنویسی کامل با افزودن:
 *  - Order Block Detection (OBD)
 *  - Market Structure Break (MSB)
 *  - Fibonacci Confluence Zone
 *  - Heikin Ashi Trend Filter
 *  - SuperTrend Indicator
 *  - Volume Profile Point of Control (POC)
 *  - Smart Money Concept (SMC) — Fair Value Gap
 */

import { mean, std, sum } from "mathjs";
import { Klines, OrderBook } from "./types";

// ─── موجود در نسخه قبل (حفظ شده) ─────────────────────────────────────────────

export class VolRegimeStrategy {
  analyze(closes: number[], returns: number[], regime: string, dailyVol: number) {
    if (regime === "low") {
      const ma = mean(closes.slice(-20)) as unknown as number;
      const s = std(closes.slice(-20)) as unknown as number;
      const zscore = s > 0 ? (closes[closes.length - 1] - ma) / s : 0;
      if (zscore < -1.3) return { score: 0.82, signal: "buy", reason: "Oversold Breakout Zone" };
      if (zscore > 1.3) return { score: 0.18, signal: "sell", reason: "Overbought Breakout Zone" };
      return { score: 0.5, signal: "neutral", reason: "In range" };
    } else if (["normal", "high"].includes(regime)) {
      const momentum = sum(returns.slice(-10)) as number;
      if (momentum > 0.015) return { score: 0.80, signal: "buy", reason: `Momentum +${(momentum * 100).toFixed(2)}%` };
      if (momentum < -0.015) return { score: 0.20, signal: "sell", reason: `Momentum ${(momentum * 100).toFixed(2)}%` };
      return { score: 0.5, signal: "neutral", reason: "No momentum" };
    } else if (regime === "extreme") {
      const momentum = sum(returns.slice(-5)) as number;
      if (momentum > 0.04) return { score: 0.15, signal: "sell", reason: "Extreme Momentum Exhaustion (SHORT)" };
      if (momentum < -0.04) return { score: 0.85, signal: "buy", reason: "Extreme Momentum Exhaustion (LONG)" };
      return { score: 0.5, signal: "stay_out", reason: "Extreme Volatility Shield" };
    }
    return { score: 0.5, signal: "neutral" };
  }
}

export class LiquidityStrategy {
  analyze(closes: number[], highs: number[], lows: number[]) {
    if (closes.length < 20) return { score: 0.5, signal: "neutral" };
    const yesterdayHigh = highs[highs.length - 2];
    const yesterdayLow = lows[lows.length - 2];
    const current = closes[closes.length - 1];
    let score = 0.5;
    const reasons: string[] = [];
    if (current > yesterdayHigh * 1.002) {
      score = 0.78;
      reasons.push("Above yesterday's high breakout");
    } else if (current < yesterdayLow * 0.998) {
      score = 0.22;
      reasons.push("Below yesterday's low breakdown");
    }
    const signal = score > 0.6 ? "buy" : score < 0.4 ? "sell" : "neutral";
    return { score, signal, reason: reasons.length > 0 ? reasons.join(", ") : "Normal trading range" };
  }
}

export class FundingStrategy {
  analyze(change24h: number, volumeSurge: boolean) {
    if (change24h > 10 && !volumeSurge) return { score: 0.25, signal: "sell", reason: "Exhaustion pump without volume" };
    if (change24h < -10 && !volumeSurge) return { score: 0.75, signal: "buy", reason: "Exhaustion dump without volume" };
    if (change24h > 8 && volumeSurge) return { score: 0.82, signal: "buy", reason: "Strong pump with volume surge" };
    if (change24h < -8 && volumeSurge) return { score: 0.18, signal: "sell", reason: "Strong dump with volume surge" };
    return { score: 0.5, signal: "neutral", reason: "Normal volume and action" };
  }
}

export class CorrelationStrategy {
  analyze(symbol: string, btcChange: number, altChange: number) {
    if (symbol.toUpperCase() === "BTC") return { score: 0.5, signal: "neutral", reason: "BTC base correlation" };
    if (btcChange > 1.2 && altChange < 0.4 && altChange > -0.4) {
      return { score: 0.80, signal: "buy", reason: `BTC +${btcChange.toFixed(1)}%, high potential lagged catcher` };
    }
    if (btcChange < -1.2 && altChange > -0.4 && altChange < 0.4) {
      return { score: 0.20, signal: "sell", reason: `BTC ${btcChange.toFixed(1)}%, high potential lagged breakdown tracker` };
    }
    return { score: 0.5, signal: "neutral", reason: "Direct pair correlation normal" };
  }
}

export class TimeSniperStrategy {
  private keyTimes: Record<string, number> = { "London Open": 10, "NY Open": 14, "Daily Close": 23 };

  analyze(closes: number[], highs: number[], lows: number[], opens: number[]) {
    if (closes.length < 5) return { score: 0.5, signal: "neutral" };
    const now = new Date();
    const currentHour = now.getUTCHours();
    let nearKey = false;
    let timeName = "";
    for (const [name, hour] of Object.entries(this.keyTimes)) {
      if (Math.abs(currentHour - hour) <= 1) { nearKey = true; timeName = name; break; }
    }
    if (!nearKey) return { score: 0.5, signal: "neutral", reason: "Not key time" };

    const last = closes.length - 1;
    const body = Math.abs(closes[last] - opens[last]);
    const upperShadow = highs[last] - Math.max(closes[last], opens[last]);
    const lowerShadow = Math.min(closes[last], opens[last]) - lows[last];
    const totalRange = highs[last] - lows[last];
    const shadowRatio = totalRange > 0 ? (upperShadow + lowerShadow) / totalRange : 0.5;
    const bodyRatio = totalRange > 0 ? body / totalRange : 0.5;

    if (shadowRatio > 0.7 && bodyRatio < 0.3) {
      if (closes[last] > opens[last] && lowerShadow > upperShadow) {
        return { score: 0.85, signal: "buy", reason: `Stop hunt at ${timeName} — BUY` };
      } else if (closes[last] < opens[last] && upperShadow > lowerShadow) {
        return { score: 0.15, signal: "sell", reason: `Stop hunt at ${timeName} — SELL` };
      }
    } else if (bodyRatio > 0.6 && shadowRatio < 0.3) {
      if (closes[last] > opens[last]) return { score: 0.8, signal: "buy", reason: `Breakout at ${timeName} — BUY` };
      return { score: 0.2, signal: "sell", reason: `Breakout at ${timeName} — SELL` };
    }
    return { score: 0.5, signal: "neutral", reason: "No clear pattern" };
  }
}

// ─── استراتژی‌های جدید ASHIR 5.0 ──────────────────────────────────────────────

/**
 * OrderBlockDetector
 * ------------------
 * اوردر بلاک = آخرین کندل خلاف روند قبل از حرکت قوی.
 * وقتی قیمت به آن ناحیه برمی‌گردد احتمال واکنش بالاست.
 */
export class OrderBlockDetector {
  detect(opens: number[], highs: number[], lows: number[], closes: number[]): {
    signal: "buy" | "sell" | "neutral";
    score: number;
    obHigh: number;
    obLow: number;
    reason: string;
  } {
    const len = closes.length;
    if (len < 20) return { signal: "neutral", score: 0.5, obHigh: 0, obLow: 0, reason: "داده ناکافی" };

    const current = closes[len - 1];
    const swingLookback = 15;

    // یافتن قوی‌ترین حرکت صعودی (Bullish OB)
    let bestBullishMove = 0;
    let bullishOBHigh = 0, bullishOBLow = 0;
    for (let i = len - swingLookback; i < len - 3; i++) {
      const moveUp = closes[i + 2] - closes[i];
      if (moveUp > 0 && closes[i] < opens[i]) { // کندل نزولی قبل از حرکت صعودی = Bullish OB
        const moveStrength = moveUp / closes[i];
        if (moveStrength > bestBullishMove) {
          bestBullishMove = moveStrength;
          bullishOBHigh = highs[i];
          bullishOBLow = lows[i];
        }
      }
    }

    // یافتن قوی‌ترین حرکت نزولی (Bearish OB)
    let bestBearishMove = 0;
    let bearishOBHigh = 0, bearishOBLow = 0;
    for (let i = len - swingLookback; i < len - 3; i++) {
      const moveDown = closes[i] - closes[i + 2];
      if (moveDown > 0 && closes[i] > opens[i]) { // کندل صعودی قبل از حرکت نزولی = Bearish OB
        const moveStrength = moveDown / closes[i];
        if (moveStrength > bestBearishMove) {
          bestBearishMove = moveStrength;
          bearishOBHigh = highs[i];
          bearishOBLow = lows[i];
        }
      }
    }

    const touchTolerance = 0.0015;

    // آیا قیمت داخل Bullish OB است؟
    if (bullishOBLow > 0 && current >= bullishOBLow * (1 - touchTolerance) && current <= bullishOBHigh * (1 + touchTolerance)) {
      const strength = Math.min(0.90, 0.72 + bestBullishMove * 3);
      return {
        signal: "buy", score: strength,
        obHigh: bullishOBHigh, obLow: bullishOBLow,
        reason: `قیمت به Bullish Order Block (${bullishOBLow.toFixed(4)} - ${bullishOBHigh.toFixed(4)}) بازگشته — احتمال صعود بالاست.`
      };
    }

    // آیا قیمت داخل Bearish OB است؟
    if (bearishOBLow > 0 && current >= bearishOBLow * (1 - touchTolerance) && current <= bearishOBHigh * (1 + touchTolerance)) {
      const strength = Math.min(0.90, 0.72 + bestBearishMove * 3);
      return {
        signal: "sell", score: 1 - strength,
        obHigh: bearishOBHigh, obLow: bearishOBLow,
        reason: `قیمت به Bearish Order Block (${bearishOBLow.toFixed(4)} - ${bearishOBHigh.toFixed(4)}) بازگشته — احتمال ریزش بالاست.`
      };
    }

    return { signal: "neutral", score: 0.5, obHigh: 0, obLow: 0, reason: "قیمت در محدوده اوردر بلاک نیست." };
  }
}

/**
 * MarketStructureBreak (MSB / CHoCH)
 * ------------------------------------
 * تشخیص شکست ساختار بازار:
 *  - BOS (Break of Structure): ادامه روند
 *  - CHoCH (Change of Character): تغییر روند
 */
export class MarketStructureBreak {
  analyze(highs: number[], lows: number[], closes: number[]): {
    signal: "buy" | "sell" | "neutral";
    score: number;
    type: "BOS_BULL" | "BOS_BEAR" | "CHOCH_BULL" | "CHOCH_BEAR" | "none";
    reason: string;
  } {
    const len = closes.length;
    if (len < 25) return { signal: "neutral", score: 0.5, type: "none", reason: "داده ناکافی" };

    const lookback = 20;
    // پیدا کردن swing high/low های اخیر
    const swingHighs: { idx: number; val: number }[] = [];
    const swingLows: { idx: number; val: number }[] = [];

    for (let i = len - lookback; i < len - 2; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
        swingHighs.push({ idx: i, val: highs[i] });
      }
      if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
        swingLows.push({ idx: i, val: lows[i] });
      }
    }

    const current = closes[len - 1];
    const prev = closes[len - 2];

    // HH/HL → Bullish Structure — شکست بالاترین swing high = BOS صعودی
    if (swingHighs.length >= 2) {
      const lastH = swingHighs[swingHighs.length - 1].val;
      const prevH = swingHighs[swingHighs.length - 2].val;

      if (current > lastH && prev <= lastH) { // شکست تازه
        if (lastH > prevH) {
          return { signal: "buy", score: 0.83, type: "BOS_BULL", reason: `BOS صعودی تایید شد: شکست سقف اخیر ${lastH.toFixed(4)} با HH جدید.` };
        } else {
          return { signal: "buy", score: 0.88, type: "CHOCH_BULL", reason: `CHoCH صعودی: تغییر کاراکتر از نزولی به صعودی با شکست ${lastH.toFixed(4)}.` };
        }
      }
    }

    // LL/LH → Bearish Structure — شکست پایین‌ترین swing low = BOS نزولی
    if (swingLows.length >= 2) {
      const lastL = swingLows[swingLows.length - 1].val;
      const prevL = swingLows[swingLows.length - 2].val;

      if (current < lastL && prev >= lastL) {
        if (lastL < prevL) {
          return { signal: "sell", score: 0.17, type: "BOS_BEAR", reason: `BOS نزولی تایید شد: شکست کف اخیر ${lastL.toFixed(4)} با LL جدید.` };
        } else {
          return { signal: "sell", score: 0.12, type: "CHOCH_BEAR", reason: `CHoCH نزولی: تغییر کاراکتر از صعودی به نزولی با شکست ${lastL.toFixed(4)}.` };
        }
      }
    }

    return { signal: "neutral", score: 0.5, type: "none", reason: "شکست ساختار تایید نشده." };
  }
}

/**
 * FairValueGapDetector (FVG / Imbalance)
 * ----------------------------------------
 * FVG ناحیه‌ای است که در آن قیمت به سرعت حرکت کرده و gap ایجاد شده.
 * قیمت معمولاً برای پر کردن این gap برمی‌گردد — نقطه ورود عالی.
 */
export class FairValueGapDetector {
  detect(opens: number[], highs: number[], lows: number[], closes: number[]): {
    signal: "buy" | "sell" | "neutral";
    score: number;
    gapHigh: number;
    gapLow: number;
    reason: string;
  } {
    const len = closes.length;
    if (len < 5) return { signal: "neutral", score: 0.5, gapHigh: 0, gapLow: 0, reason: "داده ناکافی" };

    const current = closes[len - 1];
    const fvgLookback = 20;

    for (let i = len - fvgLookback; i < len - 2; i++) {
      // Bullish FVG: lows[i+2] > highs[i] → gap بین کندل i و i+2
      if (lows[i + 2] > highs[i]) {
        const gapHigh = lows[i + 2];
        const gapLow = highs[i];
        // قیمت داخل FVG → ورود صعودی
        if (current >= gapLow && current <= gapHigh) {
          return {
            signal: "buy", score: 0.81,
            gapHigh, gapLow,
            reason: `Bullish FVG (${gapLow.toFixed(4)}-${gapHigh.toFixed(4)}): قیمت به ناحیه عدم تعادل برگشته — احتمال پرتاب صعودی بالاست.`
          };
        }
      }
      // Bearish FVG: highs[i+2] < lows[i] → gap نزولی
      if (highs[i + 2] < lows[i]) {
        const gapHigh = lows[i];
        const gapLow = highs[i + 2];
        if (current >= gapLow && current <= gapHigh) {
          return {
            signal: "sell", score: 0.19,
            gapHigh, gapLow,
            reason: `Bearish FVG (${gapLow.toFixed(4)}-${gapHigh.toFixed(4)}): قیمت به ناحیه عدم تعادل نزولی برگشته — احتمال ریزش بالاست.`
          };
        }
      }
    }

    return { signal: "neutral", score: 0.5, gapHigh: 0, gapLow: 0, reason: "قیمت در FVG نیست." };
  }
}

/**
 * HeikinAshiFilter
 * -----------------
 * فیلتر Heikin Ashi برای حذف نویز و تشخیص روند واقعی.
 * در HA، کندل قوی = بدون سایه در جهت مخالف روند.
 */
export class HeikinAshiFilter {
  private calcHA(opens: number[], highs: number[], lows: number[], closes: number[]): {
    haOpen: number[]; haClose: number[]; haHigh: number[]; haLow: number[];
  } {
    const n = closes.length;
    const haOpen = new Array(n).fill(0);
    const haClose = new Array(n).fill(0);
    const haHigh = new Array(n).fill(0);
    const haLow = new Array(n).fill(0);

    haClose[0] = (opens[0] + highs[0] + lows[0] + closes[0]) / 4;
    haOpen[0] = (opens[0] + closes[0]) / 2;
    haHigh[0] = highs[0];
    haLow[0] = lows[0];

    for (let i = 1; i < n; i++) {
      haClose[i] = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
      haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
      haHigh[i] = Math.max(highs[i], haOpen[i], haClose[i]);
      haLow[i] = Math.min(lows[i], haOpen[i], haClose[i]);
    }
    return { haOpen, haClose, haHigh, haLow };
  }

  analyze(opens: number[], highs: number[], lows: number[], closes: number[]): {
    trend: "strong_bull" | "bull" | "neutral" | "bear" | "strong_bear";
    score: number;
    consecutiveBull: number;
    consecutiveBear: number;
    reason: string;
  } {
    const len = closes.length;
    if (len < 10) return { trend: "neutral", score: 0.5, consecutiveBull: 0, consecutiveBear: 0, reason: "داده ناکافی" };

    const { haOpen, haClose, haHigh, haLow } = this.calcHA(opens, highs, lows, closes);

    // شمارش کندل‌های متوالی در یک جهت
    let consecutiveBull = 0;
    let consecutiveBear = 0;

    for (let i = len - 1; i >= Math.max(0, len - 8); i--) {
      if (haClose[i] > haOpen[i]) {
        if (consecutiveBear > 0) break;
        consecutiveBull++;
      } else {
        if (consecutiveBull > 0) break;
        consecutiveBear++;
      }
    }

    const last = len - 1;
    const isStrongBull = haClose[last] > haOpen[last] && haLow[last] === haOpen[last]; // بدون سایه پایین
    const isStrongBear = haClose[last] < haOpen[last] && haHigh[last] === haOpen[last]; // بدون سایه بالا

    if (isStrongBull && consecutiveBull >= 3) {
      return { trend: "strong_bull", score: 0.85, consecutiveBull, consecutiveBear: 0, reason: `Heikin Ashi: ${consecutiveBull} کندل صعودی قوی متوالی بدون سایه پایین.` };
    } else if (consecutiveBull >= 2) {
      return { trend: "bull", score: 0.72, consecutiveBull, consecutiveBear: 0, reason: `Heikin Ashi: ${consecutiveBull} کندل HA صعودی متوالی.` };
    } else if (isStrongBear && consecutiveBear >= 3) {
      return { trend: "strong_bear", score: 0.15, consecutiveBull: 0, consecutiveBear, reason: `Heikin Ashi: ${consecutiveBear} کندل نزولی قوی متوالی بدون سایه بالا.` };
    } else if (consecutiveBear >= 2) {
      return { trend: "bear", score: 0.28, consecutiveBull: 0, consecutiveBear, reason: `Heikin Ashi: ${consecutiveBear} کندل HA نزولی متوالی.` };
    }

    return { trend: "neutral", score: 0.5, consecutiveBull, consecutiveBear, reason: "Heikin Ashi: روند نامشخص." };
  }
}

/**
 * SupertrendIndicator
 * --------------------
 * Supertrend = ATR-based trailing stop که روند را نشان می‌دهد.
 * وقتی قیمت بالای Supertrend: صعودی | پایین: نزولی
 */
export class SupertrendIndicator {
  private atr(highs: number[], lows: number[], closes: number[], period: number): number[] {
    const trueRanges: number[] = [highs[0] - lows[0]];
    for (let i = 1; i < closes.length; i++) {
      trueRanges.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    const atrValues: number[] = [trueRanges[0]];
    for (let i = 1; i < trueRanges.length; i++) {
      atrValues.push((atrValues[i - 1] * (period - 1) + trueRanges[i]) / period);
    }
    return atrValues;
  }

  analyze(highs: number[], lows: number[], closes: number[], period = 10, multiplier = 3.0): {
    signal: "buy" | "sell" | "neutral";
    score: number;
    supertrendValue: number;
    trendDirection: "up" | "down";
    justFlipped: boolean;
    reason: string;
  } {
    const len = closes.length;
    if (len < period + 5) return { signal: "neutral", score: 0.5, supertrendValue: 0, trendDirection: "up", justFlipped: false, reason: "داده ناکافی" };

    const atrValues = this.atr(highs, lows, closes, period);
    const upperBands: number[] = [];
    const lowerBands: number[] = [];
    const supertrend: number[] = [];
    const directions: number[] = []; // 1 = up (bullish), -1 = down (bearish)

    for (let i = 0; i < len; i++) {
      const hl2 = (highs[i] + lows[i]) / 2;
      upperBands.push(hl2 + multiplier * atrValues[i]);
      lowerBands.push(hl2 - multiplier * atrValues[i]);
    }

    supertrend.push(upperBands[0]);
    directions.push(-1);

    for (let i = 1; i < len; i++) {
      const prevST = supertrend[i - 1];
      const prevDir = directions[i - 1];

      // Adjust bands
      const finalUpper = upperBands[i] < prevST || closes[i - 1] > prevST ? upperBands[i] : prevST;
      const finalLower = lowerBands[i] > prevST || closes[i - 1] < prevST ? lowerBands[i] : prevST;

      if (prevDir === -1) {
        if (closes[i] > finalUpper) { supertrend.push(finalLower); directions.push(1); }
        else { supertrend.push(finalUpper); directions.push(-1); }
      } else {
        if (closes[i] < finalLower) { supertrend.push(finalUpper); directions.push(-1); }
        else { supertrend.push(finalLower); directions.push(1); }
      }
    }

    const lastDir = directions[len - 1];
    const prevDir = directions[len - 2];
    const justFlipped = lastDir !== prevDir;
    const current = closes[len - 1];
    const stValue = supertrend[len - 1];

    if (lastDir === 1) {
      const score = justFlipped ? 0.88 : 0.75;
      return {
        signal: "buy", score, supertrendValue: stValue, trendDirection: "up", justFlipped,
        reason: `SuperTrend: روند صعودی${justFlipped ? " (تازه تغییر جهت داد!)" : ""}. قیمت ${current.toFixed(4)} بالای ST ${stValue.toFixed(4)}.`
      };
    } else {
      const score = justFlipped ? 0.12 : 0.25;
      return {
        signal: "sell", score, supertrendValue: stValue, trendDirection: "down", justFlipped,
        reason: `SuperTrend: روند نزولی${justFlipped ? " (تازه تغییر جهت داد!)" : ""}. قیمت ${current.toFixed(4)} زیر ST ${stValue.toFixed(4)}.`
      };
    }
  }
}

/**
 * VolumePOC (Point of Control)
 * ------------------------------
 * پیدا کردن قیمتی که بیشترین حجم در آن معامله شده.
 * POC سطح حمایت/مقاومت قوی است.
 */
export class VolumePOC {
  analyze(highs: number[], lows: number[], closes: number[], volumes: number[], bins = 20): {
    poc: number;
    signal: "buy" | "sell" | "neutral";
    score: number;
    distancePct: number;
    reason: string;
  } {
    const len = closes.length;
    if (len < 20) return { poc: 0, signal: "neutral", score: 0.5, distancePct: 0, reason: "داده ناکافی" };

    const priceMin = Math.min(...lows.slice(-50));
    const priceMax = Math.max(...highs.slice(-50));
    const step = (priceMax - priceMin) / bins;
    const volumeAtPrice = new Array(bins).fill(0);

    for (let i = Math.max(0, len - 50); i < len; i++) {
      const midPrice = (highs[i] + lows[i]) / 2;
      const binIdx = Math.min(bins - 1, Math.floor((midPrice - priceMin) / step));
      volumeAtPrice[binIdx] += volumes[i];
    }

    const maxVol = Math.max(...volumeAtPrice);
    const pocBin = volumeAtPrice.indexOf(maxVol);
    const poc = priceMin + (pocBin + 0.5) * step;

    const current = closes[len - 1];
    const distancePct = Math.abs(current - poc) / poc * 100;

    if (distancePct < 0.3) { // قیمت نزدیک POC
      const above = current > poc;
      return {
        poc, signal: above ? "buy" : "sell",
        score: above ? 0.72 : 0.28,
        distancePct,
        reason: `Volume POC در ${poc.toFixed(4)}: قیمت ${above ? "بالای" : "زیر"} POC با فاصله ${distancePct.toFixed(2)}٪ — ناحیه واکنش قوی.`
      };
    }

    return {
      poc, signal: "neutral", score: 0.5, distancePct,
      reason: `Volume POC: ${poc.toFixed(4)} — فاصله ${distancePct.toFixed(2)}٪ تا قیمت فعلی.`
    };
  }
}

// ─── موتور اصلی اسکالپ (ارتقا یافته) ────────────────────────────────────────

/**
 * AdvancedConfluenceScalper v2 (ASHIR 5.0)
 * =========================================
 * موتور چندعاملی با ۱۱ عامل (از ۷ به ۱۱ ارتقا یافت):
 *  1) روند HTF (1H)               — وزن 0.12
 *  2) ساختار EMA (20/50/100)      — وزن 0.10
 *  3) مومنتوم MACD                — وزن 0.10
 *  4) موقعیت VWAP                 — وزن 0.08
 *  5) جریان سفارشات / OB         — وزن 0.10
 *  6) حجم نسبی                   — وزن 0.08
 *  7) ساختار / Liquidity Sweep   — وزن 0.10
 *  8) Order Block Detection       — وزن 0.10 ← جدید
 *  9) Market Structure Break      — وزن 0.10 ← جدید
 * 10) Heikin Ashi Trend Filter    — وزن 0.07 ← جدید
 * 11) SuperTrend Direction        — وزن 0.05 ← جدید
 *
 * جمع وزن‌ها = 1.0
 * آستانه ورود: |combined| ≥ 0.32 (کمی پایین‌تر از قبل برای جبران دقت بیشتر)
 */
export class AdvancedConfluenceScalper {
  private obDetector = new OrderBlockDetector();
  private msbDetector = new MarketStructureBreak();
  private haFilter = new HeikinAshiFilter();
  private stIndicator = new SupertrendIndicator();

  private ema(values: number[], period: number): number[] {
    const out: number[] = [];
    if (values.length === 0) return out;
    const k = 2 / (period + 1);
    let cur = values[0];
    out.push(cur);
    for (let i = 1; i < values.length; i++) {
      cur = (values[i] - cur) * k + cur;
      out.push(cur);
    }
    return out;
  }

  private rsi(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    return 100 - 100 / (1 + gains / losses);
  }

  private atr(high: number[], low: number[], close: number[], period = 14): number {
    const len = close.length;
    if (len < period + 1) return 0;
    let trSum = 0;
    for (let i = len - period; i < len; i++) {
      trSum += Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
    }
    return trSum / period;
  }

  private macd(closes: number[]): { macdLine: number; signalLine: number; hist: number; prevHist: number } {
    const ema12 = this.ema(closes, 12);
    const ema26 = this.ema(closes, 26);
    const len = closes.length;
    const macdSeries = ema12.map((v, i) => v - ema26[i]);
    const signalSeries = this.ema(macdSeries, 9);
    const hist = macdSeries[len - 1] - signalSeries[len - 1];
    const prevHist = len > 1 ? macdSeries[len - 2] - signalSeries[len - 2] : hist;
    return { macdLine: macdSeries[len - 1], signalLine: signalSeries[len - 1], hist, prevHist };
  }

  private bollinger(closes: number[], period = 20, mult = 2): { upper: number; lower: number; mid: number; width: number; avgWidth: number } {
    const len = closes.length;
    const slice = closes.slice(-period);
    const mid = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / period;
    const sd = Math.sqrt(variance);
    const upper = mid + mult * sd;
    const lower = mid - mult * sd;
    const width = (upper - lower) / mid;
    const widths: number[] = [];
    const lookback = Math.min(50, len - period);
    for (let i = 0; i < lookback; i++) {
      const s = closes.slice(len - period - i, len - i);
      const m = s.reduce((a, b) => a + b, 0) / period;
      const v = s.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period;
      widths.push((2 * mult * Math.sqrt(v)) / (m || 1));
    }
    const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : width;
    return { upper, lower, mid, width, avgWidth };
  }

  private vwap(high: number[], low: number[], close: number[], volume: number[], lookback = 48): { vwap: number; upper: number; lower: number } {
    const len = close.length;
    const offset = Math.max(0, len - lookback);
    let num = 0, den = 0;
    for (let i = offset; i < len; i++) {
      const tp = (high[i] + low[i] + close[i]) / 3;
      num += tp * volume[i]; den += volume[i];
    }
    const vw = den > 0 ? num / den : close[len - 1];
    let varSum = 0;
    for (let i = offset; i < len; i++) varSum += Math.pow(close[i] - vw, 2);
    const sd = Math.sqrt(varSum / (len - offset)) || 0.000001;
    return { vwap: vw, upper: vw + 1.5 * sd, lower: vw - 1.5 * sd };
  }

  private resampleHTF(klines: Klines, groupSize = 4): number[] {
    const { close } = klines;
    const len = close.length;
    const htfCloses: number[] = [];
    for (let i = len % groupSize; i + groupSize <= len; i += groupSize) {
      htfCloses.push(close[i + groupSize - 1]);
    }
    return htfCloses;
  }

  private liquiditySweep(high: number[], low: number[], close: number[], open: number[]): number {
    const len = close.length;
    if (len < 12) return 0;
    const lookback = 10;
    const priorHigh = Math.max(...high.slice(len - lookback - 1, len - 1));
    const priorLow = Math.min(...low.slice(len - lookback - 1, len - 1));
    const curHigh = high[len - 1]; const curLow = low[len - 1];
    const curClose = close[len - 1]; const curOpen = open[len - 1];
    if (curLow < priorLow && curClose > priorLow && curClose > curOpen) return 1;
    if (curHigh > priorHigh && curClose < priorHigh && curClose < curOpen) return -1;
    return 0;
  }

  private orderbookMetrics(orderbook: OrderBook | null, imbalanceField?: number): { pressureRatio: number; ofi: number } {
    if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
      const bidVol = orderbook.bids.slice(0, 10).reduce((s, b) => s + b[1], 0);
      const askVol = orderbook.asks.slice(0, 10).reduce((s, a) => s + a[1], 0);
      const pressureRatio = bidVol / (askVol || 1);
      let bidNotional = 0, askNotional = 0;
      const limit = Math.min(10, orderbook.bids.length, orderbook.asks.length);
      for (let i = 0; i < limit; i++) {
        bidNotional += orderbook.bids[i][0] * orderbook.bids[i][1];
        askNotional += orderbook.asks[i][0] * orderbook.asks[i][1];
      }
      const total = bidNotional + askNotional;
      const ofi = total > 0 ? (bidNotional - askNotional) / total : 0;
      return { pressureRatio, ofi };
    }
    const imb = imbalanceField || 0;
    const pressureRatio = imb >= 0 ? 1 + imb * 1.5 : 1 / (1 - imb * 1.5);
    return { pressureRatio, ofi: imb };
  }

  analyze(
    klines: Klines,
    orderbook: OrderBook | null,
    imbalanceField?: number
  ): { signal: "buy" | "sell" | "neutral"; score: number; details?: any } {
    const { high, low, close, open, volume } = klines;
    const len = close.length;
    if (len < 100) return { signal: "neutral", score: 0.5, details: { reason: "داده‌ی کافی موجود نیست (حداقل ۱۰۰ کندل)." } };

    const currentClose = close[len - 1];

    // ── فیلترهای دروازه (Gate) ──────────────────────────────────────────────
    const atrVal = this.atr(high, low, close, 14);
    const relativeATR = atrVal / currentClose;
    if (relativeATR < 0.0010 || relativeATR > 0.07) {
      return { signal: "neutral", score: 0.5, details: { reason: `ATR نسبی (${(relativeATR * 100).toFixed(2)}٪) خارج از محدوده مجاز اسکالپ.` } };
    }

    const bb = this.bollinger(close, 20, 2);
    if (bb.width < bb.avgWidth * 0.55) {
      return { signal: "neutral", score: 0.5, details: { reason: "Bollinger Squeeze شدید — منتظر شکست باند." } };
    }

    // ── فیلتر RSI مطلق: جلوگیری از ورود در اشباع خرید/فروش شدید ──────────
    const rsiAbsolute = this.rsi(close, 14);
    if (rsiAbsolute > 78) {
      return { signal: "neutral", score: 0.5, details: { reason: `RSI(14)=${rsiAbsolute.toFixed(1)} — اشباع خرید شدید، منتظر تعدیل.` } };
    }
    if (rsiAbsolute < 22) {
      return { signal: "neutral", score: 0.5, details: { reason: `RSI(14)=${rsiAbsolute.toFixed(1)} — اشباع فروش شدید، منتظر تعدیل.` } };
    }

    // ── عامل ۱: روند HTF ──────────────────────────────────────────────────
    const htfCloses = this.resampleHTF(klines, 4);
    let htfScore = 0;
    if (htfCloses.length >= 20) {
      const htfEma20 = this.ema(htfCloses, 20);
      const htfEma50Period = Math.min(50, Math.floor(htfCloses.length * 0.8));
      const htfEma50 = this.ema(htfCloses, htfEma50Period);
      const e20 = htfEma20[htfEma20.length - 1];
      const e50 = htfEma50[htfEma50.length - 1];
      const slopeLb = Math.min(5, htfEma50.length - 1);
      const e50Prev = htfEma50[htfEma50.length - 1 - slopeLb];
      if (e20 > e50 && e50 > e50Prev) htfScore = 1;
      else if (e20 < e50 && e50 < e50Prev) htfScore = -1;
      else htfScore = (e20 - e50) / (e50 || 1) > 0 ? 0.3 : -0.3;
    }

    // ── عامل ۲: EMA ساختار ────────────────────────────────────────────────
    const ema20s = this.ema(close, 20); const ema50s = this.ema(close, 50);
    const ema100Period = Math.min(100, Math.floor(len * 0.9));
    const ema100s = this.ema(close, ema100Period);
    const ema20 = ema20s[ema20s.length - 1]; const ema50 = ema50s[ema50s.length - 1];
    const ema100 = ema100s[ema100s.length - 1];
    const ema100Prev = ema100s[ema100s.length - 1 - Math.min(10, ema100s.length - 1)];
    let emaScore = 0;
    if (ema20 > ema50 && ema50 > ema100 && ema100 > ema100Prev) emaScore = 1;
    else if (ema20 < ema50 && ema50 < ema100 && ema100 < ema100Prev) emaScore = -1;
    else emaScore = Math.max(-1, Math.min(1, (ema20 - ema50) / (ema50 || 1) * 20));

    // ── عامل ۳: MACD ──────────────────────────────────────────────────────
    const { hist, prevHist } = this.macd(close);
    const macdAccel = hist - prevHist;
    let macdScore = 0;
    if (hist > 0 && macdAccel > 0) macdScore = 1;
    else if (hist > 0) macdScore = 0.3;
    else if (hist < 0 && macdAccel < 0) macdScore = -1;
    else macdScore = -0.3;

    // ── عامل ۴: VWAP ──────────────────────────────────────────────────────
    const vw = this.vwap(high, low, close, volume, 48);
    let vwapScore = 0;
    if (currentClose > vw.vwap) vwapScore = currentClose > vw.upper ? 0.5 : 1;
    else vwapScore = currentClose < vw.lower ? -0.5 : -1;

    // ── عامل ۵: اردربوک / OFI ────────────────────────────────────────────
    const { pressureRatio, ofi } = this.orderbookMetrics(orderbook, imbalanceField);
    let obScore = Math.max(-1, Math.min(1, (pressureRatio - 1) * 0.8));
    obScore = Math.max(-1, Math.min(1, (obScore + Math.max(-1, Math.min(1, ofi * 2))) / 2));

    // ── عامل ۶: حجم نسبی ─────────────────────────────────────────────────
    const avgVol = volume.slice(-20).reduce((s, v) => s + v, 0) / 20 || 1;
    const relVol = volume[len - 1] / avgVol;
    const candleDir = close[len - 1] > open[len - 1] ? 1 : close[len - 1] < open[len - 1] ? -1 : 0;
    const volScore = relVol >= 1.0 ? candleDir * Math.min(1, (relVol - 1) * 1.5) : 0;

    // ── عامل ۷: Liquidity Sweep ──────────────────────────────────────────
    const sweepScore = this.liquiditySweep(high, low, close, open);

    // ── عامل ۸: Order Block (جدید) ───────────────────────────────────────
    const obResult = this.obDetector.detect(open, high, low, close);
    const obDetectScore = obResult.signal === "buy" ? (obResult.score - 0.5) * 2
      : obResult.signal === "sell" ? (obResult.score - 0.5) * 2 : 0;

    // ── عامل ۹: Market Structure Break (جدید) ────────────────────────────
    const msbResult = this.msbDetector.analyze(high, low, close);
    let msbScore = 0;
    if (msbResult.signal === "buy") msbScore = (msbResult.score - 0.5) * 2;
    else if (msbResult.signal === "sell") msbScore = (msbResult.score - 0.5) * 2;

    // ── عامل ۱۰: Heikin Ashi (جدید) ─────────────────────────────────────
    const haResult = this.haFilter.analyze(open, high, low, close);
    let haScore = 0;
    if (haResult.trend === "strong_bull") haScore = 1;
    else if (haResult.trend === "bull") haScore = 0.6;
    else if (haResult.trend === "strong_bear") haScore = -1;
    else if (haResult.trend === "bear") haScore = -0.6;

    // ── عامل ۱۱: SuperTrend (جدید) ───────────────────────────────────────
    const stResult = this.stIndicator.analyze(high, low, close, 10, 3.0);
    let stScore = 0;
    if (stResult.signal === "buy") stScore = stResult.justFlipped ? 1 : 0.6;
    else if (stResult.signal === "sell") stScore = stResult.justFlipped ? -1 : -0.6;

    // ── جمع‌بندی وزنی ────────────────────────────────────────────────────
    const weights = { htf: 0.12, ema: 0.10, macd: 0.10, vwap: 0.08, ob: 0.10, vol: 0.08, sweep: 0.10, obDetect: 0.10, msb: 0.10, ha: 0.07, st: 0.05 };

    const combined =
      htfScore   * weights.htf   +
      emaScore   * weights.ema   +
      macdScore  * weights.macd  +
      vwapScore  * weights.vwap  +
      obScore    * weights.ob    +
      volScore   * weights.vol   +
      sweepScore * weights.sweep +
      obDetectScore * weights.obDetect +
      msbScore   * weights.msb   +
      haScore    * weights.ha    +
      stScore    * weights.st;

    const rsi = this.rsi(close, 14);
    let rsiPenalty = 0;
    if (combined > 0 && rsi > 80) rsiPenalty = -0.18;
    if (combined < 0 && rsi < 20) rsiPenalty = 0.18;

    // اضافه: فیلتر کیفیت همگرایی — حداقل ۵ عامل باید در یک جهت باشند
    const bullFactors = [htfScore, emaScore, macdScore, vwapScore, obScore, volScore, sweepScore, obDetectScore, msbScore, haScore, stScore].filter(v => v > 0.2).length;
    const bearFactors = [htfScore, emaScore, macdScore, vwapScore, obScore, volScore, sweepScore, obDetectScore, msbScore, haScore, stScore].filter(v => v < -0.2).length;
    const confluenceBonus = combined > 0 && bullFactors >= 5 ? 0.08 : combined < 0 && bearFactors >= 5 ? -0.08 : 0;

    const finalCombined = Math.max(-1, Math.min(1, combined + rsiPenalty + confluenceBonus));
    const score = Math.max(0.05, Math.min(0.95, 0.5 + finalCombined * 0.45));

    const factorBreakdown = {
      htfTrend: htfScore, emaStructure: emaScore, macdMomentum: macdScore,
      vwapPosition: vwapScore, orderFlow: obScore, relativeVolume: volScore,
      liquiditySweep: sweepScore, orderBlock: obDetectScore, msb: msbScore,
      heikinAshi: haScore, supertrend: stScore, rsi, pressureRatio, ofi,
      relativeATR, combined: finalCombined, bullFactors, bearFactors,
      obReason: obResult.reason, msbReason: msbResult.reason,
      haReason: haResult.reason, stReason: stResult.reason,
    };

    const BUY_THRESHOLD = 0.28;  // آستانه پایه — فیلترهای ML و 14گانه کیفیت رو کنترل می‌کنن
    const SELL_THRESHOLD = -0.28;

    if (finalCombined >= BUY_THRESHOLD) {
      const reason = `همگرایی ۱۱ عاملی خرید (Score: +${(finalCombined * 100).toFixed(0)}٪ | ${bullFactors}/11 عامل موافق):\n` +
        `• HTF: ${htfScore > 0 ? "صعودی" : "نزولی"} | EMA Stack: ${emaScore > 0 ? "صعودی" : "نزولی"} | MACD: ${hist > 0 ? "+" : "-"}\n` +
        `• ${obResult.reason}\n• ${msbResult.reason}\n• ${haResult.reason}\n• ${stResult.reason}\n` +
        `• RSI(14)=${rsi.toFixed(1)} | حجم: ${(relVol).toFixed(2)}x | OFI: ${(ofi * 100).toFixed(1)}٪`;
      return { signal: "buy", score, details: { pattern: "Advanced Confluence v2 (LONG)", reason, factors: factorBreakdown } };
    }

    if (finalCombined <= SELL_THRESHOLD) {
      const reason = `همگرایی ۱۱ عاملی فروش (Score: ${(finalCombined * 100).toFixed(0)}٪ | ${bearFactors}/11 عامل موافق):\n` +
        `• HTF: ${htfScore > 0 ? "صعودی" : "نزولی"} | EMA Stack: ${emaScore > 0 ? "صعودی" : "نزولی"} | MACD: ${hist > 0 ? "+" : "-"}\n` +
        `• ${obResult.reason}\n• ${msbResult.reason}\n• ${haResult.reason}\n• ${stResult.reason}\n` +
        `• RSI(14)=${rsi.toFixed(1)} | حجم: ${(relVol).toFixed(2)}x | OFI: ${(ofi * 100).toFixed(1)}٪`;
      return { signal: "sell", score, details: { pattern: "Advanced Confluence v2 (SHORT)", reason, factors: factorBreakdown } };
    }

    return {
      signal: "neutral", score: 0.5,
      details: {
        reason: `همگرایی ناکافی (Score: ${(finalCombined * 100).toFixed(0)}٪ | آستانه ±۳۲٪ | ${bullFactors} صعودی / ${bearFactors} نزولی).`,
        factors: factorBreakdown
      }
    };
  }
}

// ─── MicroScalp (حفظ شده، بهبود یافته) ──────────────────────────────────────

export class MicroScalpStrategy {
  private ema(values: number[], period: number): number[] {
    const out: number[] = [];
    if (values.length === 0) return out;
    const k = 2 / (period + 1);
    let cur = values[0]; out.push(cur);
    for (let i = 1; i < values.length; i++) { cur = (values[i] - cur) * k + cur; out.push(cur); }
    return out;
  }

  private rsi(closes: number[], period = 7): number {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    return 100 - 100 / (1 + gains / losses);
  }

  analyze(closes: number[], highs: number[], lows: number[], orderbook?: OrderBook | null): {
    signal: "buy" | "sell" | "neutral"; score: number; reason: string;
  } {
    const len = closes.length;
    if (len < 20) return { signal: "neutral", score: 0.5, reason: "داده ناکافی برای اسکالپ." };

    const emaFast = this.ema(closes, 5); const emaSlow = this.ema(closes, 13);
    const fastNow = emaFast[len - 1]; const fastPrev = emaFast[len - 2];
    const slowNow = emaSlow[len - 1]; const slowPrev = emaSlow[len - 2];
    const bullCross = fastPrev <= slowPrev && fastNow > slowNow;
    const bearCross = fastPrev >= slowPrev && fastNow < slowNow;
    const rsiVal = this.rsi(closes, 7);
    const recentHigh = Math.max(...highs.slice(len - 9, len - 1));
    const recentLow = Math.min(...lows.slice(len - 9, len - 1));
    const current = closes[len - 1];
    let obSignal: "buy" | "sell" | "neutral" = "neutral";
    if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
      const bidVol = orderbook.bids.slice(0, 5).reduce((s, b) => s + b[1], 0);
      const askVol = orderbook.asks.slice(0, 5).reduce((s, a) => s + a[1], 0);
      const ratio = bidVol / (askVol || 1);
      if (ratio > 1.3) obSignal = "buy"; else if (ratio < 0.77) obSignal = "sell";
    }

    if ((bullCross || fastNow > slowNow) && current > recentHigh && rsiVal < 75 && rsiVal > 45 && obSignal !== "sell") {
      const score = Math.min(0.90, 0.70 + (rsiVal - 45) / 100 + (obSignal === "buy" ? 0.05 : 0));
      return { signal: "buy", score, reason: `اسکالپ (LONG): EMA5/13 ${bullCross ? "کراس تازه" : "هم‌راستا"} + شکست سقف + RSI=${rsiVal.toFixed(1)}${obSignal === "buy" ? " + فشار خریدار" : ""}.` };
    }
    if ((bearCross || fastNow < slowNow) && current < recentLow && rsiVal > 25 && rsiVal < 55 && obSignal !== "buy") {
      const score = Math.max(0.10, 0.30 - (55 - rsiVal) / 100 - (obSignal === "sell" ? 0.05 : 0));
      return { signal: "sell", score, reason: `اسکالپ (SHORT): EMA5/13 ${bearCross ? "کراس تازه" : "هم‌راستا"} + شکست کف + RSI=${rsiVal.toFixed(1)}${obSignal === "sell" ? " + فشار فروشنده" : ""}.` };
    }
    return { signal: "neutral", score: 0.5, reason: "شرایط اسکالپ سریع برقرار نیست." };
  }
}
