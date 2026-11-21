import { audio } from './audio.js';
import {
    createPalmTree, createTreasureChest, createSeaMine, createRescueShip,
    createFloatingProp, createAbandonedShipwreck, createUnderwaterCoral
} from './models.js';

export class WorldManager {
    constructor(scene, materials) {
        this.scene = scene;
        this.materials = materials;

        this.timeOfDay = 8.5;
        this.day = 1;
        this.weather = 'clear';
        this.weatherTimer = 65;
        this.lightningCooldown = 0;

        this.hemiLight = new THREE.HemisphereLight(0xfff8e7, 0x1b4965, 0.95);
        this.scene.add(this.hemiLight);

        this.sunLight = new THREE.DirectionalLight(0xfff1d0, 1.35);
        this.sunLight.position.set(45, 65, -35);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        const d = 35;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.scene.add(this.sunLight);

        this.sunDisc = new THREE.Mesh(
            new THREE.SphereGeometry(5.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false })
        );
        this.scene.add(this.sunDisc);

        // GLSL Okyanus Shader'ı (Yarı saydamlık eklendi ki su altı mercanları görünsün)
        this.seaGeo = new THREE.PlaneGeometry(500, 500, 128, 128);
        this.seaGeo.rotateX(-Math.PI / 2);

        this.waterUniforms = {
            uTime: { value: 0 },
            uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.5).normalize() },
            uDeepColor: { value: new THREE.Color(0x013a63) },
            uShallowColor: { value: new THREE.Color(0x0096c7) },
            uSunColor: { value: new THREE.Color(0xfff3d1) },
            uFogColor: { value: new THREE.Color(0x7cc6fe) },
            uFogDensity: { value: 0.0068 },
            uWaveAmp: { value: 0.22 }
        };

        this.seaMat = new THREE.ShaderMaterial({
            uniforms: this.waterUniforms,
            transparent: true,
            side: THREE.DoubleSide,
            vertexShader: `
                uniform float uTime;
                uniform float uWaveAmp;
                varying vec3 vWorldPos;
                varying float vWaveHeight;

                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    float w1 = sin(worldPos.x * 0.22 + uTime * 2.1) * cos(worldPos.z * 0.18 + uTime * 1.6);
                    float w2 = sin(worldPos.x * 0.55 - uTime * 2.8) * 0.35;
                    float w3 = cos(worldPos.z * 0.45 + uTime * 2.4) * 0.35;
                    float h = (w1 + w2 + w3) * uWaveAmp;
                    worldPos.y += h;
                    vWorldPos = worldPos.xyz;
                    vWaveHeight = h;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uSunDir;
                uniform vec3 uDeepColor;
                uniform vec3 uShallowColor;
                uniform vec3 uSunColor;
                uniform vec3 uFogColor;
                uniform float uFogDensity;
                varying vec3 vWorldPos;
                varying float vWaveHeight;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                        f.y
                    );
                }

                void main() {
                    vec2 uv1 = vWorldPos.xz * 0.45 + vec2(0.0, -uTime * 0.45);
                    vec2 uv2 = vWorldPos.xz * 1.15 + vec2(uTime * 0.2, -uTime * 0.7);
                    float n1 = noise(uv1);
                    float n2 = noise(uv2);
                    float ripple = (n1 * 0.65 + n2 * 0.35);

                    vec3 normal = normalize(vec3((n1 - 0.5) * 0.45, 1.0, (n2 - 0.5) * 0.45));
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);

                    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.2);
                    vec3 waterCol = mix(uDeepColor, uShallowColor, clamp(ripple * 0.8 + vWaveHeight * 1.5, 0.0, 1.0));
                    waterCol = mix(waterCol, uFogColor * 0.92, fresnel * 0.65);

                    vec3 halfVec = normalize(uSunDir + viewDir);
                    float spec = pow(max(dot(normal, halfVec), 0.0), 140.0);
                    waterCol += uSunColor * spec * 1.6;

                    float foam = smoothstep(0.76, 0.92, ripple + vWaveHeight * 0.65);
                    waterCol = mix(waterCol, vec3(0.92, 0.98, 1.0), foam * 0.45);

                    float dist = length(cameraPosition - vWorldPos);
                    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
                    gl_FragColor = vec4(mix(waterCol, uFogColor, clamp(fogFactor, 0.0, 1.0)), 0.88);
                }
            `
        });

        this.seaMesh = new THREE.Mesh(this.seaGeo, this.seaMat);
        this.scene.add(this.seaMesh);

        // Yıldızlar
        const starGeo = new THREE.BufferGeometry();
        const starCount = 1200;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i += 3) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.45;
            const r = 195;
            starPos[i] = r * Math.sin(phi) * Math.cos(theta);
            starPos[i + 1] = r * Math.cos(phi) + 15;
            starPos[i + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.65, transparent: true, opacity: 0 });
        this.starField = new THREE.Points(starGeo, this.starMat);
        this.scene.add(this.starField);

        // Bulutlar
        this.clouds = [];
        const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
        for (let i = 0; i < 16; i++) {
            const cg = new THREE.Group();
            const puffs = 3 + Math.floor(Math.random() * 3);
            for (let p = 0; p < puffs; p++) {
                const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6 + Math.random() * 2.4, 1), cloudMat);
                puff.position.set(p * 2.6, Math.random() * 0.9, (Math.random() - 0.5) * 2.2);
                puff.scale.y = 0.5;
                cg.add(puff);
            }
            cg.position.set((Math.random() - 0.5) * 220, 36 + Math.random() * 14, (Math.random() - 0.5) * 220);
            this.scene.add(cg);
            this.clouds.push(cg);
        }

        // Martılar
        this.seagulls = [];
        const gullMat = new THREE.MeshBasicMaterial({ color: 0xf8f9fa, side: THREE.DoubleSide });
        for (let i = 0; i < 5; i++) {
            const gull = new THREE.Group();
            const lWing = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.18), gullMat);
            lWing.position.x = 0.25;
            const rWing = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.18), gullMat);
            rWing.position.x = -0.25;
            gull.add(lWing, rWing);
            this.scene.add(gull);
            this.seagulls.push({
                group: gull, lWing, rWing,
                angle: i * 1.2,
                radius: 14 + i * 3,
                height: 9 + i * 1.5,
                stealingBlock: null
            });
        }

        // Yağmur
        const rainCount = 950;
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(rainCount * 3);
        for (let i = 0; i < rainCount * 3; i += 3) {
            rainPos[i] = (Math.random() - 0.5) * 60;
            rainPos[i + 1] = Math.random() * 25;
            rainPos[i + 2] = (Math.random() - 0.5) * 60;
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({ color: 0xa8dadc, size: 0.18, transparent: true, opacity: 0.65 });
        this.rainSystem = new THREE.Points(rainGeo, rainMat);
        this.rainSystem.visible = false;
        this.scene.add(this.rainSystem);

        this.floatingItems = [];
        this.seaMines = [];
        this.islands = [];
        this.shipwrecks = [];
        this.islandNodes = [];
        this.chests = [];
        this.rescueShip = null;

        this.itemTypes = ['plank', 'plastic', 'leaf', 'barrel'];

        for (let i = 0; i < 22; i++) {
            this.spawnFloatingItem(-10 - Math.random() * 55);
        }
        this.spawnIsland(25, -68);
    }

    summonRescueShip() {
        if (this.rescueShip) return;
        this.rescueShip = createRescueShip(this.materials);
        this.rescueShip.position.set(16, -0.2, -95);
        this.scene.add(this.rescueShip);
    }

    updateDayNightAndWeather(dt, playerPos) {
        this.timeOfDay += dt * 0.085;
        if (this.timeOfDay >= 24) {
            this.timeOfDay -= 24;
            this.day++;
        }

        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
            this.weather = (this.weather === 'clear') ? 'storm' : 'clear';
            this.weatherTimer = (this.weather === 'storm') ? 35 : 75;
            this.rainSystem.visible = (this.weather === 'storm');
        }

        const skyColor = new THREE.Color();
        let lightIntensity = 1.1;
        let starOpacity = 0;

        if (this.weather === 'storm') {
            skyColor.setHex(0x1b263b);
            lightIntensity = 0.42;
            this.waterUniforms.uDeepColor.value.setHex(0x0b132b);
            this.waterUniforms.uShallowColor.value.setHex(0x1c2541);

            this.rainSystem.position.set(playerPos.x, 0, playerPos.z);
            const rAttr = this.rainSystem.geometry.attributes.position;
            for (let i = 1; i < rAttr.array.length; i += 3) {
                rAttr.array[i] -= 28 * dt;
                if (rAttr.array[i] < 0) rAttr.array[i] = 24;
            }
            rAttr.needsUpdate = true;

            this.lightningCooldown -= dt;
            if (this.lightningCooldown <= 0 && Math.random() < dt * 0.14) {
                this.lightningCooldown = 9;
                const flashEl = document.getElementById('lightning-flash');
                flashEl.classList.add('flash');
                setTimeout(() => flashEl.classList.remove('flash'), 140);
                setTimeout(() => audio.playThunder(), 450);
            }
        } else if (this.timeOfDay >= 6 && this.timeOfDay < 8) {
            const t = (this.timeOfDay - 6) / 2;
            skyColor.setHex(0x1a2639).lerp(new THREE.Color(0xf4a261), t);
            lightIntensity = 0.45 + t * 0.7;
            starOpacity = 1 - t;
            this.waterUniforms.uDeepColor.value.setHex(0x013a63);
            this.waterUniforms.uShallowColor.value.setHex(0x0096c7);
        } else if (this.timeOfDay >= 8 && this.timeOfDay < 17) {
            skyColor.setHex(0x7cc6fe);
            lightIntensity = 1.25;
            this.waterUniforms.uDeepColor.value.setHex(0x013a63);
            this.waterUniforms.uShallowColor.value.setHex(0x0096c7);
        } else if (this.timeOfDay >= 17 && this.timeOfDay < 19.5) {
            const t = (this.timeOfDay - 17) / 2.5;
            skyColor.setHex(0x7cc6fe).lerp(new THREE.Color(0xe76f51), Math.sin(t * Math.PI));
            skyColor.lerp(new THREE.Color(0x0b1622), t * 0.85);
            lightIntensity = 1.1 - t * 0.75;
            starOpacity = t;
        } else {
            skyColor.setHex(0x07101c);
            lightIntensity = 0.28;
            starOpacity = 0.95;
            this.waterUniforms.uDeepColor.value.setHex(0x03071e);
            this.waterUniforms.uShallowColor.value.setHex(0x0a192f);
        }

        const fogDens = (this.weather === 'storm') ? 0.012 : 0.0068;
        this.starMat.opacity = starOpacity;
        this.scene.background = skyColor;
        this.scene.fog.color = skyColor;
        this.scene.fog.density = fogDens;
        this.sunLight.intensity = lightIntensity;
        this.hemiLight.intensity = Math.max(0.28, lightIntensity * 0.85);

        const sunAngle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
        const sunPos = new THREE.Vector3(Math.cos(sunAngle) * 90, Math.max(12, Math.sin(sunAngle) * 90), -110);
        this.sunLight.position.copy(sunPos);
        this.sunDisc.position.copy(sunPos).multiplyScalar(1.6);

        this.waterUniforms.uFogColor.value.copy(skyColor);
        this.waterUniforms.uFogDensity.value = fogDens;
        this.waterUniforms.uSunDir.value.copy(sunPos).normalize();
        this.waterUniforms.uSunColor.value.setHex(lightIntensity > 0.4 ? 0xfff3d1 : 0x48cae4);
    }

    updateOcean(elapsed, dt) {
        const waveAmp = (this.weather === 'storm') ? 0.42 : 0.2;
        this.waterUniforms.uTime.value = elapsed;
        this.waterUniforms.uWaveAmp.value = waveAmp;

        this.clouds.forEach(c => {
            c.position.x += dt * 1.1;
            if (c.position.x > 120) c.position.x = -120;
        });

        return waveAmp;
    }

    spawnFloatingItem(customZ = null) {
        const type = this.itemTypes[Math.floor(Math.random() * this.itemTypes.length)];
        const mesh = createFloatingProp(type, this.materials);

        const x = (Math.random() - 0.5) * 48;
        const z = customZ !== null ? customZ : -65 - Math.random() * 25;
        mesh.position.set(x, 0.04, z);
        mesh.rotation.y = Math.random() * Math.PI;
        this.scene.add(mesh);

        this.floatingItems.push({ type, mesh, phase: Math.random() * 6.28 });
    }

    spawnSeaMine() {
        const mine = createSeaMine();
        const x = (Math.random() - 0.5) * 34;
        mine.position.set(x, 0.1, -85);
        this.scene.add(mine);
        this.seaMines.push(mine);
    }

    spawnShipwreck(x, z) {
        const wreckGroup = createAbandonedShipwreck(this.materials);
        wreckGroup.position.set(x, -0.2, z);

        // Güvertede Ganimet Sandığı
        const { chest, lid } = createTreasureChest(this.materials);
        chest.position.set(0, 3.8, 2);
        wreckGroup.add(chest);
        this.chests.push({ mesh: chest, lid, parentIsland: wreckGroup, opened: false });

        this.scene.add(wreckGroup);
        this.shipwrecks.push({ group: wreckGroup });
    }

    spawnIsland(x, z) {
        const islandGroup = new THREE.Group();
        islandGroup.position.set(x, -0.35, z);

        const radius = 10 + Math.random() * 4.5;
        const sandGeo = new THREE.CylinderGeometry(radius * 0.68, radius * 1.15, 2.6, 24, 3);
        const sPos = sandGeo.attributes.position;
        for (let i = 0; i < sPos.count; i++) {
            const vx = sPos.getX(i);
            const vz = sPos.getZ(i);
            const jitter = 0.88 + Math.sin(vx * 0.6) * 0.12 + Math.cos(vz * 0.6) * 0.12;
            sPos.setX(i, vx * jitter);
            sPos.setZ(i, vz * jitter);
        }
        sandGeo.computeVertexNormals();
        const baseMesh = new THREE.Mesh(sandGeo, this.materials.sand);
        baseMesh.position.y = 1.0;
        baseMesh.receiveShadow = true;
        islandGroup.add(baseMesh);

        const topGeo = new THREE.DodecahedronGeometry(radius * 0.62, 2);
        const tPos = topGeo.attributes.position;
        for (let i = 0; i < tPos.count; i++) {
            tPos.setY(i, Math.max(0, tPos.getY(i) * 0.55));
        }
        topGeo.computeVertexNormals();
        const topMesh = new THREE.Mesh(topGeo, this.materials.grass);
        topMesh.position.y = 2.0;
        topMesh.receiveShadow = true;
        islandGroup.add(topMesh);

        // Palmiyeler
        const treeCount = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < treeCount; i++) {
            const angle = (i / treeCount) * Math.PI * 2 + Math.random() * 0.4;
            const dist = 2.2 + Math.random() * (radius * 0.4);
            const palm = createPalmTree(this.materials);
            palm.position.set(Math.cos(angle) * dist, 2.0, Math.sin(angle) * dist);
            palm.rotation.y = Math.random() * Math.PI * 2;
            palm.traverse(c => { if (c.isMesh) c.castShadow = true; });
            islandGroup.add(palm);

            this.islandNodes.push({ type: 'tree', mesh: palm, parentIsland: islandGroup, hp: 3 });
        }

        // Kayalar
        const rockCount = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < rockCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2.4 + Math.random() * (radius * 0.45);
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 1), this.materials.stone);
            rock.position.set(Math.cos(angle) * dist, 1.95, Math.sin(angle) * dist);
            rock.castShadow = true;
            islandGroup.add(rock);

            this.islandNodes.push({ type: 'rock', mesh: rock, parentIsland: islandGroup, hp: 3 });
        }

        // Su Altı Mercan Resifleri (Adanın kıyı çevresinde suyun altında)
        for (let c = 0; c < 4; c++) {
            const angle = (c / 4) * Math.PI * 2 + 0.5;
            const dist = radius * 1.35;
            const coral = createUnderwaterCoral();
            coral.position.set(Math.cos(angle) * dist, -1.8, Math.sin(angle) * dist);
            islandGroup.add(coral);
            this.islandNodes.push({ type: 'coral', mesh: coral, parentIsland: islandGroup, hp: 2 });
        }

        // Hazine Sandığı
        const { chest, lid } = createTreasureChest(this.materials);
        chest.position.set(0, 3.15, 0);
        chest.traverse(c => { if (c.isMesh) c.castShadow = true; });
        islandGroup.add(chest);
        this.chests.push({ mesh: chest, lid, parentIsland: islandGroup, opened: false });

        this.scene.add(islandGroup);
        this.islands.push({ group: islandGroup, radius });
    }

    updateEntities(dt, elapsed, travelSpeed) {
        if (this.floatingItems.length < 30 && Math.random() < dt * 0.55) {
            this.spawnFloatingItem();
        }

        if (travelSpeed > 2.0 && this.seaMines.length < 2 && Math.random() < dt * 0.06) {
            this.spawnSeaMine();
        }

        const driftSpeed = 2.4 + travelSpeed;
        for (let i = this.floatingItems.length - 1; i >= 0; i--) {
            const item = this.floatingItems[i];
            item.mesh.position.z += driftSpeed * dt;
            item.mesh.position.y = 0.04 + Math.sin(elapsed * 2.2 + item.phase) * 0.07;
            item.mesh.rotation.z = Math.cos(elapsed * 1.8 + item.phase) * 0.08;
            item.mesh.rotation.y += 0.35 * dt;

            if (item.mesh.position.z > 55) {
                this.scene.remove(item.mesh);
                this.floatingItems.splice(i, 1);
            }
        }

        for (let i = this.seaMines.length - 1; i >= 0; i--) {
            const m = this.seaMines[i];
            m.position.z += driftSpeed * dt;
            m.rotation.y += 0.8 * dt;
            m.position.y = Math.sin(elapsed * 2.5 + i) * 0.1;
            if (m.position.z > 45) {
                this.scene.remove(m);
                this.seaMines.splice(i, 1);
            }
        }

        for (let i = this.islands.length - 1; i >= 0; i--) {
            const isl = this.islands[i];
            isl.group.position.z += travelSpeed * dt;
            if (isl.group.position.z > 75) {
                this.islandNodes = this.islandNodes.filter(n => n.parentIsland !== isl.group);
                this.chests = this.chests.filter(c => c.parentIsland !== isl.group);
                this.scene.remove(isl.group);
                this.islands.splice(i, 1);
            }
        }

        for (let i = this.shipwrecks.length - 1; i >= 0; i--) {
            const sw = this.shipwrecks[i];
            sw.group.position.z += travelSpeed * dt;
            if (sw.group.position.z > 75) {
                this.chests = this.chests.filter(c => c.parentIsland !== sw.group);
                this.scene.remove(sw.group);
                this.shipwrecks.splice(i, 1);
            }
        }

        // Ufukta yeni Ada veya Terk Edilmiş Gemi Enkazı oluştur
        if (this.islands.length === 0 && this.shipwrecks.length === 0 && travelSpeed > 0.5 && Math.random() < dt * 0.2) {
            const sideX = (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 20);
            if (Math.random() < 0.35) {
                this.spawnShipwreck(sideX, -115);
            } else {
                this.spawnIsland(sideX, -115);
            }
        }
    }

    getNearestIslandDist(playerPos) {
        let minDist = Infinity;
        this.islands.forEach(isl => {
            const d = Math.hypot(playerPos.x - isl.group.position.x, playerPos.z - isl.group.position.z);
            if (d < minDist) minDist = d;
        });
        this.shipwrecks.forEach(sw => {
            const d = Math.hypot(playerPos.x - sw.group.position.x, playerPos.z - sw.group.position.z);
            if (d < minDist) minDist = d;
        });
        return minDist === Infinity ? null : Math.max(0, Math.round(minDist - 9));
    }

    getFormattedTime() {
        const hrs = Math.floor(this.timeOfDay).toString().padStart(2, '0');
        const mins = Math.floor((this.timeOfDay % 1) * 60).toString().padStart(2, '0');
        return `${hrs}:${mins}`;
    }
}