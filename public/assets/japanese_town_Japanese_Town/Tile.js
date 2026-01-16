import Phaser from 'phaser';
import { Config } from './Config.js';
import { IsoUtils } from './IsoUtils.js';
import { getBuildingConfig } from './BuildingRegistry.js';

export class Tile extends Phaser.GameObjects.Image {
    constructor(scene, x, y, texture, row, col) {
        super(scene, x, y, texture);
        this.scene = scene;
        this.gridRow = row;
        this.gridCol = col;
        this.isFlipped = false;
        
        this.setOrigin(0.5, 0.5);
        this.updateScale();
        
        scene.add.existing(this);
    }

    setFlip(flipped) {
        this.isFlipped = flipped;
        this.updateScale();
    }

    updateType(texture) {
        this.setTexture(texture);
        this.updateScale();
    }

    updateScale() {
        // Adjust scale so the tile fits the configured tileWidth
        let targetWidth = Config.tileWidth;
        const currentWidth = this.width;
        
        const config = getBuildingConfig(this.texture.key);

        // Multi-tiles are 2x2, so visual should be twice as wide
        if (config.size > 1) {
            targetWidth *= config.size;
        }

        if (currentWidth > 0) {
            const baseScale = targetWidth / currentWidth;
            this.setScale(this.isFlipped ? -baseScale : baseScale, baseScale);
        }

        // Reset position to grid default first
        const worldPos = IsoUtils.gridToWorld(this.gridRow, this.gridCol);
        
        // Adjust origin and position based on tile type
        if (config.visualOffset) {
            // The junction of a 2x2 area is tileHeight/2 below the top tile's center
            this.setPosition(worldPos.x, worldPos.y + Config.tileHeight / 2);
            this.setOrigin(config.visualOffset.x, config.visualOffset.y);
        } else {
            this.setPosition(worldPos.x, worldPos.y);
            this.setOrigin(0.5, 0.5);
        }
    }
}
