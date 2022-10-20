import { filter, firstValueFrom, map, race, Subject, take, tap } from 'rxjs';
import { ChromeStorage } from '../../../store/storage';
import { AppContextState } from '../../../store/app-context';
import { PopupWindow } from '../popup-window';
import {
  Account,
  AccountApi,
  AuthApi,
  Network,
  NetworkApi,
  Storage,
  TransactionApi,
} from '@suiet/core';
import { isNonEmptyArray } from '../../../utils/check';
import { Permission, PermissionManager } from '../permission';
import {
  MoveCallTransaction,
  SignableTransaction,
  SuiTransactionResponse,
} from '@mysten/sui.js';
import { TxRequestManager, TxRequestType } from '../transaction';
import {
  InvalidParamError,
  NoPermissionError,
  NotFoundError,
  UserRejectionError,
} from '../errors';
import { baseDecode, baseEncode } from 'borsh';
import { SignRequestManager } from '../sign-msg';
import { FeatureFlagRes } from '../../../api';
import { fetchFeatureFlags } from '../utils/api';

interface DappMessage<T> {
  params: T;
  context: {
    origin: string;
    name: string;
    favicon: string;
  };
}

export enum ApprovalType {
  PERMISSION = 'PERMISSION',
  TRANSACTION = 'TRANSACTION',
  SIGN_MSG = 'SIGN_MSG',
}

export interface Approval {
  id: string;
  type: ApprovalType;
  approved: boolean;
  updatedAt: string;
}

const approvalSubject: Subject<Approval> = new Subject<Approval>();

export interface AccountInfo {
  address: string;
  publicKey: string;
}

export class DappBgApi {
  storage: Storage;
  chromeStorage: ChromeStorage;
  permManager: PermissionManager;
  txManager: TxRequestManager;
  signManager: SignRequestManager;
  txApi: TransactionApi;
  accountApi: AccountApi;
  networkApi: NetworkApi;
  authApi: AuthApi;
  featureFlags: FeatureFlagRes | undefined;

  constructor(
    storage: Storage,
    txApi: TransactionApi,
    networkApi: NetworkApi,
    authApi: AuthApi,
    accountApi: AccountApi
  ) {
    this.storage = storage;
    this.txApi = txApi;
    this.networkApi = networkApi;
    this.authApi = authApi;
    this.accountApi = accountApi;
    this.chromeStorage = new ChromeStorage();
    this.permManager = new PermissionManager();
    this.txManager = new TxRequestManager();
    this.signManager = new SignRequestManager();
    fetchFeatureFlags().then((data) => {
      this.featureFlags = data;
    });
  }

  public async connect(
    payload: DappMessage<{
      permissions: string[];
    }>
  ): Promise<boolean> {
    const { params, context } = payload;
    if (!isNonEmptyArray(params?.permissions)) {
      throw new InvalidParamError(
        'permissions are required for params when connecting'
      );
    }
    const globalMeta = await this.storage.loadMeta();
    if (!globalMeta) {
      throw new Error('Wallet not initialized');
    }
    const appContext = await this.getAppContext();
    const account = await this.getActiveAccount(appContext.accountId);

    const checkRes = await this.checkPermissions(
      payload.context.origin,
      payload.params.permissions
    );
    if (checkRes.result) return true;

    const permRequest = await this.permManager.createPermRequest({
      permissions: params.permissions,
      name: context.name,
      origin: context.origin,
      favicon: context.favicon,
      address: account.address,
      networkId: appContext.networkId,
      walletId: appContext.walletId,
      accountId: appContext.accountId,
    });
    const reqPermWindow = this.createPopupWindow('/dapp/connect', {
      permReqId: permRequest.id,
    });
    const onWindowCloseObservable = await reqPermWindow.show();
    const onFallbackDenyObservable = onWindowCloseObservable.pipe(
      map(async () => {
        return {
          ...permRequest,
          approved: false,
          updatedAt: new Date().toISOString(),
        };
      })
    );
    const onApprovalObservable = approvalSubject.asObservable().pipe(
      filter((result) => {
        return (
          result.type === ApprovalType.PERMISSION &&
          result.id === permRequest.id
        );
      }),
      map((result) => {
        return {
          ...permRequest,
          approved: result.approved,
          updatedAt: result.updatedAt,
        };
      })
    );

    // monitor the window close event & user action
    const finalResult = await firstValueFrom(
      race(onFallbackDenyObservable, onApprovalObservable).pipe(
        take(1),
        tap(async () => {
          await reqPermWindow.close();
        })
      )
    );
    await this.permManager.setPermission(finalResult);
    return finalResult.approved;
  }

  // get callback from ui extension
  public async callbackApproval(payload: Approval) {
    if (!payload) {
      throw new Error('params result should not be empty');
    }
    approvalSubject.next(payload); // send data to event listener so that the connect function can go on
  }

  public async getAccountsInfo(
    payload: DappMessage<{}>
  ): Promise<AccountInfo[]> {
    const result = await this._getAccounts(payload);
    return result.map((ac: Account) => ({
      address: ac.address,
      publicKey: ac.pubkey,
    }));
  }

  public async signMessage(payload: DappMessage<{ message: string }>): Promise<{
    signature: string;
    signedMessage: string;
  }> {
    const { params, context } = payload;
    if (!params?.message) {
      throw new InvalidParamError(`params 'message' required`);
    }
    const decodeMsg = baseDecode(params.message);
    const checkRes = await this.checkPermissions(context.origin, [
      Permission.VIEW_ACCOUNT,
      Permission.SUGGEST_TX,
    ]);
    if (!checkRes.result) {
      // TODO: launch request permission window
      throw new NoPermissionError('No permissions to signMessage', {
        missingPerms: checkRes.missingPerms,
      });
    }

    const appContext = await this.getAppContext();
    const account = await this.getActiveAccount(appContext.accountId);
    const signReq = await this.signManager.createSignRequest({
      walletId: appContext.walletId,
      address: account.address,
      origin: context.origin,
      name: context.name,
      favicon: context.favicon,
      data: params.message,
    });
    const signReqWindow = this.createPopupWindow('/dapp/sign-msg', {
      reqId: signReq.id,
    });
    const onWindowCloseObservable = await signReqWindow.show();
    const onFallbackDenyObservable = onWindowCloseObservable.pipe(
      map(async () => {
        return {
          ...signReq,
          approved: false,
          updatedAt: new Date().toISOString(),
        };
      })
    );
    const onApprovalObservable = approvalSubject.asObservable().pipe(
      filter((result) => {
        return (
          result.type === ApprovalType.SIGN_MSG && result.id === signReq.id
        );
      }),
      map((result) => {
        return {
          ...signReq,
          approved: result.approved,
          updatedAt: result.updatedAt,
        };
      })
    );
    const finalResult = await firstValueFrom(
      race(onFallbackDenyObservable, onApprovalObservable).pipe(
        take(1),
        tap(async () => {
          await signReqWindow.close();
          // remove localstorage record after signed for safety purpose
          await this.signManager.removeSignRequest(signReq.id);
        })
      )
    );
    if (!finalResult.approved) {
      throw new UserRejectionError();
    }

    const token = this.authApi.getToken();
    const result = await this.txApi.signMessage({
      token,
      message: decodeMsg,
      walletId: appContext.walletId,
      accountId: appContext.accountId,
    });
    return {
      signature: baseEncode(result.signature),
      signedMessage: params.message,
    };
  }

  public async signAndExecuteTransaction(
    payload: DappMessage<{ transaction: SignableTransaction }>
  ) {
    const { params, context } = payload;
    if (!params?.transaction) {
      throw new InvalidParamError('params transaction is required');
    }
    const checkRes = await this.checkPermissions(context.origin, [
      Permission.VIEW_ACCOUNT,
      Permission.SUGGEST_TX,
    ]);
    if (!checkRes.result) {
      throw new NoPermissionError(
        'No permission to signAndExecuteTransaction',
        {
          missingPerms: checkRes.missingPerms,
        }
      );
    }

    const { transaction } = params;
    const appContext = await this.getAppContext();
    const account = await this.getActiveAccount(appContext.accountId);
    const network = await this.getNetwork(appContext.networkId);

    const { finalResult } = await this.promptForTxApproval({
      network,
      walletId: appContext.walletId,
      address: account.address,
      txType: transaction.kind,
      txData: transaction.data,
      favicon: context.favicon,
      name: context.name,
      origin: context.origin,
    });
    if (!finalResult.approved) {
      throw new UserRejectionError();
    }

    const token = this.authApi.getToken();
    // TODO: support other transaction type
    switch (transaction.kind) {
      case 'moveCall':
        return await this.txApi.executeMoveCall({
          token,
          network,
          walletId: appContext.walletId,
          accountId: appContext.accountId,
          tx: transaction.data,
        });
      default:
        throw new Error(
          `transaction type is not supported, kind=${transaction.kind}`
        );
    }
  }

  /**
   * @deprecated use getAccountsInfo instead
   * @param payload
   */
  public async getAccounts(payload: DappMessage<{}>) {
    const result = await this._getAccounts(payload);
    return result.map((ac: Account) => ac.address);
  }

  /**
   * @deprecated use signAndExecuteTransaction instead
   * @param payload
   */
  public async requestTransaction(
    payload: DappMessage<{
      type: TxRequestType;
      data: MoveCallTransaction;
    }>
  ): Promise<SuiTransactionResponse | null> {
    const { params, context } = payload;
    if (!params?.data) {
      throw new InvalidParamError('Transaction params required');
    }
    const checkRes = await this.checkPermissions(context.origin, [
      Permission.VIEW_ACCOUNT,
      Permission.SUGGEST_TX,
    ]);
    if (!checkRes.result) {
      // TODO: launch request permission window
      throw new NoPermissionError('No permissions to requestTransaction', {
        missingPerms: checkRes.missingPerms,
      });
    }

    const appContext = await this.getAppContext();
    const account = await this.getActiveAccount(appContext.accountId);
    const network = await this.getNetwork(appContext.networkId);
    const { txReq, finalResult } = await this.promptForTxApproval({
      network,
      walletId: appContext.walletId,
      address: account.address,
      txType: params.type,
      txData: params.data,
      favicon: context.favicon,
      name: context.name,
      origin: context.origin,
    });
    if (!finalResult.approved) {
      throw new UserRejectionError();
    }
    const token = this.authApi.getToken();
    try {
      const response = await this.txApi.executeMoveCall({
        network,
        token,
        walletId: appContext.walletId,
        accountId: appContext.accountId,
        tx: params.data,
      });
      await this.txManager.storeTxRequest({
        ...txReq,
        response,
      });
      return response;
    } catch (e: any) {
      await this.txManager.storeTxRequest({
        ...txReq,
        responseError: e.message,
      });
      throw e;
    }
  }

  private async promptForTxApproval(params: {
    network: Network;
    walletId: string;
    address: string;
    txType: string;
    txData: any;
    origin: string;
    name: string;
    favicon: string;
  }) {
    // load moveCall metadata
    const metadata = await this.txApi.getNormalizedMoveFunction({
      network: params.network,
      functionName: params.txData.function,
      moduleName: params.txData.module,
      objectId: params.txData.packageObjectId,
    });
    console.log('metadata', metadata);

    const txReq = await this.txManager.createTxRequest({
      walletId: params.walletId,
      address: params.address,
      origin: params.origin,
      name: params.name,
      favicon: params.favicon,
      type: params.txType,
      data: params.txData,
      metadata,
    });
    const txReqWindow = this.createPopupWindow('/dapp/tx-approval', {
      txReqId: txReq.id,
    });
    const onWindowCloseObservable = await txReqWindow.show();
    const onFallbackDenyObservable = onWindowCloseObservable.pipe(
      map(async () => {
        return {
          ...txReq,
          approved: false,
          updatedAt: new Date().toISOString(),
        };
      })
    );
    const onApprovalObservable = approvalSubject.asObservable().pipe(
      filter((result) => {
        return (
          result.type === ApprovalType.TRANSACTION && result.id === txReq.id
        );
      }),
      map((result) => {
        return {
          ...txReq,
          approved: result.approved,
          updatedAt: result.updatedAt,
        };
      })
    );
    const finalResult = await firstValueFrom(
      race(onFallbackDenyObservable, onApprovalObservable).pipe(
        take(1),
        tap(async () => {
          await txReqWindow.close();
        })
      )
    );
    return { txReq, finalResult };
  }

  public async hasPermissions(payload: DappMessage<{}>) {
    const { context } = payload;
    const appContext = await this.getAppContext();
    const account = await this.getActiveAccount(appContext.accountId);
    return await this.permManager.getAllPermissions({
      address: account.address,
      networkId: appContext.networkId,
      origin: context.origin,
    });
  }

  public async getPublicKey(payload: DappMessage<{}>): Promise<string> {
    const { context } = payload;
    const checkRes = await this.checkPermissions(context.origin, [
      Permission.VIEW_ACCOUNT,
    ]);
    if (!checkRes.result) {
      throw new NoPermissionError('No permission to getAccounts info', {
        missingPerms: checkRes.missingPerms,
      });
    }

    const appContext = await this.getAppContext();
    const publicKey = await this.accountApi.getPublicKey(appContext.accountId);
    return publicKey;
  }

  private async _getAccounts(payload: DappMessage<{}>) {
    const { context } = payload;
    const checkRes = await this.checkPermissions(context.origin, [
      Permission.VIEW_ACCOUNT,
    ]);
    if (!checkRes.result) {
      throw new NoPermissionError('No permission to getAccounts info', {
        missingPerms: checkRes.missingPerms,
      });
    }
    const appContext = await this.getAppContext();
    // get accounts under the active wallet
    const result = await this.storage.getAccounts(appContext.walletId);
    if (!result) {
      throw new NotFoundError(
        `Accounts not found in wallet (${appContext.walletId})`,
        {
          walletId: appContext.walletId,
        }
      );
    }
    return result;
  }

  private createPopupWindow(url: string, params: Record<string, any>) {
    const queryStr = new URLSearchParams(params).toString();
    return new PopupWindow(
      chrome.runtime.getURL('index.html#' + url) +
        (queryStr ? '?' + queryStr : '')
    );
  }

  private async checkPermissions(origin: string, perms: string[]) {
    const appContext = await this.getAppContext();
    const account = await this.getActiveAccount(appContext.accountId);
    return await this.permManager.checkPermissions(perms, {
      address: account.address,
      networkId: appContext.networkId,
      origin: origin,
    });
  }

  private async getActiveAccount(accountId: string): Promise<Account> {
    const account = await this.storage.getAccount(accountId);
    if (!account) {
      throw new Error(`cannot find account, id=${accountId}`);
    }
    return account;
  }

  private async getAppContext() {
    const storageKey = 'persist:root';
    const result = await this.chromeStorage.getItem(storageKey);
    if (!result) {
      throw new Error('failed to load appContext from local storage');
    }
    let appContext: AppContextState;
    try {
      const root = JSON.parse(result);
      appContext = JSON.parse(root.appContext);
    } catch (e) {
      console.error(e);
      throw new Error('failed to parse appContext data from local storage');
    }
    return appContext;
  }

  private async getNetwork(networkId: string) {
    const defaultData = await this.networkApi.getNetwork(networkId);
    if (!defaultData) {
      throw new NotFoundError(`network metadata is not found, id=${networkId}`);
    }
    if (
      !this.featureFlags ||
      typeof this.featureFlags.networks !== 'object' ||
      !isNonEmptyArray(Object.keys(this.featureFlags.networks))
    )
      return defaultData;
    const currentNetworkConfig = this.featureFlags.networks[networkId];
    if (!currentNetworkConfig?.full_node_url) return defaultData;

    const overrideData: Network = {
      ...defaultData,
      queryRpcUrl: currentNetworkConfig.full_node_url,
      txRpcUrl: `${currentNetworkConfig.full_node_url}:443`,
    };
    return overrideData;
  }
}
