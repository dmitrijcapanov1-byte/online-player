let allTracks = [];
let favorites = [];
let playlists = [];
let history = [];
let currentPlaylist = null;
let queue = [];
let currentIndex = -1;
let isPlaying = false;

const audio = document.getElementById("audio");

// ============================================================
// API КОНФИГ (Jamendo через Cloudflare Worker)
// ============================================================
const API_BASE = "https://dawn-dust-4bb8.dmitrijcapanov1.workers.dev/api";

function loadState() {
  try {
    allTracks = JSON.parse(localStorage.getItem("mp_tracks") || "[]");
    favorites = JSON.parse(localStorage.getItem("mp_favorites") || "[]");
    playlists = JSON.parse(localStorage.getItem("mp_playlists") || "[]");
    history = JSON.parse(localStorage.getItem("mp_history") || "[]");
  } catch (e) {
    console.error(e);
  }
}

function saveState() {
  try {
    localStorage.setItem("mp_tracks", JSON.stringify(allTracks));
    localStorage.setItem("mp_favorites", JSON.stringify(favorites));
    localStorage.setItem("mp_playlists", JSON.stringify(playlists));
    localStorage.setItem("mp_history", JSON.stringify(history));
  } catch (e) {
    console.error(e);
    alert("Не удалось сохранить. Возможно, переполнено хранилище.");
  }
}

function setPlayIcons(playing) {
  const btn = document.getElementById("miniPlay");
  if (btn) btn.textContent = playing ? "⏸" : "▶";
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

function navigate(page) {
  document.querySelectorAll(".nav-item").forEach((i) => {
    i.classList.toggle("active", i.dataset.page === page);
  });
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add("active");
  document.querySelector(".main").scrollTop = 0;

  if (page === "home") renderHome();
  if (page === "local") renderLocal();
  if (page === "favorites") renderFavorites();
  if (page === "playlists") renderPlaylists();
  if (page === "history") renderHistory();
  if (page === "search") {
    const container = document.getElementById("searchList");
    if (container) {
      container.innerHTML =
        '<p class="empty">Введите запрос и нажмите «Найти»</p>';
    }
  }
}

document.querySelectorAll(".home-card").forEach((c) => {
  c.addEventListener("click", () => navigate(c.dataset.goto));
});

function renderHome() {
  const container = document.getElementById("homeRecent");
  if (allTracks.length === 0) {
    container.innerHTML =
      '<p class="empty">Пока нет треков. Загрузите первый через «Мои треки»</p>';
    return;
  }
  const recent = [...allTracks].slice(-6).reverse();
  renderTrackList(container, recent, false, "home");
}

document.getElementById("addSongsBtn").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    try {
      const dataUrl = await fileToDataUrl(file);
      const track = {
        id:
          "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Локальный файл",
        cover_url: null,
        audio_url: dataUrl,
        duration: 0,
        addedAt: Date.now(),
      };
      track.duration = await getAudioDuration(dataUrl);
      allTracks.push(track);
    } catch (err) {
      console.error(err);
    }
  }
  saveState();
  renderLocal();
  renderHome();
  document.getElementById("fileInput").value = "";
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getAudioDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(Math.floor(a.duration) || 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });
}

function renderLocal() {
  const container = document.getElementById("localList");
  const empty = document.getElementById("localEmpty");
  if (allTracks.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  renderTrackList(container, allTracks, true, "local");
}

function renderFavorites() {
  const container = document.getElementById("favoritesList");
  const empty = document.getElementById("favoritesEmpty");
  const favTracks = allTracks.filter((t) => favorites.includes(t.id));
  if (favTracks.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  renderTrackList(container, favTracks, false, "favorites");
}

function renderPlaylists() {
  const grid = document.getElementById("playlistsGrid");
  const empty = document.getElementById("playlistsEmpty");
  const view = document.getElementById("playlistView");
  view.style.display = "none";
  document.querySelector("#page-playlists .page-header").style.display = "flex";

  if (playlists.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  grid.innerHTML = "";

  playlists.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <button class="card-delete" title="Удалить">✕</button>
      <div class="card-icon">📋</div>
      <div class="card-title">${escapeHtml(p.name)}</div>
      <div class="card-desc">${p.trackIds.length} треков</div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("card-delete")) return;
      openPlaylist(p);
    });
    card.querySelector(".card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Удалить плейлист «${p.name}»?`)) {
        playlists = playlists.filter((x) => x.id !== p.id);
        saveState();
        renderPlaylists();
      }
    });
    grid.appendChild(card);
  });
}

function openPlaylist(playlist) {
  currentPlaylist = playlist;
  document.getElementById("playlistsGrid").style.display = "none";
  document.getElementById("playlistsEmpty").style.display = "none";
  document.querySelector("#page-playlists .page-header").style.display = "none";

  const view = document.getElementById("playlistView");
  view.style.display = "block";
  document.getElementById("playlistViewName").textContent = playlist.name;

  const container = document.getElementById("playlistTracksList");
  const empty = document.getElementById("playlistEmpty");
  const tracks = playlist.trackIds
    .map((id) => allTracks.find((t) => t.id === id))
    .filter(Boolean);

  if (tracks.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  renderTrackList(container, tracks, true, `playlist:${playlist.id}`);
}

document.getElementById("backFromPlaylist").addEventListener("click", () => {
  currentPlaylist = null;
  renderPlaylists();
});

document.getElementById("createPlaylistBtn").addEventListener("click", () => {
  document.getElementById("playlistNameInput").value = "";
  document.getElementById("playlistError").textContent = "";
  document.getElementById("playlistModal").style.display = "flex";
});

document
  .getElementById("playlistCreateCancel")
  .addEventListener("click", () => {
    document.getElementById("playlistModal").style.display = "none";
  });

document
  .getElementById("playlistCreateSubmit")
  .addEventListener("click", () => {
    const name = document.getElementById("playlistNameInput").value.trim();
    if (!name) {
      document.getElementById("playlistError").textContent = "Введите название";
      return;
    }
    playlists.push({ id: "pl_" + Date.now(), name, trackIds: [] });
    saveState();
    document.getElementById("playlistModal").style.display = "none";
    renderPlaylists();
  });

function renderHistory() {
  const container = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  const tracks = history
    .map((id) => allTracks.find((t) => t.id === id))
    .filter(Boolean);
  if (tracks.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  renderTrackList(container, tracks, false, "history");
}

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  if (confirm("Очистить историю?")) {
    history = [];
    saveState();
    renderHistory();
  }
});

function addToHistory(track) {
  history = [track.id, ...history.filter((id) => id !== track.id)].slice(0, 50);
  saveState();
}

function renderTrackList(container, list, showNumbers, context) {
  container.innerHTML = "";
  if (list.length === 0) {
    container.innerHTML = '<p class="empty">Пусто</p>';
    return;
  }

  list.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "track-row";
    if (queue[currentIndex] && queue[currentIndex].id === t.id) {
      row.classList.add("playing");
    }

    const isLiked = favorites.includes(t.id);
    row.innerHTML = `
      ${showNumbers ? `<span class="track-num">${i + 1}</span>` : ""}
      <div class="track-cover">${
        t.cover_url
          ? `<img src="${t.cover_url}" alt="" style="width:100%;height:100%;border-radius:6px;object-fit:cover">`
          : "🎵"
      }</div>
      <div class="track-info">
        <div class="track-title">${escapeHtml(t.title)}</div>
        <div class="track-artist">${escapeHtml(t.artist)}</div>
      </div>
      <span class="track-duration">${formatTime(t.duration)}</span>
      <div class="track-actions">
        <button class="track-action-btn ${
          isLiked ? "liked" : ""
        }" title="В избранное">${isLiked ? "❤️" : "🤍"}</button>
        <button class="track-action-btn" title="В плейлист">➕</button>
      </div>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".track-action-btn")) return;
      playFromContext(list, i);
    });

    row
      .querySelector(".track-action-btn:first-child")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLike(t.id);
        renderTrackList(container, list, showNumbers, context);
        if (context === "favorites") renderFavorites();
      });

    row
      .querySelector(".track-action-btn:last-child")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        openAddToPlaylist(t);
      });

    container.appendChild(row);
  });
}

function playFromContext(list, index) {
  queue = [...list];
  currentIndex = index;
  playCurrent();
}

function playCurrent() {
  const t = queue[currentIndex];
  if (!t) return;
  audio.src = t.audio_url;
  audio.load();
  audio
    .play()
    .then(() => {
      isPlaying = true;
      setPlayIcons(true);
      updateMiniPlayer(t);
      addToHistory(t);
      refreshPlayingHighlight();
    })
    .catch((err) => {
      console.error("Play error:", err);
      isPlaying = false;
      setPlayIcons(false);
    });
}

function updateMiniPlayer(t) {
  document.getElementById("miniTitle").textContent = t.title;
  document.getElementById("miniArtist").textContent = t.artist;
  const cover = document.getElementById("miniCover");
  if (t.cover_url) {
    cover.src = t.cover_url;
    cover.style.display = "block";
  } else {
    cover.style.display = "none";
  }
}

function togglePlay() {
  const t = queue[currentIndex];
  if (!t) return;
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    setPlayIcons(false);
  } else {
    audio.play().then(() => {
      isPlaying = true;
      setPlayIcons(true);
    });
  }
}

function next() {
  if (queue.length === 0) return;
  currentIndex = (currentIndex + 1) % queue.length;
  playCurrent();
}

function prev() {
  if (queue.length === 0) return;
  currentIndex = (currentIndex - 1 + queue.length) % queue.length;
  playCurrent();
}

document.getElementById("miniPlay").addEventListener("click", togglePlay);
document.getElementById("miniNext").addEventListener("click", next);
document.getElementById("miniPrev").addEventListener("click", prev);

audio.addEventListener("timeupdate", () => {
  document.getElementById("miniCurrent").textContent = formatTime(
    audio.currentTime
  );
  document.getElementById("miniSeek").value = audio.currentTime;
});

audio.addEventListener("loadedmetadata", () => {
  document.getElementById("miniDuration").textContent = formatTime(
    audio.duration
  );
  document.getElementById("miniSeek").max = audio.duration;
});

audio.addEventListener("ended", next);

document.getElementById("miniSeek").addEventListener("input", (e) => {
  audio.currentTime = parseFloat(e.target.value);
});

function toggleLike(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter((x) => x !== id);
  } else {
    favorites.push(id);
  }
  saveState();
}

function refreshPlayingHighlight() {
  document.querySelectorAll(".track-row").forEach((row) => {
    const title = row.querySelector(".track-title")?.textContent;
    if (title && queue[currentIndex] && title === queue[currentIndex].title) {
      row.classList.add("playing");
    } else {
      row.classList.remove("playing");
    }
  });
}

function openAddToPlaylist(track) {
  const list = document.getElementById("addToPlaylistList");
  list.innerHTML = "";
  if (playlists.length === 0) {
    list.innerHTML =
      '<div class="add-item empty-item">У вас нет плейлистов</div>';
  } else {
    playlists.forEach((p) => {
      const item = document.createElement("div");
      item.className = "add-item";
      const already = p.trackIds.includes(track.id);
      item.innerHTML = `
        <span>📋</span>
        <div style="flex:1">
          <div style="font-weight:500">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:#888">${
            p.trackIds.length
          } треков</div>
        </div>
        ${already ? '<span style="color:#4caf50">✓</span>' : ""}
      `;
      item.addEventListener("click", () => {
        if (!already) {
          p.trackIds.push(track.id);
          saveState();
        }
        document.getElementById("addToPlaylistModal").style.display = "none";
      });
      list.appendChild(item);
    });
  }
  document.getElementById("addToPlaylistModal").style.display = "flex";
}

document.getElementById("addToPlaylistCancel").addEventListener("click", () => {
  document.getElementById("addToPlaylistModal").style.display = "none";
});

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// ПОИСК ЧЕРЕЗ JAMENDO
// ============================================================
let searchResults = [];

async function doSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;

  const q = input.value.trim();
  if (!q) return;

  const container = document.getElementById("searchList");
  if (!container) return;

  container.innerHTML = '<p class="empty">Загрузка...</p>';

  try {
    const r = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);

    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }

    const data = await r.json();

    if (!data.tracks || data.tracks.length === 0) {
      container.innerHTML = '<p class="empty">Ничего не найдено</p>';
      return;
    }

    // Сохраняем результаты в allTracks, чтобы работали лайки/плейлисты
    data.tracks.forEach((t) => {
      if (!allTracks.find((x) => String(x.id) === String(t.id))) {
        allTracks.push(t);
      }
    });
    saveState();

    searchResults = data.tracks;
    renderTrackList(container, searchResults, false, "search");
  } catch (e) {
    console.error("Search error:", e);
    container.innerHTML = '<p class="empty">Ошибка поиска</p>';
  }
}

// Привязка кнопки поиска и Enter
const _searchBtn = document.getElementById("searchBtn");
const _searchInput = document.getElementById("searchInput");

if (_searchBtn) {
  _searchBtn.addEventListener("click", doSearch);
}

if (_searchInput) {
  _searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
}

// ============================================================
// СТАРТ
// ============================================================
loadState();
renderHome();
setPlayIcons(false);
