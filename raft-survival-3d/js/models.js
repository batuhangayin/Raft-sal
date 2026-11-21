export function createRealisticRaftBlock(blockSize, materials, isArmored = false) {
    const group = new THREE.Group();
    const mat = isArmored ? materials.metal : materials.wood;

    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(blockSize - 0.1, 0.16, 0.22), mat);
    beam1.position.set(0, -0.05, -blockSize * 0.32);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(blockSize - 0.1, 0.16, 0.22), mat);
    beam2.position.set(0, -0.05, blockSize * 0.32);
    group.add(beam1, beam2);

    const plankCount = 5;
    const plankW = (blockSize - 0.18) / plankCount;
    for (let i = 0; i < plankCount; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW - 0.04, 0.12, blockSize - 0.08), mat);
        const offsetX = -blockSize / 2 + plankW / 2 + 0.09 + i * plankW;
        plank.position.set(offsetX, 0.08, (i % 2 === 0 ? 0.02 : -0.02));
        plank.castShadow = true;
        plank.receiveShadow = true;
        group.add(plank);
    }

    const cornerOffsets = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    cornerOffsets.forEach(([cx, cz]) => {
        const knot = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 10), materials.rope);
        knot.rotation.x = Math.PI / 2;
        knot.position.set(cx * (blockSize * 0.42), 0.14, cz * (blockSize * 0.42));
        group.add(knot);
    });

    return group;
}

export function createHookModel(materials, isTier2 = false) {
    const hookGroup = new THREE.Group();
    const mat = isTier2 ? new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.15 }) : materials.metal;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), mat);
    ring.position.z = 0.22;

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.36, 10), mat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.04;

    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const arm = new THREE.Group();
        arm.rotation.z = angle;
        arm.position.z = -0.14;

        const curve = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 14, Math.PI * 1.15), mat);
        curve.rotation.y = Math.PI / 2;
        curve.position.y = 0.11;

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), mat);
        tip.position.set(0, 0.21, 0.04);
        tip.rotation.x = 0.6;

        arm.add(curve, tip);
        hookGroup.add(arm);
    }

    hookGroup.add(ring, shaft);
    return hookGroup;
}

export function createFloatingProp(type, materials) {
    const group = new THREE.Group();
    if (type === 'plank') {
        for (let i = -1; i <= 1; i++) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 1.45), materials.wood);
            p.position.set(i * 0.28, Math.abs(i) * 0.02, i * 0.06);
            p.rotation.y = i * 0.05;
            p.castShadow = true;
            group.add(p);
        }
        const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), materials.rope);
        tie.rotation.z = Math.PI / 2;
        tie.scale.set(0.25, 1, 1);
        group.add(tie);
    } else if (type === 'plastic') {
        const drumMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.35, metalness: 0.1 });
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.68, 12), drumMat);
        drum.rotation.z = Math.PI / 2.2;
        drum.castShadow = true;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
        cap.rotation.z = Math.PI / 2.2;
        cap.position.set(-0.35, 0.05, 0);
        group.add(drum, cap);
    } else if (type === 'leaf') {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 1.3, 6), materials.grass);
        stem.rotation.x = Math.PI / 2;
        group.add(stem);
        for (let s = -4; s <= 4; s++) {
            const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.08), materials.grass);
            bladeL.position.set(-0.16, 0.02, s * 0.13);
            bladeL.rotation.y = 0.35;
            const bladeR = bladeL.clone();
            bladeR.position.x = 0.16;
            bladeR.rotation.y = -0.35;
            group.add(bladeL, bladeR);
        }
    } else if (type === 'barrel') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.88, 14), materials.wood);
        body.rotation.x = 0.35;
        body.castShadow = true;
        group.add(body);
        [-0.26, 0.26].forEach(offset => {
            const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.06, 14), materials.metal);
            hoop.position.y = offset;
            hoop.rotation.x = 0.35;
            group.add(hoop);
        });
    }
    return group;
}

export function createDetailedShark(isBoss = false) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0x1b263b : 0x3b4252, roughness: 0.35 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0xe63946 : 0xe5e9f0, roughness: 0.5 });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 10), skinMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.1;

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 1.45, 10), skinMat);
    torso.rotation.x = Math.PI / 2;

    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 1.5), bellyMat);
    belly.position.set(0, -0.26, 0.2);

    const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 6), skinMat);
    dorsalFin.position.set(0, 0.55, 0.1);
    dorsalFin.rotation.x = -0.25;

    const tailPivot = new THREE.Group();
    tailPivot.position.z = -0.75;
    const tailShaft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8), skinMat);
    tailShaft.rotation.x = -Math.PI / 2;
    tailShaft.position.z = -0.4;

    const tailBlade = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.88, 5), skinMat);
    tailBlade.position.set(0, 0.1, -0.85);
    tailPivot.add(tailShaft, tailBlade);

    group.add(nose, torso, belly, dorsalFin, tailPivot);
    if (isBoss) group.scale.setScalar(1.45);
    return { group, tailPivot };
}

export function createPalmTree(materials) {
    const tree = new THREE.Group();
    for (let s = 0; s < 5; s++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - s * 0.02, 0.28 - s * 0.02, 1.05, 8), materials.wood);
        seg.position.set(s * 0.11, 0.5 + s * 0.9, 0);
        seg.rotation.z = -0.11;
        tree.add(seg);
    }

    const crownX = 0.46, crownY = 4.5;
    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.48, 2.4, 5), materials.grass);
        frond.position.set(crownX + Math.cos(angle) * 1.0, crownY - 0.15, Math.sin(angle) * 1.0);
        frond.rotation.z = -Math.cos(angle) * 1.18;
        frond.rotation.x = Math.sin(angle) * 1.18;
        tree.add(frond);
    }
    return tree;
}

export function createTreasureChest(materials) {
    const chest = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.75), materials.wood);
    box.position.y = 0.28;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 10, 1, false, 0, Math.PI), materials.wood);
    lid.rotation.z = Math.PI / 2;
    lid.rotation.y = Math.PI / 2;
    lid.position.y = 0.55;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.08), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.15 }));
    lock.position.set(0, 0.52, 0.39);
    chest.add(box, lid, lock);
    return { chest, lid };
}

// Terk Edilmiş Yat / Petrol Platformu Enkazı
export function createAbandonedShipwreck(materials) {
    const wreck = new THREE.Group();
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x6c584c, roughness: 0.85, metalness: 0.4 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x4a4e69, roughness: 0.8 });

    // Eğik Gemi Gövdesi
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 22), rustMat);
    hull.position.set(0, 1.5, 0);
    hull.rotation.set(0.08, 0.2, -0.14);
    hull.castShadow = true;
    hull.receiveShadow = true;

    // Üst Güverte ve Kaptan Köşkü
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 6.5), deckMat);
    bridge.position.set(0, 4.8, -3);
    bridge.rotation.set(0.08, 0.2, -0.14);

    // Kırık Baca
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.5, 10), new THREE.MeshStandardMaterial({ color: 0xbc4749 }));
    funnel.position.set(0.5, 6.8, -3.5);
    funnel.rotation.z = -0.35;

    wreck.add(hull, bridge, funnel);
    return wreck;
}

// Su Altı Mercan & Cevher Kaynağı
export function createUnderwaterCoral() {
    const group = new THREE.Group();
    const coralMat = new THREE.MeshStandardMaterial({ color: 0xff4d6d, roughness: 0.6 });
    const kelpMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 });

    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: 0x495057 }));
    group.add(rock);

    for (let i = 0; i < 4; i++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.9, 6), coralMat);
        branch.position.set((Math.random() - 0.5) * 0.7, 0.6, (Math.random() - 0.5) * 0.7);
        branch.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
        group.add(branch);
    }

    const kelp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.04), kelpMat);
    kelp.position.set(0.35, 0.8, 0.2);
    group.add(kelp);
    return group;
}

export function createSeaMine() {
    const mine = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 2), new THREE.MeshStandardMaterial({ color: 0x2b2d42, metalness: 0.75, roughness: 0.35 }));
    mine.add(body);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xe63946, emissive: 0x590d22 });
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    dirs.forEach(([dx, dy, dz]) => {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), spikeMat);
        spike.position.set(dx * 0.7, dy * 0.7, dz * 0.7);
        spike.lookAt(dx * 2, dy * 2, dz * 2);
        spike.rotateX(Math.PI / 2);
        mine.add(spike);
    });
    return mine;
}

export function createRescueShip(materials) {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 18), new THREE.MeshStandardMaterial({ color: 0x1d3557 }));
    hull.position.y = 1.2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 17.5), materials.wood);
    deck.position.y = 2.5;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.8, 5), new THREE.MeshStandardMaterial({ color: 0xf1faee }));
    cabin.position.set(0, 4.0, -2);
    const beaconLight = new THREE.PointLight(0xffd166, 3, 40);
    beaconLight.position.set(0, 6.2, -2);
    ship.add(hull, deck, cabin, beaconLight);
    return ship;
}

export function createStructureMesh(type, materials, blockSize = 2.5) {
    if (type === 'net') {
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(blockSize - 0.15, 0.14, blockSize - 0.15), materials.wood);
        frame.position.y = 0.05;
        const meshNet = new THREE.Mesh(
            new THREE.PlaneGeometry(blockSize - 0.4, blockSize - 0.4, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xd4a373, wireframe: true })
        );
        meshNet.rotation.x = -Math.PI / 2;
        meshNet.position.y = 0.08;
        const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.14), new THREE.MeshStandardMaterial({ color: 0x2a9d8f }));
        indicator.position.set(0, 0.25, 0);
        indicator.visible = false;
        g.add(frame, meshNet, indicator);
        g.userData.statusMesh = indicator;
        return g;
    }

    if (type === 'planter') {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), materials.wood);
        box.position.y = 0.18;
        const soil = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 1.15), new THREE.MeshStandardMaterial({ color: 0x3d220c }));
        soil.position.y = 0.19;
        const plant = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 1), materials.grass);
        plant.position.y = 0.55;
        plant.visible = false;
        g.add(box, soil, plant);
        g.userData.statusMesh = plant;
        return g;
    }

    if (type === 'stairs') {
        const g = new THREE.Group();
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.45), materials.wood);
            step.position.set(0, 0.25 + i * 0.42, 0.8 - i * 0.36);
            step.castShadow = true;
            step.receiveShadow = true;
            g.add(step);
        }
        // Üst Kat Sahanlık Platformu
        const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(blockSize - 0.1, 0.22, blockSize - 0.1), materials.wood);
        upperDeck.position.set(0, 2.75, 0);
        upperDeck.castShadow = true;
        upperDeck.receiveShadow = true;
        g.add(upperDeck);
        return g;
    }

    if (type === 'wall') {
        const g = new THREE.Group();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(blockSize - 0.1, 2.5, 0.18), materials.wood);
        wall.position.set(0, 1.25, -blockSize / 2 + 0.15);
        wall.castShadow = true;
        wall.receiveShadow = true;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(blockSize - 0.05, 0.22, blockSize - 0.05), materials.wood);
        roof.position.set(0, 2.6, 0);
        roof.castShadow = true;
        roof.receiveShadow = true;
        g.add(wall, roof);
        return g;
    }

    if (type === 'purifier') {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 1.0), materials.stone);
        base.position.y = 0.15;
        const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.44, 0.75, 12),
            new THREE.MeshStandardMaterial({ color: 0x48cae4, transparent: true, opacity: 0.85 })
        );
        tank.position.y = 0.62;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 8), materials.wood);
        roof.position.y = 1.18;
        g.add(base, tank, roof);
        g.userData.statusMesh = tank;
        return g;
    }

    if (type === 'grill') {
        const g = new THREE.Group();
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.55, 10), materials.stone);
        stand.position.y = 0.3;
        const grate = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
        grate.position.y = 0.62;
        g.add(stand, grate);
        g.userData.statusMesh = grate;
        return g;
    }

    if (type === 'storage') {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.65, 0.85), materials.wood);
        box.position.y = 0.35;
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 0.88), materials.metal);
        band.position.y = 0.48;
        g.add(box, band);
        return g;
    }

    if (type === 'lantern') {
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.9), materials.wood);
        post.position.y = 0.95;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), materials.wood);
        arm.position.set(0, 1.85, -0.18);
        const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
        bulb.position.set(0, 1.65, -0.35);
        const pLight = new THREE.PointLight(0xffb703, 1.5, 18);
        pLight.position.copy(bulb.position);
        g.add(post, arm, bulb, pLight);
        return g;
    }

    if (type === 'sail') {
        const g = new THREE.Group();
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8), materials.wood);
        mast.position.y = 1.9;
        const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4), materials.wood);
        yard.rotation.z = Math.PI / 2;
        yard.position.set(0, 3.3, -0.1);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.3), materials.sail);
        cloth.position.set(0, 2.15, -0.14);
        g.add(mast, yard, cloth);
        return g;
    }

    if (type === 'anchor') {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 14), materials.metal);
        ring.position.y = 0.55;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), materials.metal);
        shaft.position.y = 0.5;
        g.add(ring, shaft);
        return g;
    }

    if (type === 'beacon') {
        const g = new THREE.Group();
        const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.65, 1.6, 8), materials.metal);
        tripod.position.y = 0.8;
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.2), materials.metal);
        antenna.position.y = 2.4;
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.24),
            new THREE.MeshStandardMaterial({ color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 0.9 })
        );
        orb.position.y = 3.5;
        const beaconLight = new THREE.PointLight(0x06d6a0, 2.2, 24);
        beaconLight.position.y = 3.5;
        g.add(tripod, antenna, orb, beaconLight);
        g.userData.orb = orb;
        return g;
    }

    return null;
}