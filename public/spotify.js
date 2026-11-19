import { locale, t } from './i18n.js';

const accounts = 'https://accounts.spotify.com';
const api = 'https://api.spotify.com/v1';
const tokenKey = 'spotify-session';
const pendingKey = 'spotify-pkce';
const scopes = 'streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative user-modify-playback-state';
const byId = (id) => document.getElementById(id);
const retryTime = new Intl.DateTimeFormat(locale, {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Prague',
});

class SpotifyRateLimitError extends Error {}

function saved(key, storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}

function randomString() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function spotifyUrl(uri) {
  const match = uri?.match(/^spotify:(playlist|track|episode|artist|album):([A-Za-z0-9]{22})$/);
  return match ? 'https://open.spotify.com/' + match[1] + '/' + match[2] : null;
}

function spokenSpotifyName(name) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function spotifyCredit(item) {
  return item.artists?.map(({ name }) => name).join(', ') || item.owner?.display_name || '';
}

function spotifyVoiceLabel(item) {
  const credit = spotifyCredit(item);
  return credit ? `${item.name} od ${credit}` : item.name;
}

export function setupSpotify(icon, fadeChanged) {
  const dialog = byId('spotify');
  const status = byId('spotify-status');
  const rateLimit = byId('spotify-rate-limit');
  const connect = byId('spotify-connect');
  const disconnect = byId('spotify-disconnect');
  const library = byId('spotify-library');
  const track = byId('spotify-track');
  const artist = byId('spotify-artist');
  const currentCover = byId('spotify-current-cover');
  const currentLink = byId('spotify-current-link');
  const playlists = byId('spotify-playlists');
  const results = byId('spotify-results');
  const resultsSection = byId('spotify-search-results');
  const playlistSection = byId('spotify-playlist-section');
  const queryInput = byId('spotify-query');
  const more = byId('spotify-more');
  const transport = ['previous', 'toggle', 'next'].map((id) => byId('spotify-' + id));
  const quick = byId('spotify-quick-toggle');
  const open = byId('spotify-open');
  const quickTitle = open.querySelector('.spotify-title');
  let config;
  let session;
  let refreshPending;
  let player;
  let activatedPlayer;
  let deviceId;
  let sdk;
  let playback;
  let playlistOffset = 0;
  let playlistLoading = false;
  let playlistsLoaded = false;
  let generation = 0;
  let searchVersion = 0;
  let shownTrack;
  let retryAt = 0;
  let retryTimer;
  let lastAutoplayFailure = 0;

  function cover(node, url, lazy = true) {
    node.innerHTML = icon('music');
    if (!/^https:\/\/[a-z0-9.-]+\.(?:scdn\.co|spotifycdn\.com)\//i.test(url ?? '')) return;
    const image = new Image();
    image.alt = '';
    image.loading = lazy ? 'lazy' : 'eager';
    image.addEventListener('load', () => { image.dataset.loaded = 'true'; }, { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = url;
    node.append(image);
  }

  function showTrack(item) {
    if (shownTrack === item?.uri) return;
    shownTrack = item?.uri;
    track.textContent = item?.name ?? t('Zatím se nic nepřehrává');
    track.title = item?.name ?? '';
    artist.textContent = item?.artists?.map(({ name }) => name).join(', ') ?? '';
    artist.title = artist.textContent;
    cover(currentCover, item?.album?.images?.[0]?.url, false);
    const url = spotifyUrl(item?.uri);
    currentLink.hidden = !url;
    if (url) currentLink.href = url;
  }

  function message(text) {
    status.textContent = text;
  }

  function reportError(error) {
    if (!(error instanceof SpotifyRateLimitError)) message(error.message);
  }

  function clearRateLimit() {
    clearTimeout(retryTimer);
    retryAt = 0;
    rateLimit.textContent = '';
  }

  function waitForRateLimit() {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) clearRateLimit();
    else retryTimer = setTimeout(waitForRateLimit, Math.min(remaining, 2_147_483_647));
  }

  async function spotifyFetch(url, options, current = generation) {
    if (retryAt > Date.now()) throw new SpotifyRateLimitError();
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    const header = response.headers.get('Retry-After');
    const now = Date.now();
    const retry = /^\d+$/.test(header ?? '') ? now + Number(header) * 1000 : NaN;
    const hasRetryTime = Number.isFinite(retry) && retry <= 8.64e15;
    const next = hasRetryTime ? Math.max(now + 1000, retry) : now + 30_000;
    const body = await response.json().catch(() => null);
    if (current === generation && next >= retryAt) {
      const detail = body?.error?.reason === 'QUOTA_EXCEEDED'
        ? t('Spotify hlásí vyčerpanou kvótu aplikace.')
        : t('Spotify dočasně omezuje počet požadavků.');
      retryAt = next;
      rateLimit.textContent = detail + ' ' + (hasRetryTime
        ? t('Další pokus v {time}.').replace('{time}', retryTime.format(retryAt))
        : t('Zkuste to znovu za chvíli.'));
      clearTimeout(retryTimer);
      waitForRateLimit();
    }
    throw new SpotifyRateLimitError();
  }

  function controls() {
    connect.hidden = !config?.clientId || Boolean(session);
    disconnect.hidden = !session;
    library.hidden = !session;
    transport.forEach((button) => { button.disabled = !deviceId || !playback; });
    const playing = Boolean(playback && !playback.paused);
    const current = playback?.track_window?.current_track;
    transport[1].innerHTML = icon(playing ? 'pause' : 'play');
    const action = t(playing ? t('Pozastavit') : t('Přehrát'));
    transport[1].setAttribute('aria-label', action);
    quick.hidden = !deviceId || !current;
    quick.innerHTML = transport[1].innerHTML;
    quick.setAttribute('aria-label', action);
    quickTitle.textContent = current?.name ?? 'Spotify';
    open.title = current?.name ?? 'Spotify';
    open.setAttribute('aria-label', current ? 'Spotify · ' + current.name : 'Spotify');
    fadeChanged(open, [current?.uri, playing, quick.hidden].join('|'));
  }

  function clearSearch() {
    searchVersion++;
    queryInput.value = '';
    results.replaceChildren();
    resultsSection.hidden = true;
    playlistSection.hidden = false;
    byId('spotify-search').querySelector('button').disabled = false;
  }

  function clearSession() {
    generation++;
    player?.disconnect();
    player = activatedPlayer = deviceId = playback = refreshPending = session = undefined;
    try { localStorage.removeItem(tokenKey); } catch {}
    showTrack();
    playlists.replaceChildren();
    clearSearch();
    playlistsLoaded = playlistLoading = false;
    playlistOffset = 0;
    more.hidden = true;
    controls();
  }

  async function loadConfig() {
    if (config) return config;
    const response = await fetch('/api/spotify/config', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(t('Konfigurace Spotify je nedostupná.'));
    config = await response.json();
    return config;
  }

  async function requestToken(params, current = generation) {
    const response = await spotifyFetch(accounts + '/api/token', {
      method: 'POST',
      body: new URLSearchParams({ ...params, client_id: config.clientId }),
      signal: AbortSignal.timeout(12_000),
    }, current);
    const token = await response.json();
    if (current !== generation) throw new Error(t('Připojení Spotify skončilo.'));
    if (token.error === 'invalid_grant') {
      clearSession();
      throw new Error(t('Platnost připojení skončila. Připojte účet znovu.'));
    }
    if (!response.ok || !token.access_token || !token.expires_in)
      throw new Error(t('Spotify nepotvrdilo připojení účtu') + ' (HTTP ' + response.status + ').');
    return token;
  }

  function saveToken(token) {
    session = {
      clientId: config.clientId,
      access: token.access_token,
      refresh: token.refresh_token || session?.refresh,
      expires: Date.now() + token.expires_in * 1000,
    };
    try { localStorage.setItem(tokenKey, JSON.stringify(session)); } catch {}
    return session.access;
  }

  async function accessToken(force = false) {
    if (session?.access && !force && session.expires > Date.now() + 60_000) return session.access;
    if (!session?.refresh) throw new Error(t('Připojte účet Spotify.'));
    if (!refreshPending) {
      const current = generation;
      const pending = requestToken({ grant_type: 'refresh_token', refresh_token: session.refresh }, current)
        .then((token) => {
          if (current !== generation) throw new Error(t('Připojení Spotify skončilo.'));
          return saveToken(token);
        })
        .finally(() => { if (refreshPending === pending) refreshPending = undefined; });
      refreshPending = pending;
    }
    return refreshPending;
  }

  async function spotifyApi(path, options) {
    const current = generation;
    const signal = options?.signal;
    const request = (token) => {
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(12_000);
      return spotifyFetch(api + path, {
        ...options,
        headers: { Authorization: 'Bearer ' + token, ...options?.headers },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }, current);
    };
    signal?.throwIfAborted();
    const token = await accessToken();
    let response = await request(token);
    if (response.status === 401) {
      const updated = session?.access !== token && session?.access;
      response = await request(updated || await accessToken(true));
    }
    if (!response.ok) throw new Error(t('Spotify požadavek odmítlo') + ' (HTTP ' + response.status + ').');
    return response.status === 204 || options?.method === 'PUT' ? null : response.json();
  }

  connect.addEventListener('click', async () => {
    if (retryAt > Date.now()) return;
    connect.disabled = true;
    try {
      const redirect = new URL(config.redirectUri);
      if (redirect.origin !== location.origin || redirect.pathname !== '/spotify/callback') {
        message(t('Pro připojení otevřete panel na adrese') + ' ' + redirect.origin + '.');
        return;
      }
      const verifier = randomString();
      const state = randomString();
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      sessionStorage.setItem(pendingKey, JSON.stringify({ state, verifier, at: Date.now() }));
      location.assign(accounts + '/authorize?' + new URLSearchParams({
        response_type: 'code', client_id: config.clientId, scope: scopes, redirect_uri: config.redirectUri,
        state, code_challenge_method: 'S256', code_challenge: challenge,
      }));
    } catch {
      message(t('Přihlášení Spotify se nepodařilo otevřít.'));
    } finally {
      connect.disabled = false;
    }
  });

  async function finishLogin() {
    const params = new URLSearchParams(location.search);
    history.replaceState(null, '', '/');
    dialog.showModal();
    message(t('Připojuji účet Spotify…'));
    try {
      const pending = saved(pendingKey, sessionStorage);
      sessionStorage.removeItem(pendingKey);
      if (!pending || pending.state !== params.get('state') || Date.now() - pending.at > 15 * 60_000) {
        throw new Error(t('Přihlášení vypršelo. Připojte účet znovu ze stejné karty.'));
      }
      if (params.get('error') || !params.get('code')) throw new Error(t('Připojení účtu nebylo dokončeno.'));
      await loadConfig();
      if (!config.clientId) throw new Error(t('Panel potřebuje Client ID aplikace Spotify.'));
      saveToken(await requestToken({
        grant_type: 'authorization_code', code: params.get('code'),
        redirect_uri: config.redirectUri, code_verifier: pending.verifier,
      }));
      showLibrary();
    } catch (error) {
      await loadConfig().catch(() => {});
      controls();
      reportError(error);
    }
  }

  function loadSdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    sdk ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => failed(), 12_000);
      function failed() {
        clearTimeout(timeout);
        script.remove();
        sdk = undefined;
        reject(new Error(t('Přehrávač Spotify se nepodařilo načíst.')));
      }
      window.onSpotifyWebPlaybackSDKReady = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.addEventListener('error', failed, { once: true });
      document.head.append(script);
    });
    return sdk;
  }

  async function startPlayer() {
    if (player) return;
    const current = generation;
    await loadSdk();
    if (current !== generation || player || !session) return;
    const instance = new window.Spotify.Player({
      name: 'Domácí panel',
      getOAuthToken: (callback) => accessToken().then(callback).catch(reportError),
      volume: 0.6,
    });
    player = instance;
    const listen = (event, listener) => instance.addListener(event, (data) => {
      if (player === instance) listener(data);
    });
    listen('ready', ({ device_id }) => {
      deviceId = device_id;
      if (status.textContent === t('Připojuji přehrávač…')) message('');
      controls();
    });
    listen('not_ready', () => {
      deviceId = undefined;
      message(t('Přehrávač Spotify je dočasně nedostupný.'));
      controls();
    });
    listen('player_state_changed', (state) => {
      playback = state;
      showTrack(state?.track_window?.current_track);
      controls();
    });
    listen('account_error', () => message(t('Pro přehrávání v panelu je potřeba účet Spotify Premium.')));
    listen('initialization_error', () => message(t('V tomto prohlížeči se nespustilo chráněné přehrávání Spotify.')));
    listen('authentication_error', () => message(t('Spotify nepřijalo připojení. Zkuste účet znovu připojit.')));
    listen('playback_error', () => message(t('Vybraný obsah se nepodařilo přehrát.')));
    listen('autoplay_failed', () => {
      lastAutoplayFailure++;
      activatedPlayer = undefined;
      message(t('Klepněte na tlačítko přehrávání.'));
    });
    try {
      if (!await instance.connect()) throw new Error(t('Spotify nepřipojilo přehrávač.'));
    } catch (error) {
      if (player === instance) {
        instance.disconnect();
        player = undefined;
      }
      throw error;
    }
  }

  function itemsInto(container, items) {
    for (const item of items) {
      const url = spotifyUrl(item?.uri);
      if (!url || !item.name) continue;
      const card = document.createElement('article');
      card.className = 'spotify-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spotify-item-play';
      button.dataset.play = item.uri;
      button.setAttribute('aria-label', t('Přehrát') + ' ' + item.name);
      button.title = item.name;
      const artwork = document.createElement('span');
      artwork.className = 'spotify-cover';
      artwork.setAttribute('aria-hidden', 'true');
      const images = item.album?.images ?? item.images;
      cover(artwork, images?.at(-1)?.url);
      const description = document.createElement('div');
      description.className = 'spotify-item-description';
      const title = document.createElement('strong');
      title.textContent = title.title = item.name;
      description.append(title);
      const subtitle = spotifyCredit(item);
      if (subtitle) {
        const detail = document.createElement('span');
        detail.textContent = detail.title = subtitle;
        description.append(detail);
      }
      button.append(artwork, description, document.createRange().createContextualFragment(icon('play', 'spotify-item-icon')));
      const link = document.createElement('a');
      link.className = 'spotify-item-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Otevřít na Spotify: ' + item.name);
      link.textContent = '↗';
      card.append(button, link);
      container.append(card);
    }
  }

  async function loadPlaylists() {
    if (playlistLoading) return;
    playlistLoading = true;
    more.disabled = true;
    const current = generation;
    try {
      const data = await spotifyApi('/me/playlists?limit=20&offset=' + playlistOffset);
      if (current !== generation) return;
      itemsInto(playlists, data.items ?? []);
      if (!playlists.childElementCount) playlists.textContent = t('Žádné playlisty');
      playlistOffset += data.items?.length ?? 0;
      more.hidden = !data.next;
      playlistsLoaded = true;
    } catch (error) {
      if (current === generation) {
        if (error instanceof SpotifyRateLimitError) more.hidden = false;
        reportError(error);
      }
    } finally {
      if (current === generation) {
        more.disabled = false;
        playlistLoading = false;
      }
    }
  }

  async function activatePlayer(instance) {
    if (activatedPlayer === instance) return;
    await instance.activateElement();
    if (player === instance) activatedPlayer = instance;
  }

  async function play(uri, signal) {
    const instance = player;
    if (!deviceId || !instance) throw new Error(t('Počkejte na připojení přehrávače Spotify.'));
    try {
      await activatePlayer(instance);
    } catch (error) {
      if (!signal) throw error;
      throw new Error('Povol zvuk klepnutím na panel a zopakuj povel.');
    }
    signal?.throwIfAborted();
    if (!deviceId || instance !== player) throw new Error(t('Připojení Spotify skončilo.'));
    const body = uri.startsWith('spotify:track:') ? { uris: [uri] } : { context_uri: uri };
    await spotifyApi('/me/player/play?device_id=' + encodeURIComponent(deviceId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
  }

  function restoreSession() {
    if (!session) {
      const stored = saved(tokenKey);
      if (config.clientId && stored?.clientId === config.clientId) session = stored;
    }
  }

  async function prepareVoiceSpotify(signal) {
    const current = generation;
    await loadConfig();
    signal?.throwIfAborted();
    if (current !== generation) throw new Error('Připojení Spotify skončilo.');
    restoreSession();
    if (!session) throw new Error('Nejdřív v panelu připoj účet Spotify.');
    return current;
  }

  async function voicePlayer(signal) {
    await startPlayer();
    signal?.throwIfAborted();
    const instance = player;
    if (instance && !deviceId) {
      const timeout = AbortSignal.timeout(4500);
      const waiting = signal ? AbortSignal.any([timeout, signal]) : timeout;
      await new Promise((resolve, reject) => {
        function cleanup() {
          instance.removeListener('ready', ready);
          waiting.removeEventListener('abort', aborted);
        }
        function ready() {
          cleanup();
          resolve();
        }
        function aborted() {
          cleanup();
          reject(new Error('Spotify zatím nepřipojilo přehrávač v panelu.'));
        }
        instance.addListener('ready', ready);
        waiting.addEventListener('abort', aborted, { once: true });
      });
    }
    if (!deviceId || !instance || instance !== player) throw new Error('Přehrávač Spotify je nedostupný.');
    return instance;
  }

  async function voiceSpotifySearch(query, kind, signal) {
    const qualified = (!kind || kind === 'track') && query.match(/^(.+?)\s+od\s+(?:(?:skupiny|interpreta)\s+)?(.+)$/iu);
    const types = qualified ? 'track' : kind ?? 'artist,track,playlist,album';
    const q = qualified ? `track:${qualified[1]} artist:${qualified[2]}` : query;
    const data = await spotifyApi('/search?' + new URLSearchParams({ q, type: types, limit: 10 }), { signal });
    signal?.throwIfAborted();
    const items = ['artists', 'tracks', 'playlists', 'albums'].flatMap((type) => data?.[type]?.items ?? []);
    const sought = spokenSpotifyName(query);
    const owned = [];
    if (kind === 'playlist' || (!kind && !qualified && !items.some((item) => item?.name && spokenSpotifyName(item.name) === sought))) {
      let offset = 0;
      for (let page = 0; page < 5; page++) {
        const library = await spotifyApi('/me/playlists?limit=20&offset=' + offset, { signal });
        signal?.throwIfAborted();
        const playlists = library?.items ?? [];
        owned.push(...playlists.filter((item) => item?.name && spotifyUrl(item.uri) && spokenSpotifyName(item.name) === sought));
        if (owned.length || !library?.next || !playlists.length) break;
        offset += playlists.length;
      }
    }
    const unique = new Map();
    for (const item of [...owned, ...items]) {
      if (!item?.name || !spotifyUrl(item.uri) || item.is_playable === false) continue;
      if (owned.length && !owned.includes(item) && item.uri.startsWith('spotify:playlist:') &&
          spokenSpotifyName(item.name) === sought) continue;
      const key = item.uri.startsWith('spotify:track:') ? 'track:' + spokenSpotifyName(spotifyVoiceLabel(item)) : item.uri;
      if (!unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()];
  }

  async function spotifyVoiceAction(action, signal) {
    const { operation, kind, volume } = action;
    const current = await prepareVoiceSpotify(signal);
    const query = typeof action.query === 'string' ? action.query.trim().slice(0, 100) : '';
    if (operation === 'spotify.search' || (operation === 'spotify.play' && query)) {
      if (!query) return { message: 'Co mám na Spotify vyhledat?' };
      const items = await voiceSpotifySearch(query, kind, signal);
      if (!items.length) return { message: `Na Spotify jsem nenašel nic pro ${query}.`, failed: true };
      const names = items.slice(0, 3).map(spotifyVoiceLabel).join(', ');
      if (operation === 'spotify.search') return { message: `Našel jsem ${names}.` };
      const sought = spokenSpotifyName(query).replace(/\bod (?:skupiny|interpreta) /u, 'od ');
      const exact = items.filter((item) => spokenSpotifyName(item.name) === sought ||
        spokenSpotifyName(spotifyVoiceLabel(item)) === sought);
      const artist = (!kind || kind === 'artist') && exact.find((item) => item.uri.startsWith('spotify:artist:'));
      const playlists = !kind ? exact.filter((item) => item.uri.startsWith('spotify:playlist:')) : [];
      const item = artist || (playlists.length === 1 ? playlists[0] : exact.length === 1 ? exact[0] : null);
      if (!item) {
        const choices = exact.length > 1 ? exact.slice(0, 3).map(spotifyVoiceLabel).join(', ') : names;
        return { message: `Mám tyto možnosti: ${choices}. Zopakuj „přehraj“ s přesným názvem nebo upřesni, že jde o playlist.` };
      }
      await voicePlayer(signal);
      if (current !== generation) throw new Error('Připojení Spotify skončilo.');
      const before = lastAutoplayFailure;
      await play(item.uri, signal);
      if (before !== lastAutoplayFailure) throw new Error('Povol zvuk klepnutím na panel a zopakuj povel.');
      return { message: `Spotify dostalo pokyn přehrát ${spotifyVoiceLabel(item)}.` };
    }

    const instance = await voicePlayer(signal);
    signal?.throwIfAborted();
    if (current !== generation) throw new Error('Připojení Spotify skončilo.');
    switch (operation) {
      case 'spotify.read': {
        const state = await instance.getCurrentState();
        const item = state?.track_window?.current_track;
        return { message: item ? (state.paused ? 'Pozastaveno: ' : 'Hraje ') + spotifyVoiceLabel(item) + '.' : 'Na panelu teď Spotify nic nepřehrává.' };
      }
      case 'spotify.pause':
        await instance.pause();
        return { message: 'Pozastaveno.' };
      case 'spotify.play':
      case 'spotify.resume':
        await instance.resume();
        return { message: 'Pokračuji v přehrávání.' };
      case 'spotify.next':
        await instance.nextTrack();
        return { message: 'Přepnuto na další skladbu.' };
      case 'spotify.previous':
        await instance.previousTrack();
        return { message: 'Přepnuto na předchozí skladbu.' };
      case 'spotify.volume':
        if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
          return { message: 'Řekni hlasitost od nuly do sta procent.', failed: true };
        }
        await instance.setVolume(volume / 100);
        return { message: `Hlasitost Spotify je ${volume} procent.` };
      default:
        return { message: 'Tomuto povelu pro Spotify nerozumím.', failed: true };
    }
  }

  document.addEventListener('panel-voice-client-action', (event) => {
    const { action, resolve, signal } = event.detail ?? {};
    if (typeof action?.operation !== 'string' || !action.operation.startsWith('spotify.') || typeof resolve !== 'function') return;
    spotifyVoiceAction(action, signal).then(resolve, (error) => resolve({
      message: error instanceof SpotifyRateLimitError ? 'Spotify dočasně omezilo požadavky. Zkus to za chvíli.' :
        error.message || 'Spotify příkaz nedokončilo.',
      failed: true,
    }));
  });
  document.addEventListener('click', (event) => {
    if (event.isTrusted && player) activatePlayer(player).catch(reportError);
  }, { capture: true });

  function showLibrary() {
    controls();
    if (!session) {
      message(config?.clientId ? '' : t('Pro připojení účtu v panelu je potřeba Client ID aplikace Spotify.'));
      return;
    }
    if (!deviceId) message(t('Připojuji přehrávač…'));
    startPlayer().catch(reportError);
    if (!playlistsLoaded) loadPlaylists();
  }

  open.addEventListener('click', async () => {
    dialog.showModal();
    try {
      await loadConfig();
      restoreSession();
      showLibrary();
    } catch (error) {
      message(error.message);
    }
  });
  quick.addEventListener('click', () => {
    player?.togglePlay().catch((error) => message(error.message));
  });
  byId('spotify-close').addEventListener('click', () => dialog.close());
  disconnect.addEventListener('click', () => { clearSession(); message(t('Účet je odpojený.')); });
  more.addEventListener('click', loadPlaylists);
  byId('spotify-clear').addEventListener('click', () => {
    clearSearch();
    queryInput.focus();
  });
  queryInput.addEventListener('input', () => {
    if (!queryInput.value) clearSearch();
  });
  library.addEventListener('click', (event) => {
    const item = event.target.closest('button[data-play]');
    if (item) play(item.dataset.play).catch(reportError);
  });
  transport.forEach((button, index) => button.addEventListener('click', () => {
    player?.[['previousTrack', 'togglePlay', 'nextTrack'][index]]().catch((error) => message(error.message));
  }));

  byId('spotify-search').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;
    const submit = event.submitter;
    const current = generation;
    const version = ++searchVersion;
    submit.disabled = true;
    try {
      const data = await spotifyApi('/search?' + new URLSearchParams({ q: query, type: 'track', limit: 10 }));
      if (current !== generation || version !== searchVersion) return;
      results.replaceChildren();
      itemsInto(results, data.tracks?.items ?? []);
      if (!results.childElementCount) results.textContent = t('Žádné skladby');
      resultsSection.hidden = false;
      playlistSection.hidden = true;
      resultsSection.scrollIntoView({ block: 'nearest' });
    } catch (error) {
      if (current === generation && version === searchVersion) reportError(error);
    } finally {
      if (version === searchVersion) submit.disabled = false;
    }
  });

  cover(currentCover);
  if (location.pathname === '/spotify/callback') finishLogin();
  else if (saved(tokenKey)) prepareVoiceSpotify().then(() => startPlayer()).catch(reportError);
}
