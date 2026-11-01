import { cleanName, makeRoomCode } from './netgame.js';
import { Directory } from './directory.js';
import { MAPS, DEFAULT_MAP } from './maps/index.js';

const roomUrl = (room, map, extra = '') => `?${map !== DEFAULT_MAP ? `map=${map}&` : ''}room=${room}${extra}`;

// The Online tab: username, public match list, Quick Play, create or join a room, squads, start.
export function initLobby({ settings, save, room, create, mapId, isMatch, sfx, onEnter, onStart, onSwitch }) {
  const $ = id => document.getElementById(id);
  const name = $('netName'), status = $('netStatus'), box = $('netLobby');
  const hostMap = isMatch ? mapId : DEFAULT_MAP;
  let rooms = [], heard = false, quick = false, dir = null;
  name.value = settings.name ?? '';
  const setStatus = (text, bad = false) => { status.textContent = text; status.classList.toggle('bad', bad); };
  const keepName = () => { settings.name = cleanName(name.value); name.value = settings.name; save(); return settings.name; };
  const noLib = () => { setStatus('The networking library did not load. Check your connection and reload.', true); };

  const createRoom = isPublic => { location.search = roomUrl(makeRoomCode(), hostMap, `&create=1${isPublic ? '&public=1' : ''}`); }; // the new page hosts
  const joinRoom = r => { keepName(); location.search = roomUrl(r.room, r.map); };

  function renderRooms() {
    const ul = $('netRooms');
    $('netNoRooms').hidden = rooms.length > 0;
    ul.replaceChildren(...rooms.map(r => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${r.host} · ${MAPS[r.map].name} · ${r.players}/${r.max}${r.dedicated ? ' · server' : ''}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      b.textContent = r.started ? 'In progress' : r.players >= r.max ? 'Full' : 'Join';
      b.disabled = r.started || r.players >= r.max;
      b.addEventListener('click', () => { sfx.uiClick(); joinRoom(r); });
      li.append(label, b);
      return li;
    }));
    if (quick && heard) quickPick();
  }

  // Quick Play: the fullest open match, otherwise open a public one
  function quickPick() {
    quick = false;
    const open = rooms.filter(r => !r.started && r.players < r.max).sort((a, b) => b.players - a.players)[0];
    if (open) joinRoom(open); else { keepName(); createRoom(true); }
  }

  const listRooms = () => {
    if (dir || room || !window.Peer) return;
    dir = new Directory(list => { rooms = list; heard = true; renderRooms(); });
  };
  document.querySelector('.tabs [data-tab="online"]').addEventListener('click', listRooms);
  if (!room && settings.lastTab === 'online') listRooms();

  $('netQuick').addEventListener('click', () => {
    sfx.uiClick();
    if (!window.Peer) return noLib();
    keepName();
    setStatus('Looking for a match…');
    quick = true;
    listRooms();
    if (heard) quickPick();
    else setTimeout(() => { if (quick) { quick = false; createRoom(true); } }, 5000); // nobody answered: be the first
  });
  $('netGo').textContent = room ? 'Join match' : 'Create match';
  $('netGo').addEventListener('click', () => {
    sfx.uiClick();
    const n = keepName();
    if (!room) return createRoom($('netPublic').checked);
    if (!window.Peer) return noLib();
    $('netGo').disabled = true;
    name.disabled = true;
    setStatus('Connecting…');
    onEnter(n, false);
  });
  if (room) {
    $('netRoom').textContent = `${room} · ${MAPS[mapId].name}`;
    $('netLink').value = `${location.origin}${location.pathname}${roomUrl(room, mapId)}`;
    $('netRoomRow').hidden = false;
    $('netBrowse').hidden = true;
    $('netPublicRow').hidden = true;
  } else $('netMapNote').textContent = `New matches use the map chosen in the Play tab: ${MAPS[hostMap].name}.`;
  $('netCopy').addEventListener('click', () => {
    navigator.clipboard.writeText($('netLink').value)
      .then(() => setStatus('Link copied.'))
      .catch(() => { $('netLink').select(); setStatus('Copy was blocked. The link is selected: press Ctrl+C.'); });
  });
  $('netStart').addEventListener('click', () => { sfx.init(); onStart(); });
  $('netSwap').addEventListener('click', () => { sfx.uiClick(); onSwitch(); });

  if (room && create) { // arrived here from Create match
    $('netGo').hidden = true;
    name.disabled = true;
    setStatus('Opening room…');
    if (window.Peer) onEnter(cleanName(settings.name), true);
    else noLib();
  }

  return {
    show(players, you, ready, isHost, auto) {
      $('netGo').hidden = true;
      box.hidden = false;
      $('netStart').hidden = !isHost;
      $('netStart').disabled = !ready;
      const wait = auto != null ? `Match starts in ${auto} s.` : 'Connected. Waiting for the host to start.';
      setStatus(isHost ? (ready ? 'Room open. Send the link, then press Start. Bots fill empty slots.' : 'Opening room…') : wait);
      for (const t of [0, 1]) {
        $(`netSquad${t}`).replaceChildren(...players.filter(p => p.team === t).map(p => {
          const li = document.createElement('li');
          li.textContent = p.name + (p.host ? ' (host)' : '');
          li.classList.toggle('me', p.name === you);
          return li;
        }));
      }
      this.team = players.find(p => p.name === you)?.team ?? 0;
    },
    error(text) { setStatus(text, true); },
    started() { box.hidden = true; $('netStart').hidden = true; setStatus('Match running. Press Deploy to play. Esc comes back here; the match keeps going.'); },
    team: 0,
  };
}
