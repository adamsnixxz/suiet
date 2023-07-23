import { ChromeStorage } from '../../store/storage';
import { StorageKeys } from '../../store/enum';
import { v4 as uuidv4 } from 'uuid';
import { DappBaseRequest, DappConnectionContext } from './types';

export enum Permission {
  VIEW_ACCOUNT = 'viewAccount',
  SUGGEST_TX = 'suggestTransactions',
}

export const ALL_PERMISSIONS = Object.values(Permission);

export const tips: Record<string, any> = {
  [Permission.SUGGEST_TX]: 'Share wallet address',
  [Permission.VIEW_ACCOUNT]: 'Suggest transactions to approve',
};

export interface PermRequest extends DappBaseRequest {
  permissions: string[];
  approved: boolean | null;
  createdAt: string;
  updatedAt: string | null;
}

export class PermReqStorage {
  storage: ChromeStorage;

  constructor() {
    this.storage = new ChromeStorage();
  }

  async getPermRequestStoreMap(): Promise<Record<string, PermRequest>> {
    const result = await this.storage.getItem(StorageKeys.PERM_REQUESTS);
    if (!result) {
      await this.reset();
      return {};
    }
    return JSON.parse(result);
  }

  async getItem(permId: string): Promise<PermRequest | undefined> {
    const permRequests = await this.getPermRequestStoreMap();
    return permRequests[permId];
  }

  async setItem(data: PermRequest) {
    const permRequests = await this.getPermRequestStoreMap();
    permRequests[data.id] = data;
    return await this.storage.setItem(
      StorageKeys.PERM_REQUESTS,
      JSON.stringify(permRequests)
    );
  }

  async reset() {
    return await this.storage.setItem(
      StorageKeys.PERM_REQUESTS,
      JSON.stringify({})
    );
  }
}

export class PermissionManager {
  private readonly permReqStorage: PermReqStorage;

  constructor() {
    this.permReqStorage = new PermReqStorage();
  }

  async checkPermissions(
    perms: string[],
    authInfo: {
      origin: string;
      address: string;
      networkId: string;
    }
  ): Promise<{
    result: boolean;
    missingPerms: string[];
  }> {
    const allPermissions = new Set<string>();
    const result = await this.getAllPermissions(authInfo);
    result.forEach((data) => {
      data.permissions.forEach((perm) => {
        allPermissions.add(perm);
      });
    });
    const resData: {
      result: boolean;
      missingPerms: string[];
    } = {
      result: true,
      missingPerms: [],
    };
    perms.forEach((perm) => {
      if (!allPermissions.has(perm)) {
        resData.result = false;
        resData.missingPerms.push(perm);
      }
    });
    return resData;
  }

  async createPermRequest(
    params: {
      permissions: string[];
    },
    context: DappConnectionContext
  ): Promise<PermRequest> {
    const permRequest = {
      ...context,
      ...params,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      approved: null,
      updatedAt: null,
    };
    await this.permReqStorage.setItem(permRequest);
    return permRequest;
  }

  async getPermission(permId: string) {
    return await this.permReqStorage.getItem(permId);
  }

  async getAllPermissions(authInfo: {
    origin?: string;
    address: string;
    networkId: string;
  }) {
    const storeMap = await this.permReqStorage.getPermRequestStoreMap();
    if (Object.keys(storeMap).length === 0) return [];

    return Object.values(storeMap).filter((permData) => {
      let originMatched = true;
      if (authInfo.origin) {
        // contain legacy compatible logics
        originMatched =
          (permData.source?.origin || (permData as any).origin) ===
          authInfo.origin;
      }
      return (
        permData.approved === true &&
        originMatched &&
        (permData.target?.address || (permData as any).address) ===
          authInfo.address &&
        permData.networkId === authInfo.networkId
      );
    });
  }

  async setPermission(permReq: PermRequest) {
    return await this.permReqStorage.setItem(permReq);
  }
}
