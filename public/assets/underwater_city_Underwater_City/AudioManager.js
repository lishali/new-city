import * as Tone from 'tone';
import { ASSETS } from './manifest.js';

export class AudioManager {
    constructor(scene) {
        this.scene = scene;
        this.isMuted = false;
        this.initialized = false;
        
        // Synth for build sounds
        this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
        this.synth.volume.value = -10;
        
        // Synth for UI sounds
        this.uiSynth = new Tone.MonoSynth({
            oscillator: { type: "square" },
            envelope: { attack: 0.01, release: 0.1 }
        }).toDestination();
        this.uiSynth.volume.value = -15;

        // Background Music
        this.bgMusicPlayer = new Tone.Player({
            url: ASSETS.audio.bgMusic,
            loop: true,
            autostart: false,
            fadeOut: 1
        }).toDestination();
        this.bgMusicPlayer.volume.value = -10;
    }

    async init() {
        if (this.initialized) return;
        
        await Tone.start();
        this.initialized = true;
        
        if (this.bgMusicPlayer.loaded) {
            this.bgMusicPlayer.start();
        } else {
            this.bgMusicPlayer.on('load', () => {
                this.bgMusicPlayer.start();
            });
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        Tone.getDestination().mute = this.isMuted;
        this.playUISound();
        return this.isMuted;
    }

    playBuildSound() {
        if (!this.initialized) return;
        this.synth.triggerAttackRelease("C4", "8n");
        this.synth.triggerAttackRelease("E4", "8n", "+0.05");
    }

    playUISound() {
        if (!this.initialized) return;
        this.uiSynth.triggerAttackRelease("G5", "16n");
    }
}
