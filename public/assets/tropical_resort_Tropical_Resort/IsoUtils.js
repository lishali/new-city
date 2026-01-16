import { Config } from './Config.js';

export class IsoUtils {
    /**
     * Converts grid coordinates (row, col) to world screen coordinates (x, y)
     */
    static gridToWorld(row, col) {
        const x = (col - row) * (Config.tileWidth / 2);
        const y = (col + row) * (Config.tileHeight / 2);
        return { x, y };
    }

    /**
     * Converts world screen coordinates (x, y) to grid coordinates (row, col)
     */
    static worldToGrid(worldX, worldY) {
        const halfWidth = Config.tileWidth / 2;
        const halfHeight = Config.tileHeight / 2;
        
        const col = (worldX / halfWidth + worldY / halfHeight) / 2;
        const row = (worldY / halfHeight - worldX / halfWidth) / 2;
        
        return { 
            row: Math.floor(row), 
            col: Math.floor(col) 
        };
    }
}
