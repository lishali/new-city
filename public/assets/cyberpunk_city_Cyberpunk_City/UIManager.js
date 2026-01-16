import { Config } from './Config.js';
import { ASSETS } from './manifest.js';
import { BuildingRegistry } from './BuildingRegistry.js';

export class UIManager {
    constructor(scene) {
        this.scene = scene;
        this.statsContainer = null;
        this.menuContainer = null;
    }

    createDOMUI() {
        this.injectStyles();
        this.createStatsPanel();
        this.createBuildMenu();
    }

    injectStyles() {
        if (!document.getElementById('game-ui-styles')) {
            const style = document.createElement('style');
            style.id = 'game-ui-styles';
            style.innerHTML = `
                .ui-panel {
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border-radius: 15px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    font-family: "Press Start 2P";
                    pointer-events: auto;
                    user-select: none;
                }
                .stats-panel {
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    min-width: 280px;
                }
                .stats-row {
                    font-size: 20px;
                    text-shadow: 2px 2px 0 #000;
                }
                .build-menu {
                    height: 85vh;
                    width: 220px;
                    overflow-y: auto;
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                /* Scrollbar styling */
                .build-menu::-webkit-scrollbar {
                    width: 10px;
                }
                .build-menu::-webkit-scrollbar-track {
                    background: rgba(0,0,0,0.3);
                    border-radius: 5px;
                }
                .build-menu::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.3);
                    border-radius: 5px;
                }
                .build-menu::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.5);
                }
                
                .build-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 15px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 2px solid transparent;
                }
                .build-item:hover {
                    background: rgba(255, 255, 255, 0.15);
                    transform: scale(1.02);
                }
                .build-item.selected {
                    background: rgba(255, 255, 255, 0.2);
                    border-color: #ffd700;
                    box-shadow: 0 0 15px rgba(255, 215, 0, 0.2);
                }
                .build-item img {
                    width: 64px;
                    height: 64px;
                    object-fit: contain;
                    margin-bottom: 10px;
                    image-rendering: pixelated;
                    filter: drop-shadow(0 4px 4px rgba(0,0,0,0.5));
                }
                .build-name {
                    font-size: 14px;
                    margin-bottom: 8px;
                    text-align: center;
                    color: #ddd;
                    text-transform: uppercase;
                }
                .build-cost {
                    font-size: 12px;
                    color: #ffd700;
                }
                .build-cost.free {
                    color: #00ff00;
                }
                .audio-toggle {
                    margin-top: auto;
                    padding: 15px;
                    text-align: center;
                    background: rgba(0,0,0,0.5);
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    border: 1px solid rgba(255,255,255,0.1);
                    transition: background 0.2s;
                }
                .audio-toggle:hover {
                    background: rgba(255,255,255,0.1);
                }
            `;
            document.head.appendChild(style);
        }
    }

    createStatsPanel() {
        const statsHTML = `
            <div class="stats-row" id="money-display">
                ${ASSETS.metadata.currencyIcon} ${ASSETS.metadata.currency}${this.scene.money}
                <span id="income-display" style="font-size: 0.6em; color: #00ff00; margin-left: 5px;">(+$0)</span>
            </div>
            <div class="stats-row" id="pop-display">👥 ${this.scene.population}</div>
            <div class="stats-row" id="happiness-display">😊 ${this.scene.happiness.toFixed(1)}</div>
        `;
        this.statsContainer = this.scene.add.dom(20, 20).createFromHTML(`<div class="ui-panel stats-panel">${statsHTML}</div>`);
        this.statsContainer.setOrigin(0, 0);
    }

    createBuildMenu() {
        let menuHTML = `<div class="ui-panel build-menu">`;
        
        // Dynamically create menu items from Registry
        Object.values(BuildingRegistry).forEach(building => {
            const type = building.type;
            const cost = this.scene.costs[type];
            const costStr = cost > 0 ? `${ASSETS.metadata.currency}${cost}` : 'FREE';
            const costClass = cost > 0 ? '' : 'free';
            
            menuHTML += `
                <div class="build-item ${type === this.scene.selectedTileType ? 'selected' : ''}" id="btn-${type}">
                    <img src="${ASSETS.images[type]}" alt="${type}">
                    <div class="build-name">${building.name}</div>
                    <div class="build-cost ${costClass}" id="cost-${type}">${costStr}</div>
                </div>
            `;
        });
        
        menuHTML += `<div class="audio-toggle" id="audio-btn">🔊 ON</div>`;
        menuHTML += `</div>`;

        // Position on the right
        this.menuContainer = this.scene.add.dom(Config.width - 20, Config.height / 2).createFromHTML(menuHTML);
        this.menuContainer.setOrigin(1, 0.5);

        // Interaction logic
        this.menuContainer.addListener('click');
        this.menuContainer.addListener('mousedown');
        this.menuContainer.addListener('pointerdown');

        this.menuContainer.on('click', (event) => {
            // Handle building selection
            const btn = event.target.closest('.build-item');
            if (btn) {
                const id = btn.id.replace('btn-', '');
                this.scene.selectBuilding(id);
            }

            // Handle audio
            if (event.target.closest('#audio-btn')) {
                const audioBtn = this.menuContainer.node.querySelector('#audio-btn');
                const muted = this.scene.toggleMute();
                audioBtn.innerText = muted ? '🔇 OFF' : '🔊 ON';
                audioBtn.style.color = muted ? '#ff4444' : '#ffffff';
            }
        });
        
        // Prevent map interaction when interacting with UI
        const stopProp = (event) => {
             const nativeEvent = event.event || event;
             if (nativeEvent.stopPropagation) {
                 nativeEvent.stopPropagation();
             }
        };
        this.menuContainer.on('pointerdown', stopProp);
        this.menuContainer.on('mousedown', stopProp);
    }

    updateStats() {
        if (!this.statsContainer) return;

        // Money
        const moneyEl = this.statsContainer.node.querySelector('#money-display');
        const income = this.scene.calculateIncome ? this.scene.calculateIncome() : 0;
        
        if (moneyEl) {
            // Re-render the whole line to ensure structure is correct
            // Or we can query inside moneyEl if we structured it differently. 
            // Currently moneyEl contains text + span.
            // Safest way is to rebuild the innerHTML to preserve the span
            moneyEl.innerHTML = `
                ${ASSETS.metadata.currencyIcon} ${ASSETS.metadata.currency}${this.scene.money}
                <span id="income-display" style="font-size: 0.6em; color: #00ff00; margin-left: 5px;">(+${ASSETS.metadata.currency}${income})</span>
            `;
        }

        // Population
        const popEl = this.statsContainer.node.querySelector('#pop-display');
        if (popEl) popEl.innerText = `👥 ${this.scene.population}`;

        // Happiness
        const effectiveHappiness = this.scene.getEffectiveHappiness();
        const displayHappiness = Phaser.Math.Clamp(effectiveHappiness, -0.5, 1.5);
        const happyEl = this.statsContainer.node.querySelector('#happiness-display');
        if (happyEl) {
            happyEl.innerText = `😊 ${displayHappiness.toFixed(1)}`;
            const color = displayHappiness >= 1.0 ? '#00ff00' : (displayHappiness >= 0.5 ? '#ffffff' : '#ff0000');
            happyEl.style.color = color;
        }
    }

    updateCost(type, newCost) {
        if (this.menuContainer) {
            const el = this.menuContainer.node.querySelector(`#cost-${type}`);
            if (el) {
                el.innerText = `${ASSETS.metadata.currency}${newCost}`;
            }
        }
    }

    refreshAllCosts() {
        if (this.menuContainer) {
            Object.keys(this.scene.costs).forEach(type => {
                const el = this.menuContainer.node.querySelector(`#cost-${type}`);
                if (el) {
                    const cost = this.scene.costs[type];
                    el.innerText = cost > 0 ? `${ASSETS.metadata.currency}${cost}` : 'FREE';
                    el.className = `build-cost ${cost > 0 ? '' : 'free'}`;
                }
            });
        }
    }

    updateSelectedBuilding(type) {
        const buttons = this.menuContainer.node.querySelectorAll('.build-item');
        buttons.forEach(btn => {
            if (btn.id === `btn-${type}`) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }
}