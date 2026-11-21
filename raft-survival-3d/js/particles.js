// 3D Parçacık Sistemi: Su Sıçraması, Izgara Dumanı, Ahşap Kıymığı ve Su Halkaları
export class ParticleEngine {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.ripples = [];

        this.boxGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        this.dropGeo = new THREE.SphereGeometry(0.08, 5, 5);
        this.smokeGeo = new THREE.DodecahedronGeometry(0.18, 0);
    }

    // Suya Çarpma Efekti (Su damlaları + Genişleyen beyaz köpük halkası)
    spawnWaterSplash(pos, count = 14) {
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.35 ? 0xe0fbfc : 0x48cae4,
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(this.dropGeo, mat);
            mesh.position.set(pos.x, 0.15, pos.z);
            this.scene.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3.5;
            this.particles.push({
                mesh,
                vel: new THREE.Vector3(Math.cos(angle) * speed, 3.2 + Math.random() * 3.5, Math.sin(angle) * speed),
                gravity: 15,
                life: 0.65,
                maxLife: 0.65,
                type: 'drop'
            });
        }

        // Genişleyen su halkası
        const ringGeo = new THREE.RingGeometry(0.2, 0.38, 20);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos.x, 0.12, pos.z);
        this.scene.add(ring);
        this.ripples.push({ mesh: ring, life: 0.9, maxLife: 0.9 });
    }

    // Darbe Kıymıkları (Ağaç kesme, kaya kırma, köpekbalığı ısırığı)
    spawnDebris(pos, colorHex = 0x8c5828, count = 10) {
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
            const mesh = new THREE.Mesh(this.boxGeo, mat);
            mesh.position.copy(pos);
            this.scene.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const speed = 1.8 + Math.random() * 3.2;
            this.particles.push({
                mesh,
                vel: new THREE.Vector3(Math.cos(angle) * speed, 2.5 + Math.random() * 3.0, Math.sin(angle) * speed),
                gravity: 14,
                life: 0.75,
                maxLife: 0.75,
                type: 'debris'
            });
        }
    }

    // Izgara Dumanı
    spawnSmoke(pos) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xced4da, transparent: true, opacity: 0.45 });
        const mesh = new THREE.Mesh(this.smokeGeo, mat);
        mesh.position.set(
            pos.x + (Math.random() - 0.5) * 0.3,
            pos.y + 0.75,
            pos.z + (Math.random() - 0.5) * 0.3
        );
        this.scene.add(mesh);

        this.particles.push({
            mesh,
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.6, 0.4),
            gravity: 0,
            life: 1.6,
            maxLife: 1.6,
            type: 'smoke'
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }

            p.vel.y -= p.gravity * dt;
            p.mesh.position.addScaledVector(p.vel, dt);

            const ratio = p.life / p.maxLife;
            if (p.type === 'smoke') {
                p.mesh.scale.setScalar(1 + (1 - ratio) * 1.8);
                p.mesh.material.opacity = ratio * 0.42;
            } else if (p.type === 'drop') {
                p.mesh.material.opacity = ratio * 0.9;
            } else {
                p.mesh.rotation.x += 6 * dt;
                p.mesh.rotation.y += 5 * dt;
            }
        }

        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.life -= dt;
            if (r.life <= 0) {
                this.scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                r.mesh.material.dispose();
                this.ripples.splice(i, 1);
                continue;
            }
            const progress = 1 - (r.life / r.maxLife);
            r.mesh.scale.setScalar(1 + progress * 5.5);
            r.mesh.material.opacity = (1 - progress) * 0.75;
        }
    }
}