//@ts-check
'use strict';

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { existsSync, readFileSync, mkdirSync, statSync, rmSync, watch, watchFile, unwatchFile } = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
//const Blob = require('blob');
//import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
//import { existsSync, promises, readFileSync } from 'fs';
class PluginUiServer extends HomebridgePluginUiServer {
  constructor () {
    const events = new EventEmitter();
    super();

    const plugin = 'homebridge-aladdinconnect';
    const platform = 'AladdinConnectPlatform';
    const storagePath = this.homebridgeStoragePath ?? '';
    const configPath = this.homebridgeConfigPath ?? '';
    const config = JSON.parse(readFileSync(configPath, 'utf-8')).platforms.find(plugin => plugin.platform == platform);

    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */
    let cachedAccessoriesDir;
    this.onRequest('/getCachedAccessories', async () => {
      try {
        // Define the plugin and create the array to return
        if (cachedAccessoriesDir && existsSync(cachedAccessoriesDir)) {
          return JSON.parse(readFileSync(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
        } else if (!cachedAccessoriesDir) {
          cachedAccessoriesDir = path.join(storagePath, '/accessories/cachedAccessories') + (config._bridge?.username ? ('.' + config._bridge?.username?.split(':').join('')) : '');
          return JSON.parse(readFileSync(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
        } else {
          return [];
        }
      } catch (err) {
        // Just return an empty accessory list in case of any errors
        console.log(err);
        return [];
      }
    });
    this.onRequest('/getGeneralLog', async () => {
      return path.join(storagePath, 'Aladdin Connect', 'General.log');
    });
    this.onRequest('/getLogs', async (payload) => {
      try {
        return readFileSync(payload.logPath).toString().split('\n').join('<br>');
      } catch (err) {
        return `Failed To Load Logs From ${payload.logPath}`;
      }
    });
    this.onRequest('/getRelativePath', (payload) => {
      return path.relative(path.join(__dirname, '/public/index.html'), payload.path);
    });
    this.onRequest('/deleteLog', async (payload) => {
      try {
        return rmSync(payload.logPath, { force: true });
      } catch (err) {
        return err;
      }
    });
    this.onRequest('/watchForChanges', async (payload) => {
      return new Promise((resolve, reject) => {
        if (!existsSync(payload.path)) {
          reject('File does not exist: ' + payload.path);
          return;
        }
        try {
          const aborter = new AbortController();
          const watcher = watch(payload.path, { signal: aborter.signal });
          watcher.once('change', event => {
            aborter.abort();
            resolve('');
          });
          watcher.once('error', err => {
            aborter.abort(err);
            watchFile(payload.path, () => {
              unwatchFile(payload.path);
              resolve('');
            });
          });
        } catch {
          watchFile(payload.path, () => {
            unwatchFile(payload.path);
            resolve('');
          });
        }
      });
    });
    this.ready();
  }
}

; (() => new PluginUiServer())();
