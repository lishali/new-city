export const BuildingRegistry = {
    grass: {
        type: 'grass',
        name: 'Grass',
        cost: 0,
        size: 1, // 1x1
        effects: {},
        texture: 'grass'
    },
    house: {
        type: 'house',
        name: 'House',
        cost: 60,
        size: 1,
        effects: {
            population: 1
        },
        texture: 'house',
        floatText: '+1 👥'
    },
    shop: {
        type: 'shop',
        name: 'Shop',
        cost: 40,
        size: 1,
        effects: {
            happiness: -0.1
        },
        texture: 'shop',
        floatText: '-0.1 😊'
    },
    park: {
        type: 'park',
        name: 'Park',
        cost: 100,
        size: 1,
        effects: {
            happiness: 0.2
        },
        texture: 'park',
        floatText: '+0.2 😊'
    },
    university: {
        type: 'university',
        name: 'University',
        cost: 1000,
        size: 2, // 2x2
        effects: {
            population: -1,
            happiness: 0.5
        },
        requirements: {
            population: 1
        },
        texture: 'university',
        floatText: '+0.5 😊 -1 👥',
        visualOffset: { x: 0.5, y: 0.6 }
    },
    market: {
        type: 'market',
        name: 'Market',
        cost: 10000,
        size: 2, // 2x2
        effects: {},
        texture: 'market',
        floatText: 'MARKET BUILT',
        visualOffset: { x: 0.5, y: 0.6 }
    }
};

export const getBuildingConfig = (type) => {
    return BuildingRegistry[type] || BuildingRegistry.grass;
};

export const isMultiTile = (type) => {
    const config = getBuildingConfig(type);
    return config.size > 1;
};
