import { BackgroundResData, CallFuncOption, PortName, reqData } from './index';
import {
  filter,
  fromEventPattern,
  lastValueFrom,
  Observable,
  take,
} from 'rxjs';
import { isDev } from '../../utils/env';
import { ErrorCode } from '../background/errors';
import mitt, { Emitter } from 'mitt';
import errorToString from './errorToString';

function log(message: string, details?: any, devOnly = true) {
  if (devOnly && !isDev) return;
  console.log('[api client]', message, details);
}

export interface ApiClientEventListeners {
  authExpired: (properties: undefined) => void;
}
export type ApiClientEvent = keyof ApiClientEventListeners;
export type ApiClientEventsMap = {
  [E in keyof ApiClientEventListeners]: Parameters<
    ApiClientEventListeners[E]
  >[0];
};

export class BackgroundApiClient {
  private port: chrome.runtime.Port;
  private portObservable: Observable<BackgroundResData>;
  private connected: boolean = false;
  private readonly events: Emitter<ApiClientEventsMap>;

  constructor() {
    this.events = mitt();
    this.connect();
  }

  private connect() {
    this.port = chrome.runtime.connect({
      name: PortName.SUIET_UI_BACKGROUND,
    });
    log('connect to port', this.port);
    this.connected = true;

    this.initPortObservable(this.port);
    this.port.onDisconnect.addListener(() => {
      log('port disconnected');
      this.connected = false;

      // retry connection
      try {
        this.connect();
        log('retry port reconnection after disconnected');
      } catch (e) {
        console.error('reconnect to port failed', e);
      }
    });
  }

  private initPortObservable(port: chrome.runtime.Port) {
    this.portObservable = fromEventPattern(
      (h) => port.onMessage.addListener(h),
      (h) => port.onMessage.removeListener(h),
      (data) => {
        try {
          return data;
        } catch (e) {
          throw new Error('cannot parse res data');
        }
      }
    );
  }

  async callFunc<Req, Res>(
    funcName: string,
    payload: Req,
    options?: CallFuncOption
  ): Promise<Res> {
    if (!this.connected) {
      log('port is disconnected', this.port);
      throw new Error('[api client] port is disconnected');
    }
    const reqParams = reqData(
      funcName,
      typeof payload === 'undefined' ? null : payload,
      options
    );
    try {
      this.port.postMessage(reqParams);
    } catch (e) {
      if (e instanceof Error && e.message.includes('disconnected')) {
        this.connect();
        this.port.postMessage(reqParams);
        log(
          'port is disconnected while sending messages, trigger reconnection and retry sending message'
        );
      } else {
        throw e;
      }
    }
    const result = await lastValueFrom(
      this.portObservable.pipe(
        filter((data) => data.id === reqParams.id),
        take(1)
      )
    );
    if (result.error) {
      if (result.error.code === ErrorCode.NO_AUTH) {
        this.events.emit('authExpired');
      }
      throw new Error(errorToString(result.error));
    }
    return result.data;
  }

  on<E extends ApiClientEvent>(event: E, listener: ApiClientEventListeners[E]) {
    this.events.on(event, listener);
    return () => this.events.off(event, listener);
  }
}
