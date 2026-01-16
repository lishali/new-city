'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';

// =============================================================================
// TYPES
// =============================================================================
type BuildingType = 'empty' | 'grass' | 'house' | 'shop' | 'market' | 'park' | 'university';

interface Tile {
  building: BuildingType;
  occupied: boolean; // true if this tile is part of a multi-tile building
  parentX?: number;  // reference to the main tile of the building
  parentY?: number;
  placedAt?: number; // timestamp for animation
}

interface Tool {
  type: BuildingType | 'bulldoze';
  name: string;
  cost: number;
  sprite: BuildingType;
  size: number; // 1 = 1x1, 2 = 2x2
  category: 'residential' | 'commercial' | 'industrial' | 'services' | 'parks' | 'tools';
}

interface Theme {
  id: string;
  name: string;
  path: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================
const GRID_SIZE = 60;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const STARTING_MONEY = 100000;

const THEMES: Theme[] = [
  { id: 'cyberpunk', name: 'Cyberpunk City', path: '/assets/cyberpunk_city_Cyberpunk_City/assets' },
  { id: 'fantasy', name: 'Fantasy Kingdom', path: '/assets/fantasy_kingdom_Fantasy_Kingdom/assets' },
  { id: 'japanese', name: 'Japanese Town', path: '/assets/japanese_town_Japanese_Town/assets' },
  { id: 'medieval', name: 'Medieval Village', path: '/assets/medieval_village_Medieval_Village/assets' },
  { id: 'space', name: 'Space Colony', path: '/assets/space_colony_Space_Colony/assets' },
  { id: 'steampunk', name: 'Steampunk City', path: '/assets/steampunk_city_Steampunk_City/assets' },
  { id: 'tropical', name: 'Tropical Resort', path: '/assets/tropical_resort_Tropical_Resort/assets' },
  { id: 'underwater', name: 'Underwater City', path: '/assets/underwater_city_Underwater_City/assets' },
  { id: 'wildwest', name: 'Wild West Town', path: '/assets/wild_west_town_Wild_West_Town/assets' },
  { id: 'candy', name: 'Candy Land', path: '/assets/candy_land_Candy_Land/assets' },
];

// Building sizes and costs - bigger = more expensive, creates interesting tiling
const TOOLS: Tool[] = [
  // Tiny 1x1 - houses are the smallest unit
  { type: 'house', name: 'House', cost: 100, sprite: 'house', size: 1, category: 'residential' },
  // Small 2x2 - parks and shops
  { type: 'park', name: 'Park', cost: 300, sprite: 'park', size: 2, category: 'parks' },
  { type: 'shop', name: 'Shop', cost: 400, sprite: 'shop', size: 2, category: 'commercial' },
  // Medium 3x3 - markets
  { type: 'market', name: 'Market', cost: 1200, sprite: 'market', size: 3, category: 'industrial' },
  // Large 4x4 - university is the biggest
  { type: 'university', name: 'University', cost: 3000, sprite: 'university', size: 4, category: 'services' },
  // Tools
  { type: 'bulldoze', name: 'Bulldoze', cost: 5, sprite: 'grass', size: 1, category: 'tools' },
];

// Sound configurations for different building types
const BUILDING_SOUNDS: Record<string, { note: string; type: 'place' | 'special' }> = {
  house: { note: 'C4', type: 'place' },
  shop: { note: 'E4', type: 'place' },
  market: { note: 'G4', type: 'place' },
  university: { note: 'C5', type: 'special' },
  park: { note: 'A4', type: 'place' },
};

// =============================================================================
// HELPERS
// =============================================================================
function gridToScreen(x: number, y: number, offsetX: number, offsetY: number): { screenX: number; screenY: number } {
  const screenX = (x - y) * (TILE_WIDTH / 2) + offsetX;
  const screenY = (x + y) * (TILE_HEIGHT / 2) + offsetY;
  return { screenX, screenY };
}

function screenToGrid(screenX: number, screenY: number, offsetX: number, offsetY: number): { gridX: number; gridY: number } {
  const adjustedX = screenX - offsetX;
  const adjustedY = screenY - offsetY;
  const gridX = Math.floor((adjustedX / (TILE_WIDTH / 2) + adjustedY / (TILE_HEIGHT / 2)) / 2);
  const gridY = Math.floor((adjustedY / (TILE_HEIGHT / 2) - adjustedX / (TILE_WIDTH / 2)) / 2);
  return { gridX, gridY };
}

function createEmptyGrid(): Tile[][] {
  const grid: Tile[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      grid[y][x] = { building: 'grass', occupied: false };
    }
  }
  return grid;
}

// =============================================================================
// SOUND MANAGER
// =============================================================================
class SoundManager {
  private initialized = false;
  private synth: Tone.PolySynth | null = null;
  private noiseSynth: Tone.NoiseSynth | null = null;
  private reverb: Tone.Reverb | null = null;
  private musicSynth: Tone.PolySynth | null = null;
  private musicLoop: Tone.Loop | null = null;
  private musicPlaying = false;

  async init() {
    if (this.initialized) return;

    await Tone.start();

    this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination();

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 }
    }).connect(this.reverb);
    this.synth.volume.value = -10;

    this.noiseSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
    }).connect(this.reverb);
    this.noiseSynth.volume.value = -20;

    // Minstrel lute-like synth for background music
    const musicReverb = new Tone.Reverb({ decay: 2.5, wet: 0.4 }).toDestination();
    this.musicSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.2, release: 0.8 }
    }).connect(musicReverb);
    this.musicSynth.volume.value = -18;

    this.initialized = true;
  }

  startMusic() {
    if (!this.musicSynth || this.musicPlaying) return;

    // Medieval/minstrel melody patterns
    const melodies = [
      ['G4', 'A4', 'B4', 'D5', 'B4', 'A4', 'G4', 'E4'],
      ['E4', 'G4', 'A4', 'G4', 'E4', 'D4', 'E4', 'G4'],
      ['D4', 'E4', 'G4', 'A4', 'B4', 'A4', 'G4', 'D4'],
      ['G4', 'B4', 'D5', 'C5', 'B4', 'A4', 'G4', 'G4'],
    ];
    const bassNotes = ['G3', 'E3', 'D3', 'G3'];

    let noteIndex = 0;
    let melodyIndex = 0;

    this.musicLoop = new Tone.Loop((time) => {
      const melody = melodies[melodyIndex];
      const note = melody[noteIndex];

      // Play melody note
      this.musicSynth?.triggerAttackRelease(note, '8n', time);

      // Play bass on beats 0 and 4
      if (noteIndex === 0 || noteIndex === 4) {
        this.musicSynth?.triggerAttackRelease(bassNotes[melodyIndex], '4n', time);
      }

      noteIndex++;
      if (noteIndex >= melody.length) {
        noteIndex = 0;
        melodyIndex = (melodyIndex + 1) % melodies.length;
      }
    }, '8n');

    Tone.getTransport().bpm.value = 100;
    this.musicLoop.start(0);
    Tone.getTransport().start();
    this.musicPlaying = true;
  }

  stopMusic() {
    if (this.musicLoop) {
      this.musicLoop.stop();
      Tone.getTransport().stop();
      this.musicPlaying = false;
    }
  }

  toggleMusic(): boolean {
    if (this.musicPlaying) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
    return this.musicPlaying;
  }

  playPlace(buildingType: string) {
    if (!this.synth) return;

    const config = BUILDING_SOUNDS[buildingType];
    if (!config) return;

    // Play a pleasant chord
    const baseNote = config.note;
    if (config.type === 'special') {
      // Special buildings get a fanfare
      this.synth.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '8n');
      setTimeout(() => {
        this.synth?.triggerAttackRelease(['E4', 'G4', 'B4', 'E5'], '4n');
      }, 150);
    } else {
      // Regular buildings get a nice pop
      this.synth.triggerAttackRelease([baseNote], '16n');
      setTimeout(() => {
        const fifth = Tone.Frequency(baseNote).transpose(7).toNote();
        this.synth?.triggerAttackRelease([fifth], '16n');
      }, 50);
    }
  }

  playBulldoze() {
    if (!this.noiseSynth || !this.synth) return;
    this.noiseSynth.triggerAttackRelease('16n');
    this.synth.triggerAttackRelease(['C3', 'Eb3'], '16n');
  }

  playError() {
    if (!this.synth) return;
    this.synth.triggerAttackRelease(['E3', 'Eb3'], '32n');
  }

  playThemeChange() {
    if (!this.synth) return;
    const notes = ['C4', 'E4', 'G4', 'C5'];
    notes.forEach((note, i) => {
      setTimeout(() => {
        this.synth?.triggerAttackRelease([note], '16n');
      }, i * 80);
    });
  }
}

const soundManager = new SoundManager();

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>(0);

  const [grid, setGrid] = useState<Tile[][]>(() => createEmptyGrid());
  const [money, setMoney] = useState(STARTING_MONEY);
  const [selectedTool, setSelectedTool] = useState<Tool>(TOOLS[0]);
  const [selectedTheme, setSelectedTheme] = useState<Theme>(THEMES[0]);
  const [sprites, setSprites] = useState<Record<string, HTMLImageElement>>({});
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [soundInitialized, setSoundInitialized] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);

  // Camera state
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cameraStart, setCameraStart] = useState({ x: 0, y: 0 });

  // Initialize sound on first interaction
  const initSound = useCallback(async () => {
    if (!soundInitialized) {
      await soundManager.init();
      setSoundInitialized(true);
    }
  }, [soundInitialized]);

  // Load sprites when theme changes
  useEffect(() => {
    setSpritesLoaded(false);
    const spriteTypes = ['grass', 'house', 'shop', 'market', 'park', 'university'];
    const loadedSprites: Record<string, HTMLImageElement> = {};
    let loadCount = 0;

    spriteTypes.forEach(type => {
      const img = new Image();
      img.src = `${selectedTheme.path}/${type}.png`;
      img.onload = () => {
        loadedSprites[type] = img;
        loadCount++;
        if (loadCount === spriteTypes.length) {
          setSprites(loadedSprites);
          setSpritesLoaded(true);
        }
      };
      img.onerror = () => {
        loadCount++;
        if (loadCount === spriteTypes.length) {
          setSprites(loadedSprites);
          setSpritesLoaded(true);
        }
      };
    });
  }, [selectedTheme]);

  // Add particles effect
  const addParticles = useCallback((screenX: number, screenY: number, color: string, count: number = 12) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 3;
      newParticles.push({
        x: screenX,
        y: screenY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: 1,
        color,
        size: 3 + Math.random() * 4,
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];
  }, []);

  // Calculate offsets
  const getOffsets = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0, zoom: 1 };
    const offsetX = canvas.width / 2 + camera.x;
    const offsetY = 100 + camera.y;
    return { offsetX, offsetY, zoom };
  }, [camera, zoom]);

  // Check if a building can be placed at position
  const canPlace = useCallback((x: number, y: number, size: number): boolean => {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= GRID_SIZE || ty >= GRID_SIZE) return false;
        if (grid[ty][tx].building !== 'grass' || grid[ty][tx].occupied) return false;
      }
    }
    return true;
  }, [grid]);

  // Draw the game
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !spritesLoaded) return;

    const { offsetX, offsetY, zoom: currentZoom } = getOffsets();
    const now = Date.now();

    // Clear canvas with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply zoom transform
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(currentZoom, currentZoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // First pass: Draw all grass tiles
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const { screenX, screenY } = gridToScreen(x, y, offsetX, offsetY);
        const grassSprite = sprites['grass'];
        if (grassSprite) {
          const scale = 0.22;
          const drawWidth = grassSprite.width * scale;
          const drawHeight = grassSprite.height * scale;
          const drawX = screenX - drawWidth / 2;
          const drawY = screenY - drawHeight / 2 + TILE_HEIGHT / 2;
          ctx.drawImage(grassSprite, drawX, drawY, drawWidth, drawHeight);
        }
      }
    }

    // Second pass: Draw hover highlights
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const { screenX, screenY } = gridToScreen(x, y, offsetX, offsetY);

        if (hoveredTile && selectedTool.type !== 'bulldoze') {
          const size = selectedTool.size;
          const isInFootprint = x >= hoveredTile.x && x < hoveredTile.x + size &&
                               y >= hoveredTile.y && y < hoveredTile.y + size;
          if (isInFootprint) {
            const canPlaceHere = canPlace(hoveredTile.x, hoveredTile.y, size);
            ctx.fillStyle = canPlaceHere ? 'rgba(100, 255, 100, 0.3)' : 'rgba(255, 100, 100, 0.3)';
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
            ctx.lineTo(screenX, screenY + TILE_HEIGHT);
            ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = canPlaceHere ? 'rgba(100, 255, 100, 0.6)' : 'rgba(255, 100, 100, 0.6)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } else if (hoveredTile && hoveredTile.x === x && hoveredTile.y === y) {
          ctx.fillStyle = 'rgba(255, 100, 100, 0.3)';
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
          ctx.lineTo(screenX, screenY + TILE_HEIGHT);
          ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Collect all buildings for depth sorting
    const buildings: Array<{
      x: number;
      y: number;
      size: number;
      type: BuildingType;
      placedAt?: number;
      depth: number;
    }> = [];

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = grid[y][x];
        if (tile.building !== 'grass' && tile.building !== 'empty' && !tile.occupied) {
          const tool = TOOLS.find(t => t.type === tile.building);
          const size = tool?.size || 1;
          // Depth is based on the front-most corner of the building (x + size + y + size)
          const depth = (x + size) + (y + size);
          buildings.push({ x, y, size, type: tile.building, placedAt: tile.placedAt, depth });
        }
      }
    }

    // Sort by depth (back to front)
    buildings.sort((a, b) => a.depth - b.depth);

    // Third pass: Draw buildings in depth order
    for (const building of buildings) {
      const buildingSprite = sprites[building.type];
      if (!buildingSprite) continue;

      // Calculate animation
      let animOffset = 0;
      let animScale = 1;
      let animAlpha = 1;
      if (building.placedAt) {
        const elapsed = now - building.placedAt;
        if (elapsed < 300) {
          const progress = elapsed / 300;
          const bounce = Math.sin(progress * Math.PI) * (1 - progress);
          animOffset = -50 * (1 - progress) - bounce * 20;
          animScale = 0.8 + 0.2 * progress + bounce * 0.1;
          animAlpha = 0.7 + 0.3 * progress;
        }
      }

      // Scale building to fit its footprint - larger footprint = slightly larger sprite
      // Use sqrt to prevent huge visual differences between sizes
      const baseScale = 0.25;
      const sizeMultiplier = 1 + (building.size - 1) * 0.3; // 1x1=1.0, 2x2=1.3, 3x3=1.6, 4x4=1.9
      const scale = baseScale * sizeMultiplier * animScale;
      const drawWidth = buildingSprite.width * scale;
      const drawHeight = buildingSprite.height * scale;

      // Anchor at the center of the footprint
      const centerX = building.x + (building.size - 1) / 2;
      const centerY = building.y + (building.size - 1) / 2;
      const { screenX: anchorX, screenY: anchorY } = gridToScreen(centerX + 0.5, centerY + 0.5, offsetX, offsetY);

      const drawX = anchorX - drawWidth / 2;
      const drawY = anchorY - drawHeight + TILE_HEIGHT * building.size / 2 + animOffset;

      ctx.globalAlpha = animAlpha;
      ctx.drawImage(buildingSprite, drawX, drawY, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
    }

    // Draw particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // gravity
      p.life -= 0.02;

      if (p.life <= 0) return false;

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      return true;
    });

    // Restore canvas state (undo zoom transform)
    ctx.restore();

    // Continue animation if there are particles or recent placements
    if (particlesRef.current.length > 0 || grid.some(row => row.some(t => t.placedAt && now - t.placedAt < 300))) {
      animationFrameRef.current = requestAnimationFrame(draw);
    }
  }, [grid, sprites, spritesLoaded, hoveredTile, selectedTool, getOffsets, canPlace]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        draw();
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  // Redraw when state changes
  useEffect(() => {
    cancelAnimationFrame(animationFrameRef.current);
    draw();
  }, [draw]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    initSound();
    if (e.button === 1 || e.button === 2) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setCameraStart({ x: camera.x, y: camera.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setCamera({ x: cameraStart.x + dx, y: cameraStart.y + dy });
    } else {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { offsetX, offsetY } = getOffsets();
      const { gridX, gridY } = screenToGrid(mouseX, mouseY, offsetX, offsetY);

      if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        setHoveredTile({ x: gridX, y: gridY });
      } else {
        setHoveredTile(null);
      }
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.3, z * delta)));
  };

  const handleClick = async (e: React.MouseEvent) => {
    await initSound();
    if (isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { offsetX, offsetY } = getOffsets();
    const { gridX, gridY } = screenToGrid(mouseX, mouseY, offsetX, offsetY);

    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return;

    const { screenX, screenY } = gridToScreen(gridX, gridY, offsetX, offsetY);

    if (selectedTool.type === 'bulldoze') {
      const tile = grid[gridY][gridX];
      // Find the parent tile if this is an occupied tile
      const parentX = tile.parentX ?? gridX;
      const parentY = tile.parentY ?? gridY;
      const parentTile = grid[parentY][parentX];

      if (parentTile.building !== 'grass' && parentTile.building !== 'empty') {
        if (money >= selectedTool.cost) {
          setMoney(m => m - selectedTool.cost);
          soundManager.playBulldoze();
          addParticles(screenX, screenY, '#ff6b6b', 15);

          // Clear all tiles of the building
          setGrid(g => {
            const newGrid = g.map(row => row.map(t => ({ ...t })));
            // Find and clear all tiles belonging to this building
            for (let dy = 0; dy < GRID_SIZE; dy++) {
              for (let dx = 0; dx < GRID_SIZE; dx++) {
                const t = newGrid[dy][dx];
                if ((t.parentX === parentX && t.parentY === parentY) || (dx === parentX && dy === parentY)) {
                  newGrid[dy][dx] = { building: 'grass', occupied: false };
                }
              }
            }
            return newGrid;
          });
        }
      }
    } else {
      const size = selectedTool.size;
      if (canPlace(gridX, gridY, size) && money >= selectedTool.cost) {
        setMoney(m => m - selectedTool.cost);
        soundManager.playPlace(selectedTool.type);

        // Add particles at center of building
        const centerX = gridX + size / 2 - 0.5;
        const centerY = gridY + size / 2 - 0.5;
        const { screenX: particleX, screenY: particleY } = gridToScreen(centerX, centerY, offsetX, offsetY);
        addParticles(particleX, particleY - 30, '#4ade80', 18);

        setGrid(g => {
          const newGrid = g.map(row => row.map(t => ({ ...t })));
          const now = Date.now();

          // Set parent tile
          newGrid[gridY][gridX] = {
            building: selectedTool.type as BuildingType,
            occupied: false,
            placedAt: now,
          };

          // Mark other tiles as occupied
          for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
              if (dx === 0 && dy === 0) continue;
              newGrid[gridY + dy][gridX + dx] = {
                building: 'grass',
                occupied: true,
                parentX: gridX,
                parentY: gridY,
              };
            }
          }
          return newGrid;
        });
      } else if (money < selectedTool.cost) {
        soundManager.playError();
        addParticles(screenX, screenY, '#ef4444', 8);
      } else {
        soundManager.playError();
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  const handleThemeChange = async (themeId: string) => {
    await initSound();
    const theme = THEMES.find(t => t.id === themeId);
    if (theme) {
      setSelectedTheme(theme);
      soundManager.playThemeChange();
    }
  };

  // Group tools by category
  const toolsByCategory = TOOLS.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, Tool[]>);

  const categoryNames: Record<string, string> = {
    residential: 'Residential',
    commercial: 'Commercial',
    industrial: 'Industrial',
    services: 'Services',
    parks: 'Parks & Nature',
    tools: 'Tools',
  };

  return (
    <div className="game-container">
      <div className="sidebar">
        <div className="money-display">
          <h2>Money</h2>
          <div className="amount">${money.toLocaleString()}</div>
        </div>

        <button
          className={`music-btn ${musicPlaying ? 'playing' : ''}`}
          onClick={async () => {
            await initSound();
            const isPlaying = soundManager.toggleMusic();
            setMusicPlaying(isPlaying);
          }}
        >
          {musicPlaying ? '♪ Music On' : '♪ Music Off'}
        </button>

        <div className="theme-grid">
          <label>Theme</label>
          <div className="theme-options">
            {THEMES.map(theme => (
              <button
                key={theme.id}
                className={`theme-card ${selectedTheme.id === theme.id ? 'selected' : ''}`}
                onClick={() => handleThemeChange(theme.id)}
                title={theme.name}
              >
                <img
                  src={`${theme.path}/house.png`}
                  alt={theme.name}
                  className="theme-preview"
                />
                <span className="theme-name">{theme.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {Object.entries(toolsByCategory).map(([category, tools]) => (
          <div key={category} className="tool-section">
            <h3>{categoryNames[category]}</h3>
            {tools.map(tool => (
              <button
                key={tool.type}
                className={`tool-btn ${selectedTool.type === tool.type ? 'selected' : ''} ${tool.type === 'bulldoze' ? 'bulldoze' : ''}`}
                onClick={async () => {
                  await initSound();
                  setSelectedTool(tool);
                }}
                disabled={money < tool.cost && tool.type !== 'bulldoze'}
              >
                <span>{tool.name}</span>
                <span className="cost">${tool.cost}{tool.size > 1 ? ` (${tool.size}x${tool.size})` : ''}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="canvas-container">
        {!spritesLoaded && (
          <div className="loading">Loading {selectedTheme.name}...</div>
        )}
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
        />
        <div className="instructions">
          <kbd>Click</kbd> place · <kbd>Right-drag</kbd> pan · <kbd>Scroll</kbd> zoom
        </div>
      </div>
    </div>
  );
}
