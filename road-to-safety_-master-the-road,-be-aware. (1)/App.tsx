
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// --- Constants & Types ---

const SKINS = [
  { id: 0, n: 'GT-Red Line', c: 0xcc0000, p: 0 },
  { id: 1, n: 'Cyber-Pulse', c: 0x00ffff, p: 1000 },
  { id: 2, n: 'Shadow Ops', c: 0x0a0a0a, p: 5000 },
  { id: 3, n: 'Royal Aurum', c: 0xffaa00, p: 15000 }
];

const QUIZ = [
  { q: "What is the primary purpose of traffic lights?", a: ["To decorate the streets", "To control traffic flow and ensure safety", "To indicate time of day", "To warn of road construction"], c: 1 },
  { q: "What should you do when the pedestrian light is red?", a: ["Cross quickly", "Wait until it turns green", "Ignore it if there are no cars", "Wave to oncoming drivers"], c: 1 },
  { q: "When riding a bicycle on the road, which safety gear is most important?", a: ["Sunglasses", "Helmet", "Gloves", "Backpack"], c: 1 },
  { q: "What does a triangular road sign with a red border indicate?", a: ["Warning", "Mandatory action", "Speed limit", "Parking area"], c: 0 },
  { q: "Which is the safest way to cross the street?", a: ["Anywhere, as long as there are no cars", "At a pedestrian lane or crosswalk", "In the middle of the road", "While running quickly"], c: 1 },
  { q: "If you are a passenger in a moving vehicle, what should you always do?", a: ["Keep the window open", "Stand up for a better view", "Wear your seatbelt", "Use your phone freely"], c: 2 },
  { q: "What does a yellow traffic light mean?", a: ["Stop immediately", "Drive faster", "Prepare to stop", "Ignore the signal"], c: 2 },
  { q: "Why is it dangerous to use headphones while walking or biking on the road?", a: ["They can get dirty", "They block environmental sounds like horns", "They make you look unfriendly", "They slow down your walking speed"], c: 1 },
  { q: "When driving a motorcycle, what is the minimum safety gear required by law?", a: ["Helmet", "Jacket", "Sunglasses", "Gloves"], c: 0 },
  { q: "Why should pedestrians avoid jaywalking?", a: ["It takes longer to cross", "It is less convenient", "It increases the risk of accidents", "It is more tiring"], c: 2 }
];

interface GameState {
  hearts: number;
  score: number;
  totalCash: number;
  speed: number;
  isPaused: boolean;
  isActive: boolean;
  isGameOver: boolean;
  showGarage: boolean;
  currentQuiz: typeof QUIZ[0] | null;
  msg: string;
  unlockedSkins: number[];
  weather: 'clear' | 'rain' | 'snow';
}

export default function App() {
  const [state, setState] = useState<GameState>({
    hearts: 3,
    score: 0,
    totalCash: Number(localStorage.getItem('mtn_cash')) || 0,
    speed: 0,
    isPaused: false,
    isActive: false,
    isGameOver: false,
    showGarage: false,
    currentQuiz: null,
    msg: "",
    unlockedSkins: JSON.parse(localStorage.getItem('mtn_unlocked') || "[0]"),
    weather: 'clear'
  });

  const [skinId, setSkinId] = useState(Number(localStorage.getItem('mtn_skin')) || 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    player: THREE.Group | null;
    peds: any[];
    lights: any[];
    speed: number;
    score: number;
    input: { gas: boolean; l: boolean; r: boolean };
    weatherParticles: THREE.Points | null;
  } | null>(null);

  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const currentLightRef = useRef<any>(null);

  const handleLoseHeart = useCallback((reason: string) => {
    setState(prev => {
      const newHearts = prev.hearts - 1;
      if (newHearts <= 0) {
        activeRef.current = false;
        const earned = Math.floor(prev.score);
        const finalCash = prev.totalCash + earned;
        localStorage.setItem('mtn_cash', finalCash.toString());
        return { ...prev, hearts: 0, totalCash: finalCash, isActive: false, isGameOver: true, msg: reason };
      }
      return { ...prev, hearts: newHearts, msg: reason };
    });
    setTimeout(() => setState(prev => ({ ...prev, msg: "" })), 2000);
  }, []);

  const spawnPlayer = (id: number) => {
    if (!gameRef.current) return;
    const { scene, player } = gameRef.current;
    if (player) scene.remove(player);

    const newPlayer = new THREE.Group();
    const color = SKINS[id].c;
    
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.8, 5.0),
      new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.8 })
    );
    body.position.y = 0.4;
    body.castShadow = true;

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.7, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 1.0, roughness: 0.0 })
    );
    cabin.position.set(0, 1.0, -0.2);

    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const positions = [[-1.1, 0.4, 1.5], [1.1, 0.4, 1.5], [-1.1, 0.4, -1.5], [1.1, 0.4, -1.5]];
    positions.forEach(pos => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(pos[0], pos[1], pos[2]);
      newPlayer.add(w);
    });

    const hlGeo = new THREE.BoxGeometry(0.6, 0.2, 0.1);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hl = new THREE.Mesh(hlGeo, hlMat); hl.position.set(-0.7, 0.6, -2.5);
    const hr = new THREE.Mesh(hlGeo, hlMat); hr.position.set(0.7, 0.6, -2.5);
    
    newPlayer.add(body, cabin, hl, hr);
    newPlayer.position.set(0, 0, 0);
    scene.add(newPlayer);
    gameRef.current.player = newPlayer;
  };

  const createWeatherSystem = (type: 'rain' | 'snow' | 'clear') => {
    if (!gameRef.current) return;
    const { scene, weatherParticles } = gameRef.current;
    if (weatherParticles) scene.remove(weatherParticles);

    if (type === 'clear') {
      gameRef.current.weatherParticles = null;
      scene.fog = new THREE.FogExp2(0x87ceeb, 0.001);
      return;
    }

    const count = type === 'rain' ? 6000 : 4000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] = Math.random() * 200 - 100;
      pos[i+1] = Math.random() * 100;
      pos[i+2] = Math.random() * 400 - 200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: type === 'rain' ? 0xccccff : 0xffffff,
      size: type === 'rain' ? 0.05 : 0.2,
      transparent: true,
      opacity: 0.5
    });
    const p = new THREE.Points(geo, mat);
    scene.add(p);
    gameRef.current.weatherParticles = p;
    scene.fog = new THREE.FogExp2(type === 'rain' ? 0x444455 : 0xeeeeee, 0.004);
  };

  const initThree = useCallback(() => {
    if (!containerRef.current || gameRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7fb3d5);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(200, 400, 100);
    sun.castShadow = true;
    scene.add(sun);

    const peds: any[] = [];
    const lights: any[] = [];

    for (let i = 0; i < 600; i++) {
      const z = -i * 80;
      const biome = i < 200 ? 'village' : (i < 400 ? 'city' : 'industrial');

      const gMat = new THREE.MeshStandardMaterial({ 
        color: biome === 'village' ? 0x3d6e3d : (biome === 'city' ? 0x2c3e50 : 0x1a1a1a),
        roughness: 0.9 
      });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 82), gMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.1, z);
      ground.receiveShadow = true;
      scene.add(ground);

      const rMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 });
      const road = new THREE.Mesh(new THREE.PlaneGeometry(24, 82), rMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.01, z);
      road.receiveShadow = true;
      scene.add(road);

      const sMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d });
      const sidewalkL = new THREE.Mesh(new THREE.PlaneGeometry(10, 82), sMat);
      sidewalkL.rotation.x = -Math.PI / 2;
      sidewalkL.position.set(-17, 0.05, z);
      scene.add(sidewalkL);
      const sidewalkR = new THREE.Mesh(new THREE.PlaneGeometry(10, 82), sMat);
      sidewalkR.rotation.x = -Math.PI / 2;
      sidewalkR.position.set(17, 0.05, z);
      scene.add(sidewalkR);

      const isZebraLine = i > 0 && i % 15 === 0;
      if (isZebraLine) {
        const zebra = new THREE.Group();
        for (let k = 0; k < 12; k++) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 10), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(-11 + k * 2, 0.08, z);
          zebra.add(stripe);
        }
        scene.add(zebra);
        const ped = makePed(z, true);
        scene.add(ped.mesh);
        peds.push(ped);
        const light = makeTrafficLight(z);
        lights.push(light);
        scene.add(light.mesh);
      } else {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 6), new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.6 }));
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.06, z);
        scene.add(dash);
      }

      if (biome === 'village') {
        if (i % 3 === 0) {
          const tree = createTree();
          tree.position.set(i % 6 === 0 ? 35 : -35, 0, z + Math.random() * 20);
          scene.add(tree);
        }
      } else if (biome === 'city') {
        if (i % 2 === 0) {
          const h = 40 + Math.random() * 80;
          const bld = new THREE.Mesh(new THREE.BoxGeometry(20, h, 20), new THREE.MeshStandardMaterial({ color: 0x34495e }));
          bld.position.set(i % 4 === 0 ? -40 : 40, h/2, z);
          scene.add(bld);
        }
      }
    }

    gameRef.current = {
      scene, camera, renderer, player: null, peds, lights,
      speed: 0, score: 0, input: { gas: false, l: false, r: false },
      weatherParticles: null
    };
    spawnPlayer(skinId);
    createWeatherSystem('clear');

    const onResize = () => {
      if (!gameRef.current) return;
      gameRef.current.camera.aspect = window.innerWidth / window.innerHeight;
      gameRef.current.camera.updateProjectionMatrix();
      gameRef.current.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [skinId]);

  const createTree = () => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x4e342e }));
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2e7d32 }));
    leaf.position.y = 6; trunk.position.y = 3; g.add(trunk, leaf);
    return g;
  };

  const makePed = (z: number, onZebra: boolean) => {
    const g = new THREE.Group();
    const type = Math.floor(Math.random() * 3);
    const colors = [0x3498db, 0xe67e22, 0x9b59b6];
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.5, 4, 8), new THREE.MeshStandardMaterial({ color: colors[type] }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0xffccaa }));
    head.position.y = 1.2;
    g.add(body, head);
    g.castShadow = true;
    const startSide = Math.random() > 0.5 ? -15 : 15;
    g.position.set(startSide, 1.2, z);
    return { mesh: g, spd: 0.12 + Math.random() * 0.08, dir: startSide < 0 ? 1 : -1, hit: false, isZebraWalker: onZebra, waiting: false };
  };

  const makeTrafficLight = (z: number) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 18, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pole.position.set(14, 9, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    arm.position.set(6, 17, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    box.position.set(0, 17, 0);
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    r.position.set(-1, 17, 0.8);
    const g_ = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    g_.position.set(1, 17, 0.8);
    g.add(pole, arm, box, r, g_);
    g.position.z = z;
    return { mesh: g, state: 'red', z, answered: false, mats: { r: r.material, g: g_.material } };
  };

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      frameId = requestAnimationFrame(loop);
      if (!gameRef.current || !activeRef.current || pausedRef.current) {
        if (gameRef.current) gameRef.current.renderer.render(gameRef.current.scene, gameRef.current.camera);
        return;
      }
      const g = gameRef.current;
      let friction = state.weather === 'clear' ? 0.985 : 0.97;
      if (g.weatherParticles) {
        const positions = g.weatherParticles.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= state.weather === 'rain' ? 1.8 : 0.3;
          if (positions[i] < 0) positions[i] = 100;
        }
        g.weatherParticles.geometry.attributes.position.needsUpdate = true;
        g.weatherParticles.position.z = g.player!.position.z;
      }
      g.lights.forEach(l => {
        const dist = l.z - g.player!.position.z;
        if (dist > -5 && dist < 150 && l.state === 'red' && !l.answered) {
          if (dist < 30) {
            friction = 0.75;
            if (g.speed < 0.25 || dist < 4) {
              g.speed = 0;
              pausedRef.current = true;
              currentLightRef.current = l;
              setState(prev => ({ ...prev, isPaused: true, currentQuiz: QUIZ[Math.floor(Math.random() * QUIZ.length)] }));
            }
          }
        }
      });
      if (g.input.gas) g.speed = THREE.MathUtils.lerp(g.speed, 3.0, 0.02);
      g.speed *= friction;
      if (g.input.l) { g.player!.position.x -= 0.48; g.player!.rotation.z = 0.25; }
      else if (g.input.r) { g.player!.position.x += 0.48; g.player!.rotation.z = -0.25; }
      else { g.player!.rotation.z *= 0.8; }
      g.player!.position.x = THREE.MathUtils.clamp(g.player!.position.x, -20, 20);
      g.player!.position.z -= g.speed;
      g.score += g.speed * 0.4;
      g.peds.forEach(p => {
        const correspondingLight = g.lights.find(l => Math.abs(l.z - p.mesh.position.z) < 10);
        const canCross = correspondingLight ? correspondingLight.state === 'red' : true;
        if (p.isZebraWalker) {
          if (canCross) {
            p.mesh.position.x += p.spd * p.dir;
            if (Math.abs(p.mesh.position.x) > 20) p.dir *= -1;
          }
        } else {
          p.mesh.position.x += p.spd * p.dir;
          if (Math.abs(p.mesh.position.x) > 20) p.dir *= -1;
        }
        if (!p.hit && g.player!.position.distanceTo(p.mesh.position) < 3.8) {
          p.hit = true;
          handleLoseHeart("Collision! Yield to pedestrians.");
          p.mesh.scale.set(0.1, 0.1, 0.1);
        }
      });
      const camP = new THREE.Vector3(g.player!.position.x * 0.4, 15, g.player!.position.z + 38);
      g.camera.position.lerp(camP, 0.12);
      g.camera.lookAt(g.player!.position.x, 2, g.player!.position.z - 30);
      setState(prev => ({ ...prev, score: g.score, speed: g.speed }));
      g.renderer.render(g.scene, g.camera);
    };
    initThree();
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [initThree, handleLoseHeart, state.weather]);

  const toggleGarage = (show: boolean) => {
    setState(prev => ({ ...prev, showGarage: show }));
  };

  const handleInput = (key: 'gas' | 'l' | 'r', val: boolean) => {
    if (gameRef.current) {
      gameRef.current.input[key] = val;
    }
  };

  const onAnswer = (idx: number) => {
    const q = state.currentQuiz;
    const light = currentLightRef.current;
    if (!q || !light) return;
    if (idx === q.c) {
      light.state = 'green';
      light.mats.r.color.setHex(0x1a1a1a);
      light.mats.g.color.setHex(0x00ff00);
      setState(prev => ({ ...prev, score: prev.score + 2000 }));
    } else {
      handleLoseHeart("Safety Violation! Incorrect quiz answer.");
      light.state = 'green';
      light.mats.r.color.setHex(0x1a1a1a);
      light.mats.g.color.setHex(0x00ff00);
    }
    light.answered = true;
    pausedRef.current = false;
    const randWeather = Math.random();
    const newWeather = randWeather < 0.1 ? 'snow' : (randWeather < 0.3 ? 'rain' : 'clear');
    createWeatherSystem(newWeather);
    setState(prev => ({ ...prev, isPaused: false, currentQuiz: null, weather: newWeather }));
  };

  const buyOrSelect = (s: typeof SKINS[0]) => {
    if (state.unlockedSkins.includes(s.id)) {
      setSkinId(s.id);
      localStorage.setItem('mtn_skin', s.id.toString());
      spawnPlayer(s.id);
    } else {
      if (state.totalCash >= s.p) {
        const newUnlocked = [...state.unlockedSkins, s.id];
        const newCash = state.totalCash - s.p;
        setState(prev => ({ ...prev, totalCash: newCash, unlockedSkins: newUnlocked }));
        localStorage.setItem('mtn_unlocked', JSON.stringify(newUnlocked));
        localStorage.setItem('mtn_cash', newCash.toString());
      }
    }
  };

  const retry = () => {
    if (gameRef.current) {
      gameRef.current.player!.position.set(0, 0.6, 0);
      gameRef.current.score = 0;
      gameRef.current.speed = 0;
      gameRef.current.peds.forEach(p => { p.hit = false; p.mesh.scale.set(1, 1, 1); });
      gameRef.current.lights.forEach(l => { 
        l.state = 'red'; l.answered = false; 
        l.mats.r.color.setHex(0xff0000); l.mats.g.color.setHex(0x111111); 
      });
    }
    activeRef.current = true;
    pausedRef.current = false;
    setState(prev => ({ ...prev, hearts: 3, score: 0, isGameOver: false, isActive: true, isPaused: false, msg: "", weather: 'clear' }));
    createWeatherSystem('clear');
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black text-white select-none">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {state.weather !== 'clear' && (
        <div className={`absolute inset-0 pointer-events-none z-[5] transition-opacity duration-1000 ${state.weather === 'rain' ? 'bg-indigo-900/20' : 'bg-white/10'}`} />
      )}

      {/* HUD: Mobile optimized gap and sizing */}
      {state.isActive && !state.isPaused && !state.isGameOver && (
        <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10 flex flex-wrap gap-2 sm:gap-6 pointer-events-none">
          <div className="bg-black/60 p-3 sm:p-6 rounded-2xl sm:rounded-[3rem] border-b-4 sm:border-b-8 border-rose-500 backdrop-blur-3xl flex gap-1 sm:gap-4 shadow-2xl">
             {[...Array(3)].map((_, i) => (
                <div key={i} className={`w-6 h-6 sm:w-12 sm:h-12 transition-all duration-700 ${i < state.hearts ? 'text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,1)] scale-110' : 'text-slate-800 scale-75 blur-[1px]'}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </div>
              ))}
          </div>
          <div className="bg-black/60 p-3 sm:p-6 rounded-2xl sm:rounded-[3rem] border-b-4 sm:border-b-8 border-cyan-400 backdrop-blur-3xl shadow-2xl flex flex-col justify-center min-w-[100px] sm:min-w-[180px]">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-cyan-400/50">SCORE</span>
            <span className="text-xl sm:text-5xl font-black text-cyan-400 font-mono italic leading-none">${Math.floor(state.score).toLocaleString()}</span>
          </div>
          <div className="bg-black/60 p-3 sm:p-6 rounded-2xl sm:rounded-[3rem] border-b-4 sm:border-b-8 border-amber-400 backdrop-blur-3xl shadow-2xl flex flex-col justify-center min-w-[100px] sm:min-w-[180px]">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-400/50">SPEED</span>
            <span className="text-xl sm:text-5xl font-black text-amber-400 font-mono italic leading-none">{Math.round(state.speed * 60)}</span>
          </div>
        </div>
      )}

      {state.msg && (
        <div className="absolute top-1/4 w-full text-center z-20 pointer-events-none px-6 sm:px-12">
          <h2 className="text-4xl sm:text-8xl font-black text-rose-500 drop-shadow-[0_0_20px_rgba(0,0,0,1)] animate-pulse italic uppercase tracking-tighter">{state.msg}</h2>
        </div>
      )}

      {/* Main Menu: Mobile friendly scaling */}
      {!state.isActive && !state.isGameOver && !state.showGarage && (
        <div className="absolute inset-0 z-20 bg-slate-900/60 flex items-center justify-center p-4 sm:p-12 backdrop-blur-md">
          <div className="bg-slate-900/40 p-6 sm:p-20 rounded-[2rem] sm:rounded-[8rem] w-full max-w-3xl text-center border-2 border-slate-700/50 shadow-2xl backdrop-blur-2xl overflow-y-auto max-h-screen">
            <h1 className="text-5xl sm:text-9xl font-black mb-2 sm:mb-6 bg-gradient-to-b from-white via-cyan-400 to-blue-700 bg-clip-text text-transparent italic leading-[0.8] uppercase tracking-tighter filter drop-shadow-2xl">
              ROAD TO<br/>SAFETY
            </h1>
            <p className="text-cyan-400/70 mb-6 sm:mb-16 font-black tracking-widest sm:tracking-[0.5em] uppercase text-sm sm:text-2xl italic">MASTER THE ROAD, BE AWARE.</p>
            <div className="bg-black/60 py-2 sm:py-6 px-6 sm:px-16 rounded-2xl sm:rounded-[3rem] mb-6 sm:mb-16 inline-block border-2 border-slate-800 shadow-2xl">
               <span className="text-amber-400 font-black text-2xl sm:text-5xl tracking-tighter italic font-mono">$ {state.totalCash.toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-4 sm:gap-10">
              <button onClick={() => { activeRef.current = true; setState(prev => ({ ...prev, isActive: true, hearts: 3, score: 0 })); }}
                className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 py-4 sm:py-10 rounded-2xl sm:rounded-[4rem] text-2xl sm:text-6xl font-black shadow-lg active:translate-y-1 uppercase italic tracking-wider">
                DRIVE
              </button>
              <button onClick={() => toggleGarage(true)}
                className="w-full bg-slate-800/80 py-4 sm:py-10 rounded-2xl sm:rounded-[4rem] text-xl sm:text-5xl font-black border-b-4 sm:border-b-[16px] border-slate-950 active:translate-y-1 uppercase tracking-widest italic shadow-2xl">
                GARAGE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Garage: Scrollable and scaled for mobile */}
      {state.showGarage && (
        <div className="absolute inset-0 z-30 bg-black/98 flex items-center justify-center p-4 sm:p-12 backdrop-blur-3xl">
          <div className="bg-slate-900/90 p-4 sm:p-20 rounded-[2rem] sm:rounded-[6rem] w-full max-w-4xl border-4 border-slate-800 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-center sm:items-end mb-8 sm:mb-16 border-b-4 sm:border-b-8 border-slate-800 pb-4 sm:pb-10 gap-4">
              <h2 className="text-3xl sm:text-7xl font-black text-cyan-400 italic uppercase tracking-tighter">VEHICLES</h2>
              <span className="bg-amber-400 text-black px-4 py-1 sm:px-12 sm:py-5 rounded-full sm:rounded-[3rem] font-black text-lg sm:text-4xl shadow-2xl font-mono">${state.totalCash.toLocaleString()}</span>
            </div>
            <div className="space-y-4 sm:space-y-12 mb-8 sm:mb-20">
              {SKINS.map(s => {
                const unlocked = state.unlockedSkins.includes(s.id);
                const selected = skinId === s.id;
                return (
                  <div key={s.id} className={`p-4 sm:p-12 rounded-[1.5rem] sm:rounded-[5rem] border-4 sm:border-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-12 transition-all ${selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-800/30'}`}>
                    <div className="w-32 h-20 sm:w-56 sm:h-36 rounded-xl sm:rounded-[3rem] shadow-2xl flex-shrink-0 border-4 sm:border-8 border-white/10" style={{ backgroundColor: `#${s.c.toString(16).padStart(6, '0')}` }} />
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="font-black text-xl sm:text-5xl italic uppercase leading-none mb-1 sm:mb-3">{s.n}</h3>
                      <p className="text-xs sm:text-2xl text-slate-500 font-black tracking-widest uppercase">{unlocked ? 'COLLECTED' : `OWNERSHIP: $${s.p.toLocaleString()}`}</p>
                    </div>
                    <button onClick={() => buyOrSelect(s)} disabled={!unlocked && state.totalCash < s.p}
                      className={`w-full sm:w-auto px-6 py-2 sm:px-14 sm:py-7 rounded-xl sm:rounded-[3.5rem] font-black uppercase text-sm sm:text-3xl transition-all shadow-xl active:scale-95 ${unlocked ? (selected ? 'bg-emerald-500 text-black' : 'bg-slate-700') : (state.totalCash >= s.p ? 'bg-amber-400 text-black' : 'bg-slate-950 text-slate-700')}`}>
                      {unlocked ? (selected ? 'ACTIVE' : 'CHOOSE') : 'BUY'}
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => toggleGarage(false)} className="w-full bg-slate-800 py-4 sm:py-10 rounded-2xl sm:rounded-[4rem] text-xl sm:text-4xl font-black tracking-widest uppercase active:scale-95 shadow-2xl border-b-4 sm:border-b-[12px] border-black">EXIT</button>
          </div>
        </div>
      )}

      {/* Quiz UI: Scaled for mobile readability */}
      {state.isPaused && state.currentQuiz && (
        <div className="absolute inset-0 z-40 bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 sm:p-16">
          <div className="bg-slate-900 p-6 sm:p-20 rounded-[2rem] sm:rounded-[8rem] w-full max-w-4xl border-t-[10px] sm:border-t-[24px] border-cyan-400 shadow-2xl overflow-y-auto max-h-screen">
            <div className="flex items-center gap-2 sm:gap-6 mb-4 sm:mb-12">
              <div className="w-4 h-10 sm:w-8 sm:h-20 bg-cyan-400 rounded-full animate-bounce" />
              <span className="text-cyan-400 font-black uppercase text-sm sm:text-3xl tracking-widest font-mono italic">SAFETY PROTOCOL</span>
            </div>
            <p className="text-xl sm:text-6xl font-black mb-6 sm:mb-20 leading-tight sm:leading-[0.9] italic uppercase tracking-tighter">{state.currentQuiz.q}</p>
            <div className="grid grid-cols-1 gap-3 sm:gap-8">
              {state.currentQuiz.a.map((ans, idx) => (
                <button key={idx} onClick={() => onAnswer(idx)}
                  className="w-full p-4 sm:p-10 rounded-[1.5rem] sm:rounded-[4rem] bg-slate-800/50 hover:bg-cyan-500 hover:text-black text-left font-black text-sm sm:text-4xl transition-all border-2 border-slate-700 active:scale-[0.98] flex items-center gap-4 sm:gap-8">
                  <span className="w-8 h-8 sm:w-16 sm:h-16 rounded-full bg-black/50 flex items-center justify-center text-xs sm:text-2xl font-mono">{String.fromCharCode(65 + idx)}</span>
                  {ans}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game Over: Mobile sizing */}
      {state.isGameOver && (
        <div className="absolute inset-0 z-50 bg-black flex items-center justify-center p-4 sm:p-16">
          <div className="bg-slate-900 p-8 sm:p-24 rounded-[3rem] sm:rounded-[10rem] w-full max-w-3xl text-center border-t-[15px] sm:border-t-[30px] border-rose-600 shadow-2xl">
            <h2 className="text-5xl sm:text-9xl font-black text-rose-600 mb-4 sm:mb-10 italic uppercase tracking-tighter">FAIL</h2>
            <p className="text-slate-400 mb-8 sm:mb-20 font-black uppercase tracking-widest text-sm sm:text-3xl">{state.msg}</p>
            <div className="bg-black/90 p-4 sm:p-16 rounded-[1.5rem] sm:rounded-[6rem] mb-8 sm:mb-24 border-4 border-slate-800">
                <span className="text-slate-500 block font-black mb-2 sm:mb-6 uppercase text-[10px] sm:text-xl tracking-widest">REVENUE COLLECTED</span>
                <span className="text-4xl sm:text-[10rem] font-black text-emerald-400 font-mono italic leading-none">$ {Math.floor(state.score).toLocaleString()}</span>
            </div>
            <button onClick={retry}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-700 py-4 sm:py-12 rounded-2xl sm:rounded-[5rem] text-2xl sm:text-6xl font-black shadow-lg uppercase active:translate-y-2 italic tracking-widest">
              RETRY
            </button>
          </div>
        </div>
      )}

      {/* Controller Buttons: Sized for comfortable mobile touch */}
      {state.isActive && !state.isPaused && !state.isGameOver && (
        <div className="absolute bottom-6 sm:bottom-16 left-0 w-full px-4 sm:px-24 flex justify-between items-end pointer-events-none z-10">
          <button className="w-24 h-36 sm:w-64 sm:h-80 bg-gradient-to-b from-emerald-500 to-emerald-800 border-4 sm:border-8 border-white/20 rounded-[1.5rem] sm:rounded-[6rem] text-2xl sm:text-7xl font-black shadow-2xl pointer-events-auto active:scale-95 transition-all italic text-black uppercase tracking-tighter"
            onPointerDown={() => handleInput('gas', true)} onPointerUp={() => handleInput('gas', false)}
            onContextMenu={(e) => e.preventDefault()}>
            GAS
          </button>
          <div className="flex gap-4 sm:gap-16 pointer-events-auto">
            <button className="w-20 h-20 sm:w-48 sm:h-48 rounded-[1.5rem] sm:rounded-[4rem] border-4 sm:border-8 border-white/20 bg-white/5 backdrop-blur-3xl text-3xl sm:text-7xl font-black flex items-center justify-center active:scale-90 active:bg-cyan-500 transition-all shadow-2xl"
              onPointerDown={() => handleInput('l', true)} onPointerUp={() => handleInput('l', false)}
              onContextMenu={(e) => e.preventDefault()}>◀</button>
            <button className="w-20 h-20 sm:w-48 sm:h-48 rounded-[1.5rem] sm:rounded-[4rem] border-4 sm:border-8 border-white/20 bg-white/5 backdrop-blur-3xl text-3xl sm:text-7xl font-black flex items-center justify-center active:scale-90 active:bg-cyan-500 transition-all shadow-2xl"
              onPointerDown={() => handleInput('r', true)} onPointerUp={() => handleInput('r', false)}
              onContextMenu={(e) => e.preventDefault()}>▶</button>
          </div>
        </div>
      )}
    </div>
  );
}
