/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * XTClient v2 — ASHIR 5.0
 * ========================
 * ارتقا: WebSocket لحظه‌ای برای قیمت زنده در میلی‌ثانیه
 * به جای polling REST هر ثانیه، از WebSocket XT استفاده می‌کنیم
 * که تاخیر را از ~500ms به ~20ms کاهش می‌دهد.
 */

import axios, { AxiosInstance } from "axios";
import { Ticker, Klines, OrderBook } from "./types";

// Node.js WebSocket
let WebSocketImpl: any;
try {
  WebSocketImpl = require("ws");
} catch {
  WebSocketImpl = null;
}

interface WSPriceUpdate {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export class XTClient {
  private api_key: string;
  private base_url: string;
  private session: AxiosInstance;
  private _ticker_cache: Ticker[] | null = null;
  private _ticker_time = 0;

  // ─── WebSocket لحظه‌ای ──────────────────────────────────────────────────
  private ws: any | null = null;
  private wsConnected = false;
  private wsReconnectTimer: any = null;
  private wsPriceMap: Map<string, WSPriceUpdate> = new Map();
  private wsSubscribed = new Set<string>();
  private wsListeners: Map<string, Set<(update: WSPriceUpdate) => void>> = new Map();

  constructor(api_key: string, base_url = "https://sapi.xt.com") {
    this.api_key = api_key;
    this.base_url = base_url;
    this.session = axios.create({
      baseURL: base_url,
      headers: { "Content-Type": "application/json", "X-API-Key": api_key },
      timeout: 12000,
    });
  }

  // ─── WebSocket Connection ─────────────────────────────────────────────────

  /**
   * اتصال به WebSocket XT برای دریافت قیمت‌ها در کمتر از ۲۰ms
   * XT WS endpoint: wss://stream.xt.com/public
   */
  public connectWebSocket() {
    if (!WebSocketImpl) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    try {
      this.ws = new WebSocketImpl("wss://stream.xt.com/public");

      this.ws.on("open", () => {
        this.wsConnected = true;
        console.log("[ASHIR WS] WebSocket connected to XT stream.");
        // Re-subscribe to all symbols we were tracking
        if (this.wsSubscribed.size > 0) {
          this._wsSendSubscribe([...this.wsSubscribed]);
        }
      });

      this.ws.on("message", (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleWSMessage(msg);
        } catch {}
      });

      this.ws.on("close", () => {
        this.wsConnected = false;
        console.log("[ASHIR WS] WebSocket closed. Reconnecting in 3s...");
        this._scheduleReconnect();
      });

      this.ws.on("error", (err: any) => {
        console.error("[ASHIR WS] Error:", err?.message);
        this.wsConnected = false;
        this._scheduleReconnect();
      });

      // Heartbeat هر ۲۵ ثانیه برای جلوگیری از timeout
      setInterval(() => {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ event: "ping" }));
        }
      }, 25000);

    } catch (err) {
      console.error("[ASHIR WS] Failed to connect:", err);
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    this.wsReconnectTimer = setTimeout(() => {
      console.log("[ASHIR WS] Attempting reconnect...");
      this.connectWebSocket();
    }, 3000);
  }

  private _wsSendSubscribe(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== 1) return;
    // XT stream format: subscribe to ticker_<symbol>
    const params = symbols.map(s => `ticker@${s.toLowerCase()}_usdt`);
    this.ws.send(JSON.stringify({
      method: "subscribe",
      params,
      id: Date.now()
    }));
  }

  private _handleWSMessage(msg: any) {
    // XT stream format: { topic: "ticker@btc_usdt", data: { c: "price", b: bid, a: ask } }
    if (!msg || !msg.topic || !msg.data) return;

    const topic: string = msg.topic || "";
    if (!topic.startsWith("ticker@")) return;

    const sym = topic.replace("ticker@", "").replace("_usdt", "").toUpperCase();
    const d = msg.data;
    const price = parseFloat(d.c || d.p || "0");
    const bid = parseFloat(d.b || d.bp || "0");
    const ask = parseFloat(d.a || d.ap || "0");

    if (price > 0) {
      const update: WSPriceUpdate = { symbol: sym, price, bid, ask, timestamp: Date.now() };
      this.wsPriceMap.set(sym, update);

      // اعلام به subscribers
      const listeners = this.wsListeners.get(sym);
      if (listeners) {
        listeners.forEach(cb => cb(update));
      }
    }
  }

  /**
   * subscribe برای دریافت قیمت‌های زنده یک نماد از طریق WebSocket
   */
  public wsSubscribe(symbol: string, callback?: (update: WSPriceUpdate) => void): void {
    const sym = symbol.toUpperCase().replace("_USDT", "");
    this.wsSubscribed.add(sym);

    if (callback) {
      if (!this.wsListeners.has(sym)) this.wsListeners.set(sym, new Set());
      this.wsListeners.get(sym)!.add(callback);
    }

    if (this.wsConnected) {
      this._wsSendSubscribe([sym]);
    } else {
      this.connectWebSocket();
    }
  }

  /**
   * دریافت لحظه‌ای قیمت از cache WebSocket (بدون هیچ تاخیری)
   * اگر WS در دسترس نبود، fallback به REST
   */
  public getWSPrice(symbol: string): number | null {
    const sym = symbol.toUpperCase().replace("_USDT", "");
    const update = this.wsPriceMap.get(sym);
    if (update && Date.now() - update.timestamp < 5000) { // داده تازه‌تر از ۵ ثانیه
      return update.price;
    }
    return null;
  }

  public getWSBidAsk(symbol: string): { bid: number; ask: number } | null {
    const sym = symbol.toUpperCase().replace("_USDT", "");
    const update = this.wsPriceMap.get(sym);
    if (update && Date.now() - update.timestamp < 3000) {
      return { bid: update.bid, ask: update.ask };
    }
    return null;
  }

  // ─── REST API ─────────────────────────────────────────────────────────────

  private async _get<T>(endpoint: string, params: any = {}): Promise<T | null> {
    try {
      const resp = await this.session.get(endpoint, { params });
      if (resp.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this._get(endpoint, params);
      }
      const data = resp.data;
      return data?.rc === 0 ? data : null;
    } catch (error) {
      return null;
    }
  }

  async getAllUsdtPairs(force_refresh = false): Promise<Ticker[]> {
    const now = Date.now();
    if (this._ticker_cache && !force_refresh && (now - this._ticker_time) < 800) {
      return this._ticker_cache;
    }
    const result: any = await this._get("/v4/public/ticker", force_refresh ? { _t: now } : {});
    if (!result) return this._ticker_cache || [];

    const pairs: Ticker[] = [];
    for (const item of result.result || []) {
      const symbol = item.s || "";
      const price = parseFloat(item.c || "0");
      const vol = parseFloat(item.v || "0");
      const change = parseFloat(item.cp || "0");
      if (symbol.toLowerCase().endsWith("_usdt") && price > 0 && vol > 0) {
        const clean = symbol.replace(/_USDT$/i, "").toUpperCase();
        pairs.push({ symbol, clean, price, volume: vol, change_24h: change });
      }
    }

    const seen = new Set<string>();
    const unique: Ticker[] = [];
    for (const p of pairs) {
      if (!seen.has(p.clean)) { seen.add(p.clean); unique.push(p); }
    }

    this._ticker_cache = unique.sort((a, b) => b.volume - a.volume);
    this._ticker_time = now;
    return this._ticker_cache;
  }

  /**
   * دریافت قیمت زنده — اول WS cache (≈20ms)، سپس REST
   */
  async getLivePrice(symbol: string): Promise<number | null> {
    const sym = symbol.toUpperCase().replace("_USDT", "");

    // 1. WS cache — سریع‌ترین (بدون تاخیر شبکه)
    const wsPrice = this.getWSPrice(sym);
    if (wsPrice !== null) return wsPrice;

    // 2. اردربوک depth=1 برای mid-price دقیق
    try {
      const symbolWithUsdt = `${sym.toLowerCase()}_usdt`;
      const orderbook = await this.getOrderbook(symbolWithUsdt, 1);
      if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
        const topBid = orderbook.bids[0][0];
        const topAsk = orderbook.asks[0][0];
        if (topBid > 0 && topAsk > 0) return (topBid + topAsk) / 2;
      }
    } catch {}

    // 3. REST ticker با cache-buster
    const result: any = await this._get("/v4/public/ticker", {
      symbol: `${sym.toLowerCase()}_usdt`,
      _t: Date.now()
    });
    if (result?.result) {
      const items = Array.isArray(result.result) ? result.result : [result.result];
      const symbolWithUsdt = `${sym.toLowerCase()}_usdt`;
      const item = items.find((i: any) => i.s?.toLowerCase() === symbolWithUsdt);
      if (item?.c) return parseFloat(item.c);
    }

    // 4. Fallback
    const all = await this.getAllUsdtPairs(true);
    const p = all.find(x => x.clean === sym);
    return p ? p.price : null;
  }

  async getKlines(symbol: string, interval = "1d", limit = 200): Promise<Klines | null> {
    if (!symbol.toLowerCase().includes("_usdt")) symbol = `${symbol.toLowerCase()}_usdt`;
    const result: any = await this._get("/v4/public/kline", { symbol, interval, limit });
    if (result?.result) {
      const data = result.result;
      if (data && data.length > 0) {
        return {
          open:   data.map((d: any) => parseFloat(d.o)),
          high:   data.map((d: any) => parseFloat(d.h)),
          low:    data.map((d: any) => parseFloat(d.l)),
          close:  data.map((d: any) => parseFloat(d.c)),
          volume: data.map((d: any) => parseFloat(d.v)),
        };
      }
    }
    return null;
  }

  async getOrderbook(symbol: string, depth = 100): Promise<OrderBook | null> {
    if (!symbol.toLowerCase().includes("_usdt")) symbol = `${symbol.toLowerCase()}_usdt`;
    const result: any = await this._get("/v4/public/depth", { symbol, limit: depth });
    if (result?.result) {
      const data = result.result;
      return {
        bids: (data.bids || []).slice(0, depth).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])] as [number, number]),
        asks: (data.asks || []).slice(0, depth).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])] as [number, number]),
      };
    }
    return null;
  }

  async getRecentTrades(symbol: string, limit = 30): Promise<any[] | null> {
    if (!symbol.toLowerCase().includes("_usdt")) symbol = `${symbol.toLowerCase()}_usdt`;
    const result: any = await this._get("/v4/public/trade/recent", { symbol, limit });
    if (result?.result) {
      return result.result.map((t: any) => ({
        id: t.i, time: t.t, price: parseFloat(t.p),
        qty: parseFloat(t.q), value: parseFloat(t.v || "0"), isBuyerMaker: t.b
      }));
    }
    return null;
  }

  public disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.wsConnected = false;
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
  }
}
