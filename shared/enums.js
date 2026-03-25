const PINS = {
    // Entrées (Capteurs)
    IN_0: 'IN 0',
    IN_1: 'IN 1',
    IN_2: 'IN 2',
    IN_3: 'IN 3',
    IN_4: 'IN 4',
    IN_5: 'IN 5',
    VOL_0: 'VOL 0',
    VOL_1: 'VOL 1',
    ONE_WIRE: '1-WIRE',
    // Modbus / RS485 usages
    TEMP: '485 A',
    HUM: '485 B',

    // Sorties (Actionneurs)
    OUT_0: 'OUT 0',
    OUT_1: 'OUT 1',
    OUT_2: 'OUT 2',
    OUT_3: 'OUT 3',
    
    // Alias pour la logique métier
    VALVE_1: 'OUT 0',
    VALVE_2: 'OUT 1',
};

module.exports = { PINS };
