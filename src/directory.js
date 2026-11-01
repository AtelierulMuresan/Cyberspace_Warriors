import { cleanName } from './netgame.js';
import { MAPS } from './maps/index.js';

/*
  A list of public matches with no server behind it. All browsers try to claim one fixed peer id; whoever
  gets it holds the list (the hub), and everyone else asks the hub. If the hub's tab closes, the rest race to
  take over and hosts re-announce within seconds.
  shortcut: the hub is whichever visitor got there first, so it could lie about the list. Everything it sends is
  re-checked below and only ever leads to a normal join. Move this to a small always-on service if griefing starts.
*/
const HUB_ID = 'cyberspace-warriors-directory-v1';
const LISTING_TTL = 14000, ANNOUNCE_MS = 4000, MAX_ROOMS = 64;

// trust boundary: listings come from other people's browsers, in both directions
export function cleanListing(l) {
  if (!l || typeof l !== 'object' || !/^[A-Z0-9]{4,8}$/.test(l.room ?? '') || !MAPS[l.map]?.build) return null;
  const n = (v, hi) => Math.min(hi, Math.max(0, Math.round(Number(v)) || 0));
  return { room: l.room, map: l.map, host: cleanName(l.host), players: n(l.players, 10), max: n(l.max, 10), started: !!l.started, dedicated: !!l.dedicated };
}

export class Directory {
  // onList(rooms) fires whenever a fresh list arrives
  constructor(onList) {
    this.onList = onList;
    this.listings = new Map(); // hub only: peer id -> { listing, at }
    this.mine = null;
    this.closed = false;
    this.lead();
    this.timer = setInterval(() => this.pulse(), ANNOUNCE_MS);
  }

  reset() {
    this.isHub = false;
    this.conn = null;
    this.peer?.destroy();
  }

  retry() {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.lead(), 1000 + Math.random() * 3000); // stagger so one tab wins cleanly
  }

  lead() {
    this.reset();
    const peer = this.peer = new Peer(HUB_ID);
    peer.on('open', () => { this.isHub = true; this.pulse(); });
    peer.on('connection', c => {
      c.on('data', d => this.onHubData(c, d));
      c.on('close', () => this.listings.delete(c.peer));
    });
    peer.on('error', e => { if (e.type === 'unavailable-id') this.follow(); else this.retry(); });
  }

  follow() {
    this.reset();
    const peer = this.peer = new Peer();
    peer.on('open', () => {
      const c = this.conn = peer.connect(HUB_ID, { label: 'dir', serialization: 'json' });
      c.on('open', () => this.pulse());
      c.on('data', d => { if (d?.k === 'l' && Array.isArray(d.rooms)) this.onList(d.rooms.map(cleanListing).filter(Boolean)); });
      c.on('close', () => this.retry());
    });
    peer.on('error', () => this.retry());
  }

  onHubData(c, d) {
    if (d?.k === 'a') {
      const l = cleanListing(d.l);
      if (l && (this.listings.has(c.peer) || this.listings.size < MAX_ROOMS)) this.listings.set(c.peer, { l, at: Date.now() });
    } else if (d?.k === 'x') this.listings.delete(c.peer);
    if (d?.k === 'q' && c.open) c.send({ k: 'l', rooms: this.rooms() });
  }

  rooms() {
    const now = Date.now();
    for (const [id, e] of this.listings) if (now - e.at > LISTING_TTL) this.listings.delete(id);
    const all = [...this.listings.values()].map(e => e.l);
    return this.mine ? [this.mine, ...all] : all;
  }

  // every few seconds: keep our own listing alive and refresh the list
  pulse() {
    if (this.isHub) this.onList(this.rooms());
    else if (this.conn?.open) {
      if (this.mine) this.conn.send({ k: 'a', l: this.mine });
      this.conn.send({ k: 'q' });
    }
  }

  announce(listing) { this.mine = listing && cleanListing(listing); }
}
