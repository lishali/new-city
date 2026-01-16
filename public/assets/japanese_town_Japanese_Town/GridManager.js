import { Config } from './Config.js';
import { IsoUtils } from './IsoUtils.js';
import { Tile } from './Tile.js';
import { getBuildingConfig, isMultiTile } from './BuildingRegistry.js';
import { ASSETS } from './manifest.js';

export class GridManager {
    constructor(scene) {
        this.scene = scene;
        this.grid = []; // 2D array of Tile objects
        this.container = scene.add.container(Config.width / 2, 200); // Center the grid
        
        this.initGrid();
    }

    initGrid(savedData = null) {
        for (let r = 0; r < Config.gridSize; r++) {
            this.grid[r] = [];
            for (let c = 0; c < Config.gridSize; c++) {
                const worldPos = IsoUtils.gridToWorld(r, c);
                const tileData = savedData ? savedData[r][c] : { type: 'grass', flipped: false, masterTile: null, isMaster: false };
                const tile = new Tile(this.scene, worldPos.x, worldPos.y, tileData.type, r, c);
                
                tile.masterTile = tileData.masterTile || null;
                tile.isMaster = tileData.isMaster || false;
                
                if (tileData.flipped) tile.setFlip(true);
                
                // Hide non-master tiles of multi-tile structures
                if (tile.masterTile && !tile.isMaster) {
                    tile.setVisible(false);
                }
                
                this.container.add(tile);
                this.grid[r][c] = tile;
            }
        }
    }

    getGridData() {
        const data = [];
        for (let r = 0; r < Config.gridSize; r++) {
            data[r] = [];
            for (let c = 0; c < Config.gridSize; c++) {
                const tile = this.grid[r][c];
                data[r][c] = {
                    type: tile.texture.key,
                    flipped: tile.isFlipped,
                    masterTile: tile.masterTile,
                    isMaster: tile.isMaster
                };
            }
        }
        return data;
    }

    placeTile(row, col, type) {
        if (!this.isValidCoord(row, col)) return;

        const config = getBuildingConfig(type);
        const multiTile = config.size > 1;
        const size = config.size;

        // Check if area is available
        if (multiTile) {
            for (let r = row; r < row + size; r++) {
                for (let c = col; c < col + size; c++) {
                    if (!this.isValidCoord(r, c)) {
                        this.scene.showFloatingText("SPACE BLOCKED", this.grid[row][col].x, this.grid[row][col].y);
                        return;
                    }
                    
                    const tile = this.grid[r][c];
                    // Check if occupied (non-grass or part of a structure)
                    if (tile.texture.key !== 'grass' || tile.masterTile) {
                        this.scene.showFloatingText("SPACE BLOCKED", this.grid[row][col].x, this.grid[row][col].y);
                        return;
                    }
                }
            }
        }

        const oldTile = this.grid[row][col];
        const oldType = oldTile.texture.key;
        const oldConfig = getBuildingConfig(oldType);

        // Prevent building over existing structures (single tile)
        if (!multiTile && type !== 'grass') {
            const isOccupied = oldType !== 'grass' || oldTile.masterTile;
            // Block if occupied, unless we're just rotating the same building type
            if (isOccupied && oldType !== type) {
                this.scene.showFloatingText("OCCUPIED", oldTile.x, oldTile.y);
                return;
            }
        }
        const oldFlipped = oldTile.isFlipped;
        const newFlipped = this.scene.previewTile.isFlipped;

        if (oldType === type && oldFlipped === newFlipped && !multiTile) return;

        // Calculate cost
        const cost = this.scene.costs[type] || config.cost;

        // Only charge if it's a new building or a different type
        if (oldType !== type) {
            if (cost > 0 && this.scene.money < cost) {
                this.scene.showFloatingText(`NEED $${cost}`, oldTile.x, oldTile.y);
                return;
            }

            // Check requirements
            if (config.requirements) {
                if (config.requirements.population && this.scene.population < config.requirements.population) {
                     this.scene.showFloatingText(`NEED ${config.requirements.population} 👥`, oldTile.x, oldTile.y);
                     return;
                }
            }

            // Deduct money and increase cost
            if (cost > 0) {
                this.scene.updateMoney(-cost);
                this.scene.incrementCost(type);
            }

            // Clean up old building if it was a multi-tile
            if (oldTile.masterTile) {
                this.clearMultiTile(oldTile.masterTile);
            } else if (oldType !== 'grass') {
                // Reverse effects of old building
                if (oldConfig.effects.population) this.scene.updatePopulation(-oldConfig.effects.population);
                if (oldConfig.effects.happiness) this.scene.updateHappiness(-oldConfig.effects.happiness);
            }

            // Apply new effects
            if (config.effects.population) this.scene.updatePopulation(config.effects.population);
            if (config.effects.happiness) this.scene.updateHappiness(config.effects.happiness);
            
            if (config.floatText) {
                this.scene.showFloatingText(config.floatText, oldTile.x, oldTile.y);
            }

            if (multiTile) {
                // Set up multi-tile
                for (let r = row; r < row + size; r++) {
                    for (let c = col; c < col + size; c++) {
                        const tile = this.grid[r][c];
                        tile.masterTile = { row, col };
                        if (r === row && c === col) {
                            tile.updateType(type);
                            tile.setFlip(newFlipped);
                            tile.isMaster = true;
                            tile.setVisible(true);
                        } else {
                            // Hide non-master tiles as the master tile covers this area
                            tile.setVisible(false);
                            tile.isMaster = false;
                        }
                    }
                }
            }
        }

        if (!multiTile) {
            oldTile.updateType(type);
            oldTile.setFlip(newFlipped);
            oldTile.masterTile = null;
            oldTile.isMaster = false;
        }
        
        this.updateDepths();
        this.scene.saveGame();
    }

    clearMultiTile(masterPos) {
        const master = this.grid[masterPos.row][masterPos.col];
        const type = master.texture.key;
        const config = getBuildingConfig(type);
        const size = config.size;

        // Reverse effects
        if (config.effects.population) this.scene.updatePopulation(-config.effects.population);
        if (config.effects.happiness) this.scene.updateHappiness(-config.effects.happiness);

        for (let r = masterPos.row; r < masterPos.row + size; r++) {
            for (let c = masterPos.col; c < masterPos.col + size; c++) {
                const tile = this.grid[r][c];
                tile.updateType('grass');
                tile.masterTile = null;
                tile.isMaster = false;
                tile.setVisible(true);
                tile.setFlip(false);
            }
        }
    }

    countTiles(type) {
        let count = 0;
        for (let r = 0; r < Config.gridSize; r++) {
            for (let c = 0; c < Config.gridSize; c++) {
                if (this.grid[r][c].texture.key === type) count++;
            }
        }
        return count;
    }

    getTilesByType(type) {
        const tiles = [];
        for (let r = 0; r < Config.gridSize; r++) {
            for (let c = 0; c < Config.gridSize; c++) {
                if (this.grid[r][c].texture.key === type) tiles.push(this.grid[r][c]);
            }
        }
        return tiles;
    }

    updateDepths() {
        // Simple depth sorting for isometric: row + col
        this.container.list.sort((a, b) => {
            const rowA = a.gridRow ?? 999;
            const colA = a.gridCol ?? 999;
            const rowB = b.gridRow ?? 999;
            const colB = b.gridCol ?? 999;
            
            let depthA = rowA + colA;
            let depthB = rowB + colB;

            const configA = getBuildingConfig(a.texture?.key);
            const configB = getBuildingConfig(b.texture?.key);

            // Adjust for multi-tiles
            // We use (size - 1) so the building sorts with the 'middle' or 'front-internal' tiles of its footprint,
            // but stays BEHIND the external tiles that are directly in front of it.
            if (configA.size > 1) depthA += configA.size - 1;
            if (configB.size > 1) depthB += configB.size - 1;

            if (a.texture?.key !== 'grass') {
                depthA += 0.1;
            }
            if (b.texture?.key !== 'grass') {
                depthB += 0.1;
            }
            
            if (Math.abs(depthA - depthB) > 0.01) {
                return depthA - depthB;
            }
            
            // Secondary sort by Row
            if (rowA !== rowB) {
                return rowA - rowB;
            }

            // Tie-breaker: Preview always on top of placed items at exact same sorting position
            if (a.isPreview) return 1;
            if (b.isPreview) return -1;

            return 0;
        });
    }

    isValidCoord(row, col) {
        return row >= 0 && row < Config.gridSize && col >= 0 && col < Config.gridSize;
    }

    getTileAt(row, col) {
        if (this.isValidCoord(row, col)) {
            return this.grid[row][col];
        }
        return null;
    }
}
