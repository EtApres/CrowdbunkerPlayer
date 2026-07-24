// ==UserScript==
// @name         Playlist Controller
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Ajoute un panneau de contrôle de playlist avec lecture automatique, shuffle, boucle et sauvegarde locale
// @author       @CandyRaton
// @match        https://crowdbunker.com/v/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        STORAGE_KEY: 'cb_playlist_data_v2',
        POSITION_KEY: 'cb_playlist_position_v2',
        SETTINGS_KEY: 'cb_playlist_settings_v2',
        AUTO_NEXT_DELAY: 3000
    };

    // État du lecteur
    let state = {
        videos: [],
        currentIndex: -1,
        isPlaying: false,
        settings: {
            autoNext: true,
            shuffle: false,
            loop: false
        },
        shuffledIndices: [],
        isShuffled: false,
        videoId: null,
        listId: null
    };

    // ==================== RÉCUPÉRATION DE LA PLAYLIST ====================

    function extractVideosFromDOM() {
        const videos = [];

        log('Extraction des vidéos depuis le DOM...');

        // MÉTHODE 1: Récupérer depuis la sidebar de la playlist
        // Chercher le conteneur de la playlist dans la sidebar droite
        const sidebarContainers = document.querySelectorAll('.col-md-4 .v-list, .col-md-4 .v-sheet .v-list, [class*="col-md-4"] .v-list');

        for (const container of sidebarContainers) {
            const items = container.querySelectorAll('.v-list-item, .list-item, [role="listitem"]');

            for (const item of items) {
                const link = item.querySelector('a[href*="/v/"]');
                if (!link) continue;

                const href = link.getAttribute('href');
                const match = href.match(/\/v\/([a-zA-Z0-9]+)/);
                if (!match) continue;

                const videoId = match[1];

                // Récupérer le titre
                let title = '';
                const titleSelectors = [
                    '.v-list-item__subtitle',
                    '.v-list-item__subtitle span',
                    '.white--text.font-weight-bold',
                    '.font-weight-bold',
                    '[title]'
                ];

                for (const selector of titleSelectors) {
                    const el = item.querySelector(selector);
                    if (el) {
                        title = el.textContent.trim() || el.getAttribute('title') || '';
                        if (title && title.length > 0) break;
                    }
                }

                // Si toujours pas de titre, essayer de récupérer depuis le texte
                if (!title || title.length === 0) {
                    const textNodes = item.querySelectorAll('*');
                    for (const node of textNodes) {
                        const text = node.textContent.trim();
                        if (text && text.length > 3 && !text.includes('Vidéo') && !text.includes('views') && !text.includes('Il y a')) {
                            title = text;
                            break;
                        }
                    }
                }

                // Récupérer la durée
                const durationEl = item.querySelector('.video-duration, .duration, [class*="duration"]');
                const duration = durationEl ? durationEl.textContent.trim() : '';

                if (videoId && !videos.find(v => v.id === videoId)) {
                    videos.push({
                        id: videoId,
                        title: title || `Vidéo ${videos.length + 1}`,
                        duration: duration,
                        url: `/v/${videoId}`
                    });
                }
            }
        }

        log(`Méthode 1 - ${videos.length} vidéos trouvées`);

        if (videos.length > 0) return videos;

        // MÉTHODE 2: Récupérer depuis la liste dans le contenu principal
        const mainList = document.querySelector('.v-list--dense, .v-list, [class*="list"]');
        if (mainList) {
            const items = mainList.querySelectorAll('a[href*="/v/"]');
            const seen = new Set();

            for (const link of items) {
                const href = link.getAttribute('href');
                const match = href.match(/\/v\/([a-zA-Z0-9]+)/);
                if (!match) continue;

                const videoId = match[1];
                if (seen.has(videoId)) continue;
                seen.add(videoId);

                // Récupérer le titre
                let title = link.textContent.trim();
                if (!title || title === href) {
                    const parent = link.closest('.v-list-item, .list-item, li, div');
                    if (parent) {
                        const titleEl = parent.querySelector('.v-list-item__subtitle, .title, .video-title, .font-weight-bold');
                        if (titleEl) {
                            title = titleEl.textContent.trim();
                        }
                    }
                }

                // Récupérer la durée
                const parent = link.closest('.v-list-item, .list-item, li, div');
                const durationEl = parent ? parent.querySelector('.video-duration, .duration') : null;
                const duration = durationEl ? durationEl.textContent.trim() : '';

                if (videoId) {
                    videos.push({
                        id: videoId,
                        title: title || `Vidéo ${videos.length + 1}`,
                        duration: duration,
                        url: `/v/${videoId}`
                    });
                }
            }
        }

        log(`Méthode 2 - ${videos.length} vidéos trouvées`);
        if (videos.length > 0) return videos;

        // MÉTHODE 3: Récupérer depuis les données JSON dans les scripts
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            const content = script.textContent;
            if (content.includes('"videos"') || content.includes('"list"') || content.includes('"playlist"')) {
                try {
                    // Chercher des patterns d'IDs de vidéos
                    const matches = content.match(/["\']videos["\']\s*:\s*\[([^\]]*)\]/s);
                    if (matches) {
                        const videoMatches = matches[1].match(/["\']id["\']\s*:\s*["\']([a-zA-Z0-9]+)["\']/g);
                        if (videoMatches) {
                            for (const vm of videoMatches) {
                                const idMatch = vm.match(/["\']id["\']\s*:\s*["\']([a-zA-Z0-9]+)["\']/);
                                if (idMatch) {
                                    const videoId = idMatch[1];
                                    if (!videos.find(v => v.id === videoId)) {
                                        videos.push({
                                            id: videoId,
                                            title: `Vidéo ${videos.length + 1}`,
                                            duration: '',
                                            url: `/v/${videoId}`
                                        });
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Ignorer
                }
            }
        }

        log(`Méthode 3 - ${videos.length} vidéos trouvées`);
        return videos;
    }

    function getCurrentPlaylist() {
        // Récupérer l'ID de la liste
        state.listId = getListIdFromUrl();

        let videos = extractVideosFromDOM();

        // Si aucune vidéo trouvée, utiliser une approche plus agressive
        if (videos.length === 0) {
            log('Aucune vidéo trouvée, tentative de récupération depuis les liens...');
            const allLinks = document.querySelectorAll('a[href*="/v/"]');
            const seen = new Set();

            for (const link of allLinks) {
                const href = link.getAttribute('href');
                const match = href.match(/\/v\/([a-zA-Z0-9]+)/);
                if (!match) continue;

                const videoId = match[1];
                if (seen.has(videoId)) continue;
                seen.add(videoId);

                let title = link.textContent.trim();
                if (!title || title === href) {
                    const parent = link.closest('div');
                    if (parent) {
                        const textNodes = parent.querySelectorAll('*');
                        for (const node of textNodes) {
                            const text = node.textContent.trim();
                            if (text && text.length > 3 && text.length < 100 && !text.includes('http')) {
                                title = text;
                                break;
                            }
                        }
                    }
                }

                videos.push({
                    id: videoId,
                    title: title || `Vidéo ${videos.length + 1}`,
                    duration: '',
                    url: `/v/${videoId}`
                });
            }
            log(`${videos.length} vidéos trouvées depuis les liens`);
        }

        // S'assurer que la vidéo actuelle est dans la liste
        const currentVideoId = getVideoIdFromUrl();
        const currentInList = videos.find(v => v.id === currentVideoId);

        if (!currentInList && currentVideoId) {
            const currentTitle = document.querySelector('h1, .title, .video-title, .v-card__title')?.textContent?.trim() || 'Vidéo actuelle';
            videos.unshift({
                id: currentVideoId,
                title: currentTitle,
                duration: '',
                url: `/v/${currentVideoId}`
            });
        }

        // Dédupliquer
        const seen = new Set();
        videos = videos.filter(v => {
            if (seen.has(v.id)) return false;
            seen.add(v.id);
            return true;
        });

        state.videos = videos;
        state.videoId = currentVideoId;

        // Mettre à jour l'index
        if (currentInList) {
            state.currentIndex = videos.indexOf(currentInList);
        } else if (videos.length > 0) {
            state.currentIndex = 0;
        }

        // Si on a trouvé des vidéos, sauvegarder
        if (videos.length > 0) {
            savePlaylist(videos, state.currentIndex, state.settings);
        }

        log(`Playlist finale: ${videos.length} vidéos`);
        if (videos.length > 0) {
            log('Liste des vidéos:');
            videos.forEach((v, i) => log(`  ${i+1}. ${v.title} (${v.id})`));
        }

        return videos;
    }

    // ==================== UTILITAIRES ====================

    function log(msg, ...args) {
        console.log('[CrowdBunker Playlist]', msg, ...args);
    }

    function getVideoIdFromUrl() {
        const url = window.location.href;
        const match = url.match(/\/v\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    function getListIdFromUrl() {
        const url = window.location.href;
        const match = url.match(/[?&]list=([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    // ==================== STOCKAGE LOCAL ====================

    function savePlaylist(videos, index, settings) {
        try {
            const data = {
                videos: videos,
                index: index,
                settings: settings,
                listId: state.listId,
                timestamp: Date.now()
            };
            GM_setValue(CONFIG.STORAGE_KEY, JSON.stringify(data));
            log('Playlist sauvegardée');
        } catch (e) {
            log('Erreur lors de la sauvegarde:', e);
        }
    }

    function loadPlaylist() {
        try {
            const data = GM_getValue(CONFIG.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                log('Playlist chargée:', parsed.videos.length, 'vidéos');
                return parsed;
            }
        } catch (e) {
            log('Erreur lors du chargement:', e);
        }
        return null;
    }

    function saveCurrentPosition(index) {
        try {
            GM_setValue(CONFIG.POSITION_KEY, JSON.stringify({
                index: index,
                videoId: state.videoId,
                timestamp: Date.now()
            }));
        } catch (e) {
            log('Erreur lors de la sauvegarde de la position:', e);
        }
    }

    function loadCurrentPosition() {
        try {
            const data = GM_getValue(CONFIG.POSITION_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            log('Erreur lors du chargement de la position:', e);
        }
        return null;
    }

    function saveSettings(settings) {
        try {
            GM_setValue(CONFIG.SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            log('Erreur lors de la sauvegarde des paramètres:', e);
        }
    }

    function loadSettings() {
        try {
            const data = GM_getValue(CONFIG.SETTINGS_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            log('Erreur lors du chargement des paramètres:', e);
        }
        return null;
    }

    // ==================== SHUFFLE ====================

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function generateShuffledIndices() {
        const indices = state.videos.map((_, i) => i);
        const current = state.currentIndex;
        const others = indices.filter(i => i !== current);
        const shuffledOthers = shuffleArray(others);
        return [current, ...shuffledOthers];
    }

    function toggleShuffle() {
        state.settings.shuffle = !state.settings.shuffle;
        if (state.settings.shuffle) {
            state.shuffledIndices = generateShuffledIndices();
            state.isShuffled = true;
            log('Shuffle activé');
        } else {
            state.shuffledIndices = [];
            state.isShuffled = false;
            log('Shuffle désactivé');
        }
        saveSettings(state.settings);
        updatePanel();
    }

    // ==================== NAVIGATION ====================

    function getNextIndex() {
        if (state.videos.length === 0) return -1;

        if (state.settings.shuffle && state.isShuffled) {
            const currentPos = state.shuffledIndices.indexOf(state.currentIndex);
            if (currentPos < state.shuffledIndices.length - 1) {
                return state.shuffledIndices[currentPos + 1];
            }
            if (state.settings.loop) {
                return state.shuffledIndices[0];
            }
            return -1;
        }

        if (state.currentIndex < state.videos.length - 1) {
            return state.currentIndex + 1;
        }
        if (state.settings.loop) {
            return 0;
        }
        return -1;
    }

    function getPreviousIndex() {
        if (state.videos.length === 0) return -1;

        if (state.settings.shuffle && state.isShuffled) {
            const currentPos = state.shuffledIndices.indexOf(state.currentIndex);
            if (currentPos > 0) {
                return state.shuffledIndices[currentPos - 1];
            }
            return -1;
        }

        if (state.currentIndex > 0) {
            return state.currentIndex - 1;
        }
        return -1;
    }

    function navigateToVideo(index) {
        if (index < 0 || index >= state.videos.length) return;

        const video = state.videos[index];
        if (!video) return;

        state.currentIndex = index;
        state.videoId = video.id;

        // Sauvegarder avant de naviguer
        saveCurrentPosition(index);
        savePlaylist(state.videos, index, state.settings);

        // Naviguer
        const url = video.url || `/v/${video.id}`;
        log(`Navigation vers: ${url} - ${video.title}`);
        window.location.href = url;
    }

    function goToNext() {
        const nextIndex = getNextIndex();
        if (nextIndex >= 0) {
            navigateToVideo(nextIndex);
        } else {
            log('Fin de la playlist');
            updatePanel();
        }
    }

    function goToPrevious() {
        const prevIndex = getPreviousIndex();
        if (prevIndex >= 0) {
            navigateToVideo(prevIndex);
        } else {
            log('Début de la playlist');
        }
    }

    function goToVideo(index) {
        if (index >= 0 && index < state.videos.length) {
            navigateToVideo(index);
        }
    }

    // ==================== PANEL UI ====================

    function createPlaylistPanel() {
        if (document.getElementById('cb-playlist-panel')) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'cb-playlist-panel';
        panel.className = 'cb-playlist-panel';
        panel.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 340px;
            max-height: 80vh;
            background: rgba(18, 18, 18, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px;
            color: #fff;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            z-index: 9999;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            transition: transform 0.3s ease, opacity 0.3s ease;
            transform: translateX(0);
            opacity: 1;
            min-width: 280px;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            position: sticky;
            top: 0;
            background: rgba(18, 18, 18, 0.95);
            z-index: 1;
        `;
        header.innerHTML = `
            <span style="font-size: 16px; font-weight: bold; color: #e0e0e0;">🎬 Playlist CrowdBunker</span>
            <button id="cb-toggle-panel" style="
                background: none;
                border: none;
                color: #888;
                cursor: pointer;
                font-size: 18px;
                padding: 4px 8px;
            ">✕</button>
        `;
        panel.appendChild(header);

        const content = document.createElement('div');
        content.id = 'cb-panel-content';
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        panel.appendChild(content);

        document.body.appendChild(panel);

        document.getElementById('cb-toggle-panel').addEventListener('click', () => {
            togglePanel();
        });

        makeDraggable(panel);
        updatePanel();

        return panel;
    }

    function togglePanel() {
        const panel = document.getElementById('cb-playlist-panel');
        if (!panel) return;

        const isVisible = panel.style.transform !== 'translateX(120%)';
        panel.style.transform = isVisible ? 'translateX(120%)' : 'translateX(0)';
        panel.style.opacity = isVisible ? '0' : '1';
    }

    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        element.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('.cb-video-item')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = element.offsetLeft;
            initialY = element.offsetTop;
            element.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = (initialX + dx) + 'px';
            element.style.top = (initialY + dy) + 'px';
            element.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'default';
            }
        });
    }

    function updatePanel() {
        const content = document.getElementById('cb-panel-content');
        if (!content) return;

        const videos = state.videos;
        const currentIndex = state.currentIndex;
        const settings = state.settings;
        const isShuffled = state.isShuffled;

        let html = '';

        // Paramètres
        html += `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                    <input type="checkbox" id="cb-auto-next" ${settings.autoNext ? 'checked' : ''}>
                    ▶ Lecture auto
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                    <input type="checkbox" id="cb-shuffle" ${settings.shuffle ? 'checked' : ''}>
                    🔀 Shuffle
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer; grid-column: 1 / -1;">
                    <input type="checkbox" id="cb-loop" ${settings.loop ? 'checked' : ''}>
                    🔁 Boucle
                </label>
            </div>
        `;

        // Liste des vidéos
        if (videos.length > 0) {
            html += `<div style="max-height: 250px; overflow-y: auto; margin-top: 6px; padding-right: 4px;">`;

            const displayVideos = settings.shuffle && isShuffled ?
                state.shuffledIndices.map(i => ({ ...videos[i], displayIndex: i })) :
                videos.map((v, i) => ({ ...v, displayIndex: i }));

            displayVideos.forEach((video, idx) => {
                const isActive = video.displayIndex === currentIndex;
                const displayNum = idx + 1;
                const title = video.title || `Vidéo ${displayNum}`;

                html += `
                    <div class="cb-video-item" data-index="${video.displayIndex}" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 6px 8px;
                        margin: 2px 0;
                        border-radius: 6px;
                        background: ${isActive ? 'rgba(66, 133, 244, 0.25)' : 'transparent'};
                        cursor: pointer;
                        transition: background 0.2s;
                        border-left: ${isActive ? '3px solid #4285f4' : '3px solid transparent'};
                        position: relative;
                    ">
                        <span style="color: #666; font-size: 12px; min-width: 24px; flex-shrink: 0;">${displayNum}</span>
                        <span style="flex: 1; font-size: 13px; color: ${isActive ? '#fff' : '#aaa'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${title}
                        </span>
                        <span style="color: #666; font-size: 11px; flex-shrink: 0;">${video.duration || ''}</span>
                        ${isActive ? '<span style="color: #4285f4; font-size: 10px; flex-shrink: 0;">▶</span>' : ''}
                    </div>
                `;
            });

            html += `</div>`;
        } else {
            html += `
                <div style="text-align: center; padding: 20px; color: #666; font-size: 14px;">
                    Aucune vidéo trouvée<br>
                    <span style="font-size: 12px;">Essayez de rafraîchir la page ou de recharger la playlist</span>
                    <button id="cb-reload-playlist" style="
                        display: block;
                        margin: 10px auto;
                        padding: 6px 20px;
                        background: rgba(66, 133, 244, 0.4);
                        border: none;
                        border-radius: 6px;
                        color: #fff;
                        cursor: pointer;
                        font-size: 13px;
                    ">🔄 Recharger la playlist</button>
                </div>
            `;
        }

        // Contrôles
        const hasVideos = videos.length > 0;
        html += `
            <div style="display: flex; gap: 8px; justify-content: center; margin-top: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                <button class="cb-nav-btn" data-action="prev" style="
                    padding: 6px 14px;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    border-radius: 6px;
                    color: #ccc;
                    cursor: ${hasVideos ? 'pointer' : 'not-allowed'};
                    font-size: 13px;
                    transition: all 0.2s;
                    ${!hasVideos ? 'opacity: 0.3;' : ''}
                " ${!hasVideos ? 'disabled' : ''}>⏮ Précédente</button>
                <button class="cb-nav-btn" data-action="play" style="
                    padding: 6px 20px;
                    background: rgba(66, 133, 244, 0.6);
                    border: none;
                    border-radius: 6px;
                    color: #fff;
                    cursor: ${hasVideos ? 'pointer' : 'not-allowed'};
                    font-size: 13px;
                    transition: background 0.2s;
                    ${!hasVideos ? 'opacity: 0.3;' : ''}
                " ${!hasVideos ? 'disabled' : ''}>${state.isPlaying ? '⏸ Pause' : '▶ Lecture'}</button>
                <button class="cb-nav-btn" data-action="next" style="
                    padding: 6px 14px;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    border-radius: 6px;
                    color: #ccc;
                    cursor: ${hasVideos ? 'pointer' : 'not-allowed'};
                    font-size: 13px;
                    transition: all 0.2s;
                    ${!hasVideos ? 'opacity: 0.3;' : ''}
                " ${!hasVideos ? 'disabled' : ''}>⏭ Suivante</button>
            </div>
        `;

        // Actions
        html += `
            <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-top: 4px;">
                <button id="cb-shuffle-list" style="
                    padding: 4px 12px;
                    background: rgba(255,255,255,0.05);
                    border: none;
                    border-radius: 4px;
                    color: #aaa;
                    cursor: ${hasVideos ? 'pointer' : 'not-allowed'};
                    font-size: 12px;
                    transition: background 0.2s;
                    ${!hasVideos ? 'opacity: 0.3;' : ''}
                " ${!hasVideos ? 'disabled' : ''}>🎲 Mélanger la liste</button>
                <button id="cb-save" style="
                    padding: 4px 12px;
                    background: rgba(255,255,255,0.05);
                    border: none;
                    border-radius: 4px;
                    color: #aaa;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.2s;
                ">💾 Sauvegarder</button>
                <button id="cb-export-json" style="
                    padding: 4px 12px;
                    background: rgba(255,255,255,0.05);
                    border: none;
                    border-radius: 4px;
                    color: #aaa;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.2s;
                ">📤 Export JSON</button>
                <button id="cb-import-json" style="
                    padding: 4px 12px;
                    background: rgba(255,255,255,0.05);
                    border: none;
                    border-radius: 4px;
                    color: #aaa;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.2s;
                ">📥 Import JSON</button>
            </div>
        `;

        // Info
        const total = videos.length;
        const current = total > 0 ? currentIndex + 1 : 0;
        html += `
            <div style="font-size: 11px; color: #555; text-align: center; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05);">
                ${total} vidéos • Position: ${current}/${total}
                ${state.listId ? ` • Liste: ${state.listId.substring(0, 8)}...` : ''}
            </div>
        `;

        content.innerHTML = html;

        // Écouteurs d'événements
        setupEventListeners();
    }

    function setupEventListeners() {
        // Auto-next
        const autoNextCheck = document.getElementById('cb-auto-next');
        if (autoNextCheck) {
            autoNextCheck.addEventListener('change', (e) => {
                state.settings.autoNext = e.target.checked;
                saveSettings(state.settings);
                log('Auto-next:', state.settings.autoNext);
            });
        }

        // Shuffle
        const shuffleCheck = document.getElementById('cb-shuffle');
        if (shuffleCheck) {
            shuffleCheck.addEventListener('change', () => {
                toggleShuffle();
            });
        }

        // Loop
        const loopCheck = document.getElementById('cb-loop');
        if (loopCheck) {
            loopCheck.addEventListener('change', (e) => {
                state.settings.loop = e.target.checked;
                saveSettings(state.settings);
                log('Loop:', state.settings.loop);
            });
        }

        // Navigation
        document.querySelectorAll('.cb-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.disabled) return;
                const action = btn.dataset.action;
                switch (action) {
                    case 'prev':
                        goToPrevious();
                        break;
                    case 'next':
                        goToNext();
                        break;
                    case 'play':
                        togglePlayState();
                        break;
                }
            });
        });

        // Click sur une vidéo
        document.querySelectorAll('.cb-video-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                if (!isNaN(index) && index >= 0 && index < state.videos.length) {
                    goToVideo(index);
                }
            });
        });

        // Mélanger la liste
        const shuffleListBtn = document.getElementById('cb-shuffle-list');
        if (shuffleListBtn) {
            shuffleListBtn.addEventListener('click', () => {
                if (state.videos.length === 0) return;
                shuffleEntireList();
            });
        }

        // Sauvegarder
        const saveBtn = document.getElementById('cb-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                savePlaylist(state.videos, state.currentIndex, state.settings);
                saveCurrentPosition(state.currentIndex);
                saveSettings(state.settings);
                saveBtn.textContent = '✅ Sauvegardé!';
                setTimeout(() => { saveBtn.textContent = '💾 Sauvegarder'; }, 2000);
            });
        }

        // Recharger la playlist
        const reloadBtn = document.getElementById('cb-reload-playlist');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                getCurrentPlaylist();
                updatePanel();
                log('Playlist rechargée');
            });
        }

        // Export JSON
        const exportBtn = document.getElementById('cb-export-json');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const data = {
                    videos: state.videos,
                    index: state.currentIndex,
                    settings: state.settings,
                    listId: state.listId,
                    timestamp: Date.now(),
                    url: window.location.href
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `playlist_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        // Import JSON
        const importBtn = document.getElementById('cb-import-json');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const data = JSON.parse(ev.target.result);
                            if (data.videos && Array.isArray(data.videos)) {
                                state.videos = data.videos;
                                state.currentIndex = data.index || 0;
                                if (data.settings) {
                                    state.settings = { ...state.settings, ...data.settings };
                                }
                                savePlaylist(state.videos, state.currentIndex, state.settings);
                                updatePanel();
                                log('Import réussi:', data.videos.length, 'vidéos');
                            }
                        } catch (err) {
                            log('Erreur d\'import:', err);
                            alert('Erreur lors de l\'import du fichier JSON');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        // Hover effets
        document.querySelectorAll('.cb-video-item, .cb-nav-btn, #cb-shuffle-list, #cb-save, #cb-export-json, #cb-import-json').forEach(el => {
            el.addEventListener('mouseenter', () => {
                if (!el.disabled) {
                    el.style.opacity = '0.8';
                }
            });
            el.addEventListener('mouseleave', () => {
                if (!el.disabled) {
                    el.style.opacity = '1';
                }
            });
        });
    }

    function togglePlayState() {
        state.isPlaying = !state.isPlaying;
        updatePanel();
        const video = document.querySelector('video');
        if (video) {
            if (state.isPlaying) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        }
    }

    // ==================== SHUFFLE ENTIER ====================

    function shuffleEntireList() {
        if (state.videos.length === 0) return;

        const shuffled = shuffleArray([...state.videos]);
        const currentVideoId = getVideoIdFromUrl();
        let newIndex = 0;
        for (let i = 0; i < shuffled.length; i++) {
            if (shuffled[i].id === currentVideoId) {
                newIndex = i;
                break;
            }
        }

        state.videos = shuffled;
        state.currentIndex = newIndex;
        state.isShuffled = false;
        state.settings.shuffle = false;

        savePlaylist(state.videos, state.currentIndex, state.settings);
        updatePanel();
        log('Liste mélangée');
    }

    // ==================== DÉTECTION DE LA FIN DE VIDÉO ====================

    function setupVideoDetection() {
        const observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video && !video._cb_listener) {
                video._cb_listener = true;
                log('Élément video détecté');

                video.addEventListener('ended', () => {
                    log('Vidéo terminée');
                    if (state.settings.autoNext && state.videos.length > 0) {
                        setTimeout(() => {
                            goToNext();
                        }, CONFIG.AUTO_NEXT_DELAY);
                    }
                });

                video.addEventListener('play', () => {
                    state.isPlaying = true;
                    updatePanel();
                });

                video.addEventListener('pause', () => {
                    state.isPlaying = false;
                    updatePanel();
                });
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        const existingVideo = document.querySelector('video');
        if (existingVideo && !existingVideo._cb_listener) {
            existingVideo._cb_listener = true;
            existingVideo.addEventListener('ended', () => {
                log('Vidéo terminée (existing)');
                if (state.settings.autoNext && state.videos.length > 0) {
                    setTimeout(() => {
                        goToNext();
                    }, CONFIG.AUTO_NEXT_DELAY);
                }
            });
        }
    }

    // ==================== OBSERVER LES CHANGEMENTS DE PAGE ====================

    function setupPageObserver() {
        let lastUrl = window.location.href;

        const observer = new MutationObserver(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                setTimeout(() => {
                    const newVideoId = getVideoIdFromUrl();
                    if (newVideoId !== state.videoId) {
                        // Essayer de récupérer la playlist à nouveau
                        const newVideos = extractVideosFromDOM();
                        if (newVideos.length > 0) {
                            state.videos = newVideos;
                            state.videoId = newVideoId;
                            const currentInList = state.videos.find(v => v.id === newVideoId);
                            state.currentIndex = currentInList ? state.videos.indexOf(currentInList) : 0;
                            savePlaylist(state.videos, state.currentIndex, state.settings);
                            updatePanel();
                            log('Playlist mise à jour après changement de page');
                        }
                    }
                }, 800);
            }
        });

        observer.observe(document, { subtree: true, childList: true });
    }

    // ==================== INITIALISATION ====================

    function init() {
        log('Initialisation du Playlist Controller');

        const videoId = getVideoIdFromUrl();
        if (!videoId) {
            log('Pas d\'ID de vidéo trouvé');
            return;
        }

        // Charger les paramètres
        const savedSettings = loadSettings();
        if (savedSettings) {
            state.settings = { ...state.settings, ...savedSettings };
        }

        // Charger la playlist
        const savedData = loadPlaylist();
        const savedPosition = loadCurrentPosition();

        if (savedData && savedData.videos && savedData.videos.length > 0) {
            const currentInSaved = savedData.videos.find(v => v.id === videoId);
            if (currentInSaved) {
                state.videos = savedData.videos;
                state.currentIndex = savedData.index || 0;
                if (savedData.settings) {
                    state.settings = { ...state.settings, ...savedData.settings };
                }
                log('Playlist chargée depuis la sauvegarde:', state.videos.length, 'vidéos');
            } else {
                getCurrentPlaylist();
            }
        } else {
            // Essayer d'extraire immédiatement
            const extracted = extractVideosFromDOM();
            if (extracted.length > 0) {
                state.videos = extracted;
                state.videoId = videoId;
                const currentInList = state.videos.find(v => v.id === videoId);
                state.currentIndex = currentInList ? state.videos.indexOf(currentInList) : 0;
                savePlaylist(state.videos, state.currentIndex, state.settings);
            } else {
                // Attendre que le DOM soit complètement chargé
                setTimeout(() => {
                    getCurrentPlaylist();
                }, 2000);
            }
        }

        // Créer le panneau
        createPlaylistPanel();
        updatePanel();

        // Configurer les observateurs
        setupVideoDetection();
        setupPageObserver();

        // Observer l'ajout de nouveaux éléments de playlist
        const domObserver = new MutationObserver(() => {
            // Si le nombre de vidéos dans le DOM change, mettre à jour
            const currentVideos = extractVideosFromDOM();
            if (currentVideos.length > 0 && currentVideos.length !== state.videos.length) {
                state.videos = currentVideos;
                const currentVideoId = getVideoIdFromUrl();
                const currentInList = state.videos.find(v => v.id === currentVideoId);
                state.currentIndex = currentInList ? state.videos.indexOf(currentInList) : 0;
                savePlaylist(state.videos, state.currentIndex, state.settings);
                updatePanel();
                log('Playlist mise à jour automatiquement');
            }
        });
        domObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        log('Playlist Controller initialisé avec', state.videos.length, 'vidéos');
    }

    // Démarrer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==================== STYLES ====================

    const styles = document.createElement('style');
    styles.textContent = `
        #cb-playlist-panel::-webkit-scrollbar {
            width: 4px;
        }
        #cb-playlist-panel::-webkit-scrollbar-track {
            background: transparent;
        }
        #cb-playlist-panel::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
        }
        #cb-playlist-panel::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #cb-panel-content .cb-video-item:hover {
            background: rgba(255, 255, 255, 0.08) !important;
        }

        #cb-panel-content .cb-nav-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.2) !important;
        }

        #cb-panel-content .cb-nav-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        #cb-panel-content button:active:not(:disabled) {
            transform: scale(0.95);
        }

        #cb-panel-content input[type="checkbox"] {
            accent-color: #4285f4;
            cursor: pointer;
        }

        @media (max-width: 768px) {
            #cb-playlist-panel {
                top: 60px !important;
                right: 10px !important;
                width: 290px !important;
                max-height: 70vh !important;
                font-size: 12px !important;
                padding: 12px !important;
            }
            #cb-playlist-panel .cb-video-item {
                font-size: 12px !important;
                padding: 4px 6px !important;
            }
            #cb-playlist-panel .cb-nav-btn {
                font-size: 11px !important;
                padding: 4px 10px !important;
            }
        }
    `;
    document.head.appendChild(styles);

})();
