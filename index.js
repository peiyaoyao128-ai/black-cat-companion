import { saveSettingsDebounced } from '../../../../script.js';
import { getContext, extension_settings, ModuleWorkerWrapper } from '../../../extensions.js';

export { MODULE_NAME };

const MODULE_NAME = 'black_cat_companion';
const DEBUG_PREFIX = '<BlackCatCompanion> ';
const UPDATE_INTERVAL = 2000;
const EXTENSION_VERSION = '0.8.0';

const windowHtmlPath = new URL('./window.html', import.meta.url).href;


const defaultSettings = {
    version: EXTENSION_VERSION,
    visible: true,
    showPawWhenHidden: false,
    name: '罗小黑',
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

    brainProvider: 'tavern',
    brainStyle: 'cute',
    brainRange: 1,
    brainMaxChars: 1500,
    brainMaxTokens: 120,
    brainTemperature: 0.8,
    brainCustomApiUrl: '',
    brainCustomModel: '',
    brainCustomApiKey: '',
    brainDebug: true,
    brainContextMode: 'character',
    qualityMode: 'high',
};

const persistedKeys = ['version', 'visible', 'showPawWhenHidden', 'name', 'x', 'y', 'scale', 'menuX', 'menuY', 'menuW', 'menuH', 'brainProvider', 'brainStyle', 'brainRange', 'brainMaxChars', 'brainMaxTokens', 'brainTemperature', 'brainCustomApiUrl', 'brainCustomModel', 'brainCustomApiKey', 'brainDebug', 'brainContextMode', 'qualityMode'];
let runtimeSettings = null;
let initialized = false;
let desktopRoot = null;
let catButton = null;
let pawButton = null;
let catImage = null;
let catAssetCurrent = '';
let catAssetSwapTimer = null;
let eyeLayer = null;
let gazePupils = null;
let catBadge = null;
let catAssetNonce = 0;
let petMenu = null;
let petMenuContent = null;
let bubble = null;
let dragRaf = null;
let pendingDragPosition = null;
let gazeHoldTimer = null;
let gazeReleaseTimer = null;
let eyeFollowActive = false;
let lastGazePoint = null;
let gazeTargetOffset = { x: 0, y: 0 };
let gazeCurrentOffset = { x: 0, y: 0 };
let gazePupilRaf = null;


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

let bubbleDragState = {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
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
    hydrated.brainProvider = stored.brainProvider ?? defaultSettings.brainProvider;
    hydrated.brainStyle = stored.brainStyle ?? defaultSettings.brainStyle;
    hydrated.brainRange = Number(stored.brainRange ?? defaultSettings.brainRange);
    hydrated.brainMaxChars = Number(stored.brainMaxChars ?? defaultSettings.brainMaxChars);
    hydrated.brainMaxTokens = Number(stored.brainMaxTokens ?? defaultSettings.brainMaxTokens);
    hydrated.brainTemperature = Number(stored.brainTemperature ?? defaultSettings.brainTemperature);
    hydrated.brainCustomApiUrl = stored.brainCustomApiUrl ?? defaultSettings.brainCustomApiUrl;
    hydrated.brainCustomModel = stored.brainCustomModel ?? defaultSettings.brainCustomModel;
    hydrated.brainCustomApiKey = stored.brainCustomApiKey ?? defaultSettings.brainCustomApiKey;
    hydrated.brainDebug = stored.brainDebug ?? defaultSettings.brainDebug;
    hydrated.brainContextMode = stored.brainContextMode ?? defaultSettings.brainContextMode;
    hydrated.qualityMode = stored.qualityMode ?? defaultSettings.qualityMode;
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

function restartCatAnimation() {
    // 不再 removeAttribute('src')。
    // 之前每次互动 setTransientPose() 都会先清空可见 img 的 src，
    // 浏览器就会短暂显示破图图标/alt 文本；这正是切换动作闪破图的源头。
    catAssetNonce += 1;
}

function setTransientPose(pose, duration = 2200) {
    const settings = getSettings();
    settings.effectPose = pose;
    settings.effectUntil = Date.now() + duration;
    restartCatAnimation();
}

function getCatAssetPath(settings = getSettings()) {
    const pose = getResolvedPose(settings);
    if (pose === 'sleep') return assetPath('cat-sleep.webp');
    if (pose === 'alert') return assetPath('cat-alert.webp');
    if (pose === 'happy') return assetPath('cat-happy.webp');
    if (pose === 'talk') return assetPath('cat-talk.webp');
    if (pose === 'play') return assetPath('cat-play.webp');
    if (pose === 'loaf') return assetPath('cat-loaf.webp');
    return assetPath('cat-sit.webp');
}


function getQualityModeLabel(mode = getSettings().qualityMode) {
    if (mode === 'balanced') return '平衡模式';
    if (mode === 'power') return '省电模式';
    return '高清模式';
}

function getQualityModeHint(mode = getSettings().qualityMode) {
    if (mode === 'balanced') {
        return '当前：平衡模式。保留动态素材入口，后续可接入平衡转码素材。';
    }
    if (mode === 'power') {
        return '当前：省电模式。保留动态素材入口，后续可接入省电播放策略。';
    }
    return '当前：高清模式。使用高清动态素材，并提前预加载常用动作。';
}

const preloadedCatAssets = new Set();

function preloadCatAssets() {
    const assetNames = [
        'cat-sit.webp',
        'cat-alert.webp',
        'cat-sleep.webp',
        'cat-happy.webp',
        'cat-talk.webp',
        'cat-play.webp',
        'cat-loaf.webp',
        'cat-sit-eyebase.webp',
        'gaze-pupils.png',
    ];

    for (const name of assetNames) {
        const url = assetPath(name);
        if (preloadedCatAssets.has(url)) continue;
        preloadedCatAssets.add(url);

        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        if (img.decode) img.decode().catch(() => {});
    }
}

function applyQualityMode() {
    const settings = getSettings();
    const mode = settings.qualityMode || 'high';

    desktopRoot?.classList.remove('bcc-quality-high', 'bcc-quality-balanced', 'bcc-quality-power');
    desktopRoot?.classList.add(`bcc-quality-${mode}`);

    if (mode === 'high') {
        preloadCatAssets();
    }
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


function isolatePetMenuEvent(event) {
    // 不让互动菜单里的点击冒泡到酒馆聊天区，
    // 避免手机端点按钮时把底部聊天输入界面唤出来。
    event.stopPropagation();
}

function bindPetMenuEventIsolation() {
    if (!petMenu || petMenu.dataset.bccIsolated === '1') return;
    petMenu.dataset.bccIsolated = '1';

    ['click', 'dblclick', 'auxclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu'].forEach((type) => {
        petMenu.addEventListener(type, isolatePetMenuEvent, false);
    });
}


function getEyeBaseAssetPath() {
    return assetPath('cat-sit-eyebase.webp');
}

function getGazePupilsAssetPath() {
    return assetPath('gaze-pupils.png');
}

function clearGazeHoldTimer() {
    clearTimeout(gazeHoldTimer);
    gazeHoldTimer = null;
}

function setGazePupilTransform(x = 0, y = 0) {
    if (!gazePupils) return;
    gazePupils.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
}

function ensureGazeAnimation() {
    if (gazePupilRaf) return;
    gazePupilRaf = requestAnimationFrame(animateGazePupils);
}

function animateGazePupils() {
    if (!gazePupils) {
        gazePupilRaf = null;
        return;
    }

    gazeCurrentOffset.x += (gazeTargetOffset.x - gazeCurrentOffset.x) * 0.18;
    gazeCurrentOffset.y += (gazeTargetOffset.y - gazeCurrentOffset.y) * 0.18;

    if (Math.abs(gazeCurrentOffset.x - gazeTargetOffset.x) < 0.05) gazeCurrentOffset.x = gazeTargetOffset.x;
    if (Math.abs(gazeCurrentOffset.y - gazeTargetOffset.y) < 0.05) gazeCurrentOffset.y = gazeTargetOffset.y;

    setGazePupilTransform(gazeCurrentOffset.x, gazeCurrentOffset.y);

    const stillMoving = Math.abs(gazeCurrentOffset.x - gazeTargetOffset.x) >= 0.05 || Math.abs(gazeCurrentOffset.y - gazeTargetOffset.y) >= 0.05;
    if (eyeFollowActive || stillMoving) {
        gazePupilRaf = requestAnimationFrame(animateGazePupils);
    } else {
        gazePupilRaf = null;
    }
}

function getGazeVector(clientX, clientY) {
    if (!catButton) return { dx: 0, dy: 0 };
    const rect = catButton.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.45;
    const nx = clamp((clientX - cx) / Math.max(22, rect.width * 0.34), -1, 1);
    const ny = clamp((clientY - cy) / Math.max(18, rect.height * 0.28), -1, 1);
    return { dx: nx, dy: ny };
}

function updateGazePupils(clientX = null, clientY = null) {
    if (!gazePupils) return;

    let vector = { dx: 0, dy: 0 };
    if (clientX !== null && clientY !== null) {
        vector = getGazeVector(clientX, clientY);
        lastGazePoint = { x: clientX, y: clientY };
    } else if (lastGazePoint) {
        vector = getGazeVector(lastGazePoint.x, lastGazePoint.y);
    }

    gazeTargetOffset = {
        x: vector.dx * 2.7,
        y: vector.dy * 1.8,
    };
    ensureGazeAnimation();
}

function activateEyeFollow(clientX, clientY) {
    const settings = getSettings();
    if (!settings.visible) return;

    eyeFollowActive = true;
    dragState.moved = true;
    clearTimeout(gazeReleaseTimer);
    lastGazePoint = { x: clientX, y: clientY };
    updateGazePupils(clientX, clientY);
    refreshAllUi();
}

function deactivateEyeFollow(delay = 120) {
    clearTimeout(gazeReleaseTimer);
    gazeReleaseTimer = setTimeout(() => {
        eyeFollowActive = false;
        lastGazePoint = null;
        gazeTargetOffset = { x: 0, y: 0 };
        ensureGazeAnimation();
        refreshAllUi();
    }, delay);
}

function createDesktopPet() {
    if (desktopRoot) return;

    desktopRoot = document.createElement('div');
    desktopRoot.id = 'bcc-desktop-root';
    desktopRoot.innerHTML = `
        <button id="bcc-cat-button" class="bcc-cat-button" type="button" title="">
            <img id="bcc-cat-image" class="bcc-cat-image" alt="" draggable="false">
            <span id="bcc-eye-layer" class="bcc-eye-layer" aria-hidden="true">
                <img id="bcc-gaze-pupils" class="bcc-gaze-pupils" alt="" draggable="false">
            </span>
            <span id="bcc-cat-badge" class="bcc-cat-badge">✦</span>
        </button>

        <button id="bcc-paw-button" class="bcc-paw-button" type="button" title="点击叫回罗小黑">🐾</button>

        <div id="bcc-pet-bubble" class="bcc-pet-bubble"></div>

        <div id="bcc-pet-menu" class="bcc-pet-menu">
            <div id="bcc-pet-menu-content"></div>
        </div>
    `;
    document.body.appendChild(desktopRoot);

    catButton = document.getElementById('bcc-cat-button');
    pawButton = document.getElementById('bcc-paw-button');
    catImage = document.getElementById('bcc-cat-image');
    eyeLayer = document.getElementById('bcc-eye-layer');
    gazePupils = document.getElementById('bcc-gaze-pupils');
    catBadge = document.getElementById('bcc-cat-badge');
    if (gazePupils) gazePupils.src = getGazePupilsAssetPath();
    petMenu = document.getElementById('bcc-pet-menu');
    petMenuContent = document.getElementById('bcc-pet-menu-content');
    bubble = document.getElementById('bcc-pet-bubble');

    bindPetMenuEventIsolation();

    catImage?.setAttribute('draggable', 'false');
    catButton?.addEventListener('dragstart', (event) => event.preventDefault());
    catImage?.addEventListener('dragstart', (event) => event.preventDefault());

    bindDesktopPetEvents();
    bindPawDragEvents();
    bindMenuMoveResizeEvents();
    bindBubbleDragEvents();
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
            renderBubble('喵。罗小黑被你叫回来了。');
        }

        event.preventDefault();
        event.stopPropagation();
    });
}




function bindBubbleDragEvents() {
    if (!bubble || bubble.dataset.bccBubbleDragBound === '1') return;
    bubble.dataset.bccBubbleDragBound = '1';

    bubble.addEventListener('pointerdown', (event) => {
        if (!bubble.classList.contains('bcc-show')) return;
        const rect = bubble.getBoundingClientRect();
        bubbleDragState.active = true;
        bubbleDragState.moved = false;
        bubbleDragState.startX = event.clientX;
        bubbleDragState.startY = event.clientY;
        bubbleDragState.startLeft = rect.left;
        bubbleDragState.startTop = rect.top;
        bubble.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    bubble.addEventListener('pointermove', (event) => {
        if (!bubbleDragState.active) return;
        const dx = event.clientX - bubbleDragState.startX;
        const dy = event.clientY - bubbleDragState.startY;
        const width = bubble.offsetWidth || 220;
        const height = bubble.offsetHeight || 80;
        const left = clamp(bubbleDragState.startLeft + dx, 8, window.innerWidth - width - 8);
        const top = clamp(bubbleDragState.startTop + dy, 8, window.innerHeight - height - 8);
        bubble.style.left = `${left}px`;
        bubble.style.top = `${top}px`;
        bubble.style.right = 'auto';
        bubble.style.bottom = 'auto';
        event.preventDefault();
        event.stopPropagation();
    });

    bubble.addEventListener('pointerup', (event) => {
        if (!bubbleDragState.active) return;
        bubbleDragState.active = false;
        bubble.releasePointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    bubble.addEventListener('pointercancel', () => {
        bubbleDragState.active = false;
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

        clearGazeHoldTimer();
        clearTimeout(gazeReleaseTimer);
        const gazeStartX = event.clientX;
        const gazeStartY = event.clientY;
        gazeHoldTimer = setTimeout(() => {
            if (dragState.active && !dragState.moved) {
                activateEyeFollow(gazeStartX, gazeStartY);
            }
        }, 200);

        catButton.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    catButton.addEventListener('pointermove', (event) => {
        if (!dragState.active) return;

        if (eyeFollowActive) {
            updateGazePupils(event.clientX, event.clientY);
            dragState.moved = true;
            event.preventDefault();
            return;
        }

        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        if (Math.abs(dx) + Math.abs(dy) > 5) {
            dragState.moved = true;
            clearGazeHoldTimer();
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
        clearGazeHoldTimer();
        catButton.releasePointerCapture?.(event.pointerId);

        if (eyeFollowActive) {
            dragState.active = false;
            pendingDragPosition = null;
            deactivateEyeFollow(120);
            event.preventDefault();
            return;
        }

        dragState.active = false;

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


function setCatImageSmooth(displayAsset) {
    if (!catImage) return;

    catImage.alt = '';
    catImage.decoding = 'async';

    if (!catAssetCurrent) {
        catAssetCurrent = displayAsset;
        catImage.src = displayAsset;
        return;
    }

    if (catAssetCurrent === displayAsset || catImage.getAttribute('src') === displayAsset) {
        return;
    }

    clearTimeout(catAssetSwapTimer);

    // 只在内存里预加载；新素材完成前旧素材一直留在可见 img 上。
    // 不清空 src、不插入第二个可见 img、不加 cache-bust 查询参数。
    const preload = new Image();
    let applied = false;

    const apply = () => {
        if (applied) return;
        applied = true;
        catImage.alt = '';
        catImage.decoding = 'async';
        catImage.src = displayAsset;
        catAssetCurrent = displayAsset;
        catButton?.classList.remove('bcc-switching', 'bcc-cat-fade');
    };

    preload.onload = apply;
    preload.onerror = () => {
        console.warn(DEBUG_PREFIX + 'cat asset preload failed, keep previous asset:', displayAsset);
        catButton?.classList.remove('bcc-switching', 'bcc-cat-fade');
    };

    preload.src = displayAsset;

    if (preload.decode) {
        preload.decode().then(apply).catch(() => {});
    }
}

function updateDesktopPet() {
    createDesktopPet();

    const settings = getSettings();
    const pose = getResolvedPose(settings);

    if (!catButton || !catImage || !catBadge) return;

    applyQualityMode();

    const shouldShow = settings.visible;
    catButton.classList.toggle('bcc-hidden', !shouldShow);
    pawButton?.classList.toggle('bcc-hidden', shouldShow || !settings.showPawWhenHidden);
    const shouldEyeFollow = eyeFollowActive;
    const visualPose = shouldEyeFollow ? 'sit' : pose;
    catButton.classList.remove('bcc-pose-sit', 'bcc-pose-alert', 'bcc-pose-sleep', 'bcc-pose-happy', 'bcc-pose-talk', 'bcc-pose-play', 'bcc-pose-loaf');
    catButton.classList.add(`bcc-pose-${visualPose}`);
    catButton.classList.toggle('bcc-hungry', settings.hunger < 30);

    catButton.title = '';
    catButton.classList.toggle('bcc-eye-follow', shouldEyeFollow);
    const displayAsset = shouldEyeFollow ? getEyeBaseAssetPath() : getCatAssetPath(settings);
    setCatImageSmooth(displayAsset);
    catImage.alt = '';
    if (shouldEyeFollow) updateGazePupils();

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
            <button class="bcc-btn ${settings.activeAction === 'brainComment' ? 'bcc-active' : ''}" data-bcc-action="brainComment">💬 罗小黑评剧情</button>
            <button class="bcc-btn" data-bcc-action="hide">🙈 隐藏</button>
            <div class="bcc-scale-control bcc-full">
                <div class="bcc-scale-head">
                    <span>罗小黑大小</span>
                    <b id="bcc-scale-value">${Math.round((settings.scale ?? 1) * 100)}%</b>
                </div>
                <input id="bcc-scale-slider" type="range" min="70" max="160" step="1" value="${Math.round((settings.scale ?? 1) * 100)}">
            </div>
            <button class="bcc-btn bcc-full ${settings.activeAction === 'resetState' ? 'bcc-active' : ''}" data-bcc-action="resetState">↺ 重置状态</button>
        </div>

        <div class="bcc-menu-resize-handle" title="拖动缩放菜单">↘</div>
    `;

    petMenuContent.querySelector('[data-bcc-close]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        petMenu?.classList.remove('bcc-show');
    });

    petMenuContent.querySelectorAll('[data-bcc-action]').forEach((btn) => {
        btn.setAttribute('type', 'button');
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            handleAction(btn.getAttribute('data-bcc-action'));
        });
    });

    const scaleSlider = petMenuContent.querySelector('#bcc-scale-slider');
    const scaleValue = petMenuContent.querySelector('#bcc-scale-value');
    let scaleSaveTimer = null;

    scaleSlider?.addEventListener('pointerdown', (event) => event.stopPropagation());
    scaleSlider?.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
    scaleSlider?.addEventListener('click', (event) => event.stopPropagation());

    scaleSlider?.addEventListener('input', (event) => {
        event.stopPropagation();
        const settings = getSettings();
        settings.scale = clamp(Number(scaleSlider.value) / 100, 0.7, 1.6);
        if (scaleValue) scaleValue.textContent = `${Math.round(settings.scale * 100)}%`;

        // 滑动时只改 transform，不重绘菜单、不重新设置图片 src，
        // 这样罗小黑和互动菜单都不会跟着抖。
        applyDesktopPosition();
        applyPawPosition();

        clearTimeout(scaleSaveTimer);
        scaleSaveTimer = setTimeout(() => persist(), 220);
    });

    scaleSlider?.addEventListener('change', (event) => {
        event.stopPropagation();
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
    eyeFollowActive = false;
    clearGazeHoldTimer();
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
        setTransientPose('talk', 10567);
        renderBubble(randomItem([
            '喵呜。它叼走小鱼干，嚼完还冲你眨了下眼。',
            '它吃得很认真，耳朵都满足地抖了一下。',
            '罗小黑埋头吃了几口，看起来被你哄好了。',
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
            setTransientPose('happy', 10533);
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
            settings.pose = 'sit';
            settings.energy = clamp(settings.energy - 16);
            settings.mood = clamp(settings.mood + 14);
            settings.affection = clamp(settings.affection + 5);
            setTransientPose('play', 10533);
            renderBubble(randomItem([
                '它一下来了精神，爪子都举起来了。',
                '罗小黑扑腾了一下，像一团突然起飞的罗小黑影。',
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
            renderBubble('罗小黑蜷成一团睡着了。');
        } else {
            setTransientPose('happy', 10533);
            renderBubble('罗小黑醒了，懒洋洋地伸了个小懒腰。');
        }
    }

    if (action === 'sit') {
        settings.sleeping = false;
        settings.pose = 'loaf';
        settings.mood = clamp(settings.mood + 2);
        setTransientPose('loaf', 1800);
        renderBubble('罗小黑重新趴回你的酒馆角落。');
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

    if (action === 'brainComment') {
        settings.activeAction = 'brainComment';
        petMenu?.classList.remove('bcc-show');
        persist();
        runBrainComment('comment');
        return;
    }

    if (action === 'hide') {
        settings.activeAction = 'hide';
        settings.visible = false;
        settings.showPawWhenHidden = true;
        persist();
        petMenu?.classList.remove('bcc-show');
        renderBubble('罗小黑钻进阴影里了。');
    }

    if (action === 'resetState') {
        resetState();
        return;
    }

    if (petMenu?.contains(document.activeElement)) {
        document.activeElement?.blur?.();
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
        12000
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
    renderBubble('罗小黑回到了聊天桌面中央。');
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
    renderBubble('罗小黑状态已重置。');
}


function getRecentNarrativeEntries(count = 1) {
    const context = getContext();
    const chat = context?.chat || [];
    const result = [];

    if (Array.isArray(chat) && chat.length) {
        for (let i = chat.length - 1; i >= 0 && result.length < count; i--) {
            const msg = chat[i];
            const raw = msg?.mes ?? msg?.message ?? '';
            const text = cleanNarrativeText(raw);
            if (!text || text.length < 4) continue;

            const name = msg?.is_user
                ? (context?.name1 || '你')
                : (msg?.name || context?.name2 || '角色');

            result.push({
                index: i,
                name: normalizeName(name) || (msg?.is_user ? '你' : '角色'),
                isUser: !!msg?.is_user,
                text,
            });
        }
        return result.reverse();
    }

    const latest = getLatestAssistantEntry();
    if (latest) {
        return [{
            index: latest.index ?? -1,
            name: latest.name || '角色',
            isUser: false,
            text: latest.text,
        }];
    }

    return [];
}

function buildNarrativePreview() {
    const settings = getSettings();
    const count = clamp(Number(settings.brainRange || 1), 1, 8);
    const maxChars = clamp(Number(settings.brainMaxChars || 1500), 300, 5000);
    const entries = getRecentNarrativeEntries(count);
    const joined = entries
        .map((item) => `${item.name}：${item.text}`)
        .join('\n\n')
        .slice(0, maxChars);

    return {
        entries,
        text: joined,
        source: entries.length ? 'getContext.chat / fallback DOM' : 'none',
    };
}

function getBrainStyleInstruction(style) {
    const map = {
        cute: '你要像一只聪明、可爱、偏夸夸的小黑猫，点评要软一点，嘴甜但不要油腻。',
        roast: '你要轻轻吐槽，语气可爱，可以有一点阴阳怪气，但不要刻薄，不要攻击用户。',
        analysis: '你要做简短剧情解读，指出这一轮的动作、情绪或潜台词，语气清楚。',
        companion: '你要像陪读的小猫，在旁边小声回应剧情，温柔、短句、有陪伴感。',
    };
    return map[style] || map.cute;
}


function getCurrentCharacterCardContext() {
    const context = getContext();
    const characters = context?.characters;
    const id = context?.characterId ?? context?.character_id ?? context?.selectedCharacter;
    let card = null;

    if (Array.isArray(characters)) {
        card = characters[id] || characters.find((item) => item?.avatar === context?.character?.avatar || item?.name === context?.name2);
    } else if (characters && typeof characters === 'object') {
        card = characters[id] || Object.values(characters).find((item) => item?.name === context?.name2);
    }

    card = card || context?.character || null;

    const name = card?.name || context?.name2 || '';
    const pieces = [];

    const add = (label, value, limit = 700) => {
        const text = cleanNarrativeText(value);
        if (text) pieces.push(`${label}：${text.slice(0, limit)}`);
    };

    add('角色名', name, 80);
    add('角色设定', card?.description || card?.desc || card?.data?.description);
    add('性格', card?.personality || card?.data?.personality, 450);
    add('场景', card?.scenario || card?.data?.scenario, 450);
    add('示例对话', card?.mes_example || card?.data?.mes_example, 600);

    return {
        ok: !!(card || name),
        name: name || '未检测到',
        promptText: pieces.join('\n'),
    };
}

function getWorldBookContextStatus() {
    const context = getContext();
    const candidates = [
        context?.worldInfo,
        context?.world_info,
        context?.worldNames,
        context?.world_names,
        context?.chatMetadata?.world_info,
        context?.chat_metadata?.world_info,
        context?.activatedWorldInfo,
        context?.activated_world_info,
    ].filter(Boolean);

    let detected = false;
    let count = 0;

    for (const item of candidates) {
        if (Array.isArray(item)) {
            detected = detected || item.length > 0;
            count += item.length;
        } else if (typeof item === 'object') {
            const keys = Object.keys(item);
            detected = detected || keys.length > 0;
            count += keys.length;
        } else if (String(item).trim()) {
            detected = true;
            count += 1;
        }
    }

    return { detected, count };
}

function getBrainContextInfo() {
    const settings = getSettings();
    const provider = settings.brainProvider || 'tavern';
    const charInfo = getCurrentCharacterCardContext();
    const world = getWorldBookContextStatus();

    const tavernProvider = provider === 'tavern' || provider === 'tavern_then_custom';
    const customProvider = provider === 'custom' || provider === 'custom_then_tavern';

    const providerLabelMap = {
        tavern: '酒馆主API',
        custom: '独立API',
        custom_then_tavern: '优先独立API，失败用酒馆主API',
        tavern_then_custom: '优先酒馆主API，失败用独立API',
    };
    const lines = [];
    lines.push(`API来源：${providerLabelMap[provider] || provider}`);
    lines.push(`角色卡：${charInfo.ok ? `已检测：${charInfo.name}` : '未检测到当前角色卡'}`);

    if (tavernProvider && !customProvider) {
        lines.push('世界书：交由酒馆主API上下文处理');
    } else if (world.detected) {
        lines.push(`世界书：已检测到相关状态${world.count ? `（${world.count} 项）` : ''}`);
    } else {
        lines.push('世界书：未检测到可直接读取的状态；酒馆主API 模式会由酒馆自行处理');
    }

    let promptText = '';
    if (customProvider && settings.brainContextMode !== 'story' && charInfo.ok && charInfo.promptText) {
        promptText += `【当前角色卡摘要】\n${charInfo.promptText}\n`;
    }

    if (customProvider && settings.brainContextMode === 'character_world') {
        promptText += `【世界书状态】\n${world.detected ? '插件检测到世界书/相关状态，但不展开原文。' : '插件未检测到可直接读取的世界书条目。'}\n`;
    }

    return { statusText: lines.join('\n'), promptText };
}

function getBrainContextStatusText() {
    try {
        return getBrainContextInfo().statusText;
    } catch (err) {
        console.warn(DEBUG_PREFIX + 'context status failed', err);
        return '上下文状态：检测失败';
    }
}


function buildBrainPrompt(task = 'comment') {
    const settings = getSettings();
    const preview = buildNarrativePreview();

    if (!preview.text) {
        return { prompt: '', preview };
    }

    const styleInstruction = getBrainStyleInstruction(settings.brainStyle);
    const contextInfo = getBrainContextInfo();

    const prompt = [
        '你是酒馆网页里的桌宠“罗小黑”，不是聊天角色本人。',
        '你只在自己的桌宠气泡里说话，不能续写剧情，不能替用户或角色行动。',
        styleInstruction,
        contextInfo.promptText ? `【附加设定摘要】\n${contextInfo.promptText}` : '',
        '请基于下面的剧情正文，输出一句 20 到 70 字的中文短评。',
        '可以吐槽、夸夸、点出潜台词，但不要列清单，不要加引号，不要解释你在做什么。',
        '',
        '【剧情正文】',
        preview.text,
        '',
        task === 'test' ? '请随便给一句测试回应，确认你能正常说话。' : '请点评当前剧情。'
    ].join('\n');

    return { prompt, preview, contextInfo };
}

function normalizeBrainText(text) {
    return String(text ?? '')
        .replace(/^\s*罗小黑[:：]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
}

async function callCustomBrainApi(prompt) {
    const settings = getSettings();
    const url = String(settings.brainCustomApiUrl || '').trim();
    const model = String(settings.brainCustomModel || '').trim();
    const key = String(settings.brainCustomApiKey || '').trim();

    if (!url) throw new Error('还没有填写独立API 地址。');
    if (!model) throw new Error('还没有填写独立API 模型。');
    if (!key) throw new Error('还没有填写独立API Key。');

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: '你是桌宠罗小黑，只输出一句简短中文气泡短评。' },
                { role: 'user', content: prompt },
            ],
            temperature: clamp(Number(settings.brainTemperature || 0.8), 0, 2),
            max_tokens: clamp(Number(settings.brainMaxTokens || 120), 40, 400),
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`独立API 请求失败：${response.status} ${detail.slice(0, 120)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content
        ?? data?.choices?.[0]?.text
        ?? data?.message?.content
        ?? data?.content
        ?? '';

    if (!text) throw new Error('独立API 没有返回文本。');
    return normalizeBrainText(text);
}

async function callTavernBrainApi(prompt) {
    const context = getContext();

    if (typeof context?.generateQuietPrompt === 'function') {
        const result = await context.generateQuietPrompt(prompt);
        if (result) return normalizeBrainText(result);
    }

    if (typeof context?.generateRaw === 'function') {
        const result = await context.generateRaw(prompt, '', false, false);
        if (result) return normalizeBrainText(result);
    }

    if (typeof context?.generate === 'function') {
        const result = await context.generate(prompt);
        if (result) return normalizeBrainText(result);
    }

    throw new Error('当前酒馆环境没有暴露可直接调用的生成函数。');
}

async function callBrain(prompt, forcedProvider = null) {
    const settings = getSettings();
    const provider = forcedProvider || settings.brainProvider || 'tavern';

    if (provider === 'custom') return callCustomBrainApi(prompt);
    if (provider === 'tavern') return callTavernBrainApi(prompt);

    if (provider === 'custom_then_tavern') {
        try {
            return await callCustomBrainApi(prompt);
        } catch (err) {
            console.warn(DEBUG_PREFIX + 'custom API failed, fallback to tavern API', err);
            return callTavernBrainApi(prompt);
        }
    }

    if (provider === 'tavern_then_custom') {
        try {
            return await callTavernBrainApi(prompt);
        } catch (err) {
            console.warn(DEBUG_PREFIX + 'tavern API failed, fallback to custom API', err);
            return callCustomBrainApi(prompt);
        }
    }

    return callTavernBrainApi(prompt);
}

function setBrainPreviewOutput(text, isError = false) {
    const el = document.getElementById('black_cat_brain_preview_output');
    if (!el) return;
    el.textContent = text || '还没有剧情预览。';
    el.style.color = isError ? '#b94a64' : '';
}

function previewBrainNarrative() {
    const preview = buildNarrativePreview();

    if (!preview.text) {
        const msg = '罗小黑还没读到可以点评的正文。';
        setBrainPreviewOutput(msg, true);
        renderBubble(msg, 5200);
        return;
    }

    const contextInfo = getBrainContextInfo();
    const output = [
        `读取来源：${preview.source}`,
        `消息条数：${preview.entries.length}`,
        `正文长度：${preview.text.length} 字`,
        '',
        '【上下文状态】',
        contextInfo.statusText,
        '',
        '【剧情正文】',
        preview.text,
    ].join('\n');

    setBrainPreviewOutput(output);
    renderBubble('罗小黑已经把准备发送给 API 的剧情放到扩展菜单里了。', 5200);
}

async function runBrainComment(task = 'comment', forcedProvider = null) {
    const settings = getSettings();
    const { prompt, preview } = buildBrainPrompt(task);

    if (!prompt || !preview.text) {
        renderBubble('罗小黑趴在桌角：还没读到可以点评的正文。', 5200);
        return;
    }

    if (settings.brainDebug && task === 'comment') {
        const contextInfo = getBrainContextInfo();
        const output = [
            `读取来源：${preview.source}`,
            `消息条数：${preview.entries.length}`,
            `正文长度：${preview.text.length} 字`,
            '',
            '【上下文状态】',
            contextInfo.statusText,
            '',
            '【剧情正文】',
            preview.text,
        ].join('\n');
        setBrainPreviewOutput(output);
        const short = preview.text.length > 260 ? `${preview.text.slice(0, 260)}…` : preview.text;
        renderBubble(`调试预览已显示在扩展菜单。\n${short}`, 6500);
    }

    setTransientPose('talk', 2600);
    refreshAllUi();
    renderBubble('罗小黑正在看剧情……', 4500);

    try {
        const text = await callBrain(prompt, forcedProvider);
        setTransientPose('happy', 2600);
        renderBubble(text || '罗小黑眨了眨眼，但什么也没说。', 9000);
    } catch (err) {
        console.error(DEBUG_PREFIX + 'brain generation failed', err);
        setTransientPose('alert', 2200);
        renderBubble(`罗小黑连不上大脑：${err.message || err}`, 9000);
    }

    refreshAllUi();
}

async function testBrainProvider(forcedProvider) {
    const prompt = '请用一句 20 字以内的中文告诉我：罗小黑大脑连接成功。';
    setTransientPose('talk', 1800);
    renderBubble('罗小黑正在测试连接……', 4200);

    try {
        const text = await callBrain(prompt, forcedProvider);
        renderBubble(text || '罗小黑大脑连接成功。', 7000);
    } catch (err) {
        console.error(DEBUG_PREFIX + 'brain test failed', err);
        renderBubble(`测试失败：${err.message || err}`, 9000);
    }
}



function setInputValueIfNotFocused(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (document.activeElement === el) return;
    $(selector).val(value);
}

function updateSettingsMenu() {
    const settings = getSettings();

    $('#black_cat_menu_preview').attr('src', getCatAssetPath(settings));
    $('#black_cat_menu_name').text(settings.name);
    $('#black_cat_menu_status').text(`${settings.visible ? '已显示' : '已隐藏'}｜大小${Math.round((settings.scale ?? 1) * 100)}%｜${getPoseText(settings)}｜${getQualityModeLabel(settings.qualityMode)}`);

    $('#black_cat_toggle').text(settings.visible ? '隐藏罗小黑' : '显示罗小黑');

    $('.bcc-quality-btn').removeClass('bcc-active');
    $(`.bcc-quality-btn[data-bcc-quality="${settings.qualityMode || 'high'}"]`).addClass('bcc-active');
    $('#black_cat_quality_hint').text(getQualityModeHint(settings.qualityMode || 'high'));

    $('#black_cat_brain_provider').val(settings.brainProvider);
    $('#black_cat_brain_style').val(settings.brainStyle);
    $('#black_cat_brain_range').val(String(settings.brainRange));
    $('#black_cat_brain_context_mode').val(settings.brainContextMode);
    setInputValueIfNotFocused('#black_cat_brain_max_chars', settings.brainMaxChars);
    setInputValueIfNotFocused('#black_cat_brain_max_tokens', settings.brainMaxTokens);
    setInputValueIfNotFocused('#black_cat_brain_temperature', settings.brainTemperature);
    setInputValueIfNotFocused('#black_cat_custom_api_url', settings.brainCustomApiUrl);
    setInputValueIfNotFocused('#black_cat_custom_model', settings.brainCustomModel);
    setInputValueIfNotFocused('#black_cat_custom_api_key', settings.brainCustomApiKey);
    $('#black_cat_brain_debug').prop('checked', !!settings.brainDebug);
    $('#black_cat_brain_context_status').text(getBrainContextStatusText());
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
        if (settings.visible) renderBubble('喵。罗小黑出现了。');
    });

    $('#black_cat_reset_position').on('click', resetPosition);

    $('.bcc-quality-btn').on('click', (event) => {
        const mode = event.currentTarget?.dataset?.bccQuality || 'high';
        const settings = getSettings();
        settings.qualityMode = mode;
        persist();
        applyQualityMode();
        updateSettingsMenu();
        renderBubble(`罗小黑画质已切换为：${getQualityModeLabel(mode)}`, 4200);
    });

    $('#black_cat_brain_provider').on('change', (event) => {
        const settings = getSettings();
        settings.brainProvider = event.target.value;
        persist();
    });

    $('#black_cat_brain_style').on('change', (event) => {
        const settings = getSettings();
        settings.brainStyle = event.target.value;
        persist();
    });

    $('#black_cat_brain_range').on('change', (event) => {
        const settings = getSettings();
        settings.brainRange = Number(event.target.value) || 1;
        persist();
        updateSettingsMenu();
    });

    $('#black_cat_brain_context_mode').on('change', (event) => {
        const settings = getSettings();
        settings.brainContextMode = event.target.value || 'character';
        persist();
        updateSettingsMenu();
    });

    $('#black_cat_brain_max_chars, #black_cat_brain_max_tokens, #black_cat_brain_temperature').on('change input', () => {
        const settings = getSettings();
        settings.brainMaxChars = clamp(Number($('#black_cat_brain_max_chars').val() || 1500), 300, 5000);
        settings.brainMaxTokens = clamp(Number($('#black_cat_brain_max_tokens').val() || 120), 40, 400);
        settings.brainTemperature = clamp(Number($('#black_cat_brain_temperature').val() || 0.8), 0, 2);
        persist();
    });

    $('#black_cat_custom_api_url, #black_cat_custom_model, #black_cat_custom_api_key').on('change input', () => {
        const settings = getSettings();
        settings.brainCustomApiUrl = String($('#black_cat_custom_api_url').val() || '').trim();
        settings.brainCustomModel = String($('#black_cat_custom_model').val() || '').trim();
        settings.brainCustomApiKey = String($('#black_cat_custom_api_key').val() || '').trim();
        persist();
    });

    $('#black_cat_brain_debug').on('change', (event) => {
        const settings = getSettings();
        settings.brainDebug = !!event.target.checked;
        persist();
    });

    $('#black_cat_preview_story').on('click', previewBrainNarrative);
    $('#black_cat_test_tavern_api').on('click', () => testBrainProvider('tavern'));
    $('#black_cat_test_custom_api').on('click', () => testBrainProvider('custom'));
    $('#black_cat_clear_custom_key').on('click', () => {
        const settings = getSettings();
        settings.brainCustomApiKey = '';
        persist();
        updateSettingsMenu();
        renderBubble('罗小黑已经把独立API Key 清空了。', 5200);
    });

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
        '罗小黑托腮认真看完：',
        '罗小黑歪头想了想：',
        '罗小黑甩了甩尾巴，轻声说：',
        '罗小黑小声咪了一下：',
        '罗小黑抱着爪子点评：',
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
        if (force) renderBubble('罗小黑趴在桌面上：还没看到能吐槽的正文内容呢。');
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
                        <b>罗小黑桌宠</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="bcc-lite-settings">
                            <div class="bcc-lite-row">
                                <img id="black_cat_menu_preview" class="bcc-menu-preview" alt="" draggable="false">
                                <div>
                                    <div id="black_cat_menu_name" class="bcc-menu-name">罗小黑</div>
                                    <div id="black_cat_menu_status" class="bcc-menu-status">它安静地趴着。</div>
                                </div>
                            </div>
                            <div class="bcc-lite-controls">
                                <div id="black_cat_toggle" class="menu_button">隐藏罗小黑</div>
                                <div id="black_cat_reset_position" class="menu_button">复位到中央</div>
                            </div>
                            
                                <div class="bcc-quality-panel">
                                    <div class="bcc-section-title bcc-quality-title">罗小黑画质</div>
                                    <div class="bcc-quality-buttons">
                                        <div id="black_cat_quality_high" class="menu_button bcc-quality-btn" data-bcc-quality="high">高清模式</div>
                                        <div id="black_cat_quality_balanced" class="menu_button bcc-quality-btn" data-bcc-quality="balanced">平衡模式</div>
                                        <div id="black_cat_quality_power" class="menu_button bcc-quality-btn" data-bcc-quality="power">省电模式</div>
                                    </div>
                                    <small id="black_cat_quality_hint" class="bcc-lite-hint bcc-quality-hint">当前：高清模式。使用高清动态素材，并提前预加载常用动作。</small>
                                </div>
<small class="bcc-lite-hint">这里只是控制入口；扩展菜单隐藏是完全隐藏，互动菜单隐藏会留下猫爪。</small>

                            <hr class="bcc-lite-sep">
                            <div class="bcc-brain-settings">
                                <div class="bcc-section-title">罗小黑大脑 v7.0 测试</div>
                                <label class="bcc-field"><span>生成来源</span><select id="black_cat_brain_provider"><option value="tavern">使用酒馆主API</option><option value="custom">使用独立API</option><option value="custom_then_tavern">优先独立API，失败用酒馆主API</option><option value="tavern_then_custom">优先酒馆主API，失败用独立API</option></select></label>
                                <label class="bcc-field"><span>吐槽风格</span><select id="black_cat_brain_style"><option value="cute">可爱夸夸</option><option value="roast">轻度吐槽</option><option value="analysis">剧情解读</option><option value="companion">陪读小猫</option></select></label>
                                <label class="bcc-field"><span>读取范围</span><select id="black_cat_brain_range"><option value="1">最后 1 条消息</option><option value="3">最近 3 条消息</option><option value="5">最近 5 条消息</option></select></label>
                                <label class="bcc-field"><span>独立API 地址</span><input id="black_cat_custom_api_url" type="text"></label>
                                <label class="bcc-field"><span>独立API 模型</span><input id="black_cat_custom_model" type="text"></label>
                                <label class="bcc-field"><span>独立API Key</span><input id="black_cat_custom_api_key" type="password"></label>
                                <input id="black_cat_brain_max_chars" type="hidden" value="1500">
                                <input id="black_cat_brain_max_tokens" type="hidden" value="120">
                                <input id="black_cat_brain_temperature" type="hidden" value="0.8">
                                <label class="bcc-check"><input id="black_cat_brain_debug" type="checkbox"><span>调试预览</span></label>
                                <div class="bcc-lite-controls"><div id="black_cat_preview_story" class="menu_button">预览剧情</div><div id="black_cat_test_tavern_api" class="menu_button">测试酒馆主API</div><div id="black_cat_test_custom_api" class="menu_button">测试独立API</div><div id="black_cat_clear_custom_key" class="menu_button">清空 Key</div></div>
                                <div id="black_cat_brain_preview_output" class="bcc-brain-preview-output">点击“预览剧情”后，罗小黑会把准备发送给 API 的剧情显示在这里。</div>
                            </div>

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
                renderBubble('喵。罗小黑会待在聊天桌面上；点我互动，隐藏后可以拖动猫爪，也可以点猫爪叫我回来。');
            }
        }, 700);
    } catch (err) {
        console.error(DEBUG_PREFIX + 'init failed', err);
        toast('罗小黑桌宠初始化失败，请看浏览器控制台。');
    }
});
