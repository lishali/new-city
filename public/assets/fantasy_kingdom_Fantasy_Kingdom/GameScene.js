import Phaser from 'phaser';
import { Config } from './Config.js';
import { ASSETS } from './manifest.js';
import { GridManager } from './GridManager.js';
import { IsoUtils } from './IsoUtils.js';
import { UIManager } from './UIManager.js';
import { AudioManager } from './AudioManager.js';
import { getBuildingConfig, BuildingRegistry } from './BuildingRegistry.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.selectedTileType = 'house';
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.uiManager = null;
        this.audioManager = null;
        
        // Game State
        this.money = 100;
        this.population = 0;
        this.happiness = 1.0;
        this.lastTickTime = 0;
        this.tickInterval = 5000; // 5 seconds
        
        // Initialize costs from Registry
        this.costs = {};
        Object.values(BuildingRegistry).forEach(b => {
            this.costs[b.type] = b.cost;
        });

        this.costTexts = {};
    }

    preload() {
        // Dynamically load all building textures defined in the registry
        Object.values(BuildingRegistry).forEach(building => {
            const assetKey = building.texture;
            const assetUrl = ASSETS.images[assetKey];
            
            if (assetUrl) {
                this.load.image(assetKey, assetUrl);
            } else {
                console.warn(`Texture '${assetKey}' defined in BuildingRegistry not found in manifest.js`);
            }
        });
    }

    initAudio() {
        this.audioManager = new AudioManager(this);
    }

    toggleMute() {
        return this.audioManager.toggleMute();
    }

    startMusic() {
        this.audioManager.init();
    }

    playBuildSound() {
        this.audioManager.playBuildSound();
    }

    playUISound() {
        this.audioManager.playUISound();
    }

    selectBuilding(type) {
        this.selectedTileType = type;
        this.previewTile.setTexture(type);
        this.updatePreviewScale();
        this.playUISound();
        
        if (this.uiManager) {
            this.uiManager.updateSelectedBuilding(type);
        }
    }

    create() {
        this.initAudio();
        this.gridManager = new GridManager(this);
        this.uiManager = new UIManager(this);
        
        // Input listener to start music on first click
        this.input.once('pointerdown', () => {
            this.startMusic();
            this.lastTickTime = this.time.now;
        });

        // Disable context menu for right-click flipping
        this.input.mouse.disableContextMenu();

        // Start zoomed in
        this.gridManager.container.setScale(1.5);
        // Center the zoomed container
        this.gridManager.container.x = Config.width / 2;
        this.gridManager.container.y = Config.height / 4;
        
        // UI for selection
        this.uiManager.createDOMUI();

        // Load saved state (MUST be after UI creation to update UI texts)
        this.loadGame();

        // Preview cursor
        this.previewTile = this.add.image(0, 0, this.selectedTileType);
        this.previewTile.setAlpha(0.6);
        this.previewTile.setOrigin(0.5, 0.5);
        this.previewTile.isPreview = true; // Set custom property for depth sorting
        this.previewTile.isFlipped = false; // Initial flip state
        this.updatePreviewScale();
        this.gridManager.container.add(this.previewTile);

        // Input handling
        this.input.on('pointerdown', (pointer, currentlyOver) => {
            if (currentlyOver.length > 0) return;

            // Check if clicking on DOM UI (handled by stopPropagation, but double check bounds if needed)
            // Phaser DOM GameObjects don't automatically block pointer unless they are interactive.
            // But we added stopPropagation on the DOM elements themselves.
            
            if (pointer.rightButtonDown()) {
                // Flip the preview tile on right-click
                this.previewTile.isFlipped = !this.previewTile.isFlipped;
                this.updatePreviewScale();
                this.playUISound();
                return;
            }

            this.isDragging = false;
            this.dragStartX = pointer.x;
            this.dragStartY = pointer.y;
        });

        this.input.on('pointermove', (pointer) => {
            // Building Preview
            const localPos = this.getLocalPointerPos(pointer);
            const gridCoords = IsoUtils.worldToGrid(localPos.x, localPos.y);
            
            if (this.gridManager.isValidCoord(gridCoords.row, gridCoords.col)) {
                const worldPos = IsoUtils.gridToWorld(gridCoords.row, gridCoords.col);
                
                // Only update and re-sort if the cursor actually moved to a new tile
                if (this.previewTile.gridRow !== gridCoords.row || this.previewTile.gridCol !== gridCoords.col) {
                    const config = getBuildingConfig(this.selectedTileType);
                    
                    // Position preview differently for multi-tile buildings
                    if (config.visualOffset) {
                        this.previewTile.setPosition(worldPos.x, worldPos.y + Config.tileHeight / 2);
                    } else {
                        this.previewTile.setPosition(worldPos.x, worldPos.y);
                    }
                    
                    this.previewTile.gridRow = gridCoords.row;
                    this.previewTile.gridCol = gridCoords.col;
                    this.gridManager.updateDepths();
                }
                
                this.previewTile.setVisible(true);
            } else {
                this.previewTile.setVisible(false);
            }

            // Panning
            if (pointer.isDown && !this.isPanningUI) {
                const dist = Phaser.Math.Distance.Between(this.dragStartX, this.dragStartY, pointer.x, pointer.y);
                if (dist > 10) {
                    this.isDragging = true;
                    this.gridManager.container.x += (pointer.x - pointer.prevPosition.x);
                    this.gridManager.container.y += (pointer.y - pointer.prevPosition.y);
                }
            }
        });

        this.input.on('pointerup', (pointer, currentlyOver) => {
            if (pointer.button === 0 && !this.isDragging && currentlyOver.length === 0) {
                const localPos = this.getLocalPointerPos(pointer);
                const gridCoords = IsoUtils.worldToGrid(localPos.x, localPos.y);
                
                if (this.gridManager.isValidCoord(gridCoords.row, gridCoords.col)) {
                    this.gridManager.placeTile(gridCoords.row, gridCoords.col, this.selectedTileType);
                    this.playBuildSound();
                }
            }
            this.isDragging = false;
        });

        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const zoomSpeed = 0.001;
            const minZoom = 0.3;
            const maxZoom = 10;
            
            const oldZoom = this.gridManager.container.scale;
            let newZoom = oldZoom - deltaY * zoomSpeed;
            newZoom = Phaser.Math.Clamp(newZoom, minZoom, maxZoom);

            if (oldZoom !== newZoom) {
                // Zoom towards mouse position
                const mouseWorldX = (pointer.x - this.gridManager.container.x) / oldZoom;
                const mouseWorldY = (pointer.y - this.gridManager.container.y) / oldZoom;

                this.gridManager.container.setScale(newZoom);

                this.gridManager.container.x = pointer.x - mouseWorldX * newZoom;
                this.gridManager.container.y = pointer.y - mouseWorldY * newZoom;
            }
        });

        // Instructions with background
        this.instructionsGroup = this.add.container(10, 190);
        const instructionsBg = this.add.rectangle(0, 0, 850, 140, 0x000000, 0.7).setOrigin(0);
        const t1 = this.add.text(10, 10, 'Click to build/remove. Drag to move map.', {
            fontFamily: '"Press Start 2P"',
            fontSize: '20px',
            fill: '#ffffff'
        });
        const t2 = this.add.text(10, 50, 'Scroll to zoom in/out.', {
            fontFamily: '"Press Start 2P"',
            fontSize: '20px',
            fill: '#ffffff'
        });
        const t3 = this.add.text(10, 90, '(Click anywhere to start music)', {
            fontFamily: '"Press Start 2P"',
            fontSize: '16px',
            fill: '#aaaaaa'
        });
        this.instructionsGroup.add([instructionsBg, t1, t2, t3]);

        // Auto-hide instructions after 10 seconds
        this.time.delayedCall(10000, () => {
            this.tweens.add({
                targets: this.instructionsGroup,
                alpha: 0,
                duration: 1000,
                onComplete: () => this.instructionsGroup.destroy()
            });
        });
    }

    update(time, delta) {
        if (this.lastTickTime && time - this.lastTickTime >= this.tickInterval) {
            this.handleTick();
            this.lastTickTime = time;
        }
    }

    saveGame() {
        const gameState = {
            money: this.money,
            population: this.population,
            happiness: this.happiness,
            costs: this.costs,
            grid: this.gridManager.getGridData()
        };
        localStorage.setItem('townBuilder_saveState', JSON.stringify(gameState));
    }

    loadGame() {
        const saved = localStorage.getItem('townBuilder_saveState');
        if (saved) {
            try {
                const gameState = JSON.parse(saved);
                this.money = gameState.money;
                this.population = gameState.population;
                this.happiness = gameState.happiness;
                
                // Merge saved costs with defaults to handle new building types
                this.costs = { ...this.costs, ...gameState.costs };

                // Re-initialize grid with saved data
                this.gridManager.container.removeAll(true);
                this.gridManager.initGrid(gameState.grid);
                this.gridManager.updateDepths();

                // Update UI texts if they exist
                if (this.uiManager) {
                    this.updateMoney(0);
                    this.updatePopulation(0);
                    this.updateHappiness(0);
                    this.uiManager.refreshAllCosts();
                }
            } catch (e) {
                console.error("Failed to load save state", e);
            }
        }
    }

    getEffectiveHappiness() {
        const penalty = Math.max(0, this.population - 10) * 0.1;
        return this.happiness - penalty;
    }

    calculateIncome() {
        const shops = this.gridManager.countTiles('shop');
        const markets = this.gridManager.countTiles('market');
        
        let totalIncome = 0;

        if (shops > 0 || markets > 0) {
            const effectiveHappiness = Phaser.Math.Clamp(this.getEffectiveHappiness(), -0.5, 1.5);
            const baseIncomePerShop = 10 + Math.floor(this.population / 5);
            const incomePerShop = Math.floor(baseIncomePerShop * effectiveHappiness);
            
            if (shops > 0) {
                totalIncome += shops * incomePerShop;
            }

            if (markets > 0) {
                const incomePerMarket = incomePerShop * 10;
                totalIncome += markets * incomePerMarket;
            }
        }
        return totalIncome;
    }

    updateStatsUI() {
        if (this.uiManager) {
            this.uiManager.updateStats();
        }
    }

    handleTick() {
        const income = this.calculateIncome();
        
        if (income > 0) {
            const effectiveHappiness = Phaser.Math.Clamp(this.getEffectiveHappiness(), -0.5, 1.5);
            const baseIncomePerShop = 10 + Math.floor(this.population / 5);
            const incomePerShop = Math.floor(baseIncomePerShop * effectiveHappiness);
            const incomePerMarket = incomePerShop * 10;
            
            // Show floating text for shops
            this.gridManager.getTilesByType('shop').forEach(tile => {
                this.showFloatingText(`+${ASSETS.metadata.currency}${incomePerShop}`, tile.x, tile.y);
            });

            // Show floating text for markets
            this.gridManager.getTilesByType('market').forEach(tile => {
                this.showFloatingText(`+${ASSETS.metadata.currency}${incomePerMarket}`, tile.x, tile.y);
            });

            this.updateMoney(income);
        }
    }

    updateMoney(amount) {
        this.money += amount;
        this.updateStatsUI();
    }

    updateHappiness(amount) {
        this.happiness += amount;
        this.updateStatsUI();
    }

    incrementCost(type) {
        if (this.costs[type] > 0) {
            this.costs[type] = Math.round(this.costs[type] * 1.1);
            if (this.uiManager) {
                this.uiManager.updateCost(type, this.costs[type]);
            }
        }
    }

    updatePopulation(amount) {
        this.population += amount;
        this.updateStatsUI();
    }

    showFloatingText(text, x, y) {
        const matrix = this.gridManager.container.getWorldTransformMatrix();
        const worldPos = matrix.transformPoint(x, y);
        const floatText = this.add.text(worldPos.x, worldPos.y - 20, text, {
            fontFamily: '"Press Start 2P"',
            fontSize: '20px',
            fill: text.includes('+') ? '#00ff00' : '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.tweens.add({
            targets: floatText,
            y: floatText.y - 100,
            alpha: 0,
            duration: 2000,
            onComplete: () => floatText.destroy()
        });
    }

    updatePreviewScale() {
        let targetWidth = Config.tileWidth;
        const config = getBuildingConfig(this.selectedTileType);
        
        if (config.size > 1) {
            targetWidth *= config.size;
        }

        const currentWidth = this.previewTile.width;
        if (currentWidth > 0) {
            const baseScale = targetWidth / currentWidth;
            this.previewTile.setScale(this.previewTile.isFlipped ? -baseScale : baseScale, baseScale);
        }

        if (config.visualOffset) {
            this.previewTile.setOrigin(config.visualOffset.x, config.visualOffset.y);
        } else {
            this.previewTile.setOrigin(0.5, 0.5);
        }
    }

    getLocalPointerPos(pointer) {
        // Convert screen pointer to grid-container local space
        const scale = this.gridManager.container.scale;
        const x = (pointer.x - this.gridManager.container.x) / scale;
        const y = (pointer.y - this.gridManager.container.y) / scale;
        return { x, y };
    }
}
