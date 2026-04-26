import { saveSettingsDebounced } from '../../../../script.js';
import { getContext, extension_settings, ModuleWorkerWrapper } from '../../../extensions.js';

export { MODULE_NAME };

const MODULE_NAME = 'black_cat_companion';
const DEBUG_PREFIX = '<BlackCatCompanion> ';
const UPDATE_INTERVAL = 2000;
const EXTENSION_VERSION = '0.6.7';

const windowHtmlPath = new URL('./window.html', import.meta.url).href;


const defaultSettings = {
    version: EXTENSION_VERSION,
    visible: true,
    showPawWhenHidden: false,
    name: '小黑',
    hunger: 72,
    mood: 70,
    energy: 76,
    affection: 18,
    sleeping: false,
    pose: 'sit',
    x: null,
    y: null,
    scale: 1,
    menuX: null,
    menuY: null,
    menuW: null,
    menuH: null,
    activeAction: 'none',
    lastTick: Date.now(),
    effectPose: null,
    effectUntil: 0,
};

const persistedKeys = ['version', 'visible', 'showPawWhenHidden', 'name', 'x', 'y', 'scale', 'menuX', 'menuY', 'menuW', 'menuH'];
let runtimeSettings = null;
let initialized = false;
let desktopRoot = null;
let catButton = null;
let pawButton = null;
let catImage = null;
let catBadge = null;
let petMenu = null;
let petMenuContent = null;
let bubble = null;
let dragRaf = null;
let pendingDragPosition = null;

let dragState = {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
};

let pawDragState = {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
};

let menuDragState = {
    active: false,
    mode: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,
};

function cloneObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}


function getSettings() {
    if (runtimeSettings) return runtimeSettings;

    if (extension_settings[MODULE_NAME] === undefined || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = {};
    }

    const stored = extension_settings[MODULE_NAME];
    const hydrated = cloneObject(defaultSettings);

    hydrated.version = EXTENSION_VERSION;
    hydrated.visible = stored.visible ?? defaultSettings.visible;
    hydrated.showPawWhenHidden = stored.showPawWhenHidden ?? defaultSettings.showPawWhenHidden;
    hydrated.name = stored.name ?? defaultSettings.name;
    hydrated.x = stored.x ?? defaultSettings.x;
    hydrated.y = stored.y ?? defaultSettings.y;
    hydrated.scale = stored.scale ?? defaultSettings.scale;
    hydrated.menuX = stored.menuX ?? defaultSettings.menuX;
    hydrated.menuY = stored.menuY ?? defaultSettings.menuY;
    hydrated.menuW = stored.menuW ?? defaultSettings.menuW;
    hydrated.menuH = stored.menuH ?? defaultSettings.menuH;
    hydrated.lastTick = Date.now();

    runtimeSettings = hydrated;
    persist();
    return runtimeSettings;
}

function persist() {
    const settings = runtimeSettings || defaultSettings;
    if (extension_settings[MODULE_NAME] === undefined || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = {};
    }

    const store = extension_settings[MODULE_NAME];
    for (const key of Object.keys(store)) {
        if (!persistedKeys.includes(key)) delete store[key];
    }
    for (const key of persistedKeys) {
        store[key] = settings[key];
    }
    saveSettingsDebounced();
}

function clamp(value, min = 0, max = 100) {
    const num = Number(value) || 0;
    return Math.max(min, Math.min(max, num));
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function toast(message) {
    const safe = String(message ?? '').trim();
    if (!safe) return;

    if (window.toastr?.info) {
        window.toastr.info(safe);
        return;
    }

    console.log(DEBUG_PREFIX + safe);
}

function assetPath(fileName) {
    return new URL(`./assets/${fileName}`, import.meta.url).href;
}

function getBasePose(settings = getSettings()) {
    if (settings.sleeping || settings.pose === 'sleep') return 'sleep';
    return settings.pose || 'sit';
}

function getResolvedPose(settings = getSettings()) {
    if (settings.effectPose && (settings.effectUntil || 0) > Date.now()) {
        return settings.effectPose;
    }

    if (settings.effectPose && (settings.effectUntil || 0) <= Date.now()) {
        settings.effectPose = null;
        settings.effectUntil = 0;
    }

    return getBasePose(settings);
}

function setTransientPose(pose, duration = 2200) {
    const settings = getSettings();
    settings.effectPose = pose;
    settings.effectUntil = Date.now() + duration;
}

function getCatAssetPath(settings = getSettings()) {
    const pose = getResolvedPose(settings);
    if (pose === 'sleep') return assetPath('cat-sleep.png');
    if (pose === 'alert') return assetPath('cat-alert.png');
    if (pose === 'happy') return assetPath('cat-happy.png');
    if (pose === 'talk') return assetPath('cat-talk.png');
    if (pose === 'play') return assetPath('cat-play.png');
    if (pose === 'loaf') return assetPath('cat-loaf.png');
    return assetPath('cat-sit.png');
}

function getPoseText(settings = getSettings()) {
    const pose = getResolvedPose(settings);
    if (pose === 'sleep') return '睡着';
    if (pose === 'alert') return '警觉';
    if (pose === 'happy') return '开心';
    if (pose === 'talk') return '吐槽中';
    if (pose === 'play') return '玩耍';
    if (pose === 'loaf') return '趴着';
    return '坐着';
}

function getMoodText(settings = getSettings()) {
    const pose = getResolvedPose(settings);
    if (pose === 'sleep') return '它蜷成一团睡着了，肚皮正慢慢起伏。';
    if (settings.hunger < 25) return '它有点饿，正眼巴巴盯着你。';
    if (settings.energy < 25) return '它有点困，耳朵都懒得立太高。';
    if (pose === 'alert') return '它竖起耳朵盯着聊天内容，像是发现了什么。';
    if (pose === 'talk') return '它正准备开麦吐槽，嘴都张开了。';
    if (pose === 'play') return '它爪子都举起来了，像一小团要扑出去的黑影。';
    if (pose === 'happy') return '它眯着眼蹭蹭你，明显心情很好。';
    if (pose === 'loaf') return '它乖乖趴着，像一小团黑影窝在酒馆角落。';
    if (settings.mood > 84) return '它心情很好，尾巴轻轻晃着。';
    if (settings.affection > 72) return '它已经很黏你了，安静又跟人。';
    if (settings.mood < 30) return '它有点闷闷不乐，缩着不太想动。';
    return '它安静坐着，偶尔眨一下眼。';
}

function tick(settings = getSettings()) {

    const now = Date.now();
    const diffMin = Math.max(0, (now - (settings.lastTick || now)) / 60000);
    if (diffMin < 0.35) return;

    if (settings.sleeping || settings.pose === 'sleep') {
        settings.energy = clamp(settings.energy + diffMin * 3.0);
        settings.hunger = clamp(settings.hunger - diffMin * 1.2);
        settings.mood = clamp(settings.mood + diffMin * 0.3);
    } else {
        settings.hunger = clamp(settings.hunger - diffMin * 1.55);
        settings.energy = clamp(settings.energy - diffMin * 0.82);
        settings.mood = clamp(settings.mood - (settings.hunger < 25 ? diffMin * 1.4 : diffMin * 0.28));
    }

    settings.lastTick = now;
}

function statMarkup(label, value) {
    const v = clamp(value);
    return `
        <div class="bcc-stat">
            <div class="bcc-stat-row">
                <span>${label}</span>
                <span>${Math.round(v)}/100</span>
            </div>
            <div class="bcc-bar"><div style="width:${v}%"></div></div>
        </div>
    `;
}

function getChatAreaRect() {
    const candidates = [
        document.getElementById('chat'),
        document.getElementById('chat_container'),
        document.querySelector('#chat .mes_block')?.parentElement,
        document.querySelector('.chat'),
    ].filter(Boolean);

    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 280 && rect.height > 260) return rect;
    }

    return {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        right: window.innerWidth,
        bottom: window.innerHeight,
    };
}

function getCenteredPosition() {
    const rect = getChatAreaRect();
    const scale = clamp(getSettings().scale ?? 1, 0.7, 1.6);
    const size = (catButton?.offsetWidth || 128) * scale;
    const x = clamp(rect.left + rect.width / 2 - size / 2, 8, window.innerWidth - size - 8);
    const y = clamp(rect.top + rect.height / 2 - size / 2, 8, window.innerHeight - size - 8);
    return { x, y };
}

function findInput() {
    const selectors = [
        '#send_textarea',
        'textarea#send_textarea',
        'textarea[name="send_textarea"]',
        'textarea[placeholder*="输入"]',
        'textarea[placeholder*="说"]',
        'textarea',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]',
    ];

    for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        const target = nodes.find((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 20 && rect.height > 10;
        });
        if (target) return target;
    }

    return null;
}

function insertIntoInput(text) {
    const el = findInput();
    if (!el) {
        try {
            navigator.clipboard?.writeText(text);
        } catch {
            // ignore
        }
        toast('没找到输入框，内容已尽量复制到剪贴板。');
        return;
    }

    if (el.isContentEditable) {
        el.innerText = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        el.focus();
        return;
    }

    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) setter.call(el, text);
    else el.value = text;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
}

function createDesktopPet() {
    if (desktopRoot) return;

    desktopRoot = document.createElement('div');
    desktopRoot.id = 'bcc-desktop-root';
    desktopRoot.innerHTML = `
        <button id="bcc-cat-button" class="bcc-cat-button" type="button" title="小黑猫">
            <img id="bcc-cat-image" class="bcc-cat-image" alt="小黑猫" draggable="false">
            <span id="bcc-cat-badge" class="bcc-cat-badge">✦</span>
        </button>

        <button id="bcc-paw-button" class="bcc-paw-button" type="button" title="点击叫回小黑猫">🐾</button>

        <div id="bcc-pet-bubble" class="bcc-pet-bubble"></div>

        <div id="bcc-pet-menu" class="bcc-pet-menu">
            <div id="bcc-pet-menu-content"></div>
        </div>
    `;
    document.body.appendChild(desktopRoot);

    catButton = document.getElementById('bcc-cat-button');
    pawButton = document.getElementById('bcc-paw-button');
    catImage = document.getElementById('bcc-cat-image');
    catBadge = document.getElementById('bcc-cat-badge');
    petMenu = document.getElementById('bcc-pet-menu');
    petMenuContent = document.getElementById('bcc-pet-menu-content');
    bubble = document.getElementById('bcc-pet-bubble');

    catImage?.setAttribute('draggable', 'false');
    catButton?.addEventListener('dragstart', (event) => event.preventDefault());
    catImage?.addEventListener('dragstart', (event) => event.preventDefault());

    bindDesktopPetEvents();
    bindPawDragEvents();
    bindMenuMoveResizeEvents();
}


function handleOutsidePetMenuPointerDown(event) {
    if (!petMenu?.classList.contains('bcc-show')) return;
    if (petMenu.contains(event.target) || catButton?.contains(event.target)) return;
    petMenu.classList.remove('bcc-show');
}


function bindPawDragEvents() {
    if (!pawButton) return;

    pawButton.addEventListener('pointerdown', (event) => {
        const rect = pawButton.getBoundingClientRect();
        pawDragState.active = true;
        pawDragState.moved = false;
        pawDragState.startX = event.clientX;
        pawDragState.startY = event.clientY;
        pawDragState.offsetX = event.clientX - rect.left;
        pawDragState.offsetY = event.clientY - rect.top;
        pawButton.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    pawButton.addEventListener('pointermove', (event) => {
        if (!pawDragState.active) return;

        const dx = event.clientX - pawDragState.startX;
        const dy = event.clientY - pawDragState.startY;
        if (Math.abs(dx) + Math.abs(dy) > 5) {
            pawDragState.moved = true;
        }

        const pawW = pawButton.offsetWidth || 50;
        const pawH = pawButton.offsetHeight || 50;
        const pawX = clamp(event.clientX - pawDragState.offsetX, 8, window.innerWidth - pawW - 8);
        const pawY = clamp(event.clientY - pawDragState.offsetY, 8, window.innerHeight - pawH - 8);

        const catSize = getCatVisualSize();
        const settings = getSettings();
        settings.x = clamp(pawX + pawW / 2 - catSize.width / 2, 4, window.innerWidth - catSize.width - 4);
        settings.y = clamp(pawY + pawH / 2 - catSize.height / 2, 4, window.innerHeight - catSize.height - 4);

        applyPawPosition();
        event.preventDefault();
        event.stopPropagation();
    });

    pawButton.addEventListener('pointerup', (event) => {
        if (!pawDragState.active) return;

        pawDragState.active = false;
        pawButton.releasePointerCapture?.(event.pointerId);
        persist();

        if (!pawDragState.moved) {
            const settings = getSettings();
            settings.visible = true;
            settings.effectPose = 'happy';
            settings.effectUntil = Date.now() + 1800;
            persist();
            refreshAllUi();
            renderBubble('喵。小黑猫被你叫回来了。');
        }

        event.preventDefault();
        event.stopPropagation();
    });
}



function bindMenuMoveResizeEvents() {
    if (!petMenu) return;

    petMenu.addEventListener('pointerdown', (event) => {
        if (!petMenu.classList.contains('bcc-show')) return;

        const target = event.target;
        const resizeHandle = target.closest('.bcc-menu-resize-handle');
        const moveHandle = target.closest('.bcc-menu-title-row, .bcc-menu-drag-hint');

        // 内容区、按钮、拉条区域不劫持触摸，手机端可正常上下滑动。
        if (!resizeHandle && !moveHandle) return;
        if (target.closest('button, input, .bcc-btn, .bcc-close, .bcc-scale-control')) return;

        const rect = petMenu.getBoundingClientRect();

        menuDragState.active = true;
        menuDragState.mode = resizeHandle ? 'resize' : 'move';
        menuDragState.startX = event.clientX;
        menuDragState.startY = event.clientY;
        menuDragState.startLeft = rect.left;
        menuDragState.startTop = rect.top;
        menuDragState.startWidth = rect.width;
        menuDragState.startHeight = rect.height;

        petMenu.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    petMenu.addEventListener('pointermove', (event) => {
        if (!menuDragState.active) return;

        const settings = getSettings();
        const dx = event.clientX - menuDragState.startX;
        const dy = event.clientY - menuDragState.startY;

        if (menuDragState.mode === 'resize') {
            const minW = Math.min(240, window.innerWidth - 16);
            const maxW = Math.min(520, window.innerWidth - 16);
            const minH = Math.min(220, window.innerHeight - 16);
            const maxH = Math.min(window.innerHeight - 16, 760);

            const w = clamp(menuDragState.startWidth + dx, minW, maxW);
            const h = clamp(menuDragState.startHeight + dy, minH, maxH);

            settings.menuW = w;
            settings.menuH = h;

            petMenu.style.width = `${w}px`;
            petMenu.style.height = `${h}px`;
            petMenu.style.maxHeight = `${h}px`;
        } else {
            const width = petMenu.offsetWidth || menuDragState.startWidth;
            const height = petMenu.offsetHeight || menuDragState.startHeight;

            const left = clamp(menuDragState.startLeft + dx, 8, window.innerWidth - width - 8);
            const top = clamp(menuDragState.startTop + dy, 8, window.innerHeight - height - 8);

            settings.menuX = left;
            settings.menuY = top;

            petMenu.style.left = `${left}px`;
            petMenu.style.top = `${top}px`;
            petMenu.style.right = 'auto';
            petMenu.style.bottom = 'auto';
        }

        event.preventDefault();
        event.stopPropagation();
    });

    petMenu.addEventListener('pointerup', (event) => {
        if (!menuDragState.active) return;

        menuDragState.active = false;
        petMenu.releasePointerCapture?.(event.pointerId);
        persist();

        event.preventDefault();
        event.stopPropagation();
    });

    petMenu.addEventListener('pointercancel', () => {
        menuDragState.active = false;
    });
}
function bindDesktopPetEvents() {
    if (!catButton) return;
    document.addEventListener('pointerdown', handleOutsidePetMenuPointerDown, true);

    catButton.addEventListener('pointerdown', (event) => {
        const settings = getSettings();
        if (!settings.visible) return;

        const rect = catButton.getBoundingClientRect();
        dragState.active = true;
        dragState.moved = false;
        dragState.startX = event.clientX;
        dragState.startY = event.clientY;
        dragState.offsetX = event.clientX - rect.left;
        dragState.offsetY = event.clientY - rect.top;
        petMenu?.classList.remove('bcc-show');
        bubble?.classList.remove('bcc-show');
        catButton.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    catButton.addEventListener('pointermove', (event) => {
        if (!dragState.active) return;

        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        if (Math.abs(dx) + Math.abs(dy) > 5) {
            dragState.moved = true;
        }

        const x = clamp(event.clientX - dragState.offsetX, 4, window.innerWidth - catButton.offsetWidth - 4);
        const y = clamp(event.clientY - dragState.offsetY, 4, window.innerHeight - catButton.offsetHeight - 4);

        pendingDragPosition = { x, y };

        if (!dragRaf) {
            dragRaf = requestAnimationFrame(() => {
                dragRaf = null;
                if (!pendingDragPosition) return;
                applyDesktopPosition(pendingDragPosition.x, pendingDragPosition.y);
            });
        }

        event.preventDefault();
    });

    catButton.addEventListener('pointerup', (event) => {
        if (!dragState.active) return;
        dragState.active = false;
        catButton.releasePointerCapture?.(event.pointerId);

        if (pendingDragPosition) {
            const settings = getSettings();
            settings.x = pendingDragPosition.x;
            settings.y = pendingDragPosition.y;
            pendingDragPosition = null;
            persist();
        }

        if (!dragState.moved) {
            togglePetMenu();
        }

        event.preventDefault();
    });

    window.addEventListener('resize', () => {
        const settings = getSettings();
        if (settings.x !== null && settings.y !== null) {
            settings.x = clamp(settings.x, 4, window.innerWidth - (catButton?.offsetWidth || 92) - 4);
            settings.y = clamp(settings.y, 4, window.innerHeight - (catButton?.offsetHeight || 92) - 4);
            persist();
            applyDesktopPosition();
    applyPawPosition();
        }
    });
}

function applyDesktopPosition(x = null, y = null) {
    if (!catButton) return;
    const settings = getSettings();

    if (x === null || y === null) {
        if (settings.x === null || settings.y === null) {
            const centered = getCenteredPosition();
            settings.x = centered.x;
            settings.y = centered.y;
            persist();
        }
        x = settings.x;
        y = settings.y;
    }

    catButton.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${clamp(settings.scale ?? 1, 0.7, 1.6)})`;
    catButton.style.left = '0';
    catButton.style.top = '0';
    catButton.style.right = 'auto';
    catButton.style.bottom = 'auto';
}

function getCatVisualSize() {
    const settings = getSettings();
    const scale = clamp(settings.scale ?? 1, 0.7, 1.6);
    const width = catButton?.offsetWidth || 128;
    const height = catButton?.offsetHeight || 128;
    return { width: width * scale, height: height * scale, scale };
}

function applyPawPosition() {
    if (!pawButton) return;

    const settings = getSettings();
    let x = settings.x;
    let y = settings.y;

    if (x === null || y === null) {
        const centered = getCenteredPosition();
        x = centered.x;
        y = centered.y;
    }

    const catSize = getCatVisualSize();
    const pawW = pawButton.offsetWidth || 50;
    const pawH = pawButton.offsetHeight || 50;

    const pawX = clamp(x + catSize.width / 2 - pawW / 2, 8, window.innerWidth - pawW - 8);
    const pawY = clamp(y + catSize.height / 2 - pawH / 2, 8, window.innerHeight - pawH - 8);

    pawButton.style.left = `${pawX}px`;
    pawButton.style.top = `${pawY}px`;
    pawButton.style.right = 'auto';
    pawButton.style.bottom = 'auto';
}

function updateDesktopPet() {
    createDesktopPet();

    const settings = getSettings();
    const pose = getResolvedPose(settings);

    if (!catButton || !catImage || !catBadge) return;

    const shouldShow = settings.visible;
    catButton.classList.toggle('bcc-hidden', !shouldShow);
    pawButton?.classList.toggle('bcc-hidden', shouldShow || !settings.showPawWhenHidden);
    catButton.classList.remove('bcc-pose-sit', 'bcc-pose-alert', 'bcc-pose-sleep', 'bcc-pose-happy', 'bcc-pose-talk', 'bcc-pose-play', 'bcc-pose-loaf');
    catButton.classList.add(`bcc-pose-${pose}`);
    catButton.classList.toggle('bcc-hungry', settings.hunger < 30);

    catButton.title = `${settings.name}｜${getMoodText(settings)}`;
    catImage.src = getCatAssetPath(settings);
    catImage.alt = settings.name;

    catBadge.textContent = '';
    catBadge.setAttribute('aria-hidden', 'true');

    applyDesktopPosition();

    if (!shouldShow) {
        petMenu?.classList.remove('bcc-show');
    }
}

function updatePetMenu() {

    if (!petMenuContent) return;

    const settings = getSettings();

    petMenuContent.innerHTML = `
        <div class="bcc-menu-title-row">
            <div>
                <div class="bcc-menu-title">🐈‍⬛ ${escapeHtml(settings.name)}</div>
                <div class="bcc-menu-sub">${escapeHtml(getMoodText(settings))}</div>
            </div>
            <button class="bcc-close" data-bcc-close>×</button>
        </div>

        ${statMarkup('饱腹', settings.hunger)}
        ${statMarkup('心情', settings.mood)}
        ${statMarkup('精力', settings.energy)}
        ${statMarkup('亲密', settings.affection)}

        <div class="bcc-menu-drag-hint">拖标题移动菜单；拖右下角↘缩放；内容区可上下滑动</div>
        <div class="bcc-pet-actions">
            <button class="bcc-btn ${settings.activeAction === 'feed' ? 'bcc-active' : ''}" data-bcc-action="feed">🍗 喂食</button>
            <button class="bcc-btn ${settings.activeAction === 'pet' ? 'bcc-active' : ''}" data-bcc-action="pet">🤍 摸摸</button>
            <button class="bcc-btn ${settings.activeAction === 'play' ? 'bcc-active' : ''}" data-bcc-action="play">🧶 逗猫</button>
            <button class="bcc-btn ${settings.activeAction === 'sleep' ? 'bcc-active' : ''}" data-bcc-action="sleep">${settings.sleeping ? '☀️ 叫醒' : '🌙 睡觉'}</button>
            <button class="bcc-btn ${settings.activeAction === 'sit' ? 'bcc-active' : ''}" data-bcc-action="sit">🐾 趴趴</button>
            <button class="bcc-btn ${settings.activeAction === 'alert' ? 'bcc-active' : ''}" data-bcc-action="alert">👀 警觉</button>
            <button class="bcc-btn ${settings.activeAction === 'status' ? 'bcc-active' : ''}" data-bcc-action="status">📋 状态</button>
            <button class="bcc-btn" data-bcc-action="hide">🙈 隐藏</button>
            <div class="bcc-scale-control bcc-full">
                <div class="bcc-scale-head">
                    <span>小黑猫大小</span>
                    <b id="bcc-scale-value">${Math.round((settings.scale ?? 1) * 100)}%</b>
                </div>
                <input id="bcc-scale-slider" type="range" min="70" max="160" step="1" value="${Math.round((settings.scale ?? 1) * 100)}">
            </div>
            <button class="bcc-btn bcc-full ${settings.activeAction === 'resetState' ? 'bcc-active' : ''}" data-bcc-action="resetState">↺ 重置状态</button>
        </div>

        <div class="bcc-menu-resize-handle" title="拖动缩放菜单">↘</div>
    `;

    petMenuContent.querySelector('[data-bcc-close]')?.addEventListener('click', () => {
        petMenu?.classList.remove('bcc-show');
    });

    petMenuContent.querySelectorAll('[data-bcc-action]').forEach((btn) => {
        btn.addEventListener('click', () => handleAction(btn.getAttribute('data-bcc-action')));
    });

    const scaleSlider = petMenuContent.querySelector('#bcc-scale-slider');
    const scaleValue = petMenuContent.querySelector('#bcc-scale-value');
    let scaleSaveTimer = null;

    scaleSlider?.addEventListener('input', () => {
        const settings = getSettings();
        settings.scale = clamp(Number(scaleSlider.value) / 100, 0.7, 1.6);
        if (scaleValue) scaleValue.textContent = `${Math.round(settings.scale * 100)}%`;

        // 滑动时只改 transform，不重绘菜单、不重新设置图片 src，
        // 这样小黑猫和互动菜单都不会跟着抖。
        applyDesktopPosition();
        applyPawPosition();

        clearTimeout(scaleSaveTimer);
        scaleSaveTimer = setTimeout(() => persist(), 220);
    });

    scaleSlider?.addEventListener('change', () => {
        persist();
        applyDesktopPosition();
        applyPawPosition();
    });
}

function showPetMenu() {
    if (!petMenu) return;
    updatePetMenu();
    petMenu.classList.add('bcc-show');
    placeMenu();
}

function togglePetMenu() {
    if (!petMenu) return;
    if (petMenu.classList.contains('bcc-show')) {
        petMenu.classList.remove('bcc-show');
    } else {
        showPetMenu();
    }
}

function placeMenu() {
    if (!petMenu || !catButton) return;

    const settings = getSettings();
    const savedW = settings.menuW ? clamp(settings.menuW, 240, Math.min(520, window.innerWidth - 16)) : null;
    const savedH = settings.menuH ? clamp(settings.menuH, 220, Math.min(760, window.innerHeight - 16)) : null;
    const width = savedW || Math.min(310, window.innerWidth - 20);

    petMenu.style.width = `${width}px`;
    if (savedH) {
        petMenu.style.height = `${savedH}px`;
        petMenu.style.maxHeight = `${savedH}px`;
    } else {
        petMenu.style.height = 'auto';
    }

    if (settings.menuX !== null && settings.menuY !== null) {
        const height = petMenu.offsetHeight || savedH || 290;
        const left = clamp(settings.menuX, 8, window.innerWidth - width - 8);
        const top = clamp(settings.menuY, 8, window.innerHeight - height - 8);

        settings.menuX = left;
        settings.menuY = top;
        petMenu.style.left = `${left}px`;
        petMenu.style.top = `${top}px`;
        petMenu.style.right = 'auto';
        petMenu.style.bottom = 'auto';
        return;
    }

    const rect = catButton.getBoundingClientRect();
    const menuHeight = petMenu.offsetHeight || 290;
    let left;

    if (rect.right + 14 + width <= window.innerWidth) {
        left = rect.right + 14;
    } else if (rect.left - 14 - width >= 0) {
        left = rect.left - 14 - width;
    } else {
        left = clamp(rect.left, 8, window.innerWidth - width - 8);
    }

    let top = rect.top + rect.height / 2 - menuHeight / 2;
    if (top + menuHeight > window.innerHeight - 8) {
        top = window.innerHeight - menuHeight - 8;
    }
    top = clamp(top, 8, window.innerHeight - menuHeight - 8);

    petMenu.style.left = `${left}px`;
    petMenu.style.top = `${top}px`;
    petMenu.style.right = 'auto';
    petMenu.style.bottom = 'auto';
}
function renderBubble(text, duration = 3600) {
    if (!bubble) return;
    bubble.textContent = text;
    placeBubble();
    bubble.classList.add('bcc-show');

    clearTimeout(renderBubble._timer);
    renderBubble._timer = setTimeout(() => {
        bubble?.classList.remove('bcc-show');
    }, duration);
}

function placeBubble() {
    if (!bubble || !catButton) return;

    const rect = catButton.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 20);
    const left = clamp(rect.left - width / 2 + rect.width / 2, 8, window.innerWidth - width - 8);
    const top = clamp(rect.top - 64, 8, window.innerHeight - 100);

    bubble.style.maxWidth = `${width}px`;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
}

function handleAction(action) {
    const settings = getSettings();
    tick(settings);
    if (action !== 'hide') settings.activeAction = action;

    if (action === 'feed') {
        settings.sleeping = false;
        settings.pose = 'sit';
        settings.hunger = clamp(settings.hunger + 22);
        settings.mood = clamp(settings.mood + 8);
        settings.energy = clamp(settings.energy + 3);
        settings.affection = clamp(settings.affection + 3);
        setTransientPose('talk', 2000);
        renderBubble(randomItem([
            '喵呜。它叼走小鱼干，嚼完还冲你眨了下眼。',
            '它吃得很认真，耳朵都满足地抖了一下。',
            '小黑猫埋头吃了几口，看起来被你哄好了。',
        ]));
    }

    if (action === 'pet') {
        if (settings.sleeping) {
            settings.affection = clamp(settings.affection + 1);
            renderBubble('它睡得很熟，只轻轻动了动耳朵。');
        } else {
            settings.pose = 'sit';
            settings.mood = clamp(settings.mood + 12);
            settings.affection = clamp(settings.affection + 6);
            settings.energy = clamp(settings.energy - 2);
            setTransientPose('happy', 2400);
            renderBubble(randomItem([
                '它眯起眼，喉咙里咕噜咕噜的。',
                '它把脑袋往你手心蹭了蹭，看起来很受用。',
                '尾巴轻轻晃了晃，像在偷偷撒娇。',
            ]));
        }
    }

    if (action === 'play') {
        settings.sleeping = false;
        if (settings.energy < 12) {
            settings.pose = 'loaf';
            settings.mood = clamp(settings.mood - 2);
            setTransientPose('loaf', 1800);
            renderBubble('它只象征性拍了一下你的手，然后继续趴着。');
        } else {
            settings.pose = 'alert';
            settings.energy = clamp(settings.energy - 16);
            settings.mood = clamp(settings.mood + 14);
            settings.affection = clamp(settings.affection + 5);
            setTransientPose('play', 2400);
            renderBubble(randomItem([
                '它一下来了精神，爪子都举起来了。',
                '小黑猫扑腾了一下，像一团突然起飞的小黑影。',
                '它追着你的动作看了好几眼，玩兴被勾起来了。',
            ]));
        }
    }

    if (action === 'sleep') {
        settings.sleeping = !settings.sleeping;
        settings.pose = settings.sleeping ? 'sleep' : 'sit';
        settings.effectPose = null;
        settings.effectUntil = 0;
        if (settings.sleeping) {
            settings.energy = clamp(settings.energy + 8);
            settings.mood = clamp(settings.mood + 2);
            renderBubble('小黑猫蜷成一团睡着了。');
        } else {
            setTransientPose('happy', 1800);
            renderBubble('小黑猫醒了，懒洋洋地伸了个小懒腰。');
        }
    }

    if (action === 'sit') {
        settings.sleeping = false;
        settings.pose = 'loaf';
        settings.mood = clamp(settings.mood + 2);
        setTransientPose('loaf', 1800);
        renderBubble('小黑猫重新趴回你的酒馆角落。');
    }

    if (action === 'alert') {
        settings.sleeping = false;
        settings.pose = 'alert';
        settings.energy = clamp(settings.energy - 2);
        setTransientPose('alert', 2200);
        renderBubble('它竖起耳朵，警觉地看着聊天桌面。');
    }

    if (action === 'status') {
        setTransientPose('loaf', 1500);
        showStatusBubble();
    }

    if (action === 'hide') {
        settings.activeAction = 'hide';
        settings.visible = false;
        settings.showPawWhenHidden = true;
        persist();
        petMenu?.classList.remove('bcc-show');
        renderBubble('小黑猫钻进阴影里了。');
    }

    if (action === 'resetState') {
        resetState();
        return;
    }

    refreshAllUi();
}

function showStatusBubble() {

    const settings = getSettings();
    renderBubble(
        `${settings.name}的状态：\n` +
        `姿势 ${getPoseText(settings)}\n` +
        `饱腹 ${Math.round(settings.hunger)}/100\n` +
        `心情 ${Math.round(settings.mood)}/100\n` +
        `精力 ${Math.round(settings.energy)}/100\n` +
        `亲密 ${Math.round(settings.affection)}/100\n` +
        `大小 ${Math.round((settings.scale ?? 1) * 100)}%`,
        5200
    );
}


function resetPosition() {
    const settings = getSettings();
    const centered = getCenteredPosition();
    settings.x = centered.x;
    settings.y = centered.y;
    settings.visible = true;
    settings.showPawWhenHidden = false;
    persist();
    refreshAllUi();
    renderBubble('小黑猫回到了聊天桌面中央。');
}

function resetState() {
    const settings = getSettings();
    const keepPosition = { x: settings.x, y: settings.y, visible: settings.visible, scale: settings.scale ?? 1 };
    Object.assign(settings, cloneObject(defaultSettings), keepPosition);
    settings.version = EXTENSION_VERSION;
    settings.effectPose = null;
    settings.effectUntil = 0;
    settings.activeAction = 'none';
    refreshAllUi();
    renderBubble('小黑猫状态已重置。');
}

function updateSettingsMenu() {
    const settings = getSettings();

    $('#black_cat_menu_preview').attr('src', getCatAssetPath(settings));
    $('#black_cat_menu_name').text(settings.name);
    $('#black_cat_menu_status').text(`${settings.visible ? '已显示' : '已隐藏'}｜大小${Math.round((settings.scale ?? 1) * 100)}%｜${getPoseText(settings)}`);

    $('#black_cat_toggle').text(settings.visible ? '隐藏小黑猫' : '显示小黑猫');
}

function bindSettingsMenuEvents() {
    $('#black_cat_toggle').on('click', () => {
        const settings = getSettings();
        settings.visible = !settings.visible;
        settings.showPawWhenHidden = false; // 扩展菜单隐藏 = 完全隐藏，不留猫爪
        if (settings.visible && (settings.x === null || settings.y === null)) {
            const centered = getCenteredPosition();
            settings.x = centered.x;
            settings.y = centered.y;
        }
        persist();
        refreshAllUi();
        if (settings.visible) renderBubble('喵。小黑猫出现了。');
    });

    $('#black_cat_reset_position').on('click', resetPosition);

}


function refreshAllUi() {
    updateSettingsMenu();
    updateDesktopPet();

    const sliderIsActive = document.activeElement?.id === 'bcc-scale-slider';
    if (sliderIsActive) return;

    if (petMenu?.classList.contains('bcc-show')) {
        updatePetMenu();
        placeMenu();
    }
}



function stripMessageText(text) {
    return String(text ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\u00a0/g, ' ');
}

function cleanNarrativeText(text) {
    const blocked = [
        /^状态(?:栏)?[:：]?/i,
        /^属性(?:栏|面板)?[:：]?/i,
        /^系统(?:提示)?[:：]?/i,
        /^旁白[:：]?/i,
        /^小剧场[:：]?/i,
        /^数值[:：]?/i,
        /^面板[:：]?/i,
        /^任务[:：]?/i,
        /^背包[:：]?/i,
        /^第\d+次/i,
        /^好感度/i,
        /^心动值/i,
        /^(?:HP|MP|SAN|EXP|LV)[:：]?/i,
        /^(?:好感|亲密|精力|心情|饱腹|体力|理智|金钱|时间|地点|场景|天气|衣着|着装|背景|当前状态|角色状态)[:：]?/i,
    ];

    const lines = stripMessageText(text)
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter((line) => !/^(?:[-_=~*]{3,}|•+)$/.test(line))
        .filter((line) => !/^\[[^\]]{0,20}\]$/.test(line))
        .filter((line) => !/^【[^】]{0,20}】$/.test(line))
        .filter((line) => !/^(?:第\d+次|\d+秒|\d+分|\d+回合|\d+轮)/.test(line))
        .filter((line) => !/^[0-9]+(?:\.[0-9]+)?%$/.test(line))
        .filter((line) => !blocked.some((reg) => reg.test(line)))
        .filter((line) => !/^[【\[](?:状态|属性|系统|旁白|小剧场|面板)[^】\]]*[】\]]/.test(line));

    return lines.join(' ').replace(/\s+/g, ' ').trim();
}


function getLatestAssistantDomMeta() {
    const candidates = Array.from(document.querySelectorAll('.mes, [class*="mes"]'))
        .filter((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 100 || rect.height < 40) return false;
            const cls = String(el.className || '');
            if (/\bis_user\b|\buser_mes\b/.test(cls)) return false;
            return el.querySelector('.mes_text, .mes_block, .name_text, .ch_name, [class*="name"]');
        });

    for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];
        const nameEl = el.querySelector('.name_text, .ch_name, .mes_name, [class*="name"]');
        const bodyEl = el.querySelector('.mes_text, .mes_block, .swipe, [class*="mes_text"], [class*="message"]');
        const name = normalizeName(nameEl?.textContent || '');
        const text = cleanNarrativeText(bodyEl?.textContent || el.textContent || '');
        if (text && text.length >= 6) {
            return { name, text };
        }
    }

    return null;
}

function getLatestAssistantEntry() {
    const context = getContext();
    const chat = context?.chat || [];
    if (!Array.isArray(chat) || !chat.length) {
        const domMeta = getLatestAssistantDomMeta();
        if (domMeta) return { index: -1, text: domMeta.text, rawText: domMeta.text, name: domMeta.name || '这位角色', context };
        return null;
    }

    const domMeta = getLatestAssistantDomMeta();

    for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (msg?.is_user) continue;

        const text = cleanNarrativeText(msg?.mes ?? msg?.message ?? '');
        if (!text || text.length < 6) continue;

        return {
            index: i,
            text,
            rawText: msg?.mes ?? msg?.message ?? '',
            name: domMeta?.name || msg?.name || context?.name2 || '角色',
            context,
        };
    }

    return null;
}

function shortQuote(text) {
    const clean = cleanNarrativeText(text);
    if (!clean) return '';
    return clean.length > 22 ? `${clean.slice(0, 22)}……` : clean;
}

function detectRoundTone(text) {
    const t = String(text || '');

    if (['危险', '血', '刀', '枪', '追杀', '别回头', '怪物', '杀', '死', '逃'].some((w) => t.includes(w))) return 'danger';
    if (['吻', '靠近', '脸红', '微醺', '心跳', '抱', '喜欢', '爱', '亲'].some((w) => t.includes(w))) return 'flirt';
    if (['雨', '雨夜', '潮湿', '雷', '窗', '夜色', '冷'].some((w) => t.includes(w))) return 'rain';
    if (['笑', '温柔', '轻声', '摸', '安慰', '拥抱'].some((w) => t.includes(w))) return 'soft';
    if (['猫', '小猫', '黑猫', '喵', '铃铛'].some((w) => t.includes(w))) return 'cat';
    return 'normal';
}

function mutateByTone(settings, tone) {
    if (tone === 'danger') {
        settings.sleeping = false;
        settings.pose = 'alert';
        settings.mood = clamp(settings.mood - 3);
        settings.energy = clamp(settings.energy - 1);
    }

    if (tone === 'flirt' || tone === 'soft') {
        settings.sleeping = false;
        settings.pose = 'sit';
        settings.mood = clamp(settings.mood + 3);
        settings.affection = clamp(settings.affection + 1);
    }

    if (tone === 'rain') {
        settings.pose = 'sit';
        settings.energy = clamp(settings.energy - 2);
    }

    if (tone === 'cat') {
        settings.sleeping = false;
        settings.pose = 'sit';
        settings.mood = clamp(settings.mood + 4);
        settings.affection = clamp(settings.affection + 2);
    }
}

function normalizeName(value) {
    return String(value || '').replace(/\s+/g, '').trim();
}

function getPrimaryCharacterName(entry) {
    const candidates = [
        entry?.name,
        entry?.context?.name2,
        entry?.context?.characterName,
    ].map(normalizeName).filter(Boolean);

    for (const name of candidates) {
        if (name.length >= 1 && name.length <= 16 && !['Assistant', '角色'].includes(name)) {
            return name;
        }
    }

    return '这位角色';
}

function splitNarrativeSentences(text) {
    return cleanNarrativeText(text)
        .split(/(?<=[。！？!?；;])/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 4);
}

function extractQuotedText(text) {
    const match = String(text || '').match(/[“「『"]([^”」』"]{2,40})[”」』"]/);
    return match?.[1]?.trim() || '';
}

function trimSnippet(text, max = 28) {
    const clean = cleanNarrativeText(text);
    if (!clean) return '';
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function pickFocusSentence(entry) {
    const target = getPrimaryCharacterName(entry);
    const sentences = splitNarrativeSentences(entry.text);
    if (!sentences.length) return '';

    const actionReg = /(说|问|答|笑|看|盯|望|抬眼|垂眼|抬手|伸手|靠近|退开|沉默|转身|走近|走远|俯身|低声|轻声|握|抱|拥|亲|吻|拦|坐|立|跪|推|拉)/;

    const scored = sentences.map((sentence, index) => {
        let score = 0;
        if (target && sentence.includes(target)) score += 10;
        if (extractQuotedText(sentence)) score += 6;
        if (actionReg.test(sentence)) score += 5;
        if (sentence.length >= 10 && sentence.length <= 60) score += 3;
        score -= index * 0.12;
        return { sentence, score };
    }).sort((a, b) => b.score - a.score);

    return scored[0]?.sentence || sentences[0] || '';
}

function detectActionCue(sentence, target) {
    const text = String(sentence || '');
    const mapping = [
        ['抬眼', '抬眼那一下'],
        ['垂眼', '垂眼的时候'],
        ['低声', '低声开口的时候'],
        ['轻声', '轻声说话的时候'],
        ['沉默', '沉默那一会儿'],
        ['伸手', '伸手的动作'],
        ['抬手', '抬手的时候'],
        ['靠近', '靠近时'],
        ['转身', '转身的时候'],
        ['走近', '走近的时候'],
        ['盯', '盯着人看的样子'],
        ['看', '看人的眼神'],
        ['笑', '笑起来的时候'],
        ['握', '握住东西的时候'],
        ['抱', '抱上去的时候'],
        ['拥', '靠过去的时候'],
        ['吻', '靠近得快亲上去的时候'],
        ['亲', '那点带着亲昵的动作'],
        ['坐', '坐在那里时'],
        ['立', '站定的时候'],
    ];

    for (const [key, phrase] of mapping) {
        if (text.includes(key)) return phrase;
    }

    if (target && text.includes(target)) return `这段关于${target}的描写`;
    return '这段动作';
}


function inferActionSubject(sentence, fallbackName) {
    const clean = String(sentence || '');
    const patterns = [
        /([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_·]{1,10})(?=(?:低声|轻声|抬眼|垂眼|抬手|伸手|靠近|退开|沉默|转身|走近|笑|看|盯|问|说|答|握|抱|坐|立))/,
        /(?:看向|望向|朝着|对)([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_·]{1,10})/
    ];

    for (const reg of patterns) {
        const match = clean.match(reg);
        const name = normalizeName(match?.[1] || '');
        if (name && !['你', '我', '他', '她', '它', '我们', '他们', '她们'].includes(name)) return name;
    }

    return fallbackName;
}

function buildRoundComment(entry, force = false) {
    const basePrimary = getPrimaryCharacterName(entry);
    const focus = pickFocusSentence(entry);
    const primary = inferActionSubject(focus, basePrimary);
    const quote = extractQuotedText(focus);
    const snippet = trimSnippet(focus, 30);
    const tone = detectRoundTone(focus || entry.text);
    const actionCue = detectActionCue(focus, primary);

    const leads = [
        '小黑猫托腮认真看完：',
        '小黑猫歪头想了想：',
        '小黑猫甩了甩尾巴，轻声说：',
        '小黑猫小声咪了一下：',
        '小黑猫抱着爪子点评：',
    ];

    const cuteClosers = [
        '怪会拿捏气氛的。',
        '还挺会写到人心口上的。',
        '这轮我给他偷偷记一朵小花。',
        '是会让猫多看两眼的程度。',
        '嗯，这种味道我喜欢。',
        '猫猫认证：这一下有点会。',
        '我决定先把尾巴摇一下。',
    ];

    const toneAdds = {
        danger: ['明明危险，偏偏很抓人。', '像把锋利都收在话缝里了。'],
        flirt: ['甜得不吵，反而更上头。', '暧昧得很轻，但后劲好足。'],
        rain: ['潮乎乎的情绪一下就起来了。', '像夜里窗边那阵冷风，轻轻一吹就进心里。'],
        soft: ['温柔得刚刚好，不会太满。', '这种软下来的劲儿很加分。'],
        cat: ['提到猫的话，猫当然会额外偏心一点。', '有猫味的一轮，天然加分。'],
        normal: ['情绪压得住，反而更有味道。', '看着平静，底下其实很有劲。'],
    };

    const pool = [];

    if (quote) {
        pool.push(`${randomItem(leads)}${primary}这句“${trimSnippet(quote, 18)}”说得挺有分寸，${randomItem(cuteClosers)}`);
        pool.push(`${randomItem(leads)}我盯着${primary}这句“${trimSnippet(quote, 18)}”看了会儿，${randomItem(toneAdds[tone] || toneAdds.normal)}`);
    }

    if (focus) {
        pool.push(`${randomItem(leads)}${primary}${actionCue}，${randomItem(cuteClosers)}`);
        pool.push(`${randomItem(leads)}${primary}这一段“${snippet}”，${randomItem(toneAdds[tone] || toneAdds.normal)}`);
        pool.push(`${randomItem(leads)}${primary}${actionCue}写得很有画面感，像被镜头轻轻推近了一下。`);
    }

    pool.push(`${randomItem(leads)}这轮我主要看${primary}——${randomItem(toneAdds[tone] || toneAdds.normal)}`);
    pool.push(`${randomItem(leads)}${primary}这轮存在感很稳，${randomItem(cuteClosers)}`);

    let pose = 'talk';
    if (tone === 'soft' || tone === 'flirt' || tone === 'cat') pose = 'happy';
    if (tone === 'danger') pose = 'alert';
    if (!quote && !focus) pose = 'loaf';

    return { text: randomItem(pool), tone, pose };
}

function commentOnLatestRound(force = false) {

    const settings = getSettings();
    if (!settings.visible) return;

    const entry = getLatestAssistantEntry();
    if (!entry) {
        if (force) renderBubble('小黑猫趴在桌面上：还没看到能吐槽的正文内容呢。');
        return;
    }

    const key = `${entry.context?.chatId ?? ''}|${entry.index}|${entry.text.slice(0, 120)}`;
    if (!force && settings.lastRoundCommentKey === key) return;

    const built = buildRoundComment(entry, force);
    settings.lastRoundCommentKey = key;
    mutateByTone(settings, built.tone);
    setTransientPose(built.pose || 'talk', force ? 3000 : 2600);
    refreshAllUi();
    renderBubble(built.text, force ? 6500 : 5600);
}


async function moduleWorker() {
    const settings = getSettings();
    tick(settings);
    updateSettingsMenu();

    // 拉条正在滑动时，不重设图片/菜单，避免抖动。
    if (document.activeElement?.id === 'bcc-scale-slider') {
        applyDesktopPosition();
        applyPawPosition();
        return;
    }

    updateDesktopPet();
}

async function appendSettingsWindow() {
    if (document.getElementById('black_cat_settings')) return;

    const getContainer = () => $(document.getElementById('black_cat_container') ?? document.getElementById('extensions_settings'));

    try {
        const windowHtml = $(await $.get(windowHtmlPath));
        getContainer().append(windowHtml);
    } catch (err) {
        console.warn(DEBUG_PREFIX + 'window.html load failed, using inline fallback.', err);
        getContainer().append(`
            <div id="black_cat_settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>小黑猫桌宠</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="bcc-lite-settings">
                            <div class="bcc-lite-row">
                                <img id="black_cat_menu_preview" class="bcc-menu-preview" alt="小黑猫" draggable="false">
                                <div>
                                    <div id="black_cat_menu_name" class="bcc-menu-name">小黑</div>
                                    <div id="black_cat_menu_status" class="bcc-menu-status">它安静地趴着。</div>
                                </div>
                            </div>
                            <div class="bcc-lite-controls">
                                <div id="black_cat_toggle" class="menu_button">隐藏小黑猫</div>
                                <div id="black_cat_reset_position" class="menu_button">复位到中央</div>
                            </div>
                            <small class="bcc-lite-hint">这里只是控制入口。扩展菜单里的隐藏会完全隐藏小黑猫；如果想留下猫爪，请在小黑猫互动菜单里点隐藏。</small>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }
}

jQuery(async () => {
    try {
        if (initialized) return;
        initialized = true;

        await appendSettingsWindow();
        getSettings();
        createDesktopPet();
        bindSettingsMenuEvents();
        refreshAllUi();

        const wrapper = new ModuleWorkerWrapper(moduleWorker);
        setInterval(wrapper.update.bind(wrapper), UPDATE_INTERVAL);
        await moduleWorker();

        setTimeout(() => {
            const settings = getSettings();
            if (settings.visible) {
                renderBubble('喵。小黑猫会待在聊天桌面上；点我互动，隐藏后可以拖动猫爪，也可以点猫爪叫我回来。');
            }
        }, 700);
    } catch (err) {
        console.error(DEBUG_PREFIX + 'init failed', err);
        toast('小黑猫桌宠初始化失败，请看浏览器控制台。');
    }
});
