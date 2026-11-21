function createCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    return tex;
}

export function createMaterials() {
    // Yüksek Detaylı Ahşap Kalas Dokusu + Kabartma Haritası
    const woodTex = createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#6f4518';
        ctx.fillRect(0, 0, w, h);
        const planks = 5;
        const plankH = h / planks;
        for (let i = 0; i < planks; i++) {
            const y = i * plankH;
            const shade = ['#7f4f24', '#6f4518', '#8b5e34', '#583101'][i % 4];
            ctx.fillStyle = shade;
            ctx.fillRect(0, y + 3, w, plankH - 6);

            // Ahşap damar çizgileri
            ctx.strokeStyle = 'rgba(28, 12, 2, 0.35)';
            ctx.lineWidth = 2;
            for (let g = 0; g < 10; g++) {
                ctx.beginPath();
                const gy = y + 6 + g * 9;
                ctx.moveTo(0, gy);
                ctx.bezierCurveTo(w * 0.25, gy + 4, w * 0.75, gy - 4, w, gy);
                ctx.stroke();
            }

            // Çivi başları
            ctx.fillStyle = '#2b2d42';
            ctx.beginPath();
            ctx.arc(24, y + plankH * 0.3, 4, 0, Math.PI * 2);
            ctx.arc(24, y + plankH * 0.7, 4, 0, Math.PI * 2);
            ctx.arc(w - 24, y + plankH * 0.3, 4, 0, Math.PI * 2);
            ctx.arc(w - 24, y + plankH * 0.7, 4, 0, Math.PI * 2);
            ctx.fill();

            // Kalas arası boşluk
            ctx.fillStyle = '#1f0d02';
            ctx.fillRect(0, y, w, 4);
        }
    });

    const woodBump = createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, w, h);
        const planks = 5;
        const plankH = h / planks;
        for (let i = 0; i < planks; i++) {
            const y = i * plankH;
            ctx.fillStyle = '#101010';
            ctx.fillRect(0, y, w, 5);
            ctx.strokeStyle = '#606060';
            for (let g = 0; g < 10; g++) {
                ctx.beginPath();
                ctx.moveTo(0, y + 8 + g * 9);
                ctx.lineTo(w, y + 8 + g * 9);
                ctx.stroke();
            }
        }
    });

    // Halat Dokusu
    const ropeTex = createCanvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#c29b61';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#7f5539';
        ctx.lineWidth = 6;
        for (let i = -h; i < w + h; i += 16) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + h, h);
            ctx.stroke();
        }
    }, 4, 1);

    // Hasarlı Ahşap
    const damagedWoodTex = createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#3d1814';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#120403';
        ctx.lineWidth = 6;
        for (let i = 0; i < 16; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * w, Math.random() * h);
            ctx.lineTo(Math.random() * w, Math.random() * h);
            ctx.stroke();
        }
    });

    // Yelken Kumaşı
    const sailTex = createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#ede0d4';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#bc4749';
        ctx.fillRect(0, h * 0.35, w, h * 0.14);
        ctx.fillRect(0, h * 0.55, w, h * 0.08);
    });

    // Ada Kumu
    const sandTex = createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#e6ccb2';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 3000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(176, 137, 104, 0.35)' : 'rgba(255, 255, 255, 0.25)';
            ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
        }
    }, 4, 4);

    return {
        wood: new THREE.MeshStandardMaterial({ map: woodTex, bumpMap: woodBump, bumpScale: 0.04, roughness: 0.72 }),
        damagedWood: new THREE.MeshStandardMaterial({ map: damagedWoodTex, roughness: 0.9 }),
        rope: new THREE.MeshStandardMaterial({ map: ropeTex, roughness: 0.85 }),
        sail: new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 0.65 }),
        sand: new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.88 }),
        grass: new THREE.MeshStandardMaterial({ color: 0x386641, roughness: 0.8 }),
        stone: new THREE.MeshStandardMaterial({ color: 0x5c677d, roughness: 0.85 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x9aa5b1, metalness: 0.85, roughness: 0.22 })
    };
}