import Phaser from 'phaser';
import { Config } from './Config.js';
import { GameScene } from './GameScene.js';

const phaserConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#2d2d2d',
    dom: {
        createContainer: true
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Config.width,
        height: Config.height
    },
    scene: [GameScene]
};

const game = new Phaser.Game(phaserConfig);
