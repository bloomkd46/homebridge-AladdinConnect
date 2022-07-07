import { GarageDoor } from 'aladdinconnect';
import fs from 'fs';
import { CharacteristicChange, HapStatusError, PlatformAccessory, Service } from 'homebridge';
import path from 'path';

import { AladdinConnectPlatform } from '../platform';



export default class Accessory {
  protected batteryService?: Service;
  protected name: string;
  protected log: (type: 'info' | 'warn' | 'error' | 'debug' | 1 | 2 | 3 | 4, message: string, ...args: unknown[]) => void;
  protected StatusError: typeof HapStatusError;
  protected logPath: string;

  constructor(
    platform: AladdinConnectPlatform,
    accessory: PlatformAccessory,
    garageDoor: GarageDoor,
  ) {
    this.name = garageDoor.door.name;
    this.logPath = path.join(platform.projectDir, this.name + '.log');

    this.log = (type: 'info' | 'warn' | 'error' | 'debug' | 1 | 2 | 3 | 4, message: string, ...args: unknown[]) => {
      const parsedArgs = args.map(arg => JSON.stringify(arg, null, 2));

      //if (typeof type === 'number') {
      if (type < 4 || typeof type === 'string') {
        fs.appendFileSync(platform.generalLogPath, `[${platform.time()}] ${this.name}: ${message} ${parsedArgs.join(' ')}\n`);
      }
      fs.appendFileSync(this.logPath, `[${platform.time()}] ${message} ${parsedArgs.join(' ')}\n`);
      if (typeof type === 'string') {
        platform.log[type](`${this.name}: ${message} `, ...parsedArgs);
      } else if (type <= (platform.config.logLevel ?? 3)) {
        platform.log.info(`${this.name}: ${message} `, ...parsedArgs);
      } else {
        platform.log.debug(`${this.name}: ${message} `, ...parsedArgs);
      }
    };
    this.log(4, 'Server Started');
    this.StatusError = platform.api.hap.HapStatusError;

    platform.api.on('shutdown', () => {
      this.log(4, 'Server Stopped');
      accessory.context.logPath = this.logPath;
      accessory.context.device = garageDoor.device;
      accessory.context.door = garageDoor.door;
      platform.api.updatePlatformAccessories([accessory]);
    });

    // set accessory information
    accessory.getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, garageDoor.device.vendor)
      .setCharacteristic(platform.Characteristic.SerialNumber, garageDoor.device.serial)
      .setCharacteristic(platform.Characteristic.Model, garageDoor.device.model)
      .setCharacteristic(platform.Characteristic.Name, this.name)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, garageDoor.device.lua_version)
      .getCharacteristic(platform.Characteristic.Identify).on('set', () => {
        this.log('info', 'Identify Triggered:', 'Device:', garageDoor.device, 'Door:', garageDoor.door);
      });

    if (garageDoor.door.battery_level && (platform.config.batteryDetection ?? true)) {
      this.batteryService = accessory.getService(platform.Service.Battery);
      if (!this.batteryService) {
        this.log('info', 'Adding Battery Support');
        this.batteryService = accessory.addService(platform.Service.Battery);
      }

      this.batteryService.setCharacteristic(platform.Characteristic.Name, this.name + ' Battery');
      this.batteryService.getCharacteristic(platform.Characteristic.StatusLowBattery)
        .onGet(() => {
          return (garageDoor.door.battery_level < (platform.config.lowBatteryLevel || 15)) ? 1 : 0;
        }).on('change', async (value: CharacteristicChange): Promise<void> => {
          if (value.newValue !== value.oldValue) {
            this.log(value.newValue === 1 ? 'warn' : 2, 'Battery Level', value.newValue === 1 ? 'Low' : 'Normal');
          }
        });
      this.batteryService.getCharacteristic(platform.Characteristic.BatteryLevel)
        .onGet(() => {
          return garageDoor.door.battery_level;
        }).on('change', async (value: CharacteristicChange): Promise<void> => {
          if (value.newValue !== value.oldValue) {
            this.log(4, `Updating Battery Level To ${value.newValue}%`);
          }
        });
      this.batteryService.setCharacteristic(platform.Characteristic.ChargingState, 2)
    } else if (!(platform.config.batteryDetection ?? true) && accessory.getService(platform.Service.Battery)) {
      this.log('warn', 'Removing Battery Support');
      accessory.removeService(accessory.getService(platform.Service.Battery)!);
    }
  }
}
