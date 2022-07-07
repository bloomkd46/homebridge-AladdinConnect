import fs from 'fs';
import { API, APIEvent, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import path from 'path';

import Aladdin, { GarageDoor } from '@bloomkd46/aladdinconnect';

import GarageDoorAccessory from './accessories/GarageDoorAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';



/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class AladdinConnectPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public garageDoors: GarageDoor[] = [];

  /** this is used to track restored cached accessories */
  private readonly cachedAccessories: PlatformAccessory[] = [];
  /** this is used to track which accessories have been restored from the cache */
  private readonly restoredAccessories: PlatformAccessory[] = [];
  /** this is used to track which accessories have been added */
  private readonly addedAccessories: PlatformAccessory[] = [];
  /** this is used to track which accessories have been configured */
  //public readonly configuredAccessories: PlatformAccessory[] = [];

  public readonly projectDir = path.join(this.api.user.storagePath(), 'Aladdin Connect');
  public readonly generalLogPath = path.join(this.projectDir, 'General.log');

  public readonly time = () => {
    const date = new Date();
    return `${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)}/${date.getFullYear()}, ` +
      `${('0' + (date.getHours() % 12)).slice(-2)}:${('0' + (date.getMinutes())).slice(-2)}:${('0' +
        (date.getSeconds())).slice(-2)} ${date.getHours() > 12 ? 'PM' : 'AM'}`;
  };

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!fs.existsSync(this.projectDir)) {
      fs.mkdirSync(this.projectDir);
    }
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.debug('Executed didFinishLaunching callback');

      fs.appendFileSync(this.generalLogPath, `[${this.time()}] Server Started\n`);

      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
    this.api.on(APIEvent.SHUTDOWN, () => {
      fs.appendFileSync(this.generalLogPath, `[${this.time()}] Server Stopped\n`);
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.cachedAccessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    if (!(this.config.email && this.config.password)) {
      this.log.error('No Email and/or Password Found');
      return;
    }
    try {
      this.garageDoors = await Aladdin.connect(this.config.email, this.config.password);
    } catch (err) {
      this.log.error('Failed To Login With Error:', err);
      fs.appendFileSync(this.generalLogPath, `[${this.time()}] Error Encountered While Logging In: ${JSON.stringify(err)}\n`);
    }
    this.log.info(
      `Loaded ${this.cachedAccessories.length} ${this.cachedAccessories.length === 1 ? 'Accessory' : 'Accessories'} From Cache`,
    );
    for (const garageDoor of this.garageDoors) {
      const uuid = this.api.hap.uuid.generate(`${garageDoor.door.id}`);
      const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
      if (existingAccessory) {
        this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);
        new GarageDoorAccessory(this, existingAccessory, garageDoor);
        this.restoredAccessories.push(existingAccessory);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', garageDoor.door.name);
        // create a new accessory
        const accessory = new this.api.platformAccessory(garageDoor.door.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = garageDoor.device;
        accessory.context.door = garageDoor.door;

        new GarageDoorAccessory(this, accessory, garageDoor);

        this.addedAccessories.push(accessory);


        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
    const accessoriesToRemove = this.cachedAccessories.filter(cachedAccessory =>
      !this.restoredAccessories.find(restoredAccessory => restoredAccessory.UUID === cachedAccessory.UUID));
    for (const accessory of accessoriesToRemove) {
      this.log.warn('Removing Accessory: ', accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    this.log.info(
      `Restored ${this.restoredAccessories.length} ${this.restoredAccessories.length === 1 ? 'Accessory' : 'Accessories'}`,
    );
    this.log.info(
      `Added ${this.addedAccessories.length} ${this.addedAccessories.length === 1 ? 'Accessory' : 'Accessories'}`,
    );
    this.log.info(
      `Removed ${accessoriesToRemove.length} ${accessoriesToRemove.length === 1 ? 'Accessory' : 'Accessories'}`,
    );
  }
}
