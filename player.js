(() => {
  const cfg = window.AURAEA_PLAYER_CONFIG || {};
  const listEl = document.getElementById('playerList');
  const statusEl = document.getElementById('playerStatus');
  const toggleBtn = document.getElementById('playerToggle');
  const toggleLabel = toggleBtn ? toggleBtn.querySelector('.player__toggle-label') : null;
  const panelEl = document.getElementById('playerPanel');
  const CACHE_KEY = 'auraea_tracks_cache_v2';

  if (!listEl || !toggleBtn || !panelEl) return;

  let tracksLoaded = false;

  function setStatus(msg){
    if (statusEl) statusEl.textContent = msg;
  }

  function fallbackToChannel(msg){
    listEl.innerHTML = `
      <p class="player__status">${msg}</p>
      <a class="btn btn--ghost" href="https://www.youtube.com/@auraeamusic" target="_blank" rel="noopener">
        Listen on YouTube instead
      </a>`;
  }

  // ── open/close panel ─────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    const isOpen = toggleBtn.getAttribute('aria-expanded') === 'true';
    const nextOpen = !isOpen;

    toggleBtn.setAttribute('aria-expanded', String(nextOpen));
    panelEl.hidden = !nextOpen;
    if (toggleLabel) toggleLabel.textContent = nextOpen ? 'Hide track list' : 'Show track list';

    if (nextOpen && !tracksLoaded){
      tracksLoaded = true;
      getTracks()
        .then(tracks => {
          render(tracks);
          loadIframeApi();
        })
        .catch(err => {
          if (err.message === 'missing-key'){
            fallbackToChannel('Player isn\u2019t configured yet.');
          } else {
            fallbackToChannel('Tracks couldn\u2019t be loaded right now.');
          }
        });
    }
  });

  // ── fetch playlist (with localStorage caching) ──────────────────
  async function getTracks(){
    const cacheMs = (cfg.cacheMinutes || 20) * 60 * 1000;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.time < cacheMs && Array.isArray(cached.tracks)){
        return cached.tracks;
      }
    } catch (e) { /* ignore bad cache */ }

    if (!cfg.youtubeApiKey || cfg.youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_HERE' || cfg.youtubeApiKey === '__YOUTUBE_API_KEY__'){
      throw new Error('missing-key');
    }

    const tracks = [];
    let pageToken = '';
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('playlistId', cfg.uploadsPlaylistId);
      url.searchParams.set('key', cfg.youtubeApiKey);
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('api-error');
      const data = await res.json();

      (data.items || []).forEach(item => {
        const sn = item.snippet;
        if (!sn || !sn.resourceId || sn.title === 'Private video' || sn.title === 'Deleted video') return;
        tracks.push({
          id: sn.resourceId.videoId,
          title: sn.title
        });
      });

      pageToken = data.nextPageToken || '';
    } while (pageToken);

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), tracks }));
    } catch (e) { /* storage full or blocked, no big deal */ }

    return tracks;
  }

  function render(tracks){
    if (!tracks.length){
      fallbackToChannel("Couldn't find any tracks right now.");
      return;
    }

    listEl.innerHTML = '';
    tracks.forEach(track => {
      const row = document.createElement('div');
      row.className = 'track';
      row.dataset.videoId = track.id;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Play ${track.title}`);

      row.innerHTML = `
        <span class="track__icon-btn">${iconPlay()}</span>
        <div class="track__body">
          <p class="track__title">${escapeHtml(track.title)}</p>
          <div class="track__progress"><div class="track__progress-bar"></div></div>
        </div>`;

      row.addEventListener('click', () => handleTrackClick(track.id, row));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          handleTrackClick(track.id, row);
        }
      });

      listEl.appendChild(row);
    });
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function iconPlay(){
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>`;
  }
  function iconPause(){
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
  }

  let ytPlayer = null;
  let ytReady = false;
  let pendingPlayId = null;
  let currentRow = null;
  let progressTimer = null;

  window.onYouTubeIframeAPIReady = function(){
    ytPlayer = new YT.Player('ytPlayerMount', {
      height: '1',
      width: '1',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
      events: {
        onReady: () => {
          ytReady = true;
          if (pendingPlayId) playVideo(pendingPlayId);
        },
        onStateChange: onPlayerStateChange
      }
    });
  };

  function loadIframeApi(){
    if (window.YT && window.YT.Player){
      window.onYouTubeIframeAPIReady();
      return;
    }
    if (document.getElementById('ytIframeApiScript')) return;
    const tag = document.createElement('script');
    tag.id = 'ytIframeApiScript';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  function handleTrackClick(videoId, row){
    if (currentRow === row){
      if (!ytPlayer || !ytReady) return;
      const state = ytPlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING){
        ytPlayer.pauseVideo();
      } else {
        ytPlayer.playVideo();
      }
      return;
    }
    playVideo(videoId, row);
  }

  function playVideo(videoId, row){
    if (row) setActiveRow(row);
    if (!ytReady || !ytPlayer){
      pendingPlayId = videoId;
      return;
    }
    ytPlayer.loadVideoById(videoId);
  }

  function setActiveRow(row){
    if (currentRow && currentRow !== row){
      currentRow.classList.remove('is-playing', 'is-active');
      const bar = currentRow.querySelector('.track__progress-bar');
      if (bar) bar.style.width = '0%';
      const iconBtn = currentRow.querySelector('.track__icon-btn');
      if (iconBtn) iconBtn.innerHTML = iconPlay();
    }
    currentRow = row;
    row.classList.add('is-active');
  }

  function onPlayerStateChange(e){
    if (!currentRow) return;
    const iconBtn = currentRow.querySelector('.track__icon-btn');

    if (e.data === YT.PlayerState.PLAYING){
      currentRow.classList.add('is-playing');
      if (iconBtn) iconBtn.innerHTML = iconPause();
      startProgressTimer();
    } else if (e.data === YT.PlayerState.PAUSED){
      currentRow.classList.remove('is-playing');
      if (iconBtn) iconBtn.innerHTML = iconPlay();
      stopProgressTimer();
    } else if (e.data === YT.PlayerState.ENDED){
      currentRow.classList.remove('is-playing');
      if (iconBtn) iconBtn.innerHTML = iconPlay();
      stopProgressTimer();
      const bar = currentRow.querySelector('.track__progress-bar');
      if (bar) bar.style.width = '0%';
      playNext();
    }
  }

  function playNext(){
    if (!currentRow) return;
    const next = currentRow.nextElementSibling;
    if (next && next.classList.contains('track')){
      const videoId = next.dataset.videoId;
      playVideo(videoId, next);
    }
  }

  function startProgressTimer(){
    stopProgressTimer();
    progressTimer = setInterval(() => {
      if (!ytPlayer || !currentRow) return;
      const dur = ytPlayer.getDuration();
      const cur = ytPlayer.getCurrentTime();
      if (dur > 0){
        const bar = currentRow.querySelector('.track__progress-bar');
        if (bar) bar.style.width = `${Math.min(100, (cur / dur) * 100)}%`;
      }
    }, 400);
  }

  function stopProgressTimer(){
    if (progressTimer){
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
})();
