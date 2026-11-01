import { cleanName, makeRoomCode } from './netgame.js';

// The Online tab: pick a username, create or join a room, choose a squad, start.
export function initLobby({ settings, save, room, create, sfx, onEnter, onStart, onSwitch }) {
  const $ = id => document.getElementById(id);
  const name = $('netName'), status = $('netStatus'), box = $('netLobby');
  name.value = settings.name ?? '';
  const setStatus = (text, bad = false) => { status.textContent = text; status.classList.toggle('bad', bad); };
  const keepName = () => { settings.name = cleanName(name.value); name.value = settings.name; save(); return settings.name; };

  $('netGo').textContent = room ? 'Join match' : 'Create match';
  $('netGo').addEventListener('click', () => {
    sfx.uiClick();
    const n = keepName();
    if (!room) { location.search = `?room=${makeRoomCode()}&create=1`; return; } // the new page hosts
    if (!window.Peer) return setStatus('The networking library did not load. Check your connection and reload.', true);
    $('netGo').disabled = true;
    name.disabled = true;
    setStatus('Connecting…');
    onEnter(n, false);
  });
  if (room) {
    $('netRoom').textContent = room;
    $('netLink').value = `${location.origin}${location.pathname}?room=${room}`;
    $('netRoomRow').hidden = false;
  }
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
    else setStatus('The networking library did not load. Check your connection and reload.', true);
  }

  return {
    show(players, you, ready, isHost) {
      $('netGo').hidden = true;
      box.hidden = false;
      $('netStart').hidden = !isHost;
      $('netStart').disabled = !ready;
      setStatus(isHost ? (ready ? 'Room open. Send the link, then press Start. Bots fill empty slots.' : 'Opening room…') : 'Connected. Waiting for the host to start.');
      for (const t of [0, 1]) {
        const ul = $(`netSquad${t}`);
        ul.replaceChildren(...players.filter(p => p.team === t).map(p => {
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
