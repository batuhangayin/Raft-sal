import { audio } from './audio.js';
import { createMaterials } from './textures.js';
import { createDetailedShark, createStructureMesh, createRealisticRaftBlock, createHookModel } from './models.js';
import { WorldManager } from './world.js';
import { ParticleEngine } from './particles.js';

const canvas = document.getElementById('gameCanvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7cc6fe, 0.0068);

const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 900;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 320);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobileDevice, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const materials = createMaterials();
const world = new WorldManager(scene, materials);
if (isMobileDevice) {
    world.sunLight.shadow.mapSize.width = 1024;
    world.sunLight.shadow.mapSize.height = 1024;
}
const particles = new ParticleEngine(scene);

// --- OYUN DURUMU ---
const BLOCK_SIZE = 2.5;
let isPlaying = false;
let isPaused = false;
let isCraftOpen = false;
let isStorageOpen = false;
let activeCraftTab = 'survival';
let mouseSensitivity = 1.0;

let pointerLocked = false;
let isDraggingLook = false;
let prevMouseX = 0, prevMouseY = 0;

// Sanal Joystick & Dokunmatik Durumu
const joyVec = { x: 0, y: 0 };
let lookTouchId = null;
let lastLookX = 0, lastLookY = 0;
let isTouchDiving = false;

const stats = { health: 100, hunger: 100, thirst: 100, oxygen: 100 };
const inventory = { plank: 6, plastic: 6, leaf: 4, scrap: 0, stone: 0, kelp: 0, potato: 1, fish: 1, cooked: 0, relic: 0 };
const storageInv = { plank: 0, plastic: 0, leaf: 0, scrap: 0, stone: 0, kelp: 0, potato: 0, fish: 0, cooked: 0, relic: 0 };
const upgrades = { hookTier: 1, spearTier: 1, axeTier: 1 };
const matchStats = { treesChopped: 0, sharksRepelled: 0, itemsHooked: 0 };

const navState = { sailOpen: false, anchored: false, rescueTimer: -1 };
let activeSlot = 1;

const player = {
    pos: new THREE.Vector3(0, 1.8, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    onGround: true,
    bobTimer: 0
};
const keys = {};

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const div = document.createElement('div');
    div.className = 'toast-msg';
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), 2600);
}

// --- GÖREV SİSTEMİ ---
const questState = { step: 0, chestsOpened: 0 };
const QUESTS = [
    {
        title: 'Bölüm 1: Yüzen Sığınak',
        check: () => ({ cur: Math.min(8, raftBlocks.size), max: 8, text: `Kanca veya ağlarla malzeme topla, salını 8 bloğa genişlet. (${Math.min(8, raftBlocks.size)}/8)` })
    },
    {
        title: 'Bölüm 2: Otomasyon & Tarım',
        check: () => {
            const hasPurifier = Array.from(raftBlocks.values()).some(b => b.structure === 'purifier');
            const hasNetOrGrill = Array.from(raftBlocks.values()).some(b => b.structure === 'grill' || b.structure === 'net' || b.structure === 'planter');
            const count = (hasPurifier ? 1 : 0) + (hasNetOrGrill ? 1 : 0);
            return { cur: count, max: 2, text: `Üretim menüsünden Su Arıtıcı ve Toplama Ağı/Izgara/Saksı kur. (${count}/2)` };
        }
    },
    {
        title: 'Bölüm 3: Ufka Yelken Aç',
        check: () => {
            const hasSail = Array.from(raftBlocks.values()).some(b => b.structure === 'sail');
            const val = hasSail ? (navState.sailOpen ? 2 : 1) : 0;
            return { cur: val, max: 2, text: `Yelken Direği inşa et ve yelkeni açarak adalara/enkazlara ilerle. (${val}/2)` };
        }
    },
    {
        title: 'Bölüm 4: Antik Kalıntılar',
        check: () => ({ cur: Math.min(3, inventory.relic), max: 3, text: `Adalardan ve batık gemilerden 3 Antik Kalıntı topla. (${Math.min(3, inventory.relic)}/3)` })
    },
    {
        title: 'Final: Kurtarma Sinyali',
        check: () => {
            const hasBeacon = Array.from(raftBlocks.values()).some(b => b.structure === 'beacon');
            return { cur: hasBeacon ? 1 : 0, max: 1, text: `Kurtarma Sinyali Vericisini inşa et ve çalıştır!` };
        }
    }
];

function updateQuestTracker() {
    const q = QUESTS[Math.min(questState.step, QUESTS.length - 1)];
    const res = q.check();
    document.getElementById('quest-name').textContent = q.title;
    document.getElementById('quest-desc').textContent = res.text;
    document.getElementById('quest-progress-fill').style.width = `${(res.cur / res.max) * 100}%`;

    if (res.cur >= res.max && questState.step < QUESTS.length - 1) {
        questState.step++;
        inventory.plank += 3;
        inventory.scrap += 1;
        audio.playPickup();
        showToast(`🎉 Görev Tamamlandı! +3 Kalas, +1 Hurda`);
    }
}

// --- SAL SİSTEMİ ---
const raftGroup = new THREE.Group();
scene.add(raftGroup);
const raftBlocks = new Map();

function setBlockMaterial(block, mat) {
    block.mesh.traverse(child => {
        if (child.isMesh && child.geometry.type === 'BoxGeometry') {
            child.material = mat;
        }
    });
}

function addRaftBlock(gx, gz, savedData = null) {
    const key = `${gx},${gz}`;
    if (raftBlocks.has(key)) return;

    const isArmored = savedData ? savedData.armored : false;
    const mesh = createRealisticRaftBlock(BLOCK_SIZE, materials, isArmored);
    mesh.position.set(gx * BLOCK_SIZE, 0, gz * BLOCK_SIZE);
    raftGroup.add(mesh);

    const block = {
        gx, gz, mesh,
        hp: savedData ? savedData.hp : (isArmored ? 250 : 100),
        armored: isArmored,
        structure: null,
        structMesh: null,
        timer: savedData ? savedData.timer : 0,
        ready: savedData ? savedData.ready : false,
        netLoot: savedData ? (savedData.netLoot || 0) : 0
    };
    raftBlocks.set(key, block);

    if (savedData && savedData.structure) {
        placeStructureOnBlock(block, savedData.structure, true);
    }
}

function initDefaultRaft() {
    raftGroup.clear();
    raftBlocks.clear();
    addRaftBlock(0, 0);
    addRaftBlock(1, 0);
    addRaftBlock(0, 1);
    addRaftBlock(1, 1);
}
initDefaultRaft();

const ghostBlock = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK_SIZE - 0.08, 0.25, BLOCK_SIZE - 0.08),
    new THREE.MeshBasicMaterial({ color: 0x2a9d8f, transparent: true, opacity: 0.45 })
);
ghostBlock.visible = false;
scene.add(ghostBlock);
let targetBuildCoords = null;

// --- ELDEKİ ALETLER ---
const handGroup = new THREE.Group();
camera.add(handGroup);
scene.add(camera);

let handHookModel = createHookModel(materials, false);
let thrownHookMesh = createHookModel(materials, false);
thrownHookMesh.scale.setScalar(1.35);
thrownHookMesh.visible = false;
thrownHookMesh.frustumCulled = false;
scene.add(thrownHookMesh);

function createHandTools() {
    const hookHolder = new THREE.Group();
    const ropeCoil = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16), materials.rope);
    ropeCoil.position.set(-0.08, -0.05, 0.05);
    handHookModel.scale.setScalar(0.85);
    hookHolder.add(ropeCoil, handHookModel);
    hookHolder.position.set(0.36, -0.28, -0.52);

    const hammer = new THREE.Group();
    const hamStick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45), materials.wood);
    const hamHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.28), materials.metal);
    hamHead.position.y = 0.2;
    hammer.add(hamStick, hamHead);
    hammer.position.set(0.35, -0.3, -0.5);
    hammer.visible = false;

    const spear = new THREE.Group();
    const sShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.35), materials.wood);
    sShaft.rotation.x = Math.PI / 2;
    const sTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), materials.metal);
    sTip.rotation.x = -Math.PI / 2;
    sTip.position.z = -0.72;
    spear.add(sShaft, sTip);
    spear.position.set(0.35, -0.25, -0.4);
    spear.visible = false;

    const rod = new THREE.Group();
    const rStick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 1.4), materials.wood);
    rStick.rotation.x = Math.PI / 3;
    rod.add(rStick);
    rod.position.set(0.35, -0.25, -0.55);
    rod.visible = false;

    const axe = new THREE.Group();
    const aStick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55), materials.wood);
    const aBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.24), materials.metal);
    aBlade.position.set(0, 0.2, -0.08);
    axe.add(aStick, aBlade);
    axe.position.set(0.35, -0.28, -0.5);
    axe.visible = false;

    handGroup.add(hookHolder, hammer, spear, rod, axe);
    return { 1: hookHolder, 2: hammer, 3: spear, 4: rod, 5: axe };
}
const tools = createHandTools();

function refreshTierVisuals() {
    if (upgrades.hookTier === 2) {
        document.getElementById('name-slot-1').textContent = 'M.Kanca';
        tools[1].remove(handHookModel);
        handHookModel = createHookModel(materials, true);
        handHookModel.scale.setScalar(0.85);
        tools[1].add(handHookModel);

        scene.remove(thrownHookMesh);
        thrownHookMesh = createHookModel(materials, true);
        thrownHookMesh.scale.setScalar(1.35);
        thrownHookMesh.visible = false;
        thrownHookMesh.frustumCulled = false;
        scene.add(thrownHookMesh);
    }
    if (upgrades.spearTier === 2) {
        document.getElementById('name-slot-3').textContent = 'Ç.Mızrak';
        tools[3].children[1].material = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9 });
    }
    if (upgrades.axeTier === 2) {
        document.getElementById('name-slot-5').textContent = 'D.Balta';
        tools[5].children[1].material = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9 });
    }
}

// --- HALAT & OLTA ---
const hookState = { status: 'idle', charge: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), caught: [] };
const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), materials.rope);
ropeMesh.visible = false;
ropeMesh.frustumCulled = false;
scene.add(ropeMesh);

function update3DRope(startPos, endPos) {
    const dist = startPos.distanceTo(endPos);
    if (dist < 0.05) { ropeMesh.visible = false; return; }
    ropeMesh.visible = true;
    ropeMesh.position.copy(startPos).lerp(endPos, 0.5);
    ropeMesh.scale.set(1, dist, 1);
    ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), endPos.clone().sub(startPos).normalize());
}

const fishingState = { active: false, timer: 0, biteReady: false };
const bobberMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
bobberMesh.visible = false;
scene.add(bobberMesh);

// --- KÖPEKBALIĞI ---
let { group: sharkGroup, tailPivot: sharkTail } = createDetailedShark(false);
scene.add(sharkGroup);
const shark = { state: 'circling', angle: 0, attackTimer: 22, targetKey: null, hits: 0, bitePlayerTimer: 0, isBoss: false };

// --- ÜRETİM TARİFLERİ ---
const RECIPES = [
    { id: 'net', tab: 'survival', name: '🕸️ Toplama Ağı', desc: 'Akıntıdan otomatik kalas ve plastik yakalar.', cost: { plank: 3, plastic: 3, leaf: 2 }, costText: '3 Kalas, 3 Plastik, 2 Yaprak' },
    { id: 'planter', tab: 'survival', name: '🌱 Tarım Saksısı', desc: 'Patates ekip hasat etmeni sağlar.', cost: { plank: 4, leaf: 2 }, costText: '4 Kalas, 2 Yaprak' },
    { id: 'purifier', tab: 'survival', name: '💧 Su Arıtıcı', desc: 'Deniz suyunu arıtır (+45 Susuzluk).', cost: { plank: 4, leaf: 4 }, costText: '4 Kalas, 4 Yaprak' },
    { id: 'grill', tab: 'survival', name: '🔥 Izgara Ocağı', desc: 'Balıkları pişirir (+55 Açlık, +12 Sağlık).', cost: { plank: 4, plastic: 2 }, costText: '4 Kalas, 2 Plastik' },
    { id: 'storage', tab: 'survival', name: '📦 Depo Sandığı', desc: 'Fazla kaynaklarını saklar.', cost: { plank: 4, scrap: 1 }, costText: '4 Kalas, 1 Hurda' },
    { id: 'lantern', tab: 'survival', name: '🏮 Gemi Feneri', desc: 'Gece salını aydınlatır.', cost: { plank: 2, scrap: 2 }, costText: '2 Kalas, 2 Hurda' },

    { id: 'stairs', tab: 'architecture', name: '🪜 2. Kat Merdiven', desc: 'Salın 2. kat sahanlığına çıkış sağlar.', cost: { plank: 6, scrap: 1 }, costText: '6 Kalas, 1 Hurda' },
    { id: 'wall', tab: 'architecture', name: '🧱 Duvar & Çatı', desc: 'Barınak duvarı ve üst kat çatısı.', cost: { plank: 5, plastic: 2 }, costText: '5 Kalas, 2 Plastik' },
    { id: 'armor', tab: 'architecture', name: '🛡️ Metal Zırh', desc: 'Bloğu köpekbalığına karşı zırhlar.', cost: { scrap: 3, plank: 2 }, costText: '3 Hurda, 2 Kalas' },
    { id: 'repair', tab: 'architecture', name: '🩹 Sal Onarımı', desc: 'Hasarlı bloğu tamir eder.', cost: { plank: 2, plastic: 1 }, costText: '2 Kalas, 1 Plastik' },

    { id: 'up_hook', tab: 'tools', name: '🪝 Metal Kanca (T2)', desc: 'Daha uzağa fırlatılır ve hızlı çekilir.', cost: { scrap: 3, kelp: 2, plank: 2 }, costText: '3 Hurda, 2 Yosun, 2 Kalas' },
    { id: 'up_spear', tab: 'tools', name: '🔱 Çelik Mızrak (T2)', desc: '2x hasar verir.', cost: { scrap: 4, stone: 2 }, costText: '4 Hurda, 2 Taş' },
    { id: 'up_axe', tab: 'tools', name: '🪓 Demir Balta (T2)', desc: 'Ağaç ve mercanları hızlı keser.', cost: { scrap: 3, stone: 3 }, costText: '3 Hurda, 3 Taş' },

    { id: 'sail', tab: 'navigation', name: '⛵ Yelken Direği', desc: 'Adalara ve gemi enkazlarına ilerletir.', cost: { plank: 6, leaf: 6, plastic: 4 }, costText: '6 Kalas, 6 Yaprak, 4 Plastik' },
    { id: 'anchor', tab: 'navigation', name: '⚓ Demir Çapa', desc: 'Salını sabitler.', cost: { plank: 4, stone: 4, scrap: 2 }, costText: '4 Kalas, 4 Taş, 2 Hurda' },
    { id: 'beacon', tab: 'navigation', name: '📡 Kurtarma Vericisi', desc: 'Kurtarma gemisini çağırıp oyunu bitirir!', cost: { relic: 3, scrap: 5, plank: 6 }, costText: '3 Kalıntı, 5 Hurda, 6 Kalas' }
];

function renderCraftMenu() {
    const listEl = document.getElementById('craft-list');
    listEl.innerHTML = '';
    RECIPES.filter(r => r.tab === activeCraftTab).forEach(recipe => {
        let owned = (recipe.id === 'up_hook' && upgrades.hookTier === 2) ||
                    (recipe.id === 'up_spear' && upgrades.spearTier === 2) ||
                    (recipe.id === 'up_axe' && upgrades.axeTier === 2);

        const canAfford = !owned && Object.entries(recipe.cost).every(([k, v]) => inventory[k] >= v);
        const card = document.createElement('div');
        card.className = 'craft-card';
        card.innerHTML = `
            <div class="craft-card-info">
                <h4>${recipe.name}</h4>
                <p>${recipe.desc}</p>
                <p style="color:#f4a261; margin-top:2px;">${owned ? '✅ Aktif' : 'Maliyet: ' + recipe.costText}</p>
            </div>
            <button class="craft-action-btn" ${canAfford ? '' : 'disabled'}>${owned ? 'Aktif' : 'Üret'}</button>
        `;
        card.querySelector('button').addEventListener('click', () => handleCraft(recipe));
        listEl.appendChild(card);
    });
}

function handleCraft(recipe) {
    if (recipe.id === 'up_hook') {
        payCost(recipe.cost); upgrades.hookTier = 2; refreshTierVisuals(); audio.playBuild();
        showToast('🪝 Metal Kanca üretildi!'); toggleCraftMenu(); return;
    }
    if (recipe.id === 'up_spear') {
        payCost(recipe.cost); upgrades.spearTier = 2; refreshTierVisuals(); audio.playBuild();
        showToast('🔱 Çelik Mızrak üretildi!'); toggleCraftMenu(); return;
    }
    if (recipe.id === 'up_axe') {
        payCost(recipe.cost); upgrades.axeTier = 2; refreshTierVisuals(); audio.playBuild();
        showToast('🪓 Demir Balta üretildi!'); toggleCraftMenu(); return;
    }

    const gx = Math.round(player.pos.x / BLOCK_SIZE);
    const gz = Math.round(player.pos.z / BLOCK_SIZE);
    const block = raftBlocks.get(`${gx},${gz}`);

    if (recipe.id === 'repair') {
        const damaged = Array.from(raftBlocks.values()).find(b => b.hp < (b.armored ? 250 : 100));
        if (!damaged) { showToast('Hasarlı blok yok!'); return; }
        payCost(recipe.cost);
        damaged.hp = damaged.armored ? 250 : 100;
        setBlockMaterial(damaged, damaged.armored ? materials.metal : materials.wood);
        audio.playBuild(); showToast('Sal onarıldı!'); toggleCraftMenu(); return;
    }

    if (!block) { showToast('Salın üzerinde durmalısın!'); return; }

    if (recipe.id === 'armor') {
        if (block.armored) { showToast('Zaten zırhlı!'); return; }
        payCost(recipe.cost); block.armored = true; block.hp = 250;
        setBlockMaterial(block, materials.metal);
        audio.playBuild(); showToast('Metal zırh eklendi!'); toggleCraftMenu(); return;
    }

    if (block.structure) { showToast('Burada zaten yapı var!'); return; }
    payCost(recipe.cost);
    placeStructureOnBlock(block, recipe.id, false);
    audio.playBuild(); showToast(`${recipe.name} kuruldu!`); toggleCraftMenu();
}

function payCost(cost) {
    Object.entries(cost).forEach(([k, v]) => { inventory[k] -= v; });
    updateUI();
}

function placeStructureOnBlock(block, type, silent) {
    const mesh = createStructureMesh(type, materials, BLOCK_SIZE);
    if (mesh) {
        mesh.position.set(block.gx * BLOCK_SIZE, 0.14, block.gz * BLOCK_SIZE);
        mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        raftGroup.add(mesh);
        block.structure = type;
        block.structMesh = mesh;
        if (type === 'purifier' && !silent) block.timer = 10;
    }
}

function deconstructCurrent() {
    if (activeSlot !== 2) return;
    const gx = Math.round(player.pos.x / BLOCK_SIZE);
    const gz = Math.round(player.pos.z / BLOCK_SIZE);
    const block = raftBlocks.get(`${gx},${gz}`);
    if (!block) return;

    if (block.structure) {
        raftGroup.remove(block.structMesh);
        block.structure = null; block.structMesh = null; block.timer = 0; block.ready = false;
        inventory.plank += 2; inventory.plastic += 1;
        audio.playBuild(); showToast('Yapı söküldü (+2 Kalas, +1 Plastik)'); updateUI();
    } else if (raftBlocks.size > 1) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const tx = Math.round((player.pos.x + dir.x * 2.2) / BLOCK_SIZE);
        const tz = Math.round((player.pos.z + dir.z * 2.2) / BLOCK_SIZE);
        const tBlock = raftBlocks.get(`${tx},${tz}`);
        if (tBlock && !tBlock.structure && (tx !== gx || tz !== gz)) {
            raftGroup.remove(tBlock.mesh);
            raftBlocks.delete(`${tx},${tz}`);
            inventory.plank += 1; inventory.plastic += 1;
            particles.spawnWaterSplash(new THREE.Vector3(tx * BLOCK_SIZE, 0, tz * BLOCK_SIZE), 8);
            audio.playBuild(); showToast('Blok söküldü (+1 Kalas, +1 Plastik)'); updateUI();
        }
    }
}

const ITEM_LABELS = {
    plank: '🪵 Kalas', plastic: '🧴 Plastik', leaf: '🌿 Yaprak',
    scrap: '⚙️ Hurda', stone: '🪨 Taş', kelp: '🪸 Yosun',
    potato: '🥔 Patates', fish: '🐟 Balık', cooked: '🍣 Yemek', relic: '🏺 Kalıntı'
};

function renderStorageModal() {
    const list = document.getElementById('storage-list');
    list.innerHTML = '';
    Object.keys(ITEM_LABELS).forEach(key => {
        const row = document.createElement('div');
        row.className = 'craft-card';
        row.innerHTML = `
            <div class="craft-card-info">
                <h4>${ITEM_LABELS[key]}</h4>
                <p>Çanta: <strong>${inventory[key]}</strong> | Sandık: <strong>${storageInv[key]}</strong></p>
            </div>
            <div style="display:flex; gap:6px;">
                <button class="craft-action-btn" data-act="store" ${inventory[key] > 0 ? '' : 'disabled'}>Koy</button>
                <button class="craft-action-btn" data-act="take" ${storageInv[key] > 0 ? '' : 'disabled'}>Al</button>
            </div>
        `;
        row.querySelector('[data-act="store"]').addEventListener('click', () => {
            if (inventory[key] > 0) { inventory[key]--; storageInv[key]++; audio.playPickup(); renderStorageModal(); updateUI(); }
        });
        row.querySelector('[data-act="take"]').addEventListener('click', () => {
            if (storageInv[key] > 0) { storageInv[key]--; inventory[key]++; audio.playPickup(); renderStorageModal(); updateUI(); }
        });
        list.appendChild(row);
    });
}

function toggleStorageModal() {
    isStorageOpen = !isStorageOpen;
    document.getElementById('storage-modal').style.display = isStorageOpen ? 'block' : 'none';
    if (isStorageOpen) { renderStorageModal(); if (document.pointerLockElement) document.exitPointerLock(); }
    else if (!isMobileDevice) requestLockSafe();
}

function selectSlot(slotNum) {
    activeSlot = slotNum;
    document.querySelectorAll('.hotbar-slot[data-slot]').forEach(el => {
        el.classList.toggle('active', Number(el.dataset.slot) === slotNum);
    });
    Object.entries(tools).forEach(([k, mesh]) => {
        mesh.visible = (Number(k) === slotNum);
    });
    if (slotNum !== 4 && fishingState.active) {
        fishingState.active = false; bobberMesh.visible = false; ropeMesh.visible = false;
    }
    ghostBlock.visible = false;
}

function handlePrimaryDown() {
    if (activeSlot === 1 && hookState.status === 'idle') {
        hookState.status = 'charging';
        hookState.charge = 0.25;
        document.getElementById('charge-bar-wrap').style.display = 'block';
    } else if (activeSlot === 2 && targetBuildCoords) {
        if (inventory.plank >= 2 && inventory.plastic >= 2) {
            inventory.plank -= 2; inventory.plastic -= 2;
            addRaftBlock(targetBuildCoords.gx, targetBuildCoords.gz);
            particles.spawnWaterSplash(new THREE.Vector3(targetBuildCoords.gx * BLOCK_SIZE, 0, targetBuildCoords.gz * BLOCK_SIZE), 8);
            audio.playBuild(); updateUI();
        }
    } else if (activeSlot === 3) {
        tools[3].position.z = -0.85;
        setTimeout(() => { tools[3].position.z = -0.4; }, 150);

        if (shark.state === 'attacking' && player.pos.distanceTo(sharkGroup.position) < 5.5) {
            shark.hits += (upgrades.spearTier === 2 ? 2 : 1);
            particles.spawnWaterSplash(sharkGroup.position, 10);
            audio.playBuild();
            if (shark.hits >= (shark.isBoss ? 4 : 3)) {
                shark.state = 'circling'; shark.attackTimer = 28; shark.hits = 0; shark.targetKey = null;
                matchStats.sharksRepelled++; audio.setCombatMode(false);
                document.getElementById('danger-alert').style.display = 'none';
                showToast('Köpekbalığı uzaklaştırıldı!');
            }
        }
        world.seagulls.forEach(g => {
            if (g.stealingBlock && player.pos.distanceTo(g.group.position) < 4.5) {
                g.stealingBlock = null; audio.playThrow(); showToast('🦅 Martı korkutuldu!');
            }
        });
    } else if (activeSlot === 4) {
        if (!fishingState.active) {
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const castPos = player.pos.clone().addScaledVector(dir, 5.5);
            castPos.y = 0.05;
            const gx = Math.round(castPos.x / BLOCK_SIZE);
            const gz = Math.round(castPos.z / BLOCK_SIZE);
            if (!raftBlocks.has(`${gx},${gz}`)) {
                fishingState.active = true; fishingState.biteReady = false;
                fishingState.timer = 4 + Math.random() * 5;
                bobberMesh.position.copy(castPos); bobberMesh.visible = true;
                particles.spawnWaterSplash(castPos, 10); audio.playSplash();
                showToast('Olta atıldı...');
            }
        } else {
            if (fishingState.biteReady) {
                inventory.fish++; particles.spawnWaterSplash(bobberMesh.position, 12);
                audio.playPickup(); showToast('🐟 Balık tutuldu! (+1 Balık)'); updateUI();
            }
            fishingState.active = false; bobberMesh.visible = false; ropeMesh.visible = false;
        }
    } else if (activeSlot === 5) {
        tools[5].rotation.x = 0.85;
        setTimeout(() => { tools[5].rotation.x = 0; }, 160);
        for (let i = world.islandNodes.length - 1; i >= 0; i--) {
            const node = world.islandNodes[i];
            const worldPos = new THREE.Vector3();
            node.mesh.getWorldPosition(worldPos);
            if (player.pos.distanceTo(worldPos) < 4.8) {
                node.hp -= (upgrades.axeTier === 2 ? 3 : 1);
                particles.spawnDebris(worldPos.clone().add(new THREE.Vector3(0, 1.0, 0)), node.type === 'tree' ? 0x8c5828 : (node.type === 'coral' ? 0xff4d6d : 0x6c757d), 9);
                audio.playBuild();
                if (node.hp <= 0) {
                    if (node.type === 'tree') {
                        inventory.plank += 5; inventory.leaf += 4; inventory.potato += 1; matchStats.treesChopped++;
                        showToast('🌴 +5 Kalas, +4 Yaprak, +1 Patates');
                    } else if (node.type === 'coral') {
                        inventory.kelp += 3; inventory.scrap += 1;
                        showToast('🪸 +3 Yosun, +1 Hurda');
                    } else {
                        inventory.stone += 3; inventory.scrap += 2;
                        showToast('🪨 +3 Taş, +2 Hurda');
                    }
                    node.parentIsland.remove(node.mesh);
                    world.islandNodes.splice(i, 1);
                    updateUI();
                }
                break;
            }
        }
    }
}

function handlePrimaryUp() {
    if (hookState.status === 'charging') {
        document.getElementById('charge-bar-wrap').style.display = 'none';
        hookState.status = 'flying';
        handHookModel.visible = false;

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const startHand = new THREE.Vector3(0.32, -0.22, -0.6).applyMatrix4(camera.matrixWorld);
        hookState.pos.copy(startHand);
        const powerMult = upgrades.hookTier === 2 ? 1.35 : 1.0;
        hookState.vel.copy(dir).multiplyScalar((15 + hookState.charge * 22) * powerMult);
        hookState.vel.y += 3.8;

        thrownHookMesh.position.copy(hookState.pos);
        thrownHookMesh.lookAt(hookState.pos.clone().add(dir));
        thrownHookMesh.visible = true;
        audio.playThrow();
    }
}

function handleInteract() {
    for (const c of world.chests) {
        if (c.opened) continue;
        const cPos = new THREE.Vector3();
        c.mesh.getWorldPosition(cPos);
        if (player.pos.distanceTo(cPos) < 3.8) {
            c.opened = true; c.lid.rotation.x = -0.8;
            particles.spawnDebris(cPos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffd166, 12);
            inventory.scrap += 4; inventory.cooked += 2; inventory.potato += 2; inventory.relic += 1;
            questState.chestsOpened++;
            audio.playPickup(); showToast('💰 Sandık Açıldı! +1 Antik Kalıntı'); updateUI(); return;
        }
    }

    const gx = Math.round(player.pos.x / BLOCK_SIZE);
    const gz = Math.round(player.pos.z / BLOCK_SIZE);
    const block = raftBlocks.get(`${gx},${gz}`);
    if (!block || !block.structure) return;

    const statusObj = block.structMesh?.userData?.statusMesh;

    if (block.structure === 'net' && block.netLoot > 0) {
        inventory.plank += block.netLoot; inventory.plastic += block.netLoot;
        block.netLoot = 0; if (statusObj) statusObj.visible = false;
        audio.playPickup(); showToast('🕸️ Ağdaki malzemeler alındı!');
    } else if (block.structure === 'planter') {
        if (block.ready) {
            inventory.cooked += 2; inventory.potato += 1; block.ready = false; block.timer = 0;
            if (statusObj) statusObj.visible = false;
            audio.playPickup(); showToast('🥔 Patates hasat edildi!');
        } else if (block.timer === 0 && inventory.potato > 0) {
            inventory.potato--; block.timer = 14;
            if (statusObj) { statusObj.visible = true; statusObj.scale.setScalar(0.4); }
            audio.playBuild(); showToast('🌱 Patates ekildi!');
        }
    } else if (block.structure === 'purifier' && block.ready) {
        stats.thirst = Math.min(100, stats.thirst + 45);
        block.ready = false; block.timer = 12;
        if (statusObj) statusObj.material.color.setHex(0x48cae4);
        audio.playPickup(); showToast('💧 +45 Susuzluk');
    } else if (block.structure === 'grill') {
        if (block.ready) {
            inventory.cooked++; block.ready = false; block.timer = 0;
            if (statusObj) statusObj.material.color.setHex(0xe63946);
            audio.playPickup(); showToast('🍣 Balık pişti!');
        } else if (block.timer === 0 && inventory.fish > 0) {
            inventory.fish--; block.timer = 7;
            if (statusObj) statusObj.material.color.setHex(0xf4a261);
            showToast('🔥 Balık ızgarada...');
        }
    } else if (block.structure === 'storage') {
        toggleStorageModal();
    } else if (block.structure === 'sail') {
        navState.sailOpen = !navState.sailOpen;
        if (navState.sailOpen) navState.anchored = false;
        audio.playBuild(); showToast(navState.sailOpen ? '⛵ Yelken açık!' : '⛵ Yelken kapalı.');
    } else if (block.structure === 'anchor') {
        navState.anchored = !navState.anchored;
        if (navState.anchored) navState.sailOpen = false;
        particles.spawnWaterSplash(new THREE.Vector3(gx * BLOCK_SIZE, 0, gz * BLOCK_SIZE), 10);
        audio.playBuild(); showToast(navState.anchored ? '⚓ Çapa atıldı!' : '⚓ Çapa çekildi!');
    } else if (block.structure === 'beacon' && navState.rescueTimer < 0) {
        navState.rescueTimer = 15; world.summonRescueShip();
        audio.playPickup(); showToast('📡 Kurtarma gemisi geliyor!');
    }
    updateUI();
}

function eatCookedFish() {
    if (inventory.cooked > 0) {
        inventory.cooked--;
        stats.hunger = Math.min(100, stats.hunger + 55);
        stats.health = Math.min(100, stats.health + 12);
        audio.playPickup(); showToast('🍣 +55 Açlık, +12 Sağlık'); updateUI();
    } else {
        showToast('Hazır yemek yok!');
    }
}

function triggerEndScreen(isVictory) {
    isPlaying = false; audio.setCombatMode(false);
    if (document.pointerLockElement) document.exitPointerLock();

    const statsBox = document.getElementById('endgame-stats');
    statsBox.style.display = 'block';
    statsBox.innerHTML = `<strong>Gün:</strong> ${world.day} | <strong>Sal:</strong> ${raftBlocks.size} Blok | <strong>Savuşturulan:</strong> ${matchStats.sharksRepelled}`;

    document.getElementById('controls-help').style.display = 'none';
    document.getElementById('menu-badge').textContent = isVictory ? '🏆 ZAFER!' : '💀 SON';
    document.getElementById('menu-title').textContent = isVictory ? 'KURTULDUN!' : 'YENİLDİN';
    document.getElementById('menu-subtitle').textContent = isVictory ? 'Kurtarma gemisi seni aldı!' : 'Okyanusta hayatta kalamadın.';
    document.getElementById('btn-new-game').textContent = 'YENİDEN OYNA';
    document.getElementById('main-menu').style.display = 'flex';
}

function saveGame() {
    const blocksData = [];
    raftBlocks.forEach(b => {
        blocksData.push({ gx: b.gx, gz: b.gz, hp: b.hp, armored: b.armored, structure: b.structure, timer: b.timer, ready: b.ready, netLoot: b.netLoot });
    });
    localStorage.setItem('stranded_tide_mobile_save', JSON.stringify({
        stats, inventory, storageInv, upgrades, matchStats, navState, questState,
        day: world.day, timeOfDay: world.timeOfDay,
        playerPos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        blocks: blocksData
    }));
    audio.playPickup(); showToast('💾 Kaydedildi!');
}

function loadGame() {
    const raw = localStorage.getItem('stranded_tide_mobile_save');
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(stats, data.stats);
    Object.assign(inventory, data.inventory);
    if (data.storageInv) Object.assign(storageInv, data.storageInv);
    if (data.upgrades) { Object.assign(upgrades, data.upgrades); refreshTierVisuals(); }
    if (data.matchStats) Object.assign(matchStats, data.matchStats);
    Object.assign(navState, data.navState);
    if (data.questState) Object.assign(questState, data.questState);
    world.day = data.day || 1; world.timeOfDay = data.timeOfDay || 8.5;
    player.pos.set(data.playerPos.x, data.playerPos.y, data.playerPos.z);

    raftGroup.clear(); raftBlocks.clear();
    data.blocks.forEach(b => addRaftBlock(b.gx, b.gz, b));
    updateUI(); return true;
}

if (localStorage.getItem('stranded_tide_mobile_save')) {
    document.getElementById('btn-load-game').style.display = 'inline-block';
}

function updateUI() {
    document.getElementById('weather-icon').textContent = world.weather === 'storm' ? '⛈️' : '☀️';
    document.getElementById('weather-text').textContent = world.weather === 'storm' ? 'Fırtına' : 'Açık';
    document.getElementById('day-counter').textContent = `Gün ${world.day}`;
    document.getElementById('time-display').textContent = world.getFormattedTime();
    document.getElementById('anchor-status-text').textContent = navState.anchored ? 'ÇAPA' : (navState.sailOpen ? 'YELKEN' : 'SERBEST');

    const dist = world.getNearestIslandDist(player.pos);
    document.getElementById('island-dist-text').textContent = dist !== null ? `${dist}m` : '--';

    document.getElementById('val-health').textContent = `${Math.ceil(stats.health)}%`;
    document.getElementById('val-hunger').textContent = `${Math.ceil(stats.hunger)}%`;
    document.getElementById('val-thirst').textContent = `${Math.ceil(stats.thirst)}%`;
    document.getElementById('val-oxygen').textContent = `${Math.ceil(stats.oxygen)}%`;

    document.getElementById('fill-health').style.width = `${Math.max(0, stats.health)}%`;
    document.getElementById('fill-hunger').style.width = `${Math.max(0, stats.hunger)}%`;
    document.getElementById('fill-thirst').style.width = `${Math.max(0, stats.thirst)}%`;
    document.getElementById('fill-oxygen').style.width = `${Math.max(0, stats.oxygen)}%`;

    document.getElementById('res-plank').textContent = inventory.plank;
    document.getElementById('res-plastic').textContent = inventory.plastic;
    document.getElementById('res-leaf').textContent = inventory.leaf;
    document.getElementById('res-scrap').textContent = inventory.scrap;
    document.getElementById('res-stone').textContent = inventory.stone;
    document.getElementById('res-kelp').textContent = inventory.kelp;
    document.getElementById('res-potato').textContent = inventory.potato;
    document.getElementById('res-fish').textContent = inventory.fish;
    document.getElementById('res-cooked').textContent = inventory.cooked;
    document.getElementById('res-relic').textContent = inventory.relic;

    updateQuestTracker();
}

function toggleCraftMenu() {
    if (isPaused || isStorageOpen) return;
    isCraftOpen = !isCraftOpen;
    document.getElementById('craft-modal').style.display = isCraftOpen ? 'block' : 'none';
    if (isCraftOpen) { renderCraftMenu(); if (document.pointerLockElement) document.exitPointerLock(); }
    else if (!isMobileDevice) requestLockSafe();
}

function togglePauseMenu() {
    if (isCraftOpen || isStorageOpen) return;
    isPaused = !isPaused;
    document.getElementById('pause-modal').style.display = isPaused ? 'block' : 'none';
    if (isPaused && document.pointerLockElement) document.exitPointerLock();
    else if (!isPaused && !isMobileDevice) requestLockSafe();
}

function requestLockSafe() {
    if (isMobileDevice) return;
    try {
        if (canvas.requestPointerLock) {
            const p = canvas.requestPointerLock();
            if (p && p.catch) p.catch(() => {});
        }
    } catch (e) {}
}

// --- DOKUNMATİK JOYSTICK & BAKIS KONTROLLERİ ---
const joyZone = document.getElementById('joystick-zone');
const joyThumb = document.getElementById('joystick-thumb');
const maxJoyRadius = 36;
let joyTouchId = null;
let joyCenter = { x: 0, y: 0 };

joyZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joyZone.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}, { passive: false });

joyZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) {
            let dx = t.clientX - joyCenter.x;
            let dy = t.clientY - joyCenter.y;
            const dist = Math.hypot(dx, dy);
            if (dist > maxJoyRadius) {
                dx = (dx / dist) * maxJoyRadius;
                dy = (dy / dist) * maxJoyRadius;
            }
            joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;
            joyVec.x = dx / maxJoyRadius;
            joyVec.y = dy / maxJoyRadius;
        }
    }
}, { passive: false });

const resetJoystick = (e) => {
    for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) {
            joyTouchId = null;
            joyVec.x = 0;
            joyVec.y = 0;
            joyThumb.style.transform = 'translate(0px, 0px)';
        }
    }
};
joyZone.addEventListener('touchend', resetJoystick);
joyZone.addEventListener('touchcancel', resetJoystick);

const lookZone = document.getElementById('look-zone');
lookZone.addEventListener('touchstart', (e) => {
    if (!isPlaying || isCraftOpen || isPaused || isStorageOpen) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLookX = t.clientX;
    lastLookY = t.clientY;
}, { passive: false });

lookZone.addEventListener('touchmove', (e) => {
    if (!isPlaying || isCraftOpen || isPaused || isStorageOpen) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
        if (t.identifier === lookTouchId) {
            const dx = t.clientX - lastLookX;
            const dy = t.clientY - lastLookY;
            lastLookX = t.clientX;
            lastLookY = t.clientY;
            const sens = 0.0055 * mouseSensitivity;
            player.yaw -= dx * sens;
            player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - dy * sens));
        }
    }
}, { passive: false });

const endLookTouch = (e) => {
    for (const t of e.changedTouches) {
        if (t.identifier === lookTouchId) lookTouchId = null;
    }
};
lookZone.addEventListener('touchend', endLookTouch);
lookZone.addEventListener('touchcancel', endLookTouch);

// Dokunmatik Aksiyon Butonları
const touchPrimary = document.getElementById('touch-primary');
touchPrimary.addEventListener('touchstart', (e) => { e.preventDefault(); if (isPlaying) handlePrimaryDown(); }, { passive: false });
touchPrimary.addEventListener('touchend', (e) => { e.preventDefault(); if (isPlaying) handlePrimaryUp(); }, { passive: false });

document.getElementById('touch-interact').addEventListener('touchstart', (e) => { e.preventDefault(); if (isPlaying) handleInteract(); }, { passive: false });
document.getElementById('touch-jump').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isPlaying && player.onGround) { player.vel.y = 6.8; player.onGround = false; }
}, { passive: false });
document.getElementById('touch-deconstruct').addEventListener('touchstart', (e) => { e.preventDefault(); if (isPlaying) deconstructCurrent(); }, { passive: false });

const diveBtn = document.getElementById('touch-dive');
diveBtn.addEventListener('touchstart', (e) => { e.preventDefault(); isTouchDiving = true; }, { passive: false });
diveBtn.addEventListener('touchend', (e) => { e.preventDefault(); isTouchDiving = false; }, { passive: false });

// --- MENÜ & KLAVYE/FARE EVENTLERİ ---
document.getElementById('btn-new-game').addEventListener('click', () => {
    audio.init();
    if (stats.health <= 0 || navState.rescueTimer === 0) location.reload();
    document.getElementById('main-menu').style.display = 'none';
    isPlaying = true;
    requestLockSafe();
});

document.getElementById('btn-load-game').addEventListener('click', () => {
    audio.init();
    if (loadGame()) {
        document.getElementById('main-menu').style.display = 'none';
        isPlaying = true;
        requestLockSafe();
        showToast('Kayıt yüklendi!');
    }
});

document.getElementById('btn-save-game').addEventListener('click', saveGame);
document.getElementById('btn-save-modal').addEventListener('click', saveGame);
document.getElementById('btn-pause-menu').addEventListener('click', togglePauseMenu);
document.getElementById('btn-resume-game').addEventListener('click', togglePauseMenu);
document.getElementById('btn-resume-big').addEventListener('click', togglePauseMenu);

document.getElementById('sens-slider').addEventListener('input', (e) => {
    mouseSensitivity = parseFloat(e.target.value);
    document.getElementById('sens-val').textContent = `${mouseSensitivity.toFixed(1)}x`;
});

document.getElementById('btn-toggle-sound-modal').addEventListener('click', (e) => {
    const muted = audio.toggleMute();
    e.target.textContent = muted ? '🔇 Kapalı' : '🔊 Açık';
});

document.getElementById('btn-toggle-craft').addEventListener('click', toggleCraftMenu);
document.getElementById('btn-close-craft').addEventListener('click', toggleCraftMenu);
document.getElementById('btn-close-storage').addEventListener('click', toggleStorageModal);
document.getElementById('btn-eat-cooked').addEventListener('click', eatCookedFish);

document.querySelectorAll('.hotbar-slot[data-slot]').forEach(el => {
    el.addEventListener('click', () => selectSlot(Number(el.dataset.slot)));
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCraftTab = btn.dataset.tab;
        renderCraftMenu();
    });
});

document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
});

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (!isPlaying) return;
    if (e.code === 'KeyP') { togglePauseMenu(); return; }
    if (isPaused) return;
    if (e.code === 'Digit1') selectSlot(1);
    if (e.code === 'Digit2') selectSlot(2);
    if (e.code === 'Digit3') selectSlot(3);
    if (e.code === 'Digit4') selectSlot(4);
    if (e.code === 'Digit5') selectSlot(5);
    if (e.code === 'KeyC') toggleCraftMenu();
    if (e.code === 'KeyE') { if (isStorageOpen) toggleStorageModal(); else handleInteract(); }
    if (e.code === 'KeyX') deconstructCurrent();
    if (e.code === 'KeyF') eatCookedFish();
    if (e.code === 'Space' && player.onGround && !isCraftOpen && !isStorageOpen) {
        player.vel.y = 6.8; player.onGround = false;
    }
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('mousemove', (e) => {
    if (!isPlaying || isCraftOpen || isPaused || isStorageOpen || isMobileDevice) return;
    const sens = 0.0022 * mouseSensitivity;
    if (pointerLocked) {
        player.yaw -= e.movementX * sens;
        player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - e.movementY * sens));
    } else if (isDraggingLook) {
        player.yaw -= (e.clientX - prevMouseX) * sens * 1.8;
        player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - (e.clientY - prevMouseY) * sens * 1.8));
    }
    prevMouseX = e.clientX; prevMouseY = e.clientY;
});

window.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('mousedown', (e) => {
    if (!isPlaying || isCraftOpen || isPaused || isStorageOpen || isMobileDevice) return;
    if (!pointerLocked) requestLockSafe();
    if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
        isDraggingLook = true; prevMouseX = e.clientX; prevMouseY = e.clientY; return;
    }
    if (e.button === 0) handlePrimaryDown();
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 0) isDraggingLook = false;
    if (e.button === 0) handlePrimaryUp();
});

// --- OYUN DÖNGÜSÜ ---
const raycaster = new THREE.Raycaster();
const centerVec = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
let smokeTimer = 0;
let biteDebrisTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.getElapsedTime();

    const travelSpeed = navState.anchored ? 0 : (navState.sailOpen ? 4.8 : 0.4);
    const waveAmp = world.updateOcean(elapsed, dt);

    if (!isPlaying || isPaused) {
        renderer.render(scene, camera);
        return;
    }

    audio.updateMusic(dt);
    world.updateDayNightAndWeather(dt, player.pos);
    particles.update(dt);
    world.updateEntities(dt, elapsed, travelSpeed);

    raftGroup.position.y = Math.sin(elapsed * 2.1) * (waveAmp * 0.45);
    raftGroup.rotation.z = Math.cos(elapsed * 1.6) * (waveAmp * 0.08);
    sharkTail.rotation.y = Math.sin(elapsed * 7) * 0.35;

    if (world.day >= 3 && !shark.isBoss && shark.state === 'circling') {
        shark.isBoss = true;
        scene.remove(sharkGroup);
        const boss = createDetailedShark(true);
        sharkGroup = boss.group; sharkTail = boss.tailPivot;
        scene.add(sharkGroup);
        showToast('🦈 Dev Zırhlı Köpekbalığı belirdi!');
    }

    if (navState.rescueTimer > 0 && world.rescueShip) {
        navState.rescueTimer -= dt;
        world.rescueShip.position.z += 5.2 * dt;
        if (navState.rescueTimer <= 0) { navState.rescueTimer = 0; triggerEndScreen(true); return; }
    }

    // Otomatik Toplama Ağları
    raftBlocks.forEach(b => {
        if (b.structure === 'net') {
            const netWorld = new THREE.Vector3(b.gx * BLOCK_SIZE, 0, b.gz * BLOCK_SIZE);
            for (let i = world.floatingItems.length - 1; i >= 0; i--) {
                const item = world.floatingItems[i];
                if (item.mesh.position.distanceTo(netWorld) < 1.85) {
                    b.netLoot++;
                    const sObj = b.structMesh?.userData?.statusMesh;
                    if (sObj) sObj.visible = true;
                    scene.remove(item.mesh);
                    world.floatingItems.splice(i, 1);
                }
            }
        }
    });

    // Deniz Mayını
    for (let i = world.seaMines.length - 1; i >= 0; i--) {
        const mine = world.seaMines[i];
        const mgx = Math.round(mine.position.x / BLOCK_SIZE);
        const mgz = Math.round(mine.position.z / BLOCK_SIZE);
        const hitBlock = raftBlocks.get(`${mgx},${mgz}`);
        if (hitBlock) {
            particles.spawnWaterSplash(mine.position, 16);
            particles.spawnDebris(mine.position, 0xe63946, 12);
            audio.playThunder(); scene.remove(mine); world.seaMines.splice(i, 1);
            if (!hitBlock.armored && raftBlocks.size > 1) {
                raftGroup.remove(hitBlock.mesh);
                if (hitBlock.structMesh) raftGroup.remove(hitBlock.structMesh);
                raftBlocks.delete(`${mgx},${mgz}`);
            }
            showToast('💥 Mayın patladı!');
        }
    }

    // Martılar
    const cookingGrill = Array.from(raftBlocks.values()).find(b => b.structure === 'grill' && (b.timer > 0 || b.ready));
    world.seagulls.forEach((g, idx) => {
        if (idx === 0 && cookingGrill && !g.stealingBlock && Math.random() < dt * 0.08) {
            g.stealingBlock = cookingGrill;
            showToast('🦅 Martı balığa iniyor!');
        }
        if (g.stealingBlock) {
            const target = new THREE.Vector3(g.stealingBlock.gx * BLOCK_SIZE, 1.1, g.stealingBlock.gz * BLOCK_SIZE);
            const dir = new THREE.Vector3().subVectors(target, g.group.position);
            g.group.lookAt(target);
            if (dir.length() > 0.7) {
                g.group.position.addScaledVector(dir.normalize(), 4.2 * dt);
            } else {
                g.stealingBlock.timer = 0; g.stealingBlock.ready = false;
                const sObj = g.stealingBlock.structMesh?.userData?.statusMesh;
                if (sObj) sObj.material.color.setHex(0xe63946);
                g.stealingBlock = null;
            }
        } else {
            g.angle += dt * 0.45;
            g.group.position.set(Math.cos(g.angle) * g.radius, g.height + Math.sin(elapsed * 2 + g.angle) * 0.6, Math.sin(g.angle) * g.radius);
            g.group.lookAt(Math.cos(g.angle + 0.1) * g.radius, g.height, Math.sin(g.angle + 0.1) * g.radius);
        }
        const flap = Math.sin(elapsed * 9 + g.angle) * 0.45;
        g.lWing.rotation.z = flap; g.rWing.rotation.z = -flap;
    });

    // Açlık & Susuzluk & Sağlık
    stats.hunger = Math.max(0, stats.hunger - dt * 0.55);
    stats.thirst = Math.max(0, stats.thirst - dt * 0.8);
    const vignette = document.getElementById('damage-vignette');
    if (stats.hunger === 0 || stats.thirst === 0) {
        stats.health = Math.max(0, stats.health - dt * 2.5);
        vignette.classList.add('hurt');
    } else {
        vignette.classList.remove('hurt');
    }
    if (stats.health <= 0) { triggerEndScreen(false); return; }

    // Yapı Zamanlayıcıları
    smokeTimer += dt;
    const purifierMult = (world.weather === 'storm') ? 2.0 : 1.0;
    raftBlocks.forEach(b => {
        const statusObj = b.structMesh?.userData?.statusMesh;
        if (b.structure === 'purifier' && !b.ready) {
            b.timer -= dt * purifierMult;
            if (b.timer <= 0) { b.ready = true; if (statusObj) statusObj.material.color.setHex(0x2a9d8f); }
        } else if (b.structure === 'planter' && b.timer > 0 && !b.ready) {
            b.timer -= dt * purifierMult;
            if (statusObj) statusObj.scale.setScalar(0.4 + (1 - b.timer / 14) * 0.8);
            if (b.timer <= 0) b.ready = true;
        } else if (b.structure === 'grill' && b.timer > 0 && !b.ready) {
            b.timer -= dt;
            if (smokeTimer > 0.35) particles.spawnSmoke(new THREE.Vector3(b.gx * BLOCK_SIZE, 0.2, b.gz * BLOCK_SIZE));
            if (b.timer <= 0) { b.ready = true; if (statusObj) statusObj.material.color.setHex(0xffd166); }
        } else if (b.structure === 'beacon' && b.structMesh?.userData?.orb) {
            b.structMesh.userData.orb.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.25);
        }
    });
    if (smokeTimer > 0.35) smokeTimer = 0;

    // Etkileşim İpucu
    const promptEl = document.getElementById('interaction-prompt');
    let promptShown = false;
    for (const c of world.chests) {
        if (c.opened) continue;
        const cPos = new THREE.Vector3();
        c.mesh.getWorldPosition(cPos);
        if (player.pos.distanceTo(cPos) < 3.8) {
            promptEl.style.display = 'block'; promptEl.textContent = 'Sandığı Aç'; promptShown = true; break;
        }
    }
    if (!promptShown) {
        const pGx = Math.round(player.pos.x / BLOCK_SIZE);
        const pGz = Math.round(player.pos.z / BLOCK_SIZE);
        const curBlock = raftBlocks.get(`${pGx},${pGz}`);
        if (curBlock && curBlock.structure) {
            promptEl.style.display = 'block';
            if (curBlock.structure === 'net') promptEl.textContent = curBlock.netLoot > 0 ? `Ağı Topla (${curBlock.netLoot})` : 'Toplama Ağı';
            else if (curBlock.structure === 'planter') promptEl.textContent = curBlock.ready ? 'Hasat Et' : (curBlock.timer > 0 ? `Büyüyor (${Math.ceil(curBlock.timer)}s)` : 'Patates Ek');
            else if (curBlock.structure === 'purifier') promptEl.textContent = curBlock.ready ? 'Su İç' : `Arıtılıyor (${Math.ceil(curBlock.timer)}s)`;
            else if (curBlock.structure === 'grill') promptEl.textContent = curBlock.ready ? 'Balığı Al' : (curBlock.timer > 0 ? `Pişiyor (${Math.ceil(curBlock.timer)}s)` : 'Balık Koy');
            else if (curBlock.structure === 'storage') promptEl.textContent = 'Depoyu Aç';
            else if (curBlock.structure === 'sail') promptEl.textContent = navState.sailOpen ? 'Yelkeni Kapat' : 'Yelkeni Aç';
            else if (curBlock.structure === 'anchor') promptEl.textContent = navState.anchored ? 'Çapayı Çek' : 'Çapa At';
            else if (curBlock.structure === 'beacon') promptEl.textContent = navState.rescueTimer > 0 ? `Gemi (${Math.ceil(navState.rescueTimer)}s)` : 'Sinyal Gönder';
            else promptEl.style.display = 'none';
        } else {
            promptEl.style.display = 'none';
        }
    }

    // Hareket (Joystick + Klavye)
    let isMoving = false;
    if (!isCraftOpen && !isStorageOpen) {
        const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
        const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
        const move = new THREE.Vector3();

        let inX = joyVec.x;
        let inZ = -joyVec.y;
        if (keys['KeyW']) inZ += 1;
        if (keys['KeyS']) inZ -= 1;
        if (keys['KeyD']) inX += 1;
        if (keys['KeyA']) inX -= 1;

        if (Math.hypot(inX, inZ) > 0.05) {
            move.addScaledVector(forward, inZ).addScaledVector(right, inX);
            if (move.length() > 1) move.normalize();
            isMoving = true;
        }

        player.pos.x += move.x * 5.8 * dt;
        player.pos.z += move.z * 5.8 * dt;

        const pGx = Math.round(player.pos.x / BLOCK_SIZE);
        const pGz = Math.round(player.pos.z / BLOCK_SIZE);
        const curBlock = raftBlocks.get(`${pGx},${pGz}`);
        const onRaft = Boolean(curBlock);

        let onIsland = false;
        world.islands.forEach(isl => {
            if (Math.hypot(player.pos.x - isl.group.position.x, player.pos.z - isl.group.position.z) < isl.radius * 0.9) onIsland = true;
        });

        let onShipwreck = false;
        world.shipwrecks.forEach(sw => {
            if (Math.hypot(player.pos.x - sw.group.position.x, player.pos.z - sw.group.position.z) < 8.5) onShipwreck = true;
        });

        let secondFloorY = 1.78;
        if (curBlock && (curBlock.structure === 'stairs' || curBlock.structure === 'wall') && player.pos.y > 2.3) {
            secondFloorY = 4.45;
        } else if (curBlock && curBlock.structure === 'stairs') {
            secondFloorY = 1.78 + Math.max(0, Math.min(2.67, (1.2 - (player.pos.z - curBlock.gz * BLOCK_SIZE)) * 1.2));
        }

        const inWater = (!onRaft && !onIsland && !onShipwreck);
        const isDiving = inWater && (keys['KeyQ'] || keys['ShiftLeft'] || isTouchDiving);

        if (isDiving) {
            player.pos.y = Math.max(-1.4, player.pos.y - 3.5 * dt);
            stats.oxygen = Math.max(0, stats.oxygen - dt * 14);
            document.getElementById('oxygen-row').style.display = 'flex';
            if (stats.oxygen === 0) stats.health = Math.max(0, stats.health - dt * 8);
        } else {
            stats.oxygen = Math.min(100, stats.oxygen + dt * 25);
            if (stats.oxygen >= 100) document.getElementById('oxygen-row').style.display = 'none';
            player.vel.y -= 18 * dt;
            player.pos.y += player.vel.y * dt;
            const floorY = onShipwreck ? 4.8 : (onIsland ? 2.55 : (onRaft ? secondFloorY : 0.72));
            if (player.pos.y <= floorY) { player.pos.y = floorY; player.vel.y = 0; player.onGround = true; }
        }

        document.getElementById('underwater-tint').style.display = (inWater && player.pos.y < 0.85) ? 'block' : 'none';

        if (inWater) {
            shark.bitePlayerTimer += dt;
            if (shark.bitePlayerTimer > 2.4) {
                shark.bitePlayerTimer = 0; stats.health = Math.max(0, stats.health - 15);
                audio.playSharkBite(); vignette.classList.add('hurt');
                showToast('🦈 Suda köpekbalığı ısırdı!');
            }
        } else {
            shark.bitePlayerTimer = 0;
        }
    }

    if (isMoving && player.onGround) {
        player.bobTimer += dt * 11;
        camera.position.set(player.pos.x, player.pos.y + Math.sin(player.bobTimer) * 0.055, player.pos.z);
        handGroup.position.y = Math.cos(player.bobTimer) * 0.015;
    } else {
        camera.position.copy(player.pos);
        handGroup.position.y = 0;
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.updateMatrixWorld();

    // Kanca Fiziği
    if (hookState.status === 'charging') {
        hookState.charge = Math.min(1, hookState.charge + dt * 1.1);
        document.getElementById('charge-bar-fill').style.width = `${hookState.charge * 100}%`;
        tools[1].position.z = -0.35 + hookState.charge * 0.2;
    } else {
        tools[1].position.z = -0.52;
    }

    const maxRange = upgrades.hookTier === 2 ? 48 : 35;
    const reelSpeed = upgrades.hookTier === 2 ? 26 : 19;

    if (hookState.status === 'flying') {
        hookState.vel.y -= 14 * dt;
        hookState.pos.addScaledVector(hookState.vel, dt);
        thrownHookMesh.position.copy(hookState.pos);
        thrownHookMesh.rotation.z += 8 * dt;

        for (let i = world.floatingItems.length - 1; i >= 0; i--) {
            if (hookState.pos.distanceTo(world.floatingItems[i].mesh.position) < 1.55) {
                hookState.caught.push(world.floatingItems[i]);
                world.floatingItems.splice(i, 1);
            }
        }
        if (hookState.pos.y <= 0.05 || hookState.pos.distanceTo(player.pos) > maxRange) {
            if (hookState.pos.y <= 0.05) { audio.playSplash(); particles.spawnWaterSplash(hookState.pos, 12); }
            hookState.status = 'reeling';
        }
    } else if (hookState.status === 'reeling') {
        const toP = new THREE.Vector3().subVectors(player.pos, hookState.pos);
        if (toP.length() < 1.65) {
            hookState.caught.forEach(item => {
                matchStats.itemsHooked++;
                if (item.type === 'plank') inventory.plank += 2;
                else if (item.type === 'plastic') inventory.plastic += 2;
                else if (item.type === 'leaf') inventory.leaf += 2;
                else if (item.type === 'barrel') { inventory.plank += 3; inventory.plastic += 2; inventory.scrap += 1; inventory.fish += 1; }
                scene.remove(item.mesh);
            });
            if (hookState.caught.length > 0) audio.playPickup();
            hookState.caught = []; hookState.status = 'idle';
            thrownHookMesh.visible = false; ropeMesh.visible = false; handHookModel.visible = true;
        } else {
            toP.normalize();
            hookState.pos.addScaledVector(toP, reelSpeed * dt);
            thrownHookMesh.position.copy(hookState.pos);
            thrownHookMesh.lookAt(player.pos);
            hookState.caught.forEach((item, idx) => { item.mesh.position.copy(hookState.pos).add(new THREE.Vector3(0, -0.15 - idx * 0.1, 0)); });
        }
    }

    if (fishingState.active) {
        bobberMesh.position.y = Math.sin(elapsed * (fishingState.biteReady ? 18 : 3)) * 0.08;
        if (!fishingState.biteReady) {
            fishingState.timer -= dt;
            if (fishingState.timer <= 0) {
                fishingState.biteReady = true; particles.spawnWaterSplash(bobberMesh.position, 8);
                audio.playSplash(); showToast('🎣 Balık vurdu!');
            }
        }
    }

    if (hookState.status === 'flying' || hookState.status === 'reeling') {
        const handWorld = new THREE.Vector3(0.32, -0.26, -0.5).applyMatrix4(camera.matrixWorld);
        update3DRope(handWorld, thrownHookMesh.position);
    } else if (fishingState.active) {
        const handWorld = new THREE.Vector3(0.32, -0.22, -0.6).applyMatrix4(camera.matrixWorld);
        update3DRope(handWorld, bobberMesh.position);
    } else {
        ropeMesh.visible = false;
    }

    // İnşa Çekici
    if (activeSlot === 2 && !isCraftOpen && !isStorageOpen) {
        raycaster.setFromCamera(centerVec, camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
            const gx = Math.round(hit.x / BLOCK_SIZE);
            const gz = Math.round(hit.z / BLOCK_SIZE);
            const hasNeighbor = raftBlocks.has(`${gx+1},${gz}`) || raftBlocks.has(`${gx-1},${gz}`) ||
                                raftBlocks.has(`${gx},${gz+1}`) || raftBlocks.has(`${gx},${gz-1}`);
            if (!raftBlocks.has(`${gx},${gz}`) && hasNeighbor && player.pos.distanceTo(hit) < 7.5) {
                ghostBlock.position.set(gx * BLOCK_SIZE, 0.05, gz * BLOCK_SIZE);
                ghostBlock.visible = true;
                ghostBlock.material.color.setHex((inventory.plank >= 2 && inventory.plastic >= 2) ? 0x2a9d8f : 0xe63946);
                targetBuildCoords = { gx, gz };
            } else {
                ghostBlock.visible = false; targetBuildCoords = null;
            }
        }
    } else {
        ghostBlock.visible = false; targetBuildCoords = null;
    }

    // Köpekbalığı Yapay Zekası
    const alertEl = document.getElementById('danger-alert');
    if (shark.state === 'circling') {
        shark.angle += dt * (shark.isBoss ? 0.72 : 0.55);
        sharkGroup.position.set(Math.cos(shark.angle) * 14, -0.1, Math.sin(shark.angle) * 14);
        sharkGroup.lookAt(Math.cos(shark.angle + 0.1) * 14, -0.1, Math.sin(shark.angle + 0.1) * 14);
        shark.attackTimer -= dt;
        if (shark.attackTimer <= 0 && raftBlocks.size > 1) {
            const candidates = Array.from(raftBlocks.values()).filter(b => !b.armored);
            if (candidates.length > 0) {
                const chosen = candidates[Math.floor(Math.random() * candidates.length)];
                shark.targetKey = `${chosen.gx},${chosen.gz}`;
                shark.state = 'attacking';
                audio.playSharkBite(); audio.setCombatMode(true);
                alertEl.textContent = shark.isBoss ? '⚠️ DEV KÖPEKBALIĞI SALDIRIYOR!' : '⚠️ KÖPEKBALIĞI SALDIRIYOR!';
                alertEl.style.display = 'block';
            } else {
                shark.attackTimer = 25;
            }
        }
    } else if (shark.state === 'attacking') {
        const tb = raftBlocks.get(shark.targetKey);
        if (!tb) {
            shark.state = 'circling'; shark.attackTimer = 24; audio.setCombatMode(false); alertEl.style.display = 'none';
        } else {
            const tPos = new THREE.Vector3(tb.gx * BLOCK_SIZE, -0.1, tb.gz * BLOCK_SIZE);
            const dir = new THREE.Vector3().subVectors(tPos, sharkGroup.position);
            sharkGroup.lookAt(tPos);
            if (dir.length() > 1.75) {
                sharkGroup.position.addScaledVector(dir.normalize(), (shark.isBoss ? 6.8 : 5.8) * dt);
            } else {
                tb.hp -= dt * (shark.isBoss ? 15 : 11);
                setBlockMaterial(tb, materials.damagedWood);
                biteDebrisTimer += dt;
                if (biteDebrisTimer > 0.6) { biteDebrisTimer = 0; particles.spawnDebris(tPos.clone().add(new THREE.Vector3(0, 0.25, 0)), 0x7f4f24, 5); }
                if (tb.hp <= 0) {
                    particles.spawnWaterSplash(tPos, 14); raftGroup.remove(tb.mesh);
                    if (tb.structMesh) raftGroup.remove(tb.structMesh);
                    raftBlocks.delete(shark.targetKey);
                    audio.playSharkBite(); audio.setCombatMode(false);
                    shark.state = 'circling'; shark.attackTimer = 25; alertEl.style.display = 'none';
                }
            }
        }
    }

    updateUI();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

updateUI();
animate();