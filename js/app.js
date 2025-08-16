// Local storage key
const STORAGE_KEY = 'watchlist_items_v1';
const API_KEY_STORAGE = 'tmdb_api_key_v1';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// App state
let tmdbKey = localStorage.getItem(API_KEY_STORAGE) || '';
document.getElementById('tmdbKey').value = tmdbKey;

const state = {
    results: [],
    library: loadLibrary(),
    selected: null
};

/**
 * Adds an event listener to an element by ID.
 * @param {string} elementId - The ID of the element to attach the listener to.
 * @param {string} eventType - The type of event to listen for (e.g, 'click', 'change').
 * @param {Function} callback - The function to call when the event occurs.
 */
function addListenerToElement(elementId, eventType, callback) {
    const element = document.getElementById(elementId);

    if (element) {
        element.addEventListener(eventType, callback);
    } else {
        console.warn(`Element with ID '${elementId}' not found. Cannot add event listener.`);
    }
}

const toastContainer = document.getElementById('toast-container');

/**
 * Displays a toast message for a given duration.
 * @param {string} message - The message to display.
 * @param {number} [duration=3] - The duration in seconds to show the toast
 */
function showToast(message, duration) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    duration = duration * 1000 || 3000;

    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, duration);
}

function saveTmdbKey() {
    tmdbKey = document.getElementById('tmdbKey').value.trim();
    localStorage.setItem(API_KEY_STORAGE, tmdbKey);
    showToast('TMDB key saved locally.');
}

addListenerToElement('saveTmdbKey', 'click', saveTmdbKey);

/**
 * Loads the watchlist library from local storage.
 * @return {Array} - An array of watchlist items.
 */
function loadLibrary() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : []
    } catch (e) {
        return []
    }
}

/**
 * Persists the current library state to local storage.
 */
function persistLibrary() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.library));
    document.getElementById('itemCount').textContent = state.library.length;
}

persistLibrary();

/**
 * Searches TMDB for a query string.
 * @param {string} query - The search query.
 * @param {string} [type='multi'] - The type of media to search for (e.g., 'movie', 'tv', 'multi').
 * @returns {Promise<Array>} - A promise that resolves to an array of search results.
 */
async function tmdbSearch(query, type = 'multi') {
    if (!tmdbKey) {
        showToast('Please set your TMDB API key first.');
        return []
    }
    const url = `https://api.themoviedb.org/3/search/${type}?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(query)}&include_adult=false&page=1`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error('TMDB search failed: ' + res.statusText)
    }
    const data = await res.json();
    return data.results || [];
}

/**
 * Fetches full details for a media item by type and ID.
 * @param {string} mediaType - The type of media (e.g., 'movie', 'tv').
 * @param {number} id - The ID of the media item.
 * @returns {Promise<Object>} - A promise that resolves to the full details of the media item.
 */
async function fetchDetails(mediaType, id) {
    if (!tmdbKey) throw new Error('missing tmdb key');
    const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${encodeURIComponent(tmdbKey)}&append_to_response=external_ids`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('details failed');
    return res.json();
}

/**
 * Renders the search results in the UI.
 * @param {Array} list - The list of search results to render.
 */
function renderResults(list) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    if (!list.length) {
        container.innerHTML = '<div class="muted small">No results</div>';
        return
    }
    list.forEach(item => {
        const el = document.createElement('div');
        el.className = 'result';
        const img = document.createElement('img');
        img.src = item.poster_path ? IMAGE_BASE + item.poster_path : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"></svg>';
        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('h4');
        title.textContent = item.title || item.name || 'Unknown';
        const sub = document.createElement('p');
        sub.textContent = `${(item.release_date || item.first_air_date || '').slice(0, 4)} — ${item.media_type || (item.title ? 'movie' : 'tv')}`;
        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add';
        addBtn.style.marginLeft = '1em';
        addBtn.addEventListener('click', () => addOrReloadLibraryItem(item, false));
        meta.appendChild(title);
        meta.appendChild(sub);
        el.appendChild(img);
        el.appendChild(meta);
        el.appendChild(addBtn);
        container.appendChild(el);
    });
}

/**
 * Adds or reloads an item in the library.
 * @param {Object} mediaItem - The media item to add, containing at least id and media_type.
 * @param {boolean} [isReload=false] - Whether this is a reload operation (to update existing item).
 * @returns {Promise<void>} - A promise that resolves when the item is added/updated.
 */
async function addOrReloadLibraryItem(mediaItem, isReload = false) {
    try {
        const mediaType = mediaItem.media_type || mediaItem.type || (mediaItem.title ? 'movie' : 'tv');
        const id = mediaItem.id;
        const full = await fetchDetails(mediaType, id);

        let totalEpisodes;
        if (mediaType === 'tv' && Array.isArray(full.seasons)) {
            totalEpisodes = full.seasons
                .filter(s => s.season_number > 0)
                .map(s => s.episode_count || 0);
        } else {
            totalEpisodes = [1];
        }

        const item = isReload ? mediaItem : {};
        item.id = full.id;
        item.title = full.title || full.name;
        item.type = mediaType;
        item.poster = full.poster_path ? IMAGE_BASE + full.poster_path : null;
        item.overview = full.overview || '';
        item.year = (full.release_date || full.first_air_date || '').slice(0, 4);
        item.totalEpisodes = totalEpisodes;

        if (!isReload) {
            item.watchedAt = Date.now();
            item.status = 'Plan to Watch';
            item.rating = null;
            item.notes = '';
            item.episodesWatched = Array.isArray(totalEpisodes) ? new Array(totalEpisodes.length).fill(0) : [0];
            item.watched = false;
            state.library.unshift(item);
        }

        persistLibrary();
        renderLibrary();
        showToast(isReload ? 'Reloaded item' : 'Added item');
    } catch (err) {
        console.error(err);
        showToast('Failed: ' + err.message);
    }
}

/**
 * Updates the watched status and progress of an item.
 * @param {Object} item - The item to update.
 * @param {number} [delta=1] - The change in episodes watched (default is 1).
 */
function updateWatchProgress(item, delta = 1) {
    if (item.type === 'movie') {
        item.watched = true;
        item.status = 'Completed';
    } else if (item.type === 'tv') {
        const totalEpisodes = Array.isArray(item.totalEpisodes) ? item.totalEpisodes : [item.totalEpisodes || 0];
        if (!Array.isArray(item.episodesWatched)) {
            item.episodesWatched = new Array(totalEpisodes.length).fill(0);
        }

        if (delta > 0) {
            for (let i = 0; i < totalEpisodes.length; i++) {
                if (item.episodesWatched[i] < totalEpisodes[i]) {
                    item.episodesWatched[i] = Math.max(0, Math.min(totalEpisodes[i], item.episodesWatched[i] + delta));
                    break;
                }
            }
        } else if (delta < 0) {
            for (let i = totalEpisodes.length - 1; i >= 0; i--) {
                if (item.episodesWatched[i] > 0) {
                    item.episodesWatched[i] = Math.max(0, item.episodesWatched[i] + delta);
                    break;
                }
            }
        }

        const watchedCount = item.episodesWatched.reduce((a, b) => a + b, 0);
        const totalCount = totalEpisodes.reduce((a, b) => a + b, 0);
        if (watchedCount === totalCount && totalCount > 0) {
            item.watched = true;
            item.status = 'Completed';
        } else if (watchedCount > 0) {
            item.watched = false;
            item.status = 'Watching';
        } else {
            item.watched = false;
            item.status = 'Plan to Watch';
        }
        document.getElementById('epLabel').textContent = `${item.episodesWatched.join(' / ')} / ${totalEpisodes.join(' / ')}`;
    }
}

/**
 * Filters library items based on user input
 * @param {Array} items - The list of items to filter.
 * @returns {Array} - The filtered list of items.
 */
function filterLibraryItems(items) {
    const filter = document.getElementById('filterInput').value.trim().toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;

    if (filter) {
        items = items.filter(i => (i.title || '').toLowerCase().includes(filter) || (i.notes || '').toLowerCase().includes(filter));
    }
    if (statusFilter !== 'all') {
        items = items.filter(i => i.status === statusFilter);
    }
    if (typeFilter !== 'all') {
        items = items.filter(i => i.type === typeFilter);
    }
    return items;
}

/**
 * Sorts library items based on selected criteria.
 * @param {Array} items - The list of items to sort.
 * @returns {Array} - The sorted list of items.
 */
function sortLibraryItems(items) {
    const sort = document.getElementById('sortSelect').value;
    const sortDirection = document.getElementById('sortDirection').value;

    if (sort === 'added') {
        items.sort((a, b) => b.watchedAt - a.watchedAt);
    } else if (sort === 'title') {
        items.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'progress') {
        items.sort((a, b) => progressOf(b) - progressOf(a));
    }

    if (sortDirection === 'desc') {
        items.reverse();
    }
    return items;
}

function renderStars(rating, max = 5) {
    const stars = [];
    for (let i = 1; i <= max; i++) {
        if (rating >= i) {
            stars.push('<img src="img/star.svg" alt="★" class="star">');
        } else if (rating >= i - 0.5) {
            stars.push('<img src="img/star-half.svg" alt="⯪" class="star">');
        } else {
            stars.push('<img src="img/star-empty.svg" alt="☆" class="star">');
        }
    }
    return stars.join('');
}

/**
 * Creates a single library card element.
 * @param {Object} item - The library item to create a card for.
 * @returns {HTMLDivElement} - The card element containing the item's details.
 */
function createLibraryCard(item) {
    const card = document.createElement('div');
    card.className = 'card';

    const img = document.createElement('img');
    img.src = item.poster || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"></svg>';

    const info = document.createElement('div');
    info.className = 'info';

    const h = document.createElement('h3');
    h.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'muted small';
    meta.textContent = `${item.type.toUpperCase()} • ${item.year || ''} • ${item.status}`;

    const prog = document.createElement('div');
    prog.className = 'progress';
    const bar = document.createElement('i');
    bar.style.width = progressOf(item) + '%';
    prog.appendChild(bar);

    const rating = document.createElement('div');
    rating.className = 'rating';
    rating.innerHTML = renderStars(item.rating || 0);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';

    const left = document.createElement('div');
    left.appendChild(h);
    left.appendChild(meta);
    left.appendChild(prog);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const open = document.createElement('button');
    open.className = 'ghost';
    open.textContent = 'More';
    open.addEventListener('click', () => openModal(item));

    const quick = document.createElement('button');
    quick.textContent = item.watched ? 'Watched' : (item.type === 'movie' ? 'Mark Watched' : 'Watch Ep');
    quick.addEventListener('click', () => {
        updateWatchProgress(item);
        persistLibrary();
        renderLibrary();
    });

    actions.appendChild(open);
    actions.appendChild(quick);

    info.appendChild(left);
    info.appendChild(rating);
    card.appendChild(img);
    card.appendChild(info);
    card.appendChild(actions);

    return card;
}

/**
 * Renders the library items in the UI.
 */
function renderLibrary() {
    const container = document.getElementById('library');
    container.innerHTML = '';

    let list = filterLibraryItems(state.library.slice());
    list = sortLibraryItems(list);

    list.forEach(item => {
        const card = createLibraryCard(item);
        container.appendChild(card);
    });
}

/**
 * Calculates the progress percentage of an item.
 * @param {Object} item - The item to calculate progress for.
 * @returns {number} - The progress percentage (0-100).
 */
function progressOf(item) {
    if (item.type === 'movie') return item.watched ? 100 : 0;
    const total = Array.isArray(item.totalEpisodes)
        ? item.totalEpisodes.reduce((a, b) => a + b, 0)
        : item.totalEpisodes || 0;
    if (!total) return 0;
    const watched = Array.isArray(item.episodesWatched)
        ? item.episodesWatched.reduce((a, b) => a + b, 0)
        : item.episodesWatched || 0;
    if (!total) return 0;
    return Math.round((watched / total) * 100);
}

// Modal operations
const modal = document.getElementById('modal');

/**
 * Opens the modal with item details.
 * @param {Object} item - The item to display in the modal.
 */
function openModal(item) {
    state.selected = item;
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalPoster').src = item.poster || '';
    document.getElementById('modalType').textContent = item.type.toUpperCase();
    document.getElementById('statusSelect').value = item.status || 'Plan to Watch';
    document.getElementById('ratingInput').value = item.rating || '';
    document.getElementById('notes').value = item.notes || '';
    if (item.type === 'tv') {
        document.getElementById('seriesControls').style.display = 'block';
        document.getElementById('epLabel').textContent = `${item.episodesWatched} / ${item.totalEpisodes}`;
    } else {
        document.getElementById('seriesControls').style.display = 'none';
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    function closeOnClickOutside(e) {
        if (e.target === modal) closeModal();
    }
    modal.addEventListener('mousedown', closeOnClickOutside);

    function closeOnEscapeKey(e) {
        if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', closeOnEscapeKey);

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        state.selected = null;
        persistLibrary();
        renderLibrary();
        modal.removeEventListener('mousedown', closeOnClickOutside);
        document.removeEventListener('keydown', closeOnEscapeKey);
        document.removeEventListener('click', closeModal);
    }
    addListenerToElement('closeModal', 'click', closeModal)

    // Attach closeModal to global for other close triggers
    window._closeModal = closeModal;
}

addListenerToElement('incEp', 'click', () => updateWatchProgress(state.selected));
addListenerToElement('decEp', 'click', () => updateWatchProgress(state.selected, -1));

addListenerToElement('saveItem', 'click', () => {
    if (!state.selected) return;
    state.selected.status = document.getElementById('statusSelect').value;
    const r = document.getElementById('ratingInput').value;
    state.selected.rating = r ? Number(r) : null;
    state.selected.notes = document.getElementById('notes').value;
    window._closeModal();
});
addListenerToElement('deleteItem', 'click', () => {
    if (!state.selected) return;
    if (!confirm("Delete this item from your library?")) return;
    state.library = state.library.filter(i => i !== state.selected);
    window._closeModal();
    showToast('Removed item');
});
addListenerToElement('reloadItem', 'click', async () => {
    if (!state.selected) return
    showToast('Reloading item information...');
    await addOrReloadLibraryItem(state.selected, true);
    window._closeModal();
});

// Search interactions
addListenerToElement('searchBtn', 'click', async () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    const t = document.getElementById('typeSelect').value;
    try {
        const res = await tmdbSearch(q, t);
        state.results = res;
        renderResults(res);
    } catch (e) {
        showToast('Search failed: ' + e.message)
    }
});
addListenerToElement('searchInput', 'keyup', (e) => {
    if (e.key === 'Enter') document.getElementById('searchBtn').click();
});

// Filters and sorting
['filterInput', 'statusFilter', 'typeFilter', 'sortSelect', 'sortDirection'].forEach(id => addListenerToElement(id, 'change', renderLibrary));
addListenerToElement('filterInput', 'input', renderLibrary);

/**
 * Exports the current library to a JSON file.
 */
function exportLibrary() {
    showToast("Staring export...")
    const data = JSON.stringify(state.library, null, 2);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'watchlist-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Export complete")
}
addListenerToElement('exportBtn', 'click', exportLibrary);

/**
 * Imports a library from a JSON file.
 */
function importLibrary() {
    document.getElementById('importFile').click();
    document.getElementById('importFile').addEventListener('change', (e) => {
        showToast('Importing file...');
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (Array.isArray(parsed)) {
                    state.library = parsed;
                    persistLibrary();
                    renderLibrary();
                    showToast('Import complete.');
                } else {
                    showToast('JSON must be an array of items.');
                }
            } catch (err) {
                showToast('Invalid JSON: ' + err.message);
            }
        };
        reader.readAsText(f);
    }, { once: true });
}
addListenerToElement('importBtn', 'click', importLibrary);

// Initialize
renderLibrary();
