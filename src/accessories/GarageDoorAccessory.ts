import { CharacteristicChange, CharacteristicValue, HAPStatus, PlatformAccessory, Service } from 'homebridge';

import { DesiredDoorStatus, DoorStatus, GarageDoor } from '@bloomkd46/aladdinconnect';

import { AladdinConnectPlatform } from '../platform';
import Accessory from './Accessory';



export default class GarageDoorAccessory extends Accessory {
  private service: Service;
  private lastCurrentState: CurrentDoorState = CurrentDoorState.STOPPED;

  constructor(
    private readonly platform: AladdinConnectPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly garageDoor: GarageDoor,
  ) {
    super(platform, accessory, garageDoor);

    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) ||
      this.accessory.addService(this.platform.Service.GarageDoorOpener);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.garageDoor.door.name);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .onGet(this.getCurrentDoorState.bind(this))
      .on('change', this.notifyCurrentDoorState.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(this.getObstructionDetected.bind(this))
      .on('change', this.notifyObstructionDetected.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .onGet(this.getTargetDoorState.bind(this))
      .onSet(this.setTargetDoorState.bind(this));

    //Automatically watch for changes
    let activeRefreshes = 0;
    setInterval(async () => {
      const currentDoorState = await this.getCurrentDoorState();
      if (currentDoorState !== this.lastCurrentState) {
        activeRefreshes = 0;
      }
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, currentDoorState);
    }, (this.platform.config.refreshInterval || 12) * 1000);
    setInterval(async () => {
      if (activeRefreshes < (this.platform.config.activeRefreshDuration || 300) / (this.platform.config.activeRefreshInterval || 3)) {
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, await this.getCurrentDoorState());
      }
      activeRefreshes++;
    }, (this.platform.config.activeRefreshInterval || 3) * 1000);
  }

  async getCurrentDoorState(): Promise<CurrentDoorState> {
    return new Promise((resolve, reject) => {
      this.garageDoor.get().then(value => {
        this.service.updateCharacteristic(this.platform.Characteristic.ObstructionDetected, this.getObstructionDetected());
        this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.getTargetDoorState());

        switch (value[1].status) {
          case DoorStatus.UNKNOWN:
            resolve(CurrentDoorState.STOPPED);
            break;
          case DoorStatus.OPEN:
            resolve(CurrentDoorState.OPEN);
            break;
          case DoorStatus.OPENING:
            resolve(CurrentDoorState.OPENING);
            break;
          case DoorStatus.TIMEOUT_OPENING:
            resolve(CurrentDoorState.STOPPED);
            break;
          case DoorStatus.CLOSED:
            resolve(CurrentDoorState.CLOSED);
            break;
          case DoorStatus.CLOSING:
            resolve(CurrentDoorState.CLOSING);
            break;
          case DoorStatus.TIMEOUT_CLOSING:
            resolve(CurrentDoorState.STOPPED);
            break;
          case DoorStatus.NOT_CONFIGURED:
            //Will tell the home app to display a message stating to finish configuring accessory in its own app
            reject(new this.StatusError(HAPStatus.INSUFFICIENT_AUTHORIZATION));
        }
        this.accessory.context.logPath = this.logPath;
        this.accessory.context.device = this.garageDoor.device;
        this.accessory.context.door = this.garageDoor.door;
        this.platform.api.updatePlatformAccessories([this.accessory]);
      }).catch(err => {
        this.log('error', 'Failed To Fetch Current Door State With Error:', err);
        reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
      });
    });
  }

  async notifyCurrentDoorState(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      switch (value.newValue) {
        case CurrentDoorState.OPEN:
          this.log(2, 'Opened');
          break;
        case CurrentDoorState.CLOSED:
          this.log(2, 'Closed');
          break;
        case CurrentDoorState.OPENING:
          this.log(3, 'Opening...');
          break;
        case CurrentDoorState.CLOSING:
          this.log(3, 'Closing...');
          break;
        case CurrentDoorState.STOPPED:
          this.log(1, 'Stopped');
          break;
      }
    }
  }

  getObstructionDetected(): boolean {
    return this.garageDoor.door.fault !== 0 ||
      [DoorStatus.TIMEOUT_CLOSING, DoorStatus.TIMEOUT_OPENING].includes(this.garageDoor.door.status);
  }

  async notifyObstructionDetected(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(1, value.newValue ? 'Obstruction Detected' : 'Obstruction Cleared');
    }
  }

  getTargetDoorState(): TargetDoorState {
    switch (this.garageDoor.door.desired_status) {
      case DesiredDoorStatus.CLOSED:
        return TargetDoorState.CLOSED;
      case DesiredDoorStatus.OPEN:
        return TargetDoorState.OPEN;
      case DesiredDoorStatus.NONE:
        return [DoorStatus.OPEN, DoorStatus.OPENING, DoorStatus.TIMEOUT_OPENING].includes(this.garageDoor.door.status) ?
          TargetDoorState.OPEN : TargetDoorState.CLOSED;
    }
  }

  async setTargetDoorState(value: TargetDoorState | CharacteristicValue): Promise<void> {
    return new Promise((resolve, reject) => {
      if (value === TargetDoorState.OPEN) {
        this.garageDoor.open().then(() => resolve()).catch(err => {
          this.log('error', 'Failed To Open With Error:', err);
          reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        });
      } else if (value === TargetDoorState.CLOSED) {
        this.garageDoor.close().then(() => resolve()).catch(err => {
          this.log('error', 'Failed To Close With Error:', err);
          reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        });
      }
    });
  }

}
enum CurrentDoorState {
  OPEN = 0,
  CLOSED = 1,
  OPENING = 2,
  CLOSING = 3,
  STOPPED = 4,
}
enum TargetDoorState {
  OPEN = 0,
  CLOSED = 1
}